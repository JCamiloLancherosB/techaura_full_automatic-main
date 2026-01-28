/**
 * Phone Number Hashing Utility
 * Provides consistent hashing for phone numbers to avoid logging raw PII
 * 
 * IMPORTANT: All phone identifiers should be normalized using normalizePhoneId()
 * before being used as keys in databases, caches, or for deduplication.
 * This ensures consistent identification regardless of the input format
 * (e.g., "573136524181", "157595436335191@lid", "573001234567@s.whatsapp.net").
 */

import { createHash } from 'crypto';

/**
 * Normalize a phone identifier to its canonical form.
 * 
 * This is the SINGLE SOURCE OF TRUTH for phone normalization.
 * Use this function at all entry points where phone numbers are received
 * to ensure consistent keys across:
 * - conversation_state
 * - follow-up suppression
 * - message deduplication
 * - analytics
 * - any other phone-keyed storage
 * 
 * Normalization steps:
 * 1. Trims whitespace
 * 2. Strips WhatsApp JID suffixes (@lid, @s.whatsapp.net, @c.us, @g.us, @broadcast)
 * 3. Removes all non-digit characters (spaces, dashes, parentheses, plus sign)
 * 4. Returns digits-only canonical format
 * 
 * @param raw - Raw phone identifier (may include JID suffixes, formatting, etc.)
 * @returns Canonical phone identifier (digits only) or empty string if invalid
 * 
 * @example
 * normalizePhoneId("157595436335191@lid") => "157595436335191"
 * normalizePhoneId("573136524181@s.whatsapp.net") => "573136524181"
 * normalizePhoneId("+57 313 652 4181") => "573136524181"
 * normalizePhoneId("573136524181") => "573136524181"
 */
export function normalizePhoneId(raw: string | undefined | null): string {
    if (!raw || typeof raw !== 'string') {
        return '';
    }

    // Step 1: Trim whitespace
    let normalized = raw.trim();

    // Step 2: Strip WhatsApp JID suffixes (case-insensitive)
    // Order matters - check @lid first as it's the problematic suffix mentioned in the issue
    normalized = normalized
        .replace(/@lid$/i, '')
        .replace(/@s\.whatsapp\.net$/i, '')
        .replace(/@c\.us$/i, '')
        .replace(/@g\.us$/i, '')
        .replace(/@broadcast$/i, '');

    // Step 3: Remove all non-digit characters
    // This handles formatting like spaces, dashes, parentheses, and leading +
    normalized = normalized.replace(/\D/g, '');

    return normalized;
}

/**
 * Hash a phone number using SHA-256
 * Returns first 16 characters of the hash for brevity
 * 
 * NOTE: This function now normalizes the phone ID before hashing
 * to ensure consistent hashes regardless of input format.
 * 
 * @param phone - Phone number to hash (will be normalized first)
 * @returns Hashed phone number (16 chars)
 */
export function hashPhone(phone: string | undefined | null): string {
    if (!phone) {
        return 'unknown';
    }
    
    // Normalize phone ID to ensure consistent hashing
    // This ensures "573136524181" and "573136524181@lid" produce the same hash
    const normalized = normalizePhoneId(phone);
    
    if (!normalized) {
        return 'unknown';
    }
    
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
