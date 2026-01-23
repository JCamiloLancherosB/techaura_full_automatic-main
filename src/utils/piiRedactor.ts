/**
 * PII Redactor - Automatic redaction of Personally Identifiable Information
 * Redacts phone numbers and addresses from logs and text
 */

/**
 * Redact Colombian phone numbers from text
 * Patterns:
 * - +573XXXXXXXXX or 573XXXXXXXXX (international format)
 * - 3XXXXXXXXX (local format)
 */
export function redactPhone(text: string): string {
    if (!text) return text;
    
    // Redact international format: +573XXXXXXXXX or 573XXXXXXXXX
    let redacted = text.replace(/(\+?57)?3\d{9}/g, (match) => {
        // Keep last 4 digits for reference
        const last4 = match.slice(-4);
        return `[PHONE-***${last4}]`;
    });
    
    // Redact standalone phone numbers in parentheses or with separators
    redacted = redacted.replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, (match) => {
        const digits = match.replace(/\D/g, '');
        if (digits.length === 10) {
            const last4 = digits.slice(-4);
            return `[PHONE-***${last4}]`;
        }
        return match;
    });
    
    return redacted;
}

/**
 * Redact Colombian addresses from text
 * Patterns:
 * - Street types: calle, carrera, avenida, diagonal, etc.
 * - Building identifiers: torre, apartamento, casa, etc.
 */
export function redactAddress(text: string): string {
    if (!text) return text;
    
    // Pattern for Colombian addresses
    const addressPattern = /\b(calle|carrera|cra|cll|avenida|av|diagonal|diag|transversal|trans|circular|circ|manzana|torre|apartamento|apto|casa|interior|int)[\s\.\#\-]*\d+[\w\s\-\.\#\/]*(?:norte|sur|este|oeste|oriente|occidente)?\b/gi;
    
    let redacted = text.replace(addressPattern, '[ADDRESS-REDACTED]');
    
    return redacted;
}

/**
 * Redact all PII from text (phones and addresses)
 */
export function redactPII(text: string): string {
    if (!text) return text;
    
    let redacted = redactPhone(text);
    redacted = redactAddress(redacted);
    
    return redacted;
}

/**
 * Redact PII from objects (recursive)
 * Useful for redacting log objects
 */
export function redactPIIFromObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
        return typeof obj === 'string' ? redactPII(obj) : obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => redactPIIFromObject(item));
    }
    
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
        // Skip fields that should not be redacted (hashes, IDs, etc.)
        const skipFields = ['phone_hash', 'address_hash', 'id', 'order_id', 'customer_id', 'correlation_id'];
        if (skipFields.includes(key)) {
            redacted[key] = value;
            continue;
        }
        
        // Redact string values
        if (typeof value === 'string') {
            redacted[key] = redactPII(value);
        } else if (typeof value === 'object' && value !== null) {
            redacted[key] = redactPIIFromObject(value);
        } else {
            redacted[key] = value;
        }
    }
    
    return redacted;
}

/**
 * Check if text contains PII
 */
export function containsPII(text: string): boolean {
    if (!text) return false;
    
    // Check for phone numbers
    const phonePattern = /(\+?57)?3\d{9}/;
    if (phonePattern.test(text)) return true;
    
    // Check for addresses
    const addressPattern = /\b(calle|carrera|cra|cll|avenida|av|diagonal|diag|transversal|trans|circular|circ|manzana|torre|apartamento|apto|casa|interior|int)[\s\.\#\-]*\d+/gi;
    if (addressPattern.test(text)) return true;
    
    return false;
}
