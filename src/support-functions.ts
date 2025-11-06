import INTENT_KEYWORDS from './support-keywords.json';
import { updateUserSession, userSessions } from './flows/userTrackingSystem';
import musicUsb from './flows/musicUsb';
import videosUsb from './flows/videosUsb';
import moviesUsb from './flows/moviesUsb';

const INTENT_TO_FLOW = {
    music: musicUsb,
    videos: videosUsb,
    movies: moviesUsb
};

export async function detectAndRouteUserIntent(ctx, { gotoFlow, flowDynamic }) {
    const input = ctx.body ? ctx.body.toLowerCase().trim() : '';
    const session = userSessions.get(ctx.from);

    if (session?.currentFlow && !['mainFlow', 'welcomeFlow', 'initial', ''].includes(session.currentFlow)) return;

    let detectedIntent = null;
    for (const { intent, keywords } of INTENT_KEYWORDS) {
        if (keywords.some(k => input.includes(k))) {
            detectedIntent = intent;
            break;
        }
    }

    if (detectedIntent && INTENT_TO_FLOW[detectedIntent]) {
        await updateUserSession(ctx.from, ctx.body, `${detectedIntent}Usb_initial`, 'initial');
        return gotoFlow(INTENT_TO_FLOW[detectedIntent]);
    }

    if (detectedIntent === "support") {
        await flowDynamic([
            '🔎 *Soporte y preguntas frecuentes*',
            '• ¿Cómo es la garantía? — Todos nuestros productos tienen garantía de funcionamiento y calidad.',
            '• ¿Puedo personalizar mi USB? — ¡Sí! Puedes elegir géneros, artistas, películas y más.',
            '• ¿Qué métodos de pago aceptan? — Transferencia, Nequi/Daviplata, contraentrega y más.',
            '• ¿Cuánto demora el envío? — Generalmente 1-3 días hábiles en Colombia.',
            '',
            '¿Tienes otra pregunta o necesitas hablar con un asesor humano? Escribe *asesor* y te contactaremos pronto.'
        ]);
        await updateUserSession(ctx.from, ctx.body, 'support_question', 'answered');
        return;
    }
    if (detectedIntent === "human") {
        await flowDynamic([
            '👩‍💼 Un asesor te contactará pronto para resolver todas tus dudas o ayudarte en tu compra. En breve te escribimos por este chat.',
            'Mientras tanto, si deseas, puedes explorar las opciones de *música*, *videos* o *películas* escribiendo la palabra correspondiente.'
        ]);
        await updateUserSession(ctx.from, ctx.body, 'request_human', 'requested');
        return;
    }
    if (detectedIntent === "followup") {
        if (session?.cartData) {
            await flowDynamic([
                '🛒 *Tienes un pedido pendiente.*',
                '¿Quieres finalizar tu compra o modificar tu selección? Solo responde *finalizar* o *cambiar*.',
                'Si necesitas ayuda, escribe *asesor*.'
            ]);
            await updateUserSession(ctx.from, ctx.body, 'cart_followup', 'pending');
        } else {
            await flowDynamic([
                '🔎 No encontramos un pedido activo con tu número.',
                '¿Quieres empezar un nuevo pedido de *música*, *videos* o *películas*?'
            ]);
        }
        return;
    }
    if (detectedIntent === "combo") {
        await flowDynamic([
            '🎁 *¡Tenemos combos y promociones!*',
            '• USB de música + USB de películas con 20% OFF',
            '• USB de videos musicales + audífonos premium',
            '• Segunda USB con 30% de descuento (puede ser para regalar)',
            '',
            '¿Te interesa alguno? Escribe *música*, *videos* o *películas* para ver las opciones.'
        ]);
        await updateUserSession(ctx.from, ctx.body, 'cross_sell_combo', 'offered');
        return;
    }
    if (detectedIntent === "custom") {
        await flowDynamic([
            '🎨 *¡Personaliza tu pedido!*',
            'Puedes indicarnos géneros, artistas, películas, series o cualquier contenido que desees.',
            'Ejemplo: "Quiero la saga completa de Harry Potter y Marvel, y 100 canciones de salsa y pop".',
            '¡Cuéntame tu idea y la hacemos realidad!'
        ]);
        await updateUserSession(ctx.from, ctx.body, 'custom_order', 'started');
        return;
    }

    if (!session?.currentFlow || ['mainFlow', 'welcomeFlow', 'initial', ''].includes(session.currentFlow)) {
        await flowDynamic([
            '👋 ¡Hola! Puedes pedir:\n' +
            '• *Música* (USB musical personalizada)\n' +
            '• *Videos musicales* (USB de videoclips HD/4K)\n' +
            '• *Películas o series* (USB de cine o series)\n' +
            '• *Combos* y promociones\n' +
            '\n' +
            '¿Cómo te gustaría empezar? Escribe *música*, *videos* o *películas* y te ayudo a armar tu pedido. 😉'
        ]);
    }
}