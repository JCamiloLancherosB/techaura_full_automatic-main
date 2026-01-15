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
  size: '8GB' | '32GB' | '64GB' | '128GB' | '256GB';
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
    size: '8GB',
    videoCount: '500 videos',
    price: 54900,
    description: 'Ideal para empezar tu colección visual',
    features: ['HD estable', 'Compatibilidad total', 'Organizado por géneros']
  },
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
async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any, phoneNumber: string) {
  try {
    const session = await getUserSession(phoneNumber);

    // Check if cross-sell was already offered recently (within 24h)
    const lastCrossSellAt = (session.conversationData as any)?.lastCrossSellAt;
    if (lastCrossSellAt) {
      const hoursSince = (Date.now() - new Date(lastCrossSellAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        console.log(`⏸️ Cross-sell ya ofrecido hace ${hoursSince.toFixed(1)}h. Evitando duplicado.`);
        return; // Don't offer again within 24 hours
      }
    }

    // Only offer cross-sell at appropriate stage (after capacity selected)
    const isAppropriateStage = ['closing', 'awaiting_payment', 'checkout_started'].includes(session.stage);
    if (!isAppropriateStage) {
      console.log(`⏸️ Cross-sell no apropiado en stage=${session.stage}`);
      return;
    }

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

    // Mark cross-sell as offered
    if (session) {
      session.conversationData = session.conversationData || {};
      (session.conversationData as any).lastCrossSellAt = new Date().toISOString();

      await updateUserSession(phoneNumber, 'Cross-sell presentado', 'cross_sell_presented', null, false, {
        metadata: {
          crossSellType: currentProduct === 'music' ? 'videos' : 'music',
          timestamp: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    console.error('❌ Error en crossSellSuggestion:', error);
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
              'Retomemos: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.',
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
            `1️⃣ 8GB — ${videoCapacities[0].videoCount} · ${currency(
              videoCapacities[0].price
            )}`,
            `2️⃣ 32GB — ${videoCapacities[1].videoCount} · ${currency(
              videoCapacities[1].price
            )}`,
            `3️⃣ 64GB — ${videoCapacities[2].videoCount} · ${currency(
              videoCapacities[2].price
            )}`,
            `4️⃣ 128GB — ${videoCapacities[3].videoCount} · ${currency(
              videoCapacities[3].price
            )}`
          ].join('\n')
        );
        await postHandler(phone, 'videosUsb', 'awaiting_capacity');
        return;
      }

      const selectedCapacity: CapacityOption = videoCapacities[choice - 1];
      const { final, discount } = computeDiscountedPrice(selectedCapacity.price, choice);

      // CRITICAL: Persist capacity selection immediately with proper stage tracking
      session.conversationData = session.conversationData || {};
      (session.conversationData as any).selectedCapacity = selectedCapacity.size;
      (session.conversationData as any).selectedPrice = final;
      (session.conversationData as any).capacitySelectedAt = Date.now();

      // Update tracking with high buying intent
      await updateUserSession(
        phone,
        `Capacidad seleccionada: ${selectedCapacity.size}`,
        'videosUsb',
        'capacity_selected',
        false,
        {
          metadata: {
            buyingIntent: 100, // User made a decision - high intent
            stage: 'closing', // Moving to closing stage
            lastAction: 'capacity_selected',
            selectedCapacity: selectedCapacity.size,
            price: final,
            productType: 'videos',
            videoCount: selectedCapacity.videoCount
          }
        }
      );

      // Mark user as having made a decision - prevents unwanted follow-ups
      session.tags = session.tags || [];
      if (!session.tags.includes('decision_made')) {
        session.tags.push('decision_made');
      }
      if (!session.tags.includes('capacity_selected')) {
        session.tags.push('capacity_selected');
      }

      const discountMessage =
        discount > 0 ? `\n🎁 Descuento automático: ${currency(discount)}` : '';

      const summary = [
        '🎯 Excelente elección!',
        '',
        `📼 USB Videos ${selectedCapacity.size}`,
        `🎬 ${selectedCapacity.videoCount} en HD/4K`,
        `💰 ${currency(final)}${discountMessage}`,
        '',
        `✅ ${selectedCapacity.features.join(' · ')}`,
        '',
        '📋 Datos de envío:',
        'Nombre | Ciudad/Dirección | Celular',
        '',
        '🚚 Envío GRATIS'
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

      // Cross-sell adicional (música) como complemento - with phoneNumber parameter
      await crossSellSuggestion('video', flowDynamic, phone);

      // Ir a procesamiento de pedido
      return gotoFlow(orderProcessing);
    } catch (error) {
      console.error('Error procesando selección de capacidad de video:', error);
      await flowDynamic('⚠️ Error al procesar tu selección. Intenta nuevamente.');
    }
  });

export default capacityVideo;
