 // app.ts
// import { contextAnalyzer } from './services/contextAnalyzer';
// import { contextLogger } from './utils/contextLogger';
// import { CONTEXT_CONFIG } from './config/contextConfig';

import dotenv from 'dotenv';
dotenv.config();

import { createBot, createProvider, createFlow, addKeyword, EVENTS, ProviderClass } from '@builderbot/bot';
import { BaileysProvider as Provider } from '@builderbot/provider-baileys';
import { MysqlAdapter as Database } from '@builderbot/database-mysql';
import { adapterDB, businessDB } from './mysql-database';

import { migrateDatabaseSchema } from './scripts/migrateDatabase';

import {
    setBotInstance,
    getUserAnalytics,
    getSmartRecommendations,
    getConversationAnalysis,
    updateUserSession,
    userSessions,
    ExtendedContext,
    getUserSession,
    generatePersuasiveFollowUp
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

import { aiCatchAllFlow } from './flows/mainFlow';
import aiAdminFlow from './flows/aiAdminFlow';
import welcomeFlow from './flows/welcomeFlow';
import catalogFlow from './flows/catalogFlow';
import customizationFlow from './flows/customizationFlow';
import orderFlow from './flows/orderFlow';

console.log('🔍 Debug - Variables de entorno:');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Configurada' : '❌ No encontrada');
console.log('MYSQL_DB_HOST:', process.env.MYSQL_DB_HOST);
console.log('MYSQL_DB_USER:', process.env.MYSQL_DB_USER);
console.log('MYSQL_DB_NAME:', process.env.MYSQL_DB_NAME);
console.log('PORT:', process.env.PORT);

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
    interactions?: number;
    conversationData?: any;
    followUpSpamCount?: number;
}

// -----------------------
// --- INITIALIZATION ---
// -----------------------

async function initializeApp() {
    try {
        console.log('🚀 Iniciando inicialización de la aplicación...');
        
        // ✅ VERIFICAR CONEXIÓN A BASE DE DATOS
        const isConnected = await businessDB.testConnection();
        
        if (!isConnected) {
            console.error('❌ No se pudo conectar a MySQL. Verifica tu configuración.');
            console.error('   1. Asegúrate de que MySQL esté corriendo');
            console.error('   2. Verifica las credenciales en .env');
            console.error('   3. Verifica que la base de datos exista');
            process.exit(1);
        }
        
        // ✅ INICIALIZAR BASE DE DATOS
        await businessDB.initialize();
        
        console.log('✅ Inicialización completada exitosamente');
        
    } catch (error: any) {
        console.error('❌ Error crítico en inicialización:', error);
        throw error;
    }
}

// -----------------------
// --- BOT UTILITIES ---
// -----------------------
let botInstance: any = null;

const ADMIN_PHONE = process.env.ADMIN_PHONE || '+573008602789';

// Envío de mensajes automáticos con delays naturales
const sendAutomaticMessage = async (phoneNumber: string, messages: string[]) => {
    if (!botInstance) {
        console.error('❌ Bot instance no disponible para envío automático');
        return;
    }
    
    try {
        const groupedMessage = messages.join('\n\n');
        await botInstance.sendMessage(phoneNumber, groupedMessage, {});
        
        // Registrar en base de datos
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
        // Obtener datos actualizados de la base de datos
        const dbUser = await businessDB.getUserSession(user.phone);
        const userOrders = await businessDB.getUserOrders(user.phone);
        const userAnalytics = await businessDB.getUserAnalytics(user.phone);
        
        const name = (dbUser?.name || user.name || 'amigo').split(' ')[0];
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "🌅 ¡Buenos días" : hour < 18 ? "☀️ ¡Buenas tardes" : "🌙 ¡Buenas noches";
        const messages: string[] = [];

        // Mensajes basados en urgencia
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

        // Recomendaciones basadas en intereses y análisis de DB
        if (userAnalytics?.preferredCategories?.length) {
            const interests = userAnalytics.preferredCategories.slice(0, 2);
            if (interests.length > 0) {
                messages.push(`🎵 Vi que te interesa ${interests.join(' y ')}. ¿Agregamos más géneros?`);
            }
        }

        // Recomendaciones inteligentes basadas en comportamiento
        const recommendations = getSmartRecommendations(user.phone, userSessions);
        if (recommendations?.length) {
            messages.push(`🔎 Basado en tu perfil, te recomiendo: ${recommendations.slice(0, 3).join(', ')}.`);
        }

        // Mensajes específicos por etapa
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

        // Call to action basado en urgencia
        if (urgencyLevel === 'high') {
            messages.push(`⚡ ¿Te reservo una USB con descuento? Solo responde "SÍ"`);
        } else {
            messages.push(`¿Continuamos? Responde "OK" o pregúntame lo que necesites 😊`);
        }

        return messages;
        
    } catch (error) {
        console.error('❌ Error generando seguimiento personalizado:', error);
        
        // Fallback básico
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

// --------------
// --- FOLLOW-UP SYSTEM ---
// --------------
// ✅ SISTEMA DE SEGUIMIENTO COMPLETAMENTE OPTIMIZADO
const activeFollowUpSystem = () => {
    console.log('🎯 Sistema de seguimiento avanzado con protección anti-spam activo...');
    
    // ✅ CONTROL DE ESTADO GLOBAL
    const systemState = {
        isRunning: false,
        lastExecution: 0,
        processedUsers: new Set<string>(),
        errorCount: 0,
        maxErrors: 10
    };

    // ✅ FUNCIÓN PRINCIPAL DE SEGUIMIENTO
    const executeFollowUpCycle = async () => {
        // ✅ VALIDACIÓN DE ESTADO DEL SISTEMA
        if (systemState.isRunning) {
            console.log('⏸️ Sistema ya ejecutándose, saltando ciclo...');
            return;
        }

        if (systemState.errorCount >= systemState.maxErrors) {
            console.log('❌ Demasiados errores, sistema pausado');
            return;
        }

        const now = Date.now();
        
        // ✅ CONTROL DE FRECUENCIA (mínimo 10 minutos entre ejecuciones)
        if (now - systemState.lastExecution < 10 * 60 * 1000) {
            return;
        }

        systemState.isRunning = true;
        systemState.lastExecution = now;

        try {
            console.log('🔄 Iniciando ciclo de seguimiento...');
            
            // ✅ OBTENER USUARIOS ACTIVOS CON VALIDACIÓN
            let activeUsers: any[] = [];
            try {
                if (typeof businessDB?.getActiveUsers === 'function') {
                    activeUsers = await businessDB.getActiveUsers(48) || [];
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

            console.log(`📊 Procesando ${activeUsers.length} usuarios activos...`);
            
            let processedCount = 0;
            let sentCount = 0;
            
            for (const user of activeUsers) {
                try {
                    // ✅ VALIDACIÓN DE USUARIO
                    if (!user?.phone || typeof user.phone !== 'string') {
                        console.warn('⚠️ Usuario sin teléfono válido, saltando...');
                        continue;
                    }

                    // ✅ CONTROL DE PROCESAMIENTO DUPLICADO
                    const userKey = `${user.phone}_${new Date().getHours()}`;
                    if (systemState.processedUsers.has(userKey)) {
                        continue; // Ya procesado esta hora
                    }

                    // ✅ VALIDACIÓN DE ELEGIBILIDAD PARA SEGUIMIENTO
                    const canReceive = await canReceiveFollowUp(user.phone, user);
                    if (!canReceive) {
                        continue;
                    }

                    // ✅ VERIFICAR ACTIVIDAD RECIENTE
                    const currentTime = new Date();
                    const lastInteraction = user.lastInteraction ? new Date(user.lastInteraction) : new Date(0);
                    const minSinceLast = (currentTime.getTime() - lastInteraction.getTime()) / (1000 * 60);
                    
                    // ✅ VERIFICAR ÚLTIMO SEGUIMIENTO
                    const lastFollowUp = user.lastFollowUp ? new Date(user.lastFollowUp) : new Date(0);
                    const hoursSinceFollowUp = (currentTime.getTime() - lastFollowUp.getTime()) / (1000 * 60 * 60);
                    
                    // ✅ ANÁLISIS DE USUARIO CON VALIDACIÓN
                    let userAnalytics: any = {};
                    try {
                        if (typeof businessDB?.getUserAnalytics === 'function') {
                            userAnalytics = await businessDB.getUserAnalytics(user.phone) || {};
                        }
                    } catch (analyticsError) {
                        console.warn(`⚠️ Error obteniendo analytics para ${user.phone}:`, analyticsError);
                    }

                    const buyingIntent = userAnalytics?.buyingIntent || user.buyingIntent || 0;
                    
                    // ✅ LÓGICA DE SEGUIMIENTO MEJORADA
                    let urgency: 'high' | 'medium' | 'low' = 'low';
                    let needsFollowUp = false;
                    let minDelayRequired = 2;
                    let reason = '';
                    
                    // ✅ CRITERIOS DE SEGUIMIENTO ESPECÍFICOS
                    if (buyingIntent > 85 && minSinceLast > 15 && hoursSinceFollowUp > 1) {
                        needsFollowUp = true;
                        urgency = 'high';
                        minDelayRequired = 1;
                        reason = 'Alta intención de compra';
                    } else if (buyingIntent > 70 && minSinceLast > 30 && hoursSinceFollowUp > 2) {
                        needsFollowUp = true;
                        urgency = 'high';
                        minDelayRequired = 2;
                        reason = 'Buena intención de compra';
                    } else if (user.stage === 'pricing' && minSinceLast > 20 && hoursSinceFollowUp > 1.5) {
                        needsFollowUp = true;
                        urgency = 'high';
                        minDelayRequired = 1.5;
                        reason = 'Consultó precios';
                    } else if (user.stage === 'cart_abandoned' && minSinceLast > 30 && hoursSinceFollowUp > 2) {
                        needsFollowUp = true;
                        urgency = 'high';
                        minDelayRequired = 2;
                        reason = 'Carrito abandonado';
                    } else if (user.stage === 'customizing' && minSinceLast > 45 && hoursSinceFollowUp > 3) {
                        needsFollowUp = true;
                        urgency = 'medium';
                        minDelayRequired = 3;
                        reason = 'Personalizando producto';
                    } else if (user.stage === 'interested' && minSinceLast > 90 && hoursSinceFollowUp > 4) {
                        needsFollowUp = true;
                        urgency = 'medium';
                        minDelayRequired = 4;
                        reason = 'Mostró interés';
                    } else if (minSinceLast > 240 && hoursSinceFollowUp > 8) {
                        needsFollowUp = true;
                        urgency = 'low';
                        minDelayRequired = 8;
                        reason = 'Seguimiento general';
                    }
                    
                    // ✅ EJECUTAR SEGUIMIENTO SI ES NECESARIO
                    if (needsFollowUp && hoursSinceFollowUp >= minDelayRequired) {
                        try {
                
                            // ✅ GENERAR MENSAJES PERSONALIZADOS
                            const messages = await generatePersonalizedFollowUp(user, urgency);
                            if (!messages || messages.length === 0) {
                                console.warn(`⚠️ No se generaron mensajes para ${user.phone}`);
                                continue;
                            }
                            
                            // ✅ ENVIAR SEGUIMIENTO SEGURO
                            const sent = await sendSecureFollowUp(user.phone, messages, urgency);

                            if (sent) {
                                try {
                                    await businessDB.updateUserSession(user.phone, {
                                        lastFollowUp: currentTime,
                                        followUpSpamCount: (user.followUpSpamCount || 0) + 1
                                    });

                                    if (typeof businessDB.logFollowUpEvent === 'function') {
                                        await businessDB.logFollowUpEvent({
                                            phone: user.phone,
                                            type: urgency,
                                            messages: messages,
                                            success: true,
                                            timestamp: currentTime,
                                            reason: reason,
                                            buyingIntent: buyingIntent
                                        });
                                    }
                                    
                                    systemState.processedUsers.add(userKey);
                                    sentCount++;
                                    
                                    console.log(`📤 Seguimiento ${urgency} enviado a ${user.phone} - ${reason}`);
                                    
                                } catch (updateError) {
                                    console.error(`❌ Error actualizando usuario ${user.phone}:`, updateError);
                                }
                            }
                            
                            // ✅ DELAY OBLIGATORIO ENTRE ENVÍOS
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            
                        } catch (followUpError) {
                            console.error(`❌ Error en seguimiento para ${user.phone}:`, followUpError);
                            systemState.errorCount++;
                        }
                    }
                    
                    processedCount++;
                    
                } catch (userError) {
                    console.error(`❌ Error procesando usuario ${user.phone}:`, userError);
                    systemState.errorCount++;
                    continue;
                }
            }
            
            console.log(`✅ Ciclo completado: ${processedCount} procesados, ${sentCount} enviados`);
            
            // ✅ RESETEAR CONTADOR DE ERRORES SI EL CICLO FUE EXITOSO
            if (sentCount > 0) {
                systemState.errorCount = Math.max(0, systemState.errorCount - 1);
            }
            
        } catch (error) {
            console.error('❌ Error crítico en sistema de seguimiento:', error);
            systemState.errorCount++;
        } finally {
            systemState.isRunning = false;
        }
    };

    // ✅ FUNCIÓN DE LIMPIEZA Y MANTENIMIENTO
    const executeMaintenanceCycle = async () => {
        try {
            console.log('🧹 Iniciando mantenimiento del sistema...');
            
            // ✅ LIMPIAR CONTADORES DE SPAM
            if (typeof businessDB?.resetSpamCounters === 'function') {
                await businessDB.resetSpamCounters(24);
            }
            
            // ✅ LIMPIAR SESIONES INACTIVAS
            if (typeof businessDB?.cleanInactiveSessions === 'function') {
                await businessDB.cleanInactiveSessions(7 * 24);
            }
            
            // ✅ GENERAR ESTADÍSTICAS DIARIAS
            if (typeof businessDB?.generateDailyStats === 'function') {
                await businessDB.generateDailyStats();
            }
            
            // ✅ LIMPIAR CACHE DEL SISTEMA
            const now = Date.now();
            systemState.processedUsers.clear();
            
            // ✅ RESETEAR ERRORES SI HA PASADO SUFICIENTE TIEMPO
            if (systemState.errorCount > 0 && now - systemState.lastExecution > 60 * 60 * 1000) {
                systemState.errorCount = 0;
                console.log('🔄 Contador de errores reseteado');
            }
            
            console.log('✅ Mantenimiento completado exitosamente');
            
        } catch (error) {
            console.error('❌ Error en mantenimiento:', error);
        }
    };

    // ✅ CONFIGURAR INTERVALOS CON VALIDACIÓN
    let followUpInterval: NodeJS.Timeout;
    let maintenanceInterval: NodeJS.Timeout;
    
    try {
        // ✅ SISTEMA PRINCIPAL DE SEGUIMIENTO (cada 10 minutos)
        followUpInterval = setInterval(executeFollowUpCycle, 10 * 60 * 1000);
        
        // ✅ SISTEMA DE MANTENIMIENTO (cada hora)
        maintenanceInterval = setInterval(executeMaintenanceCycle, 60 * 60 * 1000);
        
        // ✅ EJECUTAR PRIMERA VEZ DESPUÉS DE 30 SEGUNDOS
        setTimeout(executeFollowUpCycle, 30 * 1000);
        
        console.log('✅ Sistema de seguimiento configurado exitosamente');
        
    } catch (intervalError) {
        console.error('❌ Error configurando intervalos:', intervalError);
    }

    // ✅ FUNCIÓN DE LIMPIEZA AL CERRAR
    const cleanup = () => {
        if (followUpInterval) clearInterval(followUpInterval);
        if (maintenanceInterval) clearInterval(maintenanceInterval);
        console.log('🛑 Sistema de seguimiento detenido');
    };

    // ✅ MANEJAR CIERRE GRACEFUL
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    return {
        stop: cleanup,
        getStatus: () => ({
            isRunning: systemState.isRunning,
            lastExecution: systemState.lastExecution,
            errorCount: systemState.errorCount,
            processedUsersCount: systemState.processedUsers.size
        })
    };
};

// ✅ FUNCIÓN AUXILIAR MEJORADA PARA VALIDAR ELEGIBILIDAD
const canReceiveFollowUp = async (phoneNumber: string, user: any): Promise<boolean> => {
    try {
        // ✅ VALIDACIONES BÁSICAS
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return false;
        }

        if (!user || typeof user !== 'object') {
            return false;
        }

        // ✅ VERIFICAR BLACKLIST
        if (user.isBlacklisted || user.optedOut || user.blocked) {
            return false;
        }

        // ✅ VERIFICAR LÍMITES DE SPAM
        const spamCount = user.followUpSpamCount || 0;
        if (spamCount >= 5) { // Máximo 5 seguimientos por usuario
            return false;
        }

        // ✅ VERIFICAR CONVERSACIÓN ACTIVA
        if (user.isProcessing || user.currentFlow === 'active_conversation') {
            return false;
        }

        // ✅ VERIFICAR ÚLTIMA INTERACCIÓN RECIENTE
        if (user.lastInteraction) {
            const lastInteraction = new Date(user.lastInteraction);
            const now = new Date();
            const minSinceLast = (now.getTime() - lastInteraction.getTime()) / (1000 * 60);
            
            // No molestar si interactuó hace menos de 10 minutos
            if (minSinceLast < 10) {
                return false;
            }
        }

        // ✅ VERIFICAR ESTADO DE CONVERSIÓN
        if (user.stage === 'converted' || user.stage === 'order_confirmed') {
            return false;
        }

        return true;
        
    } catch (error) {
        console.error(`❌ Error validando elegibilidad para ${phoneNumber}:`, error);
        return false;
    }
};

// // ✅ FUNCIÓN AUXILIAR PARA GENERAR SEGUIMIENTOS PERSONALIZADOS
// const generatePersonalizedFollowUp = async (user: any, urgency: 'high' | 'medium' | 'low'): Promise<string[]> => {
//     try {
//         const messages: string[] = [];
//         const userName = user.name || 'Amigo';
//         const buyingIntent = user.buyingIntent || 0;
        
//         // ✅ MENSAJES BASADOS EN URGENCIA Y CONTEXTO
//         switch (urgency) {
//             case 'high':
//                 if (user.stage === 'pricing') {
//                     messages.push(
//                         `¡Hola ${userName}! 👋\n\n` +
//                         `Vi que consultaste nuestros precios. ¿Tienes alguna duda específica?\n\n` +
//                         `🎁 *OFERTA ESPECIAL:* 20% de descuento si confirmas hoy\n` +
//                         `🚚 Envío GRATIS incluido\n\n` +
//                         `¿Te ayudo a personalizar tu USB ideal?`
//                     );
//                 } else if (user.stage === 'cart_abandoned') {
//                     messages.push(
//                         `¡${userName}! 🛒\n\n` +
//                         `Veo que estabas configurando tu USB personalizada.\n\n` +
//                         `⚡ *ÚLTIMA OPORTUNIDAD:* Tu configuración está reservada por 2 horas más\n` +
//                         `💰 Mantén el precio especial que viste\n\n` +
//                         `¿Continuamos donde lo dejamos?`
//                     );
//                 } else {
//                     messages.push(
//                         `¡Hola ${userName}! 🎵\n\n` +
//                         `¿Sigues interesado en tu USB personalizada?\n\n` +
//                         `🔥 *HOY SOLAMENTE:* 25% de descuento\n` +
//                         `⭐ +1,200 clientes satisfechos\n\n` +
//                         `¿Te muestro las opciones más populares?`
//                     );
//                 }
//                 break;
                
//             case 'medium':
//                 if (user.interests?.includes('music')) {
//                     messages.push(
//                         `¡Hola ${userName}! 🎶\n\n` +
//                         `¿Ya decidiste qué géneros musicales incluir en tu USB?\n\n` +
//                         `🎵 Tenemos playlists actualizadas con los últimos éxitos\n` +
//                         `🎁 Diseño personalizado incluido\n\n` +
//                         `¿Te ayudo a crear tu playlist perfecta?`
//                     );
//                 } else {
//                     messages.push(
//                         `¡Hola ${userName}! ✨\n\n` +
//                         `¿Has pensado en tu USB personalizada?\n\n` +
//                         `📱 Proceso súper fácil por WhatsApp\n` +
//                         `🚚 Envío gratis a toda Colombia\n\n` +
//                         `¿Quieres ver nuestras opciones más populares?`
//                     );
//                 }
//                 break;
                
//             case 'low':
//                 messages.push(
//                     `¡Hola ${userName}! 👋\n\n` +
//                     `¿Cómo estás? Te escribo para contarte sobre nuestras USBs personalizadas.\n\n` +
//                     `🎵 Música, videos, diseño único\n` +
//                     `⭐ Miles de clientes satisfechos\n\n` +
//                     `¿Te interesa conocer más detalles?`
//                 );
//                 break;
//         }
        
//         return messages;
        
//     } catch (error) {
//         console.error('❌ Error generando seguimiento personalizado:', error);
//         return ['¡Hola! ¿Sigues interesado en nuestras USBs personalizadas? 🎵'];
//     }
// };

// ✅ FUNCIÓN AUXILIAR PARA ENVÍO SEGURO
const sendSecureFollowUp = async (phoneNumber: string, messages: string[], urgency: string): Promise<boolean> => {
    try {
        // ✅ VALIDACIONES DE ENTRADA
        if (!phoneNumber || !messages || messages.length === 0) {
            return false;
        }

        // ✅ VERIFICAR QUE EL SERVICIO DE MENSAJERÍA ESTÉ DISPONIBLE
        if (!botInstance || typeof botInstance.sendMessage !== 'function') {
            console.error('❌ Servicio de mensajería no disponible');
            return false;
        }

        // ✅ ENVIAR MENSAJE CON MANEJO DE ERRORES
        for (const message of messages) {
            try {
                await botInstance.sendMessage(phoneNumber, message, {});
                
                // ✅ DELAY ENTRE MENSAJES
                if (messages.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (sendError) {
                console.error(`❌ Error enviando mensaje a ${phoneNumber}:`, sendError);
                return false;
            }
        }
        
        return true;
        
    } catch (error) {
        console.error(`❌ Error en envío seguro a ${phoneNumber}:`, error);
        return false;
    }
};



// Flow para manejar audios con análisis avanzado
const audioFlow = addKeyword<Provider, Database>(EVENTS.VOICE_NOTE)
    .addAction(async (ctx: ExtendedContext, { flowDynamic, endFlow }) => { // <-- Se añade endFlow
        try {
            // ✅ FILTRO DE SEGURIDAD
            if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) {
                console.log(`🚮 Audio de sistema/estado ignorado (de: ${ctx.from}).`);
                return endFlow(); // Termina el flujo
            }

            console.log(`🎤 Audio recibido de ${ctx.from}`);
            
            // Obtener sesión del usuario
            const session = await getUserSession(ctx.from);
            
            // Actualizar sesión y registrar en DB
            await updateUserSession(
                ctx.from,               
                '[AUDIO_MESSAGE]',      
                'audio_received',       
                null,                   
                false,                  
                {                       
                    metadata: {
                        ...session,
                        name: ctx.name || ctx.pushName
                    }
                }
            );


            // Registrar evento de audio en DB
            await businessDB.logInteraction({
                phone: ctx.from,
                type: 'audio_received',
                content: '[VOICE_NOTE]',
                timestamp: new Date()
            });

            // Respuesta inteligente basada en perfil del usuario
            const userAnalytics = await businessDB.getUserAnalytics(ctx.from);
            const isReturningCustomer = userAnalytics?.totalOrders > 0;
            
            let response: string;
            if (isReturningCustomer) {
                response = `🎤 ¡${session.name || 'Amigo'}! Escuché tu audio. Como ya conoces nuestros productos, ¿qué necesitas esta vez?`;
            } else {
                const responses = [
                    "🎤 ¡Escuché tu audio! Me encanta que te comuniques así. ¿Te interesa música, películas o videos para tu USB?",
                    "🔊 ¡Perfecto! Recibí tu mensaje de voz. Cuéntame, ¿qué tipo de contenido buscas para tu USB personalizada?",
                    "🎵 ¡Genial tu audio! Soy experto en USBs personalizadas. ¿Prefieres música, videos o películas?"
                ];
                response = responses[Math.floor(Math.random() * responses.length)];
            }

            await flowDynamic([response]);

            // Mostrar opciones personalizadas
            const options = [
                "💰 *Nuestros precios desde $59,900*",
                "",
                "Puedes decir:",
                "🎵 'música' - Para USBs musicales",
                "🎬 'películas' - Para USBs de películas", 
                "🎥 'videos' - Para USBs de videos",
                "💰 'precios' - Ver todas las opciones",
                "👨‍💼 'asesor' - Hablar con humano"
            ];

            if (isReturningCustomer) {
                options.splice(1, 0, "🎁 *Descuento especial para clientes VIP*");
            }

            await flowDynamic([options.join('\n')]);

        } catch (error) {
            console.error('❌ Error procesando audio:', error);
            await flowDynamic([
                "🎤 Recibí tu audio, pero hubo un problemita técnico.",
                "¿Podrías escribirme qué necesitas? Estoy aquí para ayudarte con USBs personalizadas 😊"
            ]);
        }
    });

// Flow para manejar documentos/medios con análisis
const mediaFlow = addKeyword<Provider, Database>(EVENTS.DOCUMENT)
    .addAction(async (ctx: ExtendedContext, { flowDynamic, endFlow }) => { // <-- Se añade endFlow
        try {
            // ✅ FILTRO DE SEGURIDAD
            if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) {
                console.log(`🚮 Media/Documento de sistema/estado ignorado (de: ${ctx.from}).`);
                return endFlow(); // Termina el flujo
            }

            console.log(`📎 Documento/Media recibido de ${ctx.from}`);
            
            const session = await getUserSession(ctx.from);
            await updateUserSession(
                ctx.from,
                '[DOCUMENT/MEDIA]',
                'media_received',
                null,                   
                false,
                {
                    metadata: session   
                }
            );


            // Registrar en base de datos
            await businessDB.logInteraction({
                phone: ctx.from,
                type: 'document_received',
                content: '[DOCUMENT/MEDIA]',
                timestamp: new Date()
            });

            await flowDynamic([
                "📎 Vi que me enviaste un archivo. ¡Interesante!",
                "🎵 ¿Te interesa que personalicemos una USB con contenido similar?",
                "",
                "💰 *Precios desde $59,900*",
                "Dime: ¿música, videos o películas?"
            ]);

        } catch (error) {
            console.error('❌ Error procesando documento:', error);
            await flowDynamic([
                "📎 Recibí tu archivo, pero hubo un problema técnico.",
                "¿Podrías decirme qué tipo de USB necesitas? 😊"
            ]);
        }
    });

// Flow principal inteligente que maneja todas las entradas
// ✅ FLUJO PRINCIPAL COMPLETAMENTE CORREGIDO
const intelligentMainFlow = addKeyword<Provider, Database>([EVENTS.WELCOME])
    .addAction(async (ctx: ExtendedContext, { gotoFlow, flowDynamic, endFlow }) => {
        try {
            // ✅ --- INICIO DE FILTROS GLOBALES ---
            
            // FILTRO 1: Ignorar mensajes vacíos, nulos o sin cuerpo
            if (!ctx.body || ctx.body.trim().length === 0) {
                console.log(`🚮 Mensaje vacío ignorado (de: ${ctx.from}).`);
                return endFlow(); // Termina el flujo para este mensaje
            }

            // FILTRO 2: Ignorar mensajes que no son de un chat de usuario.
            if (!ctx.from || !ctx.from.endsWith('@s.whatsapp.net')) {
                console.log(`🚮 Mensaje de sistema/estado ignorado (de: ${ctx.from}). Body: ${ctx.body}`);
                return endFlow(); // Termina el flujo
            }

            // FILTRO 3: Ignorar notificaciones de apps externas (ej. Telegram)
            const lowerBody = ctx.body.toLowerCase();
            if (lowerBody.includes('telegram') || lowerBody.includes('notificación de')) {
                console.log(`🚮 Notificación de app externa ignorada (de: ${ctx.from}).`);
                return endFlow(); // Termina el flujo
            }

            // ✅ --- FIN DE FILTROS GLOBALES ---

            console.log(`🎯 Mensaje recibido de ${ctx.from}: ${ctx.body}`);
            
            // ✅ VALIDACIÓN CRÍTICA 1: (Cubierta por los filtros de arriba, pero mantenemos 'from')
            if (!ctx.from) {
                console.log('❌ from     inválido en flujo principal');
                return endFlow();
            }

            // ✅ VALIDACIÓN CRÍTICA 2: Obtener sesión con manejo de errores
            let session: ExtendedUserSession;
            try {
                const userSession = await getUserSession(ctx.from);
                if (!userSession) {
                    console.log(`❌ No se pudo obtener sesión para ${ctx.from}`);
                    return gotoFlow(welcomeFlow);
                }

                // Crear un objeto ExtendedUserSession explícito con las propiedades esperadas
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
                    conversationData: userSession.conversationData ?? {},
                    followUpSpamCount: userSession.followUpSpamCount ?? 0
                } as ExtendedUserSession;
            } catch (sessionError) {
                console.error('❌ Error obteniendo sesión:', sessionError);
                return gotoFlow(welcomeFlow);
            }

            // ✅ VALIDACIÓN CRÍTICA 3: Control de procesamiento
            if ((session as any).isProcessing) {
               console.log(`⏸️ Usuario ${ctx.from} ya está siendo procesado, terminando...`);
               return endFlow();
            }

            // ✅ MARCAR COMO PROCESANDO TEMPORALMENTE
            session.isProcessing = true;
            await updateUserSession(
                ctx.from,
                ctx.body,
                'processing',
                null,
                true,
                {
                    metadata: session
                }
            );


            try {
                // ✅ USAR ROUTER INTELIGENTE CON SINGLETON
                const router = IntelligentRouter.getInstance();
                const decision = await router.analyzeAndRoute(ctx.body, session as any);

                console.log(`🧠 Decisión del router: ${decision.action} (${decision.confidence}%) - ${decision.reason}`);

                // ✅ VALIDACIÓN CRÍTICA 4: Verificar si debe interceptar
                if (!decision.shouldIntercept) {
                    console.log(`🔄 No interceptando: ${decision.reason}`);
                    session.isProcessing = false;
                    await updateUserSession(
                        ctx.from,
                        ctx.body,
                        'continue',
                        'continue_step',        
                        false,
                        {
                            metadata: session
                        }
                    );

                    return endFlow(); // Dejar que otros flujos manejen
                }

                // ✅ LIMPIAR ESTADO DE PROCESAMIENTO
                session.isProcessing = false;
                session.currentFlow = decision.action;
                await updateUserSession(
                    ctx.from,
                    ctx.body,
                    decision.action,        
                    null,                   
                    false,
                    {
                        metadata: {
                            ...session,
                            decision: decision 
                        }
                    }
                );


                // ✅ EJECUTAR ACCIÓN SEGÚN DECISIÓN CON VALIDACIÓN
                switch (decision.action) {
                    case 'welcome':
                        console.log('👋 Redirigiendo a bienvenida');
                        return gotoFlow(welcomeFlow);
                    
                    case 'catalog':
                        console.log('📚 Redirigiendo a catálogo');
                        return gotoFlow(catalogFlow);
                    
                    case 'customize':
                        console.log('🎨 Redirigiendo a personalización');
                        return gotoFlow(customizationFlow);
                    
                    case 'order':
                        console.log('🛒 Redirigiendo a pedidos');
                        return gotoFlow(orderFlow);
                    
                    case 'music':
                        console.log('🎵 Redirigiendo a música');
                        return gotoFlow(musicUsb);
                    
                    case 'videos':
                        console.log('🎬 Redirigiendo a videos');
                        return gotoFlow(videosUsb);
                    
                    case 'movies':
                        console.log('🎭 Redirigiendo a películas');
                        return gotoFlow(moviesUsb);
                    
                    case 'advisor':
                        console.log('👤 Redirigiendo a asesor');
                        return gotoFlow(flowAsesor);
                    
                    case 'pricing':
                        console.log('💰 Mostrando precios directamente');
                        await flowDynamic([
                            '💰 *Precios TechAura 2024*\n\n' +
                            '🎵 *USB Musical Básica: $59.900*\n' +
                            '• 32GB de capacidad\n' +
                            '• +1,000 canciones\n' +
                            '• Diseño básico\n\n' +
                            '⭐ *USB Premium: $89.900* *(MÁS POPULAR)*\n' +
                            '• 64GB de capacidad\n' +
                            '• +3,000 canciones\n' +
                            '• Diseño personalizado\n' +
                            '• Playlist curada\n\n' +
                            '👑 *USB VIP: $129.900* *(MEJOR VALOR)*\n' +
                            '• 128GB de capacidad\n' +
                            '• +6,000 canciones\n' +
                            '• Diseño premium\n' +
                            '• Videos musicales incluidos\n\n' +
                            '🚀 *USB Mega: $169.900* *(EXPERIENCIA COMPLETA)*\n' +
                            '• 256GB de capacidad\n' +
                            '• +10,000 canciones\n' +
                            '• Videos + películas\n' +
                            '• Diseño exclusivo\n\n' +
                            '🎁 *INCLUYE GRATIS:*\n' +
                            '• Envío a domicilio\n' +
                            '• Garantía de 1 año\n' +
                            '• Soporte técnico\n\n' +
                            '💬 *¿Te interesa alguna opción específica?*'
                        ]);
                        return endFlow();
                    
                    case 'ai_response':
                        // ✅ USAR IA PARA RESPONDER
                        if (aiService?.isAvailable()) {
                            console.log('🤖 Redirigiendo a respuesta con IA');
                            return gotoFlow(aiCatchAllFlow);
                        } else {
                            console.log('🤖 IA no disponible, usando bienvenida');
                            return gotoFlow(welcomeFlow);
                        }
                    
                    default:
                        console.log('🔄 Acción no reconocida, usando bienvenida');
                        return gotoFlow(welcomeFlow);
                }

            } catch (routerError) {
                console.error('❌ Error en router:', routerError);
                
                // ✅ LIMPIAR ESTADO EN CASO DE ERROR
                session.isProcessing = false;
                session.currentFlow = 'error';
                await updateUserSession(
                    ctx.from,
                    'ERROR',
                    'error',
                    'error_step',           
                    false,
                    {
                        metadata: {
                            ...session,
                            errorTimestamp: new Date().toISOString()  
                        }
                    }
                );

                
                return gotoFlow(welcomeFlow);
            }
            
        } catch (error) {
            console.error('❌ Error crítico en flujo principal:', error);
            
            // ✅ LIMPIEZA FINAL DE EMERGENCIA
            try {
                const session = await getUserSession(ctx.from);
                if (session) {
                    session.isProcessing = false;
                    session.currentFlow = 'critical_error';
                    await updateUserSession(
                        ctx.from,
                        'CRITICAL_ERROR',
                        'critical_error',
                        'critical_step',       
                        false,
                        {
                            metadata: {
                                ...session,
                                isCritical: true,
                                lastError: new Date().toISOString()
                            }
                        }
                    );

                }
            } catch (cleanupError) {
                console.error('❌ Error en limpieza de emergencia:', cleanupError);
            }
            
            return gotoFlow(welcomeFlow);
        }
    });


// --------------
// --- MAIN ---
// --------------
const main = async () => {
    try {
        console.log('🚀 Iniciando TechAura Intelligent Bot...');
        
        
        // Ejecutar inicialización completa
        await initializeApp();

        // Crear flujo principal con todos los flows organizados por prioridad
        const adapterFlow = createFlow([
            // 🎯 FLUJO PRINCIPAL INTELIGENTE (MÁXIMA PRIORIDAD)
            intelligentMainFlow,
            
            // 🧠 FLUJOS INTELIGENTES NUEVOS
            welcomeFlow,
            catalogFlow,
            customizationFlow,
            orderFlow,
            
            
            // 🎵 FLUJOS DE PRODUCTOS PRINCIPALES
            musicUsb,
            videosUsb,
            moviesUsb,
            customUsb,
            capacityMusic,
            capacityVideo,
            
            // 🤖 FLUJOS CON IA
            aiAdminFlow,
            aiCatchAllFlow,
            
            // 📱 FLUJOS DE EVENTOS ESPECIALES
            audioFlow,
            mediaFlow,
            
            // 🛠️ FLUJOS DE ADMINISTRACIÓN
            testCapture,
            trackingDashboard,
            
            // 📊 FLUJOS DE CONTENIDO Y PROMOCIONES
            contentSelectionFlow,
            promosUsbFlow,
            capacityMusic,
            datosCliente,
            
            // 👥 FLUJOS DE SOPORTE
            flowAsesor,
            mainFlow,

            flowHeadPhones,
            flowTechnology,
            flowUsb,

            menuFlow,
            menuTech,
            pageOrCatalog
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

        // Configurar instancia del bot para mensajes automáticos
        botInstance = {
            sendMessage: async (phone: string, message: string, options: Record<string, unknown>) => {
                try {
                    const result = await adapterProvider.sendMessage(
                        phone, 
                        typeof message === 'string' ? message : JSON.stringify(message), 
                        options || {}
                    );
                    
                    // Registrar mensaje enviado en DB
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
        // === ENDPOINTS DE API AVANZADOS ===
        // ==========================================

        // Analytics generales
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
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo analytics' 
                }));
            }
        }));

        // Información de usuario específico
        adapterProvider.server.get('/v1/user/:phone', handleCtx(async (bot, req, res) => {
            try {
                const phone = req.params?.phone;
                if (!phone) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Número de teléfono requerido' 
                    }));
                    return;
                }
                
                const user = await businessDB.getUserSession(phone);
                const analytics = await businessDB.getUserAnalytics(phone);
                const orders = await businessDB.getUserOrders(phone);
                
                if (user) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        data: {
                            user,
                            analytics,
                            orders,
                            timestamp: new Date().toISOString()
                        }
                    }, null, 2));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Usuario no encontrado' 
                    }));
                }
            } catch (error) {
                console.error('❌ Error obteniendo usuario:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error interno del servidor' 
                }));
            }
        }));

        // Estadísticas de IA y sistema inteligente
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
                        features: [
                            'Context Analysis',
                            'Intent Detection', 
                            'Automatic Routing',
                            'Persuasion Elements',
                            'Smart Recommendations'
                        ]
                    },
                    timestamp: new Date().toISOString()
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: aiStats
                }, null, 2));
            } catch (error) {
                console.error('❌ Error obteniendo stats de IA:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo stats de IA' 
                }));
            }
        }));

        // Estadísticas detalladas de ventas
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
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo estadísticas de ventas' 
                }));
            }
        }));

        // Dashboard en tiempo real con datos inteligentes
        adapterProvider.server.get('/v1/dashboard', handleCtx(async (bot, req, res) => {
            try {
                const dashboard = await businessDB.getDashboardData();
                
                // Agregar datos del sistema inteligente
                const intelligentData = {
                    ...dashboard,
                    intelligentSystem: {
                        routerDecisions: await businessDB.getRouterStats(),
                        conversionRates: await businessDB.getConversionStats(),
                        userJourney: await businessDB.getUserJourneyStats(),
                        aiInteractions: AIMonitoring.getStats()
                    }
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
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo dashboard' 
                }));
            }
        }));

        // Endpoint para análisis de conversaciones
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
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo análisis' 
                }));
            }
        }));

        // Endpoint para recomendaciones inteligentes
        adapterProvider.server.get('/v1/recommendations/:phone', handleCtx(async (bot, req, res) => {
            try {
                const phone = req.params?.phone;
                if (!phone) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Número de teléfono requerido' 
                    }));
                    return;
                }
                
                const recommendations = getSmartRecommendations(phone, userSessions);
                const userAnalytics = await getUserAnalytics(phone);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: {
                        recommendations,
                        analytics: userAnalytics,
                        timestamp: new Date().toISOString()
                    }
                }, null, 2));
            } catch (error) {
                console.error('❌ Error obteniendo recomendaciones:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo recomendaciones' 
                }));
            }
        }));

        // Endpoint para estadísticas del router inteligente
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
                            features: [
                                'Intent Detection',
                                'Context Analysis',
                                'Automatic Routing',
                                'Confidence Scoring',
                                'Persuasion Integration'
                            ],
                            accuracy: routerStats.totalDecisions > 0 ? 
                                (routerStats.successfulRoutes / routerStats.totalDecisions * 100).toFixed(2) + '%' : 
                                'N/A'
                        }
                    },
                    timestamp: new Date().toISOString()
                }, null, 2));
            } catch (error) {
                console.error('❌ Error obteniendo stats del router:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo stats del router' 
                }));
            }
        }));

        // Endpoint para envío manual de mensajes (admin)
        adapterProvider.server.post('/v1/send-message', handleCtx(async (bot, req, res) => {
            try {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                
                req.on('end', async () => {
                    try {
                        const { phone, message, urgent = false } = JSON.parse(body);
                        
                        if (!phone || !message) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: false, 
                                error: 'Phone y message son requeridos' 
                            }));
                            return;
                        }
                        
                        const messages = Array.isArray(message) ? message : [message];
                        const urgency = urgent ? 'high' : 'medium';
                        
                        const sent = await sendSecureFollowUp(phone, messages, urgency);
                        
                        if (sent) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                message: 'Mensaje enviado correctamente',
                                timestamp: new Date().toISOString()
                            }));
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ 
                                success: false, 
                                error: 'No se pudo enviar el mensaje (posible spam protection)' 
                            }));
                        }
                        
                    } catch (parseError) {
                        console.error('❌ Error parseando request:', parseError);
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: false, 
                            error: 'JSON inválido' 
                        }));
                    }
                });
                
            } catch (error) {
                console.error('❌ Error enviando mensaje manual:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error interno del servidor' 
                }));
            }
        }));

        // Endpoint para obtener métricas de rendimiento
        adapterProvider.server.get('/v1/performance', handleCtx(async (bot, req, res) => {
            try {
                const performance = {
                    system: {
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        nodeVersion: process.version,
                        platform: process.platform
                    },
                    database: await businessDB.getPerformanceStats(),
                    ai: {
                        available: aiService.isAvailable(),
                        stats: AIMonitoring.getStats()
                    },
                    bot: {
                        activeUsers: Object.keys(userSessions).length,
                        totalSessions: await businessDB.getTotalSessions(),
                        messagesProcessed: await businessDB.getTotalMessages()
                    }
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: performance,
                    timestamp: new Date().toISOString()
                }, null, 2));
            } catch (error) {
                console.error('❌ Error obteniendo métricas de rendimiento:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Error obteniendo métricas' 
                }));
            }
        }));

        // Endpoint para migración manual (admin)
        // Endpoint para migración manual de base de datos
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

        // En app.ts - MEJORAR el endpoint de orders:
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

        // const fetch = require('node-fetch');
        const fetch = await import('node-fetch').then(module => module.default);
        const response = await fetch('http://localhost:3009/api/new-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...orderData,
                metadata: {
                    validated: true,
                    timestamp: new Date().toISOString()
                }
            })
        });

        let responseData;
        try {
            responseData = await response.json();
        } catch (err) {
            responseData = null;
        }

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
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
}));


        // Endpoint para verificar salud del sistema
        adapterProvider.server.get('/v1/health', handleCtx(async (bot, req, res) => {
            try {
                const health = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    services: {
                        database: await businessDB.checkConnection(),
                        ai: aiService.isAvailable(),
                        bot: !!botInstance,
                        followUpSystem: true
                    },
                    uptime: process.uptime(),
                    version: '2.0.0'
                };
                
                const allHealthy = Object.values(health.services).every(service => service === true);
                health.status = allHealthy ? 'healthy' : 'degraded';
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(health, null, 2));
            } catch (error) {
                console.error('❌ Error verificando salud del sistema:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'unhealthy',
                    error: error.message,
                    timestamp: new Date().toISOString()
                }));
            }
        }));

        const PORT = process.env.PORT ?? 3006;
        httpServer(+PORT);

        console.log(`\n🎉 ===== TECHAURA INTELLIGENT BOT INICIADO ===== 🎉`);
        console.log(`🚀 Puerto: ${PORT}`);
        console.log(`🧠 Sistema Inteligente: ACTIVO`);
        console.log(`📊 Analytics: http://localhost:${PORT}/v1/analytics`);
        console.log(`🤖 AI Stats: http://localhost:${PORT}/v1/ai/stats`);
        console.log(`💰 Sales Stats: http://localhost:${PORT}/v1/sales/stats`);
        console.log(`📈 Dashboard: http://localhost:${PORT}/v1/dashboard`);
        console.log(`🎯 User Info: http://localhost:${PORT}/v1/user/{phone}`);
        console.log(`🔮 Recommendations: http://localhost:${PORT}/v1/recommendations/{phone}`);
        console.log(`🎛️ Router Stats: http://localhost:${PORT}/v1/router/stats`);
        console.log(`💬 Send Message: POST http://localhost:${PORT}/v1/send-message`);
        console.log(`⚡ Performance: http://localhost:${PORT}/v1/performance`);
        console.log(`🏥 Health Check: http://localhost:${PORT}/v1/health`);
        console.log(`🔧 Manual Migration: POST http://localhost:${PORT}/v1/admin/migrate`);
        console.log(`🗄️ Base de datos: MySQL (${process.env.MYSQL_DB_NAME})`);
        
        if (aiService.isAvailable()) {
            console.log(`✅ IA: Gemini integrada y funcionando`);
        } else {
            console.log(`⚠️ IA: No disponible - Revisa GEMINI_API_KEY`);
        }
        
        console.log(`🎯 Router Inteligente: ACTIVO`);
        console.log(`🎨 Flujos de Personalización: ACTIVOS`);
        console.log(`🛒 Sistema de Pedidos: INTEGRADO`);
        console.log(`📱 Seguimiento Automático: FUNCIONANDO`);
        console.log(`===============================================\n`);

        // Log de inicio exitoso
        console.log('🎵 TechAura Intelligent Bot está listo para:');
        console.log('   • Analizar intenciones automáticamente');
        console.log('   • Dirigir usuarios al flujo correcto');
        console.log('   • Personalizar USBs completamente');
        console.log('   • Procesar pedidos inteligentemente');
        console.log('   • Hacer seguimiento persuasivo');
        console.log('   • Generar analytics avanzados');
        console.log('');
        console.log('🚀 ¡Sistema inteligente completamente operativo!');

    } catch (error: any) {
        console.error('❌ Error crítico iniciando aplicación:', error);
        console.error('Stack trace completo:', error.stack);
        
        // Intentar registrar el error si la DB está disponible
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

// Manejo de errores globales mejorado
process.on('uncaughtException', async (error) => {
    console.error('❌ Error no capturado:', error);
    console.error('Stack trace:', error.stack);
    
    // Log en base de datos si es posible
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
    
    // Dar tiempo para que se complete el logging
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
    console.error('Promise:', promise);
    
    // Log en base de datos si es posible
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

// Función para shutdown graceful mejorado
const gracefulShutdown = async (signal: string) => {
    console.log(`🛑 Recibida señal ${signal}, cerrando aplicación gracefully...`);
    
    try {
        // Cerrar conexiones de base de datos
        if (businessDB) {
            await businessDB.close();
            console.log('✅ Conexiones de base de datos cerradas');
        }
        
        // Dar tiempo para completar operaciones pendientes
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

// Exportar funciones útiles
export { sendAutomaticMessage, generatePersonalizedFollowUp, initializeApp };

// Iniciar aplicación
const startApplication = async () => {
    try {
        // Iniciar panel de control en paralelo
        startControlPanel();
        
        // Iniciar aplicación principal
        await main();
        
    } catch (error) {
        console.error('❌ Error crítico al iniciar la aplicación:', error);
        process.exit(1);
    }
};

// Ejecutar aplicación
startApplication();
