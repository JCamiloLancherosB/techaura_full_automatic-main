import { addKeyword, EVENTS } from '@builderbot/bot';
// import capacityUsb from "./capacityUsb.js";

const customUsb = addKeyword([EVENTS.ACTION])
    .addAnswer('¡Excelente elección! Ahora, dime más sobre tus gustos. ¿Te gustaría contenido de algún artista, géneros o estilos en particular?', { delay: 2000 })
    // .addAction({ capture: true }, async (ctx, { gotoFlow }) => {
    //     // const details = ctx.body; // Recibimos detalles específicos (año, género, artistas, etc.)
        
    //     // Aquí pasamos a la parte de la capacidad de la USB, pero lo haremos de forma más sencilla
    //     return gotoFlow(capacityUsb);
    // });

// module.exports = { customUsb };
export default customUsb