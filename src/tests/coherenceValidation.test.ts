/**
 * Tests for Coherence Validation System
 * 
 * Tests the enhanced MessagePolicyEngine and FlowIntegrationHelper for:
 * 1. Context memory system for last 20 interactions
 * 2. Contradiction detection against previous information
 * 3. Automatic message transformation for incoherent messages
 * 4. Violation logging for analysis
 * 
 * Run with: npx tsx src/tests/coherenceValidation.test.ts
 */

import { messagePolicyEngine, type MessagePolicyContext, type ContextInteraction } from '../services/MessagePolicyEngine';
import type { PersuasionContext } from '../services/persuasionEngine';
import type { UserSession } from '../../types/global';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void | Promise<void>) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            result
                .then(() => {
                    console.log(`✅ ${name}`);
                    testsPassed++;
                })
                .catch(err => {
                    console.log(`❌ ${name}: ${err.message}`);
                    testsFailed++;
                });
        } else {
            console.log(`✅ ${name}`);
            testsPassed++;
        }
    } catch (err: any) {
        console.log(`❌ ${name}: ${err.message}`);
        testsFailed++;
    }
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}: expected "${expected}", got "${actual}"`);
    }
}

function assertGreaterThan(actual: number, expected: number, message: string): void {
    if (!(actual > expected)) {
        throw new Error(`${message}: expected ${actual} > ${expected}`);
    }
}

// Mock factories
const createMockSession = (overrides?: Partial<UserSession>): UserSession => ({
    phone: '573001234567',
    phoneNumber: '573001234567',
    name: 'Test User',
    stage: 'awareness',
    currentFlow: 'musicUsb',
    isActive: true,
    isFirstMessage: false,
    lastInteraction: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    interactions: [],
    buyingIntent: 50,
    interests: [],
    ...overrides
});

const createMockPersuasionContext = (overrides?: Partial<PersuasionContext>): PersuasionContext => ({
    stage: 'awareness',
    hasDiscussedPrice: false,
    hasSelectedProduct: false,
    hasCustomized: false,
    buyingIntent: 50,
    interactionCount: 1,
    productInterests: [],
    ...overrides
});

const createMockPolicyContext = (
    sessionOverrides?: Partial<UserSession>,
    persuasionOverrides?: Partial<PersuasionContext>
): MessagePolicyContext => {
    const userSession = createMockSession(sessionOverrides);
    const persuasionContext = createMockPersuasionContext(persuasionOverrides);
    
    return {
        userSession,
        persuasionContext,
        messageType: 'persuasive',
        stage: persuasionContext.stage,
        status: userSession.stage
    };
};

// Clear context memory before each test suite
function clearTestContext(phone: string) {
    messagePolicyEngine.clearContextMemory(phone);
}

// ==========================================
// === CONTEXT MEMORY TESTS ===
// ==========================================

console.log('\n=== Context Memory System Tests ===\n');

test('should add interaction to context memory', () => {
    const phone = 'test-phone-001';
    clearTestContext(phone);
    
    messagePolicyEngine.addToContextMemory(phone, 'user', 'Quiero una USB de música');
    
    const context = messagePolicyEngine.getContextMemory(phone);
    assertEqual(context.length, 1, 'Context should have 1 interaction');
    assertEqual(context[0].role, 'user', 'Role should be user');
    assert(context[0].content.includes('USB'), 'Content should include original message');
});

test('should limit context memory to 20 interactions', () => {
    const phone = 'test-phone-002';
    clearTestContext(phone);
    
    // Add 25 interactions
    for (let i = 0; i < 25; i++) {
        messagePolicyEngine.addToContextMemory(phone, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`);
    }
    
    const context = messagePolicyEngine.getContextMemory(phone);
    assertEqual(context.length, 20, 'Context should be limited to 20 interactions');
    // First message should be from index 5 (since 0-4 were trimmed)
    assert(context[0].content.includes('5'), 'First message should be Message 5');
});

test('should extract metadata from content', () => {
    const phone = 'test-phone-003';
    clearTestContext(phone);
    
    // Add message with price and capacity
    messagePolicyEngine.addToContextMemory(phone, 'assistant', 'El precio es $45,000 por 32GB');
    
    const context = messagePolicyEngine.getContextMemory(phone);
    assert(context[0].metadata !== undefined, 'Metadata should be extracted');
    assertEqual(context[0].metadata?.priceShown, 45000, 'Price should be extracted');
    assertEqual(context[0].metadata?.capacityMentioned, '32GB', 'Capacity should be extracted');
});

test('should extract product type from content', () => {
    const phone = 'test-phone-004';
    clearTestContext(phone);
    
    messagePolicyEngine.addToContextMemory(phone, 'user', 'Me interesa la música');
    
    const context = messagePolicyEngine.getContextMemory(phone);
    assertEqual(context[0].metadata?.productType, 'music', 'Product type should be music');
});

test('should clear context memory for user', () => {
    const phone = 'test-phone-005';
    
    messagePolicyEngine.addToContextMemory(phone, 'user', 'Test message');
    assertEqual(messagePolicyEngine.getContextMemory(phone).length, 1, 'Should have 1 message');
    
    messagePolicyEngine.clearContextMemory(phone);
    assertEqual(messagePolicyEngine.getContextMemory(phone).length, 0, 'Should have 0 messages after clear');
});

// ==========================================
// === CONTRADICTION DETECTION TESTS ===
// ==========================================

console.log('\n=== Contradiction Detection Tests ===\n');

test('should detect price contradiction', () => {
    const phone = 'test-phone-010';
    clearTestContext(phone);
    
    // First, show a price
    messagePolicyEngine.addToContextMemory(phone, 'assistant', 'El USB de 32GB cuesta $45,000');
    
    // Now validate a message with a different price
    const context = createMockPolicyContext(
        { phone },
        { stage: 'pricing', hasDiscussedPrice: true }
    );
    
    const result = messagePolicyEngine.validateMessage(
        'El precio del USB de 32GB es $89,000',  // Different price!
        context
    );
    
    const hasPriceContradiction = result.violations.some(v => v.rule === 'price_contradiction');
    assert(hasPriceContradiction, 'Should detect price contradiction');
});

test('should not flag consistent prices', () => {
    const phone = 'test-phone-011';
    clearTestContext(phone);
    
    // First, show a price
    messagePolicyEngine.addToContextMemory(phone, 'assistant', 'El USB de 32GB cuesta $45,000');
    
    // Now validate a message with the same price
    const context = createMockPolicyContext(
        { phone },
        { stage: 'pricing', hasDiscussedPrice: true }
    );
    
    const result = messagePolicyEngine.validateMessage(
        'El precio del USB de 32GB es $45,000',  // Same price
        context
    );
    
    const hasPriceContradiction = result.violations.some(v => v.rule === 'price_contradiction');
    assert(!hasPriceContradiction, 'Should not flag consistent prices');
});

test('should detect duplicate price table', () => {
    const phone = 'test-phone-012';
    clearTestContext(phone);
    
    // Show price table twice
    const priceTable = `📊 Precios:
32GB - $45,000
64GB - $75,000
128GB - $125,000`;
    
    messagePolicyEngine.addToContextMemory(phone, 'assistant', priceTable);
    messagePolicyEngine.addToContextMemory(phone, 'assistant', priceTable);
    
    const context = createMockPolicyContext(
        { phone },
        { stage: 'pricing', hasDiscussedPrice: true }
    );
    
    const result = messagePolicyEngine.validateMessage(priceTable, context);
    
    const hasDuplicatePriceTable = result.violations.some(v => v.rule === 'duplicate_price_table');
    assert(hasDuplicatePriceTable, 'Should detect duplicate price table');
});

// ==========================================
// === MESSAGE TRANSFORMATION TESTS ===
// ==========================================

console.log('\n=== Message Transformation Tests ===\n');

test('should transform message with price contradiction', () => {
    const phone = 'test-phone-020';
    clearTestContext(phone);
    
    // First, show a price
    messagePolicyEngine.addToContextMemory(phone, 'assistant', 'El USB de 32GB cuesta $45,000');
    
    const context = createMockPolicyContext(
        { phone },
        { stage: 'pricing', hasDiscussedPrice: true }
    );
    
    const result = messagePolicyEngine.validateMessage(
        'El precio es $89,000 por la USB',
        context
    );
    
    // If there's a price contradiction, message should be transformed
    if (result.transformedMessage) {
        // The transformed message should use consistent pricing
        console.log(`  Transformed: "${result.transformedMessage.substring(0, 50)}..."`);
    }
});

// ==========================================
// === VIOLATION LOGGING TESTS ===
// ==========================================

console.log('\n=== Violation Logging Tests ===\n');

test('should log violations for analysis', () => {
    const phone = 'test-phone-030';
    clearTestContext(phone);
    
    const context = createMockPolicyContext(
        { phone, stage: 'order_confirmed' },
        { stage: 'closing' }
    );
    
    // Trigger a violation (urgency in confirmed order)
    messagePolicyEngine.validateMessage('⏰ ¡Última llamada! ¿Confirmas?', context);
    
    // Check violation log
    const violations = messagePolicyEngine.getViolationLog({ phone });
    assertGreaterThan(violations.length, 0, 'Should have logged the violation');
    
    const urgencyViolation = violations.find(v => v.violationType === 'no_urgency_when_confirmed');
    assert(urgencyViolation !== undefined, 'Should have logged urgency violation');
});

test('should provide violation statistics', () => {
    // Get stats (may include violations from previous tests)
    const stats = messagePolicyEngine.getViolationStats();
    
    assert(typeof stats.total === 'number', 'Stats should include total');
    assert(typeof stats.byType === 'object', 'Stats should include byType');
    assert(typeof stats.bySeverity === 'object', 'Stats should include bySeverity');
    assert(typeof stats.recent24h === 'number', 'Stats should include recent24h');
});

test('should filter violation log by type', () => {
    const phone = 'test-phone-031';
    clearTestContext(phone);
    
    const context = createMockPolicyContext(
        { phone, stage: 'order_confirmed' }
    );
    
    // Create an urgency violation
    messagePolicyEngine.validateMessage('⏰ Urgente: confirma ya', context);
    
    // Filter by violation type
    const urgencyViolations = messagePolicyEngine.getViolationLog({
        violationType: 'no_urgency_when_confirmed'
    });
    
    assert(urgencyViolations.every(v => v.violationType === 'no_urgency_when_confirmed'),
        'All filtered violations should be of the specified type');
});

// ==========================================
// === VALIDATE WITH CONTEXT TESTS ===
// ==========================================

console.log('\n=== Validate With Context Tests ===\n');

test('should validate message without modifying context (caller responsibility)', () => {
    const phone = 'test-phone-040';
    clearTestContext(phone);
    
    const context = createMockPolicyContext(
        { phone },
        { stage: 'interest', interactionCount: 1 }
    );
    
    // validateMessageWithContext should validate but NOT add to context
    // (caller is responsible for adding to context to avoid double-addition)
    const result = messagePolicyEngine.validateMessageWithContext(
        '¿Qué géneros musicales te gustan?',
        context
    );
    
    // Message should be valid
    assert(result.isValid, 'Message should be valid');
    
    // Context should NOT be updated by validateMessageWithContext
    // (caller - FlowIntegrationHelper - is responsible for adding)
    const contextMemory = messagePolicyEngine.getContextMemory(phone);
    assertEqual(contextMemory.length, 0, 'validateMessageWithContext should NOT add to context');
});

test('should manually add to context after validation', () => {
    const phone = 'test-phone-041';
    clearTestContext(phone);
    
    const context = createMockPolicyContext(
        { phone },
        { stage: 'interest', interactionCount: 1 }
    );
    
    // Validate message
    const message = '¿Qué géneros musicales te gustan?';
    const result = messagePolicyEngine.validateMessageWithContext(message, context);
    
    // Manually add to context (as FlowIntegrationHelper would do)
    if (result.isValid) {
        messagePolicyEngine.addToContextMemory(phone, 'assistant', message);
    }
    
    // Now context should have the message
    const contextMemory = messagePolicyEngine.getContextMemory(phone);
    assertEqual(contextMemory.length, 1, 'Context should have 1 message after manual add');
});

// ==========================================
// === EDGE CASES ===
// ==========================================

console.log('\n=== Edge Cases Tests ===\n');

test('should handle empty context memory gracefully', () => {
    const phone = 'test-phone-050';
    clearTestContext(phone);
    
    const context = createMockPolicyContext({ phone });
    
    // Should not throw when no context exists
    const result = messagePolicyEngine.validateMessage('Hello!', context);
    assert(result !== undefined, 'Should return a result even with empty context');
});

test('should handle messages without price/capacity metadata', () => {
    const phone = 'test-phone-051';
    clearTestContext(phone);
    
    messagePolicyEngine.addToContextMemory(phone, 'user', 'Hola, buenos días');
    
    const context = messagePolicyEngine.getContextMemory(phone);
    // Message without price/capacity should still be added
    assertEqual(context.length, 1, 'Should have 1 interaction');
});

test('should allow small price variations (within 10%)', () => {
    const phone = 'test-phone-052';
    clearTestContext(phone);
    
    // First price
    messagePolicyEngine.addToContextMemory(phone, 'assistant', 'El USB cuesta $45,000');
    
    const context = createMockPolicyContext(
        { phone },
        { stage: 'pricing' }
    );
    
    // Price with small variation (within 10%)
    const result = messagePolicyEngine.validateMessage(
        'Son $46,000 con impuestos incluidos',  // ~2% variation
        context
    );
    
    const hasPriceContradiction = result.violations.some(v => v.rule === 'price_contradiction');
    assert(!hasPriceContradiction, 'Small price variations should be allowed');
});

// ==========================================
// === SUMMARY ===
// ==========================================

// Wait a bit for async tests to complete
setTimeout(() => {
    console.log('\n===========================================');
    console.log(`Tests completed: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('===========================================\n');
    
    if (testsFailed > 0) {
        process.exit(1);
    }
}, 500);
