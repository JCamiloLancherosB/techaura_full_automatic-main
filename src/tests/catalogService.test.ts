/**
 * Tests for CatalogService
 * Validates unified catalog service functionality
 */

import { catalogService, CatalogService, CategoryId } from '../services/CatalogService';
import { PRICING } from '../constants/pricing';

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

// ============================================================================
// Tests
// ============================================================================

console.log('\n🧪 Running CatalogService Tests\n');

// Test: Singleton pattern
test('CatalogService should be a singleton', () => {
    const instance1 = CatalogService.getInstance();
    const instance2 = CatalogService.getInstance();
    assertTrue(instance1 === instance2, 'Should return same instance');
    assertTrue(instance1 === catalogService, 'Should match exported instance');
});

// Test: getCategories
test('getCategories should return all categories', () => {
    const categories = catalogService.getCategories();
    assertEquals(categories.length, 3, 'Should have 3 categories');
    
    const categoryIds = categories.map(c => c.id);
    assertTrue(categoryIds.includes('music'), 'Should include music');
    assertTrue(categoryIds.includes('videos'), 'Should include videos');
    assertTrue(categoryIds.includes('movies'), 'Should include movies');
});

// Test: getCategory
test('getCategory should return specific category', () => {
    const musicCategory = catalogService.getCategory('music');
    assertTrue(musicCategory !== null, 'Should return music category');
    assertEquals(musicCategory?.id, 'music');
    assertEquals(musicCategory?.displayName, 'USB Musical');
    
    const invalidCategory = catalogService.getCategory('invalid' as CategoryId);
    assertTrue(invalidCategory === null, 'Should return null for invalid category');
});

// Test: getProductsByCategory - Music
test('getProductsByCategory should return music products', () => {
    const products = catalogService.getProductsByCategory('music');
    
    assertTrue(products.length > 0, 'Should have products');
    assertEquals(products.length, 4, 'Music should have 4 capacities');
    
    // Check first product (8GB)
    const product8gb = products.find(p => p.capacity === '8GB');
    assertTrue(product8gb !== undefined, 'Should have 8GB option');
    assertEquals(product8gb?.categoryId, 'music');
    assertEquals(product8gb?.price, PRICING.music['8GB'].price);
    assertEquals(product8gb?.content.count, 1400);
    assertEquals(product8gb?.content.unit, 'canciones');
    assertTrue(product8gb?.inclusions.length! > 0, 'Should have inclusions');
});

// Test: getProductsByCategory - Videos
test('getProductsByCategory should return video products', () => {
    const products = catalogService.getProductsByCategory('videos');
    
    assertTrue(products.length > 0, 'Should have products');
    assertEquals(products.length, 4, 'Videos should have 4 capacities');
    
    const product32gb = products.find(p => p.capacity === '32GB');
    assertTrue(product32gb !== undefined, 'Should have 32GB option');
    assertEquals(product32gb?.price, PRICING.videos['32GB'].price);
    assertEquals(product32gb?.content.count, 1000);
    assertEquals(product32gb?.content.unit, 'videos');
});

// Test: getProductsByCategory - Movies
test('getProductsByCategory should return movie products', () => {
    const products = catalogService.getProductsByCategory('movies');
    
    assertTrue(products.length > 0, 'Should have products');
    assertEquals(products.length, 4, 'Movies should have 4 capacities');
    
    const product64gb = products.find(p => p.capacity === '64GB');
    assertTrue(product64gb !== undefined, 'Should have 64GB option');
    assertEquals(product64gb?.price, PRICING.movies['64GB'].price);
    assertEquals(product64gb?.content.count, 55);
    assertEquals(product64gb?.content.unit, 'películas');
});

// Test: getProductsByCategory - Invalid category
test('getProductsByCategory should handle invalid category', () => {
    const products = catalogService.getProductsByCategory('invalid' as CategoryId);
    assertEquals(products.length, 0, 'Should return empty array for invalid category');
});

// Test: getPrice with different formats
test('getPrice should handle different capacity formats', () => {
    // String with GB
    const price1 = catalogService.getPrice('music', '32GB');
    assertEquals(price1, PRICING.music['32GB'].price);
    
    // Number
    const price2 = catalogService.getPrice('music', 32);
    assertEquals(price2, PRICING.music['32GB'].price);
    
    // String without GB
    const price3 = catalogService.getPrice('music', '32');
    assertEquals(price3, PRICING.music['32GB'].price);
    
    // Should all be equal
    assertEquals(price1, price2);
    assertEquals(price2, price3);
});

// Test: getPrice for all categories
test('getPrice should return correct prices for all categories', () => {
    // Music
    assertEquals(catalogService.getPrice('music', 8), 54900);
    assertEquals(catalogService.getPrice('music', 32), 84900);
    assertEquals(catalogService.getPrice('music', 64), 119900);
    assertEquals(catalogService.getPrice('music', 128), 159900);
    
    // Videos
    assertEquals(catalogService.getPrice('videos', 8), 54900);
    assertEquals(catalogService.getPrice('videos', 32), 84900);
    
    // Movies
    assertEquals(catalogService.getPrice('movies', 64), 119900);
    assertEquals(catalogService.getPrice('movies', 128), 159900);
    assertEquals(catalogService.getPrice('movies', 256), 219900);
    assertEquals(catalogService.getPrice('movies', 512), 319900);
});

// Test: getFormattedPrice
test('getFormattedPrice should return formatted price', () => {
    const formatted = catalogService.getFormattedPrice('music', 32);
    assertTrue(formatted.includes('84.900') || formatted.includes('84900'), 'Should format price correctly');
    assertTrue(formatted.includes('$'), 'Should include currency symbol');
});

// Test: validateSelection - Valid selections
test('validateSelection should validate correct selections', () => {
    const result1 = catalogService.validateSelection('music', 32);
    assertTrue(result1.isValid, 'Music 32GB should be valid');
    assertEquals(result1.errors.length, 0);
    
    const result2 = catalogService.validateSelection('videos', '64GB');
    assertTrue(result2.isValid, 'Videos 64GB should be valid');
    
    const result3 = catalogService.validateSelection('movies', 128);
    assertTrue(result3.isValid, 'Movies 128GB should be valid');
});

// Test: validateSelection - Invalid category
test('validateSelection should reject invalid category', () => {
    const result = catalogService.validateSelection('invalid' as CategoryId, 32);
    assertFalse(result.isValid, 'Should be invalid');
    assertTrue(result.errors.length > 0, 'Should have errors');
    assertTrue(result.errors[0].includes('Categoría inválida'), 'Error should mention invalid category');
});

// Test: validateSelection - Invalid capacity
test('validateSelection should reject invalid capacity', () => {
    const result = catalogService.validateSelection('music', 16);
    assertFalse(result.isValid, 'Music 16GB should be invalid (not available)');
    assertTrue(result.errors.length > 0, 'Should have errors');
    assertTrue(result.errors[0].includes('Capacidad no disponible'), 'Error should mention capacity');
    assertTrue(result.warnings !== undefined && result.warnings.length > 0, 'Should have warnings');
});

// Test: getAvailableCapacities
test('getAvailableCapacities should return correct capacities', () => {
    const musicCapacities = catalogService.getAvailableCapacities('music');
    assertEquals(musicCapacities.length, 4);
    assertTrue(musicCapacities.includes('8GB'));
    assertTrue(musicCapacities.includes('32GB'));
    assertTrue(musicCapacities.includes('64GB'));
    assertTrue(musicCapacities.includes('128GB'));
    
    const moviesCapacities = catalogService.getAvailableCapacities('movies');
    assertEquals(moviesCapacities.length, 4);
    assertTrue(moviesCapacities.includes('64GB'));
    assertTrue(moviesCapacities.includes('512GB'));
});

// Test: getProduct
test('getProduct should return specific product details', () => {
    const product = catalogService.getProduct('music', 32);
    assertTrue(product !== null, 'Should return product');
    assertEquals(product?.categoryId, 'music');
    assertEquals(product?.capacity, '32GB');
    assertEquals(product?.capacityGb, 32);
    assertEquals(product?.price, PRICING.music['32GB'].price);
    assertTrue(product?.popular, '32GB should be marked as popular');
});

// Test: getAllProducts
test('getAllProducts should return all products', () => {
    const allProducts = catalogService.getAllProducts();
    assertTrue(allProducts.length > 0, 'Should have products');
    
    // Should have products from all categories
    const musicProducts = allProducts.filter(p => p.categoryId === 'music');
    const videoProducts = allProducts.filter(p => p.categoryId === 'videos');
    const movieProducts = allProducts.filter(p => p.categoryId === 'movies');
    
    assertTrue(musicProducts.length > 0, 'Should have music products');
    assertTrue(videoProducts.length > 0, 'Should have video products');
    assertTrue(movieProducts.length > 0, 'Should have movie products');
});

// Test: searchProducts
test('searchProducts should filter by category', () => {
    const musicProducts = catalogService.searchProducts({ categoryId: 'music' });
    assertTrue(musicProducts.every(p => p.categoryId === 'music'), 'All should be music');
});

test('searchProducts should filter by price range', () => {
    const products = catalogService.searchProducts({ minPrice: 100000, maxPrice: 200000 });
    assertTrue(products.every(p => p.price >= 100000 && p.price <= 200000), 'All should be in price range');
});

test('searchProducts should filter by capacity range', () => {
    const products = catalogService.searchProducts({ minCapacity: 32, maxCapacity: 128 });
    assertTrue(products.every(p => p.capacityGb >= 32 && p.capacityGb <= 128), 'All should be in capacity range');
});

test('searchProducts should combine filters', () => {
    const products = catalogService.searchProducts({ 
        categoryId: 'music',
        minCapacity: 32,
        maxPrice: 100000
    });
    assertTrue(products.every(p => 
        p.categoryId === 'music' && 
        p.capacityGb >= 32 && 
        p.price <= 100000
    ), 'All should match all criteria');
});

// Test: Price consistency across service
test('Prices should be consistent with pricing.ts', () => {
    // Check music prices
    assertEquals(catalogService.getPrice('music', 8), PRICING.music['8GB'].price);
    assertEquals(catalogService.getPrice('music', 32), PRICING.music['32GB'].price);
    assertEquals(catalogService.getPrice('music', 64), PRICING.music['64GB'].price);
    assertEquals(catalogService.getPrice('music', 128), PRICING.music['128GB'].price);
    
    // Check video prices
    assertEquals(catalogService.getPrice('videos', 8), PRICING.videos['8GB'].price);
    assertEquals(catalogService.getPrice('videos', 32), PRICING.videos['32GB'].price);
    
    // Check movie prices
    assertEquals(catalogService.getPrice('movies', 64), PRICING.movies['64GB'].price);
    assertEquals(catalogService.getPrice('movies', 512), PRICING.movies['512GB'].price);
});

// ============================================================================
// Summary
// ============================================================================

setTimeout(() => {
    console.log('\n📊 Test Summary\n');
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
        console.log('\n🎉 All tests passed!\n');
        process.exit(0);
    }
}, 100);
