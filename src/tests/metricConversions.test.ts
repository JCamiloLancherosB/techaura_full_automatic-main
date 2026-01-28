/**
 * Unit tests for metric conversion functions
 * 
 * Tests cover:
 * 1. bytesToMB - bytes to megabytes conversion
 * 2. formatDuration - milliseconds to human-readable format
 * 3. ratioToPercent - ratio (0-1) to percentage (0-100)
 * 4. formatPercent - percentage to display string
 * 5. validateMemoryUsage - memory validation with heapUsed <= heapTotal
 * 6. calculateAverage - average with null for no data
 * 7. recalculateAverageIfZero - fix 0 averages when samples exist
 * 
 * Run with: npx tsx src/tests/metricConversions.test.ts
 */

import {
    bytesToMB,
    formatDuration,
    ratioToPercent,
    formatPercent,
    validateMemoryUsage,
    getValidatedMemoryMB,
    calculateAverage,
    recalculateAverageIfZero
} from '../utils/formatters';

// Test runner helpers
let testsPassed = 0;
let testsFailed = 0;

function describe(name: string, fn: () => void) {
    console.log(`\n--- ${name} ---`);
    fn();
}

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error: any) {
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
        testsFailed++;
    }
}

function expect<T>(actual: T) {
    return {
        toBe(expected: T) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null, got ${actual}`);
            }
        },
        toBeGreaterThan(expected: number) {
            if (typeof actual !== 'number' || actual <= expected) {
                throw new Error(`Expected ${actual} to be > ${expected}`);
            }
        },
        toBeLessThan(expected: number) {
            if (typeof actual !== 'number' || actual >= expected) {
                throw new Error(`Expected ${actual} to be < ${expected}`);
            }
        },
        toBeCloseTo(expected: number, precision: number = 2) {
            if (typeof actual !== 'number') {
                throw new Error(`Expected ${actual} to be a number`);
            }
            const tolerance = Math.pow(10, -precision);
            if (Math.abs(actual - expected) > tolerance) {
                throw new Error(`Expected ${actual} to be close to ${expected} (tolerance: ${tolerance})`);
            }
        },
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy value, got ${actual}`);
            }
        },
        toBeFalsy() {
            if (actual) {
                throw new Error(`Expected falsy value, got ${actual}`);
            }
        },
        toContain(expected: string) {
            if (typeof actual !== 'string' || !actual.includes(expected)) {
                throw new Error(`Expected "${actual}" to contain "${expected}"`);
            }
        },
        toHaveLength(expected: number) {
            if (!Array.isArray(actual) || actual.length !== expected) {
                throw new Error(`Expected array length ${expected}, got ${Array.isArray(actual) ? actual.length : 'not array'}`);
            }
        }
    };
}

console.log('🧪 Running metric conversion tests...\n');

// ===============================
// bytesToMB Tests
// ===============================
describe('bytesToMB', () => {
    test('converts 0 bytes to 0 MB', () => {
        expect(bytesToMB(0)).toBe(0);
    });

    test('converts 1 MB (1048576 bytes) to 1 MB', () => {
        expect(bytesToMB(1024 * 1024)).toBe(1);
    });

    test('converts 100 MB correctly', () => {
        expect(bytesToMB(100 * 1024 * 1024)).toBe(100);
    });

    test('converts 256 MB with 2 decimal precision', () => {
        const bytes = 256.5 * 1024 * 1024;
        expect(bytesToMB(bytes)).toBe(256.5);
    });

    test('handles very large values (1 GB)', () => {
        expect(bytesToMB(1024 * 1024 * 1024)).toBe(1024);
    });

    test('handles negative values by returning 0', () => {
        expect(bytesToMB(-1000)).toBe(0);
    });

    test('handles Infinity by returning 0', () => {
        expect(bytesToMB(Infinity)).toBe(0);
    });

    test('handles NaN by returning 0', () => {
        expect(bytesToMB(NaN)).toBe(0);
    });

    test('respects custom decimal precision', () => {
        const bytes = 1.555 * 1024 * 1024;
        expect(bytesToMB(bytes, 1)).toBe(1.6); // Rounds to 1 decimal
    });
});

// ===============================
// formatDuration Tests
// ===============================
describe('formatDuration', () => {
    test('formats 0ms correctly', () => {
        expect(formatDuration(0)).toBe('0ms');
    });

    test('formats milliseconds < 1000', () => {
        expect(formatDuration(150)).toBe('150ms');
        expect(formatDuration(999)).toBe('999ms');
    });

    test('formats seconds', () => {
        expect(formatDuration(1000)).toBe('1.0s');
        expect(formatDuration(2500)).toBe('2.5s');
        expect(formatDuration(59999)).toBe('60.0s');
    });

    test('formats minutes and seconds', () => {
        expect(formatDuration(60000)).toBe('1m');
        expect(formatDuration(90000)).toBe('1m 30s');
        expect(formatDuration(120000)).toBe('2m');
    });

    test('handles negative values', () => {
        expect(formatDuration(-100)).toBe('N/A');
    });

    test('handles Infinity', () => {
        expect(formatDuration(Infinity)).toBe('N/A');
    });

    test('handles NaN', () => {
        expect(formatDuration(NaN)).toBe('N/A');
    });
});

// ===============================
// ratioToPercent Tests
// ===============================
describe('ratioToPercent', () => {
    test('converts 0 ratio to 0%', () => {
        expect(ratioToPercent(0)).toBe(0);
    });

    test('converts 1 ratio to 100%', () => {
        expect(ratioToPercent(1)).toBe(100);
    });

    test('converts 0.5 ratio to 50%', () => {
        expect(ratioToPercent(0.5)).toBe(50);
    });

    test('converts 0.123 ratio with precision', () => {
        expect(ratioToPercent(0.123, 1)).toBe(12.3);
    });

    test('handles values already in percentage form (> 1)', () => {
        expect(ratioToPercent(75)).toBe(75);
    });

    test('clamps percentage values above 100', () => {
        expect(ratioToPercent(150)).toBe(100); // 150% clamped to 100%
    });

    test('small percentage values (1-100 range) are kept as-is', () => {
        expect(ratioToPercent(1.5)).toBe(1.5); // 1.5% is a valid percentage
    });

    test('clamps negative values to 0', () => {
        expect(ratioToPercent(-0.5)).toBe(0);
    });

    test('handles Infinity by returning 0', () => {
        expect(ratioToPercent(Infinity)).toBe(0);
    });

    test('handles NaN by returning 0', () => {
        expect(ratioToPercent(NaN)).toBe(0);
    });
});

// ===============================
// formatPercent Tests
// ===============================
describe('formatPercent', () => {
    test('formats 0%', () => {
        expect(formatPercent(0)).toBe('0.0%');
    });

    test('formats 100%', () => {
        expect(formatPercent(100)).toBe('100.0%');
    });

    test('formats 45.5%', () => {
        expect(formatPercent(45.5)).toBe('45.5%');
    });

    test('respects custom decimals', () => {
        expect(formatPercent(45.567, 2)).toBe('45.57%');
    });

    test('returns N/A for null', () => {
        expect(formatPercent(null)).toBe('N/A');
    });

    test('returns N/A for NaN', () => {
        expect(formatPercent(NaN)).toBe('N/A');
    });

    test('returns N/A for Infinity', () => {
        expect(formatPercent(Infinity)).toBe('N/A');
    });
});

// ===============================
// validateMemoryUsage Tests
// ===============================
describe('validateMemoryUsage', () => {
    test('validates normal memory usage', () => {
        const memUsage: NodeJS.MemoryUsage = {
            rss: 256 * 1024 * 1024,       // 256 MB
            heapUsed: 100 * 1024 * 1024,  // 100 MB
            heapTotal: 150 * 1024 * 1024, // 150 MB
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
        };
        
        const result = validateMemoryUsage(memUsage);
        expect(result.isValid).toBeTruthy();
        expect(result.warnings.length).toBe(0);
    });

    test('clamps heapUsed when > heapTotal', () => {
        const memUsage: NodeJS.MemoryUsage = {
            rss: 256 * 1024 * 1024,
            heapUsed: 200 * 1024 * 1024,  // 200 MB - INVALID: > heapTotal
            heapTotal: 150 * 1024 * 1024, // 150 MB
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
        };
        
        const result = validateMemoryUsage(memUsage);
        expect(result.isValid).toBeFalsy();
        expect(result.heapUsed).toBe(result.heapTotal);
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('handles negative values', () => {
        const memUsage: NodeJS.MemoryUsage = {
            rss: -100,
            heapUsed: 100 * 1024 * 1024,
            heapTotal: 150 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
        };
        
        const result = validateMemoryUsage(memUsage);
        expect(result.rss).toBe(0);
        expect(result.isValid).toBeFalsy();
    });

    test('warns when heapTotal > rss', () => {
        const memUsage: NodeJS.MemoryUsage = {
            rss: 100 * 1024 * 1024,       // 100 MB RSS
            heapUsed: 80 * 1024 * 1024,
            heapTotal: 150 * 1024 * 1024, // 150 MB heapTotal > RSS
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
        };
        
        const result = validateMemoryUsage(memUsage);
        // Should have a warning but still be usable
        expect(result.warnings.length).toBeGreaterThan(0);
    });
});

// ===============================
// getValidatedMemoryMB Tests
// ===============================
describe('getValidatedMemoryMB', () => {
    test('returns memory values in MB', () => {
        const result = getValidatedMemoryMB();
        
        // Should have valid structure
        expect(typeof result.rss).toBe('number');
        expect(typeof result.heapUsed).toBe('number');
        expect(typeof result.heapTotal).toBe('number');
        expect(typeof result.isValid).toBe('boolean');
        
        // Values should be reasonable (> 0 MB)
        expect(result.rss).toBeGreaterThan(0);
        expect(result.heapUsed).toBeGreaterThan(0);
    });
});

// ===============================
// calculateAverage Tests
// ===============================
describe('calculateAverage', () => {
    test('returns null for empty array', () => {
        expect(calculateAverage([])).toBeNull();
    });

    test('calculates average of single value', () => {
        expect(calculateAverage([100])).toBe(100);
    });

    test('calculates average of multiple values', () => {
        expect(calculateAverage([100, 200, 300])).toBe(200);
    });

    test('handles mixed valid and invalid values', () => {
        expect(calculateAverage([100, NaN, 200, Infinity, 300])).toBe(200);
    });

    test('returns null when all values are invalid', () => {
        expect(calculateAverage([NaN, Infinity, -Infinity])).toBeNull();
    });

    test('respects decimal precision', () => {
        expect(calculateAverage([1, 2, 3], 1)).toBe(2);
        expect(calculateAverage([1, 2, 4], 1)).toBeCloseTo(2.3, 1);
    });
});

// ===============================
// recalculateAverageIfZero Tests
// ===============================
describe('recalculateAverageIfZero', () => {
    test('returns stored average when non-zero', () => {
        expect(recalculateAverageIfZero(150, 10)).toBe(150);
    });

    test('returns stored average when null with no samples', () => {
        expect(recalculateAverageIfZero(null, 0)).toBeNull();
    });

    test('recalculates from samples when stored is 0', () => {
        const samples = [100, 200, 300];
        expect(recalculateAverageIfZero(0, 3, samples)).toBe(200);
    });

    test('returns null when 0 with count > 0 but no samples', () => {
        // This should log a warning and return null
        expect(recalculateAverageIfZero(0, 5)).toBeNull();
    });

    test('returns null when null with samples but empty', () => {
        expect(recalculateAverageIfZero(null, 0, [])).toBeNull();
    });

    test('handles samples with 0 stored average', () => {
        const samples = [50, 100, 150];
        const result = recalculateAverageIfZero(0, 3, samples);
        expect(result).toBe(100);
    });
});

// ===============================
// Integration Tests
// ===============================
describe('Integration: Real-world scenarios', () => {
    test('Memory reporting matches process.memoryUsage order of magnitude', () => {
        const processMemory = process.memoryUsage();
        const validated = getValidatedMemoryMB();
        
        // Convert to bytes for comparison
        const reportedRssBytes = validated.rss * 1024 * 1024;
        
        // Should be within 10% of actual (accounting for measurement timing)
        const diff = Math.abs(processMemory.rss - reportedRssBytes);
        const tolerance = processMemory.rss * 0.1;
        
        expect(diff).toBeLessThan(tolerance);
    });

    test('Average response time calculation prevents 0 with samples', () => {
        const samples = [10, 20, 30, 40, 50]; // Response times in ms
        const storedAvg = 0; // Buggy stored value
        
        const correctedAvg = recalculateAverageIfZero(storedAvg, samples.length, samples);
        
        expect(correctedAvg).toBe(30); // Should be 30, not 0
    });

    test('Percentage formatting chain works correctly', () => {
        const ratio = 0.456;
        const percent = ratioToPercent(ratio);
        const formatted = formatPercent(percent);
        
        expect(percent).toBe(45.6);
        expect(formatted).toBe('45.6%');
    });

    test('Memory validation catches heapUsed > heapTotal', () => {
        // Simulate a buggy memory reading
        const buggyMemory: NodeJS.MemoryUsage = {
            rss: 500 * 1024 * 1024,
            heapUsed: 300 * 1024 * 1024,  // Bug: heapUsed > heapTotal
            heapTotal: 200 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
        };
        
        const validated = validateMemoryUsage(buggyMemory);
        
        // Should clamp heapUsed to heapTotal
        expect(validated.heapUsed).toBe(validated.heapTotal);
        expect(validated.isValid).toBeFalsy();
        expect(validated.warnings.length).toBeGreaterThan(0);
    });
});

// ===============================
// Summary
// ===============================
console.log('\n=================================');
console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('=================================');

if (testsFailed > 0) {
    process.exit(1);
}
