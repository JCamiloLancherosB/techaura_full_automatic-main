import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { adapterDB, businessDB } from '../mysql-database';
import { join } from 'path';
import type { UserSession, AnalyticsData as GlobalAnalyticsData, Interaction as GlobalInteraction } from '../../types/global';
import { 
    calculateDemographicsSummary as calcDemographics, 
    calculatePreferencesSummary as calcPreferences 
} from './analyticsSummaryHelpers';
import { musicData } from './musicUsb';
import { videoData } from './videosUsb';
import { MessageType } from '../../types/enums';

export type SentimentType = 'positive' | 'neutral' | 'negative';

export interface Interaction extends GlobalInteraction {}

function createInteraction(
    message: string,
    type: 'user_message' | 'bot_message' | 'system_event',
    options?: {
        intent?: string;
        sentiment?: SentimentType;
        engagement_level?: number;
        channel?: string;
        respondedByBot?: boolean;
    }
): Interaction {
    return {
        timestamp: new Date(),
        message: message.trim(),
        type,
        intent: options?.intent || 'general',
        sentiment: options?.sentiment || 'neutral',
        engagement_level: options?.engagement_level || 50,
        channel: options?.channel || 'WhatsApp',
        respondedByBot: options?.respondedByBot || false,
    };
}

// Tipos y interfaces
export interface ExtendedContext {
    currentFlow: string;
    from: string;
    body: string;
    name?: string;
    pushName?: string;
    session?: UserSession;
}

interface InteractionLog {
    timestamp: Date;
    message: string;
    intent: string;
    sentiment: SentimentType;
    engagement_level: number;
    channel?: string;
    respondedByBot?: boolean;
}

interface AIAnalysis {
    buyingIntent: number;
    interests: string[];
    nextBestAction: string;
    followUpTime: Date;
    riskLevel: 'low' | 'medium' | 'high';
    engagementScore: number;
    probabilityToConvert: number;
    churnLikelihood: number;
}

// Constantes
const MAX_UNANSWERED_FOLLOWUPS = 2;
const MIN_HOURS_BETWEEN_FOLLOWUPS = 12;

type USBContentType = 'musica' | 'videos' | 'peliculas';

const musicOptions = [
    { id: 1, label: '8GB', desc: '1,400 canciones', price: 59900, emoji: '🚀' },
    { id: 2, label: '32GB', desc: '5,000 canciones', price: 89900, emoji: '🌟' },
    { id: 3, label: '64GB', desc: '10,000 canciones', price: 129900, emoji: '🔥' },
    { id: 4, label: '128GB', desc: '25,000 canciones', price: 169900, emoji: '🏆' }
];

const videoOptions = [
    { id: 1, label: '8GB', desc: '260 videos', price: 59900 },
    { id: 2, label: '32GB', desc: '1,000 videos', price: 89900 },
    { id: 3, label: '64GB', desc: '2,000 videos', price: 129900 },
    { id: 4, label: '128GB', desc: '4,000 videos', price: 169900 }
];

const movieOptions = [
    { id: 1, label: '8GB', desc: 'Hasta 10 películas o 30 episodios', price: 59900 },
    { id: 2, label: '32GB', desc: 'Hasta 30 películas o 90 episodios', price: 89900 },
    { id: 3, label: '64GB', desc: 'Hasta 70 películas o 210 episodios', price: 129900 },
    { id: 4, label: '128GB', desc: '140 películas o 420 episodios', price: 169900 }
];

const musicGenres = [
    'bachata', 'bailables', 'baladas', 'banda', 'blues', 'boleros', 'clasica', 'country',
    'cumbia', 'diciembre', 'electronica', 'funk', 'gospel', 'hiphop', 'indie', 'jazz',
    'merengue', 'metal', 'norteñas', 'punk', 'r&b', 'rancheras', 'reggaeton', 'rock',
    'salsa', 'techno', 'vallenato', 'pop', 'tropical', 'cristiana', 'trap', 'house', 'k-pop',
    'reggae', 'latino', 'romántica', 'urbano', 'alternativo', 'electropop', 'ska'
];

const PERSUASION_TECHNIQUES = {
    scarcity: [
        "⏰ Solo quedan 3 USBs con tu configuración personalizada",
        "🔥 Oferta válida solo hasta medianoche - ¡No la pierdas!",
        "📦 Últimas unidades disponibles con envío gratis"
    ],
    social_proof: [
        "🌟 +500 clientes felices este mes eligieron esta USB",
        "👥 María de Bogotá acaba de pedir la misma configuración que tú",
        "⭐ 4.9/5 estrellas - La USB más recomendada del mes"
    ],
    authority: [
        "🏆 Recomendado por expertos en audio como la mejor calidad",
        "🎵 Certificado por ingenieros de sonido profesionales",
        "📱 Tecnología avalada por +1000 DJs profesionales"
    ],
    reciprocity: [
        "🎁 Como agradecimiento, te incluyo una playlist exclusiva GRATIS",
        "💝 Por ser cliente VIP, te regalo 2GB adicionales",
        "🌟 Bonus especial: audífonos premium de cortesía"
    ]
} as const;

const trackUserMetrics = (metrics: {
    phoneNumber: string;
    stage: string;
    intent: string;
    messageType?: string;
    buyingIntent: number;
    flow: string;
    isPredetermined: boolean;
}) => {
    // Función opcional para tracking de métricas
    // Solo se ejecuta si está disponible
    try {
        console.log(`📊 [METRICS] ${metrics.phoneNumber}: Stage=${metrics.stage}, Intent=${metrics.intent}, BuyingIntent=${metrics.buyingIntent}%`);
        
        // Aquí podrías enviar a un servicio de analytics externo
        // Analytics.track('user_interaction', metrics);
    } catch (error) {
        console.warn('⚠️ Error en trackUserMetrics:', error);
    }
};

// Variables globales
export const userSessions: Map<string, UserSession> = new Map();
const followUpQueue = new Map<string, NodeJS.Timeout>();
let botInstance: any = null;

 // ✅ CACHE GLOBAL PARA CONTROL DE PROCESAMIENTO
declare global {
    var processingCache: Map<string, number>;
    var userSessions: Map<string, UserSession>;
}

// Clase de gestión de sesiones
class UserTrackingSystem {
    private sessionsFile: string;
    private dataDir: string;

    constructor() {
        this.dataDir = join(process.cwd(), 'data');
        this.sessionsFile = join(this.dataDir, 'user_sessions.json');
        this.ensureDataDirectory();
        this.loadSessions();
        this.startAutoSave();
        this.startCleanupTask();
    }

    private ensureDataDirectory() {
        try {
            if (!existsSync(this.dataDir)) {
                mkdirSync(this.dataDir, { recursive: true });
                console.log('📁 Directorio de datos creado');
            }
        } catch (error) {
            console.error('❌ Error creando directorio de datos:', error);
        }
    }

    private loadSessions() {
        try {
            if (existsSync(this.sessionsFile)) {
                const data = readFileSync(this.sessionsFile, 'utf8');
                const sessionsArray = JSON.parse(data);
                
                sessionsArray.forEach((session: any) => {
                    // Convertir fechas de string a Date
                    session.lastInteraction = new Date(session.lastInteraction);
                    session.createdAt = new Date(session.createdAt);
                    session.updatedAt = new Date(session.updatedAt);
                    
                    if (session.lastActivity) {
                        session.lastActivity = new Date(session.lastActivity);
                    }
                    
                    if (session.lastFollowUp) {
                        session.lastFollowUp = new Date(session.lastFollowUp);
                    }
                    
                    if (session.interactions) {
                        session.interactions = session.interactions.map((i: any) => ({
                            ...i,
                            timestamp: new Date(i.timestamp)
                        }));
                    }
                    
                    userSessions.set(session.phoneNumber || session.phone, session);
                });
                
                console.log(`📊 Cargadas ${userSessions.size} sesiones de usuario`);
            }
        } catch (error) {
            console.error('❌ Error cargando sesiones:', error);
        }
    }

    private saveSessions() {
        try {
            const sessionsArray = Array.from(userSessions.values());
            writeFileSync(this.sessionsFile, JSON.stringify(sessionsArray, null, 2));
        } catch (error) {
            console.error('❌ Error guardando sesiones:', error);
        }
    }

    private startAutoSave() {
        // Auto-guardar cada 30 segundos
        setInterval(() => this.saveSessions(), 30000);
    }

    private startCleanupTask() {
        // Limpiar sesiones antiguas cada hora
        setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
    }

    private cleanupOldSessions() {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 días
        let cleaned = 0;

        Array.from(userSessions.entries()).forEach(([phoneNumber, session]) => {
            if (session.lastInteraction < cutoffTime && session.stage !== 'converted') {
                userSessions.delete(phoneNumber);
                if (followUpQueue.has(phoneNumber)) {
                    clearTimeout(followUpQueue.get(phoneNumber)!);
                    followUpQueue.delete(phoneNumber);
                }
                cleaned++;
            }
        });

        if (cleaned > 0) {
            console.log(`🧹 Limpiadas ${cleaned} sesiones antiguas`);
        }
    }

    public async getUserSession(phoneNumber: string): Promise<UserSession> {
        let session = userSessions.get(phoneNumber);
        
        if (!session) {
            // Crear nueva sesión
            session = this.createDefaultUserSession(phoneNumber);
            userSessions.set(phoneNumber, session);
            console.log(`✅ Nueva sesión creada para ${phoneNumber}`);
        } else {
            // Actualizar actividad
            session.lastInteraction = new Date();
            session.lastActivity = new Date();
            session.isActive = true;
        }
        
        return session;
    }

    private createDefaultUserSession(phoneNumber: string): UserSession {
        const now = new Date();
        return {
            phone: phoneNumber,
            phoneNumber: phoneNumber,
            name: '',
            buyingIntent: 0,
            stage: 'initial',
            interests: [],
            conversationData: {},
            currentFlow: 'initial',
            currentStep: 'welcome',
            createdAt: now,
            updatedAt: now,
            lastInteraction: now,
            lastActivity: now,
            interactions: [],
            isFirstMessage: true,
            isPredetermined: false,
            skipWelcome: false,
            tags: [],
            messageCount: 0,
            isActive: true,
            isNewUser: true,
            isReturningUser: false,
            followUpSpamCount: 0,
            totalOrders: 0,
            demographics: {},
            preferences: {},
            customization: {
                step: 0,
                preferences: {},
                totalPrice: 0,
            }
        };
    }
}

// Instancia única del sistema
const trackingSystem = new UserTrackingSystem();

export function validateSentiment(sentiment: any): SentimentType {
    if (typeof sentiment === 'string') {
        const normalizedSentiment = sentiment.toLowerCase().trim();
        if (normalizedSentiment === 'positive' || normalizedSentiment === 'positivo') {
            return 'positive';
        }
        if (normalizedSentiment === 'negative' || normalizedSentiment === 'negativo') {
            return 'negative';
        }
        if (normalizedSentiment === 'neutral') {
            return 'neutral';
        }
    }
    
    // Si no es un valor válido, retorna neutral por defecto
    return 'neutral';
}

function createSafeInteraction(
    message: string,
    type: 'user_message' | 'bot_message' | 'system_event',
    analysis?: {
        intent?: string;
        sentiment?: any;
        engagement?: number;
    },
    channel?: string
): Interaction {
    return {
        message,
        timestamp: new Date(),
        type,
        intent: analysis?.intent || 'general',
        sentiment: analysis?.sentiment ? validateSentiment(analysis.sentiment) : 'neutral',
        engagement_level: analysis?.engagement || 50,
        channel: channel || 'WhatsApp',
        respondedByBot: false
    };
}

// Clase de IA Simple
class SimpleAI {
    static analyzeMessage(message: string, currentFlow: string): { 
        intent: string; 
        sentiment: SentimentType; 
        engagement: number 
    } {
        const msg = message.toLowerCase();
        let intent = 'unknown';

        // Análisis de intención
        if (currentFlow.includes('music') && musicGenres.some(genre => msg.includes(genre))) {
            intent = 'music_customization';
        } else if (msg.includes('precio') || msg.includes('costo') || msg.includes('valor') || msg.includes('cuesta')) {
            intent = 'pricing';
        } else if (msg.includes('ok') || msg.includes('continuar') || msg.includes('siguiente') || msg.includes('perfecto')) {
            intent = 'continue';
        } else if (msg.includes('comprar') || msg.includes('quiero') || msg.includes('me interesa') || msg.includes('ordenar')) {
            intent = 'buying';
        } else if (msg.includes('no me interesa') || msg.includes('no quiero') || msg.includes('cancelar') || msg.includes('no gracias')) {
            intent = 'rejection';
        } else if (msg.includes('personalizado') || msg.includes('cambiar') || msg.includes('agregar')) {
            intent = 'customization';
        } else if (msg.includes('sí') || msg.includes('si') || msg.includes('genial') || msg.includes('excelente') || msg.includes('perfecto')) {
            intent = 'positive_response';
        }

        // Análisis de sentimiento con tipo literal
        let sentiment: SentimentType = 'neutral';
        const positiveWords = ['genial', 'perfecto', 'excelente', 'me gusta', 'interesante', 'bueno', 'sí', 'si', 'ok', 'continuar', 'gracias', 'super', 'increíble'];
        const negativeWords = ['no me interesa', 'no quiero', 'caro', 'cancelar', 'después', 'luego', 'aburrido', 'demorado', 'malo'];
        
        if (positiveWords.some(word => msg.includes(word))) {
            sentiment = 'positive';
        } else if (negativeWords.some(word => msg.includes(word))) {
            sentiment = 'negative';
        }

        // Cálculo de engagement
        let engagement = 5;
        if (sentiment === 'positive') engagement += 3;
        if (sentiment === 'negative') engagement -= 2;
        if (msg.length > 50) engagement += 1;
        if (intent === 'buying') engagement += 3;
        if (intent === 'music_customization') engagement += 2;
        if (intent === 'continue') engagement += 1;

        return { 
            intent, 
            sentiment, 
            engagement: Math.max(1, Math.min(10, engagement)) 
        };
    }

    static analyzeBuyingIntent(session: UserSession): number {
        let score = 0;
        const recentInteractions = session.interactions?.slice(-5) || [];
        
        recentInteractions.forEach(interaction => {
            if (interaction.intent === 'buying') score += 25;
            if (interaction.intent === 'pricing') score += 15;
            if (interaction.intent === 'music_customization') score += 12;
            if (interaction.intent === 'customization') score += 10;
            if (interaction.intent === 'continue') score += 8;
            if (interaction.intent === 'positive_response') score += 5;
            if (interaction.sentiment === 'positive') score += 5;
            if (interaction.sentiment === 'negative') score -= 10;
            score += interaction.engagement_level || 0;
        });

        if (session.tags?.includes('VIP')) score += 10;
        if (session.isVIP) score += 10;
        if (session.tags?.includes('blacklist')) score = 0;

        return Math.max(0, Math.min(100, score));
    }

    static getNextBestAction(session: UserSession): string {
        const buyingIntent = this.analyzeBuyingIntent(session);
        const timeSinceLastInteraction = Date.now() - session.lastInteraction.getTime();
        const hoursSinceLastInteraction = timeSinceLastInteraction / (1000 * 60 * 60);

        if (buyingIntent > 70) return 'send_pricing_offer';
        if (buyingIntent > 50) return 'send_demo_samples';
        if (hoursSinceLastInteraction > 24 && (session.stage === 'interested' || session.stage === 'customizing')) return 'follow_up_interested';
        if (hoursSinceLastInteraction > 72 && session.stage === 'customizing') return 'follow_up_urgent';
        if (session.interactions?.slice(-1)[0]?.sentiment === 'negative') return 'send_special_offer';
        if (session.tags?.includes('blacklist')) return 'do_not_contact';

        return 'monitor';
    }

    static engagementScore(session: UserSession): number {
        const engagementLevels = session.interactions?.map(i => i.engagement_level || 0) || [];
        if (!engagementLevels.length) return 0;
        return Math.round(engagementLevels.reduce((a, b) => a + b, 0) / engagementLevels.length * 10);
    }

    static probabilityToConvert(session: UserSession): number {
        return Math.round((this.analyzeBuyingIntent(session) + this.engagementScore(session)) / 2);
    }

    static churnLikelihood(session: UserSession): number {
        let risk = 0;
        const last = session.interactions?.slice(-1)[0];
        const mins = (Date.now() - session.lastInteraction.getTime()) / (1000 * 60);

        if (mins > 240) risk += 30;
        if (mins > 1440) risk += 50;
        if (last?.sentiment === 'negative') risk += 30;
        if (session.stage === 'abandoned') risk += 30;

        return Math.min(100, risk);
    }
}

// Funciones utilitarias
function asUSBContentType(input: string): USBContentType {
    if (input === 'musica' || input === 'videos' || input === 'peliculas') return input;
    return 'musica'; // Valor por defecto
}

function generateUSBSelectionMessage(contentType: USBContentType): string {
    if (contentType === 'musica') {
        return `🎵 ¡Selecciona la cantidad de canciones y lleva tu música favorita a todas partes! 🎶

${musicOptions.map(opt => `${opt.id}. ${opt.emoji} ${opt.label} - ¡${opt.desc} por solo $${opt.price.toLocaleString('es-CO')}!`).join('\n')}
            
👉 Escribe el número de tu elección y comienza a disfrutar!`;
    }
    if (contentType === 'videos') {
        return `🎬 Selecciona la cantidad de vídeos en USB que deseas:

${videoOptions.map(opt => `${opt.id}. ${opt.label} - ${opt.desc} - $${opt.price.toLocaleString('es-CO')}`).join('\n')}
Escribe el número de tu elección:`;
    }
    return `🍿 Selecciona cualquier película o serie, o solicita todo variado:

${movieOptions.map(opt => `${opt.id}. USB ${opt.label}: ${opt.desc}. 👉 Oferta exclusiva: $${opt.price.toLocaleString('es-CO')}`).join('\n')}
*En la opción 4 (128GB), disfruta de un 30% de descuento en la segunda USB.*`;
}

function getUSBPriceDesc(contentType: USBContentType, optionId: number) {
    if (contentType === 'musica') return musicOptions.find(opt => opt.id === optionId);
    if (contentType === 'videos') return videoOptions.find(opt => opt.id === optionId);
    return movieOptions.find(opt => opt.id === optionId);
}

function detectSessionStage(session: UserSession, analysis: { intent: string, sentiment: SentimentType }, message: string): string {
    const msg = message.toLowerCase();

    // Cierre, pago, datos personales
    if (/finalizar pedido|confirmar compra|método de pago|transferencia|pago|nombre completo|dirección|celular|envío a|pagar|factura|comprobante|recibo|domicilio/.test(msg)) {
        return 'closing';
    }
    
    // Compra o alto interés
    if (/(quiero|deseo|voy a|me interesa|comprar|listo para|confirmo|realizar pedido|adquirir|pido|hazme el pedido)/.test(msg) ||
        analysis.intent === 'buying') {
        return 'interested';
    }
    
    // Consultas de precio u objeciones de costo
    if (/(cuánto|cuanto|precio|costo|valor|cuánto vale|descuento|promoción|oferta|pago|formas de pago|precio final)/.test(msg) ||
        analysis.intent === 'pricing') {
        return 'pricing';
    }
    
    // Personalización, demos, géneros, playlist
    if (/(demo|ejemplo|muestra|quiero escuchar|quiero ver|playlist|personalizada|géneros a incluir|puedes agregar|puedes quitar)/.test(msg) ||
        analysis.intent === 'customization' || analysis.intent === 'music_customization') {
        return 'customizing';
    }
    
    // Respuestas positivas sin cerrar
    if (/(sí|si|me gusta|genial|excelente|ok|perfecto|dale|continúa|avísame|dime más|interesante)/.test(msg) ||
        analysis.intent === 'positive_response') {
        if (session.stage === 'customizing' || session.stage === 'pricing') return session.stage;
        return 'interested';
    }
    
    // Objeción/abandono
    if (/(no quiero|no me interesa|muy caro|más adelante|luego|después|no gracias|tal vez|no por ahora|cancelar)/.test(msg) ||
        analysis.intent === 'rejection' || 
        analysis.sentiment === 'negative') {
        return 'abandoned';
    }
    
    // Inactividad prolongada
    if (session.lastInteraction && (Date.now() - session.lastInteraction.getTime() > 2 * 24 * 60 * 60 * 1000)) {
        return 'inactive';
    }
    
    return session.stage || 'initial';
}

// Funciones principales exportadas
export const getUserSession = async (phoneNumber: string): Promise<UserSession> => {
    return await trackingSystem.getUserSession(phoneNumber);
};

interface SessionOptions {
    messageType?: string;
    confidence?: number;
    isPredetermined?: boolean;
    routerDecision?: {
        targetFlow: string;
        shouldRedirect: boolean;
    };
    metadata?: Record<string, any>;
    step?: string; // Añadir si es necesario
}


export const updateUserSession = async (
    phoneNumber: string,
    message: string,
    currentFlow: string,
    step?: string | null,
    isProcessing: boolean = false,
    options?: {
        messageType?: string;
        confidence?: number;
        isPredetermined?: boolean;
        routerDecision?: {
            targetFlow: string;
            shouldRedirect: boolean;
        };
        metadata?: Record<string, any>;
    },
    pushName?: string,
    p0?: {
        isPredetermined: boolean;
        messageType: string;
        confidence: number;
        metadata: {
            detectionType: string;
            originalMessage: string;
        };
    }
): Promise<void> => {
    try {
        // ✅ VALIDACIONES INICIALES
        const validatedPhone = validatePhoneNumber(phoneNumber);
        if (!validatedPhone) {
            console.error('❌ Número de teléfono inválido:', phoneNumber);
            return;
        }

        const validFlows = ['welcome', 'datosCliente', 'orderFlow', 'musicUsb', 'videoUsb', 'moviesUsb', 'customizationStarted', 'musicPreferences', 'designPreferences', 'technicalSpecs', 'accessoriesSelected'];
        if (!validFlows.includes(currentFlow)) {
            console.log(currentFlow)
            console.error('Flujo no válido:', currentFlow);
            return;
        }

        const sanitizedMessage = sanitizeMessage(message);
if (!sanitizedMessage && !options?.isPredetermined) {
    console.warn('⚠️ Mensaje vacío para:', phoneNumber);
    return; // Detener la ejecución
}

        // ✅ OBTENER O CREAR SESIÓN
        const session = await getUserSession(validatedPhone);
        const now = new Date();
        const previousFlow = session.currentFlow;

        if (!session || typeof session !== 'object') {
            throw new Error('Sesión inválida');
        }

        // ✅ ACTUALIZAR INFORMACIÓN BÁSICA DE SESIÓN
        session.lastInteraction = now;
        session.lastActivity = now;
        session.updatedAt = now;
        session.messageCount = (session.messageCount || 0) + 1;
        session.currentFlow = currentFlow; // Mantener el flujo actual
        session.isActive = true;

        // ✅ ANÁLISIS INTELIGENTE CON VALIDACIONES
        let analysis: { intent: string, sentiment: SentimentType, engagement: number };
        try {
            analysis = await performIntelligentAnalysis(sanitizedMessage, currentFlow, session);
        } catch (analysisError) {
            console.warn('⚠️ Error en análisis inteligente:', analysisError);
            analysis = {
                intent: extractBasicIntent(sanitizedMessage),
                sentiment: analyzeBasicSentiment(sanitizedMessage),
                engagement: calculateBasicEngagement(sanitizedMessage, session)
            };
        }

        // ✅ PROCESAR OPCIONES ADICIONALES DE FORMA SEGURA
        if (options) {
            if (options.routerDecision && typeof options.routerDecision === 'object') {
                if (!session.conversationData) {
                    session.conversationData = {};
                }
                session.conversationData.routerDecision = {
                    targetFlow: options.routerDecision.targetFlow,
                    shouldRedirect: options.routerDecision.shouldRedirect,
                    timestamp: now.toISOString()
                };
            }

            if (options.metadata && typeof options.metadata === 'object') {
                if (!session.conversationData) {
                    session.conversationData = {};
                }
                session.conversationData.metadata = {
                    ...session.conversationData.metadata,
                    ...options.metadata,
                    lastUpdate: now.toISOString()
                };
            }
        }

        // ✅ INICIALIZACIÓN SEGURA DE ARRAYS Y OBJETOS
        if (!Array.isArray(session.interactions)) {
            session.interactions = [];
        }
        if (!Array.isArray(session.interests)) {
            session.interests = [];
        }
        if (!session.conversationData || typeof session.conversationData !== 'object') {
            session.conversationData = {};
        }

        // ✅ REGISTRO DE INTERACCIÓN CON VALIDACIÓN COMPLETA
        if (sanitizedMessage && sanitizedMessage.trim().length > 0) {
            const newInteraction: Interaction = {
                timestamp: now,
                message: sanitizedMessage.substring(0, 500),
                type: 'user_message',
                intent: analysis.intent,
                sentiment: analysis.sentiment,
                engagement_level: analysis.engagement,
                channel: 'WhatsApp',
                respondedByBot: true,
                metadata: {
                    flow: currentFlow,
                    messageType: options?.messageType,
                    confidence: options?.confidence,
                    isPredetermined: options?.isPredetermined || false,
                    previousFlow: previousFlow,
                    sessionStage: session.stage,
                    messageLength: sanitizedMessage.length,
                    processingTime: Date.now() - now.getTime()
                }
            };

            session.interactions.push(newInteraction);

            if (session.interactions.length > 50) {
                session.interactions = session.interactions.slice(-50);
            }
        }

        // ✅ INICIALIZACIÓN SEGURA DE CUSTOMIZATION
        if (!session.customization || typeof session.customization !== 'object') {
            session.customization = {
                step: 0,
                preferences: {},
                totalPrice: 0,
                startedAt: now,
                selectedType: (options?.messageType as any) || null,
                confidence: options?.confidence || 0,
                lastUpdate: new Date().toISOString()
            };
        } else {
            const customizationExtended = session.customization as any;
            if (options?.messageType && !customizationExtended.selectedType) {
                customizationExtended.selectedType = options.messageType;
            }
            if (options?.confidence && !customizationExtended.confidence) {
                customizationExtended.confidence = options.confidence;
            }
            customizationExtended.lastUpdate = now.toISOString();
        }

        // ✅ ACTUALIZAR ETAPA DE PERSONALIZACIÓN
        const flowStepMap: Record<string, number> = {
            'welcome_flow': 0,
            'customization_started': 1,
            'music_flow': 2,
            'video_flow': 2,
            'movies_flow': 2,
            'music_preferences': 3,
            'design_preferences': 4,
            'technical_specs': 5,
            'accessories_selected': 6,
            'order_flow': 7,
            'payment_flow': 8,
            'confirmed': 9
        };

        if (currentFlow in flowStepMap && session.customization) {
            session.customization.step = flowStepMap[currentFlow];
            const customizationExtended = session.customization as any;
            if (currentFlow === 'music_flow') customizationExtended.selectedType = 'music';
            if (currentFlow === 'video_flow') customizationExtended.selectedType = 'videos';
            if (currentFlow === 'movies_flow') customizationExtended.selectedType = 'movies';
        }

        // ✅ ACTUALIZAR INTERESES BASADOS EN INTENT Y OPCIONES
        const intentInterestMap: Record<string, string> = {
            'music': 'music',
            'video': 'videos',
            'movie': 'movies',
            'customization': 'customization',
            'purchase': 'purchase',
            'pricing': 'pricing',
            'technical': 'technical_specs'
        };

        for (const [intentKey, interest] of Object.entries(intentInterestMap)) {
            if (analysis.intent.includes(intentKey) && !session.interests.includes(interest)) {
                session.interests.push(interest);
            }
        }

        // ✅ DETECCIÓN Y ACTUALIZACIÓN DE ETAPA
        const prevStage = session.stage || 'initial';
        let newStage = prevStage;

        try {
            newStage = await detectAdvancedStage(session, analysis, sanitizedMessage, options);
        } catch (stageError) {
            console.warn('⚠️ Error detectando etapa:', stageError);
            newStage = detectBasicStage(sanitizedMessage, session, analysis);
        }

        if (prevStage !== newStage) {
            console.log(`[STAGE] ${session.phone}: "${prevStage}" → "${newStage}"`);

            if (!session.conversationData.stageHistory) {
                session.conversationData.stageHistory = [];
            }
            session.conversationData.stageHistory.push({
                from: prevStage,
                to: newStage,
                timestamp: now.toISOString(),
                trigger: sanitizedMessage.substring(0, 100)
            });
        }
        session.stage = newStage;

        // ✅ ANÁLISIS AI COMPLETO CON VALIDACIONES
        try {
            const aiAnalysis = await performAdvancedAIAnalysis(session, options);
            if (aiAnalysis) {
                session.aiAnalysis = aiAnalysis;
                session.buyingIntent = aiAnalysis.buyingIntent;

                if (!session.conversationData.aiInsights) {
                    session.conversationData.aiInsights = [];
                }
                session.conversationData.aiInsights.push({
                    timestamp: now.toISOString(),
                    buyingIntent: aiAnalysis.buyingIntent,
                    confidence: options?.confidence || 0,
                    messageType: options?.messageType,
                    insights: aiAnalysis.insights || []
                });

                if (session.conversationData.aiInsights.length > 10) {
                    session.conversationData.aiInsights = session.conversationData.aiInsights.slice(-10);
                }
            }
        } catch (aiError) {
            console.warn('⚠️ Error en análisis AI:', aiError);
            session.buyingIntent = calculateBasicBuyingIntent(session, analysis);
        }

        // ✅ PERSISTIR SESIÓN CON VALIDACIÓN MEJORADA
        try {
            if (!global.userSessions) {
                global.userSessions = new Map();
            }
            global.userSessions.set(validatedPhone, session);

            if (typeof businessDB?.updateUserSession === 'function') {
                await businessDB.updateUserSession(validatedPhone, session);
            }
        } catch (persistError) {
            console.error('❌ Error persistiendo sesión:', persistError);
        }

        // ✅ PROGRAMAR SEGUIMIENTO CON VALIDACIONES
        try {
            if (typeof scheduleFollowUp === 'function' &&
                session.stage !== 'converted' &&
                session.stage !== 'order_confirmed' &&
                !session.tags?.includes('blacklist') &&
                session.buyingIntent > 30) {

                scheduleFollowUp(validatedPhone);
            }
        } catch (followUpError) {
            console.warn('⚠️ Error programando seguimiento:', followUpError);
        }

        // ✅ LOG DETALLADO
        console.log(`📊 [${validatedPhone}] Intent=${analysis.intent} | Sentiment=${analysis.sentiment} | Stage=${session.stage} | BuyingIntent=${session.buyingIntent}% | Type=${options?.messageType || 'N/A'} | Confidence=${options?.confidence || 0}`);

        // ✅ MÉTRICAS Y ANALYTICS
        try {
            if (typeof trackUserMetrics === 'function') {
                trackUserMetrics({
                    phoneNumber: validatedPhone,
                    stage: session.stage,
                    intent: analysis.intent,
                    messageType: options?.messageType,
                    buyingIntent: session.buyingIntent,
                    flow: currentFlow,
                    isPredetermined: options?.isPredetermined || false
                });
            }
        } catch (metricsError) {
            console.warn('⚠️ Error en métricas:', metricsError);
        }

        // ✅ ACTUALIZAR SESIÓN EN MEMORIA
        userSessions.set(validatedPhone, session);

        console.log(`📊 [${validatedPhone}] Intent=${analysis.intent} | Sentiment=${analysis.sentiment} | Stage=${session.stage}`);

    } catch (error) {
        console.error(`❌ Error crítico en updateUserSession para ${phoneNumber}:`, error);
        throw error;
    }
};




// ✅ CORRECCIÓN 4: Agregar funciones auxiliares que faltaban

// Función auxiliar para calcular demografías
// function calcDemographics(sessions: UserSession[]): any {
//     return calculateDemographicsSummary(sessions);
// }

// // Función auxiliar para calcular preferencias  
// function calcPreferences(sessions: UserSession[]): any {
//     return calculatePreferencesSummary(sessions);
// }

// ✅ FUNCIONES AUXILIARES NUEVAS Y MEJORADAS

async function performIntelligentAnalysis(
    message: string, 
    currentFlow: string, 
    session: UserSession
): Promise<{intent: string, sentiment: SentimentType, engagement: number}> {
    try {
        // Análisis básico mejorado
        const intent = extractAdvancedIntent(message, currentFlow);
        const sentiment = analyzeAdvancedSentiment(message);
        const engagement = calculateAdvancedEngagement(message, session);
        
        return { intent, sentiment, engagement };
    } catch (error) {
        return {
            intent: extractBasicIntent(message),
            sentiment: 'neutral',
            engagement: 50
        };
    }
}

function extractAdvancedIntent(message: string, currentFlow: string): string {
    const cleanMessage = message.toLowerCase().trim();
    
    // Intents específicos por flujo
    const flowIntents: Record<string, string[]> = {
        'music_flow': ['music', 'song', 'playlist', 'genre'],
        'video_flow': ['video', 'clip', 'documentary', 'tutorial'],
        'movies_flow': ['movie', 'film', 'series', 'show'],
        'order_flow': ['buy', 'purchase', 'order', 'price']
    };
    
    if (flowIntents[currentFlow]) {
        for (const keyword of flowIntents[currentFlow]) {
            if (cleanMessage.includes(keyword)) {
                return keyword;
            }
        }
    }
    
    return extractBasicIntent(message);
}

function analyzeAdvancedSentiment(message: string): SentimentType {
    const positiveWords = ['excelente', 'perfecto', 'genial', 'increíble', 'me gusta', 'interesante'];
    const negativeWords = ['no', 'mal', 'terrible', 'horrible', 'no me gusta'];
    
    const cleanMessage = message.toLowerCase();
    const positiveCount = positiveWords.filter(word => cleanMessage.includes(word)).length;
    const negativeCount = negativeWords.filter(word => cleanMessage.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
}

function calculateAdvancedEngagement(message: string, session: UserSession): number {
    let engagement = 50; // Base
    
    // Longitud del mensaje
    if (message.length > 50) engagement += 10;
    if (message.length > 100) engagement += 10;
    
    // Preguntas
    if (message.includes('?')) engagement += 15;
    
    // Emojis
    const emojiCount = (message.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
    engagement += Math.min(emojiCount * 5, 20);
    
    // Historial de interacciones
    if (session.interactions && session.interactions.length > 3) {
        engagement += 10;
    }
    
    return Math.min(Math.max(engagement, 0), 100);
}

async function detectAdvancedStage(
    session: UserSession, 
    analysis: any, 
    message: string, 
    options?: any
): Promise<string> {
    // Lógica avanzada de detección de etapa
    if (options?.isPredetermined) {
        return `interested_${options.messageType}`;
    }
    
    if (analysis.intent.includes('buy') || analysis.intent.includes('purchase')) {
        return 'ready_to_buy';
    }
    
    if (analysis.intent.includes('price') || analysis.intent.includes('cost')) {
        return 'price_inquiry';
    }
    
    return detectBasicStage(message, session, analysis);
}

async function performAdvancedAIAnalysis(session: UserSession, options?: any): Promise<any> {
    // Análisis AI avanzado con nuevos datos
    const buyingIntent = calculateAdvancedBuyingIntent(session, options);
    
    return {
        buyingIntent,
        insights: [
            `Usuario ${options?.isPredetermined ? 'llegó con mensaje predeterminado' : 'escribió mensaje libre'}`,
            `Confianza de detección: ${options?.confidence || 0}`,
            `Tipo de interés: ${options?.messageType || 'general'}`
        ]
    };
}

function calculateAdvancedBuyingIntent(session: UserSession, options?: any): number {
    let intent = session.buyingIntent || 50;
    
    // Bonus por mensaje predeterminado
    if (options?.isPredetermined) intent += 20;
    
    // Bonus por alta confianza
    if (options?.confidence && options.confidence > 0.8) intent += 15;
    
    // Bonus por tipo específico
    if (options?.messageType && ['music', 'videos', 'movies'].includes(options.messageType)) {
        intent += 10;
    }
    
    return Math.min(Math.max(intent, 0), 100);
}

// ✅ FUNCIONES AUXILIARES BÁSICAS CORREGIDAS

function extractBasicIntent(message: string): string {
    if (!message || typeof message !== 'string') return 'general';
    
    const msg = message.toLowerCase().trim();
    
    if (msg.includes('precio') || msg.includes('costo') || msg.includes('vale') || msg.includes('cuánto')) {
        return 'pricing_inquiry';
    }
    if (msg.includes('comprar') || msg.includes('pedido') || msg.includes('orden') || msg.includes('quiero')) {
        return 'purchase_intent';
    }
    if (msg.includes('personalizar') || msg.includes('customizar') || msg.includes('diseñar')) {
        return 'customization_interest';
    }
    if (msg.includes('catálogo') || msg.includes('productos') || msg.includes('opciones') || msg.includes('mostrar')) {
        return 'product_inquiry';
    }
    if (msg.includes('gracias') || msg.includes('perfecto') || msg.includes('excelente') || msg.includes('genial')) {
        return 'positive_feedback';
    }
    if (msg.includes('no') || msg.includes('cancelar') || msg.includes('después') || msg.includes('luego')) {
        return 'negative_response';
    }
    if (/^[1-4]$/.test(msg)) {
        return 'option_selection';
    }
    
    return 'general_inquiry';
}

function analyzeBasicSentiment(message: string): SentimentType {
    if (!message || typeof message !== 'string') return 'neutral';
    
    const msg = message.toLowerCase().trim();
    
    // Palabras y frases positivas
    const positivePatterns = [
        /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
        /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
        /\b(amor|amo|encanta|fascina|ideal|justo|necesito)\b/
    ];

    // Palabras y frases negativas
    const negativePatterns = [
        /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego)\b/,
        /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
        /\b(aburrido|feo|horrible|odio|detesto|molesta)\b/
    ];

    // Verifica patrones positivos
    for (const pattern of positivePatterns) {
        if (pattern.test(msg)) return 'positive';
    }

    // Verifica patrones negativos
    for (const pattern of negativePatterns) {
        if (pattern.test(msg)) return 'negative';
    }

    // Si no encuentra patrones claros, retorna neutral
    return 'neutral';
}

const calculateBasicEngagement = (message: string, session: UserSession): number => {
    let engagement = 50;
    
    // ✅ Factores que aumentan engagement
    if (message.length > 20) engagement += 10;
    if (message.includes('?')) engagement += 5;
    if (session.messageCount > 3) engagement += 10;
    if (session.interests && session.interests.length > 0) engagement += 15;
    
    return Math.min(Math.max(engagement, 0), 100);
};

const detectBasicStage = (message: string, session: UserSession, analysis: any): string => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('comprar') || lowerMessage.includes('pedido')) return 'purchase_intent';
    if (/^[1-4]$/.test(message.trim())) return 'option_selected';
    if (lowerMessage.includes('precio') || lowerMessage.includes('costo')) return 'price_inquiry';
    if (lowerMessage.includes('personalizar')) return 'customization_interest';
    if (lowerMessage.includes('catálogo')) return 'browsing';
    if (analysis.sentiment === 'positive' && session.stage === 'price_inquiry') return 'interested';
    
    return session.stage || 'initial';
};

const calculateBasicBuyingIntent = (session: UserSession, analysis: any): number => {
    let intent = session.buyingIntent || 50;
    
    // ✅ Factores que aumentan buying intent
    if (session.stage === 'purchase_intent') intent += 20;
    if (session.stage === 'price_inquiry') intent += 15;
    if (session.stage === 'customization_interest') intent += 10;
    if (analysis.sentiment === 'positive') intent += 5;
    if (session.messageCount > 5) intent += 10;
    if (session.interactions && session.interactions.length > 3) intent += 5;
    
    return Math.min(Math.max(intent, 0), 100);
};

const performAIAnalysis = async (session: UserSession): Promise<any | null> => {
    try {
        const aiAnalysis: any = {
            buyingIntent: session.buyingIntent || 50,
            interests: session.interests || [],
            nextBestAction: 'show_catalog',
            followUpTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
            riskLevel: 'low',
            engagementScore: 50,
            probabilityToConvert: 50,
            churnLikelihood: 20
        };

        // ✅ ANÁLISIS SEGURO DE BUYING INTENT
        if (typeof SimpleAI.analyzeBuyingIntent === 'function') {
            const buyingIntent = SimpleAI.analyzeBuyingIntent(session);
            if (typeof buyingIntent === 'number' && buyingIntent >= 0 && buyingIntent <= 100) {
                aiAnalysis.buyingIntent = Math.round(buyingIntent);
            }
        }

        // ✅ ANÁLISIS SEGURO DE NEXT BEST ACTION
        if (typeof SimpleAI.getNextBestAction === 'function') {
            const nextAction = SimpleAI.getNextBestAction(session);
            if (typeof nextAction === 'string' && nextAction.trim().length > 0) {
                aiAnalysis.nextBestAction = nextAction;
            }
        }

        // ✅ ANÁLISIS SEGURO DE ENGAGEMENT
        if (typeof SimpleAI.engagementScore === 'function') {
            const engagement = SimpleAI.engagementScore(session);
            if (typeof engagement === 'number' && engagement >= 0 && engagement <= 100) {
                aiAnalysis.engagementScore = Math.round(engagement);
            }
        }

        return aiAnalysis;
        
    } catch (aiError) {
        console.warn('⚠️ Error en análisis AI completo:', aiError);
        return null;
    }
};

// Funciones de seguimiento
const getFollowUpDelay = (session: UserSession): number => {
    const baseDelay = 2 * 60 * 60 * 1000; // 2 horas
    
    if (session.aiAnalysis?.buyingIntent && session.aiAnalysis.buyingIntent > 70) {
        return 30 * 60 * 1000; // 30 minutos
    }
    if (session.stage === 'interested') {
        return 60 * 60 * 1000; // 1 hora
    }
    if (session.aiAnalysis?.riskLevel === 'high') {
        return 4 * 60 * 60 * 1000; // 4 horas
    }
    
    return baseDelay;
};

const scheduleFollowUp = (phoneNumber: string): void => {
    if (followUpQueue.has(phoneNumber)) {
        clearTimeout(followUpQueue.get(phoneNumber)!);
    }
    
    const session = userSessions.get(phoneNumber);
    if (!session) return;
    if (session.stage === 'converted' || session.tags?.includes('blacklist')) return;
    if ((session.followUpSpamCount ?? 0) >= MAX_UNANSWERED_FOLLOWUPS) {
        console.warn(`[ANTISPAM] No se programan más seguimientos para ${phoneNumber}: límite alcanzado (${session.followUpSpamCount})`);
        return;
    }

    const followUpDelay = getFollowUpDelay(session);
    // Remove lastFollowUpScheduledFrom since it doesn't exist in UserSession type
    // We'll use lastInteraction time instead
    userSessions.set(phoneNumber, session);

    const timeoutId = setTimeout(() => {
        const currentSession = userSessions.get(phoneNumber);
        if (!currentSession) return;

        // Check if user interacted recently (within last 5 minutes) instead of using lastFollowUpScheduledFrom
        const minutesSinceLastInteraction = (Date.now() - currentSession.lastInteraction.getTime()) / (1000 * 60);
        if (minutesSinceLastInteraction < 5) {
            console.log(`[FOLLOWUP] Usuario ${phoneNumber} interactuó recientemente: NO se envía seguimiento.`);
            return;
        }
        
        sendFollowUpMessage(phoneNumber);
    }, followUpDelay);
    
    followUpQueue.set(phoneNumber, timeoutId);
    console.log(`[FOLLOWUP] Programado seguimiento para ${phoneNumber} en ${Math.round(followUpDelay / 60000)} minutos.`);
};

export const canReceiveFollowUp = async (phoneNumber: string, session: UserSession): Promise<boolean> => {
    if (session.tags?.includes('blacklist')) {
        console.log(`❌ Usuario ${phoneNumber} en blacklist - No enviar seguimiento`);
        return false;
    }

    if (session.stage === 'converted') {
        console.log(`✅ Usuario ${phoneNumber} ya convertido - No enviar seguimiento`);
        return false;
    }

    if ((session.followUpSpamCount ?? 0) >= MAX_UNANSWERED_FOLLOWUPS) {
        console.log(`🚫 Usuario ${phoneNumber} alcanzó límite de seguimientos - No enviar`);
        return false;
    }

    const now = new Date();
    const minutesSinceLastInteraction = (now.getTime() - session.lastInteraction.getTime()) / (1000 * 60);
    
    if (minutesSinceLastInteraction < 10) {
        console.log(`⚡ Usuario ${phoneNumber} activo recientemente - Postponer seguimiento`);
        return false;
    }

    const hour = now.getHours();
    if (hour < 8 || hour > 22) {
        console.log(`🌙 Horario inapropiado para ${phoneNumber} - Postponer seguimiento`);
        return false;
    }

    return true;
};

export const getUrgencyMessage = (urgencyLevel: 'high' | 'medium' | 'low', buyingIntent: number): string => {
    if (urgencyLevel === 'high' && buyingIntent > 70) {
        return "🚨 ÚLTIMA OPORTUNIDAD: Tu descuento del 30% expira en 2 horas. ¿Confirmas ahora?";
    } else if (urgencyLevel === 'medium' && buyingIntent > 50) {
        return "⏰ Tu USB personalizada está ready. ¿La separamos con el 20% OFF?";
    }
    return "💭 ¿Tienes alguna duda sobre tu USB? Estoy aquí para ayudarte.";
};

export const generatePersuasiveFollowUp = (
    user: UserSession,
    urgencyLevel: 'high' | 'medium' | 'low'
): string[] => {
    const name = user.name ? user.name.split(' ')[0] : '';
    const personalGreeting = name ? `¡Hola ${name}! ` : '¡Hola! ';
    
    // Seleccionar técnica de persuasión basada en el perfil del usuario
    let technique: keyof typeof PERSUASION_TECHNIQUES = 'social_proof';
    
    if (user.buyingIntent > 80) technique = 'scarcity';
    else if (user.isVIP) technique = 'reciprocity';
    else if (user.stage === 'pricing') technique = 'authority';
    
    const persuasionMsg = PERSUASION_TECHNIQUES[technique][
        Math.floor(Math.random() * PERSUASION_TECHNIQUES[technique].length)
    ];
    
    const messages: string[] = [];
    
    // Mensaje principal persuasivo
    messages.push(`${personalGreeting}${persuasionMsg}`);
    
    // Mensaje de urgencia contextual
    messages.push(getUrgencyMessage(urgencyLevel, user.buyingIntent));
    
    // Call-to-action específico
    if (urgencyLevel === 'high') {
        messages.push("👉 Responde 'SÍ' para confirmar tu pedido ahora y asegurar tu descuento.");
    } else if (user.stage === 'customizing') {
        messages.push("🎵 ¿Continuamos personalizando tu USB? Responde 'CONTINUAR' o dime qué géneros prefieres.");
    } else {
        messages.push("💬 Responde 'INFO' para más detalles o 'PRECIO' para ver ofertas especiales.");
    }
    
    return messages;
};

export const sendSecureFollowUp = async (
    phoneNumber: string, 
    messages: string[], 
    urgency: 'high' | 'medium' | 'low'
): Promise<boolean> => {
    try {
        // Verificación final antes del envío
        const currentSession = await getUserSession(phoneNumber);
        if (!currentSession || !(await canReceiveFollowUp(phoneNumber, currentSession))) {
            return false;
        }
        
        // Verificar que el bot esté disponible
        if (!botInstance) {
            console.error('❌ Bot instance no disponible');
            return false;
        }
        
        // Envío con manejo de errores robusto
        const groupedMessage = messages.join('\n\n');
        
        await botInstance.sendMessage(phoneNumber, groupedMessage);
        
        // Marcar como enviado exitosamente
        if (currentSession) {
            currentSession.lastFollowUp = new Date();
            userSessions.set(phoneNumber, currentSession);
        }
        
        return true;
        
    } catch (error) {
        console.error(`❌ Error enviando mensaje seguro a ${phoneNumber}:`, error);
        
        // Marcar como fallido
        const session = userSessions.get(phoneNumber);
        if (session) {
            session.followUpSpamCount = (session.followUpSpamCount || 0) + 1;
            userSessions.set(phoneNumber, session);
        }
        
        return false;
    
    }
};

export const sendFollowUpMessage = async (phoneNumber: string): Promise<void> => {
    const session = userSessions.get(phoneNumber);
    if (!session) return;

    // Determinar urgencia basada en el contexto del usuario
    let urgency: 'high' | 'medium' | 'low' = 'low';
    const hoursSinceLastInteraction = (Date.now() - session.lastInteraction.getTime()) / (1000 * 60 * 60);
    
    if (session.buyingIntent > 80 && hoursSinceLastInteraction < 2) {
        urgency = 'high';
    } else if (session.buyingIntent > 60 || session.stage === 'pricing') {
        urgency = 'medium';
    }

    // Generar mensajes persuasivos
    const messages = generatePersuasiveFollowUp(session, urgency);
    
    // Enviar con validación adicional
    const sent = await sendSecureFollowUp(phoneNumber, messages, urgency);
    
    if (sent) {
        // Actualizar registro de seguimiento
        session.lastFollowUp = new Date();
        session.followUpSpamCount = (session.followUpSpamCount || 0) + 1;
        userSessions.set(phoneNumber, session);
        
        console.log(`📤 Seguimiento ${urgency} enviado a ${phoneNumber}`);
    }
};

function validateInteractionType(type: string): 'user_message' | 'bot_message' | 'system_event' {
    if (type === 'user_message' || type === 'bot_message' || type === 'system_event') {
        return type;
    }

    // Mapear tipos comunes a tipos válidos
    if (type === 'follow_up_response' || type === 'user_response') {
        return 'user_message';
    }
    if (type === 'bot_response' || type === 'automated_message') {
        return 'bot_message';
    }

    // Por defecto, asumir que es mensaje de usuario
    return 'user_message';
}

export const trackUserResponse = async (phoneNumber: string, message: string): Promise<void> => {
    try {
        // ✅ VALIDACIÓN DE PARÁMETROS
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            console.error('trackUserResponse: phoneNumber inválido');
            return;
        }

        if (!message || typeof message !== 'string') {
            console.warn('trackUserResponse: message inválido, usando string vacío');
            message = '';
        }

        const session = userSessions.get(phoneNumber);
        if (!session) {
            console.warn(`trackUserResponse: No se encontró sesión para ${phoneNumber}`);
            return;
        }

        // ✅ ACTUALIZAR ÚLTIMOS MENSAJES CON VALIDACIÓN
        // Note: lastMessage and lastMessageTime properties don't exist in UserSession type
        // The message is already tracked in the interactions array

        // Si es respuesta a un follow-up, analiza la respuesta
        if (session.lastFollowUpMsg) {
            try {
                const sentiment = await analyzeResponseSentiment(message);

                // Check if this is a response to a price/offer message by analyzing the message content
                const isPriceRelated = message.toLowerCase().includes('precio') ||
                                     message.toLowerCase().includes('oferta') ||
                                     message.toLowerCase().includes('costo') ||
                                     message.toLowerCase().includes('cuanto');

                if (sentiment === 'positive') {
                    // Si respuesta positiva a oferta/precio, actualiza estado
                    if (isPriceRelated) {
                        session.stage = 'interested';
                        session.buyingIntent = Math.min((session.buyingIntent || 50) + 10, 100);
                    }
                } else if (sentiment === 'negative') {
                    // Si respuesta negativa, ajusta seguimiento
                    session.followUpSpamCount = (session.followUpSpamCount || 0) + 1;
                    
                    // Si hay muchas respuestas negativas, reducir buying intent
                    if (session.followUpSpamCount > 2) {
                        session.buyingIntent = Math.max((session.buyingIntent || 50) - 5, 0);
                    }
                }

                // ✅ REGISTRAR LA INTERACCIÓN DE RESPUESTA
                if (!Array.isArray(session.interactions)) {
                    session.interactions = [];
                }

                const responseInteraction: Interaction = {
                    timestamp: new Date(),
                    message: message.trim(),
                    type: validateInteractionType('follow_up_response'),
                    sentiment: sentiment,
                    engagement_level: sentiment === 'positive' ? 80 : sentiment === 'negative' ? 20 : 50,
                    channel: 'WhatsApp',
                    respondedByBot: false,
                };

                session.interactions.push(responseInteraction);

                // Mantener solo las últimas 50 interacciones
                if (session.interactions.length > 50) {
                    session.interactions = session.interactions.slice(-50);
                }

                // Limpia el mensaje de seguimiento después de la respuesta
                session.lastFollowUpMsg = undefined;

            } catch (sentimentError) {
                console.error('Error al analizar sentiment de respuesta:', sentimentError);
            }
        }

        // ✅ PERSISTIR SESIÓN ACTUALIZADA
        userSessions.set(phoneNumber, session);

        console.log(`📝 Respuesta registrada para ${phoneNumber}: "${message.substring(0, 50)}..."`);

    } catch (error) {
        console.error(`❌ Error en trackUserResponse para ${phoneNumber}:`, error);
    }
};

// ✅ FUNCIÓN CON TIPO DE RETORNO CORRECTO
const analyzeResponseSentiment = async (message: string): Promise<SentimentType> => {
    // ✅ VALIDACIÓN DE ENTRADA
    if (!message || typeof message !== 'string') {
        return 'neutral';
    }

    const msg = message.toLowerCase().trim();
    
    // Si el mensaje está vacío después del trim
    if (msg.length === 0) {
        return 'neutral';
    }
    
    // Palabras y frases positivas
    const positivePatterns = [
        /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
        /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
        /\b(amor|amo|encanta|fascina|ideal|justo|necesito|acepto|confirmo)\b/,
        /^(👍|🙌|👌|✌️|💪|🎉|👏|❤️|😊|🤗|😍|🥰|😘)$/
    ];

    // Palabras y frases negativas
    const negativePatterns = [
        /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego|rechazar)\b/,
        /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
        /\b(aburrido|feo|horrible|odio|detesto|molesta|cancelo|cancelar)\b/,
        /^(👎|😕|😔|😢|😡|🙄|😤|😠|😒|🤔|😐|😑)$/
    ];

    // Verifica patrones positivos
    for (const pattern of positivePatterns) {
        if (pattern.test(msg)) return 'positive';
    }

    // Verifica patrones negativos
    for (const pattern of negativePatterns) {
        if (pattern.test(msg)) return 'negative';
    }

    // Casos especiales para números (opciones de menú)
    if (/^[1-4]$/.test(msg)) {
        return 'positive'; // Seleccionar una opción es positivo
    }

    // Si no encuentra patrones claros, retorna neutral
    return 'neutral';
};

// Funciones de demostración de contenido
export const sendDemoIfNeeded = async (session: UserSession, phoneNumber: string) => {
    if (!botInstance) return;

    function pickRandomDemo(demos: { name: string; file: string }[]): { name: string; file: string } | null {
        if (!demos || demos.length === 0) return null;
        return demos[Math.floor(Math.random() * demos.length)];
    }

    const genreTopHits = musicData.genreTopHits || {};
    const videoTopHits = videoData.topHits || {};

    // Determina si es música o video según intereses y demos disponibles
    const interestGenre = session.interests.find(g => genreTopHits[g]) || Object.keys(genreTopHits)[0];
    const interestVideo = session.interests.find(g => videoTopHits[g]) || Object.keys(videoTopHits)[0];

    // Si el usuario tiene interés en música y existen demos
    if (session.interests.some(i => i.includes('music') || i === 'musica' || genreTopHits[i])) {
        const demos = genreTopHits[interestGenre] || [];
        const randomDemo = pickRandomDemo(demos);
        if (randomDemo) {
            await botInstance.sendMessage(
                phoneNumber,
                {
                    body: `🎧 Demo USB (${interestGenre}): ${randomDemo.name}\n¿Te gustaría tu USB con este género o prefieres mezclar varios? ¡Cuéntame!`,
                    media: randomDemo.file
                }
            );
        }
        return;
    }

    // Si el usuario tiene interés en videos y existen demos
    if (session.interests.some(i => i.includes('video') || i === 'videos' || videoTopHits[i])) {
        const demos = videoTopHits[interestVideo] || [];
        const randomDemo = pickRandomDemo(demos);
        if (randomDemo) {
            await botInstance.sendMessage(
                phoneNumber,
                {
                    body: `🎬 Demo Video (${interestVideo}): ${randomDemo.name}\n¿Quieres añadir más artistas, géneros, películas o series? ¡Personalízalo a tu gusto!`,
                    media: randomDemo.file
                }
            );
        }
        return;
    }
};

// Funciones de utilidad y configuración
export function setBotInstance(instance: any) {
    botInstance = instance;
}

export function createUserSession(phoneNumber: string): UserSession {
    const now = new Date();
    return {
        phone: phoneNumber,
        phoneNumber: phoneNumber,
        name: '',
        buyingIntent: 0,
        stage: 'initial',
        interests: [],
        conversationData: {},
        currentFlow: 'initial',
        currentStep: 'welcome',
        createdAt: now,
        updatedAt: now,
        lastInteraction: now,
        lastActivity: now,
        interactions: [],
        isFirstMessage: true,
        isPredetermined: false,
        skipWelcome: false,
        tags: [],
        messageCount: 0,
        isActive: true,
        isNewUser: true,
        isReturningUser: false,
        followUpSpamCount: 0,
        totalOrders: 0,
        demographics: {},
        preferences: {},
        customization: {
            step: 0,
            preferences: {},
            totalPrice: 0,
        }
    };
}

export function clearUserSession(phoneNumber: string): void {
    userSessions.delete(phoneNumber);
    if (followUpQueue.has(phoneNumber)) {
        clearTimeout(followUpQueue.get(phoneNumber)!);
        followUpQueue.delete(phoneNumber);
    }
    console.log(`🗑️ Sesión limpiada para usuario: ${phoneNumber}`);
}

export function getUserStats(phoneNumber: string): {
    totalInteractions: number;
    lastActivity: Date | null;
    currentFlow: string | null;
    isVIP: boolean;
    tags: string[];
} {
    const session = userSessions.get(phoneNumber);
    if (!session) {
        return { totalInteractions: 0, lastActivity: null, currentFlow: null, isVIP: false, tags: [] };
    }
    return {
        totalInteractions: session.interactions?.length || 0,
        lastActivity: session.lastActivity || null,
        currentFlow: session.currentFlow || null,
        isVIP: !!session.isVIP,
        tags: session.tags || []
    };
}

export const getTopInterests = (): Array<{ interest: string; count: number }> => {
    const interestCount = new Map<string, number>();
    userSessions.forEach(session => {
        (session.interests || []).forEach(interest => {
            interestCount.set(interest, (interestCount.get(interest) || 0) + 1);
        });
    });
    return Array.from(interestCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([interest, count]) => ({ interest, count }));
};

export interface AnalyticsData {
    totalUsers: number;
    byStage: {
        initial: number;
        interested: number;
        customizing: number;
        pricing: number;
        abandoned: number;
        converted: number;
        inactive: number;
        paused: number;
    };
    avgBuyingIntent: number;
    highRiskUsers: number;
    topInterests: Array<{ interest: string; count: number }>;
    recentInteractions: Array<{
        phone: string;
        name?: string;
        stage: string;
        buyingIntent: number;
        lastInteraction: Date;
        interests?: string[];
        demographics?: any;
        preferences: Record<string, any>;
        location?: string;
    }>;
    demographicsSummary: any;
    preferencesSummary: any;
    mostActiveChannels: Array<{ channel: string; count: number }>;
    lastUpdate?: string;
}

export interface UserSpecificAnalytics {
    phone: string;
    name?: string;
    stage: string;
    buyingIntent: number;
    totalInteractions: number;
    sessionDuration: number;
    interests: string[];
    preferences: Record<string, any>;
    demographics: any;
    location?: string;
    riskLevel: string;
    conversionProbability: number;
    preferredCategories: string[];
    lastInteraction: Date;
    messageCount: number;
    responseTime: number;
    engagementScore: number;
    lastUpdate?: string;
}

// Función sobrecargada para manejar ambos casos
export function getUserAnalytics(): AnalyticsData;
export function getUserAnalytics(phone: string): Promise<UserSpecificAnalytics>;
export function getUserAnalytics(phone?: string): AnalyticsData | Promise<UserSpecificAnalytics> {
    
    if (phone) {
        return getUserSpecificAnalytics(phone);
    }
    
    return getGeneralAnalytics();
}

function getGeneralAnalytics(): AnalyticsData {
    const sessions: UserSession[] = Array.from(userSessions.values());
    const topInteractions = getTopInterests();
    
    return {
        totalUsers: sessions.length,
        byStage: {
            initial: sessions.filter(s => s.stage === 'initial').length,
            interested: sessions.filter(s => s.stage === 'interested').length,
            customizing: sessions.filter(s => s.stage === 'customizing').length,
            pricing: sessions.filter(s => s.stage === 'pricing').length,
            abandoned: sessions.filter(s => s.stage === 'abandoned').length,
            converted: sessions.filter(s => s.stage === 'converted').length,
            inactive: sessions.filter(s => s.stage === 'inactive').length,
            paused: sessions.filter(s => s.stage === 'paused').length,
        },
        avgBuyingIntent: sessions.length ? 
            sessions.reduce((sum, s) => sum + (s.aiAnalysis?.buyingIntent || 0), 0) / sessions.length : 0,
        highRiskUsers: sessions.filter(s => s.aiAnalysis?.riskLevel === 'high').length,
        topInterests: topInteractions,
        recentInteractions: sessions
            .sort((a, b) => b.lastInteraction.getTime() - a.lastInteraction.getTime())
            .slice(0, 10)
            .map(s => ({
                phone: s.phone,
                name: s.name,
                stage: s.stage,
                buyingIntent: s.aiAnalysis?.buyingIntent || 0,
                lastInteraction: s.lastInteraction,
                interests: s.interests,
                demographics: s.demographics,
                preferences: s.preferences,
                location: s.location
            })),
        // ✅ USAR FUNCIONES IMPORTADAS DIRECTAMENTE
        demographicsSummary: calculateDemographicsSummary(sessions),
        preferencesSummary: calculatePreferencesSummary(sessions),
        mostActiveChannels: Object.entries(
            sessions.reduce((acc, s) => {
                // Extract channels from interactions since channel is not in UserSession directly
                s.interactions?.forEach(interaction => {
                    if (interaction.channel) {
                        acc[interaction.channel] = (acc[interaction.channel] || 0) + 1;
                    }
                });
                return acc;
            }, {} as Record<string, number>)
        ).sort((a, b) => b[1] - a[1]).map(([channel, count]) => ({ channel, count })),
        lastUpdate: new Date().toISOString()
    };
}

setInterval(() => {
    if (global.processingCache) {
        global.processingCache.clear(); // ✅ Usar clear() para Set
    }
}, 10 * 60 * 1000);


// Analytics específicos de un usuario
async function getUserSpecificAnalytics(phone: string): Promise<UserSpecificAnalytics> {
    try {
        // Obtener sesión del usuario
        const session = userSessions.get(phone);
        
        if (!session) {
            // Si no hay sesión activa, intentar obtener de la base de datos
            try {
                const dbUser = await businessDB.getUserSession(phone);
                if (dbUser) {
                    return {
                        phone,
                        name: dbUser.name,
                        stage: dbUser.stage || 'initial',
                        buyingIntent: dbUser.buying_intent || 0,
                        totalInteractions: dbUser.total_interactions || 0,
                        sessionDuration: dbUser.session_duration || 0,
                        interests: dbUser.interests ? JSON.parse(dbUser.interests) : [],
                        preferences: dbUser.preferences ? JSON.parse(dbUser.preferences) : {},
                        demographics: dbUser.demographics ? JSON.parse(dbUser.demographics) : {},
                        location: dbUser.location,
                        riskLevel: dbUser.risk_level || 'low',
                        conversionProbability: dbUser.conversion_probability || 0,
                        preferredCategories: dbUser.preferred_categories ? JSON.parse(dbUser.preferred_categories) : [],
                        lastInteraction: new Date(dbUser.last_interaction || Date.now()),
                        messageCount: dbUser.message_count || 0,
                        responseTime: dbUser.avg_response_time || 0,
                        engagementScore: dbUser.engagement_score || 0,
                        lastUpdate: new Date().toISOString()
                    };
                }
            } catch (dbError) {
                console.error('❌ Error obteniendo usuario de BD:', dbError);
            }
            
            // Usuario no encontrado
            return {
                phone,
                stage: 'initial',
                buyingIntent: 0,
                totalInteractions: 0,
                sessionDuration: 0,
                interests: [],
                preferences: {},
                demographics: {},
                riskLevel: 'low',
                conversionProbability: 0,
                preferredCategories: [],
                lastInteraction: new Date(),
                messageCount: 0,
                responseTime: 0,
                engagementScore: 0,
                lastUpdate: new Date().toISOString()
            };
        }
        
        // Calcular métricas adicionales
        const sessionDuration = session.createdAt ?
            Date.now() - new Date(session.createdAt).getTime() : 0;
        const engagementScore = calculateEngagementScore(session);
        const conversionProbability = calculateConversionProbability(session);
        
        return {
            phone: session.phone,
            name: session.name,
            stage: session.stage,
            buyingIntent: session.aiAnalysis?.buyingIntent || session.buyingIntent || 0,
            totalInteractions: session.messageCount || 0,
            sessionDuration: Math.round(sessionDuration / 1000), // en segundos
            interests: session.interests || [],
            preferences: session.preferences || {},
            demographics: session.demographics || {},
            location: session.location,
            riskLevel: session.aiAnalysis?.riskLevel || 'low',
            conversionProbability,
            preferredCategories: extractPreferredCategories(session),
            lastInteraction: session.lastInteraction,
            messageCount: session.messageCount || 0,
            responseTime: 0, // Remove response_time since it's not in UserSession type
            engagementScore,
            lastUpdate: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ Error obteniendo analytics específicos del usuario:', error);
        
        // Fallback con datos básicos
        return {
            phone,
            stage: 'initial',
            buyingIntent: 0,
            totalInteractions: 0,
            sessionDuration: 0,
            interests: [],
            preferences: {},
            demographics: {},
            riskLevel: 'low',
            conversionProbability: 0,
            preferredCategories: [],
            lastInteraction: new Date(),
            messageCount: 0,
            responseTime: 0,
            engagementScore: 0,
            lastUpdate: new Date().toISOString()
        };
    }
}

// Funciones auxiliares
function calculateEngagementScore(session: UserSession): number {
    let score = 0;
    
    // Puntos por interacciones
    score += Math.min(session.messageCount || 0, 50); // Max 50 puntos
    
    // Puntos por intención de compra
    score += (session.buyingIntent || 0) * 0.3; // Max 30 puntos
    
    // Puntos por tiempo de sesión (más tiempo = más engagement)
    const sessionMinutes = session.createdAt ?
        (Date.now() - new Date(session.createdAt).getTime()) / (1000 * 60) : 0;
    score += Math.min(sessionMinutes * 2, 20); // Max 20 puntos
    
    // Puntos por intereses múltiples
    score += Math.min((session.interests?.length || 0) * 5, 15); // Max 15 puntos
    
    // Penalización por inactividad
    const inactiveMinutes = (Date.now() - session.lastInteraction.getTime()) / (1000 * 60);
    if (inactiveMinutes > 30) {
        score *= 0.8; // Reducir 20% si está inactivo más de 30 min
    }
    
    return Math.round(Math.min(score, 100)); // Max 100 puntos
}

function calculateConversionProbability(session: UserSession): number {
    let probability = 0;
    
    // Base por intención de compra
    probability += (session.buyingIntent || 0) * 0.4;
    
    // Por etapa del usuario
    const stageWeights: Record<string, number> = {
        'initial': 5,
        'interested': 15,
        'customizing': 35,
        'pricing': 60,
        'abandoned': 10,
        'converted': 100,
        'inactive': 5,
        'paused': 20
    };
    probability += stageWeights[session.stage] || 5;
    
    // Por número de interacciones
    probability += Math.min((session.messageCount || 0) * 2, 20);
    
    // Por tiempo en sesión
    const sessionMinutes = session.createdAt ?
        (Date.now() - new Date(session.createdAt).getTime()) / (1000 * 60) : 0;
    if (sessionMinutes > 5) probability += 10;
    if (sessionMinutes > 15) probability += 10;
    
    // Por datos completos
    if (session.name) probability += 5;
    if (session.location) probability += 5;
    if (session.preferences && Object.keys(session.preferences).length > 0) probability += 5;
    
    return Math.round(Math.min(probability, 100));
}

function extractPreferredCategories(session: UserSession): string[] {
    const categories: string[] = [];
    
    // Extraer de intereses
    if (session.interests) {
        session.interests.forEach(interest => {
            if (interest.toLowerCase().includes('música')) categories.push('Música');
            if (interest.toLowerCase().includes('video')) categories.push('Videos');
            if (interest.toLowerCase().includes('película')) categories.push('Películas');
            if (interest.toLowerCase().includes('juego')) categories.push('Juegos');
            if (interest.toLowerCase().includes('foto')) categories.push('Fotos');
        });
    }
    
    // Extraer de preferencias
    if (session.preferences) {
        Object.keys(session.preferences).forEach(key => {
            if (key.includes('genre') || key.includes('genero')) {
                categories.push('Música');
            }
            if (key.includes('capacity') || key.includes('capacidad')) {
                categories.push('Almacenamiento');
            }
        });
    }
    
    return [...new Set(categories)]; // Eliminar duplicados
}

// ✅ FUNCIONES AUXILIARES PARA VALIDACIÓN Y ANÁLISIS
function calculateDemographicsSummary(sessions: UserSession[]) {
    const demographics = {
        ageGroups: {} as Record<string, number>,
        locations: {} as Record<string, number>,
        genders: {} as Record<string, number>
    };
    
    sessions.forEach(session => {
        if (session.demographics) {
            const demo = session.demographics;
            
            if (demo.age && typeof demo.age === 'number') {
                const ageGroup = getAgeGroup(demo.age);
                demographics.ageGroups[ageGroup] = (demographics.ageGroups[ageGroup] || 0) + 1;
            }
            
            if (demo.gender && typeof demo.gender === 'string') {
                demographics.genders[demo.gender] = (demographics.genders[demo.gender] || 0) + 1;
            }
        }
        
        if (session.location && typeof session.location === 'string') {
            demographics.locations[session.location] = (demographics.locations[session.location] || 0) + 1;
        }
    });
    
    return demographics;
}

function calculatePreferencesSummary(sessions: UserSession[]) {
    const preferences = {
        musicGenres: {} as Record<string, number>,
        capacities: {} as Record<string, number>,
        colors: {} as Record<string, number>
    };

    sessions.forEach(session => {
        if (session.preferences) {
            const prefs = session.preferences;

            // Handle musicGenres array
            if (prefs.musicGenres && Array.isArray(prefs.musicGenres)) {
                prefs.musicGenres.forEach(genre => {
                    if (typeof genre === 'string') {
                        preferences.musicGenres[genre] = (preferences.musicGenres[genre] || 0) + 1;
                    }
                });
            }

            // ✅ VALIDACIÓN DE TIPOS PARA CAPACITY
            if (prefs.capacity) {
                if (typeof prefs.capacity === 'string') {
                    preferences.capacities[prefs.capacity] = (preferences.capacities[prefs.capacity] || 0) + 1;
                } else if (Array.isArray(prefs.capacity)) {
                    prefs.capacity.forEach((cap: any) => {
                        if (typeof cap === 'string') {
                            preferences.capacities[cap] = (preferences.capacities[cap] || 0) + 1;
                        }
                    });
                }
            }
        }
    });

    return preferences;
}

function getAgeGroup(age: number): string {
    if (age < 18) return '< 18';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    return '55+';
}

// Exportar también la función específica para uso interno
export { getUserSpecificAnalytics };

export function getUsersNeedingFollowUp() {
    const currentTime = new Date();
    const usersNeedingFollowUp: Array<{
        phone: string;
        session: UserSession;
        priority: string;
        minutesSinceLastInteraction: number;
        hoursSinceLastFollowUp: number;
    }> = [];

    Array.from(userSessions.entries()).forEach(([phone, session]) => {
        const timeSinceLastInteraction = currentTime.getTime() - session.lastInteraction.getTime();
        const minutesSinceLastInteraction = timeSinceLastInteraction / (1000 * 60);
        const lastFollowUp = session.lastFollowUp || new Date(0);
        const timeSinceLastFollowUp = currentTime.getTime() - lastFollowUp.getTime();
        const hoursSinceLastFollowUp = timeSinceLastFollowUp / (1000 * 60 * 60);

        let needsFollowUp = false;
        let priority = 'low';

        if (session.aiAnalysis?.buyingIntent && session.aiAnalysis.buyingIntent > 70 && minutesSinceLastInteraction > 30 && hoursSinceLastFollowUp > 2) {
            needsFollowUp = true;
            priority = 'high';
        } else if (session.aiAnalysis?.buyingIntent && session.aiAnalysis.buyingIntent > 50 && minutesSinceLastInteraction > 90 && hoursSinceLastFollowUp > 4) {
            needsFollowUp = true;
            priority = 'medium';
        } else if (minutesSinceLastInteraction > 180 && hoursSinceLastFollowUp > 6) {
            needsFollowUp = true;
            priority = 'low';
        }

        if (needsFollowUp && session.stage !== 'converted' && !session.tags?.includes('blacklist')) {
            usersNeedingFollowUp.push({
                phone,
                session,
                priority,
                minutesSinceLastInteraction,
                hoursSinceLastFollowUp
            });
        }
    });

    return usersNeedingFollowUp;
}

// Funciones de gestión de usuarios
export function markVIP(phoneNumber: string) {
    const session = userSessions.get(phoneNumber);
    if (session) {
        session.isVIP = true;
        session.tags = session.tags || [];
        if (!session.tags.includes('VIP')) session.tags.push('VIP');
        userSessions.set(phoneNumber, session);
    }
}

export function blacklistUser(phoneNumber: string) {
    const session = userSessions.get(phoneNumber);
    if (session) {
        session.tags = session.tags || [];
        if (!session.tags.includes('blacklist')) session.tags.push('blacklist');
        userSessions.set(phoneNumber, session);
    }
}

export function getSmartRecommendations(phone: string, userSessions: Map<string, UserSession>): string[] {
    const session = userSessions.get(phone);
    if (!session) return [];

    const recs: string[] = [];

    // Recomendación por géneros favoritos
    if (session.preferences?.musicGenres && session.preferences.musicGenres.length > 0) {
        recs.push(`Colecciones premium de ${session.preferences.musicGenres.slice(0, 2).join(' y ')}`);
    } else if (session.interests && session.interests.length > 0) {
        recs.push(`Mix especial de ${session.interests.slice(0, 2).join(' y ')}`);
    }

    // Recomendación por etapa
    switch (session.stage) {
        case 'customizing':
            recs.push('¡Prueba la opción de artistas exclusivos o mezcla de éxitos!');
            break;
        case 'pricing':
            recs.push('Consulta las ofertas flash en USBs de alta capacidad.');
            break;
        case 'interested':
            recs.push('Te recomiendo nuestro servicio de playlist personalizada.');
            break;
    }

    // Capacidad preferida
    if (session.preferences?.capacity && session.preferences.capacity.length > 0) {
        recs.push(`USB de ${session.preferences.capacity[0]}GB recomendada para tu selección`);
    }

    // Recomendación VIP
    if (session.isVIP) {
        recs.push('Acceso VIP: contenido exclusivo y atención personalizada');
    }

    // Si el usuario ha comprado antes, recomendar novedades
    if (session.purchaseHistory && session.purchaseHistory.length > 0) {
        recs.push('Nuevos lanzamientos y colecciones recientes disponibles para ti');
    }

    // Si no hay nada, sugerencia genérica
    if (recs.length === 0) {
        recs.push('Descubre nuestros packs de música y películas más populares');
    }

    return recs;
}

export function getConversationAnalysis(phone: string, userSessions: Map<string, UserSession>): {
    summary: string;
    sentiment: SentimentType;
    engagement: number;
    lastIntent?: string;
    buyingIntent: number;
} {
    const session = userSessions.get(phone);
    if (!session) {
        return {
            summary: 'No hay conversación registrada.',
            sentiment: 'neutral',
            engagement: 0,
            buyingIntent: 0
        };
    }

    let positive = 0, negative = 0, engagement = 0;
    let lastIntent = '';
    let total = 0;

    for (const log of session.interactions || []) {
        if (log.sentiment === 'positive') positive++;
        if (log.sentiment === 'negative') negative++;
        engagement += log.engagement_level || 0;
        if (log.intent) lastIntent = log.intent;
        total++;
    }

    let sentiment: SentimentType = 'neutral';
    if (positive > negative) sentiment = 'positive';
    else if (negative > positive) sentiment = 'negative';

    const avgEngagement = total ? Math.round(engagement / total) : 0;

    const summary = `Último mensaje: ${session.interactions?.slice(-1)[0]?.message || 'N/A'} | Última intención: ${lastIntent || 'N/A'}`;

    return {
        summary,
        sentiment,
        engagement: avgEngagement,
        lastIntent,
        buyingIntent: session.aiAnalysis?.buyingIntent ?? 0
    };
}

// Funciones de frases persuasivas
const persuasivePhrases = [
    "¡Miles de clientes felices ya disfrutan sus USBs musicales!",
    "Esta oferta es exclusiva para ti. ¡No la dejes pasar!",
    "¿Te imaginas todos tus géneros favoritos en un solo dispositivo?",
    "¡Hazlo ahora y recibe un regalo sorpresa en tu pedido!",
    "🎶 Haz tu pedido hoy y vive la experiencia musical definitiva.",
    "Solo por hoy: ¡envío gratis y playlist personalizada!",
    "Las mejores colecciones musicales, solo para clientes VIP como tú.",
    "¡Tus artistas favoritos te esperan en tu nueva USB!",
    "Nuestro soporte es 24/7 para clientes como tú. ¡Aprovecha!",
    "Compra segura, garantía y satisfacción total."
];

export function getPersuasivePhrase(): string {
    return persuasivePhrases[Math.floor(Math.random() * persuasivePhrases.length)];
}

// ✅ FUNCIONES DE UTILIDAD ADICIONALES

export function validateEngagement(engagement: any): number {
    if (typeof engagement === 'number' && engagement >= 0 && engagement <= 100 && !isNaN(engagement)) {
        return Math.round(engagement);
    }
    return 50;
}

export function validateIntent(intent: any): string {
    if (typeof intent === 'string' && intent.trim().length > 0) {
        return intent.trim().toLowerCase();
    }
    return 'general';
}

export function sanitizeMessage(message: any): string {
    if (typeof message === 'string') {
        return message.trim().substring(0, 1000); // Limitar a 1000 caracteres
    }
    return '';
}

export function validatePhoneNumber(phone: any): string | null {
    if (typeof phone === 'string' && phone.trim().length > 0) {
        // Remover caracteres no numéricos excepto +
        const cleaned = phone.replace(/[^\d+]/g, '');
        if (cleaned.length >= 10) {
            return cleaned;
        }
    }
    return null;
}

// ✅ FUNCIONES DE MÉTRICAS Y MONITOREO

export function getSystemMetrics(): {
    totalActiveSessions: number;
    averageSessionDuration: number;
    totalInteractions: number;
    averageBuyingIntent: number;
    conversionRate: number;
    topStages: Array<{ stage: string; count: number }>;
    systemHealth: 'healthy' | 'warning' | 'critical';
} {
    const sessions = Array.from(userSessions.values());
    const now = Date.now();
    
    // Calcular métricas básicas
    const totalActiveSessions = sessions.filter(s => s.isActive).length;
    const totalInteractions = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
    const avgBuyingIntent = sessions.length > 0 ? 
        sessions.reduce((sum, s) => sum + (s.buyingIntent || 0), 0) / sessions.length : 0;
    
    // Calcular duración promedio de sesión
    const avgSessionDuration = sessions.length > 0 ?
        sessions.reduce((sum, s) => {
            const duration = s.createdAt ? now - new Date(s.createdAt).getTime() : 0;
            return sum + duration;
        }, 0) / sessions.length / (1000 * 60) : 0; // en minutos
    
    // Calcular tasa de conversión
    const convertedUsers = sessions.filter(s => s.stage === 'converted').length;
    const conversionRate = sessions.length > 0 ? (convertedUsers / sessions.length) * 100 : 0;
    
    // Top stages
    const stageCount = new Map<string, number>();
    sessions.forEach(s => {
        const stage = s.stage || 'unknown';
        stageCount.set(stage, (stageCount.get(stage) || 0) + 1);
    });
    
    const topStages = Array.from(stageCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([stage, count]) => ({ stage, count }));
    
    // Determinar salud del sistema
    let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (totalActiveSessions > 1000) systemHealth = 'warning';
    if (totalActiveSessions > 2000 || avgBuyingIntent < 30) systemHealth = 'critical';
    
    return {
        totalActiveSessions,
        averageSessionDuration: Math.round(avgSessionDuration),
        totalInteractions,
        averageBuyingIntent: Math.round(avgBuyingIntent),
        conversionRate: Math.round(conversionRate * 100) / 100,
        topStages,
        systemHealth
    };
}

export function getPerformanceMetrics(): {
    memoryUsage: number;
    sessionCacheSize: number;
    followUpQueueSize: number;
    averageResponseTime: number;
    errorRate: number;
    lastCleanup: Date | null;
} {
    // Métricas de memoria (aproximadas)
    const sessionCacheSize = userSessions.size;
    const followUpQueueSize = followUpQueue.size;
    
    // Estimar uso de memoria (muy aproximado)
    const avgSessionSize = 2048; // bytes aproximados por sesión
    const memoryUsage = sessionCacheSize * avgSessionSize;
    
    // Calcular tiempo de respuesta promedio
    const sessions = Array.from(userSessions.values());
    // Remove response_time since it's not in UserSession type
    const avgResponseTime = 0; // Default value since response_time is not available

    // Tasa de error (simulada - en producción sería real)
    const errorRate = 0.1; // 0.1%
    
    return {
        memoryUsage,
        sessionCacheSize,
        followUpQueueSize,
        averageResponseTime: Math.round(avgResponseTime),
        errorRate,
        lastCleanup: new Date() // Placeholder
    };
}

// ✅ FUNCIONES DE LIMPIEZA Y MANTENIMIENTO

export function cleanupInactiveSessions(maxInactiveHours: number = 24): number {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxInactiveHours * 60 * 60 * 1000);
    let cleaned = 0;

    Array.from(userSessions.entries()).forEach(([phoneNumber, session]) => {
        if (session.lastInteraction < cutoffTime && 
            session.stage !== 'converted' && 
            !session.isVIP) {
            
            userSessions.delete(phoneNumber);
            
            // Limpiar también follow-up queue
            if (followUpQueue.has(phoneNumber)) {
                clearTimeout(followUpQueue.get(phoneNumber)!);
                followUpQueue.delete(phoneNumber);
            }
            
            cleaned++;
        }
    });

    if (cleaned > 0) {
        console.log(`🧹 Limpiadas ${cleaned} sesiones inactivas (>${maxInactiveHours}h)`);
    }

    return cleaned;
}

export function optimizeMemoryUsage(): {
    before: number;
    after: number;
    optimized: number;
} {
    const beforeSize = userSessions.size;
    
    // Limpiar interacciones antiguas (mantener solo las últimas 20)
    userSessions.forEach((session, phone) => {
        if (session.interactions && session.interactions.length > 20) {
            session.interactions = session.interactions.slice(-20);
        }
        
        // Limpiar metadatos antiguos
        if (session.conversationData?.aiInsights && 
            session.conversationData.aiInsights.length > 5) {
            session.conversationData.aiInsights = session.conversationData.aiInsights.slice(-5);
        }
        
        // Limpiar historial de etapas antiguo
        if (session.conversationData?.stageHistory && 
            session.conversationData.stageHistory.length > 10) {
            session.conversationData.stageHistory = session.conversationData.stageHistory.slice(-10);
        }
    });
    
    // Limpiar sesiones inactivas
    const cleaned = cleanupInactiveSessions(48); // 48 horas
    
    const afterSize = userSessions.size;
    
    return {
        before: beforeSize,
        after: afterSize,
        optimized: cleaned
    };
}

// ✅ FUNCIONES DE EXPORTACIÓN E IMPORTACIÓN

export function exportUserSessions(): string {
    try {
        const sessions = Array.from(userSessions.values());
        return JSON.stringify(sessions, null, 2);
    } catch (error) {
        console.error('❌ Error exportando sesiones:', error);
        return '[]';
    }
}

export function importUserSessions(jsonData: string): boolean {
    try {
        const sessions = JSON.parse(jsonData);
        
        if (!Array.isArray(sessions)) {
            throw new Error('Datos no válidos: se esperaba un array');
        }
        
        let imported = 0;
        sessions.forEach((sessionData: any) => {
            if (sessionData.phone || sessionData.phoneNumber) {
                const phone = sessionData.phone || sessionData.phoneNumber;
                
                // Convertir fechas
                if (sessionData.lastInteraction) {
                    sessionData.lastInteraction = new Date(sessionData.lastInteraction);
                }
                if (sessionData.createdAt) {
                    sessionData.createdAt = new Date(sessionData.createdAt);
                }
                if (sessionData.updatedAt) {
                    sessionData.updatedAt = new Date(sessionData.updatedAt);
                }
                
                userSessions.set(phone, sessionData);
                imported++;
            }
        });
        
        console.log(`📥 Importadas ${imported} sesiones de usuario`);
        return true;
        
    } catch (error) {
        console.error('❌ Error importando sesiones:', error);
        return false;
    }
}

// Revisor de inactividad global mejorado
setInterval(() => {
    const now = Date.now();
    let inactiveCount = 0;
    let followUpScheduled = 0;

    userSessions.forEach((session, phone) => {
        if (session.stage === 'converted' || session.isBlacklisted) return;
        
        const minsSinceLast = (now - session.lastInteraction.getTime()) / (1000 * 60);

        // Marcar como inactivo después de 12 horas
        if (minsSinceLast > 12 * 60 && session.stage !== 'inactive') {
            session.stage = 'inactive';
            userSessions.set(phone, session);
            inactiveCount++;
        }

        // Programar follow-up si es necesario
        if (minsSinceLast > 60 && 
            (!session.lastFollowUp || (now - session.lastFollowUp.getTime()) > 60 * 60 * 1000) &&
            !followUpQueue.has(phone)) {
            
            scheduleFollowUp(phone);
            followUpScheduled++;
        }
    });

    if (inactiveCount > 0) {
        console.log(`⚠️ ${inactiveCount} usuarios marcados como inactivos`);
    }
    if (followUpScheduled > 0) {
        console.log(`📅 ${followUpScheduled} seguimientos programados`);
    }

}, 5 * 60 * 1000); // Cada 5 minutos

// ✅ FUNCIONES DE COMPATIBILIDAD Y UTILIDAD ADICIONALES

export const getOrCreateSession = async (phoneNumber: string): Promise<UserSession> => {
    return await getUserSession(phoneNumber);
};

export const updateSession = async (
    phoneNumber: string,
    updates: Partial<UserSession>
): Promise<void> => {
    try {
        const session = await getUserSession(phoneNumber);
        
        // Aplicar actualizaciones de forma segura
        Object.keys(updates).forEach(key => {
            if (updates[key as keyof UserSession] !== undefined) {
                (session as any)[key] = updates[key as keyof UserSession];
            }
        });
        
        session.updatedAt = new Date();
        userSessions.set(phoneNumber, session);
        
        console.log(`📝 Sesión actualizada para ${phoneNumber}`);
        
    } catch (error) {
        console.error(`❌ Error actualizando sesión para ${phoneNumber}:`, error);
    }
};

export const getSessionsByStage = (stage: string): UserSession[] => {
    return Array.from(userSessions.values()).filter(session => session.stage === stage);
};

export const getSessionsByTag = (tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer'): UserSession[] => {
    return Array.from(userSessions.values()).filter(session =>
        session.tags && session.tags.includes(tag)
    );
};

export const addTagToUser = (phoneNumber: string, tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer'): boolean => {
    const session = userSessions.get(phoneNumber);
    if (session) {
        if (!session.tags) session.tags = [];
        if (!session.tags.includes(tag)) {
            session.tags.push(tag);
            session.updatedAt = new Date();
            userSessions.set(phoneNumber, session);
            return true;
        }
    }
    return false;
};

export const removeTagFromUser = (phoneNumber: string, tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer'): boolean => {
    const session = userSessions.get(phoneNumber);
    if (session && session.tags) {
        const index = session.tags.indexOf(tag);
        if (index > -1) {
            session.tags.splice(index, 1);
            session.updatedAt = new Date();
            userSessions.set(phoneNumber, session);
            return true;
        }
    }
    return false;
};

// ✅ FUNCIONES DE DEBUGGING Y LOGGING

export function debugSession(phoneNumber: string): void {
    const session = userSessions.get(phoneNumber);
    if (!session) {
        console.log(`❌ No se encontró sesión para ${phoneNumber}`);
        return;
    }

    console.log(`\n🔍 DEBUG SESSION: ${phoneNumber}`);
    console.log(`📱 Nombre: ${session.name || 'N/A'}`);
    console.log(`🎯 Etapa: ${session.stage}`);
    console.log(`💡 Buying Intent: ${session.buyingIntent}%`);
    console.log(`💬 Mensajes: ${session.messageCount || 0}`);
    console.log(`🏷️ Tags: ${session.tags?.join(', ') || 'Ninguno'}`);
    console.log(`📊 Intereses: ${session.interests?.join(', ') || 'Ninguno'}`);
    console.log(`⏰ Última interacción: ${session.lastInteraction.toLocaleString()}`);
    console.log(`🔄 Flujo actual: ${session.currentFlow}`);
    
    if (session.interactions && session.interactions.length > 0) {
        console.log(`\n📝 Últimas 3 interacciones:`);
        session.interactions.slice(-3).forEach((interaction, index) => {
            console.log(`  ${index + 1}. [${interaction.type}] ${interaction.message.substring(0, 50)}...`);
            console.log(`     Intent: ${interaction.intent} | Sentiment: ${interaction.sentiment}`);
        });
    }
    
    if (session.aiAnalysis) {
        console.log(`\n🤖 AI Analysis:`);
        console.log(`  Next Action: ${session.aiAnalysis.nextBestAction}`);
        console.log(`  Risk Level: ${session.aiAnalysis.riskLevel}`);
        console.log(`  Engagement: ${session.aiAnalysis.engagementScore}`);
    }
    
    console.log(`\n`);
}

export function logSystemStatus(): void {
    const metrics = getSystemMetrics();
    const performance = getPerformanceMetrics();
    
    console.log(`\n📊 SYSTEM STATUS`);
    console.log(`🟢 Sesiones activas: ${metrics.totalActiveSessions}`);
    console.log(`💬 Total interacciones: ${metrics.totalInteractions}`);
    console.log(`🎯 Buying Intent promedio: ${metrics.averageBuyingIntent}%`);
    console.log(`📈 Tasa de conversión: ${metrics.conversionRate}%`);
    console.log(`💾 Memoria en uso: ${(performance.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`⏱️ Tiempo respuesta promedio: ${performance.averageResponseTime}ms`);
    console.log(`🔄 Follow-ups en cola: ${performance.followUpQueueSize}`);
    console.log(`❤️ Salud del sistema: ${metrics.systemHealth.toUpperCase()}`);
    console.log(`\n`);
}

// ✅ INICIALIZACIÓN Y CONFIGURACIÓN FINAL

// Limpiar cache de procesamiento cada 10 minutos
setInterval(() => {
    if (global.processingCache) {
        global.processingCache.clear();
    }
}, 10 * 60 * 1000);

// Optimizar memoria cada hora
setInterval(() => {
    const result = optimizeMemoryUsage();
    if (result.optimized > 0) {
        console.log(`🚀 Memoria optimizada: ${result.before} → ${result.after} sesiones (-${result.optimized})`);
    }
}, 60 * 60 * 1000);

// Log de estado del sistema cada 30 minutos (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
        logSystemStatus();
    }, 30 * 60 * 1000);
}

console.log('✅ UserTrackingSystem completamente inicializado y optimizado');

// ✅ INTEGRACIÓN DE SISTEMAS DE CROSS-SELL Y REPORTES
import { crossSellSystem, CrossSellRecommendation } from '../services/crossSellSystem';
import { reportingSystem } from '../services/reportingSystem';

/**
 * ✅ GENERAR RECOMENDACIONES DE CROSS-SELL PARA UN USUARIO
 */
export async function generateCrossSellForUser(phoneNumber: string): Promise<CrossSellRecommendation[]> {
    const session = await getUserSession(phoneNumber);
    if (!session) {
        console.warn(`⚠️ No se encontró sesión para ${phoneNumber}`);
        return [];
    }

    const recommendations = crossSellSystem.generateRecommendations(session);
    console.log(`💎 Generadas ${recommendations.length} recomendaciones de cross-sell para ${phoneNumber}`);

    return recommendations;
}

/**
 * ✅ OBTENER MENSAJE DE CROSS-SELL FORMATEADO
 */
export async function getCrossSellMessage(phoneNumber: string): Promise<string> {
    const recommendations = await generateCrossSellForUser(phoneNumber);
    return crossSellSystem.generateCrossSellMessage(recommendations);
}

/**
 * ✅ AGREGAR PRODUCTO DE CROSS-SELL AL PEDIDO
 */
export async function addCrossSellProduct(phoneNumber: string, productId: string): Promise<boolean> {
    const session = await getUserSession(phoneNumber);
    if (!session) return false;

    const product = crossSellSystem.getProductById(productId);
    if (!product) {
        console.warn(`⚠️ Producto ${productId} no encontrado`);
        return false;
    }

    if (!session.orderData) {
        session.orderData = {
            items: [],
            type: 'customized',
            status: 'draft'
        };
    }

    if (!session.orderData.items) {
        session.orderData.items = [];
    }

    session.orderData.items.push({
        id: product.id,
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        unitPrice: product.price
    });

    const currentTotal = session.orderData.totalPrice || session.price || 0;
    session.orderData.totalPrice = currentTotal + product.price;

    session.interactions.push({
        timestamp: new Date(),
        message: `Agregó producto: ${product.name}`,
        type: 'system_event',
        intent: 'cross_sell_added',
        sentiment: 'positive',
        engagement_level: 80,
        channel: 'WhatsApp'
    });

    await updateUserSession(phoneNumber, `Producto agregado: ${product.name}`, 'cross_sell', null, false);
    console.log(`✅ Producto ${product.name} agregado al pedido de ${phoneNumber}`);

    return true;
}

/**
 * ✅ GENERAR REPORTE COMPLETO DEL NEGOCIO
 */
export async function generateBusinessReport(): Promise<string> {
    const sessions = Array.from(userSessions.values());
    return await reportingSystem.generateBusinessReport(sessions);
}

/**
 * ✅ GENERAR REPORTE DE PEDIDOS PENDIENTES
 */
export function generatePendingOrdersReport(): string {
    const sessions = Array.from(userSessions.values());
    return reportingSystem.generatePendingOrdersReport(sessions);
}

/**
 * ✅ OBTENER MÉTRICAS DE NEGOCIO EN TIEMPO REAL
 */
export async function getBusinessMetrics() {
    const sessions = Array.from(userSessions.values());

    let totalOrders = 0;
    let pendingOrders = 0;
    let completedOrders = 0;
    let totalRevenue = 0;
    let activeUsers = 0;

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    sessions.forEach(session => {
        if (session.orderData) {
            totalOrders++;

            if (session.orderData.status === 'confirmed' || session.orderData.status === 'processing') {
                completedOrders++;
                totalRevenue += session.orderData.totalPrice || session.orderData.price || 0;
            } else if (session.orderData.status === 'draft') {
                pendingOrders++;
            }
        }

        if (session.lastActivity && session.lastActivity > last24h) {
            activeUsers++;
        }
    });

    return {
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue,
        activeUsers,
        totalUsers: sessions.length,
        conversionRate: sessions.length > 0 ? (completedOrders / sessions.length) * 100 : 0
    };
}

/**
 * ✅ OBTENER PRODUCTOS TECNOLÓGICOS DISPONIBLES
 */
export function getTechProducts() {
    return crossSellSystem.getAllProducts();
}

/**
 * ✅ OBTENER PRODUCTOS POR CATEGORÍA
 */
export function getTechProductsByCategory(category: string) {
    return crossSellSystem.getProductsByCategory(category);
}

/**
 * ✅ VERIFICAR Y CREAR PEDIDO AUTOMÁTICO BASADO EN PREFERENCIAS
 */
export async function createAutomaticOrder(phoneNumber: string): Promise<boolean> {
    const session = await getUserSession(phoneNumber);
    if (!session) return false;

    if (!session.contentType || !session.capacity) {
        console.warn(`⚠️ Faltan datos para crear pedido automático: ${phoneNumber}`);
        return false;
    }

    const prices: Record<string, number> = {
        '8GB': 59900,
        '32GB': 89900,
        '64GB': 129900,
        '128GB': 169900,
        '256GB': 249900,
        '512GB': 399900
    };

    const basePrice = prices[session.capacity] || 89900;
    const orderId = `ORD-${Date.now()}-${phoneNumber.slice(-4)}`;

    session.orderId = orderId;
    session.orderData = {
        id: orderId,
        orderNumber: orderId,
        items: [{
            id: `ITEM-${Date.now()}`,
            productId: `USB-${session.contentType}-${session.capacity}`,
            name: `USB ${session.capacity} - ${session.contentType}`,
            price: basePrice,
            quantity: 1,
            unitPrice: basePrice
        }],
        type: 'customized',
        status: 'draft',
        totalPrice: basePrice,
        price: basePrice,
        createdAt: new Date(),
        startedAt: new Date(),
        customerInfo: {
            name: session.name,
            phone: phoneNumber,
            address: session.customerData?.direccion
        }
    };

    session.stage = 'closing';
    session.buyingIntent = Math.min((session.buyingIntent || 50) + 20, 100);

    session.interactions.push({
        timestamp: new Date(),
        message: `Pedido automático creado: ${orderId}`,
        type: 'system_event',
        intent: 'order_created',
        sentiment: 'positive',
        engagement_level: 90,
        channel: 'WhatsApp'
    });

    await updateUserSession(phoneNumber, `Pedido automático creado: ${orderId}`, 'order_creation', null, false);
    console.log(`✅ Pedido automático creado para ${phoneNumber}: ${orderId}`);

    return true;
}

/**
 * ✅ OBTENER RESUMEN DE PREFERENCIAS DEL USUARIO
 */
export async function getUserPreferencesSummary(phoneNumber: string): Promise<string> {
    const session = await getUserSession(phoneNumber);
    if (!session) return 'No se encontró información del usuario';

    let summary = '📊 *RESUMEN DE PREFERENCIAS*\n';
    summary += '━━━━━━━━━━━━━━━━━━━━\n\n';

    if (session.contentType) {
        summary += `🎵 Tipo de contenido: ${session.contentType}\n`;
    }

    if (session.capacity) {
        summary += `💾 Capacidad: ${session.capacity}\n`;
    }

    if (session.selectedGenres && session.selectedGenres.length > 0) {
        summary += `🎼 Géneros: ${session.selectedGenres.join(', ')}\n`;
    }

    if (session.mentionedArtists && session.mentionedArtists.length > 0) {
        summary += `🎤 Artistas: ${session.mentionedArtists.join(', ')}\n`;
    }

    if (session.preferences) {
        if (session.preferences.musicGenres && session.preferences.musicGenres.length > 0) {
            summary += `🎶 Géneros musicales: ${session.preferences.musicGenres.join(', ')}\n`;
        }
    }

    if (session.price) {
        summary += `💰 Precio: $${session.price.toLocaleString()}\n`;
    }

    if (session.orderData && session.orderData.items && session.orderData.items.length > 0) {
        summary += `\n📦 *PRODUCTOS EN EL PEDIDO*\n`;
        session.orderData.items.forEach((item, index) => {
            summary += `${index + 1}. ${item.name} - $${item.price.toLocaleString()}\n`;
        });
        summary += `\n💵 Total: $${(session.orderData.totalPrice || 0).toLocaleString()}\n`;
    }

    summary += '\n━━━━━━━━━━━━━━━━━━━━';

    return summary;
}

// ✅ EXPORTACIONES FINALES
export default {
    getUserSession,
    updateUserSession,
    trackUserResponse,
    getUserAnalytics,
    getSystemMetrics,
    getPerformanceMetrics,
    cleanupInactiveSessions,
    optimizeMemoryUsage,
    debugSession,
    logSystemStatus,
    setBotInstance,
    clearUserSession,
    markVIP,
    blacklistUser,
    exportUserSessions,
    importUserSessions,
    generateCrossSellForUser,
    getCrossSellMessage,
    addCrossSellProduct,
    getTechProducts,
    getTechProductsByCategory,
    generateBusinessReport,
    generatePendingOrdersReport,
    getBusinessMetrics,
    createAutomaticOrder,
    getUserPreferencesSummary
};

