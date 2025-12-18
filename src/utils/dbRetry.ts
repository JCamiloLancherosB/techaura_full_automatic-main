/**
 * Database Connection Retry Utility
 * Provides retry logic with exponential backoff for database connections
 */

import { logRetryAttempt } from './dbLogger';

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: any) => void;
}

/**
 * Sleeps for the specified number of milliseconds
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates the delay for the next retry attempt using exponential backoff
 * @param attempt - The current attempt number (1-indexed)
 * @param options - Retry options
 * @returns The delay in milliseconds
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
    const {
        initialDelayMs = 1000,
        maxDelayMs = 10000,
        backoffMultiplier = 2
    } = options;

    const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    return Math.min(delay, maxDelayMs);
}

/**
 * Retries an async operation with exponential backoff
 * @param operation - The async operation to retry
 * @param options - Retry options
 * @returns The result of the operation
 * @throws The last error if all attempts fail
 */
export async function retryAsync<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        onRetry
    } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await operation();
            
            // Success - return result
            if (attempt > 1) {
                console.log(`✅ Operación exitosa en el intento ${attempt}/${maxAttempts}`);
            }
            
            return result;
        } catch (error) {
            lastError = error;

            // If this was the last attempt, don't retry
            if (attempt >= maxAttempts) {
                break;
            }

            // Call onRetry callback if provided
            if (onRetry) {
                onRetry(attempt, error);
            }

            // Calculate delay for next attempt
            const delay = calculateDelay(attempt, options);
            
            // Log retry attempt
            logRetryAttempt(attempt, maxAttempts, delay);

            // Wait before retrying
            await sleep(delay);
        }
    }

    // All attempts failed - throw the last error
    throw lastError;
}

/**
 * Wraps a connection function with retry logic
 * @param connectFn - The connection function to wrap
 * @param options - Retry options
 * @returns A wrapped function with retry logic
 */
export function withRetry<T extends any[], R>(
    connectFn: (...args: T) => Promise<R>,
    options: RetryOptions = {}
): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
        return retryAsync(() => connectFn(...args), options);
    };
}

/**
 * Checks if an error is retryable
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: any): boolean {
    const retryableCodes = [
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETUNREACH',
        'ECONNRESET',
        'PROTOCOL_CONNECTION_LOST'
    ];

    const errorCode = error?.code || '';
    const errorMessage = (error?.message || '').toLowerCase();

    // Check error codes
    if (retryableCodes.includes(errorCode)) {
        return true;
    }

    // Check error messages
    if (errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('connect')) {
        return true;
    }

    return false;
}

/**
 * Determines if a retry should be attempted based on the error
 * @param error - The error that occurred
 * @param attempt - The current attempt number
 * @param maxAttempts - The maximum number of attempts
 * @returns True if a retry should be attempted
 */
export function shouldRetry(
    error: any,
    attempt: number,
    maxAttempts: number
): boolean {
    // Don't retry if max attempts reached
    if (attempt >= maxAttempts) {
        return false;
    }

    // Don't retry authentication errors
    const errorCode = error?.code || '';
    if (errorCode === 'ER_ACCESS_DENIED_ERROR' || 
        errorCode === 'ER_DBACCESS_DENIED_ERROR' ||
        errorCode === 'ER_BAD_DB_ERROR') {
        return false;
    }

    // Retry for network/connection errors
    return isRetryableError(error);
}

/**
 * Creates a retry options object with smart defaults for database connections
 * @param customOptions - Custom options to override defaults
 * @returns Complete retry options
 */
export function createDBRetryOptions(
    customOptions: Partial<RetryOptions> = {}
): RetryOptions {
    return {
        maxAttempts: 3,
        initialDelayMs: 2000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        ...customOptions
    };
}
