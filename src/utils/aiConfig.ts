/**
 * AI Configuration Constants
 * 
 * Centralized configuration for AI services including:
 * - Model fallback chain
 * - Error detection helpers
 * 
 * This module is imported by aiGateway.ts, aiService.ts, and enhancedAIService.ts
 */

/**
 * Gemini model fallback chain - ordered by preference
 * If a model returns 404/NOT_FOUND, the next model in the chain is tried
 * 
 * Updated model names as of January 2025:
 * - gemini-2.0-flash-exp: Latest experimental flash model (fastest, recommended)
 * - gemini-1.5-flash-latest: Stable flash model
 * - gemini-1.5-pro-latest: Pro model for complex tasks
 * - gemini-1.0-pro: Legacy fallback
 * 
 * Chain: GEMINI_MODEL (env) -> gemini-2.0-flash-exp -> gemini-1.5-flash-latest -> gemini-1.5-pro-latest -> gemini-1.0-pro
 * Note: Duplicates are automatically removed while preserving order
 */
export const GEMINI_MODEL_FALLBACK_CHAIN = [
    process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.0-pro',
]
// Remove duplicates while preserving order
.filter((model, index, arr) => arr.indexOf(model) === index);

/**
 * Get the primary model name from the fallback chain
 */
export function getPrimaryGeminiModel(): string {
    return GEMINI_MODEL_FALLBACK_CHAIN[0];
}

/**
 * Check if an error is a "model not found" error (404)
 * This indicates the model name is invalid or not available
 * 
 * @param error - The error object or message to check
 * @returns true if this is a model not found error
 */
export function isModelNotFoundError(error: Error | string | any): boolean {
    const errorMessage = typeof error === 'string' 
        ? error 
        : error?.message || String(error);
    
    const statusCode = typeof error === 'object' 
        ? (error?.status || error?.statusCode) 
        : null;

    // Check for explicit 404 status code
    if (statusCode === 404) {
        return true;
    }

    // Check for 404 in error message
    if (/\b404\b/.test(errorMessage)) {
        return true;
    }

    // Check for NOT_FOUND error code (Google API style)
    if (/\bNOT_FOUND\b/i.test(errorMessage)) {
        return true;
    }

    // Check for Gemini-specific model not found patterns
    // More specific than just 'models/' to avoid false positives
    if (/models\/gemini/i.test(errorMessage) && /not found|does not exist/i.test(errorMessage)) {
        return true;
    }

    // Check for explicit "model" + "not found" combination
    if (/\bmodel\b.*\bnot found\b/i.test(errorMessage)) {
        return true;
    }

    return false;
}

/**
 * Get the next model in the fallback chain
 * 
 * @param currentModel - The model that just failed
 * @returns The next model to try, or null if no more models available
 */
export function getNextFallbackModel(currentModel: string): string | null {
    const currentIndex = GEMINI_MODEL_FALLBACK_CHAIN.indexOf(currentModel);
    
    if (currentIndex === -1 || currentIndex >= GEMINI_MODEL_FALLBACK_CHAIN.length - 1) {
        return null;
    }
    
    return GEMINI_MODEL_FALLBACK_CHAIN[currentIndex + 1];
}

/**
 * Generation configuration for Gemini models
 */
export const GEMINI_GENERATION_CONFIG = {
    temperature: 0.8,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 1024,
} as const;
