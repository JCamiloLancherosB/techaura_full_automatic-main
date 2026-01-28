/**
 * Tests for Readability Budget Helper
 * Run with: npx tsx src/tests/readabilityBudget.test.ts
 */

import {
    applyReadabilityBudget,
    isMoreRequest,
    createPendingDetails,
    formatPendingDetails,
    hasPendingDetails,
    getPendingDetails,
    clearPendingDetails,
    READABILITY_CONFIG
} from '../utils/readabilityBudget';

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
    try {
        fn();
        results.push({ name, passed: true, message: '✅ Passed' });
    } catch (error: any) {
        results.push({ name, passed: false, message: `❌ Failed: ${error.message}` });
    }
}

function expect<T>(actual: T) {
    return {
        toBe(expected: T) {
            if (actual !== expected) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },
        toEqual(expected: T) {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
            }
        },
        toBeFalsy() {
            if (actual) {
                throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
            }
        },
        toBeGreaterThan(expected: number) {
            if (typeof actual !== 'number' || actual <= expected) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeLessThanOrEqual(expected: number) {
            if (typeof actual !== 'number' || actual > expected) {
                throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
            }
        },
        toContain(expected: string) {
            if (typeof actual !== 'string' || !actual.includes(expected)) {
                throw new Error(`Expected "${actual}" to contain "${expected}"`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
            }
        }
    };
}

console.log('🧪 Testing Readability Budget Helper\n');
console.log('='.repeat(70));

// ========== isMoreRequest Tests ==========
console.log('\n📌 Testing isMoreRequest()\n');

test('isMoreRequest: recognizes "MORE"', () => {
    expect(isMoreRequest('MORE')).toBe(true);
});

test('isMoreRequest: recognizes "more" (lowercase)', () => {
    expect(isMoreRequest('more')).toBe(true);
});

test('isMoreRequest: recognizes "mas"', () => {
    expect(isMoreRequest('mas')).toBe(true);
});

test('isMoreRequest: recognizes "más" (with accent)', () => {
    expect(isMoreRequest('más')).toBe(true);
});

test('isMoreRequest: recognizes "detalles"', () => {
    expect(isMoreRequest('detalles')).toBe(true);
});

test('isMoreRequest: recognizes "ver más"', () => {
    expect(isMoreRequest('ver más')).toBe(true);
});

test('isMoreRequest: trims whitespace', () => {
    expect(isMoreRequest('  MORE  ')).toBe(true);
});

test('isMoreRequest: rejects unrelated input', () => {
    expect(isMoreRequest('hello')).toBe(false);
});

test('isMoreRequest: rejects empty string', () => {
    expect(isMoreRequest('')).toBe(false);
});

// ========== applyReadabilityBudget Tests ==========
console.log('\n📌 Testing applyReadabilityBudget()\n');

test('applyReadabilityBudget: short message passes through unchanged', () => {
    const shortMessage = 'Hola! Este es un mensaje corto.';
    const result = applyReadabilityBudget(shortMessage);
    
    expect(result.wasTruncated).toBe(false);
    expect(result.message).toBe(shortMessage);
    expect(result.pendingDetails).toBeNull();
});

test('applyReadabilityBudget: long message is truncated', () => {
    // Create a message that exceeds 450 chars
    const longMessage = `💰 ¡Hola! Aquí está nuestra lista de capacidades y precios:

📦 **OPCIONES DISPONIBLES:**

🔹 **8GB** - $54,900
   • ~1,400 canciones o ~3 películas HD
   • Ideal para uso básico
   • Incluye envío gratis

🔹 **32GB** - $84,900 ⭐ MÁS POPULAR
   • ~5,600 canciones o ~13 películas HD
   • Perfecto para estudiantes
   • Incluye envío gratis

🔹 **64GB** - $119,900
   • ~11,200 canciones o ~27 películas HD
   • Gran capacidad
   • Incluye envío gratis

🔹 **128GB** - $159,900 💎 PREMIUM
   • ~22,400 canciones o ~54 películas HD
   • Máxima capacidad
   • Incluye envío gratis

✨ **INCLUYE GRATIS:**
• Contenido personalizado a tu gusto
• Envío gratis a domicilio
• Garantía de satisfacción
• Soporte técnico

📝 ¿Cuál capacidad te interesa? (8gb, 32gb, 64gb, 128gb)`;

    const result = applyReadabilityBudget(longMessage);
    
    expect(result.wasTruncated).toBe(true);
    expect(result.message.length).toBeLessThanOrEqual(510); // 450 + CTA space
    expect(result.message).toContain("MORE");
    expect(result.pendingDetails).toBe(longMessage);
});

test('applyReadabilityBudget: respects custom maxChars', () => {
    const message = 'Este es un mensaje que tiene exactamente 100 caracteres de largo para probar el límite.';
    const result = applyReadabilityBudget(message, { maxChars: 50 });
    
    expect(result.wasTruncated).toBe(true);
});

test('applyReadabilityBudget: message at exact limit passes through', () => {
    const message = 'A'.repeat(450);
    const result = applyReadabilityBudget(message);
    
    expect(result.wasTruncated).toBe(false);
    expect(result.message).toBe(message);
});

test('applyReadabilityBudget: truncates when too many bullets', () => {
    const manyBullets = `Lista de opciones:
• Opción 1
• Opción 2
• Opción 3
• Opción 4
• Opción 5
• Opción 6
• Opción 7
• Opción 8
• Opción 9`;

    const result = applyReadabilityBudget(manyBullets, { maxBulletLines: 4 });
    
    expect(result.wasTruncated).toBe(true);
    expect(result.pendingDetails).toBe(manyBullets);
});

// ========== createPendingDetails Tests ==========
console.log('\n📌 Testing createPendingDetails()\n');

test('createPendingDetails: creates proper structure', () => {
    const content = 'Test content';
    const result = createPendingDetails(content, 'pricing');
    
    expect(result.content).toBe(content);
    expect(result.context).toBe('pricing');
    expect(result.storedAt).toBeTruthy();
});

// ========== formatPendingDetails Tests ==========
console.log('\n📌 Testing formatPendingDetails()\n');

test('formatPendingDetails: returns single chunk for short content', () => {
    const pending = createPendingDetails('Short content', 'general');
    const chunks = formatPendingDetails(pending);
    
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('Short content');
});

test('formatPendingDetails: splits very long content into chunks', () => {
    const longContent = ('A'.repeat(100) + '\n').repeat(20);
    const pending = createPendingDetails(longContent, 'pricing');
    const chunks = formatPendingDetails(pending, 450);
    
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(450);
    });
});

// ========== Session helpers Tests ==========
console.log('\n📌 Testing session helpers\n');

test('hasPendingDetails: returns true when details exist', () => {
    const conversationData = {
        pendingDetails: {
            content: 'Test',
            context: 'pricing',
            storedAt: new Date().toISOString()
        }
    };
    
    expect(hasPendingDetails(conversationData)).toBe(true);
});

test('hasPendingDetails: returns false when no details', () => {
    expect(hasPendingDetails({})).toBe(false);
    expect(hasPendingDetails(null)).toBe(false);
    expect(hasPendingDetails(undefined)).toBe(false);
});

test('getPendingDetails: returns details when present', () => {
    const details = {
        content: 'Test content',
        context: 'pricing' as const,
        storedAt: new Date().toISOString()
    };
    const conversationData = { pendingDetails: details };
    
    const result = getPendingDetails(conversationData);
    expect(result?.content).toBe('Test content');
});

test('getPendingDetails: returns null when not present', () => {
    expect(getPendingDetails({})).toBeNull();
});

test('clearPendingDetails: removes pendingDetails from object', () => {
    const conversationData = {
        pendingDetails: { content: 'Test' },
        otherData: 'preserved'
    };
    
    const result = clearPendingDetails(conversationData);
    expect(hasPendingDetails(result)).toBe(false);
    expect(result.otherData).toBe('preserved');
});

test('clearPendingDetails: handles null/undefined gracefully', () => {
    expect(clearPendingDetails(null)).toEqual({});
    expect(clearPendingDetails(undefined)).toEqual({});
});

// ========== Integration Test ==========
console.log('\n📌 Integration Test: Pricing Message Flow\n');

test('Integration: pricing message workflow', () => {
    // Simulate a long pricing message
    const pricingMessage = `💰 ¡Hola! Aquí están nuestros precios:

🔹 **8GB** - $54,900
   • ~1,400 canciones
   • Ideal para uso básico

🔹 **32GB** - $84,900 ⭐ MÁS POPULAR
   • ~5,600 canciones
   • Perfecto para estudiantes

🔹 **64GB** - $119,900
   • ~11,200 canciones
   • Gran capacidad

🔹 **128GB** - $159,900 💎 PREMIUM
   • ~22,400 canciones
   • Máxima capacidad

✨ **INCLUYE GRATIS:**
• Contenido personalizado
• Envío gratis
• Garantía de satisfacción
• Soporte técnico

📝 ¿Cuál capacidad te interesa?`;

    // Step 1: Apply budget to initial message
    const budgetResult = applyReadabilityBudget(pricingMessage);
    
    // Step 2: If truncated, create pending details
    let conversationData: any = {};
    if (budgetResult.wasTruncated) {
        conversationData.pendingDetails = createPendingDetails(
            budgetResult.pendingDetails!,
            'pricing'
        );
    }
    
    // Step 3: Simulate user requesting MORE
    const userMessage = 'más';
    expect(isMoreRequest(userMessage)).toBe(true);
    
    // Step 4: Retrieve pending details
    expect(hasPendingDetails(conversationData)).toBe(true);
    const pending = getPendingDetails(conversationData);
    expect(pending).toBeTruthy();
    
    // Step 5: Format and send details
    const chunks = formatPendingDetails(pending!);
    expect(chunks.length).toBeGreaterThan(0);
    
    // Step 6: Clear pending details after sending
    conversationData = clearPendingDetails(conversationData);
    expect(hasPendingDetails(conversationData)).toBe(false);
});

// ========== Summary ==========
console.log('\n' + '='.repeat(70));
console.log('\n📊 TEST SUMMARY\n');

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} ${r.name}`);
    if (!r.passed) {
        console.log(`   ${r.message}`);
    }
});

console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${results.length} tests`);

if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED!');
    process.exit(0);
} else {
    console.log(`\n⚠️  ${failed} test(s) failed`);
    process.exit(1);
}
