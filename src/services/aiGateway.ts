/**
 * AI Gateway Service
 * 
 * Provides a unified interface for AI requests with:
 * - Configurable timeouts (8-12s)
 * - Max 2 retries per provider
 * - Deterministic fallback to templated responses
 * - Content policy enforcement (no price/stock invention)
 * - Complete tracking (ai_used, model, latency_ms, tokens_est, policy_decision)
 * 
 * Part of PR-G1: AI Gateway + Policy implementation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { unifiedLogger } from '../utils/unifiedLogger';

// OpenAI is optional - only used if available
let OpenAI: any = null;
try {
    const openaiModule = require('openai');
    OpenAI = openaiModule.default || openaiModule.OpenAI || openaiModule;
} catch (e) {
    // OpenAI not configured, will skip this provider
}

// Content policy patterns
const PRICE_PATTERNS = /\$?\d+[,.]?\d*\s*(pesos?|cop|usd|dólares?)?|precio|costo|vale|cuánto|cuanto/i;
const STOCK_PATTERNS = /stock|inventario|disponible|quedan|unidades|cantidad/i;
const CLARIFICATION_KEYWORDS = ['no estoy seguro', 'necesito saber', 'podrías confirmar', 'me puedes decir'];

// Known catalog prices that AI can mention
export const KNOWN_CATALOG_PRICES = [
    59900,  // USB Música
    79900,  // USB Películas
    69900   // USB Videos
];

// Regex to match only known catalog prices
const KNOWN_PRICE_PATTERN = /\$?\s*(59[,.]?900|79[,.]?900|69[,.]?900)\s*(pesos|cop)?/i;

export interface AIGatewayConfig {
    timeoutMs?: number;        // Default: 10000 (10s)
    maxRetries?: number;        // Default: 2
    enablePolicy?: boolean;     // Default: true
}

export interface AIGatewayResponse {
    response: string;
    metadata: {
        ai_used: string;
        model: string;
        latency_ms: number;
        tokens_est?: number;
        policy_decision: string;
    };
}

interface AIProvider {
    name: string;
    model: string;
    generate: (prompt: string) => Promise<{ text: string; tokens?: number }>;
    isAvailable: () => boolean;
}

export class AIGateway {
    private providers: AIProvider[] = [];
    private config: Required<AIGatewayConfig>;

    constructor(config: AIGatewayConfig = {}) {
        this.config = {
            timeoutMs: config.timeoutMs || 10000,
            maxRetries: config.maxRetries || 2,
            enablePolicy: config.enablePolicy !== false,
        };

        this.initializeProviders();
    }

    /**
     * Initialize AI providers (Gemini and OpenAI)
     */
    private initializeProviders(): void {
        // Primary: Google Gemini
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                generationConfig: {
                    temperature: 0.8,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            });

            this.providers.push({
                name: 'Gemini',
                model: 'gemini-1.5-flash',
                generate: async (prompt: string) => {
                    const result = await model.generateContent(prompt);
                    const text = result.response.text();
                    // Estimate tokens (rough approximation: 1 token ≈ 4 chars)
                    const tokens = Math.ceil((prompt.length + text.length) / 4);
                    return { text, tokens };
                },
                isAvailable: () => !!geminiKey
            });

            unifiedLogger.info('ai', 'Gemini provider initialized');
        }

        // Secondary: OpenAI (if available)
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey && OpenAI) {
            const openai = new OpenAI({ apiKey: openaiKey });

            this.providers.push({
                name: 'OpenAI',
                model: 'gpt-3.5-turbo',
                generate: async (prompt: string) => {
                    const completion = await openai.chat.completions.create({
                        model: 'gpt-3.5-turbo',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 1024,
                        temperature: 0.8,
                    });
                    const text = completion.choices[0]?.message?.content || '';
                    const tokens = completion.usage?.total_tokens;
                    return { text, tokens };
                },
                isAvailable: () => !!openaiKey
            });

            unifiedLogger.info('ai', 'OpenAI provider initialized');
        }

        if (this.providers.length === 0) {
            unifiedLogger.warn('ai', 'No AI providers available - check API keys');
        }
    }

    /**
     * Generate AI response with policy enforcement and retry logic
     */
    async generateResponse(prompt: string): Promise<AIGatewayResponse> {
        const startTime = Date.now();

        // Policy check: Pre-screen prompt
        if (this.config.enablePolicy) {
            const policyCheck = this.checkContentPolicy(prompt);
            if (policyCheck.needsClarification) {
                return {
                    response: policyCheck.clarificationMessage!,
                    metadata: {
                        ai_used: 'policy',
                        model: 'content-policy',
                        latency_ms: Date.now() - startTime,
                        policy_decision: 'needs_clarification',
                    }
                };
            }
        }

        // Try each provider with retries
        for (const provider of this.providers) {
            if (!provider.isAvailable()) {
                unifiedLogger.debug('ai', `Skipping unavailable provider: ${provider.name}`);
                continue;
            }

            for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
                try {
                    unifiedLogger.info('ai', `Generating with ${provider.name}`, {
                        attempt,
                        maxRetries: this.config.maxRetries
                    });

                    const result = await this.executeWithTimeout(
                        () => provider.generate(prompt),
                        this.config.timeoutMs
                    );

                    const latency = Date.now() - startTime;

                    // Policy check: Post-screen response
                    if (this.config.enablePolicy) {
                        const policyCheck = this.checkContentPolicy(result.text);
                        if (policyCheck.needsClarification) {
                            unifiedLogger.warn('ai', 'Policy violation in response', {
                                provider: provider.name,
                                violation: policyCheck.clarificationMessage
                            });
                            // Try next provider instead of returning policy message
                            break;
                        }
                    }

                    unifiedLogger.info('ai', `Success with ${provider.name}`, {
                        latency,
                        tokens: result.tokens
                    });

                    return {
                        response: result.text,
                        metadata: {
                            ai_used: provider.name,
                            model: provider.model,
                            latency_ms: latency,
                            tokens_est: result.tokens,
                            policy_decision: 'approved',
                        }
                    };

                } catch (error: any) {
                    unifiedLogger.error('ai', `Error with ${provider.name}`, {
                        attempt,
                        error: error.message,
                    });

                    // If max retries reached, try next provider
                    if (attempt >= this.config.maxRetries) {
                        break;
                    }

                    // Wait before retry (exponential backoff)
                    await this.delay(500 * attempt);
                }
            }
        }

        // All providers failed - use deterministic fallback
        unifiedLogger.warn('ai', 'All AI providers failed, using fallback');
        const fallbackResponse = this.getDeterministicFallback(prompt);
        const latency = Date.now() - startTime;

        return {
            response: fallbackResponse,
            metadata: {
                ai_used: 'fallback',
                model: 'deterministic',
                latency_ms: latency,
                policy_decision: 'fallback_used',
            }
        };
    }

    /**
     * Check content policy
     * Returns clarification message if policy would be violated
     */
    private checkContentPolicy(text: string): {
        needsClarification: boolean;
        clarificationMessage?: string;
    } {
        const lowerText = text.toLowerCase();

        // Check if asking about prices without context
        if (PRICE_PATTERNS.test(lowerText)) {
            // If it's asking for price clarification, that's okay
            if (CLARIFICATION_KEYWORDS.some(kw => lowerText.includes(kw))) {
                return { needsClarification: false };
            }
            
            // Check if response contains any price numbers
            const priceNumberMatch = /\$\s*\d{2,}|\d{2,}\s*pesos/i.test(text);
            if (priceNumberMatch) {
                // Verify it's only known catalog prices
                const containsKnownPrice = KNOWN_PRICE_PATTERN.test(text);
                if (!containsKnownPrice) {
                    // Contains a price, but not a known catalog price - policy violation
                    return {
                        needsClarification: true,
                        clarificationMessage: '😊 Para darte información precisa de precios, déjame verificar nuestro catálogo actualizado. Nuestras USBs personalizadas tienen precios desde $59,900. ¿Qué tipo de USB te interesa?'
                    };
                }
                // Contains known prices - acceptable
                return { needsClarification: false };
            }
        }

        // Check if trying to invent stock information
        if (STOCK_PATTERNS.test(lowerText)) {
            // Check if response is inventing stock numbers
            if (/\d+\s*(unidades|disponibles|en stock)/i.test(text)) {
                return {
                    needsClarification: true,
                    clarificationMessage: '😊 Para darte información precisa sobre disponibilidad, ¿me puedes decir qué producto específico te interesa? Así puedo consultar el inventario actual.'
                };
            }
        }

        return { needsClarification: false };
    }

    /**
     * Get deterministic fallback response based on prompt content
     */
    private getDeterministicFallback(prompt: string): string {
        const lowerPrompt = prompt.toLowerCase();

        // Greeting
        if (/^(hola|buenos|buenas|hey|hi|hello)/i.test(lowerPrompt)) {
            return '👋 ¡Hola! Soy el asistente de TechAura. Estoy aquí para ayudarte con nuestras USBs personalizadas de música, películas y videos. ¿En qué puedo ayudarte hoy?';
        }

        // Pricing inquiry
        if (PRICE_PATTERNS.test(lowerPrompt)) {
            return '💰 Nuestros precios base son:\n\n' +
                   '🎵 USB de Música: $59,900\n' +
                   '🎬 USB de Películas: $79,900\n' +
                   '🎥 USB de Videos: $69,900\n\n' +
                   'Incluyen envío GRATIS y personalización completa. ¿Cuál te interesa?';
        }

        // Stock inquiry
        if (STOCK_PATTERNS.test(lowerPrompt)) {
            return '📦 Todos nuestros productos están disponibles para pedido. ¿Qué tipo de USB te gustaría? (Música, Películas o Videos)';
        }

        // Product inquiry
        if (/qué|que|cuál|cual|opciones|productos|ofrecen/i.test(lowerPrompt)) {
            return '🎯 Ofrecemos USBs personalizadas de:\n\n' +
                   '🎵 Música - Todos los géneros actualizados\n' +
                   '🎬 Películas - HD, estrenos recientes\n' +
                   '🎥 Videos - Contenido variado\n\n' +
                   'Todas con garantía de 6 meses. ¿Cuál te interesa?';
        }

        // Customization
        if (/personaliz|custom|géneros|artistas/i.test(lowerPrompt)) {
            return '🎨 ¡Perfecto! Personalizamos tu USB completamente:\n\n' +
                   '✅ Elige géneros y artistas favoritos\n' +
                   '✅ Sin canciones repetidas\n' +
                   '✅ Contenido actualizado\n\n' +
                   '¿Qué géneros o artistas prefieres?';
        }

        // Affirmative
        if (/^(si|sí|ok|dale|listo|bueno|claro|bien)$/i.test(lowerPrompt.trim())) {
            return '👍 ¡Perfecto! ¿Te interesa música, películas o videos para tu USB?';
        }

        // Default fallback
        return '😊 Estoy aquí para ayudarte con nuestras USBs personalizadas.\n\n' +
               'Puedes preguntarme sobre:\n' +
               '🎵 Tipos de contenido disponibles\n' +
               '💰 Precios y formas de pago\n' +
               '🎨 Opciones de personalización\n' +
               '📦 Envíos y garantía\n\n' +
               '¿Qué te gustaría saber?';
    }

    /**
     * Execute function with timeout
     */
    private async executeWithTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number
    ): Promise<T> {
        return Promise.race([
            fn(),
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    /**
     * Delay helper for retry backoff
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get gateway statistics
     */
    getStats() {
        return {
            availableProviders: this.providers.filter(p => p.isAvailable()).map(p => ({
                name: p.name,
                model: p.model
            })),
            config: {
                timeoutMs: this.config.timeoutMs,
                maxRetries: this.config.maxRetries,
                enablePolicy: this.config.enablePolicy,
            }
        };
    }

    /**
     * Check if gateway is available
     */
    isAvailable(): boolean {
        return this.providers.some(p => p.isAvailable());
    }
}

// Export singleton instance
export const aiGateway = new AIGateway();
