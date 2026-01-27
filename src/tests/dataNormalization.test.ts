/**
 * Test file for data normalization utilities
 * Run with: npx ts-node src/tests/dataNormalization.test.ts
 */

import {
    normalizeStatus,
    normalizeCapacity,
    normalizeContentType,
    isValidStatus,
    isValidCapacity,
    isValidContentType,
    validateAndNormalizeOrderData,
    VALID_ORDER_STATUSES,
    VALID_CAPACITIES,
    VALID_CONTENT_TYPES,
} from '../constants/dataNormalization';

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

console.log('🧪 Running data normalization tests...\n');

// ===============================
// Status Normalization Tests
// ===============================
console.log('--- Status Normalization Tests ---');

test('normalizeStatus: canonical values remain unchanged', () => {
    assertEqual(normalizeStatus('pending'), 'pending');
    assertEqual(normalizeStatus('confirmed'), 'confirmed');
    assertEqual(normalizeStatus('processing'), 'processing');
    assertEqual(normalizeStatus('completed'), 'completed');
    assertEqual(normalizeStatus('cancelled'), 'cancelled');
});

test('normalizeStatus: Spanish translations are normalized', () => {
    assertEqual(normalizeStatus('pendiente'), 'pending');
    assertEqual(normalizeStatus('confirmado'), 'confirmed');
    assertEqual(normalizeStatus('procesando'), 'processing');
    assertEqual(normalizeStatus('en_proceso'), 'processing');
    assertEqual(normalizeStatus('completado'), 'completed');
    assertEqual(normalizeStatus('cancelado'), 'cancelled');
});

test('normalizeStatus: common typos are normalized', () => {
    assertEqual(normalizeStatus('peding'), 'pending');
    assertEqual(normalizeStatus('pendig'), 'pending');
    assertEqual(normalizeStatus('confimed'), 'confirmed');
    assertEqual(normalizeStatus('procesing'), 'processing');
    assertEqual(normalizeStatus('proccessing'), 'processing');
    assertEqual(normalizeStatus('complted'), 'completed');
    assertEqual(normalizeStatus('canceld'), 'cancelled');
    assertEqual(normalizeStatus('canceled'), 'cancelled');
});

test('normalizeStatus: DB statuses are mapped', () => {
    assertEqual(normalizeStatus('error'), 'cancelled');
    assertEqual(normalizeStatus('failed'), 'cancelled');
});

test('normalizeStatus: case insensitive', () => {
    assertEqual(normalizeStatus('PENDING'), 'pending');
    assertEqual(normalizeStatus('Confirmed'), 'confirmed');
    assertEqual(normalizeStatus('PROCESSING'), 'processing');
});

test('normalizeStatus: unknown value defaults to pending', () => {
    assertEqual(normalizeStatus('unknown'), 'pending');
    assertEqual(normalizeStatus(''), 'pending');
    assertEqual(normalizeStatus(null), 'pending');
    assertEqual(normalizeStatus(undefined), 'pending');
});

// ===============================
// Capacity Normalization Tests
// ===============================
console.log('\n--- Capacity Normalization Tests ---');

test('normalizeCapacity: canonical values remain unchanged', () => {
    assertEqual(normalizeCapacity('8GB'), '8GB');
    assertEqual(normalizeCapacity('32GB'), '32GB');
    assertEqual(normalizeCapacity('64GB'), '64GB');
    assertEqual(normalizeCapacity('128GB'), '128GB');
    assertEqual(normalizeCapacity('256GB'), '256GB');
});

test('normalizeCapacity: lowercase variations are normalized', () => {
    assertEqual(normalizeCapacity('8gb'), '8GB');
    assertEqual(normalizeCapacity('32gb'), '32GB');
    assertEqual(normalizeCapacity('64gb'), '64GB');
    assertEqual(normalizeCapacity('128gb'), '128GB');
});

test('normalizeCapacity: numeric values are normalized', () => {
    assertEqual(normalizeCapacity('8'), '8GB');
    assertEqual(normalizeCapacity('32'), '32GB');
    assertEqual(normalizeCapacity('64'), '64GB');
    assertEqual(normalizeCapacity('128'), '128GB');
});

test('normalizeCapacity: variations with spaces are normalized', () => {
    assertEqual(normalizeCapacity('8 GB'), '8GB');
    assertEqual(normalizeCapacity('32 GB'), '32GB');
    assertEqual(normalizeCapacity('64 GB'), '64GB');
});

test('normalizeCapacity: unknown value defaults to 32GB', () => {
    assertEqual(normalizeCapacity('unknown'), '32GB');
    assertEqual(normalizeCapacity(''), '32GB');
    assertEqual(normalizeCapacity(null), '32GB');
    assertEqual(normalizeCapacity(undefined), '32GB');
});

// ===============================
// Content Type Normalization Tests
// ===============================
console.log('\n--- Content Type Normalization Tests ---');

test('normalizeContentType: canonical values remain unchanged', () => {
    assertEqual(normalizeContentType('music'), 'music');
    assertEqual(normalizeContentType('videos'), 'videos');
    assertEqual(normalizeContentType('movies'), 'movies');
    assertEqual(normalizeContentType('series'), 'series');
    assertEqual(normalizeContentType('mixed'), 'mixed');
});

test('normalizeContentType: Spanish translations are normalized', () => {
    assertEqual(normalizeContentType('musica'), 'music');
    assertEqual(normalizeContentType('música'), 'music');
    assertEqual(normalizeContentType('pelicula'), 'movies');
    assertEqual(normalizeContentType('películas'), 'movies');
    assertEqual(normalizeContentType('serie'), 'series');
    assertEqual(normalizeContentType('mixto'), 'mixed');
});

test('normalizeContentType: common variations are normalized', () => {
    assertEqual(normalizeContentType('video'), 'videos');
    assertEqual(normalizeContentType('movie'), 'movies');
    assertEqual(normalizeContentType('film'), 'movies');
    assertEqual(normalizeContentType('films'), 'movies');
    assertEqual(normalizeContentType('tv'), 'series');
    assertEqual(normalizeContentType('tv_series'), 'series');
    assertEqual(normalizeContentType('all'), 'mixed');
    assertEqual(normalizeContentType('combo'), 'mixed');
    assertEqual(normalizeContentType('custom'), 'mixed');
});

test('normalizeContentType: case insensitive', () => {
    assertEqual(normalizeContentType('MUSIC'), 'music');
    assertEqual(normalizeContentType('Videos'), 'videos');
    assertEqual(normalizeContentType('MOVIES'), 'movies');
});

test('normalizeContentType: unknown value defaults to music', () => {
    assertEqual(normalizeContentType('unknown'), 'music');
    assertEqual(normalizeContentType(''), 'music');
    assertEqual(normalizeContentType(null), 'music');
    assertEqual(normalizeContentType(undefined), 'music');
});

// ===============================
// Validation Tests
// ===============================
console.log('\n--- Validation Tests ---');

test('isValidStatus: returns true for valid statuses', () => {
    assert(isValidStatus('pending'), 'pending should be valid');
    assert(isValidStatus('confirmed'), 'confirmed should be valid');
    assert(isValidStatus('pendiente'), 'pendiente should be valid');
});

test('isValidStatus: returns false for invalid statuses', () => {
    assert(!isValidStatus('invalid'), 'invalid should be invalid');
    assert(!isValidStatus(''), 'empty string should be invalid');
    assert(!isValidStatus(null), 'null should be invalid');
});

test('isValidCapacity: returns true for valid capacities', () => {
    assert(isValidCapacity('8GB'), '8GB should be valid');
    assert(isValidCapacity('32gb'), '32gb should be valid');
    assert(isValidCapacity('128'), '128 should be valid');
});

test('isValidCapacity: returns false for invalid capacities', () => {
    assert(!isValidCapacity('100GB'), '100GB should be invalid');
    assert(!isValidCapacity(''), 'empty string should be invalid');
    assert(!isValidCapacity(null), 'null should be invalid');
});

test('isValidContentType: returns true for valid content types', () => {
    assert(isValidContentType('music'), 'music should be valid');
    assert(isValidContentType('videos'), 'videos should be valid');
    assert(isValidContentType('musica'), 'musica should be valid');
});

test('isValidContentType: returns false for invalid content types', () => {
    assert(!isValidContentType('invalid'), 'invalid should be invalid');
    assert(!isValidContentType(''), 'empty string should be invalid');
    assert(!isValidContentType(null), 'null should be invalid');
});

// ===============================
// Combined Validation Tests
// ===============================
console.log('\n--- Combined Validation Tests ---');

test('validateAndNormalizeOrderData: normalizes all fields', () => {
    const result = validateAndNormalizeOrderData({
        status: 'pendiente',
        capacity: '32gb',
        contentType: 'musica',
    });
    
    assertEqual(result.normalized.status, 'pending');
    assertEqual(result.normalized.capacity, '32GB');
    assertEqual(result.normalized.contentType, 'music');
    assertEqual(result.warnings.length, 0); // These are valid values that can be normalized
});

test('validateAndNormalizeOrderData: warns about unknown values', () => {
    const result = validateAndNormalizeOrderData({
        status: 'unknown_status',
        capacity: 'unknown_capacity',
        contentType: 'unknown_type',
    });
    
    // Should still normalize to defaults
    assertEqual(result.normalized.status, 'pending');
    assertEqual(result.normalized.capacity, '32GB');
    assertEqual(result.normalized.contentType, 'music');
    // Should have warnings
    assertEqual(result.warnings.length, 3);
});

// ===============================
// Summary
// ===============================
console.log('\n=================================');
console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('=================================');

if (testsFailed > 0) {
    process.exit(1);
}
