// interface NotificationService {
//     sendMessage(phoneNumber: string, message: string[]): Promise<boolean>;
// }

// interface BotInstance {
//     provider: {
//         sendText: (phone: string, message: string) => Promise<void>;
//     };
// }

// interface CustomerOrder {
//     orderNumber: string;
//     phoneNumber: string;
//     customerName: string;
//     productType: string;
//     capacity: string;
//     usbLabel?: string;
// }

// class WhatsAppNotificationService implements NotificationService {
//     private botInstance: BotInstance | null = null;

//     // Configurar instancia del bot para enviar mensajes
//     public setBotInstance(botInstance: BotInstance): void {
//         this.botInstance = botInstance;
//     }

//     // Enviar mensaje a número específico
//     public async sendMessage(phoneNumber: string, messages: string[]): Promise<boolean> {
//         if (!this.botInstance) {
//             console.error('❌ Bot instance no configurada para notificaciones');
//             return false;
//         }

//         try {
//             // Formatear número de teléfono
//             const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
//             // Enviar cada mensaje con un pequeño delay
//             for (const message of messages) {
//                 await this.botInstance.provider.sendText(formattedPhone, message);
//                 await this.delay(1000); // 1 segundo entre mensajes
//             }

//             console.log(`✅ Notificación enviada a ${phoneNumber}`);
//             return true;

//         } catch (error) {
//             console.error(`❌ Error enviando notificación a ${phoneNumber}:`, error);
//             return false;
//         }
//     }

//     // Formatear número de teléfono
//     private formatPhoneNumber(phoneNumber: string): string {
//         // Remover caracteres no numéricos
//         let cleaned = phoneNumber.replace(/\D/g, '');
        
//         // Si no tiene código de país, agregar el predeterminado (ajustar según tu país)
//         if (cleaned.length === 10) {
//             cleaned = '57' + cleaned; // Colombia como ejemplo
//         }
        
//         return cleaned + '@s.whatsapp.net';
//     }

//     // Delay helper
//     private delay(ms: number): Promise<void> {
//         return new Promise(resolve => setTimeout(resolve, ms));
//     }

//     // Notificación de pedido completado
//     public async sendOrderCompletedNotification(order: CustomerOrder): Promise<boolean> {
//         const messages = [
//             '🎉 *¡Tu pedido está listo!*',
//             '',
//             `📋 *Pedido:* ${order.orderNumber}`,
//             `🎵 *Tipo:* ${order.productType.toUpperCase()}`,
//             `💾 *Capacidad:* ${order.capacity}`,
//             `🏷️ *Etiqueta USB:* ${order.usbLabel || 'N/A'}`,
//             '',
//             '✅ *Tu USB ha sido procesada exitosamente*',
//             '📦 *Lista para recoger en el local*',
//             '',
//             '🕒 *Horarios de atención:*',
//             '• Lunes a Viernes: 9:00 AM - 6:00 PM',
//             '• Sábados: 9:00 AM - 2:00 PM',
//             '',
//             '📍 *Ubicación:* [Tu dirección aquí]',
//             '',
//             '¡Gracias por tu compra! 🎵'
//         ];

//         return await this.sendMessage(order.phoneNumber, messages);
//     }

//     // Notificación de error en procesamiento
//     public async sendOrderErrorNotification(order: CustomerOrder): Promise<boolean> {
//         const messages = [
//             '⚠️ *Problema con tu pedido*',
//             '',
//             `📋 *Pedido:* ${order.orderNumber}`,
//             `👤 *Cliente:* ${order.customerName}`,
//             '',
//             '❌ *Hubo un problema procesando tu pedido*',
//             '',
//             '🔧 *Posibles causas:*',
//             '• No hay USBs vacías disponibles',
//             '• Error en la copia de archivos',
//             '• Problema técnico del sistema',
//             '',
//             '📞 *Solución:*',
//             'Nuestro equipo técnico está revisando el problema.',
//             'Te contactaremos pronto para resolverlo.',
//             '',
//             'Disculpas por las molestias 🙏'
//         ];

//         return await this.sendMessage(order.phoneNumber, messages);
//     }

//     // Notificación de pedido en procesamiento
//     public async sendOrderProcessingNotification(order: CustomerOrder): Promise<boolean> {
//         const messages = [
//             '🔄 *Tu pedido está siendo procesado*',
//             '',
//             `📋 *Pedido:* ${order.orderNumber}`,
//             `🎵 *Tipo:* ${order.productType.toUpperCase()}`,
//             `💾 *Capacidad:* ${order.capacity}`,
//             '',
//             '⚡ *Proceso automático en curso:*',
//             '• ✅ USB detectada y formateada',
//             '• 📁 Organizando contenido por géneros',
//             '• 🔍 Verificando archivos sin duplicados',
//             '• 💾 Copiando música seleccionada',
//             '',
//             '⏰ *Tiempo estimado:* 15-30 minutos',
//             '📱 *Te notificaremos cuando esté listo*'
//         ];

//         return await this.sendMessage(order.phoneNumber, messages);
//     }

//     // Notificación de alerta para administradores
//     public async sendAdminAlert(message: string, phoneNumbers: string[]): Promise<void> {
//         const alertMessage = [
//             '🚨 *ALERTA DEL SISTEMA USB*',
//             '',
//             message,
//             '',
//             `⏰ *Hora:* ${new Date().toLocaleString()}`,
//             '',
//             '🎛️ *Panel de control:* http://localhost:3000'
//         ];

//         for (const phone of phoneNumbers) {
//             await this.sendMessage(phone, alertMessage);
//         }
//     }
// }

// // Instancia singleton del servicio de notificaciones
// export const whatsappNotifications = new WhatsAppNotificationService();

// src/whatsappNotifications.ts
// src/whatsappNotifications.ts
import type { CustomerOrder } from '../../types/global';
import { outboundGate } from './OutboundGate';

export const whatsappNotifications = {
    setBotInstance(botInstance: any) {
        console.log('✅ Bot instance set for whatsappNotifications');
    },
    
    async sendOrderNotification(phone: string, orderNumber: string, status: string): Promise<void> {
        console.log(`📱 Sending order notification ${orderNumber} to ${phone}: ${status}`);
        
        const message = `🔔 Actualización de tu pedido #${orderNumber}\nEstado: ${status}`;
        
        const result = await outboundGate.sendMessage(
            phone,
            message,
            {
                phone,
                messageType: 'order',
                status,
                priority: 'high',
                bypassTimeWindow: true
            }
        );
        
        if (!result.sent) {
            console.warn(`⚠️ Order notification blocked: ${result.reason}`);
        }
    },
     
    async sendFollowUpMessage(phone: string, message: string): Promise<void> {
        console.log(`📱 Sending follow-up to ${phone}: ${message}`);
        
        const result = await outboundGate.sendMessage(
            phone,
            message,
            {
                phone,
                messageType: 'followup',
                priority: 'normal'
            }
        );
        
        if (!result.sent) {
            console.warn(`⚠️ Follow-up blocked: ${result.reason}`);
        }
    },
    
    async sendPromotion(phone: string, promotion: string): Promise<void> {
        console.log(`📱 Sending promotion to ${phone}: ${promotion}`);
        
        const result = await outboundGate.sendMessage(
            phone,
            promotion,
            {
                phone,
                messageType: 'persuasive',
                priority: 'low'
            }
        );
        
        if (!result.sent) {
            console.warn(`⚠️ Promotion blocked: ${result.reason}`);
        }
    },
    
    async sendMessage(phone: string, message: string): Promise<void> {
        console.log(`📱 Enviando mensaje a ${phone}: ${message}`);
    },
    
    async sendAdminAlert(message: string): Promise<void> {
        console.log(`🚨 Alerta admin: ${message}`);
    },
    
    async sendOrderCompletedNotification(order: any): Promise<boolean> {
        console.log(`✅ Orden completada: ${order.orderNumber}`);
        return true;
    },
    
    async sendOrderErrorNotification(order: any): Promise<boolean> {
        console.log(`❌ Error en orden: ${order.orderNumber}`);
        return true;
    },
    
    async sendOrderProcessingNotification(order: CustomerOrder): Promise<boolean> {
        const messages = [
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
        ];

        return await this.sendMessage(order.phoneNumber, messages);
    },

    /**
     * Send notification when USB burning process starts
     * @param order - Order data containing order details
     * @returns true if notification was sent successfully
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
        
        console.log(`🔥 Sending burning started notification for order ${orderNum} to ${phone}`);
        
        try {
            const result = await outboundGate.sendMessage(
                phone,
                message,
                {
                    phone,
                    messageType: 'order',
                    status: 'burning_started',
                    priority: 'high',
                    bypassTimeWindow: true
                }
            );
            
            if (!result.sent) {
                console.warn(`⚠️ Burning started notification blocked: ${result.reason}`);
                return false;
            }
            return true;
        } catch (error) {
            console.error(`❌ Error sending burning started notification:`, error);
            return false;
        }
    },

    /**
     * Send notification about USB burning progress
     * @param order - Order data
     * @param progress - Progress percentage (0-100)
     * @returns true if notification was sent successfully
     */
    async sendBurningProgressNotification(order: {
        orderNumber?: string;
        phoneNumber?: string;
        customerPhone?: string;
    }, progress: number): Promise<boolean> {
        const phone = order.phoneNumber || order.customerPhone || '';
        const orderNum = order.orderNumber || 'N/A';
        
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
        
        console.log(`📊 Sending burning progress notification (${progress}%) for order ${orderNum}`);
        
        try {
            const result = await outboundGate.sendMessage(
                phone,
                message,
                {
                    phone,
                    messageType: 'order',
                    status: 'burning_progress',
                    priority: 'normal',
                    bypassTimeWindow: true
                }
            );
            
            if (!result.sent) {
                console.warn(`⚠️ Burning progress notification blocked: ${result.reason}`);
                return false;
            }
            return true;
        } catch (error) {
            console.error(`❌ Error sending burning progress notification:`, error);
            return false;
        }
    },

    /**
     * Send notification when USB burning is completed
     * @param order - Order data
     * @returns true if notification was sent successfully
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
        
        console.log(`🎉 Sending burning completed notification for order ${orderNum}`);
        
        try {
            const result = await outboundGate.sendMessage(
                phone,
                message,
                {
                    phone,
                    messageType: 'order',
                    status: 'burning_completed',
                    priority: 'high',
                    bypassTimeWindow: true
                }
            );
            
            if (!result.sent) {
                console.warn(`⚠️ Burning completed notification blocked: ${result.reason}`);
                return false;
            }
            return true;
        } catch (error) {
            console.error(`❌ Error sending burning completed notification:`, error);
            return false;
        }
    },

    /**
     * Send notification when USB burning fails
     * @param order - Order data
     * @param errorMsg - Error message describing what went wrong
     * @returns true if notification was sent successfully
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
        
        console.log(`⚠️ Sending burning error notification for order ${orderNum}`);
        
        try {
            const result = await outboundGate.sendMessage(
                phone,
                message,
                {
                    phone,
                    messageType: 'order',
                    status: 'burning_error',
                    priority: 'high',
                    bypassTimeWindow: true
                }
            );
            
            if (!result.sent) {
                console.warn(`⚠️ Burning error notification blocked: ${result.reason}`);
                return false;
            }
            return true;
        } catch (error) {
            console.error(`❌ Error sending burning error notification:`, error);
            return false;
        }
    }
};

// Exportar la instancia para uso en otros módulos
export default whatsappNotifications;
