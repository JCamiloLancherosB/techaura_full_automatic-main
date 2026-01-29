// import { addKeyword, EVENTS } from '@builderbot/bot';
// import contentSelectionFlow from './contentSelectionFlow.js';

// const promosUsbFlow = addKeyword([EVENTS.ACTION])
//     .addAnswer(
//         [
//             '🚀 *¡Transforma tu forma de almacenar y compartir tus recuerdos!*',
//             ' ',
//             '📦 *Elige entre nuestras dos opciones irresistibles:*',
//             ' ',
//             '🔵 *USB 32GB Ultra Versátil*',
//             // '✅ *Ideal para el día a día*:',
//             '   - Almacena hasta 500 videos',
//             '   - Disfruta de 14 películas HD',
//             '   - Escucha hasta 1,000 canciones en MP3',
//             ' ',
//             '💡 *¡Y lo mejor es que es todo en una sola USB!* Perfecto para uso personal y viajes*',
//             ' ',
//             '🔴 *USB 64GB Doble Capacidad*',
//             // '🚀 *¡Duplica tu almacenamiento!*',
//             '   - Almacena hasta 1,000 videos cortos',
//             '   - Mira 20 películas HD',
//             '   - Disfruta de 2,000 canciones',
//             ' ',
//             // '🎁 *¡Beneficios adicionales que no puedes dejar pasar!*',
//             // '👉 *Formateo gratuito* para que empieces sin preocupaciones',
//             // '👉 *Garantía de 1 año*: tu inversión está protegida',
//             // '👉 *Entrega relámpago* en 24-72 hrs: ¡tendrás tu USB en un abrir y cerrar de ojos!',
//             // ' 🔥*¡Y lo mejor es que es todo en una sola USB!*🔥',
//             // '🛒 *¿Listo para mejorar tu almacenamiento?*',
//             '🔥 *Precios especiales:*',
//             '1. USB 32GB por solo *$69.900*',
//             '2. USB 64GB por *$129.900* (¡el doble de capacidad!)',
//             ' ',
//             '💬 *Responde con el número de tu elección o pregunta si tienes dudas. Estoy aquí para ayudarte!* 😊'
//         ].join('\n'),
//         { delay: 1000, capture: true },
//         async (ctx, { gotoFlow }) => {
//             return gotoFlow(contentSelectionFlow);
//         }
//     );

// export default promosUsbFlow;


// ====== SEPARADOR: flows/promosUsbFlow.ts - INICIO ======
import { addKeyword, EVENTS } from '@builderbot/bot';
import contentSelectionFlow from './contentSelectionFlow';

const promosUsbFlow = addKeyword([EVENTS.ACTION])
    .addAnswer(
        [
            '✨ *¡Lleva tu entretenimiento y recuerdos a otro nivel!* ✨',
            '',
            '📀 *Descubre nuestras opciones de USB diseñadas para ti:*',
            '',
            '🔵 *USB 32GB Ultra Versátil*',
            '   ✅ *Ideal para el día a día y viajes.*',
            '   - Almacena hasta *100 videos*.',
            '   - Disfruta de *30 películas en HD*.',
            '   - Lleva contigo hasta *5,000 canciones en MP3*.',
            '',
            '💡 *¡Todo lo que necesitas en un solo dispositivo compacto!*',
            '',
            '🔴 *USB 64GB Doble Capacidad*',
            '   🚀 *Perfecto para quienes necesitan más espacio.*',
            '   - Almacena hasta *2,000 videos cortos*.',
            '   - Mira hasta *66 películas en HD*.',
            '   - Disfruta de *12,000 canciones en MP3*.',
            '',
            '🎁 *Beneficios adicionales que no puedes dejar pasar:*',
            '   - *Formateo gratuito*: lista para usar desde el primer momento.',
            '   - *Garantía de 1 año*: tu inversión está protegida.',
            '   - *Entrega rápida*: recibe tu USB en *24-72 horas*.',
            '',
            '🔥 *Precios especiales por tiempo limitado:*',
            '1️⃣ USB 32GB: *$84,900*',
            '2️⃣ USB 64GB: *$119,900* (¡el doble de capacidad!)',
            '',
            '🛒 *Responde con el número de tu elección para continuar o escribe tus dudas. Estoy aquí para ayudarte!* 😊',
        ].join('\n'),
        { delay: 1200, capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const input = ctx.body.trim();

            if (['1', '2'].includes(input)) {
                await flowDynamic(
                    '✅ *¡Excelente elección!* Tu USB será personalizada con el contenido que elijas. 🎥\n' +
                    '📦 *Ahora seleccionemos las películas, series o música que quieres incluir.*'
                );
                return gotoFlow(contentSelectionFlow);
            } else {
                await flowDynamic(
                    '❓ *¿Tienes alguna pregunta o necesitas ayuda para elegir?*\n' +
                    '💬 *Escríbeme y con gusto te ayudaré a resolver tus dudas.*'
                );
            }
        }
    );

export default promosUsbFlow;
// ====== SEPARADOR: flows/promosUsbFlow.ts - FIN ======