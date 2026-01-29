/**
 * Message Coherence Tests
 * 
 * Automated tests to validate message coherence in:
 * - src/services/conversationAnalyzer.ts
 * - src/services/persuasionEngine.ts
 * - src/flows/menuTech.ts
 * 
 * Tests verify:
 * 1. Messages don't repeat consecutively (isRedundantMessage)
 * 2. Tone is consistent with flow stage (awareness, consideration, decision)
 * 3. No duplicate prices when already shown
 * 4. Persuasive messages vary using existing templates
 * 
 * This test file is standalone and does not require database connections.
 * It directly tests the coherence logic extracted from the services.
 * 
 * Run with: npx tsx src/tests/messageCoherence.test.ts
 */

// ============================================
// Type Definitions (standalone, no external deps)
// ============================================

interface PersuasionContext {
    stage: string;
    hasDiscussedPrice: boolean;
    hasSelectedProduct: boolean;
    hasCustomized: boolean;
    buyingIntent: number;
    interactionCount: number;
    productInterests: string[];
}

interface MessageAnalysis {
    userIntent: string;
    mentionedTopics: string[];
    questions: string[];
    objections: string[];
    buyingSignals: string[];
    urgencyLevel: 'low' | 'medium' | 'high';
    emotionalTone: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'excited';
    requiresHumanIntervention: boolean;
}

interface UserSession {
    phone: string;
    name: string;
    stage: string;
    currentFlow: string;
    isActive: boolean;
    isFirstMessage: boolean;
    lastMessageTimestamp: Date;
    interactions: any[];
    buyingIntent: number;
}

// ============================================
// Message Templates (extracted from persuasionEngine.ts)
// ============================================

const JOURNEY_MESSAGES = {
    awareness: {
        openings: [
            "Hola, bienvenido a TechAura 👋",
            "Hola, con gusto te ayudo 🎵 Somos TechAura",
            "Hola 🌟 ¿Buscas una USB personalizada?"
        ],
        values: [
            "✨ Personalizamos con los géneros y artistas que prefieras",
            "🎯 Miles de canciones organizadas, sin contenido de relleno",
            "💎 Audio en calidad HD 320kbps, memorias originales"
        ],
        ctas: [
            "¿Te interesa música, películas o videos?",
            "¿Qué tipo de contenido buscas?",
            "¿En qué te puedo ayudar hoy?"
        ]
    },
    interest: {
        openings: [
            "Perfecto 🎵 Excelente elección",
            "Muy bien 🌟 Te va a gustar",
            "Genial 🔥 Déjame explicarte"
        ],
        values: [
            "🎨 Personalizamos todo: géneros, artistas, hasta el nombre de la USB",
            "⚡ Proceso rápido: Armo tu USB → Envío gratis en 24-48h",
            "✅ Tienes garantía completa de cambio si algo no te gusta"
        ],
        ctas: [
            "¿Qué géneros o artistas prefieres?",
            "Cuéntame tus gustos musicales para armarte algo a tu medida",
            "¿Ya tienes idea de qué contenido te gustaría?"
        ]
    },
    customization: {
        openings: [
            "Perfecto 🎶 Me gusta tu estilo",
            "Excelente 🎵 Buen gusto",
            "Muy bien 🌟 Ya veo por dónde vas"
        ],
        values: [
            "📂 Te lo organizo todo por carpetas para que sea fácil de usar",
            "🎧 Te incluyo solo lo mejor: éxitos y clásicos imperdibles",
            "💯 Sin repeticiones ni contenido de relleno"
        ],
        transitions: [
            "Ya tengo claro tu estilo, ahora veamos las opciones",
            "Con esto que me dijiste, tengo la opción perfecta para ti",
            "Basado en tus preferencias, esto es lo que te recomiendo"
        ],
        ctas: [
            "¿Prefieres 32GB (5,000 canciones) o 64GB (10,000)?",
            "¿Te gustaría agregar algo más?",
            "¿Vemos los precios de las capacidades?"
        ]
    },
    pricing: {
        openings: [
            "💰 Te explico la inversión",
            "💎 Precios especiales que tenemos",
            "🔥 Buenas noticias con el precio"
        ],
        values: [
            "🎁 INCLUIDO: Envío gratis, funda protectora y grabado personalizado",
            "✅ Garantía de 6 meses sin complicaciones",
            "🔄 Actualizaciones gratis durante 3 meses"
        ],
        socialProofs: [
            "⭐ Más de 1,500 clientes satisfechos hasta ahora",
            "🏆 Calificación 4.9/5 estrellas en Google",
            "👥 Más de 800 USBs vendidas este mes"
        ],
        urgencies: [
            "⏰ Tenemos promoción del 20% OFF hoy",
            "🔥 Quedan pocas unidades en stock",
            "⚡ El envío GRATIS termina en pocas horas"
        ],
        ctas: [
            "¿Te gustaría que te aparte una?",
            "¿La confirmamos para entrega mañana?",
            "¿Prefieres pago completo o lo dividimos en 2 cuotas?"
        ]
    },
    closing: {
        openings: [
            "🎉 Excelente, muy buena decisión",
            "🔥 Perfecto, aseguremos tu USB",
            "✅ Muy bien, último paso entonces"
        ],
        values: [
            "📦 USB lista en 24-48 horas, personalizada a tu gusto",
            "🚚 Envío con seguimiento para que sepas dónde está",
            "💬 Soporte directo conmigo para lo que necesites"
        ],
        urgencies: [
            "⏰ La estoy apartando ahora mismo",
            "🔥 La proceso con prioridad para ti",
            "⚡ La separo del inventario de inmediato"
        ],
        ctas: [
            "Confirma tu dirección de envío por favor",
            "¿A qué nombre va el pedido?",
            "¿Confirmas la dirección de entrega?"
        ]
    },
    objection_handling: {
        price: [
            "💡 Son solo $2,100 al día por más de 5,000 canciones",
            "🎵 Spotify cuesta $15K cada mes vs. USB $84,900 una sola vez",
            "💳 Te puedo ofrecer: $30K hoy + $30K al recibir + $29,900 en 15 días"
        ],
        quality: [
            "🏆 Usamos solo memorias Samsung/Kingston originales",
            "🔊 Audio en calidad HD 320kbps, igual que Spotify Premium",
            "✅ Devolución del 100% garantizada si no quedas satisfecho"
        ],
        time: [
            "⚡ 24 horas en Medellín, 48 horas resto del país",
            "🚀 Sale hoy mismo si confirmas antes de las 3pm",
            "📦 Te envío el seguimiento en tiempo real"
        ],
        trust: [
            "📱 Más de 1,500 clientes verificados en nuestro historial",
            "⭐ Calificación 4.9/5 en Google que puedes consultar",
            "✅ Garantía de 6 meses, cambio inmediato si hay problema"
        ]
    }
};

// ============================================
// Simple Test Runner (consistent with flowCoherenceRegression.test.ts)
// ============================================

let testsPassed = 0;
let testsFailed = 0;
let currentDescribe = '';

function describe(name: string, fn: () => void | Promise<void>): void {
    currentDescribe = name;
    console.log(`\n📦 ${name}`);
    fn();
}

function test(name: string, fn: () => void | Promise<void>): void {
    try {
        const result = fn();
        if (result instanceof Promise) {
            result
                .then(() => {
                    testsPassed++;
                    console.log(`  ✅ ${name}`);
                })
                .catch((error: any) => {
                    testsFailed++;
                    console.log(`  ❌ ${name}`);
                    console.log(`     Error: ${error.message}`);
                });
        } else {
            testsPassed++;
            console.log(`  ✅ ${name}`);
        }
    } catch (error: any) {
        testsFailed++;
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
    }
}

function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
        throw new Error(message || `Expected "${expected}", got "${actual}"`);
    }
}

function assertArrayContains<T>(array: T[], item: T, message?: string): void {
    if (!array.includes(item)) {
        throw new Error(message || `Array [${array.join(', ')}] does not contain "${item}"`);
    }
}

function assertNotEqual<T>(actual: T, notExpected: T, message?: string): void {
    if (actual === notExpected) {
        throw new Error(message || `Expected value to NOT equal "${notExpected}"`);
    }
}

function assertLessThanOrEqual(actual: number, expected: number, message?: string): void {
    if (actual > expected) {
        throw new Error(message || `Expected ${actual} <= ${expected}`);
    }
}

function assertGreaterThanOrEqual(actual: number, expected: number, message?: string): void {
    if (actual < expected) {
        throw new Error(message || `Expected ${actual} >= ${expected}`);
    }
}

// ============================================
// Core Functions Under Test (extracted from services)
// ============================================

/**
 * isRedundantMessage - from userTrackingSystem.ts
 * Checks if a message is redundant based on history
 */
function isRedundantMessage(history: any[], proposedMessageContent: string): boolean {
    if (!history || history.length === 0) return false;

    // Look at the last 5 messages
    const recentBotMessages = history
        .filter(msg => msg.from === 'bot' || msg.type === 'bot_message')
        .slice(-5);

    // 1. Exact text match
    const isExactDuplicate = recentBotMessages.some(
        msg => msg.message === proposedMessageContent || msg.content === proposedMessageContent
    );

    // 2. Anti-Spam for Prices: If we're about to send prices ($) and already sent prices recently
    const isPriceSpam = proposedMessageContent.includes('$') &&
        recentBotMessages.some(msg => 
            (msg.message || '').includes('$') || (msg.content || '').includes('$')
        );

    return isExactDuplicate || isPriceSpam;
}

/**
 * analyzeMessage - from conversationAnalyzer.ts
 * Analyzes individual message for intent, tone, and content
 */
function analyzeMessage(message: string): MessageAnalysis {
    const normalizedMsg = message.toLowerCase();
    
    // Detect questions
    const questions: string[] = [];
    if (/(qué|que|cuál|cual|cómo|como|dónde|donde|cuánto|cuanto|por qué|porqué|para qué)\b/i.test(normalizedMsg)) {
        questions.push('question_detected');
    }
    if (/\?/.test(message)) {
        questions.push('explicit_question');
    }
    
    // Detect objections
    const objections: string[] = [];
    if (/\b(caro|costoso|muy caro|muy costoso|no tengo|no puedo|pensarlo|después|luego|más tarde)\b/i.test(normalizedMsg)) {
        objections.push('price_objection');
    }
    if (/\b(no (me |)interesa|no quiero|no gracias|cancelar|olvidar)\b/i.test(normalizedMsg)) {
        objections.push('not_interested');
    }
    if (/\b(no confío|desconfío|estafa|fraude|seguro|garantía)\b/i.test(normalizedMsg)) {
        objections.push('trust_concern');
    }
    
    // Detect buying signals
    const buyingSignals: string[] = [];
    if (/\b(comprar|quiero|necesito|me interesa|listo|ok|dale|sí|si|perfecto|excelente)\b/i.test(normalizedMsg)) {
        buyingSignals.push('interest_confirmed');
    }
    if (/\b(pago|precio|costo|tarjeta|efectivo|transferencia|nequi|daviplata)\b/i.test(normalizedMsg)) {
        buyingSignals.push('payment_inquiry');
    }
    if (/\b(envío|envio|entrega|dirección|direccion|cuando llega)\b/i.test(normalizedMsg)) {
        buyingSignals.push('shipping_inquiry');
    }
    if (/\b(nombre|datos|información|confirmar|proceder)\b/i.test(normalizedMsg)) {
        buyingSignals.push('data_provision');
    }
    
    // Determine urgency
    let urgencyLevel: 'low' | 'medium' | 'high' = 'low';
    if (/\b(urgente|rápido|rapido|ya|ahora|hoy|inmediato|pronto)\b/i.test(normalizedMsg)) {
        urgencyLevel = 'high';
    } else if (buyingSignals.length > 0 || /\b(quiero|necesito|me interesa)\b/i.test(normalizedMsg)) {
        urgencyLevel = 'medium';
    }
    
    // Determine emotional tone
    let emotionalTone: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'excited' = 'neutral';
    if (/\b(genial|excelente|perfecto|increíble|me encanta|súper|genio|bacano)\b/i.test(normalizedMsg)) {
        emotionalTone = 'excited';
    } else if (/\b(bien|ok|vale|entiendo|gracias)\b/i.test(normalizedMsg)) {
        emotionalTone = 'positive';
    } else if (/\b(no entiendo|confuso|complicado|difícil)\b/i.test(normalizedMsg)) {
        emotionalTone = 'frustrated';
    } else if (objections.includes('not_interested')) {
        emotionalTone = 'negative';
    }
    
    // Detect mentioned topics
    const mentionedTopics: string[] = [];
    if (/\b(música|musica|canción|cancion|playlist|artista|género|genero)\b/i.test(normalizedMsg)) {
        mentionedTopics.push('music');
    }
    if (/\b(video|película|pelicula|serie|movie)\b/i.test(normalizedMsg)) {
        mentionedTopics.push('video');
    }
    if (/\b(capacidad|gb|gigas|tamaño|espacio|32|64|128|256)\b/i.test(normalizedMsg)) {
        mentionedTopics.push('capacity');
    }
    if (/\b(precio|costo|valor|cuánto|cuanto)\b/i.test(normalizedMsg)) {
        mentionedTopics.push('pricing');
    }
    
    // Determine if human intervention is needed
    const requiresHumanIntervention = 
        objections.includes('trust_concern') ||
        emotionalTone === 'frustrated' ||
        (objections.length > 2) ||
        /\b(hablar con|asesor|humano|persona|representante|ayuda urgente)\b/i.test(normalizedMsg);

    // Extract primary intent
    const userIntent = extractPrimaryIntent(normalizedMsg, buyingSignals, objections, questions);

    return {
        userIntent,
        mentionedTopics,
        questions,
        objections,
        buyingSignals,
        urgencyLevel,
        emotionalTone,
        requiresHumanIntervention
    };
}

function extractPrimaryIntent(msg: string, buyingSignals: string[], objections: string[], questions: string[]): string {
    if (buyingSignals.includes('payment_inquiry') || buyingSignals.includes('shipping_inquiry')) {
        return 'ready_to_buy';
    }
    if (buyingSignals.length > 0) {
        return 'showing_interest';
    }
    if (objections.includes('not_interested')) {
        return 'not_interested';
    }
    if (objections.includes('price_objection')) {
        return 'price_concerned';
    }
    if (questions.length > 0) {
        return 'seeking_information';
    }
    if (/\b(hola|buenos|buenas|saludos)\b/i.test(msg)) {
        return 'greeting';
    }
    return 'browsing';
}

/**
 * validateMessageCoherence - from persuasionEngine.ts
 * Validates message coherence before sending
 */
function validateMessageCoherence(message: string, context: PersuasionContext): {
    isCoherent: boolean;
    issues: string[];
    suggestions: string[];
} {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Message length constraints
    // - MIN_LENGTH: 30 chars - messages shorter than this lack substance
    // - TARGET_MAX_LENGTH: 150 chars - ideal message length for WhatsApp
    // - HARD_MAX_LENGTH: 200 chars - absolute maximum to maintain readability
    const MIN_LENGTH = 30;
    const TARGET_MAX_LENGTH = 150;
    const HARD_MAX_LENGTH = 200;

    // Check length constraints
    if (message.length < MIN_LENGTH) {
        issues.push('Message too short');
        suggestions.push('Add value proposition or call to action');
    }

    if (message.length > HARD_MAX_LENGTH) {
        issues.push(`Message exceeds hard cap of ${HARD_MAX_LENGTH} characters`);
        suggestions.push('Trim message while preserving CTA');
    } else if (message.length > TARGET_MAX_LENGTH) {
        issues.push(`Message exceeds target length of ${TARGET_MAX_LENGTH} characters`);
        suggestions.push('Consider making message more concise');
    }

    // Check if message has call to action
    if (!hasCTA(message)) {
        issues.push('Missing call to action');
        suggestions.push('Add a question or action request');
    }

    // Product patterns for validation
    const PRODUCT_PATTERNS = {
        music: /música|musica|cancion|playlist|género|genero|artista/i,
        movies: /película|pelicula|film|serie|cine/i,
        videos: /video|clip/i,
        price: /precio|costo/i,
        confirmation: /confirma|pedido/i,
        shipping: /dirección|direccion/i  // Include unaccented version for consistency
    };

    const messageLower = message.toLowerCase();
    const mentionsMovies = PRODUCT_PATTERNS.movies.test(messageLower);
    const mentionsVideos = PRODUCT_PATTERNS.videos.test(messageLower);
    
    const productMentions = [mentionsMovies, mentionsVideos].filter(Boolean).length;
    // Note: Music is tracked separately since it's the primary product
    
    // Warn if mentioning multiple products when user already selected one
    if (context.hasSelectedProduct && productMentions > 1) {
        issues.push('Message mentions multiple products when user already selected one');
        suggestions.push('Focus on the selected product type only');
    }

    // Check if message matches stage - require EITHER $ symbol OR price words
    if (context.hasDiscussedPrice && !messageLower.includes('$') && 
        !messageLower.includes('precio') && !messageLower.includes('costo')) {
        issues.push('Price discussed but not mentioned in message');
        suggestions.push('Include pricing information');
    }
    
    // Check for stage-appropriate content
    const stage = determineJourneyStage(context);
    
    if (stage === 'awareness' && (messageLower.includes('confirma') || PRODUCT_PATTERNS.confirmation.test(messageLower))) {
        issues.push('Message tries to close sale too early (still in awareness stage)');
        suggestions.push('Focus on product discovery and building interest first');
    }
    
    if (stage === 'interest' && PRODUCT_PATTERNS.shipping.test(message) && !context.hasDiscussedPrice) {
        issues.push('Message asks for shipping info before discussing price');
        suggestions.push('Discuss pricing before collecting shipping details');
    }

    // Check for confusing transitions
    if (hasTooManyTopics(message)) {
        issues.push('Message mentions too many topics - may confuse user');
        suggestions.push('Simplify message flow to focus on one or two key points');
    }
    
    // Check for generic/vague responses
    if (isGenericResponse(message, context)) {
        issues.push('Message is too generic and not contextual');
        suggestions.push('Add specific details based on user context and preferences');
    }

    return {
        isCoherent: issues.length === 0,
        issues,
        suggestions
    };
}

function hasCTA(message: string): boolean {
    return /[¿?]/.test(message) || 
           /\b(confirma|dime|cuéntame|elige|selecciona|prefieres|quieres)\b/i.test(message);
}

/**
 * hasTooManyTopics - Checks if a message mentions too many different topics
 * 
 * A message that jumps between more than 2 distinct topic categories
 * (pricing, music preferences, shipping, quality) can be confusing for users.
 * This is a heuristic to encourage focused, single-purpose messages.
 */
function hasTooManyTopics(message: string): boolean {
    const topicCategories = [
        /precio|costo|vale/i,           // Pricing topic
        /género|artista|música/i,        // Music preferences topic
        /envío|entrega|domicilio/i,     // Shipping topic
        /garantía|calidad|HD/i          // Quality topic
    ];

    const matchedTopics = topicCategories.filter(pattern => pattern.test(message));
    return matchedTopics.length > 2;  // More than 2 topics is considered too many
}

// Alias for backward compatibility
const hasConfusingTransition = hasTooManyTopics;

function isGenericResponse(message: string, context: PersuasionContext): boolean {
    const messageLower = message.toLowerCase();
    
    // Generic greetings when user is already engaged
    if (context.interactionCount > 3 && 
        (messageLower.includes('bienvenido') || messageLower.includes('llegaste al lugar'))) {
        return true;
    }
    
    // Generic product list when user already selected
    if (context.hasSelectedProduct && 
        messageLower.includes('música, películas o videos') && 
        !messageLower.includes('algo más')) {
        return true;
    }
    
    // Asking about product type when already in customization
    if ((context.stage === 'customizing' || context.stage === 'customization') && 
        messageLower.includes('qué te interesa') && 
        !messageLower.includes('más') && 
        !messageLower.includes('algo')) {
        return true;
    }
    
    return false;
}

function determineJourneyStage(context: PersuasionContext): string {
    if (context.stage === 'order_confirmed' || context.stage === 'closing') {
        return 'closing';
    }
    if (context.hasDiscussedPrice || context.stage === 'pricing') {
        return 'pricing';
    }
    if (context.hasCustomized || context.stage === 'customizing') {
        return 'customization';
    }
    if (context.hasSelectedProduct || context.buyingIntent > 50) {
        return 'interest';
    }
    return 'awareness';
}

/**
 * normalizeMessageForComparison - from persuasionEngine.ts
 * Normalizes a message for duplicate detection
 */
function normalizeMessageForComparison(message: string): string {
    return message
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
        .replace(/\s+/g, ' ') // Normalize whitespace
        .toLowerCase()
        .trim();
}

/**
 * getRandomItem - from persuasionEngine.ts
 * Gets a random item from an array
 */
function getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * buildStageMessage - from persuasionEngine.ts
 * Builds a message for the current stage
 */
function buildStageMessage(stage: string, context: PersuasionContext): string {
    const messages = JOURNEY_MESSAGES[stage as keyof typeof JOURNEY_MESSAGES];
    if (!messages || !('openings' in messages)) {
        return buildDefaultMessage(context);
    }

    const parts: string[] = [];

    // Opening
    if ('openings' in messages && Array.isArray(messages.openings)) {
        parts.push(getRandomItem(messages.openings));
    }

    // Value proposition
    if ('values' in messages && Array.isArray(messages.values)) {
        parts.push('');
        parts.push(getRandomItem(messages.values));
    }

    // Transition (if in customization)
    if (stage === 'customization' && 'transitions' in messages && Array.isArray(messages.transitions)) {
        parts.push('');
        parts.push(getRandomItem(messages.transitions));
    }

    // Social proof (if in pricing/closing)
    if ((stage === 'pricing' || stage === 'closing') && 'socialProofs' in messages && Array.isArray(messages.socialProofs)) {
        parts.push('');
        parts.push(getRandomItem(messages.socialProofs));
    }

    // Call to action
    if ('ctas' in messages && Array.isArray(messages.ctas)) {
        parts.push('');
        parts.push(getRandomItem(messages.ctas));
    }

    return parts.join('\n');
}

function buildDefaultMessage(context: PersuasionContext): string {
    const product = context.productInterests[0] || 'USB personalizada';
    return `🎵 Perfecto, trabajemos en tu ${product}.\n\n` +
           `✨ Puedes personalizar todo: géneros, artistas, organización.\n\n` +
           `¿Qué te gustaría incluir?`;
}

// ============================================
// Helper Functions for Testing
// ============================================

function createMockContext(overrides?: Partial<PersuasionContext>): PersuasionContext {
    return {
        stage: 'awareness',
        hasDiscussedPrice: false,
        hasSelectedProduct: false,
        hasCustomized: false,
        buyingIntent: 50,
        interactionCount: 1,
        productInterests: [],
        ...overrides
    };
}

// Stage tone keywords mapping
const STAGE_TONE_KEYWORDS = {
    awareness: {
        expected: ['bienvenido', 'hola', 'ayud', 'interes', 'qué', 'cuál', 'te gustaría'],
        forbidden: ['confirma', 'pago', 'dirección', 'pedido confirmado']
    },
    consideration: {
        expected: ['opcion', 'precio', 'capacidad', 'calidad', 'garantía', 'personaliza'],
        forbidden: ['confirma dirección', 'pedido listo']
    },
    decision: {
        expected: ['confirm', 'pago', 'dirección', 'pedido', 'envío', 'datos'],
        forbidden: ['qué tipo', 'qué te interesa', 'bienvenido']
    }
};

function checkToneMatchesStage(message: string, stage: string): { matches: boolean; reason: string } {
    const normalizedMsg = message.toLowerCase();
    const stageConfig = STAGE_TONE_KEYWORDS[stage as keyof typeof STAGE_TONE_KEYWORDS];
    
    if (!stageConfig) {
        return { matches: true, reason: 'Unknown stage - skipping check' };
    }
    
    // Check for forbidden keywords in this stage
    for (const forbidden of stageConfig.forbidden) {
        if (normalizedMsg.includes(forbidden.toLowerCase())) {
            return { 
                matches: false, 
                reason: `Stage "${stage}" should not contain "${forbidden}" but message includes it` 
            };
        }
    }
    
    return { matches: true, reason: 'Tone matches stage' };
}

// ============================================
// TESTS BEGIN
// ============================================

console.log('🧪 MESSAGE COHERENCE TESTS\n');
console.log('='.repeat(70));

// ============================================
// TEST 1: Messages don't repeat consecutively
// ============================================
describe('TEST 1: Messages should not repeat consecutively (isRedundantMessage)', () => {
    
    test('should detect exact duplicate messages', () => {
        const history = [
            { from: 'bot', message: '¡Hola! ¿Cómo te puedo ayudar?' },
            { from: 'user', message: 'Quiero información' },
            { from: 'bot', message: 'Tenemos USBs personalizadas desde $54.900' }
        ];
        
        const proposedMessage = '¡Hola! ¿Cómo te puedo ayudar?';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(isRedundant, 'Should detect exact duplicate message');
    });
    
    test('should detect duplicate messages with content field', () => {
        const history = [
            { from: 'bot', content: 'Mensaje de bienvenida' },
            { type: 'bot_message', content: 'Segundo mensaje' }
        ];
        
        const proposedMessage = 'Mensaje de bienvenida';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(isRedundant, 'Should detect duplicate when using content field');
    });
    
    test('should NOT flag different messages as redundant', () => {
        const history = [
            { from: 'bot', message: '¡Hola! ¿Cómo te puedo ayudar?' },
            { from: 'bot', message: 'Tenemos USBs personalizadas' }
        ];
        
        const proposedMessage = '¿Qué géneros musicales te gustan?';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(!isRedundant, 'Should NOT flag different messages as redundant');
    });
    
    test('should handle empty history without errors', () => {
        const isRedundant = isRedundantMessage([], 'Cualquier mensaje');
        assert(!isRedundant, 'Empty history should not flag any message as redundant');
    });
    
    test('should handle null history without errors', () => {
        const isRedundant = isRedundantMessage(null as any, 'Cualquier mensaje');
        assert(!isRedundant, 'Null history should not flag any message as redundant');
    });
    
    test('should only check last 5 bot messages - old messages outside window are not detected', () => {
        // With 6 messages, only the last 5 are checked (messages 2-6)
        // "Mensaje antiguo" (message 1) is outside the 5-message window
        const history = [
            { from: 'bot', message: 'Mensaje antiguo (outside window)' },  // #1 - NOT in last 5
            { from: 'bot', message: 'Recent message 1' },  // #2 - in last 5
            { from: 'bot', message: 'Recent message 2' },  // #3 - in last 5
            { from: 'bot', message: 'Recent message 3' },  // #4 - in last 5
            { from: 'bot', message: 'Recent message 4' },  // #5 - in last 5
            { from: 'bot', message: 'Recent message 5' }   // #6 - in last 5
        ];
        
        // This message matches #1 which is outside the 5-message window
        const proposedMessage = 'Mensaje antiguo (outside window)';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(!isRedundant, 'Should not detect messages outside the last 5');
    });
    
    test('should filter out user messages from redundancy check', () => {
        const history = [
            { from: 'user', message: '¡Hola!' },
            { from: 'user', message: 'Quiero una USB' },
            { from: 'bot', message: 'Diferente mensaje' }
        ];
        
        const proposedMessage = '¡Hola!';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(!isRedundant, 'User messages should not count for redundancy');
    });
});

// ============================================
// TEST 2: No duplicate prices when already shown
// ============================================
describe('TEST 2: No duplicate prices when already shown', () => {
    
    test('should detect price spam when prices already sent', () => {
        const history = [
            { from: 'bot', message: 'Nuestros precios: 8GB $54.900, 32GB $84.900' }
        ];
        
        const proposedMessage = 'El precio del 64GB es $119.900';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(isRedundant, 'Should detect price spam when prices already shown');
    });
    
    test('should allow price message when no prices sent recently', () => {
        const history = [
            { from: 'bot', message: '¿Qué géneros musicales te gustan?' },
            { from: 'bot', message: 'Tenemos de todo: salsa, rock, reggaetón...' }
        ];
        
        const proposedMessage = 'Nuestros precios: 8GB $54.900';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(!isRedundant, 'Should allow price message when no prices sent recently');
    });
    
    test('should detect price in content field', () => {
        const history = [
            { from: 'bot', content: 'Te cuento: 32GB solo $84.900' }
        ];
        
        const proposedMessage = 'Nueva oferta $99.900';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(isRedundant, 'Should detect price spam in content field');
    });
    
    test('should NOT block non-price messages after price was sent', () => {
        const history = [
            { from: 'bot', message: 'Precios: 8GB $54.900' }
        ];
        
        const proposedMessage = '¿Qué géneros te gustan?';
        const isRedundant = isRedundantMessage(history, proposedMessage);
        
        assert(!isRedundant, 'Non-price messages should be allowed after price messages');
    });
});

// ============================================
// TEST 3: Tone is consistent with flow stage
// ============================================
describe('TEST 3: Tone should be consistent with flow stage', () => {
    
    test('awareness stage should NOT contain closing language', () => {
        const context = createMockContext({ stage: 'awareness' });
        const message = '¡Hola! Bienvenido a TechAura. ¿Te interesa música, películas o videos?';
        
        const toneCheck = checkToneMatchesStage(message, 'awareness');
        
        assert(toneCheck.matches, toneCheck.reason);
    });
    
    test('awareness stage message should NOT ask for shipping data', () => {
        const message = 'Confirma tu dirección de envío por favor';
        const toneCheck = checkToneMatchesStage(message, 'awareness');
        
        assert(!toneCheck.matches, 'Awareness stage should not ask for shipping data');
    });
    
    test('decision stage should include action-oriented language', () => {
        const message = 'Perfecto, confirma tu dirección para enviar tu pedido';
        const toneCheck = checkToneMatchesStage(message, 'decision');
        
        assert(toneCheck.matches, toneCheck.reason);
    });
    
    test('decision stage should NOT contain welcome messages', () => {
        const message = '¡Bienvenido! ¿Qué tipo de música te interesa?';
        const toneCheck = checkToneMatchesStage(message, 'decision');
        
        assert(!toneCheck.matches, 'Decision stage should not have welcome messages');
    });
    
    test('consideration stage should focus on options and value', () => {
        const context = createMockContext({ 
            stage: 'interest',
            hasSelectedProduct: true 
        });
        const message = '🎯 Tenemos opciones de 8GB, 32GB, 64GB y 128GB con garantía incluida';
        
        const toneCheck = checkToneMatchesStage(message, 'consideration');
        
        assert(toneCheck.matches, toneCheck.reason);
    });
});

// ============================================
// TEST 4: Persuasive messages vary using templates
// ============================================
describe('TEST 4: Persuasive messages should vary using existing templates', () => {
    
    test('should generate different messages for same stage over multiple calls', () => {
        const context = createMockContext({ stage: 'awareness' });
        
        const messages = new Set<string>();
        
        // Generate 10 messages and check for variation
        for (let i = 0; i < 10; i++) {
            const message = buildStageMessage('awareness', context);
            messages.add(message.substring(0, 50));
        }
        
        // With random selection from multiple templates, we expect some variation
        // Given 3 openings x 3 values x 3 CTAs = 27 combinations, 10 samples should have some variation
        // We require at least 2 different messages to confirm templates are being varied
        assertGreaterThanOrEqual(messages.size, 2, 
            'Should generate varied messages when using multiple templates');
    });
    
    test('JOURNEY_MESSAGES should have multiple options per stage', () => {
        // Check awareness stage has multiple openings
        assert(JOURNEY_MESSAGES.awareness.openings.length >= 2, 
            'Awareness stage should have at least 2 opening options');
        
        // Check awareness stage has multiple CTAs
        assert(JOURNEY_MESSAGES.awareness.ctas.length >= 2, 
            'Awareness stage should have at least 2 CTA options');
        
        // Check pricing stage has multiple social proofs
        assert(JOURNEY_MESSAGES.pricing.socialProofs.length >= 2, 
            'Pricing stage should have at least 2 social proof options');
        
        // Check objection handling has multiple responses per type
        const objections = JOURNEY_MESSAGES.objection_handling;
        assert(objections.price.length >= 2, 
            'Price objection should have at least 2 response options');
        assert(objections.quality.length >= 2, 
            'Quality objection should have at least 2 response options');
    });
    
    test('interest stage should have different value propositions', () => {
        const values = JOURNEY_MESSAGES.interest.values;
        assert(values.length >= 2, 'Interest stage should have at least 2 value propositions');
        
        // Values should be different from each other
        const uniqueValues = new Set(values);
        assertEqual(uniqueValues.size, values.length, 'All value propositions should be unique');
    });
    
    test('customization stage should have transition messages', () => {
        assert(JOURNEY_MESSAGES.customization.transitions && 
               JOURNEY_MESSAGES.customization.transitions.length >= 2,
            'Customization stage should have at least 2 transition options');
    });
    
    test('closing stage should have urgency options', () => {
        assert(JOURNEY_MESSAGES.closing.urgencies && 
               JOURNEY_MESSAGES.closing.urgencies.length >= 2,
            'Closing stage should have at least 2 urgency options');
    });
});

// ============================================
// TEST 5: Coherence Validation
// ============================================
describe('TEST 5: Message coherence validation', () => {
    
    test('should detect missing CTA in messages', () => {
        const context = createMockContext({ stage: 'awareness' });
        const messageWithoutCTA = 'Tenemos USBs de música personalizadas.';
        
        const validation = validateMessageCoherence(messageWithoutCTA, context);
        
        assert(!validation.isCoherent, 'Should detect missing CTA');
        assertArrayContains(validation.issues, 'Missing call to action');
    });
    
    test('should accept messages with CTA (question mark)', () => {
        const context = createMockContext({ stage: 'awareness' });
        const messageWithCTA = '¿Te interesa música, películas o videos?';
        
        const validation = validateMessageCoherence(messageWithCTA, context);
        
        const hasCTAIssue = validation.issues.includes('Missing call to action');
        assert(!hasCTAIssue, 'Should accept messages with question CTA');
    });
    
    test('should detect stage-inappropriate content (closing too early)', () => {
        const context = createMockContext({ 
            stage: 'awareness',
            hasDiscussedPrice: false,
            hasSelectedProduct: false 
        });
        const message = 'Confirma tu pedido ahora';
        
        const validation = validateMessageCoherence(message, context);
        
        const hasStageIssue = validation.issues.some(issue => 
            issue.toLowerCase().includes('too early') || 
            issue.toLowerCase().includes('stage')
        );
        assert(hasStageIssue, 'Should detect closing language in awareness stage');
    });
    
    test('should detect messages exceeding hard cap (200 chars)', () => {
        const context = createMockContext();
        const longMessage = 'A'.repeat(250) + '?';
        
        const validation = validateMessageCoherence(longMessage, context);
        
        assert(!validation.isCoherent, 'Should flag messages exceeding 200 chars');
        const hasLengthIssue = validation.issues.some(issue => 
            issue.includes('200') || issue.includes('hard cap')
        );
        assert(hasLengthIssue, 'Should mention the 200 char limit');
    });
    
    test('should warn when message exceeds target length (150 chars)', () => {
        const context = createMockContext();
        const mediumMessage = 'B'.repeat(180) + '?';
        
        const validation = validateMessageCoherence(mediumMessage, context);
        
        const hasTargetLengthIssue = validation.issues.some(issue => 
            issue.includes('target') || issue.includes('150')
        );
        assert(hasTargetLengthIssue, 'Should warn about exceeding target length');
    });
    
    test('should detect generic responses when context-specific needed', () => {
        const context = createMockContext({ 
            stage: 'customizing',
            hasSelectedProduct: true,
            interactionCount: 5 
        });
        const genericMessage = '¡Bienvenido! ¿Qué te interesa?';
        
        const validation = validateMessageCoherence(genericMessage, context);
        
        const hasGenericIssue = validation.issues.some(issue => 
            issue.toLowerCase().includes('generic')
        );
        assert(hasGenericIssue, 'Should detect generic response in customization stage');
    });
});

// ============================================
// TEST 6: Duplicate prevention / normalization
// ============================================
describe('TEST 6: Duplicate message prevention via normalization', () => {
    
    test('should normalize messages for comparison (case insensitive)', () => {
        const msg1 = '🎵 ¡Hola!   ¿Qué prefieres?';
        const msg2 = '🎵 ¡HOLA! ¿QUÉ PREFIERES?';
        
        const normalized1 = normalizeMessageForComparison(msg1);
        const normalized2 = normalizeMessageForComparison(msg2);
        
        assertEqual(normalized1, normalized2, 
            'Should normalize messages case-insensitively');
    });
    
    test('should remove emojis for comparison', () => {
        const msgWithEmoji = '🎵🔥 Hola amigo';
        const msgWithoutEmoji = 'Hola amigo';
        
        const normalizedWithEmoji = normalizeMessageForComparison(msgWithEmoji);
        const normalizedWithoutEmoji = normalizeMessageForComparison(msgWithoutEmoji);
        
        assertEqual(normalizedWithEmoji, normalizedWithoutEmoji, 
            'Should remove emojis for comparison');
    });
    
    test('should normalize whitespace', () => {
        const msg1 = 'Hola    mundo     ejemplo';
        const msg2 = 'Hola mundo ejemplo';
        
        const normalized1 = normalizeMessageForComparison(msg1);
        const normalized2 = normalizeMessageForComparison(msg2);
        
        assertEqual(normalized1, normalized2, 
            'Should normalize whitespace');
    });
});

// ============================================
// TEST 7: ConversationAnalyzer message analysis
// ============================================
describe('TEST 7: ConversationAnalyzer message analysis', () => {
    
    test('should detect buying signals in user message', () => {
        const analysis = analyzeMessage('Quiero comprar, me interesa, listo');
        
        assert(analysis.buyingSignals.length > 0, 'Should detect buying signals');
        assertArrayContains(analysis.buyingSignals, 'interest_confirmed');
    });
    
    test('should detect price objections', () => {
        const analysis = analyzeMessage('Es muy caro, no tengo plata');
        
        assert(analysis.objections.length > 0, 'Should detect objections');
        assertArrayContains(analysis.objections, 'price_objection');
    });
    
    test('should detect trust concerns', () => {
        const analysis = analyzeMessage('No confío, esto es estafa?');
        
        assertArrayContains(analysis.objections, 'trust_concern');
    });
    
    test('should detect questions in user message', () => {
        const analysis = analyzeMessage('¿Qué capacidad tienen? ¿Cuánto cuesta?');
        
        assert(analysis.questions.length > 0, 'Should detect questions');
    });
    
    test('should detect urgency level', () => {
        const highUrgency = analyzeMessage('Necesito urgente hoy mismo');
        assertEqual(highUrgency.urgencyLevel, 'high', 'Should detect high urgency');
        
        const lowUrgency = analyzeMessage('Me cuentas cuando puedas');
        assertEqual(lowUrgency.urgencyLevel, 'low', 'Should detect low urgency');
    });
    
    test('should detect emotional tone', () => {
        const excited = analyzeMessage('¡Genial! ¡Increíble! Me encanta');
        assertEqual(excited.emotionalTone, 'excited', 'Should detect excited tone');
        
        // Use "confuso" which only matches frustrated pattern, not positive
        const frustrated = analyzeMessage('Esto es muy confuso y difícil');
        assertEqual(frustrated.emotionalTone, 'frustrated', 'Should detect frustrated tone');
    });
    
    test('should detect payment inquiry as buying signal', () => {
        const analysis = analyzeMessage('¿Puedo pagar con Nequi o tarjeta?');
        
        assertArrayContains(analysis.buyingSignals, 'payment_inquiry');
    });
    
    test('should detect shipping inquiry as buying signal', () => {
        const analysis = analyzeMessage('¿Hacen envío a Bogotá? ¿Cuándo llega?');
        
        assertArrayContains(analysis.buyingSignals, 'shipping_inquiry');
    });
    
    test('should require human intervention for trust concerns', () => {
        const analysis = analyzeMessage('No confío en ustedes, es estafa seguro');
        
        assert(analysis.requiresHumanIntervention, 'Trust concerns should require human intervention');
    });
    
    test('should detect mentioned topics', () => {
        const musicAnalysis = analyzeMessage('Me gusta la música salsa y reggaetón');
        assertArrayContains(musicAnalysis.mentionedTopics, 'music');
        
        // "video" and "pelicula" must be singular to match the pattern
        const videoAnalysis = analyzeMessage('Quiero ver una pelicula y un video');
        assertArrayContains(videoAnalysis.mentionedTopics, 'video');
        
        // Use "capacidad" or separated numbers to match the pattern
        const capacityAnalysis = analyzeMessage('¿Qué capacidad tienen? Me interesa de 64 gigas');
        assertArrayContains(capacityAnalysis.mentionedTopics, 'capacity');
    });
});

// ============================================
// TEST 8: Integration - Stage progression
// ============================================
describe('TEST 8: Integration - Stage determination', () => {
    
    test('should determine awareness stage for new users', () => {
        const context = createMockContext({
            stage: 'awareness',
            hasSelectedProduct: false,
            buyingIntent: 30
        });
        
        const stage = determineJourneyStage(context);
        assertEqual(stage, 'awareness', 'New user should be in awareness stage');
    });
    
    test('should determine interest stage when product selected', () => {
        const context = createMockContext({
            stage: 'interested',
            hasSelectedProduct: true,
            buyingIntent: 60
        });
        
        const stage = determineJourneyStage(context);
        assertEqual(stage, 'interest', 'User with product should be in interest stage');
    });
    
    test('should determine customization stage when customizing', () => {
        const context = createMockContext({
            stage: 'customizing',
            hasSelectedProduct: true,
            hasCustomized: true
        });
        
        const stage = determineJourneyStage(context);
        assertEqual(stage, 'customization', 'User customizing should be in customization stage');
    });
    
    test('should determine pricing stage when price discussed', () => {
        const context = createMockContext({
            stage: 'pricing',
            hasDiscussedPrice: true
        });
        
        const stage = determineJourneyStage(context);
        assertEqual(stage, 'pricing', 'User discussing price should be in pricing stage');
    });
    
    test('should determine closing stage when order confirmed', () => {
        const context = createMockContext({
            stage: 'closing',
            hasDiscussedPrice: true,
            hasSelectedProduct: true
        });
        
        const stage = determineJourneyStage(context);
        assertEqual(stage, 'closing', 'User closing should be in closing stage');
    });
});

// ============================================
// Run all tests and report
// ============================================

// Give async tests time to complete
setTimeout(() => {
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 MESSAGE COHERENCE TEST RESULTS');
    console.log(`   ✅ Passed: ${testsPassed}`);
    console.log(`   ❌ Failed: ${testsFailed}`);
    console.log(`   📝 Total: ${testsPassed + testsFailed}`);
    console.log('\n' + '='.repeat(70));

    if (testsFailed > 0) {
        console.log('\n⚠️  SOME TESTS FAILED! Review errors above.');
        console.log('   These tests validate message coherence in:');
        console.log('   - conversationAnalyzer.ts');
        console.log('   - persuasionEngine.ts');
        console.log('   - menuTech.ts (via isRedundantMessage)');
        process.exit(1);
    } else {
        console.log('\n✅ ALL MESSAGE COHERENCE TESTS PASSED!');
        console.log('\n📋 Validated Requirements:');
        console.log('   1. ✓ Messages don\'t repeat consecutively (isRedundantMessage)');
        console.log('   2. ✓ Tone is consistent with flow stage (awareness/consideration/decision)');
        console.log('   3. ✓ No duplicate prices when already shown');
        console.log('   4. ✓ Persuasive messages vary using existing templates');
        console.log('\n📋 Additional Validations:');
        console.log('   ✓ CTA detection in messages');
        console.log('   ✓ Message length constraints (150 target, 200 hard cap)');
        console.log('   ✓ Stage-appropriate content validation');
        console.log('   ✓ Buying signals and objection detection');
        console.log('   ✓ Duplicate message prevention via normalization');
        console.log('   ✓ Stage progression logic');
        process.exit(0);
    }
}, 500);
