// import { addKeyword, EVENTS } from '@builderbot/bot';
// // import { EVENTS, addKeyword } from "@bot-whatsapp/bot";

// const flowHeadPhones = addKeyword(EVENTS.ACTION)
//     .addAnswer('¿Cuáles audífonos te gustarían?', { delay: 1000 })
//     .addAction({ capture: true },
//     async (ctx, { fallBack, flowDynamic }) => {    
//     switch (ctx.body) {
//     case "1":
//         return await flowDynamic("Inalambricos")
//     case "inalambricos":
//         return await flowDynamic("Inalambricos")
//     case "2":
//     case "normales":
//         return await flowDynamic("Inalambricos")
//     case "3":
//     case "cable":
//         return await flowDynamic("Inalambricos")
//     }
//     if (!["1", "2", "3"].includes(ctx.body) && !["inalambricos", "normales", "cable"].includes(ctx.body)) {
//         return fallBack(
//         // "Respuesta no válida, por favor selecciona una de las opciones."
//     )
//         }    
// }
// )
// // .addAnswer('THIS IS FLOWHEADPHONES')

// // module.exports = flowHeadPhones;
// // createFlow([flowHeadP])

// export default flowHeadPhones;

import { addKeyword, EVENTS } from '@builderbot/bot';

// Opciones dinámicas de audífonos
const headphonesOptions = {
    wireless: {
        title: "🎧 *Audífonos Inalámbricos*",
        description: [
            "🔋 *Batería de larga duración* para disfrutar todo el día.",
            "🌟 *Conexión Bluetooth estable* y rápida.",
            "🎶 *Sonido envolvente* para música y llamadas.",
        ],
        url: "https://mi-catalogo.com/inalambricos", // Enlace al catálogo o imagen
    },
    cable: {
        title: "🎧 *Audífonos con Cable*",
        description: [
            "🔌 *Conexión directa* sin interrupciones.",
            "🎵 *Calidad de sonido profesional* para cualquier dispositivo.",
            "💪 *Duraderos y resistentes* para uso diario.",
        ],
        url: "https://mi-catalogo.com/cable", // Enlace al catálogo o imagen
    },
};

const flowHeadPhones = addKeyword(EVENTS.ACTION)
    .addAnswer(
        [
            '🎧 *¡Elige tus audífonos ideales!*',
            '',
            '1️⃣ *Inalámbricos*',
            '2️⃣ *Con cable*',
            '',
            '✍️ *Escribe el número o tipo de audífonos que prefieras.*',
        ].join('\n'),
        { delay: 1000, capture: true }
    )
    .addAction({ capture: true }, async (ctx, { fallBack, flowDynamic }) => {
        const input = ctx.body.toLowerCase().trim();

        // Opciones válidas
        const wirelessKeywords = ["1", "inalámbricos", "inalambricos"];
        const cableKeywords = ["2", "cable"];

        // Respuesta para audífonos inalámbricos
        if (wirelessKeywords.includes(input)) {
            const option = headphonesOptions.wireless;
            return await flowDynamic([
                option.title,
                ...option.description,
                `📷 *Mira más detalles aquí*: [Catálogo](${option.url})`,
            ]);
        }

        // Respuesta para audífonos con cable
        if (cableKeywords.includes(input)) {
            const option = headphonesOptions.cable;
            return await flowDynamic([
                option.title,
                ...option.description,
                `📷 *Mira más detalles aquí*: [Catálogo](${option.url})`,
            ]);
        }

        // Respuesta para entradas no válidas
        return fallBack(
            '❓ *No entendí tu respuesta.* Por favor, elige una opción válida:\n\n' +
            '1️⃣ *Inalámbricos*\n' +
            '2️⃣ *Con cable*'
        );
    });

export default flowHeadPhones;
