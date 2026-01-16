import { addKeyword } from '@builderbot/bot';
import { updateUserSession, getUserSession, canSendOnce, getUserCollectedData } from './userTrackingSystem';
import { preHandler, postHandler } from './middlewareFlowGuard';
import { humanDelay } from '../utils/antiBanDelays';
import { isPricingIntent as sharedIsPricingIntent, isConfirmation as sharedIsConfirmation } from '../utils/textUtils';
import { crossSellSystem } from '../services/crossSellSystem';

// ===== PRICING CONFIGURATION =====
const GAMES_USB_PRICES: Record<string, number> = {
  '32GB': 84900,
  '64GB': 119900,
  '128GB': 159900,
  '256GB': 219900
};

// ===== PLATFORM DATA =====
const PLATFORM_INFO: Record<string, { games: string; popular: string }> = {
  'PS2': { 
    games: '~30 juegos',
    popular: 'Dragon Ball, GTA, FIFA, Resident Evil, God of War'
  },
  'PS1': {
    games: '~50 juegos',
    popular: 'Crash, Spyro, Final Fantasy, Tekken, Metal Gear'
  },
  'PSP': {
    games: '~25 juegos',
    popular: 'God of War, GTA, Monster Hunter, Tekken'
  },
  'Wii': {
    games: '~20 juegos',
    popular: 'Mario, Zelda, Smash Bros, Mario Kart'
  },
  'PC': {
    games: '~15 juegos',
    popular: 'GTA, Need for Speed, Age of Empires'
  }
};

// ===== UTILITIES =====
function toCOP(n: number) {
  return `$${n.toLocaleString('es-CO')}`;
}

function normalizeText(text: string): string {
  return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ===== INTENT DETECTION =====
function detectGamingIntent(message: string): { isGaming: boolean; platform?: string } {
  const normalized = normalizeText(message);
  
  // Detectar si pide videojuegos
  const gamingKeywords = /juego|game|videojuego|play\s?2|ps2|ps1|psp|nintendo|wii|gamecube|n64|snes|nes|pc|emulador|rom|iso/i;
  
  if (!gamingKeywords.test(normalized)) {
    return { isGaming: false };
  }
  
  // Detectar plataforma específica
  if (/ps2|play\s?station\s?2|play\s?2/i.test(normalized)) return { isGaming: true, platform: 'PS2' };
  if (/ps1|play\s?station\s?1|play\s?1|psx/i.test(normalized)) return { isGaming: true, platform: 'PS1' };
  if (/psp/i.test(normalized)) return { isGaming: true, platform: 'PSP' };
  if (/wii/i.test(normalized)) return { isGaming: true, platform: 'Wii' };
  if (/gamecube|gc/i.test(normalized)) return { isGaming: true, platform: 'GameCube' };
  if (/n64|nintendo\s?64/i.test(normalized)) return { isGaming: true, platform: 'N64' };
  if (/snes|super\s?nintendo/i.test(normalized)) return { isGaming: true, platform: 'SNES' };
  if (/nes/i.test(normalized)) return { isGaming: true, platform: 'NES' };
  if (/pc|computador|windows/i.test(normalized)) return { isGaming: true, platform: 'PC' };
  
  return { isGaming: true, platform: 'general' };
}

function isPricingIntent(message: string): boolean {
  return sharedIsPricingIntent(message);
}

function isConfirmation(message: string): boolean {
  return sharedIsConfirmation(message);
}

// ===== WELCOME MESSAGE =====
function buildGamingWelcome(platform?: string): string {
  const platformData = platform && PLATFORM_INFO[platform];
  
  const parts = [
    `🎮 ¡USB de Videojuegos${platform ? ' ' + platform : ''}!`,
    '',
    '📦 Capacidades disponibles:',
    `1️⃣ 32GB - ~15 juegos - ${toCOP(GAMES_USB_PRICES['32GB'])}`,
    `2️⃣ 64GB - ~30 juegos - ${toCOP(GAMES_USB_PRICES['64GB'])} ⭐ Popular`,
    `3️⃣ 128GB - ~60 juegos - ${toCOP(GAMES_USB_PRICES['128GB'])}`,
    `4️⃣ 256GB - ~120 juegos - ${toCOP(GAMES_USB_PRICES['256GB'])}`,
  ];
  
  if (platformData) {
    parts.push('', `🎯 Juegos populares: ${platformData.popular}`);
  }
  
  parts.push(
    '',
    '💬 Dime qué juegos te gustan o escribe "variado" para una selección top.',
    '',
    '🚚 Envío GRATIS + Pago contraentrega'
  );
  
  return parts.join('\n');
}

// ===== OBJECTION HANDLING =====
async function handleGamingObjections(userInput: string, flowDynamic: any): Promise<boolean> {
  const t = normalizeText(userInput);

  if (/precio|cuanto|vale|costo|coste|caro/.test(t)) {
    await humanDelay();
    await flowDynamic([
      [
        '💰 Capacidades disponibles:',
        `1️⃣ 32GB — ~15 juegos — ${toCOP(GAMES_USB_PRICES['32GB'])}`,
        `2️⃣ 64GB — ~30 juegos — ${toCOP(GAMES_USB_PRICES['64GB'])} ⭐`,
        `3️⃣ 128GB — ~60 juegos — ${toCOP(GAMES_USB_PRICES['128GB'])}`,
        `4️⃣ 256GB — ~120 juegos — ${toCOP(GAMES_USB_PRICES['256GB'])}`,
        '',
        'Responde con el número de tu elección.'
      ].join('\n')
    ]);
    return true;
  }

  if (/demora|envio|entrega|tarda|cuanto demora|tiempo|cuando/.test(t)) {
    await humanDelay();
    await flowDynamic([
      [
        '⏱️ Tiempos de entrega:',
        '• Preparación: 3–8h',
        '• Envío nacional: 1–3 días',
        '',
        '¿Elegimos capacidad? Responde 1, 2, 3 o 4'
      ].join('\n')
    ]);
    return true;
  }

  if (/garantia|seguro|confio|real|confiable|estafa|fraude|soporte/.test(t)) {
    await humanDelay();
    await flowDynamic([
      [
        '✅ Compra 100% segura:',
        '🌟 +900 pedidos este mes',
        '🛡️ Garantía 7 días',
        '🚚 Envío GRATIS',
        '',
        'Opción recomendada: 2️⃣ 64GB (~30 juegos)'
      ].join('\n')
    ]);
    return true;
  }

  return false;
}

// ===== CROSS-SELL =====
async function offerCrossSellIfAllowed(
  phone: string,
  stage: string,
  flowDynamic: any,
  session: any
) {
  const lastTs = session?.conversationData?.lastCrossSellAt
    ? new Date(session.conversationData.lastCrossSellAt).getTime()
    : 0;
  const canOffer = !lastTs || Date.now() - lastTs > 24 * 60 * 60 * 1000;
  if (!canOffer) return;

  const alreadyIds = session?.orderData?.items?.map((i: any) => i.productId) || [];
  const recs = crossSellSystem.generateRecommendations(session, {
    stage,
    maxItems: 3,
    alreadyAddedProductIds: alreadyIds
  });
  const msg = crossSellSystem.generateCrossSellMessage(recs);
  if (msg) {
    await humanDelay();
    await flowDynamic([msg]);
    session.conversationData = session.conversationData || {};
    session.conversationData.lastCrossSellAt = new Date().toISOString();
    await updateUserSession(phone, 'cross-sell-offered', 'gamesUsb', null, false, {
      messageType: 'crossSell',
      metadata: { stage, offeredIds: recs.map((r: any) => r.product.id) }
    });
  }
}

// ===== MAIN FLOW =====
const gamesUsb = addKeyword(['Hola, me interesan videojuegos.', 'quiero juegos'])
  .addAction(async (ctx, { flowDynamic }) => {
    const phone = ctx.from;
    
    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow: async () => { } },
      'gamesUsb',
      ['entry', 'personalization'],
      {
        lockOnStages: ['awaiting_capacity', 'awaiting_payment'],
        resumeMessages: {
          awaiting_capacity: 'Elige capacidad para avanzar: 1️⃣ 32GB • 2️⃣ 64GB • 3️⃣ 128GB • 4️⃣ 256GB.',
          awaiting_payment: 'Retomemos pago: ¿Nequi, Daviplata o tarjeta?'
        }
      }
    );
    if (!pre.proceed) return;

    try {
      const session = await getUserSession(phone);
      session.conversationData = session.conversationData || {};
      
      await updateUserSession(phone, ctx.body, 'gamesUsb', null, false, {
        messageType: 'games',
        confidence: 0.9,
        metadata: { entryPoint: 'gamesUsb_flow' }
      });

      // Detect gaming platform
      const gamingIntent = detectGamingIntent(ctx.body || '');
      const platform = gamingIntent.platform;

      // Check if user already has collected data
      const collectedData = getUserCollectedData(session);

      if (canSendOnce(session, 'games__welcome_consolidated', 180)) {
        const social = Math.random() > 0.5 ? '🌟 +900 pedidos este mes' : '⭐ 4.9/5 reseñas verificadas';

        // If user already has preferences, acknowledge them
        if (collectedData.hasCapacity) {
          const welcomeBack = [
            `🎮 ¡Bienvenido de nuevo! ${social}`,
            '',
            'Veo que ya tienes preferencias guardadas:'
          ];

          if (collectedData.hasCapacity && collectedData.capacity) {
            welcomeBack.push(`💾 Capacidad: ${collectedData.capacity}`);
          }

          welcomeBack.push('', '¿Quieres continuar con esta configuración o modificar algo?');
          await humanDelay();
          await flowDynamic([welcomeBack.join('\n')]);
        } else {
          // First time user - show welcome message
          await humanDelay();
          await flowDynamic([buildGamingWelcome(platform)]);
        }

        session.conversationData.gamesWelcomeAt = Date.now();
        session.conversationData.selectedPlatform = platform;
        
        await postHandler(phone, 'gamesUsb', 'personalization');
        return;
      }
    } catch (e) {
      console.error('gamesUsb entry error:', e);
      await humanDelay();
      await flowDynamic([
        'Puedo mostrarte precios o personalizar por plataforma. Escribe "precio" o tu consola favorita (PS2, PSP, etc.).'
      ]);
      await postHandler(phone, 'gamesUsb', 'personalization');
    }
  })
  
  // Capture user input
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const phone = ctx.from;
    const msg = ctx.body?.trim() || '';
    if (!phone || !msg) return;

    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow },
      'gamesUsb',
      ['personalization', 'prices_shown', 'awaiting_capacity', 'awaiting_payment'],
      {
        lockOnStages: ['awaiting_capacity', 'awaiting_payment', 'checkout_started'],
        resumeMessages: {
          prices_shown: 'Retomemos: "precio" o dime la plataforma/juegos. También "OK".',
          awaiting_capacity: 'Elige capacidad para avanzar: 1️⃣ 32GB • 2️⃣ 64GB • 3️⃣ 128GB • 4️⃣ 256GB.',
          awaiting_payment: 'Retomemos pago: ¿Nequi, Daviplata o tarjeta?'
        }
      }
    );
    if (!pre.proceed) return;

    const session: any = await getUserSession(phone);

    // === PRIORITY 1: Detect pricing intent immediately ===
    if (isPricingIntent(msg)) {
      await humanDelay();
      await flowDynamic([
        [
          '💰 Capacidades disponibles:',
          `1️⃣ 32GB — ~15 juegos — ${toCOP(GAMES_USB_PRICES['32GB'])}`,
          `2️⃣ 64GB — ~30 juegos — ${toCOP(GAMES_USB_PRICES['64GB'])} ⭐`,
          `3️⃣ 128GB — ~60 juegos — ${toCOP(GAMES_USB_PRICES['128GB'])}`,
          `4️⃣ 256GB — ~120 juegos — ${toCOP(GAMES_USB_PRICES['256GB'])}`,
          '',
          'Responde con el número de tu elección.'
        ].join('\n')
      ]);
      session.conversationData = session.conversationData || {};
      session.conversationData.lastGamesPricesShownAt = Date.now();
      await postHandler(phone, 'gamesUsb', 'awaiting_capacity');
      return;
    }

    // === PRIORITY 2: Detect confirmation (OK, etc.) ===
    if (isConfirmation(msg)) {
      await humanDelay();
      await flowDynamic([
        [
          '🎮 Perfecto! Veamos las capacidades:',
          `1️⃣ 32GB — ~15 juegos — ${toCOP(GAMES_USB_PRICES['32GB'])}`,
          `2️⃣ 64GB — ~30 juegos — ${toCOP(GAMES_USB_PRICES['64GB'])} ⭐`,
          `3️⃣ 128GB — ~60 juegos — ${toCOP(GAMES_USB_PRICES['128GB'])}`,
          `4️⃣ 256GB — ~120 juegos — ${toCOP(GAMES_USB_PRICES['256GB'])}`,
          '',
          'Responde con el número de tu elección.'
        ].join('\n')
      ]);
      session.conversationData = session.conversationData || {};
      session.conversationData.lastGamesPricesShownAt = Date.now();
      await postHandler(phone, 'gamesUsb', 'awaiting_capacity');
      return;
    }

    try {
      // Handle objections
      const handled = await handleGamingObjections(msg, flowDynamic);
      if (handled) {
        await postHandler(phone, 'gamesUsb', 'prices_shown');
        return;
      }

      // Detect platform or game preferences
      const gamingIntent = detectGamingIntent(msg);
      if (gamingIntent.isGaming && gamingIntent.platform) {
        session.conversationData = session.conversationData || {};
        session.conversationData.selectedPlatform = gamingIntent.platform;
        session.conversationData.selectedGames = msg; // Store raw user input for game preferences

        await updateUserSession(phone, msg, 'gamesUsb', 'preferences_collected', false, {
          messageType: 'games',
          confidence: 0.85,
          metadata: {
            platform: gamingIntent.platform,
            gamesPreference: msg,
            personalizationComplete: true
          }
        });

        const summary = [
          '🎮 Listo! Plataforma confirmada:',
          `✅ ${gamingIntent.platform}`,
        ];

        if (PLATFORM_INFO[gamingIntent.platform]) {
          summary.push(`🎯 Juegos populares: ${PLATFORM_INFO[gamingIntent.platform].popular}`);
        }

        summary.push('', 'Escribe "OK" para ver capacidades.');

        await humanDelay();
        await flowDynamic([summary.join('\n')]);
        await postHandler(phone, 'gamesUsb', 'personalization');
        return;
      }

      // Capacity shortcut
      if (/\b(32|64|128|256)\s*gb\b/i.test(msg)) {
        await humanDelay();
        await flowDynamic([
          [
            '💾 Capacidades disponibles:',
            `1️⃣ 32GB — ~15 juegos — ${toCOP(GAMES_USB_PRICES['32GB'])}`,
            `2️⃣ 64GB — ~30 juegos — ${toCOP(GAMES_USB_PRICES['64GB'])} ⭐`,
            `3️⃣ 128GB — ~60 juegos — ${toCOP(GAMES_USB_PRICES['128GB'])}`,
            `4️⃣ 256GB — ~120 juegos — ${toCOP(GAMES_USB_PRICES['256GB'])}`
          ].join('\n')
        ]);
        session.conversationData = session.conversationData || {};
        session.conversationData.lastGamesPricesShownAt = Date.now();
        await postHandler(phone, 'gamesUsb', 'awaiting_capacity');
        return;
      }

      // Direct capacity selection by number
      if (['1', '2', '3', '4'].includes(msg)) {
        session.conversationData = session.conversationData || {};
        session.conversationData.lastGamesPricesShownAt = Date.now();
        await humanDelay();
        await flowDynamic([
          [
            '✅ Confirma tu elección:',
            `1️⃣ 32GB (~15) — ${toCOP(GAMES_USB_PRICES['32GB'])}`,
            `2️⃣ 64GB (~30) — ${toCOP(GAMES_USB_PRICES['64GB'])} ⭐`,
            `3️⃣ 128GB (~60) — ${toCOP(GAMES_USB_PRICES['128GB'])}`,
            `4️⃣ 256GB (~120) — ${toCOP(GAMES_USB_PRICES['256GB'])}`
          ].join('\n')
        ]);
        await offerCrossSellIfAllowed(phone, 'beforePayment', flowDynamic, session);
        await postHandler(phone, 'gamesUsb', 'awaiting_capacity');
        return;
      }

      // Fallback - guide user
      await humanDelay();
      await flowDynamic([
        '🙌 Dime tu plataforma favorita (ej: "PS2", "PSP") o escribe "OK" para ver la tabla de capacidades y elegir.'
      ]);
      await postHandler(phone, 'gamesUsb', 'personalization');

    } catch (e) {
      console.error('gamesUsb error:', e);
      await humanDelay();
      await flowDynamic([
        'Puedo mostrarte precios y capacidades o personalizar por plataforma.',
        'Elige: 1️⃣ 32GB • 2️⃣ 64GB • 3️⃣ 128GB • 4️⃣ 256GB, o dime tu plataforma favorita.'
      ]);
      await postHandler(phone, 'gamesUsb', 'prices_shown');
    }
  });

export default gamesUsb;
