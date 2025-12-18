import { addKeyword } from '@builderbot/bot';
import capacityVideo from './capacityVideo';
import musicUsb from './musicUsb';
import { updateUserSession, getUserSession, canSendOnce, hasSignificantProgress, getUserCollectedData, buildConfirmationMessage } from './userTrackingSystem';
import {
  saveUserCustomizationState,
  loadUserCustomizationState,
  mapVideoStateToCustomizationState,
  mapCustomizationStateToVideoState,
  mergeVideoState,
  type UserVideoState
} from '../userCustomizationDb';
import { crossSellSystem } from '../services/crossSellSystem';
import path, { join } from 'path';
import { promises as fs } from 'fs';
import { preHandler, postHandler } from './middlewareFlowGuard';
import crypto from 'crypto';
import { EnhancedVideoFlow } from './enhancedVideoFlow';
import { flowHelper } from '../services/flowIntegrationHelper';

// ===== NUEVO: Utils de formato =====
const bullets = {
  check: '✅',
  spark: '✨',
  star: '⭐',
  fire: '🔥',
  eye: '👁️',
  film: '🎬',
  cam: '🎥',
  clock: '⏰',
  box: '📦',
  chip: '💾',
  shield: '🛡️'
};

function toCOP(n: number) {
  return `$${n.toLocaleString('es-CO')}`;
}
function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ===== Horario y gates =====
function isHourAllowed(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 9 && h <= 21;
}
function allowNonCritical() {
  return isHourAllowed();
}

function canSendUserBlock(session: any): { ok: boolean; reason?: string } {
  const now = new Date();
  if (!isHourAllowed(now)) return { ok: false, reason: 'outside_hours' };
  
  // Si el usuario tiene progreso significativo, ser más flexible
  if (hasSignificantProgress(session)) {
    console.log('✅ videosUsb: Usuario con progreso significativo, límites relajados');
    
    // Límite más flexible: 24h en lugar de 12h
    const lastAt = session.conversationData?.videos_lastBlockAt 
      ? new Date(session.conversationData.videos_lastBlockAt) 
      : null;
    
    if (lastAt && now.getTime() - lastAt.getTime() < 24 * 3600000) {
      return { ok: false, reason: 'under_24h_with_progress' };
    }
    
    return { ok: true };
  }
  
  // Sin progreso: aplicar límites normales
  session.conversationData = session.conversationData || {};
  const lastAt = session.conversationData.videos_lastBlockAt ? new Date(session.conversationData.videos_lastBlockAt) : null;
  if (lastAt && now.getTime() - lastAt.getTime() < 12 * 3600000) return { ok: false, reason: 'under_12h' };
  const hist: string[] = (session.conversationData.videos_blocksHistory || []) as string[];
  const weekAgo = now.getTime() - 7 * 24 * 3600000;
  const recent = (hist || []).filter(ts => new Date(ts).getTime() >= weekAgo);
  if (recent.length >= 2) return { ok: false, reason: 'weekly_cap' };
  return { ok: true };
}
function recordUserBlock(session: any) {
  const nowIso = new Date().toISOString();
  session.conversationData = session.conversationData || {};
  const hist: string[] = (session.conversationData.videos_blocksHistory || []) as string[];
  session.conversationData.videos_lastBlockAt = nowIso;
  session.conversationData.videos_blocksHistory = [...(hist || []), nowIso].slice(-10);
}
function hasSentBody(session: any, body: string): boolean {
  const h = sha256(body);
  session.conversationData = session.conversationData || {};
  const sent = (session.conversationData.videos_sentBodies || []) as string[];
  return sent.includes(h);
}
function markBodySent(session: any, body: string) {
  const h = sha256(body);
  session.conversationData = session.conversationData || {};
  const sent = (session.conversationData.videos_sentBodies || []) as string[];
  session.conversationData.videos_sentBodies = Array.from(new Set([...sent, h])).slice(-100);
}

async function safeFlowSend(
  session: any,
  flowDynamic: any,
  payloads: Array<string | { body: string; media?: string }>,
  { blockType = 'intense' as 'intense' | 'light' } = {}
) {
  const toSend: Array<{ body: string; media?: string }> = [];
  for (const p of payloads) {
    const body = typeof p === 'string' ? p : p.body || '';
    if (!body) continue;
    if (hasSentBody(session, body)) continue;
    toSend.push(typeof p === 'string' ? { body: p } : p);
  }
  if (!toSend.length) return;

  if (blockType === 'intense') {
    const gate = canSendUserBlock(session);
    if (!gate.ok) {
      console.log(`⏸️ videosUsb gate: ${gate.reason}`);
      return;
    }
    await flowDynamic(toSend);
    toSend.forEach(p => markBodySent(session, p.body));
    recordUserBlock(session);
  } else {
    if (!allowNonCritical()) return;
    await flowDynamic(toSend);
    toSend.forEach(p => markBodySent(session, p.body));
  }
}

// ====== CONSTANTES DE PRECIOS (alineadas con capacityVideo) ======
const VIDEO_USB_PRICES: Record<string, number> = {
  '8GB': 59900,
  '32GB': 84900,
  '64GB': 119900,
  '128GB': 159900
};
const DEMO_VIDEO_COUNT = 2;
const SCARCITY_UNITS = 3; // no se usa todavía, pero lo mantenemos por si tu capacityVideo lo utiliza

// ====== DATOS ======
export const videoData = {
  topHits: {
    bachata: [
      {
        name: 'Romeo Santos - Propuesta Indecente',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Bachata/Romeo Santos - Propuesta Indecente_demo.mp4'
        )
      },
      {
        name: 'Aventura - Obsesión',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Bachata/Aventura - Obsesión_demo.mp4'
        )
      },
      {
        name: 'Juan Luis Guerra - Burbujas de Amor',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Bachata/Juan Luis Guerra - Burbujas de Amor_demo.mp4'
        )
      }
    ],
    reggaeton: [
      {
        name: 'Daddy Yankee - Gasolina',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Reggaeton/Daddy Yankee - Gasolina_demo.mp4'
        )
      },
      {
        name: 'FloyyMenor - Gata Only',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Reggaeton/FloyyMenor - Gata Only_demo.mp4'
        )
      },
      {
        name: 'Bad Bunny - Tití Me Preguntó',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Reggaeton/Bad Bunny - Tití Me Preguntó_demo.mp4'
        )
      }
    ],
    salsa: [
      {
        name: 'Marc Anthony - Vivir Mi Vida',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Salsa/Marc Anthony - Vivir Mi Vida_demo.mp4'
        )
      },
      {
        name: 'Joe Arroyo - La Rebelión',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Salsa/Joe Arroyo - La Rebelión_demo.mp4'
        )
      },
      {
        name: 'Willie Colón - Pedro Navaja',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Salsa/Willie Colón - Pedro Navaja_demo.mp4'
        )
      }
    ],
    rock: [
      {
        name: "Queen - Bohemian Rhapsody",
        file: path.join(
          __dirname,
          "../demos_videos_recortados/Rock/Queen - Bohemian Rhapsody_demo.mp4"
        )
      },
      {
        name: "Guns N' Roses - Sweet Child O' Mine",
        file: path.join(
          __dirname,
          "../demos_videos_recortados/Rock/Guns N Roses - Sweet Child O Mine_demo.mp4"
        )
      },
      {
        name: 'Led Zeppelin - Stairway to Heaven',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Rock/Led Zeppelin - Stairway to Heaven_demo.mp4'
        )
      }
    ],
    merengue: [
      {
        name: 'Juan Luis Guerra - El Niágara en Bicicleta',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Merengue/Juan Luis Guerra - El Niágara en Bicicleta_demo.mp4'
        )
      },
      {
        name: 'Elvis Crespo - Suavemente',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Merengue/Elvis Crespo - Suavemente_demo.mp4'
        )
      },
      {
        name: 'Wilfrido Vargas - El Jardinero',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Merengue/Wilfrido Vargas - El Jardinero_demo.mp4'
        )
      }
    ],
    baladas: [
      {
        name: 'Ricardo Arjona - Historia de Taxi',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Baladas/Ricardo Arjona - Historia de Taxi_demo.mp4'
        )
      },
      {
        name: 'Maná - Rayando el Sol',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Baladas/Maná - Rayando el Sol_demo.mp4'
        )
      },
      {
        name: 'Jesse & Joy - Espacio Sideral',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Baladas/Jesse & Joy - Espacio Sideral_demo.mp4'
        )
      }
    ],
    electronica: [
      {
        name: 'David Guetta ft. Sia - Titanium',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Electronica/David Guetta ft. Sia - Titanium_demo.mp4'
        )
      },
      {
        name: 'Avicii - Levels',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Electronica/Avicii - Levels_demo.mp4'
        )
      },
      {
        name: 'Martin Garrix - Animals',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Electronica/Martin Garrix - Animals_demo.mp4'
        )
      }
    ],
    cumbia: [
      {
        name: 'Los Ángeles Azules - Nunca Es Suficiente',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Cumbia/Los Ángeles Azules - Nunca Es Suficiente_demo.mp4'
        )
      },
      {
        name: 'Celso Piña - Cumbia Sobre el Río',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Cumbia/Celso Piña - Cumbia Sobre el Río_demo.mp4'
        )
      },
      {
        name: 'La Sonora Dinamita - Que Bello',
        file: path.join(
          __dirname,
          '../demos_videos_recortados/Cumbia/La Sonora Dinamita - Que Bello_demo.mp4'
        )
      }
    ]
  },
  artistsByGenre: {
    reggaeton: [
      'bad bunny',
      'daddy yankee',
      'j balvin',
      'ozuna',
      'maluma',
      'karol g',
      'anuel aa',
      'nicky jam',
      'wisin y yandel',
      'don omar',
      'farruko',
      'myke towers',
      'sech',
      'rauw alejandro',
      'feid',
      'ryan castro',
      'blessd',
      'floyymenor'
    ],
    bachata: [
      'romeo santos',
      'aventura',
      'prince royce',
      'frank reyes',
      'anthony santos',
      'xtreme',
      'toby love',
      'elvis martinez',
      'zacarias ferreira',
      'joe veras'
    ],
    salsa: [
      'marc anthony',
      'willie colon',
      'hector lavoe',
      'celia cruz',
      'joe arroyo',
      'gilberto santa rosa',
      'victor manuelle',
      'la india',
      'tito nieves',
      'eddie santiago'
    ],
    rock: [
      'queen',
      'guns n roses',
      'metallica',
      'ac/dc',
      'led zeppelin',
      'pink floyd',
      'nirvana',
      'bon jovi',
      'aerosmith',
      'kiss',
      'the beatles',
      'rolling stones'
    ],
    vallenato: [
      'carlos vives',
      'diomedes diaz',
      'jorge celedon',
      'silvestre dangond',
      'martin elias',
      'los diablitos',
      'binomio de oro',
      'los inquietos',
      'miguel morales'
    ]
  },
  playlistImages: {
    crossover: path.join(__dirname, '../Portada/video_crossover.png'),
    latino: path.join(__dirname, '../Portada/video_latino.png'),
    internacional: path.join(__dirname, '../Portada/video_internacional.png'),
    clasicos: path.join(__dirname, '../Portada/video_clasicos.png'),
    personalizada: path.join(__dirname, '../Portada/video_personalizada.png')
  },
  playlists: [
    {
      name: '🎬🔥 Video Crossover Total',
      genres: [
        'reggaeton',
        'salsa',
        'vallenato',
        'rock',
        'pop',
        'bachata',
        'merengue',
        'baladas',
        'electronica',
        'cumbia'
      ],
      img: 'crossover',
      description: 'La colección más completa de videos musicales en HD y 4K'
    },
    {
      name: '🇨🇴 Videos Colombia Pura Vida',
      genres: ['vallenato', 'cumbia', 'champeta', 'merengue', 'salsa'],
      img: 'latino',
      description: 'Lo mejor del folclor y música colombiana en video'
    },
    {
      name: '🌟 Hits Internacionales',
      genres: ['rock', 'pop', 'electronica', 'hiphop', 'r&b'],
      img: 'internacional',
      description: 'Los videos más virales del mundo'
    },
    {
      name: '💎 Clásicos Inmortales',
      genres: ['rock', 'salsa', 'baladas', 'boleros', 'rancheras'],
      img: 'clasicos',
      description: 'Videos legendarios que nunca pasan de moda'
    },
    {
      name: '🎯 Personalizada Premium',
      genres: [],
      img: 'personalizada',
      description: 'Crea tu colección única de videos'
    }
  ],
  conversionTips: [
    '🎬 Videos en HD y 4K',
    '📱 Compatible con TV, celular, tablet y computador',
    '🎁 25% de descuento en tu segunda USB de videos',
    '🚚 Envío gratis + Contenido garantizado',
    '🔥 Más de 10,000 videos musicales disponibles'
  ]
};

// ====== UTILIDADES ======
class VideoUtils {
  static normalizeText(text: string): string {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  static dedupeArray<T>(arr: T[]): T[] {
    return [...new Set(arr)];
  }
  static async getValidFile(filePath: string) {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(__dirname, filePath);
      await fs.access(absolutePath);
      return { valid: true, path: absolutePath };
    } catch {
      return { valid: false };
    }
  }
  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ====== ESTADO ======
class VideoStateManager {
  private static userStates = new Map<string, UserVideoState>();

  static async getOrCreate(phone: string): Promise<UserVideoState> {
    if (!this.userStates.has(phone)) {
      const dbState = await loadUserCustomizationState(phone).catch(() => null);
      if (dbState) {
        this.userStates.set(phone, mapCustomizationStateToVideoState(dbState));
      } else {
        this.userStates.set(phone, {
          phoneNumber: phone,
          selectedGenres: [],
          mentionedArtists: [],
          preferredEras: [],
          videoQuality: 'HD',
          customizationStage: 'initial',
          lastPersonalizationTime: new Date(),
          personalizationCount: 0,
          showedPreview: false,
          usbName: undefined
        });
      }
    }
    return this.userStates.get(phone)!;
  }

  static async save(userState: UserVideoState) {
    this.userStates.set(userState.phoneNumber, userState);
    const toDb = mapVideoStateToCustomizationState(userState);
    await saveUserCustomizationState(toDb);
  }
}

// ====== DEMOS ======
class VideoDemoManager {
  static async getRandomVideosByGenres(genres: string[], count = DEMO_VIDEO_COUNT) {
    const results: { name: string; filePath: string; genre: string }[] = [];
    const used = new Set<string>();
    const pool = genres.length ? genres : Object.keys(videoData.topHits);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    for (const genre of shuffled) {
      if (results.length >= count) break;
      const list = (videoData as any).topHits[genre] || [];
      if (!list.length) continue;
      const candidate = list[Math.floor(Math.random() * list.length)];
      if (used.has(candidate.name)) continue;
      const file = await VideoUtils.getValidFile(candidate.file);
      if (file.valid) {
        used.add(candidate.name);
        results.push({
          name: candidate.name,
          filePath: (file as any).path,
          genre
        });
      }
    }
    return results.slice(0, count);
  }
}

// ====== DETECTOR ======
class VideoIntentDetector {
  static isFastBuy(input: string) {
    const txt = VideoUtils.normalizeText(input);
    return /(comprar|quiero|listo|confirmo|confirmar|hacer pedido|ordenar|pagar|contraentrega)/i.test(txt);
  }
  static isContinue(input: string) {
    const txt = VideoUtils.normalizeText(input);
    return /^(ok|okay|si|sí|continuar|siguiente|listo|precio|capacidad|seguir)$/i.test(txt);
  }
  static extractGenres(message: string): string[] {
    const txt = VideoUtils.normalizeText(message);
    return Object.keys((videoData as any).topHits).filter(g => txt.includes(g));
  }
  static extractArtists(message: string, genres: string[] = []) {
    const txt = VideoUtils.normalizeText(message);
    const searchGenres = genres.length ? genres : Object.keys((videoData as any).artistsByGenre);
    const found: string[] = [];
    searchGenres.forEach(g => {
      ((videoData as any).artistsByGenre[g] || []).forEach((a: string) => {
        if (txt.includes(VideoUtils.normalizeText(a))) found.push(a);
      });
    });
    return VideoUtils.dedupeArray(found);
  }
  static extractEras(message: string) {
    const eras = ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
    const txt = VideoUtils.normalizeText(message);
    return eras.filter(e => txt.includes(e.toLowerCase()));
  }
}

// ====== CROSS-SELL EXTERNO ======
export async function offerCrossSellIfAllowed(
  phone: string,
  stage: 'afterCapacitySelected' | 'beforePayment' | 'postPurchase' | 'highIntentNoConfirm',
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
    if (!hasSentBody(session, msg)) {
      await safeFlowSend(session, flowDynamic, [msg], { blockType: 'light' });
      session.conversationData = session.conversationData || {};
      session.conversationData.lastCrossSellAt = new Date().toISOString();
      await updateUserSession(phone, 'cross-sell-offered', 'videosUsb', null, false, {
        messageType: 'crossSell',
        metadata: { stage, offeredIds: recs.map((r: any) => r.product.id) }
      });
    }
  }
}

// ====== OBJECIONES ======
async function handleVideoObjections(userInput: string, flowDynamic: any) {
  const t = VideoUtils.normalizeText(userInput);

  // if (/precio|cuanto|vale|costo|coste|caro/.test(t)) {
  //   const pricingImagePath = path.resolve(__dirname, '../Portada/pricing_video_table.png');
  //   const canAccess = await fs.access(pricingImagePath).then(() => true).catch(() => false);
  //   if (canAccess) {
  //     await flowDynamic([{ body: '💰 Precios HOY (solo videos):', media: pricingImagePath }]);
  //     await VideoUtils.delay(250);
  //   } else {
  //     await flowDynamic([
  //       [
  //         '💰 Precios HOY (solo videos):',
  //         `• 8GB (≈260) → ${toCOP(VIDEO_USB_PRICES['8GB'])}`,
  //         `• 32GB (≈1.000) → ${toCOP(VIDEO_USB_PRICES['32GB'])}`,
  //         `• 64GB (≈2.000) → ${toCOP(VIDEO_USB_PRICES['64GB'])} ⭐`,
  //         `• 128GB (≈4.000) → ${toCOP(VIDEO_USB_PRICES['128GB'])}`
  //       ].join('\n')
  //     ]);
  //   }
  //   await flowDynamic(['Responde 1️⃣, 2️⃣, 3️⃣ o 4️⃣ para continuar.']);
  //   return true;
  // }

  if (/demora|envio|entrega|tarda|cuanto demora|tiempo|cuando/.test(t)) {
    await flowDynamic([
      [
        '⏱️ Tiempos:',
        '• Producción 3–8h según tamaño',
        '• Envío el mismo día',
        '• Entrega 1–3 días hábiles en Colombia',
        '',
        '¿Avanzamos con capacidad? 1-8GB-260 • 2-32GB-1.000 • 3-64GB-2.000 • 4-128GB-4.000.'
      ].join('\n')
    ]);
    return true;
  }

  if (/garantia|seguro|confio|real|confiable|estafa|fraude|soporte/.test(t)) {
    await flowDynamic([
      [
        '✅ Compra segura:',
        '• Reseñas 4.9/5 verificadas',
        '• Contenido garantizado en archivos',
        '• Reenvío de respaldo si lo necesitas',
        '',
        '¿Vemos la opción recomendada? 3️⃣ 64GB (≈2.000 videos).'
      ].join('\n')
    ]);
    return true;
  }

  if (/carpeta|organizacion|orden|nombres|tags|metadata/.test(t)) {
    await flowDynamic([
      [
        '🗂️ Entrega organizada:',
        '• Carpetas por artista y género',
        '• Nombres limpios y consistentes',
        '• Configurada para TV/carro/parlantes',
        '',
        'Dime 2 géneros/artistas o elige 2️⃣/3️⃣/4️⃣.'
      ].join('\n')
    ]);
    return true;
  }

  return false;
}

// ====== CROSS-SELL SUAVE ======
async function safeCrossSell(
  flowDynamic: any,
  session: any,
  phone: string,
  context: 'post_price' | 'pre_payment'
) {
  try {
    const last = session?.conversationData?.lastCrossSellAt
      ? new Date(session.conversationData.lastCrossSellAt).getTime()
      : 0;
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;
    const msg =
      context === 'post_price'
        ? 'Tip: al final podemos activar combo “Música + Videos” con 15% OFF adicional.'
        : 'Opcional: al finalizar puedes sumar “Música + Videos” (15% OFF). Si te interesa, escribe "VIDEOS" cuando confirmemos.';
    if (hasSentBody(session, msg)) return;
    await safeFlowSend(session, flowDynamic, [msg], { blockType: 'light' });
    session.conversationData = session.conversationData || {};
    session.conversationData.lastCrossSellAt = new Date().toISOString();
    await updateUserSession(phone, 'cross-sell-guard', 'videosUsb', null, false, {
      metadata: { cx_context: context }
    });
  } catch {
    /* silencioso */
  }
}

function buildIrresistibleOfferVideos(): string {
  return [
    '🔥 Oferta especial por tiempo limitado:',
    '• UPGRADE -12% al siguiente tamaño',
    '• 2da USB de videos -25%',
    '• Combo Música + Videos -20%',
    '',
    'Precios directos: 8GB $59.900 1.400 canciones • 32GB $84.900 5.000 canciones • 64GB $119.900 10.000 canciones • 128GB $159.900 20.000 canciones',
    'Elige 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.'
  ].join('\n');
}

// ====== FLUJO PRINCIPAL ======
const videoUsb = addKeyword(['Hola, me interesa la USB con vídeos.'])
  // Intro y demo opcional
  .addAction(async (ctx, { flowDynamic }) => {
    const phone = ctx.from;
    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow: async () => { } },
      'videosUsb',
      ['entry', 'personalization'],
      {
        lockOnStages: ['awaiting_capacity', 'awaiting_payment'],
        resumeMessages: {
          awaiting_capacity:
            'Elige capacidad para avanzar: 1️⃣ 8GB-260 • 2️⃣ 32GB-1.000 • 3️⃣ 64GB-2.000 • 4️⃣ 128GB-4.000.',
          awaiting_payment: 'Retomemos pago: ¿Nequi, Daviplata o tarjeta?'
        }
      }
    );
    if (!pre.proceed) return;

    try {
      const state = await VideoStateManager.getOrCreate(phone);
      state.customizationStage = 'initial';
      state.lastPersonalizationTime = new Date();
      state.personalizationCount = 0;
      await VideoStateManager.save(state);

      await updateUserSession(phone, ctx.body, 'videosUsb', null, false, {
        messageType: 'videos',
        confidence: 0.9,
        metadata: { entryPoint: 'videoUsb_flow' }
      });

      const sess = (await getUserSession(phone)) as any;

      // Check if user already has collected data (genres/capacity) to avoid re-asking
      const collectedData = getUserCollectedData(sess);
      
      if (canSendOnce(sess, 'videos__welcome_consolidated', 180)) {
        const social = Math.random() > 0.5 ? '🌟 +900 pedidos este mes' : '⭐ 4.9/5 reseñas verificadas';
        
        // If user already has genres/capacity, acknowledge and skip to next step
        if (collectedData.hasGenres || collectedData.hasCapacity) {
          const welcomeBack = [
            `🎬 ¡Bienvenido de nuevo! ${social}`,
            '',
            'Veo que ya tienes algunas preferencias guardadas:'
          ];
          
          if (collectedData.hasGenres && collectedData.genres) {
            welcomeBack.push(`✅ Géneros: ${collectedData.genres.slice(0, 3).join(', ')}${collectedData.genres.length > 3 ? '...' : ''}`);
          }
          
          if (collectedData.hasCapacity && collectedData.capacity) {
            welcomeBack.push(`💾 Capacidad: ${collectedData.capacity}`);
          }
          
          welcomeBack.push('', '¿Quieres continuar con esta configuración o modificar algo?');
          await safeFlowSend(sess, flowDynamic, [welcomeBack.join('\n')], { blockType: 'intense' });
        } else {
          // First time user - show full intro
          const welcomeMsg = [
            `🎬 USB de Videos HD/4K ${social}`,
            '',
            '🎥 Contenido elegido 100% a tu gusto:',
            '✅ Videoclips organizados por género y artista',
            '✅ HD/4K según disponibilidad',
            '✅ Sin relleno ni duplicados',
            '',
            '💬 Dime 1-2 géneros que te gusten (ej: reggaeton, rock) o escribe "OK" para ver todas las opciones.'
          ].join('\n');
          await safeFlowSend(sess, flowDynamic, [welcomeMsg], { blockType: 'intense' });
        }

        sess.conversationData = sess.conversationData || {};
        (sess.conversationData as any).videosGenresPromptAt = Date.now();
        (sess.conversationData as any).videoPricesShown = (sess.conversationData as any).videoPricesShown || false;

        // Update session with proper stage tracking
        await updateUserSession(phone, 'Video flow started', 'videosUsb', 'intro_shown', false, {
          metadata: { 
            hasExistingPreferences: collectedData.hasGenres || collectedData.hasCapacity,
            completionPercentage: collectedData.completionPercentage
          }
        });

        if ((sess.messageCount || 0) === 0 && !collectedData.hasGenres) {
          const demos = await VideoDemoManager.getRandomVideosByGenres(
            ['reggaeton', 'salsa', 'rock'],
            1
          );
          if (demos.length > 0) {
            await VideoUtils.delay(1200);
            await safeFlowSend(
              sess,
              flowDynamic,
              [{ body: '🎥 Demo de calidad:', media: demos[0].filePath }],
              { blockType: 'light' }
            );
            await VideoUtils.delay(250);
          }
        }

        sess.conversationData = sess.conversationData || {};
        sess.conversationData.videos_welcomeAt = new Date().toISOString();
        await postHandler(phone, 'videosUsb', 'personalization');
        return;
      }
    } catch (e) {
      console.error('videosUsb entry error:', e);
      await flowDynamic([
        'Puedo mostrarte precios o personalizar por géneros. Escribe "precio" o 2 géneros.'
      ]);
      await postHandler(phone, 'videosUsb', 'personalization');
    }
  })
  // Recordatorio breve
  .addAction(async (ctx, { flowDynamic }) => {
    const phone = ctx.from;
    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow: async () => { } },
      'videosUsb',
      ['entry', 'personalization'],
      {
        lockOnStages: ['awaiting_capacity', 'awaiting_payment'],
        resumeMessages: {
          awaiting_capacity:
            'Elige capacidad para avanzar: 1️⃣ 8GB-260 • 2️⃣ 32GB-1.000 • 3️⃣ 64GB-2.000 • 4️⃣ 128GB-4.000.',
          awaiting_payment: 'Retomemos pago.'
        }
      }
    );
    if (!pre.proceed) return;

    const sess = (await getUserSession(phone)) as any;
    const lastWelcomeAt = sess.conversationData?.videos_welcomeAt
      ? new Date(sess.conversationData.videos_welcomeAt).getTime()
      : 0;
    if (Date.now() - lastWelcomeAt < 5 * 60 * 1000) return;

    if (canSendOnce(sess, 'videos__reminder_consolidated', 30)) {
      await safeFlowSend(
        sess,
        flowDynamic,
        ['¿Seguimos con tu USB de videos? Escribe 2 géneros o "precio" para ver opciones.'],
        { blockType: 'light' }
      );
      Por:
      await safeFlowSend(
        sess,
        flowDynamic,
        ['¿Seguimos con tu USB de videos? Escribe 2 géneros/artistas o "precio" para ver la tabla y elegir.'],
        { blockType: 'light' }
      );
      await postHandler(phone, 'videosUsb', 'personalization');
    }
  })
  // Captura
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const phone = ctx.from;
    const msg = ctx.body?.trim() || '';
    if (!phone || !msg) return;

    const pre = await preHandler(
      ctx,
      { flowDynamic, gotoFlow },
      'videosUsb',
      ['personalization', 'prices_shown', 'awaiting_capacity', 'awaiting_payment'],
      {
        lockOnStages: ['awaiting_capacity', 'awaiting_payment', 'checkout_started'],
        resumeMessages: {
          prices_shown: 'Retomemos: "precio" o 2 géneros/artistas. También "OK".',
          awaiting_capacity:
            'Elige capacidad para avanzar: 1️⃣ 8GB-260 • 2️⃣ 32GB-1.000 • 3️⃣ 64GB-2.000 • 4️⃣ 128GB-4.000.',
          awaiting_payment: 'Retomemos pago: ¿Nequi, Daviplata o tarjeta?'
        }
      }
    );
    if (!pre.proceed) return;

    const session: any = await getUserSession(phone);

    // Precio/capacidad/OK → mostrar tabla y avanzar
    if (/\b(precio|vale|cu[aá]nto|costo|ok|listo|perfecto|continuar|capacidad|capacidades)\b/i.test(msg)) {
      const pricingImagePath = path.resolve(__dirname, '../Portada/pricing_video_table.png');
      const canAccess = await fs.access(pricingImagePath).then(() => true).catch(() => false);
      if (canAccess) {
        await flowDynamic([{ body: '💾 Capacidades y precios (elige 1–4):', media: pricingImagePath }]);
        await VideoUtils.delay(250);
      } else {
        await flowDynamic([
          [
            '💾 Capacidades y precios (elige 1–4):',
            `1️⃣ 8GB → 260 videos (${toCOP(VIDEO_USB_PRICES['8GB'])})`,
            `2️⃣ 32GB → 1.000 videos (${toCOP(VIDEO_USB_PRICES['32GB'])})`,
            `3️⃣ 64GB → 2.000 videos (${toCOP(VIDEO_USB_PRICES['64GB'])})`,
            `4️⃣ 128GB → 4.000 videos (${toCOP(VIDEO_USB_PRICES['128GB'])})`
          ].join('\n')
        ]);
      }
      session.conversationData = session.conversationData || {};
      session.conversationData.lastVideoPricesShownAt = Date.now();
      await safeCrossSell(flowDynamic, session, phone, 'post_price');
      await postHandler(phone, 'videosUsb', 'awaiting_capacity');
      return gotoFlow(capacityVideo);
    }

    // Oferta irresistible si hay silencio prolongado y no se han mostrado precios recientes
    const lastShown = session.conversationData?.lastVideoPricesShownAt || 0;
    const minsSinceLast = (Date.now() - (session.lastInteraction?.getTime() || Date.now())) / 60000;
    if (minsSinceLast >= 45 && (!lastShown || (Date.now() - lastShown) > 45 * 60 * 1000)) {
      await safeFlowSend(session, flowDynamic, [buildIrresistibleOfferVideos()], { blockType: 'light' });
      session.conversationData = session.conversationData || {};
      session.conversationData.lastVideoPricesShownAt = Date.now();
      await postHandler(phone, 'videosUsb', 'prices_shown');
    }

    try {
      // Objeciones
      const handled = await handleVideoObjections(msg, flowDynamic);
      if (handled) {
        await postHandler(phone, 'videosUsb', 'prices_shown');
        return;
      }

      // Avance rápido
      if (VideoIntentDetector.isFastBuy(msg) || VideoIntentDetector.isContinue(msg) || /^ok$/i.test(msg)) {
        await updateUserSession(phone, msg, 'videosUsb', null, false, {
          messageType: 'videos',
          confidence: 0.95,
          metadata: { fastLane: true }
        });

        const pricingImagePath = path.resolve(__dirname, '../Portada/pricing_video_table.png');
        const canAccess = await fs.access(pricingImagePath).then(() => true).catch(() => false);
        if (canAccess) {
          await flowDynamic([{ body: '💾 Elige tu capacidad:', media: pricingImagePath }]);
          await VideoUtils.delay(250);
        } else {
          await flowDynamic([
            [
              '💾 Elige tu capacidad:',
              `1️⃣ 8GB → 260 videos (${toCOP(VIDEO_USB_PRICES['8GB'])})`,
              `2️⃣ 32GB → 1.000 videos (${toCOP(VIDEO_USB_PRICES['32GB'])})`,
              `3️⃣ 64GB → 2.000 videos (${toCOP(VIDEO_USB_PRICES['64GB'])})`,
              `4️⃣ 128GB → 4.000 videos (${toCOP(VIDEO_USB_PRICES['128GB'])})`
            ].join('\n')
          ]);
        }
        session.conversationData = session.conversationData || {};
        session.conversationData.lastVideoPricesShownAt = Date.now();
        await safeCrossSell(flowDynamic, session, phone, 'post_price');
        await postHandler(phone, 'videosUsb', 'awaiting_capacity');
        return gotoFlow(capacityVideo);
      }

      // Preferencias
      const genres = VideoIntentDetector.extractGenres(msg);
      const artists = VideoIntentDetector.extractArtists(msg, genres);
      const eras = VideoIntentDetector.extractEras(msg);
      const hasPrefs = genres.length || artists.length || eras.length;
      if (hasPrefs) {
        session.conversationData = session.conversationData || {};
        session.conversationData.selectedGenres = VideoUtils.dedupeArray([
          ...(session.conversationData.selectedGenres || []),
          ...genres
        ]);
        session.conversationData.mentionedArtists = VideoUtils.dedupeArray([
          ...(session.conversationData.mentionedArtists || []),
          ...artists
        ]);
        session.conversationData.preferredEras = VideoUtils.dedupeArray([
          ...(session.conversationData.preferredEras || []),
          ...eras
        ]);
        session.conversationData.customizationStage = 'advanced_personalizing';
        session.conversationData.personalizationCount =
          (session.conversationData.personalizationCount || 0) + 1;

        // CRITICAL: Persist to tracking system with full context
        await updateUserSession(phone, msg, 'videosUsb', 'preferences_collected', false, {
          messageType: 'videos',
          confidence: 0.85,
          metadata: {
            genres: session.conversationData.selectedGenres,
            artists: session.conversationData.mentionedArtists,
            eras: session.conversationData.preferredEras,
            personalizationComplete: true
          }
        });

        // Check what's already collected
        const collectedData = getUserCollectedData(session);

        const summary = [
          '🎬 Personalización:',
          `• Géneros: ${session.conversationData.selectedGenres.join(', ') || '-'}`,
          `• Artistas: ${session.conversationData.mentionedArtists.join(', ') || '-'}`,
          `• Épocas: ${session.conversationData.preferredEras.join(', ') || '-'}`
        ].join('\n');

        let confirmationMsg = `${summary}\n\n✅ Escribe "OK" para continuar.`;
        
        // If capacity already selected, mention it
        if (collectedData.hasCapacity && collectedData.capacity) {
          confirmationMsg = `${summary}\n💾 Capacidad ya seleccionada: ${collectedData.capacity}\n\n✅ Escribe "OK" para confirmar.`;
        }

        await safeFlowSend(session, flowDynamic, [confirmationMsg], {
          blockType: 'light'
        });

        if (canSendOnce(session, 'videos_pref_demos', 180)) {
          const moreDemos = await VideoDemoManager.getRandomVideosByGenres(
            session.conversationData.selectedGenres,
            DEMO_VIDEO_COUNT
          );
          if (moreDemos.length) {
            const demoPayloads = moreDemos.map(d => ({
              body: `🎥 ${d.name}`,
              media: d.filePath
            }));
            await safeFlowSend(
              session,
              flowDynamic,
              ['👁️ Ejemplos reales de calidad:', ...demoPayloads],
              { blockType: 'light' }
            );
            await VideoUtils.delay(250);
          }
        }
        await postHandler(phone, 'videosUsb', 'personalization');
        return;
      }

      // Atajo por capacidad escrita
      if (/\b(8|32|64|128)\s*gb\b/i.test(msg)) {
        const pricingImagePath = path.resolve(__dirname, '../Portada/pricing_video_table.png');
        const canAccess = await fs.access(pricingImagePath).then(() => true).catch(() => false);
        if (canAccess) await flowDynamic([{ body: '💾 Capacidades disponibles:', media: pricingImagePath }]);
        else await flowDynamic(['💾 Capacidades: 1) 8GB 260 • 2) 32GB 1.000 • 3) 64GB 2.000 • 4) 128GB 4.000']);
        session.conversationData = session.conversationData || {};
        session.conversationData.lastVideoPricesShownAt = Date.now();
        await postHandler(phone, 'videosUsb', 'awaiting_capacity');
        return gotoFlow(capacityVideo);
      }

      // Selección directa por número
      if (['1', '2', '3', '4'].includes(msg)) {
        session.conversationData = session.conversationData || {};
        session.conversationData.lastVideoPricesShownAt = Date.now();
        await flowDynamic([
          [
            '✅ Confirmemos tu capacidad (elige 1–4):',
            `1) 8GB (≈260) — ${toCOP(VIDEO_USB_PRICES['8GB'])}`,
            `2) 32GB (1.000) — ${toCOP(VIDEO_USB_PRICES['32GB'])}`,
            `3) 64GB (2.000) — ${toCOP(VIDEO_USB_PRICES['64GB'])} ⭐ Recomendado`,
            `4) 128GB (4.000) — ${toCOP(VIDEO_USB_PRICES['128GB'])}`,
            'Responde con el número para continuar.'
          ].join('\n')
        ]);
        await safeCrossSell(flowDynamic, session, phone, 'pre_payment');
        await postHandler(phone, 'videosUsb', 'awaiting_capacity');
        return gotoFlow(capacityVideo);
      }

      // Avance suave sin datos claros
      session.conversationData = session.conversationData || {};
      session.conversationData.personalizationCount =
        (session.conversationData.personalizationCount || 0) + 1;
      await updateUserSession(phone, msg, 'videosUsb', null, false, {
        messageType: 'videos',
        confidence: 0.85
      });

      if (session.conversationData.personalizationCount >= 2) {
        await flowDynamic([
          '⏳ Avancemos: elige capacidad (1–4) y te dejo la USB lista hoy.',
          '1️⃣ 8GB 260 • 2️⃣ 32GB 1.000 • 3️⃣ 64GB 2.000 • 4️⃣ 128GB 4.000'
        ]);
        await postHandler(phone, 'videosUsb', 'personalization');
      } else {
        await flowDynamic([
          '🙌 Dime 2 géneros/2 artistas (ej: "rock y salsa", "Karol G y Bad Bunny").',
          'O escribe "OK" y te muestro la tabla para elegir.'
        ]);
        await postHandler(phone, 'videosUsb', 'personalization');
      }
    } catch (e) {
      console.error('videosUsb error:', e);
      await flowDynamic([
        'Puedo mostrarte precios y capacidades o personalizar por géneros/artistas.',
        'Elige: 1️⃣ 8GB 260 • 2️⃣ 32GB 1.000 • 3️⃣ 64GB 2.000 • 4️⃣ 128GB 4.000, o dime 2 géneros/2 artistas.'
      ]);
      await postHandler(phone, 'videosUsb', 'prices_shown');
    }
  });

// ====== Puente a MÚSICA ======
const crossSellGuard = addKeyword([
  'ver musica',
  'quiero usb de musica',
  'combo',
  'quiero combo'
]).addAction(async (ctx, { gotoFlow }) => gotoFlow(musicUsb));

export default videoUsb;
export { crossSellGuard };
