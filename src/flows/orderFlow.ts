import { addKeyword } from '@builderbot/bot';
import { getUserSession, updateUserSession, ExtendedContext } from './userTrackingSystem';
import { contextAnalyzer } from '../services/contextAnalyzer';
import { contextMiddleware } from '../middlewares/contextMiddleware';
import customizationFlow from './customizationFlow';
import { orderEventEmitter } from '../services/OrderEventEmitter';

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
            contextMiddleware
            const respuesta = ctx.body.trim().toLowerCase();
            console.log(`📋 [ORDER FLOW] Respuesta de confirmación: "${respuesta}"`);

            if (respuesta.includes('sí') || respuesta.includes('si') || respuesta.includes('correcto') || respuesta.includes('confirmar')) {
                console.log(`✅ [ORDER FLOW] Datos confirmados, procesando pedido final`);

                // ✅ OBTENER TODOS LOS DATOS DE LA SESIÓN
                const session = await getUserSession(ctx.from);
                const customerData = session?.conversationData?.customerData;
                const orderData = {
                    productType: session?.conversationData?.productType,
                    selectedGenre: session?.conversationData?.selectedGenre,
                    selectedCapacity: session?.conversationData?.selectedCapacity,
                    price: session?.conversationData?.price
                };

                // ✅ GENERAR NÚMERO DE PEDIDO
                const orderNumber = `USB-${Date.now().toString().slice(-6)}`;

                // ✅ GUARDAR PEDIDO COMPLETO
                const updatedSession = {
                    ...session,
                    step: 'order_confirmed',
                    orderNumber,
                    customerData,
                    orderData,
                    status: 'confirmed',
                    confirmedAt: new Date().toISOString(),
                    isProcessing: false
                };
                await updateUserSession(
                ctx.from,                      // phoneNumber (string)
                'Pedido confirmado',           // message (string)
                'orderFlow',                   // currentFlow (string)
                'order_confirmed',             // step (string) → ¡Correcto!
                false,                         // isProcessing (boolean)
                {                              // options (objeto opcional)
                    metadata: {                // Aquí puedes incluir updatedSession
                        ...updatedSession      // Todas las propiedades adicionales
                    }
                }
            );


                // ✅ LIMPIAR CONTEXTO CRÍTICO
                await contextAnalyzer.clearCriticalContext(ctx.from);

                // ✅ ENVIAR CONFIRMACIÓN FINAL
                await flowDynamic([
                    {
                        body: `🎉 *¡PEDIDO CONFIRMADO!*\n\n` +
                              `📋 *NÚMERO DE PEDIDO:* ${orderNumber}\n\n` +
                              `👤 *DATOS DEL CLIENTE:*\n` +
                              `• Nombre: ${customerData.nombre}\n` +
                              `• Teléfono: ${customerData.telefono}\n` +
                              `• Dirección: ${customerData.direccion}\n` +
                              `• Método de pago: ${customerData.metodoPago}\n\n` +
                              `🎵 *PRODUCTO:*\n` +
                              `• Tipo: USB con música\n` +
                              `• Género: ${orderData.selectedGenre}\n` +
                              `• Capacidad: ${orderData.selectedCapacity}\n` +
                              `• Precio: ${orderData.price}\n\n` +
                              `⏰ *TIEMPO DE ENTREGA:* 2-3 días hábiles\n\n` +
                              `📱 *Te contactaremos pronto para coordinar la entrega*\n\n` +
                              `¡Gracias por tu compra! 🎶`
                    }
                ]);

                // 🔔 TRIGGER NOTIFICATION: Order Created
                await orderEventEmitter.onOrderCreated(
                    orderNumber,
                    ctx.from,
                    customerData.nombre,
                    undefined, // email not captured in this flow
                    {
                        items: [{
                            name: `USB ${orderData.selectedGenre} ${orderData.selectedCapacity}`,
                            price: orderData.price
                        }],
                        total: orderData.price,
                        productType: orderData.productType,
                        genre: orderData.selectedGenre,
                        capacity: orderData.selectedCapacity
                    }
                );

                // ✅ ENVIAR INFORMACIÓN DE PAGO SI ES NECESARIO
                if (customerData.metodoPago !== 'efectivo') {
                    await flowDynamic([
                        {
                            body: `💳 *INFORMACIÓN DE PAGO*\n\n` +
                                  `Como elegiste *${customerData.metodoPago}*, aquí están los datos:\n\n` +
                                  `🏦 *DATOS BANCARIOS:*\n` +
                                  `• Titular: USB Personalizadas\n` +
                                  `• Nequi: 3209549668\n` +
                                  `• Daviplata: 3209549668\n\n` +
                                  `💰 *Monto a pagar:* ${orderData.price}\n\n` +
                                  `📸 *Por favor, envía el comprobante de pago cuando realices la transferencia*\n\n` +
                                  `❓ ¿Tienes alguna pregunta?`
                        }
                    ]);
                }

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
        `💚 *1. USB Musical Básica - $59.900*`,
        `• 8GB + música personalizada + diseño`,
        ``,
        `🧡 *2. USB Premium - $89.900* ⭐ MÁS POPULAR`,
        `• 32GB + playlist curada + diseño 3D + estuche`,
        ``,
        `❤️ *3. USB VIP - $129.900* 👑 MEJOR VALOR`,
        `• 64GB + pack completo + diseño premium + accesorios`,
        ``,
        `💜 *4. USB Mega - $169.900* 🚀 EXPERIENCIA COMPLETA`,
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
     '1': { id:'usb_basic', name:'USB Musical Básica', capacity:'8GB', price: 59900 },
     '2': { id:'usb_premium', name:'USB Premium Personalizada', capacity:'32GB', price: 89900 },
     '3': { id:'usb_vip', name:'USB VIP Completa', capacity:'64GB', price: 129900 },
     '4': { id:'usb_mega', name:'USB Mega Colección', capacity:'128GB', price: 169900 }
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
            `• *1* para USB Musical Básica ($59.900)`,
            `• *2* para USB Premium ($89.900)`,
            `• *3* para USB VIP ($129.900)`,
            `• *4* para USB Mega ($75.000)`,
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



export default orderFlow;
