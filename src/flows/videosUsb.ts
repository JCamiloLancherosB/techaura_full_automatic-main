// import { addKeyword } from '@builderbot/bot';
// import capacityVideo from "./capacityVideo";
// import musicUsb from './musicUsb';
// import { updateUserSession, getUserSession, canSendOnce } from './userTrackingSystem';
// import { saveUserCustomizationState, UserVideoState } from '../userCustomizationDb';
// import { crossSellSystem } from '../services/crossSellSystem';
// import path from 'path';
// import { promises as fs } from 'fs';
// import { preHandler, postHandler } from './middlewareFlowGuard';

// // ===== Anti-exceso y deduplicación por contenido =====
// import crypto from 'crypto';
// import { businessDB } from '../mysql-database'; // si ya lo usas en otra parte, omitir duplicado

// function sha256(text: string): string {
//   return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
// }

// // Horario permitido 9–21
// function isHourAllowed(date = new Date()): boolean {
//   const h = date.getHours();
//   return h >= 9 && h <= 21;
// }

// // Gates por usuario: mínimo 12h entre bloques del flujo de videos, y 2 por semana
// function canSendUserBlock(session: any): { ok: boolean; reason?: string } {
//   const now = new Date();
//   if (!isHourAllowed(now)) return { ok: false, reason: 'outside_hours' };

//   session.conversationData = session.conversationData || {};
//   const lastAt = session.conversationData.videos_lastBlockAt ? new Date(session.conversationData.videos_lastBlockAt) : null;
//   if (lastAt && (now.getTime() - lastAt.getTime()) < 12 * 3600000) {
//     return { ok: false, reason: 'under_12h' };
//   }
//   const hist: string[] = (session.conversationData.videos_blocksHistory || []) as string[];
//   const weekAgo = now.getTime() - 7 * 24 * 3600000;
//   const recent = (hist || []).filter(ts => new Date(ts).getTime() >= weekAgo);
//   if (recent.length >= 2) return { ok: false, reason: 'weekly_cap' };

//   return { ok: true };
// }

// function recordUserBlock(session: any) {
//   const nowIso = new Date().toISOString();
//   session.conversationData = session.conversationData || {};
//   const hist: string[] = (session.conversationData.videos_blocksHistory || []) as string[];
//   session.conversationData.videos_lastBlockAt = nowIso;
//   session.conversationData.videos_blocksHistory = [...(hist || []), nowIso].slice(-10);
// }

// // DEDUPE por cuerpo: no enviar nunca el mismo body más de una vez por usuario
// function hasSentBody(session: any, body: string): boolean {
//   const h = sha256(body);
//   session.conversationData = session.conversationData || {};
//   const sent = (session.conversationData.videos_sentBodies || []) as string[];
//   return sent.includes(h);
// }
// function markBodySent(session: any, body: string) {
//   const h = sha256(body);
//   session.conversationData = session.conversationData || {};
//   const sent = (session.conversationData.videos_sentBodies || []) as string[];
//   session.conversationData.videos_sentBodies = Array.from(new Set([...sent, h])).slice(-100);
// }

// async function safeFlowSend(session: any, flowDynamic: any, payloads: Array<string | { body: string; media?: string }>) {
//   const toSend: Array<{ body: string; media?: string }> = [];
//   for (const p of payloads) {
//     const body = typeof p === 'string' ? p : (p.body || '');
//     if (!body) continue;
//     if (hasSentBody(session, body)) {
//       // evita repetir exactamente el mismo texto
//       continue;
//     }
//     toSend.push(typeof p === 'string' ? { body: p } : p);
//   }
//   if (!toSend.length) return;

//   // gate por usuario para bloques “intensos” (intro + precios + demos)
//   const gate = canSendUserBlock(session);
//   if (!gate.ok) {
//     console.log(`⏸️ videosUsb gate: ${gate.reason}`);
//     return;
//   }

//   await flowDynamic(toSend);
//   // marca cada body como enviado
//   toSend.forEach(p => markBodySent(session, p.body));
//   recordUserBlock(session);
// }

// function persuasiveVideoOffers(session: any): string[] {
//   const name = session?.name ? session.name.split(' ')[0] : '';
//   const greet = name ? `¡Hola ${name}!` : '¡Hola!';

//   // Preferencia de capacidad previa si existe
//   const preferCap = (session as any)?.capacity || (session?.preferences?.capacity?.[0]) || null;
//   const cap = ['8GB','32GB','64GB','128GB'].includes(preferCap) ? preferCap : '32GB';
//   const price = VIDEO_USB_PRICES[cap as keyof typeof VIDEO_USB_PRICES];

//   // Persuasión dinámica
//   const social = Math.random() > 0.5 ? '🌟 +900 pedidos este mes' : '⭐ 4.9/5 reseñas verificadas';
//   const scarcity = `⏰ Últimas ${SCARCITY_UNITS} unidades hoy`;
//   const authority = '🏆 Calidad HD/4K organizada por artista y género';
//   const reciprocity = '🎁 Envío gratis + garantía de por vida';

//   // Opciones recomendadas breves
//   const optLine = [
//     `USB ${cap} $${price.toLocaleString('es-CO')}`,
//     `64GB $${VIDEO_USB_PRICES['64GB'].toLocaleString('es-CO')}`
//   ].join(' | ');

//   // Copy corto y accionable
//   return [
//     `${greet} ${social}. ${scarcity}.`,
//     `${authority}. ${reciprocity}.`,
//     `Mejores opciones: ${optLine}.`,
//     `👉 Responde 2️⃣ (32GB), 3️⃣ (64GB) o 4️⃣ (128GB), o dime 2 géneros/artistas para personalizar.`
//   ];
// }

// export async function offerCrossSellIfAllowed(
//   phone: string,
//   stage: 'afterCapacitySelected'|'beforePayment'|'postPurchase'|'highIntentNoConfirm',
//   flowDynamic: any,
//   session: any
// ) {
//   const lastTs = session?.conversationData?.lastCrossSellAt ? new Date(session.conversationData.lastCrossSellAt).getTime() : 0;
//   const canOffer = !lastTs || (Date.now() - lastTs) > 24*60*60*1000;
//   if (!canOffer) return;

//   const alreadyIds = session?.orderData?.items?.map((i:any)=>i.productId) || [];
//   const recs = crossSellSystem.generateRecommendations(session, { stage, maxItems:3, alreadyAddedProductIds: alreadyIds });
//   const msg = crossSellSystem.generateCrossSellMessage(recs);
//   if (msg) {
//     if (!hasSentBody(session, msg)) {
//       await flowDynamic([msg]);
//       markBodySent(session, msg);
//       session.conversationData = session.conversationData || {};
//       session.conversationData.lastCrossSellAt = new Date().toISOString();
//       await updateUserSession(phone, 'cross-sell-offered', 'videosUsb', null, false, {
//         messageType:'crossSell',
//         metadata:{ stage, offeredIds: recs.map((r:any)=>r.product.id) }
//       });
//     }
//   }
// }


// // ====== GUARD DE CROSS-SELL (minimalista) ======
// async function safeCrossSell(flowDynamic: any, session: any, phone: string, context: 'post_price' | 'pre_payment') {
//   try {
//     const last = session?.conversationData?.lastCrossSellAt ? new Date(session.conversationData.lastCrossSellAt).getTime() : 0;
//     if (Date.now() - last < 6 * 60 * 60 * 1000) return;

//     const msg = context === 'post_price'
//       ? 'Tip: al final podemos activar combo “Música + Videos” con 15% OFF adicional.'
//       : 'Opcional: al finalizar puedes sumar “Música + Videos” en combo (15% OFF). Si te interesa, escribe "VIDEOS" cuando confirmemos.';

//     if (hasSentBody(session, msg)) return;
//     await flowDynamic([msg]);
//     markBodySent(session, msg);

//     session.conversationData = session.conversationData || {};
//     session.conversationData.lastCrossSellAt = new Date().toISOString();
//     await updateUserSession(phone, 'cross-sell-guard', 'videosUsb', null, false, { metadata: { cx_context: context } });
//   } catch { /* silencioso */ }
// }

// // ====== CONSTANTES DE PRECIOS (reales) ======
// const VIDEO_USB_PRICES: Record<string, number> = {
//   '8GB': 59900,
//   '32GB': 89900,
//   '64GB': 129900,
//   '128GB': 169900
// };

// const DEMO_VIDEO_COUNT = 2;
// const PRICE_ANCHOR = VIDEO_USB_PRICES['8GB'];
// const SCARCITY_UNITS = 3;

// // ====== DATOS DE VIDEOS ======
// export const videoData = {
//     topHits: {
//   "bachata": [
//     {
//       "name": "Romeo Santos - Propuesta Indecente",
//       "file": "..\\demos_videos_recortados\\Bachata\\Romeo Santos - Propuesta Indecente_demo.mp4"
//     },
//     {
//       "name": "Aventura - Obsesión",
//       "file": "..\\demos_videos_recortados\\Bachata\\Aventura - Obsesión_demo.mp4"
//     },
//     {
//       "name": "Juan Luis Guerra - Burbujas de Amor",
//       "file": "..\\demos_videos_recortados\\Bachata\\Juan Luis Guerra - Burbujas de Amor_demo.mp4"
//     }
//   ],
//   "reggaeton": [
//     {
//       "name": "Daddy Yankee - Gasolina",
//       "file": "..\\demos_videos_recortados\\Reggaeton\\Daddy Yankee - Gasolina_demo.mp4"
//     },
//     {
//       "name": "FloyyMenor - Gata Only",
//       "file": "..\\demos_videos_recortados\\Reggaeton\\FloyyMenor - Gata Only_demo.mp4"
//     },
//     {
//       "name": "Bad Bunny - Tití Me Preguntó",
//       "file": "..\\demos_videos_recortados\\Reggaeton\\Bad Bunny - Tití Me Preguntó_demo.mp4"
//     }
//   ],
//   "salsa": [
//     {
//       "name": "Marc Anthony - Vivir Mi Vida",
//       "file": "..\\demos_videos_recortados\\Salsa\\Marc Anthony - Vivir Mi Vida_demo.mp4"
//     },
//     {
//       "name": "Joe Arroyo - La Rebelión",
//       "file": "..\\demos_videos_recortados\\Salsa\\Joe Arroyo - La Rebelión_demo.mp4"
//     },
//     {
//       "name": "Willie Colón - Pedro Navaja",
//       "file": "..\\demos_videos_recortados\\Salsa\\Willie Colón - Pedro Navaja_demo.mp4"
//     }
//   ],
//   "vallenato": [
//     {
//       "name": "Carlos Vives - La Tierra del Olvido",
//       "file": "..\\demos_videos_recortados\\Vallenato\\Carlos Vives - La Tierra del Olvido_demo.mp4"
//     },
//     {
//       "name": "Silvestre Dangond - Materialista",
//       "file": "..\\demos_videos_recortados\\Vallenato\\Silvestre Dangond - Materialista_demo.mp4"
//     },
//     {
//       "name": "Los Diablitos - A Besitos",
//       "file": "..\\demos_videos_recortados\\Vallenato\\Los Diablitos - A Besitos_demo.mp4"
//     }
//   ],
//   "rock": [
//     {
//       "name": "Queen - Bohemian Rhapsody",
//       "file": "..\\demos_videos_recortados\\Rock\\Queen - Bohemian Rhapsody_demo.mp4"
//     },
//     {
//       "name": "Guns N' Roses - Sweet Child O' Mine",
//       "file": "..\\demos_videos_recortados\\Rock\\Guns N' Roses - Sweet Child O' Mine_demo.mp4"
//     },
//     {
//       "name": "Led Zeppelin - Stairway to Heaven",
//       "file": "..\\demos_videos_recortados\\Rock\\Led Zeppelin - Stairway to Heaven_demo.mp4"
//     }
//   ],
//   "merengue": [
//     {
//       "name": "Juan Luis Guerra - El Niágara en Bicicleta",
//       "file": "..\\demos_videos_recortados\\Merengue\\Juan Luis Guerra - El Niágara en Bicicleta_demo.mp4"
//     },
//     {
//       "name": "Elvis Crespo - Suavemente",
//       "file": "..\\demos_videos_recortados\\Merengue\\Elvis Crespo - Suavemente_demo.mp4"
//     },
//     {
//       "name": "Wilfrido Vargas - El Jardinero",
//       "file": "..\\demos_videos_recortados\\Merengue\\Wilfrido Vargas - El Jardinero_demo.mp4"
//     }
//   ],
//   "baladas": [
//     {
//       "name": "Ricardo Arjona - Historia de Taxi",
//       "file": "..\\demos_videos_recortados\\Baladas\\Ricardo Arjona - Historia de Taxi_demo.mp4"
//     },
//     {
//       "name": "Maná - Rayando el Sol",
//       "file": "..\\demos_videos_recortados\\Baladas\\Maná - Rayando el Sol_demo.mp4"
//     },
//     {
//       "name": "Jesse & Joy - Espacio Sideral",
//       "file": "..\\demos_videos_recortados\\Baladas\\Jesse & Joy - Espacio Sideral_demo.mp4"
//     }
//   ],
//   "electronica": [
//     {
//       "name": "David Guetta ft. Sia - Titanium",
//       "file": "..\\demos_videos_recortados\\Electronica\\David Guetta ft. Sia - Titanium_demo.mp4"
//     },
//     {
//       "name": "Avicii - Levels",
//       "file": "..\\demos_videos_recortados\\Electronica\\Avicii - Levels_demo.mp4"
//     },
//     {
//       "name": "Martin Garrix - Animals",
//       "file": "..\\demos_videos_recortados\\Electronica\\Martin Garrix - Animals_demo.mp4"
//     }
//   ],
//   "cumbia": [
//     {
//       "name": "Los Ángeles Azules - Nunca Es Suficiente",
//       "file": "..\\demos_videos_recortados\\Cumbia\\Los Ángeles Azules - Nunca Es Suficiente_demo.mp4"
//     },
//     {
//       "name": "Celso Piña - Cumbia Sobre el Río",
//       "file": "..\\demos_videos_recortados\\Cumbia\\Celso Piña - Cumbia Sobre el Río_demo.mp4"
//     },
//     {
//       "name": "La Sonora Dinamita - Que Bello",
//       "file": "..\\demos_videos_recortados\\Cumbia\\La Sonora Dinamita - Que Bello_demo.mp4"
//     }
//   ]
// },

//     artistsByGenre: {
//     "reggaeton": [
//         "bad bunny", "daddy yankee", "j balvin", "ozuna", "maluma", "karol g", "anuel aa",
//         "nicky jam", "wisin y yandel", "don omar", "farruko", "myke towers", "sech", 
//         "rauw alejandro", "feid", "ryan castro", "blessd", "floyymenor"
//     ],
//     "bachata": [
//         "romeo santos", "aventura", "prince royce", "frank reyes", "anthony santos",
//         "xtreme", "toby love", "elvis martinez", "zacarias ferreira", "joe veras"
//     ],
//     "salsa": [
//         "marc anthony", "willie colon", "hector lavoe", "celia cruz", "joe arroyo", 
//         "gilberto santa rosa", "victor manuelle", "la india", "tito nieves", "eddie santiago"
//     ],
//     "rock": [
//         "queen", "guns n roses", "metallica", "ac/dc", "led zeppelin", "pink floyd",
//         "nirvana", "bon jovi", "aerosmith", "kiss", "the beatles", "rolling stones"
//     ],
//     "vallenato": [
//         "carlos vives", "diomedes diaz", "jorge celedon", "silvestre dangond", "martin elias",
//         "los diablitos", "binomio de oro", "los inquietos", "miguel morales"
//     ]
// },

// // Playlists de video con imágenes
// playlistImages: {
//     crossover: path.join(__dirname, '../Portada/video_crossover.png'),
//     latino: path.join(__dirname, '../Portada/video_latino.png'),
//     internacional: path.join(__dirname, '../Portada/video_internacional.png'),
//     clasicos: path.join(__dirname, '../Portada/video_clasicos.png'),
//     personalizada: path.join(__dirname, '../Portada/video_personalizada.png')
// },

// playlists: [
//     {
//         name: "🎬🔥 Video Crossover Total (Reggaeton, Salsa, Vallenato, Rock, Pop, Bachata, Merengue, Baladas, Electrónica y más...)",
//         genres: ["reggaeton", "salsa", "vallenato", "rock", "pop", "bachata", "merengue", "baladas", "electronica", "cumbia"],
//         img: 'crossover',
//         description: "La colección más completa de videos musicales en HD y 4K"
//     },
//     {
//         name: "🇨🇴 Videos Colombia Pura Vida",
//         genres: ["vallenato", "cumbia", "champeta", "merengue", "salsa"],
//         img: 'latino',
//         description: "Lo mejor del folclor y música colombiana en video"
//     },
//     {
//         name: "🌟 Hits Internacionales",
//         genres: ["rock", "pop", "electronica", "hiphop", "r&b"],
//         img: 'internacional',
//         description: "Los videos más virales del mundo entero"
//     },
//     {
//         name: "💎 Clásicos Inmortales",
//         genres: ["rock", "salsa", "baladas", "boleros", "rancheras"],
//         img: 'clasicos',
//         description: "Videos legendarios que nunca pasan de moda"
//     },
//     {
//         name: "🎯 Personalizada Premium",
//         genres: [],
//         img: 'personalizada',
//         description: "Crea tu colección única de videos musicales"
//     }
// ],
// conversionTips: [
//         "🎬 Videos en HD y 4K con calidad cinematográfica",
//         "📱 Compatible con TV, celular, tablet y computador",
//         "🎁 25% de descuento en tu segunda USB de videos",
//         "🚚 Envío gratis + garantía de por vida",
//         "🔥 Más de 10,000 videos musicales disponibles"
//     ]
// };

// // ====== UTILIDADES ======
// class VideoUtils {
//   static normalizeText(text: string): string {
//     return (text || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
//   }
//   static dedupeArray<T>(arr: T[]): T[] {
//     return [...new Set(arr)];
//   }
//   static async getValidFile(filePath: string) {
//     try {
//       const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
//       await fs.access(absolutePath);
//       return { valid: true, path: absolutePath };
//     } catch {
//       return { valid: false };
//     }
//   }
//   static async delay(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
//   }
// }

// // ====== ESTADO ======
// class VideoStateManager {
//   private static userStates = new Map<string, UserVideoState>();
//   static getOrCreate(phone: string): UserVideoState {
//     if (!this.userStates.has(phone)) {
//       this.userStates.set(phone, {
//         phoneNumber: phone,
//         selectedGenres: [],
//         mentionedArtists: [],
//         preferredEras: [],
//         videoQuality: 'HD',
//         customizationStage: 'initial',
//         lastPersonalizationTime: new Date(),
//         personalizationCount: 0,
//         showedPreview: false,
//         usbName: undefined
//       });
//     }
//     return this.userStates.get(phone)!;
//   }
//   static async save(userState: UserVideoState) {
//     this.userStates.set(userState.phoneNumber, userState);
//     await saveUserCustomizationState(userState);
//   }
// }

// // ====== DEMOS ======
// class VideoDemoManager {
//   static async getRandomVideosByGenres(genres: string[], count = DEMO_VIDEO_COUNT) {
//     const results: { name: string; filePath: string; genre: string }[] = [];
//     const used = new Set<string>();
//     const pool = genres.length ? genres : Object.keys(videoData.topHits);
//     // Randomiza el pool para variedad
//     const shuffled = [...pool].sort(() => Math.random() - 0.5);
//     for (const genre of shuffled) {
//       if (results.length >= count) break;
//       const list = (videoData as any).topHits[genre] || [];
//       if (!list.length) continue;
//       const candidate = list[Math.floor(Math.random() * list.length)];
//       if (used.has(candidate.name)) continue;
//       const file = await VideoUtils.getValidFile(candidate.file);
//       if (file.valid) {
//         used.add(candidate.name);
//         results.push({ name: candidate.name, filePath: (file as any).path, genre });
//       }
//     }
//     return results.slice(0, count);
//   }
// }

// // ====== DETECCIÓN INTENCIÓN ======
// class VideoIntentDetector {
//   static isFastBuy(input: string) {
//     const txt = VideoUtils.normalizeText(input);
//     return /(comprar|quiero|listo|confirmo|confirmar|hacer pedido|ordenar|pagar|contraentrega)/i.test(txt);
//   }
//   static isContinue(input: string) {
//     const txt = VideoUtils.normalizeText(input);
//     return /^(ok|okay|si|sí|continuar|siguiente|listo|precio|capacidad|seguir)$/i.test(txt);
//   }
//   static extractGenres(message: string): string[] {
//     const txt = VideoUtils.normalizeText(message);
//     return Object.keys((videoData as any).topHits).filter(g => txt.includes(g));
//   }
//   static extractArtists(message: string, genres: string[] = []) {
//     const txt = VideoUtils.normalizeText(message);
//     const searchGenres = genres.length ? genres : Object.keys((videoData as any).artistsByGenre);
//     const found: string[] = [];
//     searchGenres.forEach(g => {
//       ((videoData as any).artistsByGenre[g] || []).forEach((a: string) => {
//         if (txt.includes(VideoUtils.normalizeText(a))) found.push(a);
//       });
//     });
//     return VideoUtils.dedupeArray(found);
//   }
//   static extractEras(message: string) {
//     const eras = ["1970s","1980s","1990s","2000s","2010s","2020s"];
//     const txt = VideoUtils.normalizeText(message);
//     return eras.filter(e => txt.includes(e.toLowerCase()));
//   }
// }

// // ====== HANDLER DE OBJECIONES ======
// async function handleVideoObjections(userInput: string, flowDynamic: any) {
//   const t = VideoUtils.normalizeText(userInput);

//   if (/precio|cuanto|vale|costo|coste|caro/.test(t)) {
//     await flowDynamic([[
//       '💰 Precios HOY (solo videos):',
//       `• 8GB (≈260): $${VIDEO_USB_PRICES['8GB'].toLocaleString('es-CO')} — ideal prueba`,
//       `• 32GB (≈1.000): $${VIDEO_USB_PRICES['32GB'].toLocaleString('es-CO')} — más elegido`,
//       `• 64GB (≈2.000): $${VIDEO_USB_PRICES['64GB'].toLocaleString('es-CO')} — recomendado`,
//       `• 128GB (≈4.000): $${VIDEO_USB_PRICES['128GB'].toLocaleString('es-CO')} — coleccionista`,
//       '',
//       'Incluye: curaduría sin relleno, carpetas limpias por artista/género, envío GRATIS y garantía de por vida.',
//       'Responde 2️⃣, 3️⃣ o 4️⃣ para continuar.'
//     ].join('\n')]);
//     return true;
//   }

//   if (/demora|envio|entrega|tarda|cuanto demora|tiempo|cuando/.test(t)) {
//     await flowDynamic([[
//       '⏱️ Tiempos:',
//       '• Producción 3–8h según tamaño',
//       '• Envío el mismo día',
//       '• Entrega 1–3 días hábiles en Colombia',
//       '',
//       '¿Avanzamos con capacidad? 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.'
//     ].join('\n')]);
//     return true;
//   }

//   if (/garantia|seguro|confio|real|confiable|estafa|fraude|soporte/.test(t)) {
//     await flowDynamic([[
//       '✅ Compra segura:',
//       '• Reseñas 4.9/5 verificadas',
//       '• Garantía de por vida en archivos',
//       '• Reenvío de respaldo si lo necesitas',
//       '',
//       '¿Vemos la opción recomendada? 3️⃣ 64GB (≈2,000 videos).'
//     ].join('\n')]);
//     return true;
//   }

//   if (/carpeta|organizacion|orden|nombres|tags|metadata/.test(t)) {
//     await flowDynamic([[
//       '🗂️ Entrega organizada:',
//       '• Carpetas por artista y género',
//       '• Nombres limpios y consistentes',
//       '• Configurada para TV/carro/parlantes',
//       '',
//       'Dime 2 géneros/artistas o elige 2️⃣/3️⃣/4️⃣.'
//     ].join('\n')]);
//     return true;
//   }

//   return false;
// }

// // ====== FLUJO PRINCIPAL ======
// const videoUsb = addKeyword([
//   'me interesa la usb de videos', 'me interesa la usb con videos',
//   'hola, me interesa la usb con vídeos.', 'Hola, me interesa la USB con vídeos.'
// ])
// // .addAction(async (ctx, { flowDynamic }) => {
// //   const phone = ctx.from;

// //   // preHandler: permitimos entry/personalization y reanudación según locks
// //   const pre = await preHandler(
// //     ctx,
// //     { flowDynamic, gotoFlow: async () => {} },
// //     'videosUsb',
// //     ['entry', 'personalization'],
// //     {
// //       lockOnStages: ['awaiting_capacity','awaiting_payment','checkout_started'],
// //       resumeMessages: {
// //         awaiting_capacity: 'Retomemos capacidad: 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.',
// //         awaiting_payment: 'Retomemos pago: ¿Nequi, Daviplata o tarjeta?',
// //       }
// //     }
// //   );
// //   if (!pre.proceed) return;

// //   if (!phone || !ctx.body) return;
// //   try {
// //     await updateUserSession(phone, ctx.body, 'videosUsb', null, false, {
// //       messageType: 'videos',
// //       confidence: 0.9,
// //       isPredetermined: false,
// //       metadata: { entryPoint: 'videoUsb_flow' }
// //     });

// //     const sess = await getUserSession(phone) as any;

// //     const scarcity = `⏰ Solo ${SCARCITY_UNITS} unidades hoy`;
// //     const social = Math.random() > 0.5 ? '🌟 +900 clientes felices este mes' : '⭐ 4.9/5 reseñas verificadas';
// //     const anchorLine = `💎 USB solo vídeos HD desde $${PRICE_ANCHOR.toLocaleString('es-CO')}`;

// //     const top = (videoData as any).playlists[0];
// //     const img = top.img ? await VideoUtils.getValidFile((videoData as any).playlistImages[top.img]) : { valid: false };

// //     // Intro única cada 3h
// //     if (canSendOnce(sess, 'welcome_videos_block', 180)) {
// //       await flowDynamic([
// //         `🎬 USB de VIDEOS en HD/4K\n${social}\n${scarcity}\n${anchorLine}\n\n📦 Envío gratis + garantía.\nDime 1–2 géneros o un artista, o escribe "OK" para continuar.`
// //       ]);
// //     }

// //     // Playlist Top (opcional con imagen)
// //     if ((img as any).valid) {
// //       await flowDynamic([{ body: `🎬 Playlist Top: ${top.name}\n${top.description}`, media: (img as any).path }]);
// //     } else {
// //       await flowDynamic([`🎬 Playlist Top: ${top.name}\n${top.description}`]);
// //     }

// //     await VideoUtils.delay(400);

// //     // DEMOS cortas (máx 2)
// //     const demoGenres = ['reggaeton','salsa','bachata','rock'];
// //     const demos = await VideoDemoManager.getRandomVideosByGenres(demoGenres, DEMO_VIDEO_COUNT);
// //     if (demos.length) {
// //       await flowDynamic(['👁️ Ejemplos reales de calidad:']);
// //       for (const d of demos) {
// //         await flowDynamic([{ body: `🎥 ${d.name}`, media: d.filePath }]);
// //       }
// //     }

// //     // Precios/capacidades
// //     await flowDynamic([
// //       [
// //         '💾 Elige cantidad aproximada de videos:',
// //         `1. 8GB - 260 videos - $${VIDEO_USB_PRICES['8GB'].toLocaleString('es-CO')}`,
// //         `2. 32GB - 1.000 videos - $${VIDEO_USB_PRICES['32GB'].toLocaleString('es-CO')}`,
// //         `3. 64GB - 2.000 videos - $${VIDEO_USB_PRICES['64GB'].toLocaleString('es-CO')}`,
// //         `4. 128GB - 4.000 videos - $${VIDEO_USB_PRICES['128GB'].toLocaleString('es-CO')}`,
// //         '',
// //         'Escribe el número para continuar o dime tus géneros/artistas.'
// //       ].join('\n')
// //     ]);

// //     // Cross-sell minimalista (post precios)
// //     await safeCrossSell(flowDynamic, sess, phone, 'post_price');

// //     const st = VideoStateManager.getOrCreate(phone);
// //     st.customizationStage = 'initial';
// //     st.lastPersonalizationTime = new Date();
// //     st.personalizationCount = 0;
// //     await VideoStateManager.save(st);

// //   } catch (e) {
// //     await flowDynamic('⚠️ Ocurrió un error. Intenta nuevamente.');
// //   }

// //   // postHandler: marcamos que ya mostramos precios/intro
// //   await postHandler(phone, 'videosUsb', 'prices_shown');
// // })
// .addAction(async (ctx, { flowDynamic }) => {
//   const phone = ctx.from;
//   const pre = await preHandler(
//     ctx,
//     { flowDynamic, gotoFlow: async () => {} },
//     'videosUsb',
//     ['entry','personalization'],
//     {
//       lockOnStages: ['awaiting_capacity','awaiting_payment','checkout_started'],
//       resumeMessages: {
//         awaiting_capacity: 'Retomemos capacidad: 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB. Hoy envío GRATIS.',
//         awaiting_payment: 'Retomemos pago: ¿Nequi, Daviplata o tarjeta? Mantengo tu precio.'
//       },
//       allowEntryResume: false
//     }
//   );
//   if (!pre.proceed) return;

//   const sess = await getUserSession(phone) as any;
//   const handoff = sess?.metadata?.handoffFrom === 'entryFlow' || sess?.handoffFrom === 'entryFlow';

//   const payloads: Array<string | { body: string; media?: string }> = [];

//   // Bienvenida persuasiva (si no hay handoff y no se envió en 3h)
//   if (!handoff && canSendOnce(sess, 'videos__welcome_block', 180)) {
//     const persuasive = persuasiveVideoOffers(sess);
//     payloads.push(
//       `🎬 USB de VIDEOS en HD/4K`,
//       ...persuasive
//     );
//   }

//   // ——— BEST OPTIONS + URGENCIA CORTA (30 min) ———
// if (canSendOnce(sess, 'videos__best_options_hint', 30)) {
//   const preferCap = (sess as any)?.capacity || (sess?.preferences?.capacity?.[0]) || null;
//   const stagePick = preferCap || '32GB';
//   const altPick = stagePick === '32GB' ? '64GB' : '32GB';
//   const price = VIDEO_USB_PRICES[stagePick] || VIDEO_USB_PRICES['32GB'];
//   const altPrice = VIDEO_USB_PRICES[altPick];
//   payloads.push(
//     `✅ Mejores opciones: ${stagePick} $${price.toLocaleString('es-CO')} | ${altPick} $${altPrice.toLocaleString('es-CO')}.\nEscribe 2️⃣/3️⃣/4️⃣ o dime tus géneros/artistas.`
//   );
// }

//   // Playlist Top (60 min)
//   if (canSendOnce(sess, 'videos__playlist_top', 60)) {
//     const top = (videoData as any).playlists[0];
//     const img = top.img ? await VideoUtils.getValidFile((videoData as any).playlistImages[top.img]) : { valid: false };
//     if ((img as any).valid) payloads.push({ body: `🎬 Playlist Top: ${top.name}\n${top.description}\n\n¿Te muestro 2 demos y seguimos a capacidad?` , media: (img as any).path });
//     else payloads.push(`🎬 Playlist Top: ${top.name}\n${top.description}`);
//   }

//   // Demos (60 min)
//   if (canSendOnce(sess, 'videos__demos_block', 60)) {
//     const demoGenres = ['reggaeton','salsa','bachata','rock'];
//     const demos = await VideoDemoManager.getRandomVideosByGenres(demoGenres, DEMO_VIDEO_COUNT);
//     if (demos.length) {
//       payloads.push('👁️ Ejemplos reales de calidad:');
//       for (const d of demos) {
//         payloads.push({ body: `🎥 ${d.name}`, media: d.filePath });
//       }
//       payloads.push('✅ Si te gusta la calidad, responde 2️⃣/3️⃣/4️⃣ para elegir capacidad.');
//     }
//   }

//   // ——— BLOQUE VALOR PERSUASIVO (30 min) ———
// if (canSendOnce(sess, 'videos__value_block', 30)) {
//   payloads.push([
//     '🎯 ¿Qué recibes?',
//     '• Videos garantizados en HD/4K sin relleno',
//     '• Carpetas limpias por artista/género',
//     '• Compatibilidad TV, carro y parlantes',
//     '• Envío gratis + garantía de 3 meses',
//     '',
//     '¿Quieres ver precios o prefieres decirme 2 géneros/artistas?'
//   ].join('\n'));
// }

//   // Precios (60 min)
//   if (canSendOnce(sess, 'videos__prices_shown', 60)) {
//   payloads.push([
//     '💾 Elige tu capacidad (solo videos, precios HOY):',
//     `1. 8GB • ≈260 videos • $${VIDEO_USB_PRICES['8GB'].toLocaleString('es-CO')} (ideal prueba)`,
//     `2. 32GB • ≈1,000 • $${VIDEO_USB_PRICES['32GB'].toLocaleString('es-CO')} (más elegido)`,
//     `3. 64GB • ≈2,000 • $${VIDEO_USB_PRICES['64GB'].toLocaleString('es-CO')} (recomendado)`,
//     `4. 128GB • ≈4,000 • $${VIDEO_USB_PRICES['128GB'].toLocaleString('es-CO')} (coleccionista)`,
//     '',
//     '⏰ Hoy: envío GRATIS + garantía de por vida.',
//     'Responde 2️⃣, 3️⃣ o 4️⃣ para continuar, o dime 2 géneros/artistas.'
//   ].join('\n'));
// }

//   // Enviar de forma segura con dedupe + gate
//   if (payloads.length) {
//     await safeFlowSend(sess, flowDynamic, payloads);
//   }

//   // Post: marca etapa
//   await postHandler(phone, 'videosUsb', 'prices_shown');
// })

// .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
//   const phone = ctx.from;
//   const msg = ctx.body?.trim() || '';
//   if (!phone || !msg) return;

//   // preHandler: etapas válidas durante captura
//   const pre = await preHandler(
//     ctx,
//     { flowDynamic, gotoFlow },
//     'videosUsb',
//     ['personalization','prices_shown','awaiting_capacity','awaiting_payment'],
//     {
//       lockOnStages: ['awaiting_capacity','awaiting_payment','checkout_started'],
//       resumeMessages: {
//         prices_shown: 'Retomemos: ¿quieres ver precios o dar 2 géneros/artistas? Puedes escribir "OK".',
//         awaiting_capacity: 'Retomemos capacidad: 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB. Hoy envío GRATIS.',
//         awaiting_payment: 'Retomemos pago: ¿Nequi, Daviplata o tarjeta? Mantengo tu precio.'
//       }
//     }
//   );
//   if (!pre.proceed) return;

//   const st = VideoStateManager.getOrCreate(phone);
//   const session: any = await getUserSession(phone);

//   try {
//     // Manejo de objeciones (no cambia etapa)
//     const handled = await handleVideoObjections(msg, flowDynamic);
//     if (handled) {
//       // mantenemos prices_shown
//       await postHandler(phone, 'videosUsb', 'prices_shown');
//       return;
//     }

//     // Atajos de avance/pago
//     if (VideoIntentDetector.isFastBuy(msg) || VideoIntentDetector.isContinue(msg) || /^ok$/i.test(msg)) {
//       await updateUserSession(phone, msg, 'videosUsb', null, false, {
//         messageType: 'videos',
//         confidence: 0.95,
//         metadata: { fastLane: true }
//       });

//       await flowDynamic([[
//   'Perfecto. Precios HOY (solo videos):',
//   '1 32GB (≈1,000) — más elegido',
//   '2 32GB (≈1,000) — más elegido',
//   '3 64GB (≈2,000) — recomendado',
//   '4 128GB (≈4,000) — coleccionista',
//   '',
//   'Responde con el número para continuar.'
// ].join('\n')]);

//       // Cross-sell minimalista antes de capacidad/pago
//       await safeCrossSell(flowDynamic, session, phone, 'pre_payment');

//       // postHandler: pasamos a awaiting_capacity
//       await postHandler(phone, 'videosUsb', 'awaiting_capacity');

//       return gotoFlow(capacityVideo);
//     }

//     // Preferencias (personalización)
//     const genres = VideoIntentDetector.extractGenres(msg);
//     const artists = VideoIntentDetector.extractArtists(msg, genres);
//     const eras = VideoIntentDetector.extractEras(msg);
//     const hasPrefs = genres.length || artists.length || eras.length;

//     if (hasPrefs) {
//       st.selectedGenres = VideoUtils.dedupeArray([...st.selectedGenres, ...genres]);
//       st.mentionedArtists = VideoUtils.dedupeArray([...st.mentionedArtists, ...artists]);
//       st.preferredEras = VideoUtils.dedupeArray([...st.preferredEras, ...eras]);
//       st.customizationStage = 'advanced_personalizing';
//       st.personalizationCount = (st.personalizationCount || 0) + 1;
//       await VideoStateManager.save(st);

//       await updateUserSession(phone, msg, 'videosUsb', null, false, {
//         messageType: 'videos',
//         confidence: 0.85,
//         metadata: { genres: st.selectedGenres, artists: st.mentionedArtists, eras: st.preferredEras }
//       });

//       const summary = [
//         '🎬 Personalización:',
//         `• Géneros: ${st.selectedGenres.join(', ') || '-'}`,
//         `• Artistas: ${st.mentionedArtists.join(', ') || '-'}`,
//         `• Épocas: ${st.preferredEras.join(', ') || '-'}`
//       ].join('\n');

//       await safeFlowSend(session, flowDynamic, [`${summary}\n\n✅ Escribe "OK" para continuar.`]);

//       if (canSendOnce(session, 'videos_pref_demos', 180)) {
//         const moreDemos = await VideoDemoManager.getRandomVideosByGenres(st.selectedGenres, DEMO_VIDEO_COUNT);
//         const demoPayloads = moreDemos.map(d => ({ body: `🎥 ${d.name}`, media: d.filePath }));
//         await safeFlowSend(session, flowDynamic, ['👁️ Ejemplos reales de calidad:', ...demoPayloads]);
//       }

//       // postHandler: seguimos en personalization
//       await postHandler(phone, 'videosUsb', 'personalization');

//       return;
//     }

//     // Selección directa de capacidad por número explícito
//     if (['2', '3', '4'].includes(msg)) {
//       await flowDynamic([
//         [
//           '✅ Perfecto.',
//           'Te llevo a elegir capacidad con el precio final.',
//           '1 32GB (≈1,000 videos)',
//           '2 32GB (≈1,000 videos)',
//           '3 64GB (≈2,000 videos)',
//           '4 128GB (≈4,000 videos)',
//           '',
//           'Responde con el número para confirmar.'
//         ].join('\n')
//       ]);
//       await safeCrossSell(flowDynamic, session, phone, 'pre_payment');

//       // postHandler: a awaiting_capacity
//       await postHandler(phone, 'videosUsb', 'awaiting_capacity');

//       return gotoFlow(capacityVideo);
//     }

//     // Avance suave (sin preferencias claras)
//     st.personalizationCount = (st.personalizationCount || 0) + 1;
//     await VideoStateManager.save(st);

//     if (st.personalizationCount >= 2) {
//       await flowDynamic([
//   '⏳ Para conservar el precio, elige capacidad: 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.'
// ]);

//       // postHandler: mantenemos prices_shown o personalization; aquí reforzamos personalization
//       await postHandler(phone, 'videosUsb', 'personalization');

//     } else {
//       await flowDynamic([
//         '¿Quieres selección recomendada? Escribe "OK". O dime 2 géneros/2 artistas. Ej: "rock y salsa", "Karol G y Bad Bunny".'
//       ]);

//       // postHandler: seguimos en personalization
//       await postHandler(phone, 'videosUsb', 'personalization');
//     }

//   } catch (e) {
//     await flowDynamic('⚠️ Ocurrió un error. Intenta nuevamente.');
//   }
// });

// // ====== Puente a MÚSICA (si el usuario lo pide explícito) ======
// const crossSellGuard = addKeyword(['ver musica','quiero usb de musica','videos','quiero musica','quiero música'])
//   .addAction(async (ctx, { gotoFlow }) => gotoFlow(musicUsb));

// export default videoUsb;



import { addKeyword, EVENTS } from '@builderbot/bot';
import capacityVideo from "./capacityVideo";
import musicUsb from './musicUsb';
import { updateUserSession, getUserSession, canSendOnce } from './userTrackingSystem';
import {
  saveUserCustomizationState,
  loadUserCustomizationState,
  mapVideoStateToCustomizationState,
  mapCustomizationStateToVideoState,
  type UserVideoState
} from '../userCustomizationDb';
import path from 'path';
import { promises as fs } from 'fs';
import { preHandler, postHandler } from './middlewareFlowGuard';
import crypto from 'crypto';
import { MEDIA_ASSETS } from '../config/mediaAssets';

// ===== Utils de formato y Helpers =====
const bullets = {
  check: '✅', spark: '✨', star: '⭐', fire: '🔥', eye: '👁️',
  film: '🎬', cam: '🎥', clock: '⏰', box: '📦', chip: '💾', shield: '🛡️',
  wave: '👋', point: '👉'
};

function toCOP(n: number) {
  return `$${n.toLocaleString('es-CO')}`;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ===== Control de Tiempo y Bloqueo =====
function isHourAllowed(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 8 && h <= 22; // Ampliado ligeramente para no bloquear ventas nocturnas tempranas
}

function allowNonCritical() {
  return isHourAllowed();
}

function canSendUserBlock(session: any): { ok: boolean; reason?: string } {
  const now = new Date();
  if (!isHourAllowed(now)) return { ok: false, reason: 'outside_hours' };

  session.conversationData = session.conversationData || {};
  const lastAt = session.conversationData.videos_lastBlockAt ? new Date(session.conversationData.videos_lastBlockAt) : null;

  // Reduce el bloqueo a 4 horas para permitir re-intentos el mismo día si el usuario vuelve
  if (lastAt && (now.getTime() - lastAt.getTime()) < 4 * 3600000) {
    return { ok: false, reason: 'recently_sent' };
  }
  return { ok: true };
}

function recordUserBlock(session: any) {
  const nowIso = new Date().toISOString();
  session.conversationData = session.conversationData || {};
  session.conversationData.videos_lastBlockAt = nowIso;
}

// ===== Deduplicación (Simplificada) =====
export function hasSentBody(session: any, body: string): boolean {
  const h = sha256(body);
  const sent = (session?.conversationData?.videos_sentBodies || []) as string[];
  return sent.includes(h);
}

export function markBodySent(session: any, body: string) {
  const h = sha256(body);
  session.conversationData = session.conversationData || {};
  const sent = (session.conversationData.videos_sentBodies || []) as string[];
  session.conversationData.videos_sentBodies = Array.from(new Set([...sent, h])).slice(-50);
}

// ===== CONSTANTES Y DATA =====
const VIDEO_USB_PRICES: Record<string, number> = {
  '8GB': 59900, '32GB': 89900, '64GB': 129900, '128GB': 169900
};
// Reducimos demos a 1 para no saturar el chat de videos pesados al inicio
const DEMO_VIDEO_COUNT = 1;
const SCARCITY_UNITS = 4;

export const videoData = {
  // ... (MANTENEMOS TU DATA DE GENEROS Y ARTISTAS IGUAL) ...
  topHits: {
    "bachata": [
      { "name": "Romeo Santos - Propuesta Indecente", "file": "..\\demos_videos_recortados\\Bachata\\Romeo Santos - Propuesta Indecente_demo.mp4" },
      { "name": "Aventura - Obsesión", "file": "..\\demos_videos_recortados\\Bachata\\Aventura - Obsesión_demo.mp4" }
    ],
    "reggaeton": [
      { "name": "Daddy Yankee - Gasolina", "file": "..\\demos_videos_recortados\\Reggaeton\\Daddy Yankee - Gasolina_demo.mp4" },
      { "name": "Bad Bunny - Tití Me Preguntó", "file": "..\\demos_videos_recortados\\Reggaeton\\Bad Bunny - Tití Me Preguntó_demo.mp4" }
    ],
    "salsa": [
      { "name": "Marc Anthony - Vivir Mi Vida", "file": "..\\demos_videos_recortados\\Salsa\\Marc Anthony - Vivir Mi Vida_demo.mp4" },
      { "name": "Joe Arroyo - La Rebelión", "file": "..\\demos_videos_recortados\\Salsa\\Joe Arroyo - La Rebelión_demo.mp4" }
    ]
    // ... Agrega el resto de géneros aquí si faltan ...
  },
  artistsByGenre: {
    "reggaeton": ["bad bunny", "daddy yankee", "karol g", "feid", "ryan castro", "blessd", "maluma"],
    "bachata": ["romeo santos", "aventura", "prince royce"],
    "salsa": ["marc anthony", "joe arroyo", "grupo niche", "willie colon"],
    "vallenato": ["silvestre dangond", "diomedes diaz", "binomio de oro"]
  },
  playlists: [
    {
      name: "🎬🔥 Video Crossover Total",
      description: "Reggaeton, Salsa, Vallenato, Popular y más en HD."
    }
  ]
};

// ===== CLASES UTILITARIAS =====
export class VideoUtils {
  static normalizeText(text: string): string {
    return (text || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  static dedupeArray<T>(arr: T[]): T[] {
    return [...new Set(arr)];
  }
  static async getValidFile(filePath: string) {
    try {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
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
          showedPreview: false
        });
      }
    }
    return this.userStates.get(phone)!;
  }

  static async save(userState: UserVideoState) {
    this.userStates.set(userState.phoneNumber, userState);
    await saveUserCustomizationState(mapVideoStateToCustomizationState(userState));
  }
}

class VideoDemoManager {
  static async getRandomVideosByGenres(genres: string[], count = DEMO_VIDEO_COUNT) {
    // Lógica simplificada para obtener video random
    const pool = Object.keys(videoData.topHits);
    const selectedGenre = genres.length > 0 && pool.includes(genres[0])
      ? genres[0]
      : pool[Math.floor(Math.random() * pool.length)];

    const list = (videoData.topHits as any)[selectedGenre] || [];
    if (!list.length) return [];

    const videoInfo = list[Math.floor(Math.random() * list.length)];
    const file = await VideoUtils.getValidFile(videoInfo.file);

    if (file.valid) {
      return [{ name: videoInfo.name, filePath: (file as any).path, genre: selectedGenre }];
    }
    return [];
  }
}

class VideoIntentDetector {
  static isFastBuy(input: string) {
    const txt = VideoUtils.normalizeText(input);
    return /(comprar|quiero|listo|confirmo|ordenar|pagar|contraentrega|pedido)/i.test(txt);
  }
  static extractGenres(message: string): string[] {
    const txt = VideoUtils.normalizeText(message);
    return Object.keys(videoData.topHits).filter(g => txt.includes(g));
  }
}

// ===== GESTOR DE ENVÍO ORGANIZADO (OPTIMIZADO) =====
export async function processMessageQueue(
  session: any,
  flowDynamic: any,
  queue: Array<{ body: string; media?: string; delay?: number }>
) {
  if (!queue.length) return;

  for (const msg of queue) {
    // Verificar duplicados en tiempo real (por si acaso)
    if (!hasSentBody(session, msg.body)) {
      // Enviar mensaje
      if (msg.media) {
        await flowDynamic([{ body: msg.body, media: msg.media }]);
      } else {
        await flowDynamic([{ body: msg.body }]);
      }

      markBodySent(session, msg.body);

      // Delay inteligente: Si es video/imagen espera más, si es texto espera menos
      const defaultDelay = msg.media ? 2500 : 1500;
      await VideoUtils.delay(msg.delay || defaultDelay);
    }
  }
}

// ====== HANDLER DE OBJECIONES ======
async function handleVideoObjections(userInput: string, flowDynamic: any) {
  const t = VideoUtils.normalizeText(userInput);

  if (/precio|cuanto|vale|costo/.test(t)) {
    await flowDynamic([
      `💰 *Precios USB Video HD:*`,
      `• 32GB: ${toCOP(VIDEO_USB_PRICES['32GB'])} (≈1000 videos)`,
      `• 64GB: ${toCOP(VIDEO_USB_PRICES['64GB'])} (≈2000 videos)`,
      `\n🚚 Envío GRATIS hoy. ¿Cuál te gustaría?`
    ]);
    return true;
  }

  if (/envio|tarda|tiempo|llegar/.test(t)) {
    await flowDynamic([{
      body: `🚛 *Envío Rápido y Seguro*\nLlega en 1 a 3 días hábiles. Pagas al recibir.\n\n¿Te aparto una unidad?`,
      media: MEDIA_ASSETS.promos.shipping
    }]);
    return true;
  }

  return false;
}

// ====== FLUJO PRINCIPAL ======
const videoUsb = addKeyword([
  'Hola, me interesa la USB con vídeos.', 'usb con videos', 'videos', 'videos usb', 'video'
])
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    const phone = ctx.from;
    const body = ctx.body;

    // 1. Inicializar estado y sesión
    await VideoStateManager.getOrCreate(phone);
    await updateUserSession(phone, body, 'videosUsb', null, false);
    const sess = await getUserSession(phone) as any;

    // 2. Guard (Middleware para evitar spam si ya está en proceso de compra)
    const pre = await preHandler(ctx, { flowDynamic, gotoFlow: async () => { } }, 'videosUsb', ['entry'], {
      lockOnStages: ['awaiting_payment'],
      resumeMessages: { awaiting_payment: 'Teníamos un pedido pendiente. ¿Deseas retomarlo?' }
    });
    if (!pre.proceed) return;

    // 3. CONSTRUCCIÓN DE LA EXPERIENCIA (Message Queue)
    const messageQueue: Array<{ body: string; media?: string; delay?: number }> = [];

    // --- PASO 1: Hook / Intro (Si no se ha enviado recientemente) ---
    if (canSendUserBlock(sess).ok) {

      // A. Imagen de Portada + Beneficio Principal
      messageQueue.push({
        body: [
          `👋 ¡Hola! Bienvenido a la experiencia *Video Premium HD*.`,
          `Transforma tu pantalla con la mejor colección musical.`,
          ``,
          `${bullets.star} Calidad garantizada (Nada borroso)`,
          `${bullets.check} Compatible con TV, Carro y PC`,
        ].join('\n'),
        media: MEDIA_ASSETS.videos.intro, // Imagen impactante
        delay: 1000
      });

      // B. Prueba de Calidad (Solo 1 Demo para no saturar)
      const demos = await VideoDemoManager.getRandomVideosByGenres(['reggaeton'], 1);
      if (demos.length > 0) {
        messageQueue.push({
          body: `🎬 Mira la calidad real aquí (sube el volumen):`,
          delay: 500
        });
        messageQueue.push({
          body: `🎵 ${demos[0].name}`,
          media: demos[0].filePath,
          delay: 3000 // Esperamos 3s para que el usuario pueda dar play mentalmente
        });
      }

      // C. Lógica: Tabla Comparativa (Visual)
      // Esto responde "¿Qué me llevo?" antes de pedir el dinero
      messageQueue.push({
        body: `💾 *Elige tu capacidad ideal:*`,
        media: MEDIA_ASSETS.capacities.comparativeTable,
        delay: 1500
      });

      // D. Cierre: Precios y CTA (Pregunta clara)
      messageQueue.push({
        body: [
          `📋 *Lista de Precios (Envío Incluido):*`,
          ``,
          `2️⃣ *32GB* (≈1.000 Videos) ➔ ${toCOP(VIDEO_USB_PRICES['32GB'])}`,
          `3️⃣ *64GB* (≈2.000 Videos) ➔ ${toCOP(VIDEO_USB_PRICES['64GB'])} ${bullets.fire}`,
          ``,
          `👉 *Responde con el número (2 o 3)* de la que prefieres para tomar tu pedido.`
        ].join('\n'),
        delay: 0
      });

      // Registrar el envío masivo para no repetirlo pronto
      recordUserBlock(sess);

      // Ejecutar la cola organizada
      await processMessageQueue(sess, flowDynamic, messageQueue);
      await postHandler(phone, 'videosUsb', 'prices_shown');

    } else {
      // Si el usuario vuelve muy rápido, solo recordamos lo esencial
      await flowDynamic([
        `👋 ¡Hola de nuevo! Aquí sigo pendiente.`,
        `¿Te decidiste por la de *32GB* o la de *64GB*?`
      ]);
    }

  })
  // ❌ ELIMINADO EL SEGUNDO .addAction QUE CAUSABA SATURACIÓN ❌
  // Ahora pasamos directamente a capturar la respuesta del usuario.

  // === CAPTURA DE RESPUESTA ===
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
    const phone = ctx.from;
    const msg = ctx.body?.trim() || '';

    // 1. Detección de Objeciones
    const handled = await handleVideoObjections(msg, flowDynamic);
    if (handled) return fallBack(); // Vuelve a esperar respuesta

    // 2. Selección de Capacidad (Lógica central)
    // Aceptamos "2", "3", "32", "64" o palabras clave
    if (['2', '32', '32gb'].includes(VideoUtils.normalizeText(msg))) {
      await flowDynamic(`✅ Perfecto, la de *32GB* es la más vendida. Vamos a tomar tus datos.`);
      await updateUserSession(phone, '32GB', 'videosUsb', null, false, { metadata: { selectedCapacity: '32GB' } });
      return gotoFlow(capacityVideo);
    }

    if (['3', '64', '64gb'].includes(VideoUtils.normalizeText(msg))) {
      await flowDynamic(`🔥 Excelente, *64GB* para los verdaderos coleccionistas. Ya tomamos tu pedido.`);
      await updateUserSession(phone, '64GB', 'videosUsb', null, false, { metadata: { selectedCapacity: '64GB' } });
      return gotoFlow(capacityVideo);
    }

    // 3. Intención de Compra genérica
    if (VideoIntentDetector.isFastBuy(msg)) {
      await flowDynamic(`Genial. Para confirmar, ¿prefieres la de *32GB* o *64GB*?`);
      return; // Espera siguiente respuesta
    }

    // 4. Personalización (Si responde con géneros)
    const genres = VideoIntentDetector.extractGenres(msg);
    if (genres.length > 0) {
      await flowDynamic([
        `✍️ Entendido, incluiremos mucho ${genres.join(' y ')}.`,
        `Para esa cantidad de música, te recomiendo la de **64GB**. ¿Te enviamos esa?`
      ]);
      return;
    }

    // 5. Fallback suave (No entendió)
    await flowDynamic([
      `Disculpa, no entendí bien. Solo escribe el número:`,
      `Escribe *2* para la de 32GB`,
      `Escribe *3* para la de 64GB`
    ]);
    return; // Se queda esperando (loop implícito de builderbot)
  });

// ====== Puente a MÚSICA ======
const crossSellGuard = addKeyword(['ver musica', 'solo musica', 'mp3'])
  .addAction(async (ctx, { gotoFlow }) => gotoFlow(musicUsb));

export default videoUsb;