/**
 * Declaraciones globales para el sistema de venta de memorias USB
 * Tipos e interfaces centrales para toda la aplicación
 */

// ============== DECLARACIONES GLOBALES ==============

declare global {
    /**
     * Caché global de sesiones de usuario para acceso rápido en memoria
     */
    var userSessions: Map<string, UserSession>;

    /**
     * Instancia del bot para mensajes automáticos
     */
    var botInstance: any;

    /**
     * Caché de procesamiento para evitar duplicados
     */
    var processingCache: Map<string, number>;
}

/**
 * Contexto del bot con información del mensaje y usuario
 */
// Resumen demográfico
export interface DemographicsSummary {
    ageGroups: Array<{ range: string; count: number }>;
    genderDistribution: Array<{ gender: string; count: number }>;
    topCountries: Array<{ country: string; count: number }>;
    topCities: Array<{ city: string; count: number }>;
    occupations: Array<{ occupation: string; count: number }>;
    educationLevels: Array<{ level: string; count: number }>;
    incomeLevels: Array<{ level: string; count: number }>;

    // Mapas crudos para dashboards
    locations: Record<string, number>;     // país -> count
    genders: Record<string, number>;       // género -> count
    incomeRanges: Record<string, number>;  // ingreso -> count
}

// Resumen de preferencias
export interface PreferencesSummary {
    topGenres: Array<{ genre: string; count: number }>;
    topArtists: Array<{ artist: string; count: number }>;
    topMovieTypes: Array<{ type: string; count: number }>;
    topCapacities: Array<{ capacity: string; count: number }>;
    topColors: string[];
    topBrands: string[];
    topFeatures: string[];

    // Mapas crudos para dashboards
    musicGenres: Record<string, number>;
    capacities: Record<string, number>;
    colors: Record<string, number>;
    priceRanges: Record<string, number>;
    usagePatterns: Record<string, number>;

    languages: Array<{ language: string; count: number }>;
    notificationPreference: { enabled: number; disabled: number };

    favoriteBrands: Array<{ brand: string; count: number }>;
    favoriteDevices: Array<{ device: string; count: number }>;
    preferredChannels: Array<{ channel: string; count: number }>;
}

// Utilidad para representar capacidades válidas (opcional)
export type UsbCapacity = '8GB' | '32GB' | '64GB' | '128GB' | '256GB';

export interface BotContext {
    from: string;
    body: string;
    name?: string;
    pushName?: string;
    [key: string]: any;
}

// ============== INTERFACES PRIMARIAS Y CENTRALES ==============

/**
 * Representa la sesión completa y el estado de un usuario. Es la fuente de verdad 
 * para toda la información del cliente a lo largo de su interacción con el bot.
 */
interface SelectedProduct {
    id: string; // Identificador único del producto
    name: string; // Nombre del producto
    category: 'usb' | 'technology'; // Categoría del producto
    price: number; // Precio del producto
    quantity: number; // Cantidad seleccionada
    specifications?: {
        capacity?: UsbCapacity; // Capacidades para memorias USB
        type?: 'music' | 'videos' | 'mixed' | 'custom'; // Tipo de contenido para memorias USB
        features?: string[]; // Características adicionales para productos tecnológicos
    };
    customizationOptions?: {
        color?: string; // Color de la memoria USB o producto
        engraving?: string; // Texto de grabado en la memoria USB
        additionalAccessories?: string[]; // Accesorios adicionales para el producto
    };
    imageUrl?: string; // URL de la imagen del producto
    description?: string; // Descripción del producto
}

interface UserSession {
    // --- Identificadores ---
    phone: string;
    phoneNumber: string;
    name?: string;
    email?: string;
    pushToken?: string;

    // --- Estado y Flujo de la Conversación ---
    stage: 'initial' | 'interested' | 'customizing' | 'pricing' | 'closing' | 'converted' | 'completed' | 'abandoned' | 'inactive' | 'not_interested' | 'order_confirmed' | 'processing' | 'payment_confirmed' | 'shipping' | 'awaiting_payment' | 'checkout_started' | string; // Etapa del embudo de ventas
    currentFlow?: string; // El flujo de bot activo (e.g., 'musicUsb', 'datosCliente')
    currentStep?: string; // Paso específico dentro del flujo
    interactions: Interaction[]; // Historial de la conversación
    referralCount?: number; // Número de referidos generados por el usuario

    // --- Datos de Personalización y Pedido en Progreso ---
    orderId?: string; // ID del último pedido generado o en progreso
    contentType?: 'music' | 'videos' | 'movies' | 'mixed' | 'series' | 'documentaries' | 'custom';
    price?: number;
    selectedGenres?: string[];
    mentionedArtists?: string[];
    customerData?: CustomerData;
    customization?: CustomizationData;
    capacity?: UsbCapacity;
    secondUsb?: SecondUsb;
    requestedTitles?: string[];      // ← añadir
    addMusicCombo?: boolean;       // ← añadir
    addVideoCombo?: boolean;       // ← añadir

    // --- Datos de pedido (compatibilidad con código existente) ---
    orderData?: {
        items?: Array<{
            id: string;
            productId?: string;
            name: string;
            price: number;
            quantity: number;
            unitPrice?: number;
            capacity?: string; // Added to match OrderItem interface
        }>;
        type?: 'customized' | 'standard';
        product?: any;
        productType?: string;
        selectedGenre?: string;
        selectedCapacity?: string;
        price?: number;
        totalPrice?: number;
        step?: string;
        startedAt?: Date;
        status?: 'draft' | 'confirmed' | 'cancelled' | 'processing' | 'shipped';
        customerInfo?: {
            name?: string;
            phone?: string;
            address?: string;
        };
        paymentMethod?: any;
        finalPrice?: number;
        discount?: number;
        surcharge?: number;
        orderNumber?: string;
        confirmedAt?: Date;
        deliveryDate?: Date;
        createdAt?: Date;
        id?: string;
        total?: number;
        unitPrice?: number;
    };
    selectedProduct?: any; // Producto seleccionado actualmente
    cartData?: {
        selectedProduct?: SelectedProduct;
        items: Array<{
            id: string;
            name: string;
            price: number;
            quantity: number;
        }>;
        total?: number;
        discount?: number;
    };
    selectedProduct?: SelectedProduct;
    // --- Métricas y Análisis de IA ---
    buyingIntent: number; // Puntuación de 0 a 100 sobre la intención de compra
    interests: string[];
    aiAnalysis?: AIAnalysis; // Análisis detallado de la IA

    // --- Metadatos de la Sesión ---
    lastInteraction: Date;
    lastActivity?: Date;
    createdAt: Date;
    updatedAt: Date;
    isFirstMessage: boolean;
    isActive: boolean;
    isProcessing?: boolean; // Bloqueo para evitar acciones duplicadas
    tags?: ('VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer' | 'whatsapp_chat' | 'chat_activo' | 'decision_made' | 'capacity_selected' | 'not_interested' | 'do_not_disturb')[];
    isNewUser?: boolean;
    isReturningUser?: boolean;

    // --- Seguimiento (Follow-up) ---
    lastFollowUp?: Date;
    followUpSpamCount?: number;
    followUpCount?: number; // Alias para compatibilidad

    // --- New Follow-up Control Fields ---
    contactStatus?: 'ACTIVE' | 'OPT_OUT' | 'CLOSED'; // Contact status for follow-up control
    lastUserReplyAt?: Date; // Timestamp of last user reply
    lastUserReplyCategory?: 'NEGATIVE' | 'COMPLETED' | 'CONFIRMATION' | 'POSITIVE' | 'NEUTRAL'; // Category of last user reply
    followUpCount24h?: number; // Number of follow-ups sent in last 24 hours
    lastFollowUpResetAt?: Date; // Timestamp when followUpCount24h was last reset
    followUpAttempts?: number; // Number of follow-up attempts made (max 3 before marking not interested)
    lastFollowUpAttemptResetAt?: Date; // Timestamp when followUpAttempts was last reset
    cooldownUntil?: Date; // 2-day cooldown end timestamp after reaching 3 follow-up attempts

    // --- Follow-up Template Persistence (prevents repetition within X hours) ---
    lastFollowUpTemplateId?: string; // Last follow-up template ID used for this user
    lastFollowUpSentAt?: Date; // Timestamp when last follow-up was sent

    // --- Historial y Datos Adicionales ---
    totalOrders?: number;
    purchaseHistory?: PurchaseHistoryItem[];
    location?: string;
    demographics?: DemographicsData;
    conversationData?: Record<string, any>; // Contenedor genérico para datos misceláneos
    messageCount?: number;
    preferences?: {
        musicGenres?: string[];
        priceRange?: { min: number; max: number };
        capacity?: string[];
        videoQuality?: 'HD' | '4K';
        contentTypes?: string[];
        genres?: string[];
        artists?: string[];
        priceRange?: { min: number; max: number };
    };
    isVIP?: boolean;
    lastFollowUpTime?: number;
    lastFollowUpMsg?: string;
    lastUserResponseTime?: number;
    lastProcessedTime?: Date;
    lastProcessedMessage?: string;

    // --- Campos específicos para el sistema de matching ---
    movieGenres?: string[];
    secondUsb?: {
        capacity: string;
        price: number;
    };
    finalizedGenres?: string[];
    finalizedArtists?: string[];
    finalizedMoods?: string[];
    finalizedUsbName?: string;
    finalizedCapacity?: string;
    finalizedOrderAt?: string;
    lastProductOffered?: string;
    lastPurchaseStep?: string;
    purchaseCompleted?: boolean;
    upsellOfferSent?: boolean;
    unrecognizedResponses?: number;
    moodPreferences?: string[];
    touchpoints?: string[];
    conversionStage?: string;
    personalizationCount?: number;
    showedPreview?: boolean;
    preferredEras?: string[];
    videoQuality?: 'HD' | '4K';
    isBlacklisted?: boolean; // Indica si el usuario está en lista negra
    isPredetermined?: boolean;
    skipWelcome?: boolean;
}

// ============== INTERFACES PARA CARRITO Y PEDIDOS ==============

export interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

export interface CartData {
    id: string;
    items: CartItem[];
    total: number;
    createdAt: Date;
}

/**
 * Representa una única interacción (mensaje) dentro del historial de una conversación.
 */
interface Interaction {
    timestamp: Date;
    message: string;
    type: 'user_message' | 'bot_message' | 'system_event' | 'audio_received' | 'document_received';
    intent?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    engagement_level?: number; // Puntuación de 0 a 100 de qué tan "enganchado" está el usuario
    metadata?: Record<string, any>;
    channel?: string; // Canal de comunicación (e.g., 'whatsapp', 'telegram')
    respondedByBot?: boolean; // Indica si el bot respondió a esta interacción
}

/**
 * Extiende el contexto (`ctx`) de Builderbot para asegurar que la sesión de usuario completa
 * siempre esté disponible en los flujos de conversación.
 */
interface ExtendedContext {
    from: string;
    body: string;
    name?: string;
    pushName?: string;
    session: UserSession;
    [key: string]: any; // Permite otras propiedades del contexto original de Builderbot
}

// ============== INTERFACES DE SOPORTE Y DATOS ANIDADOS ==============

/**
 * Contiene el análisis avanzado generado por la IA sobre la sesión de un usuario.
 */
interface AIAnalysis {
    buyingIntent: number;
    interests: string[];
    nextBestAction: string; // Sugerencia para el siguiente paso del bot o de un agente
    riskLevel: 'low' | 'medium' | 'high'; // Riesgo de abandono del carrito o conversación
    engagementScore?: number;
    probabilityToConvert?: number;
    churnLikelihood?: number;
    detectedKeywords?: string[];
    confidenceScore?: number;
    recommendedProducts?: string[];
}

/**
 * Datos del cliente necesarios para el envío, facturación y contacto.
 */
interface CustomerData {
    nombre?: string;
    telefono?: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    metodoPago?: 'transferencia' | 'nequi' | 'daviplata' | 'efectivo' | 'tarjeta';
    email?: string;
    specialInstructions?: string;
}
/**
 * Datos específicos de la personalización de un producto.
 */
interface CustomizationData {
    step?: number;
    genres?: string[];
    artists?: string[];
    videos?: string[];
    videoArtists?: string[];
    movies?: string[];
    series?: string[];
    selectedType?: 'musica' | 'videos' | 'peliculas' | 'series' | 'documentales' | 'mixto';
    preferences?: {
        genres?: string[];
        artists?: string[];
        accessories?: {
            hasExpress?: boolean;
            hasGiftWrap?: boolean;
        }
        eras?: string[]; // e.g., '80s', '90s'
        moods?: string[]; // e.g., 'fiesta', 'relajante'
        titles?: string[];
        contentTypes?: string[];
    };
    accesories?: string[];
    usbCapacity?: UsbCapacity;
    usbLabel?: string;
    price?: number;
    totalPrice?: number;
    startedAt?: Date;
    lastUpdate?: string;
    estimatedContentCount?: number;
    usbName?: string;
    confidence?: number;
}
/**
 * Representa un item en el historial de compras del usuario.
 */
interface PurchaseHistoryItem {
    orderId: string;
    date: Date;
    total: number;
    items: {
        product: string;
        capacity: string;
        contentType: string;
        price: number;
        quantity: number;
    }[];
    status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
}

/**
 * Datos demográficos del usuario, ya sean inferidos o proporcionados.
 */
interface DemographicsData {
    age?: number;
    location?: string;
    gender?: 'male' | 'female' | 'other';
    language?: string;
    timezone?: string;
    deviceType?: string;
    [key: string]: any; // Para flexibilidad
}

// ============== INTERFACES PARA EL SISTEMA DE PEDIDOS ==============

/**
 * Item individual dentro de un pedido
 */
interface OrderItem {
    id?: string;
    name?: string;
    price: number;
    quantity: number;
    capacity: string;
    contentType: string;
    description: string;
    estimatedContent: string;
}

/**
 * Datos de envío para el pedido
 */
interface ShippingData {
    name: string;
    phone: string;
    city: string;
    address: string;
    specialInstructions?: string;
}

/**
 * Preferencias específicas para el contenido del pedido
 */
interface OrderPreferences {
    genres?: string[];
    artists?: string[];
    titles?: string[];
    moods?: string[];
    usbName?: string;
    contentTypes?: string[];
}

/**
 * Extras y promociones aplicadas al pedido
 */
interface OrderExtras {
    secondUsb?: {
        capacity: string;
        price: number;
    };
    finalPrice: number;
    discountApplied?: number;
    promoCode?: string;
    freeContent?: string[];
}

/**
 * Resultado del procesamiento de un pedido
 */
interface OrderResult {
    success: boolean;
    orderId: string;
    total: number;
    estimatedDelivery: string;
    updated: boolean;
    message?: string;
    warnings?: string[];
    items?: OrderItem[];
}

// ============== INTERFACES PARA EL MATCHING ENGINE ==============

/**
 * Opciones de configuración para el motor de matching
 */
interface MatchingOptions {
    detectNegations?: boolean;
    confidenceThreshold?: number;
    maxResults?: number;
    includeSimilar?: boolean;
    prioritizeRecent?: boolean;
}

/**
 * Resultado del proceso de matching de contenido
 */
interface MatchingResult {
    genres: string[];
    artists: string[];
    titles: string[];
    contentTypes: string[];
    confidence: number;
    recommendations: string[];
    metadata?: {
        detectedKeywords: string[];
        processedText: string;
        timestamp: string;
    };
}

// ============== INTERFACES PARA LA BASE DE DATOS ==============

/**
 * Interfaz para operaciones de base de datos de negocio
 */
interface BusinessDatabase {
    getUserSession(phone: string): Promise<UserSession | null>;
    updateUserSession(phone: string, data: Partial<UserSession>): Promise<boolean>;
    createOrder(order: OrderData): Promise<boolean>;
    getActiveUsers(hours?: number): Promise<UserSession[]>;
    getUserAnalytics(phone: string): Promise<any>;
    getUserOrders(phone: string): Promise<any[]>;
    getStockInfo(): Promise<Record<string, number>>;
    logMessage(message: LogMessage): Promise<void>;
    logInteraction(interaction: LogInteraction): Promise<void>;
    logError(error: LogError): Promise<void>;
    getSalesAnalytics(): Promise<any>;
    getDashboardData(): Promise<any>;
    getRouterStats(): Promise<any>;
    getConversionStats(): Promise<any>;
    getUserJourneyStats(): Promise<any>;
    getPerformanceStats(): Promise<any>;
    checkConnection(): Promise<boolean>;
    getTotalSessions(): Promise<number>;
    getTotalMessages(): Promise<number>;
    resetSpamCounters(hours: number): Promise<void>;
    cleanInactiveSessions(hours: number): Promise<void>;
    generateDailyStats(): Promise<void>;
}

/**
 * Datos completos de un pedido para persistencia
 */
interface OrderData {
    id: string;
    distribution?: import('../services/IntelligentOrderSystem').ContentDistribution;
    customerPhone: string;
    phoneNumber?: string;
    customerName?: string;
    productType?: string;
    capacity?: string;
    price?: number;
    items: OrderItem[];
    totalAmount: number;
    total?: number;
    discountAmount: number;
    shippingAddress: string;
    shippingPhone: string;
    status: string;
    preferences?: OrderPreferences;
    createdAt: Date;
    updatedAt?: Date;
    customization?: CustomizationData;
    orderNumber?: string;
    processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    customerId?: string;
    orderDate?: Date;
    paymentMethod?: string;
    usbLabel?: string;
}

/**
 * Mensaje para logging
 */
interface LogMessage {
    phone: string;
    message: string;
    type: 'incoming' | 'outgoing';
    automated?: boolean;
    timestamp: Date;
    flow?: string;
}

/**
 * Interacción para logging
 */
interface LogInteraction {
    phone: string;
    type: string;
    content: string;
    timestamp: Date;
    sentiment?: string;
    intent?: string;
}

/**
 * Error para logging
 */
interface LogError {
    type: string;
    error: string;
    stack?: string;
    timestamp: Date;
    phone?: string;
    flow?: string;
}

// ============== INTERFACES PARA SISTEMA DE SEGUIMIENTO ==============

/**
 * Evento de seguimiento para analytics
 */
interface FollowUpEvent {
    phone: string;
    type: 'high' | 'medium' | 'low';
    messages: string[];
    success: boolean;
    timestamp: Date;
    reason: string;
    buyingIntent: number;
}

/**
 * Configuración del sistema de seguimiento
 */
interface FollowUpSystemState {
    isRunning: boolean;
    lastExecution: number;
    processedUsers: Set<string>;
    errorCount: number;
    maxErrors: number;
}

// ============== INTERFACES PARA SISTEMA DE IA ==============

/**
 * Servicio de IA para análisis y recomendaciones
 */
interface AIService {
    isAvailable(): boolean;
    analyzeIntent(text: string, context: UserSession): Promise<any>;
    generateResponse(prompt: string, context: any): Promise<string>;
    getStats(): any;
}

/**
 * Monitoreo del sistema de IA
 */
interface AIMonitoring {
    getStats(): {
        totalRequests: number;
        successRate: number;
        averageResponseTime: number;
        errorCount: number;
    };
    logRequest(): void;
    logError(): void;
}

/**
 * Router inteligente para direccionamiento de flujos
 */
interface IntelligentRouter {
    analyzeAndRoute(message: string, session: UserSession): Promise<RouterDecision>;
}

/**
 * Decisión del router inteligente
 */
interface RouterDecision {
    action: string;
    confidence: number;
    reason: string;
    shouldIntercept: boolean;
    targetFlow?: string;
}

// ============== EXPORTACIONES ==============

export interface SecondUsb {
    capacity: UsbCapacity;
    price: number;
}

export {
    UserSession,
    Interaction,
    ExtendedContext,
    AIAnalysis,
    CustomerData,
    CustomizationData,
    PurchaseHistoryItem,
    DemographicsData,
    OrderItem,
    ShippingData,
    OrderPreferences,
    OrderExtras,
    OrderResult,
    MatchingOptions,
    MatchingResult,
    BusinessDatabase,
    OrderData,
    LogMessage,
    LogInteraction,
    LogError,
    FollowUpEvent,
    FollowUpSystemState,
    AIService,
    AIMonitoring,
    IntelligentRouter,
    RouterDecision
};

export type CustomerOrder = OrderData;

export enum OrderStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    SHIPPED = 'shipped'
}

export enum PaymentMethod {
    CASH = 'cash',
    TRANSFER = 'transfer',
    CARD = 'card',
    NEQUI = 'nequi',
    DAVIPLATA = 'daviplata'
}

export enum ProductType {
    MUSIC = 'music',
    VIDEOS = 'videos',
    MOVIES = 'movies',
    SERIES = 'series',
    DOCUMENTARIES = 'documentaries',
    MIXED = 'mixed',
    CUSTOM = 'custom'
}

// ============== INTERFACES DE ANALYTICS Y DATOS AGREGADOS ==============

/**
 * Datos de analytics para el sistema de tracking
 */
declare global {
    interface AnalyticsData {
        totalSessions: number;
        activeSessions: number;
        convertedSessions: number;
        conversionRate: number;
        averageSessionDuration: number;
        averageResponseTime: number;
        topGenres: Array<{ genre: string; count: number }>;
        topArtists: Array<{ artist: string; count: number }>;
        salesByCapacity: Record<string, number>;
        salesByContentType: Record<string, number>;
        sessionsByStage: Record<string, number>;
        dailyRevenue: Array<{ date: string; revenue: number }>;
        totalRevenue: number;
        blacklistCount: number;
        vipCount: number;
        sessionsByChannel: Record<string, number>;
        engagementMetrics: {
            averageEngagement: number;
            highEngagementCount: number;
            lowEngagementCount: number;
        };
    }
}

// ============== INTERFACES PARA SALES MAXIMIZER ==============

/**
 * Contexto de ventas para análisis y personalización
 */
export interface SalesContext {
    currentProduct?: string;
    currentCapacity?: UsbCapacity;
    userLocation?: string;
    timeOfDay?: number;
    dayOfWeek?: number;
    isReturningCustomer?: boolean;
    cartValue?: number;
    abandonedStep?: string;
    [key: string]: any;
}

/**
 * Mensaje de urgencia dinámico
 */
export interface UrgencyMessage {
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
    triggers: string[];
}

/**
 * Mensaje de prueba social
 */
export interface SocialProofMessage {
    type: 'volume' | 'testimonial' | 'location' | 'trending';
    message: string;
    credibility: number; // 0.0 - 1.0
}

/**
 * Recompensa de gamificación
 */
export interface GamificationReward {
    type: 'interaction_milestone' | 'challenge' | 'referral_program' | 'loyalty';
    title: string;
    description: string;
    discount?: number;
    badge?: string;
    progress?: number;
    target?: number;
    reward?: string;
    currentReferrals?: number;
    nextReward?: string;
}

/**
 * Oferta dinámica generada por IA/comportamiento
 */
export interface DynamicOffer {
    type: string;
    discount: number;
    conditions: string[];
    validUntil: Date;
    personalizedMessage: string;
}

/**
 * Motor de urgencia (interfaz)
 */
export interface UrgencyEngine {
    calculateUrgencyLevel(userSession: UserSession, context: SalesContext): Promise<'HIGH' | 'MEDIUM' | 'LOW'>;
    getActiveTriggers(userSession: UserSession): Promise<string[]>;
}

/**
 * Motor de prueba social (interfaz)
 */
export interface SocialProofEngine {
    getRelevantTestimonials(userSession: UserSession): Promise<{
        text: string;
        customerName: string;
        date: string;
        rating?: number;
    }[]>;
}

/**
 * Motor de gamificación (interfaz)
 */
export interface GamificationEngine {
    getUserLevel(phone: string): Promise<number>;
}

// ============== INTERFACES PARA PREMIUM CUSTOMER SERVICE ==============

/**
 * Agent - Represents a customer service agent
 */
export interface Agent {
    id: string;
    name: string;
    level: 'junior' | 'senior' | 'expert';
    available: boolean;
    specializations?: string[];
    rating?: number;
}

/**
 * ServiceResponse - Response from customer service interactions
 */
export interface ServiceResponse {
    message: string;
    resolved: boolean;
    followUp: boolean;
    escalated?: boolean;
    agentAssigned?: Agent;
}

/**
 * CustomerIssue - Represents a customer issue or complaint
 */
export interface CustomerIssue {
    id?: string;
    type?: 'DELIVERY_DELAY' | 'QUALITY_CONCERN' | 'TECHNICAL_SUPPORT' | 'BILLING' | 'OTHER';
    description?: string;
    orderId?: string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    createdAt?: Date;
    status?: 'open' | 'in_progress' | 'resolved' | 'closed';
}

/**
 * ResolutionResult - Result of issue resolution attempt
 */
export interface ResolutionResult {
    resolved: boolean;
    message: string;
    compensation?: {
        type: 'discount' | 'refund' | 'replacement' | 'replacement_and_refund' | 'credit';
        value?: number;
        description?: string;
    };
    followUp?: boolean;
    nextSteps?: string[];
}

/**
 * EscalationResult - Result of issue escalation
 */
export interface EscalationResult {
    escalationLevel: 'AUTOMATED' | 'REGULAR_AGENT' | 'SENIOR_AGENT' | 'MANAGER' | 'EXECUTIVE';
    assignedAgent?: Agent;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedResolution: number; // in minutes
    ticketId?: string;
    notificationSent?: boolean;
}

/**
 * SentimentAnalyzer - Interface for sentiment analysis
 */
export interface SentimentAnalyzer {
    analyze(message: string): Promise<{
        emotion: 'FRUSTRATED' | 'CONFUSED' | 'EXCITED' | 'SKEPTICAL' | 'NEUTRAL' | 'ANGRY' | 'HAPPY';
        confidence?: number;
        keywords?: string[];
    }>;
}

/**
 * AutomaticIssueResolver - Interface for automatic issue resolution
 */
export interface AutomaticIssueResolver {
    canResolve?(issue: CustomerIssue): Promise<boolean>;
    resolve?(issue: CustomerIssue): Promise<ResolutionResult>;
}

/**
 * EscalationManager - Interface for managing issue escalations
 */
export interface EscalationManager {
    shouldEscalate?(issue: CustomerIssue, userSession: UserSession): Promise<boolean>;
    escalate?(issue: CustomerIssue, userSession: UserSession): Promise<EscalationResult>;
    getAvailableAgent?(level: string): Promise<Agent | null>;
}

export type { AnalyticsData };

// Extender el ámbito global para las interfaces
// Al final del archivo global.ts
export {
    BotContext,
    UserSession,
    Interaction,
    ExtendedContext,
    AIAnalysis,
    CustomerData,
    CustomizationData,
    PurchaseHistoryItem,
    DemographicsData,
    SecondUsb,
    Agent,
    ServiceResponse,
    CustomerIssue,
    ResolutionResult,
    EscalationResult,
    SentimentAnalyzer,
    AutomaticIssueResolver,
    EscalationManager
};