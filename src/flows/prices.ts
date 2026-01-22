import { join } from 'path';
import { addKeyword, EVENTS } from '@builderbot/bot';
import { unifiedLogger } from '../utils/unifiedLogger';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import { promises as fs } from 'fs';
import { parseCapacitySelection, CatalogItem } from '../utils/textUtils';
import { catalogService } from '../services/CatalogService';

// Build catalog dynamically from CatalogService
const buildCatalogFromService = (): CatalogItem[] => {
    const musicProducts = catalogService.getProductsByCategory('music');
    return musicProducts.map(product => ({
        capacity_gb: product.capacityGb,
        price: product.price,
        description: `${product.capacity} - ~${product.content.count.toLocaleString('es-CO')} ${product.content.unit}`
    }));
};

// Catalog for capacity parsing
const CAPACITY_CATALOG: CatalogItem[] = buildCatalogFromService();

// Helper to get pricing info by capacity GB
const getPricingInfoByGB = (capacityGB: number) => {
    const product = catalogService.getProduct('music', capacityGB);
    if (!product) return null;
    
    return {
        capacity: product.capacity,
        songs: `~${product.content.count.toLocaleString('es-CO')} ${product.content.unit}`,
        price: catalogService.getFormattedPrice('music', capacityGB),
        videos: `~${Math.round(capacityGB * 1.875)} películas HD` // Approximate video count
    };
};

const prices = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        try {
            unifiedLogger.info('flow', 'Prices flow initiated', { phone: ctx.from });

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

            // Build pricing message dynamically from CatalogService
            const musicProducts = catalogService.getProductsByCategory('music');
            const pricingLines = [
                `💰 ¡Hola ${userName}! Aquí está nuestra lista de capacidades y precios:`,
                '',
                '📦 **OPCIONES DISPONIBLES:**',
                ''
            ];

            musicProducts.forEach((product, index) => {
                const videoCount = Math.round(product.capacityGb * 1.875);
                let badge = '';
                if (product.popular) badge = ' ⭐ MÁS POPULAR';
                if (product.recommended) badge = ' 💎 PREMIUM';
                if (product.capacityGb === 128) badge = ' 💎 PREMIUM';
                
                pricingLines.push(
                    `🔹 **${product.capacity}** - ${catalogService.getFormattedPrice('music', product.capacityGb)}${badge}`,
                    `   • ~${product.content.count.toLocaleString('es-CO')} ${product.content.unit} o ~${videoCount} películas HD`,
                    `   • ${product.capacityGb <= 8 ? 'Ideal para uso básico' : product.capacityGb <= 32 ? 'Perfecto para estudiantes' : product.capacityGb <= 64 ? 'Gran capacidad' : 'Máxima capacidad'}`,
                    ''
                );
            });

            pricingLines.push(
                '✨ **INCLUYE GRATIS:**',
                ...catalogService.getProduct('music', 8)!.inclusions.map(inc => `• ${inc}`),
                '',
                `📝 ¿Cuál capacidad te interesa? (${musicProducts.map(p => p.capacity.toLowerCase()).join(', ')})`
            );

            await flowDynamic(pricingLines);

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

            // Fallback: Use CatalogService for simple pricing list
            const musicProducts = catalogService.getProductsByCategory('music');
            const fallbackLines = ['💰 **PRECIOS DE USB PERSONALIZADAS:**', ''];
            
            musicProducts.forEach(product => {
                const badge = product.popular ? ' ⭐' : product.capacityGb === 128 ? ' 💎' : '';
                fallbackLines.push(`• ${product.capacity} - ${catalogService.getFormattedPrice('music', product.capacityGb)}${badge}`);
            });
            
            fallbackLines.push('', '¿Cuál te interesa?');
            
            await flowDynamic(fallbackLines);
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, endFlow }) => {
        try {
            const message = ctx.body || '';
            
            unifiedLogger.info('flow', 'User selected capacity', { 
                phone: ctx.from, 
                selection: message 
            });

            // Use the new parseCapacitySelection utility
            const capacityGB = parseCapacitySelection(message, CAPACITY_CATALOG);
            const priceInfo = capacityGB ? getPricingInfoByGB(capacityGB) : null;

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
                // Invalid selection - build message from CatalogService
                const musicProducts = catalogService.getProductsByCategory('music');
                const invalidLines = [
                    '❓ No reconocí tu selección.',
                    '',
                    'Por favor, escribe una de estas opciones:'
                ];
                
                musicProducts.forEach(product => {
                    invalidLines.push(`• **${product.capacity.toLowerCase()}** - ${catalogService.getFormattedPrice('music', product.capacityGb)}`);
                });
                
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