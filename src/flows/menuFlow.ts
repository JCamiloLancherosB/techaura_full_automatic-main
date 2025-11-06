import { addKeyword, EVENTS } from '@builderbot/bot'

import musicUsb from './musicUsb';
import moviesUsb from './moviesUsb';

const menuFlow = addKeyword(EVENTS.ACTION)
    .addAction({ capture: true },
        async (ctx, { gotoFlow, fallBack }) => {
            ctx.body = ctx.body.toLowerCase()
            
            const contieneCanciones = ctx.body.toLowerCase().includes("canciones");
            const contienemusica = ctx.body.toLowerCase().includes("musica");
            const contieneVideos = ctx.body.toLowerCase().includes("videos");
            const contienePeliculas = ctx.body.toLowerCase().includes("peliculas");
            const contieneSeries = ctx.body.toLowerCase().includes("series");

            switch (true) {
                case contieneCanciones:
                case contienemusica:
                    return gotoFlow(musicUsb);
            }
            switch (true) {
                case contieneVideos:
                    return gotoFlow(musicUsb);
            }
            switch (true) {
                case contienePeliculas:
                    return gotoFlow(moviesUsb);
            }
            switch (true) {
                case contieneSeries:
                    return gotoFlow(moviesUsb);
            }

            // switch (ctx.body) {
            //     case "canciones":
            //     case "Canciones":
            //         return gotoFlow(detailsUsb);
            //     case "videos":
            //     case "Videos":
            //         return gotoFlow(detailsUsb);
            //     case "peliculas":
            //     case "Peliculas":
            //         return gotoFlow(detailsUsb);
            //     case "series":
            //     case "Series":
            //         return gotoFlow(detailsUsb);
            //     case "otro contenido":
            //     case "Otro contenido":
            //         return gotoFlow(detailsUsb);
            //     case "otro":
            //     case "Otro":
            //         return gotoFlow(detailsUsb);
            //     // case "0":
            //     // return await flowDynamic(
            //     // "Saliendo... Puedes volver a acceder a este menú escribiendo '*Menu"
            //     // );
            //     }  
            if (!["canciones", "videos", "peliculas", "series", "otro contenido", "otro"].includes(ctx.body)) {
                console.log(ctx.body)
                return fallBack(
                    // "Respuesta no válida, por favor selecciona una de las opciones."
                )
                // return fallBack(
                //     "Respuesta no válida, por favor selecciona una de las opciones."
                // );
            }
    })

// createFlow([menuFlow])
// module.exports = menuFlow;
export default menuFlow