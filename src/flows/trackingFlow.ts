import { addKeyword, EVENTS } from '@builderbot/bot';
import { ShipmentTrackingService } from '../services/ShipmentTrackingService';

const trackingService = new ShipmentTrackingService();

export const trackingFlow = addKeyword(['rastrear', 'tracking', 'guia', 'donde esta mi pedido', 'estado envio'])
    .addAnswer('🔍 Buscando información de tu envío...')
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const phone = ctx.from;
        
        const trackingInfos = await trackingService.getTrackingForCustomer(phone);
        
        if (trackingInfos.length === 0) {
            await flowDynamic([
                '❌ No encontré envíos activos asociados a tu número.',
                '',
                'Si tienes un número de guía, escríbelo y te ayudo a rastrearlo.',
                'Ejemplo: 12345678901'
            ]);
            return endFlow();
        }
        
        for (const info of trackingInfos) {
            const eventsText = info.events.slice(0, 3).map(e => 
                `📍 ${e.date.toLocaleDateString('es-CO')} - ${e.description}`
            ).join('\n');
            
            await flowDynamic([
                `📦 *Guía:* ${info.trackingNumber}`,
                `🏢 *Transportadora:* ${info.carrier}`,
                `📊 *Estado:* ${info.status}`,
                info.currentLocation ? `📍 *Ubicación:* ${info.currentLocation}` : '',
                '',
                '*Últimos movimientos:*',
                eventsText || 'Sin movimientos registrados'
            ].filter(Boolean).join('\n'));
        }
        
        return endFlow();
    });

// Flow for direct tracking number input
export const directTrackingFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const message = ctx.body.trim();
        
        // Check if message looks like a tracking number
        if (/^\d{10,15}$/.test(message) || /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(message)) {
            const info = await trackingService.trackShipment(message);
            
            if (info) {
                await flowDynamic([
                    `📦 *Información de guía ${message}:*`,
                    '',
                    `🏢 *Transportadora:* ${info.carrier}`,
                    `📊 *Estado:* ${info.status}`,
                    info.currentLocation ? `📍 *Ubicación:* ${info.currentLocation}` : '',
                    info.estimatedDelivery ? `📅 *Entrega estimada:* ${info.estimatedDelivery.toLocaleDateString('es-CO')}` : ''
                ].filter(Boolean).join('\n'));
                return endFlow();
            }
        }
        
        // Not a tracking number, continue with normal flow
    });
