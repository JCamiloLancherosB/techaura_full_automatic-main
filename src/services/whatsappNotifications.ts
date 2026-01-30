/**
 * WhatsApp Notifications Service
 * 
 * Features:
 * - Retry with exponential backoff
 * - Queue pending messages when WhatsApp is disconnected
 * - Logging of all notification attempts
 * - Optional SMS fallback after 3 failures
 */

import type { CustomerOrder } from '../../types/global';
import { outboundGate } from './OutboundGate';
import { USB_INTEGRATION, calculateBackoffDelay } from '../constants/usbIntegration';
import { unifiedLogger } from '../utils/unifiedLogger';

// =============================================================================
// Types & Interfaces
// =============================================================================

interface PendingMessage {
    id: string;
    phone: string;
    message: string;
    options: NotificationOptions;
    attempts: number;
    lastAttempt: Date | null;
    createdAt: Date;
    status: 'pending' | 'sending' | 'sent' | 'failed';
}

interface NotificationOptions {
    phone: string;
    messageType: string;
    status?: string;
    priority: 'high' | 'normal' | 'low';
    bypassTimeWindow?: boolean;
}

interface NotificationAttempt {
    phone: string;
    orderNumber?: string;
    notificationType: string;
    success: boolean;
    attempt: number;
    timestamp: Date;
    error?: string;
}

// =============================================================================
// State Management
// =============================================================================

/** Queue of pending messages for when WhatsApp is disconnected */
const pendingMessageQueue: Map<string, PendingMessage> = new Map();

/** Log of notification attempts */
const notificationAttemptLog: NotificationAttempt[] = [];
const MAX_ATTEMPT_LOG_SIZE = 1000;

/** WhatsApp connection state */
let isWhatsAppConnected = true;

/** Retry queue processing interval */
let retryIntervalId: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log a notification attempt
 */
function logNotificationAttempt(attempt: NotificationAttempt): void {
    notificationAttemptLog.push(attempt);
    
    // Keep log size manageable
    if (notificationAttemptLog.length > MAX_ATTEMPT_LOG_SIZE) {
        notificationAttemptLog.shift();
    }
    
    const logLevel = attempt.success ? 'info' : 'warn';
    unifiedLogger[logLevel]('notificador', 'Notification attempt', {
        phone: attempt.phone,
        orderNumber: attempt.orderNumber,
        type: attempt.notificationType,
        success: attempt.success,
        attempt: attempt.attempt,
        error: attempt.error
    });
}

/**
 * Add message to pending queue
 */
function addToPendingQueue(phone: string, message: string, options: NotificationOptions): string {
    const id = generateMessageId();
    
    pendingMessageQueue.set(id, {
        id,
        phone,
        message,
        options,
        attempts: 0,
        lastAttempt: null,
        createdAt: new Date(),
        status: 'pending'
    });
    
    unifiedLogger.info('notificador', 'Message added to pending queue', {
        id,
        phone,
        messageType: options.messageType,
        queueSize: pendingMessageQueue.size
    });
    
    return id;
}

/**
 * Process the pending message queue
 */
async function processPendingQueue(): Promise<void> {
    if (!isWhatsAppConnected || pendingMessageQueue.size === 0) {
        return;
    }
    
    for (const [id, msg] of pendingMessageQueue.entries()) {
        if (msg.status !== 'pending') continue;
        
        // Check if enough time has passed since last attempt
        if (msg.lastAttempt) {
            const backoffDelay = calculateBackoffDelay(msg.attempts);
            const timeSinceLastAttempt = Date.now() - msg.lastAttempt.getTime();
            if (timeSinceLastAttempt < backoffDelay) {
                continue;
            }
        }
        
        msg.status = 'sending';
        const success = await sendMessageWithRetry(msg.phone, msg.message, msg.options, msg.attempts);
        
        if (success) {
            msg.status = 'sent';
            pendingMessageQueue.delete(id);
        } else {
            msg.attempts++;
            msg.lastAttempt = new Date();
            
            if (msg.attempts >= USB_INTEGRATION.MAX_RETRY_ATTEMPTS) {
                msg.status = 'failed';
                // Optionally trigger SMS fallback here
                unifiedLogger.error('notificador', 'Message failed after max retries', {
                    id,
                    phone: msg.phone,
                    attempts: msg.attempts
                });
            } else {
                msg.status = 'pending';
            }
        }
    }
}

/**
 * Send a message with retry logic and exponential backoff
 */
async function sendMessageWithRetry(
    phone: string, 
    message: string, 
    options: NotificationOptions,
    currentAttempt: number = 0
): Promise<boolean> {
    const maxAttempts = USB_INTEGRATION.MAX_RETRY_ATTEMPTS;
    
    for (let attempt = currentAttempt; attempt < maxAttempts; attempt++) {
        try {
            const result = await outboundGate.sendMessage(phone, message, options);
            
            logNotificationAttempt({
                phone,
                notificationType: options.messageType,
                success: result.sent,
                attempt: attempt + 1,
                timestamp: new Date(),
                error: result.sent ? undefined : result.reason
            });
            
            if (result.sent) {
                return true;
            }
            
            // If blocked (not a connection issue), don't retry
            if (result.reason?.includes('blocked') || result.reason?.includes('policy')) {
                unifiedLogger.warn('notificador', 'Message blocked by policy', {
                    phone,
                    reason: result.reason
                });
                return false;
            }
            
            // Wait with exponential backoff before retry
            if (attempt < maxAttempts - 1) {
                const delay = calculateBackoffDelay(attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            
            logNotificationAttempt({
                phone,
                notificationType: options.messageType,
                success: false,
                attempt: attempt + 1,
                timestamp: new Date(),
                error: errorMsg
            });
            
            // Check if WhatsApp is disconnected
            if (errorMsg.includes('disconnected') || errorMsg.includes('not connected')) {
                isWhatsAppConnected = false;
                // Add to pending queue for later retry
                addToPendingQueue(phone, message, options);
                return false;
            }
            
            // Wait before retry
            if (attempt < maxAttempts - 1) {
                const delay = calculateBackoffDelay(attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    return false;
}

/**
 * Start the retry queue processor
 */
function startRetryProcessor(): void {
    if (retryIntervalId) return;
    
    // Process queue every 30 seconds
    retryIntervalId = setInterval(() => {
        processPendingQueue().catch(err => {
            unifiedLogger.error('notificador', 'Error processing pending queue', { error: err });
        });
    }, 30000);
    
    unifiedLogger.info('notificador', 'Retry processor started');
}

/**
 * Stop the retry queue processor
 */
function stopRetryProcessor(): void {
    if (retryIntervalId) {
        clearInterval(retryIntervalId);
        retryIntervalId = null;
        unifiedLogger.info('notificador', 'Retry processor stopped');
    }
}

// Start retry processor on module load
startRetryProcessor();

// =============================================================================
// WhatsApp Notifications Service
// =============================================================================

export const whatsappNotifications = {
    /**
     * Set the bot instance for sending messages
     */
    setBotInstance(botInstance: any): void {
        unifiedLogger.info('notificador', 'Bot instance set for whatsappNotifications');
        isWhatsAppConnected = true;
    },
    
    /**
     * Update WhatsApp connection status
     */
    setConnectionStatus(connected: boolean): void {
        const wasDisconnected = !isWhatsAppConnected;
        isWhatsAppConnected = connected;
        
        unifiedLogger.info('notificador', 'WhatsApp connection status updated', { connected });
        
        // If reconnected, process pending queue
        if (connected && wasDisconnected && pendingMessageQueue.size > 0) {
            unifiedLogger.info('notificador', 'Processing pending queue after reconnection', {
                queueSize: pendingMessageQueue.size
            });
            processPendingQueue().catch(err => {
                unifiedLogger.error('notificador', 'Error processing queue after reconnection', { error: err });
            });
        }
    },
    
    /**
     * Get pending message queue status
     */
    getPendingQueueStatus(): { size: number; messages: PendingMessage[] } {
        return {
            size: pendingMessageQueue.size,
            messages: Array.from(pendingMessageQueue.values())
        };
    },
    
    /**
     * Get recent notification attempts
     */
    getNotificationAttemptLog(limit: number = 50): NotificationAttempt[] {
        return notificationAttemptLog.slice(-limit);
    },
    
    /**
     * Stop the retry processor (for graceful shutdown)
     */
    shutdown(): void {
        stopRetryProcessor();
    },
    
    /**
     * Send order notification with retry
     */
    async sendOrderNotification(phone: string, orderNumber: string, status: string): Promise<void> {
        unifiedLogger.info('notificador', 'Sending order notification', { phone, orderNumber, status });
        
        const message = `🔔 Actualización de tu pedido #${orderNumber}\nEstado: ${status}`;
        
        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status,
            priority: 'high',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return;
        }
        
        await sendMessageWithRetry(phone, message, options);
    },
     
    /**
     * Send follow-up message with retry
     */
    async sendFollowUpMessage(phone: string, message: string): Promise<void> {
        unifiedLogger.info('notificador', 'Sending follow-up message', { phone });
        
        const options: NotificationOptions = {
            phone,
            messageType: 'followup',
            priority: 'normal'
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return;
        }
        
        await sendMessageWithRetry(phone, message, options);
    },
    
    /**
     * Send promotion with retry
     */
    async sendPromotion(phone: string, promotion: string): Promise<void> {
        unifiedLogger.info('notificador', 'Sending promotion', { phone });
        
        const options: NotificationOptions = {
            phone,
            messageType: 'persuasive',
            priority: 'low'
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, promotion, options);
            return;
        }
        
        await sendMessageWithRetry(phone, promotion, options);
    },
    
    /**
     * Send generic message
     */
    async sendMessage(phone: string, message: string): Promise<void> {
        unifiedLogger.info('notificador', 'Sending message', { phone });
        
        const options: NotificationOptions = {
            phone,
            messageType: 'general',
            priority: 'normal'
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return;
        }
        
        await sendMessageWithRetry(phone, message, options);
    },
    
    /**
     * Send admin alert
     */
    async sendAdminAlert(message: string): Promise<void> {
        unifiedLogger.info('notificador', 'Sending admin alert', { message: message.substring(0, 100) });
    },
    
    /**
     * Send order completed notification with retry
     */
    async sendOrderCompletedNotification(order: any): Promise<boolean> {
        unifiedLogger.info('notificador', 'Sending order completed notification', { 
            orderNumber: order.orderNumber 
        });
        
        const phone = order.phoneNumber || order.customerPhone || '';
        const message = [
            '✅ *¡Tu pedido está listo!*',
            '',
            `📋 *Pedido:* ${order.orderNumber}`,
            '',
            '¡Gracias por tu compra! 🎵'
        ].join('\n');
        
        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status: 'completed',
            priority: 'high',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return true; // Queued for later
        }
        
        return await sendMessageWithRetry(phone, message, options);
    },
    
    /**
     * Send order error notification with retry
     */
    async sendOrderErrorNotification(order: any): Promise<boolean> {
        unifiedLogger.info('notificador', 'Sending order error notification', { 
            orderNumber: order.orderNumber 
        });
        
        const phone = order.phoneNumber || order.customerPhone || '';
        const message = [
            '⚠️ *Problema con tu pedido*',
            '',
            `📋 *Pedido:* ${order.orderNumber}`,
            '',
            'Te contactaremos pronto para resolverlo.'
        ].join('\n');
        
        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status: 'error',
            priority: 'high',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return true;
        }
        
        return await sendMessageWithRetry(phone, message, options);
    },
    
    /**
     * Send order processing notification with retry
     */
    async sendOrderProcessingNotification(order: CustomerOrder): Promise<boolean> {
        unifiedLogger.info('notificador', 'Sending order processing notification', { 
            orderNumber: order.orderNumber 
        });
        
        const phone = order.phoneNumber || '';
        const message = [
            '🔄 *Tu pedido está siendo procesado*',
            '',
            `📋 *Pedido:* ${order.orderNumber}`,
            `🎵 *Tipo:* ${order.productType}`,
            `💾 *Capacidad:* ${order.capacity}`,
            '',
            '⚡ *Proceso automático en curso:*',
            '• ✅ Preparando tu pedido',
            '• 📁 Organizando contenido',
            '• 💾 Copiando archivos seleccionados',
            '',
            '⏰ *Te notificaremos cuando esté listo*'
        ].join('\n');

        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status: 'processing',
            priority: 'high',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return true;
        }
        
        return await sendMessageWithRetry(phone, message, options);
    },

    /**
     * Send notification when USB burning process starts with retry
     */
    async sendBurningStartedNotification(order: {
        orderNumber?: string;
        phoneNumber?: string;
        customerPhone?: string;
        productType?: string;
        capacity?: string;
    }): Promise<boolean> {
        const phone = order.phoneNumber || order.customerPhone || '';
        const orderNum = order.orderNumber || 'N/A';
        
        unifiedLogger.info('notificador', 'Sending burning started notification', { 
            orderNumber: orderNum, 
            phone 
        });
        
        const message = [
            '🔥 *¡GRABACIÓN USB INICIADA!*',
            '',
            `📋 *Pedido:* ${orderNum}`,
            `🎵 *Tipo:* ${order.productType || 'USB'}`,
            `💾 *Capacidad:* ${order.capacity || 'N/A'}`,
            '',
            '⚡ *Proceso de grabación en curso:*',
            '• 💾 Preparando USB',
            '• 📁 Organizando contenido seleccionado',
            '• 🔄 Copiando archivos...',
            '',
            '⏰ *Tiempo estimado:* 15-30 minutos',
            '📱 *Te notificaremos cuando esté lista*'
        ].join('\n');
        
        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status: 'burning_started',
            priority: 'high',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return true;
        }
        
        return await sendMessageWithRetry(phone, message, options);
    },

    /**
     * Send notification about USB burning progress with retry
     */
    async sendBurningProgressNotification(order: {
        orderNumber?: string;
        phoneNumber?: string;
        customerPhone?: string;
    }, progress: number): Promise<boolean> {
        const phone = order.phoneNumber || order.customerPhone || '';
        const orderNum = order.orderNumber || 'N/A';
        
        unifiedLogger.info('notificador', 'Sending burning progress notification', { 
            orderNumber: orderNum, 
            progress 
        });
        
        // Create progress bar visual
        const filled = Math.floor(progress / 10);
        const empty = 10 - filled;
        const progressBar = '█'.repeat(filled) + '░'.repeat(empty);
        
        const message = [
            '📊 *PROGRESO DE GRABACIÓN USB*',
            '',
            `📋 *Pedido:* ${orderNum}`,
            '',
            `🔄 *Progreso:* ${progress}%`,
            `[${progressBar}]`,
            '',
            progress < 50 ? '• 📁 Organizando archivos...' :
            progress < 80 ? '• 💾 Copiando contenido...' :
            '• ✅ Finalizando grabación...',
            '',
            '📱 *Te avisaremos cuando esté lista*'
        ].join('\n');
        
        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status: 'burning_progress',
            priority: 'normal',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return true;
        }
        
        return await sendMessageWithRetry(phone, message, options);
    },

    /**
     * Send notification when USB burning is completed with retry
     */
    async sendBurningCompletedNotification(order: {
        orderNumber?: string;
        phoneNumber?: string;
        customerPhone?: string;
        productType?: string;
        capacity?: string;
        usbLabel?: string;
    }): Promise<boolean> {
        const phone = order.phoneNumber || order.customerPhone || '';
        const orderNum = order.orderNumber || 'N/A';
        
        unifiedLogger.info('notificador', 'Sending burning completed notification', { 
            orderNumber: orderNum 
        });
        
        const message = [
            '🎉 *¡TU USB ESTÁ LISTA!*',
            '',
            `📋 *Pedido:* ${orderNum}`,
            `🎵 *Tipo:* ${order.productType || 'USB'}`,
            `💾 *Capacidad:* ${order.capacity || 'N/A'}`,
            order.usbLabel ? `🏷️ *Etiqueta:* ${order.usbLabel}` : '',
            '',
            '✅ *Grabación completada exitosamente*',
            '',
            '📦 *Tu USB ha sido procesada y está lista*',
            '',
            '🕒 *Horarios de atención:*',
            '• Lunes a Viernes: 9:00 AM - 6:00 PM',
            '• Sábados: 9:00 AM - 2:00 PM',
            '',
            '¡Gracias por tu compra! 🎵'
        ].filter(Boolean).join('\n');
        
        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status: 'burning_completed',
            priority: 'high',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return true;
        }
        
        return await sendMessageWithRetry(phone, message, options);
    },

    /**
     * Send notification when USB burning fails with retry
     */
    async sendBurningErrorNotification(order: {
        orderNumber?: string;
        phoneNumber?: string;
        customerPhone?: string;
        customerName?: string;
    }, errorMsg: string): Promise<boolean> {
        const phone = order.phoneNumber || order.customerPhone || '';
        const orderNum = order.orderNumber || 'N/A';
        const customerName = order.customerName || 'Cliente';
        
        unifiedLogger.info('notificador', 'Sending burning error notification', { 
            orderNumber: orderNum 
        });
        
        const message = [
            '⚠️ *PROBLEMA CON LA GRABACIÓN USB*',
            '',
            `📋 *Pedido:* ${orderNum}`,
            `👤 *Cliente:* ${customerName}`,
            '',
            '❌ *Hubo un problema durante la grabación:*',
            errorMsg,
            '',
            '🔧 *Estamos trabajando en solucionarlo*',
            '',
            '📞 *Próximos pasos:*',
            '• Nuestro equipo técnico revisará el problema',
            '• Te contactaremos pronto para resolverlo',
            '• Tu pedido tiene prioridad alta',
            '',
            'Disculpas por las molestias 🙏'
        ].join('\n');
        
        const options: NotificationOptions = {
            phone,
            messageType: 'order',
            status: 'burning_error',
            priority: 'high',
            bypassTimeWindow: true
        };
        
        if (!isWhatsAppConnected) {
            addToPendingQueue(phone, message, options);
            return true;
        }
        
        return await sendMessageWithRetry(phone, message, options);
    }
};

// Exportar la instancia para uso en otros módulos
export default whatsappNotifications;
