/**
 * OutboundGate Test Suite
 * Tests all gates and protections in the unified outbound message system
 */

import { OutboundGate, OutboundContext, SendResult } from '../services/OutboundGate';
import type { UserSession } from '../../types/global';

// Mock dependencies
const mockFlowGuard = {
  hasConfirmedOrActiveOrder: async (phone: string) => false,
  isInCooldown: async (phone: string) => ({ inCooldown: false })
};

const mockGetUserSession = async (phone: string): Promise<UserSession> => ({
  phone,
  stage: 'awareness',
  interactionCount: 1,
  tags: [],
  conversationData: {},
  lastInteraction: new Date(),
  contactStatus: 'ACTIVE'
});

const mockFlowDynamic = async (messages: any[]) => {
  console.log('Mock flowDynamic called with:', messages);
};

// Test helper to create test context
function createTestContext(overrides?: Partial<OutboundContext>): OutboundContext {
  return {
    phone: '573001234567',
    messageType: 'general',
    stage: 'awareness',
    status: 'initial',
    priority: 'normal',
    ...overrides
  };
}

describe('OutboundGate', () => {
  let gate: OutboundGate;

  beforeEach(() => {
    // Get fresh instance for each test
    gate = OutboundGate.getInstance();
    gate.resetStats();
    gate.clearRateLimits();
  });

  describe('Gate 1: No-Reach Gating', () => {
    test('should block messages to opted-out users', async () => {
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        contactStatus: 'OPT_OUT'
      };

      // Mock getUserSession to return opted-out user
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext();
      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('no-reach');
      expect(result.reason).toContain('opted out');
    });

    test('should block messages to blacklisted users', async () => {
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        tags: ['blacklist']
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext();
      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('no-reach');
      expect(result.reason).toContain('blacklisted');
    });

    test('should allow messages to active users', async () => {
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        contactStatus: 'ACTIVE'
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ bypassTimeWindow: true });
      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      // Should not be blocked by no-reach
      expect(result.blockedBy).not.toContain('no-reach');
    });
  });

  describe('Gate 2: Order Status Guard', () => {
    test('should block follow-ups when user has confirmed order', async () => {
      const mockSession = await mockGetUserSession('573001234567');

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);
      jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
        .mockResolvedValue(true);

      const context = createTestContext({ 
        messageType: 'followup',
        bypassTimeWindow: true 
      });
      
      const result = await gate.sendMessage(
        '573001234567',
        'Follow-up message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('order-status');
    });

    test('should allow order notifications when user has confirmed order', async () => {
      const mockSession = await mockGetUserSession('573001234567');

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);
      jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
        .mockResolvedValue(true);

      const context = createTestContext({ 
        messageType: 'order',
        bypassTimeWindow: true 
      });
      
      const result = await gate.sendMessage(
        '573001234567',
        'Your order is being processed',
        context,
        mockFlowDynamic
      );

      // Order notifications should not be blocked by order status
      expect(result.blockedBy).not.toContain('order-status');
    });
  });

  describe('Gate 3: Cooldown Guard', () => {
    test('should block messages during cooldown period', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      const futureDate = new Date(Date.now() + 3600000); // +1 hour

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);
      jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
        .mockResolvedValue({ inCooldown: true, until: futureDate });

      const context = createTestContext({ bypassTimeWindow: true });
      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('cooldown');
    });

    test('should allow messages when cooldown expired', async () => {
      const mockSession = await mockGetUserSession('573001234567');

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);
      jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
        .mockResolvedValue({ inCooldown: false });

      const context = createTestContext({ bypassTimeWindow: true });
      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      expect(result.blockedBy).not.toContain('cooldown');
    });
  });

  describe('Gate 4: Recency Gating', () => {
    test('should block follow-ups sent too soon after last follow-up', async () => {
      const recentDate = new Date(Date.now() - 3600000); // 1 hour ago
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        lastFollowUpAt: recentDate
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ 
        messageType: 'followup',
        bypassTimeWindow: true 
      });
      
      const result = await gate.sendMessage(
        '573001234567',
        'Follow-up message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('recency');
      expect(result.reason).toContain('Too soon since last follow-up');
    });

    test('should allow follow-ups after sufficient time gap', async () => {
      const oldDate = new Date(Date.now() - 86400000 * 2); // 2 days ago
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        lastFollowUpAt: oldDate
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ 
        messageType: 'followup',
        bypassTimeWindow: true 
      });
      
      const result = await gate.sendMessage(
        '573001234567',
        'Follow-up message',
        context,
        mockFlowDynamic
      );

      expect(result.blockedBy).not.toContain('recency');
    });

    test('should block automated messages to recently active users', async () => {
      const recentDate = new Date(Date.now() - 1800000); // 30 minutes ago
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        lastInteraction: recentDate
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ 
        messageType: 'followup',
        priority: 'normal',
        bypassTimeWindow: true 
      });
      
      const result = await gate.sendMessage(
        '573001234567',
        'Automated message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('recency');
      expect(result.reason).toContain('recently active');
    });

    test('should allow high-priority messages to recently active users', async () => {
      const recentDate = new Date(Date.now() - 1800000); // 30 minutes ago
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        lastInteraction: recentDate
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ 
        messageType: 'order',
        priority: 'high',
        bypassTimeWindow: true 
      });
      
      const result = await gate.sendMessage(
        '573001234567',
        'High priority message',
        context,
        mockFlowDynamic
      );

      // High priority messages should not be blocked by recency
      expect(result.blockedBy).not.toContain('recency');
    });
  });

  describe('Gate 5: Time Window', () => {
    test('should block messages outside business hours', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      // Mock current hour to be outside window (e.g., 3 AM)
      const originalDate = Date;
      global.Date = class extends Date {
        constructor() {
          super();
        }
        getHours() {
          return 3; // 3 AM
        }
      } as any;

      const context = createTestContext();
      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      global.Date = originalDate;

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('time-window');
    });

    test('should allow messages during business hours', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      // Mock current hour to be within window (e.g., 2 PM)
      const originalDate = Date;
      global.Date = class extends Date {
        constructor() {
          super();
        }
        getHours() {
          return 14; // 2 PM
        }
      } as any;

      const context = createTestContext();
      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      global.Date = originalDate;

      // Should not be blocked by time window
      expect(result.blockedBy).not.toContain('time-window');
    });

    test('should allow bypass of time window when specified', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ bypassTimeWindow: true });
      const result = await gate.sendMessage(
        '573001234567',
        'Urgent message',
        context,
        mockFlowDynamic
      );

      expect(result.blockedBy).not.toContain('time-window');
    });
  });

  describe('Gate 6: Rate Limiting', () => {
    test('should enforce per-chat rate limit', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ bypassTimeWindow: true });
      const phone = '573001234567';

      // Send messages up to limit
      for (let i = 0; i < 10; i++) {
        await gate.sendMessage(phone, `Message ${i}`, context, mockFlowDynamic);
      }

      // Next message should be blocked
      const result = await gate.sendMessage(
        phone,
        'Over limit message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('rate-limit');
      expect(result.reason).toContain('Per-chat hourly limit');
    });

    test('should enforce minimum interval between messages', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ bypassTimeWindow: true });
      const phone = '573001234567';

      // Send first message
      await gate.sendMessage(phone, 'First message', context, mockFlowDynamic);

      // Try to send second message immediately
      const result = await gate.sendMessage(
        phone,
        'Second message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('rate-limit');
      expect(result.reason).toContain('Too soon since last message');
    });

    test('should allow bypass of rate limit when specified', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ 
        bypassTimeWindow: true,
        bypassRateLimit: true 
      });
      const phone = '573001234567';

      // Send many messages rapidly
      for (let i = 0; i < 15; i++) {
        const result = await gate.sendMessage(
          phone, 
          `Bypass message ${i}`, 
          context, 
          mockFlowDynamic
        );
        // Should not be blocked by rate limit
        expect(result.blockedBy).not.toContain('rate-limit');
      }
    });

    test('should track global rate limit', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const stats = gate.getStats();
      const initialGlobalCount = stats.globalHourlyCount;

      const context = createTestContext({ bypassTimeWindow: true });
      
      // Send a message
      await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      const newStats = gate.getStats();
      expect(newStats.globalHourlyCount).toBeGreaterThan(initialGlobalCount);
    });
  });

  describe('Gate 7: Content Validation', () => {
    test('should validate message content via MessagePolicyEngine', async () => {
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        stage: 'order_confirmed',
        orderData: {
          status: 'CONFIRMED',
          orderNumber: 'ORD-123'
        }
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ 
        messageType: 'followup',
        stage: 'order_confirmed',
        status: 'CONFIRMED',
        bypassTimeWindow: true 
      });

      // Try to send urgency message when order is confirmed (should be blocked)
      const result = await gate.sendMessage(
        '573001234567',
        '¡Última llamada! Oferta urgente termina hoy',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy).toContain('content-policy');
    });

    test('should allow valid message content', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      const context = createTestContext({ bypassTimeWindow: true });
      const result = await gate.sendMessage(
        '573001234567',
        '¿Te interesa música, películas o videos?',
        context,
        mockFlowDynamic
      );

      expect(result.blockedBy).not.toContain('content-policy');
    });
  });

  describe('Integration: Multiple Gates', () => {
    test('should pass all gates for valid message', async () => {
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        contactStatus: 'ACTIVE',
        lastFollowUpAt: new Date(Date.now() - 86400000 * 3), // 3 days ago
        lastInteraction: new Date(Date.now() - 7200000) // 2 hours ago
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);
      jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
        .mockResolvedValue(false);
      jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
        .mockResolvedValue({ inCooldown: false });

      const context = createTestContext({ 
        messageType: 'followup',
        bypassTimeWindow: true 
      });

      const result = await gate.sendMessage(
        '573001234567',
        '¿Te interesa conocer nuestras nuevas memorias USB?',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(true);
      expect(result.blockedBy).toBeUndefined();
      expect(result.delayApplied).toBeGreaterThan(0);
    });

    test('should aggregate multiple blocking reasons', async () => {
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        contactStatus: 'OPT_OUT',
        lastFollowUpAt: new Date(Date.now() - 3600000), // 1 hour ago
        lastInteraction: new Date(Date.now() - 1800000) // 30 min ago
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);
      jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
        .mockResolvedValue({ inCooldown: true, until: new Date(Date.now() + 3600000) });

      const context = createTestContext({ 
        messageType: 'followup'
      });

      const result = await gate.sendMessage(
        '573001234567',
        'Test message',
        context,
        mockFlowDynamic
      );

      expect(result.sent).toBe(false);
      expect(result.blockedBy!.length).toBeGreaterThan(1);
      expect(result.reason).toContain('Blocked by:');
    });
  });

  describe('Statistics', () => {
    test('should track sent messages', async () => {
      const mockSession = await mockGetUserSession('573001234567');
      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      gate.resetStats();
      const context = createTestContext({ bypassTimeWindow: true });
      
      await gate.sendMessage('573001234567', 'Message 1', context, mockFlowDynamic);
      
      const stats = gate.getStats();
      expect(stats.totalSent).toBeGreaterThan(0);
    });

    test('should track blocked messages by reason', async () => {
      const mockSession: UserSession = {
        ...(await mockGetUserSession('573001234567')),
        contactStatus: 'OPT_OUT'
      };

      jest.spyOn(require('../flows/userTrackingSystem'), 'getUserSession')
        .mockResolvedValue(mockSession);

      gate.resetStats();
      const context = createTestContext();
      
      await gate.sendMessage('573001234567', 'Blocked message', context, mockFlowDynamic);
      
      const stats = gate.getStats();
      expect(stats.totalBlocked).toBeGreaterThan(0);
      expect(stats.blockedByNoReach).toBeGreaterThan(0);
    });
  });
});

console.log('✅ OutboundGate tests loaded');
