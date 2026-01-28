/**
 * Enhanced AI Service with improved reliability, fallbacks, and context awareness
 * Now includes RAG (Retrieval-Augmented Generation) for structured context
 * Includes model fallback chain for Gemini 404 errors
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import AIMonitoring from './aiMonitoring';
import { conversationMemory } from './conversationMemory';
import { ragContextRetriever } from './ragContextRetriever';
import { unifiedLogger } from '../utils/unifiedLogger';
import { 
    GEMINI_MODEL_FALLBACK_CHAIN, 
    GEMINI_GENERATION_CONFIG,
    isModelNotFoundError 
} from '../utils/aiConfig';
import type { UserSession } from '../../types/global';
import type { ConversationContext } from './conversationMemory';

// Cohere is optional - only used if available
let CohereClient: any = null;
try {
    const cohereModule = require('cohere-ai');
    CohereClient = cohereModule.CohereClient;
} catch (e) {
    // Cohere not installed, will skip this provider
}

interface AIProvider {
    name: string;
    generate: (prompt: string, context?: any) => Promise<string>;
    isAvailable: () => boolean;
}

interface ResponseQuality {
    isValid: boolean;
    score: number;
    issues: string[];
}

export class EnhancedAIService {
    private providers: AIProvider[] = [];
    private currentProviderIndex = 0;
    private responseCache = new Map<string, { response: string; timestamp: number }>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_MS = 1000;
    private genAI: GoogleGenerativeAI | null = null;

    constructor() {
        this.initializeProviders();
    }

    /**
     * Initialize AI providers with fallback support
     */
    private initializeProviders(): void {
        // Primary: Google Gemini with model fallback chain
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            this.genAI = new GoogleGenerativeAI(geminiKey);

            this.providers.push({
                name: 'Gemini',
                generate: async (prompt: string) => {
                    return this.generateWithGeminiModelFallback(prompt);
                },
                isAvailable: () => !!geminiKey
            });

            console.log('✅ Gemini AI provider initialized with model fallback chain:', GEMINI_MODEL_FALLBACK_CHAIN);
        }

        // Secondary: Cohere (fallback)
        const cohereKey = process.env.COHERE_API_KEY;
        if (cohereKey && CohereClient) {
            const cohere = new CohereClient({ token: cohereKey });

            this.providers.push({
                name: 'Cohere',
                generate: async (prompt: string) => {
                    const response = await cohere.generate({
                        model: 'command',
                        prompt,
                        maxTokens: 1024,
                        temperature: 0.8,
                    });
                    return response.generations[0]?.text || '';
                },
                isAvailable: () => !!cohereKey
            });

            console.log('✅ Cohere AI provider initialized (fallback)');
        }

        if (this.providers.length === 0) {
            console.warn('⚠️ No AI providers available - check API keys');
        }
    }

    /**
     * Generate content with Gemini using model fallback chain
     * If a model returns 404/NOT_FOUND, tries the next model in the chain
     */
    private async generateWithGeminiModelFallback(prompt: string): Promise<string> {
        if (!this.genAI) {
            throw new Error('Gemini not initialized');
        }

        let lastError: Error | null = null;

        for (const modelName of GEMINI_MODEL_FALLBACK_CHAIN) {
            try {
                const model = this.genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: GEMINI_GENERATION_CONFIG
                });

                const result = await model.generateContent(prompt);
                const text = result.response.text();

                unifiedLogger.info('ai', 'Gemini generation successful', {
                    model: modelName
                });

                return text;

            } catch (error: any) {
                lastError = error;
                const modelNotFound = isModelNotFoundError(error);

                unifiedLogger.warn('ai', 'Gemini model error', {
                    model: modelName,
                    error: error?.message || String(error),
                    isModelNotFound: modelNotFound,
                    willTryNextModel: modelNotFound && GEMINI_MODEL_FALLBACK_CHAIN.indexOf(modelName) < GEMINI_MODEL_FALLBACK_CHAIN.length - 1
                });

                // Only try next model if this is a model not found error
                if (!modelNotFound) {
                    throw error;
                }
            }
        }

        // All models in fallback chain failed
        unifiedLogger.error('ai', 'All Gemini models in fallback chain failed', {
            modelsAttempted: GEMINI_MODEL_FALLBACK_CHAIN,
            lastError: lastError?.message
        });
        throw lastError || new Error('All Gemini models failed');
    }

    /**
     * Generate AI response with retry logic and fallback providers
     * Now includes RAG context retrieval
     */
    async generateResponse(
        userMessage: string,
        userSession: UserSession,
        useCache: boolean = true
    ): Promise<string> {
        // Check cache first
        if (useCache) {
            const cached = this.getCachedResponse(userMessage);
            if (cached) {
                console.log('💾 Using cached response');
                return cached;
            }
        }

        // STEP 1: Retrieve structured RAG context BEFORE AI call
        const ragContext = await ragContextRetriever.retrieveContext(userSession);

        // STEP 2: Get conversation context
        const context = await conversationMemory.getContext(userSession.phone);

        // STEP 3: Build enhanced prompt with RAG context + conversation context
        const prompt = this.buildContextualPrompt(userMessage, userSession, context, ragContext);

        // Try each provider with retries
        for (let providerIdx = 0; providerIdx < this.providers.length; providerIdx++) {
            const provider = this.providers[(this.currentProviderIndex + providerIdx) % this.providers.length];

            if (!provider.isAvailable()) {
                console.log(`⏭️ Skipping unavailable provider: ${provider.name}`);
                continue;
            }

            for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
                try {
                    console.log(`🤖 Generating response with ${provider.name} (attempt ${attempt}/${this.MAX_RETRIES})`);

                    const response = await this.generateWithTimeout(
                        () => provider.generate(prompt),
                        10000 // 10 second timeout
                    );

                    const sanitized = this.sanitizeResponse(response);
                    const quality = this.validateResponseQuality(sanitized, userMessage);

                    if (quality.isValid) {
                        console.log(`✅ Valid response from ${provider.name} (score: ${quality.score})`);
                        
                        // Cache successful response
                        this.cacheResponse(userMessage, sanitized);

                        // Log to conversation memory
                        await conversationMemory.addTurn(
                            userSession.phone,
                            'assistant',
                            sanitized,
                            { intent: 'ai_response', confidence: quality.score }
                        );

                        AIMonitoring.logSuccess('ai_generation');
                        return sanitized;
                    } else {
                        console.log(`⚠️ Low quality response from ${provider.name}: ${quality.issues.join(', ')}`);
                        AIMonitoring.logError('ai_generation_quality', new Error(quality.issues.join(', ')));
                    }

                } catch (error: any) {
                    console.error(`❌ Error with ${provider.name} (attempt ${attempt}):`, error.message);
                    AIMonitoring.logError('ai_generation_error', error);

                    if (attempt < this.MAX_RETRIES) {
                        await this.delay(this.RETRY_DELAY_MS * attempt);
                    }
                }
            }
        }

        // All providers failed - use intelligent fallback with RAG context
        console.error('🚨 ALL AI PROVIDERS FAILED - Critical error');
        console.error(`   Providers tried: ${this.providers.map(p => p.name).join(', ')}`);
        console.error(`   User message: ${userMessage}`);
        console.error(`   User session: ${userSession.phone}`);
        console.error(`   Current flow: ${userSession.currentFlow || 'unknown'}`);
        
        AIMonitoring.logError('all_ai_providers_failed', new Error(
            `All ${this.providers.length} AI providers failed for user ${userSession.phone}`
        ));
        
        return this.getIntelligentFallback(userMessage, userSession, context, ragContext);
    }

    /**
     * Build contextual prompt with RAG structured context
     */
    private buildContextualPrompt(
        userMessage: string,
        userSession: UserSession,
        context: ConversationContext,
        ragContext: any // RAGContext from ragContextRetriever
    ): string {
        const { summary, relevantHistory } = context;

        // Start with RAG structured context
        let prompt = ragContext ? ragContextRetriever.formatContextForPrompt(ragContext) : '';

        // Add conversational context
        prompt += `
CONTEXTO DE LA CONVERSACIÓN:
${relevantHistory.length > 0 ? `
Historial reciente:
${relevantHistory.slice(-5).join('\n')}
` : 'Primera interacción con el cliente.'}

RESUMEN DEL CLIENTE:
- Nombre: ${userSession.name || 'Cliente'}
- Etapa: ${summary.decisionStage}
- Intereses: ${summary.productInterests.join(', ') || 'No especificados aún'}
- Temas discutidos: ${summary.mainTopics.join(', ') || 'Ninguno'}
- Precio mencionado: ${summary.priceDiscussed ? 'Sí' : 'No'}

MENSAJE ACTUAL DEL CLIENTE: "${userMessage}"

INSTRUCCIONES PARA UN VENDEDOR EXPERIMENTADO:
1. Responde de forma natural, profesional y conversacional
2. Mantén coherencia absoluta con el historial - construye sobre la conversación anterior
3. **USA ÚNICAMENTE la información del CONTEXTO ESTRUCTURADO arriba para precios, productos y reglas**
4. **NUNCA inventes precios, capacidades o reglas que no estén en el contexto**
5. Si el cliente pregunta algo que no está en el contexto, admítelo y ofrece consultar la información
6. Si el cliente ya expresó interés, guía profesionalmente hacia el siguiente paso natural
7. Si es nueva información, haz preguntas inteligentes que ayuden a entender mejor sus necesidades
8. Usa emojis con moderación y profesionalismo (🎵💡✅📦)
9. Sé conciso y claro (máximo 4 líneas)
10. SIEMPRE incluye una pregunta o sugerencia que ayude al cliente a avanzar
11. Adapta el tono según la etapa del cliente, siempre manteniendo profesionalismo

TU ENFOQUE SEGÚN LA ETAPA:
- Awareness: Escucha activamente y presenta soluciones relevantes a sus necesidades
- Interest: Profundiza con preguntas consultivas sobre sus preferencias específicas
- Consideration: Maneja objeciones con empatía y explica el valor real que recibirán
- Decision: Facilita el proceso con claridad y confianza, removiendo cualquier barrera final

PRINCIPIOS DE VENTA CONSULTIVA:
- Primero entiende, luego recomienda
- Explica beneficios en términos de lo que EL CLIENTE valora
- Usa tu experiencia para anticipar necesidades
- Sé honesto y transparente - construye confianza a largo plazo
- **NUNCA inventes información: usa solo los datos estructurados proporcionados**

Genera una respuesta profesional, coherente y que ayude genuinamente al cliente:`;

        return prompt;
    }

    /**
     * Validate response quality
     */
    private validateResponseQuality(response: string, userMessage: string): ResponseQuality {
        const issues: string[] = [];
        let score = 100;

        // Check minimum length
        if (response.length < 20) {
            issues.push('Response too short');
            score -= 50;
        }

        // Check for gibberish or repetition
        const words = response.split(/\s+/);
        if (words.length < 5) {
            issues.push('Too few words');
            score -= 30;
        }

        // Check for error keywords
        const errorKeywords = ['error', 'undefined', 'null', 'invalid', 'cannot', 'unable'];
        if (errorKeywords.some(kw => response.toLowerCase().includes(kw))) {
            issues.push('Contains error keywords');
            score -= 40;
        }

        // Check for excessive repetition
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        const repetitionRatio = uniqueWords.size / words.length;
        if (repetitionRatio < 0.5) {
            issues.push('Excessive word repetition');
            score -= 25;
        }

        // Check for relevance to user message
        const userWords = userMessage.toLowerCase().split(/\s+/);
        const relevantWords = userWords.filter(word => 
            word.length > 3 && response.toLowerCase().includes(word)
        );
        if (relevantWords.length === 0 && userMessage.length > 10) {
            issues.push('May not be relevant to user message');
            score -= 20;
        }

        // Must have call to action or question
        const hasCTA = /[\?¿]|responde|dime|cuál|qué|cómo|quieres|te gustaría/i.test(response);
        if (!hasCTA) {
            issues.push('Missing call to action');
            score -= 15;
        }

        return {
            isValid: score >= 50 && issues.length < 3,
            score: Math.max(0, score),
            issues
        };
    }

    /**
     * Sanitize AI response
     */
    private sanitizeResponse(response: string): string {
        return response
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#{1,6}\s/g, '')
            .replace(/\[.*?\]/g, '') // Remove markdown links
            .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
            .trim();
    }

    /**
     * Get intelligent fallback response based on context and RAG data
     */
    private getIntelligentFallback(
        userMessage: string,
        userSession: UserSession,
        context: ConversationContext,
        ragContext?: any // RAGContext (optional for backward compatibility)
    ): string {
        const { summary, recentTurns } = context;
        const message = userMessage.toLowerCase();

        // Log fallback usage
        unifiedLogger.info('ai', 'Using intelligent fallback for message', {
            message: userMessage.substring(0, 50),
            stage: summary.decisionStage,
            interests: summary.productInterests,
            hasHistory: recentTurns.length > 0,
            hasRAGContext: !!ragContext
        });

        // Use RAG context for pricing if available
        const priceInfo = ragContext?.catalog?.priceRanges || {
            music: { min: 59900, max: 59900 },
            videos: { min: 69900, max: 69900 },
            movies: { min: 79900, max: 79900 }
        };

        // Pricing inquiry
        if (/precio|costo|cuanto|cuánto|vale/i.test(message)) {
            unifiedLogger.debug('ai', 'Fallback: Pricing inquiry detected');
            return `💰 Los precios de nuestras USBs personalizadas:\n\n` +
                   `🎵 Música: desde $${priceInfo.music.min.toLocaleString('es-CO')}\n` +
                   `🎬 Videos: desde $${priceInfo.videos.min.toLocaleString('es-CO')}\n` +
                   `🎥 Películas: desde $${priceInfo.movies.min.toLocaleString('es-CO')}\n\n` +
                   `Incluyen envío GRATIS y personalización completa. ¿Cuál te interesa?`;
        }

        // Product inquiry
        if (/qué|que|cuál|cual|opciones|productos/i.test(message)) {
            unifiedLogger.debug('ai', 'Fallback: Product inquiry detected');
            return `🎯 Ofrecemos USBs personalizadas de:\n\n` +
                   `🎵 Música - Todos los géneros actualizados\n` +
                   `🎬 Películas - HD, estrenos 2024\n` +
                   `🎥 Videos - Contenido variado\n\n` +
                   `Todas con garantía de 6 meses. ¿Cuál te llama la atención?`;
        }

        // Customization
        if (/personaliz|custom|géneros|artistas/i.test(message)) {
            unifiedLogger.debug('ai', 'Fallback: Customization inquiry detected');
            return `🎨 ¡Genial! Personalizamos tu USB completamente:\n\n` +
                   `✅ Elige tus géneros favoritos\n` +
                   `✅ Selecciona artistas específicos\n` +
                   `✅ Sin canciones repetidas\n\n` +
                   `¿Qué géneros o artistas te gustan más?`;
        }

        // Affirmative response - Use context dynamically
        if (/^(si|sí|ok|dale|listo|bueno|claro)$/i.test(message.trim())) {
            unifiedLogger.debug('ai', 'Fallback: Affirmative response detected', {
                stage: summary.decisionStage
            });
            
            // Context-aware response based on conversation stage
            if (summary.decisionStage === 'decision' || summary.priceDiscussed) {
                return `🔥 ¡Perfecto! Para completar tu pedido necesito:\n\n` +
                       `1️⃣ Capacidad que prefieres (16GB, 32GB, 64GB)\n` +
                       `2️⃣ Tipo de contenido (música, películas, videos)\n\n` +
                       `¿Con cuál empezamos?`;
            }
            
            // If they showed interest in specific products
            if (summary.productInterests.length > 0) {
                const interest = summary.productInterests[0];
                return `👍 ¡Perfecto! Veo que te interesa ${interest}. ¿Quieres que profundicemos en eso o prefieres explorar más opciones?`;
            }
            
            return `👍 ¡Excelente! ¿Te interesa música, películas o videos para tu USB?`;
        }

        // Contextual response based on conversation history
        if (summary.productInterests.length > 0) {
            const interest = summary.productInterests[0];
            unifiedLogger.debug('ai', 'Fallback: Using product interest context', { interest });
            
            // More dynamic response based on what was discussed
            if (summary.priceDiscussed && summary.decisionStage === 'consideration') {
                return `😊 Vi que te interesa ${interest} y ya revisamos precios. ¿Tienes alguna duda o quieres que te ayude a personalizar tu USB?`;
            }
            
            return `😊 Entiendo que te interesa ${interest}. ¿Quieres que te cuente más sobre las opciones disponibles o prefieres ver los precios?`;
        }

        // Use recent conversation topics
        if (recentTurns.length > 0) {
            unifiedLogger.debug('ai', 'Fallback: Using recent conversation context');
            const lastTopic = summary.mainTopics[summary.mainTopics.length - 1];
            if (lastTopic) {
                return `😊 Continuemos hablando sobre ${lastTopic}. ¿Qué más te gustaría saber al respecto?`;
            }
        }

        // Generic friendly fallback with stage awareness
        unifiedLogger.debug('ai', 'Fallback: Using generic friendly response');
        return `😊 Estoy aquí para ayudarte a crear tu USB personalizada perfecta.\n\n` +
               `Puedes preguntarme sobre:\n` +
               `🎵 Tipos de contenido\n` +
               `💰 Precios\n` +
               `🎨 Personalización\n\n` +
               `¿Qué te gustaría saber?`;
    }

    /**
     * Execute function with timeout
     */
    private async generateWithTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number
    ): Promise<T> {
        return Promise.race([
            fn(),
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), timeoutMs)
            )
        ]);
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cache response
     */
    private cacheResponse(message: string, response: string): void {
        const key = this.getCacheKey(message);
        this.responseCache.set(key, {
            response,
            timestamp: Date.now()
        });

        // Cleanup old cache entries
        this.cleanupCache();
    }

    /**
     * Get cached response
     */
    private getCachedResponse(message: string): string | null {
        const key = this.getCacheKey(message);
        const cached = this.responseCache.get(key);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.response;
        }

        return null;
    }

    /**
     * Generate cache key
     */
    private getCacheKey(message: string): string {
        return message.toLowerCase().trim().substring(0, 100);
    }

    /**
     * Cleanup old cache entries
     */
    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, value] of this.responseCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.responseCache.delete(key);
            }
        }
    }

    /**
     * Check if service is available
     */
    isAvailable(): boolean {
        return this.providers.some(p => p.isAvailable());
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            availableProviders: this.providers.filter(p => p.isAvailable()).map(p => p.name),
            cacheSize: this.responseCache.size,
            cacheTTL: this.CACHE_TTL,
            maxRetries: this.MAX_RETRIES
        };
    }
}

export const enhancedAIService = new EnhancedAIService();
