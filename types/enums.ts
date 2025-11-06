// ==========================================
// === ENUMS PRINCIPALES DEL SISTEMA ===
// ==========================================

export enum OrderStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    ERROR = 'error',
    FAILED = 'failed'
}

export enum PaymentMethod {
    CREDIT_CARD = 'credit_card',
    DEBIT_CARD = 'debit_card',
    PAYPAL = 'paypal',
    BANK_TRANSFER = 'bank_transfer',
    CASH_ON_DELIVERY = 'cash_on_delivery',
    CASH = 'cash',
    MOBILE_PAYMENT = 'mobile_payment',
    CRYPTOCURRENCY = 'cryptocurrency',
    STORE_CREDIT = 'store_credit',
    GIFT_CARD = 'gift_card'
}

export enum ProductType {
    MUSIC = 'music',
    VIDEO = 'video',
    MOVIES = 'movies',
    SERIES = 'series',
    MIXED = 'mixed',
    GAMES = 'games',
    SOFTWARE = 'software',
    DOCUMENTS = 'documents'
}

// ==========================================
// === ENUMS DE CONVERSACIÓN Y SESIÓN ===
// ==========================================

export enum ConversationStage {
    INITIAL = 'initial',
    GREETING = 'greeting',
    PRODUCT_SELECTION = 'product_selection',
    CAPACITY_SELECTION = 'capacity_selection',
    CUSTOMIZATION = 'customization',
    PREFERENCES = 'preferences',
    PRICE_CONFIRMATION = 'price_confirmation',
    ORDER_DETAILS = 'order_details',
    PAYMENT_INFO = 'payment_info',
    CONFIRMATION = 'confirmation',
    COMPLETED = 'completed',
    ABANDONED = 'abandoned',
    FOLLOW_UP = 'follow_up'
}

export enum BuyingIntentLevel {
    NONE = 0,
    LOW = 1,
    MEDIUM = 2,
    HIGH = 3,
    VERY_HIGH = 4,
    READY_TO_BUY = 5
}

export enum UserType {
    NEW = 'new',
    RETURNING = 'returning',
    FREQUENT = 'frequent',
    VIP = 'vip',
    INACTIVE = 'inactive'
}

// ==========================================
// === ENUMS DE MENSAJES Y COMUNICACIÓN ===
// ==========================================

export enum MessageType {
    INCOMING = 'incoming',
    OUTGOING = 'outgoing',
    AUTOMATED = 'automated',
    SYSTEM = 'system',
    NOTIFICATION = 'notification'
}

export enum InteractionType {
    MESSAGE = 'message',
    BUTTON_CLICK = 'button_click',
    MENU_SELECTION = 'menu_selection',
    PRODUCT_VIEW = 'product_view',
    CART_ADD = 'cart_add',
    CART_REMOVE = 'cart_remove',
    ORDER_START = 'order_start',
    ORDER_COMPLETE = 'order_complete',
    PAYMENT_START = 'payment_start',
    PAYMENT_COMPLETE = 'payment_complete',
    SUPPORT_REQUEST = 'support_request',
    FEEDBACK = 'feedback'
}

export enum FollowUpType {
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low',
    ABANDONED_CART = 'abandoned_cart',
    POST_PURCHASE = 'post_purchase',
    FEEDBACK_REQUEST = 'feedback_request',
    PROMOTIONAL = 'promotional'
}

// ==========================================
// === ENUMS DE CAPACIDAD Y ESPECIFICACIONES ===
// ==========================================

export enum USBCapacity {
    GB_8 = '8GB',
    GB_16 = '16GB',
    GB_32 = '32GB',
    GB_64 = '64GB',
    GB_128 = '128GB',
    GB_256 = '256GB',
    GB_512 = '512GB',
    TB_1 = '1TB',
    TB_2 = '2TB'
}

export enum USBType {
    USB_2_0 = 'USB 2.0',
    USB_3_0 = 'USB 3.0',
    USB_3_1 = 'USB 3.1',
    USB_C = 'USB-C',
    MICRO_USB = 'Micro USB'
}

export enum Quality {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    ULTRA_HIGH = 'ultra_high',
    LOSSLESS = 'lossless'
}

// ==========================================
// === ENUMS DE GÉNEROS Y CATEGORÍAS ===
// ==========================================

export enum MusicGenre {
    ROCK = 'rock',
    POP = 'pop',
    JAZZ = 'jazz',
    CLASSICAL = 'classical',
    ELECTRONIC = 'electronic',
    HIP_HOP = 'hip_hop',
    REGGAE = 'reggae',
    COUNTRY = 'country',
    BLUES = 'blues',
    FOLK = 'folk',
    METAL = 'metal',
    PUNK = 'punk',
    REGGAETON = 'reggaeton',
    SALSA = 'salsa',
    BACHATA = 'bachata',
    MERENGUE = 'merengue',
    CUMBIA = 'cumbia',
    VALLENATO = 'vallenato',
    RANCHERA = 'ranchera',
    BANDA = 'banda'
}

export enum VideoCategory {
    MOVIES = 'movies',
    SERIES = 'series',
    DOCUMENTARIES = 'documentaries',
    MUSIC_VIDEOS = 'music_videos',
    CONCERTS = 'concerts',
    TUTORIALS = 'tutorials',
    SPORTS = 'sports',
    NEWS = 'news',
    KIDS = 'kids',
    ANIMATION = 'animation'
}

export enum MovieGenre {
    ACTION = 'action',
    ADVENTURE = 'adventure',
    COMEDY = 'comedy',
    DRAMA = 'drama',
    HORROR = 'horror',
    THRILLER = 'thriller',
    ROMANCE = 'romance',
    SCI_FI = 'sci_fi',
    FANTASY = 'fantasy',
    MYSTERY = 'mystery',
    CRIME = 'crime',
    DOCUMENTARY = 'documentary',
    ANIMATION = 'animation',
    FAMILY = 'family',
    MUSICAL = 'musical',
    WAR = 'war',
    WESTERN = 'western',
    BIOGRAPHY = 'biography',
    HISTORY = 'history',
    SPORT = 'sport'
}

// ==========================================
// === ENUMS DE ANALYTICS Y EVENTOS ===
// ==========================================

export enum AnalyticsEventType {
    USER_JOINED = 'user_joined',
    MESSAGE_SENT = 'message_sent',
    MESSAGE_RECEIVED = 'message_received',
    PRODUCT_VIEWED = 'product_viewed',
    CART_UPDATED = 'cart_updated',
    ORDER_STARTED = 'order_started',
    ORDER_COMPLETED = 'order_completed',
    ORDER_CANCELLED = 'order_cancelled',
    PAYMENT_INITIATED = 'payment_initiated',
    PAYMENT_COMPLETED = 'payment_completed',
    PAYMENT_FAILED = 'payment_failed',
    FOLLOW_UP_SENT = 'follow_up_sent',
    CART_ABANDONED = 'cart_abandoned',
    CART_RECOVERED = 'cart_recovered',
    CART_RECOVERY_MESSAGE_SENT = 'cart_recovery_message_sent',
    CART_RECOVERY_REJECTED = 'cart_recovery_rejected',
    CART_RECOVERY_ERROR = 'cart_recovery_error',
    USER_FEEDBACK = 'user_feedback',
    SUPPORT_REQUEST = 'support_request',
    ERROR_OCCURRED = 'error_occurred',
    SESSION_STARTED = 'session_started',
    SESSION_ENDED = 'session_ended'
}

// ==========================================
// === ENUMS DE RECUPERACIÓN DE CARRITOS ===
// ==========================================

export enum CartRecoveryStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    RECOVERED = 'recovered',
    FAILED = 'failed',
    CANCELLED = 'cancelled'
}

export enum RecoveryMessageType {
    INITIAL = 'initial',
    FOLLOWUP = 'followup',
    FINAL = 'final',
    INCENTIVE = 'incentive',
    LAST_CHANCE = 'last_chance'
}

export enum IncentiveType {
    NONE = 'none',
    DISCOUNT = 'discount',
    FREE_SHIPPING = 'free_shipping',
    COMBO = 'combo',
    GIFT = 'gift',
    LOYALTY_POINTS = 'loyalty_points'
}

// ==========================================
// === ENUMS DE NOTIFICACIONES ===
// ==========================================

export enum NotificationType {
    ORDER_CONFIRMATION = 'order_confirmation',
    PAYMENT_RECEIVED = 'payment_received',
    ORDER_PROCESSING = 'order_processing',
    ORDER_READY = 'order_ready',
    ORDER_SHIPPED = 'order_shipped',
    ORDER_DELIVERED = 'order_delivered',
    FOLLOW_UP = 'follow_up',
    PROMOTIONAL = 'promotional',
    SYSTEM_ALERT = 'system_alert',
    REMINDER = 'reminder'
}

export enum NotificationPriority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    URGENT = 'urgent'
}

// ==========================================
// === ENUMS DE ESTADO DEL SISTEMA ===
// ==========================================

export enum SystemStatus {
    ONLINE = 'online',
    OFFLINE = 'offline',
    MAINTENANCE = 'maintenance',
    ERROR = 'error',
    DEGRADED = 'degraded'
}

export enum ServiceStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SUSPENDED = 'suspended',
    MAINTENANCE = 'maintenance'
}

// ==========================================
// === ENUMS DE CONFIGURACIÓN ===
// ==========================================

export enum Language {
    SPANISH = 'es',
    ENGLISH = 'en',
    PORTUGUESE = 'pt',
    FRENCH = 'fr'
}

export enum Currency {
    USD = 'USD',
    EUR = 'EUR',
    COP = 'COP',
    MXN = 'MXN',
    ARS = 'ARS',
    BRL = 'BRL'
}

export enum TimeZone {
    UTC = 'UTC',
    BOGOTA = 'America/Bogota',
    MEXICO_CITY = 'America/Mexico_City',
    BUENOS_AIRES = 'America/Argentina/Buenos_Aires',
    SAO_PAULO = 'America/Sao_Paulo',
    NEW_YORK = 'America/New_York',
    LOS_ANGELES = 'America/Los_Angeles'
}

// ==========================================
// === ENUMS DE ERRORES ===
// ==========================================

export enum ErrorType {
    VALIDATION_ERROR = 'validation_error',
    DATABASE_ERROR = 'database_error',
    NETWORK_ERROR = 'network_error',
    AUTHENTICATION_ERROR = 'authentication_error',
    AUTHORIZATION_ERROR = 'authorization_error',
    PAYMENT_ERROR = 'payment_error',
    SYSTEM_ERROR = 'system_error',
    USER_ERROR = 'user_error',
    EXTERNAL_SERVICE_ERROR = 'external_service_error'
}

export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

// ==========================================
// === FUNCIONES AUXILIARES CORREGIDAS ===
// ==========================================

/**
 * Obtiene todos los valores de un enum como array
 */
export function getEnumValues<T extends Record<string, string | number>>(enumObject: T): Array<T[keyof T]> {
    return Object.values(enumObject) as Array<T[keyof T]>;
}

/**
 * Verifica si un valor existe en un enum
 */
export function isValidEnumValue<T extends Record<string, string | number>>(
    enumObject: T, 
    value: any
): value is T[keyof T] {
    return Object.values(enumObject).includes(value);
}

/**
 * Obtiene las claves de un enum como array
 */
export function getEnumKeys<T extends Record<string, string | number>>(enumObject: T): Array<keyof T> {
    return Object.keys(enumObject) as Array<keyof T>;
}

/**
 * Convierte un string a un valor de enum válido o retorna un valor por defecto
 */
export function toEnumValue<T extends Record<string, string | number>>(
    enumObject: T,
    value: string,
    defaultValue: T[keyof T]
): T[keyof T] {
    return isValidEnumValue(enumObject, value) ? value : defaultValue;
}

/**
 * Obtiene un valor aleatorio de un enum
 */
export function getRandomEnumValue<T extends Record<string, string | number>>(enumObject: T): T[keyof T] {
    const values = getEnumValues(enumObject);
    return values[Math.floor(Math.random() * values.length)];
}

/**
 * Convierte un enum a un array de opciones para formularios
 */
export function enumToOptions<T extends Record<string, string | number>>(
    enumObject: T,
    labels?: Record<T[keyof T], string>
): Array<{ value: T[keyof T]; label: string }> {
    return getEnumValues(enumObject).map(value => ({
        value,
        label: labels?.[value] || String(value)
    }));
}

// ==========================================
// === MAPEOS Y TRADUCCIONES ===
// ==========================================

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: 'Pendiente',
    [OrderStatus.PROCESSING]: 'Procesando',
    [OrderStatus.COMPLETED]: 'Completado',
    [OrderStatus.CANCELLED]: 'Cancelado',
    [OrderStatus.ERROR]: 'Error',
    [OrderStatus.FAILED]: 'Fallido'
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    [PaymentMethod.CREDIT_CARD]: 'Tarjeta de Crédito',
    [PaymentMethod.DEBIT_CARD]: 'Tarjeta de Débito',
    [PaymentMethod.PAYPAL]: 'PayPal',
    [PaymentMethod.BANK_TRANSFER]: 'Transferencia Bancaria',
    [PaymentMethod.CASH_ON_DELIVERY]: 'Pago Contra Entrega',
    [PaymentMethod.CASH]: 'Efectivo',
    [PaymentMethod.MOBILE_PAYMENT]: 'Pago Móvil',
    [PaymentMethod.CRYPTOCURRENCY]: 'Criptomoneda',
    [PaymentMethod.STORE_CREDIT]: 'Crédito de Tienda',
    [PaymentMethod.GIFT_CARD]: 'Tarjeta de Regalo'
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
    [ProductType.MUSIC]: 'Música',
    [ProductType.VIDEO]: 'Videos',
    [ProductType.MOVIES]: 'Películas',
    [ProductType.SERIES]: 'Series',
    [ProductType.MIXED]: 'Mixto',
    [ProductType.GAMES]: 'Juegos',
    [ProductType.SOFTWARE]: 'Software',
    [ProductType.DOCUMENTS]: 'Documentos'
};

export const CONVERSATION_STAGE_LABELS: Record<ConversationStage, string> = {
    [ConversationStage.INITIAL]: 'Inicial',
    [ConversationStage.GREETING]: 'Saludo',
    [ConversationStage.PRODUCT_SELECTION]: 'Selección de Producto',
    [ConversationStage.CAPACITY_SELECTION]: 'Selección de Capacidad',
    [ConversationStage.CUSTOMIZATION]: 'Personalización',
    [ConversationStage.PREFERENCES]: 'Preferencias',
    [ConversationStage.PRICE_CONFIRMATION]: 'Confirmación de Precio',
    [ConversationStage.ORDER_DETAILS]: 'Detalles del Pedido',
    [ConversationStage.PAYMENT_INFO]: 'Información de Pago',
    [ConversationStage.CONFIRMATION]: 'Confirmación',
    [ConversationStage.COMPLETED]: 'Completado',
    [ConversationStage.ABANDONED]: 'Abandonado',
    [ConversationStage.FOLLOW_UP]: 'Seguimiento'
};

export const USB_CAPACITY_LABELS: Record<USBCapacity, string> = {
    [USBCapacity.GB_8]: '8 GB',
    [USBCapacity.GB_16]: '16 GB',
    [USBCapacity.GB_32]: '32 GB',
    [USBCapacity.GB_64]: '64 GB',
    [USBCapacity.GB_128]: '128 GB',
    [USBCapacity.GB_256]: '256 GB',
    [USBCapacity.GB_512]: '512 GB',
    [USBCapacity.TB_1]: '1 TB',
    [USBCapacity.TB_2]: '2 TB'
};

export const BUYING_INTENT_LABELS: Record<BuyingIntentLevel, string> = {
    [BuyingIntentLevel.NONE]: 'Sin Interés',
    [BuyingIntentLevel.LOW]: 'Interés Bajo',
    [BuyingIntentLevel.MEDIUM]: 'Interés Medio',
    [BuyingIntentLevel.HIGH]: 'Interés Alto',
    [BuyingIntentLevel.VERY_HIGH]: 'Interés Muy Alto',
    [BuyingIntentLevel.READY_TO_BUY]: 'Listo para Comprar'
};

// ==========================================
// === CONSTANTES DE CONFIGURACIÓN ===
// ==========================================

export const DEFAULT_VALUES = {
    ORDER_STATUS: OrderStatus.PENDING,
    PAYMENT_METHOD: PaymentMethod.CASH,
    PRODUCT_TYPE: ProductType.MIXED,
    CONVERSATION_STAGE: ConversationStage.INITIAL,
    BUYING_INTENT: BuyingIntentLevel.NONE,
    USER_TYPE: UserType.NEW,
    MESSAGE_TYPE: MessageType.INCOMING,
    FOLLOW_UP_TYPE: FollowUpType.LOW,
    USB_CAPACITY: USBCapacity.GB_32,
    QUALITY: Quality.HIGH,
    LANGUAGE: Language.SPANISH,
    CURRENCY: Currency.COP,
    TIMEZONE: TimeZone.BOGOTA
} as const;

export const SYSTEM_LIMITS = {
    MAX_FOLLOW_UP_ATTEMPTS: 3,
    MAX_CART_RECOVERY_MESSAGES: 4,
    SESSION_TIMEOUT_HOURS: 24,
    INACTIVE_USER_DAYS: 30,
    MAX_MESSAGE_LENGTH: 4096,
    MAX_ORDERS_PER_USER: 100,
    MIN_ORDER_VALUE: 10000, // En pesos colombianos
    MAX_ORDER_VALUE: 5000000 // En pesos colombianos
} as const;

// ==========================================
// === VALIDADORES DE ENUM ===
// ==========================================

export class EnumValidator {
    static isValidOrderStatus(value: any): value is OrderStatus {
        return isValidEnumValue(OrderStatus, value);
    }

    static isValidPaymentMethod(value: any): value is PaymentMethod {
        return isValidEnumValue(PaymentMethod, value);
    }

    static isValidProductType(value: any): value is ProductType {
        return isValidEnumValue(ProductType, value);
    }

    static isValidConversationStage(value: any): value is ConversationStage {
        return isValidEnumValue(ConversationStage, value);
    }

    static isValidUSBCapacity(value: any): value is USBCapacity {
        return isValidEnumValue(USBCapacity, value);
    }

    static isValidBuyingIntentLevel(value: any): value is BuyingIntentLevel {
        return isValidEnumValue(BuyingIntentLevel, value);
    }
}

// ==========================================
// === CONVERTIDORES DE ENUM ===
// ==========================================

export class EnumConverter {
    static toOrderStatus(value: string): OrderStatus {
        return toEnumValue(OrderStatus, value, DEFAULT_VALUES.ORDER_STATUS);
    }

    static toPaymentMethod(value: string): PaymentMethod {
        return toEnumValue(PaymentMethod, value, DEFAULT_VALUES.PAYMENT_METHOD);
    }

    static toProductType(value: string): ProductType {
        return toEnumValue(ProductType, value, DEFAULT_VALUES.PRODUCT_TYPE);
    }

    static toConversationStage(value: string): ConversationStage {
        return toEnumValue(ConversationStage, value, DEFAULT_VALUES.CONVERSATION_STAGE);
    }

    static toUSBCapacity(value: string): USBCapacity {
        return toEnumValue(USBCapacity, value, DEFAULT_VALUES.USB_CAPACITY);
    }

    static toBuyingIntentLevel(value: number): BuyingIntentLevel {
        const validLevels = getEnumValues(BuyingIntentLevel);
        return validLevels.includes(value as BuyingIntentLevel) 
            ? value as BuyingIntentLevel 
            : DEFAULT_VALUES.BUYING_INTENT;
    }
}
