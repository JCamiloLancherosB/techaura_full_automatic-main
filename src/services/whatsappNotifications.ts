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

export const whatsappNotifications = {
    setBotInstance(botInstance: any) {
        console.log('Bot instance set');
    },
    
    async sendOrderNotification(phone: string, orderNumber: string, status: string): Promise<void> {
        console.log(`📱 Enviando notificación de orden ${orderNumber} a ${phone}: ${status}`);
    },
     
    async sendFollowUpMessage(phone: string, message: string): Promise<void> {
        console.log(`📱 Enviando seguimiento a ${phone}: ${message}`);
    },
    
    async sendPromotion(phone: string, promotion: string): Promise<void> {
        console.log(`📱 Enviando promoción a ${phone}: ${promotion}`);
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
        '• ✅ USB detectada y formateada',
        '• 📁 Organizando contenido',
        '• 💾 Copiando archivos seleccionados',
        '',
        '⏰ *Te notificaremos cuando esté listo*'
    ];
    
    return await this.sendMessage(order.phoneNumber, messages);
}
};

// Exportar la instancia para uso en otros módulos
export default whatsappNotifications;