/**
 * String utilities for Colombian text processing
 */

/**
 * Normalize text by removing accents and converting to lowercase
 * Used for city/department matching in Colombian addresses and input parsing
 */
export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents/tildes
        .replace(/\s+/g, ' ') // Collapse multiple spaces into one
        .trim();
}

/**
 * Capitalize each word in a string
 */
export function capitalizeWords(text: string): string {
    return text
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Format Colombian phone number
 * Ensures it starts with country code 57
 */
export function formatColombianPhone(phone: string): string {
    const cleaned = phone.replace(/[\s\-+()\+]/g, '');
    
    // If it's a 10-digit number starting with 3, add 57
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
        return '57' + cleaned;
    }
    
    // If it starts with +57, remove the +
    if (cleaned.startsWith('+57')) {
        return cleaned.substring(1);
    }
    
    return cleaned;
}

/**
 * Format currency in Colombian Pesos
 */
export function formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
    }).format(amount);
}

/**
 * Shared intent detection utilities for all USB flows
 */

/**
 * Detect if user is asking about pricing/capacity
 */
export function isPricingIntent(message: string): boolean {
    const normalized = normalizeText(message);
    return /(precio|cuesta|cuanto|costo|vale|valor|capacidad|gb|tamaño)/.test(normalized);
}

/**
 * Detect if user is confirming/agreeing (Okey, Ok, Dale, etc.)
 */
export function isConfirmation(message: string): boolean {
    const normalized = normalizeText(message.trim());
    return /^(ok|okey|okay|si|dale|va|listo|perfecto|bien|bueno|claro)$/.test(normalized);
}

/**
 * Confirmation type classification result
 */
export type ConfirmationType = 'CONFIRM_YES' | 'CONFIRM_NO' | null;

/**
 * Keywords that indicate affirmative confirmation
 */
const YES_KEYWORDS = ['si', 'ok', 'okey', 'okay', 'dale', 'listo', 'claro', 'perfecto', 'va', 'bien', 'bueno', 'correcto', 'confirmo', 'confirmar', 'acepto'];

/**
 * Keywords that indicate negative confirmation  
 */
const NO_KEYWORDS = ['no', 'nel', 'negativo', 'nope', 'nada', 'cancelar', 'cancelo', 'ninguno', 'ninguna'];

/**
 * Classify short responses as YES/NO confirmations
 * Used for fast-path detection when a flow is expecting a YES/NO answer
 * 
 * @param message - User input text
 * @returns 'CONFIRM_YES' | 'CONFIRM_NO' | null
 */
export function classifyYesNoResponse(message: string): ConfirmationType {
    const normalized = normalizeText(message.trim());
    
    // Early return for empty strings
    if (!normalized) {
        return null;
    }
    
    // Only classify short responses (typically 1-3 words)
    const wordCount = normalized.split(/\s+/).length;
    if (wordCount > 4) {
        return null; // Too long for simple yes/no classification
    }
    
    // Check for NO first (higher priority to avoid false positives)
    // e.g., "no" should not match if contained in another word
    for (const keyword of NO_KEYWORDS) {
        // Match exact word or word at boundaries
        const regex = new RegExp(`^${keyword}$|^${keyword}\\s|\\s${keyword}$|\\s${keyword}\\s`);
        if (regex.test(normalized)) {
            return 'CONFIRM_NO';
        }
    }
    
    // Check for YES keywords
    for (const keyword of YES_KEYWORDS) {
        // Match exact word or word at boundaries
        const regex = new RegExp(`^${keyword}$|^${keyword}\\s|\\s${keyword}$|\\s${keyword}\\s`);
        if (regex.test(normalized)) {
            return 'CONFIRM_YES';
        }
    }
    
    return null;
}

/**
 * Check if a message is a short affirmative response expected in a YES/NO context
 */
export function isYesConfirmation(message: string): boolean {
    return classifyYesNoResponse(message) === 'CONFIRM_YES';
}

/**
 * Check if a message is a short negative response expected in a YES/NO context
 */
export function isNoConfirmation(message: string): boolean {
    return classifyYesNoResponse(message) === 'CONFIRM_NO';
}

/**
 * Catalog item interface for capacity parsing
 */
export interface CatalogItem {
    capacity_gb: number;
    price: number;
    description?: string;
}

/**
 * Parse capacity selection from free-form text
 * Recognizes patterns like: "8GB", "8 gb", "la de 8", "opción 1", "#2", "32GB", "de 64"
 * 
 * @param text - User input text
 * @param catalog - Array of catalog items with capacity_gb
 * @returns The capacity in GB (number) or null if not detected
 */
export function parseCapacitySelection(text: string, catalog: CatalogItem[]): number | null {
    const normalized = normalizeText(text);
    
    // Pattern 1: Direct GB mentions (e.g., "8gb", "8 gb", "la de 8 gb", "de 32")
    const gbMatch = normalized.match(/(?:la de|de|una de)?\s*(\d+)\s*gb/);
    if (gbMatch) {
        const capacity = parseInt(gbMatch[1]);
        // Verify capacity exists in catalog
        if (catalog.some(item => item.capacity_gb === capacity)) {
            return capacity;
        }
    }
    
    // Pattern 2: Just numbers (e.g., "la de 8", "una de 32", "de 64")
    const numberMatch = normalized.match(/(?:la de|de|una de|quiero|dame)\s*(\d+)(?:\s|$)/);
    if (numberMatch) {
        const capacity = parseInt(numberMatch[1]);
        // Verify capacity exists in catalog
        if (catalog.some(item => item.capacity_gb === capacity)) {
            return capacity;
        }
    }
    
    // Pattern 3: Option index (e.g., "opción 1", "opcion 2", "#1", "numero 2")
    const optionMatch = normalized.match(/(?:opcion|opción|#|numero|número)\s*(\d+)/);
    if (optionMatch) {
        const optionIndex = parseInt(optionMatch[1]) - 1; // Convert to 0-based index
        if (optionIndex >= 0 && optionIndex < catalog.length) {
            return catalog[optionIndex].capacity_gb;
        }
    }
    
    // Pattern 4: Standalone numbers if they match catalog capacities
    const standaloneMatch = normalized.match(/^(\d+)$/);
    if (standaloneMatch) {
        const num = parseInt(standaloneMatch[1]);
        // First check if it's a direct capacity match
        if (catalog.some(item => item.capacity_gb === num)) {
            return num;
        }
        // Then check if it's a valid option index (1-based)
        const optionIndex = num - 1;
        if (optionIndex >= 0 && optionIndex < catalog.length) {
            return catalog[optionIndex].capacity_gb;
        }
    }
    
    return null;
}

/**
 * Common filler words to filter out when parsing preferences
 */
const PREFERENCE_FILLER_WORDS = ['la', 'de', 'una', 'el', 'con', 'gb', 'precio', 'es', 'cuesta', 'cuanto', 'solo'];

/**
 * Parse preferences from free-form text
 * Extracts genres, artists, and titles separated by comma, "y", "&"
 * Preserves detected titles and proper formatting
 * 
 * @param text - User input text with preferences
 * @returns Array of detected preferences (genres, artists, titles)
 */
export function parsePreferences(text: string): string[] {
    const normalized = normalizeText(text);
    const preferences: string[] = [];
    
    // Split by common separators: comma, "y", "&"
    const parts = normalized.split(/[,&]|\s+y\s+/);
    
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
            // Skip common filler words and capacity-related text
            const isFillerOnly = PREFERENCE_FILLER_WORDS.some(filler => 
                trimmed === filler || trimmed.split(/\s+/).every(word => PREFERENCE_FILLER_WORDS.includes(word))
            );
            
            if (!isFillerOnly) {
                // Preserve the preference as-is after trimming
                preferences.push(trimmed);
            }
        }
    }
    
    return preferences.filter(p => p.length > 2); // Filter out very short items
}

/**
 * Detect if user is indicating they like "everything" / "all genres" / mixed tastes
 * Returns true for inputs like: "de todo", "de todo un poco", "me gusta todo", "varios", "mixto", "variado"
 * 
 * Uses word boundaries for phrases but exact match for single words to avoid false positives.
 */
export function isMixedGenreInput(message: string): boolean {
    const normalized = normalizeText(message.trim());
    
    // Early return for empty strings
    if (!normalized) {
        return false;
    }
    
    // Pattern for "de todo" variations (phrases with word boundaries)
    const deTodoPattern = /\b(de todo|todo un poco|de todo un poco|un poco de todo)\b/;
    
    // Pattern for "me gusta todo" variations (phrases with word boundaries)
    const meGustaTodoPattern = /\b(me gusta todo|gusta de todo|escucho de todo|veo de todo|me gusta de todo)\b/;
    
    // Single-word patterns for mixed/varied preferences (exact match for short messages)
    // Only match if the entire message is one of these single words to avoid false positives
    const singleWordExact = /^(variado|varios|mixto|variados|mixta|surtido|mix|crossover|todo|diverso)$/;
    
    // English phrases (with word boundaries to be more specific)
    // "a bit of everything" is specific enough, but "everything", "mixed", "variety" alone
    // should only match as standalone responses to avoid false positives
    const englishPhrases = /\b(a bit of everything|all genres)\b/;
    const englishWordsExact = /^(everything|mixed|variety)$/;
    
    return (
        deTodoPattern.test(normalized) ||
        meGustaTodoPattern.test(normalized) ||
        singleWordExact.test(normalized) ||
        englishPhrases.test(normalized) ||
        englishWordsExact.test(normalized)
    );
}

/**
 * Check if a message is a polite "gracias" response
 * Used to detect when user says thank you during an active flow
 * Returns true for: "gracias", "muchas gracias", "ok gracias", "thanks"
 */
export function isPoliteGraciasResponse(message: string): boolean {
    const normalized = normalizeText(message.trim());
    
    if (!normalized) {
        return false;
    }
    
    // Pattern for "gracias" variations - case insensitive not needed since normalized is lowercase
    return /^(gracias|muchas gracias|ok gracias|thanks)$/.test(normalized);
}
