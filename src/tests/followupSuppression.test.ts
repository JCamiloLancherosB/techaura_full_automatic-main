/**
 * Tests for Follow-Up Suppression System
 * 
 * Test cases:
 * 1. User with shipping_confirmed order → follow-up attempt is SUPPRESSED
 * 2. When shipping data is confirmed → pending follow-ups in BOTH queues are cancelled
 * 3. If scheduler bug allows job through → hard guard in OutboundGate blocks it
 * 4. Users without confirmed data → can still receive follow-ups (no regression)
 */

// Mock dependencies before imports
jest.mock('../repositories/OrderRepository', () => ({
    orderRepository: {
        findByPhoneNumber: jest.fn(),
        getCustomerOrderConfirmations: jest.fn()
    }
}));

jest.mock('../repositories/CustomerRepository', () => ({
    customerRepository: {
        findByPhone: jest.fn()
    }
}));

jest.mock('../flows/userTrackingSystem', () => {
    const actualFollowUpQueue = new Map<string, NodeJS.Timeout>();
    return {
        getUserSession: jest.fn(),
        followUpQueue: actualFollowUpQueue
    };
});

jest.mock('../services/StageBasedFollowUpService', () => ({
    stageBasedFollowUpService: {
        cancelPendingFollowUps: jest.fn().mockResolvedValue(0),
        markComplete: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('../services/ChatbotEventService', () => ({
    chatbotEventService: {
        trackFollowupCancelled: jest.fn().mockResolvedValue(1),
        trackFollowupSuppressed: jest.fn().mockResolvedValue(1),
        trackEvent: jest.fn().mockResolvedValue(1)
    }
}));

jest.mock('../utils/structuredLogger', () => ({
    structuredLogger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

jest.mock('../repositories/FollowupPausesRepository', () => ({
    followupPausesRepository: {
        isPaused: jest.fn().mockResolvedValue(false),
        getPauseDetails: jest.fn().mockResolvedValue(null),
        pause: jest.fn().mockResolvedValue({ success: true, phone: '573001234567', phoneHash: 'abc123', isPaused: true }),
        unpause: jest.fn().mockResolvedValue({ success: true, phone: '573001234567', phoneHash: 'abc123', isPaused: false }),
        getAllPaused: jest.fn().mockResolvedValue([]),
        countPaused: jest.fn().mockResolvedValue(0)
    }
}));

import { 
    isFollowUpSuppressed, 
    SuppressionReason,
    cancelAllPendingFollowUps,
    onShippingConfirmed,
    getSuppressionStatus
} from '../services/followupSuppression';
import { orderRepository } from '../repositories/OrderRepository';
import { customerRepository } from '../repositories/CustomerRepository';
import { getUserSession, followUpQueue } from '../flows/userTrackingSystem';
import { stageBasedFollowUpService } from '../services/StageBasedFollowUpService';
import { chatbotEventService } from '../services/ChatbotEventService';
import { followupPausesRepository } from '../repositories/FollowupPausesRepository';

describe('FollowUp Suppression Service', () => {
    const testPhone = '573001234567';
    
    beforeEach(() => {
        jest.clearAllMocks();
        followUpQueue.clear();
    });

    describe('isFollowUpSuppressed', () => {
        
        test('TEST 1: should suppress follow-ups for user with confirmed order status', async () => {
            // Setup: Order with status 'confirmed'
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-123',
                    order_number: 'ORD-123',
                    customer_id: 'cust-1',
                    content_type: 'music',
                    capacity: '64GB',
                    price: 100000,
                    processing_status: 'confirmed',
                    status: 'confirmed'
                }
            ]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                name: 'Test User',
                stage: 'checkout',
                conversationData: {},
                isFirstMessage: false,
                isActive: true
            });

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.ORDER_COMPLETED);
            expect(result.evidence.orderId).toBe('order-123');
            expect(result.evidence.orderStatus).toBe('confirmed');
        });

        test('TEST 1b: should suppress follow-ups for user with processing order status', async () => {
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-456',
                    order_number: 'ORD-456',
                    customer_id: 'cust-1',
                    content_type: 'music',
                    capacity: '64GB',
                    price: 100000,
                    processing_status: 'processing',
                    status: 'processing'
                }
            ]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                stage: 'checkout'
            });

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.ORDER_COMPLETED);
        });

        test('should suppress follow-ups when shipping data exists', async () => {
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-789',
                    customer_id: 'cust-1',
                    content_type: 'music',
                    capacity: '64GB',
                    price: 100000,
                    processing_status: 'pending',
                    shipping_json: JSON.stringify({
                        name: 'Juan Pérez',
                        address: 'Calle 123 #45-67'
                    })
                }
            ]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                stage: 'checkout'
            });

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.SHIPPING_CONFIRMED);
            expect(result.evidence.hasShippingName).toBe(true);
            expect(result.evidence.hasShippingAddress).toBe(true);
        });

        test('should suppress follow-ups when user stage is DONE/converted', async () => {
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                stage: 'converted',
                conversationData: {}
            });

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.STAGE_DONE);
            expect(result.evidence.conversationStage).toBe('converted');
        });

        test('should NOT suppress follow-ups for user without confirmed data', async () => {
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                stage: 'exploring',
                conversationData: {}
            });

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(false);
            expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
        });

        test('should NOT suppress follow-ups for user with pending order', async () => {
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-pending',
                    customer_id: 'cust-1',
                    content_type: 'music',
                    capacity: '64GB',
                    price: 100000,
                    processing_status: 'pending',
                    status: 'pending'
                }
            ]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                stage: 'pricing',
                conversationData: {}
            });

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(false);
            expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
        });
    });

    describe('cancelAllPendingFollowUps', () => {
        
        test('TEST 2: should cancel follow-ups in legacy queue when shipping confirmed', async () => {
            // Setup: Add a pending follow-up to the legacy queue
            const timeoutId = setTimeout(() => {}, 100000);
            followUpQueue.set(testPhone.replace(/\D/g, ''), timeoutId);

            const cancelledCount = await cancelAllPendingFollowUps(testPhone, SuppressionReason.SHIPPING_CONFIRMED);

            expect(cancelledCount).toBeGreaterThanOrEqual(1);
            expect(followUpQueue.has(testPhone.replace(/\D/g, ''))).toBe(false);
            
            clearTimeout(timeoutId);
        });

        test('TEST 2b: should cancel follow-ups in StageBasedFollowUpService', async () => {
            (stageBasedFollowUpService.cancelPendingFollowUps as jest.Mock).mockResolvedValue(2);

            const cancelledCount = await cancelAllPendingFollowUps(testPhone, SuppressionReason.SHIPPING_CONFIRMED);

            expect(stageBasedFollowUpService.cancelPendingFollowUps).toHaveBeenCalledWith(testPhone);
            expect(cancelledCount).toBeGreaterThanOrEqual(2);
        });

        test('should track cancellation event', async () => {
            (stageBasedFollowUpService.cancelPendingFollowUps as jest.Mock).mockResolvedValue(1);

            await cancelAllPendingFollowUps(testPhone, SuppressionReason.SHIPPING_CONFIRMED);

            expect(chatbotEventService.trackFollowupCancelled).toHaveBeenCalled();
        });
    });

    describe('onShippingConfirmed', () => {
        
        test('should cancel all follow-ups and mark conversation complete', async () => {
            (stageBasedFollowUpService.cancelPendingFollowUps as jest.Mock).mockResolvedValue(1);

            await onShippingConfirmed(testPhone, { orderId: 'ORD-123', source: 'test' });

            expect(stageBasedFollowUpService.cancelPendingFollowUps).toHaveBeenCalledWith(testPhone);
            expect(stageBasedFollowUpService.markComplete).toHaveBeenCalledWith(testPhone);
            expect(chatbotEventService.trackEvent).toHaveBeenCalledWith(
                expect.any(String),
                testPhone,
                'FOLLOWUP_SUPPRESSED',
                expect.objectContaining({
                    reason: SuppressionReason.SHIPPING_CONFIRMED,
                    orderId: 'ORD-123'
                }),
                'ORD-123'
            );
        });
    });

    describe('getSuppressionStatus (admin endpoint)', () => {
        
        test('should return redacted suppression status', async () => {
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-long-id-12345',
                    order_number: 'ORD-12345',
                    customer_id: 'cust-1',
                    content_type: 'music',
                    capacity: '64GB',
                    price: 100000,
                    processing_status: 'confirmed'
                }
            ]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                stage: 'checkout'
            });

            const status = await getSuppressionStatus(testPhone);

            expect(status.suppressed).toBe(true);
            expect(status.reason).toBe(SuppressionReason.ORDER_COMPLETED);
            // Order ID should be redacted
            expect(status.evidence.orderIdRedacted).toMatch(/^\*\*\*.{4}$/);
            expect(status.phoneHash).toBeDefined();
            expect(status.checkedAt).toBeDefined();
        });

        test('should return NOT_SUPPRESSED for users without confirmed data', async () => {
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
            (getUserSession as jest.Mock).mockResolvedValue({
                phone: testPhone,
                stage: 'exploring',
                conversationData: {}
            });

            const status = await getSuppressionStatus(testPhone);

            expect(status.suppressed).toBe(false);
            expect(status.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
        });
    });
});

describe('OutboundGate Hard Guard Integration', () => {
    
    test('TEST 3: should block follow-up at send-time even if scheduler allowed it', async () => {
        // This test verifies the hard guard concept
        // In the actual implementation, OutboundGate.sendMessage calls isFollowUpSuppressed
        // before sending any followup/persuasive message
        
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
            {
                id: 'order-xyz',
                customer_id: 'cust-1',
                content_type: 'music',
                capacity: '64GB',
                price: 100000,
                processing_status: 'confirmed'
            }
        ]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: '573001234567',
            stage: 'checkout'
        });

        // Simulate what OutboundGate does
        const result = await isFollowUpSuppressed('573001234567');

        // The hard guard should catch this
        expect(result.suppressed).toBe(true);
        expect(result.reason).toBe(SuppressionReason.ORDER_COMPLETED);
        
        // In OutboundGate, this would result in:
        // - NOT calling the WhatsApp provider
        // - Tracking FOLLOWUP_SUPPRESSED event
        // - Incrementing blockedBySuppression stat
    });
});

describe('Non-Regression Tests', () => {
    
    test('should allow follow-ups for users in early stages', async () => {
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: '573001234567',
            stage: 'exploring',
            buyingIntent: 50,
            conversationData: {}
        });

        const result = await isFollowUpSuppressed('573001234567');

        expect(result.suppressed).toBe(false);
        expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
    });

    test('should allow follow-ups for users with draft orders', async () => {
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
            {
                id: 'draft-order',
                customer_id: 'cust-1',
                content_type: 'music',
                capacity: '64GB',
                price: 100000,
                processing_status: 'draft',
                status: 'draft'
            }
        ]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: '573001234567',
            stage: 'pricing',
            conversationData: {}
        });

        const result = await isFollowUpSuppressed('573001234567');

        expect(result.suppressed).toBe(false);
        expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
    });

    test('should handle database errors gracefully (fail-open)', async () => {
        (orderRepository.findByPhoneNumber as jest.Mock).mockRejectedValue(new Error('DB connection failed'));
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: '573001234567',
            stage: 'exploring'
        });

        const result = await isFollowUpSuppressed('573001234567');

        // Should fail-open (allow follow-ups) on error
        expect(result.suppressed).toBe(false);
    });
});

describe('Manual Pause Suppression', () => {
    const testPhone = '573001234567';
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should suppress follow-ups when phone is manually paused', async () => {
        // Setup: Phone is paused
        (followupPausesRepository.isPaused as jest.Mock).mockResolvedValue(true);
        (followupPausesRepository.getPauseDetails as jest.Mock).mockResolvedValue({
            phone: testPhone,
            phone_hash: 'abc123',
            is_paused: true,
            paused_by: 'admin@test.com',
            pause_reason: 'Customer requested pause',
            paused_at: new Date()
        });
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: testPhone,
            stage: 'exploring'
        });

        const result = await isFollowUpSuppressed(testPhone);

        expect(result.suppressed).toBe(true);
        expect(result.reason).toBe(SuppressionReason.MANUAL_PAUSE);
        expect(result.evidence.source).toBe('manual_pause');
        expect(result.evidence.pausedBy).toBe('admin@test.com');
        expect(result.evidence.pauseReason).toBe('Customer requested pause');
    });

    test('should prioritize manual pause over order status', async () => {
        // Setup: Phone is paused AND has confirmed order
        (followupPausesRepository.isPaused as jest.Mock).mockResolvedValue(true);
        (followupPausesRepository.getPauseDetails as jest.Mock).mockResolvedValue({
            phone: testPhone,
            phone_hash: 'abc123',
            is_paused: true,
            paused_by: 'admin@test.com',
            pause_reason: 'VIP customer',
            paused_at: new Date()
        });
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
            {
                id: 'order-123',
                processing_status: 'confirmed'
            }
        ]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: testPhone,
            stage: 'checkout'
        });

        const result = await isFollowUpSuppressed(testPhone);

        // Manual pause should take precedence
        expect(result.suppressed).toBe(true);
        expect(result.reason).toBe(SuppressionReason.MANUAL_PAUSE);
    });

    test('should NOT suppress when phone is not paused', async () => {
        (followupPausesRepository.isPaused as jest.Mock).mockResolvedValue(false);
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: testPhone,
            stage: 'exploring'
        });

        const result = await isFollowUpSuppressed(testPhone);

        expect(result.suppressed).toBe(false);
        expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
    });

    test('should include pause info in getSuppressionStatus', async () => {
        (followupPausesRepository.isPaused as jest.Mock).mockResolvedValue(true);
        (followupPausesRepository.getPauseDetails as jest.Mock).mockResolvedValue({
            phone: testPhone,
            phone_hash: 'abc123',
            is_paused: true,
            paused_by: 'admin@test.com',
            pause_reason: 'Testing',
            paused_at: new Date()
        });
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        (getUserSession as jest.Mock).mockResolvedValue({
            phone: testPhone,
            stage: 'exploring'
        });

        const status = await getSuppressionStatus(testPhone);

        expect(status.suppressed).toBe(true);
        expect(status.reason).toBe(SuppressionReason.MANUAL_PAUSE);
        expect(status.evidence.pausedBy).toBe('admin@test.com');
        expect(status.evidence.pauseReason).toBe('Testing');
    });
});
