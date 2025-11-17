 // ====== SEPARADOR: flows/datosCliente.ts - INICIO ======

import { addKeyword, EVENTS } from '@builderbot/bot';
import { contextAnalyzer } from '../services/contextAnalyzer';
import { dataCollectionMiddleware } from '../middlewares/contextMiddleware';
import orderFlow from './orderFlow';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import { crossSellSystem } from '../services/crossSellSystem';

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
    '1': 1, 'uno': 1, '8': 1, '8gb': 1, '8 gb': 1, '1400': 1, '1,400': 1, '1.400': 1, '1400 canciones': 1, 'primera': 1, 'opcion 1': 1, 'opción 1': 1, '59': 1, '59900': 1, '59.900': 1,
    // Opción 2 (32GB)
    '2': 2, 'dos': 2, '32': 2, '32gb': 2, '32 gb': 2, '5000': 2, '5,000': 2, '5.000': 2, '5000 canciones': 2, 'segunda': 2, 'opcion 2': 2, 'opción 2': 2, '89': 2, '89900': 2, '89.900': 2,
    // Opción 3 (64GB)
    '3': 3, 'tres': 3, '64': 3, '64gb': 3, '64 gb': 3, '10000': 3, '10,000': 3, '10.000': 3, '10000 canciones': 3, 'tercera': 3, 'opcion 3': 3, 'opción 3': 3, '129': 3, '129900': 3, '129.900': 3,
    // Opción 4 (128GB)
    '4': 4, 'cuatro': 4, '128': 4, '128gb': 4, '128 gb': 4, '22000': 4, '22,000': 4, '22.000': 4, '22000 canciones': 4, 'cuarta': 4, 'opcion 4': 4, 'opción 4': 4, '169': 4, '169900': 4, '169.900': 4
};

// Opciones de USB disponibles
const usbOptions = {
    1: { capacity: '8GB', songs: '1,400 canciones', price: '$59.900', benefits: ['✅ Ideal para documentos importantes', '✅ Perfecta para estudiantes', '✅ Ultraportátil y práctica'] },
    2: { capacity: '32GB', songs: '5,000 canciones', price: '$89.900', benefits: ['⭐ Excelente relación calidad-precio', '⭐ Perfecta para profesionales', '⭐ Almacena presentaciones completas'] },
    3: { capacity: '64GB', songs: '10,000 canciones', price: '$129.900', benefits: ['🌟 Gran capacidad de almacenamiento', '🌟 Ideal para fotógrafos y diseñadores', '🌟 Transferencia a alta velocidad'] },
    4: { capacity: '128GB', songs: '22,000 canciones', price: '$169.900', benefits: ['💎 Máxima capacidad disponible', '💎 Para usuarios exigentes', '💎 Biblioteca multimedia completa'] }
};

// Flujo para la selección de capacidad de USB
const datosCliente = addKeyword(['datos_cliente_trigger'])
    .addAction(async (ctx, { flowDynamic, endFlow }) => {
        try {
            dataCollectionMiddleware
            console.log(`📋 [DATOS CLIENTE] Iniciando recolección de datos para ${ctx.from}`);

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
    .addAction({ capture: true }, async (ctx, { flowDynamic, fallBack }) => {
        try {
            const nombre = ctx.body.trim();
            console.log(`👤 [DATOS CLIENTE] Nombre recibido: "${nombre}"`);

            if (!nombre || nombre.length < 2 || !/^[A-Za-zÀ-ÿ\s]{2,50}$/.test(nombre)) {
                console.log(`❌ [DATOS CLIENTE] Nombre inválido: "${nombre}"`);
                await flowDynamic([
                    {
                        body: `⚠️ Por favor, ingresa un nombre válido.\n\n` +
                              `Ejemplo: Juan Pérez\n\n` +
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
            console.error('❌ [DATOS CLIENTE] Error capturando nombre:', error);
            await flowDynamic([
                { body: `❌ Error procesando tu nombre. Por favor, inténtalo nuevamente.` }
            ]);
            return fallBack();
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, fallBack }) => {
        try {
            const direccion = ctx.body.trim();
            console.log(`📍 [DATOS CLIENTE] Dirección recibida: "${direccion}"`);

            // Validación básica de dirección
            if (!direccion || direccion.length < 10) {
                console.log(`❌ [DATOS CLIENTE] Dirección inválida: "${direccion}"`);
                await flowDynamic([
                    {
                        body: `⚠️ La dirección parece incompleta.\n\n` +
                              `Por favor, proporciona una dirección completa incluyendo:\n` +
                              `• Calle/Carrera y número\n` +
                              `• Barrio\n` +
                              `• Ciudad\n\n` +
                              `📍 *¿Cuál es tu dirección de entrega?*`
                    }
                ]);
                return fallBack();
            }

            // Obtener sesión y actualizar datos del cliente con la dirección
            const session = await getUserSession(ctx.from);
            const customerData = {
                ...session?.conversationData?.customerData,
                direccion
            };

            await updateUserSession(
                ctx.from,
                direccion,
                'datosCliente',
                'collecting_phone',
                true,
                { metadata: { customerData } }
            );

            // Solicitar teléfono después de registrar la dirección
            await flowDynamic([
                {
                    body: `✅ *Dirección registrada correctamente*\n\n` +
                          `📱 *¿Cuál es tu número de teléfono?*\n\n` +
                          `Por favor incluye el código de área.\n` +
                          `Ejemplo: 3001234567\n\n` +
                          `📞 _Esto nos permite confirmar tu pedido y coordinar la entrega._`
                }
            ]);

        } catch (error) {
            console.error('❌ [DATOS CLIENTE] Error procesando dirección:', error);
            await flowDynamic([
                { body: `❌ Error procesando tu dirección. Por favor, inténtalo nuevamente.` }
            ]);
            return fallBack();
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, fallBack, gotoFlow }) => {
        try {
            const direccion = ctx.body.trim();
            console.log(`🏠 [DATOS CLIENTE] Dirección recibida: "${direccion}"`);

            // ✅ VALIDAR DIRECCIÓN
            if (!direccion || direccion.length < 10 || !/^[A-Za-z0-9À-ÿ\s\#\-\,\.]{10,200}$/.test(direccion)) {
                console.log(`❌ [DATOS CLIENTE] Dirección inválida: "${direccion}"`);
                await flowDynamic([
                    {
                        body: `❌ *Dirección inválida*\n\n` +
                              `Por favor, ingresa una dirección completa y válida.\n\n` +
                              `Debe incluir:\n` +
                              `• Calle/Carrera y número\n` +
                              `• Barrio o sector\n` +
                              `• Ciudad\n\n` +
                              `Ejemplo: Calle 123 #45-67, Barrio Centro, Bogotá\n\n` +
                              `🏠 *¿Cuál es tu dirección completa?*`
                    }
                ]);
                return fallBack();
            }

            // ✅ OBTENER DATOS ACTUALES Y AGREGAR DIRECCIÓN
            const session = await getUserSession(ctx.from);
            const customerData = {
                ...session?.conversationData?.customerData,
                direccion
            };

            await updateUserSession(
                ctx.from,
                direccion,
                'datosCliente',
                'collecting_payment',
                true,
                { metadata: { customerData } }
            );

            await flowDynamic([
                {
                    body: `✅ Dirección registrada: *${direccion}*\n\n` +
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

        } catch (error) {
            console.error('❌ [DATOS CLIENTE] Error procesando dirección:', error);
            return fallBack();
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
        try {
        const metodoPago = ctx.body.trim().toLowerCase();
        const metodosValidos = ['transferencia', 'nequi', 'daviplata', 'efectivo', 'tarjeta'];
        const metodoValido = metodosValidos.find(m => metodoPago.includes(m));
        if (!metodoValido) {
        await flowDynamic([{ body: '⚠️ Método no reconocido.\nElige: Transferencia, Nequi, Daviplata, Efectivo o Tarjeta. '}]);
        return fallBack();
        }

        const session = await getUserSession(ctx.from);
        const customerData = { ...(session?.conversationData?.customerData || {}), metodoPago: metodoValido };

        await contextAnalyzer.clearCriticalContext(ctx.from);
        await updateUserSession(ctx.from, metodoValido, 'datosCliente', 'payment_confirmed', false, {
          metadata: { customerData }
        });

        // Cross-sell no intrusivo tras pago (1 sugerencia)
        if (shouldOfferCrossSell(session)) {
          const recs = crossSellSystem.generateRecommendations(session, { stage: 'beforePayment', maxItems: 3 });
          const pick =
            recs.find(r => /power|bank|bater(ia|ía)/i.test(r.product.name)) ||
            recs.find(r => /aud[ií]fonos|headset|earbuds|bluetooth/i.test(r.product.name)) ||
            recs[0];
        
          if (pick) {
            await flowDynamic([{ body: `🧩 Antes de finalizar, puedes mejorar tu experiencia.\n${formatSuggestion(pick.product)}` }]);
            await markCrossSellOffered(ctx.from, session);
          }
        }

        if (metodoValido === 'efectivo') {
          await flowDynamic([{ body: `✅ Método de pago: Efectivo (contra entrega)\n📦 Procederemos a finalizar tu pedido.` }]);
          return gotoFlow(orderFlow);
        }

        await flowDynamic([{ body: `✅ Método: ${metodoValido.toUpperCase()}\n📦 Ahora finalizaremos tu pedido. Te enviaremos los datos de pago en la confirmación.` }]);
        return gotoFlow(orderFlow);
        } catch (error) {
        console.error('❌ [DATOS CLIENTE] Error procesando método de pago:', error);
        await contextAnalyzer.clearCriticalContext(ctx.from);
        await flowDynamic([{ body: '❌ Error procesando el método de pago. Inténtalo nuevamente. '}]);
        return fallBack();
        }
        })

        .addAction({ capture: true }, async (ctx, { flowDynamic }) => {
const text = (ctx.body || '').trim().toLowerCase();
if (!/^(añadir|anadir|ver m[aá]s|ver mas|agregar)/.test(text)) return;

const session = await getUserSession(ctx.from);
if (/^ver m[aá]s|ver mas$/.test(text)) {
const list = crossSellSystem.generateRecommendations(session, { stage: 'beforePayment', maxItems: 5 });
const msg = crossSellSystem.generateCrossSellMessage(list);
if (msg) await flowDynamic([{ body: msg }]);
return;
}

const idMatch = text.match(/(?:añadir|anadir|agregar)\s+([A-Za-z0-9-_]+)/);
const productId = idMatch && idMatch[1] ? idMatch[1] : null;
if (!productId) return;

// Lazy import para evitar ciclos (si tu bundler lo requiere)
const { addCrossSellProduct } = await import('./userTrackingSystem');
const ok = await addCrossSellProduct(ctx.from, productId);
await flowDynamic([{ body: ok ? `✅ Producto añadido. Se sumará al total de tu pedido.` : `⚠️ No fue posible añadir el producto. Escribe "VER MÁS" para otras opciones.` }]);
})

export { datosCliente };