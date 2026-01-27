// src/config/aiConfig.ts
/**
 * AI Service Configuration
 * 
 * Centralized configuration for AI providers with fallback model support.
 * This ensures consistent model selection across all AI services and enables
 * graceful degradation when models are unavailable.
 */

/**
 * Gemini models that are known to be available in the current SDK version.
 * These are ordered by preference - first available model will be used.
 */
export const GEMINI_FALLBACK_MODELS = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-1.0-pro',
] as const;

/**
 * Get the configured Gemini model from environment or use default.
 * Falls back to 'gemini-1.5-flash' if not specified.
 */
export function getGeminiModel(): string {
    return process.env.GEMINI_MODEL || 'gemini-1.5-flash';
}

/**
 * Get the full list of Gemini models to try, starting with the configured one.
 * This enables automatic fallback when a model returns 404.
 */
export function getGeminiModelChain(): string[] {
    const configuredModel = getGeminiModel();
    const fallbacks = GEMINI_FALLBACK_MODELS.filter(m => m !== configuredModel);
    return [configuredModel, ...fallbacks];
}

/**
 * Check if an error indicates a model is not found (404)
 */
export function isModelNotFoundError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || error.statusCode || error.code;
    
    return (
        errorStatus === 404 ||
        errorStatus === 'NOT_FOUND' ||
        errorMessage.includes('404') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('model') && errorMessage.includes('not') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('no model') ||
        errorMessage.includes('invalid model')
    );
}

/**
 * AI Configuration object
 */
export const AI_CONFIG = {
    /**
     * Timeout for AI calls in milliseconds
     */
    TIMEOUT_MS: parseInt(process.env.AI_TIMEOUT_MS || '15000', 10),

    /**
     * Maximum retries per provider
     */
    MAX_RETRIES: parseInt(process.env.AI_MAX_RETRIES || '2', 10),

    /**
     * Enable content policy enforcement
     */
    ENABLE_POLICY: process.env.AI_ENABLE_POLICY !== 'false',

    /**
     * Gemini configuration
     */
    GEMINI: {
        MODEL: getGeminiModel(),
        MODEL_CHAIN: getGeminiModelChain(),
        GENERATION_CONFIG: {
            temperature: parseFloat(process.env.AI_TEMPERATURE || '0.8'),
            topK: parseInt(process.env.AI_TOP_K || '40', 10),
            topP: parseFloat(process.env.AI_TOP_P || '0.95'),
            maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS || '1024', 10),
        }
    },

    /**
     * OpenAI configuration
     */
    OPENAI: {
        MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS || '1024', 10),
    },

    /**
     * Logging configuration for AI services
     */
    LOGGING: {
        LOG_MODEL_USED: true,
        LOG_ERROR_REASON: true,
        LOG_TOKENS: true,
        LOG_LATENCY: true,
    }
};

export default AI_CONFIG;
