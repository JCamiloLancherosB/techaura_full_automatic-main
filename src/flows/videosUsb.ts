// import { addKeyword } from '@builderbot/bot';
// import capacityVideo from "./capacityVideo";
// import musicUsb from './musicUsb';
// import { updateUserSession } from './userTrackingSystem';
// import { saveUserCustomizationState, UserVideoState } from '../src/userCustomizationDb';
// import path from 'path';
// import { SalesMaximizer } from '../src/sales-maximizer';
// const salesMaximizer = new SalesMaximizer();

// const currentDir = path.resolve();

// const userVideoStates = new Map<string, UserVideoState>();

// // Obtener o crear estado de usuario
// const getUserVideoState = (phoneNumber: string): UserVideoState => {
//     if (!userVideoStates.has(phoneNumber)) {
//         userVideoStates.set(phoneNumber, {
//             phoneNumber,
//             selectedGenres: [],
//             mentionedArtists: [],
//             preferredEras: [],
//             videoQuality: 'HD',
//             customizationStage: 'initial',
//             lastPersonalizationTime: new Date(),
//             personalizationCount: 0,
//             showedPreview: false,
//             usbName: undefined
//         });
//     }
//     return userVideoStates.get(phoneNumber)!;
// };

// // Base de datos de videos musicales por género con URLs de Google Drive
// export const videoTopHits = {
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
// };

// // Artistas por género (expandido para videos)
// const videoArtistsByGenre = {
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
// };

// // Playlists de video con imágenes
// const videoPlaylistImages = {
//     crossover: path.join(__dirname, '../Portada/video_crossover.png'),
//     latino: path.join(__dirname, '../Portada/video_latino.png'),
//     internacional: path.join(__dirname, '../Portada/video_internacional.png'),
//     clasicos: path.join(__dirname, '../Portada/video_clasicos.png'),
//     personalizada: path.join(__dirname, '../Portada/video_personalizada.png')
// };

// const videoPlaylistsData = [
//     {
//         name: "🎬🔥 Video Crossover Total (Reggaeton, Salsa, Vallenato, Rock, Pop, Bachata, Merengue, Baladas, Electrónica y más...)",
//         genres: ["reggaeton", "salsa", "vallenato", "rock", "pop", "bachata", "merengue", "baladas", "electronica", "cumbia"],
//         img: videoPlaylistImages.crossover,
//         description: "La colección más completa de videos musicales en HD y 4K"
//     },
//     {
//         name: "🇨🇴 Videos Colombia Pura Vida",
//         genres: ["vallenato", "cumbia", "champeta", "merengue", "salsa"],
//         img: videoPlaylistImages.latino,
//         description: "Lo mejor del folclor y música colombiana en video"
//     },
//     {
//         name: "🌟 Hits Internacionales",
//         genres: ["rock", "pop", "electronica", "hiphop", "r&b"],
//         img: videoPlaylistImages.internacional,
//         description: "Los videos más virales del mundo entero"
//     },
//     {
//         name: "💎 Clásicos Inmortales",
//         genres: ["rock", "salsa", "baladas", "boleros", "rancheras"],
//         img: videoPlaylistImages.clasicos,
//         description: "Videos legendarios que nunca pasan de moda"
//     },
//     {
//         name: "🎯 Personalizada Premium",
//         genres: [],
//         img: videoPlaylistImages.personalizada,
//         description: "Crea tu colección única de videos musicales"
//     }
// ];

// async function crossSellSuggestion(currentProduct: 'music' | 'video', flowDynamic: any) {
//     if (currentProduct === 'music') {
//         await flowDynamic(
//             '🎬 *¿Te gustaría añadir la USB de VIDEOS MUSICALES a tu pedido?*\n\n' +
//             '👉 *Más de 10,000 videoclips en HD y 4K de todos los géneros.*\n' +
//             '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
//             '¿Quieres ver la colección de videos? Responde con *QUIERO USB DE VIDEOS* o *VER VIDEOS*.'
//         );
//     } else {
//         await flowDynamic(
//             '🎵 *¿Te gustaría añadir la USB de MÚSICA a tu pedido?*\n\n' +
//             '👉 *La mejor selección de géneros, artistas y playlists exclusivas.*\n' +
//             '🎁 *Oferta especial: 25% de descuento y envío gratis si compras ambas.*\n\n' +
//             '¿Quieres ver la colección de música? Responde con *QUIERO USB DE MUSICA* o *VER MUSICA*.'
//         );
//     }
// }

// // Funciones auxiliares
// function normalizeText(text: string) {
//     return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// }

// const validVideoGenres = Object.keys(videoTopHits).map(normalizeText);

// function extractGenresFromMessage(message: string) {
//     const normalizedMessage = normalizeText(message);
//     return validVideoGenres.filter(genre => normalizedMessage.includes(genre));
// }

// function extractArtistsFromMessage(message: string, genres: string[] = []): string[] {
//     const normalizedMessage = normalizeText(message);
//     const foundArtists: string[] = [];
    
//     const genresToSearch = genres.length > 0 ? genres : Object.keys(videoArtistsByGenre);
    
//     genresToSearch.forEach(genre => {
//         if (videoArtistsByGenre[genre]) {
//             videoArtistsByGenre[genre].forEach(artist => {
//                 if (normalizedMessage.includes(normalizeText(artist))) {
//                     foundArtists.push(artist);
//                 }
//             });
//         }
//     });
    
//     return [...new Set(foundArtists)];
// }

// function extractErasFromMessage(message: string): string[] {
//     const eras = ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
//     const decades = ["70", "80", "90", "2000", "2010", "2020"];
//     const normalizedMessage = normalizeText(message);
    
//     const foundEras: string[] = [];
    
//     eras.forEach((era, index) => {
//         if (normalizedMessage.includes(era.toLowerCase()) || 
//             normalizedMessage.includes(decades[index]) ||
//             normalizedMessage.includes(`años ${decades[index].slice(0,2)}`)) {
//             foundEras.push(era);
//         }
//     });
    
//     return foundEras;
// }

// async function getValidVideoPath(url: string) {
//     try {
//         // Para videos de Google Drive, simplemente verificamos que la URL sea válida
//         if (url.includes('drive.usercontent.google.com')) {
//             return {
//                 valid: true,
//                 path: url
//             };
//         }
//         return { valid: false };
//     } catch (error) {
//         console.error(`Error con el video ${url}:`, error);
//         return { valid: false };
//     }
// }

// async function getRandomVideosByGenres(selectedGenres: string[], count = 3) {
//     const videos = [];
//     const usedVideos = new Set();
//     let attempts = 0;
//     const maxAttempts = selectedGenres.length * count * 2;

//     while (videos.length < count && attempts < maxAttempts) {
//         for (const genre of selectedGenres) {
//             const genreVideos = videoTopHits[genre] || [];
//             if (genreVideos.length > 0) {
//                 const randomVideo = genreVideos[Math.floor(Math.random() * genreVideos.length)];
//                 if (!usedVideos.has(randomVideo.name)) {
//                     const videoCheck = await getValidVideoPath(randomVideo.file);
//                     if (videoCheck.valid) {
//                         videos.push({
//                             name: randomVideo.name,
//                             filePath: videoCheck.path,
//                             era: randomVideo.era,
//                             quality: randomVideo.quality
//                         });
//                         usedVideos.add(randomVideo.name);
//                     }
//                 }
//             }
//             if (videos.length >= count) break;
//         }
//         attempts++;
//     }
//     return videos;
// }

// // Mensajes de conversión específicos para videos
// const videoConversionTips = [
//     "🎬 *¡Videos en HD y 4K disponibles! Calidad cinematográfica garantizada.*",
//     "📱 *Compatible con TV, celular, tablet y computador.*",
//     "🎁 *OFERTA HOY: 25% de descuento en tu segunda USB de videos.*",
//     "🚚 *Envío gratis + garantía de por vida en todos nuestros videos.*",
//     "🔥 *Más de 10,000 videos musicales disponibles en nuestra colección.*"
// ];

// // Respuestas personalizadas para videos
// function generateVideoPersonalizedResponse(userState: UserVideoState, newGenres: string[], newArtists: string[], newEras: string[]): string[] {
//     const responses = [];
    
//     const enthusiasticOpeners = [
//         "🎬 ¡Excelente elección para tu colección de videos!",
//         "🎥 ¡Me encanta tu selección de videos musicales!",
//         "🔥 ¡Qué buena combinación de videos!",
//         "🎵 ¡Tienes un gusto increíble para videos!",
//         "🌟 ¡Perfecta selección de videoclips!",
//         "🎶 ¡Wow, qué variedad tan genial de videos!"
//     ];
    
//     responses.push(enthusiasticOpeners[Math.floor(Math.random() * enthusiasticOpeners.length)]);
    
//     // Reconocer géneros específicos
//     if (newGenres.length > 0) {
//         if (newGenres.length === 1) {
//             responses.push(`Perfecto, videos de *${newGenres[0]}* en alta calidad 🎬`);
//         } else {
//             responses.push(`Excelente, videos de *${newGenres.slice(0, -1).join(', ')} y ${newGenres[newGenres.length - 1]}* 🎥`);
//         }
//     }
    
//     // Reconocer artistas específicos
//     if (newArtists.length > 0) {
//         if (newArtists.length === 1) {
//             responses.push(`¡Y veo que mencionaste a *${newArtists[0]}*! Tenemos sus mejores videos 🌟`);
//         } else {
//             responses.push(`¡Y mencionaste grandes artistas como *${newArtists.slice(0, -1).join(', ')} y ${newArtists[newArtists.length - 1]}*! 🌟`);
//         }
//     }
    
//     // Reconocer épocas específicas
//     if (newEras.length > 0) {
//         responses.push(`📅 Incluyendo videos de los *${newEras.join(', ')}* - ¡Qué nostalgia!`);
//     }
    
//     // Mostrar resumen actual
//     const allGenres = [...new Set([...userState.selectedGenres, ...newGenres])];
//     const allArtists = [...new Set([...userState.mentionedArtists, ...newArtists])];
//     const allEras = [...new Set([...userState.preferredEras, ...newEras])];
    
//     if (allGenres.length > 0 || allArtists.length > 0 || allEras.length > 0) {
//         responses.push("\n📋 *Tu colección personalizada de videos incluye:*");
        
//         if (allGenres.length > 0) {
//             responses.push(`🎵 Géneros: ${allGenres.join(', ')}`);
//         }
        
//         if (allArtists.length > 0) {
//             responses.push(`🌟 Artistas: ${allArtists.join(', ')}`);
//         }
        
//         if (allEras.length > 0) {
//             responses.push(`📅 Épocas: ${allEras.join(', ')}`);
//         }
//     }
    
//     return responses;
// }

// function generateVideoContinuationOptions(userState: UserVideoState): string[] {
//     const options = [];
    
//     if (userState.personalizationCount === 1) {
//         options.push("🔄 *¿Quieres agregar más géneros, artistas o épocas específicas?*");
//         options.push("✅ O escribe *OK* si estás satisfecho con tu selección de videos");
//     } else if (userState.personalizationCount >= 2) {
//         options.push("🎯 *¿Tu colección de videos está completa o quieres agregar algo más?*");
//         options.push("✅ Escribe *OK* para continuar al siguiente paso");
//         options.push("🎬 O menciona más géneros/artistas/épocas para seguir personalizando");
//     } else {
//         options.push("🔄 *¿Quieres personalizar tu USB de videos?*");
//         options.push("✅ Escribe *OK* para continuar");
//         options.push("🎥 O menciona tus géneros/artistas/épocas favoritas");
//     }
    
//     // Sugerencias inteligentes basadas en lo ya seleccionado
//     if (userState.selectedGenres.includes('reggaeton') && !userState.selectedGenres.includes('bachata')) {
//         options.push("💡 *Sugerencia:* La bachata combina perfecto con reggaeton");
//     }
    
//     if (userState.selectedGenres.includes('rock') && !userState.preferredEras.includes('1980s')) {
//         options.push("💡 *Sugerencia:* Los videos de rock de los 80s son épicos");
//     }
    
//     if (userState.selectedGenres.includes('salsa') && !userState.selectedGenres.includes('merengue')) {
//         options.push("💡 *Sugerencia:* Videos de merengue complementan perfecto la salsa");
//     }
    
//     return options;
// }

// function isContinueKeyword(text: string): boolean {
//     const continueWords = ['ok', 'continuar', 'siguiente', 'precio', 'valor', 'cuesta', 'costo', 'perfecto', 'genial', 'listo', 'dale', 'vamos'];
//     return continueWords.some(word => text.toLowerCase().includes(word));
// }

// function detectUserSatisfaction(message: string): boolean {
//     const satisfactionKeywords = [
//         'perfecto', 'genial', 'excelente', 'me gusta', 'está bien', 'suficiente',
//         'listo', 'ya está', 'así está bien', 'me parece bien', 'ok', 'dale'
//     ];
    
//     const normalizedMessage = normalizeText(message);
//     return satisfactionKeywords.some(keyword => normalizedMessage.includes(keyword));
// }

// // FLUJO PRINCIPAL DE VIDEOS MUSICALES
// const videoUsb = addKeyword(['Hola, me interesa la USB con vídeos.'])
//     .addAnswer(
//         [
//             '🎬 *¡Bienvenido! USB de videos musicales en HD y 4K exclusiva para ti.*',
//             '👉 Compatible con TV, celular, tablet y computador.',
//             '🔥 Nuestra colección más popular: *Video Crossover Total* (Reggaeton, Salsa, Vallenato, Rock, Pop, Bachata, Merengue, Baladas, Electrónica y más).',
//             '',
//             '¿Quieres esta colección o prefieres personalizar tus géneros/artistas? Escribe *OK* para la colección popular o dime tus preferencias.'
//         ].join('\n'),
//         { capture: true, delay: 1200 },
//         async (ctx, { gotoFlow, flowDynamic }) => {
//             const input = ctx.body.trim().toLowerCase();
//             if (input === 'ok') {
//                 await flowDynamic('✅ ¡Perfecto! Te va a encantar nuestra colección crossover de videos.');
//             } else {
//                 await flowDynamic('¡Genial! Anoté tus preferencias para personalizar tu USB.');
//             }
//         }
//     )
//     .addAnswer(
//         [
//             'Ahora elige la capacidad de tu USB de videos:',
//             '1️⃣ 32GB - Hasta 1,000 videos',
//             '2️⃣ 64GB - Hasta 2,000 videos',
//             '3️⃣ 128GB - Hasta 5,000 videos',
//             '',
//             'Responde con el número de la opción que prefieras.'
//         ].join('\n'),
//         { capture: true, delay: 1000 },
//         async (ctx, { flowDynamic }) => {
//             // Aquí puedes guardar la capacidad elegida en la sesión del usuario
//             await flowDynamic('¡Excelente elección! 😃');
//         }
//     )
//     .addAnswer(
//         [
//             '🎉 *Oferta especial solo por hoy:*',
//             '¿Te gustaría añadir la USB de *MÚSICA* a tu pedido con *25% de descuento* y *envío gratis*?',
//             '',
//             '👉 Responde con *VER MÚSICA* para ver la colección o *NO* para continuar solo con videos.'
//         ].join('\n'),
//         { capture: true, delay: 1200 },
//         async (ctx, { gotoFlow, flowDynamic }) => {
//             const input = ctx.body.trim().toLowerCase();
//             if (input.includes('ver musica') || input.includes('quiero usb de musica')) {
//                 return gotoFlow(musicUsb);
//             }
//             // Si responde "no", continuar con el cierre de pedido
//             await flowDynamic('¡Perfecto! Continuemos con los datos para tu pedido.');
//         }
//     )
// .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
//     try {
//         const userInput = ctx.body.trim();
//         updateUserSession(ctx.from, userInput, 'videoUsb_response');

//         if (/quiero usb de musica|quiero usb de música|ver musica|ver música/i.test(userInput)) {
//             return gotoFlow(musicUsb); // Asegúrate de importar musicUsb arriba
//         }

//         // Obtener estado del usuario
//         const userState = getUserVideoState(ctx.from);

//         console.log(`🔍 Usuario ${ctx.from} escribió: "${userInput}"`);
//         console.log(`📊 Estado actual: stage=${userState.customizationStage}, personalizaciones=${userState.personalizationCount}`);

//         // Paso: Recibir nombre personalizado (debe ir antes para que funcione correctamente)
//         if (userState.customizationStage === 'naming' && !userState.usbName) {
//             if (/^(no|omitir)$/i.test(userInput)) {
//                 userState.usbName = undefined;
//             } else {
//                 userState.usbName = userInput.substring(0, 24); // Limita a 24 caracteres
//             }
//             await saveUserCustomizationState(userState);
//             await flowDynamic(
//                 userState.usbName
//                     ? `✅ ¡Listo! Tu USB llevará el nombre: *${userState.usbName}*`
//                     : 'Sin nombre personalizado.'
//             );
//             // Continua al flujo de capacidad de USB
//             await crossSellSuggestion('video', flowDynamic);
//             return gotoFlow(capacityVideo);
//         }

//         // Verificar si quiere continuar
//         if (isContinueKeyword(userInput)) {
//             if (userState.customizationStage === 'initial' && userState.personalizationCount === 0) {
//                 console.log(`✅ Usuario ${ctx.from} acepta colección por defecto - redirigiendo a capacityVideo`);
//                 await flowDynamic([
//                     '✅ *¡Perfecto! Te va a encantar nuestra colección crossover de videos.*',
//                     '📱 Ahora vamos a elegir la capacidad de tu USB de videos.'
//                 ]);
//                 // await crossSellSuggestion('video', flowDynamic);
//                 return gotoFlow(capacityVideo);
//             } else if (userState.personalizationCount > 0) {
//                 userState.customizationStage = 'ready_to_continue';
//                 // Preguntar por el nombre personalizado si aún no se ha definido
//                 if (!userState.usbName) {
//                     await flowDynamic(
//                         '✨ *¿Quieres un nombre personalizado para tu USB?*\n' +
//                         'Escríbelo a continuación (ejemplo: "USB de Juan", "Mi Música Favorita"), o escribe *NO* para omitir.'
//                     );
//                     userState.customizationStage = 'naming';
//                     await saveUserCustomizationState(userState);
//                     return;
//                 }
//                 // Si ya hay nombre, mostrar resumen y continuar
//                 const finalSummary = [];
//                 if (userState.selectedGenres.length > 0) {
//                     finalSummary.push(`🎵 Géneros: ${userState.selectedGenres.join(', ')}`);
//                 }
//                 if (userState.mentionedArtists.length > 0) {
//                     finalSummary.push(`🌟 Artistas: ${userState.mentionedArtists.join(', ')}`);
//                 }
//                 if (userState.preferredEras.length > 0) {
//                     finalSummary.push(`📅 Épocas: ${userState.preferredEras.join(', ')}`);
//                 }
//                 if (userState.usbName) {
//                     finalSummary.push(`🔖 Nombre personalizado: ${userState.usbName}`);
//                 }
//                 await flowDynamic([
//                     '🎯 *¡Excelente! Tu USB personalizada de videos incluirá:*',
//                     ...finalSummary,
//                     '',
//                     '✅ *Ahora vamos a elegir la capacidad de tu USB de videos.*'
//                 ]);
//                 // await crossSellSuggestion('video', flowDynamic);
//                 return gotoFlow(capacityVideo);
//             }
//         }

//         // Detectar géneros, artistas y épocas en el mensaje
//         const userGenres = extractGenresFromMessage(userInput);
//         const userArtists = extractArtistsFromMessage(userInput, userGenres);
//         const userEras = extractErasFromMessage(userInput);
        
//         // Verificar si está personalizando
//         if (userGenres.length > 0 || userArtists.length > 0 || userEras.length > 0) {
//             console.log(`🎥 Usuario ${ctx.from} personalizando videos - Géneros: ${userGenres.join(', ')}, Artistas: ${userArtists.join(', ')}, Épocas: ${userEras.join(', ')}`);
            
//             // Actualizar estado del usuario
//             userState.selectedGenres = [...new Set([...userState.selectedGenres, ...userGenres])];
//             userState.mentionedArtists = [...new Set([...userState.mentionedArtists, ...userArtists])];
//             userState.preferredEras = [...new Set([...userState.preferredEras, ...userEras])];
//             userState.customizationStage = 'personalizing';
//             userState.personalizationCount++;
//             userState.lastPersonalizationTime = new Date();
            
            
//             // Generar respuesta personalizada
//             const personalizedResponse = generateVideoPersonalizedResponse(userState, userGenres, userArtists, userEras);
            
//             // Enviar respuesta de reconocimiento
//             // for (const response of personalizedResponse) {
//             //     await flowDynamic(response);
//             // }
//             await flowDynamic(personalizedResponse.join('\n'));
            
//             // Obtener demos de videos de los géneros seleccionados
//             const allSelectedGenres = userState.selectedGenres;
//             if (allSelectedGenres.length > 0) {
//                 const variedHits = await getRandomVideosByGenres(allSelectedGenres, 3);
                
//                 if (variedHits.length > 0) {
//                     await flowDynamic([
//                         { body: '🎬 *Aquí tienes una muestra de tu colección personalizada de videos:*' },
//                         ...variedHits.map(hit => ({
//                         body: `🎥 *${hit.name}* (${hit.quality} - ${hit.era})`,
//                         media: hit.filePath
//                         }))
//                     ]);
//                 }
//             }
            
            
//             // Generar opciones de continuación inteligentes
//             const continuationOptions = generateVideoContinuationOptions(userState);
//             await flowDynamic(continuationOptions.join('\n'));
            
//         } else if (detectUserSatisfaction(userInput)) {
//             // Usuario está satisfecho pero no dijo OK explícitamente
//             console.log(`😊 Usuario ${ctx.from} parece satisfecho con su selección de videos`);
//             userState.customizationStage = 'satisfied';
            
//             await flowDynamic(
//                 '😊 *¡Me alegra que estés satisfecho con tu colección de videos!*\n\n✅ Escribe *OK* para continuar al siguiente paso, o agrega más géneros/artistas/épocas si quieres personalizar aún más.'
//             );
            
//         } else {
//             // No reconoce géneros, artistas, ni palabras de continuación
//             await flowDynamic(
//                 '🤔 No reconocí géneros, artistas o épocas específicas en tu mensaje.\n\n' +
//                 '🎵 *Géneros disponibles:* reggaeton, salsa, vallenato, rock, bachata, merengue, baladas, cumbia, electronica, pop, y más...\n' +
//                 '🌟 *Artistas populares:* Bad Bunny, Queen, Marc Anthony, Carlos Vives, Romeo Santos, etc.\n' +
//                 '📅 *Épocas:* 70s, 80s, 90s, 2000s, 2010s, 2020s\n\n' +
//                 '✅ Escribe *OK* para continuar con la colección crossover o dime tus géneros/artistas/épocas favoritas.'
//             );
//         }
//     } catch (error) {
//         console.error('Error en el manejo de respuesta del usuario para videos:', error);
//         await flowDynamic('⚠️ Ocurrió un error al procesar tu respuesta. Por favor intenta nuevamente (puedes escribir *OK* para continuar).');
//     }
// });

// export default videoUsb;


// import { addKeyword } from '@builderbot/bot';
// import capacityVideo from "./capacityVideo";
// import musicUsb from './musicUsb';
// import { updateUserSession } from './userTrackingSystem';
// import { saveUserCustomizationState, UserVideoState } from '../userCustomizationDb';
// import path from 'path';
// import { SalesMaximizer } from '../sales-maximizer';
// import { promises as fs } from 'fs';

// // ====== CONSTANTES Y CONFIGURACIONES ======
// const salesMaximizer = new SalesMaximizer();
// const DEMO_VIDEO_COUNT = 3;
// const MAX_PERSONALIZATION_ATTEMPTS = 5;

// // ====== INTERFACES Y TIPOS ======
// interface VideoDemo {
//     name: string;
//     file: string;
//     era?: string;
//     quality?: string;
//     filePath?: string;
// }

// interface GenreVideoData {
//     [genre: string]: VideoDemo[];
// }

// interface PlaylistVideoData {
//     name: string;
//     genres: string[];
//     img: string | null;
//     description: string;
// }

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
//     static normalizeText(text: string): string {
//         return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
//     }

//     static dedupeArray<T>(arr: T[]): T[] {
//         return [...new Set(arr)];
//     }

//     static async getValidVideoPath(filePath: string) {
//         try {
//             const absolutePath = path.isAbsolute(filePath) 
//                 ? filePath 
//                 : path.resolve(__dirname, filePath);
//             await fs.access(absolutePath);
//             return { valid: true, path: absolutePath };
//         } catch {
//             return { valid: false };
//         }
//     }
// }

// // ====== GESTIÓN DE ESTADOS ======
// class VideoStateManager {
//     private static userStates = new Map<string, UserVideoState>();

//     static get(phoneNumber: string): UserVideoState {
//         if (!this.userStates.has(phoneNumber)) {
//             this.userStates.set(phoneNumber, {
//                 phoneNumber,
//                 selectedGenres: [],
//                 mentionedArtists: [],
//                 preferredEras: [],
//                 videoQuality: 'HD',
//                 customizationStage: 'initial',
//                 lastPersonalizationTime: new Date(),
//                 personalizationCount: 0,
//                 showedPreview: false,
//                 usbName: undefined
//             });
//         }
//         return this.userStates.get(phoneNumber)!;
//     }

//     static async save(userState: UserVideoState) {
//         this.userStates.set(userState.phoneNumber, userState);
//         await saveUserCustomizationState(userState);
//     }
// }

// // ====== GENERADORES DE CONTENIDO ======
// class VideoContentGenerator {
//     static enthusiasticResponses = [
//         "🎬 ¡Excelente elección para tu colección de videos!",
//         "🎥 ¡Me encanta tu selección de videos musicales!",
//         "🔥 ¡Qué buena combinación de videos!",
//         "🎵 ¡Tienes un gusto increíble para videos!"
//     ];

//     static generatePersonalizedResponse(
//         userState: UserVideoState, 
//         newGenres: string[], 
//         newArtists: string[], 
//         newEras: string[]
//     ): string[] {
//         const responses = [
//             this.enthusiasticResponses[Math.floor(Math.random() * this.enthusiasticResponses.length)]
//         ];

//         if (newGenres.length > 0) {
//             responses.push(newGenres.length === 1
//                 ? `Perfecto, videos de *${newGenres[0]}* en alta calidad 🎬`
//                 : `Excelente, videos de *${newGenres.slice(0, -1).join(', ')} y ${newGenres.slice(-1)}* 🎥`);
//         }

//         if (newArtists.length > 0) {
//             responses.push(newArtists.length === 1
//                 ? `¡Tenemos los mejores videos de *${newArtists[0]}*! 🌟`
//                 : `¡Videos de *${newArtists.slice(0, -1).join(', ')} y ${newArtists.slice(-1)}* disponibles! 🌟`);
//         }

//         if (newEras.length > 0) {
//             responses.push(`📅 Incluyendo videos de los *${newEras.join(', ')}* - ¡Qué nostalgia!`);
//         }

//         const allGenres = VideoUtils.dedupeArray([...userState.selectedGenres, ...newGenres]);
//         const allArtists = VideoUtils.dedupeArray([...userState.mentionedArtists, ...newArtists]);
//         const allEras = VideoUtils.dedupeArray([...userState.preferredEras, ...newEras]);

//         if (allGenres.length > 0 || allArtists.length > 0 || allEras.length > 0) {
//             responses.push("\n📋 *Tu colección personalizada de videos incluye:*");
//             if (allGenres.length > 0) responses.push(`🎵 Géneros: ${allGenres.join(', ')}`);
//             if (allArtists.length > 0) responses.push(`🌟 Artistas: ${allArtists.join(', ')}`);
//             if (allEras.length > 0) responses.push(`📅 Épocas: ${allEras.join(', ')}`);
//         }

//         return responses;
//     }

//     static generateContinuationOptions(userState: UserVideoState): string[] {
//         const options = [];
        
//         if (userState.personalizationCount === 1) {
//             options.push("🔄 ¿Quieres agregar más géneros, artistas o épocas?");
//             options.push("✅ Escribe *OK* si estás satisfecho");
//         } else if (userState.personalizationCount >= 2) {
//             options.push("🎯 ¿Tu colección está completa?");
//             options.push("✅ Escribe *OK* para continuar");
//             options.push("🎬 O menciona más géneros/artistas/épocas");
//         } else {
//             options.push("🔄 ¿Quieres personalizar tu USB de videos?");
//             options.push("✅ Escribe *OK* para continuar");
//             options.push("🎥 O menciona tus preferencias");
//         }

//         // Sugerencias inteligentes
//         if (userState.selectedGenres.includes('reggaeton') && !userState.selectedGenres.includes('bachata')) {
//             options.push("💡 La bachata combina perfecto con reggaeton");
//         }

//         return options;
//     }
// }

// // ====== DETECTORES DE INTENCIÓN ======
// class VideoIntentDetector {
//     static isContinueKeyword(input: string): boolean {
//         const norm = VideoUtils.normalizeText(input);
//         return ['ok', 'si', 'continuar', 'listo', 'precio'].includes(norm);
//     }

//     static isPersonalizationIntent(input: string): boolean {
//         const norm = VideoUtils.normalizeText(input);
//         return ['quiero', 'me gusta', 'prefiero', 'agregar'].some(k => norm.includes(k));
//     }

//     static extractGenres(message: string): string[] {
//         const normalized = VideoUtils.normalizeText(message);
//         return Object.keys(videoData.topHits)
//             .filter(genre => normalized.includes(genre));
//     }

//     static extractArtists(message: string, genres: string[] = []): string[] {
//         const normalized = VideoUtils.normalizeText(message);
//         const genresToSearch = genres.length > 0 ? genres : Object.keys(videoData.artistsByGenre);
//         const found: string[] = [];
        
//         genresToSearch.forEach(genre => {
//             videoData.artistsByGenre[genre]?.forEach(artist => {
//                 if (normalized.includes(VideoUtils.normalizeText(artist))) {
//                     found.push(artist);
//                 }
//             });
//         });
        
//         return VideoUtils.dedupeArray(found);
//     }

//     static extractEras(message: string): string[] {
//         const eras = ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
//         const normalized = VideoUtils.normalizeText(message);
//         return eras.filter(era => normalized.includes(era.toLowerCase()));
//     }
// }

// // ====== MANEJADOR DE DEMOS ======
// class VideoDemoManager {
//     static async getRandomVideosByGenres(genres: string[], count = 3): Promise<VideoDemo[]> {
//         const videos: VideoDemo[] = [];
//         const used = new Set();
//         let attempts = 0;

//         while (videos.length < count && attempts < MAX_PERSONALIZATION_ATTEMPTS) {
//             for (const genre of genres) {
//                 const genreVideos = videoData.topHits[genre] || [];
//                 if (genreVideos.length > 0) {
//                     const randVideo = genreVideos[Math.floor(Math.random() * genreVideos.length)];
//                     if (!used.has(randVideo.name)) {
//                         const fileCheck = await VideoUtils.getValidVideoPath(randVideo.file);
//                         if (fileCheck.valid) {
//                             videos.push({ ...randVideo, filePath: fileCheck.path });
//                             used.add(randVideo.name);
//                         }
//                     }
//                 }
//                 if (videos.length >= count) break;
//             }
//             attempts++;
//         }
//         return videos;
//     }
// }

// // ====== FLUJO PRINCIPAL ======
// const videoUsb = addKeyword(['Hola, me interesa la USB con vídeos.'])
// .addAction(async (ctx, { flowDynamic }) => {
//     try {
//         const userState = VideoStateManager.get(ctx.from);
        
//         // Mostrar mensaje de bienvenida
//         await flowDynamic([
//             `🎬 *¡USB de videos musicales en HD y 4K!*`,
//             videoData.conversionTips[0],
//             videoData.conversionTips[1]
//         ]);

//         // Mostrar playlist destacada
//         const featuredPlaylist = videoData.playlists[0];
//         const playlistImage = await VideoUtils.getValidVideoPath(
//             videoData.playlistImages[featuredPlaylist.img]
//         );

//         if (playlistImage.valid) {
//             await flowDynamic([{
//                 body: featuredPlaylist.name,
//                 media: playlistImage.path
//             }]);
//         }

//         // Mostrar demos de videos
//         const demos = await VideoDemoManager.getRandomVideosByGenres(featuredPlaylist.genres, DEMO_VIDEO_COUNT);
//         if (demos.length > 0) {
//             await flowDynamic(
//                 demos.map(demo => ({
//                     body: `🎥 *${demo.name}*`,
//                     media: demo.filePath
//                 }))
//             );
//         }

//         // Opciones para el usuario
//         await flowDynamic([
//             "🎯 *¿Personalizamos tu USB de videos?*",
//             "✅ Escribe *OK* para continuar con esta playlist",
//             "🎥 O dime tus géneros/artistas/épocas favoritos",
//             videoData.conversionTips[2]
//         ]);

//     } catch (error) {
//         console.error('Error en el flujo principal:', error);
//         await flowDynamic('⚠️ Ocurrió un error. Por favor intenta nuevamente.');
//     }
// })
// .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
//     try {
//         const userInput = ctx.body.trim();
//         const userState = VideoStateManager.get(ctx.from);

//         // Cross-sell
//         if (/quiero usb de musica|ver musica/i.test(userInput)) {
//             return gotoFlow(musicUsb);
//         }

//         // Manejo de nombre personalizado
//         if (userState.customizationStage === 'naming') {
//             if (/^(no|omitir)$/i.test(userInput)) {
//                 userState.usbName = undefined;
//             } else {
//                 userState.usbName = userInput.substring(0, 24);
//             }
//             await VideoStateManager.save(userState);
            
//             await flowDynamic(
//                 userState.usbName 
//                     ? `✅ ¡Listo! Tu USB llevará el nombre: *${userState.usbName}*`
//                     : 'Sin nombre personalizado.'
//             );
//             return gotoFlow(capacityVideo);
//         }

//         // Extraer preferencias
//         const userGenres = VideoIntentDetector.extractGenres(userInput);
//         const userArtists = VideoIntentDetector.extractArtists(userInput, userGenres);
//         const userEras = VideoIntentDetector.extractEras(userInput);

//         // Personalización
//         if (userGenres.length > 0 || userArtists.length > 0 || userEras.length > 0) {
//             userState.selectedGenres = VideoUtils.dedupeArray([...userState.selectedGenres, ...userGenres]);
//             userState.mentionedArtists = VideoUtils.dedupeArray([...userState.mentionedArtists, ...userArtists]);
//             userState.preferredEras = VideoUtils.dedupeArray([...userState.preferredEras, ...userEras]);
//             userState.customizationStage = 'personalizing';
//             userState.personalizationCount++;
//             userState.lastPersonalizationTime = new Date();
//             await VideoStateManager.save(userState);

//             // Respuesta personalizada
//             const response = VideoContentGenerator.generatePersonalizedResponse(
//                 userState, userGenres, userArtists, userEras
//             );
//             await flowDynamic(response.join('\n'));

//             // Mostrar demos
//             const demos = await VideoDemoManager.getRandomVideosByGenres(userState.selectedGenres, DEMO_VIDEO_COUNT);
//             if (demos.length > 0) {
//                 await flowDynamic(
//                     demos.map(demo => ({
//                         body: `🎥 *${demo.name}*`,
//                         media: demo.filePath
//                     }))
//                 );
//             }

//             // Opciones de continuación
//             await flowDynamic(
//                 VideoContentGenerator.generateContinuationOptions(userState).join('\n')
//             );
//             return;
//         }

//         // Continuar al siguiente paso
//         if (VideoIntentDetector.isContinueKeyword(userInput)) {
//             if (!userState.usbName && userState.personalizationCount > 0) {
//                 await flowDynamic([
//                     '✨ *¿Quieres un nombre personalizado para tu USB?*',
//                     'Escríbelo a continuación (ejemplo: "USB de Juan")',
//                     'O escribe *NO* para omitir.'
//                 ]);
//                 userState.customizationStage = 'naming';
//                 await VideoStateManager.save(userState);
//                 return;
//             }
//             return gotoFlow(capacityVideo);
//         }

//         // Respuesta no reconocida
//         await flowDynamic([
//             '🤔 No reconocí géneros, artistas o épocas específicas',
//             '💡 Puedes:',
//             '• Mencionar géneros como "reggaeton", "salsa"',
//             '• Nombrar artistas como "Bad Bunny", "Marc Anthony"',
//             '• O escribir *OK* para continuar'
//         ]);

//     } catch (error) {
//         console.error('Error en la interacción:', error);
//         await flowDynamic('⚠️ Ocurrió un error. Por favor intenta nuevamente.');
//     }
// });

// export default videoUsb;


import { addKeyword } from '@builderbot/bot';
import capacityVideo from "./capacityVideo";
import musicUsb from './musicUsb';
import { updateUserSession } from './userTrackingSystem';
import { saveUserCustomizationState, UserVideoState } from '../userCustomizationDb';
import path from 'path';
import { SalesMaximizer } from '../sales-maximizer';
import { promises as fs } from 'fs';

// ====== CONSTANTES Y CONFIGURACIONES ======
const DEMO_VIDEO_COUNT = 2;
const MAX_ATTEMPTS = 6;

// ====== DATOS DE VIDEOS ======
export const videoData = {
    topHits: {
  "bachata": [
    {
      "name": "Romeo Santos - Propuesta Indecente",
      "file": "..\\demos_videos_recortados\\Bachata\\Romeo Santos - Propuesta Indecente_demo.mp4"
    },
    {
      "name": "Aventura - Obsesión",
      "file": "..\\demos_videos_recortados\\Bachata\\Aventura - Obsesión_demo.mp4"
    },
    {
      "name": "Juan Luis Guerra - Burbujas de Amor",
      "file": "..\\demos_videos_recortados\\Bachata\\Juan Luis Guerra - Burbujas de Amor_demo.mp4"
    }
  ],
  "reggaeton": [
    {
      "name": "Daddy Yankee - Gasolina",
      "file": "..\\demos_videos_recortados\\Reggaeton\\Daddy Yankee - Gasolina_demo.mp4"
    },
    {
      "name": "FloyyMenor - Gata Only",
      "file": "..\\demos_videos_recortados\\Reggaeton\\FloyyMenor - Gata Only_demo.mp4"
    },
    {
      "name": "Bad Bunny - Tití Me Preguntó",
      "file": "..\\demos_videos_recortados\\Reggaeton\\Bad Bunny - Tití Me Preguntó_demo.mp4"
    }
  ],
  "salsa": [
    {
      "name": "Marc Anthony - Vivir Mi Vida",
      "file": "..\\demos_videos_recortados\\Salsa\\Marc Anthony - Vivir Mi Vida_demo.mp4"
    },
    {
      "name": "Joe Arroyo - La Rebelión",
      "file": "..\\demos_videos_recortados\\Salsa\\Joe Arroyo - La Rebelión_demo.mp4"
    },
    {
      "name": "Willie Colón - Pedro Navaja",
      "file": "..\\demos_videos_recortados\\Salsa\\Willie Colón - Pedro Navaja_demo.mp4"
    }
  ],
  "vallenato": [
    {
      "name": "Carlos Vives - La Tierra del Olvido",
      "file": "..\\demos_videos_recortados\\Vallenato\\Carlos Vives - La Tierra del Olvido_demo.mp4"
    },
    {
      "name": "Silvestre Dangond - Materialista",
      "file": "..\\demos_videos_recortados\\Vallenato\\Silvestre Dangond - Materialista_demo.mp4"
    },
    {
      "name": "Los Diablitos - A Besitos",
      "file": "..\\demos_videos_recortados\\Vallenato\\Los Diablitos - A Besitos_demo.mp4"
    }
  ],
  "rock": [
    {
      "name": "Queen - Bohemian Rhapsody",
      "file": "..\\demos_videos_recortados\\Rock\\Queen - Bohemian Rhapsody_demo.mp4"
    },
    {
      "name": "Guns N' Roses - Sweet Child O' Mine",
      "file": "..\\demos_videos_recortados\\Rock\\Guns N' Roses - Sweet Child O' Mine_demo.mp4"
    },
    {
      "name": "Led Zeppelin - Stairway to Heaven",
      "file": "..\\demos_videos_recortados\\Rock\\Led Zeppelin - Stairway to Heaven_demo.mp4"
    }
  ],
  "merengue": [
    {
      "name": "Juan Luis Guerra - El Niágara en Bicicleta",
      "file": "..\\demos_videos_recortados\\Merengue\\Juan Luis Guerra - El Niágara en Bicicleta_demo.mp4"
    },
    {
      "name": "Elvis Crespo - Suavemente",
      "file": "..\\demos_videos_recortados\\Merengue\\Elvis Crespo - Suavemente_demo.mp4"
    },
    {
      "name": "Wilfrido Vargas - El Jardinero",
      "file": "..\\demos_videos_recortados\\Merengue\\Wilfrido Vargas - El Jardinero_demo.mp4"
    }
  ],
  "baladas": [
    {
      "name": "Ricardo Arjona - Historia de Taxi",
      "file": "..\\demos_videos_recortados\\Baladas\\Ricardo Arjona - Historia de Taxi_demo.mp4"
    },
    {
      "name": "Maná - Rayando el Sol",
      "file": "..\\demos_videos_recortados\\Baladas\\Maná - Rayando el Sol_demo.mp4"
    },
    {
      "name": "Jesse & Joy - Espacio Sideral",
      "file": "..\\demos_videos_recortados\\Baladas\\Jesse & Joy - Espacio Sideral_demo.mp4"
    }
  ],
  "electronica": [
    {
      "name": "David Guetta ft. Sia - Titanium",
      "file": "..\\demos_videos_recortados\\Electronica\\David Guetta ft. Sia - Titanium_demo.mp4"
    },
    {
      "name": "Avicii - Levels",
      "file": "..\\demos_videos_recortados\\Electronica\\Avicii - Levels_demo.mp4"
    },
    {
      "name": "Martin Garrix - Animals",
      "file": "..\\demos_videos_recortados\\Electronica\\Martin Garrix - Animals_demo.mp4"
    }
  ],
  "cumbia": [
    {
      "name": "Los Ángeles Azules - Nunca Es Suficiente",
      "file": "..\\demos_videos_recortados\\Cumbia\\Los Ángeles Azules - Nunca Es Suficiente_demo.mp4"
    },
    {
      "name": "Celso Piña - Cumbia Sobre el Río",
      "file": "..\\demos_videos_recortados\\Cumbia\\Celso Piña - Cumbia Sobre el Río_demo.mp4"
    },
    {
      "name": "La Sonora Dinamita - Que Bello",
      "file": "..\\demos_videos_recortados\\Cumbia\\La Sonora Dinamita - Que Bello_demo.mp4"
    }
  ]
},

    artistsByGenre: {
    "reggaeton": [
        "bad bunny", "daddy yankee", "j balvin", "ozuna", "maluma", "karol g", "anuel aa",
        "nicky jam", "wisin y yandel", "don omar", "farruko", "myke towers", "sech", 
        "rauw alejandro", "feid", "ryan castro", "blessd", "floyymenor"
    ],
    "bachata": [
        "romeo santos", "aventura", "prince royce", "frank reyes", "anthony santos",
        "xtreme", "toby love", "elvis martinez", "zacarias ferreira", "joe veras"
    ],
    "salsa": [
        "marc anthony", "willie colon", "hector lavoe", "celia cruz", "joe arroyo", 
        "gilberto santa rosa", "victor manuelle", "la india", "tito nieves", "eddie santiago"
    ],
    "rock": [
        "queen", "guns n roses", "metallica", "ac/dc", "led zeppelin", "pink floyd",
        "nirvana", "bon jovi", "aerosmith", "kiss", "the beatles", "rolling stones"
    ],
    "vallenato": [
        "carlos vives", "diomedes diaz", "jorge celedon", "silvestre dangond", "martin elias",
        "los diablitos", "binomio de oro", "los inquietos", "miguel morales"
    ]
},

// Playlists de video con imágenes
playlistImages: {
    crossover: path.join(__dirname, '../Portada/video_crossover.png'),
    latino: path.join(__dirname, '../Portada/video_latino.png'),
    internacional: path.join(__dirname, '../Portada/video_internacional.png'),
    clasicos: path.join(__dirname, '../Portada/video_clasicos.png'),
    personalizada: path.join(__dirname, '../Portada/video_personalizada.png')
},

playlists: [
    {
        name: "🎬🔥 Video Crossover Total (Reggaeton, Salsa, Vallenato, Rock, Pop, Bachata, Merengue, Baladas, Electrónica y más...)",
        genres: ["reggaeton", "salsa", "vallenato", "rock", "pop", "bachata", "merengue", "baladas", "electronica", "cumbia"],
        img: 'crossover',
        description: "La colección más completa de videos musicales en HD y 4K"
    },
    {
        name: "🇨🇴 Videos Colombia Pura Vida",
        genres: ["vallenato", "cumbia", "champeta", "merengue", "salsa"],
        img: 'latino',
        description: "Lo mejor del folclor y música colombiana en video"
    },
    {
        name: "🌟 Hits Internacionales",
        genres: ["rock", "pop", "electronica", "hiphop", "r&b"],
        img: 'internacional',
        description: "Los videos más virales del mundo entero"
    },
    {
        name: "💎 Clásicos Inmortales",
        genres: ["rock", "salsa", "baladas", "boleros", "rancheras"],
        img: 'clasicos',
        description: "Videos legendarios que nunca pasan de moda"
    },
    {
        name: "🎯 Personalizada Premium",
        genres: [],
        img: 'personalizada',
        description: "Crea tu colección única de videos musicales"
    }
],
conversionTips: [
        "🎬 Videos en HD y 4K con calidad cinematográfica",
        "📱 Compatible con TV, celular, tablet y computador",
        "🎁 25% de descuento en tu segunda USB de videos",
        "🚚 Envío gratis + garantía de por vida",
        "🔥 Más de 10,000 videos musicales disponibles"
    ]
};

// ====== UTILIDADES ======
class VideoUtils {
    static normalizeText(text: string): string {
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }
    static dedupeArray<T>(arr: T[]): T[] {
        return [...new Set(arr)];
    }
    static async getValidVideoPath(filePath: string) {
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

// ====== GESTIÓN DE ESTADOS ======
class VideoStateManager {
    private static userStates = new Map<string, UserVideoState>();
    static getOrCreate(phoneNumber: string): UserVideoState {
        if (!this.userStates.has(phoneNumber)) {
            this.userStates.set(phoneNumber, {
                phoneNumber,
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
        return this.userStates.get(phoneNumber)!;
    }
    static async save(userState: UserVideoState) {
        this.userStates.set(userState.phoneNumber, userState);
        await saveUserCustomizationState(userState);
    }
}

// ====== DEMOS DE VIDEO ======
class VideoDemoManager {
    static async getRandomVideosByGenres(genres: string[], count = DEMO_VIDEO_COUNT): Promise<{ name: string, filePath: string, genre: string }[]> {
        const videos: { name: string, filePath: string, genre: string }[] = [];
        const used = new Set();
        let attempts = 0;
        while (videos.length < count && attempts < genres.length * 3) {
            for (const genre of genres) {
                const genreVideos = videoData.topHits[genre] || [];
                if (genreVideos.length > 0) {
                    const randVideo = genreVideos[Math.floor(Math.random() * genreVideos.length)];
                    if (!used.has(randVideo.name)) {
                        const fileCheck = await VideoUtils.getValidVideoPath(randVideo.file);
                        if (fileCheck.valid) {
                            videos.push({ name: randVideo.name, filePath: fileCheck.path, genre });
                            used.add(randVideo.name);
                        }
                    }
                }
                if (videos.length >= count) break;
            }
            attempts++;
        }
        return videos.slice(0, count);
    }
}

// ====== INTENCIÓN Y EXTRACCIÓN ======
class VideoIntentDetector {
    static isContinueKeyword(input: string): boolean {
        const norm = VideoUtils.normalizeText(input.trim());
        return /^(ok|okay|si|sí|continuar|siguiente|listo|precio|capacidad)$/i.test(norm);
    }
    static extractGenres(message: string): string[] {
        const normalized = VideoUtils.normalizeText(message);
        return Object.keys(videoData.topHits).filter(genre => normalized.includes(genre));
    }
    static extractArtists(message: string, genres: string[] = []): string[] {
        const normalized = VideoUtils.normalizeText(message);
        const genresToSearch = genres.length > 0 ? genres : Object.keys(videoData.artistsByGenre);
        const found: string[] = [];
        genresToSearch.forEach(genre => {
            videoData.artistsByGenre[genre]?.forEach(artist => {
                if (normalized.includes(VideoUtils.normalizeText(artist))) {
                    found.push(artist);
                }
            });
        });
        return VideoUtils.dedupeArray(found);
    }
    static extractEras(message: string): string[] {
        const eras = ["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
        const normalized = VideoUtils.normalizeText(message);
        return eras.filter(era => normalized.includes(era.toLowerCase()));
    }
}

// ====== FLUJO PRINCIPAL ======
const videoUsb = addKeyword([
    'Hola, me interesa la USB con vídeos.',
    'usb con videos',
    'usb de videos',
    'usb con video',
    'me interesa la usb de videos',
    'me interesa la usb con videos'
])
.addAction(async (ctx, { flowDynamic }) => {
    const phoneNumber = ctx.from;
    try {
        if (!phoneNumber || !ctx.body) return;
        // Mensaje persuasivo de entrada
        await flowDynamic([
            `🎬 *¡Bienvenido! [Oferta Flash]*\n\n🎥 *USB de VIDEOS musicales en HD y 4K, compatible en TV, PC y celular*\n\n🔥 *Quedan SOLO 3 unidades HOY*\n\n${Math.random() > 0.5 ? '🎵 Más de 10,000 videoclips de todos los géneros' : '⭐ Más de 900 clientes felices hoy'}`
        ]);
        await VideoUtils.delay(700);

        // Presenta playlist top
        const playlist = videoData.playlists[0];
        let playlistMedia = null;
        if (playlist.img) {
            const mediaResult = await VideoUtils.getValidVideoPath(videoData.playlistImages[playlist.img]);
            if (mediaResult.valid) playlistMedia = mediaResult.path;
        }
        if (playlistMedia)
            await flowDynamic([{ body: `🎬 Playlist Top: ${playlist.name}`, media: playlistMedia }]);
        else
            await flowDynamic([`🎬 Playlist Top: ${playlist.name}`]);
        await VideoUtils.delay(400);

        // Demos irresistibles
        const genresDemo = ['reggaeton', 'salsa', 'bachata', 'rock'];
        const demos = await VideoDemoManager.getRandomVideosByGenres(genresDemo, 2);
        if (demos.length > 0) {
            await flowDynamic([
                `👁️ *Mira la calidad de tus videos USB:*`
            ]);
            for (const demo of demos) {
                await flowDynamic([{ body: `🎥 *${demo.name}*`, media: demo.filePath }]);
            }
        }

        // Pregunta de ocasión
        await flowDynamic([
            '🔎 *¿Para qué ocasión quieres tu USB de videos?*\n1️⃣ Fiestas\n2️⃣ Viaje\n3️⃣ Regalo\n4️⃣ Uso Personal\n\n*Responde con el número o dime tu preferencia (ejemplo: "Para mi papá", "Para entrenar", "Para TV")*'
        ]);
        // Estado inicial
        const userState = VideoStateManager.getOrCreate(phoneNumber);
        userState.customizationStage = 'initial';
        userState.lastPersonalizationTime = new Date();
        userState.personalizationCount = 0;
        await VideoStateManager.save(userState);

    } catch (error) {
        await flowDynamic('⚠️ Ocurrió un error. Por favor intenta nuevamente.');
    }
})
.addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const phoneNumber = ctx.from;
    const userInput = ctx.body?.trim() || '';
    try {
        if (!phoneNumber || !userInput) return;

        // Cross-sell: si pide música
        if (/quiero usb de musica|ver musica/i.test(userInput)) {
            return gotoFlow(musicUsb);
        }

        // Estado
        const userState = VideoStateManager.getOrCreate(phoneNumber);

        // Respuesta a ocasión (número o texto)
        if (['1', '2', '3', '4'].includes(userInput.trim()) ||
            /para mi|para mí|para papá|para mamá|entrenar|tv|uso personal|regalo|fiesta|viaje/i.test(VideoUtils.normalizeText(userInput))) {
            let perfil = '';
            switch (userInput.trim()) {
                case '1': perfil = 'fiesta'; break;
                case '2': perfil = 'viaje'; break;
                case '3': perfil = 'regalo'; break;
                case '4': perfil = 'uso personal'; break;
                default: perfil = userInput.trim();
            }
            userState.preferredEras = [perfil];
            userState.customizationStage = 'personalizing';
            await VideoStateManager.save(userState);
            await flowDynamic([
                `🙌 *¡Genial! Personalizaremos tu USB de videos para ${perfil}.*\n\n¿Qué géneros, artistas o épocas prefieres? Ejemplo: "reggaeton y salsa", "Karol G y Bad Bunny", "2000s", o escribe OK para la playlist recomendada.`
            ]);
            return;
        }

        // Extracción
        const userGenres = VideoIntentDetector.extractGenres(userInput);
        const userArtists = VideoIntentDetector.extractArtists(userInput, userGenres);
        const userEras = VideoIntentDetector.extractEras(userInput);

        // Personalización avanzada
        if (userGenres.length > 0 || userArtists.length > 0 || userEras.length > 0) {
            userState.selectedGenres = VideoUtils.dedupeArray([...userState.selectedGenres, ...userGenres]);
            userState.mentionedArtists = VideoUtils.dedupeArray([...userState.mentionedArtists, ...userArtists]);
            userState.preferredEras = VideoUtils.dedupeArray([...userState.preferredEras, ...userEras]);
            userState.customizationStage = 'advanced_personalizing';
            userState.personalizationCount = (userState.personalizationCount || 0) + 1;
            await VideoStateManager.save(userState);

            // Respuesta personalizada
            let resp = `🎬 *¡Tu USB será única!* Géneros: ${userState.selectedGenres.join(', ') || '-'}\nArtistas: ${userState.mentionedArtists.join(', ') || '-'}\nÉpocas: ${userState.preferredEras.join(', ') || '-'}\n\n¿Te gustaría agregar más géneros, artistas o épocas?\n✅ *Escribe OK para continuar* o dime más preferencias.`;
            await flowDynamic([resp]);

            // Mostrar demos de géneros seleccionados
            const demos = await VideoDemoManager.getRandomVideosByGenres(userState.selectedGenres, DEMO_VIDEO_COUNT);
            if (demos.length > 0) {
                await flowDynamic(
                    demos.map(demo => ({
                        body: `🎥 *${demo.name}*`,
                        media: demo.filePath
                    }))
                );
            }
            return;
        }

        // Continuar a capacidad si escribe OK u otro avance
        if (VideoIntentDetector.isContinueKeyword(userInput)) {
            await flowDynamic([
                '✅ *¡Perfecto! Ahora elige la capacidad de tu USB de videos:*',
                '2️⃣ 32GB (2,000 videos)\n3️⃣ 64GB (4,000 videos)\n4️⃣ 128GB (8,000 videos)\n\n*¿Cuál prefieres?*'
            ]);
            return gotoFlow(capacityVideo);
        }

        // Mensaje de urgencia si no avanza
        userState.personalizationCount = (userState.personalizationCount || 0) + 1;
        await VideoStateManager.save(userState);
        if (userState.personalizationCount >= 2) {
            await flowDynamic([
                '⏳ *Recuerda: Quedan pocas unidades y tu descuento expira pronto.*\n\n¿En qué ciudad te encuentras? Así reservo tu USB y envío el enlace de pago rápido.'
            ]);
        } else {
            await flowDynamic([
                '🤔 *No logré identificar géneros, artistas o épocas. Prueba así:*\n- "OK"\n- "reggaeton y salsa"\n- "quiero comprar"\n- o escribe tu ciudad para reservar.'
            ]);
        }
    } catch (error) {
        await flowDynamic('⚠️ Ocurrió un error. Por favor intenta nuevamente.');
    }
});

export default videoUsb;