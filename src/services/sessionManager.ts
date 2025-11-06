import type { UserSession } from '../../types/global';

// 1. Definición del almacenamiento en memoria
const userSessions: Map<string, UserSession> = new Map();

// 2. Función para inicializar una nueva sesión
const createNewSession = (phoneNumber: string): UserSession => ({
    phoneNumber,
    phone: phoneNumber,
    name: '',
    buyingIntent: 0,
    stage: 'initial',
    interests: [],
    currentFlow: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastInteraction: new Date(),
    interactions: [],
    isFirstMessage: true,
    isPredetermined: false,
    skipWelcome: false,
    tags: [],
    messageCount: 0,
    cartData: undefined,
    lastPriceSentAt: null,
    followUpSpamCount: 0,
    isBlacklisted: false,
    conversationData: {},
    aiAnalysis: null,
    // Propiedades faltantes
    totalOrders: 0,
    created_at: new Date(),
    lastActivity: new Date(),
    isActive: true,
    isNewUser: true,
    isReturningUser: false
});


// 3. Obtener o crear sesión con validación
export const getOrCreateSession = async (phoneNumber: string): Promise<UserSession> => {
    try {
        if (!userSessions.has(phoneNumber)) {
            const newSession = createNewSession(phoneNumber);
            userSessions.set(phoneNumber, newSession);
            return newSession;
        }
        
        const session = userSessions.get(phoneNumber)!;
        
        // Validar estructura básica si la sesión existe
        if (!session.updatedAt) {
            session.updatedAt = new Date();
        }
        if (!session.interactions) {
            session.interactions = [];
        }
        
        return session;
    } catch (error) {
        console.error(`Error en getOrCreateSession para ${phoneNumber}:`, error);
        // Retornar nueva sesión en caso de error
        return createNewSession(phoneNumber);
    }
};

// 4. Actualización de sesión con validaciones
export const updateSession = async (
    phoneNumber: string, 
    updates: Partial<UserSession>,
    options?: {
        incrementMessageCount?: boolean;
        registerInteraction?: boolean;
    }
): Promise<UserSession> => {
    try {
        const session = await getOrCreateSession(phoneNumber);
        const now = new Date();
        
        // Actualización básica
        const updatedSession: UserSession = { 
            ...session,
            ...updates,
            updatedAt: now
        };
        
        // Opciones adicionales
        if (options?.incrementMessageCount) {
            updatedSession.messageCount = (session.messageCount || 0) + 1;
        }
        
        if (options?.registerInteraction) {
            updatedSession.lastInteraction = now;
            updatedSession.interactions = [
                ...(session.interactions || []),
                {
                    timestamp: now,
                    message: updates.lastMessage || '',
                    intent: '',
                    channel: 'WhatsApp',
                    type: 'user_message' // Agregamos la propiedad `type`
                }
            ];
        }
        
        userSessions.set(phoneNumber, updatedSession);
        return updatedSession;
    } catch (error) {
        console.error(`Error en updateSession para ${phoneNumber}:`, error);
        throw error;
    }
};

// 5. Funciones adicionales de gestión de sesiones
export const deleteSession = async (phoneNumber: string): Promise<boolean> => {
    return userSessions.delete(phoneNumber);
};

export const getActiveSessions = async (): Promise<UserSession[]> => {
    return Array.from(userSessions.values());
};

export const getSessionCount = async (): Promise<number> => {
    return userSessions.size;
};

// 6. Función para limpieza de sesiones inactivas
export const cleanupInactiveSessions = async (inactiveMinutes = 60): Promise<number> => {
    const threshold = Date.now() - inactiveMinutes * 60 * 1000;
    let deletedCount = 0;
    
    userSessions.forEach((session, phoneNumber) => {
        const lastActive = session.lastInteraction?.getTime() || session.createdAt.getTime();
        if (lastActive < threshold) {
            userSessions.delete(phoneNumber);
            deletedCount++;
        }
    });
    
    return deletedCount;
};
// 7. Función para obtener una sesión por número de teléfono
export const getSessionByPhoneNumber = async (phoneNumber: string): Promise<UserSession | null> => {
    return userSessions.get(phoneNumber) || null;
}
// 8. Función para verificar si una sesión existe
export const sessionExists = async (phoneNumber: string): Promise<boolean> => {
    return userSessions.has(phoneNumber);
}
// 9. Función para limpiar todas las sesiones
export const clearAllSessions = async (): Promise<void> => {
    userSessions.clear();
}
// 10. Función para obtener todas las sesiones
export const getAllSessions = async (): Promise<UserSession[]> => {
    return Array.from(userSessions.values());
}   
// 11. Función para obtener una sesión por ID
// export const getSessionById = async (id: string): Promise<UserSession | null> => {
//     for (const session of userSessions.values()) {
//         if (session.id === id) {
//             return session;
//         }
//     }
//     return null;
// }   
