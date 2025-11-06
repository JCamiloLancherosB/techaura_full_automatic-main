// import { addKeyword } from '@builderbot/bot';

// const promoAudSD = addKeyword(['microSD', 'personalizar', 'audífonos + microSD'])
//     .addAnswer('¡Hola! ¿Te gustaría en combo con la microSD o solo audífonos?', { delay: 1000 })
//     .addAnswer(
//         [
//             '1. Busco solo los audífonos',
//             '2. Personalizar música de microSD'
//         ].join('\n'),
//         { delay: 1000, capture: true },
//         async (ctx, { flowDynamic }) => {
//             const response = ctx.body.trim();
            
//             if (response === '1') {
//                 await flowDynamic([
//                     'Perfecto, son audífonos que te permiten remover el micrófono y volver a ponerlo siempre que quieras, trae una excelente carga, micrófono y caja de entrega.'
//                 ]);
//             } else if (response === '2') {
//                 await flowDynamic([
//                     'Perfecto, indícanos los géneros, artistas o tipos de música que te gustaría incluir. Ejemplo: Salsa, Reggaetón, Baladas, etc.'
//                 ]);
//             } else {
//                 await flowDynamic('Por favor escribe "1" para personalizar o "2" para variado.');
//                 return;
//             }
//         }
//     )
//     .addAnswer('El precio para los audífonos es de $149.000, con la microSD incluída con música a tu gusto en $189.000 ¿Te gustaría conocer algún otro detalle?', { delay: 1000, capture: true })
//     .addAction({ capture: true }, async (ctx, { flowDynamic }) => {
//         const confirm = ctx.body.trim().toLowerCase();
//         if (['sí', 'si', 'claro', 'ok', 'quiero'].some(word => confirm.includes(word))) {
//             await flowDynamic([
//                 '¡Excelente! Por favor, regálanos los siguientes datos para procesar tu pedido:',
//                 '► Nombre completo',
//                 '► Número de celular',
//                 '► Dirección de envío (ciudad, barrio y detalles completos)',
//                 'Envío gratis y pago contra entrega. 😊'
//             ].join('\n'));
//         } else {
//             await flowDynamic('Entendido, si necesitas algo más, no dudes en contactarnos. ¡Gracias!');
//         }
//         })

// export default promoAudSD;
