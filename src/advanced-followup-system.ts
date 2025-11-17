// import { businessDB } from './mysql-database';
// import type { UserSession, EmotionalAI, FollowUpMessage, MicroMoment } from '../types/global';

// interface FollowUpStrategy {
//     name: string;
//     description: string;
//     execute: (phone: string) => Promise<void>;
// }

// class AdvancedFollowUpSystem {
//     private followUpStrategies: Map<string, FollowUpStrategy> = new Map();
//     private emotionalIntelligence: EmotionalAI;
 
//     constructor() {
//         // Dummy object with mock methods for EmotionalAI
//         this.emotionalIntelligence = {
//             mood: "neutral",
//             sentimentScore: 0,
//             confidence: 1,
//             lastUpdate: new Date(),
//             analyzeTone: async (_phone: string) => ({
//                 mood: "neutral",
//                 sentimentScore: 0,
//                 confidence: 1,
//                 lastUpdate: new Date()
//             }),
//             detectPersonality: async (_phone: string) => "ANALYTICAL"
//         };
//         this.initializeStrategies();
//     }

//     private initializeStrategies(): void {
//         this.followUpStrategies.set('analytical', {
//             name: 'Analytical Approach',
//             description: 'Data-driven follow-up for analytical personalities',
//             execute: async (phone: string) => {
//                 console.log(`📊 Executing analytical follow-up for ${phone}`);
//             }
//         });

//         this.followUpStrategies.set('expressive', {
//             name: 'Expressive Approach',
//             description: 'Emotional follow-up for expressive personalities',
//             execute: async (phone: string) => {
//                 console.log(`🎉 Executing expressive follow-up for ${phone}`);
//             }
//         });

//         this.followUpStrategies.set('driver', {
//             name: 'Driver Approach',
//             description: 'Direct follow-up for driver personalities',
//             execute: async (phone: string) => {
//                 console.log(`⚡ Executing driver follow-up for ${phone}`);
//             }
//         });

//         this.followUpStrategies.set('amiable', {
//             name: 'Amiable Approach',
//             description: 'Friendly follow-up for amiable personalities',
//             execute: async (phone: string) => {
//                 console.log(`😊 Executing amiable follow-up for ${phone}`);
//             }
//         });
//     }

//     async sendFollowUpMessage(phone: string, message: string, type: string): Promise<void> {
//         // Aquí integrarías con tu sistema de mensajería real
//         console.log(`📱 Sending ${type} follow-up to ${phone}: ${message}`);
//     }

//     async createFollowUpPlan(userSession: UserSession): Promise<{
//         whatsappMessage: string;
//         smsMessage: string;
//         emailContent: string;
//         pushMessage: string;
//     }> {
//         return {
//             whatsappMessage: `🎵 ¡Hola ${userSession.name || 'amigo'}! ¿Sigues interesado en tu USB personalizada?`,
//             smsMessage: `TechAura: Tu USB personalizada te está esperando. ¿Continuamos?`,
//             emailContent: `Hola ${userSession.name || 'Cliente'},\n\nTu USB personalizada está lista para ser configurada...`,
//             pushMessage: `🎵 Tu USB personalizada te está esperando`
//         };
//     }

//     async sendWhatsAppFollowUp(phone: string, message: string): Promise<void> {
//         console.log(`📱 WhatsApp follow-up to ${phone}: ${message}`);
//     }

//     async sendSMSFollowUp(phone: string, message: string): Promise<void> {
//         console.log(`📨 SMS follow-up to ${phone}: ${message}`);
//     }

//     async sendEmailFollowUp(email: string, content: string): Promise<void> {
//         console.log(`📧 Email follow-up to ${email}: ${content}`);
//     }

//     async sendPushNotification(token: string, message: string): Promise<void> {
//         console.log(`🔔 Push notification to ${token}: ${message}`);
//     }

//     // Sistema de seguimiento con IA emocional
//     async generateEmotionallyIntelligentFollowUp(phone: string): Promise<FollowUpMessage[]> {
//         const userSession = await businessDB.getUserSession(phone);
//         const conversationTone = await this.emotionalIntelligence.analyzeTone?.(phone);
//         const personalityType = await this.emotionalIntelligence.detectPersonality?.(phone);

//         const now = new Date();
//         const messages: FollowUpMessage[] = [];

//         switch (personalityType) {
//             case 'ANALYTICAL':
//                 messages.push({
//                     to: userSession.phone,
//                     content: `📊 Hola ${userSession.name}, he preparado un análisis detallado de por qué nuestros USBs son la mejor opción técnica del mercado.`,
//                     createdAt: now,
//                     urgency: "medium",
//                     delay: 0,
//                     type: 'analytical_approach'
//                 });
//                 messages.push({
//                     to: userSession.phone,
//                     content: `🔍 Especificaciones técnicas:\n• Velocidad de transferencia: USB 3.0 (hasta 5Gbps)\n• Compatibilidad: 99.9% dispositivos\n• Durabilidad: 10,000+ ciclos de escritura\n• Garantía: 2 años`,
//                     createdAt: now,
//                     urgency: "medium",
//                     delay: 3000,
//                     type: 'technical_specs'
//                 });
//                 break;

//             case 'EXPRESSIVE':
//                 messages.push({
//                     to: userSession.phone,
//                     content: `🎉 ¡${userSession.name}! ¿Sabes qué? Estoy súper emocionado de poder ayudarte a crear algo increíble.`,
//                     createdAt: now,
//                     urgency: "high",
//                     delay: 0,
//                     type: 'enthusiastic_approach'
//                 });
//                 messages.push({
//                     to: userSession.phone,
//                     content: `✨ Imagínate tener toda tu música favorita, siempre contigo, con la mejor calidad. ¡Va a ser espectacular!`,
//                     createdAt: now,
//                     urgency: "high",
//                     delay: 2000,
//                     type: 'emotional_connection'
//                 });
//                 break;

//             case 'DRIVER':
//                 messages.push({
//                     to: userSession.phone,
//                     content: `⚡ ${userSession.name}, vamos directo al grano. Tienes 3 opciones que te van a convenir:`,
//                     createdAt: now,
//                     urgency: "high",
//                     delay: 0,
//                     type: 'direct_approach'
//                 });
//                 messages.push({
//                     to: userSession.phone,
//                     content: `1️⃣ USB 32GB - $45,000 (Entrega: 24h)\n2️⃣ USB 64GB - $65,000 (Entrega: 24h)\n3️⃣ USB 128GB - $95,000 (Entrega: 48h)\n\n¿Cuál eliges?`,
//                     createdAt: now,
//                     urgency: "high",
//                     delay: 1000,
//                     type: 'quick_options'
//                 });
//                 break;

//             case 'AMIABLE':
//                 messages.push({
//                     to: userSession.phone,
//                     content: `😊 Hola ${userSession.name}, espero que estés teniendo un día maravilloso.`,
//                     createdAt: now,
//                     urgency: "low",
//                     delay: 0,
//                     type: 'friendly_approach'
//                 });
//                 messages.push({
//                     to: userSession.phone,
//                     content: `🤗 No quiero presionarte para nada, solo quería saber si tienes alguna pregunta sobre los USBs que vimos. Estoy aquí para ayudarte en lo que necesites.`,
//                     createdAt: now,
//                     urgency: "low",
//                     delay: 3000,
//                     type: 'supportive_message'
//                 });
//                 break;
//         }

//         return messages;
//     }

//     // Seguimiento basado en micro-momentos
//     async triggerMicroMomentFollowUp(phone: string, microMoment: MicroMoment): Promise<void> {
//         const userSession = await businessDB.getUserSession(phone);
//         let message = '';

//         switch (microMoment.type) {
//             case 'PRICE_HESITATION':
//                 message = `💡 ${userSession.name}, entiendo que el precio es importante. ¿Qué te parece si te ofrezco un plan de pago? Puedes pagar en 2 partes: 50% ahora y 50% cuando recibas tu USB. ¿Te ayudaría eso?`;
//                 break;

//             case 'COMPETITOR_COMPARISON':
//                 message = `🏆 Veo que estás comparando opciones, ¡perfecto! Te explico por qué somos diferentes:\n\n✅ Personalización 100% a tu gusto\n✅ Soporte técnico de por vida\n✅ Garantía de satisfacción\n✅ Entrega en 24-48h\n\n¿Qué más te gustaría saber?`;
//                 break;

//             case 'FEATURE_INTEREST':
//                 const interestedFeature = microMoment.data?.feature || 'esta característica';
//                 message = `🎯 Perfecto, veo que te interesa ${interestedFeature}. Déjame contarte más sobre esto...`;
//                 break;

//             case 'URGENCY_DETECTED':
//                 message = `⚡ ${userSession.name}, veo que necesitas esto pronto. Tengo disponibilidad para entrega express (12-18 horas) por solo $5,000 adicionales. ¿Te sirve?`;
//                 break;
//         }

//         await this.sendFollowUpMessage(phone, message, 'micro_moment');
//     }

//     // Sistema de seguimiento multi-canal
// //     async executeMultiChannelFollowUp(phone: string): Promise<void> {
// //         const userSession = await businessDB.getUserSession(phone);
// //         const followUpPlan = await this.createFollowUpPlan(userSession);

// //         // Canal 1: WhatsApp (inmediato)
// //         await this.sendWhatsAppFollowUp(phone, followUpPlan.whatsappMessage);

// //         // Canal 2: SMS (si disponible, después de 2 horas)
// //         if (userSession.smsEnabled) {
// //             setTimeout(() => {
// //                 this.sendSMSFollowUp(phone, followUpPlan.smsMessage);
// //             }, 2 * 60 * 60 * 1000);
// //         }

// //         // Canal 3: Email (si disponible, después de 6 horas)
// //         if (userSession.email) {
// //             setTimeout(() => {
// //                 this.sendEmailFollowUp(userSession.email, followUpPlan.emailContent);
// //             }, 6 * 60 * 60 * 1000);
// //         }

// //         // Canal 4: Notificación push (si app instalada, después de 12 horas)
// //         if (userSession.pushToken) {
// //             setTimeout(() => {
// //                 this.sendPushNotification(userSession.pushToken, followUpPlan.pushMessage);
// //             }, 12 * 60 * 60 * 1000);
// //         }
// //     }
// }

// // export { AdvancedFollowUpSystem };

// /**
//  * Controla que no se envíen mensajes de seguimiento repetidos en menos de minIntervalHours.
//  * También permite seguimiento si el usuario reaccionó después del último seguimiento.
//  */
// export function shouldSendFollowUp(
//     session: UserSession,
//     message: string,
//     minIntervalHours = 12
// ): boolean {
//     const now = Date.now();

//     // No enviar si es el mismo mensaje y no ha pasado el mínimo de horas
//     if (
//         session.lastFollowUpMsg === message &&
//         session.lastFollowUpTime &&
//         now - session.lastFollowUpTime < minIntervalHours * 60 * 60 * 1000
//     ) {
//         return false;
//     }

//     // Permitir si el usuario respondió después del último seguimiento
//     if (
//         session.lastUserResponseTime &&
//         session.lastFollowUpTime &&
//         session.lastUserResponseTime > session.lastFollowUpTime
//     ) {
//         return true;
//     }

//     return true;
// }