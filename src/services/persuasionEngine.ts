/**
 * Persuasion Engine - Advanced sales persuasion system
 * Ensures coherent, contextual messages that guide customers through the purchase journey
 */

import type { UserSession } from '../../types/global';
import { conversationMemory } from './conversationMemory';

export interface PersuasionContext {
    stage: string;
    hasDiscussedPrice: boolean;
    hasSelectedProduct: boolean;
    hasCustomized: boolean;
    buyingIntent: number;
    interactionCount: number;
    productInterests: string[];
}

export interface PersuasiveMessage {
    opening: string;
    value: string;
    urgency?: string;
    socialProof?: string;
    cta: string;
    transition?: string;
}

export class PersuasionEngine {
    private static instance: PersuasionEngine;

    // Message length constraints
    private readonly TARGET_MIN_LENGTH = 80;
    private readonly TARGET_MAX_LENGTH = 150;
    private readonly HARD_MAX_LENGTH = 200;

    // Duplicate message tracking (phone -> {message -> timestamp})
    private messageHistory = new Map<string, Map<string, number>>();
    private readonly DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    // Mensajes por etapa del journey
    private readonly JOURNEY_MESSAGES = {
        awareness: {
            openings: [
                "¡Hola! 👋 Bienvenido a TechAura",
                "¡Qué bueno verte! 🎵 Creamos USBs únicas",
                "¡Hola! 🌟 ¿Buscas tu USB perfecta?"
            ],
            values: [
                "✨ Personalizamos con tus géneros y artistas favoritos",
                "🎯 Miles de canciones organizadas, sin relleno",
                "💎 Calidad HD 320kbps, memorias originales"
            ],
            ctas: [
                "¿Te interesa música, películas o videos?",
                "¿Qué contenido te gustaría?",
                "¿Qué buscas para tu USB?"
            ]
        },
        interest: {
            openings: [
                "¡Perfecto! 🎵 Me encanta",
                "¡Excelente! 🌟",
                "¡Genial! 🔥"
            ],
            values: [
                "🎨 Personalizamos TODO: géneros, artistas, nombre",
                "⚡ Rápido: Armo tu USB → Envío gratis 24h",
                "✅ Garantía total de cambio"
            ],
            ctas: [
                "¿Qué géneros o artistas prefieres?",
                "Cuéntame tus gustos musicales",
                "¿Quieres ver cómo quedará?"
            ]
        },
        customization: {
            openings: [
                "¡Me encanta! 🎶",
                "¡Perfecto! 🎵",
                "¡Excelente! 🌟"
            ],
            values: [
                "📂 Todo organizado por carpetas",
                "🎧 Solo lo mejor: hits y clásicos",
                "💯 Sin repeticiones ni relleno"
            ],
            transitions: [
                "Ya sé tu estilo, veamos opciones",
                "Tengo la opción perfecta",
                "Esto te recomiendo"
            ],
            ctas: [
                "¿32GB (5,000 canciones) o 64GB (10,000)?",
                "¿Agregamos algo más?",
                "¿Quieres ver precios?"
            ]
        },
        pricing: {
            openings: [
                "💰 Hablemos de inversión",
                "💎 Precios especiales hoy",
                "🔥 Oferta especial"
            ],
            values: [
                "🎁 GRATIS: Envío, funda, grabado",
                "✅ Garantía 6 meses sin preguntas",
                "🔄 Actualizaciones 3 meses gratis"
            ],
            socialProofs: [
                "⭐ +1,500 clientes satisfechos",
                "🏆 4.9/5 estrellas Google",
                "👥 +800 USBs vendidas este mes"
            ],
            urgencies: [
                "⏰ Oferta hoy: 20% OFF",
                "🔥 Últimas 3 en stock",
                "⚡ Envío GRATIS termina en 2h"
            ],
            ctas: [
                "¿Apartamos tu USB?",
                "¿Confirmamos para mañana?",
                "¿Pago completo o 2 cuotas?"
            ]
        },
        closing: {
            openings: [
                "🎉 ¡Excelente decisión!",
                "🔥 ¡Genial! Aseguremos tu USB",
                "✅ ¡Perfecto! Última etapa"
            ],
            values: [
                "📦 USB lista en 24h personalizada",
                "🚚 Envío con seguimiento",
                "💬 Soporte directo siempre"
            ],
            urgencies: [
                "⏰ Apartándola ahora",
                "🔥 Procesando con prioridad",
                "⚡ Separándola del inventario"
            ],
            ctas: [
                "Confirma tu dirección",
                "¿A qué nombre va?",
                "¿Confirmas dirección?"
            ]
        },
        objection_handling: {
            price: [
                "💡 Solo $2,100/día x 5,000+ canciones",
                "🎵 Spotify $15K/mes vs USB $89,900 una vez",
                "💳 $30K hoy + $30K entrega + $29,900 en 15d"
            ],
            quality: [
                "🏆 Memorias Samsung/Kingston originales",
                "🔊 Audio HD 320kbps calidad Spotify",
                "✅ Devolución 100% garantizada"
            ],
            time: [
                "⚡ 24h Medellín, 48h resto del país",
                "🚀 Sale hoy si ordenas antes 3pm",
                "📦 Seguimiento en tiempo real"
            ],
            trust: [
                "📱 +1,500 clientes verificados",
                "⭐ 4.9/5 en Google",
                "✅ Garantía 6 meses, cambio inmediato"
            ]
        }
    };

    static getInstance(): PersuasionEngine {
        if (!PersuasionEngine.instance) {
            PersuasionEngine.instance = new PersuasionEngine();
        }
        return PersuasionEngine.instance;
    }

    /**
     * Build a persuasive message based on context and journey stage
     */
    async buildPersuasiveMessage(
        userMessage: string,
        userSession: UserSession
    ): Promise<string> {
        const context = await this.analyzeContext(userSession);
        const stage = this.determineJourneyStage(context);
        
        // Detect objections
        const objection = this.detectObjection(userMessage);
        if (objection) {
            const objectionResponse = this.handleObjection(objection, context);
            return this.enforceBrevityAndUniqueness(objectionResponse, userSession.phone, stage);
        }

        // Build message for current stage
        const stageMessage = this.buildStageMessage(stage, context);
        return this.enforceBrevityAndUniqueness(stageMessage, userSession.phone, stage);
    }

    /**
     * Check if message was recently sent to avoid duplicates
     */
    private isDuplicateMessage(phone: string, message: string): boolean {
        const userHistory = this.messageHistory.get(phone);
        if (!userHistory) {
            return false;
        }

        const normalizedMessage = this.normalizeMessageForComparison(message);
        const lastSent = userHistory.get(normalizedMessage);
        
        if (lastSent) {
            const timeSinceLastSent = Date.now() - lastSent;
            return timeSinceLastSent < this.DUPLICATE_WINDOW_MS;
        }

        return false;
    }

    /**
     * Record message as sent for duplicate detection
     */
    private recordMessageSent(phone: string, message: string): void {
        let userHistory = this.messageHistory.get(phone);
        if (!userHistory) {
            userHistory = new Map();
            this.messageHistory.set(phone, userHistory);
        }

        const normalizedMessage = this.normalizeMessageForComparison(message);
        userHistory.set(normalizedMessage, Date.now());

        // Cleanup old entries (older than duplicate window)
        const cutoffTime = Date.now() - this.DUPLICATE_WINDOW_MS;
        for (const [msg, timestamp] of userHistory.entries()) {
            if (timestamp < cutoffTime) {
                userHistory.delete(msg);
            }
        }

        // Cleanup empty user histories
        if (userHistory.size === 0) {
            this.messageHistory.delete(phone);
        }
    }

    /**
     * Normalize message for comparison (remove emojis, extra whitespace, etc.)
     */
    private normalizeMessageForComparison(message: string): string {
        return message
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
            .replace(/\s+/g, ' ') // Normalize whitespace
            .toLowerCase()
            .trim();
    }

    /**
     * Enforce brevity (target 80-150 chars, hard cap 200) and uniqueness
     */
    private enforceBrevityAndUniqueness(
        message: string, 
        phone: string, 
        stage: string
    ): string {
        // Check for duplicate
        if (this.isDuplicateMessage(phone, message)) {
            console.log(`⚠️ Duplicate message detected for ${phone}, rebuilding...`);
            message = this.rebuildToAvoidDuplicate(message, stage);
        }

        // Trim if exceeds hard cap
        if (message.length > this.HARD_MAX_LENGTH) {
            console.log(`⚠️ Message exceeds ${this.HARD_MAX_LENGTH} chars (${message.length}), trimming...`);
            message = this.trimMessage(message);
        }

        // Record message
        this.recordMessageSent(phone, message);

        return message;
    }

    /**
     * Trim message to fit within hard cap while preserving CTA
     */
    private trimMessage(message: string): string {
        const lines = message.split('\n');
        
        // Extract CTA (usually last line with ? or command)
        let cta = '';
        const ctaPatterns = [/[¿?]/, /\b(confirma|dime|cuéntame|elige|selecciona|prefieres|quieres)\b/i];
        
        for (let i = lines.length - 1; i >= 0; i--) {
            if (ctaPatterns.some(pattern => pattern.test(lines[i]))) {
                cta = lines[i];
                lines.splice(i, 1);
                break;
            }
        }

        // Build trimmed message keeping essential content
        let trimmed = lines.join('\n');
        
        // If still too long, take first essential parts
        if ((trimmed + '\n\n' + cta).length > this.HARD_MAX_LENGTH) {
            // Take first line (usually greeting/opening) and last value proposition
            const opening = lines[0] || '';
            const essential = lines.slice(1, 3).join('\n'); // Take 2 more lines max
            trimmed = [opening, essential].filter(Boolean).join('\n');
        }

        // Add CTA back
        const result = cta ? `${trimmed}\n\n${cta}` : trimmed;

        // Final check - if still too long, hard truncate but keep CTA
        if (result.length > this.HARD_MAX_LENGTH) {
            const availableSpace = this.HARD_MAX_LENGTH - cta.length - 3; // 3 for '\n\n'
            const truncatedContent = trimmed.substring(0, availableSpace).trim();
            return cta ? `${truncatedContent}\n\n${cta}` : truncatedContent;
        }

        return result.trim();
    }

    /**
     * Rebuild message to avoid duplicate by varying the content
     */
    private rebuildToAvoidDuplicate(message: string, stage: string): string {
        // Extract CTA
        const lines = message.split('\n').filter(line => line.trim());
        const cta = lines[lines.length - 1] || '¿En qué más puedo ayudarte?';
        
        // Create variation with different opening/value prop
        const stageMessages = this.JOURNEY_MESSAGES[stage as keyof typeof this.JOURNEY_MESSAGES];
        if (!stageMessages) {
            // Add timestamp to make it unique
            return `${message.substring(0, this.HARD_MAX_LENGTH - 20)} (${Date.now() % 1000})`;
        }

        const parts: string[] = [];

        // Use different opening
        if ('openings' in stageMessages && Array.isArray(stageMessages.openings)) {
            parts.push(this.getRandomItem(stageMessages.openings));
        }

        // Use different value
        if ('values' in stageMessages && Array.isArray(stageMessages.values)) {
            parts.push(this.getRandomItem(stageMessages.values));
        }

        // Keep original CTA
        parts.push(cta);

        return parts.join('\n\n');
    }

    /**
     * Analyze user context for persuasion
     */
    private async analyzeContext(userSession: UserSession): Promise<PersuasionContext> {
        const memoryContext = await conversationMemory.getContext(userSession.phone);
        
        return {
            stage: userSession.stage || 'awareness',
            hasDiscussedPrice: memoryContext.summary.priceDiscussed,
            hasSelectedProduct: memoryContext.summary.productInterests.length > 0,
            hasCustomized: memoryContext.summary.mainTopics.includes('customization'),
            buyingIntent: userSession.buyingIntent || 0,
            interactionCount: userSession.interactions?.length || 0,
            productInterests: memoryContext.summary.productInterests
        };
    }

    /**
     * Determine the customer's journey stage
     */
    private determineJourneyStage(context: PersuasionContext): string {
        if (context.stage === 'order_confirmed' || context.stage === 'closing') {
            return 'closing';
        }
        if (context.hasDiscussedPrice || context.stage === 'pricing') {
            return 'pricing';
        }
        if (context.hasCustomized || context.stage === 'customizing') {
            return 'customization';
        }
        if (context.hasSelectedProduct || context.buyingIntent > 50) {
            return 'interest';
        }
        return 'awareness';
    }

    /**
     * Detect customer objections
     */
    private detectObjection(message: string): string | null {
        const lower = message.toLowerCase();
        
        if (/\b(caro|costoso|mucho|expensive|precio alto)\b/.test(lower)) {
            return 'price';
        }
        if (/\b(calidad|funciona|durabilidad|garantía)\b/.test(lower)) {
            return 'quality';
        }
        if (/\b(cu[aá]nto tarda|demora|r[aá]pido|tiempo)\b/.test(lower)) {
            return 'time';
        }
        if (/\b(confío?|seguro|verdad|estafa|confiable)\b/.test(lower)) {
            return 'trust';
        }
        
        return null;
    }

    /**
     * Handle customer objections persuasively
     */
    private handleObjection(objection: string, context: PersuasionContext): string {
        const responses = this.JOURNEY_MESSAGES.objection_handling[objection as keyof typeof this.JOURNEY_MESSAGES.objection_handling];
        if (!responses || responses.length === 0) {
            return this.buildStageMessage('interest', context);
        }

        const response = this.getRandomItem(responses);
        const cta = this.getNextStepCTA(context);

        return `${response}\n\n${cta}`;
    }

    /**
     * Build a complete message for the current stage
     */
    private buildStageMessage(stage: string, context: PersuasionContext): string {
        const messages = this.JOURNEY_MESSAGES[stage as keyof typeof this.JOURNEY_MESSAGES];
        if (!messages) {
            return this.buildDefaultMessage(context);
        }

        const parts: string[] = [];

        // Opening
        if ('openings' in messages && Array.isArray(messages.openings)) {
            parts.push(this.getRandomItem(messages.openings));
        }

        // Value proposition
        if ('values' in messages && Array.isArray(messages.values)) {
            parts.push('');
            parts.push(this.getRandomItem(messages.values));
        }

        // Transition (if in customization)
        if (stage === 'customization' && 'transitions' in messages && Array.isArray(messages.transitions)) {
            parts.push('');
            parts.push(this.getRandomItem(messages.transitions));
        }

        // Social proof (if in pricing/closing)
        if ((stage === 'pricing' || stage === 'closing') && 'socialProofs' in messages && Array.isArray(messages.socialProofs)) {
            parts.push('');
            parts.push(this.getRandomItem(messages.socialProofs));
        }

        // Urgency (if in pricing/closing and high buying intent)
        if ((stage === 'pricing' || stage === 'closing') && context.buyingIntent > 70 && 'urgencies' in messages && Array.isArray(messages.urgencies)) {
            parts.push('');
            parts.push(this.getRandomItem(messages.urgencies));
        }

        // Call to action
        if ('ctas' in messages && Array.isArray(messages.ctas)) {
            parts.push('');
            parts.push(this.getRandomItem(messages.ctas));
        }

        return parts.join('\n');
    }

    /**
     * Get next step call-to-action based on context
     */
    private getNextStepCTA(context: PersuasionContext): string {
        if (!context.hasSelectedProduct) {
            return "¿Te interesa música, películas o videos?";
        }
        if (!context.hasCustomized) {
            return "¿Qué géneros o artistas te gustan más?";
        }
        if (!context.hasDiscussedPrice) {
            return "¿Quieres ver las opciones de capacidad y precios?";
        }
        return "¿Confirmamos tu pedido?";
    }

    /**
     * Build default message when stage is unknown
     */
    private buildDefaultMessage(context: PersuasionContext): string {
        const product = context.productInterests[0] || 'USB personalizada';
        return `🎵 Perfecto, trabajemos en tu ${product}.\n\n` +
               `✨ Puedes personalizar todo: géneros, artistas, organización.\n\n` +
               `¿Qué te gustaría incluir?`;
    }

    /**
     * Get random item from array
     */
    private getRandomItem<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }

    // Regex patterns for validation (compiled once)
    private readonly PRODUCT_PATTERNS = {
        music: /música|musica|cancion|playlist|género|genero|artista/i,
        movies: /película|pelicula|film|serie|cine/i,
        videos: /video|clip/i,
        price: /precio|costo/i,
        confirmation: /confirma|pedido/i,
        shipping: /dirección/i
    };
    
    /**
     * Validate message coherence before sending
     */
    validateMessageCoherence(message: string, context: PersuasionContext): {
        isCoherent: boolean;
        issues: string[];
        suggestions: string[];
    } {
        const issues: string[] = [];
        const suggestions: string[] = [];

        // Check length constraints
        if (message.length < 30) {
            issues.push('Message too short');
            suggestions.push('Add value proposition or call to action');
        }

        if (message.length > this.HARD_MAX_LENGTH) {
            issues.push(`Message exceeds hard cap of ${this.HARD_MAX_LENGTH} characters`);
            suggestions.push('Trim message while preserving CTA');
        } else if (message.length > this.TARGET_MAX_LENGTH) {
            issues.push(`Message exceeds target length of ${this.TARGET_MAX_LENGTH} characters`);
            suggestions.push('Consider making message more concise');
        }

        // Check if message has call to action
        if (!this.hasCTA(message)) {
            issues.push('Missing call to action');
            suggestions.push('Add a question or action request');
        }

        // IMPROVED: Check product context consistency
        const messageLower = message.toLowerCase();
        const mentionsMusic = this.PRODUCT_PATTERNS.music.test(message);
        const mentionsMovies = this.PRODUCT_PATTERNS.movies.test(message);
        const mentionsVideos = this.PRODUCT_PATTERNS.videos.test(message);
        
        const productMentions = [mentionsMusic, mentionsMovies, mentionsVideos].filter(Boolean).length;
        
        // If user has selected a product, ensure message doesn't mention others
        if (context.productInterests.length > 0) {
            const primaryInterest = context.productInterests[0].toLowerCase();
            
            if (primaryInterest.includes('music') && (mentionsMovies || mentionsVideos) && !mentionsMusic) {
                issues.push('Message mentions wrong product type (user interested in music)');
                suggestions.push('Focus only on music-related content');
            }
            
            if (primaryInterest.includes('movie') && (mentionsMusic || mentionsVideos) && !mentionsMovies) {
                issues.push('Message mentions wrong product type (user interested in movies)');
                suggestions.push('Focus only on movie-related content');
            }
            
            if (primaryInterest.includes('video') && (mentionsMusic || mentionsMovies) && !mentionsVideos) {
                issues.push('Message mentions wrong product type (user interested in videos)');
                suggestions.push('Focus only on video-related content');
            }
        }
        
        // Warn if mentioning multiple products when user already selected one
        if (context.hasSelectedProduct && productMentions > 1) {
            issues.push('Message mentions multiple products when user already selected one');
            suggestions.push('Focus on the selected product type only');
        }

        // Check if message matches stage
        if (context.hasDiscussedPrice && !message.includes('$') && !messageLower.includes('precio') && !messageLower.includes('costo')) {
            issues.push('Price discussed but not mentioned in message');
            suggestions.push('Include pricing information');
        }
        
        // IMPROVED: Check for stage-appropriate content
        const stage = this.determineJourneyStage(context);
        
        if (stage === 'awareness' && (messageLower.includes('confirma') || this.PRODUCT_PATTERNS.confirmation.test(message))) {
            issues.push('Message tries to close sale too early (still in awareness stage)');
            suggestions.push('Focus on product discovery and building interest first');
        }
        
        if (stage === 'interest' && this.PRODUCT_PATTERNS.shipping.test(message) && !context.hasDiscussedPrice) {
            issues.push('Message asks for shipping info before discussing price');
            suggestions.push('Discuss pricing before collecting shipping details');
        }

        // Check for confusing transitions
        if (this.hasConfusingTransition(message)) {
            issues.push('Confusing message transition - too many topics');
            suggestions.push('Simplify message flow to focus on one or two key points');
        }
        
        // IMPROVED: Check for generic/vague responses
        if (this.isGenericResponse(message, context)) {
            issues.push('Message is too generic and not contextual');
            suggestions.push('Add specific details based on user context and preferences');
        }

        return {
            isCoherent: issues.length === 0,
            issues,
            suggestions
        };
    }
    
    /**
     * Check if response is too generic given the context
     */
    private isGenericResponse(message: string, context: PersuasionContext): boolean {
        const messageLower = message.toLowerCase();
        
        // Generic greetings when user is already engaged
        if (context.interactionCount > 3 && 
            (messageLower.includes('bienvenido') || messageLower.includes('llegaste al lugar'))) {
            return true;
        }
        
        // Generic product list when user already selected
        if (context.hasSelectedProduct && 
            messageLower.includes('música, películas o videos') && 
            !messageLower.includes('algo más')) {
            return true;
        }
        
        // Asking about product type when already in customization
        if ((context.stage === 'customizing' || context.stage === 'customization') && 
            messageLower.includes('qué te interesa') && 
            !messageLower.includes('más') && 
            !messageLower.includes('algo')) {
            return true;
        }
        
        return false;
    }

    /**
     * Check if message has a call to action
     */
    private hasCTA(message: string): boolean {
        return /[¿?]/.test(message) || 
               /\b(confirma|dime|cuéntame|elige|selecciona|prefieres|quieres)\b/i.test(message);
    }

    /**
     * Check for confusing transitions
     */
    private hasConfusingTransition(message: string): boolean {
        // Check for multiple topics in one message
        const topics = [
            /precio|costo|vale/i,
            /género|artista|música/i,
            /envío|entrega|domicilio/i,
            /garantía|calidad|HD/i
        ];

        const matchedTopics = topics.filter(pattern => pattern.test(message));
        return matchedTopics.length > 2; // Too many topics = confusing
    }

    /**
     * Enhance existing message with persuasion elements
     */
    enhanceMessage(baseMessage: string, context: PersuasionContext, phone?: string): string {
        let enhanced = baseMessage;

        // Check current length before adding elements
        const currentLength = enhanced.length;
        const spaceAvailable = this.TARGET_MAX_LENGTH - currentLength;

        // Add social proof if in pricing stage and not present, and space available
        if (context.hasDiscussedPrice && !enhanced.includes('⭐') && !enhanced.includes('👥') && spaceAvailable > 50) {
            const socialProof = this.getRandomItem(this.JOURNEY_MESSAGES.pricing.socialProofs);
            if (currentLength + socialProof.length + 4 <= this.TARGET_MAX_LENGTH) {
                enhanced = `${enhanced}\n\n${socialProof}`;
            }
        }

        // Add urgency if high buying intent and not present, and space available
        if (context.buyingIntent > 80 && !enhanced.includes('⏰') && !enhanced.includes('🔥') && spaceAvailable > 40) {
            const urgency = this.getRandomItem(this.JOURNEY_MESSAGES.pricing.urgencies);
            if (enhanced.length + urgency.length + 4 <= this.TARGET_MAX_LENGTH) {
                enhanced = `${enhanced}\n\n${urgency}`;
            }
        }

        // Ensure CTA if missing
        if (!this.hasCTA(enhanced)) {
            const cta = this.getNextStepCTA(context);
            enhanced = `${enhanced}\n\n${cta}`;
        }

        // Apply brevity enforcement if phone provided
        if (phone) {
            const stage = this.determineJourneyStage(context);
            enhanced = this.enforceBrevityAndUniqueness(enhanced, phone, stage);
        } else if (enhanced.length > this.HARD_MAX_LENGTH) {
            // If no phone provided, at least trim to hard cap
            enhanced = this.trimMessage(enhanced);
        }

        return enhanced;
    }
}

export const persuasionEngine = PersuasionEngine.getInstance();
