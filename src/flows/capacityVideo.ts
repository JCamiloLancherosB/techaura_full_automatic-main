// capacityVideo.ts
import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import type { UserSession } from '../../types/global';
import { offerCrossSellIfAllowed } from './videosUsb'; // reutilizamos el helper tipado
import { preHandler, postHandler } from './middlewareFlowGuard';

// types locales
type CapacityOption = {
  size: "32GB" | "64GB" | "128GB" | "256GB";
  videoCount: string;
  price: number;
  description: string;
  features: readonly string[];
  popular?: boolean;
  premium?: boolean;
};

// --- Configuración de capacidades de video ---
const videoCapacities: readonly CapacityOption[] = [
  {
    size: "32GB",
    videoCount: "500+ videos HD",
    price: 89900,
    description: "Ideal para una colección básica de videos musicales",
    features: ["Videos en HD", "Compatibilidad total", "Organizado por géneros"],
  },
  {
    size: "64GB",
    videoCount: "1,200+ videos HD/4K",
    price: 129900,
    description: "Perfecta para amantes de la música visual",
    features: ["Videos HD y 4K", "Mejor calidad", "Más variedad de artistas"],
    popular: true,
  },
  {
    size: "128GB",
    videoCount: "2,500+ videos 4K",
    price: 169900,
    description: "La colección más completa de videos musicales",
    features: ["Máxima calidad 4K", "Colección premium", "Videos exclusivos"],
  },
  {
    size: "256GB",
    videoCount: "5,000+ videos 4K Ultra",
    price: 219900,
    description: "Para coleccionistas y profesionales",
    features: ["Ultra HD 4K", "Videos raros y exclusivos", "Calidad cinematográfica"],
    premium: true,
  },
];

// --- Promociones destacadas ---
const videoPromotions = [
  "🎬 *Videos en calidad 4K disponibles - Experiencia cinematográfica*",
  "📱 *Compatible con Smart TV, celular, tablet y computador*",
  "🎁 *OFERTA ESPECIAL: 30% descuento en segunda USB de videos*",
  "🚚 *Envío gratis + garantía de por vida en todos los videos*",
  "⚡ *Instalación instantánea - Plug & Play*"
] as const;

// --- Sugerencia de ventas cruzadas (complementa al helper central) ---
async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any) {
  if (currentProduct === 'music') {
    await flowDynamic(
      '🎬 *¿Te gustaría añadir la USB de VIDEOS MUSICALES a tu pedido?*\n\n' +
      '👉 *Más de 10,000 videoclips en HD y 4K de todos los géneros.*\n' +
      '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
      '¿Quieres ver la colección de videos? Responde con *QUIERO USB DE VIDEOS* o *VER VIDEOS*.'
    );
  } else {
    await flowDynamic(
      '🎵 *¿Te gustaría añadir la USB de MÚSICA a tu pedido?*\n\n' +
      '👉 *La mejor selección de géneros, artistas y playlists exclusivas.*\n' +
      '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
      '¿Quieres ver la colección de música? Responde con *QUIERO USB DE MUSICA* o *VER MUSICA*.'
    );
  }
}

// --- Utilidades internas ---
const currency = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
const isValidChoice = (n: number) => Number.isInteger(n) && n >= 1 && n <= videoCapacities.length;
const computeDiscountedPrice = (base: number, choiceIndex: number) => {
  // Descuento automático a partir de 128GB (choice >= 3)
  if (choiceIndex >= 3) {
    const discount = Math.floor(base * 0.15);
    return { final: base - discount, discount };
  }
  return { final: base, discount: 0 };
};

// --- Flujo principal de capacidades de video ---
const capacityVideo = addKeyword([EVENTS.ACTION])
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    try {
      const phone = ctx.from;

      // preHandler: permite mostrar precios/opciones si no está en pagos/checkout
      const pre = await preHandler(
        ctx,
        { flowDynamic, gotoFlow },
        'videosUsb',
        ['prices_shown','awaiting_capacity','personalization'],
        {
          lockOnStages: ['awaiting_payment','checkout_started','completed'],
          resumeMessages: {
            awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
            checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
            completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
          }
        }
      );
      if (!pre.proceed) return;

      const session: UserSession | any = await getUserSession(phone);

      await updateUserSession(
        phone,
        ctx.body,
        'capacityVideo_initial',
        null,
        false,
        { metadata: session }
      );

      const header = [
        '🎬 *¡Perfecto! Ahora elige la capacidad ideal para tu USB de videos:*',
        '',
        videoPromotions[0],
        videoPromotions[1],
        ''
      ].join('\n');

      await flowDynamic(header);

      // Construir las 4 opciones
      const optionsText = videoCapacities.map((c, i) => {
        const lines: string[] = [];
        lines.push(`${i + 1}️⃣ *${c.size}* - ${c.videoCount}`);
        lines.push(`💰 *${currency(c.price)}*`);
        lines.push(`📝 ${c.description}`);
        if (c.popular) lines.push(`🔥 *¡MÁS POPULAR!*`);
        if (c.premium) lines.push(`👑 *PREMIUM*`);
        lines.push(`✅ ${c.features.join('\n✅ ')}`);
        return lines.join('\n');
      }).join('\n\n');

      const footer = [
        '',
        videoPromotions[2],
        videoPromotions[3],
        '',
        '🔢 *Responde con el número (1-4) de la capacidad que prefieres*'
      ].join('\n');

      await flowDynamic(`${optionsText}\n${footer}`);

      // postHandler: mostramos precios y quedamos esperando capacidad
      await postHandler(phone, 'videosUsb', 'awaiting_capacity');

    } catch (error) {
      console.error('Error mostrando capacidades de video:', error);
      await flowDynamic('⚠️ Error al cargar las opciones. Intenta nuevamente.');
    }
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    try {
      const phone = ctx.from;

      // preHandler: en captura, permitimos awaiting_capacity y avanzar a awaiting_payment
      const pre = await preHandler(
        ctx,
        { flowDynamic, gotoFlow },
        'videosUsb',
        ['awaiting_capacity','awaiting_payment'],
        {
          lockOnStages: ['checkout_started','completed'],
          resumeMessages: {
            awaiting_capacity: 'Retomemos: 1️⃣ 32GB • 2️⃣ 64GB • 3️⃣ 128GB • 4️⃣ 256GB.',
            awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.'
          }
        }
      );
      if (!pre.proceed) return;

      const raw = (ctx.body || '').trim();
      const choice = parseInt(raw, 10);

      const session: UserSession | any = await getUserSession(phone);
      await updateUserSession(
        phone,
        raw,
        'capacityVideo_selected',
        null,
        false,
        { metadata: session }
      );

      if (!isValidChoice(choice)) {
        await flowDynamic([
          '❌ Opción no válida. Por favor responde con un número del 1 al 4.',
          '',
          '🔢 Ejemplo: Escribe *2* para elegir 64GB'
        ].join('\n'));
        await postHandler(phone, 'videosUsb', 'awaiting_capacity');
        return;
      }

      const selectedCapacity: CapacityOption = videoCapacities[choice - 1];
      const { final, discount } = computeDiscountedPrice(selectedCapacity.price, choice);

      const discountMessage = discount > 0
        ? `\n🎁 *¡Descuento especial de ${currency(discount)}!*`
        : '';

      const summary = [
        `🎯 *¡Excelente elección!*`,
        '',
        `📱 *USB de Videos ${selectedCapacity.size}*`,
        `🎬 ${selectedCapacity.videoCount}`,
        `💰 Precio: ~~${currency(selectedCapacity.price)}~~ *${currency(final)}*${discountMessage}`,
        '',
        `✅ ${selectedCapacity.features.join('\n✅ ')}`,
        '',
        videoPromotions[4],
        '',
        '📋 *Para completar tu pedido, por favor envíanos:*',
        '👤 Nombre completo',
        '📱 Número de celular',
        '🏙️ Ciudad',
        '🏠 Barrio y dirección completa',
        '',
        '💳 *Métodos de pago disponibles:*',
        '• Transferencia bancaria',
        '• Nequi/Daviplata',
        '• Efectivo contraentrega',
        '',
        '🚚 *Envío gratis a toda Colombia*'
      ].join('\n');

      await flowDynamic(summary);

      // Actualiza la sesión con la capacidad elegida (sin marcar completed aún)
      const updatedSession: UserSession | any = {
        ...session,
        selection: {
          ...(session?.selection || {}),
          video: { capacity: selectedCapacity.size, price: final }
        }
      };

      await updateUserSession(
        phone,
        `selected_video_capacity:${selectedCapacity.size}:${final}`,
        'capacity_confirmed',
        null,
        false,
        { metadata: updatedSession }
      );

      // Pasamos a awaiting_payment (solicitamos datos)
      await postHandler(phone, 'videosUsb', 'awaiting_payment');

      // Cross-sell en 'afterCapacitySelected'
      try {
        await offerCrossSellIfAllowed(phone, 'afterCapacitySelected', flowDynamic, updatedSession);
      } catch (e) {
        console.warn('Cross-sell afterCapacitySelected falló:', e);
      }

      // Cross-sell adicional (música) como complemento
      await crossSellSuggestion('video', flowDynamic);

      // Ir a procesamiento de pedido (tu flujo orderProcessing se encargará de checkout_started/completed)
      return gotoFlow(orderProcessing);

    } catch (error) {
      console.error('Error procesando selección de capacidad de video:', error);
      await flowDynamic('⚠️ Error al procesar tu selección. Intenta nuevamente.');
    }
  });

export default capacityVideo;
