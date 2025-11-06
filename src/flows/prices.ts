import { join } from 'path';
import { addKeyword, EVENTS } from '@builderbot/bot';

const prices = addKeyword([EVENTS.ACTION])
.addAnswer('Aquí está la lista de cuánto contenido puedes llevar', { delay: 1000 })
.addAnswer('Enviando imagen...', { media: join(process.cwd(), '..', '..', 'Productos', 'PPrices', 'prices.png'), delay: 1000 })
.addAnswer('¿Te encuentras interesado en la de 8gb, 16gb, 32gb, 64gb, 128gb, o más?', { delay: 1000 })
.addAction({ capture: true }, async( ctx ) => {
    const message = ctx.body.toLowerCase(); // Convertir el mensaje a minúsculas para comparaciones insensibles a mayúsculas

    switch (true) {
        case message.includes("8 gb"):
        case message.includes("8gb"):
            // Lógica para 8 GB
            break;

        case message.includes("16 gb"):
        case message.includes("16gb"):
            // Lógica para 16 GB
            break;

        case message.includes("32 gb"):
        case message.includes("32gb"):
            // Lógica para 32 GB
            break;

        case message.includes("64 gb"):
        case message.includes("64gb"):
            // Lógica para 64 GB
            break;

        case message.includes("128 gb"):
        case message.includes("128gb"):
            // Lógica para 128 GB
            break;

        case ["más", "mas", "mayor", "mucha"].some(word => message.includes(word)):
            // Lógica para términos como "más", "mas", "mayor", "mucha"
            break;

        default:
            // Lógica por defecto
            break;
    }
    
})
// .addAnswer('Enviando video...', {
//     media: 'https://media.giphy.com/media/LCohAb657pSdHv0Q5h/giphy.mp4',
// })
// .addAnswer('Enviando audio...', { media: 'https://cdn.freesound.org/previews/728/728142_11861866-lq.mp3' })
// .addAnswer('Enviando archivo...', {
//     media: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
// });

export default prices