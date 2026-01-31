import { ShippingGuideParser, ShippingGuideData } from './ShippingGuideParser';
import { CustomerMatcher } from './CustomerMatcher';
import { businessDB } from '../mysql-database';
import path from 'path';
import fs from 'fs';

export class ShippingGuideSender {
    private parser: ShippingGuideParser;
    private matcher: CustomerMatcher;
    
    constructor() {
        this.parser = new ShippingGuideParser();
        this.matcher = new CustomerMatcher();
    }
    
    /**
     * Process a shipping guide file and send to customer
     */
    async processAndSend(filePath: string): Promise<{
        success: boolean;
        message: string;
        trackingNumber?: string;
        sentTo?: string;
    }> {
        // 1. Parse the guide
        const mimeType = this.getMimeType(filePath);
        const guideData = await this.parser.parseGuide(filePath, mimeType);
        
        if (!guideData) {
            return {
                success: false,
                message: 'No se pudo extraer información de la guía'
            };
        }
        
        // 2. Find matching customer
        const match = await this.matcher.findCustomer(guideData);
        
        if (!match.matched) {
            // Log for manual review
            await this.logUnmatchedGuide(guideData);
            return {
                success: false,
                message: 'No se encontró cliente coincidente',
                trackingNumber: guideData.trackingNumber
            };
        }
        
        // 3. Send guide via WhatsApp
        const sent = await this.sendGuideToCustomer(
            match.phoneNumber!,
            guideData,
            filePath
        );
        
        if (sent) {
            // 4. Update order with tracking info
            await this.updateOrderTracking(match.orderNumber!, guideData);
            
            return {
                success: true,
                message: 'Guía enviada exitosamente',
                trackingNumber: guideData.trackingNumber,
                sentTo: match.phoneNumber
            };
        }
        
        return {
            success: false,
            message: 'Error enviando guía por WhatsApp',
            trackingNumber: guideData.trackingNumber
        };
    }
    
    private async sendGuideToCustomer(
        phone: string, 
        guideData: ShippingGuideData,
        filePath: string
    ): Promise<boolean> {
        try {
            const whatsapp = (global as any).adapterProvider;
            if (!whatsapp) {
                console.error('WhatsApp provider not available');
                return false;
            }
            
            // Format message
            const message = this.formatTrackingMessage(guideData);
            
            // Send text message
            await whatsapp.sendMessage(phone, message);
            
            // Send guide image/PDF
            await whatsapp.sendMedia(phone, filePath, 'Guía de envío');
            
            return true;
        } catch (error) {
            console.error('Error sending guide:', error);
            return false;
        }
    }
    
    private formatTrackingMessage(data: ShippingGuideData): string {
        return `🚚 *¡Tu pedido ha sido enviado!*

📦 *Número de guía:* ${data.trackingNumber}
🏢 *Transportadora:* ${data.carrier || 'Ver guía adjunta'}
📍 *Destino:* ${data.city || 'Ver guía'}

${data.estimatedDelivery ? `📅 *Entrega estimada:* ${data.estimatedDelivery.toLocaleDateString('es-CO')}` : ''}

Puedes rastrear tu envío en la página de la transportadora.

¡Gracias por tu compra! 🎉`;
    }
    
    private async updateOrderTracking(orderNumber: string, data: ShippingGuideData): Promise<void> {
        await businessDB.execute(`
            UPDATE orders SET
                tracking_number = ?,
                carrier = ?,
                shipping_status = 'shipped',
                shipped_at = NOW(),
                updated_at = NOW()
            WHERE order_number = ?
        `, [data.trackingNumber, data.carrier, orderNumber]);
    }
    
    private async logUnmatchedGuide(data: ShippingGuideData): Promise<void> {
        try {
            await businessDB.execute(`
                INSERT INTO error_logs (type, error_message, stack_trace, created_at)
                VALUES (?, ?, ?, NOW())
            `, [
                'unmatched_shipping_guide',
                `No se encontró cliente para guía ${data.trackingNumber}`,
                JSON.stringify(data)
            ]);
        } catch (error) {
            console.error('Error logging unmatched guide:', error);
        }
    }
    
    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}
