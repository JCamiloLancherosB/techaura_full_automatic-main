import { join } from 'path';
import { addKeyword, EVENTS } from '@builderbot/bot';
import { unifiedLogger } from '../utils/unifiedLogger';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import { promises as fs } from 'fs';
import { parseCapacitySelection, CatalogItem } from '../utils/textUtils';
import { catalogService } from '../services/CatalogService';
import {
    applyReadabilityBudget,
    createPendingDetails,
    isMoreRequest,
    hasPendingDetails,
    getPendingDetails,
    clearPendingDetails,
    formatPendingDetails
} from '../utils/readabilityBudget';

// Build catalog dynamically from CatalogService (async version for database support)
const buildCatalogFromService = async (): Promise<CatalogItem[]> => {
    const musicProducts = await catalogService.getProductsByCategoryAsync('music');
    return musicProducts.map(product => ({
        capacity_gb: product.capacityGb,
        price: product.price,
        description: `${product.capacity} - ~${product.content.count.toLocaleString('es-CO')} ${product.content.unit}`
    }));
};

// Helper to get pricing info by capacity GB (async version for database support)
const getPricingInfoByGB = async (capacityGB: number) => {
    const musicProducts = await catalogService.getProductsByCategoryAsync('music');
    const product = musicProducts.find(p => p.capacityGb === capacityGB);
    
    if (!product) return null;
    
    const price = await catalogService.getPriceAsync('music', capacityGB);
    
    return {
        capacity: product.capacity,
        songs: `~${product.content.count.toLocaleString('es-CO')} ${product.content.unit}`,
        price: `$${price.toLocaleString('es-CO')}`,
        videos: `~${Math.round(capacityGB * 1.875)} películas HD` // Approximate video count
    };
};

const prices = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        try {
            unifiedLogger.info('flow', 'Prices flow initiated', { phone: ctx.from });

            // Check if user is requesting MORE details
            const session = await getUserSession(ctx.from);
            if (isMoreRequest(ctx.body || '') && hasPendingDetails(session.conversationData)) {
                const pending = getPendingDetails(session.conversationData);
                if (pending) {
                    const chunks = formatPendingDetails(pending);
                    for (const chunk of chunks) {
                        await flowDynamic([chunk]);
                    }
                    // Clear pending details after sending
                    await updateUserSession(
                        ctx.from,
                        ctx.body || 'MORE',
                        'prices',
                        'viewing_prices',
                        false,
                        {
                            metadata: {
                                conversationData: clearPendingDetails(session.conversationData)
                            }
                        }
                    );
                    return endFlow();
                }
            }

            await updateUserSession(
                ctx.from,
                ctx.body || 'Consultó precios',
                'prices',
                'viewing_prices',
                false,
                {
                    metadata: {
                        timestamp: new Date().toISOString(),
                        userName: ctx.name || ctx.pushName
                    }
                }
            );

            const userName = ctx.name || ctx.pushName || 'amigo';

            // Check if the image exists before trying to send it
            const pricesImagePath = join(__dirname, '..', '..', 'Productos', 'PPrices', 'prices.png');
            let imageExists = false;
            
            try {
                await fs.access(pricesImagePath);
                imageExists = true;
            } catch (error: any) {
                unifiedLogger.warn('flow', 'Prices image not found', { 
                    path: pricesImagePath,
                    error: error.code || error.message 
                });
            }

            // Build pricing message dynamically from CatalogService (using async for database support)
            const musicProducts = await catalogService.getProductsByCategoryAsync('music');
            const pricingLines = [
                `💰 ¡Hola ${userName}! Aquí está nuestra lista de capacidades y precios:`,
                '',
                '📦 **OPCIONES DISPONIBLES:**',
                ''
            ];

            for (const product of musicProducts) {
                const videoCount = Math.round(product.capacityGb * 1.875);
                let badge = '';
                if (product.popular) badge = ' ⭐ MÁS POPULAR';
                if (product.recommended) badge = ' 💎 PREMIUM';
                if (product.capacityGb === 128) badge = ' 💎 PREMIUM';
                
                const price = await catalogService.getPriceAsync('music', product.capacityGb);
                
                pricingLines.push(
                    `🔹 **${product.capacity}** - $${price.toLocaleString('es-CO')}${badge}`,
                    `   • ~${product.content.count.toLocaleString('es-CO')} ${product.content.unit} o ~${videoCount} películas HD`,
                    `   • ${product.capacityGb <= 8 ? 'Ideal para uso básico' : product.capacityGb <= 32 ? 'Perfecto para estudiantes' : product.capacityGb <= 64 ? 'Gran capacidad' : 'Máxima capacidad'}`,
                    ''
                );
            }

            pricingLines.push(
                '✨ **INCLUYE GRATIS:**',
                ...musicProducts[0].inclusions.map(inc => `• ${inc}`),
                '',
                `📝 ¿Cuál capacidad te interesa? (${musicProducts.map(p => p.capacity.toLowerCase()).join(', ')})`
            );

            // Apply readability budget to pricing message
            const fullMessage = pricingLines.join('\n');
            const budgetResult = applyReadabilityBudget(fullMessage);

            await flowDynamic([budgetResult.message]);

            // Store pending details if message was truncated
            if (budgetResult.wasTruncated && budgetResult.pendingDetails) {
                const pendingDetails = createPendingDetails(budgetResult.pendingDetails, 'pricing');
                await updateUserSession(
                    ctx.from,
                    ctx.body || 'Consultó precios',
                    'prices',
                    'viewing_prices',
                    false,
                    {
                        metadata: {
                            conversationData: {
                                ...(session.conversationData || {}),
                                pendingDetails
                            }
                        }
                    }
                );
                unifiedLogger.info('flow', 'Pricing message truncated, details stored for MORE request', { 
                    phone: ctx.from 
                });
            }

            // Only send image if it exists
            if (imageExists) {
                await flowDynamic([{
                    body: '📊 Aquí puedes ver la tabla de capacidades:',
                    media: pricesImagePath
                }]);
            }

        } catch (error: any) {
            unifiedLogger.error('flow', 'Error in prices flow initialization', { 
                phone: ctx.from, 
                error: error.message 
            });

            // Fallback: Use CatalogService for simple pricing list (async version)
            try {
                const musicProducts = await catalogService.getProductsByCategoryAsync('music');
                const fallbackLines = ['💰 **PRECIOS DE USB PERSONALIZADAS:**', ''];
                
                for (const product of musicProducts) {
                    const badge = product.popular ? ' ⭐' : product.capacityGb === 128 ? ' 💎' : '';
                    const price = await catalogService.getPriceAsync('music', product.capacityGb);
                    fallbackLines.push(`• ${product.capacity} - $${price.toLocaleString('es-CO')}${badge}`);
                }
                
                fallbackLines.push('', '¿Cuál te interesa?');
                
                await flowDynamic(fallbackLines);
            } catch (fallbackError: any) {
                // Ultimate fallback - use sync constants
                await flowDynamic(['💰 Consulta nuestros precios:', '', '• 8GB - $54.900', '• 32GB - $84.900', '• 64GB - $119.900', '• 128GB - $159.900', '', '¿Cuál te interesa?']);
            }
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, endFlow }) => {
        try {
            const message = ctx.body || '';
            
            unifiedLogger.info('flow', 'User selected capacity', { 
                phone: ctx.from, 
                selection: message 
            });

            // Build catalog dynamically for parsing
            const CAPACITY_CATALOG = await buildCatalogFromService();
            
            // Use the new parseCapacitySelection utility
            const capacityGB = parseCapacitySelection(message, CAPACITY_CATALOG);
            const priceInfo = capacityGB ? await getPricingInfoByGB(capacityGB) : null;

            if (capacityGB && priceInfo) {
                await updateUserSession(
                    ctx.from,
                    message,
                    'prices',
                    'capacity_selected',
                    false,
                    {
                        metadata: {
                            capacity: capacityGB,
                            selectedCapacity: `${capacityGB}gb`,
                            priceInfo,
                            timestamp: new Date().toISOString()
                        }
                    }
                );

                await flowDynamic([
                    `✅ Excelente elección: **${priceInfo.capacity}**`,
                    '',
                    `💰 **Precio:** ${priceInfo.price}`,
                    `🎵 **Capacidad:** ${priceInfo.songs}`,
                    `🎬 **O también:** ${priceInfo.videos}`,
                    '',
                    '📦 **Incluye:**',
                    '• Contenido personalizado a tu gusto',
                    '• Envío gratis a domicilio',
                    '• Garantía de satisfacción',
                    '• Soporte técnico',
                    '',
                    '¿Deseas continuar con esta opción?',
                    '',
                    'Responde:',
                    '✅ **"SÍ"** - Continuar con el pedido',
                    '🔄 **"CAMBIAR"** - Ver otras capacidades',
                    '❓ **"INFO"** - Más información'
                ]);

                unifiedLogger.info('flow', 'Capacity selection confirmed', { 
                    phone: ctx.from, 
                    capacity: capacityGB 
                });
            } else {
                // Invalid selection - build message from CatalogService (async version)
                const musicProducts = await catalogService.getProductsByCategoryAsync('music');
                const invalidLines = [
                    '❓ No reconocí tu selección.',
                    '',
                    'Por favor, escribe una de estas opciones:'
                ];
                
                for (const product of musicProducts) {
                    const price = await catalogService.getPriceAsync('music', product.capacityGb);
                    invalidLines.push(`• **${product.capacity.toLowerCase()}** - $${price.toLocaleString('es-CO')}`);
                }
                
                await flowDynamic(invalidLines);

                unifiedLogger.warn('flow', 'Invalid capacity selection', { 
                    phone: ctx.from, 
                    message 
                });
            }

            return endFlow();

        } catch (error: any) {
            unifiedLogger.error('flow', 'Error processing capacity selection', { 
                phone: ctx.from, 
                error: error.message,
                stack: error.stack
            });

            await flowDynamic([
                '❌ Hubo un error procesando tu selección.',
                '',
                'Por favor, escribe la capacidad que te interesa:',
                '8gb, 16gb, 32gb, 64gb, o 128gb'
            ]);

            return endFlow();
        }
    });

export default prices