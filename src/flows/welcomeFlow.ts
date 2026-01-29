// import { addKeyword, EVENTS } from '@builderbot/bot';
// import { getUserSession, updateUserSession, createUserSession, ExtendedContext, canSendOnce } from './userTrackingSystem';
// import { aiService } from '../services/aiService';
// import { contextAnalyzer, ContextAnalysis } from '../services/contextAnalyzer';
// import musicUsb from './musicUsb';
// import videosUsb from './videosUsb';
// import moviesUsb from './moviesUsb';
// import menuTech from './menuTech';

// // Palabras clave de entrada (saludos y menú)
// const ENTRY_KEYWORDS = [
//   'hola','hello','hi','buenos dias','buenas','buenas tardes','buenas noches',
//   'ayuda','mas informacion','quiero mas informacion','inicio','menu','empezar',
//   'precios','catalogo','catálogo'
// ];

// function isMusic(msg: string) {
//   return /(m[uú]sica|musica)/i.test(msg);
// }
// function isMovies(msg: string) {
//   return /(pel[ií]culas?|peliculas?|series?)/i.test(msg);
// }
// function isVideos(msg: string) {
//   return /(video|vídeo|videos)/i.test(msg);
// }
// function isTech(msg: string) {
//   return /(tecnolog[ií]a|accesorios|cables|power|cargador|aud[ií]fonos|protecci[oó]n|memorias|hub|adaptador|hdmi|microsd|ssd)/i.test(msg);
// }
// function isPriceIntent(msg: string) {
//   return /(precio|costo|valor|cu[aá]nto|cuanto)/i.test(msg);
// }

// function safeMeta(extra?: Record<string, any>) {
//   // Asegura metadata plana serializable
//   const now = new Date().toISOString();
//   return { ...(extra || {}), lastUpdate: now };
// }

// const entryFlow = addKeyword(['hola','hello','hi','buenos dias','buenas','buenas tardes','buenas noches',
//   'ayuda','mas informacion','quiero mas informacion','inicio','menu','empezar',
//   'precios','catalogo','catálogo', EVENTS.WELCOME])
//   .addAction(async (ctx: ExtendedContext, { flowDynamic, gotoFlow, endFlow }) => {
//     try {
//       const s = await getUserSession(ctx.from) || await createUserSession(ctx.from);
//       const msg = (ctx.body || '').toLowerCase().trim();
//       const name = ctx.name || ctx.pushName || 'amigo';

//       // Evita responder si está en etapas sensibles
//       if (['customizing','pricing','closing','order_confirmed'].includes(s.stage)) return endFlow();

//       // Análisis de contexto (si aplica)
//       let contextAnalysis: ContextAnalysis | null = null;
//       try {
//         contextAnalysis = await contextAnalyzer.analyzeContext(ctx.from, ctx.body || '', 'entryFlow');
//       } catch {
//         contextAnalysis = null;
//       }

//       // Router por intención rápida
//       if (msg.includes('usb') && isMusic(msg)) {
//         await updateUserSession(ctx.from, ctx.body, 'musicUsb', null, false, { metadata: safeMeta({ name }) });
//         await flowDynamic([[
//           `🎵 ¡Perfecto ${name}! Te ayudo con tu USB de música personalizada.`,
//           '✨ Canciones top, organización pro y envío gratis.',
//           '💎 Calidad verificada y soporte.'
//         ].join('\n')]);
//         return gotoFlow(musicUsb);
//       }

//       if (msg.includes('usb') && isMovies(msg)) {
//         await updateUserSession(ctx.from, ctx.body, 'moviesUsb', null, false, { metadata: safeMeta({ name }) });
//         await flowDynamic([[
//           `🎬 ¡Excelente ${name}! Películas y series listas para disfrutar.`,
//           '🌟 Catálogo amplio, HD/4K, organizado por géneros/sagas.',
//           '🚚 Envío gratis y garantía.'
//         ].join('\n')]);
//         return gotoFlow(moviesUsb);
//       }

//       if (msg.includes('usb') && isVideos(msg)) {
//         await updateUserSession(ctx.from, ctx.body, 'videosUsb', null, false, { metadata: safeMeta({ name }) });
//         await flowDynamic([[
//           `🎥 Genial ${name}! Videos personalizados (YouTube, tutoriales, documentales).`,
//           '📹 Listos sin internet y organizados.',
//           '⚡ Entrega rápida, soporte y garantía.'
//         ].join('\n')]);
//         return gotoFlow(videosUsb);
//       }

//       // Tecnología
//       if (isTech(msg)) {
//         await updateUserSession(ctx.from, ctx.body, 'catalogFlow', 'tech_catalog', false, { metadata: safeMeta({ name, category: 'tech' }) });
//         await flowDynamic([[
//           `🧰 ¡Perfecto ${name}! Tenemos tecnología y accesorios útiles.`,
//           '• Memorias y almacenamiento',
//           '• Cables y cargadores (power)',
//           '• Audífonos y protección',
//           '¿Qué necesitas? Escribe: memorias, cables, audífonos, protección.'
//         ].join('\n')]);
//         return gotoFlow(menuTech);
//       }

//       // Precios rápidos
//       if (isPriceIntent(msg) || /^(precios?|catalogo|cat[aá]logo)$/.test(msg)) {
//         await updateUserSession(ctx.from, ctx.body, 'entryFlow', 'pricing_info', false, { metadata: safeMeta({ name, asked: 'pricing' }) });
//         await flowDynamic([{
//           body: [
//             '💰 Precios TechAura:',
//             '• 8GB: $54.900',
//             '• 32GB: $84.900',
//             '• 64GB: $119.900',
//             '• 128GB: $159.900',
//             'Incluye envío y personalización.',
//             '¿Música, películas, videos o tecnología?'
//           ].join('\n')
//         }]);
//         if (canSendOnce(s, 'tech_suggest', 120)) {
//           await flowDynamic(['➕ Tip: también tenemos cables, memorias y adaptadores. Escribe "tecnología".']);
//         }
//         return endFlow();
//       }

//       // Bienvenida + respuesta AI
//       const aiResp = await aiService.generateResponse(ctx.body || '', s);
//       const isGreeting = ['hola','buenas','buenos días','buenas tardes','buenas noches','hey','saludos','qué tal','como estas','cómo estás']
//         .some(g => msg.includes(g));

//       // Si el analizador sugiere redirección directa
//       if (contextAnalysis && contextAnalysis.suggestedAction === 'redirect') {
//         if (isMusic(msg)) return gotoFlow(musicUsb);
//         if (isVideos(msg) || /(vídeo|pel[ií]cula|pelicula)/.test(msg)) return gotoFlow(videosUsb);
//         if (isTech(msg)) {
//           await updateUserSession(ctx.from, ctx.body, 'catalogFlow', 'tech_catalog', false, { metadata: safeMeta({ category: 'tech' }) });
//           return gotoFlow(menuTech);
//         }
//       }

//       if (s.isFirstMessage || isGreeting || (contextAnalysis && contextAnalysis.currentContext === 'new_user')) {
//         await updateUserSession(ctx.from, ctx.body, 'welcomeFlow', 'welcome_step', false, { metadata: safeMeta({ name }) });
//         await flowDynamic([[
//           `🎉 ¡Hola ${name}! Bienvenido a TechAura`,
//           '✨ USBs personalizadas con contenido de calidad',
//           '',
//           '🎵 Música | 🎬 Películas/Series | 🎥 Videos | 🧰 Tecnología',
//           '💡 Envío gratis y garantía.',
//           '',
//           aiResp,
//           '',
//           '¿Qué te interesa? Escribe: música, películas, videos o tecnología'
//         ].join('\n')]);

//         s.isFirstMessage = false;
//         if (canSendOnce(s, 'tech_suggest', 120)) {
//           await flowDynamic(['➕ También tenemos cables, memorias y adaptadores. Di "tecnología".']);
//         }
//         return endFlow();
//       }

//       // Respuesta continua + persuasión sutil
//       const techSuggest = (/(m[uú]sica|musica|pel[ií]culas|peliculas|videos?)/.test(msg))
//         ? ''
//         : (s && s.lastInteraction && Date.now() - new Date(s.lastInteraction).getTime() > 2*60*60*1000
//             ? '\n➕ Tip: también tenemos cables, memorias y adaptadores. Di "tecnología".'
//             : '');

//       await flowDynamic([[aiResp + techSuggest, '', '¿Necesitas algo más?'].join('\n')]);

//       await updateUserSession(ctx.from, ctx.body, 'entryFlow', null, false, { metadata: safeMeta({ lastAI: true }) });
//       return endFlow();

//     } catch (error) {
//       console.error('❌ [ENTRY] Error en entryFlow:', error);
//       const name = ctx.name || ctx.pushName || 'amigo';
//       await flowDynamic([[
//         `¡Hola ${name}! 👋 Bienvenido a TechAura`,
//         '✨ USBs personalizadas',
//         '🎵 Música | 🎬 Películas | 🎥 Videos | 🧰 Tecnología',
//         '🔥 Pregunta por nuestros paquetes',
//         '¿Qué te interesa? Responde: música, películas, videos o tecnología'
//       ].join('\n')]);
//     }
//   });

// export default entryFlow;
