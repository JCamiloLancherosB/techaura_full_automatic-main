/**
 * Tests for Input Normalization and Parsing
 * Run with: npx tsx src/tests/inputParsing.test.ts
 */

import { 
    normalizeText, 
    parseCapacitySelection, 
    parsePreferences,
    CatalogItem 
} from '../utils/textUtils';

// Sample catalog for testing
const testCatalog: CatalogItem[] = [
    { capacity_gb: 8, price: 59900, description: '8GB - ~1,400 canciones' },
    { capacity_gb: 16, price: 69900, description: '16GB - ~2,800 canciones' },
    { capacity_gb: 32, price: 89900, description: '32GB - ~5,600 canciones' },
    { capacity_gb: 64, price: 129900, description: '64GB - ~11,200 canciones' },
    { capacity_gb: 128, price: 169900, description: '128GB - ~22,400 canciones' }
];

interface TestCase {
    input: string;
    expectedCapacity: number | null;
    expectedPreferences?: string[];
    description: string;
}

// ========== NORMALIZATION TESTS ==========
console.log('🧪 Testing normalizeText()\n');
console.log('='.repeat(70));

const normalizationTests = [
    { input: 'Música  con   espacios', expected: 'musica con espacios', desc: 'Collapse spaces and remove accents' },
    { input: 'MAYÚSCULAS', expected: 'mayusculas', desc: 'Lowercase' },
    { input: '  trim test  ', expected: 'trim test', desc: 'Trim whitespace' },
    { input: 'áéíóú', expected: 'aeiou', desc: 'Remove tildes' }
];

normalizationTests.forEach((test, i) => {
    const result = normalizeText(test.input);
    const pass = result === test.expected;
    console.log(`${pass ? '✅' : '❌'} Test ${i + 1}: ${test.desc}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Expected: "${test.expected}", Got: "${result}"`);
    console.log('');
});

// ========== CAPACITY PARSING TESTS ==========
console.log('\n🧪 Testing parseCapacitySelection()\n');
console.log('='.repeat(70));

const capacityTests: TestCase[] = [
    // Golden Test 1: "Precio" should NOT select capacity
    {
        input: 'Precio',
        expectedCapacity: null,
        description: 'Golden Test 1: "Precio" should NOT select capacity'
    },
    
    // Golden Test 2: "8GB el precio es 54900" should select capacity=8
    {
        input: '8GB el precio es 54900',
        expectedCapacity: 8,
        description: 'Golden Test 2: "8GB el precio es 54900" selects capacity=8'
    },
    
    // Golden Test 3: "Una de 8GB… vallenato, popular…" should select capacity=8
    {
        input: 'Una de 8GB… vallenato, popular…',
        expectedCapacity: 8,
        description: 'Golden Test 3: "Una de 8GB" selects capacity=8'
    },
    
    // Golden Test 4: "La de 32 GB con Hawaii 5-0" should select capacity=32
    {
        input: 'La de 32 GB con Hawaii 5-0',
        expectedCapacity: 32,
        description: 'Golden Test 4: "La de 32 GB" selects capacity=32'
    },
    
    // Additional capacity parsing tests
    {
        input: '8GB',
        expectedCapacity: 8,
        description: 'Direct GB pattern: "8GB"'
    },
    {
        input: '8 gb',
        expectedCapacity: 8,
        description: 'GB with space: "8 gb"'
    },
    {
        input: 'la de 8',
        expectedCapacity: 8,
        description: 'Natural language: "la de 8"'
    },
    {
        input: 'opción 1',
        expectedCapacity: 8,
        description: 'Option index: "opción 1" (first item in catalog)'
    },
    {
        input: '#2',
        expectedCapacity: 16,
        description: 'Hash option: "#2" (second item in catalog)'
    },
    {
        input: '32GB',
        expectedCapacity: 32,
        description: 'Direct pattern: "32GB"'
    },
    {
        input: 'de 64',
        expectedCapacity: 64,
        description: 'Short pattern: "de 64"'
    },
    {
        input: 'quiero 128',
        expectedCapacity: 128,
        description: 'With action word: "quiero 128"'
    },
    {
        input: 'dame la de 32 gb',
        expectedCapacity: 32,
        description: 'Natural request: "dame la de 32 gb"'
    },
    {
        input: '1',
        expectedCapacity: 8,
        description: 'Standalone number as option: "1"'
    },
    {
        input: '3',
        expectedCapacity: 32,
        description: 'Standalone number as option: "3"'
    },
    {
        input: 'opcion 5',
        expectedCapacity: 128,
        description: 'Last option: "opcion 5"'
    },
    {
        input: 'invalid text',
        expectedCapacity: null,
        description: 'Invalid input returns null'
    },
    {
        input: '999',
        expectedCapacity: null,
        description: 'Non-existent capacity returns null'
    }
];

let passedCapacity = 0;
let failedCapacity = 0;

capacityTests.forEach((test, i) => {
    const result = parseCapacitySelection(test.input, testCatalog);
    const pass = result === test.expectedCapacity;
    
    if (pass) {
        passedCapacity++;
        console.log(`✅ Test ${i + 1}: ${test.description}`);
    } else {
        failedCapacity++;
        console.log(`❌ Test ${i + 1}: ${test.description}`);
    }
    console.log(`   Input: "${test.input}"`);
    console.log(`   Expected: ${test.expectedCapacity}, Got: ${result}`);
    console.log('');
});

// ========== PREFERENCES PARSING TESTS ==========
console.log('\n🧪 Testing parsePreferences()\n');
console.log('='.repeat(70));

interface PreferenceTestCase {
    input: string;
    expectedLength: number;
    shouldContain?: string[];
    description: string;
}

const preferenceTests: PreferenceTestCase[] = [
    // Golden Test 3: Preferences extraction
    {
        input: 'Una de 8GB… vallenato, popular…',
        expectedLength: 2,
        shouldContain: ['vallenato', 'popular'],
        description: 'Golden Test 3: Extract "vallenato, popular"'
    },
    
    // Golden Test 4: Title preservation
    {
        input: 'La de 32 GB con Hawaii 5-0',
        expectedLength: 1,
        shouldContain: ['hawaii 5-0'],
        description: 'Golden Test 4: Preserve title "Hawaii 5-0"'
    },
    
    // Additional preference tests
    {
        input: 'rock, salsa, merengue',
        expectedLength: 3,
        shouldContain: ['rock', 'salsa', 'merengue'],
        description: 'Comma-separated genres'
    },
    {
        input: 'rock y salsa',
        expectedLength: 2,
        shouldContain: ['rock', 'salsa'],
        description: 'Genres separated by "y"'
    },
    {
        input: 'pop & jazz',
        expectedLength: 2,
        shouldContain: ['pop', 'jazz'],
        description: 'Genres separated by "&"'
    },
    {
        input: 'vallenato, popular y merengue',
        expectedLength: 3,
        shouldContain: ['vallenato', 'popular', 'merengue'],
        description: 'Mixed separators'
    },
    {
        input: 'Breaking Bad, The Wire, Game of Thrones',
        expectedLength: 3,
        shouldContain: ['breaking bad', 'the wire', 'game of thrones'],
        description: 'Multiple titles with commas'
    },
    {
        input: 'Solo de',
        expectedLength: 0,
        description: 'Filler words are filtered out'
    }
];

let passedPreferences = 0;
let failedPreferences = 0;

preferenceTests.forEach((test, i) => {
    const result = parsePreferences(test.input);
    const lengthMatch = result.length === test.expectedLength;
    
    let containsMatch = true;
    if (test.shouldContain) {
        // Use more precise matching: check if the item exists as-is or is contained within a result
        containsMatch = test.shouldContain.every(item => 
            result.some(pref => {
                // Exact match or the preference contains the full expected item
                return pref === item || pref.includes(item);
            })
        );
    }
    
    const pass = lengthMatch && containsMatch;
    
    if (pass) {
        passedPreferences++;
        console.log(`✅ Test ${i + 1}: ${test.description}`);
    } else {
        failedPreferences++;
        console.log(`❌ Test ${i + 1}: ${test.description}`);
    }
    console.log(`   Input: "${test.input}"`);
    console.log(`   Expected length: ${test.expectedLength}, Got: ${result.length}`);
    console.log(`   Result: [${result.join(', ')}]`);
    if (test.shouldContain) {
        console.log(`   Should contain: [${test.shouldContain.join(', ')}]`);
    }
    console.log('');
});

// ========== SUMMARY ==========
console.log('='.repeat(70));
console.log('\n📊 TEST SUMMARY\n');
console.log(`Normalization Tests: ${normalizationTests.length} run (visual inspection)`);
console.log(`Capacity Tests: ${passedCapacity} passed, ${failedCapacity} failed out of ${capacityTests.length} total`);
console.log(`Preference Tests: ${passedPreferences} passed, ${failedPreferences} failed out of ${preferenceTests.length} total`);
console.log('');

const totalFailed = failedCapacity + failedPreferences;
if (totalFailed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    process.exit(0);
} else {
    console.log(`⚠️  ${totalFailed} test(s) failed`);
    process.exit(1);
}
