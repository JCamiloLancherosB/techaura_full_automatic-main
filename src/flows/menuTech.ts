// import { addKeyword, EVENTS } from '@builderbot/bot';
// import flowHeadPhones from './flowHeadPhones.js';

// const menuTech = addKeyword(EVENTS.ACTION)
//     .addAction({ capture: false },

//     async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
//     let productText = ''    

//     switch (ctx.body) {
//     case "1": 
//     case "audifonos":
//         productText = 'audifonos'
//         await flowDynamic(`Tenemos audífonos para todos, ¡muy fáciles de usar! ¿Te gustaría ver los inalámbricos o los normales?`)
//         return gotoFlow(flowHeadPhones)
//     case "2":
//     case"cargadores":
//         productText = 'cargadores'
//         await flowDynamic(`Vendemos cargadores que cargan rápido tu teléfono. ¿Prefieres uno con cable o sin cable?`)
//         break;
//     case "3":
//     case "parlantes":
//         productText = 'parlantes'
//         await flowDynamic(`Tenemos parlantes pequeños y fáciles de llevar. ¿Te gustaría ver uno portátil o uno más grande?`)
//         break;
//     case "4":
//     case "proyectores":
//         productText = 'proyectores'
//         await flowDynamic(`Los proyectores te permiten ver cosas grandes en la pared. ¿Te gustaría ver uno pequeño o uno para exteriores?`)
//         break;
//     case "5":
//     case "otros":
//         // eslint-disable-next-line @typescript-eslint/no-unused-vars
//         productText = 'otros productos'
//         await flowDynamic(`Tenemos otros productos como relojes inteligentes y más. ¿Te gustaría ver algo especial?`)
//         break;
//     case "0":
//         await flowDynamic("Saliendo... Puedes volver a acceder a este menú escribiendo '*Menu")
//         break;
//     }

//     if (!["1", "2", "3", "4", "5", "0"].includes(ctx.body) && !["audifonos", "cargadores", "parlantes", "proyectores"].includes(ctx.body)) {
//     return fallBack(        
//     // "Respuesta no válida, por favor selecciona una de las opciones."
//     )}

//     }
// );

// // module.exports = menuTech;
// // createFlow([menuTech])

// export default menuTech

import { addKeyword, EVENTS } from '@builderbot/bot';
import flowHeadPhones from './flowHeadPhones';

const menuTech = addKeyword(EVENTS.ACTION)
    .addAnswer(
        [
            '🔧 *¡Bienvenido al catálogo de tecnología que hará tu vida más fácil y emocionante!*',
            '',
            '1️⃣ *🎧 Audífonos*: Lleva tu música a otro nivel.',
            '2️⃣ *🔋 Cargadores*: Nunca te quedes sin batería.',
            '3️⃣ *🔊 Parlantes*: Llena cada espacio con el mejor sonido.',
            '4️⃣ *📽️ Proyectores*: Convierte cualquier lugar en un cine.',
            '5️⃣ *🛒 Otros productos*: ¡Explora gadgets increíbles!',
            '',
            '0️⃣ *Salir*',
            '',
            '✍️ *Escribe el número o el nombre del producto que te interesa y descubre nuestras ofertas exclusivas.*',
        ].join('\n'),
        { delay: 1000, capture: true }
    )
    .addAction({ capture: true }, async (ctx, { gotoFlow, flowDynamic }) => {
        const input = ctx.body.toLowerCase().trim();

        switch (input) {
            case "1":
            case "audifonos":
                await flowDynamic(
                    '🎧 *¡Descubre los audífonos que todos quieren!* 🎶\n' +
                    '✔️ *Calidad de sonido premium* para disfrutar de cada detalle.\n' +
                    '✔️ *Diseño cómodo y moderno* para usarlos todo el día.\n' +
                    '✔️ *Precios especiales por tiempo limitado.*\n\n' +
                    '¿Te gustaría ver los *inalámbricos* o los *con cable*?'
                );
                return gotoFlow(flowHeadPhones);

            case "2":
            case "cargadores":
                await flowDynamic(
                    '🔋 *¡No te quedes sin energía nunca más!* ⚡\n' +
                    '✔️ *Cargadores rápidos y seguros* para tus dispositivos.\n' +
                    '✔️ *Modelos con cable e inalámbricos* para adaptarse a tu estilo.\n' +
                    '✔️ *Ofertas exclusivas disponibles hoy.*\n\n' +
                    '¿Prefieres uno *con cable* o *inalámbrico*?'
                );
                break;

            case "3":
            case "parlantes":
                await flowDynamic(
                    '🔊 *¡Lleva la fiesta contigo a donde vayas!* 🎉\n' +
                    '✔️ *Sonido potente y claro* en todos nuestros parlantes.\n' +
                    '✔️ *Diseños portátiles y elegantes* para cualquier ocasión.\n' +
                    '✔️ *Precios irresistibles por tiempo limitado.*\n\n' +
                    '¿Te gustaría ver uno *portátil* o uno *más grande*?'
                );
                break;

            case "4":
            case "proyectores":
                await flowDynamic(
                    '📽️ *¡Transforma tu hogar en un cine privado!* 🍿\n' +
                    '✔️ *Proyectores compactos y fáciles de usar*.\n' +
                    '✔️ *Perfectos para películas, videojuegos o presentaciones.*\n' +
                    '✔️ *Promociones exclusivas por tiempo limitado.*\n\n' +
                    '¿Te gustaría ver uno *pequeño* o uno *para exteriores*?'
                );
                break;

            case "5":
            case "otros":
                await flowDynamic(
                    '🛒 *¡Explora nuestra selección de gadgets que mejorarán tu vida!* 💡\n' +
                    '✔️ *Relojes inteligentes, accesorios y más.*\n' +
                    '✔️ *Innovación y calidad garantizadas.*\n' +
                    '✔️ *Precios especiales por tiempo limitado.*\n\n' +
                    '¿Te gustaría ver algo en especial?'
                );
                break;

            case "0":
                await flowDynamic(
                    '👋 *Gracias por visitarnos.*\n' +
                    'Recuerda que puedes volver a este menú escribiendo "*Menu*". ¡Te esperamos pronto!'
                );
                break;

            // default:
            //     return fallBack(
            //         '❌ *Opción no válida.* Por favor, selecciona una de las opciones del menú:\n\n' +
            //         '1️⃣ *🎧 Audífonos*\n' +
            //         '2️⃣ *🔋 Cargadores*\n' +
            //         '3️⃣ *🔊 Parlantes*\n' +
            //         '4️⃣ *📽️ Proyectores*\n' +
            //         '5️⃣ *🛒 Otros productos*\n' +
            //         '0️⃣ *Salir*'
            //     );
        }
    });

export default menuTech;
