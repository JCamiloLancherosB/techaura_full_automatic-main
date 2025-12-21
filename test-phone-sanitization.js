// Test script to verify phone sanitization function
// This tests the sanitizePhoneForDB function that prevents ER_DATA_TOO_LONG errors

/**
 * Simulates the sanitizePhoneForDB function
 */
function sanitizePhoneForDB(phone) {
    if (!phone || typeof phone !== 'string') {
        console.warn('⚠️ Invalid phone number for DB sanitization:', phone);
        return '';
    }

    // Remove JID suffixes and clean
    const cleaned = phone
        .replace(/@s\.whatsapp\.net$/i, '')
        .replace(/@c\.us$/i, '')
        .replace(/@lid$/i, '')
        .replace(/@g\.us$/i, '')
        .replace(/@broadcast$/i, '')
        .replace(/\D/g, ''); // Remove all non-digit characters

    // Cap at 20 characters (DB column limit)
    if (cleaned.length > 20) {
        console.warn(`⚠️ Phone number too long for DB (${cleaned.length} chars), truncating to 20: ${cleaned} -> ${cleaned.substring(0, 20)}`);
        return cleaned.substring(0, 20);
    }

    return cleaned;
}

// Test cases from the problem statement
const testCases = [
    // Problem numbers from error logs (these are under 20 chars, but likely had JID suffixes in production)
    { input: '88437688398009', expected: '88437688398009', description: 'Problem number 1 (14 chars, fits)' },
    { input: '171622614986846', expected: '171622614986846', description: 'Problem number 2 (15 chars, fits)' },
    { input: '194673855438963', expected: '194673855438963', description: 'Problem number 3 (15 chars, fits)' },
    
    // Numbers with JID suffixes (this is the actual problem case)
    { input: '573001234567@s.whatsapp.net', expected: '573001234567', description: 'Phone with @s.whatsapp.net suffix' },
    { input: '573001234567@c.us', expected: '573001234567', description: 'Phone with @c.us suffix' },
    { input: '88437688398009@s.whatsapp.net', expected: '88437688398009', description: 'Problem number with JID suffix' },
    { input: '171622614986846@s.whatsapp.net', expected: '171622614986846', description: 'Problem number 2 with JID suffix (fits after cleaning)' },
    
    // Numbers longer than 20 chars (need truncation)
    { input: '123456789012345678901234567890', expected: '12345678901234567890', description: 'Very long number (30 chars) truncated to 20' },
    { input: '12345678901234567890123@s.whatsapp.net', expected: '12345678901234567890', description: 'Number > 20 chars with JID suffix, truncated' },
    
    // Normal cases
    { input: '573001234567', expected: '573001234567', description: 'Normal Colombian number' },
    { input: '+57 300 123 4567', expected: '573001234567', description: 'Formatted Colombian number' },
    { input: '(57) 300-123-4567', expected: '573001234567', description: 'Colombian number with formatting' },
    
    // Edge cases
    { input: '', expected: '', description: 'Empty string' },
    { input: null, expected: '', description: 'Null value' },
    { input: undefined, expected: '', description: 'Undefined value' },
];

console.log('🧪 Testing Phone Sanitization Function\n');
console.log('=' . repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
    console.log(`\nTest ${index + 1}: ${testCase.description}`);
    console.log(`Input: "${testCase.input}"`);
    
    const result = sanitizePhoneForDB(testCase.input);
    console.log(`Result: "${result}"`);
    console.log(`Expected: "${testCase.expected}"`);
    
    if (result === testCase.expected) {
        console.log('✅ PASS');
        passed++;
    } else {
        console.log('❌ FAIL');
        failed++;
    }
});

console.log('\n' + '='.repeat(80));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
} else {
    console.log('❌ Some tests failed');
    process.exit(1);
}
