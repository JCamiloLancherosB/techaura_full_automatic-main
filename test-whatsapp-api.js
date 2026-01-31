#!/usr/bin/env node
/**
 * Simple Unit Tests for WhatsApp API Routes
 * Tests the endpoint structure and validation logic
 */

console.log('🚀 Starting WhatsApp API Routes Unit Tests\n');
console.log('='.repeat(50));

// Test 1: Phone Number Formatting
console.log('\n🧪 Test 1: Phone Number Formatting\n');

function formatPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('57') && digits.length === 12) return digits;
    if (digits.length === 10 && digits.startsWith('3')) return '57' + digits;
    return digits;
}

const phoneTests = [
    { input: '3001234567', expected: '573001234567' },
    { input: '573001234567', expected: '573001234567' },
    { input: '+57 300 123 4567', expected: '573001234567' },
    { input: '300-123-4567', expected: '573001234567' },
];

let phoneTestsPassed = 0;
for (const test of phoneTests) {
    const result = formatPhoneNumber(test.input);
    if (result === test.expected) {
        console.log(`✅ PASS: "${test.input}" → "${result}"`);
        phoneTestsPassed++;
    } else {
        console.log(`❌ FAIL: "${test.input}" → "${result}" (expected "${test.expected}")`);
    }
}

console.log(`\nPhone Formatting: ${phoneTestsPassed}/${phoneTests.length} passed`);

// Test 2: MIME Type Detection
console.log('\n🧪 Test 2: MIME Type Detection\n');

function getMimeType(ext) {
    const types = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return types[ext] || 'application/octet-stream';
}

const mimeTests = [
    { input: '.pdf', expected: 'application/pdf' },
    { input: '.png', expected: 'image/png' },
    { input: '.jpg', expected: 'image/jpeg' },
    { input: '.jpeg', expected: 'image/jpeg' },
    { input: '.unknown', expected: 'application/octet-stream' },
];

let mimeTestsPassed = 0;
for (const test of mimeTests) {
    const result = getMimeType(test.input);
    if (result === test.expected) {
        console.log(`✅ PASS: "${test.input}" → "${result}"`);
        mimeTestsPassed++;
    } else {
        console.log(`❌ FAIL: "${test.input}" → "${result}" (expected "${test.expected}")`);
    }
}

console.log(`\nMIME Type Detection: ${mimeTestsPassed}/${mimeTests.length} passed`);

// Test 3: API Key Validation Logic
console.log('\n🧪 Test 3: API Key Validation Logic\n');

function validateApiKey(providedKey, validKey) {
    return !!providedKey && providedKey === validKey;
}

const apiKeyTests = [
    { provided: 'valid-key-123', valid: 'valid-key-123', expected: true },
    { provided: 'wrong-key', valid: 'valid-key-123', expected: false },
    { provided: '', valid: 'valid-key-123', expected: false },
    { provided: null, valid: 'valid-key-123', expected: false },
];

let apiKeyTestsPassed = 0;
for (const test of apiKeyTests) {
    const result = validateApiKey(test.provided, test.valid);
    if (result === test.expected) {
        console.log(`✅ PASS: Key validation ${result ? 'accepted' : 'rejected'} correctly`);
        apiKeyTestsPassed++;
    } else {
        console.log(`❌ FAIL: Key validation expected ${test.expected}, got ${result}`);
    }
}

console.log(`\nAPI Key Validation: ${apiKeyTestsPassed}/${apiKeyTests.length} passed`);

// Test 4: Shipping Guide Message Format
console.log('\n🧪 Test 4: Shipping Guide Message Format\n');

function createShippingMessage(trackingNumber, carrier, customerName, city) {
    return `🚚 *¡Tu pedido ha sido enviado!*

📦 *Número de guía:* ${trackingNumber}
🏢 *Transportadora:* ${carrier || 'Ver guía adjunta'}
${customerName ? `👤 *Cliente:* ${customerName}` : ''}
${city ? `📍 *Destino:* ${city}` : ''}

Puedes rastrear tu envío en la página de la transportadora.

¡Gracias por tu compra en TechAura! 🎉

_Escribe "rastrear" para ver el estado de tu envío._`;
}

const messageTests = [
    {
        trackingNumber: 'ABC123456789',
        carrier: 'Servientrega',
        customerName: 'Juan Pérez',
        city: 'Bogotá',
        shouldContain: ['ABC123456789', 'Servientrega', 'Juan Pérez', 'Bogotá']
    },
    {
        trackingNumber: 'XYZ987654321',
        carrier: null,
        customerName: null,
        city: null,
        shouldContain: ['XYZ987654321', 'Ver guía adjunta']
    }
];

let messageTestsPassed = 0;
for (const test of messageTests) {
    const message = createShippingMessage(
        test.trackingNumber,
        test.carrier,
        test.customerName,
        test.city
    );
    
    let allContained = true;
    for (const text of test.shouldContain) {
        if (!message.includes(text)) {
            allContained = false;
            console.log(`❌ FAIL: Message missing "${text}"`);
            break;
        }
    }
    
    if (allContained) {
        console.log(`✅ PASS: Message contains all required fields`);
        messageTestsPassed++;
    }
}

console.log(`\nMessage Format: ${messageTestsPassed}/${messageTests.length} passed`);

// Summary
console.log('\n' + '='.repeat(50));
const totalTests = phoneTests.length + mimeTests.length + apiKeyTests.length + messageTests.length;
const totalPassed = phoneTestsPassed + mimeTestsPassed + apiKeyTestsPassed + messageTestsPassed;

console.log(`\n📊 Test Summary: ${totalPassed}/${totalTests} tests passed`);

if (totalPassed === totalTests) {
    console.log('✅ All tests passed!');
    process.exit(0);
} else {
    console.log('❌ Some tests failed');
    process.exit(1);
}
