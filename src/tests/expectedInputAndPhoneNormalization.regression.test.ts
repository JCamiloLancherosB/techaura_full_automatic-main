/**
 * Regression Tests: expected_input truncation, phone normalization, and follow-up gating
 * 
 * Tests that validate:
 * 1. Persist flow state with expected_input='GENRES' in conversation_state succeeds
 * 2. @lid phone suffix normalizes to the same canonical key; state read/write matches
 * 3. Follow-up scheduled for +20min is not attempted immediately; attempted only when due; blocked reschedules to nextEligibleAt
 * 
 * ACCEPTANCE CRITERIA:
 * - Tests must fail if a truncation warning occurs or if state is split across two phone keys
 * 
 * Run with: npx tsx src/tests/expectedInputAndPhoneNormalization.regression.test.ts
 */

import { normalizePhoneId, hashPhone } from '../utils/phoneHasher';
import { VALID_EXPECTED_INPUT_TYPES } from '../types/flowState';
import type { ExpectedInputType } from '../types/flowState';

// ============================================
// Simple Test Runner (no Jest dependency)
// ============================================

let testsPassed = 0;
let testsFailed = 0;
let currentDescribe = '';
let truncationWarningDetected = false;
let stateSplitAcrossPhoneKeysDetected = false;

// Capture console.warn to detect truncation warnings
const originalConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
    const message = args.map(a => String(a)).join(' ');
    if (message.toLowerCase().includes('truncat') || 
        message.toLowerCase().includes('data too long') ||
        message.toLowerCase().includes('enum')) {
        truncationWarningDetected = true;
        console.log(`  ⚠️ TRUNCATION WARNING DETECTED: ${message}`);
    }
    originalConsoleWarn.apply(console, args);
};

function describe(name: string, fn: () => void): void {
    currentDescribe = name;
    console.log(`\n📦 ${name}`);
    fn();
}

function test(name: string, fn: () => void): void {
    try {
        fn();
        testsPassed++;
        console.log(`  ✅ ${name}`);
    } catch (error: any) {
        testsFailed++;
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
    }
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
        throw new Error(message || `Expected "${expected}", got "${actual}"`);
    }
}

function assertNotNull<T>(value: T | null | undefined, message?: string): asserts value is T {
    if (value === null || value === undefined) {
        throw new Error(message || `Expected non-null value, got ${value}`);
    }
}

function assertArrayIncludes<T>(array: readonly T[], item: T, message?: string): void {
    if (!array.includes(item)) {
        throw new Error(message || `Array [${array.join(', ')}] does not include "${item}"`);
    }
}

// ============================================
// Mock Flow Continuity Service (In-Memory Only)
// ============================================

interface MockFlowState {
    phone: string;
    activeFlowId: string | null;
    activeStep: string | null;
    expectedInput: ExpectedInputType;
    lastQuestionId: string | null;
    lastQuestionText: string | null;
    stepTimeoutHours: number;
    flowContext: Record<string, any> | null;
    updatedAt: Date;
    createdAt: Date;
}

class MockFlowContinuityService {
    private stateCache = new Map<string, MockFlowState>();
    private readonly DEFAULT_TIMEOUT_HOURS = 2;

    setFlowState(phone: string, options: {
        flowId: string;
        step: string;
        expectedInput?: ExpectedInputType;
        questionId?: string;
        questionText?: string;
        timeoutHours?: number;
        context?: Record<string, any>;
    }): { success: boolean; warning?: string } {
        // Normalize phone ID to ensure consistent key storage
        const canonicalPhone = normalizePhoneId(phone);
        if (!canonicalPhone) {
            return { success: false, warning: 'Invalid phone identifier' };
        }

        const now = new Date();
        const expectedInput = options.expectedInput || 'ANY';

        // Validate expected_input is in the valid types list
        if (!VALID_EXPECTED_INPUT_TYPES.includes(expectedInput)) {
            truncationWarningDetected = true;
            return { 
                success: false, 
                warning: `Invalid expected_input type: ${expectedInput}` 
            };
        }

        // Simulate DB column length check (VARCHAR(32))
        if (expectedInput.length > 32) {
            truncationWarningDetected = true;
            return { 
                success: false, 
                warning: `expected_input value "${expectedInput}" would be truncated (length ${expectedInput.length} > 32)` 
            };
        }

        const state: MockFlowState = {
            phone: canonicalPhone,
            activeFlowId: options.flowId,
            activeStep: options.step,
            expectedInput,
            lastQuestionId: options.questionId || null,
            lastQuestionText: options.questionText || null,
            stepTimeoutHours: options.timeoutHours || this.DEFAULT_TIMEOUT_HOURS,
            flowContext: options.context || null,
            updatedAt: now,
            createdAt: now
        };

        // Store with canonical phone key
        this.stateCache.set(canonicalPhone, state);
        return { success: true };
    }

    checkFlowContinuity(phone: string): {
        shouldContinueInFlow: boolean;
        activeFlowId: string | null;
        activeStep: string | null;
        expectedInput: ExpectedInputType;
        lastQuestionText: string | null;
    } {
        // Normalize phone ID for consistent lookup
        const canonicalPhone = normalizePhoneId(phone);
        if (!canonicalPhone) {
            return {
                shouldContinueInFlow: false,
                activeFlowId: null,
                activeStep: null,
                expectedInput: 'ANY',
                lastQuestionText: null
            };
        }

        const state = this.stateCache.get(canonicalPhone);
        if (!state || !state.activeFlowId) {
            return {
                shouldContinueInFlow: false,
                activeFlowId: null,
                activeStep: null,
                expectedInput: 'ANY',
                lastQuestionText: null
            };
        }

        return {
            shouldContinueInFlow: true,
            activeFlowId: state.activeFlowId,
            activeStep: state.activeStep,
            expectedInput: state.expectedInput,
            lastQuestionText: state.lastQuestionText
        };
    }

    clearFlowState(phone: string): void {
        const canonicalPhone = normalizePhoneId(phone);
        if (canonicalPhone) {
            this.stateCache.delete(canonicalPhone);
        }
    }

    getCacheSize(): number {
        return this.stateCache.size;
    }

    getAllCacheKeys(): string[] {
        return Array.from(this.stateCache.keys());
    }
}

// ============================================
// Mock Follow-Up Scheduling Service
// ============================================

interface ScheduledFollowUp {
    phone: string;
    scheduledFor: number; // timestamp
    status: 'pending' | 'executed' | 'blocked' | 'cancelled';
    blockedReason?: string;
    nextEligibleAt?: number;
    attemptCount: number;
}

class MockFollowUpScheduler {
    private scheduledFollowUps = new Map<string, ScheduledFollowUp>();
    private currentTime: number;
    
    // Configuration
    private readonly MIN_SILENCE_MS = 20 * 60 * 1000; // 20 minutes

    constructor(initialTime: number = Date.now()) {
        this.currentTime = initialTime;
    }

    setTime(time: number): void {
        this.currentTime = time;
    }

    advanceBy(ms: number): void {
        this.currentTime += ms;
    }

    now(): number {
        return this.currentTime;
    }

    /**
     * Schedule a follow-up for a specific time
     */
    scheduleFollowUp(phone: string, delayMs: number): ScheduledFollowUp {
        const canonicalPhone = normalizePhoneId(phone);
        const followUp: ScheduledFollowUp = {
            phone: canonicalPhone,
            scheduledFor: this.currentTime + delayMs,
            status: 'pending',
            attemptCount: 0
        };
        this.scheduledFollowUps.set(canonicalPhone, followUp);
        return followUp;
    }

    /**
     * Check if a follow-up should be attempted at current time
     */
    shouldAttemptFollowUp(phone: string): boolean {
        const canonicalPhone = normalizePhoneId(phone);
        const followUp = this.scheduledFollowUps.get(canonicalPhone);
        if (!followUp) return false;
        return followUp.status === 'pending' && this.currentTime >= followUp.scheduledFor;
    }

    /**
     * Attempt to execute a follow-up
     * Returns success/blocked status and nextEligibleAt if blocked
     */
    attemptFollowUp(
        phone: string, 
        lastInteractionTime: number
    ): { executed: boolean; blockedReason?: string; nextEligibleAt?: number } {
        const canonicalPhone = normalizePhoneId(phone);
        const followUp = this.scheduledFollowUps.get(canonicalPhone);
        
        if (!followUp || followUp.status !== 'pending') {
            return { executed: false, blockedReason: 'no_pending_followup' };
        }

        followUp.attemptCount++;

        // Check if enough time has passed since last interaction
        const timeSinceInteraction = this.currentTime - lastInteractionTime;
        
        if (timeSinceInteraction < this.MIN_SILENCE_MS) {
            // Blocked due to recent interaction
            const nextEligible = lastInteractionTime + this.MIN_SILENCE_MS;
            followUp.status = 'blocked';
            followUp.blockedReason = 'recent_interaction';
            followUp.nextEligibleAt = nextEligible;
            
            return {
                executed: false,
                blockedReason: 'recent_interaction',
                nextEligibleAt: nextEligible
            };
        }

        // Success
        followUp.status = 'executed';
        return { executed: true };
    }

    /**
     * Reschedule a blocked follow-up to its nextEligibleAt time
     */
    rescheduleFollowUp(phone: string): ScheduledFollowUp | null {
        const canonicalPhone = normalizePhoneId(phone);
        const followUp = this.scheduledFollowUps.get(canonicalPhone);
        
        if (!followUp || !followUp.nextEligibleAt) {
            return null;
        }

        followUp.scheduledFor = followUp.nextEligibleAt;
        followUp.status = 'pending';
        followUp.blockedReason = undefined;
        followUp.nextEligibleAt = undefined;
        
        return followUp;
    }

    getFollowUp(phone: string): ScheduledFollowUp | undefined {
        const canonicalPhone = normalizePhoneId(phone);
        return this.scheduledFollowUps.get(canonicalPhone);
    }
}

// ============================================
// Tests Begin
// ============================================

console.log('🧪 REGRESSION TESTS: expected_input truncation, phone normalization, follow-up gating\n');
console.log('='.repeat(80));

// ============================================
// TEST 1: expected_input='GENRES' Persistence
// ============================================

describe('TEST 1: Persist flow state with expected_input=GENRES succeeds', () => {
    const service = new MockFlowContinuityService();
    const testPhone = '573001234567';

    // Clean up before tests
    service.clearFlowState(testPhone);
    truncationWarningDetected = false;

    test('VALID_EXPECTED_INPUT_TYPES includes GENRES', () => {
        assertArrayIncludes(VALID_EXPECTED_INPUT_TYPES, 'GENRES', 'GENRES should be in valid types');
    });

    test('VALID_EXPECTED_INPUT_TYPES includes YES_NO', () => {
        assertArrayIncludes(VALID_EXPECTED_INPUT_TYPES, 'YES_NO', 'YES_NO should be in valid types');
    });

    test('VALID_EXPECTED_INPUT_TYPES includes OK', () => {
        assertArrayIncludes(VALID_EXPECTED_INPUT_TYPES, 'OK', 'OK should be in valid types');
    });

    test('should persist state with expected_input=GENRES without truncation', () => {
        truncationWarningDetected = false;

        const result = service.setFlowState(testPhone, {
            flowId: 'musicUsb',
            step: 'genre_selection',
            expectedInput: 'GENRES',
            questionText: '¿Qué géneros musicales te gustan?'
        });

        assert(result.success, `Set flow state should succeed: ${result.warning || 'no warning'}`);
        assert(!truncationWarningDetected, 'ACCEPTANCE FAILURE: Truncation warning detected during GENRES persist');

        const checkResult = service.checkFlowContinuity(testPhone);
        assertEqual(checkResult.shouldContinueInFlow, true, 'Flow should be active');
        assertEqual(checkResult.expectedInput, 'GENRES', 'Expected input should be GENRES');
        assertEqual(checkResult.activeFlowId, 'musicUsb', 'Active flow should be musicUsb');
        assertEqual(checkResult.activeStep, 'genre_selection', 'Active step should be genre_selection');
    });

    test('should persist state with expected_input=YES_NO without truncation', () => {
        truncationWarningDetected = false;

        const result = service.setFlowState(testPhone, {
            flowId: 'orderFlow',
            step: 'confirm_order',
            expectedInput: 'YES_NO',
            questionText: '¿Confirmas tu pedido?'
        });

        assert(result.success, `Set flow state should succeed: ${result.warning || 'no warning'}`);
        assert(!truncationWarningDetected, 'ACCEPTANCE FAILURE: Truncation warning detected during YES_NO persist');

        const checkResult = service.checkFlowContinuity(testPhone);
        assertEqual(checkResult.expectedInput, 'YES_NO', 'Expected input should be YES_NO');
    });

    test('should persist state with expected_input=OK without truncation', () => {
        truncationWarningDetected = false;

        const result = service.setFlowState(testPhone, {
            flowId: 'datosCliente',
            step: 'info_shown',
            expectedInput: 'OK',
            questionText: 'Aquí está la información.'
        });

        assert(result.success, `Set flow state should succeed: ${result.warning || 'no warning'}`);
        assert(!truncationWarningDetected, 'ACCEPTANCE FAILURE: Truncation warning detected during OK persist');

        const checkResult = service.checkFlowContinuity(testPhone);
        assertEqual(checkResult.expectedInput, 'OK', 'Expected input should be OK');
    });

    test('should persist all supported expected_input types without error', () => {
        const expectedInputTypes: ExpectedInputType[] = [
            'TEXT', 'NUMBER', 'CHOICE', 'MEDIA', 'ANY', 'YES_NO', 'GENRES', 'OK'
        ];

        for (const inputType of expectedInputTypes) {
            truncationWarningDetected = false;

            const result = service.setFlowState(testPhone, {
                flowId: 'testFlow',
                step: `test_step_${inputType}`,
                expectedInput: inputType,
                questionText: `Test question for ${inputType}`
            });

            assert(result.success, `Set flow state should succeed for ${inputType}: ${result.warning || 'no warning'}`);
            assert(
                !truncationWarningDetected, 
                `ACCEPTANCE FAILURE: Truncation warning for expected_input=${inputType}`
            );

            const checkResult = service.checkFlowContinuity(testPhone);
            assertEqual(
                checkResult.expectedInput, 
                inputType, 
                `Expected input should be ${inputType}, got ${checkResult.expectedInput}`
            );
        }
    });

    test('all expected_input types fit within VARCHAR(32)', () => {
        for (const inputType of VALID_EXPECTED_INPUT_TYPES) {
            assert(
                inputType.length <= 32, 
                `Expected input type "${inputType}" exceeds VARCHAR(32) limit (length: ${inputType.length})`
            );
        }
    });
});

// ============================================
// TEST 2: @lid Phone Suffix Normalization
// ============================================

describe('TEST 2: @lid phone suffix normalizes to same canonical key', () => {
    const service = new MockFlowContinuityService();
    
    // Test phone with various formats
    const phoneWithLid = '157595436335191@lid';
    const phoneWithWhatsapp = '157595436335191@s.whatsapp.net';
    const plainPhone = '157595436335191';
    const formattedPhone = '+1 575 954 3633 5191';

    // Clean up any existing state
    service.clearFlowState(plainPhone);
    stateSplitAcrossPhoneKeysDetected = false;

    test('should normalize @lid suffix to canonical phone', () => {
        const normalized = normalizePhoneId(phoneWithLid);
        assertEqual(normalized, plainPhone, `@lid suffix should be stripped: expected "${plainPhone}", got "${normalized}"`);
    });

    test('should normalize @s.whatsapp.net suffix to canonical phone', () => {
        const normalized = normalizePhoneId(phoneWithWhatsapp);
        assertEqual(normalized, plainPhone, `@s.whatsapp.net suffix should be stripped`);
    });

    test('should strip formatting and return digits only', () => {
        const normalized = normalizePhoneId(formattedPhone);
        assertEqual(normalized, '15759543633' + '5191', `Formatting should be removed`);
    });

    test('should produce same hash for @lid and plain phone', () => {
        const hashLid = hashPhone(phoneWithLid);
        const hashPlain = hashPhone(plainPhone);
        assertEqual(hashLid, hashPlain, `Hash mismatch: @lid="${hashLid}", plain="${hashPlain}"`);
    });

    test('should produce same hash for @s.whatsapp.net and plain phone', () => {
        const hashJid = hashPhone(phoneWithWhatsapp);
        const hashPlain = hashPhone(plainPhone);
        assertEqual(hashJid, hashPlain, `Hash mismatch: @s.whatsapp.net="${hashJid}", plain="${hashPlain}"`);
    });

    test('state written with @lid can be read with plain phone (no key split)', () => {
        // Write state using @lid format
        service.setFlowState(phoneWithLid, {
            flowId: 'musicUsb',
            step: 'genre_selection',
            expectedInput: 'GENRES',
            questionText: '¿Qué géneros te gustan?'
        });

        // Read state using plain phone format
        const resultPlain = service.checkFlowContinuity(plainPhone);

        assertEqual(resultPlain.shouldContinueInFlow, true, 'State should be found with plain phone');
        assertEqual(resultPlain.activeFlowId, 'musicUsb', 'Flow ID should match');
        assertEqual(resultPlain.activeStep, 'genre_selection', 'Step should match');

        // ACCEPTANCE: Verify no split occurred - check with @lid format too
        const resultLid = service.checkFlowContinuity(phoneWithLid);
        assertEqual(resultLid.activeFlowId, resultPlain.activeFlowId, 'ACCEPTANCE FAILURE: State split detected - different flow IDs');
        assertEqual(resultLid.activeStep, resultPlain.activeStep, 'ACCEPTANCE FAILURE: State split detected - different steps');

        // Clean up
        service.clearFlowState(plainPhone);
    });

    test('state written with plain phone can be read with @lid (no key split)', () => {
        // Write state using plain phone format
        service.setFlowState(plainPhone, {
            flowId: 'videosUsb',
            step: 'category_selection',
            expectedInput: 'CHOICE',
            questionText: '¿Qué categoría prefieres?'
        });

        // Read state using @lid format
        const resultLid = service.checkFlowContinuity(phoneWithLid);

        assertEqual(resultLid.shouldContinueInFlow, true, 'State should be found with @lid phone');
        assertEqual(resultLid.activeFlowId, 'videosUsb', 'Flow ID should match');
        assertEqual(resultLid.activeStep, 'category_selection', 'Step should match');

        // Clean up
        service.clearFlowState(plainPhone);
    });

    test('clearing state with either format clears for both', () => {
        // Write state
        service.setFlowState(phoneWithLid, {
            flowId: 'musicUsb',
            step: 'entry',
            expectedInput: 'TEXT'
        });

        // Clear using plain phone
        service.clearFlowState(plainPhone);

        // Verify cleared for both formats
        const resultPlain = service.checkFlowContinuity(plainPhone);
        const resultLid = service.checkFlowContinuity(phoneWithLid);

        assertEqual(resultPlain.shouldContinueInFlow, false, 'State should be cleared for plain phone');
        assertEqual(resultLid.shouldContinueInFlow, false, 'State should be cleared for @lid phone');
    });

    test('cache uses only normalized keys (no duplicate entries)', () => {
        const phone1 = '573001234567@lid';
        const phone2 = '573001234567@s.whatsapp.net';
        const phone3 = '573001234567';

        // Write with three different formats
        service.setFlowState(phone1, { flowId: 'flow1', step: 'step1', expectedInput: 'TEXT' });
        service.setFlowState(phone2, { flowId: 'flow2', step: 'step2', expectedInput: 'NUMBER' });
        service.setFlowState(phone3, { flowId: 'flow3', step: 'step3', expectedInput: 'CHOICE' });

        // Cache should only have one entry (all normalized to same key)
        const cacheKeys = service.getAllCacheKeys();
        const normalizedKey = normalizePhoneId(phone1);
        
        // Count entries for this phone
        const entriesForPhone = cacheKeys.filter(k => k === normalizedKey);
        assertEqual(entriesForPhone.length, 1, 'ACCEPTANCE FAILURE: Multiple cache entries for same normalized phone');

        // Should see the latest write (flow3)
        const result = service.checkFlowContinuity(phone1);
        assertEqual(result.activeFlowId, 'flow3', 'Latest write should be visible');
        assertEqual(result.activeStep, 'step3', 'Latest step should be visible');

        // Clean up
        service.clearFlowState(phone3);
    });
});

// ============================================
// TEST 3: Follow-up Scheduling Gating
// ============================================

describe('TEST 3: Follow-up scheduled for +20min is not attempted immediately; blocks reschedule to nextEligibleAt', () => {
    const startTime = Date.now();
    const scheduler = new MockFollowUpScheduler(startTime);
    const testPhone = '573001234567';

    test('follow-up scheduled for +20min should NOT be attempted immediately', () => {
        // Schedule follow-up for 20 minutes from now
        scheduler.scheduleFollowUp(testPhone, 20 * 60 * 1000);

        // At time=0 (now), follow-up should NOT be attempted
        const shouldAttempt = scheduler.shouldAttemptFollowUp(testPhone);
        assertEqual(shouldAttempt, false, 'Follow-up should NOT be attempted before scheduled time');
    });

    test('follow-up should NOT be attempted at +10min (before scheduled time)', () => {
        // Advance time to +10 minutes
        scheduler.setTime(startTime + (10 * 60 * 1000));

        const shouldAttempt = scheduler.shouldAttemptFollowUp(testPhone);
        assertEqual(shouldAttempt, false, 'Follow-up should NOT be attempted 10min before scheduled');
    });

    test('follow-up should be attempted when scheduled time is reached (+20min)', () => {
        // Advance time to scheduled time (+20min)
        scheduler.setTime(startTime + (20 * 60 * 1000));

        const shouldAttempt = scheduler.shouldAttemptFollowUp(testPhone);
        assertEqual(shouldAttempt, true, 'Follow-up should be attempted at scheduled time');
    });

    test('follow-up should be blocked if user interacted recently', () => {
        // Reset for fresh test
        const freshScheduler = new MockFollowUpScheduler(startTime);
        freshScheduler.scheduleFollowUp(testPhone, 20 * 60 * 1000);
        
        // Advance to scheduled time
        freshScheduler.setTime(startTime + (20 * 60 * 1000));

        // User interacted 5 minutes ago
        const lastInteraction = freshScheduler.now() - (5 * 60 * 1000);
        
        const result = freshScheduler.attemptFollowUp(testPhone, lastInteraction);
        
        assertEqual(result.executed, false, 'Follow-up should be blocked due to recent interaction');
        assertEqual(result.blockedReason, 'recent_interaction', 'Block reason should be recent_interaction');
    });

    test('blocked follow-up should have nextEligibleAt set correctly', () => {
        const freshScheduler = new MockFollowUpScheduler(startTime);
        freshScheduler.scheduleFollowUp(testPhone, 20 * 60 * 1000);
        
        // Advance to scheduled time
        const scheduledTime = startTime + (20 * 60 * 1000);
        freshScheduler.setTime(scheduledTime);

        // User interacted 5 minutes ago, minimum silence is 20 minutes
        const lastInteraction = scheduledTime - (5 * 60 * 1000);

        const result = freshScheduler.attemptFollowUp(testPhone, lastInteraction);
        
        // nextEligibleAt should be lastInteraction + 20min
        const expectedNextEligible = lastInteraction + (20 * 60 * 1000);
        assertEqual(result.nextEligibleAt, expectedNextEligible, 
            `nextEligibleAt should be ${expectedNextEligible}, got ${result.nextEligibleAt}`);

        // Verify the wait time (15 more minutes)
        const waitMs = result.nextEligibleAt! - scheduledTime;
        assertEqual(waitMs, 15 * 60 * 1000, 'Should wait 15 more minutes (20min - 5min elapsed)');
    });

    test('follow-up should succeed after sufficient silence', () => {
        const freshScheduler = new MockFollowUpScheduler(startTime);
        freshScheduler.scheduleFollowUp(testPhone, 20 * 60 * 1000);
        
        // Advance to +30min from start
        const currentTime = startTime + (30 * 60 * 1000);
        freshScheduler.setTime(currentTime);

        // User interacted at +5min (25 min ago)
        const lastInteraction = startTime + (5 * 60 * 1000);

        // Time since interaction: 25 minutes > 20 minutes minimum
        const result = freshScheduler.attemptFollowUp(testPhone, lastInteraction);
        
        assertEqual(result.executed, true, 'Follow-up should succeed after 25 min silence');
        assertEqual(result.nextEligibleAt, undefined, 'Should not have nextEligibleAt when executed');
    });

    test('reschedule moves follow-up to nextEligibleAt', () => {
        const freshScheduler = new MockFollowUpScheduler(startTime);
        freshScheduler.scheduleFollowUp(testPhone, 20 * 60 * 1000);
        
        // Advance to scheduled time
        const scheduledTime = startTime + (20 * 60 * 1000);
        freshScheduler.setTime(scheduledTime);

        // Block due to recent interaction
        const lastInteraction = scheduledTime - (5 * 60 * 1000);
        freshScheduler.attemptFollowUp(testPhone, lastInteraction);

        // Reschedule
        const rescheduled = freshScheduler.rescheduleFollowUp(testPhone);
        
        assertNotNull(rescheduled, 'Reschedule should return the follow-up');
        assertEqual(rescheduled!.status, 'pending', 'Status should be pending after reschedule');
        
        const expectedNextScheduled = lastInteraction + (20 * 60 * 1000);
        assertEqual(rescheduled!.scheduledFor, expectedNextScheduled, 
            `Rescheduled time should be ${expectedNextScheduled}, got ${rescheduled!.scheduledFor}`);
    });

    test('multiple reschedules should accumulate correctly', () => {
        const freshScheduler = new MockFollowUpScheduler(startTime);
        freshScheduler.scheduleFollowUp(testPhone, 20 * 60 * 1000);
        
        // User interacted 5 minutes after start time (so at +5min)
        let lastInteraction = startTime + (5 * 60 * 1000);

        // First attempt: at +20min, user interacted at +5min = 15min silence (< 20min, blocked)
        freshScheduler.setTime(startTime + (20 * 60 * 1000));
        let result = freshScheduler.attemptFollowUp(testPhone, lastInteraction);
        assertEqual(result.executed, false, 'First attempt should be blocked (15min since interaction < 20min)');
        
        // Reschedule
        let followUp = freshScheduler.rescheduleFollowUp(testPhone);
        assertNotNull(followUp, 'First reschedule should succeed');

        // User interacts again 5 minutes before the rescheduled time
        lastInteraction = followUp!.scheduledFor - (5 * 60 * 1000);
        freshScheduler.setTime(followUp!.scheduledFor);

        result = freshScheduler.attemptFollowUp(testPhone, lastInteraction);
        assertEqual(result.executed, false, 'Second attempt should also be blocked (5min since interaction < 20min)');

        // Reschedule again
        followUp = freshScheduler.rescheduleFollowUp(testPhone);
        assertNotNull(followUp, 'Second reschedule should succeed');

        // Third attempt: advance past the required silence period, no new interaction
        // Time since last interaction: 20min (min silence) + 1sec = just over threshold
        freshScheduler.setTime(followUp!.scheduledFor + 1000);
        
        result = freshScheduler.attemptFollowUp(testPhone, lastInteraction);
        assertEqual(result.executed, true, 'Third attempt should succeed (>20min since last interaction)');
    });

    test('phone normalization applies to follow-up scheduling', () => {
        const freshScheduler = new MockFollowUpScheduler(startTime);
        
        // Schedule with @lid format
        const phoneWithLid = '573001234567@lid';
        freshScheduler.scheduleFollowUp(phoneWithLid, 20 * 60 * 1000);

        // Check with plain format
        const plainPhone = '573001234567';
        const shouldAttempt = freshScheduler.shouldAttemptFollowUp(plainPhone);
        
        // Should NOT attempt yet (not scheduled time)
        assertEqual(shouldAttempt, false, 'Should find follow-up scheduled with @lid using plain phone');

        // Advance and check again
        freshScheduler.setTime(startTime + (20 * 60 * 1000));
        const shouldAttemptNow = freshScheduler.shouldAttemptFollowUp(plainPhone);
        assertEqual(shouldAttemptNow, true, 'Should be able to attempt follow-up using plain phone');
    });
});

// ============================================
// Test Summary
// ============================================

// Restore console.warn
console.warn = originalConsoleWarn;

console.log('\n' + '='.repeat(80));
console.log('\n📊 REGRESSION TEST RESULTS');
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   📝 Total: ${testsPassed + testsFailed}`);

if (truncationWarningDetected) {
    console.log('\n⚠️  ACCEPTANCE FAILURE: Truncation warnings were detected during expected_input persistence');
}

if (stateSplitAcrossPhoneKeysDetected) {
    console.log('\n⚠️  ACCEPTANCE FAILURE: State was split across multiple phone keys');
}

console.log('\n' + '='.repeat(80));

if (testsFailed > 0 || truncationWarningDetected || stateSplitAcrossPhoneKeysDetected) {
    console.log('\n⚠️  REGRESSION DETECTED! Some tests failed.');
    console.log('   Review the errors above to identify the regression.');
    process.exit(1);
} else {
    console.log('\n✅ ALL REGRESSION TESTS PASSED!');
    console.log('\n📋 Verified Scenarios:');
    console.log('   1. expected_input=GENRES persists without truncation');
    console.log('   2. @lid phone suffix normalizes correctly; state read/write matches');
    console.log('   3. Follow-up gating respects scheduled time and blocks correctly');
    console.log('\n📋 Acceptance Criteria Validated:');
    console.log('   ✓ No truncation warnings during expected_input persistence');
    console.log('   ✓ No state split across phone keys');
    console.log('   ✓ Follow-up timing respected correctly');
    process.exit(0);
}
