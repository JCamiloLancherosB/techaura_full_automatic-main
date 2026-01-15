/**
 * String utilities for Colombian text processing
 */

/**
 * Normalize text by removing accents and converting to lowercase
 * Used for city/department matching in Colombian addresses
 */
export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .trim();
}

/**
 * Capitalize each word in a string
 */
export function capitalizeWords(text: string): string {
    return text
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Format Colombian phone number
 * Ensures it starts with country code 57
 */
export function formatColombianPhone(phone: string): string {
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    
    // If it's a 10-digit number starting with 3, add 57
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
        return '57' + cleaned;
    }
    
    // If it starts with +57, remove the +
    if (cleaned.startsWith('+57')) {
        return cleaned.substring(1);
    }
    
    return cleaned;
}

/**
 * Format currency in Colombian Pesos
 */
export function formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(amount);
}

/**
 * Shared intent detection utilities for all USB flows
 */

/**
 * Detect if user is asking about pricing/capacity
 */
export function isPricingIntent(message: string): boolean {
    const normalized = normalizeText(message);
    return /(precio|cuesta|cuanto|costo|vale|valor|capacidad|gb|tamaño)/.test(normalized);
}

/**
 * Detect if user is confirming/agreeing (Okey, Ok, Dale, etc.)
 */
export function isConfirmation(message: string): boolean {
    const normalized = normalizeText(message.trim());
    return /^(ok|okey|okay|si|dale|va|listo|perfecto|bien|bueno|claro)$/.test(normalized);
}
