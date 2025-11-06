import { addKeyword, EVENTS } from '@builderbot/bot';
import { IntelligentRouter } from '../services/intelligentRouter';
import { getUserSession, updateUserSession, createUserSession, ExtendedContext } from './userTrackingSystem';
import { aiService } from '../services/aiService';
import { contextAnalyzer, ContextAnalysis } from '../services/contextAnalyzer';
import { contextMiddleware } from '../middlewares/contextMiddleware';

// 🎯 IMPORTAR FLUJOS ESPECÍFICOS
import musicUsb from './musicUsb';
import videoUsb from './videosUsb';
import moviesUsb from './moviesUsb';

// 🔧 TIPOS CORREGIDOS
interface MakeDecisionResponse {
    targetFlow?: string;
    shouldRedirect: boolean;
    confidence?: number;
    customResponse?: string;
    persuasionElements?: {
        valueProposition?: string;
        urgency?: string;
        scarcity?: string;
        socialProof?: string;
    };
    followUpActions?: string[];
}

// 🔧 CONFIGURACIÓN DE MENSAJES PREDETERMINADOS
const PREDETERMINED_MESSAGES = {
    MUSIC: 'Hola, me interesa la USB con música',
    VIDEOS: 'Hola, me interesa la USB con vídeos', 
    MOVIES: 'Hola, me interesa la USB con películas o series'
} as const;

// 🎯 DETECTOR DE MENSAJES PREDETERMINADOS
function detectPredeterminedMessage(message: string): {
    isPredetermined: boolean;
    type: 'music' | 'videos' | 'movies' | null;
    confidence: number;
} {
    const cleanMessage = message.toLowerCase().trim();
    
    // ✅ DETECCIÓN EXACTA
    if (cleanMessage === PREDETERMINED_MESSAGES.MUSIC.toLowerCase()) {
        return { isPredetermined: true, type: 'music', confidence: 1.0 };
    }
    if (cleanMessage === PREDETERMINED_MESSAGES.VIDEOS.toLowerCase()) {
        return { isPredetermined: true, type: 'videos', confidence: 1.0 };
    }
    if (cleanMessage === PREDETERMINED_MESSAGES.MOVIES.toLowerCase()) {
        return { isPredetermined: true, type: 'movies', confidence: 1.0 };
    }
    
    // ✅ DETECCIÓN FLEXIBLE
    const musicKeywords = ['música', 'musica', 'canciones', 'playlist'];
    const videoKeywords = ['vídeos', 'videos', 'video'];
    const movieKeywords = ['películas', 'peliculas', 'series', 'tv'];
    
    let musicScore = 0;
    let videoScore = 0;
    let movieScore = 0;
    
    musicKeywords.forEach(keyword => {
        if (cleanMessage.includes(keyword)) musicScore += 0.3;
    });
    
    videoKeywords.forEach(keyword => {
        if (cleanMessage.includes(keyword)) videoScore += 0.3;
    });
    
    movieKeywords.forEach(keyword => {
        if (cleanMessage.includes(keyword)) movieScore += 0.3;
    });
    
    const maxScore = Math.max(musicScore, videoScore, movieScore);
    
    if (maxScore >= 0.3) {
        if (musicScore === maxScore) {
            return { isPredetermined: true, type: 'music', confidence: maxScore };
        }
        if (videoScore === maxScore) {
            return { isPredetermined: true, type: 'videos', confidence: maxScore };
        }
        if (movieScore === maxScore) {
            return { isPredetermined: true, type: 'movies', confidence: maxScore };
        }
    }
    
    return { isPredetermined: false, type: null, confidence: 0 };
}

// 🎨 GENERADOR DE RESPUESTAS PERSUASIVAS
class PersuasionEngine {
    static generateMusicResponse(): string[] {
        return [
            `🎵 *¡PERFECTO!* Te interesa nuestra USB de música más vendida.`,
            ``,
            `🎶 *Tenemos TODOS los géneros actualizados:* reggaeton, salsa, bachata, vallenato, rock, pop y más.`,
            ``,
            `🔥 *OFERTA ESPECIAL HOY:* desde $59,900 con envío GRATIS`,
            ``,
            `❓ *¿Qué tipo de música te gusta más?* Te personalizo la mejor opción`
        ];
    }
    
    static generateVideoResponse(): string[] {
        return [
            `📹 *¡EXCELENTE ELECCIÓN!* Nuestras USBs de vídeos son súper populares.`,
            ``,
            `🎬 *Incluimos:* Videoclips HD, documentales, contenido educativo y más.`,
            ``,
            `⚡ *PROMOCIÓN ESPECIAL:* Desde $59,900 con envío incluido`,
            ``,
            `🎯 *¿Qué tipo de vídeos prefieres?* Personalizamos tu colección perfecta`
        ];
    }
    
    static generateMoviesResponse(): string[] {
        return ([
            `🎬 *¡INCREÍBLE!* Las USBs de películas y series son nuestro bestseller.`,
            ``,
            `🍿 *Catálogo completo:* Últimos estrenos, clásicos, series populares, anime y más.`,
            ``,
            `🎁 *OFERTA LIMITADA:* Desde $89,900 con envío gratis + funda protectora`,
            ``,
            `🎭 *¿Qué géneros te gustan más?* Creamos tu biblioteca de entretenimiento ideal`
        ]);
    }
}

// 🔄 SISTEMA DE SEGUIMIENTO INTELIGENTE
async function executeIntelligentFollowUp(
    messageType: 'music' | 'videos' | 'movies',
    ctx: ExtendedContext,
    flowDynamic: any
): Promise<void> {
    const specificBonuses = {
        music: `🎵 *Bonus: actualizaciones gratuitas por 6 meses*`,
        videos: `📹 *Bonus: contenido educativo incluido*`,
        movies: `🎬 *Bonus: acceso a estrenos mensuales*`
    };
    
    await flowDynamic([
        `✨ *Interesante... Déjame ayudarte mejor.* 🎁 *Regalo especial: funda protectora gratis*`,
        ``,
        specificBonuses[messageType],
        ``,
        `❓ *¿Te interesan USBs de música, películas o videos? ¡Tengo ofertas especiales para cada una!*`
    ]);
}

// 🔧 FUNCIÓN AUXILIAR PARA CONVERTIR ROUTER DECISION
function createRouterDecisionForSession(routerDecision: MakeDecisionResponse): { targetFlow: string; shouldRedirect: boolean; } | undefined {
    if (!routerDecision.shouldRedirect || !routerDecision.targetFlow) {
        return undefined;
    }
    
    return {
        targetFlow: routerDecision.targetFlow,
        shouldRedirect: routerDecision.shouldRedirect
    };
}

// 🎯 FLOW PRINCIPAL CORREGIDO
const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx: ExtendedContext, { flowDynamic, gotoFlow, endFlow }) => {
        contextMiddleware
        try {
            console.log(`🎯 [WELCOME] Mensaje recibido de ${ctx.from}: "${ctx.body}"`);
            
            // ✅ ANÁLISIS CONTEXTUAL CRÍTICO ANTES DE PROCESAR
            const contextAnalysis: ContextAnalysis = await contextAnalyzer.analyzeContext(
                ctx.from, 
                ctx.body, 
                'welcomeFlow'
            );
            
            console.log(`🔍 [WELCOME] Análisis contextual:`, contextAnalysis);
            
            // ✅ DECISIÓN BASADA EN CONTEXTO - CRÍTICO
            if (!contextAnalysis.shouldRespond) {
                            console.log(`🚫 [WELCOME] No respondiendo debido a contexto: ${contextAnalysis.reason}`);
            return endFlow(); // Terminar sin responder
        }
        
        if (contextAnalysis.suggestedAction === 'ignore') {
            console.log(`⏸️ [WELCOME] Ignorando mensaje: ${contextAnalysis.reason}`);
            return endFlow();
        }
        
        if (contextAnalysis.suggestedAction === 'continue') {
            console.log(`🔄 [WELCOME] Continuando flujo actual: ${contextAnalysis.currentContext}`);
            return endFlow();
        }

        // ✅ OBTENER O CREAR SESIÓN DE USUARIO
        let userSession = await getUserSession(ctx.from);
        if (!userSession) {
            userSession = await createUserSession(ctx.from);
            console.log(`👤 [WELCOME] Nueva sesión creada para ${ctx.from}`);
        }

        // ✅ ACTUALIZAR SESIÓN CON MENSAJE ACTUAL
        await updateUserSession(ctx.from, ctx.body, 'welcomeFlow', userSession.phone);

        const message = ctx.body.toLowerCase().trim();
        console.log(`📝 [WELCOME] Procesando mensaje: "${message}"`);

        // ✅ VERIFICAR INTENCIONES ESPECÍFICAS SOLO SI EL CONTEXTO LO PERMITE
        if (contextAnalysis.suggestedAction === 'redirect') {
            console.log(`🔀 [WELCOME] Redirección sugerida por contexto`);
            
            // Música
            if (message.includes('música') || message.includes('musica')) {
                console.log(`🎵 [WELCOME] Redirigiendo a música`);
                return gotoFlow(musicUsb);
            }
            
            // Videos
            if (message.includes('video') || message.includes('película') || message.includes('pelicula')) {
                console.log(`🎬 [WELCOME] Redirigiendo a videos`);
                return gotoFlow(videoUsb);
            }
            
            // Precios
            if (message.includes('precio') || message.includes('costo') || message.includes('valor')) {
                console.log(`💰 [WELCOME] Mostrando precios`);
                await flowDynamic([
                    {
                        body: `💰 *PRECIOS DE NUESTRAS USB PERSONALIZADAS:*\n\n` +
                              `🎵 *USB con Música:*\n` +
                              `• 32GB - $25.000\n` +
                              `• 64GB - $35.000\n` +
                              `• 128GB - $45.000\n\n` +
                              `🎬 *USB con Videos/Películas:*\n` +
                              `• 32GB - $30.000\n` +
                              `• 64GB - $40.000\n` +
                              `• 128GB - $50.000\n\n` +
                              `📱 *Personalización incluida*\n` +
                              `🚚 *Envío a domicilio disponible*\n\n` +
                              `¿Qué tipo de USB te interesa?`
                    }
                ]);
                return endFlow();
            }
        }

        // ✅ LÓGICA NORMAL DE BIENVENIDA (solo si no hay contexto crítico)
        const isGreeting = [
            'hola', 'buenas', 'buenos días', 'buenas tardes', 'buenas noches',
            'hey', 'saludos', 'qué tal', 'como estas', 'cómo estás'
        ].some(greeting => message.includes(greeting));

        if (isGreeting || message === '' || contextAnalysis.currentContext === 'new_user') {
            console.log(`👋 [WELCOME] Enviando mensaje de bienvenida`);
            
            await flowDynamic([
                {
                    body: `¡Hola! 👋 Bienvenido a *USB Personalizadas*\n\n` +
                          `Creamos USB personalizadas con:\n` +
                          `🎵 *Música de tu género favorito*\n` +
                          `🎬 *Videos y películas*\n` +
                          `📁 *Contenido personalizado*\n\n` +
                          `*¿Qué tipo de USB te interesa?*\n\n` +
                          `Escribe:\n` +
                          `• *"Música"* - Para USB con música\n` +
                          `• *"Videos"* - Para USB con películas\n` +
                          `• *"Precios"* - Ver lista de precios\n` +
                          `• *"Catálogo"* - Ver todas las opciones`
                }
            ]);
            return endFlow();
        }

        // ✅ MANEJO DE COMANDOS ESPECÍFICOS
        if (message.includes('catálogo') || message.includes('catalogo') || message.includes('opciones')) {
            console.log(`📋 [WELCOME] Mostrando catálogo completo`);
            
            await flowDynamic([
                {
                    body: `📋 *CATÁLOGO COMPLETO - USB PERSONALIZADAS*\n\n` +
                          `🎵 *MÚSICA POR GÉNEROS:*\n` +
                          `• Reggaeton\n• Salsa\n• Bachata\n• Merengue\n• Pop\n• Rock\n• Electrónica\n\n` +
                          `🎬 *VIDEOS Y PELÍCULAS:*\n` +
                          `• Películas de acción\n• Comedias\n• Dramas\n• Documentales\n• Series\n\n` +
                          `💾 *CAPACIDADES DISPONIBLES:*\n` +
                          `• 32GB\n• 64GB\n• 128GB\n\n` +
                          `💰 *Precios desde $25.000*\n` +
                          `🚚 *Envío a domicilio*\n\n` +
                          `¿Qué te interesa más?`
                }
            ]);
            return endFlow();
        }

        // ✅ REDIRECCIONES ESPECÍFICAS
        if (message.includes('música') || message.includes('musica')) {
            console.log(`🎵 [WELCOME] Redirigiendo a musicUsb`);
            return gotoFlow(musicUsb);
        }

        if (message.includes('video') || message.includes('película') || message.includes('pelicula')) {
            console.log(`🎬 [WELCOME] Redirigiendo a videoUsb`);
            return gotoFlow(videoUsb);
        }

        // ✅ MENSAJE POR DEFECTO SOLO SI NO HAY CONTEXTO ESPECÍFICO
        console.log(`❓ [WELCOME] Mensaje no reconocido, enviando ayuda`);
        await flowDynamic([
            {
                body: `No entendí tu mensaje 🤔\n\n` +
                      `Puedes escribir:\n` +
                      `• *"Música"* - Para USB con música\n` +
                      `• *"Videos"* - Para USB con películas\n` +
                      `• *"Precios"* - Ver precios\n` +
                      `• *"Catálogo"* - Ver opciones\n\n` +
                      `¿En qué puedo ayudarte?`
            }
        ]);

    } catch (error) {
        console.error('❌ [WELCOME] Error en welcomeFlow:', error);
        await flowDynamic([
            {
                body: `❌ Ocurrió un error. Por favor, intenta nuevamente o escribe "Hola" para comenzar.`
            }
        ]);
    }
});


// 🔧 FUNCIONES AUXILIARES
function enhanceWithPersuasion(aiResponse: string, persuasionElements: any): string {
    if (!persuasionElements) return aiResponse;
    
    let enhanced = aiResponse;
    
    const elements = [
        persuasionElements.urgency,
        persuasionElements.scarcity,
        persuasionElements.socialProof,
        persuasionElements.valueProposition
    ].filter(Boolean);
    
    if (elements.length > 0) {
        enhanced += `\n\n${elements.join('\n\n')}`;
    }
    
    return enhanced;
}

async function executeFollowUpActions(
    actions: string[], 
    ctx: ExtendedContext, 
    flowDynamic: any
): Promise<void> {
    for (const action of actions) {
        try {
            switch (action) {
                case 'show_personalized_options':
                    await flowDynamic([
                        `🎯 *Basándome en lo que me dices, estas son las opciones perfectas para ti:*`,
                        ``,
                        `🎵 *Opción 1: USB Musical Básica - $25.000*`,
                        `🎨 *Opción 2: USB Premium Personalizada - $35.000*`,
                        `👑 *Opción 3: USB VIP Completa - $55.000*`
                    ]);
                    break;
                    
                case 'create_urgency':
                    await flowDynamic([
                        `⚡ *¡ATENCIÓN! Oferta por tiempo limitado:*`,
                        `🔥 *Solo esta semana:* Envío GRATIS + Diseño personalizado SIN COSTO`,
                        `💬 *¿Te interesa aprovechar esta oferta?*`
                    ]);
                    break;
                    
                default:
                    break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (actionError) {
            console.error(`❌ Error ejecutando acción ${action}:`, actionError);
        }
    }
}

export default welcomeFlow;
