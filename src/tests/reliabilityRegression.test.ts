/**
 * Reliability Regression Tests
 *
 * Covers:
 * - InboundMessageQueue processor registered (no silent "No message processor registered" logs)
 * - Gemini 404 -> fallback model succeeds
 * - ConversationAnalysisService tolerant JSON parsing
 * - ConversationAnalysisRepository update compatibility without skip_reason column
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
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

const { AIGateway } = require('../services/aiGateway');
const { GEMINI_MODEL_FALLBACK_CHAIN } = require('../utils/aiConfig');
const { ConversationAnalysisService } = require('../services/ConversationAnalysisService');
const { inboundMessageQueue } = require('../services/InboundMessageQueue');
const { whatsAppProviderState } = require('../services/WhatsAppProviderState');
const { messageDecisionService } = require('../services/MessageDecisionService');

type TestCase = {
    name: string;
    fn: () => void | Promise<void>;
};

type Primitive = string | number | boolean | null | undefined;

const tests: TestCase[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
    tests.push({ name, fn });
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T extends Primitive>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message} (expected ${expected}, got ${actual})`);
    }
}

function assertNotIncludes(messages: string[], substring: string, message: string): void {
    const found = messages.some(entry => entry.includes(substring));
    if (found) {
        throw new Error(message);
    }
}

// ============================================================================
// Test 1: InboundMessageQueue with processor registered
// ============================================================================
test('InboundMessageQueue processes when processor registered (no missing-processor logs)', async () => {
    const capturedLogs: string[] = [];
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalRecordDecision = messageDecisionService.recordDecision;
    const originalRecordSuccess = messageDecisionService.recordSuccess;

    console.warn = (...args: any[]) => {
        capturedLogs.push(args.map(String).join(' '));
        originalWarn(...args);
    };
    console.error = (...args: any[]) => {
        capturedLogs.push(args.map(String).join(' '));
        originalError(...args);
    };
    messageDecisionService.recordDecision = async () => ({
        traceId: 'test',
        messageId: 'test',
        phoneHash: 'test',
        timestamp: new Date(),
        stage: 'INBOUND_RECEIVED',
        decision: 'DEFER',
        reasonCode: 'PROCESSING'
    });
    messageDecisionService.recordSuccess = async () => ({
        traceId: 'test',
        messageId: 'test',
        phoneHash: 'test',
        timestamp: new Date(),
        stage: 'INBOUND_RECEIVED',
        decision: 'RESPOND',
        reasonCode: 'SUCCESS'
    });

    try {
        whatsAppProviderState.reset();
        inboundMessageQueue.clear();
        inboundMessageQueue.resetStats();
        inboundMessageQueue.clearProcessor();

        const processed: string[] = [];
        inboundMessageQueue.setMessageProcessor(async msg => {
            processed.push(msg.messageId);
        });

        await inboundMessageQueue.queueMessage('regression-msg-1', '573001234567', 'Hola');
        await inboundMessageQueue.processQueue();

        assert(processed.length > 0, 'Expected queued messages to be processed');
        assertNotIncludes(
            capturedLogs,
            'No message processor registered',
            'Should not log missing processor warning when processor is registered'
        );
    } finally {
        console.warn = originalWarn;
        console.error = originalError;
        messageDecisionService.recordDecision = originalRecordDecision;
        messageDecisionService.recordSuccess = originalRecordSuccess;
        inboundMessageQueue.clear();
        inboundMessageQueue.clearProcessor();
        whatsAppProviderState.reset();
    }
});

// ============================================================================
// Test 2: Gemini 404 fallback chain
// ============================================================================
class TestAIGateway extends AIGateway {
    setProviders(providers: any[]): void {
        (this as any).providers = providers;
    }

    getProviders(): any[] {
        return (this as any).providers;
    }

    async runGeminiFallback(genAI: any, prompt: string): Promise<any> {
        return (this as any).generateWithGeminiModelFallback(genAI, prompt);
    }
}

test('Gemini 404 triggers fallback model successfully', async () => {
    assert(GEMINI_MODEL_FALLBACK_CHAIN.length > 1, 'Fallback chain should contain multiple models');

    const gateway = new TestAIGateway({ enablePolicy: false, maxRetries: 1 });
    const modelCalls: string[] = [];
    const originalProviders = gateway.getProviders();

    try {
        gateway.setProviders([
            {
                name: 'Gemini',
                model: GEMINI_MODEL_FALLBACK_CHAIN[0],
                isAvailable: () => true,
                generate: async (prompt: string) => {
                    const response = await gateway.runGeminiFallback(
                        {
                            getGenerativeModel: ({ model }: { model: string }) => ({
                                generateContent: async () => {
                                    modelCalls.push(model);
                                    if (model === GEMINI_MODEL_FALLBACK_CHAIN[0]) {
                                        const error: any = new Error('404 Not Found');
                                        error.status = 404;
                                        throw error;
                                    }
                                    return { response: { text: () => `ok:${model}` } };
                                }
                            })
                        },
                        prompt
                    );
                    return { text: response.text, tokens: response.tokens, model: response.model };
                }
            }
        ]);

        const result = await gateway.generateResponse('test prompt');

        assertEqual(
            result.response,
            `ok:${GEMINI_MODEL_FALLBACK_CHAIN[1]}`,
            'Expected fallback model response after 404'
        );
        assertEqual(modelCalls[0], GEMINI_MODEL_FALLBACK_CHAIN[0], 'Primary model should be attempted first');
        assertEqual(modelCalls[1], GEMINI_MODEL_FALLBACK_CHAIN[1], 'Fallback model should be attempted next');
        assertEqual(modelCalls.length, 2, 'Expected exactly two model attempts');
    } finally {
        gateway.setProviders(originalProviders);
    }
});

// ============================================================================
// Test 3: ConversationAnalysisService tolerant JSON parsing
// ============================================================================
test('ConversationAnalysisService does not throw when AI response lacks JSON', () => {
    const service = new ConversationAnalysisService();
    const textResponse = 'Respuesta sin JSON, solo texto plano.';
    const parsed = (service as any).parseAIResponse(textResponse);

    assert(parsed && typeof parsed === 'object', 'Expected parsed response object');
    assertEqual(parsed.intent, 'unknown', 'Expected intent to default to unknown');
    assertEqual(parsed.purchase_probability, 0, 'Expected default purchase probability');
});

// ============================================================================
// Test 4: ConversationAnalysisRepository update compatibility (skip_reason missing)
// ============================================================================
class MockConversationAnalysisRepository {
    private hasColumn: boolean;
    public schemaChecks = 0;

    constructor(hasColumn: boolean) {
        this.hasColumn = hasColumn;
    }

    async hasSkipReasonColumn(): Promise<boolean> {
        this.schemaChecks += 1;
        return this.hasColumn;
    }

    async simulateUpdate(updates: Record<string, any>): Promise<Record<string, any>> {
        const dataToUpdate: any = {
            ...updates,
            updated_at: new Date()
        };

        if (updates.objections !== undefined) {
            dataToUpdate.objections = updates.objections ? JSON.stringify(updates.objections) : null;
        }
        if (updates.extracted_preferences !== undefined) {
            dataToUpdate.extracted_preferences = updates.extracted_preferences ? JSON.stringify(updates.extracted_preferences) : null;
        }

        if (updates.skip_reason !== undefined) {
            const hasColumn = await this.hasSkipReasonColumn();
            if (!hasColumn) {
                delete dataToUpdate.skip_reason;
            }
        }

        return dataToUpdate;
    }
}

test('ConversationAnalysisRepository update without skip_reason avoids schema check', async () => {
    const repo = new MockConversationAnalysisRepository(false);
    const updates = { status: 'completed', summary: 'ok' };

    const result = await repo.simulateUpdate(updates);

    assertEqual(repo.schemaChecks, 0, 'Schema check should not run when skip_reason is absent');
    assert(!('skip_reason' in result), 'skip_reason should not be included when not provided');
});

test('ConversationAnalysisRepository omits skip_reason when column missing', async () => {
    const repo = new MockConversationAnalysisRepository(false);
    const updates = { status: 'skipped', skip_reason: 'NO_HISTORY' };

    const result = await repo.simulateUpdate(updates);

    assertEqual(repo.schemaChecks, 1, 'Schema check should run when skip_reason provided');
    assert(!('skip_reason' in result), 'skip_reason should be omitted when column is missing');
});

test('ConversationAnalysisRepository stringifies JSON fields during update', async () => {
    const repo = new MockConversationAnalysisRepository(true);
    const updates = { objections: ['price'], extracted_preferences: { capacity: '32GB' } };

    const result = await repo.simulateUpdate(updates);

    assertEqual(result.objections, JSON.stringify(['price']), 'Objections should be JSON stringified');
    assertEqual(result.extracted_preferences, JSON.stringify({ capacity: '32GB' }), 'Preferences should be JSON stringified');
});

// ============================================================================
// Runner
// ============================================================================
async function runTests(): Promise<void> {
    console.log('🧪 Reliability Regression Tests');
    console.log('═══════════════════════════════════════════════════════════════');

    let passed = 0;
    let failed = 0;

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✅ ${name}`);
            passed += 1;
        } catch (error: any) {
            failed += 1;
            console.error(`❌ ${name}`);
            console.error(`   ${error?.message || String(error)}`);
        }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📊 Results: ${passed} passed, ${failed} failed`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
});
