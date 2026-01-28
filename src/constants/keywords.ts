import { getGenreSynonyms, CANONICAL_GENRES, type CanonicalGenre } from '../content/genreLexicon';

/**
 * Build genre keywords from the centralized genre lexicon
 * This ensures keywords.ts stays in sync with genreLexicon.ts
 */
function buildGenreKeywords(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    
    // Use CANONICAL_GENRES directly to ensure sync with genreLexicon
    for (const genre of CANONICAL_GENRES) {
        // Convert MIXED_GENRES → mixedgenres, HIPHOP → hiphop, etc.
        const key = genre.toLowerCase().replace(/_/g, '');
        result[key] = getGenreSynonyms(genre);
    }
    
    // Keep backward compatibility alias for 'crossover'
    result.crossover = result.mixedgenres || [];
    
    return result;
}

export const PREDEFINED_KEYWORDS = {
    music: ['musica', 'música', 'canciones', 'cancion', 'canción', 'mp3', 'audio', 'sonido'],
    movies: ['pelicula', 'película', 'peliculas', 'películas', 'movie', 'movies', 'cine', 'film'],
    videos: ['video', 'videos', 'clip', 'clips', 'youtube'],
    usb: ['usb', 'memoria', 'pendrive', 'flash'],
    prices: ['precio', 'precios', 'costo', 'costos', 'cuanto', 'cuánto', 'valor'],
    greetings: ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'saludos'],
    help: ['ayuda', 'help', 'soporte', 'asistencia', 'info', 'información'],
    catalog: ['catalogo', 'catálogo', 'productos', 'opciones', 'menu', 'menú'],
    genres: buildGenreKeywords()
};

export const AI_INTENTS = {
    GREETING: 'greeting',
    PRODUCT_INQUIRY: 'product_inquiry',
    PRICE_REQUEST: 'price_request',
    CUSTOMIZATION: 'customization',
    OBJECTION: 'objection',
    PURCHASE_INTENT: 'purchase_intent',
    SUPPORT: 'support',
    GOODBYE: 'goodbye',
    UNKNOWN: 'unknown'
};

export const CONFIDENCE_LEVELS = {
    HIGH: 0.8,
    MEDIUM: 0.6,
    LOW: 0.4
};
