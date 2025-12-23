import { join } from 'path';
import { addKeyword, EVENTS } from '@builderbot/bot';
import { unifiedLogger } from '../utils/unifiedLogger';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import { promises as fs } from 'fs';

// Pricing data
const PRICING_INFO = {
    '8gb': { capacity: '8GB', songs: '~1,400 canciones', price: '$59.900', videos: '~15 películas HD' },
    '16gb': { capacity: '16GB', songs: '~2,800 canciones', price: '$69.900', videos: '~30 películas HD' },
    '32gb': { capacity: '32GB', songs: '~5,600 canciones', price: '$89.900', videos: '~60 películas HD' },
    '64gb': { capacity: '64GB', songs: '~11,200 canciones', price: '$129.900', videos: '~120 películas HD' },
    '128gb': { capacity: '128GB', songs: '~22,400 canciones', price: '$169.900', videos: '~240 películas HD' }
};

const CAPACITY_PATTERN_MAP: { pattern: RegExp; capacity: string; key: keyof typeof PRICING_INFO }[] = [
    { pattern: /\b8\s*gb\b/i, capacity: '8gb', key: '8gb' },
    { pattern: /\b16\s*gb\b/i, capacity: '16gb', key: '16gb' },
    { pattern: /\b32\s*gb\b/i, capacity: '32gb', key: '32gb' },
    { pattern: /\b64\s*gb\b/i, capacity: '64gb', key: '64gb' },
    { pattern: /\b128\s*gb\b/i, capacity: '128gb', key: '128gb' }
];

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

            await flowDynamic([
                `💰 ¡Hola ${userName}! Aquí está nuestra lista de capacidades y precios:`,
                '',
                '📦 **OPCIONES DISPONIBLES:**',
                '',
                '🔹 **8GB** - $59.900',
                '   • ~1,400 canciones o ~15 películas HD',
                '   • Ideal para uso básico',
                '',
                '🔹 **16GB** - $69.900',
                '   • ~2,800 canciones o ~30 películas HD',
                '   • Perfecto para estudiantes',
                '',
                '🔹 **32GB** - $89.900 ⭐ MÁS POPULAR',
                '   • ~5,600 canciones o ~60 películas HD',
                '   • Excelente relación calidad-precio',
                '',
                '🔹 **64GB** - $129.900',
                '   • ~11,200 canciones o ~120 películas HD',
                '   • Gran capacidad',
                '',
                '🔹 **128GB** - $169.900 💎 PREMIUM',
                '   • ~22,400 canciones o ~240 películas HD',
                '   • Máxima capacidad',
                '',
                '✨ **INCLUYE GRATIS:**',
                '• Personalización del contenido',
                '• Envío a domicilio',
                '• Garantía de satisfacción',
                '',
                '📝 ¿Cuál capacidad te interesa? (8gb, 16gb, 32gb, 64gb, 128gb)'
            ]);

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

            await flowDynamic([
                '💰 **PRECIOS DE USB PERSONALIZADAS:**',
                '',
                '• 8GB - $59.900',
                '• 16GB - $69.900',
                '• 32GB - $89.900 ⭐',
                '• 64GB - $129.900',
                '• 128GB - $169.900 💎',
                '',
                '¿Cuál te interesa?'
            ]);
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, endFlow }) => {
        try {
            const message = (ctx.body || '').toLowerCase().trim();
            
            unifiedLogger.info('flow', 'User selected capacity', { 
                phone: ctx.from, 
                selection: message 
            });

            let selectedCapacity: string | null = null;
            let priceInfo = null;

            // Use pattern matching for more robust capacity detection
            for (const { pattern, capacity, key } of CAPACITY_PATTERN_MAP) {
                if (pattern.test(message)) {
                    selectedCapacity = capacity;
                    priceInfo = PRICING_INFO[key];
                    break;
                }
            }

            // Special case for "more" requests
            if (!selectedCapacity && ['más', 'mas', 'mayor', 'mucha'].some(word => message.includes(word))) {
                priceInfo = PRICING_INFO['128gb'];
                selectedCapacity = '128gb';
            }

            if (selectedCapacity && priceInfo) {
                await updateUserSession(
                    ctx.from,
                    message,
                    'prices',
                    'capacity_selected',
                    false,
                    {
                        metadata: {
                            selectedCapacity,
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
                    capacity: selectedCapacity 
                });
            } else {
                // Invalid selection
                await flowDynamic([
                    '❓ No reconocí tu selección.',
                    '',
                    'Por favor, escribe una de estas opciones:',
                    '• **8gb** - $59.900',
                    '• **16gb** - $69.900',
                    '• **32gb** - $89.900',
                    '• **64gb** - $129.900',
                    '• **128gb** - $169.900'
                ]);

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