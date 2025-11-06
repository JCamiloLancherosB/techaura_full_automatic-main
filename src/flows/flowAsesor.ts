import { EVENTS, addKeyword } from '@builderbot/bot'

const flowAsesor = addKeyword([EVENTS.ACTION])
    .addAction({ capture: true }, async (ctx, { endFlow }) => { return endFlow('Describe como te podemos ayudar mientras uno de nuestros asesores se conecta contigo') })
export default flowAsesor