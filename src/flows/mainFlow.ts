import { addKeyword } from '@builderbot/bot';
import { updateUserSession, getUserSession, ExtendedContext } from './userTrackingSystem';
import { aiService } from '../services/aiService';
import musicUsb from './musicUsb';
import videosUsb from './videosUsb';
import moviesUsb from './moviesUsb';

const mainFlow = addKeyword([
    'hola', 'hello', 'hi', 'buenos días', 'buenas tardes', 'buenas noches',
    'ayuda', 'mas informacion', 'quiero mas informacion', 'inicio', 'menu'
])
.addAction(async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
    try {
        console.log(`📱 Mensaje recibido de ${ctx.from}: "${ctx.body}"`);
        
        const session = await getUserSession(ctx.from);
        if (!ctx.from || !ctx.body) {
            throw new Error('Datos incompletos para actualizar la sesión');
        }

        const messageLower = ctx.body.toLowerCase().trim();
        const userName = ctx.name || ctx.pushName || 'amigo';
        
        if (messageLower.includes('usb') && (messageLower.includes('música') || messageLower.includes('musica'))) {
            console.log('🎵 Redirigiendo a musicUsb');
            await updateUserSession(
                ctx.from,
                ctx.body,
                'musicUsb',
                null,
                false,
                {
                    metadata: {
                        ...session,
                        name: userName
                    }
                }
            );
            
            await flowDynamic([
                `🎵 ¡Perfecto ${userName}! Te voy a ayudar con tu USB de música personalizada.`,
                '✨ Tenemos las mejores canciones y los géneros más populares.',
                '💎 Cada USB viene con música de alta calidad y organizada por carpetas.'
            ]);
            
            return gotoFlow(musicUsb);
        }
        
        if (messageLower.includes('usb') && (messageLower.includes('película') || messageLower.includes('peliculas') || messageLower.includes('series'))) {
            console.log('🎬 Redirigiendo a moviesUsb');
            await updateUserSession(
                ctx.from,
                ctx.body,
                'moviesUsb',
                null,
                false,
                {
                    metadata: {
                        ...session,
                        name: userName
                    }
                }
            );
            
            await flowDynamic([
                `🎬 ¡Excelente elección ${userName}! Las películas y series son lo más solicitado.`,
                '🌟 Tenemos el catálogo más completo y actualizado.',
                '🎯 Todo en alta calidad y listo para disfrutar.'
            ]);
            
            return gotoFlow(moviesUsb);
        }
        
        if (messageLower.includes('usb') && (messageLower.includes('video') || messageLower.includes('vídeo'))) {
            console.log('🎥 Redirigiendo a videosUsb');
            await updateUserSession(
                ctx.from,
                ctx.body,
                'videosUsb',
                null,
                false,
                {
                    metadata: {
                        ...session,
                        name: userName
                    }
                }
            );
            
            await flowDynamic([
                `🎥 ¡Genial ${userName}! Los videos personalizados son perfectos para cualquier ocasión.`,
                '📹 Podemos incluir videos de YouTube, tutoriales, documentales y más.',
                '⚡ Todo descargado y organizado para ti.'
            ]);
            
            return gotoFlow(videosUsb);
        }

        const aiResponse = await aiService.generateResponse(ctx.body, session);
        
        if (session.isFirstMessage) {
            await flowDynamic([
                `🎉 ¡Hola ${userName}! Bienvenido a TechAura`,
                '✨ Somos expertos en USBs personalizadas con contenido de calidad',
                '',
                '🎵 **Música** - Los mejores géneros y artistas',
                '🎬 **Películas y Series** - Catálogo actualizado',
                '🎥 **Videos** - Contenido personalizado',
                '',
                '💡 *¿Sabías que el 95% de nuestros clientes quedan tan satisfechos que vuelven a comprar?*',
                '',
                aiResponse,
                '',
                '🎯 ¿Qué tipo de USB te gustaría? Escribe "música", "películas" o "videos"'
            ]);
            session.isFirstMessage = false;
        } else {
            await flowDynamic([
                aiResponse,
                '',
                '💬 ¿Necesitas ayuda con algo más? Estoy aquí para ti.'
            ]);
        }

    } catch (error) {
        console.error('❌ Error en mainFlow:', error);
        const userName = ctx.name || ctx.pushName || 'amigo';
        await flowDynamic([
            `¡Hola ${userName}! 👋 Bienvenido a TechAura`,
            '',
            '✨ Somos especialistas en USBs personalizadas',
            '🎵 Música | 🎬 Películas | 🎥 Videos',
            '',
            '🔥 **Oferta especial**: ¡Pregunta por nuestros paquetes!',
            '',
            '¿Qué te interesa más? Responde con una palabra: música, películas o videos'
        ]);
    }
});

const aiCatchAllFlow = addKeyword([''])
    .addAction(async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
        try {
            console.log(`🤖 Mensaje no capturado: "${ctx.body}"`);
            
            const session = await getUserSession(ctx.from);
            const userName = ctx.name || ctx.pushName || 'amigo';

            if (session.currentFlow && session.currentFlow !== 'aiCatchAll') {
                console.log(`🔍 Ya estás en el flujo: ${session.currentFlow}`);
                return;
            }

            const aiResponse = await aiService.handleUnknownMessage(ctx.body, session);
            
            const messageLower = ctx.body.toLowerCase().trim();
            
            if (messageLower.includes('precio') || messageLower.includes('costo') || messageLower.includes('cuanto')) {
                await flowDynamic([
                    aiResponse,
                    '',
                    '💰 **Nuestros precios son súper competitivos:**',
                    '• USB 16GB: Desde $25.000',
                    '• USB 32GB: Desde $35.000',
                    '• USB 64GB: Desde $50.000',
                    '',
                    '🎁 *¡Tenemos descuentos por cantidad!*',
                    '📦 *Envío gratis en compras mayores a $100.000*',
                    '',
                    '¿Te gustaría hacer tu pedido ahora? 🚀'
                ]);
                return;
            }
            
            if (messageLower.includes('envío') || messageLower.includes('envio') || messageLower.includes('entrega')) {
                await flowDynamic([
                    aiResponse,
                    '',
                    '🚚 **Opciones de entrega:**',
                    '• Entrega inmediata en Bogotá (mismo día)',
                    '• Envío nacional: 2-3 días hábiles',
                    '• Recogida en punto de encuentro',
                    '',
                    '📍 *Cobertura en toda Colombia*',
                    '✅ *Empaque seguro garantizado*',
                    '',
                    '¿Quieres proceder con tu pedido? 🎯'
                ]);
                return;
            }

            await flowDynamic([
                aiResponse,
                '',
                '💡 **Tip**: Puedes escribir "música", "películas" o "videos" para ver nuestro catálogo',
                '🎁 También pregunta por nuestras promociones especiales'
            ]);

            const response = ctx.body.toLowerCase().trim();

            if (response.includes('música') || response.includes('musica')) {
                await updateUserSession(
                    ctx.from,
                    response,
                    'musicUsb',
                    null,
                    false,
                    {
                        metadata: {
                            ...session,
                            name: userName
                        }
                    }
                );
                return gotoFlow(musicUsb);
            } else if (response.includes('película') || response.includes('peliculas') || response.includes('series')) {
                await updateUserSession(
                    ctx.from,
                    response,
                    'moviesUsb',
                    null,
                    false,
                    {
                        metadata: {
                            ...session,
                            name: userName
                        }
                    }
                );
                return gotoFlow(moviesUsb);
            } else if (response.includes('video') || response.includes('vídeo')) {
                await updateUserSession(
                    ctx.from,
                    response,
                    'videosUsb',
                    null,
                    false,
                    {
                        metadata: {
                            ...session,
                            name: userName
                        }
                    }
                );
                return gotoFlow(videosUsb);
            }

        } catch (error) {
            console.error('❌ Error en aiCatchAllFlow:', error);
            await flowDynamic([
                '¡Ups! Parece que hubo un problema.',
                'Pero no te preocupes, estoy aquí para ayudarte 😊',
                '',
                '¿Qué te gustaría hacer?',
                '🎵 Ver USBs de música',
                '🎬 Ver USBs de películas',
                '🎥 Ver USBs de videos'
            ]);
        }
    });

export default mainFlow;
export { aiCatchAllFlow };
