import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import type { BotContext, UserSession } from '../../types/global';
import { contextAnalyzer } from '../services/contextAnalyzer';
import { capacityMiddleware } from '../middlewares/contextMiddleware';
import { datosCliente } from './datosCliente';
import { CartData } from '../../types/global';
import { CartItem } from '../../types/global';
import { preHandler, postHandler } from './middlewareFlowGuard';

// --- Interfaces y productos ---
interface USBProduct {
    capacity: string;
    songs: string;
    price: number;
    originalPrice: number;
    discount: number;
    description: string;
    benefits: string[];
    urgency: string;
    popular?: boolean;
    vip?: boolean;
}

interface AdditionalProduct {
    name: string;
    price: number;
    originalPrice: number;
    img: string;
    benefits: string[];
    combo?: boolean;
}

interface LocalUserSelection {
    capacity: string;
    description: string;
    price: number;
    originalPrice: number;
    savings: string;
    timestamp: Date;
    shippingData?: string;
    orderStatus?: string;
    additionalProducts?: string[];
}

// ✅ CONTROL DE ESTADO MEJORADO
const localUserSelections: { [phoneNumber: string]: LocalUserSelection } = {};
const processingUsers: Set<string> = new Set();

const usbProducts: { [key: string]: USBProduct } = {
    '1': {
        capacity: '8GB',
        songs: '1,400',
        price: 59900,
        originalPrice: 79900,
        discount: 25,
        description: '8GB - Perfecta para empezar',
        benefits: ['✅ Ideal para uso diario', '✅ Canciones de alta calidad', '✅ Compatibilidad universal'],
        urgency: '⚡ ¡Solo quedan 8 unidades!'
    },
    '2': {
        capacity: '32GB',
        songs: '5,000',
        price: 89900,
        originalPrice: 119900,
        discount: 25,
        description: '32GB - La más popular',
        benefits: ['🔥 BESTSELLER', '✅ 5,000 canciones premium', '✅ Incluye géneros exclusivos', '✅ Garantía extendida'],
        urgency: '🔥 ¡La más vendida! Solo quedan 5 unidades',
        popular: true
    },
    '3': {
        capacity: '64GB',
        songs: '10,000',
        price: 129900,
        originalPrice: 169900,
        discount: 24,
        description: '64GB - Máximo entretenimiento',
        benefits: ['⭐ PREMIUM', '✅ 10,000 canciones + podcasts', '✅ Calidad studio', '✅ Actualizaciones gratis por 1 año'],
        urgency: '💎 Edición limitada - Solo 3 disponibles'
    },
    '4': {
        capacity: '128GB',
        songs: '22,000',
        price: 169900,
        originalPrice: 229900,
        discount: 26,
        description: '128GB - Colección completa',
        benefits: ['👑 VIP EDITION', '✅ 22,000 canciones + videos musicales', '✅ Contenido exclusivo', '✅ Soporte VIP 24/7', '✅ Envío express GRATIS'],
        urgency: '👑 ÚLTIMA UNIDAD DISPONIBLE',
        vip: true
    }
};

const additionalProducts: AdditionalProduct[] = [
    {
        name: 'Audífonos Bluetooth Premium',
        price: 89900,
        originalPrice: 129900,
        img: 'https://i.imgur.com/audifonos-premium.jpg',
        benefits: ['🎵 Sonido HD', '🔋 20h de batería', '🎧 Cancelación de ruido'],
        combo: true
    },
    {
        name: 'Cargador Inalámbrico Rápido',
        price: 49900,
        originalPrice: 79900,
        img: 'https://i.imgur.com/cargador-wireless.jpg',
        benefits: ['⚡ Carga ultra rápida', '📱 Compatible con todos los celulares', '🛡️ Protección inteligente'],
        combo: true
    },
    {
        name: 'Soporte Magnético Premium',
        price: 39900,
        originalPrice: 59900,
        img: 'https://i.imgur.com/soporte-magnetico.jpg',
        benefits: ['🧲 Súper magnético', '🚗 Perfecto para el auto', '📱 Rotación 360°']
    },
    {
        name: 'Power Bank 20,000mAh',
        price: 79900,
        originalPrice: 119900,
        img: 'https://i.imgur.com/powerbank-premium.jpg',
        benefits: ['🔋 Carga 5 dispositivos', '⚡ Carga rápida', '💎 Diseño premium'],
        combo: true
    },
    {
        name: 'Cable USB-C Premium',
        price: 19900,
        originalPrice: 29900,
        img: 'https://i.imgur.com/cable-premium.jpg',
        benefits: ['💪 Ultra resistente', '⚡ Carga súper rápida', '📏 2 metros de largo']
    }
];

const persuasivePhrases = [
    "¡Miles de clientes felices ya disfrutan sus USBs musicales!",
    "Esta oferta es exclusiva para ti, no la dejes pasar.",
    "¿Te imaginas todos tus géneros favoritos en un solo dispositivo?",
    "¡Hazlo ahora y recibe un regalo sorpresa en tu pedido!",
    "🎶 Haz tu pedido hoy y vive la experiencia musical definitiva."
];

// --- Utilidades mejoradas ---
const formatPrice = (price: number): string =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(price);

const calculateSavings = (originalPrice: number, currentPrice: number): string => {
    const savings = originalPrice - currentPrice;
    return formatPrice(savings);
};

const calculateDiscountPercent = (originalPrice: number, currentPrice: number): number => {
    return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
};

// ✅ FUNCIÓN PARA CONVERTIR SELECCIÓN A CARRITO
const convertSelectionToCart = (phoneNumber: string, selection: LocalUserSelection): CartData => {
    const cartItems: CartItem[] = [];
    cartItems.push({
        id: `usb_${selection.capacity.toLowerCase()}`,
        name: `USB Musical ${selection.capacity}`,
        price: selection.price,
        quantity: 1
    });
    if (selection.additionalProducts && selection.additionalProducts.length > 0) {
        selection.additionalProducts.forEach((productName, index) => {
            const additionalProduct = additionalProducts.find(p => p.name === productName);
            if (additionalProduct) {
                cartItems.push({
                    id: `additional_${index}`,
                    name: additionalProduct.name,
                    price: additionalProduct.price,
                    quantity: 1
                });
            }
        });
    }
    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return {
        id: `cart_${phoneNumber}_${Date.now()}`,
        items: cartItems,
        total: total,
        createdAt: selection.timestamp
    };
};

function getPersonalizedRecommendation(interests: string[]): string {
    const interestStr = interests.join(', ');
    if (interests.includes('reggaeton')) return "🎵 Tengo una selección especial de reggaeton que te va a encantar";
    if (interests.includes('rock')) return "🎸 Perfecta selección de rock clásico y moderno";
    if (interests.includes('salsa')) return "💃 Los mejores clásicos de salsa para bailar";
    if (interests.includes('pop')) return "🎤 Los hits más actuales del pop internacional";
    return `🎵 Música personalizada para tus gustos: ${interestStr}`;
}

const getUrgencyMessage = (): string => {
    const messages = [
        '⏰ *Oferta válida solo por hoy*',
        '🔥 *Últimas unidades disponibles*',
        '💨 *Envío gratis si ordenas en los próximos 30 minutos*',
        '⚡ *Precio especial por tiempo limitado*',
        '🎯 *Stock limitado - No te quedes sin la tuya*'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
};

const getPersuasivePhrase = (): string => persuasivePhrases[Math.floor(Math.random() * persuasivePhrases.length)];

const generateSmartRecommendation = (userInterests: string[], userStage: string): string => {
    const recommendation = getPersonalizedRecommendation(userInterests);
    const urgency = getUrgencyMessage();
    return `${recommendation}\n${urgency}`;
};

const getRandomProducts = (count: number, includeCombo: boolean = false): AdditionalProduct[] => {
    let products = includeCombo ? additionalProducts.filter(p => p.combo) : additionalProducts;
    const shuffled = products.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

// ✅ FUNCIÓN DE VALIDACIÓN MEJORADA
const isValidSelection = (selection: string): boolean => {
    return ['1', '2', '3', '4'].includes(selection);
};

const isComparisionRequest = (input: string): boolean => {
    const comparisionKeywords = ['comparar', 'diferencias', 'cual elegir', 'compare', 'diferencia', 'opciones'];
    return comparisionKeywords.some(keyword => input.toLowerCase().includes(keyword));
};

// ✅ CROSS-SELL MEJORADO
async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any, phoneNumber: string) {
    try {
        const session = await getUserSession(phoneNumber);
        if (currentProduct === 'music') {
            await flowDynamic([
                '🎬 *¿Te gustaría añadir la USB de VIDEOS MUSICALES a tu pedido?*\n\n' +
                '👉 *Más de 10,000 videoclips en HD y 4K de todos los géneros.*\n' +
                '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n' +
                '💎 *COMBO PERFECTO: Música + Videos = Entretenimiento total*\n\n' +
                '¿Quieres agregar los videos? Responde *SÍ* o *NO*'
            ]);
        } else {
            await flowDynamic([
                '🎵 *¿Te gustaría añadir la USB de MÚSICA a tu pedido?*\n\n' +
                '👉 *La mejor selección de géneros, artistas y playlists exclusivas.*\n' +
                '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n' +
                '💎 *COMBO PERFECTO: Videos + Música = Entretenimiento total*\n\n' +
                '¿Quieres agregar la música? Responde *SÍ* o *NO*'
            ]);
        }
        if (session) {
            await updateUserSession(
                phoneNumber,
                'Cross-sell presentado',
                'cross_sell_presented',
                null,
                false,
                { metadata: session }
            );
        }
    } catch (error) {
        console.error('❌ Error en crossSellSuggestion:', error);
    }
}

// --- FLUJO DE COMPARACIÓN MEJORADO ---
const capacityComparison = addKeyword(['comparar', 'diferencias', 'cual elegir', 'opciones'])
    .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['prices_shown','awaiting_capacity','personalization'],
                {
                    lockOnStages: ['awaiting_payment','checkout_started','completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
                        completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
                    }
                }
            );
            if (!pre.proceed) return;

            const session = await getUserSession(phoneNumber);
            await updateUserSession(
                phoneNumber,
                'Solicita comparación',
                'capacity_comparison',
                null,
                false,
                { metadata: session }
            );

            await flowDynamic([
                '📊 *COMPARACIÓN DETALLADA DE CAPACIDADES*\n\n' +
                '🎵 *32GB - $89.900* 🔥\n' +
                '• 5,000+ canciones premium\n' +
                '• 15+ géneros musicales\n' +
                '• Ideal para uso diario\n' +
                '• ✅ MÁS VENDIDA\n\n' +
                '🎵 *64GB - $129.900* ⭐\n' +
                '• 10,000+ canciones + podcasts\n' +
                '• 20+ géneros completos\n' +
                '• Calidad de audio superior\n' +
                '• ✅ MEJOR RELACIÓN PRECIO-VALOR\n\n' +
                '🎵 *128GB - $169.900* 👑\n' +
                '• 22,000+ canciones + videos\n' +
                '• Colección completa de géneros\n' +
                '• Contenido exclusivo VIP\n' +
                '• ✅ EXPERIENCIA PREMIUM TOTAL\n\n' +
                '💡 *Mi recomendación personal:* La de 64GB es perfecta para la mayoría de usuarios.\n\n' +
                '¿Cuál te convence más? Responde con el número (2, 3 o 4)'
            ]);

            await postHandler(phoneNumber, 'musicUsb', 'prices_shown');
        } catch (error) {
            console.error('❌ Error en capacityComparison:', error);
            await flowDynamic(['⚠️ Error mostrando comparación. Por favor intenta de nuevo.']);
        }
    })
    .addAction({ capture: true }, async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        const selection = ctx.body.trim();
        const phoneNumber = ctx.from;

        const pre = await preHandler(
            ctx,
            { flowDynamic, gotoFlow },
            'musicUsb',
            ['awaiting_capacity','prices_shown'],
            {
                lockOnStages: ['awaiting_payment','checkout_started','completed'],
                resumeMessages: {
                    awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                    checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
                    completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
                }
            }
        );
        if (!pre.proceed) return;

        if (isValidSelection(selection)) {
            ctx.body = selection;
            await postHandler(phoneNumber, 'musicUsb', 'awaiting_capacity');
            return gotoFlow(capacityMusic);
        } else {
            await flowDynamic([
                '❌ *Opción no válida*\n\n' +
                'Por favor responde con el número de la opción que prefieres:\n' +
                '*2* para 32GB\n' +
                '*3* para 64GB\n' +
                '*4* para 128GB'
            ]);
            await postHandler(phoneNumber, 'musicUsb', 'prices_shown');
        }
    });

// --- FLUJO PRINCIPAL COMPLETAMENTE MEJORADO ---
const capacityMusic = addKeyword([EVENTS.ACTION])
    // PRIMERA PARTE: MOSTRAR OPCIONES
    .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        capacityMiddleware
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['awaiting_capacity','prices_shown','personalization'],
                {
                    lockOnStages: ['awaiting_payment','checkout_started','completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
                        completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
                    }
                }
            );
            if (!pre.proceed) return;

            const session = await getUserSession(phoneNumber);
            if (!phoneNumber) return;

            if (processingUsers.has(phoneNumber)) {
                return;
            }
            processingUsers.add(phoneNumber);

            const now = Date.now();
            if (session?.lastProcessedTime &&
                session.currentFlow === 'capacity_music' &&
                (now - new Date(session.lastProcessedTime).getTime()) < 5000) {
                processingUsers.delete(phoneNumber);
                return;
            }

            if (session) {
                session.currentFlow = 'capacity_music';
                session.lastProcessedTime = new Date();
                await updateUserSession(
                    phoneNumber,
                    'Iniciando selección de capacidad',
                    'capacity_flow_start',
                    null,
                    false,
                    { metadata: session }
                );
            }

            const urgencyMsg = getUrgencyMessage();
            const persuasiveMsg = getPersuasivePhrase();

            // await flowDynamic([
            //     '🎵 *¡Tu USB Musical Personalizada te está esperando!*\n' +
            //     '✨ Perfecto para alguien con buen gusto como tú.\n\n' +
            //     `${urgencyMsg}\n\n` +
            //     `${persuasiveMsg}\n\n` +
            //     '💎 *OFERTAS EXCLUSIVAS DE HOY:*\n\n' +
            //     '1️⃣ *8GB* — 1,400 canciones\n' +
            //     `    💰 ${formatPrice(usbProducts['1'].price)} (${calculateDiscountPercent(usbProducts['1'].originalPrice, usbProducts['1'].price)}% OFF)\n\n` +
            //     '2️⃣ *32GB*  🔥 — 5,000 canciones + géneros exclusivos\n' +
            //     `   💰 ${formatPrice(usbProducts['2'].price)} (${calculateDiscountPercent(usbProducts['2'].originalPrice, usbProducts['2'].price)}% OFF) - *MÁS VENDIDA*\n\n` +
            //     '3️⃣ *64GB*  ⭐ — 10,000 canciones + podcasts\n' +
            //     `   💰 ${formatPrice(usbProducts['3'].price)} (${calculateDiscountPercent(usbProducts['3'].originalPrice, usbProducts['3'].price)}% OFF) - *MEJOR VALOR*\n\n` +
            //     '4️⃣ *128GB* 👑 — 22,000 canciones + videos musicales\n' +
            //     `    💰 ${formatPrice(usbProducts['4'].price)} (${calculateDiscountPercent(usbProducts['4'].originalPrice, usbProducts['4'].price)}% OFF) - *VIP EDITION*\n\n` +
            //     '🛒 *Responde con el número (1-4) para elegir tu USB*\n'
            // ]);

            processingUsers.delete(phoneNumber);

            if (session) {
                await updateUserSession(
                    phoneNumber,
                    'Opciones presentadas',
                    'capacity_options_shown',
                    null,
                    false,
                    { metadata: session }
                );
            }

            // Marcamos que mostró opciones/precios: awaiting_capacity activa para esperar respuesta
            await postHandler(phoneNumber, 'musicUsb', 'awaiting_capacity');

        } catch (error) {
            console.error('❌ Error crítico en capacityMusic:', error);
            processingUsers.delete(ctx.from);
            try {
                const session = await getUserSession(ctx.from);
                if (session) {
                    await updateUserSession(
                        ctx.from,
                        'Error en capacity flow',
                        'capacity_error',
                        null,
                        false,
                        { metadata: session }
                    );
                }
            } catch {}
            await flowDynamic(['⚠️ Ocurrió un error técnico. Por favor escribe el número de tu opción preferida (1-4).']);
        }
    })
    // SEGUNDA PARTE: CAPTURAR RESPUESTA DEL USUARIO
    .addAction({ capture: true }, async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['awaiting_capacity','awaiting_payment'],
                {
                    lockOnStages: ['checkout_started','completed'],
                    resumeMessages: {
                        awaiting_capacity: 'Retomemos: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.',
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.'
                    }
                }
            );
            if (!pre.proceed) return;

            const capacidad = ctx.body?.trim()?.toLowerCase() || '';

            // VALIDAR CAPACIDAD
            let capacidadValida = '';
            let precio = '';
            let productKey = '';

            if (capacidad.includes('1') || capacidad.includes('8')) {
                capacidadValida = '8GB';
                precio = '$59.900';
                productKey = '1';
            }
            else if (capacidad.includes('2') || capacidad.includes('32')) {
                capacidadValida = '32GB';
                precio = '$89.900';
                productKey = '2';
            } 
            else if (capacidad.includes('3') || capacidad.includes('64')) {
                capacidadValida = '64GB';
                precio = '$129.900';
                productKey = '3';
            } 
            else if (capacidad.includes('4') || capacidad.includes('128')) {
                capacidadValida = '128GB';
                precio = '$169.900';
                productKey = '4';
            } 
            else if (capacidad.includes('comparar')) {
                return gotoFlow(capacityComparison);
            }
            else {
                await flowDynamic([
                    '❌ *Opción no válida*\n\n' +
                    'Por favor escribe un número del *1 al 4* para elegir tu USB:\n\n' +
                    '• *1* para 8GB\n' +
                    '• *2* para 32GB (Más vendida)\n' +
                    '• *3* para 64GB (Mejor valor)\n' +
                    '• *4* para 128GB (VIP Edition)\n\n'
                ]);
                await postHandler(phoneNumber, 'musicUsb', 'awaiting_capacity');
                return;
            }

            const session = await getUserSession(phoneNumber);
            const genero = session?.conversationData?.selectedGenre || 'Música variada';

            const product = usbProducts[productKey];
            const savings = calculateSavings(product.originalPrice, product.price);
            const discountPercent = calculateDiscountPercent(product.originalPrice, product.price);

            await updateUserSession(
                phoneNumber,
                `Capacidad: ${capacidadValida}`,
                'capacityMusic',
                null,
                false,
                {
                    metadata: {
                        step: 'order_summary',
                        productType: 'music',
                        selectedGenre: genero,
                        selectedCapacity: capacidadValida,
                        price: precio,
                        orderReady: true
                    }
                }
            );

            await contextAnalyzer.clearCriticalContext(phoneNumber);

            localUserSelections[phoneNumber] = {
                capacity: product.capacity,
                description: `${product.capacity} (${product.songs} canciones) - ${formatPrice(product.price)}`,
                price: product.price,
                originalPrice: product.originalPrice,
                savings: savings,
                timestamp: new Date(),
                additionalProducts: []
            };

            let confirmationMessage = `🎉 *¡EXCELENTE ELECCIÓN!*\n\n`;
            confirmationMessage += `✅ *${product.description}*\n`;
            confirmationMessage += `💰 *Precio final:* ${formatPrice(product.price)}\n`;
            confirmationMessage += `💸 *Ahorras:* ${savings} (${discountPercent}% OFF)\n\n`;
            confirmationMessage += `*Beneficios incluidos:*\n`;
            confirmationMessage += product.benefits.map(benefit => `${benefit}`).join('\n') + '\n\n';
            if (product.popular) confirmationMessage += '🔥 *¡Elegiste la opción más vendida!*\n';
            if (product.vip) confirmationMessage += '👑 *¡Bienvenido al club VIP!*\n';
            confirmationMessage += `⏰ *${product.urgency}*\n\n`;
            confirmationMessage += '✨ *Estás a solo un paso de recibir tu USB personalizada.*\n';
            confirmationMessage += '👇 *Continuemos con los detalles finales...*';

            await flowDynamic([confirmationMessage]);

            await new Promise(resolve => setTimeout(resolve, 2000));

            await crossSellSuggestion('music', flowDynamic, phoneNumber);

            // Pasamos a awaiting_payment antes de pedir datos
            await postHandler(phoneNumber, 'musicUsb', 'awaiting_payment');

            return gotoFlow(askShippingData);

        } catch (error) {
            console.error('❌ Error en captura de capacityMusic:', error);
            await flowDynamic([
                '⚠️ Error procesando tu selección',
                'Por favor intenta de nuevo'
            ]);
        }
    });

// --- FLUJO DE DATOS DE ENVÍO MEJORADO ---
const askShippingData = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx: BotContext, { flowDynamic }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow: async () => {} },
                'musicUsb',
                ['awaiting_payment','checkout_started'],
                {
                    lockOnStages: ['completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
                    }
                }
            );
            if (!pre.proceed) return;

            const session = await getUserSession(phoneNumber);
            await updateUserSession(
                phoneNumber,
                'Solicitando datos de envío',
                'shipping_data_request',
                null, 
                false,
                { metadata: session }
            );

            await flowDynamic([
                [
                  '📦 *¡ÚLTIMO PASO PARA COMPLETAR TU PEDIDO!*',
                  'Para asegurar tu USB y coordinar la entrega, necesito:',
                  '1️⃣ *Nombre completo*',
                  '2️⃣ *Ciudad y dirección completa*',
                  '3️⃣ *Número de celular*',
                  '*Ejemplo del formato:*',
                  '_Juan Pérez, Bogotá, Calle 123 #45-67, 3001234567_',
                  '✅ *Responde aquí con todos los datos juntos*',
                  '🚚 *Envío GRATIS a toda Colombia*'
                ].join('\n')
            ]);

            await postHandler(phoneNumber, 'musicUsb', 'awaiting_payment');

        } catch (error) {
            console.error('❌ Error en askShippingData:', error);
            await flowDynamic(['⚠️ Error solicitando datos. Por favor proporciona tu información de envío.']);
        }
    })
    .addAction({ capture: true }, async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['awaiting_payment','checkout_started'],
                {
                    lockOnStages: ['completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
                    }
                }
            );
            if (!pre.proceed) return;

            const shippingData = ctx.body?.trim() || '';

            if (shippingData.length < 20) {
                await flowDynamic([
                    '❌ *Datos incompletos*\n\n' +
                    'Por favor proporciona la información completa:\n' +
                    '• Nombre completo\n' +
                    '• Ciudad y dirección\n' +
                    '• Número de celular\n\n' +
                    '*Ejemplo:* Juan Pérez, Bogotá, Calle 123 #45-67, 3001234567'
                ]);
                await postHandler(phoneNumber, 'musicUsb', 'awaiting_payment');
                return;
            }

            const session = await getUserSession(phoneNumber);
            await updateUserSession(
                phoneNumber,
                `Datos de envío: ${shippingData.substring(0, 50)}...`,
                'shipping_data_provided',
                null, 
                false,
                { metadata: session }
            );

            if (localUserSelections[phoneNumber]) {
                localUserSelections[phoneNumber].shippingData = shippingData;
                localUserSelections[phoneNumber].orderStatus = 'pending_confirmation';
            }

            if (session) {
                session.stage = 'completed';
                const selection = localUserSelections[phoneNumber];
                if (selection) {
                    session.cartData = convertSelectionToCart(phoneNumber, selection);
                }
                await updateUserSession(
                    phoneNumber,
                    'Datos completados - Cliente convertido',
                    'completed',
                    null, 
                    false,
                    { metadata: session }
                );
            }

            await flowDynamic([
                '✅ *¡DATOS RECIBIDOS CORRECTAMENTE!*\n\n' +
                '🎶 *Tu pedido está siendo procesado...*\n\n' +
                '👨‍💼 *Un asesor especializado te contactará en los próximos 5-10 minutos para:*\n' +
                '• Confirmar tu pedido\n' +
                '• Coordinar la entrega\n' +
                '• Darte tu beneficio especial de cliente VIP\n\n' +
                '🎁 *¡Prepárate para recibir tu regalo sorpresa!*'
            ]);

            // Marcamos checkout_started antes de pasar a upsell/finalizar
            await postHandler(phoneNumber, 'musicUsb', 'checkout_started');

            await new Promise(resolve => setTimeout(resolve, 2000));

            return gotoFlow(showAdditionalProducts);

        } catch (error) {
            console.error('❌ Error procesando datos de envío:', error);
            await flowDynamic(['⚠️ Error guardando tus datos. Por favor intenta de nuevo con el formato sugerido.']);
            // mantenemos awaiting_payment
        }
    });

// --- FLUJO DE PRODUCTOS ADICIONALES MEJORADO ---
const showAdditionalProducts = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['checkout_started','awaiting_payment'],
                {
                    lockOnStages: ['completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
                    }
                }
            );
            if (!pre.proceed) return;

            const session = await getUserSession(phoneNumber);
            const userSelection = localUserSelections[phoneNumber];
            if (!userSelection) {
                return gotoFlow(orderProcessing);
            }

            const comboProducts = getRandomProducts(2, true);
            await flowDynamic([
                '🛍️ *¡OFERTA EXCLUSIVA SOLO PARA CLIENTES VIP!*\n\n' +
                '🎯 *Aprovecha estos productos premium con descuentos especiales:*\n\n' +
                `${comboProducts.map((product, index) => {
                    const discountPercent = calculateDiscountPercent(product.originalPrice, product.price);
                    return `${index + 1}️⃣ *${product.name}*\n` +
                           `   💰 ~~${formatPrice(product.originalPrice)}~~ → *${formatPrice(product.price)}* (${discountPercent}% OFF)\n` +
                           `   ${product.benefits.join(' • ')}\n`;
                }).join('\n')}\n` +
                '💎 *OFERTA ESPECIAL:* Si agregas cualquier producto, ¡envío express GRATIS!\n\n' +
                '¿Quieres aprovechar alguna oferta?\n' +
                '• Responde *1* o *2* para el producto\n' +
                '• Responde *NO* para continuar sin productos adicionales'
            ]);

            await updateUserSession(
                phoneNumber,
                'Productos adicionales mostrados',
                'additional_products_shown',
                null, 
                false,
                { metadata: session }
            );

            // Seguimos en checkout_started
            await postHandler(phoneNumber, 'musicUsb', 'checkout_started');

        } catch (error) {
            console.error('❌ Error mostrando productos adicionales:', error);
            await flowDynamic(['⚠️ Error cargando ofertas adicionales. Continuando con tu pedido...']);
            return gotoFlow(orderProcessing);
        }
    })
    .addAction({ capture: true }, async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['checkout_started'],
                {
                    lockOnStages: ['completed'],
                    resumeMessages: {
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
                    }
                }
            );
            if (!pre.proceed) return;

            const response = ctx.body?.trim()?.toLowerCase() || '';
            const session = await getUserSession(phoneNumber);
            await updateUserSession(
                phoneNumber,
                `Respuesta productos adicionales: ${response}`,
                'additional_products_response',
                null, 
                false,
                { metadata: session }
            );

            if (['1', '2'].includes(response)) {
                const productIndex = parseInt(response) - 1;
                const comboProducts = getRandomProducts(2, true);
                const selectedProduct = comboProducts[productIndex];

                if (selectedProduct) {
                    if (localUserSelections[phoneNumber]) {
                        if (!localUserSelections[phoneNumber].additionalProducts) {
                            localUserSelections[phoneNumber].additionalProducts = [];
                        }
                        localUserSelections[phoneNumber].additionalProducts!.push(selectedProduct.name);

                        if (session) {
                            const updatedSelection = localUserSelections[phoneNumber];
                            session.cartData = convertSelectionToCart(phoneNumber, updatedSelection);
                            await updateUserSession(
                                phoneNumber,
                                `Producto adicional agregado: ${selectedProduct.name}`,
                                'additional_product_added',
                                null,
                                false,
                                { metadata: session }
                            );
                        }
                    }

                    await flowDynamic([
                        `✅ *¡${selectedProduct.name} agregado exitosamente!*\n\n` +
                        `💰 *Precio especial:* ${formatPrice(selectedProduct.price)}\n` +
                        `🎁 *¡Aprovechaste una oferta exclusiva!*\n` +
                        `🚚 *Envío express GRATIS incluido*\n\n` +
                        `✨ *Tu pedido está completo y listo para procesar.*`
                    ]);
                } else {
                    await flowDynamic(['❌ Error seleccionando el producto. Continuando con tu pedido principal...']);
                }

            } else if (['no', 'n', 'nah', 'skip', 'saltar'].includes(response)) {
                await flowDynamic([
                    '👍 *¡Perfecto!*\n\n' +
                    '✅ *Tu pedido principal sigue en proceso*\n' +
                    '🎵 *Tu USB musical llegará pronto*\n\n' +
                    '📞 *Recuerda: Un asesor te contactará en minutos*'
                ]);

            } else {
                await flowDynamic([
                    '🤔 *No entendí tu respuesta*\n\n' +
                    'Por favor responde:\n' +
                    '• *1* para el primer producto\n' +
                    '• *2* para el segundo producto\n' +
                    '• *NO* para continuar sin productos adicionales'
                ]);
                // seguimos en checkout_started
                await postHandler(phoneNumber, 'musicUsb', 'checkout_started');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 1500));

            // Marcamos convertido al pasar a procesamiento
            await postHandler(phoneNumber, 'musicUsb', 'completed');
            return gotoFlow(orderProcessing);

        } catch (error) {
            console.error('❌ Error procesando respuesta de productos adicionales:', error);
            await flowDynamic(['⚠️ Error procesando tu respuesta. Continuando con tu pedido principal...']);
            await postHandler(ctx.from, 'musicUsb', 'checkout_started');
            return gotoFlow(orderProcessing);
        }
    });

// --- UTILIDADES DE EXPORTACIÓN MEJORADAS ---
export const getUserSelectionData = (phoneNumber: string): LocalUserSelection | undefined => {
    return localUserSelections[phoneNumber];
};

export const getUserCartData = (phoneNumber: string): CartData | null => {
    try {
        const selection = localUserSelections[phoneNumber];
        if (!selection) return null;
        return convertSelectionToCart(phoneNumber, selection);
    } catch (error) {
        console.error('❌ Error obteniendo datos del carrito:', error);
        return null;
    }
};

export const clearUserSelection = (phoneNumber: string): boolean => {
    try {
        if (localUserSelections[phoneNumber]) {
            delete localUserSelections[phoneNumber];
            processingUsers.delete(phoneNumber);
            console.log(`🧹 Datos limpiados para ${phoneNumber}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Error limpiando datos del usuario:', error);
        return false;
    }
};

export const getOrderSummary = (phoneNumber: string): string | null => {
    try {
        const selection = localUserSelections[phoneNumber];
        if (!selection) return null;

        let summary = `📋 *RESUMEN DE TU PEDIDO*\n\n`;
        summary += `🎵 *USB Musical:* ${selection.description}\n`;
        summary += `💰 *Precio:* ${formatPrice(selection.price)}\n`;
        summary += `💸 *Ahorras:* ${selection.savings}\n`;
        
        if (selection.additionalProducts && selection.additionalProducts.length > 0) {
            summary += `\n🛍️ *Productos adicionales:*\n`;
            selection.additionalProducts.forEach(product => {
                summary += `• ${product}\n`;
            });
            const cartData = convertSelectionToCart(phoneNumber, selection);
            summary += `\n💰 *Total del pedido:* ${formatPrice(cartData.total)}\n`;
        }
        
        summary += `\n📦 *Estado:* ${selection.orderStatus || 'En proceso'}\n`;
        summary += `📅 *Fecha:* ${selection.timestamp.toLocaleDateString('es-CO')}`;
        return summary;
    } catch (error) {
        console.error('❌ Error generando resumen:', error);
        return null;
    }
};

export const isUserBeingProcessed = (phoneNumber: string): boolean => {
    return processingUsers.has(phoneNumber);
};

export const getProductStats = (): { [key: string]: number } => {
    const stats: { [key: string]: number } = {};
    Object.values(localUserSelections).forEach(selection => {
        const capacity = selection.capacity;
        stats[capacity] = (stats[capacity] || 0) + 1;
    });
    return stats;
};

export const getDailySalesTotal = (): number => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Object.values(localUserSelections)
            .filter(selection => selection.timestamp >= today)
            .reduce((total, selection) => {
                const cartData = convertSelectionToCart('temp', selection);
                return total + cartData.total;
            }, 0);
    } catch (error) {
        console.error('❌ Error calculando ventas del día:', error);
        return 0;
    }
};

export const getTodayConversions = (): string[] => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Object.entries(localUserSelections)
            .filter(([_, selection]) => 
                selection.timestamp >= today && 
                selection.orderStatus === 'pending_confirmation'
            )
            .map(([phoneNumber, _]) => phoneNumber);
    } catch (error) {
        console.error('❌ Error obteniendo conversiones del día:', error);
        return [];
    }
};

export const cleanupOldSelections = (hoursOld: number = 24): number => {
    try {
        const cutoffTime = new Date(Date.now() - (hoursOld * 60 * 60 * 1000));
        let cleanedCount = 0;
        Object.keys(localUserSelections).forEach(phoneNumber => {
            const selection = localUserSelections[phoneNumber];
            if (selection.timestamp < cutoffTime) {
                delete localUserSelections[phoneNumber];
                processingUsers.delete(phoneNumber);
                cleanedCount++;
            }
        });
        console.log(`🧹 Limpieza automática: ${cleanedCount} registros antiguos eliminados`);
        return cleanedCount;
    } catch (error) {
        console.error('❌ Error en limpieza automática:', error);
        return 0;
    }
};

export const getSystemMetrics = () => {
    try {
        const totalSelections = Object.keys(localUserSelections).length;
        const processingCount = processingUsers.size;
        const todayConversions = getTodayConversions().length;
        const dailySales = getDailySalesTotal();
        const productStats = getProductStats();
        return {
            totalActiveSelections: totalSelections,
            currentlyProcessing: processingCount,
            todayConversions: todayConversions,
            dailySalesTotal: dailySales,
            productPopularity: productStats,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('❌ Error obteniendo métricas:', error);
        return null;
    }
};

// ✅ EXPORTAR FLUJO PRINCIPAL
export default capacityMusic;

// ✅ EXPORTAR FLUJOS ADICIONALES PARA USO EXTERNO
export { 
    capacityComparison, 
    askShippingData, 
    showAdditionalProducts,
    usbProducts,
    additionalProducts,
    formatPrice,
    calculateSavings,
    convertSelectionToCart
};

export type { 
    LocalUserSelection, 
    CartData, 
    CartItem, 
    USBProduct, 
    AdditionalProduct 
};

// ✅ CONFIGURAR LIMPIEZA AUTOMÁTICA (ejecutar cada 6 horas)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        cleanupOldSelections(24);
    }, 6 * 60 * 60 * 1000);
}

console.log('✅ capacityMusic.ts cargado correctamente con compatibilidad de carrito mejorada');

if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const metrics = getSystemMetrics();
        if (metrics) {
            console.log('📊 Métricas del sistema:', {
                selecciones_activas: metrics.totalActiveSelections,
                procesando: metrics.currentlyProcessing,
                conversiones_hoy: metrics.todayConversions,
                ventas_hoy: formatPrice(metrics.dailySalesTotal),
                productos_populares: metrics.productPopularity
            });
        }
    }, 60 * 60 * 1000);
}

console.log('✅ capacityMusic.ts cargado correctamente con todas las mejoras');
