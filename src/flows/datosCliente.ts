 // ====== SEPARADOR: flows/datosCliente.ts - INICIO ======

import { addKeyword, EVENTS } from '@builderbot/bot';
import { contextAnalyzer } from '../services/contextAnalyzer';
import { dataCollectionMiddleware } from '../middlewares/contextMiddleware';
import orderFlow from './orderFlow';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import { crossSellSystem } from '../services/crossSellSystem';
import { slotExtractor } from '../core/SlotExtractor';
import { shippingValidators } from '../core/validators/shipping';
import { orderEventEmitter } from '../services/OrderEventEmitter';
import { generateOrderNumber } from '../utils/orderUtils';
import { onShippingConfirmed } from '../services/followupSuppression';
import type { ExtractionResult } from '../core/SlotExtractor';

// Constants
const SHIPPING_DATA_CONFIDENCE_THRESHOLD = 0.7; // Minimum average confidence for auto-confirmation

const shouldOfferCrossSell = (session: any) => {
if (!session) return false;
if (session.stage === 'converted') return false;
if (session.tags?.includes('blacklist')) return false;
const last = session.conversationData?.crossSellOfferedAt ? new Date(session.conversationData.crossSellOfferedAt).getTime() : 0;
return !last || (Date.now() - last) > 24 * 60 * 60 * 1000;
};

const markCrossSellOffered = async (phone: string, session: any) => {
session.conversationData = session.conversationData || {};
session.conversationData.crossSellOfferedAt = new Date().toISOString();
await updateUserSession(phone, 'cross-sell-offered', 'datosCliente', 'post_payment_cross_sell', false, {
metadata: { crossSellOfferedAt: session.conversationData.crossSellOfferedAt }
});
};

const formatCOP = (v: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);
const formatSuggestion = (p: any) => `➕ Sugerencia: ${p.name}\n💰 ${formatCOP(p.price)}\n${p.short || p.description || ''}\nResponde: "AÑADIR ${p.id}" o "VER MÁS"`;

const validateDataContext = async (phoneNumber: string, message: string): Promise<boolean> => {
    const analysis = await contextAnalyzer.analyzeContext(phoneNumber, message, 'datosCliente');

    if (analysis.currentContext === 'collecting_customer_data' ||
        analysis.currentContext === 'datosCliente') {
        return true;
    }

    return false;
};

// Array de productos adicionales con enlaces de imágenes
const additionalProducts = [
    { name: 'Audífonos Bluetooth Premium', price: '$39.900', img: 'https://i.imgur.com/audifonos.jpg', description: '🎧 Sonido HD con cancelación de ruido - ¡Perfectos para disfrutar tu música!' },
    { name: 'Cargador Rápido 65W', price: '$29.900', img: 'https://i.imgur.com/cargadores.jpg', description: '⚡ Carga ultra rápida - Tu dispositivo al 100% en minutos' },
    { name: 'Soporte Ajustable Pro', price: '$19.900', img: 'https://i.imgur.com/soportes.jpg', description: '📱 Diseño ergonómico - Compatible con todos los modelos' },
    { name: 'Power Bank 20000mAh', price: '$49.900', img: 'https://i.imgur.com/powerbanks.jpg', description: '🔋 Carga portátil - Hasta 5 cargas completas para tu teléfono' },
    { name: 'Cable USB-C Reforzado', price: '$9.900', img: 'https://i.imgur.com/cables.jpg', description: '🔌 Ultra resistente - Garantía de 2 años' }
];

// Función para seleccionar productos aleatoriamente
const getRandomProducts = (count: number) => {
    const shuffled = [...additionalProducts].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

// Mapeo de palabras clave para reconocimiento de opciones
const keywordMapping: Record<string, number> = {
    // Opción 1 (8GB)
    '1': 1, 'uno': 1, '8': 1, '8gb': 1, '8 gb': 1, '1400': 1, '1,400': 1, '1.400': 1, '1400 canciones': 1, 'primera': 1, 'opcion 1': 1, 'opción 1': 1, '54': 1, '54900': 1, '54.900': 1,
    // Opción 2 (32GB)
    '2': 2, 'dos': 2, '32': 2, '32gb': 2, '32 gb': 2, '5000': 2, '5,000': 2, '5.000': 2, '5000 canciones': 2, 'segunda': 2, 'opcion 2': 2, 'opción 2': 2, '84': 2, '84900': 2, '84.900': 2,
    // Opción 3 (64GB)
    '3': 3, 'tres': 3, '64': 3, '64gb': 3, '64 gb': 3, '10000': 3, '10,000': 3, '10.000': 3, '10000 canciones': 3, 'tercera': 3, 'opcion 3': 3, 'opción 3': 3, '119': 3, '119900': 3, '119.900': 3,
    // Opción 4 (128GB)
    '4': 4, 'cuatro': 4, '128': 4, '128gb': 4, '128 gb': 4, '22000': 4, '22,000': 4, '22.000': 4, '22000 canciones': 4, 'cuarta': 4, 'opcion 4': 4, 'opción 4': 4, '159': 4, '159900': 4, '159.900': 4
};

// Opciones de USB disponibles
const usbOptions = {
    1: { capacity: '8GB', songs: '1,400 canciones', price: '$54.900', benefits: ['✅ Ideal para documentos importantes', '✅ Perfecta para estudiantes', '✅ Ultraportátil y práctica'] },
    2: { capacity: '32GB', songs: '5,000 canciones', price: '$84.900', benefits: ['⭐ Excelente relación calidad-precio', '⭐ Perfecta para profesionales', '⭐ Almacena presentaciones completas'] },
    3: { capacity: '64GB', songs: '10,000 canciones', price: '$119.900', benefits: ['🌟 Gran capacidad de almacenamiento', '🌟 Ideal para fotógrafos y diseñadores', '🌟 Transferencia a alta velocidad'] },
    4: { capacity: '128GB', songs: '22,000 canciones', price: '$159.900', benefits: ['💎 Máxima capacidad disponible', '💎 Para usuarios exigentes', '💎 Biblioteca multimedia completa'] }
};

// Flujo para la selección de capacidad de USB
const datosCliente = addKeyword(['datos_cliente_trigger'])
    .addAction(async (ctx, { flowDynamic, endFlow, gotoFlow }) => {
        try {
            console.log(`📋 [DATOS CLIENTE] Iniciando recolección de datos para ${ctx.from}`);

            // ✅ FIX: Check if data is already collected before asking
            const session = await getUserSession(ctx.from);
            const { getUserCollectedData } = await import('./userTrackingSystem');
            const collectedData = getUserCollectedData(session);
            
            // If we already have complete shipping and payment info, skip to order confirmation
            if (collectedData.hasShippingInfo && collectedData.hasPaymentInfo) {
                console.log(`✅ [DATOS CLIENTE] Data already complete for ${ctx.from}, skipping to order flow`);
                
                await flowDynamic([
                    {
                        body: `✅ *Ya tenemos tus datos confirmados:*\n\n` +
                              `👤 Nombre: ${collectedData.personalInfo?.name || collectedData.shippingInfo?.address ? 'Confirmado' : 'Pendiente'}\n` +
                              `📍 Dirección: ${collectedData.shippingInfo?.address || 'N/A'}\n` +
                              `🏙️ Ciudad: ${collectedData.shippingInfo?.city || 'N/A'}\n` +
                              `💳 Pago: ${collectedData.paymentMethod || 'Confirmado'}\n\n` +
                              `📦 Procesando tu pedido...`
                    }
                ]);
                
                return gotoFlow(orderFlow);
            }
            
            // If we have partial data, show what we have
            if (collectedData.hasShippingInfo || collectedData.hasPersonalInfo) {
                console.log(`⚠️ [DATOS CLIENTE] Partial data found for ${ctx.from}, asking for missing info only`);
            }

            await contextAnalyzer.markCriticalContext(ctx.from, 'collecting_customer_data', {
                step: 'name_collection',
                startedAt: new Date().toISOString()
            });

            await updateUserSession(
                ctx.from,
                'Iniciando recolección de datos',
                'datosCliente',
                'collecting_name',
                true
            );

            const userName = ctx.name || ctx.pushName || 'amigo';

            await flowDynamic([
                {
                    body: `🎯 *¡EXCELENTE DECISIÓN ${userName.toUpperCase()}!*\n\n` +
                          `Estás a solo unos pasos de tener tu USB personalizada 🚀\n\n` +
                          `📝 *Necesito confirmar algunos datos para procesar tu pedido:*\n\n` +
                          `👤 *¿Cuál es tu nombre completo?*\n\n` +
                          `💡 _Esto nos ayuda a personalizar tu experiencia y mantener un registro de tu pedido._`
                }
            ]);

        } catch (error) {
            console.error('❌ [DATOS CLIENTE] Error iniciando recolección:', error);
            await contextAnalyzer.clearCriticalContext(ctx.from);
            await flowDynamic([
                { body: `❌ Ups, hubo un error. Por favor, escribe "inicio" para comenzar de nuevo.` }
            ]);
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, fallBack, gotoFlow }) => {
        try {
            const messageText = ctx.body.trim();
            console.log(`👤 [DATOS CLIENTE] Mensaje recibido: "${messageText}"`);

            // ✨ SMART DETECTION: Try to extract complete shipping data from message using SlotExtractor
            const session = await getUserSession(ctx.from);
            const shippingDataMessages = session?.conversationData?.shippingDataMessages || [];
            shippingDataMessages.push(messageText);
            
            // Try to extract from current message first
            const extractionResult = slotExtractor.extractFromMessage(messageText);
            
            // If incomplete, merge with previously extracted data from session
            if (!slotExtractor.isComplete(extractionResult) && shippingDataMessages.length > 1) {
                // Get existing extracted data from session
                const existingData = session?.conversationData?.metadata?.pendingShippingData || {};
                
                // Convert existing data to slot format for merging
                const existingSlots: Record<string, string> = {};
                Object.entries(existingData).forEach(([key, slot]: [string, any]) => {
                    if (slot?.value) {
                        existingSlots[key] = slot.value;
                    }
                });
                
                // Merge new extraction with existing data
                extractionResult.slots = slotExtractor.mergeWithExisting(extractionResult.slots, existingSlots);
                
                // Recalculate completeness and confidence
                const filledSlots = Object.values(extractionResult.slots).filter(slot => slot !== undefined);
                const requiredFilled = ['name', 'phone', 'city', 'address'].filter(
                    slotName => extractionResult.slots[slotName as keyof typeof extractionResult.slots] !== undefined
                );
                extractionResult.completeness = requiredFilled.length / 4;
                extractionResult.confidence = filledSlots.length > 0
                    ? filledSlots.reduce((sum, slot) => sum + slot!.confidence, 0) / filledSlots.length
                    : 0;
                extractionResult.missingRequired = ['name', 'phone', 'city', 'address'].filter(
                    slotName => extractionResult.slots[slotName as keyof typeof extractionResult.slots] === undefined
                );
            }
            
            // Update session with accumulated messages and partial data
            await updateUserSession(
                ctx.from,
                messageText,
                'datosCliente',
                'collecting_data',
                true,
                {
                    metadata: {
                        shippingDataMessages,
                        pendingShippingData: extractionResult.slots,
                        extractionConfidence: extractionResult.confidence
                    }
                }
            );

            // If we have complete data with high confidence, auto-confirm
            if (slotExtractor.isComplete(extractionResult)) {
                if (extractionResult.confidence >= SHIPPING_DATA_CONFIDENCE_THRESHOLD) {
                    console.log(`✅ [DATOS CLIENTE] Datos completos detectados automáticamente`);
                    
                    // Convert extracted slots to validation format
                    const shippingData = {
                        name: extractionResult.slots.name?.value,
                        phone: extractionResult.slots.phone?.value,
                        city: extractionResult.slots.city?.value,
                        neighborhood: extractionResult.slots.neighborhood?.value,
                        address: extractionResult.slots.address?.value,
                        reference: extractionResult.slots.reference?.value,
                        paymentMethod: extractionResult.slots.paymentMethod?.value,
                        deliveryTime: extractionResult.slots.deliveryTime?.value
                    };
                    
                    // Validate the extracted data
                    const validation = shippingValidators.validateShippingData(shippingData);
                    
                    if (validation.valid) {
                        // Normalize the data
                        const normalized = shippingValidators.normalizeShippingData(shippingData);
                        
                        // Store complete customer data
                        const customerData = {
                            nombre: normalized.name,
                            telefono: normalized.phone,
                            direccion: normalized.address,
                            ciudad: normalized.city,
                            barrio: normalized.neighborhood,
                            referencia: normalized.reference,
                            metodoPago: normalized.paymentMethod,
                            horarioEntrega: normalized.deliveryTime
                        };

                        await updateUserSession(
                            ctx.from,
                            'Datos completos detectados',
                            'datosCliente',
                            'data_auto_detected',
                            false,
                            { metadata: { customerData } }
                        );

                        // Generate proper order number
                        const orderNumber = await generateOrderNumber();

                        // Emit shipping captured event
                        await orderEventEmitter.onShippingCaptured(
                            orderNumber,
                            ctx.from,
                            { ...customerData, completeness: extractionResult.completeness, confidence: extractionResult.confidence },
                            customerData.nombre
                        );

                        // ✅ CRITICAL: Cancel follow-ups when shipping data is auto-detected
                        try {
                            await onShippingConfirmed(ctx.from, {
                                orderId: orderNumber,
                                source: 'datosCliente_auto_detect'
                            });
                            console.log(`✅ [DATOS CLIENTE] Follow-ups cancelled for ${ctx.from} after shipping auto-detection`);
                        } catch (suppressionError) {
                            console.error('❌ [DATOS CLIENTE] Error cancelling follow-ups on auto-detect:', suppressionError);
                        }

                        // Show extracted data summary for confirmation
                        const summary = `👤 *Nombre:* ${normalized.name}\n` +
                                      `📱 *Teléfono:* ${normalized.phone}\n` +
                                      `📍 *Dirección:* ${normalized.address}\n` +
                                      `🏙️ *Ciudad:* ${normalized.city}` +
                                      (normalized.neighborhood ? `\n🏘️ *Barrio:* ${normalized.neighborhood}` : '') +
                                      (normalized.reference ? `\n📌 *Referencia:* ${normalized.reference}` : '');
                        
                        await flowDynamic([
                            {
                                body: `✨ *¡Perfecto! Detecté tus datos automáticamente:*\n\n` +
                                      `${summary}\n\n` +
                                      `💳 *¿Cuál será tu método de pago?*\n\n` +
                                      `Opciones disponibles:\n` +
                                      `• *Transferencia bancaria*\n` +
                                      `• *Nequi*\n` +
                                      `• *Daviplata*\n` +
                                      `• *Efectivo* (contra entrega)\n` +
                                      `• *Tarjeta de crédito/débito*\n\n` +
                                      `Escribe tu opción preferida:`
                            }
                        ]);
                        
                        // Skip to payment collection
                        return;
                    } else {
                        // Validation failed - emit event
                        const orderNumber = await generateOrderNumber();
                        await orderEventEmitter.onShippingValidationFailed(
                            orderNumber,
                            ctx.from,
                            validation.errors,
                            shippingData.name
                        );
                        
                        console.log(`❌ [DATOS CLIENTE] Validación fallida:`, validation.errors);
                        await flowDynamic([
                            {
                                body: `⚠️ *Encontré algunos problemas con los datos:*\n\n` +
                                      validation.errors.map(e => `• ${e}`).join('\n') +
                                      `\n\nPor favor, verifica y proporciona los datos correctos.`
                            }
                        ]);
                        return fallBack();
                    }
                }
            }

            // If we have partial data, prompt for missing fields
            if (extractionResult.missingRequired.length > 0 && extractionResult.missingRequired.length < 4) {
                console.log(`⚠️ [DATOS CLIENTE] Datos parciales detectados. Faltan: ${extractionResult.missingRequired.join(', ')}`);
                
                const missingMessage = slotExtractor.getMissingFieldsMessage(extractionResult);
                
                await flowDynamic([
                    {
                        body: `📝 Detecté algunos datos, pero necesito completar la información:\n\n` +
                              `${missingMessage}\n\n` +
                              `💡 _Puedes enviar todos los datos en un solo mensaje._`
                    }
                ]);
                
                return fallBack();
            }

            // Standard flow: treat as name if it looks like a name
            const nombre = messageText;

            if (!nombre || nombre.length < 2 || !/^[A-Za-zÀ-ÿ\s]{2,50}$/.test(nombre)) {
                console.log(`❌ [DATOS CLIENTE] Nombre inválido: "${nombre}"`);
                await flowDynamic([
                    {
                        body: `⚠️ Por favor, ingresa un nombre válido.\n\n` +
                              `Ejemplo: Juan Pérez\n\n` +
                              `💡 *También puedes enviar todos tus datos en un solo mensaje:*\n` +
                              `Nombre, Teléfono, Dirección, Ciudad\n\n` +
                              `👤 *¿Cuál es tu nombre completo?*`
                    }
                ]);
                return fallBack();
            }

            await updateUserSession(
                ctx.from,
                nombre,
                'datosCliente',
                'collecting_address',
                true,
                { metadata: { customerName: nombre } }
            );

            await flowDynamic([
                {
                    body: `✅ *Perfecto ${nombre}!*\n\n` +
                          `📍 *¿Cuál es tu dirección de entrega?*\n\n` +
                          `Por favor incluye:\n` +
                          `• Calle/Carrera y número\n` +
                          `• Barrio\n` +
                          `• Ciudad\n\n` +
                          `Ejemplo: Calle 123 #45-67, Barrio Centro, Bogotá\n\n` +
                          `🚚 _Esto nos permite calcular el tiempo y costo de envío._`
                }
            ]);

        } catch (error) {
            console.error('❌ [DATOS CLIENTE] Error capturando datos:', error);
            await flowDynamic([
                { body: `❌ Error procesando tus datos. Por favor, inténtalo nuevamente.` }
            ]);
            return fallBack();
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, fallBack }) => {
        try {
            const direccionCompleta = ctx.body.trim();
            console.log(`📍 [DATOS CLIENTE] Datos recibidos: "${direccionCompleta}"`);

            // Try to parse complete address: City, Department, Address
            const parts = direccionCompleta.split(/[,|]+/).map(p => p.trim());
            
            // Validación básica
            if (!direccionCompleta || direccionCompleta.length < 10) {
                console.log(`❌ [DATOS CLIENTE] Datos incompletos: "${direccionCompleta}"`);
                await flowDynamic([
                    {
                        body: `⚠️ Los datos parecen incompletos.\n\n` +
                              `Por favor, envía:\n` +
                              `• Ciudad\n` +
                              `• Departamento (opcional)\n` +
                              `• Dirección completa\n\n` +
                              `Ejemplo: Castilla La Nueva, Meta, Oficina Inter Rapidísimo\n\n` +
                              `📍 *¿Cuál es tu ciudad y dirección de entrega?*`
                    }
                ]);
                return fallBack();
            }

            // Obtener sesión y actualizar datos del cliente
            const session = await getUserSession(ctx.from);
            
            // Extract city, department, and address
            let city = '';
            let department = '';
            let address = '';
            
            if (parts.length >= 3) {
                city = parts[0];
                department = parts[1];
                address = parts.slice(2).join(', ');
            } else if (parts.length === 2) {
                city = parts[0];
                address = parts[1];
            } else {
                // Single part - ask for clarification
                await flowDynamic([
                    {
                        body: `⚠️ Por favor separa los datos con comas:\n\n` +
                              `Ejemplo: Castilla La Nueva, Meta, Oficina Inter Rapidísimo\n\n` +
                              `📍 *Envía tu ciudad y dirección:*`
                    }
                ]);
                return fallBack();
            }

            const customerData = {
                ...session?.conversationData?.customerData,
                city,
                department,
                address,
                direccionCompleta
            };

            await updateUserSession(
                ctx.from,
                `Ciudad: ${city}, Dirección: ${address}`,
                'datosCliente',
                'collecting_payment',
                true,
                { metadata: { customerData } }
            );

            await flowDynamic([
                {
                    body: `✅ *Datos registrados correctamente*\n\n` +
                          `🏠 ${city}${department ? ', ' + department : ''}\n` +
                          `📍 ${address}\n\n` +
                          `💳 *¿Cuál será tu método de pago?*\n\n` +
                          `Opciones disponibles:\n` +
                          `• *Efectivo* (contra entrega) ✅\n` +
                          `• *Transferencia bancaria*\n` +
                          `• *Nequi*\n` +
                          `• *Daviplata*\n` +
                          `• *Tarjeta de crédito/débito*\n\n` +
                          `Escribe tu opción preferida:`
                }
            ]);

        } catch (error) {
            console.error('❌ [DATOS CLIENTE] Error procesando dirección:', error);
            await flowDynamic([
                { body: `❌ Error procesando tus datos. Por favor, inténtalo nuevamente.` }
            ]);
            return fallBack();
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
        try {
            const metodoPago = ctx.body.trim().toLowerCase();
            const metodosValidos = ['transferencia', 'nequi', 'daviplata', 'efectivo', 'tarjeta'];
            const metodoValido = metodosValidos.find(m => metodoPago.includes(m));
            
            if (!metodoValido) {
                await flowDynamic([{ 
                    body: '⚠️ Método no reconocido.\n\nElige:\n• Efectivo (recomendado)\n• Transferencia\n• Nequi\n• Daviplata\n• Tarjeta' 
                }]);
                return fallBack();
            }

            const session = await getUserSession(ctx.from);
            const customerData = { 
                ...(session?.conversationData?.customerData || {}), 
                metodoPago: metodoValido 
            };
            
            // ✅ FIX: Store payment method in conversationData
            session.conversationData = session.conversationData || {};
            session.conversationData.customerData = customerData;

            await contextAnalyzer.clearCriticalContext(ctx.from);
            await updateUserSession(ctx.from, metodoValido, 'datosCliente', 'payment_confirmed', false, {
                metadata: { customerData }
            });
            
            // ✅ FIX: Validate we have all required data before going to order flow
            const { validateStageTransition } = await import('./userTrackingSystem');
            const validation = validateStageTransition(session, 'order_confirmation');
            
            if (!validation.valid) {
                console.error(`❌ [DATOS CLIENTE] Missing data for order: ${validation.missing.join(', ')}`);
                await flowDynamic([{ 
                    body: `⚠️ Faltan algunos datos para completar tu pedido:\n\n` +
                          `${validation.missing.map(f => `• ${f}`).join('\n')}\n\n` +
                          `Por favor, proporciona la información faltante.`
                }]);
                return fallBack();
            }

            // ✅ FIX: Move cross-sell AFTER order is confirmed and saved
            // This prevents interrupting the checkout flow
            
            if (metodoValido === 'efectivo') {
                await flowDynamic([{ 
                    body: `✅ Método de pago: *Efectivo (contra entrega)*\n\n📦 Procesando tu pedido...` 
                }]);
            } else {
                await flowDynamic([{ 
                    body: `✅ Método: *${metodoValido.toUpperCase()}*\n\n📦 Procesando tu pedido...\n\n💡 Te enviaremos los datos de pago en la confirmación.` 
                }]);
            }

            // ✅ CRITICAL: Cancel all pending follow-ups since shipping data is confirmed
            // This prevents erroneous follow-ups to users who completed checkout
            try {
                await onShippingConfirmed(ctx.from, {
                    source: 'datosCliente_payment_confirmed'
                });
                console.log(`✅ [DATOS CLIENTE] Follow-ups cancelled for ${ctx.from} after payment confirmation`);
            } catch (suppressionError) {
                // Log but don't block checkout flow
                console.error('❌ [DATOS CLIENTE] Error cancelling follow-ups:', suppressionError);
            }

            // Go directly to order flow - DON'T show cross-sell yet
            return gotoFlow(orderFlow);
            
        } catch (error) {
            console.error('❌ [DATOS CLIENTE] Error procesando método de pago:', error);
            await contextAnalyzer.clearCriticalContext(ctx.from);
            await flowDynamic([{ body: '❌ Error procesando el método de pago. Inténtalo nuevamente.' }]);
            return fallBack();
        }
    })

        .addAction({ capture: true }, async (ctx, { flowDynamic }) => {
            try {
                const text = (ctx.body || '').trim().toLowerCase();
                if (!/^(añadir|anadir|ver m[aá]s|ver mas|agregar)/.test(text)) return;

                const session = await getUserSession(ctx.from);
                if (!session) {
                    console.error(`❌ datosCliente cross-sell: No se pudo obtener sesión para ${ctx.from}`);
                    return;
                }
                
                if (/^ver m[aá]s|ver mas$/.test(text)) {
                    const list = crossSellSystem.generateRecommendations(session, { stage: 'beforePayment', maxItems: 5 });
                    const msg = crossSellSystem.generateCrossSellMessage(list);
                    if (msg) {
                        try {
                            await flowDynamic([{ body: msg }]);
                            console.log(`✅ datosCliente: Cross-sell recommendations sent to ${ctx.from}`);
                        } catch (msgError) {
                            console.error(`❌ datosCliente: Error enviando recomendaciones a ${ctx.from}:`, msgError);
                            // Don't leave user hanging - send fallback
                            await flowDynamic([{ body: 'Consulta nuestro catálogo completo para más opciones 😊' }]);
                        }
                    }
                    return;
                }

                const idMatch = text.match(/(?:añadir|anadir|agregar)\s+([A-Za-z0-9-_]+)/);
                const productId = idMatch && idMatch[1] ? idMatch[1] : null;
                if (!productId) return;

                // Lazy import para evitar ciclos (si tu bundler lo requiere)
                const { addCrossSellProduct } = await import('./userTrackingSystem');
                const ok = await addCrossSellProduct(ctx.from, productId);
                const responseMessage = ok 
                    ? `✅ Producto añadido. Se sumará al total de tu pedido.` 
                    : `⚠️ No fue posible añadir el producto. Escribe "VER MÁS" para otras opciones.`;
                
                try {
                    await flowDynamic([{ body: responseMessage }]);
                    console.log(`✅ datosCliente: Cross-sell product ${productId} ${ok ? 'added' : 'failed'} for ${ctx.from}`);
                } catch (msgError) {
                    console.error(`❌ datosCliente: Error enviando confirmación de producto a ${ctx.from}:`, msgError);
                    // Don't leave user hanging - try simpler message
                    try {
                        await flowDynamic([{ body: '✅ Recibido. Continúa con tu pedido.' }]);
                    } catch (fallbackError) {
                        console.error(`❌ datosCliente: Fallback también falló para ${ctx.from}:`, fallbackError);
                        // If both attempts fail, log critical error but don't throw to avoid breaking the flow
                        console.error(`❌ CRÍTICO: Usuario ${ctx.from} sin respuesta en cross-sell. Sistema debe investigar.`);
                    }
                }
            } catch (error) {
                console.error(`❌ datosCliente: Error crítico en cross-sell action para ${ctx.from}:`, error);
                // Always respond to user even on error - last resort
                try {
                    await flowDynamic([{ body: 'Continúa con tu pedido. Podemos revisar productos adicionales después 😊' }]);
                } catch (fallbackError) {
                    console.error(`❌ datosCliente: Error final de fallback - sistema de mensajería puede estar caído:`, fallbackError);
                    // At this point, the messaging system itself might be down
                    // Log for monitoring but don't throw to avoid breaking entire bot
                }
            }
        })

export { datosCliente };