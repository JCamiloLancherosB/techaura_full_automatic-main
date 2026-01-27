/**
 * Unit tests for Message Decision Trace feature
 * 
 * Tests the core decision trace functionality including:
 * - DEDUPED: Duplicate message detection
 * - POLICY_BLOCKED: Policy engine blocks
 * - NO_ROUTE: Router fails to find handler
 * - AI_ERROR: AI processing failures with/without fallback
 */

import { 
    MessageDecisionService, 
    DecisionStage, 
    Decision, 
    DecisionReasonCode 
} from '../services/MessageDecisionService';
import { hashPhone } from '../utils/phoneHasher';

// Mock the repository to avoid database dependency
const mockRepository = {
    create: jest.fn().mockResolvedValue(1),
    createBatch: jest.fn().mockResolvedValue(undefined),
    getByTraceId: jest.fn().mockResolvedValue(null),
    getByMessageId: jest.fn().mockResolvedValue([]),
    getByPhoneHash: jest.fn().mockResolvedValue([]),
    findByFilter: jest.fn().mockResolvedValue([]),
    findByFilterPaginated: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        perPage: 50,
        totalPages: 0
    }),
    getDecisionSummary: jest.fn().mockResolvedValue([]),
    getReasonCodeSummary: jest.fn().mockResolvedValue([]),
    deleteOlderThan: jest.fn().mockResolvedValue(0)
};

// Mock the structured logger
jest.mock('../utils/structuredLogger', () => ({
    structuredLogger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

// Mock the correlation ID manager
jest.mock('../services/CorrelationIdManager', () => ({
    getCorrelationId: jest.fn().mockReturnValue('test-correlation-123')
}));

// Mock the repository
jest.mock('../repositories/MessageDecisionRepository', () => ({
    messageDecisionRepository: mockRepository
}));

describe('MessageDecisionService', () => {
    let service: MessageDecisionService;
    
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        service = MessageDecisionService.getInstance();
    });

    describe('recordDeduped', () => {
        it('should record a DEDUPED decision trace', async () => {
            const messageId = 'msg_dedup_001';
            const phone = '+573001234567';
            const correlationId = 'corr-123';

            const trace = await service.recordDeduped(messageId, phone, correlationId);

            expect(trace).toBeDefined();
            expect(trace.messageId).toBe(messageId);
            expect(trace.phoneHash).toBe(hashPhone(phone));
            expect(trace.stage).toBe(DecisionStage.DEDUPE);
            expect(trace.decision).toBe(Decision.SKIP);
            expect(trace.reasonCode).toBe(DecisionReasonCode.DEDUPED);
            expect(trace.reasonDetail).toContain('Duplicate');
            expect(trace.correlationId).toBe(correlationId);

            // Verify repository was called
            expect(mockRepository.create).toHaveBeenCalledTimes(1);
        });

        it('should hash phone number to prevent PII storage', async () => {
            const messageId = 'msg_dedup_002';
            const phone = '+573009876543';

            const trace = await service.recordDeduped(messageId, phone);

            // Phone should be hashed
            expect(trace.phoneHash).toBe(hashPhone(phone));
            expect(trace.phoneHash).not.toBe(phone);
            expect(trace.phoneHash.length).toBe(16); // SHA256 truncated to 16 chars
        });
    });

    describe('recordPolicyBlocked', () => {
        it('should record a POLICY_BLOCKED decision for opted-out user', async () => {
            const messageId = 'msg_policy_001';
            const phone = '+573001234567';

            const trace = await service.recordPolicyBlocked(
                messageId,
                phone,
                DecisionReasonCode.POLICY_OPT_OUT,
                'User has opted out'
            );

            expect(trace).toBeDefined();
            expect(trace.stage).toBe(DecisionStage.POLICY);
            expect(trace.decision).toBe(Decision.SKIP);
            expect(trace.reasonCode).toBe(DecisionReasonCode.POLICY_OPT_OUT);
            expect(trace.reasonDetail).toContain('opted out');
        });

        it('should record a DEFER decision with nextEligibleAt for cooldown', async () => {
            const messageId = 'msg_policy_002';
            const phone = '+573001234567';
            const nextEligibleAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

            const trace = await service.recordPolicyBlocked(
                messageId,
                phone,
                DecisionReasonCode.POLICY_COOLDOWN,
                'User in cooldown',
                nextEligibleAt
            );

            expect(trace.decision).toBe(Decision.DEFER);
            expect(trace.reasonCode).toBe(DecisionReasonCode.POLICY_COOLDOWN);
            expect(trace.nextEligibleAt).toEqual(nextEligibleAt);
        });

        it('should record SKIP decision for blacklisted user', async () => {
            const messageId = 'msg_policy_003';
            const phone = '+573001234567';

            const trace = await service.recordPolicyBlocked(
                messageId,
                phone,
                DecisionReasonCode.POLICY_BLACKLISTED,
                'User is blacklisted'
            );

            expect(trace.decision).toBe(Decision.SKIP);
            expect(trace.reasonCode).toBe(DecisionReasonCode.POLICY_BLACKLISTED);
        });
    });

    describe('recordNoRoute', () => {
        it('should record a NO_ROUTE decision trace', async () => {
            const messageId = 'msg_router_001';
            const phone = '+573001234567';
            const reason = 'No matching flow for intent';

            const trace = await service.recordNoRoute(messageId, phone, reason);

            expect(trace).toBeDefined();
            expect(trace.stage).toBe(DecisionStage.ROUTER);
            expect(trace.decision).toBe(Decision.SKIP);
            expect(trace.reasonCode).toBe(DecisionReasonCode.NO_ROUTE);
            expect(trace.reasonDetail).toContain('No matching');
        });
    });

    describe('recordAIError', () => {
        it('should record AI_ERROR without fallback', async () => {
            const messageId = 'msg_ai_001';
            const phone = '+573001234567';
            const errorDetail = 'AI service timeout';

            const trace = await service.recordAIError(messageId, phone, errorDetail, false);

            expect(trace).toBeDefined();
            expect(trace.stage).toBe(DecisionStage.AI);
            expect(trace.decision).toBe(Decision.ERROR);
            expect(trace.reasonCode).toBe(DecisionReasonCode.AI_ERROR);
            expect(trace.reasonDetail).toContain('AI error');
        });

        it('should record AI_FALLBACK when fallback is used', async () => {
            const messageId = 'msg_ai_002';
            const phone = '+573001234567';
            const errorDetail = 'Primary AI unavailable, using fallback';

            const trace = await service.recordAIError(messageId, phone, errorDetail, true);

            expect(trace).toBeDefined();
            expect(trace.stage).toBe(DecisionStage.AI);
            expect(trace.decision).toBe(Decision.RESPOND); // Still responding via fallback
            expect(trace.reasonCode).toBe(DecisionReasonCode.AI_FALLBACK);
            expect(trace.reasonDetail).toContain('fallback');
        });
    });

    describe('recordSendFailed', () => {
        it('should record a PROVIDER_SEND_FAIL decision trace', async () => {
            const messageId = 'msg_send_001';
            const phone = '+573001234567';
            const errorDetail = 'WhatsApp API rate limited';

            const trace = await service.recordSendFailed(messageId, phone, errorDetail);

            expect(trace).toBeDefined();
            expect(trace.stage).toBe(DecisionStage.SEND);
            expect(trace.decision).toBe(Decision.ERROR);
            expect(trace.reasonCode).toBe(DecisionReasonCode.PROVIDER_SEND_FAIL);
            expect(trace.reasonDetail).toContain('rate limited');
        });
    });

    describe('recordReceived', () => {
        it('should record an INBOUND_RECEIVED decision trace', async () => {
            const messageId = 'msg_recv_001';
            const phone = '+573001234567';

            const trace = await service.recordReceived(messageId, phone);

            expect(trace).toBeDefined();
            expect(trace.stage).toBe(DecisionStage.INBOUND_RECEIVED);
            expect(trace.decision).toBe(Decision.RESPOND);
            expect(trace.reasonCode).toBe(DecisionReasonCode.RECEIVED);
        });
    });

    describe('recordSuccess', () => {
        it('should record a SUCCESS decision trace', async () => {
            const messageId = 'msg_success_001';
            const phone = '+573001234567';

            const trace = await service.recordSuccess(
                messageId, 
                phone, 
                DecisionStage.SEND, 
                'Message delivered'
            );

            expect(trace).toBeDefined();
            expect(trace.decision).toBe(Decision.RESPOND);
            expect(trace.reasonCode).toBe(DecisionReasonCode.SUCCESS);
        });
    });

    describe('PII Protection', () => {
        it('should redact phone numbers from reason details', async () => {
            const messageId = 'msg_pii_001';
            const phone = '+573001234567';
            const reasonWithPII = 'Error for user 3001234567 in flow';

            const trace = await service.recordNoRoute(messageId, phone, reasonWithPII);

            // Phone should be redacted from reason detail
            expect(trace.reasonDetail).not.toContain('3001234567');
        });

        it('should never store raw phone number', async () => {
            const messageId = 'msg_pii_002';
            const rawPhone = '+573009999999';

            const trace = await service.recordDeduped(messageId, rawPhone);

            // Verify the repository was called with hashed phone
            const createCall = mockRepository.create.mock.calls[0][0];
            expect(createCall.phone_hash).toBe(hashPhone(rawPhone));
            expect(createCall.phone_hash).not.toContain('573009999999');
        });
    });

    describe('Query methods', () => {
        it('should query decisions by phone (hashing automatically)', async () => {
            const phone = '+573001234567';
            mockRepository.getByPhoneHash.mockResolvedValueOnce([]);

            await service.getDecisionsByPhone(phone, 50);

            expect(mockRepository.getByPhoneHash).toHaveBeenCalledWith(
                hashPhone(phone),
                50
            );
        });

        it('should query decisions by message ID', async () => {
            const messageId = 'msg_query_001';
            mockRepository.getByMessageId.mockResolvedValueOnce([]);

            await service.getDecisionsByMessageId(messageId);

            expect(mockRepository.getByMessageId).toHaveBeenCalledWith(messageId);
        });

        it('should support paginated queries', async () => {
            const filter = { decision: Decision.SKIP as any };
            
            await service.queryDecisions(filter, 2, 25);

            expect(mockRepository.findByFilterPaginated).toHaveBeenCalledWith(
                filter,
                2,
                25
            );
        });
    });
});

// Simple test runner for environments without Jest
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
        not: {
            toBe(expected: any) {
                if (value === expected) {
                    throw new Error(`Expected ${JSON.stringify(value)} not to be ${JSON.stringify(expected)}`);
                }
            },
            toContain(expected: string) {
                if (typeof value === 'string' && value.includes(expected)) {
                    throw new Error(`Expected "${value}" not to contain "${expected}"`);
                }
            }
        }
    };
}

// Mock jest functions if not available
if (typeof jest === 'undefined') {
    const globalAny = global as any;
    globalAny.jest = {
        fn: () => {
            const fn = (...args: any[]) => fn.mock.results[fn.mock.calls.length - 1]?.value;
            fn.mock = { calls: [] as any[], results: [] as any[] };
            fn.mockResolvedValue = (val: any) => {
                fn.mock.results.push({ type: 'return', value: Promise.resolve(val) });
                return fn;
            };
            fn.mockResolvedValueOnce = (val: any) => {
                fn.mock.results.push({ type: 'return', value: Promise.resolve(val) });
                return fn;
            };
            fn.mockReturnValue = (val: any) => {
                fn.mock.results.push({ type: 'return', value: val });
                return fn;
            };
            return fn;
        },
        clearAllMocks: () => {},
        mock: () => {}
    };
    globalAny.describe = (name: string, fn: () => void) => {
        console.log(`\n📋 ${name}`);
        fn();
    };
    globalAny.it = globalAny.test = async (description: string, fn: () => Promise<void> | void) => {
        try {
            await fn();
            console.log(`  ✅ ${description}`);
        } catch (error) {
            console.error(`  ❌ ${description}`);
            console.error(`     ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    globalAny.beforeEach = (fn: () => void) => fn();
}

// Run tests if this file is executed directly
if (require.main === module) {
    console.log('🧪 Running Message Decision Trace tests...\n');
    console.log('Note: Full test execution requires Jest or similar test runner.');
    console.log('This file defines the test cases for the Decision Trace feature.\n');
}
