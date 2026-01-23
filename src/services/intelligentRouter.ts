import { UserSession } from '../../types/global';
import { aiService } from '../services/aiService';
import { logger } from '../utils/logger';
import { errorHandler } from '../utils/errorHandler';
import { musicData } from '../flows/musicUsb';
import { hybridIntentRouter, IntentResult } from './hybridIntentRouter';

export class EnhancedIntelligentRouter {
    static detectMusicPreferences(message: string): {
        genres: string[];
        artists: string[];
        exclusions: string[];
        organization: string;
    } {
        const detected = {
            genres: [] as string[],
            artists: [] as string[],
            exclusions: [] as string[],
            organization: 'folders_by_genre' // default
        };

        // Detectar géneros
        Object.keys(musicData.genreTopHits).forEach(genre => {
            if (message.toLowerCase().includes(genre)) {
                detected.genres.push(genre);
            }
        });

        // Detectar exclusiones (sin, no, excepto)
        if (message.toLowerCase().includes('sin ') ||
            message.toLowerCase().includes('no ') ||
            message.toLowerCase().includes('excepto')) {
            // Lógica para detectar qué excluir
        }

        // Detectar preferencias de organización
        if (message.toLowerCase().includes('carpeta') ||
            message.toLowerCase().includes('folder')) {
            if (message.toLowerCase().includes('por género') ||
                message.toLowerCase().includes('by genre')) {
                detected.organization = 'folders_by_genre';
            } else if (message.toLowerCase().includes('por artista')) {
                detected.organization = 'folders_by_artist';
            }
        }

        return detected;
    }
}

export interface RouterDecision {
    action: string;
    confidence: number;
    reason: string;
    shouldIntercept: boolean; // ✅ NUEVO - Control de interceptación
    metadata?: Record<string, any>;
}

export interface MakeDecisionResponse {
    shouldRedirect: boolean;
    targetFlow?: string;
    customResponse?: string;
    persuasionElements: {
        valueProposition?: string;
        urgency?: string;
        scarcity?: string;
        socialProof?: string;
    };
    followUpActions: string[];
}

export class IntelligentRouter {
    private static instance: IntelligentRouter;
    private processingUsers = new Set<string>(); // ✅ NUEVO - Control de procesamiento
    private lastProcessedMessages = new Map<string, { message: string; timestamp: number }>(); // ✅ NUEVO - Control de duplicados

    // ✅ SINGLETON PATTERN para evitar múltiples instancias
    static getInstance(): IntelligentRouter {
        if (!IntelligentRouter.instance) {
            IntelligentRouter.instance = new IntelligentRouter();
        }
        return IntelligentRouter.instance;
    }

    private keywordMap: Record<string, { action: string; weight: number; priority: number }> = {
        // ✅ MEJORADO: Agregado sistema de prioridades
        // Palabras clave de alta prioridad (interceptan siempre)
        'comprar': { action: 'order', weight: 0.95, priority: 1 },
        'pedido': { action: 'order', weight: 0.95, priority: 1 },
        'orden': { action: 'order', weight: 0.90, priority: 1 },
        'precio': { action: 'pricing', weight: 0.90, priority: 1 },
        'costo': { action: 'pricing', weight: 0.90, priority: 1 },
        'cuanto': { action: 'pricing', weight: 0.85, priority: 1 },

        // Palabras clave de media prioridad
        'catalogo': { action: 'catalog', weight: 0.90, priority: 2 },
        'productos': { action: 'catalog', weight: 0.80, priority: 2 },
        'opciones': { action: 'catalog', weight: 0.75, priority: 2 },
        'personalizar': { action: 'customize', weight: 0.90, priority: 2 },
        'custom': { action: 'customize', weight: 0.80, priority: 2 },

        // Palabras clave específicas de contenido
        'musica': { action: 'music', weight: 0.85, priority: 2 },
        'canciones': { action: 'music', weight: 0.80, priority: 2 },
        'playlist': { action: 'music', weight: 0.80, priority: 2 },
        'bachata': { action: 'music', weight: 0.90, priority: 2 },
        'salsa': { action: 'music', weight: 0.90, priority: 2 },
        'rock': { action: 'music', weight: 0.90, priority: 2 },
        'pop': { action: 'music', weight: 0.90, priority: 2 },
        'reggaeton': { action: 'music', weight: 0.90, priority: 2 },

        'video': { action: 'videos', weight: 0.85, priority: 2 },
        'videos': { action: 'videos', weight: 0.85, priority: 2 },
        'pelicula': { action: 'movies', weight: 0.90, priority: 2 },
        'peliculas': { action: 'movies', weight: 0.90, priority: 2 },
        'serie': { action: 'movies', weight: 0.85, priority: 2 },
        'movie': { action: 'movies', weight: 0.80, priority: 2 },

        // Palabras clave de baja prioridad (solo si no hay contexto)
        'hola': { action: 'welcome', weight: 0.70, priority: 3 },
        'buenos': { action: 'welcome', weight: 0.65, priority: 3 },
        'buenas': { action: 'welcome', weight: 0.65, priority: 3 },
        'saludos': { action: 'welcome', weight: 0.70, priority: 3 },
        'inicio': { action: 'welcome', weight: 0.75, priority: 3 },

        // Palabras clave de soporte
        'asesor': { action: 'advisor', weight: 0.85, priority: 2 },
        'humano': { action: 'advisor', weight: 0.80, priority: 2 },
        'ayuda': { action: 'advisor', weight: 0.70, priority: 2 },
        'soporte': { action: 'advisor', weight: 0.80, priority: 2 },
    };

    // ✅ NUEVO: Patrones de contexto avanzados
    private contextPatterns = {
        urgentBuying: /\b(urgente|rapido|rápido|ya|ahora|hoy|inmediato)\b/i,
        priceComparison: /\b(comparar|versus|vs|diferencia|mejor|barato|caro)\b/i,
        specificQuantity: /\b(\d+)\s*(gb|gigas?|terabytes?|tb)\b/i,
        paymentMethods: /\b(pago|tarjeta|efectivo|transferencia|cuotas|financiación)\b/i,
        shipping: /\b(envío|envio|entrega|domicilio|dirección|direccion)\b/i,
        customization: /\b(personalizar|custom|diseño|disenar|grabar|nombre)\b/i,
    };

    async analyzeAndRoute(message: string, session: UserSession): Promise<RouterDecision> {
        try {
            const phoneNumber = session.phone;
            const normalizedMessage = message.toLowerCase().trim();

            // ✅ VALIDACIÓN CRÍTICA 1: Control de procesamiento
            if (this.processingUsers.has(phoneNumber)) {
                console.log(`⏸️ Usuario ${phoneNumber} ya está siendo procesado, ignorando...`);
                return {
                    action: 'continue',
                    confidence: 0,
                    reason: 'Usuario ya siendo procesado',
                    shouldIntercept: false
                };
            }

            // ✅ VALIDACIÓN CRÍTICA 2: Control de duplicados
            const lastProcessed = this.lastProcessedMessages.get(phoneNumber);
            if (lastProcessed &&
                lastProcessed.message === normalizedMessage &&
                (Date.now() - lastProcessed.timestamp) < 5000) {
                console.log(`⏸️ Mensaje duplicado detectado para ${phoneNumber}, ignorando...`);
                return {
                    action: 'continue',
                    confidence: 0,
                    reason: 'Mensaje duplicado',
                    shouldIntercept: false
                };
            }

            // ✅ VALIDACIÓN CRÍTICA 3: Control de flujo activo
            if (session.currentFlow &&
                session.currentFlow !== 'initial' &&
                session.currentFlow !== 'welcome' &&
                session.lastInteraction &&
                (Date.now() - new Date(session.lastInteraction).getTime()) < 30000) { // 30 segundos
                console.log(`🔄 Usuario en flujo activo: ${session.currentFlow}, no interceptando`);
                return {
                    action: 'continue',
                    confidence: 0,
                    reason: `Usuario en flujo activo: ${session.currentFlow}`,
                    shouldIntercept: false
                };
            }

            // Marcar como procesando
            this.processingUsers.add(phoneNumber);
            this.lastProcessedMessages.set(phoneNumber, {
                message: normalizedMessage,
                timestamp: Date.now()
            });

            // ✅ USAR HYBRID INTENT ROUTER V2
            console.log(`🧠 [Intent Router v2] Analyzing message for ${phoneNumber}`);
            const hybridResult = await hybridIntentRouter.route(message, session);
            
            console.log(`🎯 [Intent Router v2] Result:`, hybridIntentRouter.explainDecision(hybridResult));

            // Convert IntentResult to RouterDecision
            const routerDecision: RouterDecision = {
                action: hybridResult.targetFlow || hybridResult.intent,
                confidence: hybridResult.confidence,
                reason: hybridResult.reason,
                shouldIntercept: hybridResult.shouldRoute,
                metadata: {
                    ...hybridResult.metadata,
                    intentSource: hybridResult.source,
                    intent: hybridResult.intent
                }
            };

            // Limpiar marcador de procesamiento
            setTimeout(() => {
                this.processingUsers.delete(phoneNumber);
            }, 2000);

            console.log(`🧠 Router Decision para ${phoneNumber}: ${routerDecision.action} (${routerDecision.confidence}%) - ${routerDecision.reason}`);

            return routerDecision;

        } catch (error) {
            console.error('❌ Error en router inteligente:', error);

            // Limpiar estado en caso de error
            this.processingUsers.delete(session.phone);

            return {
                action: 'welcome',
                confidence: 30,
                reason: 'Fallback por error en análisis',
                shouldIntercept: false,
                metadata: { error: true }
            };
        }
    }

    private analyzeKeywords(message: string): RouterDecision {
        const words = message.split(/\s+/);
        const scores: Record<string, { score: number; priority: number }> = {};

        for (const word of words) {
            for (const [keyword, config] of Object.entries(this.keywordMap)) {
                if (word.includes(keyword) || keyword.includes(word)) {
                    if (!scores[config.action]) {
                        scores[config.action] = { score: 0, priority: config.priority };
                    }
                    scores[config.action].score += config.weight;
                }
            }
        }

        // ✅ MEJORADO: Considerar prioridad además del puntaje
        const bestAction = Object.entries(scores).reduce((best, [action, data]) => {
            const adjustedScore = data.score * (4 - data.priority); // Prioridad más alta = multiplicador mayor
            return adjustedScore > best.score ? { action, score: adjustedScore, priority: data.priority } : best;
        }, { action: 'welcome', score: 0, priority: 3 });

        return {
            action: bestAction.action,
            confidence: Math.min(bestAction.score * 100, 95),
            reason: `Análisis de palabras clave (prioridad ${bestAction.priority})`,
            shouldIntercept: bestAction.score > 0.5,
            metadata: { scores, bestAction }
        };
    }

    private analyzeContext(session: UserSession, message: string): RouterDecision {
        let confidence = 40;
        let action = 'welcome';
        let reason = 'Sin contexto específico';
        let shouldIntercept = false;

        // ✅ ANÁLISIS BASADO EN ETAPA DE SESIÓN
        if (session.stage === 'pricing' || session.stage === 'price_inquiry') {
            action = 'pricing';
            confidence = 85;
            reason = 'Usuario en etapa de precios';
            shouldIntercept = true;
        } else if (session.stage === 'customizing' || session.stage === 'customization_interest') {
            action = 'customize';
            confidence = 80;
            reason = 'Usuario personalizando producto';
            shouldIntercept = true;
        } else if (session.stage === 'purchase_intent' || session.buyingIntent > 80) {
            action = 'order';
            confidence = 85;
            reason = 'Alta intención de compra detectada';
            shouldIntercept = true;
        }

        // ✅ ANÁLISIS BASADO EN INTERESES PREVIOS
        if (session.interests && session.interests.length > 0) {
            const mainInterest = session.interests[0];
            if (mainInterest.includes('music')) {
                action = 'music';
                confidence = 70;
                reason = 'Interés previo en música';
                shouldIntercept = true;
            } else if (mainInterest.includes('video') || mainInterest.includes('movie')) {
                action = 'videos';
                confidence = 70;
                reason = 'Interés previo en videos/películas';
                shouldIntercept = true;
            }
        }

        // ✅ ANÁLISIS BASADO EN HISTORIAL DE MENSAJES
        if (session.interactions && session.interactions.length > 0) {
            const recentMessages = session.interactions.slice(-3);
            const hasOrderIntent = recentMessages.some(i =>
                i.intent?.includes('purchase') || i.intent?.includes('order')
            );

            if (hasOrderIntent) {
                action = 'order';
                confidence = 75;
                reason = 'Intención de compra en mensajes recientes';
                shouldIntercept = true;
            }
        }

        return { action, confidence, reason, shouldIntercept };
    }

    private analyzePatterns(message: string): RouterDecision {
        let confidence = 30;
        let action = 'welcome';
        let reason = 'Sin patrones específicos';
        let shouldIntercept = false;

        // ✅ PATRONES ESPECÍFICOS DE COMPORTAMIENTO
        if (this.contextPatterns.urgentBuying.test(message)) {
            action = 'order';
            confidence = 90;
            reason = 'Patrón de compra urgente detectado';
            shouldIntercept = true;
        } else if (this.contextPatterns.priceComparison.test(message)) {
            action = 'pricing';
            confidence = 85;
            reason = 'Patrón de comparación de precios';
            shouldIntercept = true;
        } else if (this.contextPatterns.specificQuantity.test(message)) {
            action = 'catalog';
            confidence = 80;
            reason = 'Especificación técnica detectada';
            shouldIntercept = true;
        } else if (this.contextPatterns.paymentMethods.test(message)) {
            action = 'order';
            confidence = 85;
            reason = 'Consulta sobre métodos de pago';
            shouldIntercept = true;
        } else if (this.contextPatterns.shipping.test(message)) {
            action = 'order';
            confidence = 80;
            reason = 'Consulta sobre envío';
            shouldIntercept = true;
        } else if (this.contextPatterns.customization.test(message)) {
            action = 'customize';
            confidence = 85;
            reason = 'Interés en personalización';
            shouldIntercept = true;
        }

        return { action, confidence, reason, shouldIntercept };
    }

    private analyzeUrgency(message: string, session: UserSession): RouterDecision {
        let urgencyScore = 0;
        let action = 'welcome';
        let shouldIntercept = false;

        // ✅ INDICADORES DE URGENCIA
        const urgencyIndicators = [
            { pattern: /\b(urgente|emergency|ya|ahora|hoy)\b/i, score: 30 },
            { pattern: /\b(rapido|rápido|quick|fast)\b/i, score: 20 },
            { pattern: /\b(inmediato|immediate|asap)\b/i, score: 25 },
            { pattern: /\b(necesito|need|require)\b/i, score: 15 },
            { pattern: /\b(cuando|when|tiempo|time)\b/i, score: 10 }
        ];

        for (const indicator of urgencyIndicators) {
            if (indicator.pattern.test(message)) {
                urgencyScore += indicator.score;
            }
        }

        // ✅ URGENCIA BASADA EN CONTEXTO DE SESIÓN
        if (session.buyingIntent > 70) urgencyScore += 20;
        if (session.stage === 'purchase_intent') urgencyScore += 25;
        if (session.interactions && session.interactions.length > 5) urgencyScore += 10;

        if (urgencyScore > 40) {
            action = 'order';
            shouldIntercept = true;
        } else if (urgencyScore > 20) {
            action = 'catalog';
            shouldIntercept = true;
        }

        return {
            action,
            confidence: Math.min(urgencyScore + 30, 95),
            reason: `Análisis de urgencia (score: ${urgencyScore})`,
            shouldIntercept,
            metadata: { urgencyScore }
        };
    }

    private async analyzeWithAI(message: string, session: UserSession): Promise<RouterDecision | null> {
        try {
            const prompt = `
Analiza este mensaje de WhatsApp y determina la mejor acción:

Mensaje: "${message}"
Usuario: ${session.name || 'Anónimo'}
Etapa actual: ${session.stage}
Intereses: ${session.interests?.join(', ') || 'Ninguno'}
Intención de compra: ${session.buyingIntent}%
Mensajes previos: ${session.messageCount || 0}

Acciones disponibles:
- welcome: Bienvenida general
- catalog: Mostrar catálogo
- customize: Personalizar USB
- pricing: Mostrar precios
- music: USBs musicales
- videos: USBs de videos
- movies: USBs de películas
- order: Procesar pedido
- advisor: Conectar con asesor humano

Responde SOLO con: ACCION|CONFIANZA|RAZON|INTERCEPTAR
Ejemplo: music|85|Usuario pregunta por géneros musicales|true
`;

            const response = await aiService.generateResponse(prompt, session);
            const parts = response.split('|');

            if (parts.length === 4) {
                return {
                    action: parts[0].trim(),
                    confidence: parseInt(parts[1]) || 50,
                    reason: parts[2].trim(),
                    shouldIntercept: parts[3].trim().toLowerCase() === 'true',
                    metadata: { source: 'ai' }
                };
            }

        } catch (error) {
            console.error('❌ Error en análisis con IA:', error);
        }

        return null;
    }

    private combineAnalysis(analyses: {
        keyword: RouterDecision;
        context: RouterDecision;
        pattern: RouterDecision;
        urgency: RouterDecision;
        ai: RouterDecision | null;
    }): RouterDecision {
        const decisions = [
            analyses.keyword,
            analyses.context,
            analyses.pattern,
            analyses.urgency
        ];

        if (analyses.ai) decisions.push(analyses.ai);

        // ✅ ALGORITMO MEJORADO DE COMBINACIÓN
        // 1. Filtrar decisiones que deben interceptar
        const interceptDecisions = decisions.filter(d => d.shouldIntercept);

        // 2. Si hay decisiones de interceptación, usar la de mayor confianza
        if (interceptDecisions.length > 0) {
            const bestIntercept = interceptDecisions.reduce((best, current) =>
                current.confidence > best.confidence ? current : best
            );

            return {
                ...bestIntercept,
                reason: `${bestIntercept.reason} (combinado con ${interceptDecisions.length} análisis)`
            };
        }

        // 3. Si no hay interceptaciones, usar la decisión con mayor confianza
        const bestDecision = decisions.reduce((best, current) =>
            current.confidence > best.confidence ? current : best
        );

        // 4. Si la confianza es muy baja, no interceptar
        if (bestDecision.confidence < 40) {
            return {
                action: 'continue',
                confidence: bestDecision.confidence,
                reason: 'Confianza insuficiente para interceptar',
                shouldIntercept: false
            };
        }

        return bestDecision;
    }

    // ✅ MÉTODO ESTÁTICO MEJORADO
    static makeDecision(
        message: string,
        session: UserSession,
        conversationHistory: string[]
    ): MakeDecisionResponse {
        const lowerMessage = message.toLowerCase();

        // ✅ DETECCIÓN MEJORADA DE INTENCIONES
        const isProductInquiry = /\b(usb|precio|costo|comprar|catálogo|producto|cuanto|vale|ofertas?|opciones)\b/i.test(message);
        const isOrderIntent = /\b(pedido|orden|quiero|necesito|compro|solicitar|confirmar|pedir|urgente)\b/i.test(message);
        const isGreeting = /\b(hola|hello|hi|buenos|buenas|saludos|inicio)\b/i.test(message);
        const isMusicInterest = /\b(música|musica|canción|cancion|playlist|género|genero|artista|bachata|salsa|rock|pop|reggaeton)\b/i.test(message);
        const isVideoInterest = /\b(video|película|pelicula|serie|film|movie|clips)\b/i.test(message);
        const isPricingFocus = /\b(precio|costo|cuanto|vale|barato|caro|descuento|promoción|oferta)\b/i.test(message);
        const isUrgent = /\b(urgente|rapido|rápido|ya|ahora|hoy|inmediato)\b/i.test(message);

        // ✅ SELECCIÓN INTELIGENTE DE UN SOLO ELEMENTO DE PERSUASIÓN
        let selectedPersuasion: {
            valueProposition?: string;
            urgency?: string;
            scarcity?: string;
            socialProof?: string;
        } = {};

        // ✅ LÓGICA DE PRIORIDAD PARA PERSUASIÓN
        if (isOrderIntent && isUrgent) {
            // Para pedidos urgentes: ESCASEZ
            selectedPersuasion.scarcity = '🔥 ATENCIÓN: Solo quedan 3 unidades de tu configuración preferida';
        } else if (isPricingFocus && isUrgent) {
            // Para consultas de precio urgentes: URGENCIA
            selectedPersuasion.urgency = '⚡ OFERTA FLASH: 30% de descuento - Solo las próximas 24 horas';
        } else if (isMusicInterest) {
            // Para interés musical: PROPUESTA DE VALOR
            selectedPersuasion.valueProposition = '🎵 USBs musicales personalizadas con tus géneros favoritos - Más de 10,000 canciones disponibles';
        } else if (isVideoInterest) {
            // Para interés en videos: PROPUESTA DE VALOR
            selectedPersuasion.valueProposition = '🎬 USBs con tus películas y series favoritas - Calidad HD y 4K disponible';
        } else if (isProductInquiry && !isGreeting) {
            // Para consultas de producto: PRUEBA SOCIAL
            selectedPersuasion.socialProof = '⭐ +1,200 clientes satisfechos - 99% de calificaciones 5 estrellas';
        } else if (isPricingFocus) {
            // Para consultas de precio: URGENCIA SUAVE
            selectedPersuasion.urgency = '⚡ Oferta especial por tiempo limitado - Solo esta semana';
        }
        // ✅ PARA SALUDOS Y OTROS: NO ENVIAR PERSUASIÓN

        // ✅ ACCIONES DE SEGUIMIENTO SIMPLIFICADAS
        let followUpActions: string[] = [];

        if (isOrderIntent && isUrgent) {
            followUpActions = ['fast_track_order', 'priority_support'];
        } else if (isProductInquiry && isPricingFocus) {
            followUpActions = ['show_personalized_options', 'create_urgency'];
        } else if (isProductInquiry) {
            followUpActions = ['show_personalized_options'];
        } else if (isOrderIntent) {
            followUpActions = ['ask_qualifying_questions'];
        } else if (isGreeting) {
            followUpActions = ['build_rapport'];
        } else if (isMusicInterest || isVideoInterest) {
            followUpActions = ['show_demos', 'highlight_benefits'];
        } else {
            followUpActions = ['gather_information'];
        }

        // ✅ LÓGICA DE REDIRECCIÓN MEJORADA
        const shouldRedirect = isProductInquiry || isOrderIntent || isMusicInterest || isVideoInterest;
        let targetFlow: string | undefined;

        if (isOrderIntent || (isProductInquiry && isPricingFocus && isUrgent)) {
            targetFlow = 'orderFlow';
        } else if (isMusicInterest) {
            targetFlow = 'musicFlow';
        } else if (isVideoInterest) {
            targetFlow = 'videosFlow';
        } else if (isProductInquiry || isPricingFocus) {
            targetFlow = 'catalogFlow';
        }

        return {
            shouldRedirect,
            targetFlow,
            customResponse: undefined,
            persuasionElements: selectedPersuasion, // ✅ SOLO UN ELEMENTO O VACÍO
            followUpActions
        };
    }

    // ✅ MÉTODO DE ANÁLISIS RÁPIDO MEJORADO
    static async quickAnalyze(message: string): Promise<string> {
        const lowerMessage = message.toLowerCase();

        // ✅ PATRONES MEJORADOS CON PRIORIDAD
        const patterns = [
            { pattern: /\b(comprar|pedido|orden|quiero|confirmar)\b/i, action: 'order', priority: 1 },
            { pattern: /\b(precio|costo|cuanto|vale|barato|caro)\b/i, action: 'pricing', priority: 1 },
            { pattern: /\b(urgente|rapido|rápido|ya|ahora)\b/i, action: 'order', priority: 1 },
            { pattern: /\b(música|musica|canción|bachata|salsa|rock|pop)\b/i, action: 'music', priority: 2 },
            { pattern: /\b(video|película|serie|movie)\b/i, action: 'videos', priority: 2 },
            { pattern: /\b(catálogo|productos|opciones|mostrar)\b/i, action: 'catalog', priority: 2 },
            { pattern: /\b(personalizar|custom|diseño)\b/i, action: 'customize', priority: 2 },
            { pattern: /\b(asesor|humano|ayuda|soporte)\b/i, action: 'advisor', priority: 2 },
            { pattern: /\b(hola|buenos|buenas|saludos)\b/i, action: 'welcome', priority: 3 }
        ];

        // Encontrar el patrón de mayor prioridad que coincida
        for (let priority = 1; priority <= 3; priority++) {
            for (const { pattern, action, priority: patternPriority } of patterns) {
                if (patternPriority === priority && pattern.test(lowerMessage)) {
                    return action;
                }
            }
        }

        return 'welcome';
    }

    // ✅ MÉTODO DE LIMPIEZA AUTOMÁTICA
    private startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();

            // Limpiar mensajes procesados antiguos (más de 5 minutos)
            for (const [phone, data] of this.lastProcessedMessages.entries()) {
                if (now - data.timestamp > 5 * 60 * 1000) {
                    this.lastProcessedMessages.delete(phone);
                }
            }

            // Limpiar usuarios en procesamiento (más de 2 minutos)
            this.processingUsers.clear();

        }, 2 * 60 * 1000); // Cada 2 minutos
    }

    constructor() {
        this.startCleanupInterval();
    }
}

// ✅ EXPORTAR INSTANCIA SINGLETON
export const intelligentRouter = IntelligentRouter.getInstance();
