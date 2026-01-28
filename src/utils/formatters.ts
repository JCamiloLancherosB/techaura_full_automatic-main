/**
 * Utilidades de formato para el sistema
 */

/**
 * Formatea un precio en formato colombiano
 */
export function formatPrice(price: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(price);
}

/**
 * Formatea una fecha en español
 */
export function formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(dateObj);
}

/**
 * Formatea un número de teléfono colombiano
 */
export function formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `+57 ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    }
    return phone;
}

/**
 * Acorta texto largo
 */
export function truncateText(text: string, maxLength: number = 50): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

/**
 * Convierte bytes a formato legible
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Genera un ID único
 */
export function generateUniqueId(prefix: string = ''): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${prefix}${timestamp}-${random}`.toUpperCase();
}

/**
 * Valida formato de email
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Valida formato de teléfono colombiano
 */
export function isValidColombianPhone(phone: string): boolean {
    const phoneRegex = /^(\+57|57)?[ -]*([0-9]{3})[ -]*([0-9]{3})[ -]*([0-9]{4})$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Escapa texto para SQL
 */
export function escapeSql(text: string): string {
    return text.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

/**
 * Capitaliza la primera letra
 */
export function capitalizeFirst(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Formatea un objeto JSON para logging
 */
export function formatJsonForLog(data: any): string {
    return JSON.stringify(data, null, 2)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '  ');
}

// ========================================
// Metric Conversion Functions (Unified)
// ========================================

/**
 * Converts bytes to megabytes with consistent precision
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Number of megabytes
 */
export function bytesToMB(bytes: number, decimals: number = 2): number {
    if (bytes < 0 || !Number.isFinite(bytes)) {
        return 0;
    }
    const mb = bytes / (1024 * 1024);
    return Math.round(mb * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Formats duration in milliseconds to human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "150ms", "2.5s", "1m 30s")
 */
export function formatDuration(ms: number): string {
    if (ms < 0 || !Number.isFinite(ms)) {
        return 'N/A';
    }
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Converts a ratio (0-1) to percentage (0-100)
 * @param ratio - Ratio value (0-1 or 0-100)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Percentage value clamped to 0-100
 */
export function ratioToPercent(ratio: number, decimals: number = 2): number {
    if (!Number.isFinite(ratio)) {
        return 0;
    }
    // If ratio is already in percentage form (> 1), use as-is
    const percent = ratio > 1 ? ratio : ratio * 100;
    const clamped = Math.max(0, Math.min(100, percent));
    return Math.round(clamped * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Formats percentage for display
 * @param value - Percentage value (0-100)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "45.5%")
 */
export function formatPercent(value: number | null, decimals: number = 1): string {
    if (value === null || !Number.isFinite(value)) {
        return 'N/A';
    }
    return `${value.toFixed(decimals)}%`;
}

// ========================================
// Memory Validation Functions
// ========================================

/**
 * Result of memory validation
 */
export interface ValidatedMemoryUsage {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    isValid: boolean;
    warnings: string[];
}

/**
 * Validates and corrects memory usage values
 * Logs errors when heapUsed > heapTotal and clamps to valid range
 * @param memoryUsage - Raw memory usage from process.memoryUsage()
 * @returns Validated memory usage with potential corrections
 */
export function validateMemoryUsage(memoryUsage: NodeJS.MemoryUsage): ValidatedMemoryUsage {
    const warnings: string[] = [];
    let { rss, heapUsed, heapTotal, external, arrayBuffers } = memoryUsage;
    
    // Validate heapUsed <= heapTotal
    if (heapUsed > heapTotal) {
        warnings.push(
            `Memory validation error: heapUsed (${bytesToMB(heapUsed)}MB) > heapTotal (${bytesToMB(heapTotal)}MB). Clamping heapUsed.`
        );
        console.error(`[Memory Validation] ${warnings[warnings.length - 1]}`);
        heapUsed = heapTotal;
    }
    
    // Validate non-negative values
    if (rss < 0 || heapUsed < 0 || heapTotal < 0) {
        warnings.push('Memory validation error: Negative memory values detected. Clamping to 0.');
        console.error(`[Memory Validation] ${warnings[warnings.length - 1]}`);
        rss = Math.max(0, rss);
        heapUsed = Math.max(0, heapUsed);
        heapTotal = Math.max(0, heapTotal);
    }
    
    // Validate that heap values are within reasonable bounds of RSS
    // RSS should be >= heapTotal in most cases
    if (heapTotal > rss && rss > 0) {
        warnings.push(
            `Memory validation warning: heapTotal (${bytesToMB(heapTotal)}MB) > rss (${bytesToMB(rss)}MB). This may indicate a measurement timing issue.`
        );
        console.warn(`[Memory Validation] ${warnings[warnings.length - 1]}`);
    }
    
    return {
        rss,
        heapUsed,
        heapTotal,
        isValid: warnings.length === 0,
        warnings
    };
}

/**
 * Gets validated memory usage in MB
 * Useful for logging and monitoring
 * @returns Memory usage in MB with validation
 */
export function getValidatedMemoryMB(): { rss: number; heapUsed: number; heapTotal: number; isValid: boolean } {
    const validated = validateMemoryUsage(process.memoryUsage());
    return {
        rss: bytesToMB(validated.rss),
        heapUsed: bytesToMB(validated.heapUsed),
        heapTotal: bytesToMB(validated.heapTotal),
        isValid: validated.isValid
    };
}

// ========================================
// Average Calculation Helpers
// ========================================

/**
 * Calculates average from an array of numbers
 * Returns null if array is empty (distinguishes "no data" from "0")
 * @param values - Array of numbers
 * @param decimals - Number of decimal places (default: 2)
 * @returns Average value or null if no data
 */
export function calculateAverage(values: number[], decimals: number = 2): number | null {
    const validValues = values.filter(v => Number.isFinite(v));
    if (validValues.length === 0) {
        return null;
    }
    const sum = validValues.reduce((a, b) => a + b, 0);
    const avg = sum / validValues.length;
    return Math.round(avg * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Recalculates average response time from samples when stored average is 0
 * but samples exist (prevents showing 0ms when there's actual data)
 * @param storedAverage - The stored/cached average value
 * @param sampleCount - Number of samples that contributed to the average
 * @param samples - Optional array of actual sample values
 * @returns Corrected average or null if truly no data
 */
export function recalculateAverageIfZero(
    storedAverage: number | null,
    sampleCount: number,
    samples?: number[]
): number | null {
    // If stored average is valid and non-zero, use it
    if (storedAverage !== null && storedAverage !== 0) {
        return storedAverage;
    }
    
    // If samples provided, recalculate
    if (samples && samples.length > 0) {
        return calculateAverage(samples);
    }
    
    // If no stored average but sample count > 0, this indicates an issue
    // Log warning but return null to indicate "unknown" rather than "0"
    if (sampleCount > 0 && storedAverage === 0) {
        console.warn(
            `[Metrics] Average is 0 but sample count is ${sampleCount}. ` +
            `This may indicate a calculation error or data loss.`
        );
        return null;
    }
    
    // No data available
    return null;
}

export default {
    formatPrice,
    formatDate,
    formatPhoneNumber,
    truncateText,
    formatBytes,
    generateUniqueId,
    isValidEmail,
    isValidColombianPhone,
    escapeSql,
    capitalizeFirst,
    formatJsonForLog,
    // Metric conversion functions
    bytesToMB,
    formatDuration,
    ratioToPercent,
    formatPercent,
    // Memory validation
    validateMemoryUsage,
    getValidatedMemoryMB,
    // Average calculation helpers
    calculateAverage,
    recalculateAverageIfZero
};
