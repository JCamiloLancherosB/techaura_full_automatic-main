/**
 * Confirm Order Flow
 * Allows users to confirm their pending orders via WhatsApp
 */

import { addKeyword } from '@builderbot/bot';
import { businessDB } from '../mysql-database';

export const confirmOrderFlow = addKeyword(['confirmar pedido', 'confirmar orden', 'confirmar'])
    .addAnswer('📋 Buscando tu pedido pendiente...')
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        const phone = ctx.from;
        
        try {
            // Get pending orders for this phone
            const pendingOrders = await businessDB.getPendingOrdersByPhone(phone);
            
            if (pendingOrders.length === 0) {
                await flowDynamic('❌ No tienes pedidos pendientes de confirmación.');
                return endFlow();
            }
            
            // Show pending orders
            let message = '📦 *Tus pedidos pendientes:*\n\n';
            pendingOrders.forEach((order, index) => {
                message += `${index + 1}. *Orden: ${order.orderNumber || order.id}*\n`;
                message += `   📀 ${order.capacity || 'N/A'} - ${order.productType || 'N/A'}\n`;
                message += `   💰 $${(order.price || order.total || 0).toLocaleString()}\n\n`;
            });
            
            message += 'Responde con el número del pedido que deseas confirmar, o "todos" para confirmar todos.';
            
            await flowDynamic(message);
        } catch (error) {
            console.error('Error getting pending orders:', error);
            await flowDynamic('❌ Hubo un error al buscar tus pedidos. Por favor intenta más tarde.');
            return endFlow();
        }
    })
    .addAnswer('Esperando tu selección...', { capture: true }, 
        async (ctx, { flowDynamic, state, endFlow }) => {
            const response = ctx.body.toLowerCase().trim();
            const phone = ctx.from;
            
            try {
                // Get pending orders again to ensure fresh data
                const pendingOrders = await businessDB.getPendingOrdersByPhone(phone);
                
                if (pendingOrders.length === 0) {
                    await flowDynamic('❌ No tienes pedidos pendientes de confirmación.');
                    return endFlow();
                }
                
                if (response === 'todos' || response === 'all') {
                    // Confirm all pending orders
                    let successCount = 0;
                    let failCount = 0;
                    
                    for (const order of pendingOrders) {
                        const orderNumber = order.orderNumber || order.id;
                        const confirmed = await businessDB.confirmOrder(orderNumber);
                        if (confirmed) {
                            successCount++;
                        } else {
                            failCount++;
                        }
                    }
                    
                    if (successCount > 0) {
                        await flowDynamic(`✅ ¡${successCount} pedido(s) confirmado(s)!\n\nNos pondremos en contacto contigo pronto para coordinar el pago y envío.`);
                    }
                    
                    if (failCount > 0) {
                        await flowDynamic(`⚠️ ${failCount} pedido(s) no pudieron ser confirmados. Por favor contacta soporte.`);
                    }
                } else {
                    // Try to parse as number
                    const index = parseInt(response) - 1;
                    
                    if (isNaN(index) || index < 0 || index >= pendingOrders.length) {
                        await flowDynamic('❌ Selección no válida. Por favor responde con un número válido (1, 2, 3...) o "todos".');
                        return endFlow();
                    }
                    
                    const order = pendingOrders[index];
                    const orderNumber = order.orderNumber || order.id;
                    const confirmed = await businessDB.confirmOrder(orderNumber);
                    
                    if (confirmed) {
                        await flowDynamic(`✅ Pedido *${orderNumber}* confirmado!\n\nNos pondremos en contacto contigo pronto para coordinar el pago y envío.`);
                    } else {
                        await flowDynamic(`❌ No se pudo confirmar el pedido *${orderNumber}*. Por favor contacta soporte.`);
                    }
                }
                
                return endFlow();
            } catch (error) {
                console.error('Error confirming order:', error);
                await flowDynamic('❌ Hubo un error al confirmar tu pedido. Por favor intenta más tarde o contacta soporte.');
                return endFlow();
            }
        }
    );

export default confirmOrderFlow;
