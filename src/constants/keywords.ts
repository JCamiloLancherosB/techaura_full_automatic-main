import { getGenreSynonyms, type CanonicalGenre } from '../content/genreLexicon';

/**
 * Build genre keywords from the centralized genre lexicon
 * This ensures keywords.ts stays in sync with genreLexicon.ts
 */
function buildGenreKeywords(): Record<string, string[]> {
    const genreKeys: CanonicalGenre[] = [
        'REGGAETON', 'SALSA', 'BACHATA', 'VALLENATO', 'ROCK', 'POP',
        'ELECTRONICA', 'URBANO', 'ROMANTICA', 'MIXED_GENRES', 'MERENGUE',
        'CUMBIA', 'TANGO', 'BOLERO', 'CLASICA', 'JAZZ', 'RANCHERA',
        'NORTENA', 'CORRIDOS', 'GOSPEL', 'OLDIES', 'TROPICAL', 'BALADAS',
        'RAP', 'HIPHOP', 'DISCO', 'COUNTRY', 'BLUES', 'SOUL', 'RNB', 'FOLK', 'LATINA'
    ];
    
    const result: Record<string, string[]> = {};
    
    for (const genre of genreKeys) {
        const key = genre.toLowerCase().replace('_', '');
        result[key] = getGenreSynonyms(genre);
    }
    
    // Keep backward compatibility aliases
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
