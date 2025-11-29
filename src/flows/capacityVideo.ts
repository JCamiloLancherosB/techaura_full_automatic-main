// // capacityVideo.ts
// import { addKeyword, EVENTS } from '@builderbot/bot';
// import orderProcessing from './orderProcessing';
// import { updateUserSession, getUserSession } from './userTrackingSystem';
// import type { UserSession } from '../../types/global';
// import { offerCrossSellIfAllowed } from './videosUsb'; // reutilizamos el helper tipado
// import { preHandler, postHandler } from './middlewareFlowGuard';

// // types locales
// type CapacityOption = {
//   size: "32GB" | "64GB" | "128GB" | "256GB";
//   videoCount: string;
//   price: number;
//   description: string;
//   features: readonly string[];
//   popular?: boolean;
//   premium?: boolean;
// };

// // --- Configuración de capacidades de video ---
// const videoCapacities: readonly CapacityOption[] = [
//   {
//     size: "32GB",
//     videoCount: "500+ videos HD",
//     price: 89900,
//     description: "Ideal para una colección básica de videos musicales",
//     features: ["Videos en HD", "Compatibilidad total", "Organizado por géneros"],
//   },
//   {
//     size: "64GB",
//     videoCount: "1,200+ videos HD/4K",
//     price: 129900,
//     description: "Perfecta para amantes de la música visual",
//     features: ["Videos HD y 4K", "Mejor calidad", "Más variedad de artistas"],
//     popular: true,
//   },
//   {
//     size: "128GB",
//     videoCount: "2,500+ videos 4K",
//     price: 169900,
//     description: "La colección más completa de videos musicales",
//     features: ["Máxima calidad 4K", "Colección premium", "Videos exclusivos"],
//   },
//   {
//     size: "256GB",
//     videoCount: "5,000+ videos 4K Ultra",
//     price: 219900,
//     description: "Para coleccionistas y profesionales",
//     features: ["Ultra HD 4K", "Videos raros y exclusivos", "Calidad cinematográfica"],
//     premium: true,
//   },
// ];

// // --- Promociones destacadas ---
// const videoPromotions = [
//   "🎬 *Videos en calidad 4K disponibles - Experiencia cinematográfica*",
//   "📱 *Compatible con Smart TV, celular, tablet y computador*",
//   "🎁 *OFERTA ESPECIAL: 30% descuento en segunda USB de videos*",
//   "🚚 *Envío gratis + garantía de por vida en todos los videos*",
//   "⚡ *Instalación instantánea - Plug & Play*"
// ] as const;

// // --- Sugerencia de ventas cruzadas (complementa al helper central) ---
// async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any) {
//   if (currentProduct === 'music') {
//     await flowDynamic(
//       '🎬 *¿Te gustaría añadir la USB de VIDEOS MUSICALES a tu pedido?*\n\n' +
//       '👉 *Más de 10,000 videoclips en HD y 4K de todos los géneros.*\n' +
//       '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
//       '¿Quieres ver la colección de videos? Responde con *QUIERO USB DE VIDEOS* o *VER VIDEOS*.'
//     );
//   } else {
//     await flowDynamic(
//       '🎵 *¿Te gustaría añadir la USB de MÚSICA a tu pedido?*\n\n' +
//       '👉 *La mejor selección de géneros, artistas y playlists exclusivas.*\n' +
//       '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
//       '¿Quieres ver la colección de música? Responde con *QUIERO USB DE MUSICA* o *VER MUSICA*.'
//     );
//   }
// }

// // --- Utilidades internas ---
// const currency = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
// const isValidChoice = (n: number) => Number.isInteger(n) && n >= 1 && n <= videoCapacities.length;
// const computeDiscountedPrice = (base: number, choiceIndex: number) => {
//   // Descuento automático a partir de 128GB (choice >= 3)
//   if (choiceIndex >= 3) {
//     const discount = Math.floor(base * 0.15);
//     return { final: base - discount, discount };
//   }
//   return { final: base, discount: 0 };
// };

// // --- Flujo principal de capacidades de video ---
// const capacityVideo = addKeyword([EVENTS.ACTION])
//   .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
//     try {
//       const phone = ctx.from;

//       // preHandler: permite mostrar precios/opciones si no está en pagos/checkout
//       const pre = await preHandler(
//         ctx,
//         { flowDynamic, gotoFlow },
//         'videosUsb',
//         ['prices_shown','awaiting_capacity','personalization'],
//         {
//           lockOnStages: ['awaiting_payment','checkout_started','completed'],
//           resumeMessages: {
//             awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
//             checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
//             completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
//           }
//         }
//       );
//       if (!pre.proceed) return;

//       const session: UserSession | any = await getUserSession(phone);

//       await updateUserSession(
//         phone,
//         ctx.body,
//         'capacityVideo_initial',
//         null,
//         false,
//         { metadata: session }
//       );

//       const header = [
//         '🎬 *¡Perfecto! Ahora elige la capacidad ideal para tu USB de videos:*',
//         '',
//         videoPromotions[0],
//         videoPromotions[1],
//         ''
//       ].join('\n');

//       await flowDynamic(header);

//       // Construir las 4 opciones
//       const optionsText = videoCapacities.map((c, i) => {
//         const lines: string[] = [];
//         lines.push(`${i + 1}️⃣ *${c.size}* - ${c.videoCount}`);
//         lines.push(`💰 *${currency(c.price)}*`);
//         lines.push(`📝 ${c.description}`);
//         if (c.popular) lines.push(`🔥 *¡MÁS POPULAR!*`);
//         if (c.premium) lines.push(`👑 *PREMIUM*`);
//         lines.push(`✅ ${c.features.join('\n✅ ')}`);
//         return lines.join('\n');
//       }).join('\n\n');

//       const footer = [
//         '',
//         videoPromotions[2],
//         videoPromotions[3],
//         '',
//         '🔢 *Responde con el número (1-4) de la capacidad que prefieres*'
//       ].join('\n');

//       await flowDynamic(`${optionsText}\n${footer}`);

//       // postHandler: mostramos precios y quedamos esperando capacidad
//       await postHandler(phone, 'videosUsb', 'awaiting_capacity');

//     } catch (error) {
//       console.error('Error mostrando capacidades de video:', error);
//       await flowDynamic('⚠️ Error al cargar las opciones. Intenta nuevamente.');
//     }
//   })
//   .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
//     try {
//       const phone = ctx.from;

//       // preHandler: en captura, permitimos awaiting_capacity y avanzar a awaiting_payment
//       const pre = await preHandler(
//         ctx,
//         { flowDynamic, gotoFlow },
//         'videosUsb',
//         ['awaiting_capacity','awaiting_payment'],
//         {
//           lockOnStages: ['checkout_started','completed'],
//           resumeMessages: {
//             awaiting_capacity: 'Retomemos: 1️⃣ 32GB • 2️⃣ 64GB • 3️⃣ 128GB • 4️⃣ 256GB.',
//             awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.'
//           }
//         }
//       );
//       if (!pre.proceed) return;

//       const raw = (ctx.body || '').trim();
//       const choice = parseInt(raw, 10);

//       const session: UserSession | any = await getUserSession(phone);
//       await updateUserSession(
//         phone,
//         raw,
//         'capacityVideo_selected',
//         null,
//         false,
//         { metadata: session }
//       );

//       if (!isValidChoice(choice)) {
//         await flowDynamic([
//           '❌ Opción no válida. Por favor responde con un número del 1 al 4.',
//           '',
//           '🔢 Ejemplo: Escribe *2* para elegir 64GB'
//         ].join('\n'));
//         await postHandler(phone, 'videosUsb', 'awaiting_capacity');
//         return;
//       }

//       const selectedCapacity: CapacityOption = videoCapacities[choice - 1];
//       const { final, discount } = computeDiscountedPrice(selectedCapacity.price, choice);

//       const discountMessage = discount > 0
//         ? `\n🎁 *¡Descuento especial de ${currency(discount)}!*`
//         : '';

//       const summary = [
//         `🎯 *¡Excelente elección!*`,
//         '',
//         `📱 *USB de Videos ${selectedCapacity.size}*`,
//         `🎬 ${selectedCapacity.videoCount}`,
//         `💰 Precio: ~~${currency(selectedCapacity.price)}~~ *${currency(final)}*${discountMessage}`,
//         '',
//         `✅ ${selectedCapacity.features.join('\n✅ ')}`,
//         '',
//         videoPromotions[4],
//         '',
//         '📋 *Para completar tu pedido, por favor envíanos:*',
//         '👤 Nombre completo',
//         '📱 Número de celular',
//         '🏙️ Ciudad',
//         '🏠 Barrio y dirección completa',
//         '',
//         '💳 *Métodos de pago disponibles:*',
//         '• Transferencia bancaria',
//         '• Nequi/Daviplata',
//         '• Efectivo contraentrega',
//         '',
//         '🚚 *Envío gratis a toda Colombia*'
//       ].join('\n');

//       await flowDynamic(summary);

//       // Actualiza la sesión con la capacidad elegida (sin marcar completed aún)
//       const updatedSession: UserSession | any = {
//         ...session,
//         selection: {
//           ...(session?.selection || {}),
//           video: { capacity: selectedCapacity.size, price: final }
//         }
//       };

//       await updateUserSession(
//         phone,
//         `selected_video_capacity:${selectedCapacity.size}:${final}`,
//         'capacity_confirmed',
//         null,
//         false,
//         { metadata: updatedSession }
//       );

//       // Pasamos a awaiting_payment (solicitamos datos)
//       await postHandler(phone, 'videosUsb', 'awaiting_payment');

//       // Cross-sell en 'afterCapacitySelected'
//       try {
//         await offerCrossSellIfAllowed(phone, 'afterCapacitySelected', flowDynamic, updatedSession);
//       } catch (e) {
//         console.warn('Cross-sell afterCapacitySelected falló:', e);
//       }

//       // Cross-sell adicional (música) como complemento
//       await crossSellSuggestion('video', flowDynamic);

//       // Ir a procesamiento de pedido (tu flujo orderProcessing se encargará de checkout_started/completed)
//       return gotoFlow(orderProcessing);

//     } catch (error) {
//       console.error('Error procesando selección de capacidad de video:', error);
//       await flowDynamic('⚠️ Error al procesar tu selección. Intenta nuevamente.');
//     }
//   });

// export default capacityVideo;




import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import type { BotContext, UserSession } from '../../types/global';
import { preHandler, postHandler } from './middlewareFlowGuard';
// Importamos el flujo de envío optimizado del archivo anterior para mantener coherencia
import { askShippingData, formatPrice, calculateSavings } from './capacityMusic';

// types locales
type CapacityOption = {
  size: "32GB" | "64GB" | "128GB" | "256GB";
  videoCount: string;
  price: number;
  originalPrice: number;
  description: string;
  features: readonly string[];
  popular?: boolean;
  premium?: boolean;
  urgency: string;
};

// --- Configuración de capacidades de video (Precios y Copy Mejorados) ---
const videoCapacities: readonly CapacityOption[] = [
  {
    size: "32GB",
    videoCount: "500+ Videos HD",
    price: 89900,
    originalPrice: 119900,
    description: "Pack Inicio",
    features: ["Videos HD 720p", "Para pantallas pequeñas", "Géneros básicos"],
    urgency: "⚡ Básico"
  },
  {
    size: "64GB",
    videoCount: "1,200+ Videos HD/Full HD",
    price: 129900,
    originalPrice: 169900,
    description: "Pack Estándar",
    features: ["Calidad Full HD 1080p", "Perfecto para TV y Carro", "Variedad de artistas"],
    popular: true,
    urgency: "🔥 El más llevado"
  },
  {
    size: "128GB",
    videoCount: "2,500+ Videos 4K/HD",
    price: 169900,
    originalPrice: 229900,
    description: "Pack Coleccionista",
    features: ["Calidad 4K Escalado", "Colección Completa", "Exclusivos VIP"],
    urgency: "⭐ Mejor Valor"
  },
  {
    size: "256GB",
    videoCount: "5,000+ Videos 4K Ultra",
    price: 219900,
    originalPrice: 289900,
    description: "Pack Cinema Pro",
    features: ["4K Nativo Ultra HD", "Videoteca Total", "Audio de Alta Fidelidad"],
    premium: true,
    urgency: "👑 VIP Edition"
  },
];

// --- Utilidades internas ---
const isValidChoice = (n: number) => Number.isInteger(n) && n >= 1 && n <= videoCapacities.length;

// --- Sugerencia de ventas cruzadas (Visual y con Delays) ---
async function crossSellSuggestion(flowDynamic: any, phoneNumber: string) {
  try {
    const session = await getUserSession(phoneNumber);

    await flowDynamic([
      { body: '⏳ Procesando tu selección...', delay: 500 },
      { body: '🎵 *¿Te gustaría añadir la colección de MÚSICA a tu pedido?*', delay: 1000 },
      { body: '👉 *Miles de canciones organizadas por carpetas y géneros.* El complemento ideal para cuando no puedes ver la pantalla.', delay: 1500 },
      { body: '🎁 *Oferta Combo:* Si llevas Video + Música, tienes envío prioritario GRATIS.\n\nResponde *SÍ* para agregar o *NO* para finalizar.', delay: 2000 }
    ]);

    if (session) {
      await updateUserSession(phoneNumber, 'Cross-sell Video->Musica presentado', 'cross_sell_presented', null, false, { metadata: session });
    }
  } catch (error) {
    console.error('❌ Error en crossSellSuggestion Video:', error);
  }
}

// --- Flujo principal de capacidades de video ---
const capacityVideo = addKeyword([EVENTS.ACTION])
  // PARTE 1: MOSTRAR OPCIONES (Estructura Visual)
  .addAction(async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
    try {
      const phone = ctx.from;

      const pre = await preHandler(
        ctx,
        { flowDynamic, gotoFlow },
        'videosUsb',
        ['prices_shown', 'awaiting_capacity', 'personalization'],
        {
          lockOnStages: ['awaiting_payment', 'checkout_started', 'completed'],
          resumeMessages: {
            awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
            checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
            completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
          }
        }
      );
      if (!pre.proceed) return;

      const session = await getUserSession(phone);
      await updateUserSession(phone, ctx.body, 'capacityVideo_initial', null, false, { metadata: session });

      // Mensajes escalonados para mejor lectura
      await flowDynamic([
        { body: '🎬 *¡Convierte tu pantalla en un Cine!*', delay: 500 },
        { body: 'Nuestras USBs de video son compatibles con Smart TV, Computadores y Radios de pantalla.\nAquí tienes las opciones con descuento:', delay: 1000 },

        // Opción 1 & 2
        { body: `1️⃣ *32GB* (${videoCapacities[0].videoCount})\n💰 *${formatPrice(videoCapacities[0].price)}* (Antes ${formatPrice(videoCapacities[0].originalPrice)})\n_Ideal para empezar._`, delay: 1500 },
        { body: `2️⃣ *64GB* (${videoCapacities[1].videoCount})\n💰 *${formatPrice(videoCapacities[1].price)}* (Antes ${formatPrice(videoCapacities[1].originalPrice)})\n🔥 _${videoCapacities[1].urgency}_`, delay: 1500 },

        // Opción 3 & 4
        { body: `3️⃣ *128GB* (${videoCapacities[2].videoCount})\n💰 *${formatPrice(videoCapacities[2].price)}* (Antes ${formatPrice(videoCapacities[2].originalPrice)})\n⭐ _Colección recomendada._`, delay: 1500 },
        { body: `4️⃣ *256GB* (${videoCapacities[3].videoCount})\n💰 *${formatPrice(videoCapacities[3].price)}* (Antes ${formatPrice(videoCapacities[3].originalPrice)})\n👑 _Calidad Ultra 4K._`, delay: 1500 },

        // CTA
        { body: '👇 *Responde con el número (1-4) de la capacidad que prefieres.*', delay: 2000 }
      ]);

      await postHandler(phone, 'videosUsb', 'awaiting_capacity');

    } catch (error) {
      console.error('Error mostrando capacidades de video:', error);
      await flowDynamic('⚠️ Error al cargar las opciones. Intenta nuevamente.');
    }
  })

  // PARTE 2: CAPTURA Y CONFIRMACIÓN
  .addAction({ capture: true }, async (ctx: BotContext, { flowDynamic, gotoFlow }: any) => {
    try {
      const phone = ctx.from;
      const pre = await preHandler(ctx, { flowDynamic, gotoFlow }, 'videosUsb', ['awaiting_capacity', 'awaiting_payment'], {
        lockOnStages: ['checkout_started', 'completed'],
        resumeMessages: { awaiting_capacity: 'Retomemos: 1️⃣ 32GB • 2️⃣ 64GB • 3️⃣ 128GB • 4️⃣ 256GB.' }
      });
      if (!pre.proceed) return;

      const raw = (ctx.body || '').trim();
      const choice = parseInt(raw, 10);

      if (!isValidChoice(choice)) {
        await flowDynamic([{ body: '❌ Por favor escribe solo el número de la opción (1, 2, 3 o 4).', delay: 1000 }]);
        await postHandler(phone, 'videosUsb', 'awaiting_capacity');
        return;
      }

      const selected = videoCapacities[choice - 1];
      const savings = calculateSavings(selected.originalPrice, selected.price);

      const session = await getUserSession(phone);

      // Actualizar sesión con metadatos completos para el carrito
      await updateUserSession(phone, `Selección Video: ${selected.size}`, 'capacity_confirmed', null, false, {
        metadata: {
          ...session?.metadata,
          step: 'order_summary',
          productType: 'video',
          selectedCapacity: selected.size,
          price: formatPrice(selected.price),
          description: selected.description,
          orderReady: true
        }
      });

      // Confirmación emocionante
      await flowDynamic([
        { body: `🎉 *¡Excelente elección!* La de ${selected.size} tiene una colección increíble.`, delay: 500 },
        { body: `✅ *${selected.videoCount}* listos para reproducir.`, delay: 1000 },
        { body: `💰 *Ahorraste:* ${savings} en esta compra.`, delay: 1000 }
      ]);

      // Lanzar Cross-sell (Ofrecer Música)
      await crossSellSuggestion(flowDynamic, phone);

      // Pasamos a awaiting_payment pero dirigimos al flujo de envío robusto
      await postHandler(phone, 'videosUsb', 'awaiting_payment');

      // REUTILIZACIÓN INTELIGENTE: Usamos el mismo flujo de shipping de música
      return gotoFlow(askShippingData);

    } catch (error) {
      console.error('Error selección video:', error);
      await flowDynamic('⚠️ Error procesando tu selección. Intenta de nuevo.');
    }
  });

export default capacityVideo;