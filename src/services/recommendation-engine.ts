// ====== SEPARADOR: sales-maximizer.ts - INICIO ======
import { adapterDB } from './mysql-database';
import { businessDB } from './mysql-database';
import type { 
    UrgencyEngine,
    SocialProofEngine,
    GamificationEngine,
    UserSession,
    SalesContext,
    UrgencyMessage,
    SocialProofMessage,
    GamificationReward,
    DynamicOffer,
    CartData
} from '../types/global';

/**
 * SalesMaximizer - Sistema integral de maximización de ventas.
 * Incorpora urgencia, prueba social, gamificación y ofertas dinámicas/contextuales,
 * integrando datos reales de MySQL y motores personalizables.
 */
class SalesMaximizer {
    private urgencyEngine: UrgencyEngine;
    private socialProofEngine: SocialProofEngine;
    private gamificationEngine: GamificationEngine;

    constructor() {
        // Instancias dummy para interfaces, nunca uses "new"
        this.urgencyEngine = {
            calculateUrgencyLevel: async (userSession: UserSession, context: SalesContext) => 'MEDIUM',
            getActiveTriggers: async (userSession: UserSession) => []
        };
        this.socialProofEngine = {
            getRelevantTestimonials: async (userSession: UserSession) => []
        };
        this.gamificationEngine = {
            getUserLevel: async (phone: string) => 1
        };
    }

    selectRandomMessage(messages: string[]): string {
        return messages[Math.floor(Math.random() * messages.length)];
    }

    async analyzeBehavior(userSession: UserSession): Promise<{
        pricesensitivity: 'HIGH' | 'MEDIUM' | 'LOW';
        featureFocused: boolean;
        urgencyLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    }> {
        // Puedes mejorar esto usando historial, analytics, etc.
        return {
            pricesensitivity: 'MEDIUM',
            featureFocused: false,
            urgencyLevel: 'LOW'
        };
    }

    async getMarketConditions(): Promise<any> {
        // TODO: Integrar con fuentes de demanda/stock reales si lo deseas.
        return {
            demand: 'high',
            competition: 'medium',
            seasonality: 'normal'
        };
    }

    async createPersonalizedOfferMessage(userSession: UserSession, offerType: string, discount: number): Promise<string> {
        // Puedes personalizar este mensaje según hábitos, nombre, historial, etc.
        return `🎁 Oferta especial para ti: ${discount}% de descuento en tu compra. ¡Solo por tiempo limitado!`;
    }

    async sendRecoveryMessage(phone: string, message: string, incentive: any): Promise<void> {
        // Ideal: integrar con sistema real de notificaciones/WhatsApp
        // Ejemplo: await whatsappNotifications.sendCartRecovery(phone, message, incentive);
        console.log(`📱 Enviando mensaje de recuperación a ${phone}: ${message}`);
    } 

    async trackRecoveryStep(phone: string, cartId: string, step: any): Promise<void> {
        // Aquí guardarías en analytics/tabla de seguimiento
        // await businessDB.saveAnalyticsEvent(phone, 'cart_recovery', { cartId, step });
        console.log(`📊 Tracking recovery step para ${phone}, carrito ${cartId}`);
    }

    // --- URGENCIA DINÁMICA ---
    async createDynamicUrgency(phone: string, context: SalesContext): Promise<UrgencyMessage> {
        const userSession = await businessDB.getUserSession(phone);
        const urgencyLevel = await this.urgencyEngine.calculateUrgencyLevel(userSession, context);

        const urgencyMessages = {
            HIGH: [
                `🔥 ¡ÚLTIMO DÍA! Solo quedan 3 USBs de 64GB disponibles y ya hay 2 personas preguntando por ellos.`,
                `⏰ Tu descuento del 20% vence en 2 horas. ¿Confirmamos tu pedido ahora?`,
                `🚨 ALERTA: El precio de los componentes sube mañana. Hoy es tu última oportunidad de conseguir este precio.`
            ],
            MEDIUM: [
                `⏳ Tengo solo 5 USBs de tu capacidad preferida. ¿Apartamos uno para ti?`,
                `💡 Tip: Los fines de semana tengo más demanda. Si decides hoy, te garantizo entrega rápida.`,
                `🎯 Tu configuración personalizada está lista. ¿La confirmamos?`
            ],
            LOW: [
                `😊 Sin prisa, pero quería que supieras que tu configuración se ve increíble.`,
                `💭 ¿Hay algo más que te gustaría agregar a tu USB?`,
                `🤔 ¿Tienes alguna duda que pueda resolver para ti?`
            ]
        };

        return {
            level: urgencyLevel,
            message: this.selectRandomMessage(urgencyMessages[urgencyLevel]),
            triggers: await this.urgencyEngine.getActiveTriggers(userSession)
        };
    }

    // --- PRUEBA SOCIAL INTELIGENTE ---
    async generateSocialProof(phone: string): Promise<SocialProofMessage[]> {
        const userSession = await businessDB.getUserSession(phone);
        const recentOrders = await businessDB.getRecentOrdersByType(userSession.interests[0]);
        const testimonials = await this.socialProofEngine.getRelevantTestimonials(userSession);

        const proofMessages: SocialProofMessage[] = [];

        // Prueba social por volumen
        if (recentOrders.length > 10) {
            proofMessages.push({
                type: 'volume',
                message: `🔥 ¡Increíble! En las últimas 24 horas, ${recentOrders.length} personas han pedido USBs como la que estás viendo.`,
                credibility: 0.9
            });
        }

        // Testimonios específicos
        if (testimonials.length > 0) {
            const bestTestimonial = testimonials[0];
            proofMessages.push({
                type: 'testimonial',
                message: `⭐ "${bestTestimonial.text}" - ${bestTestimonial.customerName} (Cliente verificado)`,
                credibility: 0.85
            });
        }

        // Prueba social por ubicación
        const localOrders = await businessDB.getOrdersByLocation(userSession.location || 'Colombia');
        if (localOrders.length > 5) {
            proofMessages.push({
                type: 'location',
                message: `📍 En ${userSession.location}, ya ${localOrders.length} personas confían en nosotros para sus USBs personalizados.`,
                credibility: 0.8
            });
        }

        return proofMessages.sort((a, b) => (b.credibility || 0) - (a.credibility || 0));
    }

    // --- GAMIFICACIÓN PARA ENGAGEMENT ---
    async applyGamification(phone: string): Promise<GamificationReward[]> {
        const userSession = await businessDB.getUserSession(phone);
        const userLevel = await this.gamificationEngine.getUserLevel(phone);
        const rewards: GamificationReward[] = [];

        // Sistema de puntos por interacción
        if ((userSession.interactions?.length || 0) >= 10) {
            rewards.push({
                type: 'interaction_milestone',
                title: '🏆 ¡Conversador Experto!',
                description: 'Has desbloqueado un descuento del 10% por ser un cliente activo',
                discount: 10,
                badge: 'expert_chatter'
            });
        }

        // Desafíos de personalización
        const customizationStep = userSession.customization?.step || 0;
        if (customizationStep < 3) {
            rewards.push({
                type: 'challenge',
                title: '🎨 Desafío de Personalización',
                description: 'Personaliza 3 aspectos más y obtén envío gratis',
                progress: customizationStep,
                target: 3,
                reward: 'free_shipping'
            });
        }

        // Programa de referidos gamificado
        rewards.push({
            type: 'referral_program',
            title: '👥 Programa Amigos TechAura',
            description: 'Por cada amigo que refiere: Tú ganas $10,000, él gana 15% descuento',
            currentReferrals: userSession.referralCount || 0,
            nextReward: 'premium_customization'
        });

        return rewards;
    }

    // --- OFERTAS DINÁMICAS BASADAS EN COMPORTAMIENTO ---
    async generateDynamicOffer(phone: string): Promise<DynamicOffer> {
        const userSession = await businessDB.getUserSession(phone);
        const behaviorAnalysis = await this.analyzeBehavior(userSession);
        const marketConditions = await this.getMarketConditions();

        let offerType: string;
        let discount: number;
        let conditions: string[];

        if (behaviorAnalysis.pricesensitivity === 'HIGH') {
            offerType = 'price_focused';
            discount = 25;
            conditions = ['Válido por 2 horas', 'Solo para primera compra'];
        } else if (behaviorAnalysis.featureFocused) {
            offerType = 'value_added';
            discount = 15;
            conditions = ['Incluye personalización premium gratis', 'Soporte prioritario'];
        } else if (behaviorAnalysis.urgencyLevel === 'HIGH') {
            offerType = 'express_delivery';
            discount = 10;
            conditions = ['Entrega en 12 horas', 'Sin costo adicional'];
        } else {
            offerType = 'standard';
            discount = 10;
            conditions = ['Oferta estándar'];
        }

        return {
            type: offerType,
            discount,
            conditions,
            validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 horas
            personalizedMessage: await this.createPersonalizedOfferMessage(userSession, offerType, discount)
        };
    }

    // --- RECUPERACIÓN DE CARRITOS ABANDONADOS ---
    async executeCartRecoverySequence(phone: string, abandonedCart: CartData): Promise<void> {
        const recoverySequence = [
            {
                delay: 30 * 60 * 1000, // 30 minutos
                message: `😊 Hola, vi que estabas armando un USB increíble. ¿Te ayudo a terminarlo?`,
                incentive: null
            },
            {
                delay: 2 * 60 * 60 * 1000, // 2 horas
                message: `💡 Tu USB personalizado sigue esperándote. Te ofrezco 10% de descuento si lo confirmas hoy.`,
                incentive: { type: 'discount', value: 10 }
            },
            {
                delay: 24 * 60 * 60 * 1000, // 24 horas
                message: `🎁 ¡Última oportunidad! Tu USB + 15% descuento + envío gratis. ¿Qué dices?`,
                incentive: { type: 'combo', discount: 15, freeShipping: true }
            },
            {
                delay: 72 * 60 * 60 * 1000, // 72 horas
                message: `👋 Entiendo que quizás no era el momento. Si cambias de opinión, aquí estaré. ¡Que tengas un gran día!`,
                incentive: null
            }
        ];

        for (const step of recoverySequence) {
            setTimeout(async () => {
                await this.sendRecoveryMessage(phone, step.message, step.incentive);
                await this.trackRecoveryStep(phone, abandonedCart.id || '', step);
            }, step.delay);
        }
    }
}

export { SalesMaximizer };
// ====== SEPARADOR: sales-maximizer.ts - FIN ======