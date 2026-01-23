/**
 * Phone Number Hashing Utility
 * Provides consistent hashing for phone numbers to avoid logging raw PII
 */

import { createHash } from 'crypto';

/**
 * Hash a phone number using SHA-256
 * Returns first 16 characters of the hash for brevity
 * @param phone - Phone number to hash
 * @returns Hashed phone number (16 chars)
 */
export function hashPhone(phone: string | undefined | null): string {
    if (!phone) {
        return 'unknown';
    }
    
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalized = phone.toString().replace(/[\s\-\(\)]/g, '');
    
    // Create SHA-256 hash
    const hash = createHash('sha256')
        .update(normalized)
        .digest('hex');
    
    // Return first 16 characters for brevity
    return hash.substring(0, 16);
}

/**
 * Hash multiple phone numbers
 * @param phones - Array of phone numbers to hash
 * @returns Array of hashed phone numbers
 */
export function hashPhones(phones: (string | undefined | null)[]): string[] {
    return phones.map(hashPhone);
}

/**
 * Create a phone hash map (useful for batch operations)
 * @param phones - Array of phone numbers
 * @returns Map of original phone to hashed phone
 */
export function createPhoneHashMap(phones: string[]): Map<string, string> {
    const map = new Map<string, string>();
    phones.forEach(phone => {
        map.set(phone, hashPhone(phone));
    });
    return map;
}
