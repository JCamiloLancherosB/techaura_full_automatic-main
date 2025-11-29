// import { addKeyword, EVENTS } from '@builderbot/bot';
// import orderProcessing from './orderProcessing';
// import { updateUserSession, getUserSession } from './userTrackingSystem';
// import { SalesMaximizer } from '../sales-maximizer';
// import { matchingEngine } from '../catalog/MatchingEngine';
// import { finalizeOrder } from './helpers/finalizeOrder';
// import type { UsbCapacity, UserSession } from '../../types/global';
// import { crossSellSystem } from '../services/crossSellSystem';
// import { preHandler, postHandler } from './middlewareFlowGuard';
// import { formatPrice, calculateSavings } from './capacityMusic';
// import { MEDIA_ASSETS } from '../config/mediaAssets';
// import { processMessageQueue } from './videosUsb';

// const salesMaximizer = new SalesMaximizer();

// interface UsbOption {
//   num: string;
//   size: UsbCapacity;
//   desc: string;
//   detail: string;
//   price: number;
//   originalPrice: number;
//   stock: number;
//   popular?: boolean;
//   limited?: boolean;
//   vip?: boolean;
//   urgency: string;
// }

// // Configuración visual de capacidades (Precios y Copy mejorados)
// const USBCAPACITIES: UsbOption[] = [
//   {
//     num: '1',
//     size: '64GB',
//     desc: 'Pack Inicio',
//     detail: '50-65 Películas o 155 Episodios',
//     price: 119900,
//     originalPrice: 149900,
//     stock: 7,
//     urgency: '⚡ Ideal para viajes cortos'
//   },
//   {
//     num: '2',
//     size: '128GB',
//     desc: 'Pack Maratón',
//     detail: '100-125 Películas o 310 Episodios',
//     price: 159900,
//     originalPrice: 199900,
//     stock: 6,
//     popular: true,
//     urgency: '🔥 La más vendida'
//   },
//   {
//     num: '3',
//     size: '256GB',
//     desc: 'Pack Cineasta',
//     detail: '200-250 Películas o Sagas Completas',
//     price: 229900,
//     originalPrice: 289900,
//     stock: 4,
//     limited: true,
//     urgency: '💎 Stock Limitado'
//   },
//   {
//     num: '4',
//     size: '512GB',
//     desc: 'Pack Coleccionista',
//     detail: '450+ Películas + Documentales',
//     price: 349900,
//     originalPrice: 429900,
//     stock: 2,
//     vip: true,
//     urgency: '👑 Todo en uno'
//   }
// ];

// const genresRecommendation = [
//   { key: 'acción', emoji: '🔥', names: 'John Wick, Misión Imposible, Marvel' },
//   { key: 'comedia', emoji: '😂', names: 'Shrek, Friends, The Office' },
//   { key: 'drama', emoji: '🎭', names: 'Breaking Bad, El Padrino' },
//   { key: 'terror', emoji: '👻', names: 'El Conjuro, IT, Scream' },
//   { key: 'animadas', emoji: '🎨', names: 'Mario Bros, Disney, Pixar' }
// ];

// // --- Utilidades ---
// function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// // Normalizador de intención
// function normalizeIntent(input: string) {
//   const t = input.toLowerCase().trim();
//   return {
//     isCapacityCmd: /^cap(acidades)?$/.test(t) || /cap(aci|a)dad|64|128|256|512/.test(t) || ['1', '2', '3', '4'].includes(t),
//     isPromos: /^promos?$|^combo(s)?$/.test(t),
//     isMusic: /^m(ú|u)sica$/.test(t),
//     isCollections: /^coleccion(es)?$/.test(t),
//     isUpgrade: /upgrade/.test(t),
//     isSecondUsb: /(segunda|2da|otro|otra)/.test(t)
//   };
// }

// // Cross-sell específico para Películas -> Música
// async function offerMusicCrossSell(flowDynamic: any, phoneNumber: string) {
//   try {
//     const session = await getUserSession(phoneNumber);
//     await flowDynamic([
//       { body: '⏳ *Guardando tu selección de cine...*', delay: 500 },
//       { body: '🎵 *¿Te gustaría añadir MÚSICA a tu pedido?*', delay: 1000 },
//       { body: '👉 Aprovecha el envío y lleva tus playlists favoritas.', delay: 1500 },
//       { body: '🎁 *Descuento Combo:* -20% en la USB de música si la llevas ahora.\n\nEscribe *MÚSICA* para agregarla o envía tus datos para finalizar.', delay: 2000 }
//     ]);
//     if (session) await updateUserSession(phoneNumber, 'Cross-sell Cine->Musica', 'cross_sell_presented', null, false, { metadata: session });
//   } catch (error) { console.error(error); }
// }

// // --- FLUJO PRINCIPAL ---
// const moviesUsb = addKeyword([
//   'Hola, me interesa la USB con películas o series.',
//   'USB de peliculas'
// ])
//   .addAction(async (ctx, { flowDynamic }) => {
//     const phone = ctx.from;

//     const pre = await preHandler(
//       ctx,
//       { flowDynamic, gotoFlow: async () => { } },
//       'moviesUsb',
//       ['entry', 'personalization'],
//       {
//         lockOnStages: ['awaiting_capacity', 'awaiting_payment', 'checkout_started', 'completed'],
//         resumeMessages: {
//           awaiting_capacity: 'Retomemos capacidad: 1️⃣ 64GB • 2️⃣ 128GB • 3️⃣ 256GB.',
//           awaiting_payment: 'Retomemos pago/datos: envía Nombre, Ciudad y Dirección.',
//           checkout_started: 'Estamos cerrando tu pedido. Espera confirmación.'
//         }
//       }
//     );
//     if (!pre.proceed) return;

//     const session = await getUserSession(phone);
//     await updateUserSession(phone, ctx.body, 'moviesUsb', null, false, { messageType: 'movies', confidence: 0.95, metadata: { entry: 'moviesUsb_entry' } });

//     const social = Math.random() > 0.5 ? '🌟 +900 clientes felices este mes' : '⭐ 4.9/5 Calificación Promedio';

//     // Construcción de la COLA DE MENSAJES
//     const messageQueue: Array<{ body: string; media?: string; delay?: number }> = [];

//     messageQueue.push({
//       body: `🎬 *¡Tu Cine Personal sin Internet!*`,
//       media: MEDIA_ASSETS.movies.intro,
//       delay: 500
//     });

//     messageQueue.push({
//       body: `Películas y series organizadas en Alta Calidad. Conecta al TV y disfruta.\n${social}`,
//       delay: 1000
//     });

//     messageQueue.push({
//       body: '🍿 *Géneros Populares:*',
//       delay: 1500
//     });

//     messageQueue.push({
//       body: genresRecommendation.map(g => `${g.emoji} ${g.key}`).join('  |  '),
//       media: MEDIA_ASSETS.movies.genres,
//       delay: 1500
//     });

//     // PROCESAR COLA
//     await processMessageQueue(session, flowDynamic, messageQueue, { blockType: 'intense' });

//     await postHandler(phone, 'moviesUsb', 'prices_shown');
//   })

//   .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
//     const inputRaw = ctx.body || '';
//     const phone = ctx.from;

//     const pre = await preHandler(
//       ctx,
//       { flowDynamic, gotoFlow },
//       'moviesUsb',
//       ['personalization', 'prices_shown', 'awaiting_capacity', 'awaiting_payment', 'checkout_started'],
//       {
//         lockOnStages: ['checkout_started', 'completed'],
//         resumeMessages: {
//           prices_shown: '¿Quieres ver capacidades? Escribe "VER".',
//           awaiting_capacity: 'Elige tu capacidad: 1, 2, 3 o 4.'
//         }
//       }
//     );
//     if (!pre.proceed) return;

//     const session = await getUserSession(phone);
//     const { isCapacityCmd, isPromos, isMusic } = normalizeIntent(inputRaw);

//     // 1. Mostrar Capacidades (Menú Visual)
//     if (isCapacityCmd || inputRaw.includes('1')) {
//       // 

//       // [Image of different usb sizes comparison]

//       await flowDynamic([
//         { body: '💾 *Elige el tamaño de tu maratón:*', delay: 500 },
//         { media: MEDIA_ASSETS.capacities.comparativeTable, delay: 1000 },

//         { body: `1️⃣ *64GB* (${USBCAPACITIES[0].detail})\n💰 *${formatPrice(USBCAPACITIES[0].price)}* (Antes ${formatPrice(USBCAPACITIES[0].originalPrice)})\n${USBCAPACITIES[0].urgency}`, delay: 1000 },

//         { body: `2️⃣ *128GB* (${USBCAPACITIES[1].detail})\n💰 *${formatPrice(USBCAPACITIES[1].price)}* (Antes ${formatPrice(USBCAPACITIES[1].originalPrice)})\n${USBCAPACITIES[1].urgency}`, delay: 1500 },

//         { body: `3️⃣ *256GB* (${USBCAPACITIES[2].detail})\n💰 *${formatPrice(USBCAPACITIES[2].price)}* (Antes ${formatPrice(USBCAPACITIES[2].originalPrice)})\n${USBCAPACITIES[2].urgency}`, delay: 1500 },

//         { body: `4️⃣ *512GB* (${USBCAPACITIES[3].detail})\n💰 *${formatPrice(USBCAPACITIES[3].price)}* (Antes ${formatPrice(USBCAPACITIES[3].originalPrice)})\n${USBCAPACITIES[3].urgency}`, delay: 1500 },

//         { body: '👇 Escribe el número de tu elección (*1, 2, 3 o 4*).', delay: 2000 }
//       ]);
//       await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
//       return gotoFlow(capacidadPaso);
//     }

//     // 2. Personalización (Detectar Títulos)
//     if (inputRaw.trim().length > 2 && !isPromos && !isMusic) {
//       const { genres, titles } = matchingEngine.match(inputRaw, 'movies', { detectNegations: true });

//       if (genres?.length || titles?.length) {
//         if (genres?.length) {
//           session.movieGenres = Array.from(new Set([...(session.movieGenres || []), ...genres]));
//           await updateUserSession(phone, ctx.body, 'moviesUsb_genresDetected', null, false, { metadata: { movieGenres: session.movieGenres } });
//         }
//         if (titles?.length) {
//           session.requestedTitles = Array.from(new Set([...(session.requestedTitles || []), ...titles]));
//           await updateUserSession(phone, ctx.body, 'moviesUsb_titlesDetected', null, false, { metadata: { titles: session.requestedTitles } });
//         }

//         await flowDynamic([
//           { body: '📝 *¡Anotado!*', delay: 500 },
//           { body: `Tendremos en cuenta tus gustos: ${[...(genres || []), ...(titles || [])].slice(0, 5).join(', ')}...`, delay: 1000 },
//           { body: 'Ahora, ¿cuánto espacio necesitas para esta colección?', delay: 1500 }
//         ]);

//         // Mostrar menú de capacidades automáticamente
//         await flowDynamic([
//           { body: `1️⃣ *64GB* - Inicio (${formatPrice(USBCAPACITIES[0].price)})`, delay: 2000 },
//           { body: `2️⃣ *128GB* - Recomendada (${formatPrice(USBCAPACITIES[1].price)})`, delay: 2000 },
//           { body: `3️⃣ *256GB* - Coleccionista (${formatPrice(USBCAPACITIES[2].price)})`, delay: 2000 },
//           { body: '👇 Escribe *1, 2 o 3* para elegir.', delay: 2500 }
//         ]);

//         await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
//         return gotoFlow(capacidadPaso);
//       }
//     }

//     // 3. Fallback General
//     await flowDynamic([{ body: '🎬 Escribe "VER" para ver precios o dime qué películas buscas.', delay: 1000 }]);
//   });

// // --- PASO DE CAPACIDAD ---
// const capacidadPaso = addKeyword([EVENTS.ACTION])
//   .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
//     const inputRaw = ctx.body || '';
//     const input = inputRaw.toLowerCase().trim();
//     const phone = ctx.from;

//     const pre = await preHandler(
//       ctx, { flowDynamic, gotoFlow }, 'moviesUsb', ['awaiting_capacity', 'awaiting_payment'],
//       { lockOnStages: ['checkout_started', 'completed'] }
//     );
//     if (!pre.proceed) return;

//     const session = await getUserSession(phone);

//     // Lógica de Selección
//     const capIdx = USBCAPACITIES.findIndex(u => input.includes(u.num) || input.includes(u.size.toLowerCase()));

//     if (capIdx !== -1) {
//       const sel = USBCAPACITIES[capIdx];
//       session.capacity = sel.size;
//       session.price = sel.price;
//       await updateUserSession(phone, ctx.body, 'moviesUsb_capacitySelected', null, false, { metadata: { capacity: sel.size, price: sel.price } });
//       const mediaURL = MEDIA_ASSETS.capacities[`gb${sel.size.replace('GB', '')}` as keyof typeof MEDIA_ASSETS.capacities];
//       const savings = calculateSavings(sel.originalPrice, sel.price);

//       // 

//       // [Image of specific USB size packaging]

//       await flowDynamic([
//         { body: `✅ *Has elegido el Pack ${sel.desc} (${sel.size})*`, media: mediaURL, delay: 500 }, // ⬅️ IMAGEN DE CAPACIDAD
//         { body: `💰 Precio final: ${formatPrice(sel.price)} (Ahorras ${savings})`, delay: 1000 },
//         { body: `📦 Incluye envío GRATIS y garantía de reposición.`, delay: 1500 }
//       ]);

//       // Lógica de Upgrade (Si elige 64GB o 128GB, ofrecer el siguiente)
//       if (capIdx < 2) { // Solo ofrecer upgrade si no es la más grande
//         const next = USBCAPACITIES[capIdx + 1];
//         const upgradePrice = Math.round(next.price * 0.9); // 10% extra off por upgrade

//         await flowDynamic([
//           { body: `🛑 *¡ESPERA! Oferta Flash:*`, delay: 1000 },
//           {
//             body: `Por solo un poco más, lleva el DOBLE de espacio (${next.size}).\nPrecio Oferta: *${formatPrice(upgradePrice)}*...`,
//             media: MEDIA_ASSETS.promos.upgradeOffer, // ⬅️ IMAGEN DE UPGRADE
//             delay: 1500
//           },
//         ]);
//       } else {
//         await offerMusicCrossSell(flowDynamic, phone);
//       }

//       await postHandler(phone, 'moviesUsb', 'awaiting_payment');
//       return gotoFlow(datosCliente);
//     }

//     // Lógica de Upgrade aceptado
//     if (input.includes('upgrade') && session.capacity) {
//       // Lógica simplificada de upgrade
//       await flowDynamic([{ body: '🎉 *¡Upgrade Aplicado!* Excelente decisión.', delay: 1000, media: MEDIA_ASSETS.promos.upgradeOffer }]); // ⬅️ IMAGEN DE UPGRADE CONFIRMADO
//       await offerMusicCrossSell(flowDynamic, phone);
//       await postHandler(phone, 'moviesUsb', 'awaiting_payment');
//       return gotoFlow(datosCliente);
//     }

//     await flowDynamic([{ body: '❌ Por favor escribe el número de la opción (1-4).', delay: 1000 }]);
//   });

// // --- PASO DATOS CLIENTE ---
// const datosCliente = addKeyword([EVENTS.ACTION])
//   .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
//     const text = ctx.body?.trim() || '';
//     const phone = ctx.from;
//     const session = await getUserSession(phone);

//     const pre = await preHandler(ctx, { flowDynamic, gotoFlow }, 'moviesUsb', ['awaiting_payment', 'checkout_started'], { lockOnStages: ['completed'] });
//     if (!pre.proceed) return;

//     // Detectar Cross-Sell de Música aceptado aquí
//     if (text.toLowerCase().includes('musica') || text.toLowerCase().includes('música')) {
//       session.addMusicCombo = true;
//       await updateUserSession(phone, text, 'moviesUsb_musicCombo', null, false, { metadata: { addMusicCombo: true } });
//       await flowDynamic([{ body: '🎧 *¡Música añadida con éxito!* (-20% OFF aplicado).', delay: 1000 }]);
//     }

//     if (text.length < 15 && !session.addMusicCombo) { // Validación simple
//       await flowDynamic([
//         { body: '🔒 *Para el envío, necesito tus datos completos:*', delay: 500 },
//         { body: 'Nombre, Ciudad, Dirección y Celular.', delay: 1000 },
//         { body: '_Ej: Juan Pérez, Bogotá, Calle 100 #15-20, 3001234567_', delay: 1500 }
//       ]);
//       return;
//     }

//     // Parseo básico (simulado, usar función robusta en prod)
//     const shippingData = text;

//     // Guardar y Finalizar
//     await postHandler(phone, 'moviesUsb', 'checkout_started');

//     const finalPrice = (session.price || 0) + (session.addMusicCombo ? 79900 : 0); // Precio ejemplo combo

//     const result = await finalizeOrder({
//       phoneNumber: phone,
//       capacities: [session.capacity || '64GB'],
//       contentTypes: session.addMusicCombo ? ['movies', 'music'] : ['movies'],
//       shippingData: shippingData,
//       overridePreferences: { movieGenres: session.movieGenres || [], titles: session.requestedTitles || [] },
//       forceConfirm: true,
//       extras: { musicCombo: !!session.addMusicCombo, finalPrice }
//     });

//     await flowDynamic([
//       { body: `✅ *¡Pedido Confirmado!* (ID: ${result.orderId})`, delay: 500 },
//       { body: `📦 Preparando tu pack de cine ${session.addMusicCombo ? '+ música ' : ''}personalizado.`, delay: 1000 },
//       { body: `💰 Total a pagar contraentrega: *${formatPrice(finalPrice)}*`, delay: 1500 },
//       { body: 'Un asesor revisará tu lista de pedidos en breve.', delay: 2000 }
//     ]);

//     session.stage = 'completed';
//     await updateUserSession(phone, text, 'moviesUsb_completed', null, false, { metadata: { finalPrice } });
//     await postHandler(phone, 'moviesUsb', 'completed');

//     return gotoFlow(orderProcessing);
//   });

// export default moviesUsb;

import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import { matchingEngine } from '../catalog/MatchingEngine';
import { finalizeOrder } from './helpers/finalizeOrder';
import type { UsbCapacity, UserSession } from '../../types/global';
import { preHandler, postHandler } from './middlewareFlowGuard';
import { formatPrice, calculateSavings } from './capacityMusic';
import { MEDIA_ASSETS } from '../config/mediaAssets';

// --- CONFIGURACIÓN DE DATOS EXTENDIDA ---

interface UsbOption {
  num: string;
  size: UsbCapacity;
  desc: string;
  detail: string;
  price: number;
  originalPrice: number;
  stock: number;
  urgency: string;
  popular?: boolean;
  vip?: boolean;
}

// 1. Catálogo de Capacidades (Extendido y Variado)
const USBCAPACITIES: UsbOption[] = [
  {
    num: '1',
    size: '64GB',
    desc: 'Pack Inicio',
    detail: '🎬 50-60 Películas o 150 Episodios',
    price: 119900,
    originalPrice: 149900,
    stock: 7,
    urgency: '⚡ Ideal para viajes cortos'
  },
  {
    num: '2',
    size: '128GB',
    desc: 'Pack Maratón',
    detail: '🍿 100-120 Películas o 300 Episodios',
    price: 159900,
    originalPrice: 199900,
    stock: 6,
    popular: true,
    urgency: '🔥 La opción más vendida'
  },
  {
    num: '3',
    size: '256GB',
    desc: 'Pack Cineasta',
    detail: '🎥 220+ Películas o Sagas Completas',
    price: 229900,
    originalPrice: 289900,
    stock: 4,
    urgency: '💎 Para verdaderos fans'
  },
  {
    num: '4',
    size: '512GB',
    desc: 'Pack Coleccionista',
    detail: '🏛️ 450+ Películas + Documentales',
    price: 349900,
    originalPrice: 429900,
    stock: 2,
    vip: true,
    urgency: '👑 Todo el cine en tu bolsillo'
  }
];

// 2. Recomendaciones de Géneros (Más variedad visual)
// 2. Recomendaciones de Géneros (Catálogo Completo y Variado)
const genresRecommendation = [
  {
    key: 'Acción y Adrenalina 💥',
    names: 'John Wick 4, Rápidos y Furiosos X, Gladiator II, Top Gun: Maverick, Misión Imposible: Sentencia Mortal, Mad Max: Furiosa, The Equalizer 3, Tyler Rake (Extraction), Civil War, Bad Boys: Ride or Die, The Beekeeper, Bourne, 007 James Bond, Die Hard (Duro de Matar), Kill Bill, Matrix'
  },
  {
    key: 'Superhéroes (Marvel/DC) 🦸‍♂️',
    names: 'Deadpool & Wolverine, Avengers: Endgame, Spider-Man: No Way Home, The Batman, Joker: Folie à Deux, Guardians of the Galaxy Vol. 3, Black Panther: Wakanda Forever, Superman (Legacy), Wonder Woman, X-Men 97, Iron Man, Thor: Ragnarok, The Dark Knight Trilogy, Logan, The Boys, Invincible, Justice League Snyder Cut'
  },
  {
    key: 'Terror y Suspenso 👻',
    names: 'Terrifier 3, Longlegs, Smile 2, Five Nights at Freddy\'s, El Conjuro, La Monja 2, Saw X, Talk to Me, Evil Dead Rise, M3GAN, A Quiet Place: Day One, Hereditary, It (Eso), Halloween, Scream VI, El Exorcista, Psicosis, The Shining, Insidious'
  },
  {
    key: 'Infantil y Familia 🎨',
    names: 'Intensamente 2 (Inside Out 2), Mario Bros Movie, Mi Villano Favorito 4, Kung Fu Panda 4, Moana 2, Robot Salvaje, Wonka, Sonic 3, Paw Patrol, Toy Story, Frozen, El Rey León, Shrek, Coco, Encanto, Spider-Man: Across the Spider-Verse, Minions, La Era de Hielo'
  },
  {
    key: 'Ciencia Ficción 🚀',
    names: 'Dune: Parte 2, Avatar: The Way of Water, El Reino del Planeta de los Simios, Godzilla x Kong: The New Empire, The Creator, Rebel Moon, Interstellar, Inception, Blade Runner 2049, Star Wars (Saga Completa), Alien: Romulus, The Matrix, Ready Player One, Volver al Futuro, Arrival'
  },
  {
    key: 'Anime y Animación 🇯🇵',
    names: 'Demon Slayer (Kimetsu no Yaiba), Jujutsu Kaisen, One Piece (Gear 5), Dragon Ball Daima/Super/Z, Attack on Titan (Shingeki no Kyojin), Chainsaw Man, Spy x Family, Blue Lock, Naruto Shippuden, Studio Ghibli (El Niño y la Garza), Suzume, Your Name, Akira, Evangelion, Death Note, Pokémon'
  },
  {
    key: 'Comedia 😂',
    names: 'Barbie, Deadpool, Son como niños, ¿Y dónde están las rubias?, Superbad, ¿Qué pasó ayer? (The Hangover), Mean Girls (Chicas Pesadas), Ted, La Máscara, Ace Ventura, American Pie, Scary Movie, Friends, The Office, Brooklyn 99, Cualquiera menos tú, No Hard Feelings'
  },
  {
    key: 'Sagas Mágicas ✨',
    names: 'Harry Potter (Saga Completa), El Señor de los Anillos, El Hobbit, Animales Fantásticos, Wicked, Los Juegos del Hambre: Balada de Pájaros Cantores, Percy Jackson, Crepúsculo, Piratas del Caribe, Las Crónicas de Narnia, House of the Dragon, Game of Thrones, The Witcher'
  },
  {
    key: 'Series Top Global 🔥',
    names: 'House of the Dragon, Fallout, Shogun, The Last of Us, Stranger Things, Wednesday (Merlina), Squid Game (El Juego del Calamar), The Bear, Bridgerton, Euphoria, Peaky Blinders, Breaking Bad, Better Call Saul, Succession, Dark, Black Mirror, Vikingos, La Casa de Papel'
  },
  {
    key: 'Drama y Premiadas 🏆',
    names: 'Oppenheimer, Los Asesinos de la Luna (Killers of the Flower Moon), La Ballena (The Whale), Joker, Poor Things, Anatomía de una Caída, La Sociedad de la Nieve, Parasite, El Padrino, Titanic, Forrest Gump, Cadena Perpetua (Shawshank Redemption), Pulp Fiction, El Club de la Pelea, Scarface'
  },
  {
    key: 'Romance ❤️',
    names: 'Romper el Círculo (It Ends with Us), Cualquiera menos tú, Vidas Pasadas (Past Lives), Diario de una Pasión (The Notebook), Yo antes de ti, Bajo la misma estrella, La La Land, Titanic, Orgullo y Prejuicio, 500 Days of Summer, About Time, Pretty Woman, 10 Things I Hate About You, Crepúsculo'
  },
  {
    key: 'Clásicos Retro 📼',
    names: 'Volver al Futuro, Jurassic Park, Terminator 2, Rocky, Rambo, Indiana Jones, E.T., Los Cazafantasmas (Ghostbusters), Gremlins, Karate Kid, Top Gun, Robocop, Beetlejuice, El Resplandor, Tiburón (Jaws), Pulp Fiction, Forrest Gump'
  }
];
// --- UTILIDADES LOCALES ---

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// --- FLUJOS AUXILIARES (SECUENCIALES) ---

/**
 * 4. FLUJO DE CIERRE Y DATOS
 */
const flowShipping = addKeyword([EVENTS.ACTION])
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    await flowDynamic([
      { body: '🔒 *Último paso:* Para activar tu garantía y envío, necesito tus datos.', delay: 500 },
      { body: 'Escribe en un solo mensaje:\n\n*Nombre, Ciudad, Dirección y Celular*', delay: 1000 },
      { body: '_Ej: Laura García, Medellín, Cra 70 #32-10, 3101234567_', delay: 1500 }
    ]);
    // Usamos 'checkout_started' que es un estado válido
    await postHandler(ctx.from, 'moviesUsb', 'checkout_started');
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
    const text = ctx.body?.trim() || '';
    if (text.length < 10) return fallBack('❌ La dirección parece incompleta. Por favor inclúyela completa (Ciudad y Dirección).');

    const phone = ctx.from;
    const session = await getUserSession(phone);

    let finalPrice = session.price || 0;
    if (session.addMusicCombo) finalPrice += 79900; // Precio oferta música

    await flowDynamic([{ body: '⏳ Procesando tu pedido...', delay: 500 }]);

    const result = await finalizeOrder({
      phoneNumber: phone,
      capacities: [session.capacity || '64GB'],
      contentTypes: session.addMusicCombo ? ['movies', 'music'] : ['movies'],
      shippingData: text,
      overridePreferences: { movieGenres: session.movieGenres || [], titles: session.requestedTitles || [] },
      forceConfirm: true,
      extras: { musicCombo: !!session.addMusicCombo, finalPrice }
    });

    const capDesc = session.conversationData?.capacityDesc || session.capacity;

    await flowDynamic([
      { body: `✅ *¡PEDIDO CONFIRMADO!* (ID: ${result.orderId})`, delay: 500 },
      ,
      { body: `📦 Pack Cine: *${session.capacity}* (${capDesc})`, delay: 1000 },
      { body: session.addMusicCombo ? `🎧 Extra: Pack Música (+20% OFF)` : '🎥 Solo Películas', delay: 0 },
      { body: `💰 *Total a pagar contraentrega: ${formatPrice(finalPrice)}*`, delay: 1500 },
      { body: 'Un asesor validará tu pedido en breve para despachar hoy mismo. ¡Gracias!', delay: 2000 }
    ]);

    await postHandler(phone, 'moviesUsb', 'completed');
    return gotoFlow(orderProcessing);
  });

/**
 * 3. FLUJO CROSS-SELL (MÚSICA)
 */
const flowCrossSellMusic = addKeyword([EVENTS.ACTION])
  .addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic([
      ,
      { body: '🎵 *¿Aprovechamos el envío?*', delay: 500 },
      { body: 'Añade una **USB de Música** a tu pedido con un **20% de DESCUENTO** extra.', delay: 1000 },
      { body: '👉 Responde *SI* para agregarla o *NO* para finalizar.', delay: 1500 }
    ]);
    // Reutilizamos 'personalization' para no romper tipos
    await postHandler(ctx.from, 'moviesUsb', 'personalization');
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const input = ctx.body.toLowerCase();
    const phone = ctx.from;

    if (['si', 'sí', 'claro', 'agregar', 'quiero'].some(k => input.includes(k))) {
      await updateUserSession(phone, 'SI', 'moviesUsb_musicCombo', null, false, { metadata: { addMusicCombo: true } });
      await flowDynamic([{ body: '🎉 *¡Combo Música agregado!*', delay: 1000 }]);
    } else {
      await flowDynamic([{ body: '👍 Entendido, enviamos solo las Películas.', delay: 1000 }]);
    }
    return gotoFlow(flowShipping);
  });

/**
 * 2. FLUJO UPGRADE (OFERTA FLASH)
 */
const flowUpgrade = addKeyword([EVENTS.ACTION])
  .addAction(async (ctx, { flowDynamic }) => {
    const session = await getUserSession(ctx.from);
    const currentCap = USBCAPACITIES.find(c => c.size === session.capacity);
    const nextCap = USBCAPACITIES.find(c => c.num === String(parseInt(currentCap?.num || '0') + 1));

    if (!nextCap) return;

    await flowDynamic([
      { body: `🛑 *¡ESPERA! Tengo una Oferta Flash:*`, delay: 500 },
      {
        body: `Por poca diferencia, lleva el DOBLE de espacio (*${nextCap.size}*).\nCapacidad para *${nextCap.detail}*.\n\nPrecio Especial: *${formatPrice(nextCap.price)}*`,
        media: MEDIA_ASSETS.promos.upgradeOffer,
        delay: 1000
      },
      ,
      { body: `¿Te cambio al de ${nextCap.size}? (Responde *SÍ* o *NO*)`, delay: 1500 }
    ]);
    // Reutilizamos 'personalization' para evitar errores de tipo Stage
    await postHandler(ctx.from, 'moviesUsb', 'personalization');
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const input = ctx.body.toLowerCase();
    const phone = ctx.from;

    if (['si', 'sí', 'cambiar', 'acepto', 'upgrade', 'mejor'].some(k => input.includes(k))) {
      const session = await getUserSession(phone);
      const currentCapIdx = USBCAPACITIES.findIndex(c => c.size === session.capacity);
      const nextCap = USBCAPACITIES[currentCapIdx + 1];

      if (nextCap) {
        session.capacity = nextCap.size;
        session.price = nextCap.price;
        // Guardamos descripción en conversationData para evitar error de tipos
        session.conversationData = { ...session.conversationData, capacityDesc: nextCap.desc };

        await updateUserSession(phone, 'Upgrade Aceptado', 'moviesUsb_upgrade', null, false, { metadata: { capacity: nextCap.size, price: nextCap.price } });

        await flowDynamic([
          { body: '✅ *¡Upgrade Aplicado!* Excelente decisión.', delay: 1000 },
        ]);
      }
    } else {
      await flowDynamic([{ body: '👌 Perfecto, mantenemos tu elección original.', delay: 1000 }]);
    }

    return gotoFlow(flowCrossSellMusic);
  });

/**
 * 1. FLUJO SELECCIÓN CAPACIDAD
 */
const flowSelectCapacity = addKeyword([EVENTS.ACTION])
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
    const input = ctx.body.trim();
    const phone = ctx.from;
    const session = await getUserSession(phone);

    const selected = USBCAPACITIES.find(u => input === u.num || input.toLowerCase().includes(u.size.toLowerCase()));

    if (!selected) {
      return fallBack('❌ Opción no válida. Por favor escribe *1, 2, 3 o 4*.');
    }

    // Guardar Selección
    session.capacity = selected.size;
    session.price = selected.price;
    // Fix: Usar conversationData para propiedades custom
    session.conversationData = { ...session.conversationData, capacityDesc: selected.desc };

    await updateUserSession(phone, input, 'moviesUsb_capacitySelected', null, false, { metadata: { capacity: selected.size, price: selected.price } });

    const mediaURL = MEDIA_ASSETS.capacities[`gb${selected.size.replace('GB', '')}`];
    const savings = calculateSavings(selected.originalPrice, selected.price);

    await flowDynamic([
      ,
      {
        body: `✅ *Elegiste: ${selected.desc} (${selected.size})*`,
        media: mediaURL,
        delay: 500
      },
      { body: `💰 Precio Oferta: *${formatPrice(selected.price)}* (Ahorras ${savings})`, delay: 1000 },
      { body: `📦 Envío GRATIS + Garantía incluida.`, delay: 1500 }
    ]);

    // Si eligió 64GB o 128GB, intentamos hacer Upsell
    if (['1', '2'].includes(selected.num)) {
      return gotoFlow(flowUpgrade);
    } else {
      return gotoFlow(flowCrossSellMusic);
    }
  });

// --- FLUJO PRINCIPAL (ENTRADA) ---

const moviesUsb = addKeyword(['Hola, me interesa la USB con películas', 'USB de peliculas', 'peliculas usb'])
  .addAction(async (ctx, { flowDynamic }) => {
    const phone = ctx.from;

    const pre = await preHandler(ctx, { flowDynamic, gotoFlow: async () => { } }, 'moviesUsb', ['entry', 'personalization'], {
      lockOnStages: ['checkout_started', 'completed'],
      resumeMessages: { checkout_started: 'Estábamos finalizando. Por favor envíame tus datos de envío.' }
    });
    if (!pre.proceed) return;

    const session = await getUserSession(phone);
    const social = Math.random() > 0.5 ? '🌟 +900 clientes felices' : '⭐ Garantía de Calidad';

    // Mensajes de bienvenida manuales para evitar errores de argumentos en processMessageQueue
    await flowDynamic([
      { body: `🎬 *¡Tu Cine en Casa (Sin Internet)!*`, media: MEDIA_ASSETS.movies.intro, delay: 500 },
      { body: `Las mejores películas y series en Alta Calidad USB. Conecta y disfruta.\n${social}`, delay: 1000 },
      { body: '🍿 *Algunos géneros disponibles:*', delay: 1500 }
    ]);

    // Formatear géneros
    const genreText = genresRecommendation.map(g => `*${g.key}*:\n_${g.names}_`).join('\n\n');
    await flowDynamic([{ body: genreText, delay: 2000 }]);

    await postHandler(phone, 'moviesUsb', 'prices_shown');
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const input = ctx.body || '';
    const phone = ctx.from;
    const session = await getUserSession(phone);

    // Matching de títulos
    const { genres, titles } = matchingEngine.match(input, 'movies', { detectNegations: true });

    if (genres?.length || titles?.length) {
      session.movieGenres = genres || [];
      session.requestedTitles = titles || [];
      await updateUserSession(phone, input, 'moviesUsb_pref', null, false, { metadata: { genres, titles } });

      await flowDynamic([
        { body: '📝 *¡Anotado!* Personalizaremos tu colección con esos gustos.', delay: 500 },
        { body: 'Ahora, elige el tamaño para tu colección:', delay: 1000 }
      ]);
    } else {
      await flowDynamic([{ body: '💾 *Mira las capacidades disponibles:*', delay: 500 }]);
    }

    // Mostrar Tabla de Precios
    await flowDynamic([
      { media: MEDIA_ASSETS.capacities.comparativeTable, delay: 500 },
      ,
      { body: `1️⃣ *64GB* (${USBCAPACITIES[0].detail}) - ${formatPrice(USBCAPACITIES[0].price)}`, delay: 1000 },
      { body: `2️⃣ *128GB* (${USBCAPACITIES[1].detail}) - ${formatPrice(USBCAPACITIES[1].price)} 🔥`, delay: 1200 },
      { body: `3️⃣ *256GB* (${USBCAPACITIES[2].detail}) - ${formatPrice(USBCAPACITIES[2].price)}`, delay: 1400 },
      { body: `4️⃣ *512GB* (${USBCAPACITIES[3].detail}) - ${formatPrice(USBCAPACITIES[3].price)} 👑`, delay: 1600 },
      { body: '👇 *Escribe el número (1, 2, 3 o 4) para elegir tu pack.*', delay: 2000 }
    ]);

    await postHandler(phone, 'moviesUsb', 'awaiting_capacity');
    return gotoFlow(flowSelectCapacity);
  });

export default moviesUsb;