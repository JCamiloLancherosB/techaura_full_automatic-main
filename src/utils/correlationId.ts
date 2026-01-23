/**
 * Correlation ID Generator
 * Generates unique correlation IDs for tracking requests/flows end-to-end
 * Format: {sessionId}_{timestamp}_{random}
 */

import { randomBytes } from 'crypto';

/**
 * Generate a correlation ID from session ID and timestamp
 * @param sessionId - Session identifier (e.g., phone number or session token)
 * @param timestamp - Optional timestamp (defaults to now)
 * @returns Correlation ID in format: sessionId_timestamp_random
 * 
 * Note: sessionId is normalized by removing special characters.
 * To prevent collisions, ensure sessionIds are unique before normalization
 * (e.g., '+123-456-7890' and '1234567890' will normalize to the same value).
 */
export function generateCorrelationId(
    sessionId: string,
    timestamp?: Date
): string {
    const ts = timestamp || new Date();
    const timestampStr = ts.getTime().toString();
    const random = randomBytes(4).toString('hex');
    
    // Normalize session ID (remove special chars)
    // WARNING: This can cause collisions if session IDs differ only in special chars
    const normalizedSession = sessionId.replace(/[^a-zA-Z0-9]/g, '');
    
    return `${normalizedSession}_${timestampStr}_${random}`;
}

/**
 * Parse a correlation ID to extract components
 * @param correlationId - Correlation ID to parse
 * @returns Object with sessionId, timestamp, and random components
 */
export function parseCorrelationId(correlationId: string): {
    sessionId: string;
    timestamp: number;
    random: string;
} | null {
    try {
        const parts = correlationId.split('_');
        if (parts.length !== 3) {
            return null;
        }
        
        return {
            sessionId: parts[0],
            timestamp: parseInt(parts[1], 10),
            random: parts[2]
        };
    } catch (error) {
        return null;
    }
}

/**
 * Check if a correlation ID is valid
 * @param correlationId - Correlation ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidCorrelationId(correlationId: string): boolean {
    return parseCorrelationId(correlationId) !== null;
}

/**
 * Extract session ID from correlation ID
 * @param correlationId - Correlation ID
 * @returns Session ID or null if invalid
 */
export function extractSessionId(correlationId: string): string | null {
    const parsed = parseCorrelationId(correlationId);
    return parsed ? parsed.sessionId : null;
}
