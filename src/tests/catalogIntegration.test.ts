/**
 * Integration test to verify price consistency across all flows
 */

import { catalogService } from '../services/CatalogService';
import { PRICING } from '../constants/pricing';

console.log('\n🔍 Testing Price Consistency Across Flows\n');

// Test 1: Verify CatalogService matches pricing.ts
console.log('Test 1: CatalogService vs pricing.ts');

const categories = ['music', 'videos', 'movies'] as const;
let allMatch = true;

categories.forEach(category => {
    console.log(`\n  ${category.toUpperCase()}:`);
    const products = catalogService.getProductsByCategory(category);
    
    products.forEach(product => {
        const expectedPrice = PRICING[category][product.capacity]?.price;
        const actualPrice = product.price;
        
        if (expectedPrice === actualPrice) {
            console.log(`    ✅ ${product.capacity}: $${actualPrice.toLocaleString('es-CO')}`);
        } else {
            console.log(`    ❌ ${product.capacity}: Expected $${expectedPrice}, got $${actualPrice}`);
            allMatch = false;
        }
    });
});

if (allMatch) {
    console.log('\n✅ All prices match between CatalogService and pricing.ts\n');
} else {
    console.log('\n❌ Price mismatch detected!\n');
    process.exit(1);
}

// Test 2: Verify getPrice method works with different formats
console.log('Test 2: Price retrieval with different formats');

const testCases = [
    { category: 'music', capacity: '32GB', expected: PRICING.music['32GB'].price },
    { category: 'music', capacity: 32, expected: PRICING.music['32GB'].price },
    { category: 'music', capacity: '32', expected: PRICING.music['32GB'].price },
    { category: 'videos', capacity: '64GB', expected: PRICING.videos['64GB'].price },
    { category: 'videos', capacity: 64, expected: PRICING.videos['64GB'].price },
    { category: 'movies', capacity: '128GB', expected: PRICING.movies['128GB'].price },
    { category: 'movies', capacity: 128, expected: PRICING.movies['128GB'].price }
];

let allFormatsPassed = true;

testCases.forEach(({ category, capacity, expected }) => {
    const price = catalogService.getPrice(category as any, capacity);
    const match = price === expected;
    
    if (match) {
        console.log(`  ✅ ${category} ${capacity}: $${price.toLocaleString('es-CO')}`);
    } else {
        console.log(`  ❌ ${category} ${capacity}: Expected $${expected}, got $${price}`);
        allFormatsPassed = false;
    }
});

if (allFormatsPassed) {
    console.log('\n✅ All price format variations work correctly\n');
} else {
    console.log('\n❌ Some price formats failed!\n');
    process.exit(1);
}

// Test 3: Verify validation works correctly
console.log('Test 3: Selection validation');

const validationTests = [
    { category: 'music', capacity: 32, shouldBeValid: true },
    { category: 'music', capacity: 16, shouldBeValid: false }, // 16GB not available for music
    { category: 'videos', capacity: 64, shouldBeValid: true },
    { category: 'movies', capacity: 512, shouldBeValid: true },
    { category: 'movies', capacity: 8, shouldBeValid: false } // 8GB not available for movies
];

let allValidationsPassed = true;

validationTests.forEach(({ category, capacity, shouldBeValid }) => {
    const result = catalogService.validateSelection(category as any, capacity);
    const passed = result.isValid === shouldBeValid;
    
    if (passed) {
        console.log(`  ✅ ${category} ${capacity}GB: ${result.isValid ? 'Valid' : 'Invalid'} (as expected)`);
    } else {
        console.log(`  ❌ ${category} ${capacity}GB: Expected ${shouldBeValid ? 'valid' : 'invalid'}, got ${result.isValid ? 'valid' : 'invalid'}`);
        allValidationsPassed = false;
    }
});

if (allValidationsPassed) {
    console.log('\n✅ All validations work correctly\n');
} else {
    console.log('\n❌ Some validations failed!\n');
    process.exit(1);
}

// Test 4: Check that all categories have products
console.log('Test 4: Product availability');

let allCategoriesHaveProducts = true;

categories.forEach(category => {
    const products = catalogService.getProductsByCategory(category);
    const count = products.length;
    
    if (count > 0) {
        console.log(`  ✅ ${category}: ${count} products available`);
    } else {
        console.log(`  ❌ ${category}: No products found!`);
        allCategoriesHaveProducts = false;
    }
});

if (allCategoriesHaveProducts) {
    console.log('\n✅ All categories have products\n');
} else {
    console.log('\n❌ Some categories are missing products!\n');
    process.exit(1);
}

// Summary
console.log('═'.repeat(50));
console.log('🎉 ALL INTEGRATION TESTS PASSED!');
console.log('═'.repeat(50));
console.log('\n✨ Price consistency verified across:');
console.log('  • CatalogService');
console.log('  • constants/pricing.ts');
console.log('  • All product categories');
console.log('  • Different capacity formats');
console.log('  • Validation logic\n');

process.exit(0);
