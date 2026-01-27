/**
 * Tests for USB Pricing Types and Validation
 * Validates pricing consistency without database connection
 */

import { PRICING, getPrice, formatPrice, getCapacityInfo, getAvailableCapacities } from '../constants/pricing';

// ============================================================================
// Test Utilities
// ============================================================================

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            result.then(() => {
                results.push({ name, passed: true });
                console.log(`✅ ${name}`);
            }).catch((error) => {
                results.push({ name, passed: false, error: error.message });
                console.error(`❌ ${name}: ${error.message}`);
            });
        } else {
            results.push({ name, passed: true });
            console.log(`✅ ${name}`);
        }
    } catch (error: any) {
        results.push({ name, passed: false, error: error.message });
        console.error(`❌ ${name}: ${error.message}`);
    }
}

function assertEquals(actual: any, expected: any, message?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(condition: boolean, message?: string) {
    if (!condition) {
        throw new Error(message || 'Expected condition to be true');
    }
}

function assertFalse(condition: boolean, message?: string) {
    if (condition) {
        throw new Error(message || 'Expected condition to be false');
    }
}

function assertValidPrice(price: number, message?: string) {
    assertTrue(typeof price === 'number', message || 'Price should be a number');
    assertTrue(price >= 0, message || 'Price should be non-negative');
    assertTrue(!isNaN(price), message || 'Price should not be NaN');
}

// ============================================================================
// USB Pricing Type Tests
// ============================================================================

console.log('\n🧪 Running USB Pricing Tests\n');

// Test: Valid USB capacities
test('USB capacities should include standard sizes', () => {
    const musicCapacities = getAvailableCapacities('music');
    const videoCapacities = getAvailableCapacities('videos');
    const movieCapacities = getAvailableCapacities('movies');

    // Music should have 8GB, 32GB, 64GB, 128GB
    assertTrue(musicCapacities.includes('8GB'), 'Music should have 8GB');
    assertTrue(musicCapacities.includes('32GB'), 'Music should have 32GB');
    assertTrue(musicCapacities.includes('64GB'), 'Music should have 64GB');
    assertTrue(musicCapacities.includes('128GB'), 'Music should have 128GB');

    // Videos should have 8GB, 32GB, 64GB, 128GB
    assertTrue(videoCapacities.includes('8GB'), 'Videos should have 8GB');
    assertTrue(videoCapacities.includes('32GB'), 'Videos should have 32GB');

    // Movies should have 64GB, 128GB, 256GB, 512GB
    assertTrue(movieCapacities.includes('64GB'), 'Movies should have 64GB');
    assertTrue(movieCapacities.includes('128GB'), 'Movies should have 128GB');
    assertTrue(movieCapacities.includes('256GB'), 'Movies should have 256GB');
});

// Test: Price validation - non-negative values
test('All prices should be non-negative numbers', () => {
    const categories: Array<'music' | 'videos' | 'movies'> = ['music', 'videos', 'movies'];
    
    for (const category of categories) {
        const capacities = getAvailableCapacities(category);
        
        for (const capacity of capacities) {
            const price = getPrice(category, capacity);
            assertValidPrice(price, `Price for ${category} ${capacity} should be valid`);
        }
    }
});

// Test: Formatted price output
test('Formatted prices should include currency symbol', () => {
    const formatted = formatPrice(84900);
    assertTrue(formatted.includes('$'), 'Formatted price should include $ symbol');
    assertTrue(formatted.length > 1, 'Formatted price should not be empty');
});

// Test: Pricing constants match expected values for music
test('Pricing constants should match expected values for music', () => {
    assertEquals(PRICING.music['8GB'].price, 54900, 'Music 8GB price should be 54900');
    assertEquals(PRICING.music['32GB'].price, 84900, 'Music 32GB price should be 84900');
    assertEquals(PRICING.music['64GB'].price, 119900, 'Music 64GB price should be 119900');
    assertEquals(PRICING.music['128GB'].price, 159900, 'Music 128GB price should be 159900');
});

test('Pricing constants should match expected values for videos', () => {
    assertEquals(PRICING.videos['8GB'].price, 54900, 'Videos 8GB price should be 54900');
    assertEquals(PRICING.videos['32GB'].price, 84900, 'Videos 32GB price should be 84900');
    assertEquals(PRICING.videos['64GB'].price, 119900, 'Videos 64GB price should be 119900');
    assertEquals(PRICING.videos['128GB'].price, 159900, 'Videos 128GB price should be 159900');
});

test('Pricing constants should match expected values for movies', () => {
    assertEquals(PRICING.movies['64GB'].price, 119900, 'Movies 64GB price should be 119900');
    assertEquals(PRICING.movies['128GB'].price, 159900, 'Movies 128GB price should be 159900');
    assertEquals(PRICING.movies['256GB'].price, 219900, 'Movies 256GB price should be 219900');
    assertEquals(PRICING.movies['512GB'].price, 319900, 'Movies 512GB price should be 319900');
});

// Test: Content count from pricing constants
test('Music content counts should be valid', () => {
    assertEquals(PRICING.music['8GB'].songs, 1400, 'Music 8GB should have 1400 songs');
    assertEquals(PRICING.music['32GB'].songs, 5000, 'Music 32GB should have 5000 songs');
    assertEquals(PRICING.music['64GB'].songs, 10000, 'Music 64GB should have 10000 songs');
    assertEquals(PRICING.music['128GB'].songs, 25000, 'Music 128GB should have 25000 songs');
});

test('Videos content counts should be valid', () => {
    assertEquals(PRICING.videos['8GB'].videos, 500, 'Videos 8GB should have 500 videos');
    assertEquals(PRICING.videos['32GB'].videos, 1000, 'Videos 32GB should have 1000 videos');
    assertEquals(PRICING.videos['64GB'].videos, 2000, 'Videos 64GB should have 2000 videos');
    assertEquals(PRICING.videos['128GB'].videos, 4000, 'Videos 128GB should have 4000 videos');
});

test('Movies content counts should be valid', () => {
    assertEquals(PRICING.movies['64GB'].movies, 55, 'Movies 64GB should have 55 movies');
    assertEquals(PRICING.movies['128GB'].movies, 120, 'Movies 128GB should have 120 movies');
    assertEquals(PRICING.movies['256GB'].movies, 250, 'Movies 256GB should have 250 movies');
    assertEquals(PRICING.movies['512GB'].movies, 520, 'Movies 512GB should have 520 movies');
});

// Test: getCapacityInfo returns correct values
test('getCapacityInfo should return correct values for music', () => {
    const info8 = getCapacityInfo('music', '8GB');
    assertEquals(info8?.count, 1400, 'Music 8GB should have 1400 count');
    assertEquals(info8?.type, 'canciones', 'Music type should be canciones');

    const info32 = getCapacityInfo('music', '32GB');
    assertEquals(info32?.count, 5000, 'Music 32GB should have 5000 count');
});

test('getCapacityInfo should return correct values for videos', () => {
    const info = getCapacityInfo('videos', '32GB');
    assertEquals(info?.count, 1000, 'Videos 32GB should have 1000 count');
    assertEquals(info?.type, 'videos', 'Videos type should be videos');
});

test('getCapacityInfo should return correct values for movies', () => {
    const info = getCapacityInfo('movies', '128GB');
    assertEquals(info?.count, 120, 'Movies 128GB should have 120 count');
    assertEquals(info?.type, 'películas', 'Movies type should be películas');
});

// Test: getPrice function works correctly
test('getPrice should return correct prices', () => {
    assertEquals(getPrice('music', '8GB'), 54900, 'getPrice music 8GB');
    assertEquals(getPrice('music', '32GB'), 84900, 'getPrice music 32GB');
    assertEquals(getPrice('videos', '64GB'), 119900, 'getPrice videos 64GB');
    assertEquals(getPrice('movies', '256GB'), 219900, 'getPrice movies 256GB');
});

test('getPrice should return 0 for invalid capacity', () => {
    assertEquals(getPrice('music', '16GB'), 0, 'Invalid capacity should return 0');
    assertEquals(getPrice('music', '999GB'), 0, 'Non-existent capacity should return 0');
});

test('getPrice should return 0 for invalid category', () => {
    assertEquals(getPrice('invalid' as any, '32GB'), 0, 'Invalid category should return 0');
});

// Test: Price increases with capacity
test('Music prices should increase with capacity', () => {
    assertTrue(PRICING.music['8GB'].price < PRICING.music['32GB'].price, '8GB < 32GB');
    assertTrue(PRICING.music['32GB'].price < PRICING.music['64GB'].price, '32GB < 64GB');
    assertTrue(PRICING.music['64GB'].price < PRICING.music['128GB'].price, '64GB < 128GB');
});

test('Videos prices should increase with capacity', () => {
    assertTrue(PRICING.videos['8GB'].price < PRICING.videos['32GB'].price, '8GB < 32GB');
    assertTrue(PRICING.videos['32GB'].price < PRICING.videos['64GB'].price, '32GB < 64GB');
    assertTrue(PRICING.videos['64GB'].price < PRICING.videos['128GB'].price, '64GB < 128GB');
});

test('Movies prices should increase with capacity', () => {
    assertTrue(PRICING.movies['64GB'].price < PRICING.movies['128GB'].price, '64GB < 128GB');
    assertTrue(PRICING.movies['128GB'].price < PRICING.movies['256GB'].price, '128GB < 256GB');
    assertTrue(PRICING.movies['256GB'].price < PRICING.movies['512GB'].price, '256GB < 512GB');
});

// Test: Content count increases with capacity
test('Music content count should increase with capacity', () => {
    assertTrue(PRICING.music['8GB'].songs! < PRICING.music['32GB'].songs!, 'Songs 8GB < 32GB');
    assertTrue(PRICING.music['32GB'].songs! < PRICING.music['64GB'].songs!, 'Songs 32GB < 64GB');
    assertTrue(PRICING.music['64GB'].songs! < PRICING.music['128GB'].songs!, 'Songs 64GB < 128GB');
});

// Test: Pricing structure completeness
test('PRICING object should have all categories', () => {
    assertTrue('music' in PRICING, 'PRICING should have music');
    assertTrue('videos' in PRICING, 'PRICING should have videos');
    assertTrue('movies' in PRICING, 'PRICING should have movies');
});

test('Each pricing entry should have price property', () => {
    for (const category of ['music', 'videos', 'movies'] as const) {
        for (const capacity of Object.keys(PRICING[category])) {
            assertTrue(
                'price' in PRICING[category][capacity],
                `${category} ${capacity} should have price`
            );
        }
    }
});

// ============================================================================
// Summary
// ============================================================================

setTimeout(() => {
    console.log('\n📊 USB Pricing Test Summary\n');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log(`Total: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
        console.log('\nFailed tests:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.name}: ${r.error}`);
        });
        process.exit(1);
    } else {
        console.log('\n🎉 All USB Pricing tests passed!\n');
        process.exit(0);
    }
}, 100);
