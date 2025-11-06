// import { addKeyword, EVENTS } from '@builderbot/bot';
// import datosCliente from './datosCliente.js';

// const capacityUsb = addKeyword([EVENTS.ACTION])
//     // .addAnswer('Quedará con el contenido que nos indicas. Ahora vamos a ver qué USB será la ideal para ti.', { delay: 1000 })
//     // .addAnswer('Tenemos USB de diferentes tamaños, como 8GB, 16GB, 32GB, 64GB, hasta 256GB. Un USB más grande puede almacenar más contenido.', { delay: 1000 })
//     // .addAnswer(['¿Cuáles son más de tu agrado?'].join('\n'), 
//     // { delay: 800, capture: true },
//     // async (ctx, { fallBack, gotoFlow, flowDynamic }) => {
//     //     if(ctx.body.includes('1') || ctx.body.includes('2') || ctx.body.includes('3') || ctx.body.includes('4') || ctx.body.includes('5')) {
//     //         return 0
//     // }}
//     // )
//     // .addAnswer('Lo incluiremos. Tenemos desde poco contenido hasta mucho contenido.', { delay: 1000 })
//     .addAnswer('Ahora, dime aproximadamente cuánto contenido tienes en mente (Ej. muchas canciones o pocas películas).', { delay: 2000 })
//     .addAction({capture: true}, async (ctx, { flowDynamic, gotoFlow }) => {
//         const prices = {'8GB': '$50.000', '16GB': '$65.000', '32GB': '$85.000', '64GB': '$110.000', '128GB': '$150.000'}
//         const content = {'8GB': '260 vídeos HD o 10 películas', '16GB': '500 vídeos HD o 16 películas', '32GB': '1000 vídeos HD o 30 películas', '64GB': '2000 vídeos HD o 60 películas', '128GB': '4000 vídeos HD o 130 películas'}
//         const contentAmount = ctx.body; // Recibimos una estimación de cuánto contenido desea el cliente
//         const contentAmount2 = contentAmount.toLowerCase()
//         let suggestedCapacity = '';

//         // Aquí puedes hacer una lógica para sugerir capacidad según el contenido que el cliente mencione
//         if (contentAmount2.includes('muchas')) {
//             suggestedCapacity = '128GB';
//         } else if (contentAmount2.includes('pocas')) {
//             suggestedCapacity = '8GB';
//         } else {
//             suggestedCapacity = '32GB'; // Valor por defecto
//         }

//         await flowDynamic(`Te recomiendo una USB con ${content[suggestedCapacity]} por ${prices[suggestedCapacity]}.`, { delay: 1000 });
//         return gotoFlow(datosCliente)
        
//         // Solo mostramos el precio cuando el cliente ya ha indicado su preferencia de contenido y capacidad
//         // await provider.sendMessage(ctx.from, `El precio depende del tamaño que elijas. Aquí te dejo algunas opciones:\n8GB - $XX\n16GB - $XX\n32GB - $XX\n128GB - $XX\n¿Cuál prefieres?`);
//     });

// // module.exports = { capacityUsb };
// export default capacityUsb