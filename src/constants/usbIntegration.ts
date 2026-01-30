/**
 * USB Integration Constants
 * Centralized configuration for USB burning system integration
 */

export const USB_INTEGRATION = {
  // Retry configuration
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  
  // Queue management
  QUEUE_CLEANUP_HOURS: 24,
  
  // Rate limiting
  MAX_REQUESTS_PER_MINUTE: 100,
  
  // Timeouts
  DB_QUERY_TIMEOUT_MS: 5000,
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  
  // Valid statuses for burning workflow
  VALID_BURNING_STATUSES: ['pending', 'queued', 'burning', 'completed', 'failed'] as const,
  
  // Valid status transitions
  VALID_TRANSITIONS: {
    'pending': ['queued'],
    'queued': ['burning'],
    'confirmed': ['burning'],
    'processing': ['burning'],
    'burning': ['completed', 'failed'],
    'failed': ['confirmed', 'pending'] // if retryable
  } as const,
  
  // Validation patterns
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ORDER_NUMBER_PATTERN: /^[a-zA-Z0-9_-]{1,50}$/,
  
  // Max invalid response retries for user input
  MAX_INVALID_RESPONSE_RETRIES: 3,
  
  // Exponential backoff configuration
  BACKOFF: {
    INITIAL_DELAY_MS: 1000,
    MAX_DELAY_MS: 30000,
    MULTIPLIER: 2
  }
} as const;

// Type exports
export type BurningStatus = typeof USB_INTEGRATION.VALID_BURNING_STATUSES[number];
export type StatusTransitionKey = keyof typeof USB_INTEGRATION.VALID_TRANSITIONS;

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(fromStatus: string, toStatus: string): boolean {
  const validTransitions = USB_INTEGRATION.VALID_TRANSITIONS[fromStatus as StatusTransitionKey];
  if (!validTransitions) return false;
  return (validTransitions as readonly string[]).includes(toStatus);
}

/**
 * Check if a status is a valid burning status
 */
export function isValidBurningStatus(status: string): status is BurningStatus {
  return (USB_INTEGRATION.VALID_BURNING_STATUSES as readonly string[]).includes(status);
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(attempt: number): number {
  const delay = USB_INTEGRATION.BACKOFF.INITIAL_DELAY_MS * Math.pow(USB_INTEGRATION.BACKOFF.MULTIPLIER, attempt);
  return Math.min(delay, USB_INTEGRATION.BACKOFF.MAX_DELAY_MS);
}

/**
 * Validate UUID format
 */
export function isValidUUID(id: string): boolean {
  return USB_INTEGRATION.UUID_PATTERN.test(id);
}

/**
 * Validate order number format
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  return USB_INTEGRATION.ORDER_NUMBER_PATTERN.test(orderNumber);
}

/**
 * Sanitize input string to prevent injection
 * This function removes control characters and limits length.
 * For HTML contexts, use proper HTML encoding at the rendering layer.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  // Remove control characters (except common whitespace)
  // This prevents null bytes and other control characters that could cause issues
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except tab, newline, carriage return
    .trim()
    .slice(0, 500); // Limit length
}

export default USB_INTEGRATION;
