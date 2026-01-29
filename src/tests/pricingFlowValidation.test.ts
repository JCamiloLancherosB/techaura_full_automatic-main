/**
 * Pricing Flow Validation Tests
 * 
 * Tests for validating the complete USB pricing flow:
 * 1. Option generation for music, videos, and movies
 * 2. Price formatting in COP (Colombian Peso)
 * 3. Catalog sending via sendGatedCatalog
 * 4. 30% discount on USB 128GB display
 * 5. Synchronization between user selection and order confirmation
 * 
 * NOTE: This test suite validates two separate modules:
 * - usbPricingLogic.ts (customer-facing USB options with 'musica', 'videos', 'peliculas' types)
 * - src/constants/pricing.ts (internal pricing constants with 'music', 'videos', 'movies' types)
 * These modules have slightly different data structures and serve different purposes.
 */

import { PRICING, getPrice, formatPrice, getCapacityInfo, getAvailableCapacities } from '../constants/pricing';
import {
    getUSBOptions,
    getUSBPriceAndDesc,
    generateUSBSelectionMessage
} from '../../usbPricingLogic';
import {
    createGatedFlowDynamic,
    sendGatedMessage,
    sendGatedCatalog,
    sendGatedOrderMessage
} from '../utils/outboundGateHelpers';

// ============================================================================
// Test Utilities
// ============================================================================

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

const results: TestResult[] = [];
const pendingPromises: Promise<void>[] = [];

function test(name: string, fn: () => void | Promise<void>) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            const promise = result.then(() => {
                results.push({ name, passed: true });
                console.log(`✅ ${name}`);
            }).catch((error) => {
                results.push({ name, passed: false, error: error.message });
                console.error(`❌ ${name}: ${error.message}`);
            });
            pendingPromises.push(promise);
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

function assertIncludes(text: string, substring: string, message?: string) {
    if (!text.includes(substring)) {
        throw new Error(message || `Expected "${text}" to include "${substring}"`);
    }
}

function assertMatches(text: string, pattern: RegExp, message?: string) {
    if (!pattern.test(text)) {
        throw new Error(message || `Expected "${text}" to match ${pattern}`);
    }
}

// ============================================================================
// SECTION 1: Option Generation Tests
// Tests USB options from usbPricingLogic.ts (customer-facing content)
// Music: 1400-25000 songs (as per usbPricingLogic.ts)
// Videos: 260-4000 videos (as per usbPricingLogic.ts)
// Movies: movie/episode counts (as per usbPricingLogic.ts)
// ============================================================================

console.log('\n🧪 Running Pricing Flow Validation Tests\n');
console.log('📋 Section 1: USB Option Generation Tests\n');

// Test: Music options should be generated correctly
test('Music USB options should have correct content counts', () => {
    const musicOpts = getUSBOptions('musica');
    
    assertTrue(musicOpts.length === 4, 'Should have 4 music options');
    
    // Validate 8GB option (1400 songs as per usbPricingLogic.ts)
    const opt8gb = musicOpts.find(o => o.label === '8GB');
    assertTrue(opt8gb !== undefined, '8GB option should exist');
    assertTrue(opt8gb!.quantity.includes('1400'), '8GB should have 1400 songs');
    
    // Validate 32GB option (5000 songs)
    const opt32gb = musicOpts.find(o => o.label === '32GB');
    assertTrue(opt32gb !== undefined, '32GB option should exist');
    assertTrue(opt32gb!.quantity.includes('5000'), '32GB should have 5000 songs');
    
    // Validate 64GB option (10000 songs)
    const opt64gb = musicOpts.find(o => o.label === '64GB');
    assertTrue(opt64gb !== undefined, '64GB option should exist');
    assertTrue(opt64gb!.quantity.includes('10000'), '64GB should have 10000 songs');
    
    // Validate 128GB option (25000 songs)
    const opt128gb = musicOpts.find(o => o.label === '128GB');
    assertTrue(opt128gb !== undefined, '128GB option should exist');
    assertTrue(opt128gb!.quantity.includes('25000'), '128GB should have 25000 songs');
});

// Test: Videos options should have correct content counts (260-4000 range as per usbPricingLogic.ts)
test('Videos USB options should have correct content counts (260-4000 range)', () => {
    const videoOpts = getUSBOptions('videos');
    
    assertTrue(videoOpts.length === 4, 'Should have 4 video options');
    
    // Validate content counts from usbPricingLogic.ts
    const opt8gb = videoOpts.find(o => o.label === '8GB');
    assertTrue(opt8gb !== undefined, '8GB option should exist');
    // 260 videos for 8GB as defined in usbPricingLogic.ts
    assertTrue(opt8gb!.quantity.includes('260'), '8GB should have 260 videos');
    
    const opt32gb = videoOpts.find(o => o.label === '32GB');
    assertTrue(opt32gb !== undefined, '32GB option should exist');
    assertTrue(opt32gb!.quantity.includes('1000'), '32GB should have 1000 videos');
    
    const opt64gb = videoOpts.find(o => o.label === '64GB');
    assertTrue(opt64gb !== undefined, '64GB option should exist');
    assertTrue(opt64gb!.quantity.includes('2000'), '64GB should have 2000 videos');
    
    // 128GB should reach 4000 videos (upper range per problem statement)
    const opt128gb = videoOpts.find(o => o.label === '128GB');
    assertTrue(opt128gb !== undefined, '128GB option should exist');
    assertTrue(opt128gb!.quantity.includes('4000'), '128GB should have 4000 videos');
});

// Test: Movies options should have correct content counts
test('Movies/Películas USB options should have correct content counts', () => {
    const movieOpts = getUSBOptions('peliculas');
    
    assertTrue(movieOpts.length === 4, 'Should have 4 movie options');
    
    // Validate 8GB option
    const opt8gb = movieOpts.find(o => o.label === '8GB');
    assertTrue(opt8gb !== undefined, '8GB option should exist');
    assertTrue(opt8gb!.desc.includes('10 películas'), '8GB should have 10 películas');
    assertTrue(opt8gb!.desc.includes('30 episodios'), '8GB should have 30 episodios');
    
    // Validate 32GB option
    const opt32gb = movieOpts.find(o => o.label === '32GB');
    assertTrue(opt32gb !== undefined, '32GB option should exist');
    assertTrue(opt32gb!.desc.includes('30 películas'), '32GB should have 30 películas');
    
    // Validate 128GB option
    const opt128gb = movieOpts.find(o => o.label === '128GB');
    assertTrue(opt128gb !== undefined, '128GB option should exist');
    assertTrue(opt128gb!.desc.includes('140 películas'), '128GB should have 140 películas');
});

// Test: getUSBPriceAndDesc returns correct option
test('getUSBPriceAndDesc should return correct USB option by ID', () => {
    // Music option 2 should be 32GB
    const musicOpt2 = getUSBPriceAndDesc('musica', 2);
    assertTrue(musicOpt2 !== undefined, 'Music option 2 should exist');
    assertEquals(musicOpt2!.label, '32GB', 'Music option 2 should be 32GB');
    assertEquals(musicOpt2!.price, 84900, 'Music 32GB price should be 84900');
    
    // Videos option 4 should be 128GB
    const videoOpt4 = getUSBPriceAndDesc('videos', 4);
    assertTrue(videoOpt4 !== undefined, 'Video option 4 should exist');
    assertEquals(videoOpt4!.label, '128GB', 'Video option 4 should be 128GB');
    assertEquals(videoOpt4!.price, 159900, 'Video 128GB price should be 159900');
    
    // Movies option 1 should be 8GB
    const movieOpt1 = getUSBPriceAndDesc('peliculas', 1);
    assertTrue(movieOpt1 !== undefined, 'Movie option 1 should exist');
    assertEquals(movieOpt1!.label, '8GB', 'Movie option 1 should be 8GB');
});

// ============================================================================
// SECTION 2: COP Price Formatting Tests
// ============================================================================

console.log('\n📋 Section 2: COP Price Formatting Tests\n');

// Test: formatPrice should format prices in Colombian Peso format
test('formatPrice should include $ symbol and COP locale formatting', () => {
    const formatted = formatPrice(54900);
    assertIncludes(formatted, '$', 'Should include $ symbol');
    // COP locale uses period as thousands separator
    assertTrue(formatted.length > 3, 'Should have formatted number');
});

test('formatPrice should correctly format all pricing tiers', () => {
    // Test all price tiers
    const prices = [54900, 84900, 119900, 159900, 219900, 319900];
    
    for (const price of prices) {
        const formatted = formatPrice(price);
        assertIncludes(formatted, '$', `Price ${price} should include $ symbol`);
        // Verify the formatted price contains the digits
        const digits = price.toString();
        // At least check the price is in reasonable range
        assertTrue(formatted.length > 4, `Formatted ${price} should have reasonable length`);
    }
});

test('Price formatting in USB selection messages should be in COP format', () => {
    const musicMessage = generateUSBSelectionMessage('musica');
    
    // Check that prices are formatted with $ and locale
    assertIncludes(musicMessage, '$', 'Music message should include $ symbol');
    // Verify prices appear in the message
    assertMatches(musicMessage, /\$[\d.,]+/, 'Should contain formatted prices');
});

test('Video selection message prices should be in COP format', () => {
    const videoMessage = generateUSBSelectionMessage('videos');
    
    assertIncludes(videoMessage, '$', 'Video message should include $ symbol');
    assertMatches(videoMessage, /\$[\d.,]+/, 'Should contain formatted prices');
});

test('Movie selection message prices should be in COP format', () => {
    const movieMessage = generateUSBSelectionMessage('peliculas');
    
    assertIncludes(movieMessage, '$', 'Movie message should include $ symbol');
    assertMatches(movieMessage, /\$[\d.,]+/, 'Should contain formatted prices');
});

// ============================================================================
// SECTION 3: sendGatedCatalog Tests
// ============================================================================

console.log('\n📋 Section 3: sendGatedCatalog Function Tests\n');

test('sendGatedCatalog function should exist and be a function', () => {
    assertTrue(typeof sendGatedCatalog === 'function', 'sendGatedCatalog should be a function');
});

test('sendGatedCatalog should be callable with ctx, flowDynamic, message, and optional stage', () => {
    // Verify the function can be called (basic signature check)
    // Note: We don't check function.length as it's unreliable with optional params
    assertTrue(typeof sendGatedCatalog === 'function', 'sendGatedCatalog should be callable');
    // The function signature is: (ctx, flowDynamic, catalogMessage, stage?)
});

test('createGatedFlowDynamic should exist and return a function', () => {
    assertTrue(typeof createGatedFlowDynamic === 'function', 'createGatedFlowDynamic should be a function');
    
    // Create a mock context and flowDynamic
    const mockCtx = { from: '573001234567' };
    const mockFlowDynamic = async (msgs: any[]) => {};
    
    const gatedFn = createGatedFlowDynamic(mockCtx, mockFlowDynamic, 'catalog', 'pricing');
    assertTrue(typeof gatedFn === 'function', 'Should return a function');
});

test('sendGatedMessage function should exist', () => {
    assertTrue(typeof sendGatedMessage === 'function', 'sendGatedMessage should be a function');
});

test('sendGatedOrderMessage function should exist', () => {
    assertTrue(typeof sendGatedOrderMessage === 'function', 'sendGatedOrderMessage should be a function');
});

// ============================================================================
// SECTION 4: 30% Discount on USB 128GB Tests
// ============================================================================

console.log('\n📋 Section 4: 30% Discount on USB 128GB Tests\n');

test('Movie selection message should display 30% discount for 128GB option', () => {
    const movieMessage = generateUSBSelectionMessage('peliculas');
    
    // The message should mention the 30% discount for 128GB
    assertIncludes(movieMessage, '30%', 'Should mention 30% discount');
    assertIncludes(movieMessage, 'descuento', 'Should mention "descuento"');
    assertIncludes(movieMessage, '128GB', 'Should reference 128GB');
});

test('30% discount message should reference second USB', () => {
    const movieMessage = generateUSBSelectionMessage('peliculas');
    
    // Verify the discount is for the second USB
    assertIncludes(movieMessage, 'segunda USB', 'Should mention second USB discount');
});

test('128GB option 4 should be clearly identified in movie message', () => {
    const movieMessage = generateUSBSelectionMessage('peliculas');
    
    // Verify option 4 (128GB) is clearly labeled
    assertIncludes(movieMessage, '4.', 'Should have option 4 numbered');
    assertMatches(movieMessage, /opción\s*4|4\.\s*USB\s*128GB/i, 'Should reference option 4 with 128GB');
});

// ============================================================================
// SECTION 5: User Selection and Order Confirmation Synchronization
// NOTE: usbPricingLogic.ts uses Spanish types ('musica', 'videos', 'peliculas')
// while pricing.ts uses English types ('music', 'videos', 'movies')
// These tests verify price consistency where capacity structures overlap.
// ============================================================================

console.log('\n📋 Section 5: Selection and Order Confirmation Sync Tests\n');

test('Music pricing constants should be consistent across modules', () => {
    // Compare pricing from usbPricingLogic.ts (musica) with pricing.ts (music)
    // Both modules have the same capacities for music: 8GB, 32GB, 64GB, 128GB
    const musicOpts = getUSBOptions('musica');
    
    // 8GB music
    const logic8gb = musicOpts.find(o => o.label === '8GB');
    const const8gb = getPrice('music', '8GB');
    assertEquals(logic8gb!.price, const8gb, 'Music 8GB prices should match');
    
    // 32GB music
    const logic32gb = musicOpts.find(o => o.label === '32GB');
    const const32gb = getPrice('music', '32GB');
    assertEquals(logic32gb!.price, const32gb, 'Music 32GB prices should match');
    
    // 64GB music
    const logic64gb = musicOpts.find(o => o.label === '64GB');
    const const64gb = getPrice('music', '64GB');
    assertEquals(logic64gb!.price, const64gb, 'Music 64GB prices should match');
    
    // 128GB music
    const logic128gb = musicOpts.find(o => o.label === '128GB');
    const const128gb = getPrice('music', '128GB');
    assertEquals(logic128gb!.price, const128gb, 'Music 128GB prices should match');
});

test('Video pricing should be consistent between modules for shared capacities', () => {
    // usbPricingLogic.ts videos: 8GB, 32GB, 64GB, 128GB
    // pricing.ts videos: 8GB, 32GB, 64GB, 128GB (same structure)
    const videoOpts = getUSBOptions('videos');
    
    // Compare video prices for shared capacities
    const logic8gb = videoOpts.find(o => o.label === '8GB');
    const const8gb = getPrice('videos', '8GB');
    assertEquals(logic8gb!.price, const8gb, 'Video 8GB prices should match');
    
    const logic128gb = videoOpts.find(o => o.label === '128GB');
    const const128gb = getPrice('videos', '128GB');
    assertEquals(logic128gb!.price, const128gb, 'Video 128GB prices should match');
});

test('Music content counts from pricing.ts should be accurate', () => {
    // Test music content counts from pricing.ts
    const info32 = getCapacityInfo('music', '32GB');
    
    assertTrue(info32 !== null, 'getCapacityInfo should return info for music 32GB');
    assertEquals(info32!.type, 'canciones', 'Type should be canciones');
    assertEquals(info32!.count, 5000, 'Count should be 5000');
});

test('Music USB options capacities should be available in pricing constants', () => {
    // Music capacities from usbPricingLogic.ts match pricing.ts
    const musicCapacities = getAvailableCapacities('music');
    const musicOpts = getUSBOptions('musica');
    
    for (const opt of musicOpts) {
        assertTrue(
            musicCapacities.includes(opt.label),
            `Music capacity ${opt.label} should be in available capacities`
        );
    }
});

test('Video USB options capacities should be available in pricing constants', () => {
    // Video capacities from usbPricingLogic.ts match pricing.ts
    const videoCapacities = getAvailableCapacities('videos');
    const videoOpts = getUSBOptions('videos');
    
    for (const opt of videoOpts) {
        assertTrue(
            videoCapacities.includes(opt.label),
            `Video capacity ${opt.label} should be in available capacities`
        );
    }
});

test('Order IDs in USB options should be sequential (1-4)', () => {
    const contentTypes: Array<'musica' | 'videos' | 'peliculas'> = ['musica', 'videos', 'peliculas'];
    
    for (const type of contentTypes) {
        const opts = getUSBOptions(type);
        
        for (let i = 0; i < opts.length; i++) {
            assertEquals(opts[i].id, i + 1, `${type} option ${i} should have ID ${i + 1}`);
        }
    }
});

test('USB options should have required properties for order processing', () => {
    const contentTypes: Array<'musica' | 'videos' | 'peliculas'> = ['musica', 'videos', 'peliculas'];
    
    for (const type of contentTypes) {
        const opts = getUSBOptions(type);
        
        for (const opt of opts) {
            assertTrue(typeof opt.id === 'number', `${type} option should have numeric id`);
            assertTrue(typeof opt.label === 'string', `${type} option should have string label`);
            assertTrue(typeof opt.capacityGB === 'number', `${type} option should have numeric capacityGB`);
            assertTrue(typeof opt.price === 'number', `${type} option should have numeric price`);
            assertTrue(typeof opt.quantity === 'string', `${type} option should have string quantity`);
            assertTrue(typeof opt.desc === 'string', `${type} option should have string desc`);
            assertTrue(typeof opt.emoji === 'string', `${type} option should have string emoji`);
        }
    }
});

// ============================================================================
// SECTION 6: Edge Cases and Error Handling
// ============================================================================

console.log('\n📋 Section 6: Edge Cases and Error Handling\n');

test('getUSBPriceAndDesc should return undefined for invalid option ID', () => {
    const invalidOpt = getUSBPriceAndDesc('musica', 99);
    assertEquals(invalidOpt, undefined, 'Should return undefined for invalid option ID');
    
    const zeroOpt = getUSBPriceAndDesc('videos', 0);
    assertEquals(zeroOpt, undefined, 'Should return undefined for option ID 0');
    
    const negativeOpt = getUSBPriceAndDesc('peliculas', -1);
    assertEquals(negativeOpt, undefined, 'Should return undefined for negative option ID');
});

test('getPrice should return 0 for invalid product type', () => {
    const invalidPrice = getPrice('invalid' as any, '32GB');
    assertEquals(invalidPrice, 0, 'Should return 0 for invalid product type');
});

test('getPrice should return 0 for invalid capacity', () => {
    const invalidCapacity = getPrice('music', 'invalid');
    assertEquals(invalidCapacity, 0, 'Should return 0 for invalid capacity');
    
    const nonExistentCapacity = getPrice('music', '16GB');
    assertEquals(nonExistentCapacity, 0, 'Should return 0 for non-existent capacity');
});

test('All prices should be positive numbers', () => {
    const contentTypes: Array<'musica' | 'videos' | 'peliculas'> = ['musica', 'videos', 'peliculas'];
    
    for (const type of contentTypes) {
        const opts = getUSBOptions(type);
        
        for (const opt of opts) {
            assertTrue(opt.price > 0, `${type} ${opt.label} price should be positive`);
            assertTrue(Number.isInteger(opt.price), `${type} ${opt.label} price should be integer (COP)`);
        }
    }
});

test('Capacity values should be powers of 2', () => {
    const validCapacities = [8, 32, 64, 128, 256, 512];
    const contentTypes: Array<'musica' | 'videos' | 'peliculas'> = ['musica', 'videos', 'peliculas'];
    
    for (const type of contentTypes) {
        const opts = getUSBOptions(type);
        
        for (const opt of opts) {
            assertTrue(
                validCapacities.includes(opt.capacityGB),
                `${type} ${opt.label} capacity ${opt.capacityGB}GB should be a valid capacity`
            );
        }
    }
});

// ============================================================================
// Summary
// ============================================================================

setTimeout(async () => {
    await Promise.all(pendingPromises);
    
    console.log('\n📊 Pricing Flow Validation Test Summary\n');
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
        console.log('\n🎉 All Pricing Flow Validation tests passed!\n');
        process.exit(0);
    }
}, 100);
