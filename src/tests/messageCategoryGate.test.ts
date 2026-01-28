/**
 * Tests for Message Category Gate
 * 
 * Test cases:
 * 1. When suppressionReason=SHIPPING_CONFIRMED, only ORDER_STATUS category is allowed
 * 2. PERSUASION and FOLLOWUP categories are blocked when SHIPPING_CONFIRMED
 * 3. ORDER_STATUS category is always allowed regardless of suppression reason
 * 4. Users without suppression can receive all categories
 * 5. ORDER_COMPLETED and STAGE_DONE suppression reasons block PERSUASION and FOLLOWUP
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

jest.mock('../services/flowGuard', () => ({
    flowGuard: {
        hasConfirmedOrActiveOrder: jest.fn().mockResolvedValue(false),
        isInCooldown: jest.fn().mockResolvedValue({ inCooldown: false })
    }
}));

import type { UserSession } from '../../types/global';
import { 
    evaluateOutboundGates,
    GateReasonCode,
    MessageCategory
} from '../services/gating';
import { orderRepository } from '../repositories/OrderRepository';
import { customerRepository } from '../repositories/CustomerRepository';
import { getUserSession } from '../flows/userTrackingSystem';

describe('Message Category Gate', () => {
    const testPhone = '573001234567';
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Default: no orders, no customer data
        (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
        (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
        (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
    });

    /**
     * Create mock session for testing
     */
    function createMockSession(overrides: Partial<UserSession> = {}): UserSession {
        return {
            phone: testPhone,
            stage: 'awareness',
            interactions: [],
            tags: [],
            conversationData: {},
            lastInteraction: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            contactStatus: 'ACTIVE',
            followUpAttempts: 0,
            followUpCount24h: 0,
            ...overrides
        } as UserSession;
    }

    describe('When suppressionReason=SHIPPING_CONFIRMED', () => {
        
        beforeEach(() => {
            // Setup: Order with shipping data confirmed
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-123',
                    order_number: 'ORD-123',
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
        });

        test('should ALLOW ORDER_STATUS category messages', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'order',
                    messageCategory: MessageCategory.ORDER_STATUS,
                    bypassTimeWindow: true 
                },
                session
            );

            // ORDER_STATUS should NOT be blocked by category gate
            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });

        test('should BLOCK FOLLOWUP category messages', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'followup',
                    messageCategory: MessageCategory.FOLLOWUP,
                    bypassTimeWindow: true 
                },
                session
            );

            // FOLLOWUP should be blocked by category gate
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
            expect(result.reason).toContain('FOLLOWUP');
            expect(result.reason).toContain('shipping confirmed');
        });

        test('should BLOCK PERSUASION category messages', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'persuasive',
                    messageCategory: MessageCategory.PERSUASION,
                    bypassTimeWindow: true 
                },
                session
            );

            // PERSUASION should be blocked by category gate
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
            expect(result.reason).toContain('PERSUASION');
            expect(result.reason).toContain('shipping confirmed');
        });

        test('should BLOCK GENERAL category messages', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'general',
                    messageCategory: MessageCategory.GENERAL,
                    bypassTimeWindow: true 
                },
                session
            );

            // GENERAL should be blocked by category gate when shipping confirmed
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });
    });

    describe('Inferred category from messageType', () => {
        
        beforeEach(() => {
            // Setup: Order with shipping data confirmed
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-456',
                    order_number: 'ORD-456',
                    customer_id: 'cust-1',
                    content_type: 'music',
                    capacity: '64GB',
                    price: 100000,
                    processing_status: 'pending',
                    shipping_json: JSON.stringify({
                        name: 'María García',
                        address: 'Carrera 45 #12-34'
                    })
                }
            ]);
        });

        test('should infer ORDER_STATUS from messageType=order', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            // Don't provide messageCategory - let it infer from messageType
            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'order',
                    bypassTimeWindow: true 
                },
                session
            );

            // Should NOT be blocked by category gate (order → ORDER_STATUS)
            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });

        test('should infer ORDER_STATUS from messageType=notification', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'notification',
                    bypassTimeWindow: true 
                },
                session
            );

            // Should NOT be blocked by category gate (notification → ORDER_STATUS)
            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });

        test('should infer FOLLOWUP from messageType=followup', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'followup',
                    bypassTimeWindow: true 
                },
                session
            );

            // Should be blocked by category gate (followup → FOLLOWUP, blocked when shipping confirmed)
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });

        test('should infer PERSUASION from messageType=persuasive', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'persuasive',
                    bypassTimeWindow: true 
                },
                session
            );

            // Should be blocked by category gate (persuasive → PERSUASION, blocked when shipping confirmed)
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });
    });

    describe('When user is NOT suppressed', () => {
        
        beforeEach(() => {
            // Setup: No orders, no suppression
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);
            (orderRepository.getCustomerOrderConfirmations as jest.Mock).mockResolvedValue([]);
            (customerRepository.findByPhone as jest.Mock).mockResolvedValue(null);
        });

        test('should ALLOW all categories when not suppressed', async () => {
            const session = createMockSession({ stage: 'exploring' });
            (getUserSession as jest.Mock).mockResolvedValue(session);

            // Test FOLLOWUP
            const followupResult = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'followup',
                    messageCategory: MessageCategory.FOLLOWUP,
                    bypassTimeWindow: true 
                },
                session
            );
            expect(followupResult.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);

            // Test PERSUASION
            const persuasionResult = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'persuasive',
                    messageCategory: MessageCategory.PERSUASION,
                    bypassTimeWindow: true 
                },
                session
            );
            expect(persuasionResult.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);

            // Test GENERAL
            const generalResult = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'general',
                    messageCategory: MessageCategory.GENERAL,
                    bypassTimeWindow: true 
                },
                session
            );
            expect(generalResult.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });
    });

    describe('When suppressionReason=ORDER_COMPLETED', () => {
        
        beforeEach(() => {
            // Setup: Order with confirmed status
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([
                {
                    id: 'order-789',
                    order_number: 'ORD-789',
                    customer_id: 'cust-1',
                    content_type: 'music',
                    capacity: '64GB',
                    price: 100000,
                    processing_status: 'confirmed',
                    status: 'confirmed'
                }
            ]);
        });

        test('should ALLOW ORDER_STATUS category', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'order',
                    messageCategory: MessageCategory.ORDER_STATUS,
                    bypassTimeWindow: true 
                },
                session
            );

            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });

        test('should BLOCK PERSUASION and FOLLOWUP categories', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const followupResult = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'followup',
                    messageCategory: MessageCategory.FOLLOWUP,
                    bypassTimeWindow: true 
                },
                session
            );
            expect(followupResult.blockedBy).toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);

            const persuasionResult = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'persuasive',
                    messageCategory: MessageCategory.PERSUASION,
                    bypassTimeWindow: true 
                },
                session
            );
            expect(persuasionResult.blockedBy).toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });
    });

    describe('When user has OPT_OUT status', () => {
        
        test('should ALLOW ORDER_STATUS category (category gate passes, but Gate 1 may block)', async () => {
            const session = createMockSession({ 
                contactStatus: 'OPT_OUT',
                tags: ['blacklist']
            });
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'order',
                    messageCategory: MessageCategory.ORDER_STATUS,
                    bypassTimeWindow: true 
                },
                session
            );

            // ORDER_STATUS should NOT be blocked by category gate
            // (but will be blocked by Gate 1 - OUTBOUND_OPT_OUT)
            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_OPT_OUT);
        });

        test('should be blocked by OPT_OUT gate (Gate 1), not by category gate', async () => {
            const session = createMockSession({ 
                contactStatus: 'OPT_OUT'
            });
            (getUserSession as jest.Mock).mockResolvedValue(session);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'followup',
                    messageCategory: MessageCategory.FOLLOWUP,
                    bypassTimeWindow: true 
                },
                session
            );

            // Should be blocked by Gate 1 (OPT_OUT), not by category gate
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_OPT_OUT);
        });
    });

    describe('Edge cases', () => {
        
        test('should handle missing messageCategory by inferring from messageType', async () => {
            const session = createMockSession({ stage: 'exploring' });
            (getUserSession as jest.Mock).mockResolvedValue(session);

            // No shipping data, no suppression
            (orderRepository.findByPhoneNumber as jest.Mock).mockResolvedValue([]);

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'catalog', // Should infer GENERAL
                    bypassTimeWindow: true 
                },
                session
            );

            // Should not be blocked by category gate
            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });

        test('should fail-open on suppression check errors', async () => {
            const session = createMockSession();
            (getUserSession as jest.Mock).mockResolvedValue(session);

            // Simulate database error
            (orderRepository.findByPhoneNumber as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

            const result = await evaluateOutboundGates(
                { 
                    phone: testPhone, 
                    messageType: 'followup',
                    messageCategory: MessageCategory.FOLLOWUP,
                    bypassTimeWindow: true 
                },
                session
            );

            // Should not be blocked by category gate (fail-open)
            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_CATEGORY_BLOCKED);
        });
    });
});

console.log('✅ Message Category Gate tests loaded');
