// import { addKeyword } from '@builderbot/bot';
// // import menuFlow from './menuFlow.js';
// import moviesUsb from './moviesUsb.js';
// import musicUsb from './musicUsb.js';


// const contentSelectionFlow = addKeyword(['Detalles sobre la promoción de USBs 64GB o 32GB'])
//     .addAnswer(
//         [
//             '✨ *¿Qué quieres incluir en tu USB?* ✨',
//             'Escribe una opción: *películas*, *series*, *música*, *documentos* o *vídeos*. ¡Tú decides el contenido!',
//         ].join('\n'),
//         { delay: 1000, capture: true },
//         async (ctx, { fallBack, flowDynamic, gotoFlow }) => {
//             const input = ctx.body.toLowerCase().trim(); 
//             let response = '';

//             if (input.includes('peliculas') || input.includes('películas')) {
//                 response = '🎬 *¡Genial! Prepárate para horas de entretenimiento.* ¿Tienes alguna película específica en mente o prefieres un mix de géneros?';
//                 return gotoFlow(moviesUsb);
//             } else if (input.includes('series')) {
//                 response = '📺 *¡Perfecto para maratones!* Desde clásicos como *Friends* hasta éxitos como *Stranger Things*. ¿Tienes alguna serie favorita?';
//                 return gotoFlow(moviesUsb);
//             } else if (input.includes('videos') || input.includes('vídeos')) {
//                 response = '🎥 *¡Contenido personalizado!* Podemos incluir tutoriales, vídeos de entretenimiento o lo que necesites. ¿Qué tipo de vídeos buscas?';
//                 return gotoFlow(musicUsb);
//             } else if (input.includes('musica') || input.includes('música')) {
//                 response = '🎵 *¡Lleva tu música favorita a donde vayas!* Dinos tus géneros o artistas preferidos y lo hacemos realidad.';
//                 return gotoFlow(musicUsb);
//             } else if (input.includes('documentos')) {
//                 response = '📂 *¡Todo organizado y accesible!* Guardamos tus documentos importantes de forma segura. ¿Algo específico que necesites?';
//             } else {
//                 return fallBack('✨ *¡Interesante! Cuéntame más sobre lo que quieres incluir en tu USB.*');
//             }

//             await flowDynamic(response);
//         }
//     )
//     // .addAnswer(
//     //     [
//     //         '💥 *Promociones exclusivas para ti:*',
//     //         '1️⃣ *USB 32GB*: Hasta *30 películas* o *1.000 vídeos*. 👉 *$69.900*',
//     //         '2️⃣ *USB 64GB*: Hasta *70 películas* o *2.000 vídeos*. 👉 *$109.900*',
//     //         '3️⃣ *USB 128GB*: *Más de 130 películas* o *+4.000 vídeos* para todo tu contenido. 👉 *$169.900* (30% de descuento en la segunda unidad).',
//     //         '4️⃣ *USB 8GB*: Ideal para *10 películas* o *260 vídeos*. 👉 *$59.900*',
//     //         '🚀 *¡Elige y lleva tu entretenimiento al siguiente nivel!*',
//     //     ].join('\n'),
//     //     { delay: 1500 }
//     // )
//     // .addAnswer(
//     //     ['🛒 *Escribe el número de la promoción que más te interese* para continuar'],
//     //     { delay: 1200, capture: true },
//     //     async (ctx, { flowDynamic, gotoFlow }) => {
//     //         const input = ctx.body.trim(); 

//     //         if (['1', '2', '3', '4'].includes(input)) {
//     //             return gotoFlow(menuFlow);
//     //         } else {
//     //             await flowDynamic('🤔 *No entendí tu respuesta.* Por favor, escribe el número de la promoción que más te interese.');
//     //         }
//     //     }
//     // );

// export default contentSelectionFlow

// ====== SEPARADOR: flows/contentSelectionFlow.ts - INICIO ======

import { addKeyword } from '@builderbot/bot';
import moviesUsb from './moviesUsb';
import musicUsb from './musicUsb';

// --- BLOQUES INFORMATIVOS Y UTILIDADES ---
const PROMO_DETAILS = [
    '🔍 *Detalles de las USB y capacidades:*',
    '--------------------------------------------',
    '🟢 *USB 8GB*: Ideal para estudiantes y documentos, hasta *10 películas* o *260 vídeos cortos* 📁',
    '🔵 *USB 32GB*: Versátil para música, películas y series. *30 películas*, o *1.000 vídeos*, o *5.000 canciones* 🎶',
    '🔴 *USB 64GB*: Perfecta para coleccionistas y maratones. *70 películas*, o *2.000 vídeos*, o *12.000 canciones* 🚀',
    '🟣 *USB 128GB*: Máxima capacidad - *+130 películas*, o *4.000 vídeos*, o *22.000 canciones*, archivos grandes o backups completos 💾',
    '--------------------------------------------',
    '*Incluyen:* Formateo profesional, garantía 1 año, lista para usar, soporte técnico y entrega rápida *24-72h* en Colombia.'
];

const EXAMPLES = [
    '💡 *Ejemplos de contenido que puedes pedir:*',
    '• "Todas las películas de Marvel, Harry Potter y Star Wars"',
    '• "Series animadas y comedias clásicas (Friends, The Office, Rick & Morty)"',
    '• "Documentos de la universidad y backups de fotos familiares"',
    '• "Videos de recetas, tutoriales de Excel y películas de acción"',
    '• "Música de rock en inglés y salsa clásica (Queen, Led Zeppelin, Marc Anthony, Grupo Niche)"'
];

const VALUE_ADD = [
    '🎁 *Ventajas exclusivas*:',
    '• Personalización total: películas, series, música, documentos, videos, backups',
    '• Listas recomendadas o selección personalizada (¡tú decides!)',
    '• Soporte para Smart TV, carro, computador y cualquier dispositivo USB',
    '• Entrega a domicilio en toda Colombia',
    '• Métodos de pago: contraentrega, transferencia, tarjeta, Nequi/Daviplata'
];

const FAQ = [
    '❓ *Preguntas frecuentes:*',
    '— ¿Las películas son en HD? *Sí, la mayoría están en calidad HD o superior.*',
    '— ¿Incluye estrenos recientes? *Sí, actualizamos catálogo cada semana.*',
    '— ¿Puedo pedir contenido para niños o educativo? *Claro, solo indícalo.*',
    '— ¿Puedo mezclar música, videos y documentos en la misma USB? *¡Sí! Es el producto más versátil del mercado.*'
];

const CAPACITY_PROMOS = [
    '💥 *Promociones exclusivas para ti:*',
    '1️⃣ *USB 8GB*: Hasta *10 películas* o *260 vídeos* 👉 *$59.900*',
    '2️⃣ *USB 32GB*: Hasta *30 películas* o *1,000 vídeos* 👉 *$89.900*',
    '3️⃣ *USB 64GB*: Hasta *70 películas* o *2,000 vídeos* 👉 *$129.900*',
    '4️⃣ *USB 128GB*: *Más de 130 películas* o *4,000 vídeos* 👉 *$169.900* (30% de descuento en la segunda unidad)',
    '',
    '🚀 *¡Elige y lleva tu entretenimiento al siguiente nivel!*'
];

// --- FLUJO PRINCIPAL ---
const contentSelectionFlow = addKeyword([
    'Detalles sobre la promoción de USBs 64GB o 32GB',
    'quiero detalles de la promo', 
    'info usb'
])
    .addAnswer(
        [
            '✨ *¡Personaliza tu USB con TODO lo que disfrutas!* ✨',
            'Imagina llevar tus películas, series, música favorita o documentos importantes en tu USB lista para usar, en cualquier parte. 🎁',
            ...PROMO_DETAILS,
            '',
            ...VALUE_ADD,
            '',
            ...FAQ,
            '',
            '💡 *¿Qué quieres incluir? Responde con una o varias opciones:*',
            '👉 *películas*',
            '👉 *series*',
            '👉 *música*',
            '👉 *documentos*',
            '👉 *vídeos*',
            '',
            ...EXAMPLES,
            '🎉 *¡Tú decides el contenido!*'
        ].join('\n'),
        { delay: 1300, capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const input = ctx.body.toLowerCase().trim(); 
            let response = '';

            if (input.includes('peliculas') || input.includes('películas')) {
                response = '🎬 *¡Genial! Prepárate para horas de entretenimiento.*\n\n' +
                    '¿Tienes alguna película o saga específica en mente o prefieres un mix de géneros? ' +
                    'Incluimos clásicos, estrenos, animadas, acción, terror, infantiles y mucho más. ' +
                    '¡Dinos tus gustos o déjalo en nuestras manos!';
                return gotoFlow(moviesUsb);
            } else if (input.includes('series')) {
                response = '📺 *¡Perfecto para maratones!* Desde clásicos como *Friends* hasta éxitos como *Stranger Things*, *The Office*, *Breaking Bad* y más.' +
                    '\n¿Tienes alguna serie favorita, quieres recomendaciones o prefieres combinar géneros?';
                return gotoFlow(moviesUsb);
            } else if (input.includes('videos') || input.includes('vídeos')) {
                response = '🎥 *¡Contenido a tu medida!* Podemos incluir tutoriales, vídeos de entretenimiento, deportes, cursos, o lo que imagines.' +
                    '\nDinos el tipo de vídeos que buscas o tus temas favoritos.';
                return gotoFlow(musicUsb);
            } else if (input.includes('musica') || input.includes('música')) {
                response = '🎵 *¡Lleva tu música favorita siempre contigo!* ' +
                    '\nDinos géneros, artistas, playlists o épocas que te gustan. ¡Creamos una experiencia musical a tu medida!';
                return gotoFlow(musicUsb);
            } else if (input.includes('documentos')) {
                response = '📂 *¡Tus archivos siempre a la mano!* Podemos guardar tus documentos importantes, trabajos de estudio, presentaciones, backups de fotos, PDFs y mucho más.' +
                    '\n¿Hay algo específico que necesitas incluir o tienes dudas sobre formatos compatibles?';
            } else {
                response = '❓ *No entendí tu respuesta.* Por favor, escribe una opción válida como *películas*, *series*, *música*, *documentos* o *vídeos*. ¡Estoy aquí para ayudarte! 😊';
            }

            await flowDynamic(response);
        }
    )
    .addAnswer(
        CAPACITY_PROMOS.join('\n'),
        { delay: 1500 }
    )
    .addAnswer(
        ['🛒 *Escribe el número de la promoción que más te interese* para continuar.'],
        { delay: 1200, capture: true },
        async (ctx, { flowDynamic }) => {
            const input = ctx.body.trim(); 

            if (['1', '2', '3', '4'].includes(input)) {
                await flowDynamic('🎉 *¡Excelente elección!* Un asesor se pondrá en contacto contigo para confirmar tu pedido y ayudarte a personalizar la USB si lo deseas.');
                return;
            } else {
                await flowDynamic('🤔 *No entendí tu respuesta.* Por favor, escribe el número de la promoción que más te interese o dime si tienes alguna duda.');
            }
        }
    );

export default contentSelectionFlow;

// ====== SEPARADOR: flows/contentSelectionFlow.ts - FIN ======
