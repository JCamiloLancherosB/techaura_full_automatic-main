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

    // Mensajes por etapa del journey
    private readonly JOURNEY_MESSAGES = {
        awareness: {
            openings: [
                "¡Hola! 👋 Bienvenido a TechAura, especialistas en USBs personalizadas",
                "¡Qué bueno verte por aquí! 🎵 En TechAura creamos USBs únicas para ti",
                "¡Hola! 🌟 ¿Buscas la mejor forma de llevar tu música y entretenimiento?"
            ],
            values: [
                "✨ Personalizamos cada USB con tus géneros, artistas y preferencias exactas",
                "🎯 Miles de canciones organizadas como TÚ quieres, sin relleno",
                "💎 Calidad premium: audio HD 320kbps, memorias Samsung/Kingston originales"
            ],
            ctas: [
                "¿Te interesa música, películas o videos?",
                "¿Qué tipo de contenido te gustaría llevar contigo?",
                "Cuéntame, ¿qué buscas para tu USB?"
            ]
        },
        interest: {
            openings: [
                "¡Perfecto! 🎵 Me encanta tu elección",
                "¡Excelente decisión! 🌟",
                "¡Genial! 🔥 Esa es nuestra especialidad"
            ],
            values: [
                "🎨 Personalizamos TODO: géneros, artistas, organización, hasta el nombre de tu USB",
                "⚡ Proceso rápido: Dime tus gustos → Armo tu USB → Envío gratis en 24h",
                "✅ Garantía total: Si algo no te gusta, lo cambiamos sin problema"
            ],
            ctas: [
                "¿Qué géneros o artistas te gustan más?",
                "Cuéntame sobre tus gustos musicales para personalizarla perfectamente",
                "¿Quieres que te muestre cómo quedará tu USB personalizada?"
            ]
        },
        customization: {
            openings: [
                "¡Me encanta! 🎶 Voy entendiendo tu estilo",
                "¡Perfecto! 🎵 Ya veo qué te gusta",
                "¡Excelente selección! 🌟"
            ],
            values: [
                "📂 Organizo todo por carpetas: cada género y artista separado para fácil acceso",
                "🎧 Solo las mejores canciones: hits, clásicos y lo más nuevo de cada artista",
                "💯 Sin repeticiones ni relleno: cada canción cuenta"
            ],
            transitions: [
                "Ahora que ya sé tu estilo, veamos las opciones",
                "Con estos gustos, tengo la opción perfecta para ti",
                "Basándome en lo que me contaste, esto es lo que te recomiendo"
            ],
            ctas: [
                "¿Qué capacidad prefieres? 32GB (5,000 canciones) o 64GB (10,000 canciones)?",
                "¿Agregamos algo más o seguimos con la capacidad?",
                "¿Quieres ver los precios según la capacidad?"
            ]
        },
        pricing: {
            openings: [
                "💰 Perfecto, hablemos de inversión",
                "💎 Aquí están los precios especiales de hoy",
                "🔥 Tengo una oferta especial para ti"
            ],
            values: [
                "🎁 INCLUIDO GRATIS: Envío express, funda protectora, grabado del nombre",
                "✅ Garantía 6 meses: cambio sin preguntas si algo falla",
                "🔄 Actualizaciones gratis por 3 meses: agregamos música nueva"
            ],
            socialProofs: [
                "⭐ +1,500 clientes satisfechos en Medellín y Bogotá",
                "🏆 Calificación 4.9/5 estrellas en Google",
                "👥 +800 USBs vendidas este mes"
            ],
            urgencies: [
                "⏰ Oferta válida solo hoy: 20% OFF",
                "🔥 Últimas 3 USBs con esta configuración en stock",
                "⚡ Envío GRATIS termina en 2 horas"
            ],
            ctas: [
                "¿Apartamos tu USB con esta configuración?",
                "¿Confirmamos tu pedido con envío para mañana?",
                "¿Prefieres pago completo o en 2 cuotas?"
            ]
        },
        closing: {
            openings: [
                "🎉 ¡Excelente decisión!",
                "🔥 ¡Genial! Vamos a asegurar tu USB",
                "✅ ¡Perfecto! Última etapa"
            ],
            values: [
                "📦 Tu USB lista en 24h: personalizada, empacada y en camino",
                "🚚 Envío con seguimiento: recibes notificaciones en cada etapa",
                "💬 Soporte directo: cualquier duda, estoy aquí para ti"
            ],
            urgencies: [
                "⏰ Apartándola ahora para que no se agote",
                "🔥 Procesando tu pedido con prioridad",
                "⚡ Separándola del inventario en este momento"
            ],
            ctas: [
                "Solo necesito confirmar tu dirección de envío",
                "¿A qué nombre va el pedido?",
                "¿Confirmas la dirección de entrega?"
            ]
        },
        objection_handling: {
            price: [
                "💡 Piénsalo así: son solo $2,100 por día durante un mes para 5,000+ canciones",
                "🎵 Spotify: $15,000/mes y pagas siempre. USB: $89,900 una vez, tuya forever",
                "💳 Opciones: $30,000 hoy + $30,000 a la entrega + $29,900 en 15 días"
            ],
            quality: [
                "🏆 Memorias originales Samsung/Kingston - no genéricas baratas",
                "🔊 Audio HD 320kbps - la misma calidad de Apple Music/Spotify",
                "✅ Prueba garantizada: si no te gusta el audio, devolución 100%"
            ],
            time: [
                "⚡ Entrega express 24h en Medellín, 48h resto del país",
                "🚀 Tenemos en stock, sale hoy mismo si ordenas antes de las 3pm",
                "📦 Seguimiento en tiempo real desde que sale hasta que llega"
            ],
            trust: [
                "📱 +1,500 clientes verificados - te comparto testimonios",
                "⭐ 4.9/5 en Google - lee las reseñas reales",
                "✅ Garantía escrita 6 meses - cambio inmediato si falla"
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
            return this.handleObjection(objection, context);
        }

        // Build message for current stage
        return this.buildStageMessage(stage, context);
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

        // Check if message is too short
        if (message.length < 30) {
            issues.push('Message too short');
            suggestions.push('Add value proposition or call to action');
        }

        // Check if message has call to action
        if (!this.hasCTA(message)) {
            issues.push('Missing call to action');
            suggestions.push('Add a question or action request');
        }

        // Check if message matches stage
        if (context.hasDiscussedPrice && !message.includes('$') && !message.includes('precio')) {
            issues.push('Price discussed but not mentioned in message');
            suggestions.push('Include pricing information');
        }

        // Check for confusing transitions
        if (this.hasConfusingTransition(message)) {
            issues.push('Confusing message transition');
            suggestions.push('Simplify message flow');
        }

        return {
            isCoherent: issues.length === 0,
            issues,
            suggestions
        };
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
    enhanceMessage(baseMessage: string, context: PersuasionContext): string {
        let enhanced = baseMessage;

        // Add social proof if in pricing stage and not present
        if (context.hasDiscussedPrice && !enhanced.includes('⭐') && !enhanced.includes('👥')) {
            const socialProof = this.getRandomItem(this.JOURNEY_MESSAGES.pricing.socialProofs);
            enhanced = `${enhanced}\n\n${socialProof}`;
        }

        // Add urgency if high buying intent and not present
        if (context.buyingIntent > 80 && !enhanced.includes('⏰') && !enhanced.includes('🔥')) {
            const urgency = this.getRandomItem(this.JOURNEY_MESSAGES.pricing.urgencies);
            enhanced = `${enhanced}\n\n${urgency}`;
        }

        // Ensure CTA if missing
        if (!this.hasCTA(enhanced)) {
            const cta = this.getNextStepCTA(context);
            enhanced = `${enhanced}\n\n${cta}`;
        }

        return enhanced;
    }
}

export const persuasionEngine = PersuasionEngine.getInstance();
