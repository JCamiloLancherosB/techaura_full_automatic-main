// capacityVideo.ts
import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import type { UserSession } from '../../types/global';
import { offerCrossSellIfAllowed } from './videosUsb'; // reutilizamos el helper tipado
import { preHandler, postHandler } from './middlewareFlowGuard';
import path from 'path';
import { promises as fs } from 'fs';
import { EnhancedVideoFlow } from './enhancedVideoFlow';
import { flowHelper } from '../services/flowIntegrationHelper';

// types locales
type CapacityOption = {
  size: '32GB' | '64GB' | '128GB' | '256GB';
  videoCount: string;
  price: number;
  description: string;
  features: readonly string[];
  popular?: boolean;
  premium?: boolean;
};

// --- Configuración de capacidades de video (estandarizada) ---
const videoCapacities: readonly CapacityOption[] = [
  {
    size: '32GB',
    videoCount: '1.000 videos',
    price: 84900,
    description: 'Ideal para empezar tu colección visual',
    features: ['HD estable', 'Compatibilidad total', 'Organizado por géneros']
  },
  {
    size: '64GB',
    videoCount: '2.000 videos',
    price: 119900,
    description: 'Excelente balance entre cantidad y calidad',
    features: ['HD/Full HD', 'Mayor variedad de artistas', 'Curaduría sin relleno'],
    popular: true
  },
  {
    size: '128GB',
    videoCount: '4.000 videos',
    price: 159900,
    description: 'Colección amplia para disfrutar por meses',
    features: ['Full HD/4K según disponibilidad', 'Listas por década y género', 'Nombres limpios']
  },
  {
    size: '256GB',
    videoCount: '8.000+ videos',
    price: 219900,
    description: 'Para coleccionistas y uso intensivo',
    features: ['4K prioritario', 'Selecciones exclusivas', 'Estructura profesional'],
    premium: true
  }
];

// --- Utilidades internas ---
const currency = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(n);

const isValidChoice = (n: number) =>
  Number.isInteger(n) && n >= 1 && n <= videoCapacities.length;

const computeDiscountedPrice = (base: number, choiceIndex: number) => {
  // Descuento automático sugerido para capacidades altas (128GB/256GB)
  if (choiceIndex >= 3) {
    const discount = Math.floor(base * 0.1); // 10% auto
    return { final: base - discount, discount };
  }
  return { final: base, discount: 0 };
};

// --- Sugerencia de ventas cruzadas (complementa al helper central) ---
async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any) {
  if (currentProduct === 'music') {
    await flowDynamic(
      [
        '🎬 ¿Te gustaría añadir la USB de VIDEOS MUSICALES a tu pedido?',
        '🎁 Combo Música + Videos: -25% y envío gratis.',
        'Responde: QUIERO VIDEOS o NO'
      ].join('\n')
    );
  } else {
    await flowDynamic(
      [
        '🎵 ¿Te gustaría añadir la USB de MÚSICA a tu pedido?',
        '🎁 Combo Música + Videos: -25% y envío gratis.',
        'Responde: QUIERO MÚSICA o NO'
      ].join('\n')
    );
  }
}

// --- Generador de tabla textual (fallback si no hay imagen) ---
function buildVideoPricingTable(): string {
  const header =
    '| Capacidad | Videos estimados | Precio |\n' +
    '|----------|------------------|--------|';
  const rows = videoCapacities
    .map(c => `| ${c.size} | ${c.videoCount} | ${currency(c.price)} |`)
    .join('\n');
  return [header, rows].join('\n');
}

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
        ['prices_shown', 'awaiting_capacity', 'personalization'],
        {
          lockOnStages: ['awaiting_payment', 'checkout_started', 'completed'],
          resumeMessages: {
            awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.',
            checkout_started:
              'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
            completed: 'Tu pedido ya fue confirmado. Para extras escribe: EXTRA.'
          }
        }
      );
      if (!pre.proceed) return;

      await updateUserSession(phone, ctx.body, 'videosUsb', 'capacityVideo_initial', false, {
        metadata: { step: 'capacityVideo_initial' }
      });

      // 1) Imagen de precios (si existe) + fallback a tabla textual
      // try {
      //   const pricingImagePath = path.resolve(
      //     __dirname,
      //     '../Portada/pricing_video_table.png'
      //   ); // Ajusta si usas otra ruta
      //   const canAccess = await fs.access(pricingImagePath).then(() => true).catch(() => false);
      //   if (canAccess) {
      //     await flowDynamic([
      //       { body: '🎬 Opciones y precios de VIDEOS:', media: pricingImagePath }
      //     ]);
      //   } else {
      //     const table = buildVideoPricingTable();
      //     await flowDynamic([
      //       ['🎬 Opciones y precios de VIDEOS:', table].join('\n')
      //     ]);
      //   }
      // } catch {
      //   const table = buildVideoPricingTable();
      //   await flowDynamic([
      //     ['🎬 Opciones y precios de VIDEOS:', table].join('\n')
      //   ]);
      // }

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
        ['awaiting_capacity', 'awaiting_payment'],
        {
          lockOnStages: ['checkout_started', 'completed'],
          resumeMessages: {
            awaiting_capacity:
              'Retomemos: 1️⃣ 32GB • 2️⃣ 64GB • 3️⃣ 128GB • 4️⃣ 256GB.',
            awaiting_payment: 'Retomemos: envíame nombre, ciudad/dirección y celular.'
          }
        }
      );
      if (!pre.proceed) return;

      const raw = (ctx.body || '').trim();
      const digit = raw.replace(/[^\d]/g, '');
      const choice = parseInt(digit || '0', 10);

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
        await flowDynamic(
          [
            '❌ Opción no válida. Elige con un número:',
            `1️⃣ 32GB — ${videoCapacities[0].videoCount} · ${currency(
              videoCapacities[0].price
            )}`,
            `2️⃣ 64GB — ${videoCapacities[1].videoCount} · ${currency(
              videoCapacities[1].price
            )}`,
            `3️⃣ 128GB — ${videoCapacities[2].videoCount} · ${currency(
              videoCapacities[2].price
            )}`,
            `4️⃣ 256GB — ${videoCapacities[3].videoCount} · ${currency(
              videoCapacities[3].price
            )}`
          ].join('\n')
        );
        await postHandler(phone, 'videosUsb', 'awaiting_capacity');
        return;
      }

      const selectedCapacity: CapacityOption = videoCapacities[choice - 1];
      const { final, discount } = computeDiscountedPrice(selectedCapacity.price, choice);

      const discountMessage =
        discount > 0 ? `\n🎁 Descuento automático: ${currency(discount)}` : '';

      const summary = [
        '🎯 ¡Excelente elección!',
        '',
        `📼 USB de Videos ${selectedCapacity.size}`,
        `🎬 ${selectedCapacity.videoCount}`,
        `💰 Precio: ~~${currency(selectedCapacity.price)}~~ ${currency(final)}${discountMessage}`,
        '',
        `✅ ${selectedCapacity.features.join('\n✅ ')}`,
        '',
        '📋 Para completar tu pedido, por favor envíanos:',
        '• Nombre completo',
        '• Número de celular',
        '• Ciudad',
        '• Barrio y dirección completa',
        '',
        '💳 Métodos de pago:',
        '• Transferencia bancaria',
        '• Nequi/Daviplata',
        '• Efectivo contraentrega',
        '',
        '🚚 Envío GRATIS a toda Colombia'
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

      // Cross-sell central (si aplica)
      try {
        await offerCrossSellIfAllowed(
          phone,
          'afterCapacitySelected',
          flowDynamic,
          updatedSession
        );
      } catch (e) {
        console.warn('Cross-sell afterCapacitySelected falló:', e);
      }

      // Cross-sell adicional (música) como complemento
      await crossSellSuggestion('video', flowDynamic);

      // Ir a procesamiento de pedido
      return gotoFlow(orderProcessing);
    } catch (error) {
      console.error('Error procesando selección de capacidad de video:', error);
      await flowDynamic('⚠️ Error al procesar tu selección. Intenta nuevamente.');
    }
  });

export default capacityVideo;
