/**
 * Follow-up Recent Interaction Gate Tests
 * 
 * Tests for:
 * 1. recent_interaction gate blocks follow-ups within 20min anti-ban threshold
 * 2. insufficient_silence gate blocks follow-ups within 45min recommended threshold
 * 3. nextEligibleAt is correctly calculated as lastInteraction + threshold
 * 4. Follow-ups scheduled at +20min are NOT attempted at t=0
 * 5. When blocked by recent_interaction, reschedule to lastInteraction + 20min
 * 
 * KEY ACCEPTANCE CRITERIA from problem statement:
 * - "Follow-up blocked: recent_interaction: 0min < 20min" should reschedule to exact time
 * - A follow-up should only be attempted when due AND eligible by gates
 * - If blocked, reschedule to nextEligibleAt and do not loop
 */

import type { UserSession } from '../../types/global';
import { 
    evaluateOutboundGates,
    GateReasonCode
} from '../services/gating';

// Mock dependencies
jest.mock('../services/flowGuard', () => ({
    flowGuard: {
        isInCooldown: jest.fn().mockResolvedValue({ inCooldown: false }),
        hasConfirmedOrActiveOrder: jest.fn().mockResolvedValue(false)
    }
}));

jest.mock('../services/followupSuppression', () => ({
    isFollowUpSuppressed: jest.fn().mockResolvedValue({ suppressed: false }),
    SuppressionReason: {
        NOT_SUPPRESSED: 'NOT_SUPPRESSED',
        SHIPPING_CONFIRMED: 'SHIPPING_CONFIRMED',
        ORDER_COMPLETED: 'ORDER_COMPLETED',
        STAGE_DONE: 'STAGE_DONE',
        OPT_OUT: 'OPT_OUT'
    }
}));

// Mock user session factory
function createMockSession(overrides: Partial<UserSession> = {}): UserSession {
    return {
        phone: '573001234567',
        stage: 'awareness',
        interactions: [],
        tags: [],
        conversationData: {},
        lastInteraction: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago (default - passes gates)
        contactStatus: 'ACTIVE',
        followUpAttempts: 0,
        followUpCount24h: 0,
        ...overrides
    } as UserSession;
}

describe('Recent Interaction Gate - Anti-Ban Protection', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('20-minute Anti-Ban Minimum', () => {
        
        test('should BLOCK when lastInteraction is 0 minutes ago (< 20min)', async () => {
            const session = createMockSession({
                lastInteraction: new Date() // Just now
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
            expect(result.reason).toContain('recent_interaction');
            expect(result.reason).toContain('20min');
            expect(result.nextEligibleAt).toBeDefined();
        });

        test('should BLOCK when lastInteraction is 10 minutes ago (< 20min)', async () => {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const session = createMockSession({
                lastInteraction: tenMinutesAgo
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
            expect(result.reason).toContain('recent_interaction');
        });

        test('should calculate nextEligibleAt as lastInteraction + 20min + jitter', async () => {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const session = createMockSession({
                lastInteraction: fiveMinutesAgo
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Should be lastInteraction + 20min + jitter (1-5min)
            const expectedBaseTime = fiveMinutesAgo.getTime() + 20 * 60 * 1000;
            const nextEligible = result.nextEligibleAt!;
            const expectedMinTime = expectedBaseTime + 60 * 1000; // +1min jitter
            const expectedMaxTime = expectedBaseTime + 5 * 60 * 1000; // +5min jitter
            
            expect(nextEligible.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
            expect(nextEligible.getTime()).toBeLessThanOrEqual(expectedMaxTime);
        });
    });

    describe('45-minute Insufficient Silence', () => {
        
        test('should BLOCK when lastInteraction is 25 minutes ago (> 20min but < 45min)', async () => {
            const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000);
            const session = createMockSession({
                lastInteraction: twentyFiveMinutesAgo
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
            expect(result.reason).toContain('insufficient_silence');
            expect(result.reason).toContain('45min');
        });

        test('should calculate nextEligibleAt as lastInteraction + 45min when between 20-45 min', async () => {
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            const session = createMockSession({
                lastInteraction: thirtyMinutesAgo
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Should be lastInteraction + 45min + jitter (1-5min)
            const expectedBaseTime = thirtyMinutesAgo.getTime() + 45 * 60 * 1000;
            const nextEligible = result.nextEligibleAt!;
            const expectedMinTime = expectedBaseTime + 60 * 1000; // +1min jitter
            const expectedMaxTime = expectedBaseTime + 5 * 60 * 1000; // +5min jitter
            
            expect(nextEligible.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
            expect(nextEligible.getTime()).toBeLessThanOrEqual(expectedMaxTime);
        });
    });

    describe('Gate Passage (>= 45 minutes)', () => {
        
        test('should ALLOW when lastInteraction is 50 minutes ago (>= 45min)', async () => {
            const fiftyMinutesAgo = new Date(Date.now() - 50 * 60 * 1000);
            const session = createMockSession({
                lastInteraction: fiftyMinutesAgo
            });
            
            const { flowGuard } = require('../services/flowGuard');
            flowGuard.isInCooldown.mockResolvedValue({ inCooldown: false });
            flowGuard.hasConfirmedOrActiveOrder.mockResolvedValue(false);
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            // Should not be blocked by recency gates
            expect(result.blockedBy || []).not.toContain(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
        });

        test('should ALLOW when lastInteraction is 2 hours ago', async () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const session = createMockSession({
                lastInteraction: twoHoursAgo
            });
            
            const { flowGuard } = require('../services/flowGuard');
            flowGuard.isInCooldown.mockResolvedValue({ inCooldown: false });
            flowGuard.hasConfirmedOrActiveOrder.mockResolvedValue(false);
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            // Should pass recency gates
            expect(result.blockedBy || []).not.toContain(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
        });
    });

    describe('Scenario: Follow-up at t=0 with recent interaction', () => {
        
        test('ACCEPTANCE: when scheduled at +20min but lastInteraction is now, should block and reschedule', async () => {
            // Scenario from problem statement:
            // "Follow-up blocked: recent_interaction: 0min < 20min"
            // "Yet follow-ups are scheduled 20–30 minutes later"
            
            const session = createMockSession({
                lastInteraction: new Date() // User just interacted
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            // Must be blocked
            expect(result.allowed).toBe(false);
            
            // Must have nextEligibleAt for rescheduling
            expect(result.nextEligibleAt).toBeDefined();
            
            // nextEligibleAt should be ~20 minutes in the future (+ jitter)
            const minutesUntilEligible = (result.nextEligibleAt!.getTime() - Date.now()) / (60 * 1000);
            expect(minutesUntilEligible).toBeGreaterThanOrEqual(20); // At least 20 min
            expect(minutesUntilEligible).toBeLessThanOrEqual(26); // Max 25min + jitter
            
            // Reason should clearly indicate the anti-ban gate
            expect(result.reason).toContain('recent_interaction');
            expect(result.reason).toContain('20min');
        });

        test('ACCEPTANCE: when scheduled at +20min and lastInteraction is still recent, reschedule to lastInteraction+20min', async () => {
            // Scenario: 
            // t=0: User interacts, follow-up scheduled for t+20min
            // t=20min: Follow-up attempts but user interacted at t=15min
            // Expected: Block with nextEligibleAt = t=15min + 20min = t=35min
            
            const lastInteractionAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago (simulating user interacted at t=15min when now is t=20min)
            const session = createMockSession({
                lastInteraction: lastInteractionAt
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            // Must be blocked
            expect(result.allowed).toBe(false);
            
            // nextEligibleAt should be lastInteraction + 20min + jitter
            expect(result.nextEligibleAt).toBeDefined();
            
            const expectedBaseTime = lastInteractionAt.getTime() + 20 * 60 * 1000;
            const nextEligible = result.nextEligibleAt!;
            
            // Should be close to lastInteraction + 20 min (within jitter range)
            expect(nextEligible.getTime()).toBeGreaterThanOrEqual(expectedBaseTime + 60 * 1000);
            expect(nextEligible.getTime()).toBeLessThanOrEqual(expectedBaseTime + 5 * 60 * 1000);
        });
    });

    describe('High Priority Bypass', () => {
        
        test('should ALLOW high priority messages even with recent interaction', async () => {
            const session = createMockSession({
                lastInteraction: new Date() // Just now
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', priority: 'high', bypassTimeWindow: true },
                session
            );
            
            // High priority should bypass recency gate
            expect(result.blockedBy || []).not.toContain(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
        });
    });
});

console.log('✅ Follow-up Recent Interaction Gate tests loaded');
