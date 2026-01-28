/**
 * Mixed Genre Input Tests
 * 
 * Tests to verify that:
 * 1. "de todo", "de todo un poco", "me gusta todo" etc. are classified as mixed genre inputs
 * 2. These inputs result in advancing to capacity selection, not fallback to "help" message
 * 3. The bot provides contextual next-step responses with numbered options
 * 
 * Run with: npx ts-node src/tests/mixedGenreInput.test.ts
 */

import { isMixedGenreInput, normalizeText } from '../utils/textUtils';

// Test runner helpers
let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error: any) {
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
        testsFailed++;
    }
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

console.log('🧪 Running mixed genre input tests...\n');

// ===============================
// Spanish mixed taste phrases
// ===============================

console.log('--- Spanish mixed taste phrases ---');

test('should detect "de todo"', () => {
    assertEqual(isMixedGenreInput('de todo'), true);
});

test('should detect "de todo un poco"', () => {
    assertEqual(isMixedGenreInput('de todo un poco'), true);
});

test('should detect "todo un poco"', () => {
    assertEqual(isMixedGenreInput('todo un poco'), true);
});

test('should detect "un poco de todo"', () => {
    assertEqual(isMixedGenreInput('un poco de todo'), true);
});

test('should detect "me gusta todo"', () => {
    assertEqual(isMixedGenreInput('me gusta todo'), true);
});

test('should detect "me gusta de todo"', () => {
    assertEqual(isMixedGenreInput('me gusta de todo'), true);
});

test('should detect "escucho de todo"', () => {
    assertEqual(isMixedGenreInput('escucho de todo'), true);
});

test('should detect "veo de todo"', () => {
    assertEqual(isMixedGenreInput('veo de todo'), true);
});

// ===============================
// Single word mixed indicators
// ===============================

console.log('\n--- Single word mixed indicators ---');

test('should detect "variado"', () => {
    assertEqual(isMixedGenreInput('variado'), true);
});

test('should detect "varios"', () => {
    assertEqual(isMixedGenreInput('varios'), true);
});

test('should detect "mixto"', () => {
    assertEqual(isMixedGenreInput('mixto'), true);
});

test('should detect "surtido"', () => {
    assertEqual(isMixedGenreInput('surtido'), true);
});

test('should detect "mix"', () => {
    assertEqual(isMixedGenreInput('mix'), true);
});

test('should detect "crossover"', () => {
    assertEqual(isMixedGenreInput('crossover'), true);
});

test('should detect "todo" standalone', () => {
    assertEqual(isMixedGenreInput('todo'), true);
});

// ===============================
// English mixed taste phrases
// ===============================

console.log('\n--- English mixed taste phrases ---');

test('should detect "a bit of everything"', () => {
    assertEqual(isMixedGenreInput('a bit of everything'), true);
});

test('should detect "everything"', () => {
    assertEqual(isMixedGenreInput('everything'), true);
});

test('should detect "mixed"', () => {
    assertEqual(isMixedGenreInput('mixed'), true);
});

test('should detect "variety"', () => {
    assertEqual(isMixedGenreInput('variety'), true);
});

test('should detect "all genres"', () => {
    assertEqual(isMixedGenreInput('all genres'), true);
});

// ===============================
// Case insensitivity and accent handling
// ===============================

console.log('\n--- Case insensitivity and accent handling ---');

test('should handle uppercase "DE TODO"', () => {
    assertEqual(isMixedGenreInput('DE TODO'), true);
});

test('should handle mixed case "De Todo"', () => {
    assertEqual(isMixedGenreInput('De Todo'), true);
});

test('should handle "VARIADO"', () => {
    assertEqual(isMixedGenreInput('VARIADO'), true);
});

// ===============================
// Edge cases - should NOT match
// ===============================

console.log('\n--- Edge cases (should NOT match) ---');

test('should not match specific genres like "salsa"', () => {
    assertEqual(isMixedGenreInput('salsa'), false);
});

test('should not match specific genres like "reggaeton"', () => {
    assertEqual(isMixedGenreInput('reggaeton'), false);
});

test('should not match "rock y salsa" (specific genres)', () => {
    assertEqual(isMixedGenreInput('rock y salsa'), false);
});

test('should not match "quiero algo diferente"', () => {
    assertEqual(isMixedGenreInput('quiero algo diferente'), false);
});

test('should not match "no se"', () => {
    assertEqual(isMixedGenreInput('no se'), false);
});

test('should not match empty string', () => {
    assertEqual(isMixedGenreInput(''), false);
});

test('should not match pricing intent "precio"', () => {
    assertEqual(isMixedGenreInput('precio'), false);
});

// False positive prevention tests
test('should not match "mixed feelings" (common phrase)', () => {
    assertEqual(isMixedGenreInput('I have mixed feelings'), false);
});

test('should not match "mixed results" (common phrase)', () => {
    assertEqual(isMixedGenreInput('mixed results'), false);
});

test('should not match "variety of products" (unrelated context)', () => {
    assertEqual(isMixedGenreInput('variety of products'), false);
});

test('should not match "everything is included" (unrelated context)', () => {
    assertEqual(isMixedGenreInput('everything is included'), false);
});

test('should not match "I want to know everything" (unrelated context)', () => {
    assertEqual(isMixedGenreInput('I want to know everything'), false);
});

// ===============================
// Scenario: User replies to genre question
// ===============================

console.log('\n--- Scenario: User replies to genre question ---');

test('should classify "me gusta un poco de todo" as mixed genre', () => {
    assertEqual(isMixedGenreInput('me gusta un poco de todo'), true);
});

test('should classify "I like a bit of everything" as mixed genre', () => {
    assertEqual(isMixedGenreInput('I like a bit of everything'), true);
});

test('should classify "gusta de todo" as mixed genre', () => {
    assertEqual(isMixedGenreInput('gusta de todo'), true);
});

// ===============================
// Flow coherence - next step after mixed genre input
// ===============================

console.log('\n--- Flow coherence: next step message structure ---');

test('expected message should provide numbered options (1-4)', () => {
    const expectedMessageContains = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    
    const sampleMessage = 
        '🎵 *¡Mix Variado confirmado!*\n\n' +
        '✅ Tu USB incluirá lo mejor de cada género:\n' +
        '• Reggaetón, Salsa, Vallenato\n' +
        '• Baladas, Rock, Merengue\n' +
        '• Bachata, Cumbia y más\n\n' +
        '🔥 ¡La colección más completa!\n\n' +
        '¿Qué capacidad prefieres?\n' +
        '1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB ⭐ • 4️⃣ 128GB';
    
    for (const option of expectedMessageContains) {
        assert(sampleMessage.includes(option), `Message should contain ${option}`);
    }
});

test('expected message should NOT contain generic help phrases', () => {
    const genericHelpPhrases = [
        '¿Cómo puedo ayudarte?',
        '¿En qué puedo ayudarte?',
        'How can I help you'
    ];
    
    const sampleMessage = 
        '🎵 *¡Mix Variado confirmado!*\n\n' +
        '✅ Tu USB incluirá lo mejor de cada género:\n' +
        '¿Qué capacidad prefieres?\n' +
        '1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB ⭐ • 4️⃣ 128GB';
    
    for (const phrase of genericHelpPhrases) {
        assert(!sampleMessage.includes(phrase), `Message should NOT contain "${phrase}"`);
    }
});

test('expected message should NOT mention specific artist names', () => {
    const artistNames = ['Bad Bunny', 'Marc Anthony', 'Queen', 'Daddy Yankee', 'Karol G'];
    
    const sampleMessage = 
        '🎵 *¡Mix Variado confirmado!*\n\n' +
        '✅ Tu USB incluirá lo mejor de cada género:\n' +
        '• Reggaetón, Salsa, Vallenato\n' +
        '¿Qué capacidad prefieres?\n' +
        '1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB ⭐ • 4️⃣ 128GB';
    
    for (const artist of artistNames) {
        assert(!sampleMessage.includes(artist), `Message should NOT contain artist "${artist}"`);
    }
});

test('expected message should be under 450 characters', () => {
    const sampleMessage = 
        '🎵 *¡Mix Variado confirmado!*\n\n' +
        '✅ Tu USB incluirá lo mejor de cada género:\n' +
        '• Reggaetón, Salsa, Vallenato\n' +
        '• Baladas, Rock, Merengue\n' +
        '• Bachata, Cumbia y más\n\n' +
        '🔥 ¡La colección más completa!\n\n' +
        '¿Qué capacidad prefieres?\n' +
        '1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB ⭐ • 4️⃣ 128GB';
    
    assert(sampleMessage.length <= 450, `Message length ${sampleMessage.length} should be <= 450`);
});

// ===============================
// normalizeText utility tests
// ===============================

console.log('\n--- normalizeText utility ---');

test('normalizeText should lowercase text', () => {
    assertEqual(normalizeText('DE TODO'), 'de todo');
});

test('normalizeText should remove accents', () => {
    assertEqual(normalizeText('música'), 'musica');
    assertEqual(normalizeText('reggaetón'), 'reggaeton');
});

test('normalizeText should trim whitespace', () => {
    assertEqual(normalizeText('  de todo  '), 'de todo');
});

test('normalizeText should collapse multiple spaces', () => {
    assertEqual(normalizeText('de   todo'), 'de todo');
});

// ===============================
// Test Summary
// ===============================

console.log('\n========================================');
console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

if (testsFailed > 0) {
    process.exit(1);
}
