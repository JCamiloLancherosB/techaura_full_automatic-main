// src/utils/testHelpers.ts
import type { UserSession } from '../../types/global';

/**
 * ✅ Función helper para crear sesiones de prueba válidas
 */
export function createTestSession(phoneNumber: string, overrides: Partial<UserSession> = {}): UserSession {
    const now = new Date();
    
    const defaultSession: UserSession = {
        phone: phoneNumber,
        phoneNumber: phoneNumber,
        name: 'Usuario Test',
        stage: 'interested',
        interactions: [],
        createdAt: now,
        updatedAt: now,
        buyingIntent: 50,
        interests: ['música', 'test'],
        lastInteraction: now,
        messageCount: 1,
        currentFlow: 'test',
        isActive: true,
        isFirstMessage: false,

        // ✅ PROPIEDADES FALTANTES AGREGADAS:
        conversationData: {},               // Objeto para datos de conversación
        followUpSpamCount: 0,               // Contador de spam de seguimiento
        totalOrders: 0,                     // Total de órdenes del usuario

        demographics: {
            age: 25,
            location: 'Test Location',
            country: 'Colombia',
            city: 'Bogotá',
            gender: 'other'
        },
        preferences: {
            musicGenres: ['reggaeton', 'pop'],
            priceRange: {
                min: 25000,
                max: 75000
            },
            capacity: ['32GB', '64GB']
        }
    };

    return { ...defaultSession, ...overrides };
}

/**
 * ✅ Función para crear sesiones con diferentes perfiles
 */
export function createTestSessionByProfile(phoneNumber: string, profile: 'basic' | 'premium' | 'vip'): UserSession {
    const baseSession = createTestSession(phoneNumber);
    
    switch (profile) {
        case 'basic':
            return {
                ...baseSession,
                stage: 'initial',
                buyingIntent: 30,
                interests: ['música básica'],
                totalOrders: 0,                     // ✅ Usuario básico sin órdenes
                followUpSpamCount: 0,
                conversationData: {
                    lastTopic: 'introducción',
                    preferredTime: 'mañana'
                },
                preferences: {
                    ...baseSession.preferences,
                    priceRange: { min: 20000, max: 35000 }
                }
            };
            
        case 'premium':
            return {
                ...baseSession,
                stage: 'interested',
                buyingIntent: 70,
                interests: ['música premium', 'personalización'],
                totalOrders: Math.floor(Math.random() * 3) + 1,  // ✅ 1-3 órdenes
                followUpSpamCount: 0,
                conversationData: {
                    lastTopic: 'personalización',
                    preferredTime: 'tarde',
                    favoriteFeatures: ['calidad', 'variedad']
                },
                preferences: {
                    ...baseSession.preferences,
                    priceRange: { min: 35000, max: 60000 }
                }
            };
            
        case 'vip':
            return {
                ...baseSession,
                stage: 'purchase_intent',
                buyingIntent: 90,
                interests: ['música premium', 'personalización', 'calidad superior'],
                isVIP: true,
                totalOrders: Math.floor(Math.random() * 8) + 3,   // ✅ 3-10 órdenes
                followUpSpamCount: 0,
                conversationData: {
                    lastTopic: 'compra_premium',
                    preferredTime: 'cualquier_momento',
                    favoriteFeatures: ['calidad_superior', 'exclusividad', 'soporte_premium'],
                    vipLevel: 'gold'
                },
                preferences: {
                    ...baseSession.preferences,
                    priceRange: { min: 55000, max: 100000 }
                }
            };
            
        default:
            return baseSession;
    }
}

/**
 * ✅ Función adicional para crear múltiples sesiones de prueba
 */
export function createMultipleTestSessions(count: number, basePhoneNumber: string = '57300'): UserSession[] {
    const sessions: UserSession[] = [];
    const profiles: Array<'basic' | 'premium' | 'vip'> = ['basic', 'premium', 'vip'];
    
    for (let i = 0; i < count; i++) {
        const phoneNumber = `${basePhoneNumber}${String(i).padStart(6, '0')}`;
        const profile = profiles[i % profiles.length];
        const session = createTestSessionByProfile(phoneNumber, profile);
        
        // Agregar variación en las fechas
        const daysAgo = Math.floor(Math.random() * 30);
        const sessionDate = new Date();
        sessionDate.setDate(sessionDate.getDate() - daysAgo);
        
        // ✅ Variación en followUpSpamCount y totalOrders
        const followUpSpamCount = Math.floor(Math.random() * 3); // 0-2
        const additionalOrders = Math.floor(Math.random() * 2);

        sessions.push({
            ...session,
            createdAt: sessionDate,
            updatedAt: sessionDate,
            lastInteraction: sessionDate,
            followUpSpamCount,
            totalOrders: session.totalOrders + additionalOrders,
            conversationData: {
                ...session.conversationData,
                sessionId: `session_${i}`,
                createdDate: sessionDate.toISOString()
            }
        });
    }

    return sessions;
}

/**
 * ✅ Función para crear sesiones con datos demográficos variados
 */
export function createDiverseTestSessions(): UserSession[] {
    const sessions: UserSession[] = [];
    
    // Diferentes perfiles demográficos
    const profiles = [
        {
            phone: '573001000001',
            demographics: { age: 18, gender: 'female', country: 'Colombia', city: 'Bogotá' },
            preferences: { musicGenres: ['reggaeton', 'pop'], priceRange: { min: 20000, max: 35000 } },
            orders: 0,
            conversationData: { interests: ['música_joven', 'tendencias'] }
        },
        {
            phone: '573001000002',
            demographics: { age: 25, gender: 'male', country: 'Colombia', city: 'Medellín' },
            preferences: { musicGenres: ['rock', 'metal'], priceRange: { min: 35000, max: 60000 } },
            orders: 2,
            conversationData: { interests: ['música_alternativa', 'conciertos'] }
        },
        {
            phone: '573001000003',
            demographics: { age: 35, gender: 'female', country: 'Colombia', city: 'Cali' },
            preferences: { musicGenres: ['salsa', 'bachata'], priceRange: { min: 40000, max: 80000 } },
            orders: 4,
            conversationData: { interests: ['baile', 'música_latina'] }
        },
        {
            phone: '573001000004',
            demographics: { age: 45, gender: 'male', country: 'Colombia', city: 'Barranquilla' },
            preferences: { musicGenres: ['vallenato', 'cumbia'], priceRange: { min: 25000, max: 50000 } },
            orders: 1,
            conversationData: { interests: ['música_tradicional', 'folclore'] }
        },
        {
            phone: '573001000005',
            demographics: { age: 22, gender: 'other', country: 'Colombia', city: 'Cartagena' },
            preferences: { musicGenres: ['trap', 'hip-hop'], priceRange: { min: 30000, max: 70000 } },
            orders: 3,
            conversationData: { interests: ['música_urbana', 'freestyle'] }
        }
    ];
    
    profiles.forEach((profile, index) => {
        const session = createTestSession(profile.phone, {
            demographics: {
                age: profile.demographics.age,
                gender: profile.demographics.gender as 'male' | 'female' | 'other',
                country: profile.demographics.country,
                city: profile.demographics.city,
                location: `${profile.demographics.city}, ${profile.demographics.country}`
            },
            preferences: {
                ...profile.preferences,
                capacity: ['32GB', '64GB']
            },
            totalOrders: profile.orders,
            followUpSpamCount: Math.floor(Math.random() * 2),
            conversationData: {
                ...profile.conversationData,
                profileType: 'diverse',
                sessionIndex: index
            }
        });
        sessions.push(session);
    });
    
    return sessions;
}

/**
 * ✅ Función para crear sesión con datos específicos de conversación
 */
export function createTestSessionWithConversation(
    phoneNumber: string, 
    conversationData: Record<string, any> = {},
    totalOrders: number = 0,
    followUpSpamCount: number = 0
): UserSession {
    return createTestSession(phoneNumber, {
        conversationData: {
            sessionStart: new Date().toISOString(),
            messageHistory: [],
            currentTopic: 'general',
            userPreferences: {},
            ...conversationData
        },
        totalOrders,
        followUpSpamCount
    });
}

/**
 * ✅ Función para simular usuarios con diferentes niveles de spam
 */
export function createSpamTestSessions(): UserSession[] {
    return [
        // Usuario normal
        createTestSessionWithConversation('573001000010', { behavior: 'normal' }, 1, 0),
        
        // Usuario con poco spam
        createTestSessionWithConversation('573001000011', { behavior: 'occasional_spam' }, 0, 1),
        
        // Usuario con spam moderado
        createTestSessionWithConversation('573001000012', { behavior: 'moderate_spam' }, 0, 2),
        
        // Usuario con mucho spam
        createTestSessionWithConversation('573001000013', { behavior: 'high_spam' }, 0, 5),
        
        // Usuario VIP con muchas órdenes
        createTestSessionWithConversation('573001000014', { behavior: 'vip_customer' }, 10, 0)
    ];
}
