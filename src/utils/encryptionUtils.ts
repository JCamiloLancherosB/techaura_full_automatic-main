/**
 * Encryption Utility - AES-GCM encryption/decryption for PII data
 * Uses environment-provided key for encrypting sensitive fields
 */

import crypto from 'crypto';

// AES-GCM parameters
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

/**
 * Get encryption key from environment or generate a default one
 * In production, this MUST be set in environment variables
 */
function getEncryptionKey(): Buffer {
    const keyHex = process.env.PII_ENCRYPTION_KEY;
    
    if (!keyHex) {
        // In development, use a consistent key (DO NOT use in production)
        if (process.env.NODE_ENV !== 'production') {
            console.warn('⚠️  PII_ENCRYPTION_KEY not set, using development key');
            return crypto.scryptSync('dev-encryption-key', 'salt', 32);
        }
        
        throw new Error('PII_ENCRYPTION_KEY environment variable must be set in production');
    }
    
    // Derive key from environment variable
    const key = Buffer.from(keyHex, 'hex');
    
    if (key.length !== 32) {
        throw new Error('PII_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    
    return key;
}

/**
 * Encrypt text using AES-256-GCM
 * Returns base64-encoded string containing IV, auth tag, and ciphertext
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return '';
    
    try {
        const key = getEncryptionKey();
        
        // Generate random IV
        const iv = crypto.randomBytes(IV_LENGTH);
        
        // Create cipher
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        // Encrypt
        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final()
        ]);
        
        // Get authentication tag
        const authTag = cipher.getAuthTag();
        
        // Combine IV, auth tag, and encrypted data
        const combined = Buffer.concat([iv, authTag, encrypted]);
        
        // Return as base64
        return combined.toString('base64');
    } catch (error: any) {
        console.error('Encryption error:', error.message);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt text using AES-256-GCM
 * Expects base64-encoded string containing IV, auth tag, and ciphertext
 */
export function decrypt(encryptedData: string): string {
    if (!encryptedData) return '';
    
    try {
        const key = getEncryptionKey();
        
        // Decode from base64
        const combined = Buffer.from(encryptedData, 'base64');
        
        // Extract components
        const iv = combined.subarray(0, IV_LENGTH);
        const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
        
        // Create decipher
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        // Decrypt
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
        
        return decrypted.toString('utf8');
    } catch (error: any) {
        console.error('Decryption error:', error.message);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Generate SHA-256 hash for searchability
 * Used to search for encrypted data without decrypting
 */
export function generateHash(text: string): string {
    if (!text) return '';
    
    // Normalize text before hashing
    const normalized = text.trim().toLowerCase();
    
    return crypto
        .createHash('sha256')
        .update(normalized)
        .digest('hex');
}

/**
 * Extract last N characters for partial matching
 */
export function getLast4(text: string): string {
    if (!text) return '';
    
    // Remove non-digits for phone numbers
    const cleaned = text.replace(/\D/g, '');
    
    return cleaned.slice(-4);
}

/**
 * Encrypt object with specific fields
 * Returns new object with encrypted fields
 */
export function encryptFields<T extends Record<string, any>>(
    obj: T,
    fieldsToEncrypt: (keyof T)[]
): T {
    const result = { ...obj };
    
    for (const field of fieldsToEncrypt) {
        if (obj[field] && typeof obj[field] === 'string') {
            result[field] = encrypt(obj[field] as string) as T[keyof T];
        }
    }
    
    return result;
}

/**
 * Decrypt object with specific fields
 * Returns new object with decrypted fields
 */
export function decryptFields<T extends Record<string, any>>(
    obj: T,
    fieldsToDecrypt: (keyof T)[]
): T {
    const result = { ...obj };
    
    for (const field of fieldsToDecrypt) {
        if (obj[field] && typeof obj[field] === 'string') {
            try {
                result[field] = decrypt(obj[field] as string) as T[keyof T];
            } catch (error) {
                // If decryption fails, field might not be encrypted
                // Leave as is
                console.warn(`Failed to decrypt field ${String(field)}, using as-is`);
            }
        }
    }
    
    return result;
}

/**
 * Generate encryption key and output as hex
 * Use this to generate a new key for PII_ENCRYPTION_KEY environment variable
 * Run: node -e "require('./dist/utils/encryptionUtils').generateEncryptionKey()"
 */
export function generateEncryptionKey(): void {
    const key = crypto.randomBytes(32);
    console.log('Generated encryption key (set as PII_ENCRYPTION_KEY):');
    console.log(key.toString('hex'));
}
