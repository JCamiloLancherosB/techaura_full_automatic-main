import { addKeyword } from '@builderbot/bot';

import menuTech from './menuTech';

const flowTechnology = addKeyword(['tecnologia', 'productos', 'tecnología'],)
    // .addAnswer('¡Hola! Aquí te muestro algunos de nuestros productos: ')
    .addAnswer(
        '1. Audífonos\n' +
        '2. Cargadores\n' +
        '3. Parlantes\n' +
        '4. Proyectores\n' +
        '5. PowerBanks\n' +
        '\nPor favor, dime el número del producto que te interesa.', { delay:2000 })
        .addAction({ capture: true }, async (ctx, { gotoFlow }) => { return gotoFlow(menuTech) })

// module.exports = { flowTecnologia };
export default flowTechnology