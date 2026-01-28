/**
 * Integration tests for Inbound Message Telemetry Pipeline
 * 
 * Verifies complete telemetry tracking for inbound messages:
 * RECEIVED → QUEUED (optional) → PROCESSING → RESPONDED/SKIPPED/ERROR
 * 
 * Acceptance Criteria:
 * - If [RECEIVED] appears in logs, there must be a final outcome in DB
 * - Each complete inbound flow generates at least 3-4 telemetry events
 * - 5-minute counters show actual activity when messages are processed
 */

import {
    MessageTelemetryService,
    TelemetryState,
    TelemetrySkipReason,
    TelemetryErrorType
} from '../services/MessageTelemetryService';
import { hashPhone } from '../utils/phoneHasher';

// Mock the repository to avoid database dependency while testing the service
const mockRepository = {
    create: jest.fn().mockResolvedValue(1),
    createBatch: jest.fn().mockResolvedValue(undefined),
    getByMessageId: jest.fn(),
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
        received: 0,
        queued: 0,
        processing: 0,
        responded: 0,
        skipped: 0,
        errors: 0,
        skipReasons: {},
        errorTypes: {},
        avgProcessingTimeMs: 0,
        windowMinutes: 5
    }),
    getRecentMessagesByPhone: jest.fn().mockResolvedValue([]),
    deleteOlderThan: jest.fn().mockResolvedValue(0)
};

// Mock structured logger
jest.mock('../utils/structuredLogger', () => ({
    structuredLogger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

// Mock correlation ID manager
jest.mock('../services/CorrelationIdManager', () => ({
    getCorrelationId: jest.fn().mockReturnValue('test-correlation-integration-123')
}));

// Mock the repository
jest.mock('../repositories/MessageTelemetryRepository', () => ({
    messageTelemetryRepository: mockRepository
}));

describe('Inbound Message Telemetry Integration', () => {
    let service: MessageTelemetryService;
    
    beforeEach(() => {
        jest.clearAllMocks();
        service = MessageTelemetryService.getInstance();
    });

    describe('Happy Path: RECEIVED → PROCESSING → RESPONDED', () => {
        it('should record at least 3 events for a successful message flow', async () => {
            const messageId = 'msg_happy_001';
            const phone = '+573001234567';
            const phoneHash = hashPhone(phone);
            
            // Simulate the happy path flow
            const receivedEvent = await service.recordReceived(messageId, phone);
            expect(receivedEvent.state).toBe(TelemetryState.RECEIVED);
            
            const processingEvent = await service.recordProcessing(messageId, phone, 'intelligentMainFlow');
            expect(processingEvent.state).toBe(TelemetryState.PROCESSING);
            
            const respondedEvent = await service.recordResponded(messageId, phone, 'mainFlow', 'Response sent');
            expect(respondedEvent.state).toBe(TelemetryState.RESPONDED);
            
            // Verify repository was called 3 times (once for each event)
            // Wait a tick for async persistence
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockRepository.create).toHaveBeenCalledTimes(3);
            
            // Verify all events have the same messageId and phoneHash
            expect(receivedEvent.messageId).toBe(messageId);
            expect(processingEvent.messageId).toBe(messageId);
            expect(respondedEvent.messageId).toBe(messageId);
            
            expect(receivedEvent.phoneHash).toBe(phoneHash);
            expect(processingEvent.phoneHash).toBe(phoneHash);
            expect(respondedEvent.phoneHash).toBe(phoneHash);
            
            // Verify state transitions
            expect(processingEvent.previousState).toBe(TelemetryState.QUEUED);
            expect(respondedEvent.previousState).toBe(TelemetryState.PROCESSING);
        });
    });

    describe('Queued Path: RECEIVED → QUEUED → PROCESSING → RESPONDED', () => {
        it('should record 4 events when message is queued', async () => {
            const messageId = 'msg_queued_001';
            const phone = '+573002345678';
            
            // Simulate queued flow (during RECONNECTING state)
            const receivedEvent = await service.recordReceived(messageId, phone);
            expect(receivedEvent.state).toBe(TelemetryState.RECEIVED);
            
            const queuedEvent = await service.recordQueued(messageId, phone, 'Queued during RECONNECTING state');
            expect(queuedEvent.state).toBe(TelemetryState.QUEUED);
            expect(queuedEvent.previousState).toBe(TelemetryState.RECEIVED);
            
            const processingEvent = await service.recordProcessing(messageId, phone, 'mainFlow');
            expect(processingEvent.state).toBe(TelemetryState.PROCESSING);
            
            const respondedEvent = await service.recordResponded(messageId, phone, 'mainFlow', 'Response sent');
            expect(respondedEvent.state).toBe(TelemetryState.RESPONDED);
            
            // Verify 4 events were persisted
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockRepository.create).toHaveBeenCalledTimes(4);
        });
    });

    describe('Skip Path: RECEIVED → SKIPPED', () => {
        it('should record 2 events when message is skipped due to deduplication', async () => {
            const messageId = 'msg_dedup_001';
            const phone = '+573003456789';
            
            const receivedEvent = await service.recordReceived(messageId, phone);
            expect(receivedEvent.state).toBe(TelemetryState.RECEIVED);
            
            const skippedEvent = await service.recordSkipped(
                messageId, phone, TelemetrySkipReason.DEDUPED, 'Duplicate message detected'
            );
            expect(skippedEvent.state).toBe(TelemetryState.SKIPPED);
            expect(skippedEvent.skipReason).toBe(TelemetrySkipReason.DEDUPED);
            
            // Verify 2 events were persisted
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockRepository.create).toHaveBeenCalledTimes(2);
        });

        it('should record skip for empty message', async () => {
            const messageId = 'msg_empty_001';
            const phone = '+573004567890';
            
            const skippedEvent = await service.recordSkipped(
                messageId, phone, TelemetrySkipReason.EMPTY_MESSAGE, 'Empty message'
            );
            expect(skippedEvent.skipReason).toBe(TelemetrySkipReason.EMPTY_MESSAGE);
        });

        it('should record skip for blocked user', async () => {
            const messageId = 'msg_blocked_001';
            const phone = '+573005678901';
            
            const skippedEvent = await service.recordSkipped(
                messageId, phone, TelemetrySkipReason.BLOCKED_USER, 'Blocked user'
            );
            expect(skippedEvent.skipReason).toBe(TelemetrySkipReason.BLOCKED_USER);
        });
    });

    describe('Error Path: RECEIVED → PROCESSING → ERROR', () => {
        it('should record 3 events when processing fails with error', async () => {
            const messageId = 'msg_error_001';
            const phone = '+573006789012';
            
            const receivedEvent = await service.recordReceived(messageId, phone);
            expect(receivedEvent.state).toBe(TelemetryState.RECEIVED);
            
            const processingEvent = await service.recordProcessing(messageId, phone, 'aiFlow');
            expect(processingEvent.state).toBe(TelemetryState.PROCESSING);
            
            const errorEvent = await service.recordError(
                messageId, phone, TelemetryErrorType.AI_ERROR, 'AI service timeout', 'aiFlow'
            );
            expect(errorEvent.state).toBe(TelemetryState.ERROR);
            expect(errorEvent.errorType).toBe(TelemetryErrorType.AI_ERROR);
            
            // Verify 3 events were persisted
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mockRepository.create).toHaveBeenCalledTimes(3);
        });

        it('should record critical error type', async () => {
            const messageId = 'msg_critical_001';
            const phone = '+573007890123';
            
            const errorEvent = await service.recordError(
                messageId, phone, TelemetryErrorType.CRITICAL_ERROR, 
                'Critical error in main flow', 'mainFlow'
            );
            expect(errorEvent.errorType).toBe(TelemetryErrorType.CRITICAL_ERROR);
        });

        it('should record flow error type', async () => {
            const messageId = 'msg_flow_001';
            const phone = '+573008901234';
            
            const errorEvent = await service.recordError(
                messageId, phone, TelemetryErrorType.FLOW_ERROR, 
                'Router error', 'router'
            );
            expect(errorEvent.errorType).toBe(TelemetryErrorType.FLOW_ERROR);
        });
    });

    describe('Processing Time Tracking', () => {
        it('should calculate processing time for final states', async () => {
            const messageId = 'msg_timing_001';
            const phone = '+573009012345';
            
            // Record RECEIVED (starts the timer)
            await service.recordReceived(messageId, phone);
            
            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Record RESPONDED (should have processing time)
            const respondedEvent = await service.recordResponded(messageId, phone, 'mainFlow');
            
            // Processing time should be at least 100ms
            expect(respondedEvent.processingTimeMs).toBeDefined();
            expect(respondedEvent.processingTimeMs).toBeGreaterThanOrEqual(100);
        });
    });

    describe('PII Protection', () => {
        it('should hash phone numbers in all events', async () => {
            const messageId = 'msg_pii_001';
            const phone = '+573009999999';
            
            const event = await service.recordReceived(messageId, phone);
            
            // Verify phone is hashed
            expect(event.phoneHash).toBe(hashPhone(phone));
            expect(event.phoneHash).not.toContain('573009999999');
            expect(event.phoneHash.length).toBe(16); // Truncated hash
        });
    });

    describe('Acceptance Criteria Verification', () => {
        it('should ensure every RECEIVED has a final outcome', async () => {
            const messageId = 'msg_criteria_001';
            const phone = '+573010123456';
            
            // Track all recorded events
            const recordedStates: TelemetryState[] = [];
            
            // Simulate flow with tracking
            const received = await service.recordReceived(messageId, phone);
            recordedStates.push(received.state);
            
            const processing = await service.recordProcessing(messageId, phone, 'flow');
            recordedStates.push(processing.state);
            
            const responded = await service.recordResponded(messageId, phone, 'flow');
            recordedStates.push(responded.state);
            
            // Verify acceptance criteria:
            // 1. RECEIVED must exist
            expect(recordedStates).toContain(TelemetryState.RECEIVED);
            
            // 2. Final outcome must exist (RESPONDED, SKIPPED, or ERROR)
            const finalOutcomes = [TelemetryState.RESPONDED, TelemetryState.SKIPPED, TelemetryState.ERROR];
            const hasFinalOutcome = recordedStates.some(state => finalOutcomes.includes(state));
            expect(hasFinalOutcome).toBe(true);
            
            // 3. At least 3 events for a complete flow
            expect(recordedStates.length).toBeGreaterThanOrEqual(3);
        });

        it('should record minimum 4 events for queued messages', async () => {
            const messageId = 'msg_criteria_002';
            const phone = '+573011234567';
            
            const events = [];
            events.push(await service.recordReceived(messageId, phone));
            events.push(await service.recordQueued(messageId, phone, 'Queued'));
            events.push(await service.recordProcessing(messageId, phone, 'flow'));
            events.push(await service.recordResponded(messageId, phone, 'flow'));
            
            expect(events.length).toBe(4);
            expect(events[0].state).toBe(TelemetryState.RECEIVED);
            expect(events[1].state).toBe(TelemetryState.QUEUED);
            expect(events[2].state).toBe(TelemetryState.PROCESSING);
            expect(events[3].state).toBe(TelemetryState.RESPONDED);
        });
    });

    describe('Funnel Statistics', () => {
        it('should provide funnel stats from getFunnelStats', async () => {
            // Mock the repository to return sample stats
            mockRepository.getFunnelStats.mockResolvedValueOnce({
                received: 100,
                queued: 10,
                processing: 5,
                responded: 80,
                skipped: 15,
                errors: 5,
                skipReasons: { DEDUPED: 10, EMPTY_MESSAGE: 5 },
                errorTypes: { FLOW_ERROR: 3, AI_ERROR: 2 },
                avgProcessingTimeMs: 150,
                windowMinutes: 5
            });
            
            const stats = await service.getFunnelStats(5);
            
            expect(stats.received).toBe(100);
            expect(stats.responded).toBe(80);
            expect(stats.skipped).toBe(15);
            expect(stats.errors).toBe(5);
            expect(stats.windowMinutes).toBe(5);
            expect(mockRepository.getFunnelStats).toHaveBeenCalledWith(5);
        });
    });
});

// =========================================================================
// Simple test runner fallback for environments without Jest
// These utilities are only used when Jest is not available
// =========================================================================

// Mock jest functions if not available
if (typeof jest === 'undefined') {
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
            toBeGreaterThanOrEqual(expected: number) {
                if (typeof value !== 'number' || value < expected) {
                    throw new Error(`Expected ${value} to be >= ${expected}`);
                }
            },
            toContain(expected: any) {
                if (Array.isArray(value)) {
                    if (!value.includes(expected)) {
                        throw new Error(`Expected array to contain ${expected}`);
                    }
                } else if (typeof value === 'string') {
                    if (!value.includes(expected)) {
                        throw new Error(`Expected "${value}" to contain "${expected}"`);
                    }
                }
            },
            toHaveBeenCalledTimes(expected: number) {
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
                toContain(expected: any) {
                    if (Array.isArray(value)) {
                        if (value.includes(expected)) {
                            throw new Error(`Expected array not to contain ${expected}`);
                        }
                    } else if (typeof value === 'string' && value.includes(expected)) {
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
    console.log('🧪 Running Inbound Message Telemetry Integration Tests...\n');
    console.log('Note: Full test execution requires Jest or similar test runner.');
    console.log('This file defines the integration test cases for the Telemetry Pipeline.\n');
}
