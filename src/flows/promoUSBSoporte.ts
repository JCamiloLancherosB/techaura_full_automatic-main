import { join } from 'path';
import { addKeyword } from '@builderbot/bot';

const promoUSBSoporte = addKeyword(['soporte usb radio', 'soporte para celular'])
    .addAnswer('🎉 ¡Oferta especial! Soporte para celular + Memoria USB para el radio por *$89.000*', { delay: 1000 })
    .addAnswer('Con esta memoria puedes llevar música personalizada para tu radio o todo variado, ¡tú decides!', { delay: 1000 })
    .addAnswer('Enviando ejemplos...', {
        media: join(process.cwd(), '..', '..', 'Promos', 'SoporteUsbRadio', 'combo.jpg'),
        delay: 1000,
    })
    .addAnswer('¿Te gustaría personalizar la música o prefieres que todo sea variado?', { delay: 1000 })
    .addAction({ capture: true }, async (ctx, { flowDynamic }) => {
        const message = ctx.body.toLowerCase();

        if (message.includes('personalizar')) {
            await flowDynamic('¡Perfecto! Indica los géneros o artistas que te gustaría incluir en la memoria USB. 😊');
        } else if (message.includes('variado')) {
            await flowDynamic(
                '¡Genial! Te enviaremos la memoria con una selección variada de los mejores éxitos. 🎶'
            );
        } else {
            await flowDynamic(
                'Por favor indícame si prefieres personalizar la música o que sea todo variado. 🤔'
            );
        }
    })
    .addAnswer('Por favor, confirma si deseas cerrar el pedido. 🙌')
    .addAction({ capture: true }, async (ctx, { flowDynamic }) => {
        const confirmation = ctx.body.toLowerCase();

        if (['sí', 'si', 'aceptar', 'cerrar', 'confirmar'].some(word => confirmation.includes(word))) {
            await flowDynamic([
                'Perfecto, estos son los datos que necesitamos para el envío: 📦',
                '1️⃣ *Nombre completo*\n2️⃣ *Número de celular*\n3️⃣ *Ciudad y barrio*\n4️⃣ *Dirección completa*',
                'El envío es gratis y el pago se realiza contra entrega. 🚛💨',
            ]);
        } else {
            await flowDynamic('Sin problema, avísame si necesitas más información o tienes alguna duda. 😊');
        }
    });

export default promoUSBSoporte;
