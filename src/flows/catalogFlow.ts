import { addKeyword } from '@builderbot/bot';
import { IntelligentRouter, MakeDecisionResponse } from '../services/intelligentRouter';
import { getUserSession, updateUserSession, ExtendedContext } from './userTrackingSystem';
import { 
    hasCustomization, 
    hasSelectedProduct, 
    getSelectedProduct, 
    isInPurchaseFlow,
    hasCartData
} from '../utils/typeGuards';
import { getCartData, getCartTotal, getCartItemCount } from '../utils/typeGuards';

// ✅ CLASE HELPER SEPARADA para métodos del catálogo
class CatalogHelper {
    static async showCartDetails(
        ctx: ExtendedContext, 
        flowDynamic: any
    ): Promise<void> {
        try {
            const session = await getUserSession(ctx.from);
            const cartData = getCartData(session);
            
            if (cartData) {
                const cartTotal = getCartTotal(session);
                const itemCount = getCartItemCount(session);
                
                await flowDynamic([
                    `🛒 **Detalles de tu Carrito:**`,
                    ``,
                    `📦 **Items (${itemCount}):**`,
                    ...cartData.items.map((item, index) => [
                        `**${index + 1}. ${item.name}**`,
                        `   💰 Precio: $${item.price.toLocaleString()}`,
                        `   📦 Cantidad: ${item.quantity}`,
                        `   💵 Subtotal: $${(item.price * item.quantity).toLocaleString()}`,
                        ``
                    ]).flat(),
                    `💰 **Total: $${cartTotal.toLocaleString()}**`,
                    ``,
                    `🎁 **Incluido GRATIS:**`,
                    `• ✅ Envío a toda Colombia`,
                    `• ✅ Diseño personalizado`,
                    `• ✅ Garantía de satisfacción`,
                    ``,
                    `💬 **¿Qué quieres hacer?**`,
                    `• Escribe "**comprar**" para proceder al pago`,
                    `• Escribe "**modificar**" para cambiar cantidades`,
                    `• Escribe "**eliminar**" + número para quitar item`,
                    `• Escribe "**agregar**" para añadir más productos`
                ]);
            } else {
                await flowDynamic([
                    '🛒 **Tu carrito está vacío**',
                    '',
                    '💡 **¿Te gustaría agregar productos?**',
                    'Escribe "**catálogo**" para ver nuestras opciones',
                    '',
                    '🎵 **O dime qué tipo de USB buscas y te ayudo a encontrarla**'
                ]);
            }
        } catch (error) {
            console.error('❌ Error en showCartDetails:', error);
            await flowDynamic(['❌ Error al mostrar carrito. Intenta nuevamente.']);
        }
    }

    static async showPersonalizedCatalog(
        ctx: ExtendedContext, 
        flowDynamic: any, 
        routerDecision: MakeDecisionResponse
    ): Promise<void> {
        
        // Personalizar orden y énfasis basado en el análisis
        const isUrgent = routerDecision.followUpActions?.includes('create_urgency') || false;
        const isPriceConscious = routerDecision.followUpActions?.includes('offer_payment_plans') || false;
        const isPremium = routerDecision.followUpActions?.includes('provide_social_proof') || false;

        if (isPriceConscious) {
            // Mostrar opciones económicas primero
            await flowDynamic([
                `💰 **1. USB Musical Económica** ${isUrgent ? '⚡ ENTREGA RÁPIDA' : ''}`,
                `• 16GB de capacidad`,
                `• Tu música favorita organizada`,
                `• Diseño personalizado básico`,
                `• Compatible con todos los dispositivos`,
                `• **Precio: $25.000** (antes $30.000)`,
                `• 🎁 **INCLUYE**: Envío gratis + playlist curada`,
                ``,
                `🎵 **2. USB Premium Personalizada** ⭐ MÁS POPULAR`,
                `• 32GB de capacidad`,
                `• Playlist profesional curada`,
                `• Diseño 3D exclusivo`,
                `• Estuche protector incluido`,
                `• **Precio: $35.000** (antes $45.000)`,
                `• 🎁 **INCLUYE**: Todo lo anterior + soporte premium`,
                ``,
                `👑 **3. USB VIP Completa**`,
                `• 64GB de capacidad`,
                `• Pack musical completo (500+ canciones)`,
                `• Diseño premium + grabado láser`,
                `• Estuche de lujo + cable USB-C`,
                `• **Precio: $55.000** (antes $70.000)`,
                `• 🎁 **INCLUYE**: Garantía extendida + actualizaciones gratis`,
                ``,
                `🚀 **4. USB Mega Colección**`,
                `• 128GB de capacidad`,
                `• Biblioteca musical completa`,
                `• Diseño holográfico exclusivo`,
                `• Kit completo de accesorios`,
                `• **Precio: $75.000** (antes $95.000)`,
                `• 🎁 **INCLUYE**: Servicio VIP + playlist mensual gratis`
            ]);
        } else if (isPremium) {
            // Mostrar opciones premium primero
            await flowDynamic([
                `👑 **1. USB VIP Completa** ⭐ RECOMENDADA PARA TI`,
                `• 64GB de capacidad premium`,
                `• Pack musical curado por expertos`,
                `• Diseño premium + grabado láser`,
                `• Estuche de lujo + cable USB-C`,
                `• **Precio: $55.000** (valor real $70.000)`,
                `• 🎁 **EXCLUSIVO**: Garantía extendida + actualizaciones gratis`,
                ``,
                `🚀 **2. USB Mega Colección** 💎 ULTRA PREMIUM`,
                `• 128GB de capacidad máxima`,
                `• Biblioteca musical completa (1000+ canciones)`,
                `• Diseño holográfico exclusivo`,
                `• Kit completo de accesorios premium`,
                `• **Precio: $75.000** (valor real $95.000)`,
                `• 🎁 **VIP**: Servicio personalizado + playlist mensual`,
                ``,
                `🎵 **3. USB Premium Personalizada**`,
                `• 32GB de capacidad`,
                `• Playlist profesional curada`,
                `• Diseño 3D exclusivo`,
                `• Estuche protector incluido`,
                `• **Precio: $35.000**`,
                `• 🎁 **INCLUYE**: Soporte premium + envío express`,
                ``,
                `💰 **4. USB Musical Básica** (Opción económica)`,
                `• 16GB de capacidad`,
                `• Tu música favorita`,
                `• Diseño personalizado`,
                `• **Precio: $25.000**`,
                `• 🎁 **INCLUYE**: Envío gratis`
            ]);
        } else {
            // Catálogo estándar optimizado
            await flowDynamic([
                `🎵 **1. USB Musical Básica** 💚 IDEAL PARA EMPEZAR`,
                `• 16GB - Perfecta para tus canciones favoritas`,
                `• Diseño personalizado con tu estilo`,
                `• Música organizada profesionalmente`,
                `• Compatible universalmente`,
                `• **Precio: $25.000** ✨`,
                ``,
                `⭐ **2. USB Premium Personalizada** 🔥 MÁS POPULAR`,
                `• 32GB - Doble capacidad`,
                `• Playlist curada por expertos musicales`,
                `• Diseño 3D exclusivo y único`,
                `• Estuche protector incluido`,
                `• **Precio: $35.000** ✨`,
                ``,
                `👑 **3. USB VIP Completa** 💎 MEJOR VALOR`,
                `• 64GB - Capacidad premium`,
                `• Pack musical completo`,
                `• Diseño premium + grabado láser`,
                `• Kit de accesorios completo`,
                `• **Precio: $55.000** ✨`,
                ``,
                `🚀 **4. USB Mega Colección** 🌟 EXPERIENCIA COMPLETA`,
                `• 128GB - Máxima capacidad`,
                `• Biblioteca musical gigante`,
                `• Diseño holográfico exclusivo`,
                `• Servicio VIP personalizado`,
                `• **Precio: $75.000** ✨`
            ]);
        }
    }

    static async checkPurchaseStatus(
        ctx: ExtendedContext, 
        flowDynamic: any
    ): Promise<void> {
        try {
            const session = await getUserSession(ctx.from);
            
            if (isInPurchaseFlow(session)) {
                const selectedProduct = getSelectedProduct(session);
                const cartData = getCartData(session);
                const cartTotal = getCartTotal(session);
                const itemCount = getCartItemCount(session);
                
                await flowDynamic([
                    `🛒 **Estado de tu compra:**`,
                    ``,
                    selectedProduct ? `✅ Producto seleccionado: ${selectedProduct.name}` : '❌ Sin producto seleccionado',
                    cartData ? `✅ En carrito: ${itemCount} item(s) - $${cartTotal.toLocaleString()}` : '❌ Sin items en carrito',
                    `📊 Etapa actual: ${session.stage}`,
                    ``,
                    `💬 **¿Quieres continuar con tu compra?**`,
                    ``,
                    `🎯 **Opciones disponibles:**`,
                    `• Escribe "**continuar**" para proceder con la compra`,
                    `• Escribe "**modificar**" para cambiar tu selección`,
                    `• Escribe "**carrito**" para ver detalles del carrito`,
                    `• Escribe "**nuevo**" para empezar de nuevo`
                ]);
            } else {
                await flowDynamic([
                    '🛒 **No tienes ninguna compra en proceso**',
                    '',
                    '💡 **¿Te gustaría ver nuestro catálogo?**',
                    'Escribe "**catálogo**" para ver todas las opciones',
                    '',
                    '🎵 **O cuéntame qué tipo de USB buscas:**',
                    '• Para uso personal',
                    '• Para regalar',
                    '• Para uso profesional',
                    '• Con características específicas'
                ]);
            }
        } catch (error) {
            console.error('❌ Error en checkPurchaseStatus:', error);
            await flowDynamic(['❌ Error al verificar estado. Intenta nuevamente.']);
        }
    }

    static async showBasicCatalog(flowDynamic: any): Promise<void> {
        await flowDynamic([
            `🎵 **Nuestras 4 Opciones Principales:**`,
            ``,
            `**1. USB Musical Básica - $25.000**`,
            `16GB | Diseño personalizado | Tu música favorita`,
            ``,
            `**2. USB Premium - $35.000** ⭐`,
            `32GB | Diseño 3D | Playlist curada | Estuche`,
            ``,
            `**3. USB VIP - $55.000** 👑`,
            `64GB | Pack completo | Diseño premium | Accesorios`,
            ``,
            `**4. USB Mega - $75.000** 🚀`,
            `128GB | Biblioteca completa | Diseño holográfico | Servicio VIP`,
            ``,
            `💬 **Escribe el número de tu opción favorita**`
        ]);
    }

    static async handleOptionSelection(
        optionNumber: number, 
        ctx: ExtendedContext, 
        flowDynamic: any, 
        gotoFlow: any
    ): Promise<void> {
        try {
            const options = {
                1: {
                    name: 'USB Musical Básica',
                    price: 25000,
                    capacity: '16GB',
                    features: ['Música personalizada', 'Diseño básico', 'Envío gratis'],
                    id: 'usb-basic-16gb',
                    type: 'basic' as const
                },
                2: {
                    name: 'USB Premium Personalizada',
                    price: 35000,
                    capacity: '32GB',
                    features: ['Playlist curada', 'Diseño 3D', 'Estuche incluido', 'Soporte premium'],
                    id: 'usb-premium-32gb',
                    type: 'premium' as const
                },
                3: {
                    name: 'USB VIP Completa',
                    price: 55000,
                    capacity: '64GB',
                    features: ['Pack musical completo', 'Diseño premium', 'Accesorios', 'Garantía extendida'],
                    id: 'usb-vip-64gb',
                    type: 'vip' as const
                },
                4: {
                    name: 'USB Mega Colección',
                    price: 75000,
                    capacity: '128GB',
                    features: ['Biblioteca gigante', 'Diseño holográfico', 'Servicio VIP', 'Actualizaciones gratis'],
                    id: 'usb-mega-128gb',
                    type: 'mega' as const
                }
            };

            const selectedOption = options[optionNumber as keyof typeof options];
            
            if (selectedOption) {
                // ✅ CORREGIDO: Obtener sesión actual
                const session = await getUserSession(ctx.from);
                
                // ✅ CORREGIDO: Actualizar selectedProduct en la sesión
                session.selectedProduct = {
                    option: optionNumber,
                    name: selectedOption.name,
                    price: selectedOption.price,
                    capacity: selectedOption.capacity,
                    id: selectedOption.id,
                    type: selectedOption.type,
                    features: selectedOption.features
                };

                await flowDynamic([
                    `🎯 **¡Excelente elección!** Has seleccionado:`,
                    ``,
                    `🎵 **${selectedOption.name}**`,
                    `💾 Capacidad: ${selectedOption.capacity}`,
                    `💰 Precio: $${selectedOption.price.toLocaleString()}`,
                    ``,
                    `✨ **Incluye:**`,
                    ...selectedOption.features.map(feature => `• ${feature}`),
                    ``,
                    `🔥 **OFERTA ESPECIAL HOY:**`,
                    `• Envío gratis a toda Colombia`,
                    `• Diseño personalizado sin costo adicional`,
                    `• Garantía de satisfacción 100%`,
                    ``,
                    `💬 **¿Qué quieres hacer ahora?**`,
                    ``,
                    `🛒 Escribe "**comprar**" para hacer tu pedido`,
                    `🎨 Escribe "**personalizar**" para customizar más`,
                    `ℹ️ Escribe "**más info**" para detalles técnicos`,
                    `💬 O cuéntame qué más necesitas saber`
                ]);

                // ✅ CORREGIDO: Usar estructura correcta para updateUserSession
                await updateUserSession(
                    ctx.from,
                    `Seleccionó opción ${optionNumber}: ${selectedOption.name}`,
                    'catalogFlow',
                    null,
                    false,
                    {
                        isPredetermined: false,
                        messageType: 'product_selection',
                        confidence: 0.9,
                        metadata: {
                            detectionType: 'catalog_selection',
                            originalMessage: ctx.body,
                            selectedOption: optionNumber,
                            productId: selectedOption.id
                        }
                    }
                );


            } else {
                await flowDynamic([
                    '❌ **Opción no válida**',
                    '',
                    '💡 **Por favor elige una opción válida:**',
                    '• Escribe **1** para USB Musical Básica',
                    '• Escribe **2** para USB Premium Personalizada',
                    '• Escribe **3** para USB VIP Completa',
                    '• Escribe **4** para USB Mega Colección',
                    '',
                    '💬 **O cuéntame qué buscas específicamente**'
                ]);
            }
        } catch (error) {
            console.error('❌ Error en handleOptionSelection:', error);
            await flowDynamic(['❌ Error al procesar tu selección. Intenta nuevamente.']);
        }
    }

    static async showDetailedInfo(
        optionNumber: number, 
        ctx: ExtendedContext, 
        flowDynamic: any
    ): Promise<void> {
        
        const detailedInfo = {
            1: {
                name: 'USB Musical Básica',
                price: 25000,
                specs: {
                    capacity: '16GB (aproximadamente 4,000 canciones)',
                    compatibility: 'Windows, Mac, Linux, Android, Smart TV',
                    speed: 'USB 3.0 - Transferencia rápida',
                    durability: 'Resistente al agua y golpes',
                    warranty: '1 año de garantía'
                },
                includes: [
                    '✅ USB de 16GB alta calidad',
                    '✅ Tu música favorita organizada por géneros',
                    '✅ Diseño personalizado (nombre, colores, estilo)',
                    '✅ Envío gratis a toda Colombia',
                    '✅ Soporte técnico básico',
                    '✅ Garantía de satisfacción'
                ],
                process: [
                    '1️⃣ Nos envías tu lista de canciones favoritas',
                    '2️⃣ Eliges colores y diseño personalizado',
                    '3️⃣ Nosotros organizamos todo profesionalmente',
                    '4️⃣ Te la enviamos en 24-48 horas'
                ],
                testimonial: '"Perfecta para mis canciones favoritas, calidad excelente y precio justo" - Ana M. ⭐⭐⭐⭐⭐'
            },
            2: {
                name: 'USB Premium Personalizada',
                price: 35000,
                specs: {
                    capacity: '32GB (aproximadamente 8,000 canciones)',
                    compatibility: 'Universal - Todos los dispositivos',
                    speed: 'USB 3.0 - Alta velocidad',
                    durability: 'Carcasa reforzada + resistente',
                    warranty: '2 años de garantía'
                },
                includes: [
                    '✅ USB de 32GB premium',
                    '✅ Playlist curada por expertos musicales',
                    '✅ Diseño 3D personalizado exclusivo',
                    '✅ Estuche protector incluido',
                    '✅ Envío express gratis',
                    '✅ Soporte técnico premium',
                    '✅ Una actualización de playlist gratis'
                ],
                process: [
                    '1️⃣ Cuestionario musical personalizado',
                    '2️⃣ Diseño 3D exclusivo a tu medida',
                    '3️⃣ Playlist curada por expertos',
                    '4️⃣ Control de calidad premium',
                    '5️⃣ Entrega express en estuche'
                ],
                testimonial: '"El diseño 3D es increíble y la música está perfectamente organizada" - Carlos R. ⭐⭐⭐⭐⭐'
            },
            3: {
                name: 'USB VIP Completa',
                price: 55000,
                specs: {
                    capacity: '64GB (aproximadamente 16,000 canciones)',
                    compatibility: 'Universal + Cable USB-C incluido',
                    speed: 'USB 3.1 - Máxima velocidad',
                    durability: 'Carcasa premium + grabado láser',
                    warranty: '3 años de garantía extendida'
                },
                includes: [
                    '✅ USB de 64GB capacidad premium',
                    '✅ Pack musical completo (múltiples géneros)',
                    '✅ Diseño premium con grabado láser',
                    '✅ Kit completo: estuche + cable USB-C + adaptador',
                    '✅ Envío VIP express',
                    '✅ Soporte técnico VIP',
                    '✅ 3 actualizaciones de playlist gratis',
                    '✅ Garantía extendida'
                ],
                process: [
                    '1️⃣ Consulta musical personalizada',
                    '2️⃣ Diseño premium con grabado láser',
                    '3️⃣ Pack musical completo curado',
                    '4️⃣ Kit de accesorios premium',
                    '5️⃣ Control de calidad VIP',
                    '6️⃣ Entrega con servicio premium'
                ],
                testimonial: '"Inversión que vale la pena, calidad excepcional en todo" - María L. ⭐⭐⭐⭐⭐'
            },
            4: {
                name: 'USB Mega Colección',
                price: 75000,
                specs: {
                    capacity: '128GB (aproximadamente 32,000 canciones)',
                    compatibility: 'Universal + Múltiples conectores',
                    speed: 'USB 3.2 - Velocidad máxima',
                    durability: 'Diseño holográfico premium + ultra resistente',
                    warranty: '5 años de garantía VIP'
                },
                includes: [
                    '✅ USB de 128GB máxima capacidad',
                    '✅ Biblioteca musical gigante (todos los géneros)',
                    '✅ Diseño holográfico exclusivo único',
                    '✅ Kit VIP completo de accesorios',
                    '✅ Servicio de entrega personalizado',
                    '✅ Soporte técnico VIP de por vida',
                    '✅ Playlist mensual gratis por 6 meses',
                    '✅ Garantía VIP extendida',
                    '✅ Actualizaciones ilimitadas'
                ],
                process: [
                    '1️⃣ Consulta musical VIP personalizada',
                    '2️⃣ Diseño holográfico exclusivo',
                    '3️⃣ Biblioteca musical completa',
                    '4️⃣ Kit VIP de accesorios',
                    '5️⃣ Control de calidad premium',
                    '6️⃣ Entrega VIP personalizada',
                    '7️⃣ Seguimiento post-venta'
                ],
                testimonial: '"La mejor inversión musical que he hecho, servicio excepcional" - Roberto S. ⭐⭐⭐⭐⭐'
            }
        };

        const info = detailedInfo[optionNumber as keyof typeof detailedInfo];
        
        if (info) {
            await flowDynamic([
                `📋 **Información Completa: ${info.name}**`,
                `💰 **Precio: $${info.price.toLocaleString()}**`,
                ``,
                `🔧 **Especificaciones Técnicas:**`,
                `• 💾 Capacidad: ${info.specs.capacity}`,
                `• 🔌 Compatibilidad: ${info.specs.compatibility}`,
                `• ⚡ Velocidad: ${info.specs.speed}`,
                `• 🛡️ Durabilidad: ${info.specs.durability}`,
                `• ✅ Garantía: ${info.specs.warranty}`,
                ``,
                `📦 **Todo lo que incluye:**`,
                ...info.includes,
                ``,
                `🔄 **Proceso de creación:**`,
                ...info.process,
                ``,
                `💬 **Testimonio real:**`,
                info.testimonial,
                ``,
                `🎯 **¿Listo para hacer tu pedido?**`,
                `• Escribe "**comprar**" para proceder`,
                `• Escribe "**personalizar**" para más opciones`,
                `• Escribe "**comparar**" para ver diferencias`,
                `• O pregúntame cualquier duda específica`
            ]);
        } else {
            await flowDynamic([
                '❌ **Información no disponible para esa opción**',
                '',
                '💡 **Opciones válidas para más información:**',
                '• "más info 1" - USB Musical Básica',
                '• "más info 2" - USB Premium Personalizada', 
                '• "más info 3" - USB VIP Completa',
                '• "más info 4" - USB Mega Colección'
            ]);
        }
    }

    static async showDetailedPricing(
        ctx: ExtendedContext, 
        flowDynamic: any
    ): Promise<void> {
        
        await flowDynamic([
            `💰 **Precios Detallados TechAura 2024**`,
            ``,
            `🎵 **1. USB Musical Básica**`,
            `• Precio base: $25.000`,
            `• Descuento actual: -$5.000`,
            `• **Tu precio: $20.000** 🔥`,
            `• Ahorro total: $5.000`,
            ``,
            `⭐ **2. USB Premium Personalizada**`,
            `• Precio base: $45.000`,
            `• Descuento actual: -$10.000`,
            `• **Tu precio: $35.000** 🔥`,
            `• Ahorro total: $10.000`,
            ``,
            `👑 **3. USB VIP Completa**`,
            `• Precio base: $70.000`,
            `• Descuento actual: -$15.000`,
            `• **Tu precio: $55.000** 🔥`,
            `• Ahorro total: $15.000`,
            ``,
            `🚀 **4. USB Mega Colección**`,
            `• Precio base: $95.000`,
            `• Descuento actual: -$20.000`,
            `• **Tu precio: $75.000** 🔥`,
            `• Ahorro total: $20.000`,
            ``,
            `💳 **Formas de Pago Disponibles:**`,
            `• 💰 Efectivo (descuento adicional 5%)`,
            `• 🏦 Transferencia bancaria`,
            `• 📱 Nequi, Daviplata, Bancolombia`,
            `• 💳 Tarjeta de crédito (hasta 3 cuotas sin interés)`,
            ``,
            `🚚 **Costos de Envío:**`,
            `• 🆓 **GRATIS** en todas las opciones`,
            `• 📦 Envío express 24-48 horas`,
            `• 🛡️ Seguro incluido`,
            `• 📍 Cobertura nacional`,
            ``,
            `🎁 **Promociones Activas:**`,
            `• ✨ Diseño personalizado GRATIS (valor $15.000)`,
            `• 🎵 Playlist curada INCLUIDA (valor $10.000)`,
            `• 📦 Envío express SIN COSTO (valor $8.000)`,
            `• 🛡️ Garantía extendida (valor $5.000)`,
            ``,
            `⏰ **Esta oferta termina pronto**`,
            `💬 **¿Te interesa alguna opción específica?**`
        ]);
    }

    static async showComparison(
        ctx: ExtendedContext, 
        flowDynamic: any
    ): Promise<void> {
        
        await flowDynamic([
            `📊 **Comparación Completa de Opciones**`,
            ``,
            `🆚 **Capacidad de Almacenamiento:**`,
            `• Básica: 16GB (4,000 canciones) 🎵`,
            `• Premium: 32GB (8,000 canciones) 🎵🎵`,
            `• VIP: 64GB (16,000 canciones) 🎵🎵🎵`,
            `• Mega: 128GB (32,000 canciones) 🎵🎵🎵🎵`,
            ``,
            `🎨 **Diseño y Personalización:**`,
            `• Básica: Diseño personalizado simple ⭐`,
            `• Premium: Diseño 3D exclusivo ⭐⭐`,
            `• VIP: Diseño premium + grabado láser ⭐⭐⭐`,
            `• Mega: Diseño holográfico único ⭐⭐⭐⭐`,
            ``,
            `🎵 **Contenido Musical:**`,
            `• Básica: Tu música organizada 🎶`,
            `• Premium: Playlist curada por expertos 🎶🎶`,
            `• VIP: Pack musical completo 🎶🎶🎶`,
            `• Mega: Biblioteca musical gigante 🎶🎶🎶🎶`,
            ``,
            `📦 **Accesorios Incluidos:**`,
            `• Básica: USB + envío gratis`,
            `• Premium: + Estuche protector`,
            `• VIP: + Kit completo + cable USB-C`,
            `• Mega: + Kit VIP + múltiples conectores`,
            ``,
            `🛡️ **Garantía y Soporte:**`,
            `• Básica: 1 año + soporte básico`,
            `• Premium: 2 años + soporte premium`,
            `• VIP: 3 años + soporte VIP`,
            `• Mega: 5 años + soporte de por vida`,
            ``,
            `💰 **Relación Precio-Valor:**`,
            `• Básica: $25.000 - Ideal para empezar 💚`,
            `• Premium: $35.000 - Mejor relación calidad-precio 🧡`,
            `• VIP: $55.000 - Máximo valor por tu dinero ❤️`,
            `• Mega: $75.000 - Experiencia premium completa 💜`,
            ``,
            `🎯 **Recomendación según tu perfil:**`,
            `• 🎵 **Uso personal básico** → Básica o Premium`,
            `• 🎁 **Para regalar** → Premium o VIP`,
            `• 👑 **Uso profesional** → VIP o Mega`,
            `• 🚀 **Máxima experiencia** → Mega`,
            ``,
            `💬 **¿Ya sabes cuál se adapta mejor a ti?**`
        ]);
    }
}

// ✅ FLOW PRINCIPAL CORREGIDO
const catalogFlow = addKeyword(['catalogo', 'catalog', 'productos', 'opciones', 'ver usbs'])
.addAction(async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
    try {
        const session = await getUserSession(ctx.from);
        
        // Análisis inteligente para personalizar catálogo
        const routerDecision = IntelligentRouter.makeDecision(
            ctx.body, 
            session, 
            session.interactions?.slice(-3).map(i => i.message) || []
        );

        await flowDynamic([
            `🎵 **¡Bienvenido/a al Catálogo TechAura!**`,
            ``,
            routerDecision.persuasionElements?.valueProposition || `✨ USBs personalizadas que combinan tecnología, música y diseño único`,
            ``,
            routerDecision.persuasionElements?.urgency || `🔥 **PROMOCIÓN ESPECIAL**: Envío gratis + diseño personalizado incluido`,
            ``,
            `👑 **NUESTRAS OPCIONES MÁS POPULARES:**`
        ]);

        // ✅ CORREGIDO: Usar CatalogHelper en lugar de this
        await CatalogHelper.showPersonalizedCatalog(ctx, flowDynamic, routerDecision);
        
        // Elementos de persuasión adicionales
        if (routerDecision.persuasionElements?.socialProof) {
            await flowDynamic([routerDecision.persuasionElements.socialProof]);
        }
        
        if (routerDecision.persuasionElements?.scarcity) {
            await flowDynamic([routerDecision.persuasionElements.scarcity]);
        }

        await flowDynamic([
            ``,
            `💬 **¿Te interesa alguna opción específica?**`,
            ``,
            `🎯 Escribe el número de la opción que más te guste, o cuéntame qué tienes en mente y yo te ayudo a encontrar la perfecta.`,
            ``,
            `💡 **También puedes escribir:**`,
            `• "Más info" + número (ej: "más info 2")`,
            `• "Personalizar" para opciones custom`,
            `• "Precios" para ver detalles de costos`,
            `• "Comparar" para ver diferencias`
        ]);

        // ✅ CORREGIDO: Usar estructura correcta para updateUserSession
        await updateUserSession(
            ctx.from,
            ctx.body,
            'catalogFlow',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'catalog_view',
                confidence: 0.8,
                metadata: {
                    detectionType: 'catalog_access',
                    originalMessage: ctx.body,
                    timestamp: new Date().toISOString()
                }
            }
        );


    } catch (error) {
        console.error('❌ Error en catalogFlow:', error);
        await flowDynamic([
            '🎵 **Catálogo TechAura - USBs Personalizadas**',
            '',
            '¡Ups! Hubo un pequeño problema cargando el catálogo personalizado.',
            'Pero no te preocupes, aquí tienes nuestras mejores opciones:'
        ]);
        // ✅ CORREGIDO: Usar CatalogHelper
        await CatalogHelper.showBasicCatalog(flowDynamic);
    }
})
.addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
    try {
        const userChoice = ctx.body.toLowerCase().trim();
        const session = await getUserSession(ctx.from);

        // Analizar la respuesta del usuario
        if (userChoice.match(/^[1-4]$/)) {
            // Usuario seleccionó una opción específica
            const optionNumber = parseInt(userChoice);
            await CatalogHelper.handleOptionSelection(optionNumber, ctx, flowDynamic, gotoFlow);
            
        } else if (userChoice.includes('más info') || userChoice.includes('mas info')) {
            // Usuario quiere más información
            const optionMatch = userChoice.match(/\d+/);
            if (optionMatch) {
                const optionNumber = parseInt(optionMatch[0]);
                await CatalogHelper.showDetailedInfo(optionNumber, ctx, flowDynamic);
            } else {
                await flowDynamic([
                    '💡 **Para más información específica:**',
                    'Escribe "más info" seguido del número de opción',
                    'Ejemplo: "más info 2" o "mas info 3"'
                ]);
            }
            
        } else if (userChoice.includes('personalizar') || userChoice.includes('custom')) {
            // Usuario quiere personalización avanzada
            return gotoFlow(require('./customizationFlow').default);
            
        } else if (userChoice.includes('precio') || userChoice.includes('costo')) {
            // Usuario pregunta por precios
            await CatalogHelper.showDetailedPricing(ctx, flowDynamic);
            
        } else if (userChoice.includes('comparar') || userChoice.includes('diferencia')) {
            // Usuario quiere comparar opciones
            await CatalogHelper.showComparison(ctx, flowDynamic);
            
        // ✅ AGREGADO: Comandos de carrito
        } else if (userChoice.includes('carrito') || userChoice.includes('cart')) {
            // Usuario quiere ver su carrito
            await CatalogHelper.showCartDetails(ctx, flowDynamic);
            
        } else if (userChoice.includes('estado') || userChoice.includes('compra')) {
            // Usuario quiere ver estado de compra
            await CatalogHelper.checkPurchaseStatus(ctx, flowDynamic);
            
        } else if (userChoice.includes('comprar') || userChoice.includes('pedido')) {
            // Usuario quiere proceder con la compra
            if (isInPurchaseFlow(session)) {
                return gotoFlow(require('./orderFlow').default);
            } else {
                await flowDynamic([
                    '🛒 **Para hacer tu pedido, primero selecciona un producto:**',
                    '',
                    '💡 **Escribe el número de la opción que te guste:**',
                    '• **1** - USB Musical Básica ($25.000)',
                    '• **2** - USB Premium Personalizada ($35.000)',
                    '• **3** - USB VIP Completa ($55.000)',
                    '• **4** - USB Mega Colección ($75.000)'
                ]);
            }
            
        } else {
            // Respuesta libre - usar análisis inteligente
            const routerDecision = IntelligentRouter.makeDecision(
                ctx.body, 
                session, 
                session.interactions?.slice(-3).map(i => i.message) || []
            );
            
            if (routerDecision.shouldRedirect) {
                switch (routerDecision.targetFlow) {
                    case 'orderFlow':
                        return gotoFlow(require('./orderFlow').default);
                    default:
                        break;
                }
            }
            
            if (routerDecision.customResponse) {
                await flowDynamic([routerDecision.customResponse]);
            } else {
                await flowDynamic([
                    '🤔 **Entiendo que buscas algo específico.**',
                    '',
                    '💡 **Puedes:**',
                    '• Elegir un número (1, 2, 3 o 4)',
                    '• Escribir "más info" + número',
                    '• Decir "personalizar" para opciones custom',
                    '• Preguntar "precios" para ver costos',
                    '• Escribir "carrito" para ver tu selección',
                    '• O simplemente contarme qué necesitas',
                    '',
                    '💬 **¿Qué te gustaría hacer?**'
                ]);
            }
        }

        // ✅ CORREGIDO: Usar estructura correcta para updateUserSession
        await updateUserSession(
            ctx.from,
            ctx.body,
            'catalogFlow',
            null,
            false,
            {
                isPredetermined: false,
                messageType: 'catalog_interaction',
                confidence: 0.7,
                metadata: {
                    detectionType: 'catalog_capture',
                    originalMessage: ctx.body,
                    userChoice: userChoice,
                    timestamp: new Date().toISOString()
                }
            }
        );


    } catch (error) {
        console.error('❌ Error procesando selección de catálogo:', error);
        await flowDynamic([
            '💬 **No hay problema, cuéntame de otra forma:**',
            '¿Qué opción del catálogo te interesa más?',
            'O dime qué características buscas en tu USB personalizada.'
        ]);
    }
});

export default catalogFlow;
