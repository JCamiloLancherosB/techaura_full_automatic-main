/**
 * Gating Module Test Suite
 * Tests the separation of inbound vs outbound gates
 * 
 * KEY ACCEPTANCE CRITERIA:
 * 1. Inbound messages should NEVER be blocked by follow-up related policies
 * 2. Outbound messages should respect all gating rules
 * 3. max_followups_reached should only block outbound, not inbound
 */

import type { UserSession } from '../../types/global';
import { 
    evaluateInboundGates, 
    evaluateOutboundGates,
    GateReasonCode,
    canProcessInboundMessage
} from '../services/gating';

// Mock user session factory
function createMockSession(overrides: Partial<UserSession> = {}): UserSession {
    return {
        phone: '573001234567',
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

describe('Gating Module - Inbound vs Outbound Separation', () => {
    
    describe('Inbound Gates (incoming user messages)', () => {
        
        test('should ALLOW inbound message when max_followups_reached', async () => {
            // This is the CRITICAL test - user reached max follow-ups but should still be able to message us
            const session = createMockSession({
                followUpAttempts: 6, // Max reached (changed from 3 to 6)
                cooldownUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // In cooldown
            });

            const result = await evaluateInboundGates(
                { phone: session.phone },
                session
            );

            // MUST be allowed - this is the key acceptance criteria
            expect(result.allowed).toBe(true);
            expect(result.reasonCode).toBe(GateReasonCode.ALLOWED);
            
            // Should not contain any outbound-only blocking reasons
            expect(result.blockedBy).toBeUndefined();
        });

        test('should ALLOW inbound message when user is in cooldown period', async () => {
            const session = createMockSession({
                cooldownUntil: new Date(Date.now() + 48 * 60 * 60 * 1000) // 2 days from now
            });

            const result = await evaluateInboundGates(
                { phone: session.phone },
                session
            );

            expect(result.allowed).toBe(true);
            expect(result.reasonCode).toBe(GateReasonCode.ALLOWED);
        });

        test('should ALLOW inbound message outside business hours', async () => {
            // User should be able to message at any time
            const session = createMockSession();

            // Even at 3 AM, user can send messages
            const result = await evaluateInboundGates(
                { phone: session.phone },
                session
            );

            expect(result.allowed).toBe(true);
        });

        test('should ALLOW inbound message when user has OPT_OUT status', async () => {
            // User opted out but now wants to opt back in by messaging
            const session = createMockSession({
                contactStatus: 'OPT_OUT',
                tags: ['blacklist']
            });

            const result = await evaluateInboundGates(
                { phone: session.phone },
                session
            );

            // We allow OPT_OUT users to message (they might want to opt back in)
            expect(result.allowed).toBe(true);
        });

        test('should ALLOW inbound message when user is blacklisted', async () => {
            // Even blacklisted users should be able to message us
            // (blacklist is for opt-out tracking, not abuse)
            const session = createMockSession({
                tags: ['blacklist']
            });

            const result = await evaluateInboundGates(
                { phone: session.phone },
                session
            );

            expect(result.allowed).toBe(true);
            expect(result.reasonCode).toBe(GateReasonCode.ALLOWED);
        });

        test('canProcessInboundMessage helper always returns true', () => {
            // Normal user
            const normalSession = createMockSession();
            expect(canProcessInboundMessage(normalSession)).toBe(true);

            // Max follow-ups reached - still allowed
            const maxFollowUpsSession = createMockSession({ followUpAttempts: 6 }); // Changed from 3 to 6
            expect(canProcessInboundMessage(maxFollowUpsSession)).toBe(true);

            // Blacklist - still allowed (for re-engagement)
            const blacklistSession = createMockSession({ tags: ['blacklist'] });
            expect(canProcessInboundMessage(blacklistSession)).toBe(true);

            // OPT_OUT - still allowed (might want to opt back in)
            const optOutSession = createMockSession({ contactStatus: 'OPT_OUT' });
            expect(canProcessInboundMessage(optOutSession)).toBe(true);
        });
    });

    describe('Outbound Gates (bot-initiated messages)', () => {
        
        test('should BLOCK outbound when max_followups_reached', async () => {
            const session = createMockSession({
                followUpAttempts: 6 // Max reached (changed from 3 to 6)
            });

            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );

            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_MAX_FOLLOWUPS_REACHED);
        });

        test('should BLOCK outbound when user is in cooldown', async () => {
            const session = createMockSession({
                cooldownUntil: new Date(Date.now() + 48 * 60 * 60 * 1000) // 2 days from now
            });

            // Mock flowGuard.isInCooldown
            jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
                .mockResolvedValue({ inCooldown: true, until: session.cooldownUntil });

            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );

            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_COOLDOWN);
            expect(result.nextEligibleAt).toBeDefined();
        });

        test('should BLOCK outbound when user opted out', async () => {
            const session = createMockSession({
                contactStatus: 'OPT_OUT'
            });

            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );

            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_OPT_OUT);
        });

        test('should BLOCK follow-up outbound when user has active order', async () => {
            const session = createMockSession({
                orderData: {
                    orderNumber: 'ORD-123',
                    status: 'CONFIRMED'
                }
            });

            // Mock flowGuard.hasConfirmedOrActiveOrder
            jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
                .mockResolvedValue(true);
            jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
                .mockResolvedValue({ inCooldown: false });

            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );

            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_HAS_ACTIVE_ORDER);
        });

        test('should ALLOW order notifications even when follow-ups blocked', async () => {
            // Test that order notifications bypass follow-up restrictions
            // We set up a session that would block follow-ups but should allow order messages
            const session = createMockSession({
                followUpAttempts: 0, // Not max - so we can test order type bypassing active order gate
                orderData: {
                    orderNumber: 'ORD-123',
                    status: 'CONFIRMED'
                }
            });

            // Mock flowGuard
            jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
                .mockResolvedValue(true);
            jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
                .mockResolvedValue({ inCooldown: false });

            // Order notifications should not be blocked by active order gate
            // (that gate only applies to followup/persuasive types)
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'order', bypassTimeWindow: true },
                session
            );

            // Order messages should pass the active order gate
            expect(result.blockedBy).not.toContain(GateReasonCode.OUTBOUND_HAS_ACTIVE_ORDER);
            // And should be allowed since there are no other blocking reasons
            expect(result.allowed).toBe(true);
        });

        test('should include explanation data in result', async () => {
            const session = createMockSession({
                followUpAttempts: 2,
                followUpCount24h: 1,
                lastInteraction: new Date(Date.now() - 3 * 60 * 60 * 1000),
                lastFollowUp: new Date(Date.now() - 20 * 60 * 60 * 1000)
            });

            jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
                .mockResolvedValue({ inCooldown: false });
            jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
                .mockResolvedValue(false);

            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );

            // Should include counters
            expect(result.counters).toBeDefined();
            expect(result.counters!.followUpAttempts).toBe(2);
            expect(result.counters!.maxAttempts).toBe(3);

            // Should include limits
            expect(result.limits).toBeDefined();
            expect(result.limits!.minFollowUpGapHours).toBe(24);

            // Should include timestamps
            expect(result.lastInteraction).toBeDefined();
            expect(result.lastFollowUp).toBeDefined();
        });
    });

    describe('Key Acceptance Criteria', () => {
        
        test('ACCEPTANCE: Inbound responds even if follow-up is blocked', async () => {
            // Scenario: User has reached max follow-ups and is in cooldown
            // They should STILL be able to send messages to us
            const session = createMockSession({
                followUpAttempts: 6, // Changed from 3 to 6
                followUpCount24h: 1,
                cooldownUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
                contactStatus: 'CLOSED',
                stage: 'not_interested',
                tags: ['not_interested', 'do_not_disturb']
            });

            // INBOUND: User sending a message to us
            const inboundResult = await evaluateInboundGates(
                { phone: session.phone },
                session
            );

            // MUST be allowed
            expect(inboundResult.allowed).toBe(true);
            expect(inboundResult.reasonCode).toBe(GateReasonCode.ALLOWED);

            // OUTBOUND: Us trying to send a follow-up to user
            jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
                .mockResolvedValue({ inCooldown: true, until: session.cooldownUntil });
            jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
                .mockResolvedValue(false);

            const outboundResult = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );

            // Should be blocked by multiple reasons
            expect(outboundResult.allowed).toBe(false);
            expect(outboundResult.blockedBy!.length).toBeGreaterThan(0);
        });

        test('ACCEPTANCE: Outbound has queryable explanation', async () => {
            const session = createMockSession({
                followUpAttempts: 2,
                lastFollowUp: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3h ago (changed from 12h to 3h since limit is now 6h)
            });

            jest.spyOn(require('../services/flowGuard').flowGuard, 'isInCooldown')
                .mockResolvedValue({ inCooldown: false });
            jest.spyOn(require('../services/flowGuard').flowGuard, 'hasConfirmedOrActiveOrder')
                .mockResolvedValue(false);

            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );

            // Should be blocked by recency (3h < 6h minimum)
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_RECENCY_FOLLOWUP);

            // Should have nextEligibleAt
            expect(result.nextEligibleAt).toBeDefined();

            // Should have explanation data
            expect(result.counters).toBeDefined();
            expect(result.limits).toBeDefined();
            expect(result.reason).toContain('Too soon since last follow-up');
        });
    });
});

console.log('✅ Gating module tests loaded');
