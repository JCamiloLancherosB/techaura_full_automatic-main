import { addKeyword } from '@builderbot/bot';
import { promises as fs } from 'fs';
import path from 'path';
import { updateUserSession, getUserSession, userSessions } from './userTrackingSystem';
import videoUsb from './videosUsb';
import capacityMusicFlow from './capacityMusic';
import { UserSession } from '../../types/global';

// ==============================
// 🌐 CONFIG GLOBAL TECHAURAZ
// ==============================

const SITE_CONFIG = {
    baseUrl: 'https://techauraz.com',
    urls: {
        catalogoGeneral: 'https://techauraz.com/collections/all',
        iluminacion: 'https://techauraz.com/collections/luz-y-linternas-techaura',
        herramientas: 'https://techauraz.com/collections/herramientas',
        energia: 'https://techauraz.com/collections/cargadores-para-diferentes-dispositivos',
        audio: 'https://techauraz.com/collections/audio-y-entretenimiento',
        parlantes: 'https://techauraz.com/collections/parlantes',
        audifonos: 'https://techauraz.com/collections/audifonos',
        drones: 'https://techauraz.com/collections/drones',
        gadgets: 'https://techauraz.com/collections/gadgets',
        powerbank: 'https://techauraz.com/collections/powerbank',
        proyectores: 'https://techauraz.com/collections/proyectores',
        tvbox: 'https://techauraz.com/collections/tvbox'
    },
    images: {
        iluminacionHeader: 'https://i.imgur.com/tkPoOc8.jpeg',
        iluminacionBeneficios: 'https://i.imgur.com/Nt9yul4.png',
        herramientasHeader: 'https://i.imgur.com/hJXNzSY.jpeg',
        herramientasBeneficios: 'https://i.imgur.com/3EuPIHY.png',
        energiaHeader: 'https://i.imgur.com/BWVc9iI.png',
        energiaBeneficios: 'https://i.imgur.com/gmqPLx9.png',
        audioHeader: 'https://i.imgur.com/XUpYdoI.png',
        audioBeneficios: 'https://i.imgur.com/1fECx2F.png',
        pagos: 'https://i.imgur.com/1S2hcMD.png'
    }
};

// ==============================
// 🧠 Tipos
// ==============================

export type CustomizationStage =
    | 'initial'
    | 'interest_detected'
    | 'personalizing'
    | 'ready_to_continue'
    | 'awaiting_decision'
    | 'collecting_data'
    | 'needs_clarification'
    | 'completed';

export interface UserCustomizationState {
    phoneNumber: string;

    selectedGenres: string[];
    mentionedArtists: string[];
    moodPreferences: string[];
    preferredEras: string[];

    customizationStage: CustomizationStage;
    lastPersonalizationTime: Date;
    personalizationCount: number;
    entryTime: Date;
    conversionStage: 'awareness' | 'consideration' | 'decision' | 'purchase' | 'post_purchase';
    interactionCount: number;
    touchpoints: string[];

    selectedCategory?:
    | 'iluminacion'
    | 'herramientas'
    | 'energia'
    | 'audio'
    | 'parlantes'
    | 'audifonos'
    | 'drones'
    | 'gadgets'
    | 'powerbank'
    | 'proyectores'
    | 'tvbox'
    | string;

    selectedProductId?: string;
    selectedProductName?: string;
    selectedVariant?: string | null;
    lastProductOffered?: string;

    budgetRange?: string | null;
    useCase?: string | null;
    doubts: string[];

    preferredContactChannel: 'whatsapp' | 'web' | 'call' | null;
    leadName: string | null;
    leadCity: string | null;
    leadAddress: string | null;
    leadPhone: string | null;

    lastPurchaseStep?: 'payment_offered' | 'address_requested' | 'pending_confirmation' | string;
    purchaseCompleted: boolean;
    upsellOfferSent: boolean;

    videoQuality: 'hd' | 'fullhd' | '4k' | null;
    showedPreview?: boolean;
}

export interface ExtendedContext {
    currentFlow: string;
    from: string;
    body: string;
    name?: string;
    pushName?: string;
    session?: UserSession;
}

// ==============================
// 🔐 Persistencia mínima en disco
// ==============================

const CUSTOM_STATE_FILE = path.resolve(__dirname, '../data/userCustomizationState.json');

async function loadAllStates(): Promise<Record<string, UserCustomizationState>> {
    try {
        const raw = await fs.readFile(CUSTOM_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, UserCustomizationState>;
        for (const k of Object.keys(parsed)) {
            parsed[k].lastPersonalizationTime = new Date(parsed[k].lastPersonalizationTime);
            parsed[k].entryTime = new Date(parsed[k].entryTime);
        }
        return parsed;
    } catch {
        return {};
    }
}

async function saveAllStates(states: Record<string, UserCustomizationState>): Promise<void> {
    await fs.writeFile(CUSTOM_STATE_FILE, JSON.stringify(states, null, 2), 'utf8');
}

async function loadUserCustomizationState(phoneNumber: string): Promise<UserCustomizationState | null> {
    const all = await loadAllStates();
    return all[phoneNumber] || null;
}

async function saveUserCustomizationState(state: UserCustomizationState): Promise<void> {
    const all = await loadAllStates();
    all[state.phoneNumber] = state;
    await saveAllStates(all);
}

// ==============================
// 💾 UserStateManager
// ==============================

class UserStateManager {
    private static userStates = new Map<string, UserCustomizationState>();

    static async getOrCreate(phoneNumber: string): Promise<UserCustomizationState> {
        if (!this.userStates.has(phoneNumber)) {
            const dbState = await loadUserCustomizationState(phoneNumber);
            const initialState: UserCustomizationState =
                dbState || {
                    phoneNumber,
                    selectedGenres: [],
                    mentionedArtists: [],
                    customizationStage: 'initial',
                    lastPersonalizationTime: new Date(),
                    personalizationCount: 0,
                    entryTime: new Date(),
                    conversionStage: 'awareness',
                    interactionCount: 0,
                    touchpoints: [],
                    moodPreferences: [],
                    preferredEras: [],
                    showedPreview: false,
                    selectedCategory: undefined,
                    selectedProductId: undefined,
                    selectedProductName: undefined,
                    selectedVariant: undefined,
                    budgetRange: null,
                    useCase: null,
                    doubts: [],
                    preferredContactChannel: null,
                    leadName: null,
                    leadCity: null,
                    leadAddress: null,
                    leadPhone: null,
                    lastProductOffered: undefined,
                    lastPurchaseStep: undefined,
                    purchaseCompleted: false,
                    upsellOfferSent: false,
                    videoQuality: null
                };

            this.userStates.set(phoneNumber, initialState);
        }
        return this.userStates.get(phoneNumber)!;
    }

    static async save(userState: UserCustomizationState): Promise<void> {
        this.userStates.set(userState.phoneNumber, userState);
        await saveUserCustomizationState(userState);
    }

    static clear(phoneNumber: string): void {
        this.userStates.delete(phoneNumber);
    }
}

// ==============================
// 🔧 Utilidades
// ==============================

function formatCurrency(n: number) {
    return `$${n.toLocaleString('es-CO')}`;
}

class TextUtils {
    static normalize(text: string): string {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
    static dedupe<T>(arr: T[]): T[] {
        return [...new Set(arr)];
    }
}

class MediaUtils {
    static async getValidMediaPath(relativeOrAbsolutePath: string) {
        if (!relativeOrAbsolutePath) return { valid: false as const, path: '' };
        try {
            const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
                ? relativeOrAbsolutePath
                : path.resolve(__dirname, relativeOrAbsolutePath);
            await fs.access(absolutePath);
            return { valid: true as const, path: absolutePath };
        } catch {
            return { valid: false as const, path: '' };
        }
    }

    static async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class IntentDetector {
    static isContinueKeyword(input: string): boolean {
        const norm = TextUtils.normalize(input.trim());
        return /^(ok|okay|si|sí|continuar|siguiente|listo|aceptar|confirmo|dale|va|de una|perfecto)$/i.test(norm);
    }

    static detectBudget(message: string): string | null {
        const norm = TextUtils.normalize(message);
        if (/(\$|cop|pesos)/.test(norm)) return message;
        if (/(\bbarato\b|\becon[oó]mico\b|\bbajo presupuesto\b)/.test(norm)) return 'bajo';
        if (/(\bmedio\b|\bintermedio\b)/.test(norm)) return 'medio';
        if (/(\balto\b|\bno importa\b|\bpremium\b)/.test(norm)) return 'alto';
        return null;
    }

    static detectBuyingIntent(message: string): { intent: 'high' | 'medium' | 'low'; keywords: string[] } {
        const normalized = TextUtils.normalize(message);
        const buyingKeywords = ['comprar', 'ordenar', 'llevar', 'ya mismo', 'quiero ya', 'hacer pedido', 'enviar'];
        const matches = buyingKeywords.filter(k => normalized.includes(k));
        return {
            intent: matches.length > 2 ? 'high' : matches.length > 0 ? 'medium' : 'low',
            keywords: matches
        };
    }

    static detectUseCase(message: string): string | null {
        const norm = TextUtils.normalize(message);
        if (/camping|acampar|exterior|patio|jard[ií]n|campo|viaje|carro|moto/.test(norm)) return 'exterior';
        if (/casa|hogar|habitaci[oó]n|cuarto|sala|apartamento/.test(norm)) return 'hogar';
        if (/trabajo|oficina|taller|negocio|local/.test(norm)) return 'trabajo';
        return null;
    }

    static detectContactPreference(message: string): 'whatsapp' | 'web' | 'call' | null {
        const norm = TextUtils.normalize(message);
        if (/llam(a|arme)|llamada|telefono|tel[eé]fono/.test(norm)) return 'call';
        if (/pagina|web|link|enlace/.test(norm)) return 'web';
        if (/whatsapp|chat|por aqui|por acá/.test(norm)) return 'whatsapp';
        return null;
    }
}

// ==============================
// 🚦 ProcessingController
// ==============================

class ProcessingController {
    private static processingUsers = new Map<string, { timestamp: number; stage: string }>();

    static isProcessing(phoneNumber: string): boolean {
        const processing = this.processingUsers.get(phoneNumber);
        if (!processing) return false;
        if (Date.now() - processing.timestamp > 10000) {
            this.processingUsers.delete(phoneNumber);
            return false;
        }
        return true;
    }

    static setProcessing(phoneNumber: string, stage: string): void {
        this.processingUsers.set(phoneNumber, { timestamp: Date.now(), stage });
    }

    static clearProcessing(phoneNumber: string): void {
        this.processingUsers.delete(phoneNumber);
    }
}

// ==============================
// 🙋 Objeciones comunes
// ==============================

async function handleCommonObjections(userInput: string, flowDynamic: any): Promise<boolean> {
    const input = TextUtils.normalize(userInput);

    if (/(precio|car[oa]|costoso|costos?|vale|muy caro|carito)/i.test(input)) {
        await flowDynamic([
            [
                '💡 Tranquilo, solemos tener opciones para *diferentes presupuestos*.',
                'Incluimos garantía, soporte y productos probados para que no compres a ciegas.'
            ].join('\n')
        ]);
        await MediaUtils.delay(150);
        await flowDynamic(['¿Manejas algún rango de presupuesto aproximado? (Ej: 50.000, 80.000, 120.000)']);
        return true;
    }

    if (/(demora|tarda|cu[aá]nto (demora|tiempo)|entrega|env[ií]o)/i.test(input)) {
        await flowDynamic([
            [
                '⏱️ Entrega rápida: normalmente *1 a 3 días hábiles* a la mayoría de ciudades de Colombia.',
                'Siempre te compartimos la *guía de envío* para que veas el estado del paquete.'
            ].join('\n')
        ]);
        return true;
    }

    if (/(conf[ií]o|seguro|garant[ií]a|fraude|es real|confiable|confianza)/i.test(input)) {
        await flowDynamic([
            [
                '✅ Compra segura con *garantía* y soporte directo por WhatsApp.',
                'Solo trabajamos con productos que ya hemos probado y recomendamos.'
            ].join('\n')
        ]);
        return true;
    }

    return false;
}

// ==============================
// 💳 Pago genérico
// ==============================

async function offerGenericPayment(
    phoneNumber: string,
    flowDynamic: any,
    userState: UserCustomizationState
) {
    userState.lastPurchaseStep = 'payment_offered';
    await UserStateManager.save(userState);

    await flowDynamic([
        {
            body: '🖼️ Métodos de pago TechAura',
            media: SITE_CONFIG.images.pagos
        }
    ]);

    await flowDynamic([
        [
            '🛒 *Último paso para completar tu pedido:*',
            '',
            'Puedes pagar por:',
            '• Nequi / Daviplata / Bancolombia',
            '• Transferencia bancaria',
            '• En algunos casos, contraentrega en ciudades habilitadas',
            '',
            '✍️ Si me confirmas tu *nombre y ciudad*, te ayudo a cerrar el pedido o te envío el enlace de pago.'
        ].join('\n')
    ]);
}

// ======================================================================
// 🌟 FLOW 1: Iluminación
//  Frases de entrada previstas:
//  - "Hola, me interesa el producto para iluminación."
//  - Palabras cortas: "iluminacion", "iluminación", "luz", "lampara"
// ======================================================================

const iluminacionFlow = addKeyword([
    'Hola, me interesa el producto para iluminación.'
])
    .addAction(async (ctx: ExtendedContext, { flowDynamic }) => {
        const phoneNumber = ctx.from;
        await updateUserSession(phoneNumber, ctx.body, 'iluminacionFlow');

        try {
            if (!phoneNumber || !ctx.body) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'iluminacion_presentation');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            session.currentFlow = 'iluminacionFlow';
            (session as any).isActive = true;
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);
            userState.selectedCategory = 'iluminacion';
            userState.customizationStage = 'interest_detected';
            userState.conversionStage = 'awareness';
            userState.interactionCount = (userState.interactionCount || 0) + 1;
            userState.touchpoints = [...(userState.touchpoints || []), 'iluminacion_entry'];
            await UserStateManager.save(userState);

            await flowDynamic([
                {
                    body: '💡 Productos de iluminación TechAura',
                    media: SITE_CONFIG.images.iluminacionHeader
                }
            ]);

            await flowDynamic([
                [
                    '💡 *¡Qué bueno que te interesan nuestros productos de iluminación TechAura!*',
                    '',
                    'Trabajamos con lámparas LED, luces recargables, tiras LED y soluciones portátiles ideales para hogar, oficina o exteriores.'
                ].join('\n')
            ]);

            await flowDynamic([
                {
                    body: '✨ Beneficios de nuestra iluminación',
                    media: SITE_CONFIG.images.iluminacionBeneficios
                }
            ]);

            await flowDynamic([
                [
                    '✨ *Beneficios principales:*',
                    '• Bajo consumo (ahorro de energía)',
                    '• Buena potencia lumínica',
                    '• Opciones recargables y portátiles',
                    '• Diseños compactos y prácticos',
                    '',
                    '🌐 Puedes ver parte del catálogo aquí:',
                    SITE_CONFIG.urls.iluminacion,
                    '',
                    'Para recomendarte mejor:',
                    '👉 ¿La iluminación la necesitas para *casa*, *trabajo* o *exteriores* (camping, carro, patio)?'
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en iluminacionFlow (presentación):', error);
            await flowDynamic([
                [
                    '⚠️ Ocurrió un error mostrando la información de iluminación.',
                    'Puedes escribir "iluminación" de nuevo o visitar:',
                    SITE_CONFIG.urls.iluminacion
                ].join('\n')
            ]);
        }
    })
    .addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic }) => {
        const phoneNumber = ctx.from;
        const userInput = ctx.body?.trim() || '';
        await updateUserSession(phoneNumber, userInput, 'iluminacionFlow');

        try {
            if (!phoneNumber || !userInput) return;
            if (userInput.startsWith('_event_media__') || userInput.startsWith('_event_')) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'iluminacion_capture');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);

            if (await handleCommonObjections(userInput, flowDynamic)) {
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const buyingIntent = IntentDetector.detectBuyingIntent(userInput);
            if (buyingIntent.intent === 'high') {
                userState.customizationStage = 'ready_to_continue';
                userState.conversionStage = 'consideration';
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🛒 Perfecto, te ayudo a dejarlo listo.',
                        'Primero, ¿para qué espacio lo necesitas: *casa*, *trabajo* o *exteriores*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const useCase = IntentDetector.detectUseCase(userInput);
            if (useCase) {
                userState.useCase = useCase;
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), `iluminacion_use_${useCase}`];
                await UserStateManager.save(userState);

                if (useCase === 'hogar') {
                    await flowDynamic([
                        [
                            '🏠 Para *casa* solemos recomendar:',
                            '• Lámparas LED recargables para cortes de luz',
                            '• Luces de mesa o escritorio',
                            '• Tiras LED decorativas para habitación o sala',
                            '',
                            '¿Te interesa más *luz recargable*, *decorativa* o *escritorio*?'
                        ].join('\n')
                    ]);
                } else if (useCase === 'trabajo') {
                    await flowDynamic([
                        [
                            '💼 Para *trabajo/negocio* funcionan muy bien:',
                            '• Lámparas potentes recargables para talleres',
                            '• Luces de escritorio con varios niveles de brillo',
                            '• Iluminación práctica para mostrador o local',
                            '',
                            '¿En qué tipo de espacio la usarías? (ej: taller, oficina, local).'
                        ].join('\n')
                    ]);
                } else if (useCase === 'exterior') {
                    await flowDynamic([
                        [
                            '🏕️ Para *exteriores/camping* te recomiendo:',
                            '• Lámparas recargables con gancho para colgar',
                            '• Luces portátiles para carro/moto',
                            '• Focos recargables de alta potencia',
                            '',
                            '¿Buscas algo *compacto y portátil* o *mucha potencia de luz*?'
                        ].join('\n')
                    ]);
                }

                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const budget = IntentDetector.detectBudget(userInput);
            if (budget) {
                userState.budgetRange = budget;
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'iluminacion_budget'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        `👌 Tomo en cuenta tu presupuesto (${budget}).`,
                        '',
                        'Normalmente manejamos rangos aproximados como:',
                        `• Básico: ${formatCurrency(40000)} - ${formatCurrency(70000)}`,
                        `• Intermedio: ${formatCurrency(70000)} - ${formatCurrency(120000)}`,
                        `• Premium: desde ${formatCurrency(120000)} en adelante`,
                        '',
                        '¿Prefieres algo más *económico*, *intermedio* o *premium*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (IntentDetector.isContinueKeyword(userInput)) {
                userState.customizationStage = 'ready_to_continue';
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '✨ Perfecto, entonces te dejo 2 opciones típicas:',
                        '',
                        '1️⃣ Lámpara LED recargable básica (buena luz, económica, ideal para cortes de luz).',
                        '2️⃣ Lámpara LED recargable más potente (más horas de uso y mejor intensidad).',
                        '',
                        'Escribe *1* o *2* según lo que te haga más sentido,',
                        'o dime si prefieres que te envíe el *link* directo al catálogo.'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/^(1|2)$/.test(userInput)) {
                const opt = userInput.trim();
                userState.customizationStage = 'awaiting_decision';
                userState.selectedProductId = opt === '1' ? 'lamp-led-basic' : 'lamp-led-power';
                userState.selectedProductName =
                    opt === '1' ? 'Lámpara LED recargable básica' : 'Lámpara LED recargable de alta potencia';
                userState.lastProductOffered = userState.selectedProductId;
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        `🟢 Genial, entonces te interesaría: *${userState.selectedProductName}*.`,
                        '',
                        'Incluye:',
                        '• Iluminación LED de bajo consumo',
                        '• Batería recargable',
                        '• Ideal para cortes de luz y uso diario',
                        '',
                        'Para ayudarte a cerrar el pedido, cuéntame:',
                        '👉 ¿En qué ciudad estás y a nombre de quién iría el envío?'
                    ].join('\n')
                ]);

                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (userState.selectedProductName && /[a-z]/i.test(userInput)) {
                if (!userState.leadName) {
                    userState.leadName = userInput;
                    userState.customizationStage = 'collecting_data';
                    await UserStateManager.save(userState);

                    await flowDynamic([
                        [
                            '📦 Súper, con esa información ya casi terminamos.',
                            '',
                            'Para confirmar:',
                            '• Nombre: (ya tomado de tu mensaje)',
                            '• Ciudad: (ej: Bogotá, Medellín, Cali)',
                            '',
                            'Respóndeme con tu *ciudad* y te cuento cómo queda el envío.'
                        ].join('\n')
                    ]);

                    ProcessingController.clearProcessing(phoneNumber);
                    return;
                }

                if (!userState.leadCity) {
                    userState.leadCity = userInput;
                    userState.customizationStage = 'completed';
                    await UserStateManager.save(userState);

                    await flowDynamic([
                        [
                            `✅ Perfecto, envío para *${userState.leadCity}* a nombre de *${userState.leadName}*.`,
                            '',
                            'Ahora te muestro opciones de pago para completar tu pedido.'
                        ].join('\n')
                    ]);

                    await offerGenericPayment(phoneNumber, flowDynamic, userState);
                    ProcessingController.clearProcessing(phoneNumber);
                    return;
                }
            }

            userState.customizationStage = 'needs_clarification';
            userState.doubts = [...(userState.doubts || []), userInput];
            await UserStateManager.save(userState);

            await flowDynamic([
                [
                    '🤔 Entiendo, te resumo las opciones:',
                    '',
                    '• Si quieres *recomendación*, dime para qué espacio es (casa, trabajo, exterior).',
                    '• Si quieres *precio aproximado*, dime tu rango de presupuesto.',
                    '• Si prefieres ver todo, te envío el link:',
                    SITE_CONFIG.urls.iluminacion
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en iluminacionFlow (captura):', error);
            await flowDynamic([
                [
                    '⚠️ Ocurrió un error. Puedes escribir de nuevo "iluminación" o visitar:',
                    SITE_CONFIG.urls.iluminacion
                ].join('\n')
            ]);
        }
    });

// ======================================================================
// 🛠️ FLOW 2: Herramientas útiles
//  Frase de entrada prevista:
//  - "Hola, me interesan las herramientas útiles."
// ======================================================================

const herramientasFlow = addKeyword([
    'Hola, me interesan las herramientas útiles.'
])
    .addAction(async (ctx: ExtendedContext, { flowDynamic }) => {
        const phoneNumber = ctx.from;
        await updateUserSession(phoneNumber, ctx.body, 'herramientasFlow');

        try {
            if (!phoneNumber || !ctx.body) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'herramientas_presentation');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            session.currentFlow = 'herramientasFlow';
            (session as any).isActive = true;
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);
            userState.selectedCategory = 'herramientas';
            userState.customizationStage = 'interest_detected';
            userState.conversionStage = 'awareness';
            userState.interactionCount = (userState.interactionCount || 0) + 1;
            userState.touchpoints = [...(userState.touchpoints || []), 'herramientas_entry'];
            await UserStateManager.save(userState);

            await flowDynamic([
                {
                    body: '🛠️ Herramientas útiles TechAura',
                    media: SITE_CONFIG.images.herramientasHeader
                }
            ]);

            await flowDynamic([
                [
                    '🛠️ *¡Buenísimo que te interesen nuestras herramientas útiles TechAura!*',
                    '',
                    'Manejamos herramientas compactas, multiusos y kits prácticos para el día a día, el carro, la casa o el trabajo.'
                ].join('\n')
            ]);

            await flowDynamic([
                {
                    body: '✨ Beneficios de nuestras herramientas',
                    media: SITE_CONFIG.images.herramientasBeneficios
                }
            ]);

            await flowDynamic([
                [
                    '✨ *Beneficios principales:*',
                    '• Tamaños compactos, pensados para guardar fácil',
                    '• Herramientas multiusos para imprevistos',
                    '• Opciones ideales para carro, hogar y oficina',
                    '',
                    '🌐 Mira algunos de nuestros productos aquí:',
                    SITE_CONFIG.urls.herramientas,
                    '',
                    'Para ayudarte mejor:',
                    '👉 ¿Las herramientas las quieres para *carro/moto*, *casa* o *trabajo/taller*?'
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en herramientasFlow (presentación):', error);
            await flowDynamic([
                [
                    '⚠️ Ocurrió un error cargando la info de herramientas.',
                    'Puedes escribir "herramientas" de nuevo o visitar:',
                    SITE_CONFIG.urls.herramientas
                ].join('\n')
            ]);
        }
    })
    .addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic }) => {
        const phoneNumber = ctx.from;
        const userInput = ctx.body?.trim() || '';
        await updateUserSession(phoneNumber, userInput, 'herramientasFlow');

        try {
            if (!phoneNumber || !userInput) return;
            if (userInput.startsWith('_event_media__') || userInput.startsWith('_event_')) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'herramientas_capture');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);

            if (await handleCommonObjections(userInput, flowDynamic)) {
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const norm = TextUtils.normalize(userInput);

            if (/carro|auto|veh[ií]culo|moto|camioneta/.test(norm)) {
                userState.useCase = 'carro';
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'herramientas_carro'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🚗 Para *carro/moto* solemos recomendar:',
                        '• Kits de herramientas multiusos compactos',
                        '• Linternas o mini luces para emergencias',
                        '• Multiherramientas plegables fáciles de guardar',
                        '',
                        '¿Te interesa más un *kit completo* o una *multi-herramienta* compacta?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/casa|hogar|apartamento|cocina|habitaci[oó]n/.test(norm)) {
                userState.useCase = 'hogar';
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'herramientas_hogar'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🏠 Para *casa/hogar* te funcionan muy bien:',
                        '• Kits con destornilladores, llaves y elementos básicos',
                        '• Multiherramientas para arreglos pequeños',
                        '',
                        '¿Prefieres algo *muy completo* o algo *básico/emergencias*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/taller|negocio|trabajo|oficina/.test(norm)) {
                userState.useCase = 'trabajo';
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'herramientas_trabajo'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '💼 Para *trabajo/taller* solemos usar:',
                        '• Kits más resistentes',
                        '• Herramientas multiusos más robustas',
                        '',
                        '¿Buscas algo *para ti* o para *dotar un espacio* (taller, oficina)?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const budget = IntentDetector.detectBudget(userInput);
            if (budget) {
                userState.budgetRange = budget;
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'herramientas_budget'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        `👌 Perfecto, tomamos en cuenta tu presupuesto (${budget}).`,
                        '',
                        'Para herramientas útiles manejamos rangos aproximados:',
                        `• Kit básico: desde ${formatCurrency(35000)}`,
                        `• Kit intermedio: entre ${formatCurrency(60000)} y ${formatCurrency(90000)}`,
                        `• Opciones más completas: desde ${formatCurrency(90000)} en adelante`,
                        '',
                        '¿Te gustaría empezar con algo *básico* o *intermedio*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (IntentDetector.isContinueKeyword(userInput)) {
                userState.customizationStage = 'ready_to_continue';
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🛠️ Te dejo 2 opciones para hacerlo fácil:',
                        '',
                        '1️⃣ Multi-herramienta compacta (muy útil para el día a día).',
                        '2️⃣ Kit de herramientas con varias piezas (ideal para casa/taller).',
                        '',
                        'Escribe *1* o *2* y luego, si quieres, te envío el *link* del producto en la web.'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/^(1|2)$/.test(userInput)) {
                const opt = userInput.trim();
                userState.customizationStage = 'awaiting_decision';
                userState.selectedProductId = opt === '1' ? 'multi-tool-basic' : 'tool-kit-home';
                userState.selectedProductName =
                    opt === '1' ? 'Multi-herramienta compacta' : 'Kit de herramientas para hogar';
                userState.lastProductOffered = userState.selectedProductId;
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        `✅ Opción seleccionada: *${userState.selectedProductName}*.`,
                        '',
                        'Incluye varias funciones esenciales y es ideal para tener a la mano.',
                        '',
                        '📦 Para ayudarte a coordinar el envío:',
                        '¿Me compartes tu *nombre* y *ciudad*?'
                    ].join('\n')
                ]);

                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/[a-z]/i.test(userInput)) {
                if (!userState.leadName) {
                    userState.leadName = userInput;
                    userState.customizationStage = 'collecting_data';
                    await UserStateManager.save(userState);

                    await flowDynamic([
                        [
                            '🙌 Gracias. Ahora dime por favor tu *ciudad* y, si quieres envío a domicilio, tu *dirección exacta*.',
                            '',
                            'Ej: "Medellín, Barrio X, Calle 10 #20-30".'
                        ].join('\n')
                    ]);

                    ProcessingController.clearProcessing(phoneNumber);
                    return;
                }

                if (!userState.leadCity) {
                    userState.leadCity = userInput;
                    userState.customizationStage = 'completed';
                    await UserStateManager.save(userState);

                    await flowDynamic([
                        [
                            '✅ Perfecto, ya tengo tus datos para coordinar envío.',
                            '',
                            'Te comparto opciones de pago y terminamos el pedido.'
                        ].join('\n')
                    ]);

                    await offerGenericPayment(phoneNumber, flowDynamic, userState);
                    ProcessingController.clearProcessing(phoneNumber);
                    return;
                }
            }

            userState.customizationStage = 'needs_clarification';
            userState.doubts = [...(userState.doubts || []), userInput];
            await UserStateManager.save(userState);

            await flowDynamic([
                [
                    '🤔 Para ayudarte mejor:',
                    '• Dime si las herramientas son para *casa*, *carro/moto* o *trabajo*.',
                    '• O dime un presupuesto aproximado.',
                    '',
                    'También puedes ver opciones aquí:',
                    SITE_CONFIG.urls.herramientas
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en herramientasFlow (captura):', error);
            await flowDynamic([
                [
                    '⚠️ Hubo un error procesando tu mensaje.',
                    'Puedes volver a escribir "herramientas" o entra a:',
                    SITE_CONFIG.urls.herramientas
                ].join('\n')
            ]);
        }
    });

// ======================================================================
// 🔋 FLOW 3: Energía y carga
//  Frase de entrada prevista:
//  - "Hola, quiero información sobre el producto de energía y carga."
// ======================================================================

const energiaFlow = addKeyword([
    'Hola, quiero información sobre el producto de energía y carga.'
])
    .addAction(async (ctx: ExtendedContext, { flowDynamic }) => {
        const phoneNumber = ctx.from;
        await updateUserSession(phoneNumber, ctx.body, 'energiaFlow');

        try {
            if (!phoneNumber || !ctx.body) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'energia_presentation');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            session.currentFlow = 'energiaFlow';
            (session as any).isActive = true;
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);
            userState.selectedCategory = 'energia';
            userState.customizationStage = 'interest_detected';
            userState.conversionStage = 'awareness';
            userState.interactionCount = (userState.interactionCount || 0) + 1;
            userState.touchpoints = [...(userState.touchpoints || []), 'energia_entry'];
            await UserStateManager.save(userState);

            await flowDynamic([
                {
                    body: '🔋 Energía y carga TechAura',
                    media: SITE_CONFIG.images.energiaHeader
                }
            ]);

            await flowDynamic([
                [
                    '🔋 *Perfecto, te cuento sobre nuestros productos de energía y carga TechAura.*',
                    '',
                    'Manejamos power banks, cargadores múltiples y soluciones portátiles para que no te quedes sin batería en el peor momento.'
                ].join('\n')
            ]);

            await flowDynamic([
                {
                    body: '✨ Beneficios de nuestra línea de energía',
                    media: SITE_CONFIG.images.energiaBeneficios
                }
            ]);

            await flowDynamic([
                [
                    '✨ *Beneficios de nuestra línea de energía:*',
                    '• Power banks de buena capacidad y tamaño cómodo',
                    '• Cargadores con múltiples puertos',
                    '• Opciones ideales para viaje, oficina y uso diario',
                    '',
                    '🌐 Mira parte del catálogo aquí:',
                    SITE_CONFIG.urls.energia,
                    '',
                    'Para afinar la recomendación:',
                    '👉 ¿Buscas *power bank*, *cargador múltiple* o *otra solución* de energía/carga?'
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en energiaFlow (presentación):', error);
            await flowDynamic([
                [
                    '⚠️ Ocurrió un error mostrando la información de energía y carga.',
                    'Puedes escribir "energía" de nuevo o visitar:',
                    SITE_CONFIG.urls.energia
                ].join('\n')
            ]);
        }
    })
    .addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic }) => {
        const phoneNumber = ctx.from;
        const userInput = ctx.body?.trim() || '';
        await updateUserSession(phoneNumber, userInput, 'energiaFlow');

        try {
            if (!phoneNumber || !userInput) return;
            if (userInput.startsWith('_event_media__') || userInput.startsWith('_event_')) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'energia_capture');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);

            if (await handleCommonObjections(userInput, flowDynamic)) {
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const norm = TextUtils.normalize(userInput);

            if (/power bank|powerbank|bater[ií]a externa/.test(norm)) {
                userState.customizationStage = 'personalizing';
                userState.useCase = 'powerbank';
                userState.touchpoints = [...(userState.touchpoints || []), 'energia_powerbank'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🔋 Perfecto, entonces hablamos de *power bank*.',
                        '',
                        '¿Lo usarías principalmente para:',
                        '• Celular básico (1–2 cargas)',
                        '• Varios dispositivos (celular + tablet + otros)',
                        '• Viajes largos / uso intensivo?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/cargador|m[uú]ltiple|multi puertos|multi puerto|varios puertos/.test(norm)) {
                userState.customizationStage = 'personalizing';
                userState.useCase = 'charger';
                userState.touchpoints = [...(userState.touchpoints || []), 'energia_charger'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🔌 Perfecto, hablamos de *cargador múltiple*.',
                        '',
                        '¿Tienes más celulares/tablets en casa/oficina y quieres centralizar la carga, o quieres algo para *viajes*?',
                        '',
                        'Cuéntame cuántos dispositivos sueles cargar al tiempo (2, 3, 4...).'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const budget = IntentDetector.detectBudget(userInput);
            if (budget) {
                userState.budgetRange = budget;
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'energia_budget'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        `👌 Tomo en cuenta tu presupuesto (${budget}).`,
                        '',
                        'En energía y carga, los rangos típicos son:',
                        `• Power banks básicos: desde ${formatCurrency(60000)}`,
                        `• Capacidades medias: ~ ${formatCurrency(80000)} - ${formatCurrency(120000)}`,
                        `• Mayor capacidad / carga rápida: desde ${formatCurrency(120000)} en adelante`,
                        '',
                        '¿Buscas algo *básico*, *intermedio* o *de alta capacidad*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (IntentDetector.isContinueKeyword(userInput)) {
                userState.customizationStage = 'ready_to_continue';
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🔋 Para avanzar, te dejo dos opciones típicas:',
                        '',
                        '1️⃣ Power bank compacto (ideal 1–2 cargas de celular, muy fácil de llevar).',
                        '2️⃣ Power bank de mayor capacidad (ideal viajes / varios dispositivos).',
                        '',
                        'Escribe *1* o *2* según lo que te sirva más.'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/^(1|2)$/.test(userInput)) {
                const opt = userInput.trim();
                userState.customizationStage = 'awaiting_decision';
                userState.selectedProductId = opt === '1' ? 'pb-compact' : 'pb-high-capacity';
                userState.selectedProductName = opt === '1' ? 'Power bank compacto' : 'Power bank de alta capacidad';
                userState.lastProductOffered = userState.selectedProductId;
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        `✅ Opción seleccionada: *${userState.selectedProductName}*.`,
                        '',
                        'Incluye:',
                        '• Capacidad adecuada para el uso comentado',
                        '• Puerto(s) de carga rápida según modelo',
                        '• Ideal para no quedarte sin batería en el día',
                        '',
                        '📦 Para ayudarte a completar tu pedido:',
                        '¿Me compartes tu *nombre* y *ciudad*?'
                    ].join('\n')
                ]);

                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/[a-z]/i.test(userInput)) {
                if (!userState.leadName) {
                    userState.leadName = userInput;
                    userState.customizationStage = 'collecting_data';
                    await UserStateManager.save(userState);

                    await flowDynamic([
                        '🙌 Gracias. Ahora dime tu *ciudad* y, si deseas envío a domicilio, tu *dirección*.'
                    ]);

                    ProcessingController.clearProcessing(phoneNumber);
                    return;
                }

                if (!userState.leadCity) {
                    userState.leadCity = userInput;
                    userState.customizationStage = 'completed';
                    await UserStateManager.save(userState);

                    await flowDynamic([
                        [
                            `✅ Perfecto, envío para *${userState.leadCity}* a nombre de *${userState.leadName}*.`,
                            '',
                            'Te muestro ahora las opciones de pago.'
                        ].join('\n')
                    ]);

                    await offerGenericPayment(phoneNumber, flowDynamic, userState);
                    ProcessingController.clearProcessing(phoneNumber);
                    return;
                }
            }

            userState.customizationStage = 'needs_clarification';
            userState.doubts = [...(userState.doubts || []), userInput];
            await UserStateManager.save(userState);

            await flowDynamic([
                [
                    '🤔 Para ayudarte mejor:',
                    '• Dime si estás buscando *power bank* o *cargador múltiple*.',
                    '• O dime un presupuesto aproximado.',
                    '',
                    'Si prefieres ver opciones, entra a:',
                    SITE_CONFIG.urls.energia
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en energiaFlow (captura):', error);
            await flowDynamic([
                [
                    '⚠️ Ocurrió un error al procesar tu mensaje.',
                    'Puedes volver a escribir "energía y carga" o entrar a:',
                    SITE_CONFIG.urls.energia
                ].join('\n')
            ]);
        }
    });

// ======================================================================
// 🎧 FLOW 4: Audio / entretenimiento
// ======================================================================

const audioFlow = addKeyword([
    'Hola, me interesan sus productos de audio o entretenimiento.'
])
    .addAction(async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
        const phoneNumber = ctx.from;
        await updateUserSession(phoneNumber, ctx.body, 'audioFlow');

        try {
            if (!phoneNumber || !ctx.body) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'audio_presentation');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            session.currentFlow = 'audioFlow';
            (session as any).isActive = true;
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);
            userState.selectedCategory = 'audio';
            userState.customizationStage = 'interest_detected';
            userState.conversionStage = 'awareness';
            userState.interactionCount = (userState.interactionCount || 0) + 1;
            userState.touchpoints = [...(userState.touchpoints || []), 'audio_entry'];
            await UserStateManager.save(userState);

            await flowDynamic([
                {
                    body: '🎧 Audio y entretenimiento TechAura',
                    media: SITE_CONFIG.images.audioHeader
                }
            ]);

            await flowDynamic([
                [
                    '🎧 *Excelente, te cuento sobre nuestros productos de audio y entretenimiento TechAura.*',
                    '',
                    'Además de los USB con música o videos, tenemos *parlantes Bluetooth*, *audífonos (con y sin cable)*,',
                    '*auriculares gamer*, y otros gadgets como *drones*, *power banks*, *TV Box* y *proyectores* que viste en nuestro catálogo.'
                ].join('\n')
            ]);

            await flowDynamic([
                {
                    body: '✨ Beneficios y opciones de audio',
                    media: SITE_CONFIG.images.audioBeneficios
                }
            ]);

            await flowDynamic([
                [
                    '✨ *Algunas opciones populares son:*',
                    '• USB con música personalizada (géneros y artistas a tu gusto)',
                    '• USB con videos musicales',
                    '• Parlantes Bluetooth portátiles e impermeables',
                    '• Audífonos inalámbricos, gamer y de diadema',
                    '• Gadgets tecnológicos: drones, power banks, TV Box, proyector LED y más',
                    '',
                    '🌐 Puedes ver parte del catálogo aquí:',
                    SITE_CONFIG.urls.audio,
                    '',
                    'Para entender mejor:',
                    '👉 Escríbeme si buscas: *música*, *videos*, *parlantes*, *audífonos*, *drones*, *power bank*, *TV Box* o *proyector*.'
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en audioFlow (presentación):', error);
            await flowDynamic([
                [
                    '⚠️ Ocurrió un problema cargando la info de audio.',
                    'Puedes escribir "audio" de nuevo o visitar:',
                    SITE_CONFIG.urls.audio
                ].join('\n')
            ]);
        }
    })
    .addAction({ capture: true }, async (ctx: ExtendedContext, { flowDynamic, gotoFlow }) => {
        const phoneNumber = ctx.from;
        const userInput = ctx.body?.trim() || '';
        await updateUserSession(phoneNumber, userInput, 'audioFlow');

        try {
            if (!phoneNumber || !userInput) return;
            if (userInput.startsWith('_event_media__') || userInput.startsWith('_event_')) return;
            if (ProcessingController.isProcessing(phoneNumber)) return;
            ProcessingController.setProcessing(phoneNumber, 'audio_capture');

            const session = ((await getUserSession(phoneNumber)) as UserSession) || ({} as UserSession);
            userSessions.set(phoneNumber, session);

            const userState = await UserStateManager.getOrCreate(phoneNumber);
            const norm = TextUtils.normalize(userInput);

            if (await handleCommonObjections(userInput, flowDynamic)) {
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (/usb con m[uú]sica|m[uú]sica|musical/.test(norm)) {
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_to_musicUsb'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    '🎵 Perfecto, te llevo al flujo especializado de *USB con música personalizada* para que veas demos y precios.'
                ]);

                ProcessingController.clearProcessing(phoneNumber);

                const musicUsbFlow = require('./musicUsb').default || capacityMusicFlow;
                return gotoFlow(musicUsbFlow);
            }

            if (/video|videos|videoclips/.test(norm)) {
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_to_videoUsb'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    '🎬 Genial, te llevo al flujo de *USB con VIDEOS musicales* donde verás opciones y capacidades.'
                ]);

                ProcessingController.clearProcessing(phoneNumber);
                return gotoFlow(videoUsb);
            }

            // ============================
            // Nuevos productos tecnológicos
            // ============================

            // Parlantes Bluetooth
            if (/(parlante|altavoz|bocina|speaker)/.test(norm)) {
                userState.selectedCategory = 'parlantes';
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_parlantes'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🔊 Tenemos varios *parlantes Bluetooth* como los que viste en el catálogo:',
                        '• Parlante Bluetooth impermeable compacto',
                        '• Parlantes cilíndricos tipo JBL',
                        '• Parlantes RGB con luces y buen bajo',
                        '',
                        '👉 Aquí puedes ver los parlantes disponibles:',
                        SITE_CONFIG.urls.parlantes || SITE_CONFIG.urls.audio,
                        '',
                        '¿Lo quieres más para *exteriores* (piscina, viajes) o para *casa/oficina*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            // Audífonos / headsets
            if (/(aud[ií]fono|audifono|auricular|headset|diadema)/.test(norm)) {
                userState.selectedCategory = 'audifonos';
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_audifonos'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🎧 Manejamos varios *audífonos* como los que viste:',
                        '• Audífonos Bluetooth con estuche tipo power bank',
                        '• Diademas gamer 2.4 GHz y con cable 3.5 mm',
                        '• Audífonos inalámbricos con pantalla LED',
                        '',
                        '👉 Aquí puedes ver audífonos y headsets:',
                        SITE_CONFIG.urls.audifonos || SITE_CONFIG.urls.audio,
                        '',
                        '¿Los necesitas más para *jugar*, *trabajar/estudiar* o *uso diario/música*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            // Drones
            if (/dron|drone/i.test(userInput)) {
                userState.selectedCategory = 'drones';
                userState.customizationStage = 'interest_detected';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_drones'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🚁 También tenemos *drones* como el D3 PRO, SY15 o el 998Pro de doble cámara.',
                        '',
                        'Son ideales para diversión, tomas aéreas básicas y regalos tecnológicos.',
                        '',
                        '👉 Mira los drones disponibles aquí:',
                        SITE_CONFIG.urls.drones || SITE_CONFIG.urls.catalogoGeneral,
                        '',
                        '¿Buscas algo para *empezar* (fácil de manejar) o algo con *mejor cámara*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            // Power banks y energía portátil
            if (/power ?bank|bater[ií]a externa|bateria externa/.test(norm)) {
                userState.selectedCategory = 'powerbank';
                userState.customizationStage = 'interest_detected';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_powerbank'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🔋 Veo que te interesan los *power banks* como los del catálogo (portátil y solar).',
                        '',
                        'Tenemos opciones compactas y con panel solar para que cargues el celular donde estés.',
                        '',
                        '👉 Aquí puedes ver power banks y cargadores portátiles:',
                        SITE_CONFIG.urls.powerbank || SITE_CONFIG.urls.energia,
                        '',
                        '¿Lo usarías más para *viajes*, *trabajo* o *uso diario*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            // Proyector de video
            if (/proyector|proyector de video|video beam|videobeam/.test(norm)) {
                userState.selectedCategory = 'proyectores';
                userState.customizationStage = 'interest_detected';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_proyector'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '📽️ Contamos con *proyectores LED compactos* como el que viste en nuestro catálogo.',
                        '',
                        'Son ideales para ver películas en casa, presentaciones básicas o conectar TV Box.',
                        '',
                        '👉 Aquí puedes ver la sección de proyectores:',
                        SITE_CONFIG.urls.proyectores || SITE_CONFIG.urls.catalogoGeneral,
                        '',
                        '¿Lo usarías más para *películas/juegos* o para *presentaciones/trabajo*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            // TV Box
            if (/tv ?box|android tv|caja tv|tvbox/.test(norm)) {
                userState.selectedCategory = 'tvbox';
                userState.customizationStage = 'interest_detected';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_tvbox'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '📺 Tenemos *TV Box* tipo Android, como el modelo que viste (compatible con apps de streaming).',
                        '',
                        'Te permite convertir un televisor normal en un Smart TV para ver plataformas en línea.',
                        '',
                        '👉 Aquí puedes ver los TV Box disponibles:',
                        SITE_CONFIG.urls.tvbox || SITE_CONFIG.urls.catalogoGeneral,
                        '',
                        '¿Lo necesitas para un *solo televisor* o para *varios espacios* en casa/oficina?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            // Otros gadgets tecnológicos (rastreador GPS, soporte magnético, etc.)
            if (/gps|rastreador|soporte magn[eé]tico|soporte para celular|gadget|tecnol[oó]gico/.test(norm)) {
                userState.selectedCategory = 'gadgets';
                userState.customizationStage = 'interest_detected';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_gadgets'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        '🧩 También manejamos varios *gadgets tecnológicos*:',
                        '• Rastreador GPS para vehículo',
                        '• Soporte magnético para celular en el carro',
                        '• Bombillos inteligentes WiFi RGB, guirnaldas LED y más',
                        '',
                        '👉 Puedes ver más gadgets aquí:',
                        SITE_CONFIG.urls.gadgets || SITE_CONFIG.urls.catalogoGeneral,
                        '',
                        '¿Hay alguno en particular que te haya llamado la atención del catálogo (GPS, soporte, bombillo, etc.)?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            const budget = IntentDetector.detectBudget(userInput);
            if (budget) {
                userState.budgetRange = budget;
                userState.customizationStage = 'personalizing';
                userState.touchpoints = [...(userState.touchpoints || []), 'audio_budget'];
                await UserStateManager.save(userState);

                await flowDynamic([
                    [
                        `👌 Teniendo en cuenta tu presupuesto (${budget}):`,
                        'En audio/entretenimiento, según producto, solemos manejar rangos desde:',
                        `${formatCurrency(60000)} hasta más de ${formatCurrency(200000)}, dependiendo de lo que busques.`,
                        '',
                        '¿Te interesa algo más *económico* para empezar o algo *intermedio/premium*?'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            if (IntentDetector.isContinueKeyword(userInput)) {
                await flowDynamic([
                    [
                        '🎧 Genial. Puedo:',
                        '• Llevarte a *USB con música* (muy popular),',
                        '• Llevarte a *USB con videos*,',
                        '• O seguir recomendando *parlantes/audífonos*.',
                        '',
                        'Escribe: "música", "videos" o "parlante/audífonos".'
                    ].join('\n')
                ]);
                ProcessingController.clearProcessing(phoneNumber);
                return;
            }

            userState.customizationStage = 'needs_clarification';
            userState.doubts = [...(userState.doubts || []), userInput];
            await UserStateManager.save(userState);

            await flowDynamic([
                [
                    '🤔 Para orientarte mejor:',
                    '• Dime si buscas *USB con música*, *USB con videos*, *parlantes*, *audífonos*,',
                    '  o algún gadget específico como *drone*, *power bank*, *TV Box* o *proyector*.',
                    '',
                    'También puedes mirar el catálogo aquí:',
                    SITE_CONFIG.urls.catalogoGeneral
                ].join('\n')
            ]);

            ProcessingController.clearProcessing(phoneNumber);
        } catch (error) {
            ProcessingController.clearProcessing(phoneNumber);
            console.error('Error en audioFlow (captura):', error);
            await flowDynamic([
                [
                    '⚠️ Hubo un error procesando tu mensaje en audio.',
                    'Puedes volver a escribir "audio" o visitar:',
                    SITE_CONFIG.urls.audio
                ].join('\n')
            ]);
        }
    });

// ======================================================================
// CATALOG INTEGRATION - Local File System
// ======================================================================

/**
 * Local catalog paths configuration
 * Default paths: Music E:\Musica, Videos F:\Videos, Movies D:\
 * Can be overridden via environment variables:
 * - CATALOG_MUSIC_PATH
 * - CATALOG_VIDEOS_PATH
 * - CATALOG_MOVIES_PATH
 */
const LOCAL_CATALOG_PATHS = {
    music: process.env.CATALOG_MUSIC_PATH || 'E:\\Musica',
    videos: process.env.CATALOG_VIDEOS_PATH || 'F:\\Videos',
    movies: process.env.CATALOG_MOVIES_PATH || 'D:\\'
};

/**
 * Catalog operations with local file system
 */
export class LocalCatalogService {
    /**
     * Get file/folder count from local path
     */
    static async getCatalogCount(catalogType: 'music' | 'videos' | 'movies'): Promise<number> {
        try {
            const catalogPath = LOCAL_CATALOG_PATHS[catalogType];
            const stats = await fs.stat(catalogPath);
            
            if (!stats.isDirectory()) {
                console.warn(`Catalog path ${catalogPath} is not a directory`);
                return 0;
            }
            
            const items = await fs.readdir(catalogPath);
            console.log(`📂 ${catalogType} catalog: ${items.length} items in ${catalogPath}`);
            return items.length;
        } catch (error) {
            console.error(`Error reading ${catalogType} catalog:`, error);
            return 0;
        }
    }

    /**
     * List items in catalog with logging
     */
    static async listCatalogItems(catalogType: 'music' | 'videos' | 'movies', limit: number = 10): Promise<string[]> {
        try {
            const catalogPath = LOCAL_CATALOG_PATHS[catalogType];
            const items = await fs.readdir(catalogPath);
            
            console.log(`📋 Listing ${catalogType} catalog items from ${catalogPath}`);
            const limitedItems = items.slice(0, limit);
            limitedItems.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item}`);
            });
            
            return limitedItems;
        } catch (error) {
            console.error(`Error listing ${catalogType} catalog:`, error);
            return [];
        }
    }

    /**
     * Search for specific items in catalog
     */
    static async searchCatalog(catalogType: 'music' | 'videos' | 'movies', searchTerm: string): Promise<string[]> {
        try {
            const catalogPath = LOCAL_CATALOG_PATHS[catalogType];
            const items = await fs.readdir(catalogPath);
            
            const matches = items.filter(item => 
                item.toLowerCase().includes(searchTerm.toLowerCase())
            );
            
            console.log(`🔍 Search "${searchTerm}" in ${catalogType}: ${matches.length} matches`);
            matches.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item}`);
            });
            
            return matches;
        } catch (error) {
            console.error(`Error searching ${catalogType} catalog:`, error);
            return [];
        }
    }

    /**
     * Log catalog transfer operation
     */
    static logTransfer(
        catalogType: 'music' | 'videos' | 'movies',
        items: string[],
        destination: string
    ): void {
        const timestamp = new Date().toISOString();
        console.log(`\n📦 CATALOG TRANSFER LOG`);
        console.log(`  Timestamp: ${timestamp}`);
        console.log(`  Type: ${catalogType}`);
        console.log(`  Source: ${LOCAL_CATALOG_PATHS[catalogType]}`);
        console.log(`  Destination: ${destination}`);
        console.log(`  Items (${items.length}):`);
        items.forEach((item, index) => {
            console.log(`    ${index + 1}. ${item}`);
        });
        console.log(`✅ Transfer logged\n`);
    }
}

// ======================================================================
// EXPORTS
// ======================================================================

export { iluminacionFlow, herramientasFlow, energiaFlow, audioFlow };
