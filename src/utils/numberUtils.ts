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
