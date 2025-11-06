import { addKeyword, EVENTS } from '@builderbot/bot';
import orderProcessing from './orderProcessing';
import { updateUserSession, getUserSession } from './userTrackingSystem';
import { SalesMaximizer } from '../sales-maximizer';
import { MatchingEngine } from '../catalog/MatchingEngine';
import { matchingEngine } from '../catalog/MatchingEngine';
import { finalizeOrder } from './helpers/finalizeOrder';
import crypto from 'crypto';
import type { UsbCapacity } from '../../types/global';

interface SecondUsb {
    capacity: UsbCapacity;
    price: number;
}

const salesMaximizer = new SalesMaximizer();

interface UsbOption {
    num: string;
    size: UsbCapacity;
    desc: string;
    price: number;
    stock: number;
    popular?: boolean;
    limited?: boolean;
    vip?: boolean;
}

const USBCAPACITIES: UsbOption[] = [
    {
        num: '1️⃣',
        size: '64GB',
        desc: 'Ideal si quieres empezar: 15–18 películas o hasta 55 episodios HD (promedio 3–4GB por película).',
        price: 119900,
        stock: 7
    },
    {
        num: '2️⃣',
        size: '128GB',
        desc: 'Catálogo sólido: 35+ películas o 110 episodios aprox. Perfecta para mezclar sagas y series.',
        price: 159900,
        stock: 6,
        popular: true
    },
    {
        num: '3️⃣',
        size: '256GB',
        desc: 'Colección PRO: 70+ películas o 220 episodios. Ideal para grandes maratones y varias sagas completas.',
        price: 229900,
        stock: 4,
        limited: true
    },
    {
        num: '4️⃣',
        size: '512GB',
        desc: 'Máximo espacio: 140+ películas o 440 episodios aprox. Incluye espacio para extras, documentales y especiales.',
        price: 349900,
        stock: 2,
        vip: true
    }
];

const genresRecommendation = [
    { key: 'acción', emoji: '🔥', names: 'Avengers (saga), John Wick, Star Wars, Misión Imposible, Rápidos y Furiosos' },
    { key: 'comedia', emoji: '😂', names: 'Shrek (saga), Toy Story, Mi Villano Favorito, Madagascar, The Office, Friends' },
    { key: 'drama', emoji: '🎭', names: 'Breaking Bad, El Padrino, Forrest Gump, Titanic, Joker, El Lobo de Wall Street' },
    { key: 'romance', emoji: '💖', names: 'Orgullo y Prejuicio, Diario de una Pasión, La La Land, Notting Hill, Casablanca' },
    { key: 'terror', emoji: '👻', names: 'El Conjuro, IT, Annabelle, Scream, El Exorcista, Hereditary' },
    { key: 'animadas', emoji: '🎨', names: 'Coco, Frozen, Moana, Encanto, Soul, Rick & Morty, Dragon Ball, Naruto' }
];

function capitalize(str: string) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function formatPrice(price: number | string): string {
    if (typeof price === 'string') return price;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(price);
}

const getUrgencyMsg = async (phone: string) => {
    return (await salesMaximizer.createDynamicUrgency?.(phone, {}) || { message: '' }).message;
};

const getRandomUpsell = () => {
    const options = [
        '💡 ¿Sabías que hoy puedes subir a la siguiente capacidad con un 12% OFF inmediato? Escribe "UPGRADE".',
        '🎧 ¿Te gustaría añadir una USB SOLO MÚSICA (rock, electrónica, salsa, oldies)? Segunda unidad -30%.',
        '📀 Segunda USB para regalar: -30% de descuento automático. Solo escribe: SEGUNDA',
        '🎬 ¿Te agrego colecciones temáticas (Oscars, Clásicos 90s, Animación Premium)? Escribe: COLECCIONES'
    ];
    return options[Math.floor(Math.random() * options.length)];
};

function parseShipping(text: string) {
    const parts = text.split(/[,|\n]/).map(p => p.trim()).filter(Boolean);
    const phone = parts.find(p => /\d{10}/.test(p)) || '';
    const name = parts[0] || 'Cliente';
    const city = parts.length > 1 ? parts[1] : '';
    const address = parts.slice(2).filter(p => p !== phone).join(', ');
    return { name, phone, city, address };
}

const moviesUsb = addKeyword([
    'Hola, me interesa la USB con películas o series.',
    'usb peliculas',
    'usb películas',
    'usb series',
    'peliculas usb',
    'películas usb'
])
.addAction(async (ctx, { flowDynamic }) => {
    const urgencyMsg = await getUrgencyMsg(ctx.from);
    const session = await getUserSession(ctx.from);
    session.movieGenres = session.movieGenres || [];
    await updateUserSession(ctx.from, ctx.body, 'moviesUsb_enter', null, false, { metadata: session });

    await flowDynamic([
        '🎬 ¡Bienvenido a tu cine portátil personalizado!',
        urgencyMsg,
        '',
        'Creamos tu USB con películas, series, sagas, animadas, documentales y más. Sin dependencia de plataformas y sin internet.',
        '💡 Eliminamos la opción de 8GB porque apenas caben 2–3 películas reales. Ahora solo capacidades que sí valen la pena.',
        '',
        '⭐ Más de 2000 títulos disponibles en HD (y algunos en 4K cuando aplica).',
        '🔁 Reposición gratis de contenido 7 días si algo no reproduce bien.',
        '🛡️ Calidad verificada y organizada por carpetas (sagas, géneros o personalizada).',
        '🎁 PROMO: Segunda USB (igual o menor tamaño) con 30% de descuento.',
        '',
        '🎬 Géneros más pedidos:',
        ...genresRecommendation.map(g => `${g.emoji} *${capitalize(g.key)}*: ${g.names}`),
        '',
        '¿Cómo quieres armar tu USB?',
        '1️⃣ Listas recomendadas (géneros y tendencias)',
        '2️⃣ Personalizado total (elige exactamente los títulos)',
        '3️⃣ Promociones y combos (descuentos y upgrades)',
        '',
        '✍️ Responde con el número de tu opción favorita para continuar.'
    ].join('\n'), { delay: 900 });
})
.addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const input = ctx.body.toLowerCase().trim();
    const session = await getUserSession(ctx.from);
    await updateUserSession(ctx.from, ctx.body, 'moviesUsb_response', null, false, { metadata: session });

    if (input === '1' || input.includes('lista')) {
        await flowDynamic([
            '🌟 Colecciones destacadas por género y tendencia:',
            ...genresRecommendation.map(g => `${g.emoji} *${capitalize(g.key)}*: ${g.names}`),
            '',
            'Puedes responder con uno o varios géneros (ej: "acción y terror", "solo animadas").',
            'Luego te mostraré las capacidades recomendadas.'
        ].join('\n'));
        return;
    }

    if (input === '2' || input.includes('personal')) {
        await flowDynamic([
            '🧩 Modo personalizado activado',
            'Escribe ahora sagas, películas, series o tipos de contenido que quieres.',
            '',
            'Ejemplos:',
            '- "Todas las de Marvel + Harry Potter + Star Wars"',
            '- "Comedias románticas + clásicos 90s + Pixar"',
            '- "Terror psicológico + documentales naturaleza"',
            '',
            'También puedo sugerirte si tienes un objetivo: "Quiero unas 40 películas variadas".',
            '✍️ Escribe tu lista o preferencia ahora:'
        ].join('\n'));
        return;
    }

    if (input === '3' || input.includes('promo') || input.includes('combo')) {
        await flowDynamic([
            '🎁 Promociones activas hoy:',
            '• Segunda USB (igual o menor capacidad): -30%',
            '• Upgrade inmediato a la siguiente capacidad: -12% (escribe UPGRADE durante la compra)',
            '• Combo USB Películas + USB Música: -20%',
            '• Agrega Colección Oscars / Anime Premium / Clásicos 90s sin costo si compras 256GB o 512GB.',
            '',
            '¿Deseas ver capacidades ahora? Escribe: CAPACIDADES',
            '¿O armar tu lista primero? Escribe tus gustos.'
        ].join('\n'));
        return;
    }

    if (input.includes('capacidad') || input.includes('capacidad') || input === 'cap') {
        await showCapacities(ctx, flowDynamic, session);
        return gotoFlow(capacidadPaso);
    }

    if (input.length > 3 && !['ok','sí','si','siguiente'].includes(input)) {
        const { genres: movieGenres } = matchingEngine.match(input, 'movies', { detectNegations: true });
        if (movieGenres.length) {
            session.movieGenres = Array.from(new Set([...(session.movieGenres || []), ...movieGenres]));
            await updateUserSession(ctx.from, ctx.body, 'moviesUsb_genresDetected', null, false, { metadata: session });
        }
        await flowDynamic([
            '✅ Anotado.',
            `📀 *Base de tu pedido:* "${capitalize(input)}"`,
            movieGenres.length ? `🎯 Detecté géneros: ${movieGenres.join(', ')}` : 'No detecté géneros claros, puedes seguir refinando.',
            '',
            'Ahora elige la capacidad ideal según cuántas películas/episodios quieres almacenar:',
            formatCapacitiesForMessage(),
            '',
            'Si dudas entre dos tamaños: *el upgrade hoy tiene -12%*.'
        ].join('\n'));
        return gotoFlow(capacidadPaso);
    }

    if (['ok','sí','si','siguiente'].includes(input)) {
        await showCapacities(ctx, flowDynamic, session);
        return gotoFlow(capacidadPaso);
    }

    const matchGenre = genresRecommendation.find(g => input.includes(g.key));
    if (matchGenre) {
        session.movieGenres = Array.from(new Set([...(session.movieGenres||[]), matchGenre.key]));
        await updateUserSession(ctx.from, ctx.body, 'moviesUsb_genreSingle', null, false, { metadata: session });
        await flowDynamic([
            `${matchGenre.emoji} *${capitalize(matchGenre.key)}* seleccionado.`,
            '',
            '¿Quieres mezclar con otros géneros o pasamos a elegir capacidad?',
            'Responde con otro género, "capacidad" o "OK".'
        ].join('\n'));
        return;
    }

    await flowDynamic([
        '🤔 No reconocí tu respuesta.',
        'Opciones: 1 (listas), 2 (personalizado), 3 (promociones), o escribe géneros / títulos directamente.'
    ].join('\n'));
});

async function showCapacities(ctx, flowDynamic, session) {
    await flowDynamic([
        '💾 Capacidades disponibles (optimizado para películas de 3–4GB en promedio):',
        formatCapacitiesForMessage(),
        '',
        '¿Cuál eliges? (1–4) También puedes escribir el número (64, 128, 256, 512).'
    ].join('\n'));
}

function formatCapacitiesForMessage() {
    return USBCAPACITIES.map(u => {
        let tag = '';
        if (u.popular) tag = '🔥 Más elegida';
        if (u.limited) tag = '💎 Stock limitado';
        if (u.vip) tag = '👑 Alta demanda';
        const valuePerMovie = estimateValuePerMovie(u);
        return `${u.num} *${u.size}* — ${u.desc}\n   💰 ${formatPrice(u.price)} | ${valuePerMovie} ${tag}`;
    }).join('\n\n');
}

function estimateValuePerMovie(u) {
    let approxMovies = 0;
    if (u.size === '64GB') approxMovies = 16;
    else if (u.size === '128GB') approxMovies = 35;
    else if (u.size === '256GB') approxMovies = 70;
    else if (u.size === '512GB') approxMovies = 140;
    if (!approxMovies) return '';
    const costPerMovie = Math.round(u.price / approxMovies);
    return `≈ ${formatPrice(costPerMovie)}/película`;
}

const capacidadPaso = addKeyword([EVENTS.ACTION])
.addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const input = ctx.body.toLowerCase().trim();
    const session = await getUserSession(ctx.from);
    await updateUserSession(ctx.from, ctx.body, 'moviesUsb_capacity', null, false, { metadata: session });

    if (/upgrade/.test(input) && session.capacity) {
        const currentIndex = USBCAPACITIES.findIndex(c => c.size === session.capacity);
        if (currentIndex !== -1 && currentIndex < USBCAPACITIES.length - 1) {
            const next = USBCAPACITIES[currentIndex + 1];
            session.capacity = next.size;
            session.price = Math.round(next.price * 0.88);
            await updateUserSession(ctx.from, input, 'moviesUsb_upgradeApplied', null, false, { metadata: session });
            await flowDynamic([
                `🔼 *Upgrade aplicado a ${next.size}* con descuento especial.`,
                `Nuevo precio: ${formatPrice(session.price)} (ahorras 12%).`,
                ``,
                `Envíame tus datos de envío para continuar:`,
                `• Nombre completo`,
                `• Ciudad y dirección`,
                `• Número de celular (10 dígitos)`,
                ``,
                `Ejemplo: Juan Pérez, Medellín, Cra 00 #00-00, 3001234567`
            ].join('\n'));
            return gotoFlow(datosCliente);
        } else {
            await flowDynamic('Ya estás en la máxima capacidad disponible.');
            return;
        }
    }

    if (/segunda|2da|otro|otra/.test(input)) {
        await flowDynamic([
            '🧪 Segunda USB con -30%: Solo se aplica tras confirmar la primera.',
            'Elige primero la capacidad base (1–4) y luego escribes SEGUNDA para añadirla.'
        ].join('\n'));
        return;
    }

    if (/coleccion|colecciones/.test(input)) {
        await flowDynamic([
            '📚 Colecciones disponibles para añadir:',
            '• Oscars y premiadas',
            '• Clásicos 80s / 90s',
            '• Anime Premium',
            '• Sagas completas (Marvel, LOTR, Harry Potter, Star Wars)',
            '',
            'Las de agrego sin costo adicional si eliges 256GB o 512GB.',
            '¿Deseas seguir con la selección de capacidad? (1–4)'
        ].join('\n'));
        return;
    }

    const capIdx = USBCAPACITIES.findIndex(u =>
        input.includes(u.num[0]) ||
        input.includes(u.size.replace('GB','').trim()) ||
        input.includes(u.size.toLowerCase())
    );

    if (capIdx !== -1) {
        const selected = USBCAPACITIES[capIdx];
        session.capacity = selected.size;
        session.price = selected.price;
        await updateUserSession(ctx.from, ctx.body, 'moviesUsb_capacitySelected', null, false, { metadata: session });

        const upgradeSuggestion = capIdx < USBCAPACITIES.length - 1
            ? `🤔 Por solo ${formatPrice(USBCAPACITIES[capIdx + 1].price - selected.price)} más puedes subir a ${USBCAPACITIES[capIdx + 1].size} (escribe UPGRADE).`
            : '';

        await flowDynamic([
            `✅ *Has elegido USB ${selected.size}*`,
            selected.desc,
            `💰 *Precio:* ${formatPrice(selected.price)}`,
            selected.popular ? '🔥 Más elegida por los clientes.' : '',
            selected.limited ? '💎 Stock limitado (recomendado reservar).' : '',
            selected.vip ? '👑 Alta demanda (quedan pocas).' : '',
            upgradeSuggestion,
            '',
            '📦 *Ahora necesito tus datos de envío:*',
            '• Nombre completo',
            '• Ciudad y dirección',
            '• Número de celular (10 dígitos)',
            '',
            'Ejemplo: Ana Gómez, Bogotá, Calle 123 #45-67, 3001234567',
            '',
            getRandomUpsell()
        ].filter(Boolean).join('\n'));
        return gotoFlow(datosCliente);
    }

    if (/upgrade/.test(input)) {
        await flowDynamic('Primero elige una capacidad base (1–4) para aplicar UPGRADE.');
        return;
    }

    await flowDynamic([
        '❓ No reconocí tu respuesta.',
        'Elige una capacidad (1–4), escribe el número (64, 128, 256, 512) o "UPGRADE" si ya seleccionaste una.'
    ].join('\n'));
});

const datosCliente = addKeyword([EVENTS.ACTION])
.addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const text = ctx.body;
    const session = await getUserSession(ctx.from);
    await updateUserSession(ctx.from, text, 'moviesUsb_shipping', null, false, { metadata: session });

    if (/segunda|2da|otro|otra/.test(text) && session.orderId) {
        const baseCapacity = session.capacity || '128GB';
        const secondPriceBase = USBCAPACITIES.find(c => c.size === baseCapacity)?.price || 159900;
        const discounted = Math.round(secondPriceBase * 0.7);
        session.secondUsb = { capacity: baseCapacity, price: discounted };
        await updateUserSession(ctx.from, text, 'moviesUsb_secondUsbAdded', null, false, { metadata: session });
        await flowDynamic([
            `🧩 Segunda USB (${baseCapacity}) añadida con -30%: ${formatPrice(discounted)}`,
            'Si no has enviado todavía los datos de envío, hazlo ahora.'
        ].join('\n'));
        return;
    }

    if (!/\d{10}/.test(text)) {
        await flowDynamic([
            'Por favor incluye tu número de celular (10 dígitos) junto a nombre y dirección para confirmar el pedido.'
        ].join('\n'));
        return;
    }

    const shipping = parseShipping(text);

    const capacitiesToSend = [session.capacity || '128GB'];
    if (session.secondUsb) capacitiesToSend.push(session.secondUsb.capacity);

    let finalPrice = session.price || 0;
    if (session.secondUsb) finalPrice += session.secondUsb.price;

    const result = await finalizeOrder({
        phoneNumber: ctx.from,
        capacities: capacitiesToSend,
        contentTypes: ['movies'],
        shippingData: `${shipping.name} | ${shipping.city} | ${shipping.address} | ${shipping.phone}`,
        overridePreferences: { movieGenres: session.movieGenres || [] },
        forceConfirm: true,
        existingOrderId: session.orderId,
        extras: {
            secondUsb: session.secondUsb || null,
            finalPrice
        }
    });

    if (!session.orderId) {
        session.orderId = result.orderId;
        await updateUserSession(ctx.from, text, 'moviesUsb_orderIdSet', null, false, { metadata: session });
    }

    await flowDynamic([
        result.updated
            ? `🔄 *Pedido actualizado:* ${result.orderId}`
            : `🆔 *Pedido confirmado:* ${result.orderId}`,
        `💰 *Total estimado:* ${formatPrice(finalPrice)} (Se confirmará en factura).`,
        '🎬 Organizando y cargando tu contenido...',
        '⏱️ Tiempo estimado armado: 3–12 horas según tamaño.',
        'Un asesor puede contactarte si requiere algún dato adicional.',
        '✅ Gracias por tu compra. ¿Deseas añadir música, documentales extra o trailers? Responde: EXTRA'
    ].join('\n'));

    session.stage = 'converted';
    await updateUserSession(ctx.from, text, 'moviesUsb_converted', null, false, { metadata: session });

    return gotoFlow(orderProcessing);
});

export default moviesUsb;
