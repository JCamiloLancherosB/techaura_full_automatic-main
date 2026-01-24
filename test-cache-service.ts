/**
 * Test Cache Service Implementation
 * Demonstrates cache TTL and invalidation features
 */

import { cacheService, CACHE_KEYS, CACHE_TTL } from './src/services/CacheService';

console.log('=== Cache Service Test ===\n');

// Test 1: Basic set and get
console.log('Test 1: Basic cache set/get');
cacheService.set('test:key1', { value: 'Hello World' }, { ttl: 5000 });
const result1 = cacheService.get('test:key1');
console.log('  Set and get:', result1 ? '✅ PASS' : '❌ FAIL');
console.log('  Value:', result1);

// Test 2: TTL expiration
console.log('\nTest 2: TTL expiration (5s)');
cacheService.set('test:expiring', { value: 'Will expire soon' }, { ttl: 100 });
setTimeout(() => {
    const expired = cacheService.get('test:expiring');
    console.log('  After TTL:', expired === null ? '✅ PASS (expired)' : '❌ FAIL (still cached)');
}, 150);

// Test 3: Cache invalidation patterns
console.log('\nTest 3: Pattern-based invalidation');
cacheService.set('order:123:events', { events: [] }, { ttl: 30000 });
cacheService.set('order:123:timeline', { timeline: [] }, { ttl: 30000 });
cacheService.set('order:456:events', { events: [] }, { ttl: 30000 });
const invalidated = cacheService.invalidatePattern('order:123:*');
console.log('  Invalidated count:', invalidated, invalidated === 2 ? '✅ PASS' : '❌ FAIL');
const stillExists = cacheService.get('order:456:events');
console.log('  Other order cache preserved:', stillExists ? '✅ PASS' : '❌ FAIL');

// Test 4: Dashboard cache keys
console.log('\nTest 4: Dashboard cache keys');
cacheService.set(CACHE_KEYS.DASHBOARD_STATS, { stats: 'data' }, { ttl: CACHE_TTL.DASHBOARD });
const dashboardData = cacheService.get(CACHE_KEYS.DASHBOARD_STATS);
console.log('  Dashboard cache:', dashboardData ? '✅ PASS' : '❌ FAIL');
console.log('  TTL:', CACHE_TTL.DASHBOARD + 'ms (15 seconds)');

// Test 5: Order invalidation
console.log('\nTest 5: Order invalidation (simulating order update)');
cacheService.set(CACHE_KEYS.DASHBOARD_STATS, { orders: 100 }, { ttl: CACHE_TTL.DASHBOARD });
cacheService.set(CACHE_KEYS.ANALYTICS_DAILY, { daily: 'stats' }, { ttl: CACHE_TTL.ANALYTICS });
cacheService.invalidateOrder('123');
const afterInvalidation = cacheService.get(CACHE_KEYS.DASHBOARD_STATS);
console.log('  Dashboard cleared:', afterInvalidation === null ? '✅ PASS' : '❌ FAIL');

// Test 6: Cache statistics
setTimeout(() => {
    console.log('\nTest 6: Cache statistics');
    const stats = cacheService.getStats();
    console.log('  Cache size:', stats.size);
    console.log('  Cache keys:', stats.keys);
    console.log('  Cache entries:', stats.entries.map(e => ({
        key: e.key,
        age: Math.round(e.age / 1000) + 's',
        ttl: Math.round(e.ttl / 1000) + 's'
    })));
    
    console.log('\n=== All tests completed ===');
    
    // Stop auto-cleanup for clean exit
    cacheService.stopAutoCleanup();
}, 200);
