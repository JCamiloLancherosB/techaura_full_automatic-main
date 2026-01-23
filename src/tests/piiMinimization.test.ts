/**
 * PII Minimization Tests
 * Validates encryption, redaction, and searchability
 */

import { redactPhone, redactAddress, redactPII, containsPII } from '../utils/piiRedactor';
import { encrypt, decrypt, generateHash, getLast4 } from '../utils/encryptionUtils';

console.log('Starting PII Minimization Tests...\n');

// Test 1: Phone Number Redaction
console.log('=== Test 1: Phone Number Redaction ===');
const testPhones = [
    '+573001234567',
    '573001234567',
    '3001234567',
    'My phone is 3001234567 please call me',
];

testPhones.forEach(phone => {
    const redacted = redactPhone(phone);
    console.log(`Original: ${phone}`);
    console.log(`Redacted: ${redacted}`);
    console.log(`Contains PII: ${containsPII(phone)}`);
    console.log('---');
});

// Test 2: Address Redaction
console.log('\n=== Test 2: Address Redaction ===');
const testAddresses = [
    'Calle 123 #45-67',
    'Carrera 8 #12-34 Apto 501',
    'Avenida Caracas #45-67',
    'My address is Calle 100 #20-30 Torre B Apto 302',
];

testAddresses.forEach(address => {
    const redacted = redactAddress(address);
    console.log(`Original: ${address}`);
    console.log(`Redacted: ${redacted}`);
    console.log('---');
});

// Test 3: Combined PII Redaction
console.log('\n=== Test 3: Combined PII Redaction ===');
const testMessages = [
    'Juan Pérez, 3001234567, Calle 123 #45-67, Bogotá',
    'Name: María García\nPhone: +573009876543\nAddress: Carrera 10 #20-30 Apto 401\nCity: Medellín',
];

testMessages.forEach(msg => {
    const redacted = redactPII(msg);
    console.log(`Original: ${msg}`);
    console.log(`Redacted: ${redacted}`);
    console.log('---');
});

// Test 4: Encryption and Decryption
console.log('\n=== Test 4: Encryption and Decryption ===');
const sensitiveData = {
    name: 'Juan Pérez',
    phone: '3001234567',
    address: 'Calle 123 #45-67',
    city: 'Bogotá',
};

const jsonData = JSON.stringify(sensitiveData);
console.log('Original data:', jsonData);

try {
    const encrypted = encrypt(jsonData);
    console.log('Encrypted (base64):', encrypted.substring(0, 50) + '...');
    console.log('Encrypted length:', encrypted.length, 'bytes');
    
    const decrypted = decrypt(encrypted);
    console.log('Decrypted data:', decrypted);
    console.log('Match:', jsonData === decrypted ? '✅ PASS' : '❌ FAIL');
} catch (error: any) {
    console.log('❌ Encryption test failed:', error.message);
    console.log('Make sure PII_ENCRYPTION_KEY is set in environment');
}

// Test 5: Hash Generation for Searchability
console.log('\n=== Test 5: Hash Generation for Searchability ===');
const phone1 = '3001234567';
const phone2 = '3001234567'; // Same phone
const phone3 = '3009876543'; // Different phone

const hash1 = generateHash(phone1);
const hash2 = generateHash(phone2);
const hash3 = generateHash(phone3);

console.log(`Hash of ${phone1}: ${hash1}`);
console.log(`Hash of ${phone2}: ${hash2}`);
console.log(`Hash of ${phone3}: ${hash3}`);
console.log(`Hash1 === Hash2: ${hash1 === hash2 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Hash1 !== Hash3: ${hash1 !== hash3 ? '✅ PASS' : '❌ FAIL'}`);

// Test 6: Last 4 Digits Extraction
console.log('\n=== Test 6: Last 4 Digits Extraction ===');
const testPhoneLast4 = '+573001234567';
const last4 = getLast4(testPhoneLast4);
console.log(`Phone: ${testPhoneLast4}`);
console.log(`Last 4: ${last4}`);
console.log(`Correct: ${last4 === '4567' ? '✅ PASS' : '❌ FAIL'}`);

// Test 7: Address Hash for Searchability
console.log('\n=== Test 7: Address Hash for Searchability ===');
const address1 = 'Calle 123 #45-67';
const address2 = 'Calle 123 #45-67'; // Same address
const address3 = 'Carrera 10 #20-30'; // Different address

const addrHash1 = generateHash(address1);
const addrHash2 = generateHash(address2);
const addrHash3 = generateHash(address3);

console.log(`Address 1 hash: ${addrHash1}`);
console.log(`Address 2 hash: ${addrHash2}`);
console.log(`Address 3 hash: ${addrHash3}`);
console.log(`AddrHash1 === AddrHash2: ${addrHash1 === addrHash2 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AddrHash1 !== AddrHash3: ${addrHash1 !== addrHash3 ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n=== All Tests Complete ===');
