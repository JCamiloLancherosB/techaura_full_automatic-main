export interface SafeIntOptions {
    min?: number;
    max?: number;
    fallback?: number;
}

/**
 * Convert unknown input to a bounded integer. When fallback is not provided,
 * it defaults to the configured minimum.
 */
export function toSafeInt(value: unknown, options: SafeIntOptions = {}): number {
    const min = options.min ?? 0;
    const max = options.max ?? Number.MAX_SAFE_INTEGER;
    const fallback = options.fallback ?? min;

    if (min > max) {
        throw new Error('toSafeInt: min cannot exceed max');
    }
    const numeric = typeof value === 'number' ? value : Number(String(value));

    if (!Number.isFinite(numeric)) {
        return clamp(fallback, min, max);
    }

    return clamp(Math.trunc(numeric), min, max);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
}

/**
 * Safely parse JSON that might already be an object or a string.
 * MySQL JSON columns can return data as already-parsed objects/arrays or as strings
 * depending on the driver configuration.
 * 
 * This function handles all cases:
 * - null/undefined → returns fallback
 * - Already parsed object → returns as-is
 * - Already parsed array → returns as-is (arrays are valid JSON data)
 * - Valid JSON string → parses and returns the result
 * - Invalid JSON string → returns fallback
 * - Empty string → returns fallback
 * - Other types (number, boolean) → returns fallback
 * 
 * @param value - The value to parse (might be an object, array, string, or null/undefined)
 * @param fallback - The fallback value to return if parsing fails (default: {})
 * @returns The parsed object/array or the fallback value
 */
export function safeJsonParse<T = Record<string, unknown>>(
    value: unknown,
    fallback: T = {} as T
): T {
    // If value is null or undefined, return fallback
    if (value === null || value === undefined) {
        return fallback;
    }
    
    // If value is already an object (including arrays), return it as-is
    // This handles MySQL JSON columns that return data as already-parsed objects/arrays
    if (typeof value === 'object') {
        return value as T;
    }
    
    // If value is a string, try to parse it as JSON
    if (typeof value === 'string') {
        // Empty string should return fallback
        if (value.trim() === '') {
            return fallback;
        }
        
        try {
            return JSON.parse(value) as T;
        } catch {
            // Return fallback if parsing fails
            return fallback;
        }
    }
    
    // For any other type (number, boolean, etc.), return fallback
    return fallback;
}
