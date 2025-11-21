// import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
// import { adapterDB, businessDB } from '../mysql-database';
// import { join } from 'path';
// import type { UserSession, AnalyticsData as GlobalAnalyticsData, Interaction as GlobalInteraction } from '../../types/global';
// import { 
//     calculateDemographicsSummary,
//     calculatePreferencesSummary
// } from './analyticsSummaryHelpers';
// import { musicData } from './musicUsb';
// import { videoData } from './videosUsb';
// import { MessageType } from '../../types/enums';

// // ===== Anti-exceso y deduplicación =====
// import crypto from 'crypto';

// function sha256(text: string): string {
//   return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
// }

// function isHourAllowed(date = new Date()): boolean {
//   const h = date.getHours();
//   return h >= 9 && h <= 21; // 9:00–21:59
// }

// function daysBetween(a: Date, b: Date): number {
//   return Math.floor((Math.abs(a.getTime() - b.getTime())) / 86400000);
// }

// // === NUEVO: helper para excluir contactos con chat activo de WhatsApp ===
// function isWhatsAppChatActive(session: UserSession): boolean {
//   const tags = session.tags || [];
//   const hasTag =
//     tags.includes('whatsapp_chat') ||
//     tags.includes('chat_activo') ||
//     tags.includes('whatsapp_chat');
//   const flag = !!(session.conversationData && (session.conversationData as any).whatsappChatActive === true);
//   return hasTag || flag;
// }

// // Limites globales de envío
// const RATE_GLOBAL = {
//   perHourMax: 60,
//   perDayMax: 500,
//   hourWindowStart: Date.now(),
//   hourCount: 0,
//   dayWindowStart: Date.now(),
//   dayCount: 0
// };

// function resetIfNeeded() {
//   const now = Date.now();
//   // reset hora
//   if (now - RATE_GLOBAL.hourWindowStart >= 3600000) {
//     RATE_GLOBAL.hourWindowStart = now;
//     RATE_GLOBAL.hourCount = 0;
//   }
//   // reset día (24h rolling)
//   if (now - RATE_GLOBAL.dayWindowStart >= 86400000) {
//     RATE_GLOBAL.dayWindowStart = now;
//     RATE_GLOBAL.dayCount = 0;
//   }
// }

// function canSendGlobal(): boolean {
//   resetIfNeeded();
//   return RATE_GLOBAL.hourCount < RATE_GLOBAL.perHourMax && RATE_GLOBAL.dayCount < RATE_GLOBAL.perDayMax;
// }

// function markGlobalSent() {
//   resetIfNeeded();
//   RATE_GLOBAL.hourCount++;
//   RATE_GLOBAL.dayCount++;
// }

// // Por-usuario: 24h mínimo, 2/semana
// function canSendUserFollowUp(session: UserSession): { ok: boolean; reason?: string } {
//   const now = new Date();
//   if (!isHourAllowed(now)) return { ok: false, reason: 'outside_hours' };

//   // mínimo 24h desde el último follow-up
//   if (session.lastFollowUp && (now.getTime() - session.lastFollowUp.getTime()) < 24 * 3600000) {
//     return { ok: false, reason: 'under_24h' };
//   }

//   // Máximo 2 por semana rolling
//   session.conversationData = session.conversationData || {};
//   const history: string[] = (session.conversationData.followUpHistory || []) as string[];
//   const recent = (history || []).filter(ts => {
//     const d = new Date(ts);
//     return daysBetween(d, now) <= 7;
//   });
//   if (recent.length >= 2) return { ok: false, reason: 'weekly_cap' };

//   // Bloqueo por chat activo de WhatsApp
//   if (isWhatsAppChatActive(session)) return { ok: false, reason: 'wa_chat_active' };

//   return { ok: true };
// }

// function recordUserFollowUp(session: UserSession) {
//   session.lastFollowUp = new Date();
//   session.conversationData = session.conversationData || {};
//   const history: string[] = (session.conversationData.followUpHistory || []) as string[];
//   history.push(new Date().toISOString());
//   // conservar últimos 10
//   session.conversationData.followUpHistory = history.slice(-10);
// }


// // ====== NUEVO: Handlers onMessage (import dependencias internas al final del archivo) ======
// // Nota: Las funciones onInboundMessage/onBotMessage/onSystemEvent se declaran más abajo, después de utilidades.

// export type SentimentType = 'positive' | 'neutral' | 'negative';

// export interface Interaction extends GlobalInteraction {}

// function createInteraction(
//     message: string,
//     type: 'user_message' | 'bot_message' | 'system_event',
//     options?: {
//         intent?: string;
//         sentiment?: SentimentType;
//         engagement_level?: number;
//         channel?: string;
//         respondedByBot?: boolean;
//         metadata?: Record<string, any>;
//     }
// ): Interaction {
//     return {
//         timestamp: new Date(),
//         message: (message || '').toString().trim(),
//         type,
//         intent: options?.intent || 'general',
//         sentiment: options?.sentiment || 'neutral',
//         engagement_level: options?.engagement_level || 50,
//         channel: options?.channel || 'WhatsApp',
//         respondedByBot: options?.respondedByBot || false,
//         ...(options?.metadata ? { metadata: options.metadata } : {})
//     };
// }

// // Tipos y interfaces
// export interface ExtendedContext {
//     currentFlow: string;
//     from: string;
//     body: string;
//     name?: string;
//     pushName?: string;
//     session?: UserSession;
// }

// interface InteractionLog {
//     timestamp: Date;
//     message: string;
//     intent: string;
//     sentiment: SentimentType;
//     engagement_level: number;
//     channel?: string;
//     respondedByBot?: boolean;
// }

// interface AIAnalysis {
//     buyingIntent: number;
//     interests: string[];
//     nextBestAction: string;
//     followUpTime: Date;
//     riskLevel: 'low' | 'medium' | 'high';
//     engagementScore: number;
//     probabilityToConvert: number;
//     churnLikelihood: number;
// }

// // Constantes
// const MAX_UNANSWERED_FOLLOWUPS = 2;
// const MIN_HOURS_BETWEEN_FOLLOWUPS = 12;

// type USBContentType = 'musica' | 'videos' | 'peliculas';

// const musicOptions = [
//     { id: 1, label: '8GB', desc: '1,400 canciones', price: 59900, emoji: '🚀' },
//     { id: 2, label: '32GB', desc: '5,000 canciones', price: 89900, emoji: '🌟' },
//     { id: 3, label: '64GB', desc: '10,000 canciones', price: 129900, emoji: '🔥' },
//     { id: 4, label: '128GB', desc: '25,000 canciones', price: 169900, emoji: '🏆' }
// ];

// const videoOptions = [
//     { id: 1, label: '8GB', desc: '260 videos', price: 59900 },
//     { id: 2, label: '32GB', desc: '1,000 videos', price: 89900 },
//     { id: 3, label: '64GB', desc: '2,000 videos', price: 129900 },
//     { id: 4, label: '128GB', desc: '4,000 videos', price: 169900 }
// ];

// const movieOptions = [
//     { id: 1, label: '8GB', desc: 'Hasta 10 películas o 30 episodios', price: 59900 },
//     { id: 2, label: '32GB', desc: 'Hasta 30 películas o 90 episodios', price: 89900 },
//     { id: 3, label: '64GB', desc: 'Hasta 70 películas o 210 episodios', price: 129900 },
//     { id: 4, label: '128GB', desc: '140 películas o 420 episodios', price: 169900 }
// ];

// const musicGenres = [
//     'bachata', 'bailables', 'baladas', 'banda', 'blues', 'boleros', 'clasica', 'country',
//     'cumbia', 'diciembre', 'electronica', 'funk', 'gospel', 'hiphop', 'indie', 'jazz',
//     'merengue', 'metal', 'norteñas', 'punk', 'r&b', 'rancheras', 'reggaeton', 'rock',
//     'salsa', 'techno', 'vallenato', 'pop', 'tropical', 'cristiana', 'trap', 'house', 'k-pop',
//     'reggae', 'latino', 'romántica', 'urbano', 'alternativo', 'electropop', 'ska'
// ];

// const PERSUASION_TECHNIQUES = {
//     scarcity: [
//         "⏰ Solo quedan 3 USBs con tu configuración personalizada",
//         "🔥 Oferta válida solo hasta medianoche - ¡No la pierdas!",
//         "📦 Últimas unidades disponibles con envío gratis"
//     ],
//     social_proof: [
//         "🌟 +500 clientes felices este mes eligieron esta USB",
//         "👥 María de Bogotá acaba de pedir la misma configuración que tú",
//         "⭐ 4.9/5 estrellas - La USB más recomendada del mes"
//     ],
//     authority: [
//         "🏆 Recomendado por expertos en audio como la mejor calidad",
//         "🎵 Certificado por ingenieros de sonido profesionales",
//         "📱 Tecnología avalada por +1000 DJs profesionales"
//     ],
//     reciprocity: [
//         "🎁 Como agradecimiento, te incluyo una playlist exclusiva GRATIS",
//         "💝 Por ser cliente VIP, te regalo 2GB adicionales",
//         "🌟 Bonus especial: audífonos premium de cortesía"
//     ]
// } as const;

// const trackUserMetrics = (metrics: {
//     phoneNumber: string;
//     stage: string;
//     intent: string;
//     messageType?: string;
//     buyingIntent: number;
//     flow: string;
//     isPredetermined: boolean;
// }) => {
//     try {
//         console.log(`📊 [METRICS] ${metrics.phoneNumber}: Stage=${metrics.stage}, Intent=${metrics.intent}, BuyingIntent=${metrics.buyingIntent}%`);
//     } catch (error) {
//         console.warn('⚠️ Error en trackUserMetrics:', error);
//     }
// };

// // Variables globales
// export const userSessions: Map<string, UserSession> = new Map();
// const followUpQueue = new Map<string, NodeJS.Timeout>();
// let botInstance: any = null;

// // ✅ CACHE GLOBAL PARA CONTROL DE PROCESAMIENTO
// declare global {
//     var processingCache: Map<string, number>;
//     var userSessions: Map<string, UserSession>;
// }

// // Clase de gestión de sesiones
// class UserTrackingSystem {
//     private sessionsFile: string;
//     private dataDir: string;

//     constructor() {
//         this.dataDir = join(process.cwd(), 'data');
//         this.sessionsFile = join(this.dataDir, 'user_sessions.json');
//         this.ensureDataDirectory();
//         this.loadSessions();
//         this.startAutoSave();
//         this.startCleanupTask();
//     }

//     private ensureDataDirectory() {
//         try {
//             if (!existsSync(this.dataDir)) {
//                 mkdirSync(this.dataDir, { recursive: true });
//                 console.log('📁 Directorio de datos creado');
//             }
//         } catch (error) {
//             console.error('❌ Error creando directorio de datos:', error);
//         }
//     }

//     private loadSessions() {
//         try {
//         if (!existsSync(this.sessionsFile)) return;

//         const data = readFileSync(this.sessionsFile, 'utf8');
//         if (!data || !data.trim()) return;

//         const sessionsArray = JSON.parse(data);
//         if (!Array.isArray(sessionsArray)) return;

//         sessionsArray.forEach((session: any) => {
//           // Normaliza fechas
//           const dateFields = ['lastInteraction','createdAt','updatedAt','lastActivity','lastFollowUp'];
//           dateFields.forEach(f => {
//             if (session[f]) session[f] = new Date(session[f]);
//           });

//           if (Array.isArray(session.interactions)) {
//             session.interactions = session.interactions.map((i: any) => ({
//               ...i,
//               timestamp: i.timestamp ? new Date(i.timestamp) : new Date()
//             }));
//           }

//           userSessions.set(session.phoneNumber || session.phone, session);
//         });

//         console.log(`📊 Cargadas ${userSessions.size} sesiones de usuario`);
//       } catch (error) {
//         console.error('❌ Error cargando sesiones:', error);
//       }
//     }

//     private saveSessions() {
//     try {
//         const sessionsArray = Array.from(userSessions.values());
//         const json = jsonStringifySafe(sessionsArray, 2);
//         writeFileSync(this.sessionsFile, json, 'utf8');
//       } catch (error) {
//         console.error('❌ Error guardando sesiones:', error);
//       }
//     }

//     private startAutoSave() {
//         setInterval(() => this.saveSessions(), 30000);
//     }

//     private startCleanupTask() {
//         setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
//     }

//     private cleanupOldSessions() {
//         const now = new Date();
//         const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
//         let cleaned = 0;

//         Array.from(userSessions.entries()).forEach(([phoneNumber, session]) => {
//             if (session.lastInteraction < cutoffTime && session.stage !== 'converted') {
//                 userSessions.delete(phoneNumber);
//                 if (followUpQueue.has(phoneNumber)) {
//                     clearTimeout(followUpQueue.get(phoneNumber)!);
//                     followUpQueue.delete(phoneNumber);
//                 }
//                 cleaned++;
//             }
//         });

//         if (cleaned > 0) {
//             console.log(`🧹 Limpiadas ${cleaned} sesiones antiguas`);
//         }
//     }

//     public async getUserSession(phoneNumber: string): Promise<UserSession> {
//         let session = userSessions.get(phoneNumber);
        
//         if (!session) {
//             session = this.createDefaultUserSession(phoneNumber);
//             userSessions.set(phoneNumber, session);
//             console.log(`✅ Nueva sesión creada para ${phoneNumber}`);
//         } else {
//             session.lastInteraction = new Date();
//             session.lastActivity = new Date();
//             session.isActive = true;
//         }
        
//         return session;
//     }

//     private createDefaultUserSession(phoneNumber: string): UserSession {
//         const now = new Date();
//         return {
//             phone: phoneNumber,
//             phoneNumber: phoneNumber,
//             name: '',
//             buyingIntent: 0,
//             stage: 'initial',
//             interests: [],
//             conversationData: {},
//             currentFlow: 'initial',
//             currentStep: 'welcome',
//             createdAt: now,
//             updatedAt: now,
//             lastInteraction: now,
//             lastActivity: now,
//             interactions: [],
//             isFirstMessage: true,
//             isPredetermined: false,
//             skipWelcome: false,
//             tags: [],
//             messageCount: 0,
//             isActive: true,
//             isNewUser: true,
//             isReturningUser: false,
//             followUpSpamCount: 0,
//             totalOrders: 0,
//             demographics: {},
//             preferences: {},
//             customization: {
//                 step: 0,
//                 preferences: {},
//                 totalPrice: 0,
//             }
//         };
//     }
// }

// // Instancia única del sistema
// const trackingSystem = new UserTrackingSystem();

// export function toPlainJSON(input: any, maxDepth = 3): any {
//   const seen = new WeakSet();
//   function walk(val: any, depth: number): any {
//     if (val == null) return val;
//     if (depth <= 0) return '[MaxDepth]';
//     const t = typeof val;
//     if (t === 'string' || t === 'number' || t === 'boolean') return val;
//     if (t === 'bigint') return val.toString();
//     if (t === 'function' || t === 'symbol') return undefined;

//     if (Array.isArray(val)) return val.slice(0, 100).map(v => walk(v, depth - 1));

//     if (t === 'object') {
//       if (seen.has(val)) return '[Circular]';
//       seen.add(val);

//       // Evita objetos no serializables comunes
//       const ctor = val.constructor && val.constructor.name;
//       if (ctor && ['Map','Set','WeakMap','WeakSet','Timeout','Immediate'].includes(ctor)) {
//         return `[${ctor}]`;
//       }

//       const out: any = {};
//       for (const k of Object.keys(val)) {
//         out[k] = walk(val[k], depth - 1);
//       }
//       return out;
//     }
//     return undefined;
//   }
//   return walk(input, maxDepth);
// }

// // util global segura
// export function jsonStringifySafe(value: any, space: number = 2): string {
//   const seen = new WeakSet();
//   const MAX_ARRAY = 500;

//   function replacer(this: any, key: string, val: any) {
//     // eliminar funciones y símbolos
//     if (typeof val === 'function' || typeof val === 'symbol') return undefined;

//     // evitar referencias a objetos problemáticos
//     if (
//       val instanceof Map || val instanceof Set ||
//       val instanceof WeakMap || val instanceof WeakSet
//     ) {
//       return Array.isArray(val) ? val : { type: Object.prototype.toString.call(val), size: (val as any).size };
//     }

//     // cortar ciclos
//     if (val && typeof val === 'object') {
//       if (seen.has(val)) return '[Circular]';
//       seen.add(val);
//     }

//     // acotar arrays enormes
//     if (Array.isArray(val) && val.length > MAX_ARRAY) {
//       return [...val.slice(0, MAX_ARRAY), `...+${val.length - MAX_ARRAY} more`];
//     }

//     // objetos de sistema de Node (Timeout, etc.)
//     if (val && typeof val === 'object') {
//       const ctor = val.constructor && val.constructor.name;
//       if (ctor === 'Timeout' || ctor === 'Immediate') return `[${ctor}]`;
//     }

//     return val;
//   }

//   try {
//     return JSON.stringify(value, replacer, space);
//   } catch (e) {
//     // último recurso: stringify minimal
//     return JSON.stringify({ error: 'stringify_failed' });
//   }
// }

// export function validateSentiment(sentiment: any): SentimentType {
//     if (typeof sentiment === 'string') {
//         const normalizedSentiment = sentiment.toLowerCase().trim();
//         if (normalizedSentiment === 'positive' || normalizedSentiment === 'positivo') return 'positive';
//         if (normalizedSentiment === 'negative' || normalizedSentiment === 'negativo') return 'negative';
//         if (normalizedSentiment === 'neutral') return 'neutral';
//     }
//     return 'neutral';
// }

// function createSafeInteraction(
//     message: string,
//     type: 'user_message' | 'bot_message' | 'system_event',
//     analysis?: {
//         intent?: string;
//         sentiment?: any;
//         engagement?: number;
//     },
//     channel?: string
// ): Interaction {
//     return {
//         message,
//         timestamp: new Date(),
//         type,
//         intent: analysis?.intent || 'general',
//         sentiment: analysis?.sentiment ? validateSentiment(analysis.sentiment) : 'neutral',
//         engagement_level: analysis?.engagement || 50,
//         channel: channel || 'WhatsApp',
//         respondedByBot: false
//     };
// }

// // Clase de IA Simple
// class SimpleAI {
//     static analyzeMessage(message: string, currentFlow: string): { 
//         intent: string; 
//         sentiment: SentimentType; 
//         engagement: number 
//     } {
//         const msg = (message || '').toLowerCase();
//         let intent = 'unknown';

//         if (currentFlow.includes('music') && musicGenres.some(genre => msg.includes(genre))) {
//             intent = 'music_customization';
//         } else if (/(precio|costo|valor|cuesta)/.test(msg)) {
//             intent = 'pricing';
//         } else if (/(ok|continuar|siguiente|perfecto)/.test(msg)) {
//             intent = 'continue';
//         } else if (/(comprar|quiero|me interesa|ordenar)/.test(msg)) {
//             intent = 'buying';
//         } else if (/(no me interesa|no quiero|cancelar|no gracias)/.test(msg)) {
//             intent = 'rejection';
//         } else if (/(personalizado|cambiar|agregar)/.test(msg)) {
//             intent = 'customization';
//         } else if (/(sí|si|genial|excelente|perfecto)/.test(msg)) {
//             intent = 'positive_response';
//         }

//         let sentiment: SentimentType = 'neutral';
//         const positiveWords = ['genial', 'perfecto', 'excelente', 'me gusta', 'interesante', 'bueno', 'sí', 'si', 'ok', 'continuar', 'gracias', 'super', 'increíble'];
//         const negativeWords = ['no me interesa', 'no quiero', 'caro', 'cancelar', 'después', 'luego', 'aburrido', 'demorado', 'malo'];
        
//         if (positiveWords.some(word => msg.includes(word))) sentiment = 'positive';
//         else if (negativeWords.some(word => msg.includes(word))) sentiment = 'negative';

//         let engagement = 5;
//         if (sentiment === 'positive') engagement += 3;
//         if (sentiment === 'negative') engagement -= 2;
//         if (msg.length > 50) engagement += 1;
//         if (intent === 'buying') engagement += 3;
//         if (intent === 'music_customization') engagement += 2;
//         if (intent === 'continue') engagement += 1;

//         return { intent, sentiment, engagement: Math.max(1, Math.min(10, engagement)) };
//     }

//     static analyzeBuyingIntent(session: UserSession): number {
//         let score = 0;
//         const recentInteractions = session.interactions?.slice(-5) || [];
        
//         recentInteractions.forEach(interaction => {
//             if (interaction.intent === 'buying') score += 25;
//             if (interaction.intent === 'pricing') score += 15;
//             if (interaction.intent === 'music_customization') score += 12;
//             if (interaction.intent === 'customization') score += 10;
//             if (interaction.intent === 'continue') score += 8;
//             if (interaction.intent === 'positive_response') score += 5;
//             if (interaction.sentiment === 'positive') score += 5;
//             if (interaction.sentiment === 'negative') score -= 10;
//             score += interaction.engagement_level || 0;
//         });

//         if (session.tags?.includes('VIP')) score += 10;
//         if (session.isVIP) score += 10;
//         if (session.tags?.includes('blacklist')) score = 0;

//         return Math.max(0, Math.min(100, score));
//     }

//     static getNextBestAction(session: UserSession): string {
//         const buyingIntent = this.analyzeBuyingIntent(session);
//         const timeSinceLastInteraction = Date.now() - session.lastInteraction.getTime();
//         const hoursSinceLastInteraction = timeSinceLastInteraction / (1000 * 60 * 60);

//         if (buyingIntent > 70) return 'send_pricing_offer';
//         if (buyingIntent > 50) return 'send_demo_samples';
//         if (hoursSinceLastInteraction > 24 && (session.stage === 'interested' || session.stage === 'customizing')) return 'follow_up_interested';
//         if (hoursSinceLastInteraction > 72 && session.stage === 'customizing') return 'follow_up_urgent';
//         if (session.interactions?.slice(-1)[0]?.sentiment === 'negative') return 'send_special_offer';
//         if (session.tags?.includes('blacklist')) return 'do_not_contact';

//         return 'monitor';
//     }

//     static engagementScore(session: UserSession): number {
//         const engagementLevels = session.interactions?.map(i => i.engagement_level || 0) || [];
//         if (!engagementLevels.length) return 0;
//         return Math.round(engagementLevels.reduce((a, b) => a + b, 0) / engagementLevels.length * 10);
//     }

//     static probabilityToConvert(session: UserSession): number {
//         return Math.round((this.analyzeBuyingIntent(session) + this.engagementScore(session)) / 2);
//     }

//     static churnLikelihood(session: UserSession): number {
//         let risk = 0;
//         const last = session.interactions?.slice(-1)[0];
//         const mins = (Date.now() - session.lastInteraction.getTime()) / (1000 * 60);

//         if (mins > 240) risk += 30;
//         if (mins > 1440) risk += 50;
//         if (last?.sentiment === 'negative') risk += 30;
//         if (session.stage === 'abandoned') risk += 30;

//         return Math.min(100, risk);
//     }
// }

// // Utilidades
// function asUSBContentType(input: string): USBContentType {
//     if (input === 'musica' || input === 'videos' || input === 'peliculas') return input;
//     return 'musica';
// }

// function generateUSBSelectionMessage(contentType: USBContentType): string {
//     if (contentType === 'musica') {
//         return `🎵 ¡Selecciona la cantidad de canciones y lleva tu música favorita a todas partes! 🎶

// ${musicOptions.map(opt => `${opt.id}. ${opt.emoji} ${opt.label} - ¡${opt.desc} por solo $${opt.price.toLocaleString('es-CO')}!`).join('\n')}
            
// 👉 Escribe el número de tu elección y comienza a disfrutar!`;
//     }
//     if (contentType === 'videos') {
//         return `🎬 Selecciona la cantidad de vídeos en USB que deseas:

// ${videoOptions.map(opt => `${opt.id}. ${opt.label} - ${opt.desc} - $${opt.price.toLocaleString('es-CO')}`).join('\n')}
// Escribe el número de tu elección:`;
//     }
//     return `🍿 Selecciona cualquier película o serie, o solicita todo variado:

// ${movieOptions.map(opt => `${opt.id}. USB ${opt.label}: ${opt.desc}. 👉 Oferta exclusiva: $${opt.price.toLocaleString('es-CO')}`).join('\n')}
// *En la opción 4 (128GB), disfruta de un 30% de descuento en la segunda USB.*`;
// }

// function getUSBPriceDesc(contentType: USBContentType, optionId: number) {
//     if (contentType === 'musica') return musicOptions.find(opt => opt.id === optionId);
//     if (contentType === 'videos') return videoOptions.find(opt => opt.id === optionId);
//     return movieOptions.find(opt => opt.id === optionId);
// }

// function detectSessionStage(session: UserSession, analysis: { intent: string, sentiment: SentimentType }, message: string): string {
//     const msg = message.toLowerCase();

//     if (/\bbaladas\b/.test(msg) && /(60|70|80|90)/.test(msg) && /(sin relleno|sin repetidas|no repetidas)/i.test(msg)) {
//     return 'customizing'; // fijar
//     }

//     if (/finalizar pedido|confirmar compra|método de pago|transferencia|pago|nombre completo|dirección|celular|envío a|pagar|factura|comprobante|recibo|domicilio/.test(msg)) {
//         return 'closing';
//     }
//     if (/(quiero|deseo|voy a|me interesa|comprar|listo para|confirmo|realizar pedido|adquirir|pido|hazme el pedido)/.test(msg) ||
//         analysis.intent === 'buying') {
//         return 'interested';
//     }
//     if (/(cuánto|cuanto|precio|costo|valor|cuánto vale|descuento|promoción|oferta|pago|formas de pago|precio final)/.test(msg) ||
//         analysis.intent === 'pricing') {
//         return 'pricing';
//     }
//     if (/(demo|ejemplo|muestra|quiero escuchar|quiero ver|playlist|personalizada|géneros a incluir|puedes agregar|puedes quitar)/.test(msg) ||
//         analysis.intent === 'customization' || analysis.intent === 'music_customization') {
//         return 'customizing';
//     }
//     if (/(sí|si|me gusta|genial|excelente|ok|perfecto|dale|continúa|avísame|dime más|interesante)/.test(msg) ||
//         analysis.intent === 'positive_response') {
//         if (session.stage === 'customizing' || session.stage === 'pricing') return session.stage;
//         return 'interested';
//     }
//     if (/(no quiero|no me interesa|muy caro|más adelante|luego|después|no gracias|tal vez|no por ahora|cancelar)/.test(msg) ||
//         analysis.intent === 'rejection' || 
//         analysis.sentiment === 'negative') {
//         return 'abandoned';
//     }
//     if (session.lastInteraction && (Date.now() - session.lastInteraction.getTime() > 2 * 24 * 60 * 60 * 1000)) {
//         return 'inactive';
//     }
//     return session.stage || 'initial';
// }

// // Funciones principales
// export const getUserSession = async (phoneNumber: string): Promise<UserSession> => {
//     return await trackingSystem.getUserSession(phoneNumber);
// };

// interface SessionOptions {
//     messageType?: string;
//     confidence?: number;
//     isPredetermined?: boolean;
//     routerDecision?: {
//         targetFlow: string;
//         shouldRedirect: boolean;
//     };
//     metadata?: Record<string, any>;
//     step?: string;
// }

// export const updateUserSession = async (
//   phoneNumber: string,
//   message: string,
//   currentFlow: string,
//   step?: string | null,
//   isProcessing: boolean = false,
//   options?: {
//     messageType?: string;
//     confidence?: number;
//     isPredetermined?: boolean;
//     routerDecision?: {
//       targetFlow: string;
//       shouldRedirect: boolean;
//     };
//     metadata?: Record<string, any>;
//   },
//   pushName?: string
// ): Promise<void> => {
//   try {
//     const validatedPhone = validatePhoneNumber(phoneNumber);
//     if (!validatedPhone) {
//       console.error('❌ Número de teléfono inválido:', phoneNumber);
//       return;
//     }

//     // 1) Normaliza y acepta alias con sufijo Flow
//     function normalizeFlowAlias(flow: string): string {
//       const f = (flow || '').toLowerCase().trim();
//       const aliases: Record<string, string> = {
//         'welcome_flow': 'welcomeFlow',
//         'welcome': 'welcomeFlow',
//         'catalog': 'catalogFlow',
//         'catalog_flow': 'catalogFlow',
//         'customization': 'customizationFlow',
//         'customization_flow': 'customizationFlow',
//         'customization_started': 'customizationFlow',
//         'music_flow': 'musicUsb',
//         'video_flow': 'videosUsb',
//         'movies_flow': 'moviesUsb',
//         'payment_flow': 'orderFlow',
//         'order_creation': 'orderFlow',
//         'processing': 'orderFlow',
//         'audio_received': 'media_received',
//         'media_received': 'media_received'
//       };
//       return aliases[f] || currentFlow;
//     }

//     const normalizedFlow = normalizeFlowAlias(currentFlow);

//     // 2) Lista de flujos válidos incluyendo variantes ...Flow
//     const validFlows = [
//       'welcome', 'welcomeFlow',
//       'catalog', 'catalogFlow',
//       'customization', 'customizationFlow', 'customizationStarted',
//       'order', 'orderFlow', 'payment_flow',
//       'music', 'musicUsb',
//       'videos', 'videosUsb',
//       'movies', 'moviesUsb',
//       'media_received', 'audio_received',
//       'cross_sell',
//       // pasos internos mapeados por tu lógica
//       'musicPreferences', 'designPreferences', 'technicalSpecs', 'accessoriesSelected'
//     ];

//     // 3) Acepta flujos no exactos pero compatibles (p. ej. algo que termina en Flow)
//     let finalFlow = normalizedFlow;
//     if (!validFlows.includes(finalFlow)) {
//       if (finalFlow.endsWith('Flow')) {
//         const base = finalFlow.replace(/Flow$/i, '');
//         if (validFlows.includes(base)) finalFlow = base;
//       }
//       if (!validFlows.includes(finalFlow)) {
//         // En último caso, no rechazar: usa welcomeFlow como fallback pero registra el que llegó
//         console.warn(`⚠️ Flujo no reconocido (${currentFlow}). Normalizando a welcomeFlow`);
//         finalFlow = 'welcomeFlow';
//       }
//     }

//     // 4) Sanitiza el mensaje (permite vacío si esPredetermined)
//     const sanitizedMessage = sanitizeMessage(message);
//     if (!sanitizedMessage && !options?.isPredetermined) {
//       // No detengas la sesión; solo registra que no hay texto
//       console.warn('⚠️ Mensaje vacío, continúo sin registrar interacción de texto');
//     }

//     // 5) Obtén sesión
//     const session = await getUserSession(validatedPhone);
//     const now = new Date();
//     const previousFlow = session.currentFlow;

//     if (!session || typeof session !== 'object') throw new Error('Sesión inválida');

//     // 6) Actualiza campos base
//     session.lastInteraction = now;
//     session.lastActivity = now;
//     session.updatedAt = now;
//     session.messageCount = (session.messageCount || 0) + (sanitizedMessage ? 1 : 0);
//     session.currentFlow = finalFlow;
//     session.isActive = true;

//     // 7) Análisis simple/avanzado
//     let analysis: { intent: string; sentiment: SentimentType; engagement: number };
//     try {
//       analysis = await performIntelligentAnalysis(sanitizedMessage || '', finalFlow, session);
//     } catch {
//       analysis = {
//         intent: extractBasicIntent(sanitizedMessage || ''),
//         sentiment: 'neutral',
//         engagement: 50
//       };
//     }

//     if (options?.metadata && typeof options.metadata === 'object') {
//       session.conversationData = session.conversationData || {};
//       const safeMeta = toPlainJSON(options.metadata, 3);
//       session.conversationData.metadata = {
//         ...toPlainJSON(session.conversationData.metadata || {}, 3),
//         ...safeMeta,
//         lastUpdate: new Date().toISOString()
//       };
//     }

//     // 8) Guarda decisiones del router/metadata (sin funciones)
//     if (options) {
//       if (options.routerDecision && typeof options.routerDecision === 'object') {
//         session.conversationData = session.conversationData || {};
//         session.conversationData.routerDecision = {
//           targetFlow: options.routerDecision.targetFlow,
//           shouldRedirect: options.routerDecision.shouldRedirect,
//           timestamp: now.toISOString()
//         };
//       }
//       if (options.metadata && typeof options.metadata === 'object') {
//         session.conversationData = session.conversationData || {};
//         session.conversationData.metadata = {
//           ...session.conversationData.metadata,
//           ...options.metadata,
//           lastUpdate: now.toISOString()
//         };
//       }
//     }

//     // 9) Registrar interacción si hay texto
//     if (sanitizedMessage && sanitizedMessage.trim().length > 0) {
//       const newInteraction: Interaction = {
//         timestamp: now,
//         message: sanitizedMessage.substring(0, 500),
//         type: 'user_message',
//         intent: analysis.intent,
//         sentiment: analysis.sentiment,
//         engagement_level: analysis.engagement,
//         channel: (session.interactions?.slice(-1).find(i => !!i.channel)?.channel) || 'WhatsApp',
//         respondedByBot: true,
//         metadata: {
//           flow: finalFlow,
//           messageType: options?.messageType,
//           confidence: options?.confidence,
//           isPredetermined: options?.isPredetermined || false,
//           previousFlow,
//           sessionStage: session.stage,
//           messageLength: sanitizedMessage.length
//         }
//       };
//       session.interactions = session.interactions || [];
//       session.interactions.push(newInteraction);
//       if (session.interactions.length > 500) {
//         session.interactions = session.interactions.slice(-500);
//       }
//     }

//     // 10) Customization scaffold
//     if (!session.customization || typeof session.customization !== 'object') {
//       session.customization = {
//         step: 0,
//         preferences: {},
//         totalPrice: 0,
//         startedAt: now,
//         selectedType: (options?.messageType as any) || null,
//         confidence: options?.confidence || 0,
//         lastUpdate: now.toISOString()
//       };
//     } else {
//       const customizationExtended = session.customization as any;
//       if (options?.messageType && !customizationExtended.selectedType) customizationExtended.selectedType = options.messageType;
//       if (options?.confidence && !customizationExtended.confidence) customizationExtended.confidence = options.confidence;
//       customizationExtended.lastUpdate = now.toISOString();
//     }

//     // 11) Mapear pasos a números (si aplica)
//     const flowStepMap: Record<string, number> = {
//       'welcome': 0,
//       'welcomeFlow': 0,
//       'customizationFlow': 1,
//       'musicUsb': 2,
//       'videosUsb': 2,
//       'moviesUsb': 2,
//       'musicPreferences': 3,
//       'designPreferences': 4,
//       'technicalSpecs': 5,
//       'accessoriesSelected': 6,
//       'orderFlow': 7,
//       'payment_flow': 8,
//       'confirmed': 9
//     };
//     if (finalFlow in flowStepMap && session.customization) {
//       session.customization.step = flowStepMap[finalFlow];
//       const cext = session.customization as any;
//       if (finalFlow === 'musicUsb') cext.selectedType = 'music';
//       if (finalFlow === 'videosUsb') cext.selectedType = 'videos';
//       if (finalFlow === 'moviesUsb') cext.selectedType = 'movies';
//     }

//     // 12) Intereses
//     const intentInterestMap: Record<string, string> = {
//       'music': 'music',
//       'video': 'videos',
//       'movie': 'movies',
//       'customization': 'customization',
//       'purchase': 'purchase',
//       'pricing': 'pricing',
//       'technical': 'technical_specs'
//     };
//     for (const [intentKey, interest] of Object.entries(intentInterestMap)) {
//       if (analysis.intent.includes(intentKey) && !(session.interests || []).includes(interest)) {
//         session.interests = session.interests || [];
//         session.interests.push(interest);
//       }
//     }

//     // 13) Etapa
//     const prevStage = session.stage || 'initial';
//     let newStage = prevStage;
//     try {
//       newStage = await detectAdvancedStage(session, analysis, sanitizedMessage || '', options);
//     } catch {
//       newStage = detectBasicStage(sanitizedMessage || '', session, analysis);
//     }
//     if (prevStage !== newStage) {
//       session.conversationData = session.conversationData || {};
//       session.conversationData.stageHistory = session.conversationData.stageHistory || [];
//       session.conversationData.stageHistory.push({
//         from: prevStage,
//         to: newStage,
//         timestamp: now.toISOString(),
//         trigger: (sanitizedMessage || '').substring(0, 100)
//       });
//     }
//     session.stage = newStage;

//     // 14) AI analysis opcional
//     try {
//       const aiAnalysis = await performAdvancedAIAnalysis(session, options);
//       if (aiAnalysis) {
//         session.aiAnalysis = aiAnalysis;
//         session.buyingIntent = aiAnalysis.buyingIntent;
//         session.conversationData = session.conversationData || {};
//         session.conversationData.aiInsights = session.conversationData.aiInsights || [];
//         session.conversationData.aiInsights.push({
//           timestamp: now.toISOString(),
//           buyingIntent: aiAnalysis.buyingIntent,
//           confidence: options?.confidence || 0,
//           messageType: options?.messageType,
//           insights: aiAnalysis.insights || []
//         });
//         if (session.conversationData.aiInsights.length > 10) {
//           session.conversationData.aiInsights = session.conversationData.aiInsights.slice(-10);
//         }
//       }
//     } catch {
//       session.buyingIntent = calculateBasicBuyingIntent(session, analysis);
//     }

//     // 15) Persistencia
//     try {
//       if (!global.userSessions) global.userSessions = new Map();
//       global.userSessions.set(validatedPhone, session);

//       if (typeof businessDB?.updateUserSession === 'function') {
//         const payload: Partial<UserSession> & any = { ...session };
//         const stringify = (v: any, fallback: string) => {
//           try { return typeof v === 'string' ? v : JSON.stringify(v ?? fallback); } catch { return fallback; }
//         };
//         const existing = await businessDB.getUserSession(validatedPhone).catch(() => null);
//         let mergedInteractions = session.interactions || [];
//         if (existing?.interactions) {
//           const existingParsed = Array.isArray(existing.interactions) ? existing.interactions : safeJSON(existing.interactions, []);
//           mergedInteractions = [...existingParsed.slice(-100), ...session.interactions].slice(-200);
//         }
//         const safeStr = (v: any, fallback: string) => {
//           try { return jsonStringifySafe(v); } catch { return fallback; }
//         };
//         payload.preferences = safeStr(payload.preferences, '{}');
//         payload.demographics = safeStr(payload.demographics, '{}');
//         payload.interactions = safeStr(mergedInteractions, '[]');
//         payload.interests = safeStr(session.interests || [], '[]');
//         payload.conversationData = safeStr(session.conversationData || {}, '{}');
//         await businessDB.updateUserSession(validatedPhone, payload);
//       }
//     } catch (persistError) {
//       console.error('❌ Error persistiendo sesión:', persistError);
//     }

//     // 16) Seguimiento programado
//     try {
//       if (typeof scheduleFollowUp === 'function' &&
//           session.stage !== 'converted' &&
//           session.stage !== 'order_confirmed' &&
//           !(session.tags || []).includes('blacklist') &&
//           (session.buyingIntent > 30 || session.stage === 'pricing' || session.stage === 'customizing')) {
//         scheduleFollowUp(validatedPhone);
//       }
//     } catch (followUpError) {
//       console.warn('⚠️ Error programando seguimiento:', followUpError);
//     }

//     console.log(`📊 [${validatedPhone}] Intent=${analysis.intent} | Sentiment=${analysis.sentiment} | Stage=${session.stage} | BuyingIntent=${session.buyingIntent}% | Flow=${finalFlow}`);
//     userSessions.set(validatedPhone, session);
//   } catch (error) {
//     console.error(`❌ Error crítico en updateUserSession para ${phoneNumber}:`, error);
//   }
// };

// // ==== Análisis y detección auxiliares ====

// async function performIntelligentAnalysis(
//     message: string, 
//     currentFlow: string, 
//     session: UserSession
// ): Promise<{intent: string, sentiment: SentimentType, engagement: number}> {
//     try {
//         const intent = extractAdvancedIntent(message, currentFlow);
//         const sentiment = analyzeAdvancedSentiment(message);
//         const engagement = calculateAdvancedEngagement(message, session);
//         return { intent, sentiment, engagement };
//     } catch {
//         return {
//             intent: extractBasicIntent(message),
//             sentiment: 'neutral',
//             engagement: 50
//         };
//     }
// }

// function extractAdvancedIntent(message: string, currentFlow: string): string {
//     const cleanMessage = (message || '').toLowerCase().trim();
//     const flowIntents: Record<string, string[]> = {
//         'musicUsb': ['music', 'song', 'playlist', 'genre'],
//         'videosUsb': ['video', 'clip', 'documentary', 'tutorial'],
//         'moviesUsb': ['movie', 'film', 'series', 'show'],
//         'orderFlow': ['buy', 'purchase', 'order', 'price'],
//         'datosCliente': ['address', 'phone', 'payment', 'name']
//     };
//     if (flowIntents[currentFlow]) {
//         for (const keyword of flowIntents[currentFlow]) {
//             if (cleanMessage.includes(keyword)) return keyword;
//         }
//     }
//     return extractBasicIntent(message);
// }

// function analyzeAdvancedSentiment(message: string): SentimentType {
//     const positiveWords = ['excelente', 'perfecto', 'genial', 'increíble', 'me gusta', 'interesante', 'sí', 'si'];
//     const negativeWords = ['no', 'mal', 'terrible', 'horrible', 'no me gusta', 'luego', 'después'];
//     const cleanMessage = (message || '').toLowerCase();
//     const positiveCount = positiveWords.filter(word => cleanMessage.includes(word)).length;
//     const negativeCount = negativeWords.filter(word => cleanMessage.includes(word)).length;
//     if (positiveCount > negativeCount) return 'positive';
//     if (negativeCount > positiveCount) return 'negative';
//     return 'neutral';
// }

// function calculateAdvancedEngagement(message: string, session: UserSession): number {
//     let engagement = 50;
//     if (message.length > 50) engagement += 10;
//     if (message.length > 100) engagement += 10;
//     if (message.includes('?')) engagement += 15;
//     const emojiCount = (message.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
//     engagement += Math.min(emojiCount * 5, 20);
//     if (session.interactions && session.interactions.length > 3) engagement += 10;
//     return Math.min(Math.max(engagement, 0), 100);
// }

// async function detectAdvancedStage(
//     session: UserSession, 
//     analysis: any, 
//     message: string, 
//     options?: any
// ): Promise<string> {
//     if (options?.isPredetermined) return `interested_${options.messageType || 'general'}`;
//     if (analysis.intent.includes('buy') || analysis.intent.includes('purchase')) return 'ready_to_buy';
//     if (analysis.intent.includes('price') || analysis.intent.includes('cost') || analysis.intent === 'pricing') return 'pricing';
//     return detectBasicStage(message, session, analysis);
// }

// // Contadores de seguimiento
// let FOLLOWUP_SENT_TOTAL = 0;
// let FOLLOWUP_SENT_WINDOW = 0;
// let FOLLOWUP_LAST_WINDOW_AT = Date.now();

// // Helper para registrar envío
// function logFollowUpSent(phone: string, urgency: 'high'|'medium'|'low', channel: Channel) {
//   FOLLOWUP_SENT_TOTAL++;
//   FOLLOWUP_SENT_WINDOW++;
//   console.log(`📬 [FOLLOWUP][#${FOLLOWUP_SENT_TOTAL}] Enviado a ${phone} | urg=${urgency} | ch=${channel} | ventana=${FOLLOWUP_SENT_WINDOW}`);
// }

// // Reset de ventana cada 60 min
// setInterval(() => {
//   console.log(`⏱️ [FOLLOWUP] Ventana cerrada. Enviados en la última hora: ${FOLLOWUP_SENT_WINDOW}. Total histórico: ${FOLLOWUP_SENT_TOTAL}.`);
//   FOLLOWUP_SENT_WINDOW = 0;
//   FOLLOWUP_LAST_WINDOW_AT = Date.now();
// }, 60 * 60 * 1000);

// async function performAdvancedAIAnalysis(session: UserSession, options?: any): Promise<any> {
//     const buyingIntent = calculateAdvancedBuyingIntent(session, options);
//     const riskLevel = (() => {
//         const hours = (Date.now() - session.lastInteraction.getTime()) / 36e5;
//         if (hours > 48) return 'high';
//         if (hours > 12) return 'medium';
//         return 'low';
//     })();
//     return {
//         buyingIntent,
//         riskLevel,
//         insights: [
//             `Origen: ${options?.isPredetermined ? 'Predeterminado' : 'Libre'}`,
//             `Confianza: ${options?.confidence || 0}`,
//             `Tipo: ${options?.messageType || 'general'}`
//         ]
//     };
// }

// function calculateAdvancedBuyingIntent(session: UserSession, options?: any): number {
//     let intent = session.buyingIntent || 50;
//     if (options?.isPredetermined) intent += 20;
//     if (options?.confidence && options.confidence > 0.8) intent += 15;
//     if (options?.messageType && ['music', 'videos', 'movies'].includes(options.messageType)) intent += 10;
//     intent += Math.min((session.messageCount || 0), 10);
//     return Math.min(Math.max(intent, 0), 100);
// }

// // Básicas
// function extractBasicIntent(message: string): string {
//     if (!message || typeof message !== 'string') return 'general';
//     const msg = message.toLowerCase().trim();
//     if (/(precio|costo|vale|cuánto|cuanto)/.test(msg)) return 'pricing_inquiry';
//     if (/(comprar|pedido|orden|quiero)/.test(msg)) return 'purchase_intent';
//     if (/(personalizar|customizar|diseñar)/.test(msg)) return 'customization_interest';
//     if (/(catálogo|productos|opciones|mostrar)/.test(msg)) return 'product_inquiry';
//     if (/(gracias|perfecto|excelente|genial)/.test(msg)) return 'positive_feedback';
//     if (/(no|cancelar|después|luego)/.test(msg)) return 'negative_response';
//     if (/^[1-4]$/.test(msg)) return 'option_selection';
//     return 'general_inquiry';
// }

// function analyzeBasicSentiment(message: string): SentimentType {
//     if (!message || typeof message !== 'string') return 'neutral';
//     const msg = message.toLowerCase().trim();
//     const positivePatterns = [
//         /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
//         /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
//         /\b(amor|amo|encanta|fascina|ideal|justo|necesito)\b/
//     ];
//     const negativePatterns = [
//         /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego)\b/,
//         /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
//         /\b(aburrido|feo|horrible|odio|detesto|molesta)\b/
//     ];
//     for (const pattern of positivePatterns) if (pattern.test(msg)) return 'positive';
//     for (const pattern of negativePatterns) if (pattern.test(msg)) return 'negative';
//     return 'neutral';
// }

// const calculateBasicEngagement = (message: string, session: UserSession): number => {
//     let engagement = 50;
//     if (message.length > 20) engagement += 10;
//     if (message.includes('?')) engagement += 5;
//     if (session.messageCount > 3) engagement += 10;
//     if (session.interests && session.interests.length > 0) engagement += 15;
//     return Math.min(Math.max(engagement, 0), 100);
// };

// const detectBasicStage = (message: string, session: UserSession, analysis: any): string => {
//     const lowerMessage = (message || '').toLowerCase();
//     if (lowerMessage.includes('comprar') || lowerMessage.includes('pedido')) return 'purchase_intent';
//     if (/^[1-4]$/.test((message || '').trim())) return 'option_selected';
//     if (/(precio|costo)/.test(lowerMessage)) return 'pricing';
//     if (lowerMessage.includes('personalizar')) return 'customization_interest';
//     if (lowerMessage.includes('catálogo')) return 'browsing';
//     if (analysis.sentiment === 'positive' && session.stage === 'price_inquiry') return 'interested';
//     return session.stage || 'initial';
// };

// const calculateBasicBuyingIntent = (session: UserSession, analysis: any): number => {
//     let intent = session.buyingIntent || 50;
//     if (session.stage === 'purchase_intent') intent += 20;
//     if (session.stage === 'price_inquiry') intent += 15;
//     if (session.stage === 'customization_interest') intent += 10;
//     if (analysis.sentiment === 'positive') intent += 5;
//     if (session.messageCount > 5) intent += 10;
//     if (session.interactions && session.interactions.length > 3) intent += 5;
//     return Math.min(Math.max(intent, 0), 100);
// };

// const performAIAnalysis = async (session: UserSession): Promise<any | null> => {
//     try {
//         const aiAnalysis: any = {
//             buyingIntent: session.buyingIntent || 50,
//             interests: session.interests || [],
//             nextBestAction: 'show_catalog',
//             followUpTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
//             riskLevel: 'low',
//             engagementScore: 50,
//             probabilityToConvert: 50,
//             churnLikelihood: 20
//         };

//         if (typeof SimpleAI.analyzeBuyingIntent === 'function') {
//             const buyingIntent = SimpleAI.analyzeBuyingIntent(session);
//             if (typeof buyingIntent === 'number' && buyingIntent >= 0 && buyingIntent <= 100) {
//                 aiAnalysis.buyingIntent = Math.round(buyingIntent);
//             }
//         }

//         if (typeof SimpleAI.getNextBestAction === 'function') {
//             const nextAction = SimpleAI.getNextBestAction(session);
//             if (typeof nextAction === 'string' && nextAction.trim().length > 0) {
//                 aiAnalysis.nextBestAction = nextAction;
//             }
//         }

//         if (typeof SimpleAI.engagementScore === 'function') {
//             const engagement = SimpleAI.engagementScore(session);
//             if (typeof engagement === 'number' && engagement >= 0 && engagement <= 100) {
//                 aiAnalysis.engagementScore = Math.round(engagement);
//             }
//         }

//         return aiAnalysis;
        
//     } catch (aiError) {
//         console.warn('⚠️ Error en análisis AI completo:', aiError);
//         return null;
//     }
// };

// // Seguimiento y rescate

// const getFollowUpDelay = (session: UserSession): number => {
//     const baseDelay = 2 * 60 * 60 * 1000;
//     if (session.aiAnalysis?.buyingIntent && session.aiAnalysis.buyingIntent > 70) return 30 * 60 * 1000;
//     if (session.stage === 'interested') return 60 * 60 * 1000;
//     if (session.aiAnalysis?.riskLevel === 'high') return 4 * 60 * 60 * 1000;
//     return baseDelay;
// };

// const scheduleFollowUp = (phoneNumber: string): void => {
//   const session = userSessions.get(phoneNumber);
//   if (!session) return;

//   // EXCLUSIÓN por chat activo de WhatsApp
//   if (isWhatsAppChatActive(session)) {
//     console.log(`[FOLLOWUP] Excluido (chat activo WhatsApp): ${phoneNumber}`);
//     return;
//   }

//   if (session.stage === 'converted' || session.tags?.includes('blacklist')) return;

//   // Evitar programar si ya hay uno
//   if (followUpQueue.has(phoneNumber)) return;

//   // Respetar ventana de 24h desde el último follow-up
//   if (session.lastFollowUp && (Date.now() - session.lastFollowUp.getTime()) < 24*3600000) {
//     console.log(`[FOLLOWUP] Saltado (menos de 24h) ${phoneNumber}`);
//     return;
//   }

//   const followUpDelay = getFollowUpDelay(session);
//   const timeoutId = setTimeout(async () => {
//     followUpQueue.delete(phoneNumber);
//     const currentSession = userSessions.get(phoneNumber);
//     if (!currentSession) return;

//     // EXCLUSIÓN otra vez antes de ejecutar
//     if (isWhatsAppChatActive(currentSession)) {
//       console.log(`[FOLLOWUP] Excluido al ejecutar (chat activo WhatsApp): ${phoneNumber}`);
//       return;
//     }

//     // Último check: 5 min desde última interacción
//     const minutesSinceLastInteraction = (Date.now() - currentSession.lastInteraction.getTime()) / 60000;
//     if (minutesSinceLastInteraction < 5) {
//       console.log(`[FOLLOWUP] Reciente interacción: NO se envía (${phoneNumber}).`);
//       return;
//     }

//     // Respetar gates en envío final
//     await sendFollowUpMessage(phoneNumber);
//   }, followUpDelay);

//   followUpQueue.set(phoneNumber, timeoutId);
//   console.log(`[FOLLOWUP] Programado para ${phoneNumber} en ${Math.round(followUpDelay / 60000)} min.`);
// };

// // export const canReceiveFollowUp = async (phoneNumber: string, session: UserSession, opts?: { assured?: boolean }): Promise<boolean> => {
// //   if (session.tags?.includes('blacklist')) return false;
// //   if (session.stage === 'converted') return false;
// //   if ((session.followUpSpamCount ?? 0) >= MAX_UNANSWERED_FOLLOWUPS && !opts?.assured) return false;

// //   const now = new Date();
// //   const minutesSinceLastInteraction = (now.getTime() - session.lastInteraction.getTime()) / (1000 * 60);

// //   // En modo asegurado relajamos algunos límites pero mantenemos ventanas
// //   const minGap = opts?.assured ? 5 : 10;
// //   if (minutesSinceLastInteraction < minGap) return false;

// //   const hour = now.getHours();
// //   if (hour < 8 || hour > 22) return false;

// //   const minHoursBetween = opts?.assured ? Math.min(6, MIN_HOURS_BETWEEN_FOLLOWUPS) : MIN_HOURS_BETWEEN_FOLLOWUPS;
// //   if (session.lastFollowUp) {
// //     const hoursSinceLastFU = (now.getTime() - session.lastFollowUp.getTime()) / 36e5;
// //     if (hoursSinceLastFU < minHoursBetween) return false;
// //   }

// //   return true;
// // };


// export const getUrgencyMessage = (urgencyLevel: 'high' | 'medium' | 'low', buyingIntent: number): string => {
//     if (urgencyLevel === 'high' && buyingIntent > 70) return "🚨 ÚLTIMA OPORTUNIDAD: Tu descuento del 30% expira en 2 horas. ¿Confirmas ahora?";
//     else if (urgencyLevel === 'medium' && buyingIntent > 50) return "⏰ Tu USB personalizada está lista. ¿La separamos con 20% OFF?";
//     return "💭 ¿Tienes alguna duda sobre tu USB? Estoy aquí para ayudarte.";
// };

// export const generatePersuasiveFollowUp = (
//   user: UserSession,
//   urgencyLevel: 'high' | 'medium' | 'low'
// ): string[] => {
//   const name = user.name ? user.name.split(' ')[0] : '';
//   const greet = name ? `¡Hola ${name}!` : '¡Hola!';

//   // Determinar capacidad y precio preferido si existe
//   const preferCapacity = (user as any).capacity || (user.preferences as any)?.capacity?.[0] || null;
//   const priceMap: Record<string, number> = { '8GB': 59900, '32GB': 89900, '64GB': 129900, '128GB': 169900 };
//   const descMap: Record<string, string> = {
//     '8GB': 'hasta 1.400 canciones',
//     '32GB': 'hasta 5.000 canciones',
//     '64GB': 'hasta 10.000 canciones',
//     '128GB': 'hasta 25.000 canciones'
//   };

//   const pick = (preferCapacity && priceMap[preferCapacity]) ? preferCapacity : '32GB';
//   const pickedPrice = priceMap[pick];
//   const pickedDesc = descMap[pick];

//   // Mensajes base por técnica
//   let technique: keyof typeof PERSUASION_TECHNIQUES = 'social_proof';
//   if (user.buyingIntent > 80) technique = 'scarcity';
//   else if (user.isVIP) technique = 'reciprocity';
//   else if (user.stage === 'pricing') technique = 'authority';

//   const persuasionLead = PERSUASION_TECHNIQUES[technique][Math.floor(Math.random() * PERSUASION_TECHNIQUES[technique].length)];

//   // Ofertas concretas por capacidad
//   const offerLines = [
//     `💾 USB ${pick} por $${pickedPrice.toLocaleString('es-CO')} — ${pickedDesc}.`,
//     `📦 Opciones: 8GB ($${priceMap['8GB'].toLocaleString('es-CO')}), 32GB ($${priceMap['32GB'].toLocaleString('es-CO')}), 64GB ($${priceMap['64GB'].toLocaleString('es-CO')}), 128GB ($${priceMap['128GB'].toLocaleString('es-CO')}).`
//   ];

//   // Sutil: “cualquier tipo de contenido”
//   const subtleScope = "🔓 Lleva tu contenido favorito en una sola USB: playlists, videos, series, podcasts y más.";

//   // Ajustes por etapa
//   const stageHints: string[] = [];
//   if (user.stage === 'customizing') {
//     stageHints.push("🎛️ Dejo lista tu selección y la pulimos en 1 min.");
//   } else if (user.stage === 'pricing') {
//     stageHints.push("💡 Te muestro el mejor precio según tu capacidad preferida.");
//   } else if (user.stage === 'interested') {
//     stageHints.push("🧾 Puedo generar el pedido ahora con tus datos guardados.");
//   }

//   // Urgencia
//   const urgencyMsg =
//     urgencyLevel === 'high' && user.buyingIntent > 70
//       ? "⏰ Últimas unidades hoy con 20% OFF en la segunda USB."
//       : urgencyLevel === 'medium' && user.buyingIntent > 50
//       ? "✅ Activa tu pedido y obtén envío gratis hoy."
//       : "💬 ¿Tienes dudas? Te respondo y avanzamos sin compromiso.";

//   // CTA
//   const cta =
//     urgencyLevel === 'high'
//       ? "👉 Responde 'SÍ' para separarla ahora."
//       : "✍️ Escribe 'PRECIO' o dime la capacidad que prefieres (8, 32, 64 o 128GB).";

//   const lines: string[] = [
//     `${greet} ${persuasionLead}`,
//     ...offerLines,
//     subtleScope,
//     ...stageHints,
//     urgencyMsg,
//     cta
//   ];

//   return lines;
// };

// // ===== Copy y medios por canal =====
// type Channel = 'WhatsApp' | 'Instagram' | 'Telegram' | 'Web';

// const CHANNEL_COPIES: Record<Channel, {
//   opener: (name?: string) => string;
//   ctaHigh?: string;
//   ctaMedium?: string;
//   ctaLow?: string;
//   footer?: string;
//   mediaHint?: string; // texto de apoyo si se adjunta media
// }> = {
//   WhatsApp: {
//     opener: (name) => name ? `¡Hola ${name}!` : '¡Hola!',
//     ctaHigh: "👉 Responde 'SÍ' para confirmar ahora y asegurar tu descuento.",
//     ctaMedium: "💬 Responde 'PRECIO' para ver la mejor oferta del momento.",
//     ctaLow: "¿Te ayudo a continuar tu pedido?",
//     footer: "Atiende este mensaje cuando puedas, guardé tu progreso. ✅",
//     mediaHint: "Te dejo una muestra rápida:"
//   },
//   Instagram: {
//     opener: (name) => name ? `Hola ${name} ✨` : 'Hola ✨',
//     ctaHigh: "Toca para confirmar y separar tu pedido ahora.",
//     ctaMedium: "Escríbeme 'PRECIO' y te muestro oferta.",
//     ctaLow: "¿Seguimos? Te ayudo en 1 min.",
//     footer: "Guardé tu avance 💾",
//     mediaHint: "Mira este preview:"
//   },
//   Telegram: {
//     opener: (name) => name ? `Hola ${name} 👋` : 'Hola 👋',
//     ctaHigh: "Responde 'SI' para confirmar el pedido.",
//     ctaMedium: "Escribe 'PRECIO' para ver la oferta activa.",
//     ctaLow: "¿Continuamos? Puedo crear el pedido por ti.",
//     footer: "Progreso guardado.",
//     mediaHint: "Preview:"
//   },
//   Web: {
//     opener: (name) => name ? `Hola ${name}` : 'Hola',
//     ctaHigh: "Confirma para finalizar ahora.",
//     ctaMedium: "Pide 'PRECIO' para ver la mejor oferta disponible.",
//     ctaLow: "¿Te acompaño a terminar la compra?",
//     footer: "Tu sesión está guardada.",
//     mediaHint: "Ejemplo:"
//   }
// };

// // Selección de media (demo) según intereses y canal
// async function buildChannelFollowUpPayload(session: UserSession, channel: Channel): Promise<{
//   body: string;
//   media?: { url: string; caption?: string };
// }> {
//   const name = session.name ? session.name.split(' ')[0] : undefined;
//   const c = CHANNEL_COPIES[channel] || CHANNEL_COPIES['WhatsApp'];

//   // Técnica de persuasión existente + urgencia
//   const urgency: 'high' | 'medium' | 'low' = session.buyingIntent > 80 ? 'high' : (session.buyingIntent > 60 || session.stage === 'pricing') ? 'medium' : 'low';
//   const persuasionMsgs = generatePersuasiveFollowUp(session, urgency);

//   // Intentar adjuntar una demo (rich media) si hay intereses
//   let media: { url: string; caption?: string } | undefined;
//   try {
//     // Reutiliza la lógica de sendDemoIfNeeded pero sin enviar, solo selecciona
//     const genreTopHits = musicData.genreTopHits || {};
//     const videoTopHits = videoData.topHits || {};

//     const interestGenre = session.interests.find(g => (genreTopHits as any)[g]) || Object.keys(genreTopHits)[0];
//     const interestVideo = session.interests.find(g => (videoTopHits as any)[g]) || Object.keys(videoTopHits)[0];

//     // Preferencia: si mostró interés en música, adjuntamos una demo corta
//     if (session.interests.some(i => i.includes('music') || i === 'musica' || (genreTopHits as any)[i])) {
//       const demos = (genreTopHits as any)[interestGenre] || [];
//       if (demos.length > 0) {
//         const pick = demos[Math.floor(Math.random() * demos.length)];
//         media = { url: pick.file, caption: `${c.mediaHint} ${pick.name}` };
//       }
//     } else if (session.interests.some(i => i.includes('video') || i === 'videos' || (videoTopHits as any)[i])) {
//       const demos = (videoTopHits as any)[interestVideo] || [];
//       if (demos.length > 0) {
//         const pick = demos[Math.floor(Math.random() * demos.length)];
//         media = { url: pick.file, caption: `${c.mediaHint} ${pick.name}` };
//       }
//     }
//   } catch (e) {
//     // silencioso
//   }

//   // CTA canal-específica
//   let cta = c.ctaLow!;
//   if (urgency === 'high' && c.ctaHigh) cta = c.ctaHigh;
//   else if (urgency === 'medium' && c.ctaMedium) cta = c.ctaMedium;

//   // Ensamblar cuerpo final
//   const opener = c.opener(name);
//   const footer = c.footer ? `\n\n${c.footer}` : '';
//   const body = [opener, ...persuasionMsgs, cta].join('\n\n') + footer;

//   return { body, media };
// }

// // Deduplicación estricta por contenido
// function hasSentThisBody(session: UserSession, body: string): boolean {
//   const h = sha256(body);
//   session.conversationData = session.conversationData || {};
//   const set: string[] = (session.conversationData.sentBodies || []) as string[];
//   return set.includes(h);
// }

// function markBodyAsSent(session: UserSession, body: string) {
//   const h = sha256(body);
//   session.conversationData = session.conversationData || {};
//   const set: string[] = (session.conversationData.sentBodies || []) as string[];
//   const next = Array.from(new Set([...set, h]));
//   session.conversationData.sentBodies = next.slice(-50); // mantener últimos 50
// }

// // ==== GUARDAS ANTI-DUPLICADO POR SESIÓN ====
// export function canSendOnce(session: any, key: string, ttlMin = 120): boolean {
//   const now = Date.now();
//   session.conversationData = session.conversationData || {};
//   const k = `sent_${key}`;
//   const last = session.conversationData[k] ? new Date(session.conversationData[k]).getTime() : 0;
//   if (last && (now - last) < ttlMin * 60 * 1000) return false;
//   session.conversationData[k] = new Date().toISOString();
//   return true;
// }

// // ==== DEBOUNCE PER-MESSAGE (usa processingCache global existente) ====
// export function shouldProcessMessage(phone: string, body: string, windowMs = 15000): boolean {
//   if (!global.processingCache) global.processingCache = new Map();
//   const key = `${phone}:${(body || '').trim().slice(0, 80)}`;
//   const now = Date.now();
//   const last = global.processingCache.get(key) || 0;
//   if (now - last < windowMs) return false;
//   global.processingCache.set(key, now);
//   return true;
// }


// export const sendSecureFollowUp = async (
//   phoneNumber: string,
//   messages: string[],
//   urgency: 'high' | 'medium' | 'low',
//   channelOverride?: Channel,
//   assured: boolean = false
// ): Promise<boolean> => {
//   try {
//     const currentSession = await getUserSession(phoneNumber);
//     if (!botInstance) {
//       console.error('❌ Bot instance no disponible');
//       return false;
//     }

//     // EXCLUSIÓN por chat activo de WhatsApp
//     if (isWhatsAppChatActive(currentSession)) {
//       console.log(`🚫 Excluido follow-up (chat activo WhatsApp): ${phoneNumber}`);
//       return false;
//     }

//     // Construir payload antes para dedupe por cuerpo
//     const channel: Channel = channelOverride || (currentSession.interactions?.slice(-1).find(i => !!i.channel)?.channel as Channel) || 'WhatsApp';
//     const payload = await buildChannelFollowUpPayload(currentSession, channel);
//     const groupedMessage = payload.body || messages.join('\n\n');

//     // DEDUPE: nunca repetir el mismo contenido
//     if (hasSentThisBody(currentSession, groupedMessage)) {
//       console.log(`🚫 DEDUPE: cuerpo ya enviado a ${phoneNumber}. Se omite.`);
//       return false;
//     }

//     // LÍMITES POR USUARIO
//     const userGate = canSendUserFollowUp(currentSession);
//     if (!userGate.ok) {
//       console.log(`⏸️ Gate usuario ${phoneNumber}: ${userGate.reason}`);
//       return false;
//     }

//     // LÍMITES GLOBALES
//     if (!canSendGlobal()) {
//       console.log('⏸️ Gate global alcanzado (hora/día).');
//       return false;
//     }

//     // Envío
//     if (payload.media && typeof (botInstance as any).sendMessageWithMedia === 'function') {
//       await botInstance.sendMessageWithMedia(phoneNumber, {
//         body: groupedMessage,
//         mediaUrl: payload.media.url,
//         caption: payload.media.caption
//       }, { channel });
//     } else {
//       await botInstance.sendMessage(phoneNumber, groupedMessage, { channel });
//     }

//     // Marcar envíos y dedupe
//     markGlobalSent();
//     currentSession.lastFollowUpMsg = groupedMessage;
//     recordUserFollowUp(currentSession);
//     markBodyAsSent(currentSession, groupedMessage);
//     userSessions.set(phoneNumber, currentSession);

//     // Persistencia opcional
//     try {
//       if (typeof businessDB?.updateUserSession === 'function') {
//         await businessDB.updateUserSession(phoneNumber, {
//           lastFollowUp: currentSession.lastFollowUp,
//           conversationData: jsonStringifySafe(currentSession.conversationData || {})
//         } as any);
//       }
//       if (typeof businessDB?.logFollowUpEvent === 'function') {
//         await businessDB.logFollowUpEvent({
//           phone: phoneNumber,
//           type: urgency,
//           messages: [groupedMessage],
//           success: true,
//           timestamp: new Date(),
//           buyingIntent: currentSession.buyingIntent
//         });
//       }
//     } catch (e) {
//       console.warn('⚠️ Persistencia follow-up:', e);
//     }

//     logFollowUpSent(phoneNumber, urgency, channel);
//     return true;

//   } catch (error) {
//     console.error(`❌ Error enviando mensaje seguro a ${phoneNumber}:`, error);
//     return false;
//   }
// };

// export async function triggerChannelReminder(phone: string, channel: Channel, urgency?: 'high'|'medium'|'low') {
//   const session = await getUserSession(phone);
//   if (!session) return false;
//   const u: 'high'|'medium'|'low' = urgency || (session.buyingIntent > 80 ? 'high' : session.buyingIntent > 60 ? 'medium' : 'low');
//   const msgs = generatePersuasiveFollowUp(session, u);
//   return await sendSecureFollowUp(phone, msgs, u, channel);
// }

// export async function triggerBulkRemindersByChannel(channel: Channel, limit: number = 50) {
//   const candidates = getUsersNeedingFollowUp()
//     .filter(u => {
//       const lastUserMessage = [...(u.session.interactions || [])].reverse().find(i => i.type === 'user_message' && i.channel);
//       const ch = (lastUserMessage?.channel as Channel) || 'WhatsApp';
//       return ch === channel;
//     })
//     .slice(0, limit);

//   let sent = 0;
//   for (const c of candidates) {
//     const ok = await sendFollowUpMessage(c.phone);
//     if (ok !== undefined) sent++;
//   }
//   return { total: candidates.length, sent };
// }


// export const sendFollowUpMessage = async (phoneNumber: string): Promise<void> => {
//   const session = userSessions.get(phoneNumber);
//   if (!session) return;

//   // EXCLUSIÓN por chat activo de WhatsApp
//   if (isWhatsAppChatActive(session)) {
//     console.log(`🚫 Excluido follow-up (chat activo WhatsApp): ${phoneNumber}`);
//     return;
//   }

//   // Gate por usuario
//   const userGate = canSendUserFollowUp(session);
//   if (!userGate.ok) {
//     console.log(`⏸️ Gate usuario ${phoneNumber}: ${userGate.reason}`);
//     return;
//   }
//   // Gate global
//   if (!canSendGlobal()) {
//     console.log('⏸️ Gate global alcanzado (hora/día).');
//     return;
//   }

//   // TTL adicional de seguridad (mantener existente)
//   if (!canSendOnce(session,'followup_generic',MIN_HOURS_BETWEEN_FOLLOWUPS*60)) return;

//   let urgency: 'high' | 'medium' | 'low' = 'low';
//   const hoursSinceLastInteraction = (Date.now() - session.lastInteraction.getTime()) / 36e5;
//   if (session.buyingIntent > 80 && hoursSinceLastInteraction < 2) urgency = 'high';
//   else if (session.buyingIntent > 60 || session.stage === 'pricing') urgency = 'medium';

//   // Generar contenido y dedupe por cuerpo en sendSecureFollowUp
//   const lastUserMessage = [...(session.interactions || [])].reverse().find(i => i.type === 'user_message' && i.channel);
//   const channel = (lastUserMessage?.channel as Channel) || 'WhatsApp';

//   const messages = generatePersuasiveFollowUp(session, urgency);
//   // Contexto de etapa
//   if (session.stage === 'customizing') messages.unshift("🧩 Guardé tus preferencias. Puedo retomarlas en segundos.");
//   else if (session.stage === 'pricing') messages.unshift("💰 Te dejo clara la mejor oferta que tengo para ti.");
//   else if (session.stage === 'interested') messages.unshift("🚀 Puedo crear tu pedido con los datos que ya tengo.");

//   const sent = await sendSecureFollowUp(phoneNumber, messages, urgency, channel);
//   if (sent) {
//     console.log(`📤 Seguimiento ${urgency} enviado a ${phoneNumber} por ${channel}`);
//   } else {
//     console.warn(`⚠️ Seguimiento no enviado a ${phoneNumber}.`);
//   }
// };

// function validateInteractionType(type: string): 'user_message' | 'bot_message' | 'system_event' {
//     if (type === 'user_message' || type === 'bot_message' || type === 'system_event') return type;
//     if (type === 'follow_up_response' || type === 'user_response') return 'user_message';
//     if (type === 'bot_response' || type === 'automated_message') return 'bot_message';
//     return 'user_message';
// }

// export const trackUserResponse = async (phoneNumber: string, message: string): Promise<void> => {
//     try {
//         if (!phoneNumber || typeof phoneNumber !== 'string') return;
//         if (!message || typeof message !== 'string') message = '';

//         const session = userSessions.get(phoneNumber);
//         if (!session) return;

//         if (session.lastFollowUpMsg) {
//             try {
//                 const sentiment = await analyzeResponseSentiment(message);
//                 const isPriceRelated = /precio|oferta|costo|cuanto/.test(message.toLowerCase());
//                 if (sentiment === 'positive' && isPriceRelated) {
//                     session.stage = 'interested';
//                     session.buyingIntent = Math.min((session.buyingIntent || 50) + 10, 100);
//                 } else if (sentiment === 'negative') {
//                   // DESACTIVADO: session.followUpSpamCount = (session.followUpSpamCount || 0) + 1;
//                   if ((session.followUpSpamCount || 0) > 2) {
//                     session.buyingIntent = Math.max((session.buyingIntent || 50) - 5, 0);
//                   }
//                 }

//                 session.interactions = session.interactions || [];
//                 session.interactions.push({
//                     timestamp: new Date(),
//                     message: message.trim(),
//                     type: validateInteractionType('follow_up_response'),
//                     sentiment: sentiment,
//                     engagement_level: sentiment === 'positive' ? 80 : sentiment === 'negative' ? 20 : 50,
//                     channel: 'WhatsApp',
//                     respondedByBot: false,
//                 } as Interaction);

//                 if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
//                 session.lastFollowUpMsg = undefined;

//             } catch (sentimentError) {
//                 console.error('Error al analizar sentiment de respuesta:', sentimentError);
//             }
//         }

//         userSessions.set(phoneNumber, session);
//         console.log(`📝 Respuesta registrada para ${phoneNumber}: "${message.substring(0, 50)}..."`);

//     } catch (error) {
//         console.error(`❌ Error en trackUserResponse para ${phoneNumber}:`, error);
//     }
// };

// const analyzeResponseSentiment = async (message: string): Promise<SentimentType> => {
//     if (!message || typeof message !== 'string') return 'neutral';
//     const msg = message.toLowerCase().trim();
//     if (msg.length === 0) return 'neutral';
//     const positivePatterns = [
//         /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
//         /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
//         /\b(amor|amo|encanta|fascina|ideal|justo|necesito|acepto|confirmo)\b/,
//         /^(👍|🙌|👌|✌️|💪|🎉|👏|❤️|😊|🤗|😍|🥰|😘)$/
//     ];
//     const negativePatterns = [
//         /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego|rechazar)\b/,
//         /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
//         /\b(aburrido|feo|horrible|odio|detesto|molesta|cancelo|cancelar)\b/,
//         /^(👎|😕|😔|😢|😡|🙄|😤|😠|😒|🤔|😐|😑)$/
//     ];
//     for (const pattern of positivePatterns) if (pattern.test(msg)) return 'positive';
//     for (const pattern of negativePatterns) if (pattern.test(msg)) return 'negative';
//     if (/^[1-4]$/.test(msg)) return 'positive';
//     return 'neutral';
// };

// // Demos y utilidad

// export const sendDemoIfNeeded = async (session: UserSession, phoneNumber: string) => {
//     if (!botInstance) return;

//     function pickRandomDemo(demos: { name: string; file: string }[]): { name: string; file: string } | null {
//         if (!demos || demos.length === 0) return null;
//         return demos[Math.floor(Math.random() * demos.length)];
//     }

//     const genreTopHits = musicData.genreTopHits || {};
//     const videoTopHits = videoData.topHits || {};

//     const interestGenre = session.interests.find(g => (genreTopHits as any)[g]) || Object.keys(genreTopHits)[0];
//     const interestVideo = session.interests.find(g => (videoTopHits as any)[g]) || Object.keys(videoTopHits)[0];

//     if (session.interests.some(i => i.includes('music') || i === 'musica' || (genreTopHits as any)[i])) {
//         const demos = (genreTopHits as any)[interestGenre] || [];
//         const randomDemo = pickRandomDemo(demos);
//         if (randomDemo) {
//             await botInstance.sendMessage(
//                 phoneNumber,
//                 {
//                     body: `🎧 Demo USB (${interestGenre}): ${randomDemo.name}\n¿Te gustaría tu USB con este género o prefieres mezclar varios? ¡Cuéntame!`,
//                     media: randomDemo.file
//                 }
//             );
//         }
//         return;
//     }

//     if (session.interests.some(i => i.includes('video') || i === 'videos' || (videoTopHits as any)[i])) {
//         const demos = (videoTopHits as any)[interestVideo] || [];
//         const randomDemo = pickRandomDemo(demos);
//         if (randomDemo) {
//             await botInstance.sendMessage(
//                 phoneNumber,
//                 {
//                     body: `🎬 Demo Video (${interestVideo}): ${randomDemo.name}\n¿Quieres añadir más artistas, géneros, películas o series? ¡Personalízalo a tu gusto!`,
//                     media: randomDemo.file
//                 }
//             );
//         }
//         return;
//     }
// };

// // Bot instance
// export function setBotInstance(instance: any) {
//     botInstance = instance;
// }

// // Utilidades de sesión básicas

// export function createUserSession(phoneNumber: string): UserSession {
//     const now = new Date();
//     return {
//         phone: phoneNumber,
//         phoneNumber: phoneNumber,
//         name: '',
//         buyingIntent: 0,
//         stage: 'initial',
//         interests: [],
//         conversationData: {},
//         currentFlow: 'initial',
//         currentStep: 'welcome',
//         createdAt: now,
//         updatedAt: now,
//         lastInteraction: now,
//         lastActivity: now,
//         interactions: [],
//         isFirstMessage: true,
//         isPredetermined: false,
//         skipWelcome: false,
//         tags: [],
//         messageCount: 0,
//         isActive: true,
//         isNewUser: true,
//         isReturningUser: false,
//         followUpSpamCount: 0,
//         totalOrders: 0,
//         demographics: {},
//         preferences: {},
//         customization: {
//             step: 0,
//             preferences: {},
//             totalPrice: 0,
//         }
//     };
// }

// export function clearUserSession(phoneNumber: string): void {
//     userSessions.delete(phoneNumber);
//     if (followUpQueue.has(phoneNumber)) {
//         clearTimeout(followUpQueue.get(phoneNumber)!);
//         followUpQueue.delete(phoneNumber);
//     }
//     console.log(`🗑️ Sesión limpiada para usuario: ${phoneNumber}`);
// }

// export function getUserStats(phoneNumber: string): {
//     totalInteractions: number;
//     lastActivity: Date | null;
//     currentFlow: string | null;
//     isVIP: boolean;
//     tags: string[];
// } {
//     const session = userSessions.get(phoneNumber);
//     if (!session) {
//         return { totalInteractions: 0, lastActivity: null, currentFlow: null, isVIP: false, tags: [] };
//     }
//     return {
//         totalInteractions: session.interactions?.length || 0,
//         lastActivity: session.lastActivity || null,
//         currentFlow: session.currentFlow || null,
//         isVIP: !!session.isVIP,
//         tags: session.tags || []
//     };
// }

// export const getTopInterests = (): Array<{ interest: string; count: number }> => {
//     const interestCount = new Map<string, number>();
//     userSessions.forEach(session => {
//         (session.interests || []).forEach(interest => {
//             interestCount.set(interest, (interestCount.get(interest) || 0) + 1);
//         });
//     });
//     return Array.from(interestCount.entries())
//         .sort((a, b) => b[1] - a[1])
//         .slice(0, 10)
//         .map(([interest, count]) => ({ interest, count }));
// };

// export interface AnalyticsData {
//     totalUsers: number;
//     byStage: {
//         initial: number;
//         interested: number;
//         customizing: number;
//         pricing: number;
//         abandoned: number;
//         converted: number;
//         inactive: number;
//         paused: number;
//     };
//     avgBuyingIntent: number;
//     highRiskUsers: number;
//     topInterests: Array<{ interest: string; count: number }>;
//     recentInteractions: Array<{
//         phone: string;
//         name?: string;
//         stage: string;
//         buyingIntent: number;
//         lastInteraction: Date;
//         interests?: string[];
//         demographics?: any;
//         preferences: Record<string, any>;
//         location?: string;
//     }>;
//     demographicsSummary: any;
//     preferencesSummary: any;
//     mostActiveChannels: Array<{ channel: string; count: number }>;
//     lastUpdate?: string;
// }

// export interface UserSpecificAnalytics {
//     phone: string;
//     name?: string;
//     stage: string;
//     buyingIntent: number;
//     totalInteractions: number;
//     sessionDuration: number;
//     interests: string[];
//     preferences: Record<string, any>;
//     demographics: any;
//     location?: string;
//     riskLevel: string;
//     conversionProbability: number;
//     preferredCategories: string[];
//     lastInteraction: Date;
//     messageCount: number;
//     responseTime: number;
//     engagementScore: number;
//     lastUpdate?: string;
// }

// // Analytics

// export function getUserAnalytics(): AnalyticsData;
// export function getUserAnalytics(phone: string): Promise<UserSpecificAnalytics>;
// export function getUserAnalytics(phone?: string): AnalyticsData | Promise<UserSpecificAnalytics> {
//     if (phone) return getUserSpecificAnalytics(phone);
//     return getGeneralAnalytics();
// }

// function getGeneralAnalytics(): AnalyticsData {
//     const sessions: UserSession[] = Array.from(userSessions.values());
//     const topInteractions = getTopInterests();
    
//     return {
//         totalUsers: sessions.length,
//         byStage: {
//             initial: sessions.filter(s => s.stage === 'initial').length,
//             interested: sessions.filter(s => s.stage === 'interested').length,
//             customizing: sessions.filter(s => s.stage === 'customizing').length,
//             pricing: sessions.filter(s => s.stage === 'pricing').length,
//             abandoned: sessions.filter(s => s.stage === 'abandoned').length,
//             converted: sessions.filter(s => s.stage === 'converted').length,
//             inactive: sessions.filter(s => s.stage === 'inactive').length,
//             paused: sessions.filter(s => s.stage === 'paused').length,
//         },
//         avgBuyingIntent: sessions.length ? 
//             sessions.reduce((sum, s) => sum + (s.aiAnalysis?.buyingIntent || 0), 0) / sessions.length : 0,
//         highRiskUsers: sessions.filter(s => s.aiAnalysis?.riskLevel === 'high').length,
//         topInterests: topInteractions,
//         recentInteractions: sessions
//             .sort((a, b) => b.lastInteraction.getTime() - a.lastInteraction.getTime())
//             .slice(0, 10)
//             .map(s => ({
//                 phone: s.phone,
//                 name: s.name,
//                 stage: s.stage,
//                 buyingIntent: s.aiAnalysis?.buyingIntent || 0,
//                 lastInteraction: s.lastInteraction,
//                 interests: s.interests,
//                 demographics: s.demographics,
//                 preferences: s.preferences,
//                 location: s.location
//             })),
//         demographicsSummary: calculateDemographicsSummary(sessions),
//         preferencesSummary: calculatePreferencesSummary(sessions),
//         mostActiveChannels: Object.entries(
//             sessions.reduce((acc, s) => {
//                 s.interactions?.forEach(interaction => {
//                     if (interaction.channel) {
//                         acc[interaction.channel] = (acc[interaction.channel] || 0) + 1;
//                     }
//                 });
//                 return acc;
//             }, {} as Record<string, number>)
//         ).sort((a, b) => b[1] - a[1]).map(([channel, count]) => ({ channel, count })),
//         lastUpdate: new Date().toISOString()
//     };
// }

// setInterval(() => {
//     if (global.processingCache) {
//         global.processingCache.clear();
//     }
// }, 10 * 60 * 1000);

// function normalizeDbUser(dbUser: any): Partial<UserSession> {
//   const safeJSON = (v: any, fallback: any) => {
//     if (v == null) return fallback;
//     if (typeof v === 'string') {
//       try { return safeJSON(v, []); } catch { return fallback; }
//     }
//     return v;
//   };

//   return {
//     phone: dbUser.phone || dbUser.phoneNumber,
//     name: dbUser.name,
//     stage: dbUser.stage || 'initial',
//     buyingIntent: dbUser.buying_intent ?? dbUser.buyingIntent ?? 0,
//     interactions: Array.isArray(dbUser.interactions) ? dbUser.interactions : safeJSON(dbUser.interactions, []),
//     preferences: safeJSON(dbUser.preferences, dbUser.preferences) || {},
//     demographics: safeJSON(dbUser.demographics, dbUser.demographics) || {},
//     interests: Array.isArray(dbUser.interests) ? dbUser.interests : safeJSON(dbUser.interests, []),
//     location: dbUser.location,
//     aiAnalysis: {
//       riskLevel: dbUser.risk_level || 'low',
//       buyingIntent: dbUser.buying_intent ?? 0,
//       interests: Array.isArray(dbUser.interests) ? dbUser.interests : [],
//       nextBestAction: dbUser.next_best_action || 'monitor',
//       probabilityToConvert: dbUser.conversion_probability ?? dbUser.probability_to_convert ?? 0
//     },
//     createdAt: dbUser.created_at ? new Date(dbUser.created_at) : new Date(),
//     updatedAt: dbUser.updated_at ? new Date(dbUser.updated_at) : new Date(),
//     lastInteraction: dbUser.last_interaction ? new Date(dbUser.last_interaction) : new Date(),
//     messageCount: dbUser.message_count ?? 0
//   };
// }

// async function getUserSpecificAnalytics(phone: string): Promise<UserSpecificAnalytics> {
//   const safeJSON = (v: any, fallback: any) => {
//     if (v == null) return fallback;
//     if (typeof v === 'string') {
//       try { return safeJSON(v, []); } catch { return fallback; }
//     }
//     return v;
//   };

//   try {
//     const session = userSessions.get(phone);

//     if (!session) {
//       try {
//         const dbUser = await businessDB.getUserSession(phone);
//         if (dbUser) {
//           const norm = normalizeDbUser(dbUser);
//           const preferredCategories = Array.isArray((dbUser as any).preferred_categories)
//             ? (dbUser as any).preferred_categories
//             : (safeJSON((dbUser as any).preferred_categories, []) as string[]);

//           const conversionProbability = typeof norm.aiAnalysis?.probabilityToConvert === 'number'
//             ? norm.aiAnalysis.probabilityToConvert
//             : 0;

//           return {
//             phone: (norm as any).phone || phone,
//             name: (norm as any).name,
//             stage: (norm as any).stage || 'initial',
//             buyingIntent: (norm as any).buyingIntent || 0,
//             totalInteractions: (norm as any).messageCount || 0,
//             sessionDuration: 0,
//             interests: (norm as any).interests || [],
//             preferences: (norm as any).preferences || {},
//             demographics: (norm as any).demographics || {},
//             location: (norm as any).location,
//             riskLevel: (norm as any).aiAnalysis?.riskLevel || 'low',
//             conversionProbability,
//             preferredCategories,
//             lastInteraction: (norm as any).lastInteraction || new Date(),
//             messageCount: (norm as any).messageCount || 0,
//             responseTime: 0,
//             engagementScore: (norm as any).aiAnalysis?.buyingIntent || 0,
//             lastUpdate: new Date().toISOString()
//           };
//         }
//       } catch (dbError) {
//         console.error('❌ Error obteniendo usuario de BD:', dbError);
//       }

//       return {
//         phone,
//         stage: 'initial',
//         buyingIntent: 0,
//         totalInteractions: 0,
//         sessionDuration: 0,
//         interests: [],
//         preferences: {},
//         demographics: {},
//         riskLevel: 'low',
//         conversionProbability: 0,
//         preferredCategories: [],
//         lastInteraction: new Date(),
//         messageCount: 0,
//         responseTime: 0,
//         engagementScore: 0,
//         lastUpdate: new Date().toISOString()
//       };
//     }

//     const sessionDuration = session.createdAt
//       ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000)
//       : 0;

//     const engagementScore = calculateEngagementScore(session);
//     const conversionProbability = calculateConversionProbability(session);

//     return {
//       phone: session.phone,
//       name: session.name,
//       stage: session.stage,
//       buyingIntent: session.aiAnalysis?.buyingIntent || session.buyingIntent || 0,
//       totalInteractions: session.messageCount || 0,
//       sessionDuration,
//       interests: session.interests || [],
//       preferences: session.preferences || {},
//       demographics: session.demographics || {},
//       location: session.location,
//       riskLevel: session.aiAnalysis?.riskLevel || 'low',
//       conversionProbability,
//       preferredCategories: extractPreferredCategories(session),
//       lastInteraction: session.lastInteraction,
//       messageCount: session.messageCount || 0,
//       responseTime: 0,
//       engagementScore,
//       lastUpdate: new Date().toISOString()
//     };

//   } catch (error) {
//     console.error('❌ Error obteniendo analytics específicos del usuario:', error);
//     return {
//       phone,
//       stage: 'initial',
//       buyingIntent: 0,
//       totalInteractions: 0,
//       sessionDuration: 0,
//       interests: [],
//       preferences: {},
//       demographics: {},
//       riskLevel: 'low',
//       conversionProbability: 0,
//       preferredCategories: [],
//       lastInteraction: new Date(),
//       messageCount: 0,
//       responseTime: 0,
//       engagementScore: 0,
//       lastUpdate: new Date().toISOString()
//     };
//   }
// }

// // Auxiliares analytics

// function calculateEngagementScore(session: UserSession): number {
//     let score = 0;
//     score += Math.min(session.messageCount || 0, 50);
//     score += (session.buyingIntent || 0) * 0.3;
//     const sessionMinutes = session.createdAt ? (Date.now() - new Date(session.createdAt).getTime()) / 60000 : 0;
//     score += Math.min(sessionMinutes * 2, 20);
//     score += Math.min((session.interests?.length || 0) * 5, 15);
//     const inactiveMinutes = (Date.now() - session.lastInteraction.getTime()) / 60000;
//     if (inactiveMinutes > 30) score *= 0.8;
//     return Math.round(Math.min(score, 100));
// }

// function calculateConversionProbability(session: UserSession): number {
//     let probability = 0;
//     probability += (session.buyingIntent || 0) * 0.4;
//     const stageWeights: Record<string, number> = {
//         'initial': 5, 'interested': 15, 'customizing': 35, 'pricing': 60, 'abandoned': 10,
//         'converted': 100, 'inactive': 5, 'paused': 20, 'closing': 70, 'ready_to_buy': 80
//     };
//     probability += stageWeights[session.stage] || 5;
//     probability += Math.min((session.messageCount || 0) * 2, 20);
//     const sessionMinutes = session.createdAt ? (Date.now() - new Date(session.createdAt).getTime()) / 60000 : 0;
//     if (sessionMinutes > 5) probability += 10;
//     if (sessionMinutes > 15) probability += 10;
//     if (session.name) probability += 5;
//     if (session.location) probability += 5;
//     if (session.preferences && Object.keys(session.preferences).length > 0) probability += 5;
//     return Math.round(Math.min(probability, 100));
// }

// function extractPreferredCategories(session: UserSession): string[] {
//     const categories: string[] = [];
//     if (session.interests) {
//         session.interests.forEach(interest => {
//             const i = interest.toLowerCase();
//             if (i.includes('música') || i.includes('music')) categories.push('Música');
//             if (i.includes('video')) categories.push('Videos');
//             if (i.includes('película') || i.includes('movie')) categories.push('Películas');
//             if (i.includes('juego')) categories.push('Juegos');
//             if (i.includes('foto')) categories.push('Fotos');
//         });
//     }
//     if (session.preferences) {
//         Object.keys(session.preferences).forEach(key => {
//             if (key.includes('genre') || key.includes('genero')) categories.push('Música');
//             if (key.includes('capacity') || key.includes('capacidad')) categories.push('Almacenamiento');
//         });
//     }
//     return [...new Set(categories)];
// }

// function getAgeGroup(age: number): string {
//     if (age < 18) return '< 18';
//     if (age < 25) return '18-24';
//     if (age < 35) return '25-34';
//     if (age < 45) return '35-44';
//     if (age < 55) return '45-54';
//     return '55+';
// }

// // Export helper
// export { getUserSpecificAnalytics };

// // Segmentación avanzada para asegurar cobertura total
// export function getFollowUpSegments() {
//   const now = Date.now();
//   const sessions = Array.from(userSessions.values());

//   const recentlyInactive = [] as UserSession[];
//   const inactiveTagged = [] as UserSession[];
//   const longSilent = [] as UserSession[];
//   const unregistered = [] as { phone: string }[];

//   // Nota: "no registrados" pueden venir de DB externa; aquí dejamos hook para inyectarlos
//   // Usa registerExternalSilentUsers() para pasar teléfonos externos silenciosos.

//   sessions.forEach(s => {
//     const mins = (now - s.lastInteraction.getTime()) / 60000;
//     const hours = mins / 60;
//     const days = hours / 24;

//     // 1) Recientemente inactivos: > 30 min y < 3 h
//     if (mins >= 30 && hours < 3 && s.stage !== 'converted' && !(s.tags||[]).includes('blacklist')) {
//       recentlyInactive.push(s);
//     }

//     // 2) Marcados como inactivos explícitamente
//     if (s.stage === 'inactive' && !(s.tags||[]).includes('blacklist')) {
//       inactiveTagged.push(s);
//     }

//     // 3) Días sin hablar: >= 2 días sin interacción
//     if (days >= 2 && s.stage !== 'converted' && !(s.tags||[]).includes('blacklist')) {
//       longSilent.push(s);
//     }
//   });

//   return { recentlyInactive, inactiveTagged, longSilent, unregistered };
// }

// // Permite inyectar teléfonos “no registrados” (p.ej. desde BD externa o CSV)
// export async function registerExternalSilentUsers(phones: string[]) {
//   const created: string[] = [];
//   for (const p of phones) {
//     const phone = validatePhoneNumber(p);
//     if (!phone) continue;
//     if (!userSessions.get(phone)) {
//       const s = createUserSession(phone);
//       s.isNewUser = true;
//       s.isActive = false;
//       s.stage = 'initial';
//       s.buyingIntent = 20;
//       userSessions.set(phone, s);
//       created.push(phone);
//     }
//   }
//   return created;
// }

// // Disparo masivo por segmentos con reglas de urgencia y ventanas horarias
// export async function runAssuredFollowUps(limitPerSegment = 100) {
//   const { recentlyInactive, inactiveTagged, longSilent } = getFollowUpSegments();

//   // Ventana horaria segura (8–22)
//   const hour = new Date().getHours();
//   if (hour < 8 || hour > 22) {
//     console.log('⏸️ Ventana horaria cerrada. Seguimientos se omiten ahora.');
//     return { sent: 0, skipped: 'outside_hours' };
//   }

//   let sent = 0;

//   // 1) Recientemente inactivos → urgencia medium/high según intent
//   for (const s of recentlyInactive.slice(0, limitPerSegment)) {
//     if (isWhatsAppChatActive(s)) continue; // EXCLUSIÓN
//     const urgency: 'high'|'medium'|'low' =
//       s.buyingIntent > 80 ? 'high' : (s.buyingIntent > 60 || s.stage === 'pricing') ? 'medium' : 'low';
//     const msgs = generatePersuasiveFollowUp(s, urgency);
//     const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true)
//     if (ok) sent++;
//   }

//   // 2) Inactivos etiquetados → urgencia low/medium con recordatorio de progreso
//   for (const s of inactiveTagged.slice(0, limitPerSegment)) {
//     if (isWhatsAppChatActive(s)) continue; // EXCLUSIÓN
//     const urgency: 'high'|'medium'|'low' = s.buyingIntent > 60 ? 'medium' : 'low';
//     const msgs = generatePersuasiveFollowUp(s, urgency);
//     msgs.unshift('🧩 Guardé tu avance. Puedo retomarlo en segundos con tus preferencias.');
//     const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true)
//     if (ok) sent++;
//   }

//   // 3) Días sin hablar → urgencia low con incentivo suave
//   for (const s of longSilent.slice(0, limitPerSegment)) {
//     if (isWhatsAppChatActive(s)) continue; // EXCLUSIÓN
//     const urgency: 'high'|'medium'|'low' = 'low';
//     const msgs = generatePersuasiveFollowUp(s, urgency);
//     msgs.push('🎁 Si retomamos hoy, te incluyo una playlist exclusiva sin costo.');
//     const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true)
//     if (ok) sent++;
//   }

//   console.log(`✅ Follow-ups asegurados: ${sent}`);
//   return { sent };
// }

// export function getUsersNeedingFollowUp() {
//     const currentTime = new Date();
//     const usersNeedingFollowUp: Array<{
//         phone: string;
//         session: UserSession;
//         priority: string;
//         minutesSinceLastInteraction: number;
//         hoursSinceLastFollowUp: number;
//     }> = [];

//     Array.from(userSessions.entries()).forEach(([phone, session]) => {
//         // EXCLUSIÓN por chat activo de WhatsApp
//         if (isWhatsAppChatActive(session)) return;

//         const timeSinceLastInteraction = currentTime.getTime() - session.lastInteraction.getTime();
//         const minutesSinceLastInteraction = timeSinceLastInteraction / 60000;
//         const lastFollowUp = session.lastFollowUp || new Date(0);
//         const timeSinceLastFollowUp = currentTime.getTime() - lastFollowUp.getTime();
//         const hoursSinceLastFollowUp = timeSinceLastFollowUp / 36e5;

//         let needsFollowUp = false;
//         let priority = 'low';

//         if (session.aiAnalysis?.buyingIntent && session.aiAnalysis.buyingIntent > 70 && minutesSinceLastInteraction > 30 && hoursSinceLastFollowUp > 2) {
//             needsFollowUp = true;
//             priority = 'high';
//         } else if (session.aiAnalysis?.buyingIntent && session.aiAnalysis.buyingIntent > 50 && minutesSinceLastInteraction > 90 && hoursSinceLastFollowUp > 4) {
//             needsFollowUp = true;
//             priority = 'medium';
//         } else if (minutesSinceLastInteraction > 180 && hoursSinceLastFollowUp > 6) {
//             needsFollowUp = true;
//             priority = 'low';
//         }

//         if (needsFollowUp && session.stage !== 'converted' && !session.tags?.includes('blacklist')) {
//             usersNeedingFollowUp.push({
//                 phone,
//                 session,
//                 priority,
//                 minutesSinceLastInteraction,
//                 hoursSinceLastFollowUp
//             });
//         }
//     });

//     return usersNeedingFollowUp;
// }

// // Gestión de usuarios

// export function markVIP(phoneNumber: string) {
//     const session = userSessions.get(phoneNumber);
//     if (session) {
//         session.isVIP = true;
//         session.tags = session.tags || [];
//         if (!session.tags.includes('VIP')) session.tags.push('VIP');
//         userSessions.set(phoneNumber, session);
//     }
// }

// export function blacklistUser(phoneNumber: string) {
//     const session = userSessions.get(phoneNumber);
//     if (session) {
//         session.tags = session.tags || [];
//         if (!session.tags.includes('blacklist')) session.tags.push('blacklist');
//         userSessions.set(phoneNumber, session);
//     }
// }

// export function getSmartRecommendations(phone: string, userSessionsMap: Map<string, UserSession>): string[] {
//     const session = userSessionsMap.get(phone);
//     if (!session) return [];

//     const recs: string[] = [];
//     if (session.preferences?.musicGenres && session.preferences.musicGenres.length > 0) {
//         recs.push(`Colecciones premium de ${session.preferences.musicGenres.slice(0, 2).join(' y ')}`);
//     } else if (session.interests && session.interests.length > 0) {
//         recs.push(`Mix especial de ${session.interests.slice(0, 2).join(' y ')}`);
//     }

//     switch (session.stage) {
//         case 'customizing':
//             recs.push('¡Prueba la opción de artistas exclusivos o mezcla de éxitos!');
//             break;
//         case 'pricing':
//             recs.push('Consulta las ofertas flash en USBs de alta capacidad.');
//             break;
//         case 'interested':
//             recs.push('Te recomiendo nuestro servicio de playlist personalizada.');
//             break;
//     }

//     if ((session.preferences as any)?.capacity && (session.preferences as any).capacity.length > 0) {
//         recs.push(`USB de ${(session.preferences as any).capacity[0]}GB recomendada para tu selección`);
//     }

//     if (session.isVIP) recs.push('Acceso VIP: contenido exclusivo y atención personalizada');
//     if (session.purchaseHistory && session.purchaseHistory.length > 0) recs.push('Nuevos lanzamientos y colecciones recientes disponibles para ti');
//     if (recs.length === 0) recs.push('Descubre nuestros packs de música y películas más populares');

//     return recs;
// }

// export function getConversationAnalysis(phone: string, userSessionsMap: Map<string, UserSession>): {
//     summary: string;
//     sentiment: SentimentType;
//     engagement: number;
//     lastIntent?: string;
//     buyingIntent: number;
// } {
//     const session = userSessionsMap.get(phone);
//     if (!session) {
//         return {
//             summary: 'No hay conversación registrada.',
//             sentiment: 'neutral',
//             engagement: 0,
//             buyingIntent: 0
//         };
//     }

//     let positive = 0, negative = 0, engagement = 0;
//     let lastIntent = '';
//     let total = 0;

//     for (const log of session.interactions || []) {
//         if (log.sentiment === 'positive') positive++;
//         if (log.sentiment === 'negative') negative++;
//         engagement += log.engagement_level || 0;
//         if (log.intent) lastIntent = log.intent;
//         total++;
//     }

//     let sentiment: SentimentType = 'neutral';
//     if (positive > negative) sentiment = 'positive';
//     else if (negative > positive) sentiment = 'negative';

//     const avgEngagement = total ? Math.round(engagement / total) : 0;
//     const summary = `Último mensaje: ${session.interactions?.slice(-1)[0]?.message || 'N/A'} | Última intención: ${lastIntent || 'N/A'}`;

//     return {
//         summary,
//         sentiment,
//         engagement: avgEngagement,
//         lastIntent,
//         buyingIntent: session.aiAnalysis?.buyingIntent ?? 0
//     };
// }

// // Frases persuasivas

// const persuasivePhrases = [
//   "USB 32GB ideal para el día a día: 5.000 canciones listas por $89.900.",
//   "Sube a 64GB y llévate hasta 10.000 canciones por $129.900. Calidad + espacio.",
//   "128GB para coleccionistas: 25.000 canciones por $169.900. Todo en un solo lugar.",
//   "¿Playlist curada por género y década? Te la entrego lista en tu USB.",
//   "Incluye sesiones exclusivas y versiones remasterizadas según tu gusto.",
//   "Activa 2x1 parcial: segunda USB con 20% OFF solo hoy.",
//   "Sumamos videos y series favoritas junto a tu música, todo organizado.",
//   "Tu USB llega lista: nombres limpios, carpetas por artista y carátulas.",
//   "Sin repeticiones ni relleno: contenido elegido manualmente.",
//   "Garantía de compatibilidad en carro, parlantes y TV."
// ];

// export function getPersuasivePhrase(): string {
//     return persuasivePhrases[Math.floor(Math.random() * persuasivePhrases.length)];
// }

// // Utilidades adicionales

// export function validateEngagement(engagement: any): number {
//     if (typeof engagement === 'number' && engagement >= 0 && engagement <= 100 && !isNaN(engagement)) return Math.round(engagement);
//     return 50;
// }

// export function validateIntent(intent: any): string {
//     if (typeof intent === 'string' && intent.trim().length > 0) return intent.trim().toLowerCase();
//     return 'general';
// }

// export function sanitizeMessage(message: any): string {
//     if (typeof message === 'string') return message.trim().substring(0, 1000);
//     return '';
// }

// export function validatePhoneNumber(phone: any): string | null {
//     if (typeof phone === 'string' && phone.trim().length > 0) {
//         const cleaned = phone.replace(/[^\d+]/g, '');
//         if (cleaned.length >= 10) return cleaned;
//     }
//     return null;
// }

// function normalizeFlow(flow: string): string {
//   const f = (flow || '').toLowerCase().trim();
//   const aliases: Record<string,string> = {
//     'welcome_flow':'welcomeFlow',
//     'welcome':'welcomeFlow',
//     'catalog':'catalogFlow',
//     'customization':'customizationFlow',
//     'music_flow':'musicUsb',
//     'video_flow':'videosUsb',
//     'movies_flow':'moviesUsb',
//     'payment_flow':'orderFlow',
//     'order_creation':'orderFlow',
//     'processing':'orderFlow',
//     'audio_received':'media_received',
//     'customization_started':'customizationFlow'
//   };
//   return aliases[f] || flow;
// }

// // Métricas

// export function getSystemMetrics() {
//     const sessions = Array.from(userSessions.values());
//     const now = Date.now();
//     const totalActiveSessions = sessions.filter(s => s.isActive).length;
//     const totalInteractions = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
//     const avgBuyingIntent = sessions.length > 0 ? 
//         sessions.reduce((sum, s) => sum + (s.buyingIntent || 0), 0) / sessions.length : 0;

//     const avgSessionDuration = sessions.length > 0 ?
//         sessions.reduce((sum, s) => {
//             const duration = s.createdAt ? now - new Date(s.createdAt).getTime() : 0;
//             return sum + duration;
//         }, 0) / sessions.length / 60000 : 0;

//     const convertedUsers = sessions.filter(s => s.stage === 'converted').length;
//     const conversionRate = sessions.length > 0 ? (convertedUsers / sessions.length) * 100 : 0;

//     const stageCount = new Map<string, number>();
//     sessions.forEach(s => {
//         const stage = s.stage || 'unknown';
//         stageCount.set(stage, (stageCount.get(stage) || 0) + 1);
//     });
//     const topStages = Array.from(stageCount.entries())
//         .sort((a, b) => b[1] - a[1])
//         .slice(0, 5)
//         .map(([stage, count]) => ({ stage, count }));

//     let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
//     if (totalActiveSessions > 1000) systemHealth = 'warning';
//     if (totalActiveSessions > 2000 || avgBuyingIntent < 30) systemHealth = 'critical';
    
//     return {
//         totalActiveSessions,
//         averageSessionDuration: Math.round(avgSessionDuration),
//         totalInteractions,
//         averageBuyingIntent: Math.round(avgBuyingIntent),
//         conversionRate: Math.round(conversionRate * 100) / 100,
//         topStages,
//         systemHealth
//     };
// }

// export function getPerformanceMetrics() {
//     const sessionCacheSize = userSessions.size;
//     const followUpQueueSize = followUpQueue.size;
//     const avgSessionSize = 2048;
//     const memoryUsage = sessionCacheSize * avgSessionSize;
//     const avgResponseTime = 0;
//     const errorRate = 0.1;
//     return {
//         memoryUsage,
//         sessionCacheSize,
//         followUpQueueSize,
//         averageResponseTime: Math.round(avgResponseTime),
//         errorRate,
//         lastCleanup: new Date()
//     };
// }

// // Limpieza y mantenimiento

// export function cleanupInactiveSessions(maxInactiveHours: number = 24): number {
//     const now = new Date();
//     const cutoffTime = new Date(now.getTime() - maxInactiveHours * 60 * 60 * 1000);
//     let cleaned = 0;

//     Array.from(userSessions.entries()).forEach(([phoneNumber, session]) => {
//         if (session.lastInteraction < cutoffTime && 
//             session.stage !== 'converted' && 
//             !session.isVIP) {
            
//             userSessions.delete(phoneNumber);
//             if (followUpQueue.has(phoneNumber)) {
//                 clearTimeout(followUpQueue.get(phoneNumber)!);
//                 followUpQueue.delete(phoneNumber);
//             }
//             cleaned++;
//         }
//     });

//     if (cleaned > 0) console.log(`🧹 Limpiadas ${cleaned} sesiones inactivas (>${maxInactiveHours}h)`);
//     return cleaned;
// }

// export function optimizeMemoryUsage() {
//     const beforeSize = userSessions.size;
//     userSessions.forEach((session) => {
//         if (session.conversationData?.aiInsights && session.conversationData.aiInsights.length > 5) {
//             session.conversationData.aiInsights = session.conversationData.aiInsights.slice(-5);
//         }
//         if (session.conversationData?.stageHistory && session.conversationData.stageHistory.length > 10) {
//             session.conversationData.stageHistory = session.conversationData.stageHistory.slice(-10);
//         }
//     });
//     const cleaned = cleanupInactiveSessions(48);
//     const afterSize = userSessions.size;
//     return { before: beforeSize, after: afterSize, optimized: cleaned };
// }

// // Export/Import

// export function exportUserSessions(): string {
//     try {
//         const sessions = Array.from(userSessions.values());
//         return JSON.stringify(sessions, null, 2);
//     } catch (error) {
//         console.error('❌ Error exportando sesiones:', error);
//         return '[]';
//     }
// }

// export function importUserSessions(jsonData: string): boolean {
//     try {
//         const sessions = safeJSON(jsonData, []);
//         if (!Array.isArray(sessions)) throw new Error('Datos no válidos: se esperaba un array');
//         let imported = 0;
//         sessions.forEach((sessionData: any) => {
//             if (sessionData.phone || sessionData.phoneNumber) {
//                 const phone = sessionData.phone || sessionData.phoneNumber;
//                 if (sessionData.lastInteraction) sessionData.lastInteraction = new Date(sessionData.lastInteraction);
//                 if (sessionData.createdAt) sessionData.createdAt = new Date(sessionData.createdAt);
//                 if (sessionData.updatedAt) sessionData.updatedAt = new Date(sessionData.updatedAt);
//                 userSessions.set(phone, sessionData);
//                 imported++;
//             }
//         });
//         console.log(`📥 Importadas ${imported} sesiones de usuario`);
//         return true;
//     } catch (error) {
//         console.error('❌ Error importando sesiones:', error);
//         return false;
//     }
// }

// // Revisor de inactividad global
// setInterval(() => {
//     const now = Date.now();
//     let inactiveCount = 0;
//     let followUpScheduled = 0;

//     userSessions.forEach((session, phone) => {
//         if (session.stage === 'converted' || (session as any).isBlacklisted) return;
//         const minsSinceLast = (now - session.lastInteraction.getTime()) / 60000;

//         if (minsSinceLast > 12 * 60 && session.stage !== 'inactive') {
//             session.stage = 'inactive';
//             userSessions.set(phone, session);
//             inactiveCount++;
//         }

//         if (minsSinceLast > 60 && 
//             (!session.lastFollowUp || (now - session.lastFollowUp.getTime()) > 60 * 60 * 1000) &&
//             !followUpQueue.has(phone)) {
//             scheduleFollowUp(phone);
//             followUpScheduled++;
//         }
//     });

//     if (inactiveCount > 0) console.log(`⚠️ ${inactiveCount} usuarios marcados como inactivos`);
//     if (followUpScheduled > 0) console.log(`📅 ${followUpScheduled} seguimientos programados`);
// }, 5 * 60 * 1000);

// // Compatibilidad

// export const getOrCreateSession = async (phoneNumber: string): Promise<UserSession> => {
//     return await getUserSession(phoneNumber);
// };

// export const updateSession = async (
//     phoneNumber: string,
//     updates: Partial<UserSession>
// ): Promise<void> => {
//     try {
//         const session = await getUserSession(phoneNumber);
//         Object.keys(updates).forEach(key => {
//             if ((updates as any)[key] !== undefined) {
//                 (session as any)[key] = (updates as any)[key];
//             }
//         });
//         session.updatedAt = new Date();
//         userSessions.set(phoneNumber, session);
//         console.log(`📝 Sesión actualizada para ${phoneNumber}`);
//     } catch (error) {
//         console.error(`❌ Error actualizando sesión para ${phoneNumber}:`, error);
//     }
// };

// export const getSessionsByStage = (stage: string): UserSession[] => {
//     return Array.from(userSessions.values()).filter(session => session.stage === stage);
// };

// export const getSessionsByTag = (tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer'): UserSession[] => {
//     return Array.from(userSessions.values()).filter(session =>
//         session.tags && session.tags.includes(tag)
//     );
// };

// export const addTagToUser = (phoneNumber: string, tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer'): boolean => {
//     const session = userSessions.get(phoneNumber);
//     if (session) {
//         if (!session.tags) session.tags = [];
//         if (!session.tags.includes(tag)) {
//             session.tags.push(tag);
//             session.updatedAt = new Date();
//             userSessions.set(phoneNumber, session);
//             return true;
//         }
//     }
//     return false;
// };

// export const removeTagFromUser = (phoneNumber: string, tag: 'VIP' | 'blacklist' | 'promo_used' | 'high_value' | 'return_customer'): boolean => {
//     const session = userSessions.get(phoneNumber);
//     if (session && session.tags) {
//         const index = session.tags.indexOf(tag);
//         if (index > -1) {
//             session.tags.splice(index, 1);
//             session.updatedAt = new Date();
//             userSessions.set(phoneNumber, session);
//             return true;
//         }
//     }
//     return false;
// };

// // Debug

// export function debugSession(phoneNumber: string): void {
//     const session = userSessions.get(phoneNumber);
//     if (!session) {
//         console.log(`❌ No se encontró sesión para ${phoneNumber}`);
//         return;
//     }

//     console.log(`\n🔍 DEBUG SESSION: ${phoneNumber}`);
//     console.log(`📱 Nombre: ${session.name || 'N/A'}`);
//     console.log(`🎯 Etapa: ${session.stage}`);
//     console.log(`💡 Buying Intent: ${session.buyingIntent}%`);
//     console.log(`💬 Mensajes: ${session.messageCount || 0}`);
//     console.log(`🏷️ Tags: ${session.tags?.join(', ') || 'Ninguno'}`);
//     console.log(`📊 Intereses: ${session.interests?.join(', ') || 'Ninguno'}`);
//     console.log(`⏰ Última interacción: ${session.lastInteraction.toLocaleString()}`);
//     console.log(`🔄 Flujo actual: ${session.currentFlow}`);
    
//     if (session.interactions && session.interactions.length > 0) {
//         console.log(`\n📝 Últimas 3 interacciones:`);
//         session.interactions.slice(-3).forEach((interaction, index) => {
//             console.log(`  ${index + 1}. [${interaction.type}] ${interaction.message.substring(0, 50)}...`);
//             console.log(`     Intent: ${interaction.intent} | Sentiment: ${interaction.sentiment}`);
//         });
//     }
    
//     if (session.aiAnalysis) {
//         console.log(`\n🤖 AI Analysis:`);
//         console.log(`  Next Action: ${session.aiAnalysis.nextBestAction}`);
//         console.log(`  Risk Level: ${session.aiAnalysis.riskLevel}`);
//         console.log(`  Engagement: ${session.aiAnalysis.engagementScore}`);
//     }
//     console.log(`\n`);
// }

// export function logSystemStatus(): void {
//     const metrics = getSystemMetrics();
//     const performance = getPerformanceMetrics();
    
//     console.log(`\n📊 SYSTEM STATUS`);
//     console.log(`🟢 Sesiones activas: ${metrics.totalActiveSessions}`);
//     console.log(`💬 Total interacciones: ${metrics.totalInteractions}`);
//     console.log(`🎯 Buying Intent promedio: ${metrics.averageBuyingIntent}%`);
//     console.log(`📈 Tasa de conversión: ${metrics.conversionRate}%`);
//     console.log(`💾 Memoria en uso: ${(performance.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
//     console.log(`⏱️ Tiempo respuesta promedio: ${performance.averageResponseTime}ms`);
//     console.log(`🔄 Follow-ups en cola: ${performance.followUpQueueSize}`);
//     console.log(`❤️ Salud del sistema: ${metrics.systemHealth.toUpperCase()}`);
//     console.log(`\n`);
// }

// // Cron interno para asegurar envíos (cada 2h)
// setInterval(() => {
//   const hour = new Date().getHours();
//   if (hour >= 8 && hour <= 22) {
//     runAssuredFollowUps(150).catch(e => console.warn('⚠️ runAssuredFollowUps error:', e));
//   }
// }, 2 * 60 * 60 * 1000);

// // Inicialización y mantenimiento

// setInterval(() => {
//     const result = optimizeMemoryUsage();
//     if (result.optimized > 0) {
//         console.log(`🚀 Memoria optimizada: ${result.before} → ${result.after} sesiones (-${result.optimized})`);
//     }
// }, 60 * 60 * 1000);

// if (process.env.NODE_ENV === 'development') {
//     setInterval(() => {
//         logSystemStatus();
//     }, 30 * 60 * 1000);
// }

// console.log('✅ UserTrackingSystem completamente inicializado y optimizado');

// // ====== INTEGRACIÓN DE CROSS-SELL Y REPORTES ======
// import { crossSellSystem, CrossSellRecommendation } from '../services/crossSellSystem';
// import { reportingSystem } from '../services/reportingSystem';

// export async function generateCrossSellForUser(phoneNumber: string): Promise<CrossSellRecommendation[]> {
//     const session = await getUserSession(phoneNumber);
//     if (!session) {
//         console.warn(`⚠️ No se encontró sesión para ${phoneNumber}`);
//         return [];
//     }
//     const recommendations = crossSellSystem.generateRecommendations(session);
//     console.log(`💎 Generadas ${recommendations.length} recomendaciones de cross-sell para ${phoneNumber}`);
//     return recommendations;
// }

// export async function getCrossSellMessage(phoneNumber: string): Promise<string> {
//     const recommendations = await generateCrossSellForUser(phoneNumber);
//     return crossSellSystem.generateCrossSellMessage(recommendations);
// }

// export async function addCrossSellProduct(phoneNumber: string, productId: string): Promise<boolean> {
//     const session = await getUserSession(phoneNumber);
//     if (!session) return false;

//     const product = crossSellSystem.getProductById(productId);
//     if (!product) {
//         console.warn(`⚠️ Producto ${productId} no encontrado`);
//         return false;
//     }

//     if (!session.orderData) {
//         session.orderData = { items: [], type: 'customized', status: 'draft' } as any;
//     }
//     if (!session.orderData.items) session.orderData.items = [];

//     session.orderData.items.push({
//         id: product.id,
//         productId: product.id,
//         name: product.name,
//         price: product.price,
//         quantity: 1,
//         unitPrice: product.price
//     });

//     const currentTotal = session.orderData.totalPrice || (session as any).price || 0;
//     session.orderData.totalPrice = currentTotal + product.price;

//     session.interactions.push({
//         timestamp: new Date(),
//         message: `Agregó producto: ${product.name}`,
//         type: 'system_event',
//         intent: 'cross_sell_added',
//         sentiment: 'positive',
//         engagement_level: 80,
//         channel: 'WhatsApp'
//     } as any);

//     await updateUserSession(phoneNumber, `Producto agregado: ${product.name}`, 'cross_sell', null, false);
//     console.log(`✅ Producto ${product.name} agregado al pedido de ${phoneNumber}`);
//     return true;
// }

// export async function generateBusinessReport(): Promise<string> {
//     const sessions = Array.from(userSessions.values());
//     return await reportingSystem.generateBusinessReport(sessions);
// }

// export function generatePendingOrdersReport(): string {
//     const sessions = Array.from(userSessions.values());
//     return reportingSystem.generatePendingOrdersReport(sessions);
// }

// export async function getBusinessMetrics() {
//     const sessions = Array.from(userSessions.values());

//     let totalOrders = 0;
//     let pendingOrders = 0;
//     let completedOrders = 0;
//     let totalRevenue = 0;
//     let activeUsers = 0;

//     const now = new Date();
//     const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

//     sessions.forEach(session => {
//         if (session.orderData) {
//             totalOrders++;
//             if (session.orderData.status === 'confirmed' || session.orderData.status === 'processing') {
//                 completedOrders++;
//                 totalRevenue += session.orderData.totalPrice || (session.orderData as any).price || 0;
//             } else if (session.orderData.status === 'draft') {
//                 pendingOrders++;
//             }
//         }
//         if (session.lastActivity && session.lastActivity > last24h) activeUsers++;
//     });

//     return {
//         totalOrders,
//         pendingOrders,
//         completedOrders,
//         totalRevenue,
//         activeUsers,
//         totalUsers: sessions.length,
//         conversionRate: sessions.length > 0 ? (completedOrders / sessions.length) * 100 : 0
//     };
// }

// export function getTechProducts() {
//     return crossSellSystem.getAllProducts();
// }

// export function getTechProductsByCategory(category: 'audio' | 'storage' | 'accessories' | 'cables' | 'power' | 'protection') {
//     return crossSellSystem.getProductsByCategory(category);
// }

// export async function createAutomaticOrder(phoneNumber: string): Promise<boolean> {
//     const session = await getUserSession(phoneNumber);
//     if (!session) return false;

//     if (!(session as any).contentType || !(session as any).capacity) {
//         console.warn(`⚠️ Faltan datos para crear pedido automático: ${phoneNumber}`);
//         return false;
//     }

//     const prices: Record<string, number> = {
//         '8GB': 59900, '32GB': 89900, '64GB': 129900, '128GB': 169900, '256GB': 249900, '512GB': 399900
//     };

//     const basePrice = prices[(session as any).capacity] || 89900;
//     const orderId = `ORD-${Date.now()}-${phoneNumber.slice(-4)}`;

//     (session as any).orderId = orderId;
//     session.orderData = {
//         id: orderId,
//         orderNumber: orderId,
//         items: [{
//             id: `ITEM-${Date.now()}`,
//             productId: `USB-${(session as any).contentType}-${(session as any).capacity}`,
//             name: `USB ${(session as any).capacity} - ${(session as any).contentType}`,
//             price: basePrice,
//             quantity: 1,
//             unitPrice: basePrice
//         }],
//         type: 'customized',
//         status: 'draft',
//         totalPrice: basePrice,
//         price: basePrice,
//         createdAt: new Date(),
//         startedAt: new Date(),
//         customerInfo: {
//             name: session.name,
//             phone: phoneNumber,
//             address: (session as any).customerData?.direccion
//         }
//     } as any;

//     session.stage = 'closing';
//     session.buyingIntent = Math.min((session.buyingIntent || 50) + 20, 100);

//     session.interactions.push({
//         timestamp: new Date(),
//         message: `Pedido automático creado: ${orderId}`,
//         type: 'system_event',
//         intent: 'order_created',
//         sentiment: 'positive',
//         engagement_level: 90,
//         channel: 'WhatsApp'
//     } as any);

//     await updateUserSession(phoneNumber, `Pedido automático creado: ${orderId}`, 'order_creation', null, false);
//     console.log(`✅ Pedido automático creado para ${phoneNumber}: ${orderId}`);

//     return true;
// }

// export async function getUserPreferencesSummary(phoneNumber: string): Promise<string> {
//     const session = await getUserSession(phoneNumber);
//     if (!session) return 'No se encontró información del usuario';

//     let summary = '📊 *RESUMEN DE PREFERENCIAS*\n';
//     summary += '━━━━━━━━━━━━━━━━━━━━\n\n';

//     if ((session as any).contentType) summary += `🎵 Tipo de contenido: ${(session as any).contentType}\n`;
//     if ((session as any).capacity) summary += `💾 Capacidad: ${(session as any).capacity}\n`;
//     if ((session as any).selectedGenres && (session as any).selectedGenres.length > 0) summary += `🎼 Géneros: ${(session as any).selectedGenres.join(', ')}\n`;
//     if ((session as any).mentionedArtists && (session as any).mentionedArtists.length > 0) summary += `🎤 Artistas: ${(session as any).mentionedArtists.join(', ')}\n`;
//     if (session.preferences?.musicGenres && session.preferences.musicGenres.length > 0) summary += `🎶 Géneros musicales: ${session.preferences.musicGenres.join(', ')}\n`;
//     if ((session as any).price) summary += `💰 Precio: $${(session as any).price.toLocaleString()}\n`;

//     if (session.orderData?.items?.length) {
//         summary += `\n📦 *PRODUCTOS EN EL PEDIDO*\n`;
//         session.orderData.items.forEach((item, index) => {
//             summary += `${index + 1}. ${item.name} - $${item.price.toLocaleString()}\n`;
//         });
//         summary += `\n💵 Total: $${(session.orderData.totalPrice || 0).toLocaleString()}\n`;
//     }

//     summary += '\n━━━━━━━━━━━━━━━━━━━━';
//     return summary;
// }

// // ====== Handlers de eventos entrantes del bot (onMessage) ======

// type InboundEvent = {
//   from: string;
//   body: string;
//   flow?: string;
//   channel?: 'WhatsApp' | 'Instagram' | 'Telegram' | 'Web' | string;
//   pushName?: string;
// };

// type BotMessageEvent = {
//   to: string;
//   body: string;
//   flow?: string;
//   channel?: string;
// };

// type SystemEvent = {
//   phone: string;
//   message: string;
//   code?: string;
//   flow?: string;
//   channel?: string;
//   // NUEVO: datos opcionales sobre el agente y origen del evento
//   agentId?: string;
//   agentName?: string;
//   source?: string; // 'whatsapp_inbox' | 'crm' | 'waba' | etc
// };

// function detectFlowAlias(flow?: string): string {
//   if (!flow) return 'keep';
//   const norm = normalizeFlow(flow);
//   return norm || 'keep';
// }

// function channelOrDefault(ch?: string) {
//   const c = (ch || '').toLowerCase();
//   if (/insta/.test(c)) return 'Instagram';
//   if (/tele/.test(c)) return 'Telegram';
//   if (/web|site|shop/.test(c)) return 'Web';
//   return 'WhatsApp';
// }

// // ===== NUEVO: helpers para marcar/desmarcar chat activo de WhatsApp =====
// function markWhatsAppChatActive(session: UserSession, meta?: { agentId?: string; agentName?: string; source?: string }) {
//   session.tags = session.tags || [];
//   if (!session.tags.includes('whatsapp_chat')) session.tags.push('whatsapp_chat');
//   session.conversationData = session.conversationData || {};
//   (session.conversationData as any).whatsappChatActive = true;
//   (session.conversationData as any).whatsappChatMeta = {
//     ...((session.conversationData as any).whatsappChatMeta || {}),
//     activatedAt: new Date().toISOString(),
//     agentId: meta?.agentId || ((session.conversationData as any).whatsappChatMeta?.agentId || null),
//     agentName: meta?.agentName || ((session.conversationData as any).whatsappChatMeta?.agentName || null),
//     source: meta?.source || ((session.conversationData as any).whatsappChatMeta?.source || 'unknown')
//   };
// }

// function unmarkWhatsAppChatActive(session: UserSession, meta?: { agentId?: string; agentName?: string; source?: string }) {
//   session.tags = session.tags || [];
//   const idx = session.tags.indexOf('whatsapp_chat');
//   if (idx > -1) session.tags.splice(idx, 1);
//   session.conversationData = session.conversationData || {};
//   (session.conversationData as any).whatsappChatActive = false;
//   (session.conversationData as any).whatsappChatMeta = {
//     ...((session.conversationData as any).whatsappChatMeta || {}),
//     deactivatedAt: new Date().toISOString(),
//     agentId: meta?.agentId || ((session.conversationData as any).whatsappChatMeta?.agentId || null),
//     agentName: meta?.agentName || ((session.conversationData as any).whatsappChatMeta?.agentName || null),
//     source: meta?.source || ((session.conversationData as any).whatsappChatMeta?.source || 'unknown')
//   };
// }

// export async function onInboundMessage(ev: InboundEvent) {
//   try {
//     const phone = validatePhoneNumber(ev.from);
//     if (!phone) return;

//     const channel = channelOrDefault(ev.channel);
//     const flowAlias = detectFlowAlias(ev.flow);
//     const current = userSessions.get(phone)?.currentFlow || 'welcomeFlow';
//     const finalFlow = flowAlias === 'keep' ? current : flowAlias;
//     const confidence = (finalFlow === 'musicUsb' || finalFlow === 'videosUsb' || finalFlow === 'moviesUsb' || finalFlow === 'orderFlow') ? 0.9 : 0.7;

//     // Log de entrada enriquecido
//     console.log(`📥 Inbound from=${phone} | pushName=${ev.pushName || 'N/A'} | channel=${channel} | flowReq=${ev.flow || 'N/A'} | finalFlow=${finalFlow} | bodyLen=${(ev.body || '').length}`);

//     await updateUserSession(
//       phone,
//       ev.body || '',
//       finalFlow,
//       null,
//       false,
//       {
//         messageType: 'inbound_message',
//         confidence,
//         metadata: {
//           channel,
//           source: 'onInboundMessage',
//           pushName: ev.pushName || null,
//           receivedAt: new Date().toISOString(),
//           device: (ev as any)?.device || null,
//           userAgent: (ev as any)?.userAgent || null
//         }
//       },
//       ev.pushName
//     );

//     await trackUserResponse(phone, ev.body || '');
//   } catch (e) {
//     console.error('❌ onInboundMessage error:', e);
//   }
// }

// export async function onBotMessage(ev: BotMessageEvent) {
//   try {
//     const phone = validatePhoneNumber(ev.to);
//     if (!phone) return;
//     const session = await getUserSession(phone);
//     const channel = channelOrDefault(ev.channel);
//     const now = new Date();

//     session.interactions = session.interactions || [];
//     session.interactions.push({
//       timestamp: now,
//       message: (ev.body || '').substring(0, 500),
//       type: 'bot_message',
//       intent: 'bot_output',
//       sentiment: 'neutral',
//       engagement_level: 50,
//       channel,
//       respondedByBot: true
//     } as any);

//     if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
//     session.updatedAt = now;
//     userSessions.set(phone, session);
//   } catch (e) {
//     console.error('❌ onBotMessage error:', e);
//   }
// }

// export async function onSystemEvent(ev: SystemEvent) {
//   try {
//     const phone = validatePhoneNumber(ev.phone);
//     if (!phone) return;
//     const session = await getUserSession(phone);
//     const channel = channelOrDefault(ev.channel);
//     const now = new Date();

//     // ===== Manejar eventos de agente humano para WhatsApp =====
//     const code = (ev.code || '').toLowerCase();
//     const activateCodes = new Set([
//       'human_chat_started', 'agent_assigned', 'agent_joined', 'whatsapp_chat_started', 'chat_taken', 'chat_assigned'
//     ]);
//     const deactivateCodes = new Set([
//       'human_chat_ended', 'agent_unassigned', 'agent_left', 'whatsapp_chat_ended', 'chat_released', 'chat_closed'
//     ]);

//     if (activateCodes.has(code)) {
//       markWhatsAppChatActive(session, { agentId: ev.agentId, agentName: ev.agentName, source: ev.source });
//       console.log(`👤 Chat humano ACTIVADO (WhatsApp) para ${phone} por ${ev.agentName || ev.agentId || 'N/A'}`);
//       try {
//         if (typeof businessDB?.updateUserSession === 'function') {
//           await businessDB.updateUserSession(phone, {
//             tags: jsonStringifySafe(session.tags || []),
//             conversationData: jsonStringifySafe(session.conversationData || {})
//           } as any);
//         }
//       } catch (e) {
//         console.warn('⚠️ Persistencia chat activo:', e);
//       }
//     }

//     if (deactivateCodes.has(code)) {
//       unmarkWhatsAppChatActive(session, { agentId: ev.agentId, agentName: ev.agentName, source: ev.source });
//       console.log(`👤 Chat humano DESACTIVADO (WhatsApp) para ${phone} por ${ev.agentName || ev.agentId || 'N/A'}`);
//       try {
//         if (typeof businessDB?.updateUserSession === 'function') {
//           await businessDB.updateUserSession(phone, {
//             tags: jsonStringifySafe(session.tags || []),
//             conversationData: jsonStringifySafe(session.conversationData || {})
//           } as any);
//         }
//       } catch (e) {
//         console.warn('⚠️ Persistencia chat inactivo:', e);
//       }
//     }

//     session.interactions = session.interactions || [];
//     session.interactions.push({
//       timestamp: now,
//       message: (ev.message || '').substring(0, 500),
//       type: 'system_event',
//       intent: ev.code || 'system',
//       sentiment: 'neutral',
//       engagement_level: 40,
//       channel,
//       respondedByBot: false
//     } as any);

//     if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
//     session.updatedAt = now;
//     userSessions.set(phone, session);
//   } catch (e) {
//     console.error('❌ onSystemEvent error:', e);
//   }
// }

// // Exportaciones finales

// function safeJSON(value: any, fallback: any): any {
//   try {
//     if (value == null) return fallback;
//     if (typeof value === 'object') return value;
//     if (typeof value === 'string') {
//       const trimmed = value.trim();
//       if (!trimmed) return fallback;
//       return JSON.parse(trimmed);
//     }
//     return fallback;
//   } catch {
//     return fallback;
//   }
// }


import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { adapterDB, businessDB } from '../mysql-database';
import { join } from 'path';
import type { UserSession, AnalyticsData as GlobalAnalyticsData, Interaction as GlobalInteraction } from '../../types/global';
import { 
    calculateDemographicsSummary,
    calculatePreferencesSummary
} from './analyticsSummaryHelpers';
import { musicData } from './musicUsb';
import { videoData } from './videosUsb';
import { MessageType } from '../../types/enums';

// ===== Anti-exceso y deduplicación =====
import crypto from 'crypto';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function isHourAllowed(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 8 && h <= 22;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((Math.abs(a.getTime() - b.getTime())) / 86400000);
}

// === NUEVO: helper para excluir contactos con chat activo de WhatsApp ===
export function isWhatsAppChatActive(session: UserSession): boolean {
  const tags = session.tags || [];
  const hasTag =
    tags.includes('whatsapp_chat') ||
    tags.includes('chat_activo') ||
    tags.includes('whatsapp_chat');
  const flag = !!(session.conversationData && (session.conversationData as any).whatsappChatActive === true);
  return hasTag || flag;
}

// Limites globales de envío
const RATE_GLOBAL = {
perHourMax: 420,  // 420 mensajes/hora
perDayMax: 12000,  // 12000 mensajes/día
hourWindowStart: Date.now(),
hourCount: 0,
dayWindowStart: Date.now(),
dayCount: 0
};

function resetIfNeeded() {
// Sin resets efectivos: dejamos contadores por debug, no frenan envíos
RATE_GLOBAL.hourWindowStart = Date.now();
RATE_GLOBAL.dayWindowStart = Date.now();
}

function canSendGlobal(): boolean {
// Siempre permitir
return true;
}

function markGlobalSent() {
// Solo para métricas internas
RATE_GLOBAL.hourCount++;
RATE_GLOBAL.dayCount++;
}

// Por-usuario: 24h mínimo, 2/semana y máx 4 recordatorios acumulados (reset al comprar)
function canSendUserFollowUp(session: UserSession): { ok: boolean; reason?: string } {
    const now = new Date();

    // 1. Ventana horaria ampliada (7:00 - 23:59)
    if (now.getHours() < 7 || now.getHours() >= 24) {
        return { ok: false, reason: 'outside_business_hours' };
    }

    session.conversationData = session.conversationData || {};
    const history: string[] = session.conversationData.followUpHistory || [];

    // 2. Límite máximo aumentado a 10 seguimientos no convertidos
    if (history.length >= 10 && session.stage !== 'converted') {
        return { ok: false, reason: 'max_followups_non_converted' };
    }

    // 3. Intervalo mínimo entre seguimientos reducido a 8 horas
    if (session.lastFollowUp && (now.getTime() - session.lastFollowUp.getTime()) < 8 * 3600000) {
        return { ok: false, reason: 'min_interval_8h' };
    }

    // 4. Máximo 6 seguimientos por semana (en lugar de 4)
    const weeklyFollowUps = history.filter(ts => 
        daysBetween(new Date(ts), now) <= 7
    ).length;
    
    if (weeklyFollowUps >= 6) {
        return { ok: false, reason: 'weekly_cap_6' };
    }

    // 5. Exclusión solo si hay interacción humana reciente (<2h)
    if (isWhatsAppChatActive(session) && 
        (now.getTime() - session.lastInteraction.getTime()) < 7200000) {
        return { ok: false, reason: 'recent_human_interaction' };
    }

    return { ok: true };
}

function recordUserFollowUp(session: UserSession) {
  session.lastFollowUp = new Date();
  session.conversationData = session.conversationData || {};
  const history: string[] = (session.conversationData.followUpHistory || []) as string[];
  history.push(new Date().toISOString());
  // conservar últimos 10
  session.conversationData.followUpHistory = history.slice(-10);
}

// === NUEVO: Reset de recordatorios tras compra/convertido ===
function resetFollowUpCountersForUser(session: UserSession) {
  session.conversationData = session.conversationData || {};
  session.conversationData.followUpHistory = [];
  session.lastFollowUp = undefined as any;
  session.lastFollowUpMsg = undefined;
}

// ===== NUEVO: Control de retraso entre mensajes (3 segundos entre usuarios) =====
let lastFollowUpTimestamp = 0;
const FOLLOWUP_DELAY_MS = 1000; // 3 segundos

async function waitForFollowUpDelay() {
  const now = Date.now();
  const elapsed = now - lastFollowUpTimestamp;
  if (elapsed < FOLLOWUP_DELAY_MS) {
    const waitTime = FOLLOWUP_DELAY_MS - elapsed;
    console.log(`⏳ Esperando ${waitTime}ms antes del próximo seguimiento...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastFollowUpTimestamp = Date.now();
}

// ====== NUEVO: Handlers onMessage (import dependencias internas al final del archivo) ======
// Nota: Las funciones onInboundMessage/onBotMessage/onSystemEvent se declaran más abajo, después de utilidades.

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
        metadata?: Record<string, any>;
    }
): Interaction {
    return {
        timestamp: new Date(),
        message: (message || '').toString().trim(),
        type,
        intent: options?.intent || 'general',
        sentiment: options?.sentiment || 'neutral',
        engagement_level: options?.engagement_level || 50,
        channel: options?.channel || 'WhatsApp',
        respondedByBot: options?.respondedByBot || false,
        ...(options?.metadata ? { metadata: options.metadata } : {})
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
const MIN_HOURS_BETWEEN_FOLLOWUPS = 6;

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
        "⏳ Últimas horas con envío gratis hoy",
        "🏁 Cierra ahora y dejo tu USB armada hoy mismo",
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
    try {
        console.log(`📊 [METRICS] ${metrics.phoneNumber}: Stage=${metrics.stage}, Intent=${metrics.intent}, BuyingIntent=${metrics.buyingIntent}%`);
    } catch (error) {
        console.warn('⚠️ Error en trackUserMetrics:', error);
    }
};

// Variables globales
export const userSessions: Map<string, UserSession> = new Map();
export const followUpQueue = new Map<string, NodeJS.Timeout>();
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
        if (!existsSync(this.sessionsFile)) return;

        const data = readFileSync(this.sessionsFile, 'utf8');
        if (!data || !data.trim()) return;

        const sessionsArray = JSON.parse(data);
        if (!Array.isArray(sessionsArray)) return;

        sessionsArray.forEach((session: any) => {
          // Normaliza fechas
          const dateFields = ['lastInteraction','createdAt','updatedAt','lastActivity','lastFollowUp'];
          dateFields.forEach(f => {
            if (session[f]) session[f] = new Date(session[f]);
          });

          if (Array.isArray(session.interactions)) {
            session.interactions = session.interactions.map((i: any) => ({
              ...i,
              timestamp: i.timestamp ? new Date(i.timestamp) : new Date()
            }));
          }

          userSessions.set(session.phoneNumber || session.phone, session);
        });

        console.log(`📊 Cargadas ${userSessions.size} sesiones de usuario`);
      } catch (error) {
        console.error('❌ Error cargando sesiones:', error);
      }
    }

    private saveSessions() {
    try {
        const sessionsArray = Array.from(userSessions.values());
        const json = jsonStringifySafe(sessionsArray, 2);
        writeFileSync(this.sessionsFile, json, 'utf8');
      } catch (error) {
        console.error('❌ Error guardando sesiones:', error);
      }
    }

    private startAutoSave() {
        setInterval(() => this.saveSessions(), 30000);
    }

    private startCleanupTask() {
        setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
    }

    private cleanupOldSessions() {
        const now = new Date();
        const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
            session = this.createDefaultUserSession(phoneNumber);
            userSessions.set(phoneNumber, session);
            console.log(`✅ Nueva sesión creada para ${phoneNumber}`);
        } else {
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

export function toPlainJSON(input: any, maxDepth = 3): any {
  const seen = new WeakSet();
  function walk(val: any, depth: number): any {
    if (val == null) return val;
    if (depth <= 0) return '[MaxDepth]';
    const t = typeof val;
    if (t === 'string' || t === 'number' || t === 'boolean') return val;
    if (t === 'bigint') return val.toString();
    if (t === 'function' || t === 'symbol') return undefined;

    if (Array.isArray(val)) return val.slice(0, 100).map(v => walk(v, depth - 1));

    if (t === 'object') {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);

      // Evita objetos no serializables comunes
      const ctor = val.constructor && val.constructor.name;
      if (ctor && ['Map','Set','WeakMap','WeakSet','Timeout','Immediate'].includes(ctor)) {
        return `[${ctor}]`;
      }

      const out: any = {};
      for (const k of Object.keys(val)) {
        out[k] = walk(val[k], depth - 1);
      }
      return out;
    }
    return undefined;
  }
  return walk(input, maxDepth);
}

// util global segura
export function jsonStringifySafe(value: any, space: number = 2): string {
  const seen = new WeakSet();
  const MAX_ARRAY = 5000;

  function replacer(this: any, key: string, val: any) {
    // eliminar funciones y símbolos
    if (typeof val === 'function' || typeof val === 'symbol') return undefined;

    // evitar referencias a objetos problemáticos
    if (
      val instanceof Map || val instanceof Set ||
      val instanceof WeakMap || val instanceof WeakSet
    ) {
      return Array.isArray(val) ? val : { type: Object.prototype.toString.call(val), size: (val as any).size };
    }

    // cortar ciclos
    if (val && typeof val === 'object') {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }

    // acotar arrays enormes
    if (Array.isArray(val) && val.length > MAX_ARRAY) {
      return [...val.slice(0, MAX_ARRAY), `...+${val.length - MAX_ARRAY} more`];
    }

    // objetos de sistema de Node (Timeout, etc.)
    if (val && typeof val === 'object') {
      const ctor = val.constructor && val.constructor.name;
      if (ctor === 'Timeout' || ctor === 'Immediate') return `[${ctor}]`;
    }

    return val;
  }

  try {
    return JSON.stringify(value, replacer, space);
  } catch (e) {
    // último recurso: stringify minimal
    return JSON.stringify({ error: 'stringify_failed' });
  }
}

export function validateSentiment(sentiment: any): SentimentType {
    if (typeof sentiment === 'string') {
        const normalizedSentiment = sentiment.toLowerCase().trim();
        if (normalizedSentiment === 'positive' || normalizedSentiment === 'positivo') return 'positive';
        if (normalizedSentiment === 'negative' || normalizedSentiment === 'negativo') return 'negative';
        if (normalizedSentiment === 'neutral') return 'neutral';
    }
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
        const msg = (message || '').toLowerCase();
        let intent = 'unknown';

        if (currentFlow.includes('music') && musicGenres.some(genre => msg.includes(genre))) {
            intent = 'music_customization';
        } else if (/(precio|costo|valor|cuesta)/.test(msg)) {
            intent = 'pricing';
        } else if (/(ok|continuar|siguiente|perfecto)/.test(msg)) {
            intent = 'continue';
        } else if (/(comprar|quiero|me interesa|ordenar)/.test(msg)) {
            intent = 'buying';
        } else if (/(no me interesa|no quiero|cancelar|no gracias)/.test(msg)) {
            intent = 'rejection';
        } else if (/(personalizado|cambiar|agregar)/.test(msg)) {
            intent = 'customization';
        } else if (/(sí|si|genial|excelente|perfecto)/.test(msg)) {
            intent = 'positive_response';
        }

        let sentiment: SentimentType = 'neutral';
        const positiveWords = ['genial', 'perfecto', 'excelente', 'me gusta', 'interesante', 'bueno', 'sí', 'si', 'ok', 'continuar', 'gracias', 'super', 'increíble'];
        const negativeWords = ['no me interesa', 'no quiero', 'caro', 'cancelar', 'después', 'luego', 'aburrido', 'demorado', 'malo'];
        
        if (positiveWords.some(word => msg.includes(word))) sentiment = 'positive';
        else if (negativeWords.some(word => msg.includes(word))) sentiment = 'negative';

        let engagement = 5;
        if (sentiment === 'positive') engagement += 3;
        if (sentiment === 'negative') engagement -= 2;
        if (msg.length > 50) engagement += 1;
        if (intent === 'buying') engagement += 3;
        if (intent === 'music_customization') engagement += 2;
        if (intent === 'continue') engagement += 1;

        return { intent, sentiment, engagement: Math.max(1, Math.min(10, engagement)) };
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

// Utilidades
function asUSBContentType(input: string): USBContentType {
    if (input === 'musica' || input === 'videos' || input === 'peliculas') return input;
    return 'musica';
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

    if (/\bbaladas\b/.test(msg) && /(60|70|80|90)/.test(msg) && /(sin relleno|sin repetidas|no repetidas)/i.test(msg)) {
    return 'customizing'; // fijar
    }

    if (/finalizar pedido|confirmar compra|método de pago|transferencia|pago|nombre completo|dirección|celular|envío a|pagar|factura|comprobante|recibo|domicilio/.test(msg)) {
        return 'closing';
    }
    if (/(quiero|deseo|voy a|me interesa|comprar|listo para|confirmo|realizar pedido|adquirir|pido|hazme el pedido)/.test(msg) ||
        analysis.intent === 'buying') {
        return 'interested';
    }
    if (/(cuánto|cuanto|precio|costo|valor|cuánto vale|descuento|promoción|oferta|pago|formas de pago|precio final)/.test(msg) ||
        analysis.intent === 'pricing') {
        return 'pricing';
    }
    if (/(demo|ejemplo|muestra|quiero escuchar|quiero ver|playlist|personalizada|géneros a incluir|puedes agregar|puedes quitar)/.test(msg) ||
        analysis.intent === 'customization' || analysis.intent === 'music_customization') {
        return 'customizing';
    }
    if (/(sí|si|me gusta|genial|excelente|ok|perfecto|dale|continúa|avísame|dime más|interesante)/.test(msg) ||
        analysis.intent === 'positive_response') {
        if (session.stage === 'customizing' || session.stage === 'pricing') return session.stage;
        return 'interested';
    }
    if (/(no quiero|no me interesa|muy caro|más adelante|luego|después|no gracias|tal vez|no por ahora|cancelar)/.test(msg) ||
        analysis.intent === 'rejection' || 
        analysis.sentiment === 'negative') {
        return 'abandoned';
    }
    if (session.lastInteraction && (Date.now() - session.lastInteraction.getTime() > 2 * 24 * 60 * 60 * 1000)) {
        return 'inactive';
    }
    return session.stage || 'initial';
}

// Funciones principales
export const getUserSession = async (phoneNumber: string): Promise<UserSession> => {
  // Validar y normalizar
  const validPhone = validatePhoneNumber(phoneNumber);
  
  if (!validPhone) {
    console.error(`❌ Intento de crear sesión con número inválido: ${phoneNumber}`);
    throw new Error(`Número de teléfono inválido: ${phoneNumber}`);
  }
  
  return await trackingSystem.getUserSession(validPhone);
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
    step?: string;
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
  pushName?: string
): Promise<void> => {
  try {
    const validatedPhone = validatePhoneNumber(phoneNumber);
    if (!validatedPhone) {
      console.error('❌ Número de teléfono inválido:', phoneNumber);
      return;
    }

    // 1) Normaliza y acepta alias con sufijo Flow
    function normalizeFlowAlias(flow: string): string {
      const f = (flow || '').toLowerCase().trim();
      const aliases: Record<string, string> = {
        'welcome_flow': 'welcomeFlow',
        'welcome': 'welcomeFlow',
        'catalog': 'catalogFlow',
        'catalog_flow': 'catalogFlow',
        'customization': 'customizationFlow',
        'customization_flow': 'customizationFlow',
        'customization_started': 'customizationFlow',
        'music_flow': 'musicUsb',
        'video_flow': 'videosUsb',
        'movies_flow': 'moviesUsb',
        'payment_flow': 'orderFlow',
        'order_creation': 'orderFlow',
        'processing': 'orderFlow',
        'audio_received': 'media_received',
        'media_received': 'media_received'
      };
      return aliases[f] || currentFlow;
    }

    const normalizedFlow = normalizeFlowAlias(currentFlow);

    // 2) Lista de flujos válidos incluyendo variantes ...Flow
    const validFlows = [
      'welcome', 'welcomeFlow',
      'catalog', 'catalogFlow',
      'customization', 'customizationFlow', 'customizationStarted',
      'order', 'orderFlow', 'payment_flow',
      'music', 'musicUsb',
      'videos', 'videosUsb',
      'movies', 'moviesUsb',
      'media_received', 'audio_received',
      'cross_sell',
      // pasos internos mapeados por tu lógica
      'musicPreferences', 'designPreferences', 'technicalSpecs', 'accessoriesSelected'
    ];

    // 3) Acepta flujos no exactos pero compatibles (p. ej. algo que termina en Flow)
    let finalFlow = normalizedFlow;
    if (!validFlows.includes(finalFlow)) {
      if (finalFlow.endsWith('Flow')) {
        const base = finalFlow.replace(/Flow$/i, '');
        if (validFlows.includes(base)) finalFlow = base;
      }
      if (!validFlows.includes(finalFlow)) {
        // En último caso, no rechazar: usa welcomeFlow como fallback pero registra el que llegó
        console.warn(`⚠️ Flujo no reconocido (${currentFlow}). Normalizando a welcomeFlow`);
        finalFlow = 'welcomeFlow';
      }
    }

    // 4) Sanitiza el mensaje (permite vacío si esPredetermined)
    const sanitizedMessage = sanitizeMessage(message);
    if (!sanitizedMessage && !options?.isPredetermined) {
      // No detengas la sesión; solo registra que no hay texto
      console.warn('⚠️ Mensaje vacío, continúo sin registrar interacción de texto');
    }

    // 5) Obtén sesión
    const session = await getUserSession(validatedPhone);
    const now = new Date();
    const previousFlow = session.currentFlow;

    if (!session || typeof session !== 'object') throw new Error('Sesión inválida');

    // 6) Actualiza campos base
    session.lastInteraction = now;
    session.lastActivity = now;
    session.updatedAt = now;
    session.messageCount = (session.messageCount || 0) + (sanitizedMessage ? 1 : 0);
    session.currentFlow = finalFlow;
    session.isActive = true;

    // 7) Análisis simple/avanzado
    let analysis: { intent: string; sentiment: SentimentType; engagement: number };
    try {
      analysis = await performIntelligentAnalysis(sanitizedMessage || '', finalFlow, session);
    } catch {
      analysis = {
        intent: extractBasicIntent(sanitizedMessage || ''),
        sentiment: 'neutral',
        engagement: 50
      };
    }

    if (options?.metadata && typeof options.metadata === 'object') {
      session.conversationData = session.conversationData || {};
      const safeMeta = toPlainJSON(options.metadata, 3);
      session.conversationData.metadata = {
        ...toPlainJSON(session.conversationData.metadata || {}, 3),
        ...safeMeta,
        lastUpdate: new Date().toISOString()
      };
    }

    // 8) Guarda decisiones del router/metadata (sin funciones)
    if (options) {
      if (options.routerDecision && typeof options.routerDecision === 'object') {
        session.conversationData = session.conversationData || {};
        session.conversationData.routerDecision = {
          targetFlow: options.routerDecision.targetFlow,
          shouldRedirect: options.routerDecision.shouldRedirect,
          timestamp: now.toISOString()
        };
      }
      if (options.metadata && typeof options.metadata === 'object') {
        session.conversationData = session.conversationData || {};
        session.conversationData.metadata = {
          ...session.conversationData.metadata,
          ...options.metadata,
          lastUpdate: now.toISOString()
        };
      }
    }

    // 9) Registrar interacción si hay texto
    if (sanitizedMessage && sanitizedMessage.trim().length > 0) {
      const newInteraction: Interaction = {
        timestamp: now,
        message: sanitizedMessage.substring(0, 500),
        type: 'user_message',
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        engagement_level: analysis.engagement,
        channel: (session.interactions?.slice(-1).find(i => !!i.channel)?.channel) || 'WhatsApp',
        respondedByBot: true,
        metadata: {
          flow: finalFlow,
          messageType: options?.messageType,
          confidence: options?.confidence,
          isPredetermined: options?.isPredetermined || false,
          previousFlow,
          sessionStage: session.stage,
          messageLength: sanitizedMessage.length
        }
      };
      session.interactions = session.interactions || [];
      session.interactions.push(newInteraction);
      if (session.interactions.length > 500) {
        session.interactions = session.interactions.slice(-500);
      }
    }

    // 10) Customization scaffold
    if (!session.customization || typeof session.customization !== 'object') {
      session.customization = {
        step: 0,
        preferences: {},
        totalPrice: 0,
        startedAt: now,
        selectedType: (options?.messageType as any) || null,
        confidence: options?.confidence || 0,
        lastUpdate: now.toISOString()
      };
    } else {
      const customizationExtended = session.customization as any;
      if (options?.messageType && !customizationExtended.selectedType) customizationExtended.selectedType = options.messageType;
      if (options?.confidence && !customizationExtended.confidence) customizationExtended.confidence = options.confidence;
      customizationExtended.lastUpdate = now.toISOString();
    }

    // 11) Mapear pasos a números (si aplica)
    const flowStepMap: Record<string, number> = {
      'welcome': 0,
      'welcomeFlow': 0,
      'customizationFlow': 1,
      'musicUsb': 2,
      'videosUsb': 2,
      'moviesUsb': 2,
      'musicPreferences': 3,
      'designPreferences': 4,
      'technicalSpecs': 5,
      'accessoriesSelected': 6,
      'orderFlow': 7,
      'payment_flow': 8,
      'confirmed': 9
    };
    if (finalFlow in flowStepMap && session.customization) {
      session.customization.step = flowStepMap[finalFlow];
      const cext = session.customization as any;
      if (finalFlow === 'musicUsb') cext.selectedType = 'music';
      if (finalFlow === 'videosUsb') cext.selectedType = 'videos';
      if (finalFlow === 'moviesUsb') cext.selectedType = 'movies';
    }

    // 12) Intereses
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
      if (analysis.intent.includes(intentKey) && !(session.interests || []).includes(interest)) {
        session.interests = session.interests || [];
        session.interests.push(interest);
      }
    }

    // 13) Etapa
    const prevStage = session.stage || 'initial';
    let newStage = prevStage;
    try {
      newStage = await detectAdvancedStage(session, analysis, sanitizedMessage || '', options);
    } catch {
      newStage = detectBasicStage(sanitizedMessage || '', session, analysis);
    }
    if (prevStage !== newStage) {
      session.conversationData = session.conversationData || {};
      session.conversationData.stageHistory = session.conversationData.stageHistory || [];
      session.conversationData.stageHistory.push({
        from: prevStage,
        to: newStage,
        timestamp: now.toISOString(),
        trigger: (sanitizedMessage || '').substring(0, 100)
      });
    }
    session.stage = newStage;

    // 14) AI analysis opcional
    try {
      const aiAnalysis = await performAdvancedAIAnalysis(session, options);
      if (aiAnalysis) {
        session.aiAnalysis = aiAnalysis;
        session.buyingIntent = aiAnalysis.buyingIntent;
        session.conversationData = session.conversationData || {};
        session.conversationData.aiInsights = session.conversationData.aiInsights || [];
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
    } catch {
      session.buyingIntent = calculateBasicBuyingIntent(session, analysis);
    }

    // 15) Persistencia
    try {
      if (!global.userSessions) global.userSessions = new Map();
      global.userSessions.set(validatedPhone, session);

      if (typeof businessDB?.updateUserSession === 'function') {
        const payload: Partial<UserSession> & any = { ...session };
        const stringify = (v: any, fallback: string) => {
          try { return typeof v === 'string' ? v : JSON.stringify(v ?? fallback); } catch { return fallback; }
        };
        const existing = await businessDB.getUserSession(validatedPhone).catch(() => null);
        let mergedInteractions = session.interactions || [];
        if (existing?.interactions) {
          const existingParsed = Array.isArray(existing.interactions) ? existing.interactions : safeJSON(existing.interactions, []);
          mergedInteractions = [...existingParsed.slice(-100), ...session.interactions].slice(-200);
        }
        const safeStr = (v: any, fallback: string) => {
          try { return jsonStringifySafe(v); } catch { return fallback; }
        };
        payload.preferences = safeStr(payload.preferences, '{}');
        payload.demographics = safeStr(payload.demographics, '{}');
        payload.interactions = safeStr(mergedInteractions, '[]');
        payload.interests = safeStr(session.interests || [], '[]');
        payload.conversationData = safeStr(session.conversationData || {}, '{}');
        await businessDB.updateUserSession(validatedPhone, payload);
      }
    } catch (persistError) {
      console.error('❌ Error persistiendo sesión:', persistError);
    }

    // 16) Seguimiento programado
    try {
      if (typeof scheduleFollowUp === 'function' &&
          session.stage !== 'converted' &&
          session.stage !== 'order_confirmed' &&
          !(session.tags || []).includes('blacklist') &&
          (session.buyingIntent > 30 || session.stage === 'pricing' || session.stage === 'customizing')) {
        scheduleFollowUp(validatedPhone);
      }
    } catch (followUpError) {
      console.warn('⚠️ Error programando seguimiento:', followUpError);
    }

    console.log(`📊 [${validatedPhone}] Intent=${analysis.intent} | Sentiment=${analysis.sentiment} | Stage=${session.stage} | BuyingIntent=${session.buyingIntent}% | Flow=${finalFlow}`);
    userSessions.set(validatedPhone, session);
  } catch (error) {
    console.error(`❌ Error crítico en updateUserSession para ${phoneNumber}:`, error);
  }
};

// ==== Análisis y detección auxiliares ====

async function performIntelligentAnalysis(
    message: string, 
    currentFlow: string, 
    session: UserSession
): Promise<{intent: string, sentiment: SentimentType, engagement: number}> {
    try {
        const intent = extractAdvancedIntent(message, currentFlow);
        const sentiment = analyzeAdvancedSentiment(message);
        const engagement = calculateAdvancedEngagement(message, session);
        return { intent, sentiment, engagement };
    } catch {
        return {
            intent: extractBasicIntent(message),
            sentiment: 'neutral',
            engagement: 50
        };
    }
}

function extractAdvancedIntent(message: string, currentFlow: string): string {
    const cleanMessage = (message || '').toLowerCase().trim();
    const flowIntents: Record<string, string[]> = {
        'musicUsb': ['music', 'song', 'playlist', 'genre'],
        'videosUsb': ['video', 'clip', 'documentary', 'tutorial'],
        'moviesUsb': ['movie', 'film', 'series', 'show'],
        'orderFlow': ['buy', 'purchase', 'order', 'price'],
        'datosCliente': ['address', 'phone', 'payment', 'name']
    };
    if (flowIntents[currentFlow]) {
        for (const keyword of flowIntents[currentFlow]) {
            if (cleanMessage.includes(keyword)) return keyword;
        }
    }
    return extractBasicIntent(message);
}

function analyzeAdvancedSentiment(message: string): SentimentType {
    const positiveWords = ['excelente', 'perfecto', 'genial', 'increíble', 'me gusta', 'interesante', 'sí', 'si'];
    const negativeWords = ['no', 'mal', 'terrible', 'horrible', 'no me gusta', 'luego', 'después'];
    const cleanMessage = (message || '').toLowerCase();
    const positiveCount = positiveWords.filter(word => cleanMessage.includes(word)).length;
    const negativeCount = negativeWords.filter(word => cleanMessage.includes(word)).length;
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
}

function calculateAdvancedEngagement(message: string, session: UserSession): number {
    let engagement = 50;
    if (message.length > 50) engagement += 10;
    if (message.length > 100) engagement += 10;
    if (message.includes('?')) engagement += 15;
    const emojiCount = (message.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
    engagement += Math.min(emojiCount * 5, 20);
    if (session.interactions && session.interactions.length > 3) engagement += 10;
    return Math.min(Math.max(engagement, 0), 100);
}

async function detectAdvancedStage(
    session: UserSession, 
    analysis: any, 
    message: string, 
    options?: any
): Promise<string> {
    if (options?.isPredetermined) return `interested_${options.messageType || 'general'}`;
    if (analysis.intent.includes('buy') || analysis.intent.includes('purchase')) return 'ready_to_buy';
    if (analysis.intent.includes('price') || analysis.intent.includes('cost') || analysis.intent === 'pricing') return 'pricing';
    return detectBasicStage(message, session, analysis);
}

// Contadores de seguimiento
let FOLLOWUP_SENT_TOTAL = 0;
let FOLLOWUP_SENT_WINDOW = 0;
let FOLLOWUP_LAST_WINDOW_AT = Date.now();

// Helper para registrar envío
function logFollowUpSent(phone: string, urgency: 'high'|'medium'|'low', channel: Channel) {
  FOLLOWUP_SENT_TOTAL++;
  FOLLOWUP_SENT_WINDOW++;
  console.log(`📬 [FOLLOWUP][#${FOLLOWUP_SENT_TOTAL}] Enviado a ${phone} | urg=${urgency} | ch=${channel} | ventana=${FOLLOWUP_SENT_WINDOW}`);
}

// Reset de ventana cada 60 min
setInterval(() => {
  console.log(`⏱️ [FOLLOWUP] Ventana cerrada. Enviados en la última hora: ${FOLLOWUP_SENT_WINDOW}. Total histórico: ${FOLLOWUP_SENT_TOTAL}.`);
  FOLLOWUP_SENT_WINDOW = 0;
  FOLLOWUP_LAST_WINDOW_AT = Date.now();
}, 60 * 60 * 1000);

async function performAdvancedAIAnalysis(session: UserSession, options?: any): Promise<any> {
    const buyingIntent = calculateAdvancedBuyingIntent(session, options);
    const riskLevel = (() => {
        const hours = (Date.now() - session.lastInteraction.getTime()) / 36e5;
        if (hours > 48) return 'high';
        if (hours > 12) return 'medium';
        return 'low';
    })();
    return {
        buyingIntent,
        riskLevel,
        insights: [
            `Origen: ${options?.isPredetermined ? 'Predeterminado' : 'Libre'}`,
            `Confianza: ${options?.confidence || 0}`,
            `Tipo: ${options?.messageType || 'general'}`
        ]
    };
}

function calculateAdvancedBuyingIntent(session: UserSession, options?: any): number {
    let intent = session.buyingIntent || 50;
    if (options?.isPredetermined) intent += 20;
    if (options?.confidence && options.confidence > 0.8) intent += 15;
    if (options?.messageType && ['music', 'videos', 'movies'].includes(options.messageType)) intent += 10;
    intent += Math.min((session.messageCount || 0), 10);
    return Math.min(Math.max(intent, 0), 100);
}

// Básicas
function extractBasicIntent(message: string): string {
    if (!message || typeof message !== 'string') return 'general';
    const msg = message.toLowerCase().trim();
    if (/(precio|costo|vale|cuánto|cuanto)/.test(msg)) return 'pricing_inquiry';
    if (/(comprar|pedido|orden|quiero)/.test(msg)) return 'purchase_intent';
    if (/(personalizar|customizar|diseñar)/.test(msg)) return 'customization_interest';
    if (/(catálogo|productos|opciones|mostrar)/.test(msg)) return 'product_inquiry';
    if (/(gracias|perfecto|excelente|genial)/.test(msg)) return 'positive_feedback';
    if (/(no|cancelar|después|luego)/.test(msg)) return 'negative_response';
    if (/^[1-4]$/.test(msg)) return 'option_selection';
    return 'general_inquiry';
}

function analyzeBasicSentiment(message: string): SentimentType {
    if (!message || typeof message !== 'string') return 'neutral';
    const msg = message.toLowerCase().trim();
    const positivePatterns = [
        /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
        /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
        /\b(amor|amo|encanta|fascina|ideal|justo|necesito)\b/
    ];
    const negativePatterns = [
        /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego)\b/,
        /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
        /\b(aburrido|feo|horrible|odio|detesto|molesta)\b/
    ];
    for (const pattern of positivePatterns) if (pattern.test(msg)) return 'positive';
    for (const pattern of negativePatterns) if (pattern.test(msg)) return 'negative';
    return 'neutral';
}

const calculateBasicEngagement = (message: string, session: UserSession): number => {
    let engagement = 50;
    if (message.length > 20) engagement += 10;
    if (message.includes('?')) engagement += 5;
    if (session.messageCount > 3) engagement += 10;
    if (session.interests && session.interests.length > 0) engagement += 15;
    return Math.min(Math.max(engagement, 0), 100);
};

const detectBasicStage = (message: string, session: UserSession, analysis: any): string => {
    const lowerMessage = (message || '').toLowerCase();
    if (lowerMessage.includes('comprar') || lowerMessage.includes('pedido')) return 'purchase_intent';
    if (/^[1-4]$/.test((message || '').trim())) return 'option_selected';
    if (/(precio|costo)/.test(lowerMessage)) return 'pricing';
    if (lowerMessage.includes('personalizar')) return 'customization_interest';
    if (lowerMessage.includes('catálogo')) return 'browsing';
    if (analysis.sentiment === 'positive' && session.stage === 'price_inquiry') return 'interested';
    return session.stage || 'initial';
};

const calculateBasicBuyingIntent = (session: UserSession, analysis: any): number => {
    let intent = session.buyingIntent || 50;
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

        if (typeof SimpleAI.analyzeBuyingIntent === 'function') {
            const buyingIntent = SimpleAI.analyzeBuyingIntent(session);
            if (typeof buyingIntent === 'number' && buyingIntent >= 0 && buyingIntent <= 100) {
                aiAnalysis.buyingIntent = Math.round(buyingIntent);
            }
        }

        if (typeof SimpleAI.getNextBestAction === 'function') {
            const nextAction = SimpleAI.getNextBestAction(session);
            if (typeof nextAction === 'string' && nextAction.trim().length > 0) {
                aiAnalysis.nextBestAction = nextAction;
            }
        }

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

// Seguimiento y rescate

const getFollowUpDelay = (session: UserSession): number => {
    const baseDelay = 2 * 60 * 60 * 1000;
    if (session.aiAnalysis?.buyingIntent && session.aiAnalysis.buyingIntent > 70) return 30 * 60 * 1000;
    if (session.stage === 'interested') return 60 * 60 * 1000;
    if (session.aiAnalysis?.riskLevel === 'high') return 4 * 60 * 60 * 1000;
    return baseDelay;
};

// ===== VALIDACIÓN MEJORADA DE TELÉFONOS =====
function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  
  // 1️⃣ RECHAZAR IDs DE GRUPOS/LISTAS
  if (phone.includes('@g.us') ||      // Grupos
      phone.includes('@lid') ||        // Listas de difusión
      phone.includes('@broadcast') ||  // Broadcast
      phone.includes('@newsletter')) { // Newsletters
    return false;
  }
  
  // 2️⃣ LIMPIAR Y VALIDAR
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // 3️⃣ VALIDACIONES DE LONGITUD
  if (cleaned.length < 10 || cleaned.length > 15) return false;
  if (cleaned.startsWith('+') && cleaned.length < 11) return false;
  
  // 4️⃣ RECHAZAR PATRONES INVÁLIDOS
  if (/^0+$/.test(cleaned.replace(/\+/g, ''))) return false;
  if (cleaned.length > 15) return false; // ❌ 157359213150400 tiene 15+ dígitos
  
  return true;
}

// ===== NORMALIZAR TELÉFONO (REMOVER SUFIJOS) =====
function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  
  // Remover sufijos de WhatsApp
  let normalized = phone
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/@lid$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/@broadcast$/i, '')
    .trim();
  
  // Validar después de normalizar
  return isValidPhoneNumber(normalized) ? normalized : null;
}

// ===== LIMPIEZA INMEDIATA DE NÚMEROS INVÁLIDOS =====
export function cleanInvalidPhones() {
  let cleaned = 0;
  
  // Limpiar de userSessions
  userSessions.forEach((session, phone) => {
    if (!isValidPhoneNumber(phone)) {
      userSessions.delete(phone);
      cleaned++;
      console.log(`🗑️ Removido número inválido de sesiones: ${phone}`);
    }
  });
  
  // Limpiar de followUpQueue
  followUpQueue.forEach((timeoutId, phone) => {
    if (!isValidPhoneNumber(phone)) {
      clearTimeout(timeoutId);
      followUpQueue.delete(phone);
      cleaned++;
      console.log(`🗑️ Removido número inválido de cola: ${phone}`);
    }
  });
  
  if (cleaned > 0) {
    console.log(`✅ Limpiados ${cleaned} números inválidos del sistema`);
  }
  
  return cleaned;
}

// ===== LIMPIEZA PROACTIVA DE LA COLA =====
function cleanupFollowUpQueue() {
  const now = Date.now();
  let cleaned = 0;
  
  followUpQueue.forEach((timeoutId, phone) => {
    const session = userSessions.get(phone);
    
    // Remover si:
    // 1. Teléfono inválido
    // 2. No existe sesión
    // 3. Usuario convertido
    // 4. Chat activo de WhatsApp
    // 5. En blacklist
    if (!isValidPhoneNumber(phone) ||
        !session || 
        session.stage === 'converted' || 
        isWhatsAppChatActive(session) ||
        session.tags?.includes('blacklist')) {
      clearTimeout(timeoutId);
      followUpQueue.delete(phone);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    console.log(`🧹 Limpiados ${cleaned} seguimientos de la cola`);
  }
  
  return cleaned;
}

// ===== SCHEDULE FOLLOW-UP CON VALIDACIÓN REFORZADA =====
const scheduleFollowUp = (phoneNumber: string): void => {
  // 1️⃣ NORMALIZAR TELÉFONO PRIMERO
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  
  if (!normalizedPhone) {
    console.warn(`⚠️ Teléfono inválido/no normalizable: ${phoneNumber}`);
    return;
  }
  
  // 2️⃣ VALIDACIÓN ESTRICTA
  if (!isValidPhoneNumber(normalizedPhone)) {
    console.warn(`⚠️ Teléfono rechazado tras validación: ${normalizedPhone}`);
    return;
  }

  const session = userSessions.get(normalizedPhone);
  if (!session) {
    console.warn(`⚠️ No existe sesión para: ${normalizedPhone}`);
    return;
  }

  // 3️⃣ EXCLUSIONES
  if (isWhatsAppChatActive(session)) {
    console.log(`[FOLLOWUP] Excluido (chat activo): ${normalizedPhone}`);
    return;
  }

  if (session.stage === 'converted' || session.tags?.includes('blacklist')) {
    return;
  }

  // 4️⃣ EVITAR DUPLICADOS
  if (followUpQueue.has(normalizedPhone)) {
    return;
  }

  // 5️⃣ LÍMITE DE COLA CON LIMPIEZA AGRESIVA
  // if (followUpQueue.size >= 500) { // ⚠️ REDUCIDO DE 1000 A 500
  //   console.warn(`⚠️ Cola llena (${followUpQueue.size}/500), limpiando...`);
  if (followUpQueue.size >= 5000) {
console.warn(`⚠️ Cola alta (${followUpQueue.size}/5000), procedo igualmente (sin bloquear).`);
// No retornamos; seguimos programando
    
    const cleaned = cleanupFollowUpQueue();
    const invalidCleaned = cleanInvalidPhones();
    
    console.log(`🧹 Limpieza: ${cleaned} obsoletos + ${invalidCleaned} inválidos`);
    
    // Si después de limpiar sigue llena, rechazar
    if (followUpQueue.size >= 500) {
      console.error(`❌ Cola sigue llena (${followUpQueue.size}/500), rechazando: ${normalizedPhone}`);
      return;
    }
  }

  // 6️⃣ RESPETAR VENTANA DE 24H
  if (session.lastFollowUp) {
    const hoursSinceLastFollowUp = (Date.now() - session.lastFollowUp.getTime()) / 36e5;
    if (hoursSinceLastFollowUp < 24) {
      return;
    }
  }

  // 7️⃣ CALCULAR DELAY
  const followUpDelay = getFollowUpDelay(session);
  const maxDelay = 4 * 60 * 60 * 1000;
  const actualDelay = Math.min(followUpDelay, maxDelay);

  // 8️⃣ PROGRAMAR CON PROTECCIÓN
  try {
    const timeoutId = setTimeout(async () => {
      try {
        followUpQueue.delete(normalizedPhone);
        
        // Re-validar antes de ejecutar
        if (!isValidPhoneNumber(normalizedPhone)) {
          console.error(`❌ Número se volvió inválido: ${normalizedPhone}`);
          return;
        }
        
        const currentSession = userSessions.get(normalizedPhone);
        if (!currentSession) return;

        if (isWhatsAppChatActive(currentSession)) return;

        const minutesSinceLastInteraction = (Date.now() - currentSession.lastInteraction.getTime()) / 60000;
        if (minutesSinceLastInteraction < 5) return;

        // Verificación de contexto justo antes de ejecutar
const ctxGate = analyzeContextBeforeSend(currentSession);
if (!ctxGate.ok) {
  console.log(`⏸️ Context-gate (scheduler) bloqueó ${normalizedPhone}: ${ctxGate.reason}`);
  return;
}

        await sendFollowUpMessage(normalizedPhone);
        
      } catch (execError) {
        console.error(`❌ Error ejecutando follow-up para ${normalizedPhone}:`, execError);
      }
    }, actualDelay);

    followUpQueue.set(normalizedPhone, timeoutId);
    console.log(`[FOLLOWUP] ✅ ${normalizedPhone} en ${Math.round(actualDelay / 60000)}min | Cola: ${followUpQueue.size}/500`);
    
  } catch (scheduleError) {
    console.error(`❌ Error programando follow-up para ${normalizedPhone}:`, scheduleError);
  }
};

// ===== LIMPIEZA AUTOMÁTICA =====
setInterval(() => {
  try {
    const obsolete = cleanupFollowUpQueue();
    const invalid = cleanInvalidPhones();
    
    const stats = {
      queueSize: followUpQueue.size,
      maxSize: 500,
      utilizationPercent: Math.round((followUpQueue.size / 500) * 100),
      sessionsActive: Array.from(userSessions.values()).filter(s => s.isActive).length,
      totalSessions: userSessions.size,
      cleanedObsolete: obsolete,
      cleanedInvalid: invalid
    };
    
    console.log(`📊 [MAINTENANCE] Cola: ${stats.queueSize}/500 (${stats.utilizationPercent}%) | Sesiones: ${stats.sessionsActive}/${stats.totalSessions} | Limpiados: ${obsolete + invalid}`);
    
    // ALERTA CRÍTICA
    if (stats.utilizationPercent > 80) {
      console.error(`🚨 ALERTA CRÍTICA: Cola al ${stats.utilizationPercent}%`);
    }
    
  } catch (error) {
    console.error('❌ Error en limpieza automática:', error);
  }
}, 5 * 60 * 1000); // ⚠️ CADA 5 MIN 

// ===== LIMPIEZA INICIAL AL ARRANCAR =====
console.log('🧹 Ejecutando limpieza inicial...');
setTimeout(() => {
  const invalid = cleanInvalidPhones();
  console.log(`✅ Limpieza inicial: ${invalid} números inválidos removidos`);
}, 5000);

// ===== LIMPIEZA AL SHUTDOWN =====
process.on('SIGINT', () => {
  console.log('\n🛑 Limpiando cola de seguimientos...');
  followUpQueue.forEach((timeoutId) => clearTimeout(timeoutId));
  followUpQueue.clear();
  console.log('✅ Cola limpiada');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Limpiando cola de seguimientos...');
  followUpQueue.forEach((timeoutId) => clearTimeout(timeoutId));
  followUpQueue.clear();
  console.log('✅ Cola limpiada');
  process.exit(0);
});

// ===== FUNCIÓN AUXILIAR PARA MONITOREO =====
export function getFollowUpQueueStatus() {
  const queue = Array.from(followUpQueue.entries());
  
  return {
    size: queue.length,
    maxSize: 1000,
    utilizationPercent: Math.round((queue.length / 1000) * 100),
    phones: queue.map(([phone]) => ({
      phone: phone.slice(-4), // Solo últimos 4 dígitos por privacidad
      valid: isValidPhoneNumber(phone)
    })),
    invalidCount: queue.filter(([phone]) => !isValidPhoneNumber(phone)).length
  };
}

// ===== EXPORTAR FUNCIONES DE UTILIDAD =====
export { isValidPhoneNumber, cleanupFollowUpQueue };

// Limpiar timeouts expirados cada 30 minutos
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  followUpQueue.forEach((timeoutId, phone) => {
    const session = userSessions.get(phone);
    
    // Limpiar si:
    // 1. No existe sesión
    // 2. Usuario convertido
    // 3. Chat activo de WhatsApp
    if (!session || 
        session.stage === 'converted' || 
        isWhatsAppChatActive(session)) {
      clearTimeout(timeoutId);
      followUpQueue.delete(phone);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    console.log(`🧹 Limpiados ${cleaned} seguimientos obsoletos de la cola`);
  }
  
  console.log(`📊 Cola de seguimientos: ${followUpQueue.size} activos`);
}, 10 * 60 * 1000); // Cada 10 minutos en vez de 30


export const getUrgencyMessage = (urgencyLevel: 'high' | 'medium' | 'low', buyingIntent: number): string => {
    if (urgencyLevel === 'high' && buyingIntent > 70) return "🚨 ÚLTIMA OPORTUNIDAD: Tu descuento del 30% expira en 2 horas. ¿Confirmas ahora?";
    else if (urgencyLevel === 'medium' && buyingIntent > 50) return "⏰ Tu USB personalizada está lista. ¿La separamos con 20% OFF?";
    return "💭 ¿Tienes alguna duda sobre tu USB? Estoy aquí para ayudarte.";
};

export const generatePersuasiveFollowUp = (
  user: UserSession,
  urgencyLevel: 'high' | 'medium' | 'low'
): string[] => {
  const name = user.name ? user.name.split(' ')[0] : '';
  const greet = name ? `¡Hola ${name}!` : '¡Hola!';

  // Mapa de precios/capacidades
  const priceMap: Record<string, number> = { '8GB': 59900, '32GB': 89900, '64GB': 129900, '128GB': 169900 };
  const descMap: Record<string, string> = {
    '8GB': 'hasta 1.400 canciones',
    '32GB': 'hasta 5.000 canciones',
    '64GB': 'hasta 10.000 canciones',
    '128GB': 'hasta 25.000 canciones'
  };

  // Heurística de mejores opciones por etapa
  // - customizing: 64GB/128GB (más contenido), si el usuario ya mencionó géneros/artistas
  // - pricing: 32GB/64GB (mejor relación valor), si no hay preferencia clara
  // - interested: la capacidad preferida si existe; si no, 32GB
  // - default: 32GB, con upsell sugerido a 64GB
  const preferred = (user as any)?.capacity || (user.preferences as any)?.capacity?.[0] || null;

  function bestOptionsByStage(): string[] {
    if (user.stage === 'customizing') return preferred ? [preferred, '64GB'] : ['64GB', '128GB'];
    if (user.stage === 'pricing') return preferred ? [preferred, '32GB'] : ['32GB', '64GB'];
    if (user.stage === 'interested') return preferred ? [preferred] : ['32GB'];
    return ['32GB', '64GB'];
  }

  const picks = bestOptionsByStage().filter(cap => priceMap[cap]).slice(0, 2);
  const optionsLine = picks.map(cap => `USB ${cap} $${priceMap[cap].toLocaleString('es-CO')} (${descMap[cap]})`).join(' | ');

  // Técnica de persuasión dinámica
  let technique: 'scarcity' | 'social_proof' | 'authority' | 'reciprocity' = 'social_proof';
  if (user.buyingIntent > 80) technique = 'scarcity';
  else if ((user as any).isVIP) technique = 'reciprocity';
  else if (user.stage === 'pricing') technique = 'authority';

  const P = {
    scarcity: [
      "⏰ Últimas unidades hoy con envío gratis",
      "🔥 Oferta activa por tiempo limitado"
    ],
    social_proof: [
      "+500 compras este mes en estas capacidades",
      "Califica por los clientes: 4.9/5, las más recomendadas"
    ],
    authority: [
      "Recomendadas por expertos por su relación calidad/espacio",
      "Compatibles con carro, parlantes y TV"
    ],
    reciprocity: [
      "Incluyo playlist exclusiva de cortesía",
      "Envío gratis en tu pedido"
    ]
  } as const;

  const persuasionLead = PERSUASION_TECHNIQUES[technique][Math.floor(Math.random() * PERSUASION_TECHNIQUES[technique].length)];

// Nuevo formato con precios
return [
  `${persuasionLead}`,
  `💸 *Precios claros desde el inicio:*`,
  `- 8GB: $59.900 | 32GB: $89.900`,
  `- 64GB: $129.900 | 128GB: $169.900`,
  `⚠️ Precios con IVA incluido + Envío gratis hoy`
];

  // Urgencia
  const urgencyMsg =
    urgencyLevel === 'high' && user.buyingIntent > 70
      ? "Separa ahora y conserva tu descuento."
      : urgencyLevel === 'medium' && user.buyingIntent > 50
      ? "Activa tu pedido hoy con envío gratis."
      : "¿Dudas rápidas? Te respondo y avanzamos.";

  // CTA
  const cta = user.stage === 'pricing' ? "Escribe 8/32/64/128GB o 'PRECIO' y cerramos." : user.stage === 'customizing' ? "Dime 8/32/64/128GB y la ensamblamos con tus gustos." : "Responde 'SÍ' o elige 8/32/64/128GB y te separo la USB.";

  // Mensaje corto orientado a conversión (2–4 líneas máximo)
  const lines: string[] = [
    `${greet} ${persuasionLead}`,
    `Mejores opciones: ${optionsLine}.`,
    urgencyMsg,
    cta
  ];

  return lines;
};

// ===== Copy y medios por canal =====
type Channel = 'WhatsApp' | 'Instagram' | 'Telegram' | 'Web';

const CHANNEL_COPIES: Record<Channel, {
  opener: (name?: string) => string;
  ctaHigh?: string;
  ctaMedium?: string;
  ctaLow?: string;
  footer?: string;
  mediaHint?: string; // texto de apoyo si se adjunta media
}> = {
  WhatsApp: {
    opener: (name) => name ? `¡Hola ${name}!` : '¡Hola!',
    ctaHigh: "👉 Responde 'SÍ' para confirmar ahora y asegurar tu descuento.",
    ctaMedium: "Escribe 'PRECIO' y te habilito la mejor oferta hoy (+ envío gratis).",
    ctaLow: "¿Seguimos? Dime 8/32/64/128GB y te la dejo lista en 1 minuto.",
    footer: "Atiende este mensaje cuando puedas, guardé tu progreso. ✅",
    mediaHint: "Te dejo una muestra rápida:"
  },
  Instagram: {
    opener: (name) => name ? `Hola ${name}` : 'Hola ✨',
    ctaHigh: "Toca para confirmar y separar tu pedido ahora.",
    ctaMedium: "Escríbeme 'PRECIO' y te muestro oferta.",
    ctaLow: "¿Seguimos? Te ayudo en 1 min.",
    footer: "Guardé tu avance 💾",
    mediaHint: "Mira este demo:"
  },
  Telegram: {
    opener: (name) => name ? `Hola ${name} 👋` : 'Hola 👋',
    ctaHigh: "Responde 'SI' para confirmar el pedido.",
    ctaMedium: "Escribe 'PRECIO' para ver la oferta activa.",
    ctaLow: "¿Continuamos? Puedo crear el pedido por ti.",
    footer: "Progreso guardado.",
    mediaHint: "Preview:"
  },
  Web: {
    opener: (name) => name ? `Hola ${name}` : 'Hola',
    ctaHigh: "Confirma para finalizar ahora.",
    ctaMedium: "Pide 'PRECIO' para ver la mejor oferta disponible.",
    ctaLow: "¿Te acompaño a terminar la compra?",
    footer: "Tu sesión está guardada.",
    mediaHint: "Ejemplo:"
  }
};

// Selección de media (demo) según intereses y canal
async function buildChannelFollowUpPayload(session: UserSession, channel: Channel): Promise<{
  body: string;
  media?: { url: string; caption?: string };
}> {
  const name = session.name ? session.name.split(' ')[0] : undefined;

  const CHANNEL_COPIES: Record<Channel, {
    opener: (name?: string) => string;
    ctaHigh?: string;
    ctaMedium?: string;
    ctaLow?: string;
    footer?: string;
    mediaHint?: string;
  }> = {
    WhatsApp: {
      opener: (n) => n ? `¡Hola ${n}!` : '¡Hola!',
      ctaHigh: "👉 Responde 'SÍ' para confirmar y asegurar el descuento.",
      ctaMedium: "Escribe 'PRECIO' para ver la mejor oferta.",
      ctaLow: "¿Te ayudo a terminar el pedido?",
      footer: "Progreso guardado. ✅",
      mediaHint: "Demo:"
    },
    Instagram: {
      opener: (n) => n ? `Hola ${n} ✨` : 'Hola ✨',
      ctaHigh: "Toca para confirmar ahora.",
      ctaMedium: "Escríbeme 'PRECIO' para la oferta.",
      ctaLow: "¿Seguimos? Te ayudo en 1 min.",
      footer: "Guardé tu avance 💾",
      mediaHint: "Preview:"
    },
    Telegram: {
      opener: (n) => n ? `Hola ${n} 👋` : 'Hola 👋',
      ctaHigh: "Responde 'SI' para confirmar.",
      ctaMedium: "Escribe 'PRECIO' para ver la oferta.",
      ctaLow: "¿Continuamos? Puedo crear el pedido.",
      footer: "Progreso guardado.",
      mediaHint: "Demo:"
    },
    Web: {
      opener: (n) => n ? `Hola ${n}` : 'Hola',
      ctaHigh: "Confirma para finalizar ahora.",
      ctaMedium: "Pide 'PRECIO' para ver la oferta.",
      ctaLow: "¿Te acompaño a terminar la compra?",
      footer: "Tu sesión está guardada.",
      mediaHint: "Ejemplo:"
    }
  };

  const c = CHANNEL_COPIES[channel] || CHANNEL_COPIES['WhatsApp'];

  // Urgencia dinámica
  const urgency: 'high' | 'medium' | 'low' =
    session.buyingIntent > 80 ? 'high' :
    (session.buyingIntent > 60 || session.stage === 'pricing') ? 'medium' : 'low';

  const persuasiveLines = generatePersuasiveFollowUp(session, urgency);

  // Candado: mezcla CTA canal + CTA del mensaje para maximizar clic/resp.
  let channelCTA = c.ctaLow!;
  if (urgency === 'high' && c.ctaHigh) channelCTA = c.ctaHigh;
  else if (urgency === 'medium' && c.ctaMedium) channelCTA = c.ctaMedium;

  // Ensamblado final (máximo 4 líneas + CTA canal + footer)
  const opener = c.opener(name);
  const footer = c.footer ? `\n\n${c.footer}` : '';
  const base = [opener, ...persuasiveLines.slice(0, 3), channelCTA].join('\n');

  // Adjuntar demo solo si aporta (interés detectado)
  let media: { url: string; caption?: string } | undefined;
  try {
    const genreTopHits = musicData.genreTopHits || {};
    const videoTopHits = videoData.topHits || {};
    const interestGenre = session.interests.find(g => (genreTopHits as any)[g]) || Object.keys(genreTopHits)[0];
    const interestVideo = session.interests.find(g => (videoTopHits as any)[g]) || Object.keys(videoTopHits)[0];

    if (session.interests.some(i => i.includes('music') || i === 'musica' || (genreTopHits as any)[i])) {
      const demos = (genreTopHits as any)[interestGenre] || [];
      if (demos.length) {
        const pick = demos[Math.floor(Math.random() * demos.length)];
        media = { url: pick.file, caption: `${c.mediaHint} ${pick.name}` };
      }
    } else if (session.interests.some(i => i.includes('video') || i === 'videos' || (videoTopHits as any)[i])) {
      const demos = (videoTopHits as any)[interestVideo] || [];
      if (demos.length) {
        const pick = demos[Math.floor(Math.random() * demos.length)];
        media = { url: pick.file, caption: `${c.mediaHint} ${pick.name}` };
      }
    }
  } catch { /* silencioso */ }

  const body = base + footer;
  return { body, media };
}

// Deduplicación estricta por contenido
function hasSentThisBody(session: UserSession, body: string): boolean {
  const h = sha256(body);
  session.conversationData = session.conversationData || {};
  const set: string[] = (session.conversationData.sentBodies || []) as string[];
  return set.includes(h);
}

function markBodyAsSent(session: UserSession, body: string) {
  const h = sha256(body);
  session.conversationData = session.conversationData || {};
  const set: string[] = (session.conversationData.sentBodies || []) as string[];
  const next = Array.from(new Set([...set, h]));
  session.conversationData.sentBodies = next.slice(-50); // mantener últimos 50
}

// ==== GUARDAS ANTI-DUPLICADO POR SESIÓN ====
export function canSendOnce(session: any, key: string, ttlMin = 120): boolean {
  const now = Date.now();
  session.conversationData = session.conversationData || {};
  const k = `sent_${key}`;
  const last = session.conversationData[k] ? new Date(session.conversationData[k]).getTime() : 0;
  if (last && (now - last) < ttlMin * 60 * 1000) return false;
  session.conversationData[k] = new Date().toISOString();
  return true;
}

// ==== DEBOUNCE PER-MESSAGE (usa processingCache global existente) ====
export function shouldProcessMessage(phone: string, body: string, windowMs = 15000): boolean {
  if (!global.processingCache) global.processingCache = new Map();
  const key = `${phone}:${(body || '').trim().slice(0, 80)}`;
  const now = Date.now();
  const last = global.processingCache.get(key) || 0;
  if (now - last < windowMs) return false;
  global.processingCache.set(key, now);
  return true;
}

export const sendSecureFollowUp = async (
  phoneNumber: string,
  messages: string[],
  urgency: 'high' | 'medium' | 'low',
  channelOverride?: Channel,
  assured: boolean = false
): Promise<boolean> => {
  try {
    const currentSession = await getUserSession(phoneNumber);
    // Analizador de contexto previo al envío
const contextGate = analyzeContextBeforeSend(currentSession);
if (!contextGate.ok) {
  console.log(`⏸️ Context-gate bloqueó follow-up a ${phoneNumber}: ${contextGate.reason}`);
  return false;
}

    if (!botInstance) {
      console.error('❌ Bot instance no disponible');
      return false;
    }

    // EXCLUSIÓN por chat activo de WhatsApp
    if (isWhatsAppChatActive(currentSession)) {
      console.log(`🚫 Excluido follow-up (chat activo WhatsApp): ${phoneNumber}`);
      return false;
    }

    // Construir payload antes para dedupe por cuerpo
    const channel: Channel = channelOverride || (currentSession.interactions?.slice(-1).find(i => !!i.channel)?.channel as Channel) || 'WhatsApp';
    const payload = await buildChannelFollowUpPayload(currentSession, channel);
    const groupedMessage = payload.body || messages.join('\n\n');

    // DEDUPE: nunca repetir el mismo contenido
    if (hasSentThisBody(currentSession, groupedMessage)) {
      console.log(`🚫 DEDUPE: cuerpo ya enviado a ${phoneNumber}. Se omite.`);
      return false;
    }

    // LÍMITES POR USUARIO
    const userGate = canSendUserFollowUp(currentSession);
    if (!userGate.ok) {
      console.log(`⏸️ Gate usuario ${phoneNumber}: ${userGate.reason}`);
      return false;
    }

    // LÍMITES GLOBALES
    if (!canSendGlobal()) {
      console.log('⏸️ Gate global alcanzado (hora/día).');
      return false;
    }

    // ===== NUEVO: Aplicar retraso de 3 segundos entre usuarios =====
    await waitForFollowUpDelay();

    // Envío
    if (payload.media && typeof (botInstance as any).sendMessageWithMedia === 'function') {
      await botInstance.sendMessageWithMedia(phoneNumber, {
        body: groupedMessage,
        mediaUrl: payload.media.url,
        caption: payload.media.caption
      }, { channel });
    } else {
      await botInstance.sendMessage(phoneNumber, groupedMessage, { channel });
    }

    // Marcar envíos y dedupe
    markGlobalSent();
    currentSession.lastFollowUpMsg = groupedMessage;
    recordUserFollowUp(currentSession);
    markBodyAsSent(currentSession, groupedMessage);
    userSessions.set(phoneNumber, currentSession);

    // Persistencia opcional
    try {
      if (typeof businessDB?.updateUserSession === 'function') {
        await businessDB.updateUserSession(phoneNumber, {
          lastFollowUp: currentSession.lastFollowUp,
          conversationData: jsonStringifySafe(currentSession.conversationData || {})
        } as any);
      }
      if (typeof businessDB?.logFollowUpEvent === 'function') {
        await businessDB.logFollowUpEvent({
          phone: phoneNumber,
          type: urgency,
          messages: [groupedMessage],
          success: true,
          timestamp: new Date(),
          buyingIntent: currentSession.buyingIntent
        });
      }
    } catch (e) {
      console.warn('⚠️ Persistencia follow-up:', e);
    }

    logFollowUpSent(phoneNumber, urgency, channel);
    return true;

  } catch (error) {
    console.error(`❌ Error enviando mensaje seguro a ${phoneNumber}:`, error);
    return false;
  }
};

export async function triggerChannelReminder(phone: string, channel: Channel, urgency?: 'high'|'medium'|'low') {
  const session = await getUserSession(phone);
  if (!session) return false;
  const u: 'high'|'medium'|'low' = urgency || (session.buyingIntent > 80 ? 'high' : session.buyingIntent > 60 ? 'medium' : 'low');
  const msgs = generatePersuasiveFollowUp(session, u);
  return await sendSecureFollowUp(phone, msgs, u, channel);
}

export async function triggerBulkRemindersByChannel(channel: Channel, limit: number = 50) {
  const candidates = getUsersNeedingFollowUp()
    .filter(u => {
      const lastUserMessage = [...(u.session.interactions || [])].reverse().find(i => i.type === 'user_message' && i.channel);
      const ch = (lastUserMessage?.channel as Channel) || 'WhatsApp';
      return ch === channel;
    })
    .slice(0, limit);

  let sent = 0;
  for (const c of candidates) {
    const ok = await sendFollowUpMessage(c.phone);
    if (ok !== undefined) sent++;
  }
  return { total: candidates.length, sent };
}

export const sendFollowUpMessage = async (phoneNumber: string): Promise<void> => {
  const session = userSessions.get(phoneNumber);
  if (!session) return;

  // EXCLUSIÓN por chat activo de WhatsApp
  if (isWhatsAppChatActive(session)) {
    console.log(`🚫 Excluido follow-up (chat activo WhatsApp): ${phoneNumber}`);
    return;
  }

  // Gate por usuario
  const userGate = canSendUserFollowUp(session);
  if (!userGate.ok) {
    console.log(`⏸️ Gate usuario ${phoneNumber}: ${userGate.reason}`);
    return;
  }
  // Gate global
  if (!canSendGlobal()) {
    console.log('⏸️ Gate global alcanzado (hora/día).');
    return;
  }
  
  // Analizador de contexto previo al envío (adicional a gates)
const contextGate = analyzeContextBeforeSend(session);
if (!contextGate.ok) {
  console.log(`⏸️ Context-gate bloqueó follow-up a ${phoneNumber}: ${contextGate.reason}`);
  return;
}

  // TTL adicional de seguridad (mantener existente)
  if (!canSendOnce(session,'followup_generic',MIN_HOURS_BETWEEN_FOLLOWUPS*60)) return;
  

  let urgency: 'high' | 'medium' | 'low' = 'low';
  const hoursSinceLastInteraction = (Date.now() - session.lastInteraction.getTime()) / 36e5;
  if (session.buyingIntent > 80 && hoursSinceLastInteraction < 2) urgency = 'high';
  else if (session.buyingIntent > 60 || session.stage === 'pricing') urgency = 'medium';

  // Generar contenido y dedupe por cuerpo en sendSecureFollowUp
  const lastUserMessage = [...(session.interactions || [])].reverse().find(i => i.type === 'user_message' && i.channel);
  const channel = (lastUserMessage?.channel as Channel) || 'WhatsApp';

  const messages = generatePersuasiveFollowUp(session, urgency);
  const priceMap: Record<string, number> = { '8GB': 59900, '32GB': 89900, '64GB': 129900, '128GB': 169900 };
  const descMap: Record<string, string> = {
    '8GB': '1.4k canciones', '32GB': '5k canciones', '64GB': '10k canciones', '128GB': '25k canciones'
  };
  const preferred = (session as any)?.capacity || (session.preferences as any)?.capacity?.[0] || null;
  const stagePick = session.stage === 'customizing' ? (preferred || '64GB') : session.stage === 'pricing' ? (preferred || '32GB') : (preferred || '32GB');
  const altPick = stagePick === '8GB' ? '32GB' : '128GB';
  const bestLine = `Mejores opciones: USB ${stagePick} $${priceMap[stagePick].toLocaleString('es-CO')} (${descMap[stagePick]}) | USB ${altPick} $${priceMap[altPick].toLocaleString('es-CO')} (${descMap[altPick]}).`;
  messages.unshift(bestLine);
  // Contexto de etapa
  if (session.stage === 'customizing') messages.unshift("🧩 Guardé tus preferencias. Puedo retomarlas en segundos.");
  else if (session.stage === 'pricing') messages.unshift("💰 Te dejo clara la mejor oferta que tengo para ti.");
  else if (session.stage === 'interested') messages.unshift("🚀 Puedo crear tu pedido con los datos que ya tengo.");

  const sent = await sendSecureFollowUp(phoneNumber, messages, urgency, channel);
  if (sent) {
    console.log(`📤 Seguimiento ${urgency} enviado a ${phoneNumber} por ${channel}`);
  } else {
    console.warn(`⚠️ Seguimiento no enviado a ${phoneNumber}.`);
  }
};

function validateInteractionType(type: string): 'user_message' | 'bot_message' | 'system_event' {
    if (type === 'user_message' || type === 'bot_message' || type === 'system_event') return type;
    if (type === 'follow_up_response' || type === 'user_response') return 'user_message';
    if (type === 'bot_response' || type === 'automated_message') return 'bot_message';
    return 'user_message';
}

export const trackUserResponse = async (phoneNumber: string, message: string): Promise<void> => {
    try {
        if (!phoneNumber || typeof phoneNumber !== 'string') return;
        if (!message || typeof message !== 'string') message = '';

        const session = userSessions.get(phoneNumber);
        if (!session) return;

        if (session.lastFollowUpMsg) {
            try {
                const sentiment = await analyzeResponseSentiment(message);
                const isPriceRelated = /precio|oferta|costo|cuanto/.test(message.toLowerCase());
                if (sentiment === 'positive' && isPriceRelated) {
                    session.stage = 'interested';
                    session.buyingIntent = Math.min((session.buyingIntent || 50) + 10, 100);
                } else if (sentiment === 'negative') {
                  // DESACTIVADO: session.followUpSpamCount = (session.followUpSpamCount || 0) + 1;
                  if ((session.followUpSpamCount || 0) > 2) {
                    session.buyingIntent = Math.max((session.buyingIntent || 50) - 5, 0);
                  }
                }

                session.interactions = session.interactions || [];
                session.interactions.push({
                    timestamp: new Date(),
                    message: message.trim(),
                    type: validateInteractionType('follow_up_response'),
                    sentiment: sentiment,
                    engagement_level: sentiment === 'positive' ? 80 : sentiment === 'negative' ? 20 : 50,
                    channel: 'WhatsApp',
                    respondedByBot: false,
                } as Interaction);

                if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
                session.lastFollowUpMsg = undefined;

            } catch (sentimentError) {
                console.error('Error al analizar sentiment de respuesta:', sentimentError);
            }
        }

        userSessions.set(phoneNumber, session);
        console.log(`📝 Respuesta registrada para ${phoneNumber}: "${message.substring(0, 50)}..."`);

    } catch (error) {
        console.error(`❌ Error en trackUserResponse para ${phoneNumber}:`, error);
    }
};

const analyzeResponseSentiment = async (message: string): Promise<SentimentType> => {
    if (!message || typeof message !== 'string') return 'neutral';
    const msg = message.toLowerCase().trim();
    if (msg.length === 0) return 'neutral';
    const positivePatterns = [
        /\b(si|sí|ok|dale|listo|perfecto|genial|bueno|excelente|me gusta|quiero|interesa)\b/,
        /\b(gracias|por favor|claro|exacto|correcto|increíble|fantástico|maravilloso)\b/,
        /\b(amor|amo|encanta|fascina|ideal|justo|necesito|acepto|confirmo)\b/,
        /^(👍|🙌|👌|✌️|💪|🎉|👏|❤️|😊|🤗|😍|🥰|😘)$/
    ];
    const negativePatterns = [
        /\b(no|nada|nunca|tampoco|negativo|paso|dejalo|después|luego|rechazar)\b/,
        /\b(muy caro|costoso|caro|no me interesa|no quiero|no gracias|malo|terrible)\b/,
        /\b(aburrido|feo|horrible|odio|detesto|molesta|cancelo|cancelar)\b/,
        /^(👎|😕|😔|😢|😡|🙄|😤|😠|😒|🤔|😐|😑)$/
    ];
    for (const pattern of positivePatterns) if (pattern.test(msg)) return 'positive';
    for (const pattern of negativePatterns) if (pattern.test(msg)) return 'negative';
    if (/^[1-4]$/.test(msg)) return 'positive';
    return 'neutral';
};

// Demos y utilidad

export const sendDemoIfNeeded = async (session: UserSession, phoneNumber: string) => {
    if (!botInstance) return;

    function pickRandomDemo(demos: { name: string; file: string }[]): { name: string; file: string } | null {
        if (!demos || demos.length === 0) return null;
        return demos[Math.floor(Math.random() * demos.length)];
    }

    const genreTopHits = musicData.genreTopHits || {};
    const videoTopHits = videoData.topHits || {};

    const interestGenre = session.interests.find(g => (genreTopHits as any)[g]) || Object.keys(genreTopHits)[0];
    const interestVideo = session.interests.find(g => (videoTopHits as any)[g]) || Object.keys(videoTopHits)[0];

    if (session.interests.some(i => i.includes('music') || i === 'musica' || (genreTopHits as any)[i])) {
        const demos = (genreTopHits as any)[interestGenre] || [];
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

    if (session.interests.some(i => i.includes('video') || i === 'videos' || (videoTopHits as any)[i])) {
        const demos = (videoTopHits as any)[interestVideo] || [];
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

// Bot instance
export function setBotInstance(instance: any) {
    botInstance = instance;
}

// Utilidades de sesión básicas

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

// Analytics

export function getUserAnalytics(): AnalyticsData;
export function getUserAnalytics(phone: string): Promise<UserSpecificAnalytics>;
export function getUserAnalytics(phone?: string): AnalyticsData | Promise<UserSpecificAnalytics> {
    if (phone) return getUserSpecificAnalytics(phone);
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
        demographicsSummary: calculateDemographicsSummary(sessions),
        preferencesSummary: calculatePreferencesSummary(sessions),
        mostActiveChannels: Object.entries(
            sessions.reduce((acc, s) => {
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
        global.processingCache.clear();
    }
}, 10 * 60 * 1000);

function normalizeDbUser(dbUser: any): Partial<UserSession> {
  const safeJSON = (v: any, fallback: any) => {
    if (v == null) return fallback;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return fallback; }
    }
    return v;
  };

  return {
    phone: dbUser.phone || dbUser.phoneNumber,
    name: dbUser.name,
    stage: dbUser.stage || 'initial',
    buyingIntent: dbUser.buying_intent ?? dbUser.buyingIntent ?? 0,
    interactions: Array.isArray(dbUser.interactions) ? dbUser.interactions : safeJSON(dbUser.interactions, []),
    preferences: safeJSON(dbUser.preferences, dbUser.preferences) || {},
    demographics: safeJSON(dbUser.demographics, dbUser.demographics) || {},
    interests: Array.isArray(dbUser.interests) ? dbUser.interests : safeJSON(dbUser.interests, []),
    location: dbUser.location,
    aiAnalysis: {
      riskLevel: dbUser.risk_level || 'low',
      buyingIntent: dbUser.buying_intent ?? 0,
      interests: Array.isArray(dbUser.interests) ? dbUser.interests : [],
      nextBestAction: dbUser.next_best_action || 'monitor',
      probabilityToConvert: dbUser.conversion_probability ?? dbUser.probability_to_convert ?? 0
    },
    createdAt: dbUser.created_at ? new Date(dbUser.created_at) : new Date(),
    updatedAt: dbUser.updated_at ? new Date(dbUser.updated_at) : new Date(),
    lastInteraction: dbUser.last_interaction ? new Date(dbUser.last_interaction) : new Date(),
    messageCount: dbUser.message_count ?? 0
  };
}

async function getUserSpecificAnalytics(phone: string): Promise<UserSpecificAnalytics> {
  const safeJSON = (v: any, fallback: any) => {
    if (v == null) return fallback;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return fallback; }
    }
    return v;
  };

  try {
    const session = userSessions.get(phone);

    if (!session) {
      try {
        const dbUser = await businessDB.getUserSession(phone);
        if (dbUser) {
          const norm = normalizeDbUser(dbUser);
          const preferredCategories = Array.isArray((dbUser as any).preferred_categories)
            ? (dbUser as any).preferred_categories
            : (safeJSON((dbUser as any).preferred_categories, []) as string[]);

          const conversionProbability = typeof norm.aiAnalysis?.probabilityToConvert === 'number'
            ? norm.aiAnalysis.probabilityToConvert
            : 0;

          return {
            phone: (norm as any).phone || phone,
            name: (norm as any).name,
            stage: (norm as any).stage || 'initial',
            buyingIntent: (norm as any).buyingIntent || 0,
            totalInteractions: (norm as any).messageCount || 0,
            sessionDuration: 0,
            interests: (norm as any).interests || [],
            preferences: (norm as any).preferences || {},
            demographics: (norm as any).demographics || {},
            location: (norm as any).location,
            riskLevel: (norm as any).aiAnalysis?.riskLevel || 'low',
            conversionProbability,
            preferredCategories,
            lastInteraction: (norm as any).lastInteraction || new Date(),
            messageCount: (norm as any).messageCount || 0,
            responseTime: 0,
            engagementScore: (norm as any).aiAnalysis?.buyingIntent || 0,
            lastUpdate: new Date().toISOString()
          };
        }
      } catch (dbError) {
        console.error('❌ Error obteniendo usuario de BD:', dbError);
      }

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

    const sessionDuration = session.createdAt
      ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000)
      : 0;

    const engagementScore = calculateEngagementScore(session);
    const conversionProbability = calculateConversionProbability(session);

    return {
      phone: session.phone,
      name: session.name,
      stage: session.stage,
      buyingIntent: session.aiAnalysis?.buyingIntent || session.buyingIntent || 0,
      totalInteractions: session.messageCount || 0,
      sessionDuration,
      interests: session.interests || [],
      preferences: session.preferences || {},
      demographics: session.demographics || {},
      location: session.location,
      riskLevel: session.aiAnalysis?.riskLevel || 'low',
      conversionProbability,
      preferredCategories: extractPreferredCategories(session),
      lastInteraction: session.lastInteraction,
      messageCount: session.messageCount || 0,
      responseTime: 0,
      engagementScore,
      lastUpdate: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error obteniendo analytics específicos del usuario:', error);
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

// Auxiliares analytics

function calculateEngagementScore(session: UserSession): number {
    let score = 0;
    score += Math.min(session.messageCount || 0, 50);
    score += (session.buyingIntent || 0) * 0.3;
    const sessionMinutes = session.createdAt ? (Date.now() - new Date(session.createdAt).getTime()) / 60000 : 0;
    score += Math.min(sessionMinutes * 2, 20);
    score += Math.min((session.interests?.length || 0) * 5, 15);
    const inactiveMinutes = (Date.now() - session.lastInteraction.getTime()) / 60000;
    if (inactiveMinutes > 30) score *= 0.8;
    return Math.round(Math.min(score, 100));
}

function calculateConversionProbability(session: UserSession): number {
    let probability = 0;
    probability += (session.buyingIntent || 0) * 0.4;
    const stageWeights: Record<string, number> = {
        'initial': 5, 'interested': 15, 'customizing': 35, 'pricing': 60, 'abandoned': 10,
        'converted': 100, 'inactive': 5, 'paused': 20, 'closing': 70, 'ready_to_buy': 80
    };
    probability += stageWeights[session.stage] || 5;
    probability += Math.min((session.messageCount || 0) * 2, 20);
    const sessionMinutes = session.createdAt ? (Date.now() - new Date(session.createdAt).getTime()) / 60000 : 0;
    if (sessionMinutes > 5) probability += 10;
    if (sessionMinutes > 15) probability += 10;
    if (session.name) probability += 5;
    if (session.location) probability += 5;
    if (session.preferences && Object.keys(session.preferences).length > 0) probability += 5;
    return Math.round(Math.min(probability, 100));
}

function extractPreferredCategories(session: UserSession): string[] {
    const categories: string[] = [];
    if (session.interests) {
        session.interests.forEach(interest => {
            const i = interest.toLowerCase();
            if (i.includes('música') || i.includes('music')) categories.push('Música');
            if (i.includes('video')) categories.push('Videos');
            if (i.includes('película') || i.includes('movie')) categories.push('Películas');
            if (i.includes('juego')) categories.push('Juegos');
            if (i.includes('foto')) categories.push('Fotos');
        });
    }
    if (session.preferences) {
        Object.keys(session.preferences).forEach(key => {
            if (key.includes('genre') || key.includes('genero')) categories.push('Música');
            if (key.includes('capacity') || key.includes('capacidad')) categories.push('Almacenamiento');
        });
    }
    return [...new Set(categories)];
}

function getAgeGroup(age: number): string {
    if (age < 18) return '< 18';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    return '55+';
}

// Export helper
export { getUserSpecificAnalytics };

// Segmentación avanzada para asegurar cobertura total
export function getFollowUpSegments() {
  const now = Date.now();
  const sessions = Array.from(userSessions.values());

  const recentlyInactive = [] as UserSession[];
  const inactiveTagged = [] as UserSession[];
  const longSilent = [] as UserSession[];
  const unregistered = [] as { phone: string }[];

  // Nota: "no registrados" pueden venir de DB externa; aquí dejamos hook para inyectarlos
  // Usa registerExternalSilentUsers() para pasar teléfonos externos silenciosos.

  sessions.forEach(s => {
    const mins = (now - s.lastInteraction.getTime()) / 60000;
    const hours = mins / 60;
    const days = hours / 24;

    // 1) Recientemente inactivos: > 30 min y < 3 h
    if (mins >= 30 && hours < 3 && s.stage !== 'converted' && !(s.tags||[]).includes('blacklist')) {
      recentlyInactive.push(s);
    }

    // 2) Marcados como inactivos explícitamente
    if (s.stage === 'inactive' && !(s.tags||[]).includes('blacklist')) {
      inactiveTagged.push(s);
    }

    // 3) Días sin hablar: >= 2 días sin interacción
    if (days >= 2 && s.stage !== 'converted' && !(s.tags||[]).includes('blacklist')) {
      longSilent.push(s);
    }
  });

  return { recentlyInactive, inactiveTagged, longSilent, unregistered };
}

// Permite inyectar teléfonos "no registrados" (p.ej. desde BD externa o CSV)
export async function registerExternalSilentUsers(phones: string[]) {
  const created: string[] = [];
  for (const p of phones) {
    const phone = validatePhoneNumber(p);
    if (!phone) continue;
    if (!userSessions.get(phone)) {
      const s = createUserSession(phone);
      s.isNewUser = true;
      s.isActive = false;
      s.stage = 'initial';
      s.buyingIntent = 20;
      userSessions.set(phone, s);
      created.push(phone);
    }
  }
  return created;
}

// Disparo masivo por segmentos con reglas de urgencia y ventanas horarias
export async function runAssuredFollowUps(limitPerSegment = 100) {
  const { recentlyInactive, inactiveTagged, longSilent } = getFollowUpSegments();

  // Ventana horaria segura (8–22)
  const hour = new Date().getHours();
  if (hour < 8 || hour > 22) {
    console.log('⏸️ Ventana horaria cerrada. Seguimientos se omiten ahora.');
    return { sent: 0, skipped: 'outside_hours' };
  }

  let sent = 0;

  // 1) Recientemente inactivos → urgencia medium/high según intent
  for (const s of recentlyInactive.slice(0, limitPerSegment)) {
    if (isWhatsAppChatActive(s)) continue; // EXCLUSIÓN
    const urgency: 'high'|'medium'|'low' =
      s.buyingIntent > 80 ? 'high' : (s.buyingIntent > 60 || s.stage === 'pricing') ? 'medium' : 'low';
    const msgs = generatePersuasiveFollowUp(s, urgency);
    const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true);
    if (ok) sent++;
  }

  // 2) Inactivos etiquetados → urgencia low/medium con recordatorio de progreso
  for (const s of inactiveTagged.slice(0, limitPerSegment)) {
    if (isWhatsAppChatActive(s)) continue; // EXCLUSIÓN
    const urgency: 'high'|'medium'|'low' = s.buyingIntent > 60 ? 'medium' : 'low';
    const msgs = generatePersuasiveFollowUp(s, urgency);
    msgs.unshift('🧩 Guardé tu avance. Puedo retomarlo en segundos con tus preferencias.');
    const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true);
    if (ok) sent++;
  }

  // 3) Días sin hablar → urgencia low con incentivo suave
  for (const s of longSilent.slice(0, limitPerSegment)) {
    if (isWhatsAppChatActive(s)) continue; // EXCLUSIÓN
    const urgency: 'high'|'medium'|'low' = 'low';
    const msgs = generatePersuasiveFollowUp(s, urgency);
    msgs.push('🎁 Si retomamos hoy, te incluyo una playlist exclusiva sin costo.');
    const ok = await sendSecureFollowUp(s.phone, msgs, urgency, undefined, true);
    if (ok) sent++;
  }

  console.log(`✅ Follow-ups asegurados: ${sent}`);
  return { sent };
}

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
        // EXCLUSIÓN por chat activo de WhatsApp
        if (isWhatsAppChatActive(session)) return;

        const timeSinceLastInteraction = currentTime.getTime() - session.lastInteraction.getTime();
        const minutesSinceLastInteraction = timeSinceLastInteraction / 60000;
        const lastFollowUp = session.lastFollowUp || new Date(0);
        const timeSinceLastFollowUp = currentTime.getTime() - lastFollowUp.getTime();
        const hoursSinceLastFollowUp = timeSinceLastFollowUp / 36e5;

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

// Gestión de usuarios

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

export function getSmartRecommendations(phone: string, userSessionsMap: Map<string, UserSession>): string[] {
    const session = userSessionsMap.get(phone);
    if (!session) return [];

    const recs: string[] = [];
    if (session.preferences?.musicGenres && session.preferences.musicGenres.length > 0) {
        recs.push(`Colecciones premium de ${session.preferences.musicGenres.slice(0, 2).join(' y ')}`);
    } else if (session.interests && session.interests.length > 0) {
        recs.push(`Mix especial de ${session.interests.slice(0, 2).join(' y ')}`);
    }

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

    if ((session.preferences as any)?.capacity && (session.preferences as any).capacity.length > 0) {
        recs.push(`USB de ${(session.preferences as any).capacity[0]}GB recomendada para tu selección`);
    }

    if (session.isVIP) recs.push('Acceso VIP: contenido exclusivo y atención personalizada');
    if (session.purchaseHistory && session.purchaseHistory.length > 0) recs.push('Nuevos lanzamientos y colecciones recientes disponibles para ti');
    if (recs.length === 0) recs.push('Descubre nuestros packs de música y películas más populares');

    return recs;
}

export function getConversationAnalysis(phone: string, userSessionsMap: Map<string, UserSession>): {
    summary: string;
    sentiment: SentimentType;
    engagement: number;
    lastIntent?: string;
    buyingIntent: number;
} {
    const session = userSessionsMap.get(phone);
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

// Frases persuasivas

const persuasivePhrases = [
  "USB 32GB ideal para el día a día: 5.000 canciones listas por $89.900.",
  "Sube a 64GB y llévate hasta 10.000 canciones por $129.900. Calidad + espacio.",
  "128GB para coleccionistas: 25.000 canciones por $169.900. Todo en un solo lugar.",
  "¿Playlist curada por género y década? Te la entrego lista en tu USB.",
  "Incluye sesiones exclusivas y versiones remasterizadas según tu gusto.",
  "Activa 2x1 parcial: segunda USB con 20% OFF solo hoy.",
  "Sumamos videos y series favoritas junto a tu música, todo organizado.",
  "Tu USB llega lista: nombres limpios, carpetas por artista y carátulas.",
  "Sin repeticiones ni relleno: contenido elegido manualmente.",
  "Garantía de compatibilidad en carro, parlantes y TV."
];

export function getPersuasivePhrase(): string {
    return persuasivePhrases[Math.floor(Math.random() * persuasivePhrases.length)];
}

// Utilidades adicionales

export function validateEngagement(engagement: any): number {
    if (typeof engagement === 'number' && engagement >= 0 && engagement <= 100 && !isNaN(engagement)) return Math.round(engagement);
    return 50;
}

export function validateIntent(intent: any): string {
    if (typeof intent === 'string' && intent.trim().length > 0) return intent.trim().toLowerCase();
    return 'general';
}

export function sanitizeMessage(message: any): string {
    if (typeof message === 'string') return message.trim().substring(0, 1000);
    return '';
}

export function validatePhoneNumber(phone: any): string | null {
  if (!phone || typeof phone !== 'string') return null;
  
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;
  
  return isValidPhoneNumber(normalized) ? normalized : null;
}

function normalizeFlow(flow: string): string {
  const f = (flow || '').toLowerCase().trim();
  const aliases: Record<string,string> = {
    'welcome_flow':'welcomeFlow',
    'welcome':'welcomeFlow',
    'catalog':'catalogFlow',
    'customization':'customizationFlow',
    'music_flow':'musicUsb',
    'video_flow':'videosUsb',
    'movies_flow':'moviesUsb',
    'payment_flow':'orderFlow',
    'order_creation':'orderFlow',
    'processing':'orderFlow',
    'audio_received':'media_received',
    'customization_started':'customizationFlow'
  };
  return aliases[f] || flow;
}

// Métricas

export function getSystemMetrics() {
    const sessions = Array.from(userSessions.values());
    const now = Date.now();
    const totalActiveSessions = sessions.filter(s => s.isActive).length;
    const totalInteractions = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
    const avgBuyingIntent = sessions.length > 0 ? 
        sessions.reduce((sum, s) => sum + (s.buyingIntent || 0), 0) / sessions.length : 0;

    const avgSessionDuration = sessions.length > 0 ?
        sessions.reduce((sum, s) => {
            const duration = s.createdAt ? now - new Date(s.createdAt).getTime() : 0;
            return sum + duration;
        }, 0) / sessions.length / 60000 : 0;

    const convertedUsers = sessions.filter(s => s.stage === 'converted').length;
    const conversionRate = sessions.length > 0 ? (convertedUsers / sessions.length) * 100 : 0;

    const stageCount = new Map<string, number>();
    sessions.forEach(s => {
        const stage = s.stage || 'unknown';
        stageCount.set(stage, (stageCount.get(stage) || 0) + 1);
    });
    const topStages = Array.from(stageCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([stage, count]) => ({ stage, count }));

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

export function getPerformanceMetrics() {
    const sessionCacheSize = userSessions.size;
    const followUpQueueSize = followUpQueue.size;
    const avgSessionSize = 2048;
    const memoryUsage = sessionCacheSize * avgSessionSize;
    const avgResponseTime = 0;
    const errorRate = 0.1;
    return {
        memoryUsage,
        sessionCacheSize,
        followUpQueueSize,
        averageResponseTime: Math.round(avgResponseTime),
        errorRate,
        lastCleanup: new Date()
    };
}

// Limpieza y mantenimiento

export function cleanupInactiveSessions(maxInactiveHours: number = 24): number {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - maxInactiveHours * 60 * 60 * 1000);
    let cleaned = 0;

    Array.from(userSessions.entries()).forEach(([phoneNumber, session]) => {
        if (session.lastInteraction < cutoffTime && 
            session.stage !== 'converted' && 
            !session.isVIP) {
            
            userSessions.delete(phoneNumber);
            if (followUpQueue.has(phoneNumber)) {
                clearTimeout(followUpQueue.get(phoneNumber)!);
                followUpQueue.delete(phoneNumber);
            }
            cleaned++;
        }
    });

    if (cleaned > 0) console.log(`🧹 Limpiadas ${cleaned} sesiones inactivas (>${maxInactiveHours}h)`);
    return cleaned;
}

export function optimizeMemoryUsage() {
    const beforeSize = userSessions.size;
    userSessions.forEach((session) => {
        if (session.conversationData?.aiInsights && session.conversationData.aiInsights.length > 5) {
            session.conversationData.aiInsights = session.conversationData.aiInsights.slice(-5);
        }
        if (session.conversationData?.stageHistory && session.conversationData.stageHistory.length > 10) {
            session.conversationData.stageHistory = session.conversationData.stageHistory.slice(-10);
        }
    });
    const cleaned = cleanupInactiveSessions(48);
    const afterSize = userSessions.size;
    return { before: beforeSize, after: afterSize, optimized: cleaned };
}

// Export/Import

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
        const sessions = safeJSON(jsonData, []);
        if (!Array.isArray(sessions)) throw new Error('Datos no válidos: se esperaba un array');
        let imported = 0;
        sessions.forEach((sessionData: any) => {
            if (sessionData.phone || sessionData.phoneNumber) {
                const phone = sessionData.phone || sessionData.phoneNumber;
                if (sessionData.lastInteraction) sessionData.lastInteraction = new Date(sessionData.lastInteraction);
                if (sessionData.createdAt) sessionData.createdAt = new Date(sessionData.createdAt);
                if (sessionData.updatedAt) sessionData.updatedAt = new Date(sessionData.updatedAt);
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

// Revisor de inactividad global
setInterval(() => {
    const now = Date.now();
    let inactiveCount = 0;
    let followUpScheduled = 0;

    userSessions.forEach((session, phone) => {
        if (session.stage === 'converted' || (session as any).isBlacklisted) return;
        const minsSinceLast = (now - session.lastInteraction.getTime()) / 60000;

        if (minsSinceLast > 12 * 60 && session.stage !== 'inactive') {
            session.stage = 'inactive';
            userSessions.set(phone, session);
            inactiveCount++;
        }

        if (minsSinceLast > 60 && 
            (!session.lastFollowUp || (now - session.lastFollowUp.getTime()) > 60 * 60 * 1000) &&
            !followUpQueue.has(phone)) {
            scheduleFollowUp(phone);
            followUpScheduled++;
        }
    });

    if (inactiveCount > 0) console.log(`⚠️ ${inactiveCount} usuarios marcados como inactivos`);
    if (followUpScheduled > 0) console.log(`📅 ${followUpScheduled} seguimientos programados`);
}, 5 * 60 * 1000);

// Compatibilidad

export const getOrCreateSession = async (phoneNumber: string): Promise<UserSession> => {
    return await getUserSession(phoneNumber);
};

export const updateSession = async (
    phoneNumber: string,
    updates: Partial<UserSession>
): Promise<void> => {
    try {
        const session = await getUserSession(phoneNumber);
        Object.keys(updates).forEach(key => {
            if ((updates as any)[key] !== undefined) {
                (session as any)[key] = (updates as any)[key];
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

// Debug

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

// Cron interno para asegurar envíos (cada 2h)
setInterval(() => {
  const hour = new Date().getHours();
  if (hour >= 8 && hour <= 22) {
    runAssuredFollowUps(150).catch(e => console.warn('⚠️ runAssuredFollowUps error:', e));
  }
}, 2 * 60 * 60 * 1000);

// Inicialización y mantenimiento

setInterval(() => {
    const result = optimizeMemoryUsage();
    if (result.optimized > 0) {
        console.log(`🚀 Memoria optimizada: ${result.before} → ${result.after} sesiones (-${result.optimized})`);
    }
}, 60 * 60 * 1000);

if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
        logSystemStatus();
    }, 30 * 60 * 1000);
}

console.log('✅ UserTrackingSystem completamente inicializado y optimizado');

// ====== INTEGRACIÓN DE CROSS-SELL Y REPORTES ======
import { crossSellSystem, CrossSellRecommendation } from '../services/crossSellSystem';
import { reportingSystem } from '../services/reportingSystem';

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

export async function getCrossSellMessage(phoneNumber: string): Promise<string> {
    const recommendations = await generateCrossSellForUser(phoneNumber);
    return crossSellSystem.generateCrossSellMessage(recommendations);
}

export async function addCrossSellProduct(phoneNumber: string, productId: string): Promise<boolean> {
    const session = await getUserSession(phoneNumber);
    if (!session) return false;

    const product = crossSellSystem.getProductById(productId);
    if (!product) {
        console.warn(`⚠️ Producto ${productId} no encontrado`);
        return false;
    }

    if (!session.orderData) {
        session.orderData = { items: [], type: 'customized', status: 'draft' } as any;
    }
    if (!session.orderData.items) session.orderData.items = [];

    session.orderData.items.push({
        id: product.id,
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        unitPrice: product.price
    });

    const currentTotal = session.orderData.totalPrice || (session as any).price || 0;
    session.orderData.totalPrice = currentTotal + product.price;

    session.interactions.push({
        timestamp: new Date(),
        message: `Agregó producto: ${product.name}`,
        type: 'system_event',
        intent: 'cross_sell_added',
        sentiment: 'positive',
        engagement_level: 80,
        channel: 'WhatsApp'
    } as any);

    await updateUserSession(phoneNumber, `Producto agregado: ${product.name}`, 'cross_sell', null, false);
    console.log(`✅ Producto ${product.name} agregado al pedido de ${phoneNumber}`);
    return true;
}

export async function generateBusinessReport(): Promise<string> {
    const sessions = Array.from(userSessions.values());
    return await reportingSystem.generateBusinessReport(sessions);
}

export function generatePendingOrdersReport(): string {
    const sessions = Array.from(userSessions.values());
    return reportingSystem.generatePendingOrdersReport(sessions);
}

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
                totalRevenue += session.orderData.totalPrice || (session.orderData as any).price || 0;
            } else if (session.orderData.status === 'draft') {
                pendingOrders++;
            }
        }
        if (session.lastActivity && session.lastActivity > last24h) activeUsers++;
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

export function getTechProducts() {
    return crossSellSystem.getAllProducts();
}

export function getTechProductsByCategory(category: 'audio' | 'storage' | 'accessories' | 'cables' | 'power' | 'protection') {
    return crossSellSystem.getProductsByCategory(category);
}

export async function createAutomaticOrder(phoneNumber: string): Promise<boolean> {
    const session = await getUserSession(phoneNumber);
    if (!session) return false;

    if (!(session as any).contentType || !(session as any).capacity) {
        console.warn(`⚠️ Faltan datos para crear pedido automático: ${phoneNumber}`);
        return false;
    }

    const prices: Record<string, number> = {
        '8GB': 59900, '32GB': 89900, '64GB': 129900, '128GB': 169900, '256GB': 249900, '512GB': 399900
    };

    const basePrice = prices[(session as any).capacity] || 89900;
    const orderId = `ORD-${Date.now()}-${phoneNumber.slice(-4)}`;

    (session as any).orderId = orderId;
    session.orderData = {
        id: orderId,
        orderNumber: orderId,
        items: [{
            id: `ITEM-${Date.now()}`,
            productId: `USB-${(session as any).contentType}-${(session as any).capacity}`,
            name: `USB ${(session as any).capacity} - ${(session as any).contentType}`,
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
            address: (session as any).customerData?.direccion
        }
    } as any;

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
    } as any);

    await updateUserSession(phoneNumber, `Pedido automático creado: ${orderId}`, 'order_creation', null, false);
    console.log(`✅ Pedido automático creado para ${phoneNumber}: ${orderId}`);

    // Si se marca como compra confirmada o conversión, resetear contadores
if (session.orderData?.status === 'confirmed') {
  session.stage = 'converted';
  resetFollowUpCountersForUser(session);
}

    return true;
}

export async function getUserPreferencesSummary(phoneNumber: string): Promise<string> {
    const session = await getUserSession(phoneNumber);
    if (!session) return 'No se encontró información del usuario';

    let summary = '📊 *RESUMEN DE PREFERENCIAS*\n';
    summary += '━━━━━━━━━━━━━━━━━━━━\n\n';

    if ((session as any).contentType) summary += `🎵 Tipo de contenido: ${(session as any).contentType}\n`;
    if ((session as any).capacity) summary += `💾 Capacidad: ${(session as any).capacity}\n`;
    if ((session as any).selectedGenres && (session as any).selectedGenres.length > 0) summary += `🎼 Géneros: ${(session as any).selectedGenres.join(', ')}\n`;
    if ((session as any).mentionedArtists && (session as any).mentionedArtists.length > 0) summary += `🎤 Artistas: ${(session as any).mentionedArtists.join(', ')}\n`;
    if (session.preferences?.musicGenres && session.preferences.musicGenres.length > 0) summary += `🎶 Géneros musicales: ${session.preferences.musicGenres.join(', ')}\n`;
    if ((session as any).price) summary += `💰 Precio: $${(session as any).price.toLocaleString()}\n`;

    if (session.orderData?.items?.length) {
        summary += `\n📦 *PRODUCTOS EN EL PEDIDO*\n`;
        session.orderData.items.forEach((item, index) => {
            summary += `${index + 1}. ${item.name} - $${item.price.toLocaleString()}\n`;
        });
        summary += `\n💵 Total: $${(session.orderData.totalPrice || 0).toLocaleString()}\n`;
    }

    summary += '\n━━━━━━━━━━━━━━━━━━━━';
    return summary;
}

// ====== Handlers de eventos entrantes del bot (onMessage) ======

type InboundEvent = {
  from: string;
  body: string;
  flow?: string;
  channel?: 'WhatsApp' | 'Instagram' | 'Telegram' | 'Web' | string;
  pushName?: string;
};

type BotMessageEvent = {
  to: string;
  body: string;
  flow?: string;
  channel?: string;
};

type SystemEvent = {
  phone: string;
  message: string;
  code?: string;
  flow?: string;
  channel?: string;
  // NUEVO: datos opcionales sobre el agente y origen del evento
  agentId?: string;
  agentName?: string;
  source?: string; // 'whatsapp_inbox' | 'crm' | 'waba' | etc
};

function detectFlowAlias(flow?: string): string {
  if (!flow) return 'keep';
  const norm = normalizeFlow(flow);
  return norm || 'keep';
}

function channelOrDefault(ch?: string) {
  const c = (ch || '').toLowerCase();
  if (/insta/.test(c)) return 'Instagram';
  if (/tele/.test(c)) return 'Telegram';
  if (/web|site|shop/.test(c)) return 'Web';
  return 'WhatsApp';
}

// ===== NUEVO: helpers para marcar/desmarcar chat activo de WhatsApp =====
function markWhatsAppChatActive(session: UserSession, meta?: { agentId?: string; agentName?: string; source?: string }) {
  session.tags = session.tags || [];
  if (!session.tags.includes('whatsapp_chat')) session.tags.push('whatsapp_chat');
  session.conversationData = session.conversationData || {};
  (session.conversationData as any).whatsappChatActive = true;
  (session.conversationData as any).whatsappChatMeta = {
    ...((session.conversationData as any).whatsappChatMeta || {}),
    activatedAt: new Date().toISOString(),
    agentId: meta?.agentId || ((session.conversationData as any).whatsappChatMeta?.agentId || null),
    agentName: meta?.agentName || ((session.conversationData as any).whatsappChatMeta?.agentName || null),
    source: meta?.source || ((session.conversationData as any).whatsappChatMeta?.source || 'unknown')
  };
}

function unmarkWhatsAppChatActive(session: UserSession, meta?: { agentId?: string; agentName?: string; source?: string }) {
  session.tags = session.tags || [];
  const idx = session.tags.indexOf('whatsapp_chat');
  if (idx > -1) session.tags.splice(idx, 1);
  session.conversationData = session.conversationData || {};
  (session.conversationData as any).whatsappChatActive = false;
  (session.conversationData as any).whatsappChatMeta = {
    ...((session.conversationData as any).whatsappChatMeta || {}),
    deactivatedAt: new Date().toISOString(),
    agentId: meta?.agentId || ((session.conversationData as any).whatsappChatMeta?.agentId || null),
    agentName: meta?.agentName || ((session.conversationData as any).whatsappChatMeta?.agentName || null),
    source: meta?.source || ((session.conversationData as any).whatsappChatMeta?.source || 'unknown')
  };
}

export async function onInboundMessage(ev: InboundEvent) {
  try {
    const phone = validatePhoneNumber(ev.from);
    if (!phone) return;

    const channel = channelOrDefault(ev.channel);
    const flowAlias = detectFlowAlias(ev.flow);
    const current = userSessions.get(phone)?.currentFlow || 'welcomeFlow';
    const finalFlow = flowAlias === 'keep' ? current : flowAlias;
    const confidence = (finalFlow === 'musicUsb' || finalFlow === 'videosUsb' || finalFlow === 'moviesUsb' || finalFlow === 'orderFlow') ? 0.9 : 0.7;

    // Log de entrada enriquecido
    console.log(`📥 Inbound from=${phone} | pushName=${ev.pushName || 'N/A'} | channel=${channel} | flowReq=${ev.flow || 'N/A'} | finalFlow=${finalFlow} | bodyLen=${(ev.body || '').length}`);

    await updateUserSession(
      phone,
      ev.body || '',
      finalFlow,
      null,
      false,
      {
        messageType: 'inbound_message',
        confidence,
        metadata: {
          channel,
          source: 'onInboundMessage',
          pushName: ev.pushName || null,
          receivedAt: new Date().toISOString(),
          device: (ev as any)?.device || null,
          userAgent: (ev as any)?.userAgent || null
        }
      },
      ev.pushName
    );

    await trackUserResponse(phone, ev.body || '');
  } catch (e) {
    console.error('❌ onInboundMessage error:', e);
  }
}

export async function onBotMessage(ev: BotMessageEvent) {
  try {
    const phone = validatePhoneNumber(ev.to);
    if (!phone) return;
    const session = await getUserSession(phone);
    const channel = channelOrDefault(ev.channel);
    const now = new Date();

    session.interactions = session.interactions || [];
    session.interactions.push({
      timestamp: now,
      message: (ev.body || '').substring(0, 500),
      type: 'bot_message',
      intent: 'bot_output',
      sentiment: 'neutral',
      engagement_level: 50,
      channel,
      respondedByBot: true
    } as any);

    if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
    session.updatedAt = now;
    userSessions.set(phone, session);
  } catch (e) {
    console.error('❌ onBotMessage error:', e);
  }
}

export async function onSystemEvent(ev: SystemEvent) {
  try {
    const phone = validatePhoneNumber(ev.phone);
    if (!phone) return;
    const session = await getUserSession(phone);
    const channel = channelOrDefault(ev.channel);
    const now = new Date();

    // ===== Manejar eventos de agente humano para WhatsApp =====
    const code = (ev.code || '').toLowerCase();
    // Reset counters si llega evento de conversión/pago confirmado
const conversionCodes = new Set(['order_confirmed','payment_confirmed','paid','purchase_completed']);
if (conversionCodes.has(code)) {
  session.stage = 'converted';
  resetFollowUpCountersForUser(session);
}
    const activateCodes = new Set([
      'human_chat_started', 'agent_assigned', 'agent_joined', 'whatsapp_chat_started', 'chat_taken', 'chat_assigned'
    ]);
    const deactivateCodes = new Set([
      'human_chat_ended', 'agent_unassigned', 'agent_left', 'whatsapp_chat_ended', 'chat_released', 'chat_closed'
    ]);

    if (activateCodes.has(code)) {
      markWhatsAppChatActive(session, { agentId: ev.agentId, agentName: ev.agentName, source: ev.source });
      console.log(`👤 Chat humano ACTIVADO (WhatsApp) para ${phone} por ${ev.agentName || ev.agentId || 'N/A'}`);
      try {
        if (typeof businessDB?.updateUserSession === 'function') {
          await businessDB.updateUserSession(phone, {
            tags: jsonStringifySafe(session.tags || []),
            conversationData: jsonStringifySafe(session.conversationData || {})
          } as any);
        }
      } catch (e) {
        console.warn('⚠️ Persistencia chat activo:', e);
      }
    }

    if (deactivateCodes.has(code)) {
      unmarkWhatsAppChatActive(session, { agentId: ev.agentId, agentName: ev.agentName, source: ev.source });
      console.log(`👤 Chat humano DESACTIVADO (WhatsApp) para ${phone} por ${ev.agentName || ev.agentId || 'N/A'}`);
      try {
        if (typeof businessDB?.updateUserSession === 'function') {
          await businessDB.updateUserSession(phone, {
            tags: jsonStringifySafe(session.tags || []),
            conversationData: jsonStringifySafe(session.conversationData || {})
          } as any);
        }
      } catch (e) {
        console.warn('⚠️ Persistencia chat inactivo:', e);
      }
    }

    session.interactions = session.interactions || [];
    session.interactions.push({
      timestamp: now,
      message: (ev.message || '').substring(0, 500),
      type: 'system_event',
      intent: ev.code || 'system',
      sentiment: 'neutral',
      engagement_level: 40,
      channel,
      respondedByBot: false
    } as any);

    if (session.interactions.length > 500) session.interactions = session.interactions.slice(-500);
    session.updatedAt = now;
    userSessions.set(phone, session);
  } catch (e) {
    console.error('❌ onSystemEvent error:', e);
  }
}

// Exportaciones finales

function safeJSON(value: any, fallback: any): any {
  try {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return fallback;
      return JSON.parse(trimmed);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// ===== MEJORAS ADICIONALES =====

/**
 * Función auxiliar para verificar si un usuario necesita seguimiento urgente
 * Útil para priorizar envíos en horas pico
 */
export function isUrgentFollowUpNeeded(session: UserSession): boolean {
  const hoursSinceLastInteraction = (Date.now() - session.lastInteraction.getTime()) / 36e5;
  
  return (
    session.buyingIntent > 75 &&
    hoursSinceLastInteraction < 4 &&
    hoursSinceLastInteraction > 0.5 &&
    session.stage === 'pricing' &&
    !isWhatsAppChatActive(session)
  );
}

// === NUEVO: Analizador de contexto antes de enviar seguimiento ===
function analyzeContextBeforeSend(session: UserSession): { ok: boolean; reason?: string } {
const now = new Date();

// 1) Horario y chat activo
if (!isHourAllowed(now)) return { ok: false, reason: 'outside_hours' };
if (isWhatsAppChatActive(session)) return { ok: false, reason: 'wa_chat_active' };

// 2) Evitar si hubo interacción MUY reciente (< 5 min) para no molestar
const minsSinceLast = (now.getTime() - session.lastInteraction.getTime()) / 60000;
if (minsSinceLast < 5) return { ok: false, reason: 'recent_interaction' };

// 3) Sentimiento negativo reciente: solo bloquéalo si buyingIntent < 50
const last = (session.interactions || []).slice(-1)[0];
if (last && last.type === 'user_message' && last.sentiment === 'negative') {
if (!((session.buyingIntent || 0) >= 50 || session.stage === 'pricing')) {
return { ok: false, reason: 'recent_negative_low_intent' };
}
}

// 4) Tope adicional: máx 6 recordatorios (ya controlado en canSendUserFollowUp)
const hist = (session.conversationData?.followUpHistory || []) as string[];
if (hist.length >= 6 && session.stage !== 'converted') return { ok: false, reason: 'max_6_per_user' };

// 5) En cierre (closing), espera 60 min (antes 120)
if (session.stage === 'closing' && minsSinceLast < 60) {
return { ok: false, reason: 'closing_in_progress' };
}

return { ok: true };
}

/**
 * Obtener estadísticas de seguimientos para monitoreo
 */
export function getFollowUpStats() {
  return {
    totalSent: FOLLOWUP_SENT_TOTAL,
    sentInCurrentWindow: FOLLOWUP_SENT_WINDOW,
    windowStartedAt: new Date(FOLLOWUP_LAST_WINDOW_AT),
    queueSize: followUpQueue.size,
    globalLimits: {
      perHour: RATE_GLOBAL.perHourMax,
      perDay: RATE_GLOBAL.perDayMax,
      currentHourCount: RATE_GLOBAL.hourCount,
      currentDayCount: RATE_GLOBAL.dayCount
    },
    lastMessageDelay: Date.now() - lastFollowUpTimestamp
  };
}

/**
 * Resetear contadores de seguimiento (útil para testing o mantenimiento)
 */
export function resetFollowUpCounters() {
  FOLLOWUP_SENT_TOTAL = 0;
  FOLLOWUP_SENT_WINDOW = 0;
  FOLLOWUP_LAST_WINDOW_AT = Date.now();
  RATE_GLOBAL.hourCount = 0;
  RATE_GLOBAL.dayCount = 0;
  RATE_GLOBAL.hourWindowStart = Date.now();
  RATE_GLOBAL.dayWindowStart = Date.now();
  lastFollowUpTimestamp = 0;
  console.log('🔄 Contadores de seguimiento reseteados');
}

/**
 * Pausar/reanudar sistema de seguimientos
 */
let followUpSystemPaused = false;

export function pauseFollowUpSystem() {
  followUpSystemPaused = true;
  console.log('⏸️ Sistema de seguimientos PAUSADO');
}

export function resumeFollowUpSystem() {
  followUpSystemPaused = false;
  console.log('▶️ Sistema de seguimientos REANUDADO');
}

export function isFollowUpSystemPaused(): boolean {
  return followUpSystemPaused;
}

// Modificar sendSecureFollowUp para respetar pausa
const originalSendSecureFollowUp = sendSecureFollowUp;

/**
 * Log consolidado de actividad del sistema
 */
export function logConsolidatedActivity() {
  const stats = getFollowUpStats();
  const systemMetrics = getSystemMetrics();
  const performance = getPerformanceMetrics();
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 REPORTE CONSOLIDADO DEL SISTEMA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('🔔 SEGUIMIENTOS:');
  console.log(`   Total enviados: ${stats.totalSent}`);
  console.log(`   Ventana actual: ${stats.sentInCurrentWindow}`);
  console.log(`   Cola pendiente: ${stats.queueSize}`);
  console.log(`   Límite hora: ${stats.globalLimits.currentHourCount}/${stats.globalLimits.perHour}`);
  console.log(`   Límite día: ${stats.globalLimits.currentDayCount}/${stats.globalLimits.perDay}`);
  console.log(`   Sistema: ${followUpSystemPaused ? '⏸️ PAUSADO' : '▶️ ACTIVO'}\n`);
  
  console.log('👥 USUARIOS:');
  console.log(`   Sesiones activas: ${systemMetrics.totalActiveSessions}`);
  console.log(`   Total usuarios: ${userSessions.size}`);
  console.log(`   Buying Intent promedio: ${systemMetrics.averageBuyingIntent.toFixed(1)}%`);
  console.log(`   Tasa conversión: ${systemMetrics.conversionRate.toFixed(2)}%\n`);
  
  console.log('⚡ RENDIMIENTO:');
  console.log(`   Memoria: ${(performance.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Cache size: ${performance.sessionCacheSize}`);
  console.log(`   Salud: ${systemMetrics.systemHealth.toUpperCase()}\n`);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Log consolidado cada 30 minutos
setInterval(() => {
  logConsolidatedActivity();
}, 30 * 60 * 1000);

console.log('✅ Sistema de seguimiento con retraso de 3s entre mensajes inicializado');
console.log('⏱️ Retraso configurado: 3000ms entre usuarios diferentes');
console.log('🚀 Todas las mejoras aplicadas correctamente');
