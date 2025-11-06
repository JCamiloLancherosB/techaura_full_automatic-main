import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import type { UserSession } from '../../types/global';

// --- Configuración de capacidades de video ---
const videoCapacities = [
    {
        size: "32GB",
        videoCount: "500+ videos HD",
        price: 89900,
        description: "Ideal para una colección básica de videos musicales",
        features: ["Videos en HD", "Compatibilidad total", "Organizado por géneros"]
    },
    {
        size: "64GB", 
        videoCount: "1,200+ videos HD/4K",
        price: 129900,
        description: "Perfecta para amantes de la música visual",
        features: ["Videos HD y 4K", "Mejor calidad", "Más variedad de artistas"],
        popular: true
    },
    {
        size: "128GB",
        videoCount: "2,500+ videos 4K",
        price: 169900,
        description: "La colección más completa de videos musicales",
        features: ["Máxima calidad 4K", "Colección premium", "Videos exclusivos"]
    },
    {
        size: "256GB",
        videoCount: "5,000+ videos 4K Ultra",
        price: 219900,
        description: "Para coleccionistas y profesionales",
        features: ["Ultra HD 4K", "Videos raros y exclusivos", "Calidad cinematográfica"],
        premium: true
    }
];

// --- Promociones destacadas ---
const videoPromotions = [
    "🎬 *Videos en calidad 4K disponibles - Experiencia cinematográfica*",
    "📱 *Compatible con Smart TV, celular, tablet y computador*",
    "🎁 *OFERTA ESPECIAL: 30% descuento en segunda USB de videos*",
    "🚚 *Envío gratis + garantía de por vida en todos los videos*",
    "⚡ *Instalación instantánea - Plug & Play*"
];

// --- Sugerencia de ventas cruzadas ---
async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any) {
    if (currentProduct === 'music') {
        await flowDynamic(
            '🎬 *¿Te gustaría añadir la USB de VIDEOS MUSICALES a tu pedido?*\n\n' +
            '👉 *Más de 10,000 videoclips en HD y 4K de todos los géneros.*\n' +
            '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
            '¿Quieres ver la colección de videos? Responde con *QUIERO USB DE VIDEOS* o *VER VIDEOS*.'
        );
    } else {
        await flowDynamic(
            '🎵 *¿Te gustaría añadir la USB de MÚSICA a tu pedido?*\n\n' +
            '👉 *La mejor selección de géneros, artistas y playlists exclusivas.*\n' +
            '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
            '¿Quieres ver la colección de música? Responde con *QUIERO USB DE MUSICA* o *VER MUSICA*.'
        );
    }
}

// --- Flujo principal de capacidades de video ---
const capacityVideo = addKeyword([EVENTS.ACTION])
.addAction(async (ctx, { flowDynamic }) => {
    try {
        const session = await getUserSession(ctx.from);
        await updateUserSession(
            ctx.from, 
            ctx.body, 
            'capacityVideo_initial',
            null, 
            false,
            {
                metadata: session 
            }
        );


        await flowDynamic([
            '🎬 *¡Perfecto! Ahora elige la capacidad ideal para tu USB de videos:*',
            '',
            videoPromotions[0],
            videoPromotions[1]
        ]);

        // Mostrar capacidades con detalles y persuasión
        for (let i = 0; i < videoCapacities.length; i++) {
            const capacity = videoCapacities[i];
            let message = `${i + 1}️⃣ *${capacity.size}* - ${capacity.videoCount}\n`;
            message += `💰 *$${capacity.price.toLocaleString('es-CO')}*\n`;
            message += `📝 ${capacity.description}\n`;
            if (capacity.popular) message += `🔥 *¡MÁS POPULAR!*\n`;
            if (capacity.premium) message += `👑 *PREMIUM*\n`;
            message += `✅ ${capacity.features.join('\n✅ ')}`;
            await flowDynamic(message);
        }

        await flowDynamic([
            '',
            videoPromotions[2],
            videoPromotions[3],
            '',
            '🔢 *Responde con el número (1-4) de la capacidad que prefieres*'
        ]);

    } catch (error) {
        console.error('Error mostrando capacidades de video:', error);
        await flowDynamic('⚠️ Error al cargar las opciones. Intenta nuevamente.');
    }
})
.addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    try {
        const userInput = ctx.body.trim();
        const choice = parseInt(userInput, 10);
        const session = await getUserSession(ctx.from);

        await updateUserSession(
            ctx.from, 
            userInput,
            'capacityVideo_selected',
            null, 
            false,
            {
                metadata: session
            }
        );


        if (choice >= 1 && choice <= videoCapacities.length) {
            const selectedCapacity = videoCapacities[choice - 1];

            // Calcular descuentos especiales automáticos
            let finalPrice = selectedCapacity.price;
            let discountMessage = "";

            if (choice >= 3) { // 128GB o más
                const discount = Math.floor(selectedCapacity.price * 0.15);
                finalPrice = selectedCapacity.price - discount;
                discountMessage = `\n🎁 *¡Descuento especial de $${discount.toLocaleString('es-CO')}!*`;
            }

            await flowDynamic([
                `🎯 *¡Excelente elección!*`,
                '',
                `📱 *USB de Videos ${selectedCapacity.size}*`,
                `🎬 ${selectedCapacity.videoCount}`,
                `💰 Precio: ~~$${selectedCapacity.price.toLocaleString('es-CO')}~~ *$${finalPrice.toLocaleString('es-CO')}*${discountMessage}`,
                '',
                `✅ ${selectedCapacity.features.join('\n✅ ')}`,
                '',
                videoPromotions[4],
                '',
                '📋 *Para completar tu pedido, por favor envíanos:*',
                '👤 Nombre completo',
                '📱 Número de celular',
                '🏙️ Ciudad',
                '🏠 Barrio y dirección completa',
                '',
                '💳 *Métodos de pago disponibles:*',
                '• Transferencia bancaria',
                '• Nequi/Daviplata',
                '• Efectivo contraentrega',
                '',
                '🚚 *Envío gratis a toda Colombia*'
            ].join('\n'));

            session.stage = 'converted';
            session.cartData = undefined;
            await updateUserSession(
                ctx.from,
                `selected_video_capacity:${selectedCapacity.size}:${finalPrice}`,
                'capacity_confirmed',
                null,
                false,
                {
                    metadata: session // Mover session aquí
                }
            );


            // Ventas cruzadas: ofrecer música tras elección de video
            await crossSellSuggestion('video', flowDynamic);

            // Flujo de procesamiento de pedido
            return gotoFlow(orderProcessing);

        } else {
            await flowDynamic([
                '❌ Opción no válida. Por favor responde con un número del 1 al 4.',
                '',
                '🔢 Ejemplo: Escribe *2* para elegir 64GB'
            ]);
        }

    } catch (error) {
        console.error('Error procesando selección de capacidad de video:', error);
        await flowDynamic('⚠️ Error al procesar tu selección. Intenta nuevamente.');
    }
});

export default capacityVideo;