/**
 * Follow-up Rescheduling Test Suite
 * Tests for improved rescheduling when follow-ups are blocked by gating
 * 
 * KEY ACCEPTANCE CRITERIA:
 * 1. outside_hours → schedules exactly at window start + jitter
 * 2. rest_period_active (cooldown) → schedules at end of cooldown + jitter
 * 3. rate_limit → respects cooldown
 * 4. insufficient_silence/too_soon → uses exact threshold time
 * 5. No infinite loops of rescheduling within closed window
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

describe('Follow-up Rescheduling - nextEligibleAt Calculation', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Outside Hours (Time Window) Gate', () => {
        
        test('should calculate nextEligibleAt at exact window start when blocked outside hours', async () => {
            const session = createMockSession();
            
            // Mock current time to be outside business hours (e.g., 11 PM)
            const mockDate = new Date();
            mockDate.setHours(23, 0, 0, 0);
            jest.useFakeTimers().setSystemTime(mockDate);
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_TIME_WINDOW);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Should be next day at 9 AM (business hours start)
            const nextEligible = result.nextEligibleAt!;
            expect(nextEligible.getHours()).toBe(9);
            expect(nextEligible.getMinutes()).toBeGreaterThanOrEqual(0);
            expect(nextEligible.getMinutes()).toBeLessThanOrEqual(5); // 0-5 min jitter
            
            jest.useRealTimers();
        });

        test('should schedule to same day if blocked early morning', async () => {
            const session = createMockSession();
            
            // Mock current time to be early morning (e.g., 6 AM)
            const mockDate = new Date();
            mockDate.setHours(6, 0, 0, 0);
            jest.useFakeTimers().setSystemTime(mockDate);
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_TIME_WINDOW);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Should be same day at 9 AM
            const nextEligible = result.nextEligibleAt!;
            const today = new Date();
            expect(nextEligible.getDate()).toBe(today.getDate());
            expect(nextEligible.getHours()).toBe(9);
            
            jest.useRealTimers();
        });
    });

    describe('Cooldown (Rest Period) Gate', () => {
        
        test('should use exact cooldown end time as nextEligibleAt', async () => {
            const cooldownEnd = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
            const session = createMockSession({
                cooldownUntil: cooldownEnd
            });
            
            const { flowGuard } = require('../services/flowGuard');
            flowGuard.isInCooldown.mockResolvedValue({ 
                inCooldown: true, 
                until: cooldownEnd 
            });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_COOLDOWN);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Should be cooldown end time + jitter (1-5 min)
            const nextEligible = result.nextEligibleAt!;
            const expectedMinTime = cooldownEnd.getTime() + 60 * 1000; // +1min jitter
            const expectedMaxTime = cooldownEnd.getTime() + 5 * 60 * 1000; // +5min jitter
            
            expect(nextEligible.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
            expect(nextEligible.getTime()).toBeLessThanOrEqual(expectedMaxTime);
        });
    });

    describe('Recency (Too Soon / Insufficient Silence) Gate', () => {
        
        test('should use exact follow-up gap threshold for too_soon', async () => {
            // Last follow-up was 2 hours ago (less than 6h minimum)
            const lastFollowUp = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const session = createMockSession({
                lastFollowUp: lastFollowUp
            });
            
            const { flowGuard } = require('../services/flowGuard');
            flowGuard.isInCooldown.mockResolvedValue({ inCooldown: false });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_RECENCY_FOLLOWUP);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Should be lastFollowUp + 6 hours (MIN_FOLLOWUP_GAP_MS) + jitter
            const expectedBaseTime = lastFollowUp.getTime() + 6 * 60 * 60 * 1000;
            const nextEligible = result.nextEligibleAt!;
            const expectedMinTime = expectedBaseTime + 60 * 1000; // +1min jitter
            const expectedMaxTime = expectedBaseTime + 5 * 60 * 1000; // +5min jitter
            
            expect(nextEligible.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
            expect(nextEligible.getTime()).toBeLessThanOrEqual(expectedMaxTime);
        });

        test('should use exact interaction gap for insufficient_silence', async () => {
            // Last interaction was 20 minutes ago (less than 45min minimum)
            const lastInteraction = new Date(Date.now() - 20 * 60 * 1000);
            const session = createMockSession({
                lastInteraction: lastInteraction
            });
            
            const { flowGuard } = require('../services/flowGuard');
            flowGuard.isInCooldown.mockResolvedValue({ inCooldown: false });
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup', bypassTimeWindow: true },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Should be lastInteraction + 45 min (MIN_INTERACTION_GAP_MS) + jitter
            const expectedBaseTime = lastInteraction.getTime() + 45 * 60 * 1000;
            const nextEligible = result.nextEligibleAt!;
            const expectedMinTime = expectedBaseTime + 60 * 1000; // +1min jitter
            const expectedMaxTime = expectedBaseTime + 5 * 60 * 1000; // +5min jitter
            
            expect(nextEligible.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
            expect(nextEligible.getTime()).toBeLessThanOrEqual(expectedMaxTime);
        });
    });

    describe('Multiple Blocking Gates', () => {
        
        test('should use the LATEST nextEligibleAt when multiple gates block', async () => {
            // Scenario: User has both recency block (2h since follow-up) AND is outside hours
            const lastFollowUp = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
            const session = createMockSession({
                lastFollowUp: lastFollowUp
            });
            
            const { flowGuard } = require('../services/flowGuard');
            flowGuard.isInCooldown.mockResolvedValue({ inCooldown: false });
            
            // Mock time to be 3 AM (outside hours AND too soon since follow-up)
            const mockDate = new Date();
            mockDate.setHours(3, 0, 0, 0);
            jest.useFakeTimers().setSystemTime(mockDate);
            
            const result = await evaluateOutboundGates(
                { phone: session.phone, messageType: 'followup' },
                session
            );
            
            expect(result.allowed).toBe(false);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_TIME_WINDOW);
            expect(result.blockedBy).toContain(GateReasonCode.OUTBOUND_RECENCY_FOLLOWUP);
            expect(result.nextEligibleAt).toBeDefined();
            
            // Calculate expected times
            const windowOpenTime = new Date(mockDate);
            windowOpenTime.setHours(9, 0, 0, 0); // 9 AM same day
            
            const recencyAllowedTime = new Date(lastFollowUp.getTime() + 6 * 60 * 60 * 1000);
            
            // nextEligibleAt should be the LATER of the two (+ jitter)
            const laterTime = Math.max(windowOpenTime.getTime(), recencyAllowedTime.getTime());
            const nextEligible = result.nextEligibleAt!;
            const expectedMinTime = laterTime + 60 * 1000; // +1min jitter
            const expectedMaxTime = laterTime + 5 * 60 * 1000; // +5min jitter
            
            expect(nextEligible.getTime()).toBeGreaterThanOrEqual(expectedMinTime);
            expect(nextEligible.getTime()).toBeLessThanOrEqual(expectedMaxTime);
            
            jest.useRealTimers();
        });
    });

    describe('Jitter Application', () => {
        
        test('should add jitter (1-5 minutes) to nextEligibleAt', async () => {
            const session = createMockSession();
            
            // Mock time to be outside hours
            const mockDate = new Date();
            mockDate.setHours(23, 0, 0, 0);
            jest.useFakeTimers().setSystemTime(mockDate);
            
            // Run multiple times to verify jitter variance
            const results: number[] = [];
            for (let i = 0; i < 10; i++) {
                const result = await evaluateOutboundGates(
                    { phone: session.phone, messageType: 'followup' },
                    session
                );
                if (result.nextEligibleAt) {
                    results.push(result.nextEligibleAt.getMinutes());
                }
            }
            
            // Verify jitter is being applied (not all the same)
            // With 10 runs, we should see some variance if jitter is working
            const uniqueMinutes = new Set(results);
            expect(uniqueMinutes.size).toBeGreaterThan(1);
            
            jest.useRealTimers();
        });
    });
});

describe('Follow-up Rescheduling - Anti-Infinite-Loop Protection', () => {
    
    test('should not create infinite rescheduling loops in closed windows', async () => {
        // This tests the conceptual protection - actual implementation in StageBasedFollowUpService
        // has MAX_RESCHEDULE_ATTEMPTS = 10 to prevent infinite loops
        
        const session = createMockSession({
            followUpAttempts: 5 // High but not max
        });
        
        // Mock time outside hours
        const mockDate = new Date();
        mockDate.setHours(2, 0, 0, 0); // 2 AM
        jest.useFakeTimers().setSystemTime(mockDate);
        
        const result = await evaluateOutboundGates(
            { phone: session.phone, messageType: 'followup' },
            session
        );
        
        // Even after multiple blocks, nextEligibleAt should be in the future
        expect(result.nextEligibleAt).toBeDefined();
        expect(result.nextEligibleAt!.getTime()).toBeGreaterThan(Date.now());
        
        // And should point to a valid business hours time
        expect(result.nextEligibleAt!.getHours()).toBe(9);
        
        jest.useRealTimers();
    });
});

console.log('✅ Follow-up rescheduling tests loaded');
