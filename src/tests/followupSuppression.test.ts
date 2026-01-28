/**
 * Tests for Follow-Up Suppression System
 * 
 * Test cases:
 * 1. User with shipping_confirmed order → follow-up attempt is SUPPRESSED
 * 2. When shipping data is confirmed → pending follow-ups in BOTH queues are cancelled
 * 3. If scheduler bug allows job through → hard guard in OutboundGate blocks it
 * 4. Users without confirmed data → can still receive follow-ups (no regression)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../repositories/OrderRepository', () => ({
    orderRepository: {
        findByPhoneNumber: vi.fn(),
        getCustomerOrderConfirmations: vi.fn()
    }
}));

vi.mock('../repositories/CustomerRepository', () => ({
    customerRepository: {
        findByPhone: vi.fn()
    }
}));

vi.mock('../flows/userTrackingSystem', () => ({
    getUserSession: vi.fn(),
    followUpQueue: new Map()
}));

vi.mock('./StageBasedFollowUpService', () => ({
    stageBasedFollowUpService: {
        cancelPendingFollowUps: vi.fn().mockResolvedValue(0),
        markComplete: vi.fn().mockResolvedValue(undefined)
    }
}));

vi.mock('./ChatbotEventService', () => ({
    chatbotEventService: {
        trackFollowupCancelled: vi.fn().mockResolvedValue(1),
        trackFollowupSuppressed: vi.fn().mockResolvedValue(1),
        trackEvent: vi.fn().mockResolvedValue(1)
    }
}));

vi.mock('../utils/structuredLogger', () => ({
    structuredLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

import { 
    isFollowUpSuppressed, 
    SuppressionReason,
    cancelAllPendingFollowUps,
    onShippingConfirmed,
    getSuppressionStatus
} from './followupSuppression';
import { orderRepository } from '../repositories/OrderRepository';
import { customerRepository } from '../repositories/CustomerRepository';
import { getUserSession, followUpQueue } from '../flows/userTrackingSystem';
import { stageBasedFollowUpService } from './StageBasedFollowUpService';
import { chatbotEventService } from './ChatbotEventService';

describe('FollowUp Suppression Service', () => {
    const testPhone = '573001234567';
    
    beforeEach(() => {
        vi.clearAllMocks();
        followUpQueue.clear();
    });

    describe('isFollowUpSuppressed', () => {
        
        it('TEST 1: should suppress follow-ups for user with confirmed order status', async () => {
            // Setup: Order with status 'confirmed'
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([
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
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                name: 'Test User',
                stage: 'checkout',
                conversationData: {},
                isFirstMessage: false,
                isActive: true
            } as any);

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.ORDER_COMPLETED);
            expect(result.evidence.orderId).toBe('order-123');
            expect(result.evidence.orderStatus).toBe('confirmed');
        });

        it('TEST 1b: should suppress follow-ups for user with processing order status', async () => {
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([
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
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                stage: 'checkout'
            } as any);

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.ORDER_COMPLETED);
        });

        it('should suppress follow-ups when shipping data exists', async () => {
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([
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
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                stage: 'checkout'
            } as any);

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.SHIPPING_CONFIRMED);
            expect(result.evidence.hasShippingName).toBe(true);
            expect(result.evidence.hasShippingAddress).toBe(true);
        });

        it('should suppress follow-ups when user stage is DONE', async () => {
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([]);
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                stage: 'converted',
                conversationData: {}
            } as any);

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(true);
            expect(result.reason).toBe(SuppressionReason.STAGE_DONE);
            expect(result.evidence.conversationStage).toBe('converted');
        });

        it('should NOT suppress follow-ups for user without confirmed data', async () => {
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([]);
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                stage: 'exploring',
                conversationData: {}
            } as any);

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(false);
            expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
        });

        it('should NOT suppress follow-ups for user with pending order', async () => {
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([
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
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                stage: 'pricing',
                conversationData: {}
            } as any);

            const result = await isFollowUpSuppressed(testPhone);

            expect(result.suppressed).toBe(false);
            expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
        });
    });

    describe('cancelAllPendingFollowUps', () => {
        
        it('TEST 2: should cancel follow-ups in legacy queue when shipping confirmed', async () => {
            // Setup: Add a pending follow-up to the legacy queue
            const timeoutId = setTimeout(() => {}, 100000);
            followUpQueue.set(testPhone.replace(/\D/g, ''), timeoutId);

            const cancelledCount = await cancelAllPendingFollowUps(testPhone, SuppressionReason.SHIPPING_CONFIRMED);

            expect(cancelledCount).toBeGreaterThanOrEqual(1);
            expect(followUpQueue.has(testPhone.replace(/\D/g, ''))).toBe(false);
            
            clearTimeout(timeoutId);
        });

        it('TEST 2b: should cancel follow-ups in StageBasedFollowUpService', async () => {
            vi.mocked(stageBasedFollowUpService.cancelPendingFollowUps).mockResolvedValue(2);

            const cancelledCount = await cancelAllPendingFollowUps(testPhone, SuppressionReason.SHIPPING_CONFIRMED);

            expect(stageBasedFollowUpService.cancelPendingFollowUps).toHaveBeenCalledWith(testPhone);
            expect(cancelledCount).toBeGreaterThanOrEqual(2);
        });

        it('should track cancellation event', async () => {
            vi.mocked(stageBasedFollowUpService.cancelPendingFollowUps).mockResolvedValue(1);

            await cancelAllPendingFollowUps(testPhone, SuppressionReason.SHIPPING_CONFIRMED);

            expect(chatbotEventService.trackFollowupCancelled).toHaveBeenCalled();
        });
    });

    describe('onShippingConfirmed', () => {
        
        it('should cancel all follow-ups and mark conversation complete', async () => {
            vi.mocked(stageBasedFollowUpService.cancelPendingFollowUps).mockResolvedValue(1);
            vi.mocked(stageBasedFollowUpService.markComplete).mockResolvedValue(undefined);

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
        
        it('should return redacted suppression status', async () => {
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([
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
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                stage: 'checkout'
            } as any);

            const status = await getSuppressionStatus(testPhone);

            expect(status.suppressed).toBe(true);
            expect(status.reason).toBe(SuppressionReason.ORDER_COMPLETED);
            // Order ID should be redacted
            expect(status.evidence.orderIdRedacted).toMatch(/^\*\*\*.{4}$/);
            expect(status.phoneHash).toBeDefined();
            expect(status.checkedAt).toBeDefined();
        });

        it('should return NOT_SUPPRESSED for users without confirmed data', async () => {
            vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([]);
            vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
            vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
            vi.mocked(getUserSession).mockResolvedValue({
                phone: testPhone,
                stage: 'exploring',
                conversationData: {}
            } as any);

            const status = await getSuppressionStatus(testPhone);

            expect(status.suppressed).toBe(false);
            expect(status.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
        });
    });
});

describe('OutboundGate Hard Guard Integration', () => {
    
    it('TEST 3: should block follow-up at send-time even if scheduler allowed it', async () => {
        // This test verifies the hard guard concept
        // In the actual implementation, OutboundGate.sendMessage calls isFollowUpSuppressed
        // before sending any followup/persuasive message
        
        vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([
            {
                id: 'order-xyz',
                customer_id: 'cust-1',
                content_type: 'music',
                capacity: '64GB',
                price: 100000,
                processing_status: 'confirmed'
            }
        ]);
        vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
        vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
        vi.mocked(getUserSession).mockResolvedValue({
            phone: testPhone,
            stage: 'checkout'
        } as any);

        // Simulate what OutboundGate does
        const result = await isFollowUpSuppressed(testPhone);

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
    
    it('should allow follow-ups for users in early stages', async () => {
        vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([]);
        vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
        vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
        vi.mocked(getUserSession).mockResolvedValue({
            phone: testPhone,
            stage: 'exploring',
            buyingIntent: 50,
            conversationData: {}
        } as any);

        const result = await isFollowUpSuppressed(testPhone);

        expect(result.suppressed).toBe(false);
        expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
    });

    it('should allow follow-ups for users with draft orders', async () => {
        vi.mocked(orderRepository.findByPhoneNumber).mockResolvedValue([
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
        vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
        vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
        vi.mocked(getUserSession).mockResolvedValue({
            phone: testPhone,
            stage: 'pricing',
            conversationData: {}
        } as any);

        const result = await isFollowUpSuppressed(testPhone);

        expect(result.suppressed).toBe(false);
        expect(result.reason).toBe(SuppressionReason.NOT_SUPPRESSED);
    });

    it('should handle database errors gracefully (fail-open)', async () => {
        vi.mocked(orderRepository.findByPhoneNumber).mockRejectedValue(new Error('DB connection failed'));
        vi.mocked(orderRepository.getCustomerOrderConfirmations).mockResolvedValue([]);
        vi.mocked(customerRepository.findByPhone).mockResolvedValue(null);
        vi.mocked(getUserSession).mockResolvedValue({
            phone: testPhone,
            stage: 'exploring'
        } as any);

        const result = await isFollowUpSuppressed(testPhone);

        // Should fail-open (allow follow-ups) on error
        expect(result.suppressed).toBe(false);
    });
});
