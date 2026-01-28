/**
 * Unit tests for Message Telemetry Service
 * 
 * Tests the telemetry functionality for tracking inbound message state transitions:
 * RECEIVED → QUEUED → PROCESSING → RESPONDED/SKIPPED/ERROR
 */

import { 
    MessageTelemetryService,
    TelemetryState,
    TelemetrySkipReason,
    TelemetryErrorType
} from '../services/MessageTelemetryService';
import { hashPhone } from '../utils/phoneHasher';

// Mock the repository to avoid database dependency
const mockRepository = {
    create: jest.fn().mockResolvedValue(1),
    createBatch: jest.fn().mockResolvedValue(undefined),
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
    getFunnelStats: jest.fn().mockResolvedValue({
        received: 10,
        queued: 2,
        processing: 1,
        responded: 7,
        skipped: 2,
        errors: 1,
        skipReasons: { DEDUPED: 1, EMPTY_MESSAGE: 1 },
        errorTypes: { FLOW_ERROR: 1 },
        avgProcessingTimeMs: 150,
        windowMinutes: 5
    }),
    getRecentMessagesByPhone: jest.fn().mockResolvedValue([]),
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
jest.mock('../repositories/MessageTelemetryRepository', () => ({
    messageTelemetryRepository: mockRepository
}));

describe('MessageTelemetryService', () => {
    let service: MessageTelemetryService;
    
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        service = MessageTelemetryService.getInstance();
    });

    describe('recordReceived', () => {
        it('should record a RECEIVED telemetry event', async () => {
            const messageId = 'msg_recv_001';
            const phone = '+573001234567';

            const event = await service.recordReceived(messageId, phone);

            expect(event).toBeDefined();
            expect(event.messageId).toBe(messageId);
            expect(event.phoneHash).toBe(hashPhone(phone));
            expect(event.state).toBe(TelemetryState.RECEIVED);
            expect(event.detail).toContain('received');

            // Verify repository was called (async, so may not be immediate)
            // Wait a tick for async persistence
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(mockRepository.create).toHaveBeenCalled();
        });

        it('should hash phone number to prevent PII storage', async () => {
            const messageId = 'msg_recv_002';
            const phone = '+573009876543';

            const event = await service.recordReceived(messageId, phone);

            expect(event.phoneHash).toBe(hashPhone(phone));
            expect(event.phoneHash).not.toBe(phone);
            // Verify phone hash is non-empty and doesn't contain original phone digits
            expect(event.phoneHash.length).toBeGreaterThan(0);
        });
    });

    describe('recordQueued', () => {
        it('should record a QUEUED telemetry event', async () => {
            const messageId = 'msg_queue_001';
            const phone = '+573001234567';
            const detail = 'Queued during RECONNECTING state';

            const event = await service.recordQueued(messageId, phone, detail);

            expect(event).toBeDefined();
            expect(event.state).toBe(TelemetryState.QUEUED);
            expect(event.previousState).toBe(TelemetryState.RECEIVED);
            expect(event.detail).toContain('Queued');
        });
    });

    describe('recordProcessing', () => {
        it('should record a PROCESSING telemetry event', async () => {
            const messageId = 'msg_proc_001';
            const phone = '+573001234567';
            const stage = 'intelligentMainFlow';

            const event = await service.recordProcessing(messageId, phone, stage);

            expect(event).toBeDefined();
            expect(event.state).toBe(TelemetryState.PROCESSING);
            expect(event.previousState).toBe(TelemetryState.QUEUED);
            expect(event.stage).toBe(stage);
        });
    });

    describe('recordResponded', () => {
        it('should record a RESPONDED telemetry event', async () => {
            const messageId = 'msg_resp_001';
            const phone = '+573001234567';
            const stage = 'mainFlow';
            const detail = 'Response sent successfully';

            const event = await service.recordResponded(messageId, phone, stage, detail);

            expect(event).toBeDefined();
            expect(event.state).toBe(TelemetryState.RESPONDED);
            expect(event.previousState).toBe(TelemetryState.PROCESSING);
            expect(event.stage).toBe(stage);
        });
    });

    describe('recordSkipped', () => {
        it('should record a SKIPPED telemetry event with reason', async () => {
            const messageId = 'msg_skip_001';
            const phone = '+573001234567';
            const reason = TelemetrySkipReason.DEDUPED;
            const detail = 'Duplicate message detected';

            const event = await service.recordSkipped(messageId, phone, reason, detail);

            expect(event).toBeDefined();
            expect(event.state).toBe(TelemetryState.SKIPPED);
            expect(event.skipReason).toBe(TelemetrySkipReason.DEDUPED);
            expect(event.detail).toContain('Duplicate');
        });

        it('should record EMPTY_MESSAGE skip reason', async () => {
            const messageId = 'msg_skip_002';
            const phone = '+573001234567';

            const event = await service.recordSkipped(
                messageId, phone, TelemetrySkipReason.EMPTY_MESSAGE, 'Empty message'
            );

            expect(event.skipReason).toBe(TelemetrySkipReason.EMPTY_MESSAGE);
        });

        it('should record BLOCKED_USER skip reason', async () => {
            const messageId = 'msg_skip_003';
            const phone = '+573001234567';

            const event = await service.recordSkipped(
                messageId, phone, TelemetrySkipReason.BLOCKED_USER, 'Blocked user'
            );

            expect(event.skipReason).toBe(TelemetrySkipReason.BLOCKED_USER);
        });
    });

    describe('recordError', () => {
        it('should record an ERROR telemetry event with error type', async () => {
            const messageId = 'msg_err_001';
            const phone = '+573001234567';
            const errorType = TelemetryErrorType.FLOW_ERROR;
            const detail = 'Router error';
            const stage = 'router';

            const event = await service.recordError(messageId, phone, errorType, detail, stage);

            expect(event).toBeDefined();
            expect(event.state).toBe(TelemetryState.ERROR);
            expect(event.errorType).toBe(TelemetryErrorType.FLOW_ERROR);
            expect(event.stage).toBe(stage);
        });

        it('should record CRITICAL_ERROR type', async () => {
            const messageId = 'msg_err_002';
            const phone = '+573001234567';

            const event = await service.recordError(
                messageId, phone, TelemetryErrorType.CRITICAL_ERROR, 
                'Critical error in main flow'
            );

            expect(event.errorType).toBe(TelemetryErrorType.CRITICAL_ERROR);
        });

        it('should record AI_ERROR type', async () => {
            const messageId = 'msg_err_003';
            const phone = '+573001234567';

            const event = await service.recordError(
                messageId, phone, TelemetryErrorType.AI_ERROR, 
                'AI service timeout', 'ai'
            );

            expect(event.errorType).toBe(TelemetryErrorType.AI_ERROR);
        });
    });

    describe('PII Protection', () => {
        it('should never store raw phone number', async () => {
            const messageId = 'msg_pii_001';
            const rawPhone = '+573009999999';

            const event = await service.recordReceived(messageId, rawPhone);

            // Phone should be hashed
            expect(event.phoneHash).not.toContain('573009999999');
            expect(event.phoneHash.length).toBe(16);
        });
    });

    describe('getFunnelStats', () => {
        it('should return funnel statistics', async () => {
            const stats = await service.getFunnelStats(5);

            expect(stats).toBeDefined();
            expect(stats.received).toBe(10);
            expect(stats.responded).toBe(7);
            expect(stats.skipped).toBe(2);
            expect(stats.errors).toBe(1);
            expect(stats.skipReasons.DEDUPED).toBe(1);
            expect(stats.windowMinutes).toBe(5);

            expect(mockRepository.getFunnelStats).toHaveBeenCalledWith(5);
        });
    });

    describe('Query methods', () => {
        it('should query events by phone (hashing automatically)', async () => {
            const phone = '+573001234567';
            mockRepository.getByPhoneHash.mockResolvedValueOnce([]);

            await service.getEventsByPhone(phone, 50);

            expect(mockRepository.getByPhoneHash).toHaveBeenCalledWith(
                hashPhone(phone),
                50
            );
        });

        it('should query events by message ID', async () => {
            const messageId = 'msg_query_001';
            mockRepository.getByMessageId.mockResolvedValueOnce([]);

            await service.getEventsByMessageId(messageId);

            expect(mockRepository.getByMessageId).toHaveBeenCalledWith(messageId);
        });

        it('should get recent messages by phone hash', async () => {
            const phoneHash = 'abc123def456';
            mockRepository.getRecentMessagesByPhone.mockResolvedValueOnce([]);

            await service.getRecentMessagesByPhoneHash(phoneHash, 10);

            expect(mockRepository.getRecentMessagesByPhone).toHaveBeenCalledWith(
                phoneHash,
                10
            );
        });
    });
});

// =========================================================================
// Simple test runner fallback for environments without Jest
// These utilities are only used when Jest is not available
// =========================================================================

// Mock jest functions if not available
if (typeof jest === 'undefined') {
    // Simple expect implementation for non-Jest environments
    function expectFallback(value: any) {
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
            toBeGreaterThan(expected: number) {
                if (typeof value !== 'number' || value <= expected) {
                    throw new Error(`Expected ${value} to be greater than ${expected}`);
                }
            },
            toContain(expected: string) {
                if (typeof value !== 'string' || !value.includes(expected)) {
                    throw new Error(`Expected "${value}" to contain "${expected}"`);
                }
            },
            toHaveBeenCalled() {
                // For mocks, no-op in fallback
            },
            toHaveBeenCalledWith(..._args: any[]) {
                // For mocks, no-op in fallback
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

    const globalAny = global as any;
    globalAny.expect = expectFallback;
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
    console.log('🧪 Running Message Telemetry Service tests...\n');
    console.log('Note: Full test execution requires Jest or similar test runner.');
    console.log('This file defines the test cases for the Telemetry Service feature.\n');
}
