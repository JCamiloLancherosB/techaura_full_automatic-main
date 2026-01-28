import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession, canSendOnce, getUserCollectedData, buildConfirmationMessage } from './userTrackingSystem';
import { SalesMaximizer } from '../sales-maximizer';
import { matchingEngine } from '../catalog/MatchingEngine';
import { finalizeOrder } from './helpers/finalizeOrder';
import type { UsbCapacity } from '../../types/global';
import { crossSellSystem } from '../services/crossSellSystem';
import { preHandler, postHandler } from './middlewareFlowGuard';
import path from 'path';
import { promises as fs } from 'fs';
import { EnhancedMovieFlow } from './enhancedVideoFlow';
import { flowHelper } from '../services/flowIntegrationHelper';
import { humanDelay } from '../utils/antiBanDelays';
import { isPricingIntent as sharedIsPricingIntent, isConfirmation as sharedIsConfirmation, isMixedGenreInput as sharedIsMixedGenreInput } from '../utils/textUtils';
import { buildCompactPriceLadder, buildPostGenrePrompt } from '../utils/priceLadder';
import { catalogService } from '../services/CatalogService';
import { ContextualPersuasionComposer } from '../services/persuasion/ContextualPersuasionComposer';
import type { UserContext } from '../types/UserContext';
import { registerBlockingQuestion, ConversationStage, markConversationComplete } from '../services/stageFollowUpHelper';

const salesMaximizer = new SalesMaximizer();
const persuasionComposer = new ContextualPersuasionComposer();

const buildUserContext = (session: any): UserContext => {
  const preferencesAny = session.preferences as any;
  const conversationAny = session.conversationData as any;
  const genres =
    session.movieGenres
    || preferencesAny?.genres
    || conversationAny?.customization?.genres
    || [];
  return {
    phone: session.phone || session.phoneNumber,
    firstName: session.name?.split(' ')[0],
    stage: session.stage === 'converted' || session.stage === 'completed' ? 'postpurchase' : 'consideration',
    preferences: {
      contentTypes: ['movies'],
      genres: Array.isArray(genres) ? genres : [genres].filter(Boolean),
      capacityPreference: session.capacity
    },
    signals: {
      urgency: conversationAny?.urgency === 'high' ? 'high' : undefined,
      trustLevel: session.isReturningUser ? 'high' : undefined
    },
    history: {
      lastInteractionAt: session.lastInteraction,
      messagesCount: session.messageCount,
      previousOrdersCount: session.totalOrders || (session.isReturningUser ? 1 : 0)
    },
    objections: conversationAny?.objections || [],
    cart: {
      selectedProduct: session.selectedProduct?.name || session.selectedProduct?.id,
      capacity: session.capacity,
      priceQuoted: session.price
    },
    flow: {
      currentFlow: session.currentFlow,
      currentStep: session.currentStep
    }
  };
};

interface UsbOption {
  num: string;
  size: UsbCapacity;
  desc: string;
  price: number;
  stock: number;
  popular?: boolean;
  limited?: boolean;
  vip?: boolean;
}

// Build USB capacities from CatalogService
const buildUsbCapacities = (): UsbOption[] => {
  const movieProducts = catalogService.getProductsByCategory('movies');
  
  return movieProducts.map((product, index) => ({
    num: ['1️⃣', '2️⃣', '3️⃣', '4️⃣'][index] || `${index + 1}️⃣`,
    size: product.capacity as UsbCapacity,
    desc: `${product.content.count}+ ${product.content.unit} o ${Math.floor(product.content.count * 1.5)} episodios.${product.popular ? ' Ideal para sagas + series.' : ''}`,
    price: product.price,
    stock: 7 - index * 2, // Simulated stock levels
    popular: product.popular,
    limited: product.recommended,
    vip: product.capacityGb >= 512
  }));
};

const USBCAPACITIES: UsbOption[] = buildUsbCapacities();

const genresRecommendation = [
  { key: 'acción', emoji: '🔥', names: 'Avengers, John Wick, Star Wars, Misión Imposible, Rápidos y Furiosos' },
  { key: 'comedia', emoji: '😂', names: 'Shrek, Toy Story, Mi Villano Favorito, Madagascar, The Office, Friends' },
  { key: 'drama', emoji: '🎭', names: 'Breaking Bad, El Padrino, Forrest Gump, Titanic, Joker, Lobo de Wall Street' },
  { key: 'romance', emoji: '💖', names: 'Orgullo y Prejuicio, Diario de una Pasión, La La Land, Notting Hill' },
  { key: 'terror', emoji: '👻', names: 'El Conjuro, IT, Annabelle, Scream, El Exorcista, Hereditary' },
  { key: 'animadas', emoji: '🎨', names: 'Coco, Frozen, Moana, Encanto, Soul, Rick & Morty, Dragon Ball, Naruto' }
];

// Utils
function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function priceCOP(n: number) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n); }
function estimateCostPerMovie(u: UsbOption) {
  const approx = u.size === '64GB' ? 55 : u.size === '128GB' ? 120 : u.size === '256GB' ? 250 : u.size === '512GB' ? 520 : 0;
  return approx ? `≈ ${priceCOP(Math.round(u.price / approx))}/película` : '';
}
async function getUrgencyMsg(phone: string) {
  try { return (await salesMaximizer.createDynamicUrgency?.(phone, {}) || { message: '' }).message; } catch { return ''; }
}
const randomUpsell = () => {
  const o = [
    '💡 Hoy puedes subir a la siguiente capacidad con 12% OFF. Escribe "UPGRADE".',
    '📀 Segunda USB para regalo: -30% automático. Escribe "SEGUNDA".',
    '🎬 Colecciones temáticas (Oscars, 90s, Anime). Escribe "COLECCIONES".'
  ];
  return o[Math.floor(Math.random() * o.length)];
};
function formatCapList() {
  return USBCAPACITIES.map(u => {
    const tag = u.popular ? '🔥 Más elegida' : u.limited ? '💎 Stock limitado' : u.vip ? '👑 Alta demanda' : '';
    return `${u.num} ${u.size} — ${u.desc}\n   💰 ${priceCOP(u.price)} | ${estimateCostPerMovie(u)} ${tag}`;
  }).join('\n\n');
}

// Cross-sell helper con ventana 24h
async function offerCrossSellIfAllowed(
  phone: string,
  stage: 'afterCapacitySelected' | 'beforePayment' | 'postPurchase' | 'highIntentNoConfirm',
  flowDynamic: any,
  session: any
) {
  const lastTs = session.conversationData?.lastCrossSellAt ? new Date(session.conversationData.lastCrossSellAt).getTime() : 0;
  const canOffer = !lastTs || (Date.now() - lastTs) > 24 * 60 * 60 * 1000;
  if (!canOffer) return;
  const alreadyIds = session.orderData?.items?.map((i: any) => i.productId) || [];
  const recs = crossSellSystem.generateRecommendations(session, { stage, maxItems: 3, alreadyAddedProductIds: alreadyIds });
  const msg = crossSellSystem.generateCrossSellMessage(recs);
  if (msg) {
    await humanDelay();
    await flowDynamic(msg);
    session.conversationData = session.conversationData || {};
    session.conversationData.lastCrossSellAt = new Date().toISOString();
    await updateUserSession(phone, 'cross-sell-offered', 'moviesUsb', null, false, {
      messageType: 'crossSell',
      metadata: { stage, offeredIds: recs.map((r: any) => r.product.id) }
    });
  }
}

// Parse de envío
function parseShipping(text: string) {
  const raw = (text || '').replace(/[^\w\s,#-]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = raw.split(/[,|\n]/).map(p => p.trim()).filter(Boolean);
  const phoneMatch = raw.match(/\b(\d[\d\s-]{8,}\d)\b/);
  const phone = phoneMatch ? phoneMatch[1].replace(/\D/g, '') : '';
  const name = parts[0] || 'Cliente';
  const city = parts.length > 1 ? parts[1] : '';
  const address = parts.slice(2).filter(p => p !== phone).join(', ');
  return { name, phone, city, address };
}

// Normalizador de intención
function normalizeIntent(input: string) {
  const t = (input || '').toLowerCase().trim();
  const hasNumberCap = /\b(64|128|256|512)\b/.test(t);
  const hasWordCap = /(capacidad|capacidades)/.test(t) || hasNumberCap;
  return {
    isPricingIntent: sharedIsPricingIntent(input),
    isConfirmation: sharedIsConfirmation(input),
    isMixedGenreInput: sharedIsMixedGenreInput(input),
    isCapacityCmd: hasWordCap,
    isPromos: /\bpromos?\b|\bcombo(s)?\b/.test(t),
    isMusic: /\bm(ú|u)sica\b/.test(t),
    isCollections: /\bcoleccion(?:es)?\b/.test(t),
    isUpgrade: /\bupgrade\b/.test(t),
    isSecondUsb: /\b(segunda|2da|otro|otra)\b/.test(t)
  };
}

// Fallback textual de tabla (si no existe la imagen)
function buildMoviesTable(): string {
  return [
    '🍿 *USB de Películas y Series HD/4K*',
    '',
    '🔥 *Sagas y contenido incluido:*',
    '• Marvel: Avengers, Spider-Man, Iron Man, Thor, Capitán América...',
    '• DC: Batman (trilogía Nolan), Superman, Wonder Woman, Joker...',
    '• Star Wars: Saga completa (9 películas + series)',
    '• Harry Potter: Las 8 películas + Animales Fantásticos',
    '• Rápidos y Furiosos: Toda la saga (10 películas)',
    '• El Señor de los Anillos, Jurassic Park, Piratas del Caribe...',
    '',
    '📺 *Series destacadas:*',
    'Breaking Bad, Game of Thrones, The Office, Friends, Stranger Things...',
    '',
    '📦 *Capacidades disponibles:*',
    `1️⃣ 64GB - ~55 películas - ${priceCOP(119900)}`,
    `2️⃣ 128GB - ~120 películas - ${priceCOP(159900)} ⭐ Popular`,
    `3️⃣ 256GB - ~250 películas - ${priceCOP(229900)}`,
    `4️⃣ 512GB - ~520 películas - ${priceCOP(349900)}`,
    '',
    '🚚 *Envío GRATIS + Pago contraentrega*',
    '',
    '💬 Escribe el número (1-4) o dime qué películas/series quieres 👇'
  ].join('\n');
}

function buildIrresistibleOfferMovies(): string {
  return [
    '🔥 Oferta especial:',
    '• 2da USB -30%',
    '• Combo Películas + Música -20%',
    '',
    `64GB ${priceCOP(119900)} • 128GB ${priceCOP(159900)} • 256GB ${priceCOP(229900)} • 512GB ${priceCOP(349900)}`,
    'Elige 1️⃣ 64GB • 2️⃣ 128GB • 3️⃣ 256GB • 4️⃣ 512GB.'
  ].join('\n');
}

// Textual pricing format - no image loading
// Removed: const MOVIES_PRICING_IMAGE = path.resolve(__dirname, '../Portada/pricing_movies_table.png');

const moviesUsb = addKeyword([
  'Hola, me interesa la USB con películas o series.'
])
  .addAction(async (ctx, { flowDynamic }) => {
    const phone = ctx.from;

    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow: async () => { } },
      'moviesUsb',
      ['entry', 'personalization'],
      {
        lockOnStages: ['awaiting_capacity', 'awaiting_payment', 'checkout_started', 'completed'],
        resumeMessages: {
          awaiting_capacity: 'Elige capacidad para avanzar: 1️⃣ 64GB • 2️⃣ 128GB • 3️⃣ 256GB • 4️⃣ 512GB.',
          awaiting_payment: 'Retomemos pago/datos: envía Nombre, Ciudad/Dirección y Celular.',
          checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.',
          completed: 'Tu pedido ya fue confirmado. Si quieres añadir extras, escribe EXTRA.'
        }
      }
    );
    if (!pre.proceed) return;

    const urgency = await getUrgencyMsg(phone);
    const session = await getUserSession(phone);
    session.movieGenres = session.movieGenres || [];
    
    // Check if user already has collected data (genres/capacity) to avoid re-asking
    const collectedData = getUserCollectedData(session);
    
    // Update session with proper stage tracking
    await updateUserSession(phone, ctx.body, 'moviesUsb', 'intro_shown', false, { 
      messageType: 'movies', 
      confidence: 0.95, 
      metadata: { 
        entry: 'moviesUsb_entry',
        hasExistingPreferences: collectedData.hasGenres || collectedData.hasCapacity,
        completionPercentage: collectedData.completionPercentage
      } 
    });

    const anchor = `💎 Precios hoy: 64GB ${priceCOP(119900)} • 128GB ${priceCOP(159900)} • 256GB ${priceCOP(229900)} • 512GB ${priceCOP(349900)} — Envío GRATIS + Garantía 7 días.`;
    const social = Math.random() > 0.5 ? '🌟 +900 clientes felices este mes' : '⭐ 4.9/5 reseñas verificadas';

    // If user already has preferences, acknowledge them
     if (collectedData.hasGenres || collectedData.hasCapacity) {
       const msg = persuasionComposer.compose({
         flowId: 'moviesUsb',
         flowState: { step: 'onboarding' },
         userContext: buildUserContext(session),
         messageIntent: 'ask_question'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
     } else {
       const msg = persuasionComposer.compose({
         flowId: 'moviesUsb',
         flowState: { step: 'onboarding' },
         userContext: buildUserContext(session),
         messageIntent: 'ask_question'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
     }

    // 🔔 Register blocking question for stage-based follow-up
    // If user doesn't respond to genre question, follow-up will be sent after 20-30 min
    await registerBlockingQuestion(
      phone,
      ConversationStage.ASK_GENRE,
      'movies_genre_selection',
      'genre_selection',
      'moviesUsb',
      { contentType: 'movies', step: 'personalization' }
    ).catch(err => console.warn('⚠️ [MOVIES USB] Failed to register blocking question:', err));

    await postHandler(phone, 'moviesUsb', 'personalization');
  })

  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const inputRaw = ctx.body || '';
    const phone = ctx.from;

    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow },
      'moviesUsb',
      ['personalization', 'prices_shown', 'awaiting_capacity', 'awaiting_payment', 'checkout_started'],
      {
        lockOnStages: ['checkout_started', 'completed'],
        resumeMessages: {
          prices_shown: '¿Quieres ver capacidades o prefieres dar géneros/títulos? Escribe "CAPACIDADES" o 1–3.',
          awaiting_capacity: 'Elige capacidad para avanzar: 1️⃣ 64GB • 2️⃣ 128GB • 3️⃣ 256GB • 4️⃣ 512GB.',
          awaiting_payment: 'Retomemos pago/datos: envía Nombre, Ciudad/Dirección y Celular.',
          checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
        }
      }
    );
    if (!pre.proceed) return;

    const session = await getUserSession(phone);
    const { isPricingIntent, isConfirmation, isMixedGenreInput, isCapacityCmd, isPromos, isMusic } = normalizeIntent(inputRaw);

    // === PRIORITY 1: Detect pricing intent immediately ===
     if (isPricingIntent) {
       const msg = persuasionComposer.compose({
         flowId: 'moviesUsb',
         flowState: { step: 'capacity_choice' },
         userContext: buildUserContext(session),
         messageIntent: 'present_options'
       });
       await humanDelay();
       await flowDynamic([`${msg.text}\n${buildMoviesTable()}`]);
       session.conversationData = session.conversationData || {};
       session.conversationData.lastMoviesPricesShownAt = Date.now();
       await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
       return gotoFlow(capacidadPaso);
     }

    // === PRIORITY 2: Detect confirmation (Okey, OK, etc.) ===
     if (isConfirmation) {
       const msg = persuasionComposer.compose({
         flowId: 'moviesUsb',
         flowState: { step: 'capacity_choice' },
         userContext: buildUserContext(session),
         messageIntent: 'present_options'
       });
       await humanDelay();
       await flowDynamic([`${msg.text}\n${buildMoviesTable()}`]);
       session.conversationData = session.conversationData || {};
       session.conversationData.lastMoviesPricesShownAt = Date.now();
       await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
       return gotoFlow(capacidadPaso);
     }

    // === PRIORITY 3: Mixed genre detection ("de todo", "me gusta todo", etc.) ===
    if (isMixedGenreInput) {
      session.movieGenres = ['acción', 'comedia', 'drama', 'romance', 'terror', 'animadas'];
      session.conversationData = session.conversationData || {};
      session.conversationData.isMixedSelection = true;

      await updateUserSession(phone, ctx.body, 'moviesUsb_mixed', 'mixed_genres_selected', false, {
        messageType: 'movies',
        confidence: 0.9,
        metadata: { isMixedSelection: true }
      });

      // Short price-forward message (< 450 chars)
      await humanDelay();
      await flowDynamic([
        '🍿 *Mix Variado anotado.*\n\n' +
        buildCompactPriceLadder('movies')
      ]);
      session.conversationData.lastMoviesPricesShownAt = Date.now();
      await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
      return gotoFlow(capacidadPaso);
    }

    await updateUserSession(phone, ctx.body, 'moviesUsb_reply', null, false, { messageType: 'movies_reply' });

    // Mostrar tabla cuando pida capacidades o precios
    if (isCapacityCmd || /\b(precio|vale|cu[aá]nto|costo)\b/i.test(inputRaw)) {
      // Textual pricing only - no images
       const msg = persuasionComposer.compose({
         flowId: 'moviesUsb',
         flowState: { step: 'capacity_choice' },
         userContext: buildUserContext(session),
         messageIntent: 'present_options'
       });
       await humanDelay();
       await flowDynamic([
         [
           msg.text,
           buildMoviesTable()
         ].join('\n')
       ]);
       await humanDelay();
       await flowDynamic(['Responde 1️⃣ 64GB • 2️⃣ 128GB • 3️⃣ 256GB • 4️⃣ 512GB, o escribe 64/128/256/512.']);
      session.conversationData = session.conversationData || {};
      session.conversationData.lastMoviesPricesShownAt = Date.now();
      await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
      return gotoFlow(capacidadPaso);
    }

    if (/caro|costoso|precio alto|mucho|no s[eé]|dud/i.test(inputRaw)) {
      const msg = persuasionComposer.compose({
        flowId: 'moviesUsb',
        flowState: { step: 'objection' },
        userContext: buildUserContext(session),
        messageIntent: 'objection_reply'
      });
      await humanDelay();
      await flowDynamic([msg.text]);
      await postHandler(phone, 'moviesUsb', 'prices_shown');
      return;
    }

    if (isPromos) {
      await humanDelay();
      await flowDynamic([
        [
          '🎁 Promos activas:',
          '• 2da USB -30% (escribe SEGUNDA)',
          '• UPGRADE -12% (escribe UPGRADE)',
          '• Combo Música + Videos -20%',
          '',
          'Escribe: CAPACIDADES para ver la tabla'
        ].join('\n')
      ]);
      await postHandler(phone, 'moviesUsb', 'prices_shown');
      return;
    }

    if (isMusic) {
      await humanDelay();
      await flowDynamic([
        '🎧 Combo Películas + Música activo (-20%). Al elegir capacidad, podemos agregar la USB de Música con descuento. Escribe CAPACIDADES o responde 1–3.'
      ]);
      await postHandler(phone, 'moviesUsb', 'prices_shown');
    }

    // Atajo: si escribe 64/128/256/512, saltar a selección
    if (/\b(64|128|256|512)\b/.test(inputRaw)) {
      // Textual pricing only - no images
      await humanDelay();
      await flowDynamic([
        [
          '💾 Capacidades disponibles:',
          buildMoviesTable()
        ].join('\n')
      ]);
      await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
      return gotoFlow(capacidadPaso);
    }

    if (['1', '2', '3'].includes(inputRaw.trim())) {
      // Textual pricing only - no images
      await humanDelay();
      await flowDynamic([
        [
          '💾 Capacidades disponibles:',
          buildMoviesTable()
        ].join('\n')
      ]);
      session.conversationData = session.conversationData || {};
      session.conversationData.lastMoviesPricesShownAt = Date.now();

      await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
      return gotoFlow(capacidadPaso);
    }

    // Personalizado por texto libre
    if (inputRaw.trim().length > 2) {
      const { genres, titles } = matchingEngine.match(inputRaw, 'movies', { detectNegations: true });
      if (genres?.length) {
        session.movieGenres = Array.from(new Set([...(session.movieGenres || []), ...genres]));
        await updateUserSession(phone, ctx.body, 'moviesUsb_genresDetected', null, false, { metadata: { movieGenres: session.movieGenres } });
      }
      if (titles?.length) {
        session.requestedTitles = Array.from(new Set([...(session.requestedTitles || []), ...titles]));
        await updateUserSession(phone, ctx.body, 'moviesUsb_titlesDetected', null, false, { metadata: { titles: session.requestedTitles } });
      }

      // Only show price-forward message if genres or titles were detected
      if (genres?.length || titles?.length) {
        // SHORT price-forward message after genre capture (< 450 chars)
        await humanDelay();
        await flowDynamic([buildPostGenrePrompt('movies', genres || [])]);
        await postHandler(phone, 'moviesUsb', 'personalization');
        return;
      }
    }

    // Si el usuario dejó de responder y no hemos mostrado precios recientemente, enviamos oferta irresistible
    const lastShownAt = session.conversationData?.lastMoviesPricesShownAt || 0;
    const minutesSinceLast = (Date.now() - (session.lastInteraction?.getTime() || Date.now())) / 60000;
    if (minutesSinceLast >= 45 && (!lastShownAt || (Date.now() - lastShownAt) > 45 * 60 * 1000)) {
      await humanDelay();
      await flowDynamic([buildIrresistibleOfferMovies()]);
      session.conversationData.lastMoviesPricesShownAt = Date.now();
      await postHandler(phone, 'moviesUsb', 'prices_shown');
      return;
    }

     // Contextual fallback - guide user to next step
     await humanDelay();
     await flowDynamic([
       '🎬 *Elige cómo continuar:*\n\n' +
       '• Escribe un género: acción, comedia, terror\n' +
       '• Escribe "de todo" para mix variado\n' +
       '• Escribe "PRECIOS" para ver capacidades\n' +
       '• O elige capacidad directamente:\n' +
       '  1️⃣ 64GB • 2️⃣ 128GB ⭐ • 3️⃣ 256GB • 4️⃣ 512GB\n\n' +
       '¿Cuál prefieres? 👇'
     ]);
     await postHandler(phone, 'moviesUsb', 'prices_shown');
  });

const capacidadPaso = addKeyword([EVENTS.ACTION])
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const inputRaw = ctx.body || '';
    const input = inputRaw.toLowerCase().trim();
    const phone = ctx.from;

    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow },
      'moviesUsb',
      ['awaiting_capacity', 'awaiting_payment'],
      {
        lockOnStages: ['checkout_started', 'completed'],
        resumeMessages: {
          awaiting_capacity: 'Elige capacidad para avanzar: 1️⃣ 64GB • 2️⃣ 128GB • 3️⃣ 256GB • 4️⃣ 512GB.',
          awaiting_payment: 'Retomemos pago/datos: envía Nombre, Ciudad/Dirección y Celular.'
        }
      }
    );
    if (!pre.proceed) return;

    const session = await getUserSession(phone);
    await updateUserSession(
      phone,
      ctx.body,
      'moviesUsb',
      'moviesUsb_capacity',
      false,
      { metadata: { step: 'moviesUsb_capacity' } }
    );

    const { isCollections, isUpgrade } = normalizeIntent(inputRaw);

    if (isCollections) {
      await flowDynamic([
        [
          '📚 Colecciones disponibles:',
          '• Oscars y premiadas',
          '• Clásicos 80s/90s',
          '• Anime Premium',
          '• Sagas completas (Marvel, LOTR, HP, Star Wars)',
          '',
          'Se agregan sin costo en 256GB o 512GB.',
          persuasionComposer.compose({
            flowId: 'moviesUsb',
            flowState: { step: 'capacity_choice' },
            userContext: buildUserContext(session),
            messageIntent: 'present_options'
          }).text
        ].join('\n')
      ]);
      await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
      return;
    }

    if (isUpgrade && session.capacity) {
      const idx = USBCAPACITIES.findIndex(c => c.size === session.capacity);
      if (idx !== -1 && idx < USBCAPACITIES.length - 1) {
        const next = USBCAPACITIES[idx + 1];
        const upgraded = Math.round(next.price * 0.88);
        const beforePrice = session.price || USBCAPACITIES[idx].price;

        session.capacity = next.size;
        session.price = upgraded;

        await updateUserSession(phone, input, 'moviesUsb_upgradeApplied', null, false, {
          metadata: { capacity: next.size, price: upgraded, upgradeFrom: USBCAPACITIES[idx].size }
        });

        await flowDynamic([
          [
            `🔼 Upgrade a ${next.size} aplicado (-12%).`,
            `Antes: ${priceCOP(beforePrice)} → Ahora: ${priceCOP(upgraded)}`,
            '',
            persuasionComposer.compose({
              flowId: 'moviesUsb',
              flowState: { step: 'confirmation' },
              userContext: buildUserContext(session),
              messageIntent: 'confirm'
            }).text,
            '',
            'Envíame tus datos de envío para continuar:',
            '• Nombre completo',
            '• Ciudad y dirección',
            '• Celular (10 dígitos)',
            '',
            'Ej: Juan Pérez, Medellín, Cra 00 #00-00, 3001234567'
          ].join('\n')
        ]);

        await postHandler(phone, 'moviesUsb', 'awaiting_payment');
        await offerCrossSellIfAllowed(phone, 'afterCapacitySelected', flowDynamic, session);
        return gotoFlow(datosCliente);
      } else {
        await flowDynamic('Ya estás en la máxima capacidad disponible.');
        await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
        return;
      }
    }

    const capIdx = USBCAPACITIES.findIndex(u =>
      input.includes(u.num[0]) ||
      input.includes(u.size.replace('GB', '').trim()) ||
      input.includes(u.size.toLowerCase())
    );

    if (capIdx !== -1) {
      const sel = USBCAPACITIES[capIdx];
      session.capacity = sel.size;
      session.price = sel.price;

      await updateUserSession(phone, ctx.body, 'moviesUsb_capacitySelected', null, false, { metadata: { capacity: sel.size, price: sel.price } });

      const upgradeSuggestion =
        (capIdx < USBCAPACITIES.length - 1)
          ? `🤔 Por ${priceCOP(Math.max(0, USBCAPACITIES[capIdx + 1].price - sel.price))} más, subes a ${USBCAPACITIES[capIdx + 1].size} (escribe UPGRADE).`
          : '';

      // await flowDynamic([
      //   [
      //     `✅ Elegiste USB ${sel.size}`,
      //     sel.desc,
      //     `💰 Precio: ${priceCOP(sel.price)}`,
      //     sel.popular ? '🔥 Más elegida.' : '',
      //     sel.limited ? '💎 Stock limitado.' : '',
      //     sel.vip ? '👑 Alta demanda.' : '',
      //     upgradeSuggestion,
      //     '',
      //     '📦 Ahora tus datos de envío:',
      //     '• Nombre completo',
      //     '• Ciudad y dirección',
      //     '• Celular (10 dígitos)',
      //     '',
      //     'Ej: Ana Gómez, Bogotá, Calle 123 #45-67, 3001234567',
      //     '',
      //     randomUpsell()
      //   ].filter(Boolean).join('\n')
      // ]);

      await flowDynamic([
        [
          `✅ Elegiste USB ${sel.size}`,
          sel.desc,
          `💰 Precio: ${priceCOP(sel.price)}`,
          sel.popular ? '🔥 Más elegida.' : '',
          sel.limited ? '💎 Stock limitado.' : '',
          sel.vip ? '👑 Alta demanda.' : '',
          upgradeSuggestion,
          '',
          '📦 Ahora tus datos de envío:',
          '• Nombre completo',
          '• Ciudad y dirección',
          '• Celular (10 dígitos)',
          '',
          'Ej: Ana Gómez, Bogotá, Calle 123 #45-67, 3001234567',
          '',
          randomUpsell()
        ].filter(Boolean).join('\n')
      ]);

      await offerCrossSellIfAllowed(phone, 'afterCapacitySelected', flowDynamic, session);
      await postHandler(phone, 'moviesUsb', 'awaiting_payment');
      return gotoFlow(datosCliente);
    }

    if (isUpgrade) {
      await flowDynamic('Primero elige una capacidad base (1–4) para aplicar UPGRADE.');
      await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
      return;
    }

    await flowDynamic([
      [
        '❓ No reconocí tu respuesta.',
        'Elige una capacidad (1–4), escribe 64/128/256/512 o "UPGRADE" si ya seleccionaste una.'
      ].join('\n')
    ]);
    await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
  });

const datosCliente = addKeyword([EVENTS.ACTION])
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const text = ctx.body?.trim() || '';
    const phone = ctx.from;

    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow },
      'moviesUsb',
      ['awaiting_payment', 'checkout_started'],
      {
        lockOnStages: ['completed'],
        resumeMessages: {
          awaiting_payment: 'Retomemos pago/datos: envía Nombre, Ciudad/Dirección y Celular.',
          checkout_started: 'Estamos cerrando tu pedido. Si ya enviaste datos, espera confirmación.'
        }
      }
    );
    if (!pre.proceed) return;

    const session = await getUserSession(phone);
    await updateUserSession(phone, text, 'moviesUsb_shipping', null, false, { messageType: 'shipping' });

    const { isSecondUsb, isMusic } = normalizeIntent(text);

    if (isSecondUsb) {
      const baseCapacity = (session.capacity || '128GB') as UsbCapacity;
      const basePrice = USBCAPACITIES.find(c => c.size === baseCapacity)?.price || 159900;
      const discounted = Math.round(basePrice * 0.7);
      session.secondUsb = { capacity: baseCapacity, price: discounted };
      await updateUserSession(phone, text, 'moviesUsb_secondUsbAdded', null, false, { metadata: { secondUsb: session.secondUsb } });
      await flowDynamic([
        `🧩 Segunda USB (${baseCapacity}) añadida con -30%: ${priceCOP(discounted)}`,
        'Si no has enviado todavía los datos de envío, hazlo ahora.'
      ]);
      await postHandler(phone, 'moviesUsb', 'awaiting_payment');
      return;
    }

    if (isMusic) {
      session.addMusicCombo = true;
      await updateUserSession(phone, text, 'moviesUsb_musicCombo', null, false, { metadata: { addMusicCombo: true } });
      await flowDynamic('🎧 Añadiremos la USB de Música con -20% al confirmar. Puedes enviarme tus géneros favoritos de música luego.');
      await postHandler(phone, 'moviesUsb', 'awaiting_payment');
      return;
    }

    if (!/\b\d{10}\b/.test(text.replace(/\D/g, ''))) {
      await flowDynamic([
        '📞 Incluye tu celular (10 dígitos) junto a nombre y dirección.',
        'Formato sugerido: Nombre, Ciudad, Dirección, Celular.'
      ]);
      await postHandler(phone, 'moviesUsb', 'awaiting_payment');
      return;
    }

    const shipping = parseShipping(text);
    const capacities = [session.capacity || '128GB'];
    if (session.secondUsb) capacities.push(session.secondUsb.capacity);

    let finalPrice = session.price || 0;
    if (session.secondUsb) finalPrice += session.secondUsb.price;
    if (session.addMusicCombo) {
      const musicPriceBase = 99900;
      finalPrice += Math.round(musicPriceBase * 0.8);
    }

    const contentTypes = ['movies'];
    if (session.addMusicCombo) contentTypes.push('music');

    await postHandler(phone, 'moviesUsb', 'checkout_started');

    const result = await finalizeOrder({
      phoneNumber: phone,
      capacities,
      contentTypes,
      shippingData: `${shipping.name} | ${shipping.city} | ${shipping.address} | ${shipping.phone}`,
      overridePreferences: { movieGenres: session.movieGenres || [], titles: session.requestedTitles || [] },
      forceConfirm: true,
      existingOrderId: session.orderId,
      extras: { secondUsb: session.secondUsb || null, musicCombo: !!session.addMusicCombo, finalPrice }
    });

    if (!session.orderId) {
      session.orderId = result.orderId;
      await updateUserSession(phone, text, 'moviesUsb_orderIdSet', null, false, { metadata: { orderId: result.orderId } });
    }

    await flowDynamic([
      [
        `result.updated ? 🔄 Pedido actualizado: ${result.orderId} : 🆔 Pedido confirmado: ${result.orderId}`,
        `💰 Total estimado: ${priceCOP(finalPrice)} (se confirma en factura).`,
        '⏱️ Preparación: 3–12 horas según tamaño.',
        '✅ Gracias por tu compra.',
        '¿Añadimos documentales, trailers o colecciones? Escribe: EXTRA'
      ].join('\n')
    ]);

    session.stage = 'completed';
    await updateUserSession(phone, text, 'moviesUsb_completed', null, false, { metadata: { finalPrice } });
    
    // 🔔 Mark conversation complete - cancels all pending follow-ups to avoid bothering confirmed users
    await markConversationComplete(phone)
        .catch(err => console.warn('⚠️ Failed to mark conversation complete:', err));
    
    await offerCrossSellIfAllowed(phone, 'beforePayment', flowDynamic, session);
    await postHandler(phone, 'moviesUsb', 'completed');
    await offerCrossSellIfAllowed(phone, 'postPurchase', flowDynamic, session);
    return gotoFlow(orderProcessing);
  });

export default moviesUsb;
