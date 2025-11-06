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
    formatJsonForLog
};
