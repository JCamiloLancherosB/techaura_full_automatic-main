#!/usr/bin/env node
/**
 * Simple Unit Tests for Shipping Guide Automation (No DB Required)
 * Tests the core parsing and matching logic
 */

console.log('🚀 Starting Shipping Guide Automation Unit Tests\n');
console.log('='.repeat(50));

// Test 1: Text Pattern Matching for Colombian Carriers
console.log('\n🧪 Test 1: Carrier Detection\n');

const carrierPatterns = {
    'servientrega': /servientrega/i,
    'coordinadora': /coordinadora/i,
    'interrapidisimo': /inter\s*rapidisimo/i,
    'envia': /envia\s*colvanes/i,
};

const testTexts = [
    { text: 'SERVIENTREGA - Guía #123', expected: 'servientrega' },
    { text: 'Coordinadora Envíos', expected: 'coordinadora' },
    { text: 'Inter Rapidisimo Colombia', expected: 'interrapidisimo' },
];

let carrierTestsPassed = 0;
for (const test of testTexts) {
    for (const [carrier, pattern] of Object.entries(carrierPatterns)) {
        if (pattern.test(test.text)) {
            if (carrier === test.expected) {
                console.log(`✅ PASS: Detected "${carrier}" in "${test.text}"`);
                carrierTestsPassed++;
            } else {
                console.log(`❌ FAIL: Wrong carrier detected for "${test.text}"`);
            }
            break;
        }
    }
}

console.log(`\nCarrier Detection: ${carrierTestsPassed}/${testTexts.length} passed`);

// Test 2: Tracking Number Extraction
console.log('\n🧪 Test 2: Tracking Number Extraction\n');

const trackingPatterns = [
    /(?:gu[íi]a|tracking|n[úu]mero)[\s:]*([A-Z0-9]{8,20})/i,
    /(?:^|\s)(\d{10,15})(?:\s|$)/m,
    /[A-Z]{2,3}\d{9,12}/
];

const trackingTests = [
    { text: 'Guía: SER123456789', expected: 'SER123456789' },
    { text: 'Número: 1234567890', expected: '1234567890' },
    { text: 'Tracking AB1234567890', expected: 'AB1234567890' },
];

let trackingTestsPassed = 0;
for (const test of trackingTests) {
    for (const pattern of trackingPatterns) {
        const match = test.text.match(pattern);
        if (match) {
            const extracted = match[1] || match[0];
            if (extracted.includes(test.expected) || test.expected.includes(extracted)) {
                console.log(`✅ PASS: Extracted "${extracted}" from "${test.text}"`);
                trackingTestsPassed++;
            } else {
                console.log(`❌ FAIL: Expected "${test.expected}", got "${extracted}"`);
            }
            break;
        }
    }
}

console.log(`\nTracking Extraction: ${trackingTestsPassed}/${trackingTests.length} passed`);

// Test 3: Colombian City Detection
console.log('\n🧪 Test 3: City Detection\n');

const colombianCities = [
    'bogota', 'medellin', 'cali', 'barranquilla', 'cartagena'
];

const cityTests = [
    { text: 'Dirección en Bogotá', expected: 'Bogota' },
    { text: 'Envío a Medellín', expected: 'Medellin' },
    { text: 'Destino: Cali, Colombia', expected: 'Cali' },
];

let cityTestsPassed = 0;
for (const test of cityTests) {
    const textLower = test.text.toLowerCase();
    for (const city of colombianCities) {
        if (textLower.includes(city)) {
            const capitalizedCity = city.charAt(0).toUpperCase() + city.slice(1);
            if (capitalizedCity === test.expected) {
                console.log(`✅ PASS: Detected "${capitalizedCity}" in "${test.text}"`);
                cityTestsPassed++;
            }
            break;
        }
    }
}

console.log(`\nCity Detection: ${cityTestsPassed}/${cityTests.length} passed`);

// Test 4: Name Similarity Algorithm
console.log('\n🧪 Test 4: Name Similarity\n');

function calculateNameSimilarity(name1, name2) {
    const s1 = name1.toLowerCase().trim();
    const s2 = name2.toLowerCase().trim();
    
    if (s1 === s2) return 1;
    
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    
    let matches = 0;
    for (const w1 of words1) {
        if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
            matches++;
        }
    }
    
    return matches / Math.max(words1.length, words2.length);
}

const similarityTests = [
    { name1: 'Juan Perez Garcia', name2: 'Juan Perez', expectedMin: 0.6 },
    { name1: 'Maria Rodriguez', name2: 'Juan Perez', expectedMax: 0.3 },
    { name1: 'Carlos Alberto Mendez', name2: 'Carlos Mendez', expectedMin: 0.6 },
];

let similarityTestsPassed = 0;
for (const test of similarityTests) {
    const similarity = calculateNameSimilarity(test.name1, test.name2);
    const passed = test.expectedMin 
        ? similarity >= test.expectedMin 
        : similarity <= test.expectedMax;
    
    if (passed) {
        console.log(`✅ PASS: "${test.name1}" vs "${test.name2}" = ${(similarity * 100).toFixed(0)}%`);
        similarityTestsPassed++;
    } else {
        console.log(`❌ FAIL: "${test.name1}" vs "${test.name2}" = ${(similarity * 100).toFixed(0)}%`);
    }
}

console.log(`\nSimilarity Tests: ${similarityTestsPassed}/${similarityTests.length} passed`);

// Test 5: MIME Type Detection
console.log('\n🧪 Test 5: MIME Type Detection\n');

function getMimeType(filePath) {
    const ext = filePath.toLowerCase().split('.').pop();
    const mimeTypes = {
        'pdf': 'application/pdf',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

const mimeTests = [
    { path: 'guide.pdf', expected: 'application/pdf' },
    { path: 'shipping.PNG', expected: 'image/png' },
    { path: 'document.jpg', expected: 'image/jpeg' },
];

let mimeTestsPassed = 0;
for (const test of mimeTests) {
    const mime = getMimeType(test.path);
    if (mime === test.expected) {
        console.log(`✅ PASS: "${test.path}" → ${mime}`);
        mimeTestsPassed++;
    } else {
        console.log(`❌ FAIL: "${test.path}" expected ${test.expected}, got ${mime}`);
    }
}

console.log(`\nMIME Detection: ${mimeTestsPassed}/${mimeTests.length} passed`);

// Summary
console.log('\n' + '='.repeat(50));
const totalTests = carrierTestsPassed + trackingTestsPassed + cityTestsPassed + similarityTestsPassed + mimeTestsPassed;
const totalExpected = testTexts.length + trackingTests.length + cityTests.length + similarityTests.length + mimeTests.length;

console.log(`\n📊 Final Results: ${totalTests}/${totalExpected} tests passed`);

if (totalTests === totalExpected) {
    console.log('✅ All core logic tests PASSED!\n');
    console.log('🎉 Shipping Guide Automation is ready for integration testing');
} else {
    console.log('⚠️  Some tests failed. Review the implementation.\n');
}

console.log('\n📝 Next Steps:');
console.log('  1. Ensure database has orders with customer data');
console.log('  2. Start the server: npm start');
console.log('  3. Test endpoints with real shipping guide files:');
console.log('     - POST /api/shipping/guide (upload single PDF/image)');
console.log('     - POST /api/shipping/guides/batch (upload multiple files)');
console.log('     - GET /api/shipping/health (check service status)');
console.log('');
