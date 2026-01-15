import { aiService } from '../services/aiService';
import { getUserSession, updateUserSession } from '../flows/userTrackingSystem';
import type { ExtendedContext } from '../flows/userTrackingSystem';
import AIMonitoring from '../services/aiMonitoring';

interface MinimalInteraction {
    message: string;
    response?: string;
    [key: string]: any;
}

// Compiled regex patterns for better performance
const RESPONSE_PATTERNS = {
    affirmative: /^(s[ií]|ok|dale|listo|claro|perfecto|bien|bueno)$/i,
    negative: /^(no|nope|nada)$/i,
    price: /precio|cu[aá]nto|vale|cost[oá]/i
};

/**
 * IMPROVED: Get direct response for common questions in specific flows
 * This prevents AI from generating incoherent responses to simple questions
 */
function getDirectResponse(userMessage: string, session: any): string | null {
    const messageLower = userMessage.toLowerCase().trim();
    const currentFlow = session.currentFlow || '';
    
    // Simple affirmative responses
    if (RESPONSE_PATTERNS.affirmative.test(messageLower)) {
        if (currentFlow.includes('music') || currentFlow.includes('Music')) {
            return '✅ ¡Perfecto! ¿Qué géneros o artistas prefieres? Ejemplo: "rock y salsa", "Karol G y Bad Bunny", o escribe OK para la playlist recomendada.';
        }
        if (currentFlow.includes('customiz')) {
            return '✅ ¡Genial! Sigamos personalizando. ¿Qué más te gustaría agregar?';
        }
        return null; // Let flow handle it
    }
    
    // Simple negative responses  
    if (RESPONSE_PATTERNS.negative.test(messageLower)) {
        return '😊 Sin problema. ¿Hay algo más en lo que pueda ayudarte?';
    }
    
    // Price inquiries with flow context
    if (RESPONSE_PATTERNS.price.test(messageLower)) {
        if (currentFlow.includes('music') || currentFlow.includes('Music')) {
            return '💰 *Precios de USBs de MÚSICA:*\n• 16GB (3,000 canciones): $69,900\n• 32GB (5,000 canciones): $89,900\n• 64GB (10,000 canciones): $129,900\n🚚 Envío GRATIS y playlist personalizada incluida.\n\n¿Qué capacidad prefieres?';
        }
        if (currentFlow.includes('movie') || currentFlow.includes('Movie')) {
            return '💰 *Precios de USBs de PELÍCULAS:*\n• 16GB: $89,900\n• 32GB: $109,900\n• 64GB: $149,900\n🚚 Envío GRATIS incluido.\n\n¿Qué capacidad te interesa?';
        }
        if (currentFlow.includes('video') || currentFlow.includes('Video')) {
            return '💰 *Precios de USBs de VIDEOS:*\n• 16GB: $79,900\n• 32GB: $99,900\n• 64GB: $139,900\n🚚 Envío GRATIS incluido.\n\n¿Qué tipo de videos prefieres?';
        }
    }
    
    return null; // No direct response, let AI handle
}

export const aiMiddleware = async (ctx: ExtendedContext, { gotoFlow, flowDynamic, endFlow }: any) => {
    const startTime = Date.now();
    
    try {
        const phoneNumber = ctx.from;
        const userMessage = ctx.body;
        
        console.log(`🤖 AI procesando mensaje de ${phoneNumber}: "${userMessage}"`);
        
        // SIEMPRE obtener/crear sesión del usuario
        const session = await getUserSession(phoneNumber);
        console.log(`📊 Sesión obtenida para ${phoneNumber}: ${session.currentStep}`);

        // Verificar si es un mensaje especial (media, etc.)
        if (userMessage.startsWith('_event_media_')) {
            console.log('📎 Mensaje de media detectado, saltando IA');
            return;
        }

        // Verificar disponibilidad de IA
        if (!aiService.isAvailable()) {
            console.log('⚠️ Servicio de IA no disponible, usando respuesta inteligente');
            await handleWithoutAI(userMessage, session, { flowDynamic, endFlow });
            return;
        }

        // Obtener historial de conversación (CORREGIDO: usar tipos correctos)
        const conversationHistory: string[] = Array.isArray(session.interactions)
            ? session.interactions.slice(-10).map((i: MinimalInteraction) => 
                `Usuario: ${i.message}\nBot: ${i.response || 'Sin respuesta'}`
            )
            : [];

        // IMPROVED: Check if user is asking a question that can be answered directly without AI
        const directResponse = getDirectResponse(userMessage, session);
        if (directResponse) {
            console.log(`🎯 Respuesta directa para ${phoneNumber}`);
            await updateUserSession(
                phoneNumber,
                userMessage,
                session.currentFlow || 'ai_processed',
                undefined,
                false
            );
            await flowDynamic([directResponse]);
            return endFlow();
        }

        // Generar respuesta con IA (CORREGIDO: no pasar conversationHistory como SalesOpportunity)
        const aiResponse = await aiService.generateResponse(
            userMessage, 
            session, 
            undefined,
            conversationHistory
        );

        const processingTime = Date.now() - startTime;

        // CORREGIDO: Si la respuesta de IA es un string simple, convertirlo a objeto AIResponse para compatibilidad
        let parsedResponse: any;
        if (typeof aiResponse === 'string') {
            parsedResponse = {
                message: aiResponse,
                intent: 'ai_processed',
                confidence: 1,
                shouldTransferToHuman: false,
                source: 'fallback',
                suggestedActions: []
            };
        } else {
            parsedResponse = aiResponse;
        }

        console.log(`🤖 IA Response para ${phoneNumber}:`, {
            intent: parsedResponse.intent,
            confidence: parsedResponse.confidence,
            shouldTransfer: parsedResponse.shouldTransferToHuman,
            source: parsedResponse.source,
            processingTime: `${processingTime}ms`
        });

        // Actualizar sesión SIEMPRE
        await updateUserSession(
            phoneNumber, 
            userMessage, 
            parsedResponse.intent || 'ai_processed', 
            undefined, // No pases el session entero como mensaje
            parsedResponse.message // Solo el mensaje AI
        );

        // Si la confianza es alta, responder con IA
        if (parsedResponse.confidence > 0.5 && !parsedResponse.shouldTransferToHuman) {
            await flowDynamic([parsedResponse.message]);
            
            // Ejecutar acciones sugeridas
            await executeAISuggestions(parsedResponse.suggestedActions || [], ctx, { gotoFlow, flowDynamic });
            
            console.log(`✅ IA manejó exitosamente el mensaje de ${phoneNumber}`);
            return endFlow();
        }

        // Si confianza es baja, usar respuesta de emergencia
        console.log(`⚡ IA con baja confianza (${parsedResponse.confidence}), usando fallback`);
        await handleWithoutAI(userMessage, session, { flowDynamic, endFlow });
        
    } catch (error) {
        console.error('❌ Error en aiMiddleware:', error);
        
        // Fallback de emergencia
        const session = await getUserSession(ctx.from);
        await handleWithoutAI(ctx.body, session, { flowDynamic, endFlow });
    }
};

async function handleWithoutAI(
    userMessage: string, 
    session: any, 
    { flowDynamic, endFlow }: any
) {
    const messageLower = userMessage.toLowerCase();
    
    if (messageLower.includes('precio') || messageLower.includes('costo') || messageLower.includes('cuanto')) {
        await flowDynamic([
            "💰 ¡Excelente pregunta! Nuestras USBs personalizadas están desde **$59,900**",
            "",
            "🎵 **USB de Música** - Desde $59,900",
            "🎬 **USB de Películas** - Desde $59,900", 
            "🎥 **USB de Videos** - Desde $59,900",
            "",
            "¿Cuál te interesa más? 🤔"
        ]);
        return endFlow();
    }

    if (messageLower.includes('música') || messageLower.includes('musica') || messageLower.includes('canciones')) {
        await flowDynamic([
            "🎵 ¡Perfecto! Te encanta la música, excelente elección.",
            "",
            "Tenemos todos los géneros: reggaeton, salsa, bachata, vallenato, rock, pop, merengue, champeta y más.",
            "",
            "💰 **Precio: Desde $59,900**",
            "🎶 **Capacidad: Hasta 64GB de música**",
            "",
            "¿Qué géneros prefieres? ¿O prefieres que te armemos una selección variada?"
        ]);
        return endFlow();
    }

    await flowDynamic([
        "🎵 ¡Hola! Soy tu experto en USBs personalizadas de TechAura.",
        "",
        "💰 **Precios desde $59,900**",
        "",
        "¿Qué te interesa?",
        "🎵 **Música** - Todos los géneros",
        "🎬 **Películas** - Las mejores",
        "🎥 **Videos** - Contenido variado",
        "",
        "¡Solo dime qué prefieres y te ayudo! 😊"
    ]);
    
    return endFlow();
}

async function executeAISuggestions(
    actions: string[], 
    ctx: ExtendedContext, 
    { gotoFlow, flowDynamic }: any
) {
    try {
        for (const action of actions) {
            switch (action) {
                case 'show_prices':
                    await flowDynamic([
                        "💰 **PRECIOS ESPECIALES:**",
                        "🎵 USB Música - $59,900",
                        "🎬 USB Películas - $59,900",
                        "🎥 USB Videos - $59,900",
                        "",
                        "🔥 **¡Oferta limitada!**"
                    ]);
                    break;
                    
                case 'ask_genres':
                    await flowDynamic([
                        "🎵 ¿Qué géneros te gustan?",
                        "Tenemos: reggaeton, salsa, bachata, vallenato, rock, pop, merengue, champeta..."
                    ]);
                    break;
                    
                case 'create_urgency':
                    await flowDynamic([
                        "🔥 **¡OFERTA POR TIEMPO LIMITADO!**",
                        "¿Te interesa asegurar tu USB ahora?"
                    ]);
                    break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.error('❌ Error ejecutando sugerencias:', error);
    }
}