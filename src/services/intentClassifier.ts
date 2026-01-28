/**
 * Intent Classification and Entity Extraction System
 * Provides advanced NLP capabilities for understanding user messages
 */

import type { UserSession } from '../../types/global';
import type { ConversationContext } from './conversationMemory';

// Sentiment analysis configuration (can be extended/externalized)
const SENTIMENT_CONFIG = {
    positive: ['genial', 'excelente', 'perfecto', 'bueno', 'bien', 'gracias', 'me gusta', 'interesa', 'super', 'genial'],
    negative: ['no', 'mal', 'malo', 'terrible', 'problema', 'nunca', 'no me gusta', 'horrible', 'pesimo']
};

export interface Intent {
    name: string;
    confidence: number;
    entities: Record<string, any>;
    metadata?: any;
}

export interface Entity {
    type: string;
    value: any;
    raw: string;
    confidence: number;
}

export interface ClassificationResult {
    primaryIntent: Intent;
    secondaryIntents: Intent[];
    entities: Entity[];
    sentiment: 'positive' | 'neutral' | 'negative';
    urgency: 'high' | 'medium' | 'low';
}

export class IntentClassifier {
    private static instance: IntentClassifier;

    // Intent patterns with priority and confidence weights
    private intentPatterns = {
        // High priority - transactional
        purchase: {
            patterns: [
                /\b(comprar|compro|quiero|necesito|adquirir|pedido|orden|ordenar)\b/i,
                /\b(me (interesa|gustaria|gustería) (comprar|adquirir))\b/i,
            ],
            weight: 1.0,
            priority: 1,
            entities: ['product', 'quantity', 'capacity']
        },
        pricing: {
            patterns: [
                /\b(precio|costo|vale|cuanto|cuánto|pago|pagar|dinero)\b/i,
                /\$\d+/,
                /\b(económico|barato|caro|costoso)\b/i,
            ],
            weight: 0.95,
            priority: 1,
            entities: ['product', 'capacity', 'price_range']
        },

        // Medium priority - informational
        product_inquiry: {
            patterns: [
                /\b(qué|que|cuál|cual|cuáles|opciones|productos|tienen|venden|ofrecen)\b/i,
                /\b(tipos de|variedades|modelos)\b/i,
            ],
            weight: 0.85,
            priority: 2,
            entities: ['product', 'category']
        },
        customization: {
            patterns: [
                /\b(personaliz|custom|modificar|adaptar|elegir|seleccionar)\b/i,
                /\b(géneros?|artistas?|películas|contenido)\b/i,
                /\b(preferencias|gustos|favoritos)\b/i,
            ],
            weight: 0.90,
            priority: 2,
            entities: ['genres', 'artists', 'categories', 'preferences']
        },
        capacity_inquiry: {
            patterns: [
                /\b(\d+\s*(gb|gigas?|megabytes?))\b/i,
                /\b(capacidad|tamaño|espacio|memoria)\b/i,
                /\b(cuántas? (canciones?|películas?|videos?|juegos?))\b/i,
            ],
            weight: 0.80,
            priority: 2,
            entities: ['capacity', 'product']
        },
        gaming: {
            patterns: [
                /\b(juegos?|videojuegos?|games?)\b/i,
                /\b(play\s?2|ps2|ps1|psp)\b/i,
                /\b(nintendo|wii|gamecube|n64|snes|nes)\b/i,
                /\b(dragon\s?ball?|resident|fifa|god\s?of\s?war|gta)\b/i,
                /\b(roms?|isos?|emulador)\b/i,
            ],
            weight: 0.90,
            priority: 2,
            entities: ['gaming_platform', 'capacity', 'product']
        },

        // Support and service
        shipping: {
            patterns: [
                /\b(envío|enviar|entrega|entregar|envian|despacho|domicilio)\b/i,
                /\b(dónde|donde|dirección|ubicación)\b/i,
            ],
            weight: 0.75,
            priority: 3,
            entities: ['location', 'address']
        },
        warranty: {
            patterns: [
                /\b(garantía|garantia|asegurar|protección|devolución)\b/i,
            ],
            weight: 0.70,
            priority: 3,
            entities: ['duration', 'conditions']
        },
        status: {
            patterns: [
                /\b(estado|como va|cómo va|avance|listo|terminado)\b/i,
                /\b(pedido|orden|compra)\b.*\b(estado|progreso)\b/i,
            ],
            weight: 0.85,
            priority: 2,
            entities: ['order_number']
        },

        // Conversational
        greeting: {
            patterns: [
                /\b(hola|buenos|buenas|saludos|hey|hi|hello)\b/i,
                /^\s*(hola|buenos|buenas)\s*$/i,
            ],
            weight: 0.60,
            priority: 4,
            entities: []
        },
        affirmative: {
            patterns: [
                /^\s*(si|sí|ok|vale|dale|listo|claro|perfecto|excelente|bueno)\s*$/i,
            ],
            weight: 0.70,
            priority: 3,
            entities: []
        },
        negative: {
            patterns: [
                /^\s*(no|nope|nada|ninguno|ninguna)\s*$/i,
                /\b(no (me )?(interesa|gusta|quiero|necesito))\b/i,
            ],
            weight: 0.70,
            priority: 3,
            entities: []
        },
        help: {
            patterns: [
                /\b(ayuda|ayúdame|help|asistencia|soporte|asesor|humano)\b/i,
                /\b(no entiendo|confundido|perdido)\b/i,
            ],
            weight: 0.80,
            priority: 2,
            entities: []
        },
    };

    // Entity extraction patterns
    private entityPatterns = {
        product: {
            music: /\b(música|musica|canciones?|playlist|audio)\b/i,
            movies: /\b(películas?|peliculas?|films?|cine|series?)\b/i,
            videos: /\b(videos?|clips?|videoclips?)\b/i,
            games: /\b(juegos?|videojuegos?|games?|play|ps\d?|psp|nintendo|wii|gamecube|emulador|roms?|isos?)\b/i,
        },
        capacity: {
            pattern: /\b(\d+)\s*(gb|gigas?)\b/i,
            values: ['8gb', '16gb', '32gb', '64gb', '128gb', '256gb']
        },
        gaming_platform: {
            ps2: /\b(ps2|play\s?2|play\s?station\s?2)\b/i,
            ps1: /\b(ps1|play\s?1|play\s?station\s?1|psx)\b/i,
            psp: /\b(psp)\b/i,
            wii: /\b(wii)\b/i,
            gamecube: /\b(gamecube|gc)\b/i,
            n64: /\b(n64|nintendo\s?64)\b/i,
            snes: /\b(snes|super\s?nintendo)\b/i,
            nes: /\b(nes)\b/i,
            pc: /\b(pc|computador|windows)\b/i,
        },
        genres: {
            reggaeton: /\b(reggaeton|regueton)\b/i,
            salsa: /\b(salsa)\b/i,
            bachata: /\b(bachata)\b/i,
            vallenato: /\b(vallenato)\b/i,
            rock: /\b(rock)\b/i,
            pop: /\b(pop)\b/i,
            electronic: /\b(electrónica?|electronica?|edm|techno|house)\b/i,
            urbano: /\b(urbano|trap|rap)\b/i,
        },
        price_range: {
            budget: /\b(económico|barato|accesible)\b/i,
            mid: /\b(normal|estándar|estandar|medio)\b/i,
            premium: /\b(premium|mejor|top|calidad)\b/i,
        },
        quantity: {
            pattern: /\b(\d+)\s*(usb|memoria|unidad)/i,
        },
    };

    static getInstance(): IntentClassifier {
        if (!IntentClassifier.instance) {
            IntentClassifier.instance = new IntentClassifier();
        }
        return IntentClassifier.instance;
    }

    /**
     * Classify user message and extract intents and entities
     */
    async classify(
        message: string,
        userSession?: UserSession,
        context?: ConversationContext
    ): Promise<ClassificationResult> {
        const normalizedMessage = message.toLowerCase().trim();

        // Detect all matching intents
        const matchedIntents = this.detectIntents(normalizedMessage);

        // Extract entities
        const entities = this.extractEntities(normalizedMessage);

        // Determine sentiment
        const sentiment = this.analyzeSentiment(normalizedMessage);

        // Calculate urgency
        const urgency = this.calculateUrgency(matchedIntents, entities, context);

        // Sort intents by confidence
        matchedIntents.sort((a, b) => b.confidence - a.confidence);

        const primaryIntent = matchedIntents[0] || this.getDefaultIntent();
        const secondaryIntents = matchedIntents.slice(1, 3);

        return {
            primaryIntent,
            secondaryIntents,
            entities,
            sentiment,
            urgency
        };
    }

    /**
     * Detect all matching intents in the message
     */
    private detectIntents(message: string): Intent[] {
        const intents: Intent[] = [];

        for (const [intentName, config] of Object.entries(this.intentPatterns)) {
            let matchCount = 0;
            const totalPatterns = config.patterns.length;

            for (const pattern of config.patterns) {
                if (pattern.test(message)) {
                    matchCount++;
                }
            }

            if (matchCount > 0) {
                const confidence = (matchCount / totalPatterns) * config.weight;
                
                intents.push({
                    name: intentName,
                    confidence,
                    entities: this.extractEntitiesForIntent(message, config.entities),
                    metadata: {
                        priority: config.priority,
                        matchCount,
                        totalPatterns
                    }
                });
            }
        }

        return intents;
    }

    /**
     * Extract entities from message
     */
    private extractEntities(message: string): Entity[] {
        const entities: Entity[] = [];

        // Extract products
        for (const [product, pattern] of Object.entries(this.entityPatterns.product)) {
            if (pattern.test(message)) {
                entities.push({
                    type: 'product',
                    value: product,
                    raw: message.match(pattern)?.[0] || product,
                    confidence: 0.9
                });
            }
        }

        // Extract capacity
        const capacityMatch = message.match(this.entityPatterns.capacity.pattern);
        if (capacityMatch) {
            const value = `${capacityMatch[1]}gb`.toLowerCase();
            if (this.entityPatterns.capacity.values.includes(value)) {
                entities.push({
                    type: 'capacity',
                    value,
                    raw: capacityMatch[0],
                    confidence: 0.95
                });
            }
        }

        // Extract genres
        for (const [genre, pattern] of Object.entries(this.entityPatterns.genres)) {
            if (pattern.test(message)) {
                entities.push({
                    type: 'genre',
                    value: genre,
                    raw: message.match(pattern)?.[0] || genre,
                    confidence: 0.85
                });
            }
        }

        // Extract gaming platforms
        for (const [platform, pattern] of Object.entries(this.entityPatterns.gaming_platform)) {
            if (pattern.test(message)) {
                entities.push({
                    type: 'gaming_platform',
                    value: platform,
                    raw: message.match(pattern)?.[0] || platform,
                    confidence: 0.90
                });
            }
        }

        // Extract price range
        for (const [range, pattern] of Object.entries(this.entityPatterns.price_range)) {
            if (pattern.test(message)) {
                entities.push({
                    type: 'price_range',
                    value: range,
                    raw: message.match(pattern)?.[0] || range,
                    confidence: 0.80
                });
            }
        }

        // Extract quantity
        const quantityMatch = message.match(this.entityPatterns.quantity.pattern);
        if (quantityMatch) {
            entities.push({
                type: 'quantity',
                value: parseInt(quantityMatch[1]),
                raw: quantityMatch[0],
                confidence: 0.90
            });
        }

        return entities;
    }

    /**
     * Extract specific entities for an intent
     */
    private extractEntitiesForIntent(message: string, entityTypes: string[]): Record<string, any> {
        const entities: Record<string, any> = {};

        for (const entityType of entityTypes) {
            if (entityType === 'product') {
                for (const [product, pattern] of Object.entries(this.entityPatterns.product)) {
                    if (pattern.test(message)) {
                        entities.product = product;
                        break;
                    }
                }
            } else if (entityType === 'capacity') {
                const match = message.match(this.entityPatterns.capacity.pattern);
                if (match) {
                    entities.capacity = `${match[1]}gb`.toLowerCase();
                }
            } else if (entityType === 'genres') {
                entities.genres = [];
                for (const [genre, pattern] of Object.entries(this.entityPatterns.genres)) {
                    if (pattern.test(message)) {
                        entities.genres.push(genre);
                    }
                }
            } else if (entityType === 'gaming_platform') {
                for (const [platform, pattern] of Object.entries(this.entityPatterns.gaming_platform)) {
                    if (pattern.test(message)) {
                        entities.gaming_platform = platform;
                        break;
                    }
                }
            }
        }

        return entities;
    }

    /**
     * Analyze sentiment of the message
     */
    private analyzeSentiment(message: string): 'positive' | 'neutral' | 'negative' {
        let positiveCount = 0;
        let negativeCount = 0;

        SENTIMENT_CONFIG.positive.forEach(word => {
            if (message.includes(word)) positiveCount++;
        });

        SENTIMENT_CONFIG.negative.forEach(word => {
            if (message.includes(word)) negativeCount++;
        });

        if (positiveCount > negativeCount) return 'positive';
        if (negativeCount > positiveCount) return 'negative';
        return 'neutral';
    }

    /**
     * Calculate urgency based on intents and context
     */
    private calculateUrgency(
        intents: Intent[],
        entities: Entity[],
        context?: ConversationContext
    ): 'high' | 'medium' | 'low' {
        // High urgency indicators
        const hasTransactionalIntent = intents.some(i => 
            ['purchase', 'pricing', 'status'].includes(i.name) && i.confidence > 0.7
        );
        
        const hasSpecificEntities = entities.some(e => 
            ['capacity', 'product', 'quantity'].includes(e.type)
        );

        const isDecisionStage = context?.summary.decisionStage === 'decision';
        const hasPriceDiscussion = context?.summary.priceDiscussed;

        if (hasTransactionalIntent && hasSpecificEntities) return 'high';
        if (isDecisionStage || hasPriceDiscussion) return 'high';
        if (hasTransactionalIntent || hasSpecificEntities) return 'medium';

        return 'low';
    }

    /**
     * Get default intent when no match found
     */
    private getDefaultIntent(): Intent {
        return {
            name: 'unknown',
            confidence: 0.1,
            entities: {},
            metadata: { fallback: true }
        };
    }

    /**
     * Get a human-readable explanation of the classification
     */
    explainClassification(result: ClassificationResult): string {
        const { primaryIntent, entities, sentiment, urgency } = result;

        let explanation = `Intent: ${primaryIntent.name} (${(primaryIntent.confidence * 100).toFixed(0)}%)`;
        
        if (entities.length > 0) {
            explanation += `\nEntities: ${entities.map(e => `${e.type}=${e.value}`).join(', ')}`;
        }
        
        explanation += `\nSentiment: ${sentiment}`;
        explanation += `\nUrgency: ${urgency}`;

        return explanation;
    }

    /**
     * Check if message matches a specific intent
     */
    matchesIntent(message: string, intentName: string, minConfidence: number = 0.6): boolean {
        const intents = this.detectIntents(message.toLowerCase());
        const intent = intents.find(i => i.name === intentName);
        return intent ? intent.confidence >= minConfidence : false;
    }
}

export const intentClassifier = IntentClassifier.getInstance();
