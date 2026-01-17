import { GoogleGenerativeAI } from '@google/generative-ai';
import flowAnalyzer from './flowAnalyzer';
import AIMonitoring from './aiMonitoring';
import { businessDB } from '../mysql-database';
import type { UserSession } from '../../types/global';
import { updateUserSession } from '../flows/userTrackingSystem';
import { conversationMemory } from './conversationMemory';
import { enhancedAIService } from './enhancedAIService';
import { intentClassifier } from './intentClassifier';
import { persuasionEngine } from './persuasionEngine';

interface AIResponse {
    message: string;
    text?: string;
    confidence: number;
    intent: string;
    shouldTransferToHuman: boolean;
    suggestedActions: string[];
    source: string;
    metadata?: any;
}

interface GenerateContentResult {
    response: {
        text: () => string;
    };
}

interface ConversationContext {
    userSession: UserSession;
    conversationHistory: string[];
    userAnalytics?: any;
    recentOrders?: any[];
    preferences?: any;
}

interface SalesOpportunity {
    urgency: 'high' | 'medium' | 'low';
    buyingSignals: string[];
    objections: string[];
    recommendedAction: string;
    pricePoint: string;
}

interface DetectedIntent {
    isSpecific: boolean;
    type: string;
    response: string;
}

export default class AIService {
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;
    private isInitialized = false;
    private requestCount = 0;
    private errorCount = 0;
    private lastError: Date | null = null;
    private lastMessageSent: string | null = null;
    
    // Circuit breaker for AI service
    private circuitBreakerState: 'closed' | 'open' | 'half-open' = 'closed';
    private circuitBreakerFailures = 0;
    private circuitBreakerLastFailure: Date | null = null;
    private readonly CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening
    private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute before trying again
    private readonly AI_CALL_TIMEOUT = 15000; // 15 seconds timeout

    // Gatillos de persuasión
    private readonly PERSUASION_TRIGGERS = {
        scarcity: [
            "⏰ Solo quedan pocas unidades disponibles",
            "🔥 Oferta limitada - termina hoy",
            "⚡ Últimas 5 USBs en stock",
            "🚨 Promoción válida solo por 2 horas más"
        ],
        social_proof: [
            "🌟 Más de 1000+ clientes satisfechos",
            "⭐ Calificación 4.9/5 estrellas",
            "👥 +500 USBs vendidas este mes",
            "🏆 Producto #1 más vendido"
        ],
        authority: [
            "🎵 Recomendado por DJs profesionales",
            "🏅 Certificado de calidad premium",
            "🔊 Tecnología de audio HD",
            "✅ Garantía respaldada por expertos"
        ],
        reciprocity: [
            "🎁 Regalo especial: funda protectora gratis",
            "💝 Bonus: actualizaciones gratuitas por 6 meses",
            "🆓 Envío express sin costo adicional",
            "✨ Personalización gratuita incluida"
        ]
    };

    // Manejadores de objeciones
    private readonly OBJECTION_HANDLERS: Record<string, { responses: string[] }> = {
        price: {
            responses: [
                "💰 Entiendo tu preocupación por el precio. Considera que es una inversión de solo $2 por día durante un mes para tener entretenimiento ilimitado",
                "🎵 Comparado con Spotify Premium ($15,000/mes), nuestra USB te sale más económica y es tuya para siempre",
                "💡 Tenemos planes de pago: solo $30,000 inicial y el resto en 2 cuotas"
            ]
        },
        quality: {
            responses: [
                "🔊 Todas nuestras USBs tienen audio en calidad HD 320kbps",
                "✅ Garantía de 6 meses - si no funciona, te devolvemos tu dinero",
                "🏆 Usamos solo memorias marca Samsung y Kingston originales"
            ]
        },
        doubt: {
            responses: [
                "🤝 Te entiendo perfectamente. Por eso ofrecemos garantía total",
                "📱 Puedes hablar con clientes reales - tengo testimonios en WhatsApp",
                "🔄 Si no te gusta, cambio garantizado en 7 días"
            ]
        },
        price_concern: {
            responses: [
                "💰 Entiendo. Pero piensa en esto: son solo $2 por día durante un mes para entretenimiento ilimitado",
                "🎵 Comparado con servicios de streaming, nuestra USB es más económica y es tuya para siempre"
            ]
        },
        uncertainty: {
            responses: [
                "🤝 Es normal tener dudas. ¿Qué te gustaría saber específicamente?",
                "✅ Tenemos garantía de 6 meses y cambio si no te gusta"
            ]
        },
        procrastination: {
            responses: [
                "⏰ Te entiendo, pero esta oferta especial termina hoy",
                "🔥 Puedo apartarte una USB con solo $20,000 de anticipo"
            ]
        }
    };

    // Técnicas de cierre
    private readonly CLOSING_TECHNIQUES = [
        "🎯 ¿Te gustaría una USB con contenido variado o prefieres personalizarla con tus géneros y artistas favoritos? Te reservo la tuya ahora mismo.",
        "⚡ Solo necesito que confirmes tu dirección de envío para asegurarnos de que recibas tu USB sin problemas.",
        "🔥 ¿Qué te parece si apartamos tu USB con un anticipo de $20,000 y el resto lo pagas al momento de recibirla?",
        "🚀 ¿Te gustaría que te enviemos tu USB hoy mismo o prefieres programar la entrega para mañana?"
    ];

    constructor() {
        this.initialize();
    }

    // ============================================
    // 🔒 TIMEOUT AND CIRCUIT BREAKER HELPERS
    // ============================================
    
    // Compiled regex patterns for better performance
    private readonly FLOW_PATTERNS = {
        price: /precio|cu[aá]nto|vale|cost[oá]/i,
        affirmative: /ok|s[ií]|dale|listo/i,
        genres: /rock|salsa|reggaeton|pop|vallenato|bachata/i,
        artists: /karol|bad bunny|shakira|maluma/i,
        product: /qué (te )?interesa|música.*película|película.*música/i
    };

    /**
     * Wrap an AI call with timeout
     */
    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.AI_CALL_TIMEOUT): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error('AI call timeout')), timeoutMs)
            )
        ]);
    }

    /**
     * Check if circuit breaker allows the call
     */
    private canMakeAICall(): boolean {
        if (this.circuitBreakerState === 'closed') {
            return true;
        }
        
        if (this.circuitBreakerState === 'open') {
            // Check if timeout has passed
            if (this.circuitBreakerLastFailure) {
                const timeSinceLastFailure = Date.now() - this.circuitBreakerLastFailure.getTime();
                if (timeSinceLastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
                    console.log('🔄 Circuit breaker entering half-open state');
                    this.circuitBreakerState = 'half-open';
                    return true;
                }
            }
            console.warn('⚠️ Circuit breaker is OPEN - AI calls blocked');
            return false;
        }
        
        // half-open state - allow one call to test
        return true;
    }

    /**
     * Record AI call success
     */
    private recordAISuccess(): void {
        if (this.circuitBreakerState === 'half-open') {
            console.log('✅ Circuit breaker closing after successful call');
            this.circuitBreakerState = 'closed';
            this.circuitBreakerFailures = 0;
        }
    }

    /**
     * Record AI call failure
     */
    private recordAIFailure(): void {
        this.circuitBreakerFailures++;
        this.circuitBreakerLastFailure = new Date();
        
        if (this.circuitBreakerState === 'half-open') {
            console.warn('⚠️ Circuit breaker reopening after failed test call');
            this.circuitBreakerState = 'open';
        } else if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
            console.error('🚨 Circuit breaker OPENING - too many AI failures');
            this.circuitBreakerState = 'open';
        }
        
        console.warn(`⚠️ AI failures: ${this.circuitBreakerFailures}/${this.CIRCUIT_BREAKER_THRESHOLD}`);
    }

    // ============================================
    // 🚀 INICIALIZACIÓN
    // ============================================

    private initialize(): void {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.log('⚠️ GEMINI_API_KEY no encontrada en variables de entorno');
                return;
            }

            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                generationConfig: {
                    temperature: 0.8,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            });
            this.isInitialized = true;
            console.log('✅ Servicio de IA inicializado correctamente');
            AIMonitoring.logSuccess('service_initialization');
        } catch (error) {
            console.error('❌ Error inicializando servicio de IA:', error);
            AIMonitoring.logError('service_initialization', error);
        }
    }

    public async reinitialize(): Promise<void> {
        try {
            console.log('🔄 Reinicializando servicio de IA...');
            this.isInitialized = false;
            this.model = null;
            this.genAI = null;
            this.initialize();
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (this.isInitialized) {
                console.log('✅ Servicio de IA reiniciado exitosamente');
                AIMonitoring.logSuccess('service_reinitialization');
            } else {
                throw new Error('Fallo en la reinicialización');
            }
        } catch (error) {
            console.error('❌ Error reinicializando servicio de IA:', error);
            AIMonitoring.logError('service_reinitialization', error);
            throw error;
        }
    }

    public isAvailable(): boolean {
        return this.isInitialized && this.model !== null;
    }

    public getStats() {
        return {
            isAvailable: this.isAvailable(),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            lastError: this.lastError,
            successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
            enhancedServices: {
                conversationMemory: conversationMemory.getStats(),
                enhancedAI: enhancedAIService.getStats()
            }
        };
    }

    // ============================================
    // 🎯 MÉTODO PRINCIPAL DE GENERACIÓN DE RESPUESTAS
    // ============================================

    public async generateResponse(
        userMessage: string,
        userSession: UserSession,
        _salesOpportunity?: SalesOpportunity,
        conversationHistory: string[] = []
    ): Promise<string> {
        try {
            this.requestCount++;

            // Log user message to conversation memory
            await conversationMemory.addTurn(
                userSession.phone,
                'user',
                userMessage,
                { flowState: userSession.currentFlow }
            );

            // Get conversation context for better understanding
            const memoryContext = await conversationMemory.getContext(userSession.phone);

            // Use enhanced intent classification
            const classification = await intentClassifier.classify(
                userMessage,
                userSession,
                memoryContext
            );

            console.log(`🎯 Intent: ${classification.primaryIntent.name} (${(classification.primaryIntent.confidence * 100).toFixed(0)}%)`);
            console.log(`📊 Urgency: ${classification.urgency}, Sentiment: ${classification.sentiment}`);

            const salesOpportunity = this.analyzeSalesOpportunity(userMessage, userSession);
            const intent = this.detectSpecificIntent(userMessage, salesOpportunity, userSession);

            // IMPROVED: Better flow context detection to avoid incoherent responses
            const flowContextResponse = this.handleFlowContext(userSession, userMessage);
            if (flowContextResponse) {
                await conversationMemory.addTurn(userSession.phone, 'assistant', flowContextResponse);
                return flowContextResponse;
            }

            // Si hay intención específica detectada
            if (intent.isSpecific) {
                console.log(`🎯 Intención específica detectada: ${intent.type}`);
                
                // Build persuasive message for this intent
                const persuasiveMessage = await persuasionEngine.buildPersuasiveMessage(
                    userMessage,
                    userSession
                );
                
                // Enhance with persuasion elements
                const finalResponse = this.enhanceWithPersuasion(
                    persuasiveMessage,
                    salesOpportunity,
                    userSession
                );
                
                await conversationMemory.addTurn(userSession.phone, 'assistant', finalResponse, {
                    intent: intent.type,
                    confidence: 1.0
                });
                return finalResponse;
            }

            // Use enhanced AI service with retry logic and fallbacks
            if (enhancedAIService.isAvailable()) {
                try {
                    console.log('🤖 Using enhanced AI service with context...');
                    const aiResponse = await enhancedAIService.generateResponse(
                        userMessage,
                        userSession,
                        true // use cache
                    );

                    // IMPROVED: Validate coherence with enhanced flow awareness
                    const context = await persuasionEngine['analyzeContext'](userSession);
                    const validation = persuasionEngine.validateMessageCoherence(aiResponse, context);
                    
                    if (!validation.isCoherent) {
                        console.log(`⚠️ Message coherence issues detected: ${validation.issues.join(', ')}`);
                        console.log(`📝 Suggestions: ${validation.suggestions.join(', ')}`);
                        
                        // Check if it's primarily a brevity issue
                        const hasBrevityIssue = validation.issues.some(issue => 
                            issue.includes('length') || issue.includes('characters') || issue.includes('cap')
                        );
                        
                        if (hasBrevityIssue && validation.issues.length === 1) {
                            // Just apply brevity enforcement
                            const stage = persuasionEngine['determineJourneyStage'](context);
                            const trimmedResponse = persuasionEngine['enforceBrevityAndUniqueness'](
                                aiResponse, 
                                userSession.phone, 
                                stage
                            );
                            console.log(`✅ Trimmed AI response from ${aiResponse.length} to ${trimmedResponse.length} chars`);
                            AIMonitoring.logSuccess('ai_generation_trimmed');
                            await conversationMemory.addTurn(userSession.phone, 'assistant', trimmedResponse);
                            return trimmedResponse;
                        }
                        
                        // Try to rebuild if incoherent for other reasons
                        const rebuiltMessage = await persuasionEngine.buildPersuasiveMessage(
                            userMessage,
                            userSession
                        );
                        
                        // Validate the rebuilt message
                        const rebuiltValidation = persuasionEngine.validateMessageCoherence(rebuiltMessage, context);
                        
                        if (rebuiltValidation.isCoherent) {
                            const enhancedResponse = this.enhanceWithPersuasion(
                                rebuiltMessage,
                                salesOpportunity,
                                userSession
                            );
                            console.log('✅ Rebuilt coherent message with persuasion engine');
                            AIMonitoring.logSuccess('ai_generation_rebuilt');
                            await conversationMemory.addTurn(userSession.phone, 'assistant', enhancedResponse);
                            return enhancedResponse;
                        } else {
                            // If rebuild also fails, use fallback
                            console.log('⚠️ Rebuilt message still incoherent, using fallback');
                            const fallbackResponse = await this.getPersuasiveFallbackResponse(userMessage, salesOpportunity, userSession);
                            await conversationMemory.addTurn(userSession.phone, 'assistant', fallbackResponse);
                            return fallbackResponse;
                        }
                    }

                    // Message is coherent, enhance with persuasion and apply brevity
                    const enhancedResponse = persuasionEngine.enhanceMessage(
                        aiResponse,
                        context,
                        userSession.phone  // Pass phone for duplicate detection
                    );

                    console.log('✅ Enhanced AI response generated successfully');
                    AIMonitoring.logSuccess('ai_generation_enhanced');
                    await conversationMemory.addTurn(userSession.phone, 'assistant', enhancedResponse);
                    return enhancedResponse;
                } catch (enhancedError) {
                    console.warn('⚠️ Enhanced AI service failed, falling back to standard:', enhancedError);
                }
            }

            // Fallback to standard AI if enhanced service unavailable
            if (!this.isAvailable()) {
                const fallbackResponse = await this.getPersuasiveFallbackResponse(userMessage, salesOpportunity, userSession);
                await conversationMemory.addTurn(userSession.phone, 'assistant', fallbackResponse, {
                    intent: 'fallback',
                    confidence: 0.5
                });
                return fallbackResponse;
            }

            // Generar respuesta con IA estándar
            const context = await this.buildConversationContext(userSession, conversationHistory);
            const enhancedPrompt = await this.buildSalesPrompt(userMessage, context, salesOpportunity);

            // Check circuit breaker before making call
            if (!this.canMakeAICall()) {
                console.warn('🚨 Circuit breaker preventing AI call, using fallback');
                const fallbackResponse = await this.getPersuasiveFallbackResponse(userMessage, salesOpportunity, userSession);
                await conversationMemory.addTurn(userSession.phone, 'assistant', fallbackResponse, {
                    intent: 'fallback_circuit_breaker',
                    confidence: 0.5
                });
                return fallbackResponse;
            }

            try {
                // Make AI call with timeout wrapper
                const result = await this.withTimeout(
                    this.model.generateContent(enhancedPrompt),
                    this.AI_CALL_TIMEOUT
                ) as GenerateContentResult;
                const aiResponse = result.response.text();
                
                // Record success for circuit breaker
                this.recordAISuccess();

                const sanitizedResponse = this.sanitizeResponse(aiResponse);
                if (this.isValidResponse(sanitizedResponse)) {
                    console.log('✅ Respuesta de IA generada exitosamente');
                    
                    // Enhance with persuasion engine and apply brevity
                    const persuasionContext = await persuasionEngine['analyzeContext'](userSession);
                    const enhancedResponse = persuasionEngine.enhanceMessage(
                        sanitizedResponse,
                        persuasionContext,
                        userSession.phone  // Pass phone for duplicate detection
                    );
                    
                    await conversationMemory.addTurn(userSession.phone, 'assistant', enhancedResponse, {
                        intent: classification.primaryIntent.name,
                        confidence: classification.primaryIntent.confidence
                    });
                    return enhancedResponse;
                } else {
                    console.log('⚠️ Respuesta de IA no válida, usando respuesta predeterminada');
                    const fallbackResponse = await this.getPersuasiveFallbackResponse(userMessage, salesOpportunity, userSession);
                    await conversationMemory.addTurn(userSession.phone, 'assistant', fallbackResponse, {
                        intent: 'fallback',
                        confidence: 0.5
                    });
                    return fallbackResponse;
                }
            } catch (aiError) {
                // Record failure for circuit breaker
                this.recordAIFailure();
                console.error('❌ AI call failed (timeout or error):', aiError);
                
                // Use fallback
                const fallbackResponse = await this.getPersuasiveFallbackResponse(userMessage, salesOpportunity, userSession);
                await conversationMemory.addTurn(userSession.phone, 'assistant', fallbackResponse, {
                    intent: 'fallback_ai_error',
                    confidence: 0.5
                });
                return fallbackResponse;
            }

        } catch (error) {
            this.errorCount++;
            this.lastError = new Date();
            console.error('❌ Error generando respuesta de IA:', error);
            AIMonitoring.logError('ai_generation_error', error);
            
            try {
                const fallbackResponse = await this.getPersuasiveFallbackResponse(userMessage, undefined, userSession);
                await conversationMemory.addTurn(userSession.phone, 'assistant', fallbackResponse, {
                    intent: 'error_fallback',
                    confidence: 0.3
                });
                return fallbackResponse;
            } catch (fallbackError) {
                // ABSOLUTE SAFETY NET: If even fallback fails, return hardcoded response
                console.error('❌ Fallback también falló, usando respuesta de emergencia:', fallbackError);
                const emergencyResponse = this.getEmergencyResponse(userMessage, userSession);
                
                // Try to log to conversation memory, but don't let it block
                try {
                    await conversationMemory.addTurn(userSession.phone, 'assistant', emergencyResponse, {
                        intent: 'emergency_fallback',
                        confidence: 0.1
                    });
                } catch (memoryError) {
                    console.warn('⚠️ No se pudo guardar en memoria la respuesta de emergencia');
                }
                
                return emergencyResponse;
            }
        }
    }

    /**
     * Emergency response when all systems fail
     * This ensures the chatbot NEVER leaves a user without a response
     */
    private getEmergencyResponse(userMessage: string, userSession: UserSession): string {
        const messageLower = userMessage.toLowerCase().trim();
        const name = userSession.name?.split(' ')[0] || '';
        const greeting = name ? `${name}, ` : '';
        
        // Price inquiry
        if (/(precio|costo|valor|cuanto|cuánto)/i.test(messageLower)) {
            return `${greeting}💰 Precios de nuestras USBs:\n\n🎵 MÚSICA:\n• 32GB: $89,900\n• 64GB: $119,900\n\n🎬 PELÍCULAS:\n• 32GB: $109,900\n• 64GB: $149,900\n\n🚚 Envío GRATIS incluido\n\n¿Te interesa alguna?`;
        }
        
        // Affirmative response
        if (/^(si|sí|ok|dale|listo|bueno|perfecto|excelente)$/i.test(messageLower)) {
            return `${greeting}¡Perfecto! 🎉 ¿Te gustaría una USB de Música, Películas o Videos? Todas incluyen personalización y envío gratis.`;
        }
        
        // Greeting
        if (/(hola|buenos|buenas|hi|hey)/i.test(messageLower)) {
            return `¡Hola${name ? ' ' + name : ''}! 👋 Soy tu asesor de TechAura.\n\nTenemos USBs personalizadas de:\n🎵 Música\n🎬 Películas\n🎥 Videos\n\n¿Cuál te interesa?`;
        }
        
        // Generic fallback
        const stage = userSession.stage || 'initial';
        if (stage === 'pricing' || stage === 'customizing') {
            return `${greeting}😊 Estoy aquí para ayudarte con tu USB personalizada.\n\nDime:\n• ¿Qué contenido prefieres?\n• ¿Qué capacidad necesitas?\n• ¿Tienes alguna duda?\n\nEstoy a tu disposición 💙`;
        }
        
        // Absolute fallback
        return `${greeting}😊 Gracias por contactarnos.\n\n¿En qué puedo ayudarte?\n\n🎵 USBs de Música\n🎬 USBs de Películas\n🎥 USBs de Videos\n\nDime cuál te interesa o si tienes alguna pregunta 💙`;
    }

    // ============================================
    // 🔍 DETECCIÓN DE INTENCIONES Y CONTEXTO
    // ============================================
    
    /**
     * IMPROVED: Handle flow-specific context to avoid incoherent responses
     */
    private handleFlowContext(userSession: UserSession, userMessage: string): string | null {
        const currentFlow = userSession.currentFlow || '';
        const messageLower = userMessage.toLowerCase().trim();
        
        // Music flow handling - be more specific
        if (currentFlow.includes('music') || currentFlow.includes('Music')) {
            // User is in music flow but asking about price
            if (this.FLOW_PATTERNS.price.test(userMessage)) {
                return '💰 *Precios de USBs de MÚSICA:*\n• 16GB (3,000 canciones): $69,900\n• 32GB (5,000 canciones): $89,900\n• 64GB (10,000 canciones): $129,900\n🚚 Envío GRATIS y playlist personalizada incluida.\n\n¿Qué capacidad prefieres?';
            }
            
            // User confirming or giving input about music
            if (this.FLOW_PATTERNS.affirmative.test(messageLower) || 
                this.FLOW_PATTERNS.genres.test(messageLower) ||
                this.FLOW_PATTERNS.artists.test(messageLower)) {
                
                // If already selected genres/artists
                if (userSession.customization?.genres || userSession.customization?.artists) {
                    return '✅ ¡Perfecto! Ya tengo tus preferencias musicales. Ahora, ¿qué capacidad prefieres?\n• 16GB (3,000 canciones): $69,900\n• 32GB (5,000 canciones): $89,900\n• 64GB (10,000 canciones): $129,900';
                }
                
                return '🙌 ¡Genial! Personalizaremos tu USB de música. ¿Qué géneros o artistas te gustan más? Ejemplo: "rock y salsa", "Karol G y Bad Bunny", o escribe OK para la playlist recomendada.';
            }
            
            // Generic question in music flow
            return null; // Let AI handle it but within music context
        }
        
        // Movies/Videos flow handling
        if (currentFlow.includes('movie') || currentFlow.includes('Movie')) {
            if (this.FLOW_PATTERNS.price.test(userMessage)) {
                return '💰 *Precios de USBs de PELÍCULAS:*\n• 16GB: $89,900\n• 32GB: $109,900\n• 64GB: $149,900\n🚚 Envío GRATIS incluido.\n\n¿Qué capacidad te interesa?';
            }
            return null;
        }
        
        if (currentFlow.includes('video') || currentFlow.includes('Video')) {
            if (this.FLOW_PATTERNS.price.test(userMessage)) {
                return '💰 *Precios de USBs de VIDEOS:*\n• 16GB: $79,900\n• 32GB: $99,900\n• 64GB: $139,900\n🚚 Envío GRATIS incluido.\n\n¿Qué tipo de videos prefieres?';
            }
            return null;
        }
        
        // Customization flow - user is selecting preferences
        if (currentFlow.includes('customiz') || userSession.stage === 'customizing') {
            // Don't ask what product they want if already customizing
            if (this.FLOW_PATTERNS.product.test(messageLower)) {
                return null; // Signal to regenerate with proper context
            }
        }
        
        // Order/pricing flow - don't go back to product selection
        if (currentFlow.includes('order') || currentFlow.includes('pricing') || userSession.stage === 'pricing') {
            if (this.FLOW_PATTERNS.price.test(messageLower)) {
                // Already in pricing, provide specific pricing based on their selections
                return null; // Let AI handle with pricing context
            }
        }
        
        return null; // No specific flow context override needed
    }

    private isInMusicFlow(userSession: UserSession, userMessage: string): boolean {
        return userSession.currentFlow === 'music_usb_optimized' &&
            (userMessage.toLowerCase().includes('para mí') ||
                userMessage.toLowerCase().includes('para mi') ||
                ['1', '2', '3', '4'].includes(userMessage.trim()));
    }

    private handleMusicFlowResponse(userMessage: string, userSession: UserSession): string {
        return '🙌 ¡Genial! Personalizaremos tu USB para uso personal. ¿Qué géneros o artistas te gustan más? Ejemplo: "rock y salsa", "Karol G y Bad Bunny", o escribe OK para la playlist recomendada.';
    }

    private detectSpecificIntent(
        userMessage: string,
        salesOpportunity: SalesOpportunity,
        userSession: UserSession
    ): DetectedIntent {
        const messageLower = userMessage.toLowerCase().trim();

        // USB de música
        if (messageLower.includes('usb') && (messageLower.includes('música') || messageLower.includes('musica'))) {
            return {
                isSpecific: true,
                type: 'usb_music',
                response: '🎵 ¡PERFECTO! Te interesa nuestra USB de música más vendida. Tenemos TODOS los géneros actualizados: reggaeton, salsa, bachata, vallenato, rock, pop y más. 🔥 OFERTA ESPECIAL HOY: desde $59,900 con envío GRATIS'
            };
        }

        // USB de películas
        if (messageLower.includes('usb') && (messageLower.includes('película') || messageLower.includes('peliculas') || messageLower.includes('series'))) {
            return {
                isSpecific: true,
                type: 'usb_movies',
                response: '🎬 ¡EXCELENTE elección! Nuestras USBs de películas son las MÁS COMPLETAS del mercado. Incluyen estrenos 2024 + clásicos en HD. ⚡ PRECIO ESPECIAL: desde $79,900. ¿Te interesan más películas de acción, drama o series?'
            };
        }

        // Consulta de precio
        if (messageLower.includes('precio') || messageLower.includes('costo') || messageLower.includes('cuanto') || messageLower.includes('cuánto')) {
            const priceResponse = this.getPriceResponseWithValue(salesOpportunity.pricePoint);
            return {
                isSpecific: true,
                type: 'pricing_advanced',
                response: priceResponse
            };
        }

        // Saludo
        if (messageLower.includes('hola') || messageLower.includes('buenos') || messageLower.includes('buenas')) {
            return {
                isSpecific: true,
                type: 'greeting_sales',
                response: '¡Hola! 👋 Llegaste al lugar PERFECTO. Soy tu experto en USBs personalizadas de TechAura 🔥\n\n🎵 USBs de música (TODOS los géneros)\n🎬 USBs de películas HD\n🎥 USBs de videos\n\n⚡ OFERTA HOY: 20% OFF + envío GRATIS. ¿Cuál te llama más la atención?'
            };
        }

        // Afirmación
        if (['si', 'sí', 'ok', 'dale', 'listo', 'bueno'].includes(messageLower)) {
            return {
                isSpecific: true,
                type: 'affirmative_close',
                response: '🔥 ¡PERFECTO! Vamos a asegurar tu USB ahora mismo. ' + this.getRandomClosingTechnique()
            };
        }

        return { isSpecific: false, type: 'unknown', response: '' };
    }

    // ============================================
    // 📊 ANÁLISIS DE OPORTUNIDADES DE VENTA
    // ============================================

    private analyzeSalesOpportunity(userMessage: string, userSession: UserSession): SalesOpportunity {
        const messageLower = userMessage.toLowerCase().trim();
        const buyingSignals: string[] = [];
        const objections: string[] = [];

        // Detectar señales de compra
        if (messageLower.includes('quiero') || messageLower.includes('necesito')) buyingSignals.push('intent_high');
        if (messageLower.includes('precio') || messageLower.includes('costo')) buyingSignals.push('price_inquiry');
        if (messageLower.includes('cuando') || messageLower.includes('cuándo')) buyingSignals.push('timing_question');
        if (messageLower.includes('envío') || messageLower.includes('entrega')) buyingSignals.push('logistics_ready');

        // Detectar objeciones
        if (messageLower.includes('caro') || messageLower.includes('costoso')) objections.push('price_concern');
        if (messageLower.includes('no sé') || messageLower.includes('dudas')) objections.push('uncertainty');
        if (messageLower.includes('después') || messageLower.includes('luego')) objections.push('procrastination');

        // Determinar urgencia
        let urgency: 'high' | 'medium' | 'low' = 'low';
        if (buyingSignals.length >= 2) urgency = 'high';
        else if (buyingSignals.length === 1) urgency = 'medium';

        // Determinar punto de precio
        let pricePoint = 'entry';
        if (messageLower.includes('mejor') || messageLower.includes('premium')) pricePoint = 'premium';
        if (messageLower.includes('económico') || messageLower.includes('barato')) pricePoint = 'budget';

        return {
            urgency,
            buyingSignals,
            objections,
            recommendedAction: this.getRecommendedAction(urgency, buyingSignals, objections),
            pricePoint
        };
    }

    private getRecommendedAction(urgency: string, signals: string[], objections: string[]): string {
        if (urgency === 'high' && objections.length === 0) return 'close_immediately';
        if (signals.includes('price_inquiry')) return 'present_value';
        if (objections.length > 0) return 'handle_objections';
        if (urgency === 'medium') return 'build_urgency';
        return 'generate_interest';
    }

    // ============================================
    // 💬 CONSTRUCCIÓN DE RESPUESTAS
    // ============================================

    private getPriceResponseWithValue(pricePoint: string): string {
        const socialProof = this.getRandomPersuasionTrigger('social_proof');
        const reciprocity = this.getRandomPersuasionTrigger('reciprocity');
        const baseResponse = `💰 Te voy a dar los precios REALES (sin intermediarios):\n\n`;

        let priceDetails = '';
        if (pricePoint === 'premium') {
            priceDetails = `🔥 USB PREMIUM 32GB: $89,900 (antes $120,000)\n🎵 USB ESTÁNDAR 16GB: $69,900 (antes $85,000)\n💝 USB BÁSICA 8GB: $59,900 (antes $75,000)`;
        } else {
            priceDetails = `🎵 USB MÚSICA 16GB: $59,900 ⚡\n🎬 USB PELÍCULAS 32GB: $79,900 ⚡\n🔥 COMBO MÚSICA+PELÍCULAS: $129,900 (ahorras $30,000)`;
        }

        return baseResponse + priceDetails + `\n\n${socialProof}\n${reciprocity}\n\n🚀 ¿Cuál prefieres? Te la reservo AHORA`;
    }

    private enhanceWithPersuasion(
        baseResponse: string,
        salesOpportunity: SalesOpportunity,
        userSession: UserSession
    ): string {
        let enhancedResponse = baseResponse;

        // Agregar escasez si urgencia es alta
        if (salesOpportunity.urgency === 'high') {
            const scarcity = this.getRandomPersuasionTrigger('scarcity');
            enhancedResponse += `\n\n${scarcity}`;
        }

        // Agregar autoridad si pregunta por precio
        if (salesOpportunity.buyingSignals.includes('price_inquiry')) {
            const authority = this.getRandomPersuasionTrigger('authority');
            enhancedResponse += `\n\n${authority}`;
        }

        // Manejar objeciones
        if (salesOpportunity.objections.length > 0) {
            const objectionHandler = this.handleDetectedObjections(salesOpportunity.objections);
            if (objectionHandler) {
                enhancedResponse += `\n\n${objectionHandler}`;
            }
        }

        // Agregar llamada a la acción
        const cta = this.getCallToAction(salesOpportunity.recommendedAction);
        enhancedResponse += `\n\n${cta}`;

        return enhancedResponse;
    }

    private handleDetectedObjections(objections: string[]): string {
        const responses: string[] = [];

        objections.forEach(objection => {
            if (this.OBJECTION_HANDLERS[objection]) {
                const handler = this.OBJECTION_HANDLERS[objection];
                const randomResponse = handler.responses[Math.floor(Math.random() * handler.responses.length)];
                responses.push(randomResponse);
            }
        });

        return responses.length > 0 ? responses.join('\n') : '';
    }

    private getCallToAction(recommendedAction: string): string {
        switch (recommendedAction) {
            case 'close_immediately':
                return this.getRandomClosingTechnique();
            case 'present_value':
                return '💡 ¿Quieres que te explique por qué nuestras USBs son la mejor inversión?';
            case 'build_urgency':
                return this.getRandomPersuasionTrigger('scarcity') + ' ' + this.getRandomClosingTechnique();
            case 'handle_objections':
                return '🤝 ¿Qué te preocupa más? Estoy aquí para aclarar todas tus dudas';
            default:
                return '🎵 ¿Qué tipo de música te gusta más? Te personalizo la mejor opción';
        }
    }

    private getRandomPersuasionTrigger(type: keyof typeof this.PERSUASION_TRIGGERS): string {
        const triggers = this.PERSUASION_TRIGGERS[type];
        return triggers[Math.floor(Math.random() * triggers.length)];
    }

    private getRandomClosingTechnique(): string {
        return this.CLOSING_TECHNIQUES[Math.floor(Math.random() * this.CLOSING_TECHNIQUES.length)];
    }

    // ============================================
    // 🛠️ UTILIDADES
    // ============================================

    private isValidResponse(response: string): boolean {
        if (!response || response.trim().length === 0) return false;

        const invalidKeywords = ["undefined", "null", "error", "invalid", "sin sentido"];
        if (invalidKeywords.some(keyword => response.toLowerCase().includes(keyword))) return false;

        if (response.length < 10 || response.split(" ").length < 3) return false;

        return true;
    }

    private sanitizeResponse(response: string): string {
        return response
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#{1,6}\s/g, '')
            .trim();
    }

    private async getPersuasiveFallbackResponse(
        userMessage: string, 
        salesOpportunity?: SalesOpportunity,
        userSession?: UserSession
    ): Promise<string> {
        // Get conversation context if available
        let currentFlow = 'general';
        if (userSession && userSession.currentFlow) {
            currentFlow = userSession.currentFlow;
        }
        
        // Contextual fallback based on current flow
        if (currentFlow.includes('music') || currentFlow.includes('Music')) {
            if (/precio|cu[aá]nto|vale|cost[oá]/i.test(userMessage)) {
                return '💰 *Precios especiales de USBs de MÚSICA:*\n• 16GB (3,000 canciones): $69,900\n• 32GB (5,000 canciones): $89,900\n• 64GB (10,000 canciones): $129,900\n🚚 Envío GRATIS y playlist personalizada incluida.\n✅ ¿Qué géneros o artistas quieres?';
            }
            return '🎵 ¿Qué géneros o artistas quieres en tu USB de música? Ejemplo: "rock y salsa", "Karol G y Bad Bunny". O escribe OK para la playlist recomendada.';
        }
        
        if (currentFlow.includes('video') || currentFlow.includes('Video')) {
            if (/precio|cu[aá]nto|vale|cost[oá]/i.test(userMessage)) {
                return '💰 *Precios especiales de USBs de VIDEOS:*\n• 16GB: $79,900\n• 32GB: $99,900\n• 64GB: $139,900\n🚚 Envío GRATIS incluido.\n✅ ¿Qué tipo de videos prefieres?';
            }
            return '🎬 ¿Qué tipo de videos te gustaría en tu USB? (Ej: conciertos, documentales, series)';
        }
        
        if (currentFlow.includes('movie') || currentFlow.includes('Movie')) {
            if (/precio|cu[aá]nto|vale|cost[oá]/i.test(userMessage)) {
                return '💰 *Precios especiales de USBs de PELÍCULAS:*\n• 16GB: $89,900\n• 32GB: $109,900\n• 64GB: $149,900\n🚚 Envío GRATIS incluido.\n✅ ¿Qué géneros de películas prefieres?';
            }
            return '🎬 ¿Qué géneros de películas te gustaría? (Ej: acción, comedia, drama)';
        }

        // Generic fallback - should not mention specific products
        if (/precio|cu[aá]nto|vale|cost[oá]/i.test(userMessage)) {
            return '💰 Tenemos USBs personalizadas desde $69,900 con envío GRATIS. ¿Te interesan USBs de música, películas o videos?';
        }

        // Persuasive general fallback
        return '😊 ¿En qué puedo ayudarte? Tenemos USBs personalizadas de:\n🎵 Música\n🎬 Películas\n📹 Videos\nTodas con envío GRATIS y garantía.';
    }

    private async buildSalesPrompt(
        userMessage: string,
        context: ConversationContext,
        salesOpportunity: SalesOpportunity
    ): Promise<string> {
        const { userSession, conversationHistory } = context;
        
        // Get recent conversation turns from memory
        const recentTurns = conversationHistory.slice(-10); // Last 10 messages

        return `
Eres un vendedor profesional de TechAura con más de 15 años de experiencia en ventas consultivas. Has ayudado a miles de clientes a encontrar exactamente lo que necesitan. Tu enfoque es genuino, consultivo y enfocado en crear valor real para cada cliente.

INFORMACIÓN DEL NEGOCIO:
- TechAura: líder en USBs personalizadas de música, películas y videos
- Precios: Música $59,900 | Películas $79,900 | Videos $69,900
- Géneros: reggaeton, salsa, bachata, vallenato, rock, pop, merengue, champeta
- Beneficios: Envío GRATIS, garantía 6 meses, actualizaciones 3 meses gratis

PERFIL DEL CLIENTE:
- Nombre: ${userSession.name || 'Cliente VIP'}
- Interacciones: ${userSession.interactions?.length || 0}
- Etapa: ${userSession.stage}
- Flujo actual: ${userSession.currentFlow || 'inicial'}
- Intención de compra: ${salesOpportunity.urgency} urgencia
- Señales de compra: ${salesOpportunity.buyingSignals.join(', ')}
- Objeciones detectadas: ${salesOpportunity.objections.join(', ')}

${recentTurns.length > 0 ? `
HISTORIAL RECIENTE DE LA CONVERSACIÓN (últimos ${recentTurns.length} mensajes):
${recentTurns.join('\n')}

IMPORTANTE: Mantén COHERENCIA absoluta con el historial. Si el cliente ya expresó preferencias o está en un flujo específico, continúa naturalmente desde ahí. Construye sobre la conversación anterior, no la repitas.
` : 'Primera interacción con este cliente.'}

MENSAJE ACTUAL: "${userMessage}"

VALIDACIÓN DE COHERENCIA Y CONTINUIDAD:
- SI el cliente está en flujo de MÚSICA, SOLO habla de USBs de música - construye sobre sus preferencias musicales
- SI el cliente está en flujo de PELÍCULAS, SOLO habla de USBs de películas - enfócate en géneros cinematográficos
- SI el cliente está en flujo de VIDEOS, SOLO habla de USBs de videos - mantén el contexto de contenido personalizado
- NUNCA menciones productos diferentes al flujo actual - esto rompe la confianza y coherencia
- NUNCA olvides las preferencias ya expresadas - toma notas mentales de cada detalle
- SI el cliente ya seleccionó géneros/preferencias, avanza al siguiente paso natural (capacidad, precio, cierre)
- SI estás en etapa de personalización, profundiza en detalles o transiciona a capacidades
- SI estás en etapa de precio, facilita la decisión de compra o maneja objeciones profesionalmente
- MANTÉN COHERENCIA: cada mensaje debe fluir naturalmente del anterior, como en una conversación real

TU ENFOQUE DE VENTAS EXPERIMENTADO:
1. ESCUCHA ACTIVA: Realmente comprende las necesidades del cliente antes de proponer
2. CONSULTORÍA: Posiciónate como asesor experto, no como vendedor agresivo
3. CONSTRUCCIÓN DE VALOR: Explica beneficios específicos relevantes a SU situación
4. MANEJO DE OBJECIONES: Reconoce preocupaciones legítimas y ofrece soluciones reales
5. CIERRE NATURAL: Guía hacia la compra cuando el cliente está listo, no antes

PRINCIPIOS DE UN VENDEDOR EXPERIMENTADO:
- Sé CONSULTIVO, no agresivo - la venta viene de ayudar genuinamente
- Usa emojis con moderación y profesionalismo (🎵💡✅📦)
- Crea VALOR antes de urgencia - el cliente debe ver por qué vale la pena
- Maneja objeciones con EMPATÍA y lógica - "Te entiendo perfectamente..."
- Haz preguntas inteligentes que ayuden a descubrir necesidades reales
- Menciona precios junto con el valor que reciben
- Máximo 4 líneas, comunicación clara y efectiva
- Incluye una pregunta o acción que ayude al cliente a avanzar

EJEMPLOS DE TU ESTILO EXPERIMENTADO:
- "Perfecto, veo que te gusta el reggaeton. Basado en mi experiencia, te recomendaría la de 32GB - así tienes espacio para todos los artistas actuales más los clásicos que nunca pasan de moda. ¿Qué te parece?"
- "Entiendo tu preocupación por el precio. Déjame explicarlo así: son $59,900 una sola vez vs. $15,000 cada mes en streaming. En 4 meses ya recuperaste la inversión y la USB es tuya para siempre. ¿Tiene sentido?"
- "Excelente, entonces ya tenemos claros tus géneros favoritos. El siguiente paso es elegir la capacidad ideal para ti. ¿Prefieres una biblioteca completa con espacio para crecer, o algo más compacto con lo esencial?"

Responde como el vendedor profesional y experimentado que eres, enfocándote en ayudar al cliente a tomar la mejor decisión:`;
    }

    private async buildConversationContext(
        userSession: UserSession,
        conversationHistory: string[] = []
    ): Promise<ConversationContext> {
        try {
            let userAnalytics = null;
            let recentOrders = null;
            let preferences = null;

            try {
                userAnalytics = await businessDB.getUserAnalytics(userSession.phone);
            } catch (error: any) {
                console.warn('⚠️ Error obteniendo analytics:', error.message);
            }

            try {
                recentOrders = await businessDB.getUserOrders(userSession.phone, 5);
            } catch (error: any) {
                console.warn('⚠️ Error obteniendo órdenes:', error.message);
            }

            try {
                preferences = await businessDB.getUserPreferences(userSession.phone);
            } catch (error: any) {
                console.warn('⚠️ Error obteniendo preferencias:', error.message);
            }

            return {
                userSession,
                conversationHistory,
                userAnalytics,
                recentOrders,
                preferences
            };
        } catch (error) {
            console.error('❌ Error construyendo contexto:', error);
            return {
                userSession,
                conversationHistory
            };
        }
    }

    // ============================================
    // 📱 MÉTODOS PÚBLICOS ADICIONALES
    // ============================================

    public async handleUnknownMessage(message: string, userSession: UserSession): Promise<string> {
        try {
            if (userSession.currentFlow === "music_usb_optimized") {
                if ((userSession.unrecognizedResponses || 0) >= 1 && /ok|sí|si|dale|listo/i.test(message.trim())) {
                    return '✅ ¡Listo! Te armo la playlist recomendada y el precio especial. ¿Qué capacidad prefieres? 32GB, 64GB o 128GB.';
                }
                return '🎵 ¡Personalicemos tu USB! Dime tus géneros o artistas favoritos (ejemplo: "rock y salsa", "Karol G y Bad Bunny"), o responde OK para la playlist recomendada.';
            }

            return '😊 Para armar tu USB personalizada, dime tus géneros o artistas preferidos (ejemplo: "reggaeton y salsa", "Karol G y Bad Bunny"). O responde "OK" para la playlist recomendada y el precio especial.';
        } catch (error) {
            return 'Por favor dime tus géneros o artistas favoritos, o escribe OK para recibir la playlist recomendada y el precio.';
        }
    }

    public async generateWelcomeMessage(userSession: UserSession): Promise<string> {
        const name = userSession.name?.split(' ')[0] || 'amigo';
        const scarcity = this.getRandomPersuasionTrigger('scarcity');
        const socialProof = this.getRandomPersuasionTrigger('social_proof');

        return `¡Hola ${name}! 🔥 Bienvenido a TechAura - ${socialProof}\n\nSomos especialistas en USBs personalizadas:\n🎵 Música | 🎬 Películas | 🎥 Videos\n\n${scarcity}\n\n¿Cuál te interesa más?`;
    }

    public async handleUserMessage(message: string, userSession: UserSession): Promise<string> {
        const response = await this.generateResponse(message, userSession);
        userSession.lastProcessedMessage = response;

        // Actualizar sesión
        await updateUserSession(
            userSession.phone,
            message,
            userSession.currentFlow
        );

        return response;
    }

    // Análisis de contenido (para ProcessingOrchestrator)
    async analyzeContent(content: any): Promise<any> {
        console.log('🤖 Analizando contenido con IA...');
        // TODO: Implementar análisis con IA
        return {};
    }

    // Recomendaciones de contenido
    async recommendContent(preferences: string[]): Promise<string[]> {
        console.log('🤖 Generando recomendaciones...');
        // TODO: Implementar recomendaciones con IA
        return [];
    }
}

export const aiService = new AIService();
