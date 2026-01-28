import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import type { BotContext, UserSession, CartData, CartItem } from '../../types/global';
import { capacityMiddleware } from '../middlewares/contextMiddleware';
import path from 'path';
import { promises as fs } from 'fs';
import { postHandler, preHandler } from './middlewareFlowGuard';
import { resetFollowUpCountersForUser } from './userTrackingSystem';
import { flowHelper } from '../services/flowIntegrationHelper';
import { EnhancedMusicFlow } from './enhancedMusicFlow';
import { catalogService } from '../services/CatalogService';
import { flowGuard } from '../services/flowGuard';
import { registerBlockingQuestion, ConversationStage, markConversationComplete } from '../services/stageFollowUpHelper';
import {
    applyReadabilityBudget,
    createPendingDetails,
    isMoreRequest,
    hasPendingDetails,
    getPendingDetails,
    clearPendingDetails,
    formatPendingDetails
} from '../utils/readabilityBudget';

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
const localUserSelections: Record<string, LocalUserSelection> = {};
const processingUsers: Set<string> = new Set();

// ✅ SHIPPING DATA PARSING CONSTANTS
const MIN_SHIPPING_DATA_PARTS = 2; // Minimum: name + city
const PHONE_NUMBER_PATTERN = /^[\d\s\-\+\(\)]{10,15}$/; // Flexible phone validation (10-15 digits with formatting)

// ✅ Build USB products from CatalogService
const buildUsbProducts = (): { [key: string]: USBProduct } => {
    const musicProducts = catalogService.getProductsByCategory('music');
    const products: { [key: string]: USBProduct } = {};
    
    musicProducts.forEach((product, index) => {
        products[String(index + 1)] = {
            capacity: product.capacity,
            songs: product.content.count.toLocaleString('es-CO'),
            price: product.price,
            originalPrice: Math.round(product.price * 1.4), // 40% discount
            discount: 29,
            description: `${product.capacity} - ${product.capacityGb <= 8 ? 'Perfecta para empezar' : product.capacityGb <= 32 ? 'La más popular' : product.capacityGb <= 64 ? 'Mejor relación valor' : 'Colección completa'}`,
            benefits: product.inclusions.slice(0, 3).map(inc => `✅ ${inc}`),
            urgency: product.popular ? '🔥 Solo quedan pocas' : product.recommended ? '💎 Edición limitada' : product.capacityGb >= 128 ? '👑 Últimas unidades' : '⚡ Stock limitado',
            popular: product.popular,
            vip: product.capacityGb >= 128
        };
    });
    
    return products;
};

const usbProducts: { [key: string]: USBProduct } = buildUsbProducts();

const additionalProducts: AdditionalProduct[] = [
    {
        name: 'Audífonos Bluetooth Premium',
        price: 34900,
        originalPrice: 44900,
        img: 'https://i.imgur.com/S3DGtCh.png',
        benefits: ['🎵 Sonido HD', '🔋 20h de batería', '🎧 Cancelación de ruido'],
        combo: true
    },
    {
        name: 'Cargador Rápido',
        price: 79900,
        originalPrice: 119900,
        img: 'https://i.imgur.com/pjB0AFq.png',
        benefits: ['⚡ Carga rápida', '📱 Compatible con todos los celulares', '🛡️ Protección inteligente'],
        combo: true
    },
    {
        name: 'Soporte Magnético Premium',
        price: 59900,
        originalPrice: 79900,
        img: 'https://i.imgur.com/4n00vPV.png',
        benefits: ['🧲 Súper magnético', '🚗 Perfecto para el auto', '📱 Rotación 360°']
    },
    {
        name: 'Power Bank 10,000mAh',
        price: 59900,
        originalPrice: 79900,
        img: 'https://i.imgur.com/I55NSlX.png',
        benefits: ['🔋 Carga 5 dispositivos', '⚡ Carga rápida', '💎 Diseño premium'],
        combo: true
    },
    {
        name: 'Hidrolavadora portátil',
        price: 129900,
        originalPrice: 169900,
        img: 'https://i.imgur.com/lGKAJZZ.png',
        benefits: ['Utiliza cualquier fuente de agua, un río un balde', '⚡ Lava tu auto, moto, bicicleta y ahorra agua', 'Lava tus ventanas o patio fácilmente']
    }
];

const persuasivePhrases = [
    '¡Miles de clientes felices ya disfrutan sus USBs musicales!',
    'Esta oferta es exclusiva para ti, no la dejes pasar.',
    '¿Te imaginas todos tus géneros favoritos en un solo dispositivo?',
    '¡Hazlo ahora y recibe un regalo sorpresa en tu pedido!',
    '🎶 Haz tu pedido hoy y vive la experiencia musical definitiva.'
];

// --- Utilidades ---
const formatPrice = (price: number): string =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(price);

const calculateSavings = (originalPrice: number, currentPrice: number): string => {
    const savings = originalPrice - currentPrice;
    return formatPrice(savings);
};

const calculateDiscountPercent = (originalPrice: number, currentPrice: number): number => {
    return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
};

// ✅ CONVERTIR SELECCIÓN A CARRITO
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
    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return {
        id: `cart_${phoneNumber}_${Date.now()}`,
        items: cartItems,
        total,
        createdAt: selection.timestamp
    };
};

function getPersonalizedRecommendation(interests: string[]): string {
    const interestStr = interests.join(', ');
    if (interests.includes('reggaeton')) return '🎵 Tengo una selección especial de reggaeton que te va a encantar';
    if (interests.includes('rock')) return '🎸 Perfecta selección de rock clásico y moderno';
    if (interests.includes('salsa')) return '💃 Los mejores clásicos de salsa para bailar';
    if (interests.includes('pop')) return '🎤 Los hits más actuales del pop internacional';
    return `🎵 Música personalizada para tus gustos: ${interestStr}`;
}

const getUrgencyMessage = (): string => {
    const messages = [
        '⏰ Oferta válida solo por hoy',
        '🔥 Últimas unidades disponibles',
        '💨 Envío gratis si ordenas en los próximos 30 minutos',
        '⚡ Precio especial por tiempo limitado',
        '🎯 Stock limitado - No te quedes sin la tuya'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
};

const getPersuasivePhrase = (): string => persuasivePhrases[Math.floor(Math.random() * persuasivePhrases.length)];

const getRandomProducts = (count: number, includeCombo: boolean = false): AdditionalProduct[] => {
    const products = includeCombo ? additionalProducts.filter(p => p.combo) : additionalProducts;
    const shuffled = [...products].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

const isValidSelection = (selection: string): boolean => {
    return ['1', '2', '3', '4'].includes(selection);
};

// ✅ CROSS-SELL with deduplication and context awareness
async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any, phoneNumber: string) {
    try {
        const session = await getUserSession(phoneNumber);

        // Check if cross-sell was already offered recently (within 24h)
        const lastCrossSellAt = (session.conversationData as any)?.lastCrossSellAt;
        if (lastCrossSellAt) {
            const hoursSince = (Date.now() - new Date(lastCrossSellAt).getTime()) / (1000 * 60 * 60);
            if (hoursSince < 24) {
                console.log(`⏸️ Cross-sell ya ofrecido hace ${hoursSince.toFixed(1)}h. Evitando duplicado.`);
                return; // Don't offer again within 24 hours
            }
        }

        // Only offer cross-sell at appropriate stage (after capacity selected)
        const isAppropriateStage = ['closing', 'awaiting_payment', 'checkout_started'].includes(session.stage);
        if (!isAppropriateStage) {
            console.log(`⏸️ Cross-sell no apropiado en stage=${session.stage}`);
            return;
        }

        if (currentProduct === 'music') {
            await flowDynamic(
                [
                    '🎬 ¿Te gustaría añadir la USB de VIDEOS MUSICALES a tu pedido?',
                    '🎁 Combo Música + Videos: -25% y envío gratis si compras ambas.',
                    'Responde SÍ o NO'
                ].join('\n')
            );
        } else {
            await flowDynamic(
                [
                    '🎵 ¿Te gustaría añadir la USB de MÚSICA a tu pedido?',
                    '🎁 Combo Música + Videos: -25% y envío gratis si compras ambas.',
                    'Responde SÍ o NO'
                ].join('\n')
            );
        }

        // Mark cross-sell as offered
        if (session) {
            session.conversationData = session.conversationData || {};
            (session.conversationData as any).lastCrossSellAt = new Date().toISOString();

            await updateUserSession(phoneNumber, 'Cross-sell presentado', 'cross_sell_presented', null, false, {
                metadata: {
                    crossSellType: currentProduct === 'music' ? 'videos' : 'music',
                    timestamp: new Date().toISOString()
                }
            });
        }
    } catch (error) {
        console.error('❌ Error en crossSellSuggestion:', error);
    }
}

// --- FLUJO DE COMPARACIÓN ---
const capacityComparison = addKeyword(['comparar', 'diferencias', 'cual elegir'])
    .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow, endFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            // Check if user is requesting MORE details
            const session = await getUserSession(phoneNumber);
            if (isMoreRequest(ctx.body || '') && hasPendingDetails(session.conversationData)) {
                const pending = getPendingDetails(session.conversationData);
                if (pending) {
                    const chunks = formatPendingDetails(pending);
                    for (const chunk of chunks) {
                        await flowDynamic([chunk]);
                    }
                    // Clear pending details after sending by directly modifying session
                    session.conversationData = clearPendingDetails(session.conversationData);
                    await updateUserSession(
                        phoneNumber,
                        ctx.body || 'MORE',
                        'musicUsb',
                        'prices_shown',
                        false
                    );
                    return endFlow();
                }
            }

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['prices_shown', 'awaiting_capacity', 'personalization'],
                {
                    lockOnStages: ['awaiting_payment', 'checkout_started', 'completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
                        completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
                    }
                }
            );
            if (!pre || !pre.proceed) return;

            await updateUserSession(
                phoneNumber,
                'Solicita comparación',
                'capacity_comparison',
                null,
                false,
                { metadata: session }
            );

            // Build full comparison message
            const fullComparisonMsg = [
                '📊 COMPARACIÓN DETALLADA DE CAPACIDADES',
                '1️⃣ 8GB — 15+ géneros musicales · ideal uso diario',
                '',
                `🎵 32GB — ${usbProducts['2'].songs} canciones · ${formatPrice(usbProducts['2'].price)} 🔥 Más vendida`,
                '• 15+ géneros musicales · ideal uso diario',
                '',
                `🎵 64GB — ${usbProducts['3'].songs} canciones · ${formatPrice(usbProducts['3'].price)} ⭐ Mejor valor`,
                '• 20+ géneros completos',
                '',
                `🎵 128GB — ${usbProducts['4'].songs} canciones · ${formatPrice(usbProducts['4'].price)} 👑 Gran capacidad`,
                '• Colección completa',
                '',
                '💡 Recomendación: 64GB es perfecta para la mayoría.',
                'Responde con el número (2, 3 o 4)'
            ].join('\n');

            // Apply readability budget
            const budgetResult = applyReadabilityBudget(fullComparisonMsg);
            await flowDynamic([budgetResult.message]);

            // Store pending details if truncated
            if (budgetResult.wasTruncated && budgetResult.pendingDetails) {
                const pendingDetails = createPendingDetails(budgetResult.pendingDetails, 'capacity');
                // Directly modify session.conversationData to store pending details
                session.conversationData = session.conversationData || {};
                (session.conversationData as any).pendingDetails = pendingDetails;
                await updateUserSession(
                    phoneNumber,
                    'Comparación truncada',
                    'musicUsb',
                    'prices_shown',
                    false
                );
            }

            await postHandler(phoneNumber, 'musicUsb', 'prices_shown');
        } catch (error) {
            console.error('❌ Error en capacityComparison:', error);
            await flowDynamic(['⚠️ Error mostrando comparación. Por favor intenta de nuevo.']);
        }
    })
    .addAction({ capture: true }, async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        const rawInput = (ctx.body || '').trim();
        const digit = rawInput.replace(/[^\d]/g, '');
        const validChoices = ['1', '2', '3', '4'];

        if (!validChoices.includes(digit)) {
            const t = rawInput.toLowerCase();
            if (['gracias', 'ok', 'listo', 'dale', 'bien'].includes(t)) {
                await flowDynamic(['Para continuar, responde con un número: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.']);
                return;
            }
            // await flowDynamic([
            //     [
            //         '❌ Opción no válida.',
            //         'Elige con un número:',
            //         `1️⃣ 8GB — ${usbProducts['1'].songs} canciones`,
            //         `2️⃣ 32GB — ${usbProducts['2'].songs} canciones`,
            //         `3️⃣ 64GB — ${usbProducts['3'].songs} canciones`,
            //         `4️⃣ 128GB — ${usbProducts['4'].songs} canciones`
            //     ].join('\n')
            // ]);
            // return;
        }

        const selection = digit;
        const phoneNumber = ctx.from;

        const pre = await preHandler(
            ctx,
            { flowDynamic, gotoFlow },
            'musicUsb',
            ['awaiting_capacity', 'prices_shown'],
            {
                lockOnStages: ['awaiting_payment', 'checkout_started', 'completed'],
                resumeMessages: {
                    awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                    checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
                    completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
                }
            }
        );
        if (!pre || !pre.proceed) return;

        if (isValidSelection(selection)) {
            ctx.body = selection;
            await postHandler(phoneNumber, 'musicUsb', 'awaiting_capacity');
            return gotoFlow(capacityMusicFlow);
        } else {
            // await flowDynamic([
            //     '❌ Opción no válida\n\n' +
            //     'Por favor responde con el número de la opción que prefieres:\n' +
            //     '2 para 32GB\n' +
            //     '3 para 64GB\n' +
            //     '4 para 128GB'
            // ]);
            await postHandler(phoneNumber, 'musicUsb', 'prices_shown');
        }
    });

// --- FLUJO PRINCIPAL DE CAPACIDAD ---
const capacityMusicFlow = addKeyword([EVENTS.ACTION])
    // Mostrar opciones
    // CORRECCIÓN: Agregamos 'endFlow' a los argumentos desestructurados
    .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow, endFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            // FLOWGUARD: Check if capacity promo should be blocked
            const blockCheck = await flowGuard.shouldBlockPromo(phoneNumber, 'capacity');
            if (blockCheck.blocked) {
                console.log(`🚫 Capacity promo blocked for ${phoneNumber}: ${blockCheck.reason}`);
                await flowDynamic([
                    '✅ Ya tienes una orden en proceso.',
                    'Nos enfocaremos en completarla primero.'
                ]);
                return endFlow();
            }

            // === Validar transición de flujo ===
            const canTransition = await EnhancedMusicFlow.validateTransitionToCapacity(phoneNumber);
            if (!canTransition) {
                console.log('⚠️ Transición no válida a capacityMusic');
                await flowDynamic(['Primero selecciona tus géneros musicales favoritos']);
                return;
            }

            // ✅ CORRECCIÓN CRÍTICA DEL MIDDLEWARE MANUAL
            // Creamos un control para saber si el middleware permite continuar
            let allowContinue = false;

            // Simulamos la función 'next'
            const next = () => { allowContinue = true; };

            if (typeof capacityMiddleware === 'function') {
                // Pasamos el objeto correcto { endFlow, flowDynamic } y la función next
                await capacityMiddleware(ctx, { endFlow, flowDynamic }, next);
            } else {
                allowContinue = true; // Si no existe el middleware, permitimos pasar
            }

            // Si el middleware no llamó a next() (ej. bloqueó el mensaje), detenemos aquí
            if (!allowContinue) return;


            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['awaiting_capacity', 'prices_shown', 'personalization'],
                {
                    lockOnStages: ['awaiting_payment', 'checkout_started', 'completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
                        completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
                    }
                }
            );
            if (!pre || !pre.proceed) return;

            const session = await getUserSession(phoneNumber);
            if (!phoneNumber) return;

            // Marcamos que ya se mostraron los precios de música
            try {
                const conv = (session.conversationData || {}) as any;
                conv.musicPricesShown = true;
                session.conversationData = conv;
                await updateUserSession(
                    phoneNumber,
                    'Opciones de capacidad música mostradas',
                    'musicUsb',
                    'capacity_options_shown',
                    false,
                    { metadata: { from: 'capacityMusicFlow' } }
                );
            } catch (e) {
                console.error('Error marcando musicPricesShown en capacityMusicFlow:', e);
            }

            if (processingUsers.has(phoneNumber)) return;
            processingUsers.add(phoneNumber);

            const now = Date.now();
            if (
                (session as any)?.lastProcessedTime &&
                session.currentFlow === 'capacity_music' &&
                now - new Date((session as any).lastProcessedTime).getTime() < 5000
            ) {
                processingUsers.delete(phoneNumber);
                return;
            }

            if (session) {
                session.currentFlow = 'capacity_music';
                (session as any).lastProcessedTime = new Date();

                // ✅ FIX: Check if capacity already selected before showing options
                const { getUserCollectedData } = await import('./userTrackingSystem');
                const collectedData = getUserCollectedData(session);

                if (collectedData.hasCapacity && collectedData.capacity) {
                    console.log(`✅ [CAPACITY] Already selected: ${collectedData.capacity} for ${phoneNumber}`);
                    processingUsers.delete(phoneNumber);

                    // Show confirmation and skip to shipping
                    await flowDynamic([
                        `✅ Ya seleccionaste capacidad: *${collectedData.capacity}*\n\n` +
                        `¿Deseas cambiarla? Responde:\n` +
                        `• "CAMBIAR" para elegir otra capacidad\n` +
                        `• "CONTINUAR" para proceder con ${collectedData.capacity}`
                    ]);

                    await postHandler(phoneNumber, 'musicUsb', 'capacity_confirmation');
                    return;
                }

                await updateUserSession(
                    phoneNumber,
                    'Iniciando selección de capacidad',
                    'musicUsb',
                    'capacity_flow_start',
                    false,
                    { metadata: { step: 'capacity_flow_start' } }
                );
            }

            // INTENTO DE CARGAR IMAGEN (Lógica original mantenida pero comentada por seguridad como estaba en tu código)
            // try {
            //     const pricingImagePath = path.resolve(__dirname, '../Portada/pricing_music_table.png');
            //     // ... lógica de imagen ...
            // } catch {
            //     await flowDynamic(['⚠️ No se pudo cargar la imagen. Selecciona: 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.']);
            // }

            processingUsers.delete(phoneNumber);

            if (session) {
                await updateUserSession(
                    phoneNumber,
                    'Opciones presentadas',
                    'musicUsb',
                    'capacity_options_shown',
                    false,
                    { metadata: { step: 'capacity_options_shown' } }
                );
            }

            // 🔔 Register blocking question for stage-based follow-up
            // If user doesn't respond to capacity question, follow-up will be sent after 30-45 min
            await registerBlockingQuestion(
                phoneNumber,
                ConversationStage.ASK_CAPACITY_OK,
                'capacity_selection_question',
                'capacity_confirmation',
                'capacityMusic',
                { contentType: 'music', step: 'awaiting_capacity' }
            ).catch(err => console.warn('⚠️ Failed to register blocking question:', err));

            await postHandler(phoneNumber, 'musicUsb', 'awaiting_capacity');
        } catch (error) {
            console.error('❌ Error crítico en capacityMusicFlow:', error);
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
            } catch {
                /* ignore */
            }
        }
    })
    // Capturar selección de capacidad
    .addAction({ capture: true }, async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['awaiting_capacity', 'awaiting_payment'],
                {
                    lockOnStages: ['checkout_started', 'completed'],
                    resumeMessages: {
                        awaiting_capacity: 'Retomemos: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.',
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.'
                    }
                }
            );
            if (!pre || !pre.proceed) return;

            const raw = (ctx.body || '').trim();
            const digit = raw.replace(/[^\d]/g, '');
            const valid = ['1', '2', '3', '4'];

            if (!valid.includes(digit)) {
                const t = raw.toLowerCase();

                // ✅ FIX: Handle capacity confirmation responses
                if (t.includes('continuar') || t.includes('si') || t === 'ok' || t === 'listo') {
                    const session = await getUserSession(phoneNumber);
                    const { getUserCollectedData } = await import('./userTrackingSystem');
                    const collectedData = getUserCollectedData(session);

                    if (collectedData.hasCapacity) {
                        await flowDynamic([`✅ Perfecto! Continuando con ${collectedData.capacity}...`]);
                        await postHandler(phoneNumber, 'musicUsb', 'awaiting_payment');
                        return gotoFlow(askShippingData);
                    }
                }

                if (t.includes('cambiar')) {
                    // Clear capacity and continue with selection
                    const session = await getUserSession(phoneNumber);
                    if (session.conversationData) {
                        delete (session.conversationData as any).selectedCapacity;
                        delete (session.conversationData as any).selectedPrice;
                    }
                    await flowDynamic(['📝 Vale, elige la nueva capacidad:']);
                    await postHandler(ctx.from, 'musicUsb', 'awaiting_capacity');
                    return;
                }

                if (['gracias', 'bien', 'dale'].includes(t)) {
                    await flowDynamic(['Para continuar, responde: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.']);
                    await postHandler(ctx.from, 'musicUsb', 'awaiting_capacity');
                    return;
                }
                // await flowDynamic([
                //     [
                //         '❌ Opción no válida.',
                //         'Elige con un número:',
                //         `1️⃣ 8GB — ${usbProducts['1'].songs} canciones`,
                //         `2️⃣ 32GB — ${usbProducts['2'].songs} canciones`,
                //         `3️⃣ 64GB — ${usbProducts['3'].songs} canciones`,
                //         `4️⃣ 128GB — ${usbProducts['4'].songs} canciones`
                //     ].join('\n')
                // ]);
                await postHandler(ctx.from, 'musicUsb', 'awaiting_capacity');
                return;
            }

            const productKey = digit;
            const product = usbProducts[productKey];
            const session = await getUserSession(ctx.from);

            // ✅ FIX: Check if this capacity was already selected to prevent duplicate processing
            const existingCapacity = (session.conversationData as any)?.selectedCapacity;
            if (existingCapacity === product.capacity) {
                console.log(`⚠️ [CAPACITY] Duplicate selection detected: ${product.capacity} for ${ctx.from}`);
                await flowDynamic([
                    `✅ Ya confirmaste ${product.capacity}.\n\nContinuando con tus datos de envío...`
                ]);
                await postHandler(ctx.from, 'musicUsb', 'awaiting_payment');
                return gotoFlow(askShippingData);
            }

            const genero = (session as any)?.conversationData?.selectedGenre || 'Música variada';
            const savings = calculateSavings(product.originalPrice, product.price);
            const discountPercent = calculateDiscountPercent(product.originalPrice, product.price);

            // CRITICAL: Update tracking BEFORE any other operations
            await updateUserSession(ctx.from, `Capacidad seleccionada: ${product.capacity}`, 'musicUsb', 'capacity_selected', false, {
                metadata: {
                    buyingIntent: 100, // User made a decision - high intent
                    stage: 'closing', // Moving to closing stage
                    lastAction: 'capacity_selected',
                    selectedCapacity: product.capacity,
                    price: product.price,
                    productType: 'music'
                }
            });

            // Persist capacity to conversationData so it's available in getUserCollectedData
            session.conversationData = session.conversationData || {};
            (session.conversationData as any).selectedCapacity = product.capacity;
            (session.conversationData as any).selectedPrice = product.price;
            (session.conversationData as any).capacitySelectedAt = Date.now();

            // Also update session tracking with full context
            await updateUserSession(
                ctx.from,
                `Capacidad: ${product.capacity}`,
                'capacityMusic',
                'order_summary',
                false,
                {
                    metadata: {
                        step: 'order_summary',
                        productType: 'music',
                        selectedGenre: genero,
                        selectedCapacity: product.capacity,
                        price: formatPrice(product.price),
                        songs: product.songs,
                        orderReady: true
                    }
                }
            );

            // Mark user as having made a decision - prevents unwanted follow-ups
            session.tags = session.tags || [];
            if (!session.tags.includes('decision_made')) {
                session.tags.push('decision_made');
            }
            if (!session.tags.includes('capacity_selected')) {
                session.tags.push('capacity_selected');
            }

            // ✅ FIX: Validate stage transition before moving to shipping
            const { validateStageTransition } = await import('./userTrackingSystem');
            const validation = validateStageTransition(session, 'data_collection');

            if (!validation.valid) {
                console.error(`❌ [CAPACITY] Cannot transition to shipping: ${validation.missing.join(', ')}`);
                await flowDynamic([
                    `⚠️ Necesitamos completar algunos datos antes:\n\n` +
                    `${validation.missing.map(f => `• ${f}`).join('\n')}`
                ]);
                return;
            }

            localUserSelections[ctx.from] = {
                capacity: product.capacity,
                description: `${product.capacity} (${product.songs} canciones) · ${formatPrice(product.price)}`,
                price: product.price,
                originalPrice: product.originalPrice,
                savings,
                timestamp: new Date(),
                additionalProducts: []
            };

            const badges = [
                product.popular ? '🔥 Más vendida' : '',
                product.vip ? '👑 Gran capacidad' : ''
            ]
                .filter(Boolean)
                .join(' • ');

            const headline = '🎉 Excelente elección!';

            // Concise confirmation message (max 10 lines)
            const confirmationMessage = [
                headline,
                `✅ ${product.description}${badges ? ' • ' + badges : ''}`,
                `🎵 ${product.songs} canciones`,
                `💰 ${formatPrice(product.price)} (${discountPercent}% OFF)`,
                '',
                '🎧 Organizado por género/artista',
                '🚚 Envío GRATIS',
                '',
                '📦 Datos de envío:',
                'Nombre | Ciudad/Dirección | Celular'
            ].join('\n');

            await flowDynamic([confirmationMessage]);

            await new Promise(resolve => setTimeout(resolve, 2000));

            await crossSellSuggestion('music', flowDynamic, phoneNumber);

            await postHandler(phoneNumber, 'musicUsb', 'awaiting_payment');

            return gotoFlow(askShippingData);
        } catch (error) {
            console.error('❌ Error en captura de capacityMusicFlow:', error);
            await flowDynamic([
                '⚠️ Error procesando tu selección',
                'Por favor intenta de nuevo'
            ]);
        }
    });

// --- FLUJO DE DATOS DE ENVÍO ---
const askShippingData = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow: async () => { } },
                'musicUsb',
                ['awaiting_payment', 'checkout_started'],
                {
                    lockOnStages: ['completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
                    }
                }
            );
            const session = await getUserSession(phoneNumber);

            session.stage = 'converted'; // además de 'completed' si quieres mantenerlo
            resetFollowUpCountersForUser(session);

            if (!pre || !pre.proceed) return;

            // ✅ FIX: Check if shipping data is already collected
            const { getUserCollectedData, shouldSkipDataCollection } = await import('./userTrackingSystem');
            const collectedData = getUserCollectedData(session);

            if (collectedData.hasShippingInfo && collectedData.shippingInfo) {
                console.log(`✅ [SHIPPING] Data already collected for ${phoneNumber}, skipping to order processing`);

                // Show confirmation message with existing data
                await flowDynamic([
                    [
                        '✅ *Datos de envío ya confirmados:*',
                        '',
                        `📍 Ciudad: ${collectedData.shippingInfo.city || 'N/A'}`,
                        `🏠 Dirección: ${collectedData.shippingInfo.address || 'N/A'}`,
                        collectedData.personalInfo?.name ? `👤 Nombre: ${collectedData.personalInfo.name}` : '',
                        '',
                        '📦 Procesando tu pedido...'
                    ].filter(Boolean).join('\n')
                ]);

                // Skip to order processing since we already have the data
                const { default: orderProcessingFlow } = await import('./orderProcessing');
                return gotoFlow(orderProcessingFlow);
            }

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
                    '📦 Último paso:',
                    '',
                    '✅ Nombre completo',
                    '✅ Ciudad y dirección',
                    '✅ Celular (10 dígitos)',
                    '',
                    '📝 Ejemplo: Juan Pérez, Bogotá, Calle 123 #45-67, 3001234567',
                    '🚚 Envío GRATIS'
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
                ['awaiting_payment', 'checkout_started'],
                {
                    lockOnStages: ['completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
                    }
                }
            );
            if (!pre || !pre.proceed) return;

            const shippingData = ctx.body?.trim() || '';

            if (shippingData.length < 20) {
                await flowDynamic([
                    '❌ Datos incompletos',
                    '',
                    'Necesito:',
                    '• Nombre completo',
                    '• Ciudad y dirección',
                    '• Celular (10 dígitos)',
                    '',
                    'Ej: Juan Pérez, Bogotá, Calle 123 #45-67, 3001234567'
                ].join('\n'));
                await postHandler(phoneNumber, 'musicUsb', 'awaiting_payment');
                return;
            }

            // ✅ FIX: Parse and store shipping data properly in conversationData
            const session = await getUserSession(phoneNumber);

            // Basic validation - should have at least name and city
            const parts = shippingData.split(',').map(p => p.trim()).filter(p => p.length > 0);

            if (parts.length < MIN_SHIPPING_DATA_PARTS) {
                await flowDynamic([
                    '❌ Datos incompletos',
                    '',
                    'Necesito al menos:',
                    '• Nombre completo',
                    '• Ciudad',
                    '• Dirección',
                    '',
                    'Ej: Juan Pérez, Bogotá, Calle 123 #45-67, 3001234567'
                ].join('\n'));
                await postHandler(phoneNumber, 'musicUsb', 'awaiting_payment');
                return;
            }

            // Try to extract: Name, City, Address, Phone (in that order expected)
            // Format: "Name, City, Address, Phone" or "Name, City, Address"
            const nombre = parts[0] || '';
            const ciudad = parts[1] || '';
            let direccion = '';
            let telefono = ctx.from; // Default to WhatsApp number

            // Check if last part looks like a phone number using pattern
            const lastPart = parts[parts.length - 1];
            if (PHONE_NUMBER_PATTERN.test(lastPart.replace(/\D/g, ''))) {
                telefono = lastPart.replace(/\D/g, ''); // Extract digits only
                direccion = parts.slice(2, -1).join(', '); // Everything between city and phone
            } else {
                direccion = parts.slice(2).join(', '); // Everything after city
            }

            // Store in conversationData for persistence
            session.conversationData = session.conversationData || {};
            session.conversationData.customerData = {
                nombre,
                ciudad,
                direccion,
                telefono,
                shippingData // Keep original for reference
            };
            session.conversationData.shippingDataConfirmed = true;
            session.conversationData.shippingDataConfirmedAt = new Date().toISOString();

            await updateUserSession(
                phoneNumber,
                `Datos de envío: ${shippingData.substring(0, 50)}...`,
                'shipping_data_provided',
                null,
                false,
                {
                    metadata: {
                        customerData: session.conversationData.customerData,
                        shippingDataConfirmed: true
                    }
                }
            );

            if (localUserSelections[phoneNumber]) {
                localUserSelections[phoneNumber].shippingData = shippingData;
                localUserSelections[phoneNumber].orderStatus = 'pending_confirmation';
            }

            if (session) {
                session.stage = 'completed';
                const selection = localUserSelections[phoneNumber];
                if (selection) {
                    (session as any).cartData = convertSelectionToCart(phoneNumber, selection);
                }
                await updateUserSession(
                    phoneNumber,
                    'Datos completados - Cliente convertido',
                    'completed',
                    null,
                    false,
                    { metadata: session }
                );
                
                // 🔔 Mark conversation complete - cancels all pending follow-ups to avoid bothering confirmed users
                await markConversationComplete(phoneNumber)
                    .catch(err => console.warn('⚠️ Failed to mark conversation complete:', err));
            }

            await flowDynamic([
                '✅ Datos recibidos',
                '',
                '🎶 Procesando tu pedido...',
                '📞 Un asesor te contactará pronto',
                '',
                '¡Gracias por tu compra! 🎉'
            ].join('\n'));

            await postHandler(phoneNumber, 'musicUsb', 'checkout_started');

            await new Promise(resolve => setTimeout(resolve, 2000));

            return gotoFlow(showAdditionalProducts);
        } catch (error) {
            console.error('❌ Error procesando datos de envío:', error);
            await flowDynamic([
                '⚠️ Error guardando tus datos. Por favor intenta de nuevo con el formato sugerido.'
            ]);
        }
    });

// --- FLUJO DE PRODUCTOS ADICIONALES ---
const showAdditionalProducts = addKeyword([EVENTS.ACTION])
    .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
        try {
            const phoneNumber = ctx.from;

            const pre = await preHandler(
                ctx,
                { flowDynamic, gotoFlow },
                'musicUsb',
                ['checkout_started', 'awaiting_payment'],
                {
                    lockOnStages: ['completed'],
                    resumeMessages: {
                        awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
                        checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
                    }
                }
            );
            if (!pre || !pre.proceed) return;

            const session = await getUserSession(phoneNumber);
            const userSelection = localUserSelections[phoneNumber];
            if (!userSelection) {
                return gotoFlow(orderProcessing);
            }

            const comboProducts = getRandomProducts(2, true);
            await flowDynamic([
                [
                    '🛍️ ¡OFERTA EXCLUSIVA!\n',
                    'Aprovecha estos productos premium con descuentos especiales:\n',
                    `${comboProducts
                        .map((product, index) => {
                            const discountPercent = calculateDiscountPercent(product.originalPrice, product.price);
                            return (
                                `${index + 1}️⃣ ${product.name}\n` +
                                `   💰 ~~${formatPrice(product.originalPrice)}~~ → ${formatPrice(product.price)} (${discountPercent}% OFF)\n` +
                                `   ${product.benefits.join(' • ')}\n`
                            );
                        })
                        .join('\n')}\n`,
                    '💎 Si agregas cualquier producto, envío express GRATIS.\n\n',
                    '¿Quieres aprovechar alguna oferta?\n',
                    '• Responde 1 o 2 para el producto\n',
                    '• Responde NO para continuar sin adicionales'
                ].join('')
            ]);

            await updateUserSession(
                phoneNumber,
                'Productos adicionales mostrados',
                'additional_products_shown',
                null,
                false,
                { metadata: session }
            );

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
            if (!pre || !pre.proceed) return;

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
                const productIndex = parseInt(response, 10) - 1;
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
                            (session as any).cartData = convertSelectionToCart(phoneNumber, updatedSelection);
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
                        `✅ ¡${selectedProduct.name} agregado exitosamente!\n\n` +
                        `💰 Precio especial: ${formatPrice(selectedProduct.price)}\n` +
                        `🚚 Envío express GRATIS incluido\n\n` +
                        `✨ Tu pedido está completo y listo para procesar.`
                    ]);
                } else {
                    await flowDynamic(['❌ Error seleccionando el producto. Continuando con tu pedido principal...']);
                }
            } else if (['no', 'n', 'nah', 'skip', 'saltar'].includes(response)) {
                await flowDynamic([
                    '👍 ¡Perfecto!\n\n' +
                    '✅ Tu pedido principal sigue en proceso\n' +
                    '🎵 Tu USB musical llegará pronto\n\n' +
                    '📞 Un asesor te contactará en minutos'
                ]);
            } else {
                await flowDynamic([
                    '🤔 No entendí tu respuesta\n\n' +
                    'Responde:\n' +
                    '• 1 para el primer producto\n' +
                    '• 2 para el segundo producto\n' +
                    '• NO para continuar sin adicionales'
                ]);
                await postHandler(phoneNumber, 'musicUsb', 'checkout_started');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 1500));

            await postHandler(phoneNumber, 'musicUsb', 'completed');
            return gotoFlow(orderProcessing);
        } catch (error) {
            console.error('❌ Error procesando respuesta de productos adicionales:', error);
            await flowDynamic([
                '⚠️ Error procesando tu respuesta. Continuando con tu pedido principal...'
            ]);
            await postHandler(ctx.from, 'musicUsb', 'checkout_started');
            return gotoFlow(orderProcessing);
        }
    });

// --- UTILIDADES DE EXPORTACIÓN ---
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

        let summary = `📋 RESUMEN DE TU PEDIDO\n\n`;
        summary += `🎵 USB Musical: ${selection.description}\n`;
        summary += `💰 Precio: ${formatPrice(selection.price)}\n`;
        summary += `💸 Ahorras: ${selection.savings}\n`;

        if (selection.additionalProducts && selection.additionalProducts.length > 0) {
            summary += `\n🛍️ Productos adicionales:\n`;
            selection.additionalProducts.forEach(product => {
                summary += `• ${product}\n`;
            });
            const cartData = convertSelectionToCart(phoneNumber, selection);
            summary += `\n💰 Total del pedido: ${formatPrice(cartData.total)}\n`;
        }

        summary += `\n📦 Estado: ${selection.orderStatus || 'En proceso'}\n`;
        summary += `📅 Fecha: ${selection.timestamp.toLocaleDateString('es-CO')}`;
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
            .filter(
                ([, selection]) =>
                    selection.timestamp >= today && selection.orderStatus === 'pending_confirmation'
            )
            .map(([phoneNumber]) => phoneNumber);
    } catch (error) {
        console.error('❌ Error obteniendo conversiones del día:', error);
        return [];
    }
};

export const cleanupOldSelections = (hoursOld: number = 24): number => {
    try {
        const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
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
            todayConversions,
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
export default capacityMusicFlow;

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

// ✅ LIMPIEZA AUTOMÁTICA
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        cleanupOldSelections(24);
    }, 6 * 60 * 60 * 1000);

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

console.log('✅ capacityMusicFlow cargado correctamente con compatibilidad de imagen de precios y carrito mejorada');
