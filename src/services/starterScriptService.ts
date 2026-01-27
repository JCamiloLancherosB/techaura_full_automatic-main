/**
 * Starter Script Service
 * 
 * Handles the redesigned first exchange (first 1-3 messages) for:
 * - Variant A: User says "me interesa USB con música / videos"
 * - Variant B: User says "hola / info"
 * 
 * Key principles:
 * 1. Confirm product (Music / Videoclips)
 * 2. Give 3-4 quick text options (e.g., "1) Salsa 2) Reggaetón 3) Rancheras 4) Otro")
 * 3. Ask ONE thing per turn (avoid double questions)
 * 4. Store expectedInput and lastQuestionId for continuity
 * 5. Concise value proposition (HD/4K, TV/car/cell, free changes)
 */

import type { UserSession } from '../../types/global';
import { flowContinuityService } from './FlowContinuityService';
import type { ExpectedInputType } from '../types/flowState';

// ============ Types ============
export type ProductType = 'music' | 'videos' | 'movies' | 'unknown';
export type StarterVariant = 'A' | 'B';

export interface StarterContext {
    phone: string;
    userName: string;
    variant: StarterVariant;
    detectedProduct: ProductType;
    message: string;
}

export interface StarterResponse {
    messages: string[];
    flowId: string;
    step: string;
    expectedInput: ExpectedInputType;
    questionId: string;
    questionText: string;
}

// ============ Genre Options by Product ============
const MUSIC_GENRE_OPTIONS = [
    { key: '1', label: 'Salsa', emoji: '💃' },
    { key: '2', label: 'Reggaetón', emoji: '🔥' },
    { key: '3', label: 'Rancheras', emoji: '🤠' },
    { key: '4', label: 'Rock/Pop', emoji: '🎸' },
    { key: '5', label: 'Baladas', emoji: '🎵' },
    { key: 'otro', label: 'Otro: escribe cuál', emoji: '✨' }
];

const VIDEO_GENRE_OPTIONS = [
    { key: '1', label: 'Acción', emoji: '💥' },
    { key: '2', label: 'Comedia', emoji: '😂' },
    { key: '3', label: 'Drama', emoji: '🎭' },
    { key: '4', label: 'Animadas', emoji: '🎨' },
    { key: '5', label: 'Terror', emoji: '👻' },
    { key: 'otro', label: 'Otro: escribe cuál', emoji: '✨' }
];

const MOVIE_GENRE_OPTIONS = VIDEO_GENRE_OPTIONS; // Same as videos for consistency

// ============ Detection Patterns ============
const MUSIC_PATTERNS = [
    /\bm[uú]sica\b/i,
    /\bmusica\b/i,
    /\bcanciones?\b/i,
    /\busb\s+(de\s+)?m[uú]sica/i,
    /\busb\s+(con\s+)?m[uú]sica/i
];

const VIDEO_PATTERNS = [
    /\bv[ií]deos?\b/i,
    /\bvideos?\b/i,
    /\bclips?\b/i,
    /\bvideoclips?\b/i,
    /\busb\s+(de\s+)?v[ií]deos?/i,
    /\busb\s+(con\s+)?v[ií]deos?/i
];

const MOVIE_PATTERNS = [
    /\bpel[ií]culas?\b/i,
    /\bpeliculas?\b/i,
    /\bseries?\b/i,
    /\bmovies?\b/i,
    /\busb\s+(de\s+)?pel[ií]culas?/i,
    /\busb\s+(con\s+)?pel[ií]culas?/i
];

const GREETING_PATTERNS = [
    /^hola\b/i,
    /^buenas?\b/i,
    /^buenos\s+d[ií]as?\b/i,
    /^buenas\s+tardes?\b/i,
    /^buenas\s+noches?\b/i,
    /^holi\b/i,
    /^hey\b/i,
    /^info\b/i,
    /^informaci[oó]n\b/i,
    /^me\s+interesa\b/i
];

// ============ Value Propositions (concise) ============
const VALUE_PROPS = {
    music: '🎵 Calidad HD 320kbps • Para TV, carro o celular • Cambios gratis si no te gusta',
    videos: '📹 HD/4K • Para TV, carro o celular • Cambios gratis si no te gusta',
    movies: '🎬 HD/4K • Para TV, carro o celular • Cambios gratis si no te gusta'
};

// ============ Main Service Class ============
export class StarterScriptService {
    private static instance: StarterScriptService;

    static getInstance(): StarterScriptService {
        if (!StarterScriptService.instance) {
            StarterScriptService.instance = new StarterScriptService();
        }
        return StarterScriptService.instance;
    }

    /**
     * Detect which product type the user is interested in
     */
    detectProduct(message: string): ProductType {
        const normalizedMessage = message.toLowerCase().trim();

        // Check for music intent
        if (MUSIC_PATTERNS.some(p => p.test(normalizedMessage))) {
            return 'music';
        }

        // Check for video intent
        if (VIDEO_PATTERNS.some(p => p.test(normalizedMessage))) {
            return 'videos';
        }

        // Check for movie intent
        if (MOVIE_PATTERNS.some(p => p.test(normalizedMessage))) {
            return 'movies';
        }

        return 'unknown';
    }

    /**
     * Detect if the message is a greeting or info request
     */
    isGreetingOrInfo(message: string): boolean {
        const normalizedMessage = message.toLowerCase().trim();
        return GREETING_PATTERNS.some(p => p.test(normalizedMessage));
    }

    /**
     * Determine the starter variant based on the message
     * Variant A: User explicitly mentions USB/content type
     * Variant B: User just greets or asks for info
     */
    determineVariant(message: string): StarterVariant {
        const product = this.detectProduct(message);
        return product !== 'unknown' ? 'A' : 'B';
    }

    /**
     * Build the genre options text for a product type
     */
    buildGenreOptionsText(product: ProductType): string {
        const options = product === 'music' ? MUSIC_GENRE_OPTIONS :
            product === 'videos' ? VIDEO_GENRE_OPTIONS :
                product === 'movies' ? MOVIE_GENRE_OPTIONS :
                    MUSIC_GENRE_OPTIONS; // default to music

        return options.map(o =>
            o.key === 'otro' ? `${o.emoji} ${o.label}` : `${o.key}) ${o.emoji} ${o.label}`
        ).join('\n');
    }

    /**
     * Get the question text for asking genre preference
     */
    getGenreQuestionText(product: ProductType): string {
        switch (product) {
            case 'music':
                return '¿Qué género de música te gusta más?';
            case 'videos':
                return '¿Qué tipo de videos te gustaría?';
            case 'movies':
                return '¿Qué tipo de películas prefieres?';
            default:
                return '¿Qué tipo de contenido te gustaría?';
        }
    }

    /**
     * Generate the starter response for Variant A (product interest expressed)
     * Note: This should only be called when detectedProduct !== 'unknown'
     */
    generateVariantA(context: StarterContext): StarterResponse {
        const { phone, userName, detectedProduct } = context;
        
        // Defensive check - Variant A should not be called with unknown product
        if (detectedProduct === 'unknown') {
            console.warn(`⚠️ StarterScript: generateVariantA called with unknown product for ${phone}, falling back to Variant B`);
            return this.generateVariantB(context);
        }
        
        const productName = detectedProduct === 'music' ? 'música' :
            detectedProduct === 'videos' ? 'videoclips' : 'películas';

        const productEmoji = detectedProduct === 'music' ? '🎵' :
            detectedProduct === 'videos' ? '📹' : '🎬';

        const valueProp = VALUE_PROPS[detectedProduct];
        const genreOptions = this.buildGenreOptionsText(detectedProduct);
        const questionText = this.getGenreQuestionText(detectedProduct);

        const greeting = userName && userName !== 'amigo' ?
            `¡Perfecto ${userName}! ${productEmoji}` :
            `¡Perfecto! ${productEmoji}`;

        const confirmMessage = `${greeting} Te ayudo con tu USB de ${productName}.`;
        const valueMessage = valueProp;
        const questionMessage = `${questionText}\n\n${genreOptions}`;

        // Single combined message for better UX
        const combinedMessage = `${confirmMessage}\n${valueMessage}\n\n${questionMessage}`;

        const flowId = detectedProduct === 'music' ? 'musicUsb' :
            detectedProduct === 'videos' ? 'videosUsb' : 'moviesUsb';

        return {
            messages: [combinedMessage],
            flowId,
            step: 'genre_selection',
            expectedInput: 'CHOICE',
            questionId: `starter_genre_${detectedProduct}_${Date.now()}`,
            questionText
        };
    }

    /**
     * Generate the starter response for Variant B (greeting/info only)
     */
    generateVariantB(context: StarterContext): StarterResponse {
        const { userName } = context;

        const greeting = userName && userName !== 'amigo' ?
            `¡Hola ${userName}! 👋` :
            '¡Hola! 👋';

        const introMessage = `${greeting} Bienvenido a TechAura.`;
        const productOptions = `
¿Qué tipo de USB te interesa?

1) 🎵 Música
2) 📹 Videoclips  
3) 🎬 Películas/Series
4) ❓ Solo quiero info de precios`.trim();

        const valueBrief = '\n\n✨ HD/4K • Envío gratis • Cambios sin costo';

        const combinedMessage = `${introMessage}\n\n${productOptions}${valueBrief}`;

        return {
            messages: [combinedMessage],
            flowId: 'starterFlow',
            step: 'product_selection',
            expectedInput: 'CHOICE',
            questionId: `starter_product_${Date.now()}`,
            questionText: '¿Qué tipo de USB te interesa?'
        };
    }

    /**
     * Main method: Generate starter response based on user message
     */
    async generateStarterResponse(
        phone: string,
        message: string,
        userName?: string
    ): Promise<StarterResponse> {
        const variant = this.determineVariant(message);
        const detectedProduct = this.detectProduct(message);
        const name = userName || 'amigo';

        const context: StarterContext = {
            phone,
            userName: name,
            variant,
            detectedProduct,
            message
        };

        const response = variant === 'A' ?
            this.generateVariantA(context) :
            this.generateVariantB(context);

        // Set flow state for continuity
        await this.setStarterFlowState(phone, response);

        return response;
    }

    /**
     * Set the flow state for continuity after sending starter message
     */
    async setStarterFlowState(phone: string, response: StarterResponse): Promise<boolean> {
        try {
            await flowContinuityService.setFlowState(phone, {
                flowId: response.flowId,
                step: response.step,
                expectedInput: response.expectedInput,
                questionId: response.questionId,
                questionText: response.questionText,
                timeoutHours: 2,
                context: {
                    isStarterFlow: true,
                    initiatedAt: new Date().toISOString()
                }
            });
            console.log(`📍 StarterScript: Set flow state for ${phone}: ${response.flowId}/${response.step}`);
            return true;
        } catch (error) {
            console.error(`❌ StarterScript: Error setting flow state for ${phone}:`, error);
            // Return false to indicate failure - caller can decide how to handle
            return false;
        }
    }

    /**
     * Parse user response to product selection (Variant B follow-up)
     */
    parseProductSelection(input: string): ProductType {
        const normalizedInput = input.toLowerCase().trim();

        // Check numbered responses
        if (normalizedInput === '1' || /m[uú]sica/i.test(normalizedInput)) {
            return 'music';
        }
        if (normalizedInput === '2' || /video/i.test(normalizedInput)) {
            return 'videos';
        }
        if (normalizedInput === '3' || /pel[ií]cula|serie/i.test(normalizedInput)) {
            return 'movies';
        }
        if (normalizedInput === '4' || /precio|info/i.test(normalizedInput)) {
            return 'unknown'; // Will route to prices
        }

        // Try to detect from free text
        return this.detectProduct(input);
    }

    /**
     * Parse user response to genre selection (Variant A follow-up)
     * @param input - User's raw input
     * @param product - The product type context (music, videos, movies)
     * @returns The matched or sanitized genre string, or null if empty/invalid
     */
    parseGenreSelection(input: string, product: ProductType): string | null {
        const normalizedInput = input.toLowerCase().trim();
        const options = product === 'music' ? MUSIC_GENRE_OPTIONS :
            product === 'videos' ? VIDEO_GENRE_OPTIONS :
                MOVIE_GENRE_OPTIONS;

        // Handle "otro" special case first - user wants to type custom
        if (normalizedInput === 'otro') {
            return null;
        }

        // Check numbered responses (exclude 'otro' option)
        for (const opt of options) {
            if (opt.key === 'otro') continue; // Skip the "otro" option in matching
            if (normalizedInput === opt.key ||
                normalizedInput.includes(opt.label.toLowerCase())) {
                return opt.label;
            }
        }

        // If user wrote something else, treat it as custom input
        // Apply basic validation: max 100 chars, only alphanumeric and basic punctuation
        if (normalizedInput.length > 0) {
            // Sanitize and limit length
            const MAX_GENRE_LENGTH = 100;
            const sanitized = normalizedInput
                .slice(0, MAX_GENRE_LENGTH)
                .replace(/[^\w\sáéíóúüñ.,\-]/gi, '') // Allow only safe chars
                .trim();
            
            if (sanitized.length > 0) {
                return sanitized;
            }
        }

        return null;
    }

    /**
     * Check if message should be handled by starter flow
     */
    shouldHandleAsStarter(message: string, session?: UserSession): boolean {
        // Don't intercept if user is in sensitive stages
        if (session) {
            const sensitiveStages = new Set([
                'customizing', 'pricing', 'closing', 'awaiting_capacity',
                'awaiting_payment', 'checkout_started', 'order_confirmed',
                'payment_confirmed', 'shipping', 'completed', 'converted'
            ]);
            if (sensitiveStages.has(session.stage)) {
                return false;
            }

            // Don't intercept if user has significant progress
            if (session.currentFlow && session.currentFlow !== 'starterFlow' &&
                session.currentFlow !== 'entryFlow' && session.currentFlow !== 'welcomeFlow') {
                const hasProgress = (session.messageCount || 0) > 3;
                if (hasProgress) {
                    return false;
                }
            }
        }

        // Check if message looks like a starter message
        const isGreeting = this.isGreetingOrInfo(message);
        const hasProductIntent = this.detectProduct(message) !== 'unknown';

        return isGreeting || hasProductIntent;
    }
}

// Export singleton instance
export const starterScriptService = StarterScriptService.getInstance();
