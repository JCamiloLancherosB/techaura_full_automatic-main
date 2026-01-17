import type { UserSession } from '../../types/global';

/**
 * Función helper para crear sesiones válidas con todos los campos requeridos
 */
export function createCompleteUserSession(phone: string, overrides: Partial<UserSession> = {}): UserSession {
    const now = new Date();
    
    const defaultSession: UserSession = {
        phone: phone,
        phoneNumber: phone,
        name: overrides.name || '',
        stage: overrides.stage || 'initial',
        buyingIntent: overrides.buyingIntent || 0,
        interests: overrides.interests || [],
        interactions: overrides.interactions || [],
        conversationData: overrides.conversationData || {},
        lastInteraction: overrides.lastInteraction || now,
        lastFollowUp: overrides.lastFollowUp,
        followUpSpamCount: overrides.followUpSpamCount || 0,
        totalOrders: overrides.totalOrders || 0,
        location: overrides.location,
        email: overrides.email,
        createdAt: overrides.createdAt || now,
        updatedAt: overrides.updatedAt || now,
        messageCount: overrides.messageCount || 0,
        isActive: overrides.isActive !== undefined ? overrides.isActive : true,
        isFirstMessage: overrides.isFirstMessage !== undefined ? overrides.isFirstMessage : false,
        currentFlow: overrides.currentFlow,
        currentStep: overrides.currentStep,
        orderId: overrides.orderId,
        contentType: overrides.contentType,
        capacity: overrides.capacity,
        price: overrides.price,
        selectedGenres: overrides.selectedGenres || [],
        mentionedArtists: overrides.mentionedArtists || [],
        customerData: overrides.customerData,
        customization: overrides.customization,
        aiAnalysis: overrides.aiAnalysis,
        tags: overrides.tags || [],
        purchaseHistory: overrides.purchaseHistory || [],
        demographics: overrides.demographics,
        isProcessing: overrides.isProcessing || false
    };

    return { ...defaultSession, ...overrides };
}

/**
 * Función para validar que una sesión tenga todos los campos requeridos
 */
export function validateUserSession(session: Partial<UserSession>): session is UserSession {
    return !!(
        session.phone &&
        session.phoneNumber &&
        session.stage &&
        Array.isArray(session.interests) &&
        Array.isArray(session.interactions) &&
        session.lastInteraction &&
        session.createdAt &&
        typeof session.buyingIntent === 'number' &&
        typeof session.isActive === 'boolean' &&
        typeof session.isFirstMessage === 'boolean'
    );
}

/**
 * Función para migrar sesiones antiguas a la nueva estructura
 */
export function migrateUserSession(oldSession: any): UserSession {
    return createCompleteUserSession(oldSession.phone || oldSession.phoneNumber, {
        name: oldSession.name,
        stage: oldSession.stage || 'initial',
        buyingIntent: oldSession.buyingIntent || oldSession.buying_intent || 0,
        interests: Array.isArray(oldSession.interests) ? 
            oldSession.interests : 
            (typeof oldSession.interests === 'string' ? 
                JSON.parse(oldSession.interests || '[]') : []),
        interactions: Array.isArray(oldSession.interactions) ? 
            oldSession.interactions : [],
        conversationData: typeof oldSession.conversationData === 'object' ? 
            oldSession.conversationData : {},
        lastInteraction: oldSession.lastInteraction ? 
            new Date(oldSession.lastInteraction) : new Date(),
        location: oldSession.location,
        email: oldSession.email,
        totalOrders: oldSession.totalOrders || oldSession.total_orders || 0,
        contentType: oldSession.contentType,
        capacity: oldSession.capacity,
        price: oldSession.price,
        selectedGenres: oldSession.selectedGenres || [],
        mentionedArtists: oldSession.mentionedArtists || [],
        followUpSpamCount: oldSession.followUpSpamCount || oldSession.followUpCount || 0
    });
}

/**
 * Función para limpiar y normalizar datos de sesión
 */
export function sanitizeUserSession(session: Partial<UserSession>): Partial<UserSession> {
    const sanitized: Partial<UserSession> = {};
    
    // Campos de texto
    if (session.phone) sanitized.phone = String(session.phone).trim();
    if (session.phoneNumber) sanitized.phoneNumber = String(session.phoneNumber).trim();
    if (session.name) sanitized.name = String(session.name).trim();
    if (session.stage) sanitized.stage = String(session.stage).trim();
    if (session.location) sanitized.location = String(session.location).trim();
    if (session.email) sanitized.email = String(session.email).trim().toLowerCase();
    if (session.currentFlow) sanitized.currentFlow = String(session.currentFlow).trim();
    if (session.currentStep) sanitized.currentStep = String(session.currentStep).trim();
    if (session.orderId) sanitized.orderId = String(session.orderId).trim();
    if (session.contentType) sanitized.contentType = session.contentType;
    if (session.capacity) sanitized.capacity = session.capacity;
    
    // Campos numéricos
    if (session.buyingIntent !== undefined) {
        sanitized.buyingIntent = Math.max(0, Math.min(100, Number(session.buyingIntent) || 0));
    }
    if (session.followUpSpamCount !== undefined) {
        sanitized.followUpSpamCount = Math.max(0, Number(session.followUpSpamCount) || 0);
    }
    if (session.totalOrders !== undefined) {
        sanitized.totalOrders = Math.max(0, Number(session.totalOrders) || 0);
    }
    if (session.messageCount !== undefined) {
        sanitized.messageCount = Math.max(0, Number(session.messageCount) || 0);
    }
    if (session.price !== undefined) {
        sanitized.price = Math.max(0, Number(session.price) || 0);
    }
    
    // Arrays
    if (session.interests) {
        sanitized.interests = Array.isArray(session.interests) ? 
            session.interests.filter(item => item && typeof item === 'string') : [];
    }
    if (session.interactions) {
        sanitized.interactions = Array.isArray(session.interactions) ? 
            session.interactions : [];
    }
    if (session.selectedGenres) {
        sanitized.selectedGenres = Array.isArray(session.selectedGenres) ? 
            session.selectedGenres : [];
    }
    if (session.mentionedArtists) {
        sanitized.mentionedArtists = Array.isArray(session.mentionedArtists) ? 
            session.mentionedArtists : [];
    }
    if (session.tags) {
        sanitized.tags = Array.isArray(session.tags) ? session.tags : [];
    }
    if (session.purchaseHistory) {
        sanitized.purchaseHistory = Array.isArray(session.purchaseHistory) ? 
            session.purchaseHistory : [];
    }
    
    // Objetos
    if (session.conversationData) {
        sanitized.conversationData = typeof session.conversationData === 'object' ? 
            session.conversationData : {};
    }
    if (session.demographics) {
        sanitized.demographics = typeof session.demographics === 'object' ? 
            session.demographics : undefined;
    }
    if (session.customerData) {
        sanitized.customerData = typeof session.customerData === 'object' ? 
            session.customerData : undefined;
    }
    if (session.customization) {
        sanitized.customization = typeof session.customization === 'object' ? 
            session.customization : undefined;
    }
    if (session.aiAnalysis) {
        sanitized.aiAnalysis = typeof session.aiAnalysis === 'object' ? 
            session.aiAnalysis : undefined;
    }
    
    // Fechas
    if (session.lastInteraction) {
        sanitized.lastInteraction = session.lastInteraction instanceof Date ? 
            session.lastInteraction : new Date(session.lastInteraction);
    }
    if (session.lastFollowUp) {
        sanitized.lastFollowUp = session.lastFollowUp instanceof Date ? 
            session.lastFollowUp : new Date(session.lastFollowUp);
    }
    if (session.createdAt) {
        sanitized.createdAt = session.createdAt instanceof Date ? 
            session.createdAt : new Date(session.createdAt);
    }
    if (session.updatedAt) {
        sanitized.updatedAt = session.updatedAt instanceof Date ? 
            session.updatedAt : new Date(session.updatedAt);
    }
    
    // Booleanos
    if (session.isActive !== undefined) sanitized.isActive = Boolean(session.isActive);
    if (session.isFirstMessage !== undefined) sanitized.isFirstMessage = Boolean(session.isFirstMessage);
    if (session.isProcessing !== undefined) sanitized.isProcessing = Boolean(session.isProcessing);
    if (session.purchaseCompleted !== undefined) sanitized.purchaseCompleted = Boolean(session.purchaseCompleted);
    if (session.upsellOfferSent !== undefined) sanitized.upsellOfferSent = Boolean(session.upsellOfferSent);
    if (session.showedPreview !== undefined) sanitized.showedPreview = Boolean(session.showedPreview);
    
    return sanitized;
}

/**
 * Función para comparar dos sesiones y detectar cambios
 */
export function getSessionChanges(oldSession: UserSession, newSession: Partial<UserSession>): Partial<UserSession> {
    const changes: Partial<UserSession> = {};

    // Comparar campos básicos
    if (newSession.name !== undefined && newSession.name !== oldSession.name) {
        changes.name = newSession.name;
    }
    if (newSession.stage !== undefined && newSession.stage !== oldSession.stage) {
        changes.stage = newSession.stage;
    }
    if (newSession.buyingIntent !== undefined && newSession.buyingIntent !== oldSession.buyingIntent) {
        changes.buyingIntent = newSession.buyingIntent;
    }
    if (newSession.location !== undefined && newSession.location !== oldSession.location) {
        changes.location = newSession.location;
    }
    if (newSession.email !== undefined && newSession.email !== oldSession.email) {
        changes.email = newSession.email;
    }
    if (newSession.followUpSpamCount !== undefined && newSession.followUpSpamCount !== oldSession.followUpSpamCount) {
        changes.followUpSpamCount = newSession.followUpSpamCount;
    }
    if (newSession.totalOrders !== undefined && newSession.totalOrders !== oldSession.totalOrders) {
        changes.totalOrders = newSession.totalOrders;
    }
    if (newSession.messageCount !== undefined && newSession.messageCount !== oldSession.messageCount) {
        changes.messageCount = newSession.messageCount;
    }
    if (newSession.isActive !== undefined && newSession.isActive !== oldSession.isActive) {
        changes.isActive = newSession.isActive;
    }
    if (newSession.isFirstMessage !== undefined && newSession.isFirstMessage !== oldSession.isFirstMessage) {
        changes.isFirstMessage = newSession.isFirstMessage;
    }
    if (newSession.currentFlow !== undefined && newSession.currentFlow !== oldSession.currentFlow) {
        changes.currentFlow = newSession.currentFlow;
    }
    if (newSession.currentStep !== undefined && newSession.currentStep !== oldSession.currentStep) {
        changes.currentStep = newSession.currentStep;
    }
    if (newSession.contentType !== undefined && newSession.contentType !== oldSession.contentType) {
        changes.contentType = newSession.contentType;
    }
    if (newSession.capacity !== undefined && newSession.capacity !== oldSession.capacity) {
        changes.capacity = newSession.capacity;
    }
    if (newSession.price !== undefined && newSession.price !== oldSession.price) {
        changes.price = newSession.price;
    }
    if (newSession.orderId !== undefined && newSession.orderId !== oldSession.orderId) {
        changes.orderId = newSession.orderId;
    }
    if (newSession.isProcessing !== undefined && newSession.isProcessing !== oldSession.isProcessing) {
        changes.isProcessing = newSession.isProcessing;
    }

    // Comparar arrays
    if (newSession.interests && JSON.stringify(newSession.interests) !== JSON.stringify(oldSession.interests)) {
        changes.interests = newSession.interests;
    }
    if (newSession.interactions && JSON.stringify(newSession.interactions) !== JSON.stringify(oldSession.interactions)) {
        changes.interactions = newSession.interactions;
    }
    if (newSession.selectedGenres && JSON.stringify(newSession.selectedGenres) !== JSON.stringify(oldSession.selectedGenres)) {
        changes.selectedGenres = newSession.selectedGenres;
    }
    if (newSession.mentionedArtists && JSON.stringify(newSession.mentionedArtists) !== JSON.stringify(oldSession.mentionedArtists)) {
        changes.mentionedArtists = newSession.mentionedArtists;
    }

    // Comparar objetos
    if (newSession.conversationData && JSON.stringify(newSession.conversationData) !== JSON.stringify(oldSession.conversationData)) {
        changes.conversationData = newSession.conversationData;
    }
    if (newSession.demographics && JSON.stringify(newSession.demographics) !== JSON.stringify(oldSession.demographics)) {
        changes.demographics = newSession.demographics;
    }
    if (newSession.customerData && JSON.stringify(newSession.customerData) !== JSON.stringify(oldSession.customerData)) {
        changes.customerData = newSession.customerData;
    }

    return changes;
}

/**
 * Función para generar estadísticas de una sesión
 */
export function getSessionStats(session: UserSession): {
    engagementLevel: 'high' | 'medium' | 'low';
    daysSinceCreated: number;
    daysSinceLastActivity: number;
    interactionFrequency: number;
    conversionProbability: number;
} {
    const now = new Date();
    const created = new Date(session.createdAt);
    const lastActivity = new Date(session.lastInteraction);
    
    const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceLastActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calcular frecuencia de interacción
    const interactionFrequency = daysSinceCreated > 0 ? 
        (session.messageCount || 0) / daysSinceCreated : 0;
    
    // Determinar nivel de engagement
    let engagementLevel: 'high' | 'medium' | 'low' = 'low';
    if (interactionFrequency > 5 && daysSinceLastActivity < 1) {
        engagementLevel = 'high';
    } else if (interactionFrequency > 2 && daysSinceLastActivity < 3) {
        engagementLevel = 'medium';
    }
    
    // Calcular probabilidad de conversión
    let conversionProbability = session.buyingIntent || 0;
    
    // Ajustar basado en comportamiento
    if (session.stage === 'pricing' || session.stage === 'customizing' || session.stage === 'closing') {
        conversionProbability += 20;
    }
    if (session.totalOrders && session.totalOrders > 0) {
        conversionProbability += 30;
    }
    if (engagementLevel === 'high') {
        conversionProbability += 15;
    }
    if (daysSinceLastActivity > 7) {
        conversionProbability -= 20;
    }
    if (session.contentType && session.capacity) {
        conversionProbability += 10;
    }
    if (session.customerData) {
        conversionProbability += 15;
    }
    
    conversionProbability = Math.max(0, Math.min(100, conversionProbability));
    
    return {
        engagementLevel,
        daysSinceCreated,
        daysSinceLastActivity,
        interactionFrequency,
        conversionProbability
    };
}

/**
 * Función para determinar si un usuario necesita seguimiento
 */
export function needsFollowUp(session: UserSession): boolean {
    // No hacer seguimiento si el usuario ya compró
    if (session.purchaseCompleted) return false;
    
    // No hacer seguimiento si ya se enviaron muchos mensajes
    const spamCount = session.followUpSpamCount || 0;
    if (spamCount >= 3) return false;
    
    // No hacer seguimiento si el usuario está activo o acaba de interactuar
    const hoursSinceLastInteraction = (Date.now() - new Date(session.lastInteraction).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastInteraction < 12) return false;
    
    // IMPROVED: Don't follow up if user is in active purchase stages (recently active)
    const activeStages = [
        'personalization',
        'genre_selection', 
        'awaiting_capacity',
        'awaiting_payment',
        'checkout_started',
        'completed'
    ];
    
    if (activeStages.includes(session.stage)) {
        // If in active stage, require more time before follow-up
        if (hoursSinceLastInteraction < 24) {
            return false; // Wait at least 24h if user is in active purchase flow
        }
    }
    
    // Verificar si ya se hizo seguimiento recientemente
    if (session.lastFollowUp) {
        const hoursSinceLastFollowUp = (Date.now() - new Date(session.lastFollowUp).getTime()) / (1000 * 60 * 60);
        
        // Seguimiento más frecuente para alta intención de compra
        if (session.buyingIntent >= 70) {
            return hoursSinceLastFollowUp >= 24;
        }
        
        // Seguimiento menos frecuente para baja intención
        return hoursSinceLastFollowUp >= 48;
    }
    
    return true;
}

/**
 * Función para obtener el mensaje de seguimiento apropiado
 */
export function getFollowUpMessage(session: UserSession): string {
    const name = session.name || 'amigo/a';
    const spamCount = session.followUpSpamCount || 0;
    // Note: Using type assertion to access dynamic properties that vary by flow
    // These properties (movieGenres, etc.) may not be in the core interface but are added at runtime
    const sessionAny = session as any;
    
    // IMPROVED: Contextual messages based on stage and collected data
    
    // Stage: awaiting_capacity - User needs to select capacity
    if (session.stage === 'awaiting_capacity') {
        if (sessionAny.contentType) {
            return `Hola ${name}! 👋 ¿Ya decidiste la capacidad para tu USB de ${sessionAny.contentType}?\n\n💾 128GB es la más popular (perfecto balance). ¿La reservamos? 🎵✨\n\nResponde 1, 2, 3 o 4 para continuar.`;
        }
        return `Hola ${name}! 👋 ¿Qué capacidad te conviene más para tu USB personalizada?\n\n💡 La de 128GB es nuestra favorita (excelente relación precio-contenido).\n\nResponde 1, 2, 3 o 4 para reservar. 🎵`;
    }
    
    // Stage: personalization/genre_selection - User was selecting genres
    if (['personalization', 'genre_selection'].includes(session.stage)) {
        const hasGenres = sessionAny.selectedGenres?.length > 0 || sessionAny.movieGenres?.length > 0;
        if (hasGenres) {
            return `Hola ${name}! 👋 Ya tengo tus géneros favoritos guardados. 🎬\n\n¿Listo/a para ver las capacidades y elegir la tuya?\n\nEscribe "SI" y seguimos. ✨`;
        }
        return `Hola ${name}! 👋 ¿Seguís interesado/a en la USB personalizada?\n\n🎵 Cuéntame qué tipo de contenido te gusta y te armo el paquete perfecto. ¿Seguimos?`;
    }
    
    // Stage: prices_shown - User saw prices but didn't decide
    if (session.stage === 'prices_shown') {
        return `Hola ${name}! 👋 Vi que estabas revisando los precios. ¿Alguna duda?\n\n💡 Hoy tenemos envío GRATIS y la 128GB viene con descuento especial.\n\n¿Te la reservo? Responde 1, 2, 3 o 4. 🎁`;
    }
    
    // Stage: awaiting_payment - User selected but needs to provide data
    if (session.stage === 'awaiting_payment') {
        if (sessionAny.capacity) {
            return `Hola ${name}! 👋 Tu USB de ${sessionAny.capacity} está lista para confirmar. 📦\n\nSolo necesito tus datos de envío:\n• Nombre completo\n• Ciudad y dirección\n• Celular\n\n¿Los tienes a mano?`;
        }
        return `Hola ${name}! 👋 Tu USB está casi lista. 📦\n\nSolo faltan tus datos de envío para confirmar. ¿Me los compartes?`;
    }
    
    // Mensajes personalizados según el estado y progreso
    if (sessionAny.contentType && sessionAny.capacity) {
        const contentTypeLabel = sessionAny.contentType === 'music' ? 'música' : 
                                sessionAny.contentType === 'movies' ? 'películas' :
                                sessionAny.contentType === 'videos' ? 'videos' : sessionAny.contentType;
        return `Hola ${name}! 😊 Veo que estabas armando una USB de ${contentTypeLabel} de ${sessionAny.capacity}.

¿Te gustaría finalizarla?

🎁 Hoy tengo promoción especial + envío GRATIS
📦 Lista en 24-48 horas

¿La confirmamos? 🎵📀`;
    }
    
    if (sessionAny.contentType) {
        const contentTypeLabel = sessionAny.contentType === 'music' ? 'música' : 
                                sessionAny.contentType === 'movies' ? 'películas' :
                                sessionAny.contentType === 'videos' ? 'videos' : sessionAny.contentType;
        return `Hola ${name}! 👋 ¿Seguís interesado en la USB de ${contentTypeLabel}?

💡 Puedo ayudarte a elegir la capacidad perfecta según tu presupuesto.

¿Vemos las opciones? Responde SÍ 🎵✨`;
    }
    
    if (session.buyingIntent >= 70) {
        return `Hola ${name}! 😊 Veo que estabas muy interesado en nuestras USBs personalizadas.

🎁 Hoy tengo una oferta especial para ti:
✅ Envío GRATIS
✅ Descuento en la 128GB
✅ Lista en 24-48h

¿Te ayudo a armar la tuya? Responde SÍ 🎵📀`;
    }
    
    // Generic messages based on attempt count (with better CTAs)
    if (spamCount === 0) {
        return `Hola ${name}! 👋 ¿Cómo estás?

🎵 ¿Seguís interesado en nuestras USBs personalizadas?

Tengo capacidades desde 64GB hasta 512GB, todas con el contenido que vos elijas.

💡 ¿Te muestro las opciones con precios? 😊`;
    }
    
    if (spamCount === 1) {
        return `Hola ${name}! 😊 Solo quería recordarte que estoy acá para ayudarte con tu USB personalizada.

🎁 Esta semana tenemos:
✅ Envío GRATIS a toda Colombia
✅ Garantía total de satisfacción
✅ Lista en 24-48 horas

¿Alguna duda que pueda resolver? 🤔💬`;
    }
    
    return `Hola ${name}! 👋 Esta es mi última consulta antes de despedirme.

🎵 Si aún te interesa la USB personalizada, respóndeme y con gusto te ayudo a armarla.

Si no es para vos, no hay problema - entiendo perfecto.

Cualquier cosa, acá estoy para lo que necesites. ¡Que tengas un excelente día! 😊✨`;
}
