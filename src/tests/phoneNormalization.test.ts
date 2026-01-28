/**
 * Validation tests for phone number normalization
 * 
 * Tests the normalizePhoneId function to ensure consistent phone identification
 * regardless of input format (JID suffixes, formatting, etc.)
 * 
 * Run with: npx tsx src/tests/phoneNormalization.test.ts
 */

import { normalizePhoneId, hashPhone } from '../utils/phoneHasher';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.log(`  ❌ ${message}`);
    }
}

function assertEqual(actual: string, expected: string, message: string): void {
    if (actual === expected) {
        passed++;
        console.log(`  ✅ ${message}: "${actual}"`);
    } else {
        failed++;
        console.log(`  ❌ ${message}: expected "${expected}", got "${actual}"`);
    }
}

console.log('\n=== Phone Normalization Tests ===\n');

console.log('1. JID suffix stripping:');
assertEqual(normalizePhoneId('157595436335191@lid'), '157595436335191', '@lid suffix stripped');
assertEqual(normalizePhoneId('573136524181@s.whatsapp.net'), '573136524181', '@s.whatsapp.net suffix stripped');
assertEqual(normalizePhoneId('573136524181@c.us'), '573136524181', '@c.us suffix stripped');
assertEqual(normalizePhoneId('573136524181@g.us'), '573136524181', '@g.us suffix stripped');
assertEqual(normalizePhoneId('573136524181@broadcast'), '573136524181', '@broadcast suffix stripped');
assertEqual(normalizePhoneId('573136524181@S.WHATSAPP.NET'), '573136524181', 'Case-insensitive suffix handling');
assertEqual(normalizePhoneId('573136524181@LID'), '573136524181', 'Case-insensitive @LID handling');

console.log('\n2. Formatting removal:');
assertEqual(normalizePhoneId('+57 313 652 4181'), '573136524181', 'Spaces removed');
assertEqual(normalizePhoneId('57-313-652-4181'), '573136524181', 'Dashes removed');
assertEqual(normalizePhoneId('(57) 313-652-4181'), '573136524181', 'Parentheses removed');
assertEqual(normalizePhoneId('+573136524181'), '573136524181', 'Plus sign removed');
assertEqual(normalizePhoneId('(+57) 313-652-4181'), '573136524181', 'Complex formatting removed');

console.log('\n3. Edge cases:');
assertEqual(normalizePhoneId(null), '', 'null returns empty string');
assertEqual(normalizePhoneId(undefined), '', 'undefined returns empty string');
assertEqual(normalizePhoneId(''), '', 'Empty string returns empty string');
assertEqual(normalizePhoneId('  573136524181  '), '573136524181', 'Whitespace trimmed');
assertEqual(normalizePhoneId('573136524181'), '573136524181', 'Plain phone number unchanged');

console.log('\n4. Canonical consistency (all formats normalize to same value):');
const formats = [
    '573136524181',
    '573136524181@lid',
    '573136524181@s.whatsapp.net',
    '573136524181@c.us',
    '+57 313 652 4181',
    '(57) 313-652-4181'
];
const normalized = formats.map(f => normalizePhoneId(f));
const allSame = normalized.every(n => n === '573136524181');
assert(allSame, `All ${formats.length} formats normalize to "573136524181"`);

console.log('\n5. Hash consistency:');
const hashPlain = hashPhone('573136524181');
const hashLid = hashPhone('573136524181@lid');
const hashJid = hashPhone('573136524181@s.whatsapp.net');
const hashFormatted = hashPhone('+57 313 652 4181');

assert(hashPlain === hashLid, `hashPhone("573136524181") === hashPhone("573136524181@lid")`);
assert(hashPlain === hashJid, `hashPhone("573136524181") === hashPhone("573136524181@s.whatsapp.net")`);
assert(hashPlain === hashFormatted, `hashPhone("573136524181") === hashPhone("+57 313 652 4181")`);

// Problem case from issue
const hash1 = hashPhone('157595436335191@lid');
const hash2 = hashPhone('157595436335191');
assert(hash1 === hash2, `hashPhone("157595436335191@lid") === hashPhone("157595436335191")`);

console.log('\n6. Hash edge cases:');
assert(hashPhone(null) === 'unknown', 'hashPhone(null) returns "unknown"');
assert(hashPhone(undefined) === 'unknown', 'hashPhone(undefined) returns "unknown"');
assert(hashPhone('') === 'unknown', 'hashPhone("") returns "unknown"');
assert(hashPhone('573136524181').length === 16, 'hashPhone returns 16-character hash');

console.log('\n7. Integration: state consistency simulation');
// Simulate a Map-based cache (like FlowContinuityService's stateCache)
const stateCache = new Map<string, string>();

// Set state using @lid format (as might happen in production)
const phoneWithLid = '157595436335191@lid';
const canonicalPhone = normalizePhoneId(phoneWithLid);
stateCache.set(canonicalPhone, 'some_state');

// Lookup using plain phone format
const plainPhone = '157595436335191';
const lookupKey = normalizePhoneId(plainPhone);
assert(stateCache.get(lookupKey) === 'some_state', 'State set with @lid can be retrieved with plain phone');

// Clear and test reverse
stateCache.clear();
stateCache.set(normalizePhoneId('573136524181'), 'another_state');
assert(stateCache.get(normalizePhoneId('573136524181@s.whatsapp.net')) === 'another_state', 
    'State set with plain phone can be retrieved with JID format');

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
    console.log('\n✅ All tests passed! Phone normalization is working correctly.\n');
    process.exit(0);
} else {
    console.log('\n❌ Some tests failed! Please review the failures above.\n');
    process.exit(1);
}

