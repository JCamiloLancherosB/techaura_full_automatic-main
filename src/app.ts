// import dotenv from 'dotenv';
// dotenv.config();

// import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
// import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
// import { MysqlAdapter as Database } from '@builderbot/database-mysql';
// import { adapterDB, businessDB } from './mysql-database';

// import { canSendOnce, setBotInstance, getUserAnalytics, getSmartRecommendations, getConversationAnalysis, updateUserSession, userSessions, getUserSession, generatePersuasiveFollowUp, sendFollowUpMessage, triggerChannelReminder, triggerBulkRemindersByChannel } from './flows/userTrackingSystem';

// import { initializeBotSystem } from './core/initializeBotSystem';
// import { errorHandler } from './utils/errorHandler';
// import { logger } from './utils/logger';

// import { aiService } from './services/aiService';
// import AIMonitoring from './services/aiMonitoring';
// import { IntelligentRouter } from './services/intelligentRouter';

// import { detectAndRouteUserIntent } from './support-functions';
// import flowHeadPhones from './flows/flowHeadPhones';
// import flowTechnology from './flows/flowTechnology';
// import flowUsb from './flows/flowUsb';
// import menuFlow from './flows/menuFlow';
// import menuTech from './flows/menuTech';
// import pageOrCatalog from './flows/pageOrCatalog';
// import flowAsesor from './flows/flowAsesor';
// import musicUsb from './flows/musicUsb';
// import videosUsb from './flows/videosUsb';
// import moviesUsb from './flows/moviesUsb';
// import mainFlow from './flows/mainFlow';
// import customUsb from './flows/customUsb';
// import capacityMusic from './flows/capacityMusic';
// import { datosCliente } from './flows/datosCliente';
// import promosUsbFlow from './flows/promosUsbFlow';
// import contentSelectionFlow from './flows/contentSelectionFlow';
// import testCapture from './flows/testCapture';
// import trackingDashboard from './flows/trackingDashboard';
// import { startControlPanel } from './controlPanel';
// import capacityVideo from './flows/capacityVideo';

// import aiCatchAllFlow from './flows/mainFlow';
// import aiAdminFlow from './flows/aiAdminFlow';
// // import mainFlow from './flows/mainFlow';
// import catalogFlow from './flows/catalogFlow';
// import customizationFlow from './flows/customizationFlow';
// import orderFlow from './flows/orderFlow';

// import USBDetector from './core/USBDetector';
// import { ProcessingSystem } from './core/ProcessingSystem';
// import { followUpQueue } from './flows/userTrackingSystem';

// // Instancias auxiliares (si se usan en otro lugar)
// const detector = new USBDetector();
// const processor = new ProcessingSystem();

// console.log('🔍 Debug - Variables de entorno:');
// console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Configurada' : '❌ No encontrada');
// console.log('MYSQL_DB_HOST:', process.env.MYSQL_DB_HOST);
// console.log('MYSQL_DB_USER:', process.env.MYSQL_DB_USER);
// console.log('MYSQL_DB_NAME:', process.env.MYSQL_DB_NAME);
// console.log('PORT:', process.env.PORT);

// // Tipado interno extendido (alineado con userTrackingSystem)
// interface ExtendedUserSession {
//   phone: string;
//   phoneNumber?: string;
//   name?: string;
//   stage?: string;
//   currentFlow?: string;
//   buyingIntent?: number;
//   lastInteraction?: Date;
//   lastFollowUp?: Date;
//   followUpCount?: number;
//   priorityScore?: number;
//   urgencyLevel?: 'high' | 'medium' | 'low';
//   isProcessing?: boolean;
//   lastFollowUpReason?: string;
//   interests?: string[];
//   interactions?: any[];
//   conversationData?: any;
//   followUpSpamCount?: number;
// }

// // -----------------------
// // --- INITIALIZATION ---
// // -----------------------
// async function initializeApp() {
//   try {
//     console.log('🚀 Iniciando inicialización de la aplicación...');
//     const isConnected = await businessDB.testConnection();
//     if (!isConnected) {
//       console.error('❌ No se pudo conectar a MySQL. Verifica tu configuración.');
//       console.error('   1. Asegúrate de que MySQL esté corriendo');
//       console.error('   2. Verifica las credenciales en .env');
//       console.error('   3. Verifica que la base de datos exista');
//       process.exit(1);
//     }
//     await businessDB.initialize();
//     console.log('✅ Inicialización completada exitosamente');
//   } catch (error: any) {
//     console.error('❌ Error crítico en inicialización:', error);
//     throw error;
//   }
// }

// // -----------------------
// // --- BOT UTILITIES ---
// // -----------------------
// let botInstance: any = null;
// const ADMIN_PHONE = process.env.ADMIN_PHONE || '+573008602789';

// // Ventana horaria para envíos (8:00 a 21:00)
// const isWithinSendingWindow = (date = new Date()) => {
//   const h = date.getHours();
//   return h >= 8 && h <= 21;
// };

// // Cross-sell: genera upsell/cross-sell breve según intereses y etapa
// const buildCrossSellSnippet = async (phone: string, session: ExtendedUserSession) => {
//   try {
//     const analytics = await businessDB.getUserAnalytics(phone);
//     const categories = analytics?.preferredCategories || session.interests || [];
//     if (categories.includes('music') || categories.includes('música')) {
//       return '➕ Suma un llavero LED (+$9.900) o upgrade a 64GB con 2.000+ canciones extra.';
//     }
//     if (categories.includes('videos') || categories.includes('películas') || categories.includes('movies')) {
//       return '➕ Agrega trailers 4K y carátulas organizadas. Upgrade a 128GB por mejor relación GB/$';
//     }
//     return '➕ Recomendado: funda impermeable y grabado láser del nombre.';
//   } catch {
//     return '➕ Recomendado: funda impermeable y grabado láser del nombre.';
//   }
// };

// // Envío de mensajes automáticos (agrupados)
// const sendAutomaticMessage = async (phoneNumber: string, messages: string[]) => {
//   if (!botInstance) {
//     console.error('❌ Bot instance no disponible para envío automático');
//     return;
//   }
//   if (!isWithinSendingWindow()) {
//     console.log(`⏸️ Fuera de ventana horaria, no se envía a ${phoneNumber}`);
//     return;
//   }
//   try {
//     const groupedMessage = messages.join('\n\n');
//     await botInstance.sendMessage(phoneNumber, groupedMessage, {});
//     await businessDB.logMessage({
//       phone: phoneNumber,
//       message: groupedMessage,
//       type: 'outgoing',
//       automated: true,
//       timestamp: new Date()
//     });
//     console.log(`📤 Mensaje automático enviado a ${phoneNumber}`);
//   } catch (error) {
//     console.error(`❌ Error enviando mensaje automático a ${phoneNumber}:`, error);
//   }
// };

// // Seguimiento personalizado
// const generatePersonalizedFollowUp = async (
//   user: ExtendedUserSession,
//   urgencyLevel: 'high' | 'medium' | 'low'
// ): Promise<string[]> => {
//   try {
//     const dbUser = await businessDB.getUserSession(user.phone);
//     const userOrders = await businessDB.getUserOrders(user.phone);
//     const userAnalytics = await businessDB.getUserAnalytics(user.phone);

//     const name = (dbUser?.name || user.name || 'amigo').split(' ')[0];
//     const hour = new Date().getHours();
//     const greeting = hour < 12 ? "🌅 ¡Buenos días" : hour < 18 ? "☀️ ¡Buenas tardes" : "🌙 ¡Buenas noches";
//     const messages: string[] = [];

//     if (urgencyLevel === 'high') {
//       messages.push(`🔥 ${greeting} ${name}! Oferta especial: 30% OFF solo por 2 horas más 🚀`);
//       if (userOrders?.length > 0) messages.push(`📦 Como ya compraste antes, tienes envío GRATIS garantizado.`);
//       else messages.push(`📦 Primera compra = Envío GRATIS + garantía extendida.`);
//     } else if (urgencyLevel === 'medium') {
//       messages.push(`${greeting} ${name}! ¿Listo para tu USB personalizada?`);
//       messages.push(`🎁 Tu descuento reservado sigue disponible (tiempo limitado).`);
//     } else {
//       messages.push(`${greeting} ${name}! ¿Te ayudo a continuar con tu pedido?`);
//     }

//     if (userAnalytics?.preferredCategories?.length) {
//       const interests = userAnalytics.preferredCategories.slice(0, 2);
//       if (interests.length > 0) messages.push(`🎵 Vi que te interesa ${interests.join(' y ')}. ¿Agregamos más géneros?`);
//     }

//     const recommendations = getSmartRecommendations(user.phone, userSessions);
//     if (recommendations?.length) messages.push(`🔎 Basado en tu perfil, te recomiendo: ${recommendations.slice(0, 3).join(', ')}.`);

//     switch (user.stage) {
//       case 'customizing': messages.push(`🎧 ¿Seguimos personalizando tu USB con más contenido?`); break;
//       case 'pricing': messages.push(`💳 ¿Te muestro los precios especiales de hoy?`); break;
//       case 'interested': messages.push(`🎶 ¿Retomamos tu pedido donde lo dejaste?`); break;
//       case 'cart_abandoned': messages.push(`🛒 Tu carrito sigue guardado. ¿Finalizamos la compra?`); break;
//     }

//     const cs = await buildCrossSellSnippet(user.phone, user);
//     messages.push(cs);

//     if (urgencyLevel === 'high') messages.push(`⚡ ¿Te reservo una USB con descuento? Solo responde "SÍ"`);
//     else messages.push(`¿Continuamos? Responde "OK" o pregúntame lo que necesites 😊`);

//     return messages;
//   } catch (error) {
//     console.error('❌ Error generando seguimiento personalizado:', error);
//     const name = user.name?.split(' ')[0] || 'amigo';
//     return [
//       `¡Hola ${name}! ¿Seguimos con tu USB personalizada?`,
//       `🎵 Tengo ofertas especiales esperándote.`,
//       `¿Continuamos? Responde "OK" 😊`
//     ];
//   }
// }

// console.log('🔧 Configurando sistema de análisis contextual...');
// console.log('✅ Context Analyzer inicializado');
// console.log('✅ Context Logger configurado');
// console.log('✅ Middleware contextual disponible');

// // ==========================================
// // === SISTEMA DE COLA INTELIGENTE ===
// // ==========================================

// interface FollowUpTask {
//   phone: string;
//   urgency: 'high' | 'medium' | 'low';
//   scheduledFor: number;
//   retries: number;
//   reason: string;
// }

// // ===== SISTEMA DE COLA MEJORADO =====

// interface QueuedFollowUp {
//   phone: string;
//   urgency: 'high' | 'medium' | 'low';
//   scheduledFor: number;
//   timeoutId: NodeJS.Timeout;
//   attempts: number;
// }

// class FollowUpQueueManager {
//   private queue: Map<string, QueuedFollowUp> = new Map();
//   private readonly MAX_QUEUE_SIZE = 200; // Aumentado de 50 a 200
//   private readonly PRIORITY_WEIGHTS = { high: 3, medium: 2, low: 1 };
//   // Limpieza automática de la cola
// setInterval(() => {
//   const now = Date.now();
//   let cleaned = 0;

//   followUpQueueManager.queue.forEach((item, phone) => {
//     // Remover si el usuario ya no existe o fue convertido
//     const session = userSessions.get(phone);
//     if (!session || session.stage === 'converted') {
//       followUpQueueManager.remove(phone);
//       cleaned++;
//     }
//   });

//   if (cleaned > 0) {
//     console.log(`🧹 Limpiados ${cleaned} seguimientos obsoletos`);
//   }

//   const stats = followUpQueueManager.getStats();
//   console.log(`📊 Cola: ${stats.total} (H:${stats.high} M:${stats.medium} L:${stats.low})`);
// }, 15 * 60 * 1000);


//   add(phone: string, urgency: 'high' | 'medium' | 'low', delayMs: number): boolean {
//     // Si ya existe, actualizar prioridad si es mayor
//     const existing = this.queue.get(phone);
//     if (existing) {
//       if (this.PRIORITY_WEIGHTS[urgency] > this.PRIORITY_WEIGHTS[existing.urgency]) {
//         this.remove(phone);
//       } else {
//         return false; // Ya está en cola con igual o mayor prioridad
//       }
//     }

//     // Si la cola está llena, remover el de menor prioridad
//     if (this.queue.size >= this.MAX_QUEUE_SIZE) {
//       const removed = this.removeLeastPriority();
//       if (!removed) {
//         console.log(`⚠️ Cola llena (${this.queue.size}), no se pudo agregar ${phone}`);
//         return false;
//       }
//     }

//     const timeoutId = setTimeout(async () => {
//       await this.process(phone);
//     }, delayMs);

//     this.queue.set(phone, {
//       phone,
//       urgency,
//       scheduledFor: Date.now() + delayMs,
//       timeoutId,
//       attempts: 0
//     });

//     console.log(`➕ Encolado: ${phone} (${urgency}) en ${Math.round(delayMs/60000)}min | Cola: ${this.queue.size}`);
//     return true;
//   }

//   private async process(phone: string): Promise<void> {
//     const item = this.queue.get(phone);
//     if (!item) return;

//     try {
//       const session = userSessions.get(phone);
//       if (!session) {
//         this.remove(phone);
//         return;
//       }

//       // Verificar exclusiones
//       if (isWhatsAppChatActive(session)) {
//         console.log(`🚫 Chat activo WhatsApp: ${phone}`);
//         this.remove(phone);
//         return;
//       }

//       // Verificar ventana horaria
//       if (!isHourAllowed()) {
//         console.log(`⏰ Fuera de horario: ${phone}`);
//         // Reprogramar para mañana a las 9 AM
//         const tomorrow9am = new Date();
//         tomorrow9am.setDate(tomorrow9am.getDate() + 1);
//         tomorrow9am.setHours(9, 0, 0, 0);
//         const delayMs = tomorrow9am.getTime() - Date.now();
        
//         this.remove(phone);
//         this.add(phone, item.urgency, delayMs);
//         return;
//       }

//       // Aplicar retraso de 3 segundos
//       await waitForFollowUpDelay();

//       // Enviar seguimiento
//       await sendFollowUpMessage(phone);
      
//       console.log(`✅ Seguimiento enviado: ${phone}`);
//       this.remove(phone);

//     } catch (error) {
//       console.error(`❌ Error procesando ${phone}:`, error);
      
//       // Reintentar hasta 2 veces
//       if (item.attempts < 2) {
//         item.attempts++;
//         const retryDelay = 30 * 60 * 1000; // 30 min
//         this.remove(phone);
//         this.add(phone, item.urgency, retryDelay);
//         console.log(`🔄 Reintento ${item.attempts}/2 para ${phone}`);
//       } else {
//         this.remove(phone);
//         console.log(`❌ Descartado tras 2 intentos: ${phone}`);
//       }
//     }
//   }

//   private removeLeastPriority(): boolean {
//     let lowestPhone: string | null = null;
//     let lowestPriority = Infinity;

//     this.queue.forEach((item, phone) => {
//       const priority = this.PRIORITY_WEIGHTS[item.urgency];
//       if (priority < lowestPriority) {
//         lowestPriority = priority;
//         lowestPhone = phone;
//       }
//     });

//     if (lowestPhone) {
//       this.remove(lowestPhone);
//       console.log(`🗑️ Removido por prioridad baja: ${lowestPhone}`);
//       return true;
//     }
//     return false;
//   }

//   remove(phone: string): void {
//     const item = this.queue.get(phone);
//     if (item) {
//       clearTimeout(item.timeoutId);
//       this.queue.delete(phone);
//     }
//   }

//   getSize(): number {
//     return this.queue.size;
//   }

//   clear(): void {
//     this.queue.forEach(item => clearTimeout(item.timeoutId));
//     this.queue.clear();
//   }

//   getStats() {
//     const stats = {
//       total: this.queue.size,
//       high: 0,
//       medium: 0,
//       low: 0,
//       nextScheduled: [] as Array<{ phone: string; in: string }>
//     };

//     this.queue.forEach(item => {
//       stats[item.urgency]++;
      
//       const minutesUntil = Math.round((item.scheduledFor - Date.now()) / 60000);
//       if (stats.nextScheduled.length < 5) {
//         stats.nextScheduled.push({
//           phone: item.phone.slice(-4),
//           in: `${minutesUntil}min`
//         });
//       }
//     });

//     return stats;
//   }
// }

// // Instancia global
// const followUpQueueManager = new FollowUpQueueManager();

// // ==========================================
// // === SISTEMA DE SEGUIMIENTO MEJORADO ===
// // ==========================================

// const activeFollowUpSystem = () => {
//   console.log('🎯 Sistema de seguimiento con cola inteligente activo...');
  
//   const systemState = {
//     isRunning: false,
//     lastExecution: 0,
//     processedUsers: new Set<string>(),
//     errorCount: 0,
//     maxErrors: 10,
//     cycleCount: 0
//   };

//   const executeFollowUpCycle = async () => {
//     if (!isWithinSendingWindow()) {
//       console.log('⏰ Fuera de ventana horaria (8:00-21:00)');
//       return;
//     }
    
//     if (systemState.isRunning) {
//       console.log('⏭️ Ciclo ya en ejecución, saltando...');
//       return;
//     }
    
//     if (systemState.errorCount >= systemState.maxErrors) {
//       console.log('❌ Demasiados errores, sistema pausado');
//       return;
//     }

//     const now = Date.now();
//     if (now - systemState.lastExecution < 5 * 60 * 1000) { // 5 min mínimo entre ciclos
//       return;
//     }

//     systemState.isRunning = true;
//     systemState.lastExecution = now;
//     systemState.cycleCount++;

//     try {
//       console.log(`\n🔄 ===== CICLO ${systemState.cycleCount} =====`);
//       console.log(`📊 Cola actual: ${followUpQueueManager.getStats().queueSize} | Procesando: ${followUpQueueManager.getStats().processing}`);

//       // Obtener usuarios activos (limitar a 30 por ciclo)
//       let activeUsers: any[] = [];
//       try {
//         if (typeof businessDB?.getActiveUsers === 'function') {
//           activeUsers = (await businessDB.getActiveUsers(48) || []).slice(0, 30);
//         } else {
//           console.warn('⚠️ businessDB.getActiveUsers no disponible');
//           return;
//         }
//       } catch (dbError) {
//         console.error('❌ Error obteniendo usuarios activos:', dbError);
//         systemState.errorCount++;
//         return;
//       }

//       if (activeUsers.length === 0) {
//         console.log('📭 No hay usuarios activos para seguimiento');
//         return;
//       }

//       console.log(`📊 Analizando ${activeUsers.length} usuarios activos...`);
//       let queued = 0;
//       let skipped = 0;

//       for (const user of activeUsers) {
//         try {
//           if (!user?.phone || typeof user.phone !== 'string') continue;

//           // Verificar si ya fue procesado en esta hora
//           const userKey = `${user.phone}_${new Date().getHours()}`;
//           if (systemState.processedUsers.has(userKey)) {
//             skipped++;
//             continue;
//           }

//           const currentTime = new Date();
//           const lastInteraction = user.lastInteraction ? new Date(user.lastInteraction) : new Date(0);
//           const minSinceLast = (currentTime.getTime() - lastInteraction.getTime()) / (1000 * 60);
//           const lastFollowUp = user.lastFollowUp ? new Date(user.lastFollowUp) : new Date(0);
//           const hoursSinceFollowUp = (currentTime.getTime() - lastFollowUp.getTime()) / (1000 * 60 * 60);

//           // Obtener analytics
//           let userAnalytics: any = {};
//           try {
//             if (typeof businessDB?.getUserAnalytics === 'function') {
//               userAnalytics = await businessDB.getUserAnalytics(user.phone) || {};
//             }
//           } catch (analyticsError) {
//             console.warn(`⚠️ Error analytics ${user.phone}:`, analyticsError);
//           }

//           const buyingIntent = userAnalytics?.buyingIntent || user.buyingIntent || 0;

//           // Determinar si necesita seguimiento
//           let urgency: 'high' | 'medium' | 'low' = 'low';
//           let needsFollowUp = false;
//           let minDelayRequired = 2;
//           let reason = '';
//           let delayMinutes = 120; // Default: 2 horas

//           if (buyingIntent > 85 && minSinceLast > 15 && hoursSinceFollowUp > 1) {
//             needsFollowUp = true;
//             urgency = 'high';
//             minDelayRequired = 1;
//             delayMinutes = 30;
//             reason = 'Alta intención de compra';
//           } else if (buyingIntent > 70 && minSinceLast > 30 && hoursSinceFollowUp > 2) {
//             needsFollowUp = true;
//             urgency = 'high';
//             minDelayRequired = 2;
//             delayMinutes = 60;
//             reason = 'Buena intención de compra';
//           } else if (user.stage === 'pricing' && minSinceLast > 20 && hoursSinceFollowUp > 1.5) {
//             needsFollowUp = true;
//             urgency = 'high';
//             minDelayRequired = 1.5;
//             delayMinutes = 45;
//             reason = 'Consultó precios';
//           } else if (user.stage === 'cart_abandoned' && minSinceLast > 30 && hoursSinceFollowUp > 2) {
//             needsFollowUp = true;
//             urgency = 'high';
//             minDelayRequired = 2;
//             delayMinutes = 60;
//             reason = 'Carrito abandonado';
//           } else if (user.stage === 'customizing' && minSinceLast > 45 && hoursSinceFollowUp > 3) {
//             needsFollowUp = true;
//             urgency = 'medium';
//             minDelayRequired = 3;
//             delayMinutes = 90;
//             reason = 'Personalizando producto';
//           } else if (user.stage === 'interested' && minSinceLast > 90 && hoursSinceFollowUp > 4) {
//             needsFollowUp = true;
//             urgency = 'medium';
//             minDelayRequired = 4;
//             delayMinutes = 120;
//             reason = 'Mostró interés';
//           } else if (minSinceLast > 240 && hoursSinceFollowUp > 8) {
//             needsFollowUp = true;
//             urgency = 'low';
//             minDelayRequired = 8;
//             delayMinutes = 180;
//             reason = 'Seguimiento general';
//           }

//           if (needsFollowUp && hoursSinceFollowUp >= minDelayRequired) {
//             // Agregar a cola en lugar de enviar inmediatamente
//             const task: FollowUpTask = {
//               phone: user.phone,
//               urgency,
//               scheduledFor: Date.now() + (delayMinutes * 60 * 1000),
//               retries: 0,
//               reason
//             };

//             const added = await followUpQueueManager.addToQueue(task);
//             if (added) {
//               queued++;
//               systemState.processedUsers.add(userKey);
//               console.log(`📋 Encolado: ${user.phone} (${urgency}) - ${reason} - en ${delayMinutes}min`);
//             } else {
//               skipped++;
//             }
//           } else {
//             skipped++;
//           }

//         } catch (userError) {
//           console.error(`❌ Error analizando usuario ${user?.phone}:`, userError);
//           systemState.errorCount++;
//           continue;
//         }
//       }

//       console.log(`✅ Ciclo completado: ${queued} encolados, ${skipped} omitidos`);
//       console.log(`📊 Estado cola: ${followUpQueueManager.getStats().queueSize} pendientes, ${followUpQueueManager.getStats().processing} procesando`);
      
//       if (queued > 0) {
//         systemState.errorCount = Math.max(0, systemState.errorCount - 1);
//       }

//     } catch (error) {
//       console.error('❌ Error crítico en ciclo de seguimiento:', error);
//       systemState.errorCount++;
//     } finally {
//       systemState.isRunning = false;
//     }
//   };

//   const executeMaintenanceCycle = async () => {
//     try {
//       console.log('\n🧹 ===== MANTENIMIENTO DEL SISTEMA =====');
      
//       // Limpiar usuarios procesados cada hora
//       systemState.processedUsers.clear();
//       console.log('✅ Cache de usuarios procesados limpiado');

//       // Resetear contador de errores si ha pasado tiempo
//       const now = Date.now();
//       if (systemState.errorCount > 0 && now - systemState.lastExecution > 60 * 60 * 1000) {
//         systemState.errorCount = 0;
//         console.log('🔄 Contador de errores reseteado');
//       }

//       // Ejecutar mantenimiento de BD
//       if (typeof businessDB?.resetSpamCounters === 'function') {
//         await businessDB.resetSpamCounters(24);
//         console.log('✅ Contadores de spam reseteados');
//       }
      
//       if (typeof businessDB?.cleanInactiveSessions === 'function') {
//         await businessDB.cleanInactiveSessions(7 * 24);
//         console.log('✅ Sesiones inactivas limpiadas');
//       }

//       // Mostrar estadísticas
//       const stats = followUpQueueManager.getStats();
//       console.log(`📊 Estadísticas:`);
//       console.log(`   - Cola: ${stats.queueSize} pendientes`);
//       console.log(`   - Procesando: ${stats.processing}`);
//       console.log(`   - Ciclos ejecutados: ${systemState.cycleCount}`);
//       console.log(`   - Errores: ${systemState.errorCount}/${systemState.maxErrors}`);
      
//       console.log('✅ Mantenimiento completado\n');
//     } catch (error) {
//       console.error('❌ Error en mantenimiento:', error);
//     }
//   };

//   // Ejecutar ciclo cada 10 minutos
//   const followUpInterval = setInterval(executeFollowUpCycle, 10 * 60 * 1000);
  
//   // Mantenimiento cada hora
//   const maintenanceInterval = setInterval(executeMaintenanceCycle, 60 * 60 * 1000);
  
//   // Ejecutar primer ciclo después de 30 segundos
//   setTimeout(executeFollowUpCycle, 30 * 1000);

//   console.log('✅ Sistema de seguimiento configurado exitosamente');

//   const cleanup = () => {
//     clearInterval(followUpInterval);
//     clearInterval(maintenanceInterval);
//     followUpQueueManager.clear();
//     console.log('🛑 Sistema de seguimiento detenido');
//   };

//   process.on('SIGINT', cleanup);
//   process.on('SIGTERM', cleanup);

//   return {
//     stop: cleanup,
//     getStatus: () => ({
//       ...systemState,
//       queue: followUpQueueManager.getStats()
//     })
//   };
// };

// // Endpoint para monitorear la cola


// // Audio
// const audioFlow = addKeyword<Provider, Database>(EVENTS.VOICE_NOTE)
//   .addAction(async (ctx: any, { flowDynamic, endFlow }) => {
//     try {
//       if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();
//       console.log(`🎤 Audio recibido de ${ctx.from}`);
//       const session = await getUserSession(ctx.from);
//       await updateUserSession(
//         ctx.from,
//         '[AUDIO_MESSAGE]',
//         'audio_received',
//         null,
//         false,
//         { metadata: { ...session, name: ctx.name || ctx.pushName } }
//       );
//       await businessDB.logInteraction({
//         phone: ctx.from,
//         type: 'audio_received',
//         content: '[VOICE_NOTE]',
//         timestamp: new Date()
//       });

//       const userAnalytics = await businessDB.getUserAnalytics(ctx.from);
//       const isReturningCustomer = userAnalytics?.totalOrders > 0;
//       let response: string;

//       if (isReturningCustomer) {
//         response = `🎤 ¡${session?.name || 'Amigo'}! Escuché tu audio. Como ya conoces nuestros productos, ¿qué necesitas esta vez?`;
//       } else {
//         const responses = [
//           "🎤 ¡Escuché tu audio! ¿Te interesa música, películas o videos para tu USB?",
//           "🔊 ¡Perfecto! Recibí tu voz. ¿Qué tipo de contenido buscas para tu USB personalizada?",
//           "🎵 ¡Genial tu audio! ¿Prefieres música, videos o películas?"
//         ];
//         response = responses[Math.floor(Math.random() * responses.length)];
//       }
//       await flowDynamic([response]);

//       const cross = await buildCrossSellSnippet(ctx.from, session as any);
//       const options = [
//         "💰 Precios desde $59.900",
//         cross,
//         "",
//         "Puedes decir:",
//         "🎵 'música' - USB musicales",
//         "🎬 'películas' - USB de películas",
//         "🎥 'videos' - USB de videos",
//         "💰 'precios' - Ver opciones",
//         "👨‍💼 'asesor' - Hablar con humano"
//       ];
//       await flowDynamic([options.join('\n')]);
//     } catch (error) {
//       console.error('❌ Error procesando audio:', error);
//       await flowDynamic([
//         "🎤 Recibí tu audio, pero hubo un problema.",
//         "¿Podrías escribirme qué necesitas? Te ayudo con USBs personalizadas 😊"
//       ]);
//     }
//   });

// // Media/Documento
// const mediaFlow = addKeyword<Provider, Database>(EVENTS.DOCUMENT)
//   .addAction(async (ctx: any, { flowDynamic, endFlow }) => {
//     try {
//       if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();
//       console.log(`📎 Documento/Media recibido de ${ctx.from}`);

//       const session = await getUserSession(ctx.from);
//       await updateUserSession(ctx.from, '[DOCUMENT/MEDIA]', 'media_received', null, false, { metadata: session });
//       await businessDB.logInteraction({
//         phone: ctx.from,
//         type: 'document_received',
//         content: '[DOCUMENT/MEDIA]',
//         timestamp: new Date()
//       });

//       const cross = await buildCrossSellSnippet(ctx.from, session as any);
//       await flowDynamic([
//         "📎 Vi que me enviaste un archivo.",
//         "🎵 ¿Personalizamos una USB con contenido similar?",
//         cross,
//         "",
//         "💰 Precios desde $59.900",
//         "Dime: ¿música, videos o películas?"
//       ].join('\n'));
//     } catch (error) {
//       console.error('❌ Error procesando documento:', error);
//       await flowDynamic([
//         "📎 Recibí tu archivo, pero hubo un problema.",
//         "¿Podrías decirme qué tipo de USB necesitas? 😊"
//       ]);
//     }
//   });

// // Flujo principal inteligente
// const intelligentMainFlow = addKeyword<Provider, Database>([EVENTS.WELCOME])
//   .addAction(async (ctx: any, { gotoFlow, flowDynamic, endFlow }) => {
//     try {
//       if (!shouldProcessMessage(ctx.from, ctx.body || '')) return endFlow();
//       if (!ctx.body || ctx.body.trim().length === 0) return endFlow();
//       if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();

//       const lowerBody = ctx.body.toLowerCase();
//       if (lowerBody.includes('telegram') || lowerBody.includes('notificación de')) return endFlow();

//       console.log(`🎯 Mensaje recibido de ${ctx.from}: ${ctx.body}`);

//       let session: ExtendedUserSession;
//       try {
//         const userSession = await getUserSession(ctx.from); 
//         if (!userSession) return gotoFlow(mainFlow);
//         session = {
//           phone: userSession.phone,
//           phoneNumber: userSession.phoneNumber,
//           name: userSession.name,
//           stage: userSession.stage,
//           currentFlow: userSession.currentFlow,
//           buyingIntent: userSession.buyingIntent,
//           lastInteraction: userSession.lastInteraction,
//           lastFollowUp: userSession.lastFollowUp,
//           followUpCount: userSession.followUpSpamCount,
//           isProcessing: userSession.isProcessing,
//           interests: userSession.interests,
//           interactions: userSession.interactions,
//           conversationData: userSession.conversationData ?? {},
//           followUpSpamCount: userSession.followUpSpamCount ?? 0
//         };
//       } catch (sessionError) {
//         console.error('❌ Error obteniendo sesión:', sessionError);
//         return gotoFlow(mainFlow);
//       }

//       if (session.isProcessing) return endFlow();

//       session.isProcessing = true;
//       await updateUserSession(ctx.from, ctx.body, 'processing', null, true, { metadata: session });

//       try {
//         const lockedStages = new Set(['customizing','pricing','closing','order_confirmed','orderFlow']);
//         if (session.stage && lockedStages.has(session.stage)) {
//           session.isProcessing = false;
//           await updateUserSession(ctx.from, ctx.body, session.currentFlow || 'orderFlow', null, false, { metadata: session });
//           return endFlow();
//         }

//         const lower = (ctx.body||'').toLowerCase();
//         // PRIORIDAD: soporte/estado de pedido
//         const isStatusIntent = /\b(estado|como va|cómo va|microsd|micro ?sd|tarjeta|memoria|pedido|orden|entrega|env[ií]o|retraso|demora|list[ao]|hecho|avance)\b/.test(lower);
//         if (isStatusIntent) {
//           await updateUserSession(ctx.from, ctx.body, 'orderFlow', 'status_query', false, {
//             metadata: { source: 'status_priority', raw: ctx.body }
//           });
//           // Mensaje corto y directo; NO mostrar menú
//           await flowDynamic([
//             '📦 Revisando tu pedido ahora mismo...',
//             '¿Te gustaría agregar algo más?'
//           ]);
//           return endFlow();
//         }
//         if (/\b(gracias).*(adios|adiós|bye|vay|chao)\b/.test(lower)) {
//           const s = await getUserSession(ctx.from);
//           s.stage = 'abandoned';
//           if (canSendOnce(s,'farewell',720)) {
//             await botInstance.sendMessage(ctx.from, "Gracias por escribirnos. Si deseas retomar la USB, di 'RETOMAR'. ¡Aquí estaré!.", {});
//           }
//           await updateUserSession(ctx.from, ctx.body, s.currentFlow || 'mainFlow', null, false, { metadata: s });
//           return endFlow();
//         }

//         const isSimpleGreeting = /^(hola|buenos dias|buenas|buenas tardes|buenas noches|hello|hi)\b/i.test(lower);
//         const lastMins = session?.lastInteraction ? (Date.now() - new Date(session.lastInteraction).getTime())/60000 : 999;
//         if (isSimpleGreeting && lastMins < 60) {
//           await flowDynamic([
//             '👋 ¡Hola! Te leo. ¿Deseas continuar con tu pedido o resolver una duda puntual?'
//           ]);
//           return endFlow();
//         }

//         const router = IntelligentRouter.getInstance();
//         const decision = await router.analyzeAndRoute(ctx.body, session as any);

//         if (session.stage==='customizing') {
//           await flowDynamic([ 
//             `🎼 Listo. USB, sin relleno ni repetidas.`,
//             `Elige capacidad:`,
//             `1) 8GB • 1.400 canciones • $59.900`,
//             `2) 32GB • 5.000 canciones • $89.900`,
//             `3) 64GB • 10.000 canciones • $129.900`,
//             `4) 128GB • 25.000 canciones • $169.900`,
//             `Responde 1-4 para continuar.`
//           ].join('\n'));
//           await updateUserSession(ctx.from, ctx.body, 'orderFlow', 'capacity_selection', false, { metadata: session });
//           return endFlow();
//         }

//         console.log(`🧠 Decisión del router: ${decision.action} (${decision.confidence}%) - ${decision.reason}`);

//         if (!decision.shouldIntercept) {
//           session.isProcessing = false;
//           await updateUserSession(ctx.from, ctx.body, 'continue', 'continue_step', false, { metadata: session });
//           return endFlow();
//         }

//         session.isProcessing = false;
//         session.currentFlow = decision.action;
//         await updateUserSession(ctx.from, ctx.body, decision.action, null, false, { metadata: { ...session, decision } });

//         switch (decision.action) {
//           case 'welcome': return gotoFlow(mainFlow);
//           case 'catalog': return gotoFlow(catalogFlow);
//           case 'customize': return gotoFlow(customizationFlow);
//           case 'order': return gotoFlow(orderFlow);
//           case 'music': return gotoFlow(musicUsb);
//           case 'videos': return gotoFlow(videosUsb);
//           case 'movies': return gotoFlow(moviesUsb);
//           case 'advisor': return gotoFlow(flowAsesor);
//           case 'pricing':
//             await flowDynamic([
//               '💰 Precios TechAura:\n' +
//               '🎵 USB Musical Básica: $59.900 (8GB, +1.400 canciones)\n' +
//               '⭐ USB Premium: $89.900 (32GB, +4.000 canciones, diseño personalizado)\n' +
//               '👑 USB VIP: $129.900 (64gbGB, +8.000 canciones, videos musicales)\n' +
//               '🚀 USB Mega: $169.900 (128GB, +15.000 canciones, videos + películas)\n' +
//               '\nIncluye: Envío, 1 año de garantía y soporte.\n' +
//               '¿Te interesa alguna opción específica?'
//             ]);
//             return endFlow();
//           case 'ai_response':
//             if (aiService?.isAvailable()) return gotoFlow(aiCatchAllFlow);
//             return gotoFlow(mainFlow);
//           default:
//             return gotoFlow(mainFlow);
//         }
//       } catch (routerError) {
//         console.error('❌ Error en router:', routerError);
//         session.isProcessing = false;
//         session.currentFlow = 'error';
//         await updateUserSession(ctx.from, 'ERROR', 'error', 'error_step', false, {
//           metadata: { ...session, errorTimestamp: new Date().toISOString() }
//         });
//         return gotoFlow(mainFlow);
//       }
//     } catch (error) {
//       console.error('❌ Error crítico en flujo principal:', error);
//       try {
//         const s = await getUserSession(ctx.from);
//         if (s) {
//           s.isProcessing = false;
//           s.currentFlow = 'critical_error';
//           await updateUserSession(ctx.from, 'CRITICAL_ERROR', 'critical_error', 'critical_step', false, {
//             metadata: { ...s, isCritical: true, lastError: new Date().toISOString() }
//           });
//         }
//       } catch (cleanupError) {
//         console.error('❌ Error en limpieza de emergencia:', cleanupError);
//       }
//       return gotoFlow(mainFlow);
//     }
//   });

// // --------------
// // --- MAIN ---
// // --------------
// const main = async () => {
//   try {
//     console.log('🚀 Iniciando TechAura Intelligent Bot...');
//     await initializeApp();

//     const adapterFlow = createFlow([
//       intelligentMainFlow,
//       // Core
//       mainFlow, catalogFlow, customizationFlow, orderFlow,
//       // Productos
//       musicUsb, videosUsb, moviesUsb, menuTech, customUsb, capacityMusic, capacityVideo,
//       // IA
//       aiAdminFlow, aiCatchAllFlow,
//       // Eventos
//       audioFlow, mediaFlow,
//       // Admin
//       testCapture, trackingDashboard,
//       // Contenido/Promos
//       contentSelectionFlow, promosUsbFlow, datosCliente,
//       // Soporte / legacy
//       mainFlow, flowAsesor, flowHeadPhones, flowTechnology, flowUsb, menuFlow, pageOrCatalog
//     ]);

//     const adapterProvider = createProvider(Provider, {
//       browser: ["TechAura-Intelligent-Bot", "Chrome", "114.0.5735.198"],
//       version: [2, 3800, 1023223821],
//     });

//     const { handleCtx, httpServer } = await createBot({
//       flow: adapterFlow,
//       provider: adapterProvider as any,
//       database: adapterDB,
//     });

//     // Instancia del bot con soporte opcional a media
//     botInstance = {
//       sendMessage: async (phone: string, message: string, options: Record<string, unknown>) => {
//         try {
//           const result = await adapterProvider.sendMessage(
//             phone,
//             typeof message === 'string' ? message : JSON.stringify(message),
//             options || {}
//           );
//           await businessDB.logMessage({
//             phone,
//             message: typeof message === 'string' ? message : JSON.stringify(message),
//             type: 'outgoing',
//             automated: true,
//             timestamp: new Date()
//           });
//           return result;
//         } catch (error) {
//           console.error(`❌ Error enviando mensaje a ${phone}:`, error);
//           throw error;
//         }
//       },
//       sendMessageWithMedia: async (phone: string, payload: { body: string; mediaUrl: string; caption?: string }, options: Record<string, unknown>) => {
//         try {
//           if (typeof (adapterProvider as any).sendMessageWithMedia === 'function') {
//             const result = await (adapterProvider as any).sendMessageWithMedia(phone, payload, options || {});
//             await businessDB.logMessage({
//               phone,
//               message: `${payload.body}\n[media: ${payload.mediaUrl}]`,
//               type: 'outgoing',
//               automated: true,
//               timestamp: new Date()
//             });
//             return result;
//           } else {
//             return await botInstance.sendMessage(phone, payload.body, options);
//           }
//         } catch (error) {
//           console.error(`❌ Error enviando media a ${phone}:`, error);
//           throw error;
//         }
//       }
//     };

//     setBotInstance(botInstance);

//     setTimeout(() => {
//       try {
//         activeFollowUpSystem();
//         console.log('✅ Sistema de seguimiento automático iniciado');
//       } catch (error) {
//         console.error('❌ Error iniciando sistema de seguimiento:', error);
//       }
//     }, 6000);

//     adapterProvider.server.get('/v1/followup/queue', handleCtx(async (bot, req, res) => {
//       try {
//         const stats = followUpQueueManager.getStats();
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({
//           success: true,
//           data: {
//             ...stats,
//             globalLimits: {
//               hourly: `${RATE_GLOBAL.hourCount}/${RATE_GLOBAL.perHourMax}`,
//               daily: `${RATE_GLOBAL.dayCount}/${RATE_GLOBAL.perDayMax}`
//             }
//           },
//           timestamp: new Date().toISOString()
//         }, null, 2));
//       } catch (error) {
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/usb/devices', handleCtx(async (bot, req, res) => {
//       try {
//         const WriterMod = await import('./core/USBWriter');
//         const writer = new (WriterMod.default as any)();
//         await writer.detectAvailableDevices();
//         const devices = (writer as any).availableDevices || [];
//         res.writeHead(200, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok: true, devices }));
//       } catch (e:any) {
//         res.writeHead(500, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok:false, error: e.message }));
//       }
//     }));

//     adapterProvider.server.get('/v1/followup/stats', handleCtx(async (bot, req, res) => {
//   try {
//     const stats = followUpQueueManager.getStats();
//     res.writeHead(200, { 'Content-Type': 'application/json' });
//     res.end(JSON.stringify({ 
//       success: true, 
//       data: stats, 
//       timestamp: new Date().toISOString() 
//     }, null, 2));
//   } catch (error) {
//     console.error('❌ Error obteniendo stats de seguimiento:', error);
//     res.writeHead(500, { 'Content-Type': 'application/json' });
//     res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats' }));
//   }
// }));

//     adapterProvider.server.get('/v1/production-jobs', handleCtx(async (bot, req, res) => {
//       try {
//         const status = (req.query?.status as string) || undefined;
//         const listFn = (businessDB as any).listProcessingJobs || (businessDB as any).getPendingProcessingJobs;
//         const jobs = listFn ? await listFn({ statuses: status ? [status] : undefined, limit: 200 }) : [];
//         res.writeHead(200, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok: true, jobs }));
//       } catch (e:any) {
//         res.writeHead(500, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok:false, error: e.message }));
//       }
//     }));

//     adapterProvider.server.post('/v1/usb/start', handleCtx(async (bot, req, res) => {
//       try {
//         let body = ''; req.on('data', c => body += c); await new Promise(r => req.on('end', r));
//         const { jobId, deviceId } = JSON.parse(body || '{}');
//         if (!jobId) {
//           res.writeHead(400, {'Content-Type':'application/json'});
//           return res.end(JSON.stringify({ ok:false, error:'jobId requerido' }));
//         }
//         const getById = (businessDB as any).getProcessingJobById || (businessDB as any).findProcessingJob;
//         const job = getById ? await getById(Number(jobId)) : null;
//         if (!job) {
//           res.writeHead(404, {'Content-Type':'application/json'});
//           return res.end(JSON.stringify({ ok:false, error:'Job no encontrado' }));
//         }
//         const { ProcessingSystem } = await import('./core/ProcessingSystem');
//         const ps = new ProcessingSystem();
//         ps.run({ job }).catch(()=>{});
//         res.writeHead(200, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok: true, started: true }));
//       } catch (e:any) {
//         res.writeHead(500, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok:false, error: e.message }));
//       }
//     }));

//     adapterProvider.server.post('/v1/usb/retry', handleCtx(async (bot, req, res) => {
//       try {
//         let body=''; req.on('data',c=>body+=c); await new Promise(r => req.on('end', r));
//         const { jobId } = JSON.parse(body||'{}');
//         if (!jobId) {
//           res.writeHead(400, {'Content-Type':'application/json'});
//           return res.end(JSON.stringify({ ok:false, error:'jobId requerido' }));
//         }
//         const updater = (businessDB as any).updateProcessingJobV2 || (businessDB as any).updateProcessingJob;
//         await updater({ id: Number(jobId), status: 'retry', fail_reason: null });
//         res.writeHead(200, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok:true }));
//       } catch (e:any) {
//         res.writeHead(500, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok:false, error:e.message }));
//       }
//     }));

//     adapterProvider.server.post('/v1/usb/cancel', handleCtx(async (bot, req, res) => {
//       try {
//         let body=''; req.on('data',c=>body+=c); await new Promise(r => req.on('end', r));
//         const { jobId } = JSON.parse(body||'{}');
//         if (!jobId) {
//           res.writeHead(400, {'Content-Type':'application/json'});
//           return res.end(JSON.stringify({ ok:false, error:'jobId requerido' }));
//         }
//         const updater = (businessDB as any).updateProcessingJobV2 || (businessDB as any).updateProcessingJob;
//         await updater({ id: Number(jobId), status: 'canceled' });
//         res.writeHead(200, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok:true }));
//       } catch (e:any) {
//         res.writeHead(500, {'Content-Type':'application/json'});
//         res.end(JSON.stringify({ ok:false, error:e.message }));
//       }
//     }));

//     // ==========================================
//     // === ENDPOINTS DE API AVANZADOS ===
//     // ==========================================
//     adapterProvider.server.get('/v1/analytics', handleCtx(async (bot, req, res) => {
//       try {
//         const stats = await businessDB.getGeneralAnalytics();
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: true, data: stats, timestamp: new Date().toISOString() }, null, 2));
//       } catch (error) {
//         console.error('❌ Error obteniendo analytics:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo analytics' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/user/:phone', handleCtx(async (bot, req, res) => {
//       try {
//         const phone = req.params?.phone;
//         if (!phone) {
//           res.writeHead(400, { 'Content-Type': 'application/json' });
//           res.end(JSON.stringify({ success: false, error: 'Número de teléfono requerido' }));
//           return;
//         }
//         const user = await businessDB.getUserSession(phone);
//         const analytics = await businessDB.getUserAnalytics(phone);
//         const orders = await businessDB.getUserOrders(phone);
//         if (user) {
//           res.writeHead(200, { 'Content-Type': 'application/json' });
//           res.end(JSON.stringify({ success: true, data: { user, analytics, orders, timestamp: new Date().toISOString() } }, null, 2));
//         } else {
//           res.writeHead(404, { 'Content-Type': 'application/json' });
//           res.end(JSON.stringify({ success: false, error: 'Usuario no encontrado' }));
//         }
//       } catch (error) {
//         console.error('❌ Error obteniendo usuario:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error interno del servidor' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/ai/stats', handleCtx(async (bot, req, res) => {
//       try {
//         const aiStats = {
//           isAvailable: aiService.isAvailable(),
//           provider: 'gemini',
//           status: aiService.isAvailable() ? 'active' : 'inactive',
//           monitoring: AIMonitoring.getStats(),
//           intelligentRouter: {
//             active: true,
//             version: '2.0',
//             features: ['Context Analysis', 'Intent Detection', 'Automatic Routing', 'Persuasion Elements', 'Smart Recommendations']
//           },
//           timestamp: new Date().toISOString()
//         };
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: true, data: aiStats }, null, 2));
//       } catch (error) {
//         console.error('❌ Error obteniendo stats de IA:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats de IA' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/sales/stats', handleCtx(async (bot, req, res) => {
//       try {
//         const salesStats = await businessDB.getSalesAnalytics();
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: true, data: salesStats, timestamp: new Date().toISOString() }, null, 2));
//       } catch (error) {
//         console.error('❌ Error obteniendo estadísticas de ventas:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo estadísticas de ventas' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/dashboard', handleCtx(async (bot, req, res) => {
//       try {
//         const dashboard = await businessDB.getDashboardData();
//         const intelligentData = {
//           ...dashboard,
//           intelligentSystem: {
//             routerDecisions: await businessDB.getRouterStats(),
//             conversionRates: await businessDB.getConversionStats(),
//             userJourney: await businessDB.getUserJourneyStats(),
//             aiInteractions: AIMonitoring.getStats()
//           }
//         };
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: true, data: intelligentData, timestamp: new Date().toISOString() }, null, 2));
//       } catch (error) {
//         console.error('❌ Error obteniendo dashboard:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo dashboard' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/conversations/analysis', handleCtx(async (bot, req, res) => {
//       try {
//         const analysis = await businessDB.getConversationAnalysis();
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: true, data: analysis, timestamp: new Date().toISOString() }, null, 2));
//       } catch (error) {
//         console.error('❌ Error obteniendo análisis de conversaciones:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo análisis' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/recommendations/:phone', handleCtx(async (bot, req, res) => {
//       try {
//         const phone = req.params?.phone;
//         if (!phone) {
//           res.writeHead(400, { 'Content-Type': 'application/json' });
//           res.end(JSON.stringify({ success: false, error: 'Número de teléfono requerido' }));
//           return;
//         }
//         const recommendations = getSmartRecommendations(phone, userSessions);
//         const userAnalytics = await getUserAnalytics(phone);
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: true, data: { recommendations, analytics: userAnalytics, timestamp: new Date().toISOString() } }, null, 2));
//       } catch (error) {
//         console.error('❌ Error obteniendo recomendaciones:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo recomendaciones' }));
//       }
//     }));

//     adapterProvider.server.get('/v1/router/stats', handleCtx(async (bot, req, res) => {
//       try {
//         const routerStats = await businessDB.getRouterStats();
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({
//           success: true,
//           data: {
//             ...routerStats,
//             systemInfo: {
//               version: '2.0',
//               features: ['Intent Detection', 'Context Analysis', 'Automatic Routing', 'Confidence Scoring', 'Persuasion Integration'],
//               accuracy: routerStats.totalDecisions > 0 ?
//                 (routerStats.successfulRoutes / routerStats.totalDecisions * 100).toFixed(2) + '%' : 'N/A'
//             }
//           },
//           timestamp: new Date().toISOString()
//         }, null, 2));
//       } catch (error) {
//         console.error('❌ Error obteniendo stats del router:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats del router' }));
//       }
//     }));

//     adapterProvider.server.post('/v1/send-message', handleCtx(async (bot, req, res) => {
//       try {
//         let body = '';
//         req.on('data', chunk => { body += chunk.toString(); });
//         req.on('end', async () => {
//           try {
//             const { phone, message, urgent = false, channel } = JSON.parse(body || '{}');
//             if (!phone || !message) {
//               res.writeHead(400, { 'Content-Type': 'application/json' });
//               res.end(JSON.stringify({ success: false, error: 'Phone y message son requeridos' }));
//               return;
//             }
//             const messages = Array.isArray(message) ? message : [message];
//             const urgency: 'high' | 'medium' | 'low' = urgent ? 'high' : 'medium';

//             if (channel) {
//               const ok = await triggerChannelReminder(phone, channel, urgency);
//               res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
//               res.end(JSON.stringify({
//                 success: ok,
//                 message: ok ? 'Mensaje enviado correctamente' : 'No se pudo enviar (posible protección anti-spam)',
//                 timestamp: new Date().toISOString()
//               }));
//               return;
//             }

//             const grouped = messages.join('\n\n');
//             await botInstance.sendMessage(phone, grouped, {});
//             res.writeHead(200, { 'Content-Type': 'application/json' });
//             res.end(JSON.stringify({ success: true, message: 'Mensaje enviado correctamente', timestamp: new Date().toISOString() }));
//           } catch (parseError) {
//             console.error('❌ Error parseando request:', parseError);
//             res.writeHead(400, { 'Content-Type': 'application/json' });
//             res.end(JSON.stringify({ success: false, error: 'JSON inválido' }));
//           }
//         });
//       } catch (error) {
//         console.error('❌ Error enviando mensaje manual:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ success: false, error: 'Error interno del servidor' }));
//       }
//     }));

//     adapterProvider.server.post('/v1/admin/migrate', async (req, res) => {
//       try {
//         console.log('🔧 Ejecutando migración manual de base de datos...');
//         const { runManualMigration } = await import('./scripts/migrateDatabase');
//         const result = await runManualMigration();
//         if (result.success) {
//           console.log('✅ Migración manual completada exitosamente');
//           return res.json({ success: true, message: result.message, timestamp: new Date().toISOString() });
//         } else {
//           console.error('❌ Error en migración manual:', result.message);
//           return res.status(500).json({ success: false, error: result.message, timestamp: new Date().toISOString() });
//         }
//       } catch (error: any) {
//         console.error('❌ Error ejecutando migración manual:', error);
//         return res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
//       }
//     });

//     adapterProvider.server.post('/api/new-order', handleCtx(async (bot, req, res) => {
//       try {
//         const orderData = req.body;
//         if (!orderData || !orderData.orderId) {
//           return res.status(400).json({ success: false, message: 'Datos del pedido inválidos', errors: ['orderId es requerido'] });
//         }
//         const fetch = await import('node-fetch').then(m => m.default);
//         const response = await fetch('http://localhost:3009/api/new-order', {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({ ...orderData, metadata: { validated: true, timestamp: new Date().toISOString() } })
//         });

//         let responseData: any = null;
//         try { responseData = await response.json(); } catch {}

//         if (response.status === 200 || response.status === 201) {
//           return res.status(200).json({
//             success: true,
//             message: 'Pedido recibido y encolado',
//             orderId: orderData.orderId,
//             processorResponse: responseData || null
//           });
//         } else {
//           const errMsg = responseData?.message || `Autoprocesador respondió con estado ${response.status}`;
//           return res.status(502).json({ success: false, message: 'Error del autoprocesador', details: responseData || { status: response.status, message: errMsg } });
//         }
//       } catch (error) {
//         console.error('❌ Error procesando pedido:', error);
//         res.status(500).json({ success: false, error: 'Error interno del servidor' });
//       }
//     }));

//     adapterProvider.server.get('/v1/health', handleCtx(async (bot, req, res) => {
//       try {
//         const health = {
//           status: 'healthy',
//           timestamp: new Date().toISOString(),
//           services: {
//             database: await businessDB.checkConnection(),
//             ai: aiService.isAvailable(),
//             bot: !!botInstance,
//             followUpSystem: true
//           },
//           uptime: process.uptime(),
//           version: '2.0.0'
//         };
//         const allHealthy = Object.values(health.services).every(service => service === true);
//         health.status = allHealthy ? 'healthy' : 'degraded';
//         res.writeHead(200, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify(health, null, 2));
//       } catch (error: any) {
//         console.error('❌ Error verificando salud del sistema:', error);
//         res.writeHead(500, { 'Content-Type': 'application/json' });
//         res.end(JSON.stringify({ status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() }));
//       }
//     }));

//     const PORT = process.env.PORT ?? 3006;
//     httpServer(+PORT);

//     console.log(`\n🎉 ===== TECHAURA INTELLIGENT BOT INICIADO ===== 🎉`);
//     console.log(`🚀 Puerto: ${PORT}`);
//     console.log(`🧠 Sistema Inteligente: ACTIVO`);
//     console.log(`📊 Analytics: http://localhost:${PORT}/v1/analytics`);
//     console.log(`🤖 AI Stats: http://localhost:${PORT}/v1/ai/stats`);
//     console.log(`💰 Sales Stats: http://localhost:${PORT}/v1/sales/stats`);
//     console.log(`📈 Dashboard: http://localhost:${PORT}/v1/dashboard`);
//     console.log(`🎯 User Info: http://localhost:${PORT}/v1/user/{phone}`);
//     console.log(`🔮 Recommendations: http://localhost:${PORT}/v1/recommendations/{phone}`);
//     console.log(`🎛️ Router Stats: http://localhost:${PORT}/v1/router/stats`);
//     console.log(`💬 Send Message: POST http://localhost:${PORT}/v1/send-message`);
//     console.log(`⚡ Performance: http://localhost:${PORT}/v1/performance`);
//     console.log(`🏥 Health Check: http://localhost:${PORT}/v1/health`);
//     console.log(`🔧 Manual Migration: POST http://localhost:${PORT}/v1/admin/migrate`);
//     console.log(`🗄️ Base de datos: MySQL (${process.env.MYSQL_DB_NAME})`);
//     console.log(aiService.isAvailable() ? `✅ IA: Gemini integrada y funcionando` : `⚠️ IA: No disponible - Revisa GEMINI_API_KEY`);
//     console.log(`🎯 Router Inteligente: ACTIVO`);
//     console.log(`🎨 Flujos de Personalización: ACTIVOS`);
//     console.log(`🛒 Sistema de Pedidos: INTEGRADO`);
//     console.log(`📱 Seguimiento Automático: FUNCIONANDO`);
//     console.log(`===============================================\n`);

//     console.log('🎵 TechAura Intelligent Bot está listo para:');
//     console.log('   • Analizar intenciones automáticamente');
//     console.log('   • Dirigir usuarios al flujo correcto');
//     console.log('   • Personalizar USBs completamente');
//     console.log('   • Procesar pedidos inteligentemente');
//     console.log('   • Hacer seguimiento persuasivo con cross-sell');
//     console.log('   • Generar analytics avanzados');
//     console.log('');
//     console.log('🚀 ¡Sistema inteligente completamente operativo!');

//   } catch (error: any) {
//     console.error('❌ Error crítico iniciando aplicación:', error);
//     console.error('Stack trace completo:', error.stack);
//     try {
//       if (businessDB) {
//         await businessDB.logError({
//           type: 'startup_error',
//           error: error.message,
//           stack: error.stack,
//           timestamp: new Date()
//         });
//       }
//     } catch (dbError) {
//       console.error('❌ No se pudo registrar el error en la base de datos:', dbError);
//     }
//     process.exit(1);
//   }
// };

// // Errores globales
// process.on('uncaughtException', async (error: any) => {
//   console.error('❌ Error no capturado:', error);
//   console.error('Stack trace:', error.stack);
//   try {
//     if (businessDB) {
//       await businessDB.logError({
//         type: 'uncaught_exception',
//         error: error.message,
//         stack: error.stack,
//         timestamp: new Date()
//       });
//     }
//   } catch (dbError) {
//     console.error('❌ Error logging to database:', dbError);
//   }
//   setTimeout(() => { process.exit(1); }, 1000);
// });

// process.on('unhandledRejection', async (reason, promise) => {
//   console.error('❌ Promesa rechazada no manejada:', reason);
//   console.error('Promise:', promise);
//   try {
//     if (businessDB) {
//       await businessDB.logError({
//         type: 'unhandled_rejection',
//         error: String(reason),
//         timestamp: new Date()
//       });
//     }
//   } catch (dbError) {
//     console.error('❌ Error logging to database:', dbError);
//   }
// });

// // Shutdown graceful
// const gracefulShutdown = async (signal: string) => {
//   console.log(`🛑 Recibida señal ${signal}, cerrando aplicación gracefully...`);
//   try {
//     if (businessDB) {
//       await businessDB.close();
//       console.log('✅ Conexiones de base de datos cerradas');
//     }
//     setTimeout(() => {
//       console.log('✅ Aplicación cerrada correctamente');
//       process.exit(0);
//     }, 2000);
//   } catch (error) {
//     console.error('❌ Error durante shutdown graceful:', error);
//     process.exit(1);
//   }
// };

// process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
// process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// // Exportar utilidades
// export { sendAutomaticMessage, generatePersonalizedFollowUp, initializeApp };

// // Iniciar aplicación
// const startApplication = async () => {
//   try {
//     startControlPanel();
//     await main();
//   } catch (error) {
//     console.error('❌ Error crítico al iniciar la aplicación:', error);
//     process.exit(1);
//   }
// };

// function shouldProcessMessage(from: any, message: string): boolean {
//   if (!message || message.trim().length === 0) return false;
//   const blockedUsers = ['blockedUser1@s.whatsapp.net', 'blockedUser2@s.whatsapp.net'];
//   if (blockedUsers.includes(from)) return false;
//   const currentHour = new Date().getHours();
//   if (currentHour < 8 || currentHour > 21) return false;
//   return true;
// }

// // Monitoreo de memoria cada 5 minutos
// setInterval(() => {
//   const used = process.memoryUsage();
//   const mb = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;
  
//   console.log(`💾 Memoria: RSS ${mb(used.rss)}MB | Heap ${mb(used.heapUsed)}/${mb(used.heapTotal)}MB`);
//   console.log(`📊 Sesiones: ${userSessions.size} | Cola: ${followUpQueue.size}`);
  
//   // Limpiar si la memoria está alta
//   if (used.heapUsed > 500 * 1024 * 1024) { // 500MB
//     console.log('⚠️ Memoria alta, ejecutando limpieza...');
//     if (global.processingCache) global.processingCache.clear();
//     global.gc && global.gc();
//   }
// }, 5 * 60 * 1000);

// startApplication();



import dotenv from 'dotenv';
dotenv.config();

import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import { MysqlAdapter as Database } from '@builderbot/database-mysql';
import { adapterDB, businessDB } from './mysql-database';

import { 
  canSendOnce, 
  setBotInstance, 
  getUserAnalytics, 
  getSmartRecommendations, 
  getConversationAnalysis, 
  updateUserSession, 
  userSessions, 
  getUserSession, 
  generatePersuasiveFollowUp, 
  sendFollowUpMessage, 
  triggerChannelReminder, 
  triggerBulkRemindersByChannel,
  isWhatsAppChatActive,
  followUpQueue,
  getFollowUpQueueStatus,
  isValidPhoneNumber,
  cleanupFollowUpQueue, 
  cleanInvalidPhones
} from './flows/userTrackingSystem';

import { initializeBotSystem } from './core/initializeBotSystem';
import { errorHandler } from './utils/errorHandler';
import { logger } from './utils/logger';

import { aiService } from './services/aiService';
import AIMonitoring from './services/aiMonitoring';
import { IntelligentRouter } from './services/intelligentRouter';

import { detectAndRouteUserIntent } from './support-functions';
import flowHeadPhones from './flows/flowHeadPhones';
import flowTechnology from './flows/flowTechnology';
import flowUsb from './flows/flowUsb';
import menuFlow from './flows/menuFlow';
import menuTech from './flows/menuTech';
import pageOrCatalog from './flows/pageOrCatalog';
import flowAsesor from './flows/flowAsesor';
import musicUsb from './flows/musicUsb';
import videosUsb from './flows/videosUsb';
import moviesUsb from './flows/moviesUsb';
import mainFlow from './flows/mainFlow';
import customUsb from './flows/customUsb';
import capacityMusic from './flows/capacityMusic';
import { datosCliente } from './flows/datosCliente';
import promosUsbFlow from './flows/promosUsbFlow';
import contentSelectionFlow from './flows/contentSelectionFlow';
import testCapture from './flows/testCapture';
import trackingDashboard from './flows/trackingDashboard';
import { startControlPanel } from './controlPanel';
import capacityVideo from './flows/capacityVideo';

import aiCatchAllFlow from './flows/mainFlow';
import aiAdminFlow from './flows/aiAdminFlow';
import catalogFlow from './flows/catalogFlow';
import customizationFlow from './flows/customizationFlow';
import orderFlow from './flows/orderFlow';

import USBDetector from './core/USBDetector';
import { ProcessingSystem } from './core/ProcessingSystem';

import { exec as cpExec } from 'child_process';
import util from 'util';
const exec = util.promisify(cpExec);

// Instancias auxiliares
const detector = new USBDetector();
const processor = new ProcessingSystem();

console.log('🔍 Debug - Variables de entorno:');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Configurada' : '❌ No encontrada');
console.log('MYSQL_DB_HOST:', process.env.MYSQL_DB_HOST);
console.log('MYSQL_DB_USER:', process.env.MYSQL_DB_USER);
console.log('MYSQL_DB_NAME:', process.env.MYSQL_DB_NAME);
console.log('PORT:', process.env.PORT);

// ==========================================
// === INTERFACES Y TIPOS ===
// ==========================================

interface ExtendedUserSession {
  phone: string;
  phoneNumber?: string;
  name?: string;
  stage?: string;
  currentFlow?: string;
  buyingIntent?: number;
  lastInteraction?: Date;
  lastFollowUp?: Date;
  followUpCount?: number;
  priorityScore?: number;
  urgencyLevel?: 'high' | 'medium' | 'low';
  isProcessing?: boolean;
  lastFollowUpReason?: string;
  interests?: string[];
  interactions?: any[];
  conversationData?: any;
  followUpSpamCount?: number;
  tags?: string[];
}

interface QueuedFollowUp {
  phone: string;
  urgency: 'high' | 'medium' | 'low';
  scheduledFor: number;
  timeoutId: NodeJS.Timeout;
  attempts: number;
  reason?: string;
}

// ==========================================
// === RATE LIMITING GLOBAL ===
// ==========================================

const RATE_GLOBAL = {
  perHourMax: 60,
  perDayMax: 5000,
  hourWindowStart: Date.now(),
  hourCount: 0,
  dayWindowStart: Date.now(),
  dayCount: 0
};

function resetRateLimitsIfNeeded() {
  const now = Date.now();
  
  // Reset hora (cada 60 minutos)
  if (now - RATE_GLOBAL.hourWindowStart >= 3600000) {
    RATE_GLOBAL.hourWindowStart = now;
    RATE_GLOBAL.hourCount = 0;
    console.log('🔄 Rate limit horario reseteado');
  }
  
  // Reset día (cada 24 horas)
  if (now - RATE_GLOBAL.dayWindowStart >= 86400000) {
    RATE_GLOBAL.dayWindowStart = now;
    RATE_GLOBAL.dayCount = 0;
    console.log('🔄 Rate limit diario reseteado');
  }
}

function canSendGlobal(): boolean {
  resetRateLimitsIfNeeded();
  return RATE_GLOBAL.hourCount < RATE_GLOBAL.perHourMax && 
         RATE_GLOBAL.dayCount < RATE_GLOBAL.perDayMax;
}

function markGlobalSent() {
  resetRateLimitsIfNeeded();
  RATE_GLOBAL.hourCount++;
  RATE_GLOBAL.dayCount++;
}

// ==========================================
// === DELAY ENTRE MENSAJES ===
// ==========================================

let lastFollowUpTimestamp = 0;
const FOLLOWUP_DELAY_MS = 3000; // 3 segundos

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

// ==========================================
// === UTILIDADES BÁSICAS ===
// ==========================================

async function initializeApp() {
  try {
    console.log('🚀 Iniciando inicialización de la aplicación...');
    const isConnected = await businessDB.testConnection();
    
    if (!isConnected) {
      console.error('❌ No se pudo conectar a MySQL. Verifica tu configuración.');
      console.error('   1. Asegúrate de que MySQL esté corriendo');
      console.error('   2. Verifica las credenciales en .env');
      console.error('   3. Verifica que la base de datos exista');
      process.exit(1);
    }
    
    await businessDB.initialize();
    console.log('✅ Inicialización completada exitosamente');
  } catch (error: any) {
    console.error('❌ Error crítico en inicialización:', error);
    throw error;
  }
}

let botInstance: any = null;
const ADMIN_PHONE = process.env.ADMIN_PHONE || '+573008602789';

const isWithinSendingWindow = (date = new Date()) => {
  const h = date.getHours();
  return h >= 8 && h <= 21;
};

function isHourAllowed(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 9 && h <= 21;
}

const buildCrossSellSnippet = async (phone: string, session: ExtendedUserSession) => {
  try {
    const analytics = await businessDB.getUserAnalytics(phone);
    const categories = analytics?.preferredCategories || session.interests || [];
    
    if (categories.includes('music') || categories.includes('música')) {
      return '➕ Suma un llavero LED (+$9.900) o upgrade a 64GB con 2.000+ canciones extra.';
    }
    if (categories.includes('videos') || categories.includes('películas') || categories.includes('movies')) {
      return '➕ Agrega trailers 4K y carátulas organizadas. Upgrade a 128GB por mejor relación GB/$';
    }
    return '➕ Recomendado: funda impermeable y grabado láser del nombre.';
  } catch {
    return '➕ Recomendado: funda impermeable y grabado láser del nombre.';
  }
};

const sendAutomaticMessage = async (phoneNumber: string, messages: string[]) => {
  if (!botInstance) {
    console.error('❌ Bot instance no disponible para envío automático');
    return;
  }
  
  if (!isWithinSendingWindow()) {
    console.log(`⏸️ Fuera de ventana horaria, no se envía a ${phoneNumber}`);
    return;
  }
  
  try {
    const groupedMessage = messages.join('\n\n');
    await botInstance.sendMessage(phoneNumber, groupedMessage, {});
    
    await businessDB.logMessage({
      phone: phoneNumber,
      message: groupedMessage,
      type: 'outgoing',
      automated: true,
      timestamp: new Date()
    });
    
    console.log(`📤 Mensaje automático enviado a ${phoneNumber}`);
  } catch (error) {
    console.error(`❌ Error enviando mensaje automático a ${phoneNumber}:`, error);
  }
};

const generatePersonalizedFollowUp = async (
  user: ExtendedUserSession,
  urgencyLevel: 'high' | 'medium' | 'low'
): Promise<string[]> => {
  try {
    const dbUser = await businessDB.getUserSession(user.phone);
    const userOrders = await businessDB.getUserOrders(user.phone);
    const userAnalytics = await businessDB.getUserAnalytics(user.phone);

    const name = (dbUser?.name || user.name || 'amigo').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "🌅 ¡Buenos días" : hour < 18 ? "☀️ ¡Buenas tardes" : "🌙 ¡Buenas noches";
    const messages: string[] = [];

    if (urgencyLevel === 'high') {
      messages.push(`🔥 ${greeting} ${name}! Oferta especial: 30% OFF solo por 2 horas más 🚀`);
      if (userOrders?.length > 0) {
        messages.push(`📦 Como ya compraste antes, tienes envío GRATIS garantizado.`);
      } else {
        messages.push(`📦 Primera compra = Envío GRATIS + garantía extendida.`);
      }
    } else if (urgencyLevel === 'medium') {
      messages.push(`${greeting} ${name}! ¿Listo para tu USB personalizada?`);
      messages.push(`🎁 Tu descuento reservado sigue disponible (tiempo limitado).`);
    } else {
      messages.push(`${greeting} ${name}! ¿Te ayudo a continuar con tu pedido?`);
    }

    if (userAnalytics?.preferredCategories?.length) {
      const interests = userAnalytics.preferredCategories.slice(0, 2);
      if (interests.length > 0) {
        messages.push(`🎵 Vi que te interesa ${interests.join(' y ')}. ¿Agregamos más géneros?`);
      }
    }

    const recommendations = getSmartRecommendations(user.phone, userSessions);
    if (recommendations?.length) {
      messages.push(`🔎 Basado en tu perfil, te recomiendo: ${recommendations.slice(0, 3).join(', ')}.`);
    }

    switch (user.stage) {
      case 'customizing':
        messages.push(`🎧 ¿Seguimos personalizando tu USB con más contenido?`);
        break;
      case 'pricing':
        messages.push(`💳 ¿Te muestro los precios especiales de hoy?`);
        break;
      case 'interested':
        messages.push(`🎶 ¿Retomamos tu pedido donde lo dejaste?`);
        break;
      case 'cart_abandoned':
        messages.push(`🛒 Tu carrito sigue guardado. ¿Finalizamos la compra?`);
        break;
    }

    const cs = await buildCrossSellSnippet(user.phone, user);
    messages.push(cs);

    if (urgencyLevel === 'high') {
      messages.push(`⚡ ¿Te reservo una USB con descuento? Solo responde "SÍ"`);
    } else {
      messages.push(`¿Continuamos? Responde "OK" o pregúntame lo que necesites 😊`);
    }

    return messages;
  } catch (error) {
    console.error('❌ Error generando seguimiento personalizado:', error);
    const name = user.name?.split(' ')[0] || 'amigo';
    return [
      `¡Hola ${name}! ¿Seguimos con tu USB personalizada?`,
      `🎵 Tengo ofertas especiales esperándote.`,
      `¿Continuamos? Responde "OK" 😊`
    ];
  }
};

console.log('🔧 Configurando sistema de análisis contextual...');
console.log('✅ Context Analyzer inicializado');
console.log('✅ Context Logger configurado');
console.log('✅ Middleware contextual disponible');

// Crear un pool de procesos limitado
class ProcessPool {
  private activeProcesses = 0;
  private readonly MAX_PROCESSES = 2;

  async execute(command: string, opts: { timeout?: number } = {}): Promise<string> {
    while (this.activeProcesses >= this.MAX_PROCESSES) {
      await new Promise(r => setTimeout(r, 100));
    }
    this.activeProcesses++;
    try {
      const { stdout } = await exec(command, { timeout: opts.timeout ?? 5000 });
      return stdout;
    } finally {
      this.activeProcesses--;
    }
  }
}


const processPool = new ProcessPool();

// Agregar al inicio de app.ts
setInterval(() => {
  const usage = process.memoryUsage();
  const heapPercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);
  
  console.log(`💾 Memoria: ${Math.round(usage.rss / 1024 / 1024)}MB RSS | Heap: ${heapPercent}%`);
  
  // Alerta crítica
  if (heapPercent > 90) {
    console.error('🚨 ALERTA: Memoria heap al 90%');
    
    // Forzar garbage collection si está disponible
    if (global.gc) {
      console.log('🧹 Ejecutando GC manual...');
      global.gc();
    }
  }
}, 30000); // Cada 30 segundos

// ==========================================
// === SISTEMA DE COLA MEJORADO ===
// ==========================================

class FollowUpQueueManager {
  private queue: Map<string, QueuedFollowUp> = new Map();
  private readonly MAX_QUEUE_SIZE = 5000;
  private readonly PRIORITY_WEIGHTS = { high: 3, medium: 2, low: 1 };

  add(phone: string, urgency: 'high' | 'medium' | 'low', delayMs: number, reason?: string): boolean {
  // ⚠️ ADVERTENCIA TEMPRANA
  const utilization = (this.queue.size / this.MAX_QUEUE_SIZE) * 100;
  if (utilization > 80) {
    console.warn(`⚠️ Cola al ${utilization.toFixed(1)}% de capacidad (${this.queue.size}/${this.MAX_QUEUE_SIZE})`);
  }
    // Si ya existe, actualizar prioridad si es mayor
    const existing = this.queue.get(phone);
    if (existing) {
      if (this.PRIORITY_WEIGHTS[urgency] > this.PRIORITY_WEIGHTS[existing.urgency]) {
        this.remove(phone);
        console.log(`🔄 Actualizando prioridad de ${phone}: ${existing.urgency} → ${urgency}`);
      } else {
        console.log(`⏭️ ${phone} ya en cola con prioridad ${existing.urgency}`);
        return false;
      }
    }

    // Si la cola está llena, remover el de menor prioridad
    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      const removed = this.removeLeastPriority();
      if (!removed) {
        console.log(`⚠️ Cola llena (${this.queue.size}), no se pudo agregar ${phone}`);
        return false;
      }
    }

    const timeoutId = setTimeout(async () => {
      await this.process(phone);
    }, delayMs);

    this.queue.set(phone, {
      phone,
      urgency,
      scheduledFor: Date.now() + delayMs,
      timeoutId,
      attempts: 0,
      reason
    });

    console.log(`➕ Encolado: ${phone} (${urgency}) en ${Math.round(delayMs/60000)}min | Cola: ${this.queue.size}/${this.MAX_QUEUE_SIZE}`);
    return true;
  }

  private async process(phone: string): Promise<void> {
    const item = this.queue.get(phone);
    if (!item) return;

    try {
      const session = userSessions.get(phone);
      if (!session) {
        console.log(`⚠️ Sesión no encontrada: ${phone}`);
        this.remove(phone);
        return;
      }

      // Verificar exclusiones
      if (isWhatsAppChatActive(session)) {
        console.log(`🚫 Chat activo WhatsApp: ${phone}`);
        this.remove(phone);
        return;
      }

      // Verificar ventana horaria
      if (!isHourAllowed()) {
        console.log(`⏰ Fuera de horario: ${phone}`);
        
        // Reprogramar para mañana a las 9 AM
        const tomorrow9am = new Date();
        tomorrow9am.setDate(tomorrow9am.getDate() + 1);
        tomorrow9am.setHours(9, 0, 0, 0);
        const delayMs = tomorrow9am.getTime() - Date.now();
        
        this.remove(phone);
        this.add(phone, item.urgency, delayMs, item.reason);
        return;
      }

      // Verificar límites globales
      if (!canSendGlobal()) {
        console.log(`⏸️ Límite global alcanzado, reintentando en 30min: ${phone}`);
        this.remove(phone);
        this.add(phone, item.urgency, 30 * 60 * 1000, item.reason);
        return;
      }

      // Aplicar retraso de 3 segundos entre mensajes
      await waitForFollowUpDelay();

      // Enviar seguimiento
      await sendFollowUpMessage(phone);
      
      console.log(`✅ Seguimiento enviado: ${phone} (${item.reason || 'sin razón'})`);
      this.remove(phone);

    } catch (error) {
      console.error(`❌ Error procesando ${phone}:`, error);
      
      // Reintentar hasta 2 veces
      if (item.attempts < 2) {
        item.attempts++;
        const retryDelay = 30 * 60 * 1000; // 30 min
        this.remove(phone);
        this.add(phone, item.urgency, retryDelay, `${item.reason} (reintento ${item.attempts})`);
        console.log(`🔄 Reintento ${item.attempts}/2 para ${phone}`);
      } else {
        this.remove(phone);
        console.log(`❌ Descartado tras 2 intentos: ${phone}`);
      }
    }
  }

  private removeLeastPriority(): boolean {
    let lowestPhone: string | null = null;
    let lowestPriority = Infinity;
    let oldestScheduled = Infinity;

    this.queue.forEach((item, phone) => {
      const priority = this.PRIORITY_WEIGHTS[item.urgency];
      
      // Priorizar por: 1) Menor prioridad, 2) Más antiguo
      if (priority < lowestPriority || 
          (priority === lowestPriority && item.scheduledFor < oldestScheduled)) {
        lowestPriority = priority;
        lowestPhone = phone;
        oldestScheduled = item.scheduledFor;
      }
    });

    if (lowestPhone) {
      this.remove(lowestPhone);
      console.log(`🗑️ Removido por prioridad baja: ${lowestPhone}`);
      return true;
    }
    return false;
  }

  remove(phone: string): void {
    const item = this.queue.get(phone);
    if (item) {
      clearTimeout(item.timeoutId);
      this.queue.delete(phone);
    }
  }

  getSize(): number {
  return this.queue.size;
}

  clear(): void {
    this.queue.forEach(item => clearTimeout(item.timeoutId));
    this.queue.clear();
    console.log('🧹 Cola completamente limpiada');
  }

  getStats() {
    const stats = {
      total: this.queue.size,
      maxSize: this.MAX_QUEUE_SIZE,
      utilizationPercent: Math.round((this.queue.size / this.MAX_QUEUE_SIZE) * 100),
      high: 0,
      medium: 0,
      low: 0,
      nextScheduled: [] as Array<{ phone: string; urgency: string; in: string; reason?: string }>
    };

    const items = Array.from(this.queue.values())
      .sort((a, b) => a.scheduledFor - b.scheduledFor);

    items.forEach(item => {
      stats[item.urgency]++;
    });

    // Mostrar los próximos 5 seguimientos
    items.slice(0, 5).forEach(item => {
      const minutesUntil = Math.round((item.scheduledFor - Date.now()) / 60000);
      stats.nextScheduled.push({
        phone: item.phone.slice(-4),
        urgency: item.urgency,
        in: minutesUntil > 0 ? `${minutesUntil}min` : 'ahora',
        reason: item.reason
      });
    });

    return stats;
  }
}

// Instancia global
const followUpQueueManager = new FollowUpQueueManager();

// ==========================================
// === LIMPIEZA AUTOMÁTICA DE LA COLA ===
// ==========================================

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  // Crear array temporal para evitar modificar durante iteración
  const phonesToRemove: string[] = [];

  followUpQueueManager['queue'].forEach((item, phone) => {
    const session = userSessions.get(phone);
    
    // Remover si:
    // 1. Usuario no existe
    // 2. Usuario fue convertido
    // 3. Usuario está en blacklist
    if (!session || 
        session.stage === 'converted' || 
        session.tags?.includes('blacklist')) {
      phonesToRemove.push(phone);
    }
  });

  phonesToRemove.forEach(phone => {
    followUpQueueManager.remove(phone);
    cleaned++;
  });

  if (cleaned > 0) {
    console.log(`🧹 Limpiados ${cleaned} seguimientos obsoletos`);
  }

  const stats = followUpQueueManager.getStats();
  console.log(`📊 Cola: ${stats.total}/${stats.maxSize} (${stats.utilizationPercent}%) | H:${stats.high} M:${stats.medium} L:${stats.low}`);
}, 15 * 60 * 1000); // Cada 15 minutos

// ==========================================
// === SISTEMA DE SEGUIMIENTO MEJORADO ===
// ==========================================

const activeFollowUpSystem = () => {
  console.log('🎯 Sistema de seguimiento con cola inteligente activo...');
  
  const systemState = {
    isRunning: false,
    lastExecution: 0,
    processedUsers: new Set<string>(),
    errorCount: 0,
    maxErrors: 10,
    cycleCount: 0
  };

  const executeFollowUpCycle = async () => {
    if (!isWithinSendingWindow()) {
      console.log('⏰ Fuera de ventana horaria (8:00-21:00)');
      return;
    }
    
    if (systemState.isRunning) {
      console.log('⏭️ Ciclo ya en ejecución, saltando...');
      return;
    }
    
    if (systemState.errorCount >= systemState.maxErrors) {
      console.log('❌ Demasiados errores, sistema pausado');
      return;
    }

    const now = Date.now();
    if (now - systemState.lastExecution < 5 * 60 * 1000) {
      return; // Mínimo 5 min entre ciclos
    }

    systemState.isRunning = true;
    systemState.lastExecution = now;
    systemState.cycleCount++;

    try {
      console.log(`\n🔄 ===== CICLO ${systemState.cycleCount} =====`);
      
      const queueStats = followUpQueueManager.getStats();
      console.log(`📊 Cola actual: ${queueStats.total}/${queueStats.maxSize} (${queueStats.utilizationPercent}%)`);

      // Obtener usuarios activos (limitar a 30 por ciclo)
      let activeUsers: any[] = [];
      try {
        if (typeof businessDB?.getActiveUsers === 'function') {
          activeUsers = (await businessDB.getActiveUsers(48) || []).slice(0, 20);
        } else {
          console.warn('⚠️ businessDB.getActiveUsers no disponible');
          return;
        }
      } catch (dbError) {
        console.error('❌ Error obteniendo usuarios activos:', dbError);
        systemState.errorCount++;
        return;
      }

      if (activeUsers.length === 0) {
        console.log('📭 No hay usuarios activos para seguimiento');
        return;
      }

      console.log(`📊 Analizando ${activeUsers.length} usuarios activos...`);
      let queued = 0;
      let skipped = 0;

      for (const user of activeUsers) {
        try {
          if (!user?.phone || typeof user.phone !== 'string') continue;

          // Verificar si ya fue procesado en esta hora
          const userKey = `${user.phone}_${new Date().getHours()}`;
          if (systemState.processedUsers.has(userKey)) {
            skipped++;
            continue;
          }

          const currentTime = new Date();
          const lastInteraction = user.lastInteraction ? new Date(user.lastInteraction) : new Date(0);
          const minSinceLast = (currentTime.getTime() - lastInteraction.getTime()) / (1000 * 60);
          const lastFollowUp = user.lastFollowUp ? new Date(user.lastFollowUp) : new Date(0);
          const hoursSinceFollowUp = (currentTime.getTime() - lastFollowUp.getTime()) / (1000 * 60 * 60);

          // Obtener analytics
          let userAnalytics: any = {};
          try {
            if (typeof businessDB?.getUserAnalytics === 'function') {
              userAnalytics = await businessDB.getUserAnalytics(user.phone) || {};
            }
          } catch (analyticsError) {
            console.warn(`⚠️ Error analytics ${user.phone}:`, analyticsError);
          }

          const buyingIntent = userAnalytics?.buyingIntent || user.buyingIntent || 0;

          // Determinar si necesita seguimiento
          let urgency: 'high' | 'medium' | 'low' = 'low';
          let needsFollowUp = false;
          let minDelayRequired = 2;
          let reason = '';
          let delayMinutes = 120; // Default: 2 horas

          if (buyingIntent > 85 && minSinceLast > 15 && hoursSinceFollowUp > 1) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 1;
            delayMinutes = 30;
            reason = 'Alta intención de compra (>85%)';
          } else if (buyingIntent > 70 && minSinceLast > 30 && hoursSinceFollowUp > 2) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 2;
            delayMinutes = 60;
            reason = 'Buena intención de compra (>70%)';
          } else if (user.stage === 'pricing' && minSinceLast > 20 && hoursSinceFollowUp > 1.5) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 1.5;
            delayMinutes = 45;
            reason = 'Consultó precios';
          } else if (user.stage === 'cart_abandoned' && minSinceLast > 30 && hoursSinceFollowUp > 2) {
            needsFollowUp = true;
            urgency = 'high';
            minDelayRequired = 2;
            delayMinutes = 60;
            reason = 'Carrito abandonado';
          } else if (user.stage === 'customizing' && minSinceLast > 45 && hoursSinceFollowUp > 3) {
            needsFollowUp = true;
            urgency = 'medium';
            minDelayRequired = 3;
            delayMinutes = 90;
            reason = 'Personalizando producto';
          } else if (user.stage === 'interested' && minSinceLast > 90 && hoursSinceFollowUp > 4) {
            needsFollowUp = true;
            urgency = 'medium';
            minDelayRequired = 4;
            delayMinutes = 120;
            reason = 'Mostró interés';
          } else if (minSinceLast > 240 && hoursSinceFollowUp > 8) {
            needsFollowUp = true;
            urgency = 'low';
            minDelayRequired = 8;
            delayMinutes = 180;
            reason = 'Seguimiento general';
          }

          if (needsFollowUp && hoursSinceFollowUp >= minDelayRequired) {
  // ⚠️ NUEVO: Solo encolar si tiene alta prioridad o la cola no está muy llena
  const queueUtilization = (followUpQueueManager.getSize() / 1000) * 100;
  
  if (urgency === 'high' || queueUtilization < 80) {
    const added = followUpQueueManager.add(
      user.phone, 
      urgency, 
      delayMinutes * 60 * 1000,
      reason
    );
            
            if (added) {
              queued++;
              systemState.processedUsers.add(userKey);
              console.log(`📋 Encolado: ${user.phone} (${urgency}) - ${reason}`);
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }

        }} catch (userError) {
          console.error(`❌ Error analizando usuario ${user?.phone}:`, userError);
          systemState.errorCount++;
          continue;
        }
      }

      console.log(`✅ Ciclo completado: ${queued} encolados, ${skipped} omitidos`);
      
      const finalStats = followUpQueueManager.getStats();
      console.log(`📊 Estado final: ${finalStats.total}/${finalStats.maxSize} (${finalStats.utilizationPercent}%)`);
      
      if (queued > 0) {
        systemState.errorCount = Math.max(0, systemState.errorCount - 1);
      }

    } catch (error) {
      console.error('❌ Error crítico en ciclo de seguimiento:', error);
      systemState.errorCount++;
    } finally {
      systemState.isRunning = false;
    }
  };

  const executeMaintenanceCycle = async () => {
    try {
      console.log('\n🧹 ===== MANTENIMIENTO DEL SISTEMA =====');
      
      // Limpiar usuarios procesados cada hora
      systemState.processedUsers.clear();
      console.log('✅ Cache de usuarios procesados limpiado');

      // Resetear contador de errores si ha pasado tiempo
      const now = Date.now();
      if (systemState.errorCount > 0 && now - systemState.lastExecution > 60 * 60 * 1000) {
        systemState.errorCount = 0;
        console.log('🔄 Contador de errores reseteado');
      }

      // Ejecutar mantenimiento de BD
      if (typeof businessDB?.resetSpamCounters === 'function') {
        await businessDB.resetSpamCounters(24);
        console.log('✅ Contadores de spam reseteados');
      }
      
      if (typeof businessDB?.cleanInactiveSessions === 'function') {
        await businessDB.cleanInactiveSessions(7 * 24);
        console.log('✅ Sesiones inactivas limpiadas');
      }

      // Mostrar estadísticas
      const stats = followUpQueueManager.getStats();
      console.log(`📊 Estadísticas:`);
      console.log(`   - Cola: ${stats.total}/${stats.maxSize} (${stats.utilizationPercent}%)`);
      console.log(`   - Prioridades: H:${stats.high} M:${stats.medium} L:${stats.low}`);
      console.log(`   - Ciclos ejecutados: ${systemState.cycleCount}`);
      console.log(`   - Errores: ${systemState.errorCount}/${systemState.maxErrors}`);
      console.log(`   - Rate limits: ${RATE_GLOBAL.hourCount}/${RATE_GLOBAL.perHourMax}h | ${RATE_GLOBAL.dayCount}/${RATE_GLOBAL.perDayMax}d`);
      
      if (stats.nextScheduled.length > 0) {
        console.log(`   - Próximos seguimientos:`);
        stats.nextScheduled.forEach((item, i) => {
          console.log(`     ${i+1}. ${item.phone} (${item.urgency}) en ${item.in} - ${item.reason || 'N/A'}`);
        });
      }
      
      console.log('✅ Mantenimiento completado\n');
    } catch (error) {
      console.error('❌ Error en mantenimiento:', error);
    }
  };

  // Ejecutar ciclo cada 10 minutos
  const followUpInterval = setInterval(executeFollowUpCycle, 15 * 60 * 1000);
  
  // Mantenimiento cada hora
  const maintenanceInterval = setInterval(executeMaintenanceCycle, 60 * 60 * 1000);
  
  // Ejecutar primer ciclo después de 30 segundos
  setTimeout(executeFollowUpCycle, 30 * 1000);

  console.log('✅ Sistema de seguimiento configurado exitosamente');
  console.log(`   - Ciclos cada 10 minutos`);
  console.log(`   - Mantenimiento cada hora`);
  console.log(`   - Cola máxima: 5000 usuarios`);
  console.log(`   - Delay entre mensajes: 3 segundos`);

  const cleanup = () => {
    clearInterval(followUpInterval);
    clearInterval(maintenanceInterval);
    followUpQueueManager.clear();
    console.log('🛑 Sistema de seguimiento detenido');
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return {
    stop: cleanup,
    getStatus: () => ({
      ...systemState,
      queue: followUpQueueManager.getStats(),
      rateLimits: {
        hourly: `${RATE_GLOBAL.hourCount}/${RATE_GLOBAL.perHourMax}`,
        daily: `${RATE_GLOBAL.dayCount}/${RATE_GLOBAL.perDayMax}`
      }
    })
  };
};

// ==========================================
// === FLUJOS DEL BOT ===
// ==========================================

const audioFlow = addKeyword<Provider, Database>(EVENTS.VOICE_NOTE)
  .addAction(async (ctx: any, { flowDynamic, endFlow }) => {
    try {
      if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();
      
      console.log(`🎤 Audio recibido de ${ctx.from}`);
      const session = await getUserSession(ctx.from);
      
      await updateUserSession(
        ctx.from,
        '[AUDIO_MESSAGE]',
        'audio_received',
        null,
        false,
        { metadata: { ...session, name: ctx.name || ctx.pushName } }
      );
      
      await businessDB.logInteraction({
        phone: ctx.from,
        type: 'audio_received',
        content: '[VOICE_NOTE]',
        timestamp: new Date()
      });

      const userAnalytics = await businessDB.getUserAnalytics(ctx.from);
      const isReturningCustomer = userAnalytics?.totalOrders > 0;
      let response: string;

      if (isReturningCustomer) {
        response = `🎤 ¡${session?.name || 'Amigo'}! Escuché tu audio. Como ya conoces nuestros productos, ¿qué necesitas esta vez?`;
      } else {
        const responses = [
          "🎤 ¡Escuché tu audio! ¿Te interesa música, películas o videos para tu USB?",
          "🔊 ¡Perfecto! Recibí tu voz. ¿Qué tipo de contenido buscas para tu USB personalizada?",
          "🎵 ¡Genial tu audio! ¿Prefieres música, videos o películas?"
        ];
        response = responses[Math.floor(Math.random() * responses.length)];
      }
      
      await flowDynamic([response]);

      const cross = await buildCrossSellSnippet(ctx.from, session as any);
      const options = [
        "💰 Precios desde $59.900",
        cross,
        "",
        "Puedes decir:",
        "🎵 'música' - USB musicales",
        "🎬 'películas' - USB de películas",
        "🎥 'videos' - USB de videos",
        "💰 'precios' - Ver opciones",
        "👨‍💼 'asesor' - Hablar con humano"
      ];
      
      await flowDynamic([options.join('\n')]);
    } catch (error) {
      console.error('❌ Error procesando audio:', error);
      await flowDynamic([
        "🎤 Recibí tu audio, pero hubo un problema.",
        "¿Podrías escribirme qué necesitas? Te ayudo con USBs personalizadas 😊"
      ]);
    }
  });

const mediaFlow = addKeyword<Provider, Database>(EVENTS.DOCUMENT)
  .addAction(async (ctx: any, { flowDynamic, endFlow }) => {
    try {
      if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();
      
      console.log(`📎 Documento/Media recibido de ${ctx.from}`);

      const session = await getUserSession(ctx.from);
      await updateUserSession(ctx.from, '[DOCUMENT/MEDIA]', 'media_received', null, false, { metadata: session });
      
      await businessDB.logInteraction({
        phone: ctx.from,
        type: 'document_received',
        content: '[DOCUMENT/MEDIA]',
        timestamp: new Date()
      });

      const cross = await buildCrossSellSnippet(ctx.from, session as any);
      await flowDynamic([
        "📎 Vi que me enviaste un archivo.",
        "🎵 ¿Personalizamos una USB con contenido similar?",
        cross,
        "",
        "💰 Precios desde $59.900",
        "Dime: ¿música, videos o películas?"
      ].join('\n'));
    } catch (error) {
      console.error('❌ Error procesando documento:', error);
      await flowDynamic([
        "📎 Recibí tu archivo, pero hubo un problema.",
        "¿Podrías decirme qué tipo de USB necesitas? 😊"
      ]);
    }
  });

const intelligentMainFlow = addKeyword<Provider, Database>([EVENTS.WELCOME])
  .addAction(async (ctx: any, { gotoFlow, flowDynamic, endFlow }) => {
    try {
      if (!shouldProcessMessage(ctx.from, ctx.body || '')) return endFlow();
      if (!ctx.body || ctx.body.trim().length === 0) return endFlow();
      if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) return endFlow();

      const lowerBody = ctx.body.toLowerCase();
      if (lowerBody.includes('telegram') || lowerBody.includes('notificación de')) return endFlow();

      console.log(`🎯 Mensaje recibido de ${ctx.from}: ${ctx.body}`);

      let session: ExtendedUserSession;
      try {
        const userSession = await getUserSession(ctx.from); 
        if (!userSession) return gotoFlow(mainFlow);
        
        session = {
          phone: userSession.phone,
          phoneNumber: userSession.phoneNumber,
          name: userSession.name,
          stage: userSession.stage,
          currentFlow: userSession.currentFlow,
          buyingIntent: userSession.buyingIntent,
          lastInteraction: userSession.lastInteraction,
          lastFollowUp: userSession.lastFollowUp,
          followUpCount: userSession.followUpSpamCount,
          isProcessing: userSession.isProcessing,
          interests: userSession.interests,
          interactions: userSession.interactions,
          conversationData: userSession.conversationData ?? {},
          followUpSpamCount: userSession.followUpSpamCount ?? 0,
          tags: userSession.tags
        };
      } catch (sessionError) {
        console.error('❌ Error obteniendo sesión:', sessionError);
        return gotoFlow(mainFlow);
      }

      if (session.isProcessing) return endFlow();

      session.isProcessing = true;
      await updateUserSession(ctx.from, ctx.body, 'processing', null, true, { metadata: session });

      try {
        const lockedStages = new Set(['customizing','pricing','closing','order_confirmed','orderFlow']);
        if (session.stage && lockedStages.has(session.stage)) {
          session.isProcessing = false;
          await updateUserSession(ctx.from, ctx.body, session.currentFlow || 'orderFlow', null, false, { metadata: session });
          return endFlow();
        }

        const lower = (ctx.body||'').toLowerCase();
        
        // PRIORIDAD: soporte/estado de pedido
        const isStatusIntent = /\b(estado|como va|cómo va|microsd|micro ?sd|tarjeta|memoria|pedido|orden|entrega|env[ií]o|retraso|demora|list[ao]|hecho|avance)\b/.test(lower);
        if (isStatusIntent) {
          await updateUserSession(ctx.from, ctx.body, 'orderFlow', 'status_query', false, {
            metadata: { source: 'status_priority', raw: ctx.body }
          });
          
          await flowDynamic([
            '📦 Revisando tu pedido ahora mismo...',
            '¿Te gustaría agregar algo más?'
          ]);
          return endFlow();
        }
        
        if (/\b(gracias).*(adios|adiós|bye|vay|chao)\b/.test(lower)) {
          const s = await getUserSession(ctx.from);
          s.stage = 'abandoned';
          
          if (canSendOnce(s,'farewell',720)) {
            await botInstance.sendMessage(ctx.from, "Gracias por escribirnos. Si deseas retomar la USB, di 'RETOMAR'. ¡Aquí estaré!.", {});
          }
          
          await updateUserSession(ctx.from, ctx.body, s.currentFlow || 'mainFlow', null, false, { metadata: s });
          return endFlow();
        }

        const isSimpleGreeting = /^(hola|buenos dias|buenas|buenas tardes|buenas noches|hello|hi)\b/i.test(lower);
        const lastMins = session?.lastInteraction ? (Date.now() - new Date(session.lastInteraction).getTime())/60000 : 999;
        
        if (isSimpleGreeting && lastMins < 60) {
          await flowDynamic([
            '👋 ¡Hola! Te leo. ¿Deseas continuar con tu pedido o resolver una duda puntual?'
          ]);
          return endFlow();
        }

        const router = IntelligentRouter.getInstance();
        const decision = await router.analyzeAndRoute(ctx.body, session as any);

        if (session.stage==='customizing') {
          await flowDynamic([ 
            `🎼 Listo. USB, sin relleno ni repetidas.`,
            `Elige capacidad:`,
            `1) 8GB • 1.400 canciones • $59.900`,
            `2) 32GB • 5.000 canciones • $89.900`,
            `3) 64GB • 10.000 canciones • $129.900`,
            `4) 128GB • 25.000 canciones • $169.900`,
            `Responde 1-4 para continuar.`
          ].join('\n'));
          
          await updateUserSession(ctx.from, ctx.body, 'orderFlow', 'capacity_selection', false, { metadata: session });
          return endFlow();
        }

        console.log(`🧠 Decisión del router: ${decision.action} (${decision.confidence}%) - ${decision.reason}`);

        if (!decision.shouldIntercept) {
          session.isProcessing = false;
          await updateUserSession(ctx.from, ctx.body, 'continue', 'continue_step', false, { metadata: session });
          return endFlow();
        }

        session.isProcessing = false;
        session.currentFlow = decision.action;
        await updateUserSession(ctx.from, ctx.body, decision.action, null, false, { metadata: { ...session, decision } });

        switch (decision.action) {
          case 'welcome': return gotoFlow(mainFlow);
          case 'catalog': return gotoFlow(catalogFlow);
          case 'customize': return gotoFlow(customizationFlow);
          case 'order': return gotoFlow(orderFlow);
          case 'music': return gotoFlow(musicUsb);
          case 'videos': return gotoFlow(videosUsb);
          case 'movies': return gotoFlow(moviesUsb);
          case 'advisor': return gotoFlow(flowAsesor);
          case 'pricing':
            await flowDynamic([
              '💰 Precios TechAura:\n' +
              '🎵 USB Musical Básica: $59.900 (8GB, +1.400 canciones)\n' +
              '⭐ USB Premium: $89.900 (32GB, +4.000 canciones, diseño personalizado)\n' +
              '👑 USB VIP: $129.900 (64GB, +8.000 canciones, videos musicales)\n' +
              '🚀 USB Mega: $169.900 (128GB, +15.000 canciones, videos + películas)\n' +
              '\nIncluye: Envío, 1 año de garantía y soporte.\n' +
              '¿Te interesa alguna opción específica?'
            ]);
            return endFlow();
          case 'ai_response':
            if (aiService?.isAvailable()) return gotoFlow(aiCatchAllFlow);
            return gotoFlow(mainFlow);
          default:
            return gotoFlow(mainFlow);
        }
      } catch (routerError) {
        console.error('❌ Error en router:', routerError);
        session.isProcessing = false;
        session.currentFlow = 'error';
        
        await updateUserSession(ctx.from, 'ERROR', 'error', 'error_step', false, {
          metadata: { ...session, errorTimestamp: new Date().toISOString() }
        });
        
        return gotoFlow(mainFlow);
      }
    } catch (error) {
      console.error('❌ Error crítico en flujo principal:', error);
      
      try {
        const s = await getUserSession(ctx.from);
        if (s) {
          s.isProcessing = false;
          s.currentFlow = 'critical_error';
          
          await updateUserSession(ctx.from, 'CRITICAL_ERROR', 'critical_error', 'critical_step', false, {
            metadata: { ...s, isCritical: true, lastError: new Date().toISOString() }
          });
        }
      } catch (cleanupError) {
        console.error('❌ Error en limpieza de emergencia:', cleanupError);
      }
      
      return gotoFlow(mainFlow);
    }
  });

// ==========================================
// === FUNCIÓN PRINCIPAL ===
// ==========================================

const main = async () => {
  try {
    console.log('🚀 Iniciando TechAura Intelligent Bot...');
    await initializeApp();

    const adapterFlow = createFlow([
      intelligentMainFlow,
      mainFlow, catalogFlow, customizationFlow, orderFlow,
      musicUsb, videosUsb, moviesUsb, menuTech, customUsb, capacityMusic, capacityVideo,
      aiAdminFlow, aiCatchAllFlow,
      audioFlow, mediaFlow,
      testCapture, trackingDashboard,
      contentSelectionFlow, promosUsbFlow, datosCliente,
      flowAsesor, flowHeadPhones, flowTechnology, flowUsb, menuFlow, pageOrCatalog
    ]);

    const adapterProvider = createProvider(Provider, {
      browser: ["TechAura-Intelligent-Bot", "Chrome", "114.0.5735.198"],
      version: [2, 3800, 1023223821],
    });

    const { handleCtx, httpServer } = await createBot({
      flow: adapterFlow,
      provider: adapterProvider as any,
      database: adapterDB,
    });

    // Instancia del bot
    botInstance = {
      sendMessage: async (phone: string, message: string, options: Record<string, unknown>) => {
        try {
          const result = await adapterProvider.sendMessage(
            phone,
            typeof message === 'string' ? message : JSON.stringify(message),
            options || {}
          );
          
          await businessDB.logMessage({
            phone,
            message: typeof message === 'string' ? message : JSON.stringify(message),
            type: 'outgoing',
            automated: true,
            timestamp: new Date()
          });
          
          return result;
        } catch (error) {
          console.error(`❌ Error enviando mensaje a ${phone}:`, error);
          throw error;
        }
      },
      sendMessageWithMedia: async (phone: string, payload: { body: string; mediaUrl: string; caption?: string }, options: Record<string, unknown>) => {
        try {
          if (typeof (adapterProvider as any).sendMessageWithMedia === 'function') {
            const result = await (adapterProvider as any).sendMessageWithMedia(phone, payload, options || {});
            
            await businessDB.logMessage({
              phone,
              message: `${payload.body}\n[media: ${payload.mediaUrl}]`,
              type: 'outgoing',
              automated: true,
              timestamp: new Date()
            });
            
            return result;
          } else {
            return await botInstance.sendMessage(phone, payload.body, options);
          }
        } catch (error) {
          console.error(`❌ Error enviando media a ${phone}:`, error);
          throw error;
        }
      }
    };

    setBotInstance(botInstance);

    setTimeout(() => {
      try {
        activeFollowUpSystem();
        console.log('✅ Sistema de seguimiento automático iniciado');
      } catch (error) {
        console.error('❌ Error iniciando sistema de seguimiento:', error);
      }
    }, 6000);

    // ==========================================
    // === ENDPOINTS API ===
    // ==========================================

    // Endpoint mejorado para monitorear la cola
    adapterProvider.server.get('/v1/followup/queue', handleCtx(async (bot, req, res) => {
      try {
        const stats = followUpQueueManager.getStats();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            ...stats,
            globalLimits: {
              hourly: {
                current: RATE_GLOBAL.hourCount,
                max: RATE_GLOBAL.perHourMax,
                percent: Math.round((RATE_GLOBAL.hourCount / RATE_GLOBAL.perHourMax) * 100)
              },
              daily: {
                current: RATE_GLOBAL.dayCount,
                max: RATE_GLOBAL.perDayMax,
                percent: Math.round((RATE_GLOBAL.dayCount / RATE_GLOBAL.perDayMax) * 100)
              }
            },
            health: stats.utilizationPercent < 80 ? 'healthy' : stats.utilizationPercent < 95 ? 'warning' : 'critical'
          },
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats' }));
      }
    }));

    adapterProvider.server.get('/v1/followup/stats', handleCtx(async (bot, req, res) => {
      try {
        const stats = followUpQueueManager.getStats();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          data: stats, 
          timestamp: new Date().toISOString() 
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo stats de seguimiento:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats' }));
      }
    }));

    // Endpoints USB/Producción
    adapterProvider.server.get('/v1/usb/devices', handleCtx(async (bot, req, res) => {
      try {
        const WriterMod = await import('./core/USBWriter');
        const writer = new (WriterMod.default as any)();
        await writer.detectAvailableDevices();
        const devices = (writer as any).availableDevices || [];
        
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: true, devices }));
      } catch (e:any) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:false, error: e.message }));
      }
    }));

    adapterProvider.server.get('/v1/production-jobs', handleCtx(async (bot, req, res) => {
      try {
        const status = (req.query?.status as string) || undefined;
        const listFn = (businessDB as any).listProcessingJobs || (businessDB as any).getPendingProcessingJobs;
        const jobs = listFn ? await listFn({ statuses: status ? [status] : undefined, limit: 200 }) : [];
        
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: true, jobs }));
      } catch (e:any) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:false, error: e.message }));
      }
    }));

    adapterProvider.server.post('/v1/usb/start', handleCtx(async (bot, req, res) => {
      try {
        let body = ''; 
        req.on('data', c => body += c); 
        await new Promise(r => req.on('end', r));
        
        const { jobId, deviceId } = JSON.parse(body || '{}');
        
        if (!jobId) {
          res.writeHead(400, {'Content-Type':'application/json'});
          return res.end(JSON.stringify({ ok:false, error:'jobId requerido' }));
        }
        
        const getById = (businessDB as any).getProcessingJobById || (businessDB as any).findProcessingJob;
        const job = getById ? await getById(Number(jobId)) : null;
        
        if (!job) {
          res.writeHead(404, {'Content-Type':'application/json'});
          return res.end(JSON.stringify({ ok:false, error:'Job no encontrado' }));
        }
        
        const { ProcessingSystem } = await import('./core/ProcessingSystem');
        const ps = new ProcessingSystem();
        ps.run({ job }).catch(()=>{});
        
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: true, started: true }));
      } catch (e:any) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:false, error: e.message }));
      }
    }));

    adapterProvider.server.post('/v1/usb/retry', handleCtx(async (bot, req, res) => {
      try {
        let body=''; 
        req.on('data',c=>body+=c); 
        await new Promise(r => req.on('end', r));
        
        const { jobId } = JSON.parse(body||'{}');
        
        if (!jobId) {
          res.writeHead(400, {'Content-Type':'application/json'});
          return res.end(JSON.stringify({ ok:false, error:'jobId requerido' }));
        }
        
        const updater = (businessDB as any).updateProcessingJobV2 || (businessDB as any).updateProcessingJob;
        await updater({ id: Number(jobId), status: 'retry', fail_reason: null });
        
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:true }));
      } catch (e:any) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:false, error:e.message }));
      }
    }));

    adapterProvider.server.post('/v1/usb/cancel', handleCtx(async (bot, req, res) => {
      try {
        let body=''; 
        req.on('data',c=>body+=c); 
        await new Promise(r => req.on('end', r));
        
        const { jobId } = JSON.parse(body||'{}');
        
        if (!jobId) {
          res.writeHead(400, {'Content-Type':'application/json'});
          return res.end(JSON.stringify({ ok:false, error:'jobId requerido' }));
        }
        
        const updater = (businessDB as any).updateProcessingJobV2 || (businessDB as any).updateProcessingJob;
        await updater({ id: Number(jobId), status: 'canceled' });
        
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:true }));
      } catch (e:any) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:false, error:e.message }));
      }
    }));

    // Endpoints Analytics
    adapterProvider.server.get('/v1/analytics', handleCtx(async (bot, req, res) => {
      try {
        const stats = await businessDB.getGeneralAnalytics();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          data: stats, 
          timestamp: new Date().toISOString() 
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo analytics:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo analytics' }));
      }
    }));

    adapterProvider.server.get('/v1/user/:phone', handleCtx(async (bot, req, res) => {
      try {
        const phone = req.params?.phone;
        
        if (!phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Número de teléfono requerido' }));
          return;
        }
        
        const user = await businessDB.getUserSession(phone);
        const analytics = await businessDB.getUserAnalytics(phone);
        const orders = await businessDB.getUserOrders(phone);
        
        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
            success: true, 
            data: { user, analytics, orders, timestamp: new Date().toISOString() } 
          }, null, 2));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Usuario no encontrado' }));
        }
      } catch (error) {
        console.error('❌ Error obteniendo usuario:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error interno del servidor' }));
      }
    }));

    adapterProvider.server.get('/v1/ai/stats', handleCtx(async (bot, req, res) => {
      try {
        const aiStats = {
          isAvailable: aiService.isAvailable(),
          provider: 'gemini',
          status: aiService.isAvailable() ? 'active' : 'inactive',
          monitoring: AIMonitoring.getStats(),
          intelligentRouter: {
            active: true,
            version: '2.0',
            features: ['Context Analysis', 'Intent Detection', 'Automatic Routing', 'Persuasion Elements', 'Smart Recommendations']
          },
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: aiStats }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo stats de IA:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats de IA' }));
      }
    }));

    adapterProvider.server.get('/v1/sales/stats', handleCtx(async (bot, req, res) => {
      try {
        const salesStats = await businessDB.getSalesAnalytics();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          data: salesStats, 
          timestamp: new Date().toISOString() 
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo estadísticas de ventas:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo estadísticas de ventas' }));
      }
    }));

    adapterProvider.server.get('/v1/dashboard', handleCtx(async (bot, req, res) => {
      try {
        const dashboard = await businessDB.getDashboardData();
        const intelligentData = {
          ...dashboard,
          intelligentSystem: {
            routerDecisions: await businessDB.getRouterStats(),
            conversionRates: await businessDB.getConversionStats(),
            userJourney: await businessDB.getUserJourneyStats(),
            aiInteractions: AIMonitoring.getStats()
          },
          followUpSystem: followUpQueueManager.getStats()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          data: intelligentData, 
          timestamp: new Date().toISOString() 
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo dashboard:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo dashboard' }));
      }
    }));

    adapterProvider.server.get('/v1/conversations/analysis', handleCtx(async (bot, req, res) => {
      try {
        const analysis = await businessDB.getConversationAnalysis();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          data: analysis, 
          timestamp: new Date().toISOString() 
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo análisis de conversaciones:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo análisis' }));
      }
    }));

    adapterProvider.server.get('/v1/recommendations/:phone', handleCtx(async (bot, req, res) => {
      try {
        const phone = req.params?.phone;
        
        if (!phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Número de teléfono requerido' }));
          return;
        }
        
        const recommendations = getSmartRecommendations(phone, userSessions);
        const userAnalytics = await getUserAnalytics(phone);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          data: { recommendations, analytics: userAnalytics, timestamp: new Date().toISOString() } 
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo recomendaciones:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo recomendaciones' }));
      }
    }));

    adapterProvider.server.get('/v1/router/stats', handleCtx(async (bot, req, res) => {
      try {
        const routerStats = await businessDB.getRouterStats();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            ...routerStats,
            systemInfo: {
              version: '2.0',
              features: ['Intent Detection', 'Context Analysis', 'Automatic Routing', 'Confidence Scoring', 'Persuasion Integration'],
              accuracy: routerStats.totalDecisions > 0 ?
                (routerStats.successfulRoutes / routerStats.totalDecisions * 100).toFixed(2) + '%' : 'N/A'
            }
          },
          timestamp: new Date().toISOString()
        }, null, 2));
      } catch (error) {
        console.error('❌ Error obteniendo stats del router:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error obteniendo stats del router' }));
      }
    }));

    adapterProvider.server.post('/v1/send-message', handleCtx(async (bot, req, res) => {
      try {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { phone, message, urgent = false, channel } = JSON.parse(body || '{}');
            
            if (!phone || !message) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Phone y message son requeridos' }));
              return;
            }
            
            const messages = Array.isArray(message) ? message : [message];
            const urgency: 'high' | 'medium' | 'low' = urgent ? 'high' : 'medium';

            if (channel) {
              const ok = await triggerChannelReminder(phone, channel, urgency);
              res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: ok,
                message: ok ? 'Mensaje enviado correctamente' : 'No se pudo enviar (posible protección anti-spam)',
                timestamp: new Date().toISOString()
              }));
              return;
            }

            const grouped = messages.join('\n\n');
            await botInstance.sendMessage(phone, grouped, {});
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Mensaje enviado correctamente', 
              timestamp: new Date().toISOString() 
            }));
          } catch (parseError) {
            console.error('❌ Error parseando request:', parseError);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'JSON inválido' }));
          }
        });
      } catch (error) {
        console.error('❌ Error enviando mensaje manual:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Error interno del servidor' }));
      }
    }));

    adapterProvider.server.post('/v1/admin/migrate', async (req, res) => {
      try {
        console.log('🔧 Ejecutando migración manual de base de datos...');
        const { runManualMigration } = await import('./scripts/migrateDatabase');
        const result = await runManualMigration();
        
        if (result.success) {
          console.log('✅ Migración manual completada exitosamente');
          return res.json({ 
            success: true, 
            message: result.message, 
            timestamp: new Date().toISOString() 
          });
        } else {
          console.error('❌ Error en migración manual:', result.message);
          return res.status(500).json({ 
            success: false, 
            error: result.message, 
            timestamp: new Date().toISOString() 
          });
        }
      } catch (error: any) {
        console.error('❌ Error ejecutando migración manual:', error);
        return res.status(500).json({ 
          success: false, 
          error: error.message, 
          timestamp: new Date().toISOString() 
        });
      }
    });

    adapterProvider.server.post('/api/new-order', handleCtx(async (bot, req, res) => {
      try {
        const orderData = req.body;
        
        if (!orderData || !orderData.orderId) {
          return res.status(400).json({ 
            success: false, 
            message: 'Datos del pedido inválidos', 
            errors: ['orderId es requerido'] 
          });
        }
        
        const fetch = await import('node-fetch').then(m => m.default);
        const response = await fetch('http://localhost:3009/api/new-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ...orderData, 
            metadata: { validated: true, timestamp: new Date().toISOString() } 
          })
        });

        let responseData: any = null;
        try { 
          responseData = await response.json(); 
        } catch {}

        if (response.status === 200 || response.status === 201) {
          return res.status(200).json({
            success: true,
            message: 'Pedido recibido y encolado',
            orderId: orderData.orderId,
            processorResponse: responseData || null
          });
        } else {
          const errMsg = responseData?.message || `Autoprocesador respondió con estado ${response.status}`;
          return res.status(502).json({ 
            success: false, 
            message: 'Error del autoprocesador', 
            details: responseData || { status: response.status, message: errMsg } 
          });
        }
      } catch (error) {
        console.error('❌ Error procesando pedido:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
      }
    }));

    adapterProvider.server.get('/v1/health', handleCtx(async (bot, req, res) => {
      try {
        const queueStats = followUpQueueManager.getStats();
        
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: await businessDB.checkConnection(),
            ai: aiService.isAvailable(),
            bot: !!botInstance,
            followUpSystem: true
          },
          followUpQueue: {
            size: queueStats.total,
            maxSize: queueStats.maxSize,
            utilization: queueStats.utilizationPercent,
            health: queueStats.utilizationPercent < 80 ? 'healthy' : 
                    queueStats.utilizationPercent < 95 ? 'warning' : 'critical'
          },
          rateLimits: {
            hourly: {
              current: RATE_GLOBAL.hourCount,
              max: RATE_GLOBAL.perHourMax,
              remaining: RATE_GLOBAL.perHourMax - RATE_GLOBAL.hourCount
            },
            daily: {
              current: RATE_GLOBAL.dayCount,
              max: RATE_GLOBAL.perDayMax,
              remaining: RATE_GLOBAL.perDayMax - RATE_GLOBAL.dayCount
            }
          },
          uptime: process.uptime(),
          version: '2.0.0'
        };
        
        const allHealthy = Object.values(health.services).every(service => service === true);
        health.status = allHealthy ? 'healthy' : 'degraded';
        
        if (queueStats.utilizationPercent >= 95) {
          health.status = 'warning';
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health, null, 2));
      } catch (error: any) {
        console.error('❌ Error verificando salud del sistema:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'unhealthy', 
          error: error.message, 
          timestamp: new Date().toISOString() 
        }));
      }
    }));

    adapterProvider.server.get('/v1/followup/queue-status', handleCtx(async (bot, req, res) => {
  try {
    const status = getFollowUpQueueStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      data: status,
      timestamp: new Date().toISOString() 
    }, null, 2));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Error obteniendo estado' }));
  }
}));

// ===== ENDPOINT DE MONITOREO =====
adapterProvider.server.get('/v1/followup/health', handleCtx(async (bot, req, res) => {
  try {
    const queueArray = Array.from(followUpQueue.entries());
    const invalidInQueue = queueArray.filter(([phone]) => !isValidPhoneNumber(phone));
    
    const health = {
      status: followUpQueue.size < 400 ? 'healthy' : followUpQueue.size < 480 ? 'warning' : 'critical',
      queue: {
        size: followUpQueue.size,
        maxSize: 500,
        utilizationPercent: Math.round((followUpQueue.size / 500) * 100),
        invalidCount: invalidInQueue.length,
        invalidPhones: invalidInQueue.map(([phone]) => phone).slice(0, 10) // Primeros 10
      },
      sessions: {
        total: userSessions.size,
        active: Array.from(userSessions.values()).filter(s => s.isActive).length
      },
      recommendations: []
    };
    
    // Recomendaciones
    if (invalidInQueue.length > 0) {
      health.recommendations.push(`Limpiar ${invalidInQueue.length} números inválidos de la cola`);
    }
    if (health.queue.utilizationPercent > 80) {
      health.recommendations.push('Ejecutar limpieza manual urgente');
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      data: health,
      timestamp: new Date().toISOString() 
    }, null, 2));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: String(error) }));
  }
}));

// ===== ENDPOINT DE LIMPIEZA MANUAL =====
adapterProvider.server.post('/v1/followup/cleanup', handleCtx(async (bot, req, res) => {
  try {
    const obsolete = cleanupFollowUpQueue();
    const invalid = cleanInvalidPhones();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      cleaned: {
        obsolete,
        invalid,
        total: obsolete + invalid
      },
      newQueueSize: followUpQueue.size,
      timestamp: new Date().toISOString() 
    }, null, 2));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: String(error) }));
  }
}));

    const PORT = process.env.PORT ?? 3006;
    httpServer(+PORT);

    console.log(`\n🎉 ===== TECHAURA INTELLIGENT BOT INICIADO ===== 🎉`);
    console.log(`🚀 Puerto: ${PORT}`);
    console.log(`🧠 Sistema Inteligente: ACTIVO`);
    console.log(`\n📊 ENDPOINTS DISPONIBLES:`);
    console.log(`   Analytics: http://localhost:${PORT}/v1/analytics`);
    console.log(`   AI Stats: http://localhost:${PORT}/v1/ai/stats`);
    console.log(`   Sales Stats: http://localhost:${PORT}/v1/sales/stats`);
    console.log(`   Dashboard: http://localhost:${PORT}/v1/dashboard`);
    console.log(`   User Info: http://localhost:${PORT}/v1/user/{phone}`);
    console.log(`   Recommendations: http://localhost:${PORT}/v1/recommendations/{phone}`);
    console.log(`   Router Stats: http://localhost:${PORT}/v1/router/stats`);
    console.log(`   Follow-up Queue: http://localhost:${PORT}/v1/followup/queue`);
    console.log(`   Follow-up Stats: http://localhost:${PORT}/v1/followup/stats`);
    console.log(`   Health Check: http://localhost:${PORT}/v1/health`);
    console.log(`   Send Message: POST http://localhost:${PORT}/v1/send-message`);
    console.log(`   Manual Migration: POST http://localhost:${PORT}/v1/admin/migrate`);
    console.log(`\n🗄️ Base de datos: MySQL (${process.env.MYSQL_DB_NAME})`);
    console.log(aiService.isAvailable() ? 
      `✅ IA: Gemini integrada y funcionando` : 
      `⚠️ IA: No disponible - Revisa GEMINI_API_KEY`
    );
    console.log(`🎯 Router Inteligente: ACTIVO`);
    console.log(`🎨 Flujos de Personalización: ACTIVOS`);
    console.log(`🛒 Sistema de Pedidos: INTEGRADO`);
    console.log(`📱 Seguimiento Automático: FUNCIONANDO`);
    console.log(`\n🔧 CONFIGURACIÓN DEL SISTEMA DE SEGUIMIENTO:`);
    console.log(`   - Cola máxima: 200 usuarios`);
    console.log(`   - Delay entre mensajes: 3 segundos`);
    console.log(`   - Límite horario: 60 mensajes/hora`);
    console.log(`   - Límite diario: 500 mensajes/día`);
    console.log(`   - Ciclos de análisis: cada 10 minutos`);
    console.log(`   - Mantenimiento: cada hora`);
    console.log(`   - Limpieza automática: cada 15 minutos`);
    console.log(`===============================================\n`);

    console.log('🎵 TechAura Intelligent Bot está listo para:');
    console.log('   • Analizar intenciones automáticamente');
    console.log('   • Dirigir usuarios al flujo correcto');
    console.log('   • Personalizar USBs completamente');
    console.log('   • Procesar pedidos inteligentemente');
    console.log('   • Hacer seguimiento persuasivo con cross-sell');
    console.log('   • Generar analytics avanzados');
    console.log('   • Gestionar cola de seguimientos eficientemente');
    console.log('');
    console.log('🚀 ¡Sistema inteligente completamente operativo!');

  } catch (error: any) {
    console.error('❌ Error crítico iniciando aplicación:', error);
    console.error('Stack trace completo:', error.stack);
    
    try {
      if (businessDB) {
        await businessDB.logError({
          type: 'startup_error',
          error: error.message,
          stack: error.stack,
          timestamp: new Date()
        });
      }
    } catch (dbError) {
      console.error('❌ No se pudo registrar el error en la base de datos:', dbError);
    }
    
    process.exit(1);
  }
};

// ==========================================
// === MANEJO DE ERRORES GLOBALES ===
// ==========================================

process.on('uncaughtException', async (error: any) => {
  console.error('❌ Error no capturado:', error);
  console.error('Stack trace:', error.stack);
  
  try {
    if (businessDB) {
      await businessDB.logError({
        type: 'uncaught_exception',
        error: error.message,
        stack: error.stack,
        timestamp: new Date()
      });
    }
  } catch (dbError) {
    console.error('❌ Error logging to database:', dbError);
  }
  
  setTimeout(() => { process.exit(1); }, 1000);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
  console.error('Promise:', promise);
  
  try {
    if (businessDB) {
      await businessDB.logError({
        type: 'unhandled_rejection',
        error: String(reason),
        timestamp: new Date()
      });
    }
  } catch (dbError) {
    console.error('❌ Error logging to database:', dbError);
  }
});

// ==========================================
// === SHUTDOWN GRACEFUL ===
// ==========================================

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Recibida señal ${signal}, cerrando aplicación gracefully...`);
  
  try {
    // Limpiar cola de seguimientos
    followUpQueueManager.clear();
    console.log('✅ Cola de seguimientos limpiada');
    
    // Cerrar conexiones de BD
    if (businessDB) {
      await businessDB.close();
      console.log('✅ Conexiones de base de datos cerradas');
    }
    
    setTimeout(() => {
      console.log('✅ Aplicación cerrada correctamente');
      process.exit(0);
    }, 2000);
  } catch (error) {
    console.error('❌ Error durante shutdown graceful:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ==========================================
// === UTILIDADES AUXILIARES ===
// ==========================================

function shouldProcessMessage(from: any, message: string): boolean {
  if (!message || message.trim().length === 0) return false;
  
  const blockedUsers = ['blockedUser1@s.whatsapp.net', 'blockedUser2@s.whatsapp.net'];
  if (blockedUsers.includes(from)) return false;
  
  const currentHour = new Date().getHours();
  if (currentHour < 8 || currentHour > 21) return false;
  
  return true;
}

// ==========================================
// === MONITOREO DE MEMORIA ===
// ==========================================

setInterval(() => {
  const used = process.memoryUsage();
  const mb = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;
  
  const queueStats = followUpQueueManager.getStats();
  
  console.log(`\n💾 ===== ESTADO DEL SISTEMA =====`);
  console.log(`   Memoria RSS: ${mb(used.rss)}MB`);
  console.log(`   Heap: ${mb(used.heapUsed)}/${mb(used.heapTotal)}MB`);
  console.log(`   Sesiones: ${userSessions.size}`);
  console.log(`   Cola: ${queueStats.total}/${queueStats.maxSize} (${queueStats.utilizationPercent}%)`);
  console.log(`   Rate Limits: ${RATE_GLOBAL.hourCount}/${RATE_GLOBAL.perHourMax}h | ${RATE_GLOBAL.dayCount}/${RATE_GLOBAL.perDayMax}d`);
  console.log(`================================\n`);
  
  // Limpiar si la memoria está alta
  if (used.heapUsed > 500 * 1024 * 1024) { // 500MB
    console.log('⚠️ Memoria alta, ejecutando limpieza...');
    if (global.processingCache) global.processingCache.clear();
    if (global.gc) global.gc();
  }
}, 5 * 60 * 1000); // Cada 5 minutos

// ==========================================
// === EXPORTACIONES ===
// ==========================================

export { 
  sendAutomaticMessage, 
  generatePersonalizedFollowUp, 
  initializeApp,
  followUpQueueManager
};

// ==========================================
// === INICIAR APLICACIÓN ===
// ==========================================

const startApplication = async () => {
  try {
    console.log('🔧 Iniciando panel de control...');
    startControlPanel();
    
    console.log('🚀 Iniciando aplicación principal...');
    await main();
  } catch (error) {
    console.error('❌ Error crítico al iniciar la aplicación:', error);
    process.exit(1);
  }
};

// Iniciar
startApplication();
