export interface SafeIntOptions {
    min?: number;
    max?: number;
    fallback?: number;
}

export function toSafeInt(value: unknown, options: SafeIntOptions = {}): number {
    const min = options.min ?? Number.MIN_SAFE_INTEGER;
    const max = options.max ?? Number.MAX_SAFE_INTEGER;
    const fallback = options.fallback ?? min;
    const numeric = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(numeric)) {
        return clamp(fallback, min, max);
    }

    return clamp(Math.trunc(numeric), min, max);
}

function clamp(value: number, min: number, max: number): number {
    const safeMin = Math.min(min, max);
    const safeMax = Math.max(min, max);
    return Math.max(safeMin, Math.min(value, safeMax));
}
