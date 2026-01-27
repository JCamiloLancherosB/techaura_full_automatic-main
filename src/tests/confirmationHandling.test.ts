/**
 * Tests for Confirmation Handling (YES/NO Fast-Path)
 * 
 * Validates that short responses like "si", "sí", "ok", "dale", "listo" 
 * are correctly classified as CONFIRM_YES and "no", "nel", "negativo" as CONFIRM_NO
 * 
 * Run with: npx tsx src/tests/confirmationHandling.test.ts
 */

import { 
    normalizeText,
    classifyYesNoResponse,
    isYesConfirmation,
    isNoConfirmation,
    isConfirmation,
    type ConfirmationType
} from '../utils/textUtils';

interface TestCase {
    input: string;
    expected: ConfirmationType;
    description: string;
}

// ========== YES_NO CLASSIFICATION TESTS ==========
console.log('🧪 Testing classifyYesNoResponse()\n');
console.log('='.repeat(70));

const yesNoTestCases: TestCase[] = [
    // YES confirmations - standard
    { input: 'si', expected: 'CONFIRM_YES', description: 'Simple "si" without accent' },
    { input: 'sí', expected: 'CONFIRM_YES', description: 'Simple "sí" with accent' },
    { input: 'Si', expected: 'CONFIRM_YES', description: 'Capitalized "Si"' },
    { input: 'SÍ', expected: 'CONFIRM_YES', description: 'Uppercase "SÍ"' },
    { input: 'ok', expected: 'CONFIRM_YES', description: 'Simple "ok"' },
    { input: 'OK', expected: 'CONFIRM_YES', description: 'Uppercase "OK"' },
    { input: 'dale', expected: 'CONFIRM_YES', description: 'Colombian "dale"' },
    { input: 'listo', expected: 'CONFIRM_YES', description: 'Simple "listo"' },
    { input: 'claro', expected: 'CONFIRM_YES', description: 'Simple "claro"' },
    { input: 'perfecto', expected: 'CONFIRM_YES', description: 'Simple "perfecto"' },
    { input: 'va', expected: 'CONFIRM_YES', description: 'Simple "va"' },
    { input: 'bien', expected: 'CONFIRM_YES', description: 'Simple "bien"' },
    { input: 'bueno', expected: 'CONFIRM_YES', description: 'Simple "bueno"' },
    { input: 'correcto', expected: 'CONFIRM_YES', description: 'Simple "correcto"' },
    { input: 'confirmo', expected: 'CONFIRM_YES', description: 'Simple "confirmo"' },
    { input: 'acepto', expected: 'CONFIRM_YES', description: 'Simple "acepto"' },
    
    // YES confirmations with whitespace
    { input: '  si  ', expected: 'CONFIRM_YES', description: '"si" with extra spaces' },
    { input: '\tOK\n', expected: 'CONFIRM_YES', description: '"OK" with tabs and newlines' },
    
    // NO confirmations - standard
    { input: 'no', expected: 'CONFIRM_NO', description: 'Simple "no"' },
    { input: 'No', expected: 'CONFIRM_NO', description: 'Capitalized "No"' },
    { input: 'NO', expected: 'CONFIRM_NO', description: 'Uppercase "NO"' },
    { input: 'nel', expected: 'CONFIRM_NO', description: 'Colombian slang "nel"' },
    { input: 'negativo', expected: 'CONFIRM_NO', description: 'Formal "negativo"' },
    { input: 'nope', expected: 'CONFIRM_NO', description: 'English "nope"' },
    { input: 'nada', expected: 'CONFIRM_NO', description: 'Simple "nada"' },
    { input: 'cancelar', expected: 'CONFIRM_NO', description: 'Action "cancelar"' },
    
    // Ambiguous/long inputs - should return null
    { input: 'si me interesa el producto', expected: null, description: 'Long message containing "si"' },
    { input: 'quiero saber el precio', expected: null, description: 'Inquiry about price (too long)' },
    { input: 'hola buenos dias', expected: null, description: 'Greeting' },
    { input: '', expected: null, description: 'Empty string' },
    { input: '   ', expected: null, description: 'Whitespace only' },
    { input: 'precio', expected: null, description: 'Single word not yes/no' },
    { input: '8gb', expected: null, description: 'Capacity selection' },
    { input: 'musica', expected: null, description: 'Product type' },
    
    // Edge cases
    { input: 'simon', expected: null, description: '"simon" is not a standard confirmation' },
    { input: 'okey dokey', expected: 'CONFIRM_YES', description: 'Compound phrase with "okey" - should match' },
];

let passed = 0;
let failed = 0;

yesNoTestCases.forEach((test, i) => {
    const result = classifyYesNoResponse(test.input);
    const success = result === test.expected;
    
    if (success) {
        passed++;
        console.log(`✅ Test ${i + 1}: ${test.description}`);
        console.log(`   Input: "${test.input}" -> ${result ?? 'null'}`);
    } else {
        failed++;
        console.log(`❌ Test ${i + 1}: ${test.description}`);
        console.log(`   Input: "${test.input}"`);
        console.log(`   Expected: ${test.expected ?? 'null'}, Got: ${result ?? 'null'}`);
    }
    console.log('');
});

// ========== NORMALIZATION TESTS ==========
console.log('\n🧪 Testing normalizeText() for accents\n');
console.log('='.repeat(70));

const normalizationTests = [
    { input: 'sí', expected: 'si', desc: 'Remove accent from sí' },
    { input: 'SÍ', expected: 'si', desc: 'Lowercase and remove accent' },
    { input: '  Sí  ', expected: 'si', desc: 'Trim and normalize' },
    { input: 'MÚSICA', expected: 'musica', desc: 'Remove accent from ú' },
    { input: 'cancíon', expected: 'cancion', desc: 'Remove accent from í' },
];

normalizationTests.forEach((test, i) => {
    const result = normalizeText(test.input);
    const pass = result === test.expected;
    if (pass) {
        passed++;
        console.log(`✅ Test: ${test.desc}`);
    } else {
        failed++;
        console.log(`❌ Test: ${test.desc}`);
        console.log(`   Expected: "${test.expected}", Got: "${result}"`);
    }
    console.log(`   Input: "${test.input}" -> "${result}"`);
    console.log('');
});

// ========== HELPER FUNCTION TESTS ==========
console.log('\n🧪 Testing helper functions isYesConfirmation() and isNoConfirmation()\n');
console.log('='.repeat(70));

const helperTests = [
    { fn: 'isYesConfirmation', input: 'si', expected: true },
    { fn: 'isYesConfirmation', input: 'sí', expected: true },
    { fn: 'isYesConfirmation', input: 'no', expected: false },
    { fn: 'isYesConfirmation', input: 'hola', expected: false },
    { fn: 'isNoConfirmation', input: 'no', expected: true },
    { fn: 'isNoConfirmation', input: 'nel', expected: true },
    { fn: 'isNoConfirmation', input: 'si', expected: false },
    { fn: 'isNoConfirmation', input: 'hola', expected: false },
];

helperTests.forEach((test) => {
    const result = test.fn === 'isYesConfirmation' 
        ? isYesConfirmation(test.input) 
        : isNoConfirmation(test.input);
    const pass = result === test.expected;
    
    if (pass) {
        passed++;
        console.log(`✅ ${test.fn}("${test.input}") -> ${result}`);
    } else {
        failed++;
        console.log(`❌ ${test.fn}("${test.input}")`);
        console.log(`   Expected: ${test.expected}, Got: ${result}`);
    }
});

// ========== LEGACY isConfirmation TESTS ==========
console.log('\n🧪 Testing legacy isConfirmation() still works\n');
console.log('='.repeat(70));

const legacyTests = [
    { input: 'si', expected: true },
    { input: 'ok', expected: true },
    { input: 'dale', expected: true },
    { input: 'listo', expected: true },
    { input: 'no', expected: false }, // "no" is not a confirmation
    { input: 'precio', expected: false },
];

legacyTests.forEach((test) => {
    const result = isConfirmation(test.input);
    const pass = result === test.expected;
    
    if (pass) {
        passed++;
        console.log(`✅ isConfirmation("${test.input}") -> ${result}`);
    } else {
        failed++;
        console.log(`❌ isConfirmation("${test.input}")`);
        console.log(`   Expected: ${test.expected}, Got: ${result}`);
    }
});

// ========== SUMMARY ==========
console.log('\n' + '='.repeat(70));
console.log('\n📊 TEST SUMMARY\n');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    process.exit(0);
} else {
    console.log(`⚠️  ${failed} test(s) failed`);
    process.exit(1);
}
