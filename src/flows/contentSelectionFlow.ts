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
    '🔍 *Detalles de las USB y capacidades disponibles:*',
    '--------------------------------------------',
    '🟢 *USB 8GB*: Ideal para estudiantes y documentos, hasta *10 películas* o *260 vídeos cortos* o *1,400 canciones* 📁',
    '🔵 *USB 32GB*: Versátil para música, películas y series. *30 películas*, o *1,000 vídeos*, o *5,000 canciones* (artistas: Bad Bunny, Marc Anthony, Queen...) 🎶',
    '🔴 *USB 64GB*: Perfecta para coleccionistas y maratones. *70 películas*, o *2,000 vídeos*, o *10,000 canciones* (sagas completas: Marvel, Star Wars...) 🚀',
    '🟣 *USB 128GB*: Máxima capacidad - *+130 películas*, o *4,000 vídeos*, o *25,000 canciones*, archivos grandes o backups completos 💾',
    '--------------------------------------------',
    '*Incluyen:* Formateo profesional, contenido organizado por carpetas, garantía 1 año, lista para usar, soporte técnico y entrega rápida *24-72h* en Colombia.'
];

const EXAMPLES = [
    '💡 *Ejemplos de contenido que puedes pedir:*',
    '• "Todas las películas de Marvel, Harry Potter y Star Wars en HD"',
    '• "Series animadas y comedias: Friends, The Office, Rick & Morty, Bob Esponja"',
    '• "Documentos universitarios y backups de fotos familiares"',
    '• "Videos de recetas, tutoriales de Excel y películas de acción"',
    '• "Música de reggaetón: Bad Bunny, Karol G, Maluma, J Balvin"',
    '• "Salsa clásica: Marc Anthony, Joe Arroyo, Grupo Niche, Willie Colón"',
    '• "Rock internacional: Queen, Metallica, AC/DC, Led Zeppelin"',
    '• "Baladas románticas: Ricardo Arjona, Maná, Luis Miguel, Sin Bandera"'
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
                    '🎥 *Contenido disponible:*\n' +
                    '• Sagas completas: Marvel (Avengers, Spider-Man), DC (Batman, Superman)\n' +
                    '• Clásicos: Star Wars, Harry Potter, LOTR, Jurassic Park\n' +
                    '• Acción: Rápidos y Furiosos, John Wick, Misión Imposible\n' +
                    '• Animadas: Disney/Pixar (Toy Story, Frozen, Coco, Moana)\n\n' +
                    '¿Tienes películas o sagas específicas en mente o prefieres un mix de géneros? ' +
                    '¡Dinos tus gustos o déjalo en nuestras manos!';
                return gotoFlow(moviesUsb);
            } else if (input.includes('series')) {
                response = '📺 *¡Perfecto para maratones y entretenimiento sin fin!*\n\n' +
                    '🎬 *Series disponibles:*\n' +
                    '• Clásicas: Friends, The Office, Seinfeld\n' +
                    '• Drama: Breaking Bad, Game of Thrones, Peaky Blinders\n' +
                    '• Acción: Stranger Things, The Walking Dead, La Casa de Papel\n' +
                    '• Comedias: Brooklyn Nine-Nine, How I Met Your Mother\n' +
                    '• Animadas: Rick & Morty, Los Simpson, Bob Esponja\n\n' +
                    '¿Tienes alguna serie favorita, quieres recomendaciones o prefieres combinar géneros?';
                return gotoFlow(moviesUsb);
            } else if (input.includes('videos') || input.includes('vídeos')) {
                response = '🎥 *¡Videoclips musicales en HD y 4K!*\n\n' +
                    '🎬 *Artistas con videoclips disponibles:*\n' +
                    '• Reggaetón: Bad Bunny, Karol G, Daddy Yankee, Maluma\n' +
                    '• Salsa: Marc Anthony, Joe Arroyo, Willie Colón\n' +
                    '• Rock: Queen, Metallica, Guns N\' Roses\n' +
                    '• Pop: Shakira, Ariana Grande, Taylor Swift\n\n' +
                    'También incluimos tutoriales, videos deportivos y contenido educativo. ' +
                    '¿Qué tipo de videos te interesan más?';
                return gotoFlow(musicUsb);
            } else if (input.includes('musica') || input.includes('música')) {
                response = '🎵 *¡Lleva tu música favorita siempre contigo!*\n\n' +
                    '🎤 *Géneros y artistas disponibles:*\n' +
                    '• Reggaetón: Bad Bunny, Karol G, J Balvin, Maluma\n' +
                    '• Salsa: Marc Anthony, Joe Arroyo, Gilberto Santa Rosa\n' +
                    '• Vallenato: Diomedes Díaz, Silvestre Dangond\n' +
                    '• Rock: Queen, Metallica, AC/DC, Nirvana\n' +
                    '• Baladas: Ricardo Arjona, Maná, Luis Miguel\n\n' +
                    '¡Dinos géneros, artistas, playlists o épocas que te gustan y creamos tu USB musical perfecta!';
                return gotoFlow(musicUsb);
            } else if (input.includes('documentos')) {
                response = '📂 *¡Tus archivos importantes siempre seguros y a la mano!*\n\n' +
                    '💼 *Podemos incluir:*\n' +
                    '• Documentos de trabajo o estudio (Word, Excel, PDF)\n' +
                    '• Presentaciones y proyectos\n' +
                    '• Backups de fotos y videos familiares\n' +
                    '• Libros digitales y manuales\n' +
                    '• Cualquier archivo que necesites llevar contigo\n\n' +
                    '¿Hay algo específico que necesitas incluir o tienes dudas sobre formatos compatibles?';
            } else {
                response = '❓ *No entendí tu respuesta.* Por favor, escribe una opción válida:\n\n' +
                    '• *películas* - Sagas, clásicos, estrenos\n' +
                    '• *series* - Comedias, dramas, acción\n' +
                    '• *música* - Todos los géneros y artistas\n' +
                    '• *documentos* - Archivos personales\n' +
                    '• *vídeos* - Videoclips musicales en HD\n\n' +
                    '¡Estoy aquí para ayudarte! 😊';
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
