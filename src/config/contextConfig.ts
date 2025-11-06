// src/config/contextConfig.ts
export const CONTEXT_CONFIG = {
    // ✅ TIEMPO MÁXIMO PARA CONTEXTOS CRÍTICOS (en segundos)
    CRITICAL_CONTEXT_TIMEOUT: 300, // 5 minutos
    
    // ✅ TIEMPO MÁXIMO ENTRE INTERACCIONES (en segundos)
    MAX_INTERACTION_GAP: 60, // 1 minuto
    
    // ✅ CONTEXTOS QUE REQUIEREN RESPUESTA INMEDIATA
    IMMEDIATE_RESPONSE_CONTEXTS: [
        'collecting_customer_data',
        'payment_processing',
        'order_confirmation'
    ],
    
    // ✅ PALABRAS QUE SIEMPRE DEBEN SER PROCESADAS
    PRIORITY_KEYWORDS: [
        'cancelar', 'ayuda', 'soporte', 'problema', 'error'
    ],
    
    // ✅ FLUJOS QUE PUEDEN SER INTERRUMPIDOS
    INTERRUPTIBLE_FLOWS: [
        'welcomeFlow', 'general'
    ],
    
    // ✅ CONFIGURACIÓN DE LOGGING
    LOGGING: {
        ENABLED: true,
        LOG_LEVEL: 'info', // 'debug', 'info', 'warn', 'error'
        LOG_CONTEXT_ANALYSIS: true
    }
};
