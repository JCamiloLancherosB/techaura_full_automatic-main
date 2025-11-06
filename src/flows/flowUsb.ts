import { addKeyword, EVENTS } from '@builderbot/bot'

import menuFlow from './menuFlow'

// const flowUSB = addKeyword(['personalizable', 'musica', 'videos', 'peliculas', 'series', 'cursos', 'programas', 'videojuegos'])
const flowUSB = addKeyword([EVENTS.ACTION])
    // .addAnswer('¡Genial! Las USB personalizables te permiten llevar lo que más te gusta.', { delay: 2000 })
    // .addAnswer('Será un gusto atenderte, pero primero', { delay: 2000 })
    // .addAnswer('Será un gusto atenderte, pero por favor dime qué tipo de contenido te gustaría que incluyéramos. ¿Te interesan canciones, videos, películas, series, otro tipo de contenido?', { delay: 2000 })
    // .addAnswer('¿Te gustaría algún contenido en especial o prefieres todo variado?', { delay: 2000 })
    .addAction({ capture: true }, async (ctx, { gotoFlow }) => { return gotoFlow(menuFlow) })
        // , { menu, menuFlow })
    // .addAnswer(menu)
    // .addAnswer(menuFlow)

// module.exports = { flowUSB };
// createFlow([flowUSB])
export default flowUSB