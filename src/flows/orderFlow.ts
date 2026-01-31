import { addKeyword } from '@builderbot/bot';
import { getUserSession, updateUserSession, ExtendedContext } from './userTrackingSystem';
import { contextAnalyzer } from '../services/contextAnalyzer';
import { contextMiddleware } from '../middlewares/contextMiddleware';
import customizationFlow from './customizationFlow';
import { orderEventEmitter } from '../services/OrderEventEmitter';
import { businessDB } from '../mysql-database';
import { generateOrderNumber, validateOrderData, formatOrderConfirmation, createOrderData } from '../utils/orderUtils';
import { markConversationComplete, registerBlockingQuestion, ConversationStage } from '../services/stageFollowUpHelper';
import { burningQueueService } from '../services/burningQueueService';
import { whatsappNotifications } from '../services/whatsappNotifications';
import { USB_INTEGRATION } from '../constants/usbIntegration';
import { unifiedLogger } from '../utils/unifiedLogger';

interface OrderData {
    items: Array<{
        id: string;
        productId?: string;
        name: string;
        price: number;
        quantity: number;
        unitPrice?: number;
    }>;
    type?: 'customized' | 'standard';
    product?: any;
    productType?: string;
    selectedGenre?: string;
    selectedCapacity?: string;
    price?: number;
    totalPrice?: number;
    step?: string;
    startedAt?: Date;
    status?: 'draft' | 'confirmed' | 'cancelled' | 'processing' | 'shipped';
    customerInfo?: {
        name?: string;
        phone?: string;
        address?: string;
    };
    paymentMethod?: any;
    finalPrice?: number;
    discount?: number;
    surcharge?: number;
    orderNumber?: string;
    confirmedAt?: Date;
    deliveryDate?: Date;
    createdAt?: Date;
    id?: string;
    total?: number;
    unitPrice?: number;
}

// ✅ CORREGIDO: Hacer productId opcional para compatibilidad
interface LocalOrderItem {
    id: string;
    productId?: string; // ✅ Hacer opcional
    name: string;
    price: number;
    quantity: number;
    unitPrice: number;
}

interface CustomerInfo {
    name?: string;
    phone?: string;
    address?: string;
}

interface LocalOrderData {
    items: LocalOrderItem[];
    type?: 'customized' | 'standard';
    product?: any;
    totalPrice?: number;
    step?: string; // <-- 'step' is included here
    startedAt?: Date;
    status?: 'draft' | 'confirmed' | 'cancelled' | 'processing' | 'shipped';
    customerInfo?: CustomerInfo;
    paymentMethod?: any;
    finalPrice?: number;
    discount?: number;
    surcharge?: number;
    orderNumber?: string;
    confirmedAt?: Date;
    deliveryDate?: Date;
    createdAt?: Date;
    id?: string;
    total?: number;
}

// =============================================================================
// Edge Case Handling - Invalid Response Tracking
// =============================================================================

/**
 * Map to track invalid response attempts per user
 * Key: phone number, Value: { count: number, lastAttempt: Date }
 */
const invalidResponseAttempts = new Map<string, { count: number; lastAttempt: Date }>();

/**
 * Map to track session state for timeout recovery
 * Key: phone number, Value: session state snapshot
 */
const sessionStateBackup = new Map<string, {
    orderNumber: string;
    stage: string;
    timestamp: Date;
    orderData: any;
}>();

/**
 * Cleanup expired entries from tracking maps periodically (every 15 minutes)
 */
setInterval(() => {
    const now = new Date();
    const invalidResponseTimeout = 10 * 60 * 1000; // 10 minutes
    
    // Cleanup invalid response attempts
    const invalidKeysToDelete: string[] = [];
    invalidResponseAttempts.forEach((entry, key) => {
        if ((now.getTime() - entry.lastAttempt.getTime()) > invalidResponseTimeout) {
            invalidKeysToDelete.push(key);
        }
    });
    invalidKeysToDelete.forEach(key => invalidResponseAttempts.delete(key));
    
    // Cleanup expired session backups
    const sessionKeysToDelete: string[] = [];
    sessionStateBackup.forEach((entry, key) => {
        if ((now.getTime() - entry.timestamp.getTime()) > USB_INTEGRATION.SESSION_TIMEOUT_MS) {
            sessionKeysToDelete.push(key);
        }
    });
    sessionKeysToDelete.forEach(key => sessionStateBackup.delete(key));
    
    if (invalidKeysToDelete.length > 0 || sessionKeysToDelete.length > 0) {
        unifiedLogger.info('flow', 'Cleaned up expired tracking entries', {
            invalidResponsesCleaned: invalidKeysToDelete.length,
            sessionStatesCleaned: sessionKeysToDelete.length
        });
    }
}, 15 * 60 * 1000); // Every 15 minutes

/**
 * Check and increment invalid response count
 * @returns true if user has exceeded max retries
 */
function checkInvalidResponseLimit(phoneNumber: string): { exceeded: boolean; count: number } {
    const now = new Date();
    const entry = invalidResponseAttempts.get(phoneNumber);
    
    // Reset if last attempt was more than 10 minutes ago
    if (entry && (now.getTime() - entry.lastAttempt.getTime()) > 10 * 60 * 1000) {
        invalidResponseAttempts.delete(phoneNumber);
    }
    
    const current = invalidResponseAttempts.get(phoneNumber) || { count: 0, lastAttempt: now };
    current.count++;
    current.lastAttempt = now;
    invalidResponseAttempts.set(phoneNumber, current);
    
    return { 
        exceeded: current.count >= USB_INTEGRATION.MAX_INVALID_RESPONSE_RETRIES,
        count: current.count
    };
}

/**
 * Reset invalid response count for a user
 */
function resetInvalidResponseCount(phoneNumber: string): void {
    invalidResponseAttempts.delete(phoneNumber);
}

/**
 * Save session state for timeout recovery
 */
function saveSessionState(phoneNumber: string, orderNumber: string, stage: string, orderData: any): void {
    sessionStateBackup.set(phoneNumber, {
        orderNumber,
        stage,
        timestamp: new Date(),
        orderData
    });
    
    unifiedLogger.info('flow', 'Session state saved for timeout recovery', { 
        phoneNumber, 
        orderNumber, 
        stage 
    });
}

/**
 * Recover session state after timeout
 */
function recoverSessionState(phoneNumber: string): {
    orderNumber: string;
    stage: string;
    orderData: any;
} | null {
    const state = sessionStateBackup.get(phoneNumber);
    if (!state) return null;
    
    // Check if state is still valid (within SESSION_TIMEOUT_MS)
    const now = new Date();
    if ((now.getTime() - state.timestamp.getTime()) > USB_INTEGRATION.SESSION_TIMEOUT_MS) {
        sessionStateBackup.delete(phoneNumber);
        unifiedLogger.info('flow', 'Session state expired', { phoneNumber });
        return null;
    }
    
    return {
        orderNumber: state.orderNumber,
        stage: state.stage,
        orderData: state.orderData
    };
}

/**
 * Clear session state backup
 */
function clearSessionState(phoneNumber: string): void {
    sessionStateBackup.delete(phoneNumber);
}

// =============================================================================

// ✅ CORREGIDO: Función helper para actualizar sesión con tipos seguros
async function updateSessionSafely(
    phoneNumber: string, 
    updates: Partial<{ 
        stage: string; 
        orderData: OrderData; 
        selectedProduct: any; 
        totalOrders: number 
    }>, 
    currentFlow: string
): Promise<void> {
    const session = await getUserSession(phoneNumber);
    
    // Aplicar actualizaciones de forma segura
    if (updates.stage) {
        session.stage = updates.stage;
    }
    
    if (updates.orderData) {
        // Merge seguro de orderData
        session.orderData = {
            items: [], // Valor por defecto requerido
            ...session.orderData,
            ...updates.orderData
        };
    }
    
    if (updates.selectedProduct) {
        session.selectedProduct = updates.selectedProduct;
    }
    
    if (typeof updates.totalOrders === 'number') {
        session.totalOrders = updates.totalOrders;
    }
    
    await updateUserSession(
    phoneNumber,                      
    'Pedido confirmado',           
    'orderFlow',                   
    'order_confirmed',            
    false,                            
    { metadata: updates as any }
);
}


// ✅ CORREGIDO: Función para crear OrderItem con tipos seguros
function createOrderItem(
    productId: string,
    name: string,
    price: number,
    quantity: number = 1
): LocalOrderItem {
    return {
        id: `item_${Date.now()}`,
        productId, // ✅ Ahora es opcional
        name,
        price,
        quantity,
        unitPrice: price
    };
}

const orderFlow = addKeyword(['order_confirmation_trigger'])
    // .addAction(contextMiddleware)
    .addAction({ capture: true }, async (ctx, { flowDynamic, endFlow }) => {
        try {
            const respuesta = ctx.body.trim().toLowerCase();
            console.log(`📋 [ORDER FLOW] Respuesta de confirmación: "${respuesta}"`);

            if (respuesta.includes('sí') || respuesta.includes('si') || respuesta.includes('correcto') || respuesta.includes('confirmar')) {
                console.log(`✅ [ORDER FLOW] Datos confirmados, procesando pedido final`);

                // ✅ OBTENER TODOS LOS DATOS DE LA SESIÓN
                const session = await getUserSession(ctx.from);
                const customerData = session?.conversationData?.customerData || {};
                const conversationData = session?.conversationData || {};
                
                // Extract order details from session with validation
                const productType = conversationData.productType || conversationData.selectedProduct?.type || 'music';
                const selectedGenre = conversationData.selectedGenre || 'Música variada';
                const selectedCapacity = conversationData.selectedCapacity || '8GB';
                const price = conversationData.selectedPrice || conversationData.price || 54900;
                
                // Validate productType is one of the allowed values
                const validProductTypes = ['music', 'videos', 'movies', 'series', 'mixed'];
                if (!validProductTypes.includes(productType)) {
                    console.warn(`⚠️ Invalid productType: ${productType}, defaulting to music`);
                }
                
                // Extract customer details
                const customerName = customerData.nombre || customerData.customerName || session.name || 'Cliente';
                const city = customerData.city || customerData.ciudad || '';
                const department = customerData.department || customerData.departamento || '';
                const address = customerData.address || customerData.direccion || '';
                const phone = customerData.telefono || customerData.phone || ctx.from;
                const metodoPago = customerData.metodoPago || 'efectivo';

                // ✅ GENERAR NÚMERO DE PEDIDO ÚNICO
                const orderNumber = await generateOrderNumber();
                console.log(`📋 Orden generada: ${orderNumber}`);

                // ✅ CREAR ESTRUCTURA DE ORDEN COMPLETA
                const fullOrderData = createOrderData({
                    orderNumber,
                    phoneNumber: ctx.from,
                    customerName,
                    productType: productType as 'music' | 'videos' | 'movies',
                    capacity: selectedCapacity,
                    price,
                    customization: {
                        genres: conversationData.selectedGenres || [selectedGenre],
                        artists: conversationData.selectedArtists || []
                    },
                    preferences: {
                        productType,
                        genre: selectedGenre,
                        paymentMethod: metodoPago
                    },
                    city,
                    department,
                    address,
                    customerPhone: phone,
                    cedula: customerData.cedula
                });

                // ✅ VALIDAR DATOS ANTES DE GUARDAR
                const validation = validateOrderData({
                    customerName,
                    customerPhone: phone,
                    city,
                    address,
                    capacity: selectedCapacity,
                    productType,
                    price
                });
                
                if (!validation.valid) {
                    console.error(`❌ Datos de orden incompletos:`, validation.missing);
                    await flowDynamic([{
                        body: `⚠️ Faltan algunos datos para completar tu pedido:\n\n` +
                              `${validation.missing.map(f => `• ${f}`).join('\n')}\n\n` +
                              `Por favor, proporciona la información faltante.`
                    }]);
                    return endFlow();
                }

                // ✅ GUARDAR PEDIDO EN BASE DE DATOS
                try {
                    // Create enhanced order structure that matches database schema
                    const orderForDB = {
                        orderNumber,
                        phoneNumber: ctx.from,
                        customerName,
                        productType: productType || 'music',
                        capacity: selectedCapacity,
                        price,
                        customization: {
                            genres: conversationData.selectedGenres || [selectedGenre],
                            artists: conversationData.selectedArtists || [],
                            videos: conversationData.selectedVideos || [],
                            movies: conversationData.selectedMovies || [],
                            series: conversationData.selectedSeries || []
                        },
                        preferences: {
                            paymentMethod: metodoPago || 'cash',
                            deliveryPreference: conversationData.deliveryPreference || 'standard',
                            specialInstructions: conversationData.specialInstructions || '',
                            productType,
                            genre: selectedGenre
                        },
                        shippingAddress: `${customerName} | ${city}${department ? ', ' + department : ''} | ${address}`,
                        shippingPhone: phone || ctx.from,
                        processingStatus: 'pending' as const,
                        source: 'whatsapp_chatbot',
                        createdAt: new Date()
                    };
                    
                    const saved = await businessDB.saveOrder(orderForDB as any);
                    if (!saved) {
                        throw new Error('No se pudo guardar el pedido en la base de datos');
                    }
                    console.log(`✅ Pedido ${orderNumber} guardado en base de datos exitosamente`);
                } catch (dbError) {
                    console.error(`❌ Error guardando pedido en BD:`, dbError);
                    await flowDynamic([{
                        body: `⚠️ Hubo un problema guardando tu pedido. Por favor, contacta al soporte.\n\n` +
                              `Número de referencia: ${orderNumber}`
                    }]);
                    return endFlow();
                }

                // ✅ ACTUALIZAR SESIÓN
                await updateSessionSafely(
                    ctx.from,
                    {
                        stage: 'order_confirmed',
                        orderData: {
                            items: [{
                                id: `item_${Date.now()}`,
                                name: `USB ${selectedCapacity} ${productType}`,
                                price,
                                quantity: 1
                            }],
                            type: 'standard',
                            orderNumber,
                            status: 'confirmed',
                            confirmedAt: new Date()
                        },
                        totalOrders: (session.totalOrders || 0) + 1
                    },
                    'orderFlow'
                );

                // ✅ LIMPIAR CONTEXTO CRÍTICO
                await contextAnalyzer.clearCriticalContext(ctx.from);

                // ✅ ENVIAR CONFIRMACIÓN FINAL CON FORMATO BONITO
                const confirmationMessage = formatOrderConfirmation({
                    orderNumber,
                    customerName,
                    productType,
                    capacity: selectedCapacity,
                    price,
                    genres: conversationData.selectedGenres || [selectedGenre],
                    city,
                    department,
                    address,
                    customerPhone: phone
                });

                await flowDynamic([{ body: confirmationMessage }]);

                // 🔔 Mark conversation complete - cancels all pending follow-ups
                await markConversationComplete(ctx.from)
                    .catch(err => console.warn('⚠️ Failed to mark conversation complete:', err));

                // 🔔 TRIGGER NOTIFICATION: Order Created
                await orderEventEmitter.onOrderCreated(
                    orderNumber,
                    ctx.from,
                    customerName,
                    undefined, // email not captured in this flow
                    {
                        items: [{
                            name: `USB ${selectedGenre} ${selectedCapacity}`,
                            price: price
                        }],
                        total: price,
                        productType,
                        genre: selectedGenre,
                        capacity: selectedCapacity
                    }
                );

                // ✅ ENVIAR INFORMACIÓN DE PAGO SI ES NECESARIO
                if (metodoPago !== 'efectivo') {
                    const formatPrice = (p: number) => 
                        new Intl.NumberFormat('es-CO', { 
                            style: 'currency', 
                            currency: 'COP', 
                            minimumFractionDigits: 0 
                        }).format(p);
                    
                    await flowDynamic([
                        {
                            body: `💳 *INFORMACIÓN DE PAGO*\n\n` +
                                  `Como elegiste *${metodoPago}*, aquí están los datos:\n\n` +
                                  `🏦 *DATOS BANCARIOS:*\n` +
                                  `• Titular: USB Personalizadas\n` +
                                  `• Nequi: 3209549668\n` +
                                  `• Daviplata: 3209549668\n\n` +
                                  `💰 *Monto a pagar:* ${formatPrice(price)}\n\n` +
                                  `📸 *Por favor, envía el comprobante de pago cuando realices la transferencia*\n\n` +
                                  `❓ ¿Tienes alguna pregunta?`
                        }
                    ]);
                }

                // 🔥 SHOW BURNING CONFIRMATION STEP
                // After order confirmation and payment info, show burning details summary
                await showBurningConfirmation(ctx, flowDynamic, {
                    orderNumber,
                    productType,
                    capacity: selectedCapacity,
                    customization: {
                        genres: conversationData.selectedGenres || [selectedGenre],
                        artists: conversationData.selectedArtists || []
                    }
                });

            } else if (respuesta.includes('corregir') || respuesta.includes('cambiar') || respuesta.includes('modificar') || respuesta.includes('no')) {
                console.log(`🔄 [ORDER FLOW] Usuario quiere corregir datos`);

                await flowDynamic([
                    {
                        body: `🔄 *Sin problema, puedes corregir tus datos*\n\n` +
                              `¿Qué dato quieres modificar?\n\n` +
                              `• *"Nombre"* - Cambiar nombre completo\n` +
                              `• *"Teléfono"* - Cambiar número de teléfono\n` +
                              `• *"Dirección"* - Cambiar dirección\n` +
                              `• *"Pago"* - Cambiar método de pago\n` +
                              `• *"Todo"* - Ingresar todos los datos nuevamente\n\n` +
                              `Escribe qué quieres cambiar:`
                    }
                ]);

                // ✅ MARCAR PARA CORRECCIÓN
                // Obtener la sesión actual y actualizar los campos necesarios
                const session = await getUserSession(ctx.from);
                session.orderData = {
                    items: [],
                    ...(session.orderData || {}),
                    step: 'correcting_data'
                };
                session.isProcessing = true;
                await updateUserSession(
                    ctx.from,
                    'Corrigiendo datos',
                    'datosClientes',
                    'order_confirmed',  // Paso actual
                    false,              // isProcessing
                    { metadata: { correcting: true } }
                );

            } else {
                await flowDynamic([
                    {
                        body: `🤔 No entendí tu respuesta.\n\n` +
                              `Por favor, responde:\n\n` +
                              `• *"Sí"* si todos los datos son correctos\n` +
                              `• *"Corregir"* si quieres modificar algo\n\n` +
                              `🎯 *¿Los datos son correctos?*`
                    }
                ]);
            }

        } catch (error) {
            console.error('❌ [ORDER FLOW] Error:', error);
            await contextAnalyzer.clearCriticalContext(ctx.from);
            await flowDynamic([
                { body: `❌ Error procesando la confirmación. Por favor, intenta nuevamente.` }
            ]);
        }
    });

export { orderFlow };

// ✅ CORREGIDO: Funciones independientes con tipos seguros
async function processCustomizedOrder(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    session: any
): Promise<void> {
    
    const customData = session.customization;
    const totalPrice = customData?.preferences?.totalPrice || 0;
    
    await flowDynamic([
        `🛒 *PROCESANDO TU PEDIDO PERSONALIZADO*`,
        ``,
        `✅ *Resumen confirmado:*`,
        `• USB completamente personalizada`,
        `• Precio total: $${totalPrice.toLocaleString()}`,
        `• Tiempo de producción: ${customData?.preferences?.accessories?.hasExpress ? '24-48h' : '3-5 días'}`,
        ``,
        `📋 *Para completar tu pedido necesito:*`,
        ``,
        `👤 *1. Información de contacto:*`,
        `• Nombre completo`,
        `• Número de teléfono`,
        `• Email (opcional)`,
        ``,
        `📍 *2. Dirección de entrega:*`,
        `• Ciudad`,
        `• Dirección completa`,
        `• Barrio/Referencias`,
        ``,
        `💳 *3. Método de pago preferido:*`,
        `• Transferencia bancaria`,
        `• Nequi/Daviplata`,
        `• Efectivo contra entrega`,
        `• Tarjeta de crédito`,
        ``,
        `💬 *Empecemos con tu nombre completo:*`
    ].join('\n'));

    await updateSessionSafely(ctx.from, {
        stage: 'collecting_order_info',
        orderData: {
            items: [],
            type: 'customized',
            totalPrice: totalPrice,
            step: 'collecting_name',
            startedAt: new Date(),
            status: 'draft'
        }
    }, 'orderFlow');
}

async function processStandardOrder(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    session: any
): Promise<void> {
    
    const product = session.selectedProduct;
    
    await flowDynamic([
        `🛒 *PROCESANDO TU PEDIDO*`,
        ``,
        `✅ *Producto seleccionado:*`,
        `• ${product.name}`,
        `• Capacidad: ${product.capacity}`,
        `• Precio: $${product.price.toLocaleString()}`,
        ``,
        `🎁 *INCLUYE GRATIS:*`,
        `• Diseño personalizado (valor $15.000)`,
        `• Envío a domicilio (valor $8.000)`,
        `• Playlist curada (valor $10.000)`,
        `• Garantía de satisfacción`,
        ``,
        `📋 *Para completar tu pedido necesito:*`,
        ``,
        `👤 *Información de contacto y entrega*`,
        ``,
        `💬 *Empecemos con tu nombre completo:*`
    ]);

    await updateSessionSafely(ctx.from, {
        stage: 'collecting_order_info',
        orderData: {
            items: [createOrderItem(
                product.id || `prod_${Date.now()}`,
                product.name,
                product.price
            )],
            type: 'standard',
            product: product,
            totalPrice: product.price,
            step: 'collecting_name',
            startedAt: new Date(),
            status: 'draft'
        }
    }, 'orderFlow');
}

async function startOrderProcess(
    ctx: ExtendedContext, 
    flowDynamic: any
): Promise<void> {
    
    await flowDynamic([
        `🛒 *¡Perfecto! Vamos a hacer tu pedido*`,
        ``,
        `🎯 *Primero, ¿qué USB te interesa?*`,
        ``,
        `💚 *1. USB Musical Básica - $54.900*`,
        `• 8GB + música personalizada + diseño`,
        ``,
        `🧡 *2. USB Premium - $84.900* ⭐ MÁS POPULAR`,
        `• 32GB + playlist curada + diseño 3D + estuche`,
        ``,
        `❤️ *3. USB VIP - $119.900* 👑 MEJOR VALOR`,
        `• 64GB + pack completo + diseño premium + accesorios`,
        ``,
        `💜 *4. USB Mega - $159.900* 🚀 EXPERIENCIA COMPLETA`,
        `• 128GB + biblioteca musical + diseño holográfico + servicio VIP`,
        ``,
        `🎨 *5. USB Personalizada Completa*`,
        `• Totalmente customizada según tus gustos`,
        ``,
        `💬 *Escribe el número de tu elección (1, 2, 3, 4 o 5)*`
    ]);

    await updateSessionSafely(ctx.from, {
        stage: 'selecting_product_for_order',
        orderData: {
            items: [],
            step: 'selecting_product',
            startedAt: new Date(),
            status: 'draft'
        }
    }, 'orderFlow');
}

async function handleProductSelection(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    userInput: string, 
    gotoFlow: any
): Promise<void> {
    const option = userInput.trim();
    const products = {
     '1': { id:'usb_basic', name:'USB Musical Básica', capacity:'8GB', price: 54900 },
     '2': { id:'usb_premium', name:'USB Premium Personalizada', capacity:'32GB', price: 84900 },
     '3': { id:'usb_vip', name:'USB VIP Completa', capacity:'64GB', price: 119900 },
     '4': { id:'usb_mega', name:'USB Mega Colección', capacity:'128GB', price: 159900 }
    };

    if (option === '5') {
        await flowDynamic([
            `🎨 *¡Excelente elección!*`,
            `Te voy a dirigir a nuestro estudio de personalización completa donde podrás crear una USB 100% única.`,
            `🚀 *Redirigiendo...*`
        ]);
        return gotoFlow(customizationFlow);
    }

    const selectedProduct = products[option as keyof typeof products];
    
    if (selectedProduct) {
        await flowDynamic([
            `✅ *¡Excelente elección!*`,
            `🎵 *Producto seleccionado:*`,
            `• ${selectedProduct.name}`,
            `• Capacidad: ${selectedProduct.capacity}`,
            `• Precio: $${selectedProduct.price.toLocaleString()}`,
            `🎁 *INCLUYE GRATIS:*`,
            `• Diseño personalizado`,
            `• Playlist curada`,
            `• Envío a domicilio`,
            `• Garantía completa`,
            `👤 *Ahora necesito tu información de contacto:*`,
            `💬 *¿Cuál es tu nombre completo?*`
        ]);

        await updateSessionSafely(ctx.from, {
            selectedProduct: selectedProduct,
            orderData: {
                items: [createOrderItem(
                    selectedProduct.id,
                    selectedProduct.name,
                    selectedProduct.price
                )],
                type: 'standard',
                product: selectedProduct,
                totalPrice: selectedProduct.price,
                step: 'collecting_name',
                startedAt: new Date(),
                status: 'draft'
            }
        }, 'orderFlow');
    } else {
        await flowDynamic([
            `❌ *Opción no válida*`,
            `💡 *Por favor elige una opción válida:*`,
            `• *1* para USB Musical Básica ($54.900)`,
            `• *2* para USB Premium ($84.900)`,
            `• *3* para USB VIP ($119.900)`,
            `• *4* para USB Mega ($159.900)`,
            `• *5* para USB Personalizada Completa`,
            `💬 *¿Cuál eliges?*`
        ]);
    }
}

async function handleNameCollection(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    userInput: string
): Promise<void> {
    
    const name = userInput.trim();
    
    if (name.length < 2) {
        await flowDynamic([
            `💡 *Por favor ingresa tu nombre completo*`,
            ``,
            `Ejemplo: "Juan Pérez" o "María González"`,
            ``,
            `💬 *Tu nombre completo:*`
        ]);
        return;
    }

    const session = await getUserSession(ctx.from);
    
    await flowDynamic([
        `👋 *¡Hola ${name}!*`,
        ``,
        `📱 *Ahora necesito tu número de teléfono para coordinar la entrega:*`,
        ``,
        `💡 *Formato:* 3001234567 (sin espacios ni guiones)`,
        ``,
        `💬 *Tu número de teléfono:*`
    ]);

    await updateSessionSafely(ctx.from, {
        orderData: {
            ...session.orderData,
            items: (session.orderData?.items || []),
            customerInfo: {
                ...(session.orderData as any)?.customerInfo,
                name: name
            },
            step: 'collecting_phone'
        }
    }, 'orderFlow');
}

async function handlePhoneCollection(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    userInput: string
): Promise<void> {
    
    const phone = userInput.trim().replace(/\D/g, '');
    
    if (phone.length < 10 || !phone.startsWith('3')) {
        await flowDynamic([
            `❌ *Número de teléfono no válido*`,
            ``,
            `💡 *Por favor ingresa un número colombiano válido:*`,
            `• Debe empezar con 3`,
            `• Debe tener 10 dígitos`,
            `• Ejemplo: 3001234567`,
            ``,
            `💬 *Tu número de teléfono:*`
        ]);
        return;
    }

    const session = await getUserSession(ctx.from);
    
    await flowDynamic([
        `✅ *Teléfono confirmado:* ${phone}`,
        ``,
        `📍 *Ahora necesito tu dirección de entrega:*`,
        ``,
        `💡 *Por favor incluye:*`,
        `• Ciudad`,
        `• Dirección completa`,
        `• Barrio o referencias`,
        ``,
        `📝 *Ejemplo:*`,
        `"Bogotá, Calle 123 #45-67, Barrio Chapinero, frente al parque"`,
        ``,
        `💬 *Tu dirección completa:*`
    ]);

    await updateSessionSafely(ctx.from, {
        orderData: {
            ...session.orderData,
            customerInfo: {
                ...(session.orderData as any)?.customerInfo,
                phone: phone,
            },
            step: 'collecting_address',
            items: (session.orderData.items || []),
        }
    }, 'orderFlow');
}

async function handleAddressCollection(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    userInput: string
): Promise<void> {
    
    const address = userInput.trim();
    
    if (address.length < 10) {
        await flowDynamic([
            `💡 *Por favor proporciona una dirección más completa*`,
            ``,
            `📍 *Necesito:*`,
            `• Ciudad`,
            `• Dirección con número`,
            `• Barrio o referencias`,
            ``,
            `💬 *Tu dirección completa:*`
        ]);
        return;
    }

    const session = await getUserSession(ctx.from);
    
    await flowDynamic([
        `✅ *Dirección confirmada*`,
        ``,
        `💳 *Último paso: Método de pago*`,
        ``,
        `💰 *Opciones disponibles:*`,
        ``,
        `*1. Transferencia Bancaria* 💳`,
        `• Descuento del 5%`,
        `• Pago inmediato`,
        `• Te enviamos datos bancarios`,
        ``,
        `*2. Nequi/Daviplata* 📱`,
        `• Pago rápido y seguro`,
        `• Sin descuentos adicionales`,
        `• Confirmación inmediata`,
        ``,
        `*3. Efectivo Contra Entrega* 💵`,
        `• Pagas al recibir tu USB`,
        `• Recargo del 5% por servicio`,
        `• Disponible en ciudades principales`,
        ``,
        `*4. Tarjeta de Crédito* 💳`,
        `• Hasta 3 cuotas sin interés`,
        `• Pago seguro online`,
        `• Procesamiento inmediato`,
        ``,
        `💬 *¿Cuál método prefieres? (1, 2, 3 o 4)*`
    ]);

    await updateSessionSafely(ctx.from, {
        orderData: {
            ...session.orderData,
            customerInfo: {
                ...(session.orderData as any)?.customerInfo,
                address: address
            },
            step: 'collecting_payment',
            items: (session.orderData.items || []),
        }
    }, 'orderFlow');
}

async function handlePaymentSelection(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    userInput: string
): Promise<void> {
    
    const paymentOption = userInput.trim();
    const paymentMethods = {
        '1': { name: 'Transferencia Bancaria', discount: 0.05, surcharge: 0 },
        '2': { name: 'Nequi/Daviplata', discount: 0, surcharge: 0 },
        '3': { name: 'Efectivo Contra Entrega', discount: 0, surcharge: 0.05 },
        '4': { name: 'Tarjeta de Crédito', discount: 0, surcharge: 0 }
    };

    const selectedPayment = paymentMethods[paymentOption as keyof typeof paymentMethods];
    
    if (!selectedPayment) {
        await flowDynamic([
            `❌ *Opción no válida*`,
            ``,
            `💡 *Por favor elige una opción válida:*`,
            `• *1* para Transferencia Bancaria`,
            `• *2* para Nequi/Daviplata`,
            `• *3* para Efectivo Contra Entrega`,
            `• *4* para Tarjeta de Crédito`,
            ``,
            `💬 *¿Cuál método prefieres?*`
        ]);
        return;
    }

    const session = await getUserSession(ctx.from);
    const basePrice = (session.orderData as any)?.totalPrice || 0;
    const discount = basePrice * selectedPayment.discount;
    const surcharge = basePrice * selectedPayment.surcharge;
    const finalPrice = basePrice - discount + surcharge;

    await flowDynamic([
        `📋 *RESUMEN FINAL DE TU PEDIDO*`,
        ``,
        `👤 *Cliente:* ${(session.orderData as any)?.customerInfo?.name}`,
        `📱 *Teléfono:* ${(session.orderData as any)?.customerInfo?.phone}`,
        `📍 *Dirección:* ${(session.orderData as any)?.customerInfo?.address}`,
        ``,
        `🎵 *Producto:*`,
        (session.orderData as any)?.type === 'customized' ? 
            `• USB Personalizada Completa` :
            `• ${(session.orderData as any)?.product?.name} (${(session.orderData as any)?.product?.capacity})`,
        ``,
        `💰 *Desglose de precio:*`,
        `• Precio base: $${basePrice.toLocaleString()}`,
        discount > 0 ? `• Descuento (${(selectedPayment.discount * 100)}%): -$${discount.toLocaleString()}` : '',
        surcharge > 0 ? `• Recargo por servicio (${(selectedPayment.surcharge * 100)}%): +$${surcharge.toLocaleString()}` : '',
        `• *TOTAL A PAGAR: $${finalPrice.toLocaleString()}*`,
        ``,
        `💳 *Método de pago:* ${selectedPayment.name}`,
        ``,
        `🚀 *Tiempo de entrega:*`,
        (session.orderData as any)?.type === 'customized' && session.customization?.preferences?.accessories?.hasExpress ?
            `• 24-48 horas (Servicio Express)` :
            (session.orderData as any)?.type === 'customized' ?
                `• 3-5 días hábiles (Personalizada)` :
                `• 24-48 horas (Estándar)`,
        ``,
        `🎁 *INCLUYE GRATIS:*`,
        `• Diseño personalizado`,
        `• Playlist curada`,
        `• Envío a domicilio`,
        `• Garantía de satisfacción`,
        `• Soporte técnico`,
        ``,
        `✅ *¿CONFIRMAS TU PEDIDO?*`,
        ``,
        `💬 *Escribe:*`,
        `• "*SÍ*" o "*CONFIRMAR*" para proceder`,
        `• "*MODIFICAR*" si quieres cambiar algo`,
        `• "*CANCELAR*" si prefieres no continuar`
    ].filter(Boolean));

    await updateSessionSafely(ctx.from, {
        orderData: {
            ...session.orderData,
            items: session.orderData?.items || [],
            paymentMethod: selectedPayment,
            finalPrice: finalPrice,
            discount: discount,
            surcharge: surcharge,
            step: 'confirming_order'
        }
    }, 'orderFlow');
}

async function handleOrderConfirmation(
    ctx: ExtendedContext, 
    flowDynamic: any, 
    gotoFlow: any, 
    userInput: string
): Promise<void> {
    
    const response = userInput.toLowerCase().trim();
    
    if (response.includes('sí') || response.includes('si') || response.includes('confirmar')) {
        await processOrderConfirmation(ctx, flowDynamic);
    } else if (response.includes('modificar')) {
        await flowDynamic([
            `🔄 *¿Qué te gustaría modificar?*`,
            ``,
            `💡 *Puedes cambiar:*`,
            `• "*producto*" - Cambiar USB seleccionada`,
            `• "*dirección*" - Modificar dirección de entrega`,
            `• "*pago*" - Cambiar método de pago`,
            `• "*todo*" - Empezar de nuevo`,
            ``,
            `💬 *¿Qué quieres modificar?*`
        ]);
    } else if (response.includes('cancelar')) {
        await flowDynamic([
            `😊 *No hay problema, entiendo perfectamente.*`,
            ``,
            `🎵 *Tu información no se ha guardado y no tienes ningún compromiso.*`,
            ``,
            `💡 *Si cambias de opinión:*`,
            `• Escribe "*catálogo*" para ver opciones`,
            `• Escribe "*personalizar*" para crear tu USB única`,
            `• Escribe "*pedido*" para hacer un nuevo pedido`,
            ``,
            `💬 *¡Estoy aquí cuando me necesites!*`,
            ``,
            `🎯 *¿Te puedo ayudar con algo más?*`
        ]);
        
        await updateSessionSafely(ctx.from, {
            stage: 'conversation',
            orderData: {
                items: [],
                status: 'cancelled'
            }
        }, 'orderFlow');
    } else {
        await flowDynamic([
            `💡 *Por favor confirma tu decisión:*`,
            ``,
            `💬 *Escribe:*`,
            `• "*SÍ*" o "*CONFIRMAR*" para proceder con el pedido`,
            `• "*MODIFICAR*" si quieres cambiar algo`,
            `• "*CANCELAR*" si prefieres no continuar`,
            ``,
            `❓ *¿Qué decides?*`
        ]);
    }
}

async function processOrderConfirmation(
    ctx: ExtendedContext, 
    flowDynamic: any
): Promise<void> {
    const session = await getUserSession(ctx.from);
    const orderData = session.orderData as OrderData;
    
    if (!orderData) {
        await flowDynamic(['❌ *Error:* No se encontraron datos del pedido']);
        return;
    }
    
    const orderNumber = `TechAura-${Date.now().toString().slice(-6)}`;
    
    await flowDynamic([
        `🎉 *¡PEDIDO CONFIRMADO EXITOSAMENTE!*`,
        `📋 *Número de pedido:* ${orderNumber}`,
        `✅ *Tu pedido ha sido registrado y está en proceso.*`,
        `📱 *Próximos pasos:*`,
        `⏰ *En los próximos 30 minutos:*`,
        `• Recibirás confirmación por WhatsApp`,
        orderData.paymentMethod?.name === 'Transferencia Bancaria' ? 
            `• Te enviaremos los datos bancarios para el pago` :
            orderData.paymentMethod?.name === 'Tarjeta de Crédito' ?
                `• Te enviaremos el link de pago seguro` : 
                `• Te confirmaremos los detalles de pago`,
        `🎨 *En las próximas 2-4 horas:*`,
        `• Te enviamos preview del diseño personalizado`,
        `• Puedes solicitar ajustes si es necesario`,
        orderData.type === 'customized' && session.customization?.preferences?.accessories?.hasExpress ?
            `⚡ *En 24-48 horas:* Tu USB estará lista y en camino` :
            orderData.type === 'customized' ?
                `🚀 *En 3-5 días:* Tu USB personalizada estará lista` :
                `🚀 *En 24-48 horas:* Tu USB estará lista y en camino`,
        `📞 *Contacto directo:*`,
        `• WhatsApp: Este mismo número`,
        `• Seguimiento en tiempo real`,
        `• Soporte 24/7`,
        `🎁 *BONUS ESPECIAL:*`,
        `Como nuevo cliente de TechAura, tendrás:`,
        `• 15% de descuento en tu próxima compra`,
        `• Acceso VIP a nuevos productos`,
        `• Playlist mensual gratis por 3 meses`,
        `💝 *¡Gracias por confiar en TechAura!*`,
        `🎵 *Tu USB personalizada será increíble, estamos emocionados de crearla para ti.*`,
        `💬 *¿Tienes alguna pregunta sobre tu pedido?*`
    ].filter(Boolean));

    await updateSessionSafely(ctx.from, {
        stage: 'order_confirmed',
        totalOrders: (session.totalOrders || 0) + 1,
        orderData: {
            ...orderData,
            orderNumber: orderNumber,
            confirmedAt: new Date(),
            status: 'confirmed'
        }
    }, 'orderFlow');

    console.log(`✅ Pedido confirmado: ${orderNumber} - Cliente: ${orderData.customerInfo?.name} - Total: $${orderData.finalPrice || orderData.totalPrice}`);
    
    // 🔔 TRIGGER NOTIFICATION: Order Created (for this confirmation flow)
    await orderEventEmitter.onOrderCreated(
        orderNumber,
        ctx.from,
        orderData.customerInfo?.name,
        undefined, // email not in this flow
        {
            items: orderData.items,
            total: orderData.finalPrice || orderData.totalPrice,
            paymentMethod: orderData.paymentMethod?.name,
            type: orderData.type,
            status: 'confirmed'
        }
    );
}

// ============== BURNING CONFIRMATION FUNCTIONS ==============

/**
 * Show burning confirmation summary before starting automatic USB recording
 * This function displays all order details and asks for final confirmation
 */
async function showBurningConfirmation(
    ctx: { from: string; body?: string; [key: string]: any },
    flowDynamic: any,
    orderData: {
        orderNumber?: string;
        productType?: string;
        capacity?: string;
        customization?: {
            genres?: string[];
            artists?: string[];
        };
    }
): Promise<void> {
    const productTypeDisplay = orderData.productType === 'music' 
        ? 'Música' 
        : orderData.productType === 'videos' 
            ? 'Videos' 
            : 'Videos/Películas';

    const contentLines: string[] = [];
    
    if (orderData.customization?.genres?.length) {
        contentLines.push(`• Géneros: ${orderData.customization.genres.join(', ')}`);
    }
    if (orderData.customization?.artists?.length) {
        contentLines.push(`• Artistas: ${orderData.customization.artists.join(', ')}`);
    }
    if (contentLines.length === 0) {
        contentLines.push('• Contenido variado según preferencias');
    }

    await flowDynamic([{
        body: [
            '📋 *RESUMEN PARA GRABACIÓN USB*',
            '',
            `🎵 *Tipo:* ${productTypeDisplay}`,
            `💾 *Capacidad:* ${orderData.capacity || 'N/A'}`,
            '',
            '🎶 *Contenido seleccionado:*',
            ...contentLines,
            '',
            '⚠️ *Por favor verifica que todo esté correcto*',
            '',
            '✅ Escribe "*GRABAR*" para iniciar la grabación automática',
            '❌ Escribe "*MODIFICAR*" para hacer cambios',
            '🔄 Escribe "*AGREGAR*" para añadir más contenido'
        ].join('\n')
    }]);

    // Update session to burning confirmation step
    await updateUserSession(
        ctx.from,
        'Esperando confirmación de grabación',
        'orderFlow',
        'awaiting_burning_confirmation',
        false,
        { metadata: { orderNumber: orderData.orderNumber } }
    );
}

/**
 * Handle burning confirmation responses
 * Processes user input: GRABAR, MODIFICAR, or AGREGAR
 * 
 * Edge cases handled:
 * - Order already processed
 * - Empty content
 * - Max retries for invalid responses
 * - Session timeout state persistence
 */
async function handleBurningConfirmationResponse(
    ctx: { from: string; body?: string; [key: string]: any },
    flowDynamic: any,
    gotoFlow: any,
    userInput: string
): Promise<{ handled: boolean; action?: string }> {
    const response = userInput.toUpperCase().trim();
    const session = await getUserSession(ctx.from);
    
    // Get order data from session
    const orderData = session.orderData;
    const conversationData = session.conversationData || {};
    const customization = session.customization || {};
    
    if (response === 'GRABAR' || response.includes('GRABAR')) {
        // User confirmed - add to burning queue and change status
        unifiedLogger.info('flow', 'User confirmed burning', { phone: ctx.from });
        
        const orderNumber = orderData?.orderNumber || conversationData?.orderNumber || `TechAura-${Date.now().toString().slice(-6)}`;
        
        try {
            // Edge case: Check if order was already processed
            const existingQueueItem = await burningQueueService.getByOrderNumber(orderNumber);
            if (existingQueueItem) {
                if (existingQueueItem.status === 'completed') {
                    // Order already completed
                    unifiedLogger.warn('flow', 'Order already completed', { orderNumber, phone: ctx.from });
                    await flowDynamic([{
                        body: [
                            '✅ *¡Este pedido ya fue procesado!*',
                            '',
                            `📋 *Pedido:* ${orderNumber}`,
                            `📊 *Estado:* Completado`,
                            '',
                            'Tu USB ya fue grabada exitosamente.',
                            '',
                            '¿Necesitas algo más? Escribe *MENU* para ver opciones.'
                        ].join('\n')
                    }]);
                    resetInvalidResponseCount(ctx.from);
                    clearSessionState(ctx.from);
                    return { handled: true, action: 'already_completed' };
                }
                
                if (existingQueueItem.status === 'burning') {
                    // Order is currently being processed
                    unifiedLogger.warn('flow', 'Order currently being processed', { orderNumber, phone: ctx.from });
                    await flowDynamic([{
                        body: [
                            '🔄 *¡Tu pedido está en proceso de grabación!*',
                            '',
                            `📋 *Pedido:* ${orderNumber}`,
                            `📊 *Estado:* Grabando...`,
                            '',
                            'Te notificaremos cuando esté listo.',
                            '📱 Recibirás un mensaje cuando finalice.'
                        ].join('\n')
                    }]);
                    return { handled: true, action: 'already_burning' };
                }
                
                if (existingQueueItem.status === 'queued') {
                    // Order is already in queue
                    unifiedLogger.info('flow', 'Order already queued', { orderNumber, phone: ctx.from });
                    await flowDynamic([{
                        body: [
                            '📋 *Tu pedido ya está en la cola de grabación*',
                            '',
                            `📋 *Pedido:* ${orderNumber}`,
                            `📊 *Estado:* En cola`,
                            '',
                            'Te notificaremos cuando inicie la grabación.',
                            '⏰ Tiempo estimado: 15-30 minutos'
                        ].join('\n')
                    }]);
                    return { handled: true, action: 'already_queued' };
                }
            }
            
            // Edge case: Check for empty content
            const genres = conversationData?.selectedGenres || customization?.genres || [];
            const artists = conversationData?.selectedArtists || customization?.artists || [];
            
            if (genres.length === 0 && artists.length === 0) {
                unifiedLogger.warn('flow', 'Empty content for burning', { orderNumber, phone: ctx.from });
                await flowDynamic([{
                    body: [
                        '⚠️ *No hay contenido seleccionado*',
                        '',
                        'No puedo iniciar la grabación sin contenido.',
                        '',
                        'Por favor, selecciona al menos:',
                        '• Géneros musicales, o',
                        '• Artistas específicos',
                        '',
                        '🔄 Escribe *AGREGAR* para añadir contenido.'
                    ].join('\n')
                }]);
                return { handled: true, action: 'empty_content' };
            }
            
            // Save session state for timeout recovery
            saveSessionState(ctx.from, orderNumber, 'ready_for_burning', orderData);
            
            // Add to burning queue with ready_for_burning status
            await burningQueueService.addToQueue({
                orderId: orderNumber,
                orderNumber: orderNumber,
                customerPhone: ctx.from,
                contentType: (conversationData?.productType || orderData?.productType || 'music') as 'music' | 'videos' | 'movies',
                capacity: conversationData?.selectedCapacity || orderData?.selectedCapacity || '8GB',
                customization: {
                    genres,
                    artists
                },
                priority: 'normal'
            });

            // Confirm for burning
            await burningQueueService.confirmForBurning(orderNumber);

            // Update session status
            await updateUserSession(
                ctx.from,
                'Grabación confirmada',
                'orderFlow',
                'ready_for_burning',
                false,
                { metadata: { orderNumber, burningStatus: 'queued' } }
            );
            
            // Reset invalid response count on success
            resetInvalidResponseCount(ctx.from);
            // Clear session state backup on success
            clearSessionState(ctx.from);

            await flowDynamic([{
                body: [
                    '🔥 *¡GRABACIÓN CONFIRMADA!*',
                    '',
                    `📋 *Pedido:* ${orderNumber}`,
                    '',
                    '✅ Tu USB ha sido agregada a la cola de grabación',
                    '⏰ Tiempo estimado de procesamiento: 15-30 minutos',
                    '',
                    '📱 Te enviaremos notificaciones del progreso:',
                    '• 🔄 Cuando inicie la grabación',
                    '• 📊 Actualizaciones de progreso',
                    '• ✅ Cuando esté lista',
                    '',
                    '¡Gracias por tu paciencia! 🎵'
                ].join('\n')
            }]);

            // Send burning started notification
            await whatsappNotifications.sendBurningStartedNotification({
                orderNumber,
                phoneNumber: ctx.from,
                productType: conversationData?.productType || orderData?.productType,
                capacity: conversationData?.selectedCapacity || orderData?.selectedCapacity
            });

        } catch (error) {
            unifiedLogger.error('flow', 'Error processing burning confirmation', { 
                phone: ctx.from,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            await flowDynamic([{
                body: '❌ Hubo un problema confirmando tu grabación. Por favor, intenta nuevamente o contacta soporte.'
            }]);
        }

        return { handled: true, action: 'grabar' };

    } else if (response === 'MODIFICAR' || response.includes('MODIFICAR')) {
        // User wants to modify - go back to customization
        unifiedLogger.info('flow', 'User wants to modify order', { phone: ctx.from });
        
        // Reset invalid response count
        resetInvalidResponseCount(ctx.from);
        
        await flowDynamic([{
            body: [
                '🔄 *MODIFICAR PEDIDO*',
                '',
                '¿Qué te gustaría cambiar?',
                '',
                '1️⃣ *Géneros musicales* - Cambiar los géneros',
                '2️⃣ *Artistas* - Cambiar artistas específicos',
                '3️⃣ *Capacidad USB* - Cambiar el tamaño',
                '4️⃣ *Todo* - Empezar la personalización de nuevo',
                '',
                '💬 Escribe el número de tu elección o describe qué quieres cambiar:'
            ].join('\n')
        }]);

        await updateUserSession(
            ctx.from,
            'Modificando pedido',
            'orderFlow',
            'modifying_order',
            false,
            {}
        );

        return { handled: true, action: 'modificar' };

    } else if (response === 'AGREGAR' || response.includes('AGREGAR')) {
        // User wants to add more content
        unifiedLogger.info('flow', 'User wants to add more content', { phone: ctx.from });
        
        // Reset invalid response count
        resetInvalidResponseCount(ctx.from);
        
        await flowDynamic([{
            body: [
                '➕ *AGREGAR CONTENIDO*',
                '',
                '¿Qué te gustaría agregar?',
                '',
                '🎵 *Para agregar géneros:*',
                'Escribe los géneros separados por coma',
                'Ejemplo: "Rock, Pop, Salsa"',
                '',
                '🎤 *Para agregar artistas:*',
                'Escribe "artistas:" seguido de los nombres',
                'Ejemplo: "artistas: Shakira, Bad Bunny, Coldplay"',
                '',
                '💬 ¿Qué deseas agregar?'
            ].join('\n')
        }]);

        await updateUserSession(
            ctx.from,
            'Agregando contenido',
            'orderFlow',
            'adding_content',
            false,
            {}
        );

        return { handled: true, action: 'agregar' };
    }

    // Not a recognized burning confirmation command - handle invalid response
    const { exceeded, count } = checkInvalidResponseLimit(ctx.from);
    
    if (exceeded) {
        // Max retries exceeded
        unifiedLogger.warn('flow', 'Max invalid response retries exceeded', { 
            phone: ctx.from, 
            count,
            maxRetries: USB_INTEGRATION.MAX_INVALID_RESPONSE_RETRIES
        });
        
        // Save state for potential recovery
        const orderNumber = orderData?.orderNumber || conversationData?.orderNumber;
        if (orderNumber) {
            saveSessionState(ctx.from, orderNumber, 'awaiting_burning_confirmation', orderData);
        }
        
        // Reset counter
        resetInvalidResponseCount(ctx.from);
        
        await flowDynamic([{
            body: [
                '⚠️ *Múltiples intentos sin respuesta válida*',
                '',
                'Parece que estás teniendo dificultades.',
                'Tu sesión ha sido guardada.',
                '',
                '📞 *Opciones:*',
                '• Escribe *MENU* para ver el menú principal',
                '• Escribe *AYUDA* para contactar soporte',
                '• Vuelve a intentar más tarde',
                '',
                'Tu pedido no se ha perdido. Puedes retomarlo cuando gustes.'
            ].join('\n')
        }]);
        
        return { handled: true, action: 'max_retries_exceeded' };
    }
    
    // Provide helpful guidance on invalid response
    const remainingAttempts = USB_INTEGRATION.MAX_INVALID_RESPONSE_RETRIES - count;
    
    unifiedLogger.info('flow', 'Invalid burning confirmation response', { 
        phone: ctx.from, 
        response: response.substring(0, 50),
        invalidCount: count,
        remainingAttempts
    });
    
    await flowDynamic([{
        body: [
            '❓ *No entendí tu respuesta*',
            '',
            'Por favor, escribe una de las siguientes opciones:',
            '',
            '✅ *GRABAR* - Confirmar e iniciar la grabación',
            '❌ *MODIFICAR* - Cambiar los detalles del pedido',
            '➕ *AGREGAR* - Añadir más contenido',
            '',
            `⚠️ Intentos restantes: ${remainingAttempts}`
        ].join('\n')
    }]);

    return { handled: false };
}

/**
 * Handle adding more content to an order
 */
async function handleAddingContent(
    ctx: { from: string; body?: string; [key: string]: any },
    flowDynamic: any,
    userInput: string
): Promise<void> {
    const session = await getUserSession(ctx.from);
    const conversationData = session.conversationData || {};
    
    const input = userInput.trim();
    const isArtists = input.toLowerCase().startsWith('artistas:');
    
    if (isArtists) {
        // Adding artists
        const artistsText = input.replace(/^artistas:/i, '').trim();
        const newArtists = artistsText.split(',').map(a => a.trim()).filter(a => a.length > 0);
        
        const existingArtists = conversationData.selectedArtists || [];
        const allArtists = [...new Set([...existingArtists, ...newArtists])];
        
        // Update session with new artists
        await updateUserSession(
            ctx.from,
            'Artistas agregados',
            'orderFlow',
            'content_added',
            false,
            { 
                metadata: { 
                    selectedArtists: allArtists,
                    addedArtists: newArtists 
                } 
            }
        );

        await flowDynamic([{
            body: [
                '✅ *Artistas agregados:*',
                newArtists.map(a => `• ${a}`).join('\n'),
                '',
                '*Artistas totales en tu USB:*',
                allArtists.map(a => `• ${a}`).join('\n'),
                '',
                '¿Deseas agregar más contenido o confirmar la grabación?',
                '',
                '✅ Escribe "*GRABAR*" para confirmar',
                '➕ Escribe más géneros o artistas para agregar'
            ].join('\n')
        }]);
    } else {
        // Adding genres
        const newGenres = input.split(',').map(g => g.trim()).filter(g => g.length > 0);
        
        const existingGenres = conversationData.selectedGenres || [];
        const allGenres = [...new Set([...existingGenres, ...newGenres])];
        
        // Update session with new genres
        await updateUserSession(
            ctx.from,
            'Géneros agregados',
            'orderFlow',
            'content_added',
            false,
            { 
                metadata: { 
                    selectedGenres: allGenres,
                    addedGenres: newGenres 
                } 
            }
        );

        await flowDynamic([{
            body: [
                '✅ *Géneros agregados:*',
                newGenres.map(g => `• ${g}`).join('\n'),
                '',
                '*Géneros totales en tu USB:*',
                allGenres.map(g => `• ${g}`).join('\n'),
                '',
                '¿Deseas agregar más contenido o confirmar la grabación?',
                '',
                '✅ Escribe "*GRABAR*" para confirmar',
                '➕ Escribe más géneros o "artistas:" para agregar artistas'
            ].join('\n')
        }]);
    }
}

// Export burning confirmation functions for use in other modules
export { 
    showBurningConfirmation, 
    handleBurningConfirmationResponse, 
    handleAddingContent 
};

export default orderFlow;
