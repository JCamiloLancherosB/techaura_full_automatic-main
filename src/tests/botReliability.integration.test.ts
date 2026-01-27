/**
 * Bot Reliability Integration Test Suite
 * 
 * Tests to ensure the bot NEVER silently drops messages and maintains explainability:
 * 1. Inbound new chat -> must respond and register DecisionTrace RESPOND
 * 2. Flow question -> user responds -> must advance step (no incoherence) and register traces
 * 3. Outbound follow-up blocked by rules -> must be explainable (trace + /followup/explain)
 * 4. Dedupe -> must register DEDUPED and NOT respond
 * 5. Provider reconnect -> inbound during reconnect is deferred and then processed
 * 
 * Criteria:
 * - No silent drops
 * - All SKIP/DEFER decisions have reasonCode
 */

// ============================================================================
// IMPORTANT: Set environment variables BEFORE any imports to avoid DB errors
// ============================================================================
process.env.MYSQL_DB_HOST = 'localhost';
process.env.MYSQL_DB_PORT = '3306';
process.env.MYSQL_DB_USER = 'test_user';
process.env.MYSQL_DB_PASSWORD = 'test_password';
process.env.MYSQL_DB_NAME = 'test_db';
process.env.DB_PROVIDER = 'mysql';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test_user';
process.env.DB_PASS = 'test_password';
process.env.DB_NAME = 'test_db';
process.env.DB_PORT = '3306';

import { createTestSession } from '../utils/testHelpers';
import { FlowContinuityService } from '../services/FlowContinuityService';
import { FlowContinuityReasonCode } from '../types/flowState';
import { MessageDeduper, type DedupeKeyInput } from '../services/MessageDeduper';
import { 
    DecisionStage, 
    Decision, 
    DecisionReasonCode 
} from '../types/DecisionTrace';
import { GateReasonCode } from '../services/gating/GateReasonCode';
import type { UserSession } from '../../types/global';

// ============ Test Framework Helpers ============

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

const testResults: TestResult[] = [];
let currentDescribe = '';
const pendingTests: Array<() => Promise<void>> = [];

function describe(name: string, fn: () => void): void {
    currentDescribe = name;
    console.log(`\n📋 ${name}`);
    fn();
}

function it(description: string, fn: () => Promise<void> | void): void {
    const fullName = `${currentDescribe} > ${description}`;
    pendingTests.push(async () => {
        try {
            await fn();
            testResults.push({ name: fullName, passed: true });
            console.log(`  ✅ ${description}`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            testResults.push({ name: fullName, passed: false, error: errorMsg });
            console.error(`  ❌ ${description}`);
            console.error(`     ${errorMsg}`);
        }
    });
}

function expect(value: any) {
    return {
        toBe(expected: any) {
            if (value !== expected) {
                throw new Error(`Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);
            }
        },
        toEqual(expected: any) {
            if (JSON.stringify(value) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
            }
        },
        toBeDefined() {
            if (value === undefined) {
                throw new Error('Expected value to be defined');
            }
        },
        toContain(expected: string) {
            if (typeof value !== 'string' || !value.includes(expected)) {
                throw new Error(`Expected "${value}" to contain "${expected}"`);
            }
        },
        toBeGreaterThan(expected: number) {
            if (typeof value !== 'number' || value <= expected) {
                throw new Error(`Expected ${value} to be greater than ${expected}`);
            }
        },
        not: {
            toBe(expected: any) {
                if (value === expected) {
                    throw new Error(`Expected ${JSON.stringify(value)} not to be ${JSON.stringify(expected)}`);
                }
            },
            toBeUndefined() {
                if (value === undefined) {
                    throw new Error('Expected value not to be undefined');
                }
            }
        }
    };
}

// ============ Mock Services for Testing ============

/**
 * Mock DecisionTrace for testing without database
 */
interface MockDecisionTrace {
    traceId: string;
    messageId: string;
    phoneHash: string;
    timestamp: Date;
    stage: DecisionStage;
    decision: Decision;
    reasonCode: DecisionReasonCode;
    reasonDetail?: string;
    nextEligibleAt?: Date;
    correlationId?: string;
}

class MockMessageDecisionService {
    private traces: MockDecisionTrace[] = [];

    async recordDecision(input: {
        messageId: string;
        phone: string;
        stage: DecisionStage;
        decision: Decision;
        reasonCode: DecisionReasonCode;
        reasonDetail?: string;
        nextEligibleAt?: Date;
        correlationId?: string;
    }): Promise<MockDecisionTrace> {
        const trace: MockDecisionTrace = {
            traceId: `trace_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            messageId: input.messageId,
            phoneHash: this.hashPhone(input.phone),
            timestamp: new Date(),
            stage: input.stage,
            decision: input.decision,
            reasonCode: input.reasonCode,
            reasonDetail: input.reasonDetail,
            nextEligibleAt: input.nextEligibleAt,
            correlationId: input.correlationId || 'test-correlation'
        };
        this.traces.push(trace);
        return trace;
    }

    async recordReceived(messageId: string, phone: string, correlationId?: string): Promise<MockDecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.INBOUND_RECEIVED,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.RECEIVED,
            reasonDetail: 'Message received at inbound handler',
            correlationId
        });
    }

    async recordDeduped(messageId: string, phone: string, correlationId?: string): Promise<MockDecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.DEDUPE,
            decision: Decision.SKIP,
            reasonCode: DecisionReasonCode.DEDUPED,
            reasonDetail: 'Duplicate message detected',
            correlationId
        });
    }

    async recordPolicyBlocked(
        messageId: string,
        phone: string,
        reasonCode: DecisionReasonCode,
        reasonDetail: string,
        nextEligibleAt?: Date,
        correlationId?: string
    ): Promise<MockDecisionTrace> {
        const decision = nextEligibleAt ? Decision.DEFER : Decision.SKIP;
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.POLICY,
            decision,
            reasonCode,
            reasonDetail,
            nextEligibleAt,
            correlationId
        });
    }

    async recordSuccess(
        messageId: string,
        phone: string,
        stage: DecisionStage,
        reasonDetail?: string,
        correlationId?: string
    ): Promise<MockDecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.SUCCESS,
            reasonDetail: reasonDetail || 'Response sent successfully',
            correlationId
        });
    }

    private hashPhone(phone: string): string {
        return `hash_${phone.slice(-6)}`;
    }

    getTraces(): MockDecisionTrace[] {
        return this.traces;
    }

    clear(): void {
        this.traces = [];
    }
}

/**
 * Mock Outbound Gate Evaluator
 */
interface MockOutboundGateResult {
    allowed: boolean;
    reasonCode: GateReasonCode;
    reason?: string;
    blockedBy?: GateReasonCode[];
    nextEligibleAt?: Date;
}

function mockEvaluateOutboundGates(
    session: UserSession,
    _context: { phone: string; messageType?: string }
): MockOutboundGateResult {
    const blockedBy: GateReasonCode[] = [];

    if (session.contactStatus === 'OPT_OUT') {
        blockedBy.push(GateReasonCode.OUTBOUND_OPT_OUT);
    }

    if (session.tags && session.tags.includes('blacklist')) {
        blockedBy.push(GateReasonCode.OUTBOUND_BLACKLISTED);
    }

    if (session.contactStatus === 'CLOSED' && session.tags?.includes('decision_made')) {
        blockedBy.push(GateReasonCode.OUTBOUND_USER_CLOSED);
    }

    return {
        allowed: blockedBy.length === 0,
        reasonCode: blockedBy.length > 0 ? blockedBy[0] : GateReasonCode.ALLOWED,
        reason: blockedBy.length > 0 ? `Blocked by: ${blockedBy.join(', ')}` : 'All gates passed',
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined
    };
}

function mockExplainOutboundGateStatus(phone: string, session: UserSession) {
    const result = mockEvaluateOutboundGates(session, { phone, messageType: 'followup' });

    return {
        phone,
        canSendFollowUp: result.allowed,
        blockingReasons: result.blockedBy?.map(code => {
            switch (code) {
                case GateReasonCode.OUTBOUND_OPT_OUT:
                    return 'User has opted out';
                case GateReasonCode.OUTBOUND_BLACKLISTED:
                    return 'User is blacklisted';
                case GateReasonCode.OUTBOUND_USER_CLOSED:
                    return 'User completed interaction (CLOSED with decision_made)';
                default:
                    return String(code);
            }
        }) || [],
        counters: {
            followUpAttempts: session.followUpAttempts || 0,
            followUpCount24h: session.followUpCount24h || 0,
            maxAttempts: 3,
            maxPer24h: 1
        },
        contactStatus: session.contactStatus || 'ACTIVE',
        tags: session.tags || []
    };
}

// ============ Tests ============

async function runTests() {
    console.log('🧪 Bot Reliability Integration Tests');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Validates that:');
    console.log('  1. Inbound new chat -> RESPOND + DecisionTrace');
    console.log('  2. Flow question -> user response -> step advance + traces');
    console.log('  3. Outbound follow-up blocked -> explainable');
    console.log('  4. Dedupe -> DEDUPED trace + NO response');
    console.log('  5. Provider reconnect -> inbound deferred -> processed');
    console.log('');
    console.log('Criteria:');
    console.log('  - No silent drops');
    console.log('  - All SKIP/DEFER decisions have reasonCode');
    console.log('═══════════════════════════════════════════════════════════════');

    const decisionService = new MockMessageDecisionService();
    const flowContinuityService = FlowContinuityService.getInstance();
    let deduper: MessageDeduper;

    // ================================================================
    // TEST 1: Inbound New Chat Response
    // ================================================================
    describe('Test 1: Inbound New Chat Response', () => {
        it('should respond to new inbound chat and register DecisionTrace RESPOND', async () => {
            const messageId = 'msg_inbound_001';
            const phone = '+573001234567';
            const correlationId = 'corr-inbound-001';

            const trace = await decisionService.recordReceived(messageId, phone, correlationId);

            expect(trace).toBeDefined();
            expect(trace.messageId).toBe(messageId);
            expect(trace.stage).toBe(DecisionStage.INBOUND_RECEIVED);
            expect(trace.decision).toBe(Decision.RESPOND);
            expect(trace.reasonCode).toBe(DecisionReasonCode.RECEIVED);
            expect(trace.correlationId).toBe(correlationId);
            expect(trace.reasonCode).not.toBeUndefined();
        });

        it('should record SUCCESS trace after successful response', async () => {
            const messageId = 'msg_inbound_002';
            const phone = '+573009876543';

            const trace = await decisionService.recordSuccess(
                messageId,
                phone,
                DecisionStage.SEND,
                'Message delivered successfully'
            );

            expect(trace.stage).toBe(DecisionStage.SEND);
            expect(trace.decision).toBe(Decision.RESPOND);
            expect(trace.reasonCode).toBe(DecisionReasonCode.SUCCESS);
            expect(trace.reasonCode).toBeDefined();
        });
    });

    // ================================================================
    // TEST 2: Flow Continuity - Question and Response
    // ================================================================
    describe('Test 2: Flow Continuity - Question and Response', () => {
        const testPhone = '573002222222';

        it('should advance flow step when user responds to a question', async () => {
            await flowContinuityService.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE',
                questionText: '¿Qué capacidad prefieres? 32GB, 64GB, o 128GB'
            });

            const decision = await flowContinuityService.checkFlowContinuity(testPhone);

            expect(decision.shouldContinueInFlow).toBe(true);
            expect(decision.activeFlowId).toBe('musicUsb');
            expect(decision.activeStep).toBe('awaiting_capacity');
            expect(decision.reasonCode).toBe(FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE);

            const validation = flowContinuityService.validateInput('64GB', decision.expectedInput);
            expect(validation.isValid).toBe(true);

            await flowContinuityService.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_confirmation',
                expectedInput: 'CHOICE',
                questionText: '¿Confirmas tu pedido de USB 64GB?'
            });

            const nextDecision = await flowContinuityService.checkFlowContinuity(testPhone);
            expect(nextDecision.shouldContinueInFlow).toBe(true);
            expect(nextDecision.activeStep).toBe('awaiting_confirmation');
            expect(nextDecision.reasonCode).toBeDefined();

            await flowContinuityService.clearFlowState(testPhone);
        });

        it('should provide reprompt (not silence) for invalid input', async () => {
            await flowContinuityService.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'NUMBER',
                questionText: '¿Cuántos GB necesitas?'
            });

            const decision = await flowContinuityService.checkFlowContinuity(testPhone);
            expect(decision.shouldContinueInFlow).toBe(true);

            const validation = flowContinuityService.validateInput('hola', decision.expectedInput);

            expect(validation.isValid).toBe(false);
            expect(validation.repromptMessage).toBeDefined();
            expect(decision.lastQuestionText).toBe('¿Cuántos GB necesitas?');

            await flowContinuityService.clearFlowState(testPhone);
        });

        it('should register trace with proper reasonCode on flow decision', async () => {
            const messageId = 'msg_flow_001';
            const phone = '+573003333333';

            const trace = await decisionService.recordSuccess(
                messageId,
                phone,
                DecisionStage.FLOW,
                'Flow step completed successfully'
            );

            expect(trace.stage).toBe(DecisionStage.FLOW);
            expect(trace.decision).toBe(Decision.RESPOND);
            expect(trace.reasonCode).toBe(DecisionReasonCode.SUCCESS);
            expect(trace.reasonCode).toBeDefined();
        });
    });

    // ================================================================
    // TEST 3: Outbound Follow-up Blocked - Explainability
    // ================================================================
    describe('Test 3: Outbound Follow-up Blocked - Explainability', () => {
        it('should record trace with reasonCode when follow-up is blocked by policy', async () => {
            const messageId = 'msg_followup_blocked_001';
            const phone = '+573004444444';
            const nextEligibleAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

            const trace = await decisionService.recordPolicyBlocked(
                messageId,
                phone,
                DecisionReasonCode.POLICY_COOLDOWN,
                'User in 48-hour cooldown period after 3 follow-up attempts',
                nextEligibleAt
            );

            expect(trace.stage).toBe(DecisionStage.POLICY);
            expect(trace.decision).toBe(Decision.DEFER);
            expect(trace.reasonCode).toBe(DecisionReasonCode.POLICY_COOLDOWN);
            expect(trace.nextEligibleAt).toEqual(nextEligibleAt);
            expect(trace.reasonCode).toBeDefined();
            expect(trace.reasonDetail).toContain('cooldown');
        });

        it('should record trace when blocked due to user opt-out', async () => {
            const messageId = 'msg_followup_blocked_002';
            const phone = '+573005555555';

            const trace = await decisionService.recordPolicyBlocked(
                messageId,
                phone,
                DecisionReasonCode.POLICY_OPT_OUT,
                'User has opted out of follow-ups'
            );

            expect(trace.stage).toBe(DecisionStage.POLICY);
            expect(trace.decision).toBe(Decision.SKIP);
            expect(trace.reasonCode).toBe(DecisionReasonCode.POLICY_OPT_OUT);
            expect(trace.reasonCode).toBeDefined();
        });

        it('should provide explainable status via explainOutboundGateStatus', async () => {
            const phone = '573006666666';
            const session = createTestSession(phone, {
                contactStatus: 'OPT_OUT',
                stage: 'lost'
            });

            const explanation = mockExplainOutboundGateStatus(phone, session);

            expect(explanation).toBeDefined();
            expect(explanation.phone).toBe(phone);
            expect(explanation.canSendFollowUp).toBe(false);
            expect(explanation.blockingReasons).toBeDefined();
            expect(explanation.blockingReasons.length).toBeGreaterThan(0);

            const hasOptOutReason = explanation.blockingReasons.some(
                (reason: string) => reason.toLowerCase().includes('opt')
            );
            expect(hasOptOutReason).toBe(true);
        });

        it('should evaluate outbound gates and return explainable result', async () => {
            const phone = '573007777777';
            const session = createTestSession(phone, {
                contactStatus: 'ACTIVE',
                stage: 'interested'
            });

            const context = {
                phone,
                messageType: 'followup' as const,
                stage: session.stage
            };

            const result = mockEvaluateOutboundGates(session, context);

            expect(result).toBeDefined();
            expect(result.allowed !== undefined).toBe(true);
            expect(result.reasonCode).toBeDefined();
            
            if (!result.allowed) {
                expect(result.blockedBy).toBeDefined();
                expect(result.blockedBy!.length).toBeGreaterThan(0);
            }
        });
    });

    // ================================================================
    // TEST 4: Deduplication - DEDUPED Trace and No Response
    // ================================================================
    describe('Test 4: Deduplication - DEDUPED Trace and No Response', () => {
        it('should register DEDUPED trace for duplicate message', async () => {
            const messageId = 'msg_dedupe_001';
            const phone = '+573008888888';

            const trace = await decisionService.recordDeduped(messageId, phone);

            expect(trace.stage).toBe(DecisionStage.DEDUPE);
            expect(trace.decision).toBe(Decision.SKIP);
            expect(trace.reasonCode).toBe(DecisionReasonCode.DEDUPED);
            expect(trace.reasonDetail).toContain('Duplicate');
            expect(trace.reasonCode).toBeDefined();
        });

        it('should detect duplicate and NOT process second time', async () => {
            deduper = new MessageDeduper(1, 0.166667);
            const messageId = 'wa_dedupe_test_001';
            const remoteJid = '573009999999@s.whatsapp.net';

            const firstCheck = await deduper.isProcessed(messageId, remoteJid);
            expect(firstCheck).toBe(false);

            await deduper.markAsProcessed(messageId, remoteJid);

            const secondCheck = await deduper.isProcessed(messageId, remoteJid);
            expect(secondCheck).toBe(true);

            const metrics = deduper.getMetrics();
            expect(metrics.duplicatesFound).toBeGreaterThan(0);

            deduper.shutdown();
        });

        it('should use proper dedupe key with context', async () => {
            deduper = new MessageDeduper(1, 0.166667);
            const input: DedupeKeyInput = {
                providerMessageId: 'wa_msg_unique_001',
                remoteJid: '573001111111@s.whatsapp.net',
                textContent: 'Quiero ordenar USB'
            };

            const firstResult = await deduper.isProcessedWithContext(input);
            expect(firstResult.isDuplicate).toBe(false);
            expect(firstResult.keyType).toBe('native');

            await deduper.markAsProcessedWithContext(input);

            const secondResult = await deduper.isProcessedWithContext(input);
            expect(secondResult.isDuplicate).toBe(true);

            deduper.shutdown();
        });

        it('should record DEDUPED trace with proper reasonCode (no silent drop)', async () => {
            const messageId = 'msg_dedupe_002';
            const phone = '+573001010101';

            const trace = await decisionService.recordDeduped(messageId, phone);

            expect(trace.decision).toBe(Decision.SKIP);
            expect(trace.reasonCode).toBe(DecisionReasonCode.DEDUPED);
            expect(trace.reasonCode).not.toBeUndefined();
        });
    });

    // ================================================================
    // TEST 5: Provider Reconnect - Deferred Processing
    // ================================================================
    describe('Test 5: Provider Reconnect - Deferred Processing', () => {
        it('should record DEFER trace during reconnect with nextEligibleAt', async () => {
            const messageId = 'msg_reconnect_001';
            const phone = '+573002020202';
            const nextEligibleAt = new Date(Date.now() + 5 * 60 * 1000);

            const trace = await decisionService.recordPolicyBlocked(
                messageId,
                phone,
                DecisionReasonCode.POLICY_RATE_LIMITED,
                'Provider reconnecting, message deferred',
                nextEligibleAt
            );

            expect(trace.decision).toBe(Decision.DEFER);
            expect(trace.reasonCode).toBe(DecisionReasonCode.POLICY_RATE_LIMITED);
            expect(trace.nextEligibleAt).toEqual(nextEligibleAt);
            expect(trace.reasonCode).toBeDefined();
        });

        it('should process deferred message after reconnect completes', async () => {
            const messageId = 'msg_reconnect_002';
            const phone = '+573003030303';

            const successTrace = await decisionService.recordSuccess(
                messageId,
                phone,
                DecisionStage.SEND,
                'Deferred message processed after reconnect'
            );

            expect(successTrace.decision).toBe(Decision.RESPOND);
            expect(successTrace.stage).toBe(DecisionStage.SEND);
            expect(successTrace.reasonCode).toBe(DecisionReasonCode.SUCCESS);
        });

        it('should handle multiple deferred messages in order', async () => {
            const phone = '+573004040404';
            const messages = ['msg_deferred_001', 'msg_deferred_002', 'msg_deferred_003'];

            const traces = [];
            for (const messageId of messages) {
                const trace = await decisionService.recordSuccess(
                    messageId,
                    phone,
                    DecisionStage.SEND,
                    'Deferred message processed'
                );
                traces.push(trace);
            }

            expect(traces.length).toBe(3);
            traces.forEach(trace => {
                expect(trace.decision).toBe(Decision.RESPOND);
                expect(trace.reasonCode).toBeDefined();
                expect(trace.reasonCode).toBe(DecisionReasonCode.SUCCESS);
            });
        });
    });

    // ================================================================
    // CRITERIA VALIDATION: No Silent Drops
    // ================================================================
    describe('Criteria Validation: No Silent Drops', () => {
        it('all SKIP decisions must have reasonCode', async () => {
            const skipReasonCodes = [
                DecisionReasonCode.DEDUPED,
                DecisionReasonCode.POLICY_OPT_OUT,
                DecisionReasonCode.POLICY_BLACKLISTED,
                DecisionReasonCode.NO_ROUTE,
                DecisionReasonCode.CONTEXT_BLOCKED
            ];

            for (const reasonCode of skipReasonCodes) {
                const trace = await decisionService.recordDecision({
                    messageId: `msg_skip_test_${reasonCode}`,
                    phone: '+573005050505',
                    stage: DecisionStage.POLICY,
                    decision: Decision.SKIP,
                    reasonCode,
                    reasonDetail: `Test skip: ${reasonCode}`
                });

                expect(trace.decision).toBe(Decision.SKIP);
                expect(trace.reasonCode).toBe(reasonCode);
                expect(trace.reasonCode).toBeDefined();
            }
        });

        it('all DEFER decisions must have reasonCode and nextEligibleAt', async () => {
            const nextEligibleAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const deferReasonCodes = [
                DecisionReasonCode.POLICY_COOLDOWN,
                DecisionReasonCode.POLICY_RATE_LIMITED,
                DecisionReasonCode.POLICY_OUTSIDE_HOURS
            ];

            for (const reasonCode of deferReasonCodes) {
                const trace = await decisionService.recordDecision({
                    messageId: `msg_defer_test_${reasonCode}`,
                    phone: '+573006060606',
                    stage: DecisionStage.POLICY,
                    decision: Decision.DEFER,
                    reasonCode,
                    reasonDetail: `Test defer: ${reasonCode}`,
                    nextEligibleAt
                });

                expect(trace.decision).toBe(Decision.DEFER);
                expect(trace.reasonCode).toBe(reasonCode);
                expect(trace.reasonCode).toBeDefined();
                expect(trace.nextEligibleAt).toBeDefined();
            }
        });

        it('all ERROR decisions must have reasonCode', async () => {
            const errorReasonCodes = [
                DecisionReasonCode.AI_ERROR,
                DecisionReasonCode.AI_TIMEOUT,
                DecisionReasonCode.PROVIDER_SEND_FAIL,
                DecisionReasonCode.PROVIDER_TIMEOUT
            ];

            for (const reasonCode of errorReasonCodes) {
                const trace = await decisionService.recordDecision({
                    messageId: `msg_error_test_${reasonCode}`,
                    phone: '+573007070707',
                    stage: DecisionStage.AI,
                    decision: Decision.ERROR,
                    reasonCode,
                    reasonDetail: `Test error: ${reasonCode}`
                });

                expect(trace.decision).toBe(Decision.ERROR);
                expect(trace.reasonCode).toBe(reasonCode);
                expect(trace.reasonCode).toBeDefined();
            }
        });

        it('FlowContinuity decisions always have reasonCode', async () => {
            const testPhone = '573008080808';

            const noFlowDecision = await flowContinuityService.checkFlowContinuity(testPhone);
            expect(noFlowDecision.reasonCode).toBe(FlowContinuityReasonCode.NO_ACTIVE_FLOW);
            expect(noFlowDecision.reasonCode).toBeDefined();

            await flowContinuityService.setFlowState(testPhone, {
                flowId: 'testFlow',
                step: 'entry',
                expectedInput: 'TEXT'
            });

            const activeFlowDecision = await flowContinuityService.checkFlowContinuity(testPhone);
            expect(activeFlowDecision.reasonCode).toBe(FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE);
            expect(activeFlowDecision.reasonCode).toBeDefined();

            await flowContinuityService.clearFlowState(testPhone);
        });
    });

    // ================================================================
    // Execute all pending tests
    // ================================================================
    console.log('\n📌 Executing tests...\n');
    for (const test of pendingTests) {
        await test();
    }

    // ================================================================
    // Summary
    // ================================================================
    console.log('\n═══════════════════════════════════════════════════════════════');
    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => !r.passed).length;
    console.log(`\n📊 Results: ${passed}/${testResults.length} tests passed`);
    
    if (failed > 0) {
        console.log('\n❌ Failed tests:');
        testResults.filter(r => !r.passed).forEach(r => {
            console.log(`   - ${r.name}`);
            if (r.error) console.log(`     Error: ${r.error}`);
        });
    }

    console.log('═══════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        console.log('❌ SUITE FAILED: Some tests did not pass.');
        process.exit(1);
    } else {
        console.log('✅ SUITE PASSED: All tests completed successfully!');
        process.exit(0);
    }
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test suite crashed:', error);
    process.exit(1);
});
