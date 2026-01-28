/**
 * Genre Lexicon - Single source of truth for genre recognition
 * 
 * This file contains canonical genre keys and their synonyms/variants/slang.
 * Used for normalizing user input to canonical genre values.
 * 
 * IMPORTANT: This lexicon contains ONLY genres, never artists.
 */

import { normalizeText } from '../utils/textUtils';

// ============================================
// CANONICAL GENRE KEYS
// ============================================

export const CANONICAL_GENRES = [
    'SALSA',
    'VALLENATO',
    'TROPICAL',
    'REGGAETON',
    'ROCK',
    'BALADAS',
    'POP',
    'RAP',
    'HIPHOP',
    'ELECTRONICA',
    'MERENGUE',
    'BACHATA',
    'CUMBIA',
    'TANGO',
    'BOLERO',
    'URBANO',
    'CLASICA',
    'JAZZ',
    'RANCHERA',
    'NORTENA',
    'CORRIDOS',
    'GOSPEL',
    'ROMANTICA',
    'OLDIES',
    'DISCO',
    'COUNTRY',
    'BLUES',
    'SOUL',
    'RNB',
    'FOLK',
    'LATINA',
    'MIXED_GENRES',
] as const;

export type CanonicalGenre = typeof CANONICAL_GENRES[number];

// ============================================
// GENRE LEXICON - Synonyms and variants
// ============================================

/**
 * Maps various input strings (lowercase, no accents) to canonical genre keys.
 * Includes:
 * - Correct spellings
 * - Common misspellings/typos
 * - Spanish slang
 * - Plural forms
 * - Regional variations
 */
export const GENRE_LEXICON: Record<string, CanonicalGenre> = {
    // SALSA
    'salsa': 'SALSA',
    'salsas': 'SALSA',
    'salza': 'SALSA', // typo
    'salsa romantica': 'SALSA',
    'salsa brava': 'SALSA',
    'salsa dura': 'SALSA',
    'salsa clasica': 'SALSA',
    'salsa urbana': 'SALSA',
    'salsa sensual': 'SALSA',
    'salsita': 'SALSA',

    // VALLENATO
    'vallenato': 'VALLENATO',
    'vallenatos': 'VALLENATO',
    'valenato': 'VALLENATO', // typo
    'vallenatto': 'VALLENATO', // typo
    'valenatos': 'VALLENATO', // typo
    'balenato': 'VALLENATO', // typo (b/v)
    'vallenato romantico': 'VALLENATO',
    'vallenato clasico': 'VALLENATO',
    'vallenato viejo': 'VALLENATO',
    'vallenato nuevo': 'VALLENATO',

    // TROPICAL
    'tropical': 'TROPICAL',
    'tropicales': 'TROPICAL',
    'tropial': 'TROPICAL', // typo
    'musica tropical': 'TROPICAL',
    'ritmos tropicales': 'TROPICAL',
    'caribe': 'TROPICAL',
    'caribena': 'TROPICAL',
    'caribeno': 'TROPICAL',

    // REGGAETON
    'reggaeton': 'REGGAETON',
    'regueton': 'REGGAETON',
    'reggeton': 'REGGAETON', // typo
    'reguetton': 'REGGAETON', // typo
    'regeton': 'REGGAETON', // typo
    'reggaetton': 'REGGAETON', // typo
    'reggueton': 'REGGAETON', // typo
    'perreo': 'REGGAETON',
    'dembow': 'REGGAETON',
    'dembo': 'REGGAETON', // typo

    // ROCK
    'rock': 'ROCK',
    'rocks': 'ROCK',
    'rok': 'ROCK', // typo
    'rock en espanol': 'ROCK',
    'rock en ingles': 'ROCK',
    'rock clasico': 'ROCK',
    'rock alternativo': 'ROCK',
    'rock nacional': 'ROCK',
    'metal': 'ROCK',
    'heavy metal': 'ROCK',
    'hard rock': 'ROCK',
    'punk': 'ROCK',
    'punk rock': 'ROCK',
    'grunge': 'ROCK',
    'indie rock': 'ROCK',

    // BALADAS
    'balada': 'BALADAS',
    'baladas': 'BALADAS',
    'balada romantica': 'BALADAS',
    'baladas romanticas': 'BALADAS',
    'baladitas': 'BALADAS',
    'valadas': 'BALADAS', // typo (b/v)
    'balada en espanol': 'BALADAS',

    // POP
    'pop': 'POP',
    'pops': 'POP',
    'pop latino': 'POP',
    'pop en espanol': 'POP',
    'pop internacional': 'POP',
    'pop rock': 'POP',
    'pop dance': 'POP',
    'popular': 'POP',
    'populares': 'POP',
    'musica popular': 'POP',

    // RAP
    'rap': 'RAP',
    'raps': 'RAP',
    'rap en espanol': 'RAP',
    'rap latino': 'RAP',
    'freestyle': 'RAP',

    // HIP HOP
    'hip hop': 'HIPHOP',
    'hiphop': 'HIPHOP',
    'hip-hop': 'HIPHOP',
    'hipop': 'HIPHOP', // typo
    'hip hop latino': 'HIPHOP',

    // ELECTRONICA
    'electronica': 'ELECTRONICA',
    'electronicas': 'ELECTRONICA',
    'electronico': 'ELECTRONICA',
    'electro': 'ELECTRONICA',
    'house': 'ELECTRONICA',
    'techno': 'ELECTRONICA',
    'trance': 'ELECTRONICA',
    'edm': 'ELECTRONICA',
    'dance': 'ELECTRONICA',
    'dj': 'ELECTRONICA',
    'musica electronica': 'ELECTRONICA',
    'electronik': 'ELECTRONICA', // typo

    // MERENGUE
    'merengue': 'MERENGUE',
    'merengues': 'MERENGUE',
    'merenque': 'MERENGUE', // typo
    'merengue clasico': 'MERENGUE',
    'merengue dominicano': 'MERENGUE',
    'mambo': 'MERENGUE',

    // BACHATA
    'bachata': 'BACHATA',
    'bachatas': 'BACHATA',
    'bachatero': 'BACHATA',
    'bachatera': 'BACHATA',
    'bachata sensual': 'BACHATA',
    'bachata moderna': 'BACHATA',
    'bachata dominicana': 'BACHATA',
    'bachata romantica': 'BACHATA',
    'bacata': 'BACHATA', // typo
    'vacata': 'BACHATA', // typo (b/v)

    // CUMBIA
    'cumbia': 'CUMBIA',
    'cumbias': 'CUMBIA',
    'cumbiambera': 'CUMBIA',
    'cumbia colombiana': 'CUMBIA',
    'cumbia argentina': 'CUMBIA',
    'cumbia mexicana': 'CUMBIA',
    'cumbia villera': 'CUMBIA',
    'cumbia clasica': 'CUMBIA',
    'kumbia': 'CUMBIA', // typo

    // TANGO
    'tango': 'TANGO',
    'tangos': 'TANGO',
    'tanguito': 'TANGO',
    'tango argentino': 'TANGO',
    'milonga': 'TANGO',

    // BOLERO
    'bolero': 'BOLERO',
    'boleros': 'BOLERO',
    'bolerito': 'BOLERO',
    'bolero romantico': 'BOLERO',
    'bolero clasico': 'BOLERO',
    'volero': 'BOLERO', // typo (b/v)

    // URBANO
    'urbano': 'URBANO',
    'urbana': 'URBANO',
    'urbanos': 'URBANO',
    'musica urbana': 'URBANO',
    'trap': 'URBANO',
    'trapeton': 'URBANO',
    'latin trap': 'URBANO',
    'latino urbano': 'URBANO',

    // CLASICA
    'clasica': 'CLASICA',
    'clasico': 'CLASICA',
    'clasicos': 'CLASICA',
    'clasicas': 'CLASICA',
    'musica clasica': 'CLASICA',
    'classica': 'CLASICA', // double 's'
    'sinfonico': 'CLASICA',
    'sinfonica': 'CLASICA',
    'opera': 'CLASICA',
    'orquesta': 'CLASICA',
    'instrumental': 'CLASICA',

    // JAZZ
    'jazz': 'JAZZ',
    'jaz': 'JAZZ', // typo
    'jazzy': 'JAZZ',
    'jazz latino': 'JAZZ',
    'bossa nova': 'JAZZ',
    'bossanova': 'JAZZ',
    'swing': 'JAZZ',
    'blues jazz': 'JAZZ',

    // RANCHERA
    'ranchera': 'RANCHERA',
    'rancheras': 'RANCHERA',
    'ranchero': 'RANCHERA',
    'rancheros': 'RANCHERA',
    'mariachi': 'RANCHERA',
    'mariachis': 'RANCHERA',
    'charras': 'RANCHERA',
    'musica mexicana': 'RANCHERA',
    'mexicana': 'RANCHERA',
    'mexicanas': 'RANCHERA',
    'musica de mexico': 'RANCHERA',

    // NORTEÑA
    'nortena': 'NORTENA',
    'nortenas': 'NORTENA',
    'norteno': 'NORTENA',
    'nortenos': 'NORTENA',
    'norteña': 'NORTENA',
    'norteñas': 'NORTENA',
    'norteño': 'NORTENA',
    'norteños': 'NORTENA',
    'banda': 'NORTENA',
    'bandas': 'NORTENA',
    'banda sinaloense': 'NORTENA',
    'grupera': 'NORTENA',
    'musica grupera': 'NORTENA',
    'duranguense': 'NORTENA',
    'tex mex': 'NORTENA',
    'texmex': 'NORTENA',
    'tex-mex': 'NORTENA',
    'conjunto': 'NORTENA',

    // CORRIDOS
    'corrido': 'CORRIDOS',
    'corridos': 'CORRIDOS',
    'corridito': 'CORRIDOS',
    'corridos tumbados': 'CORRIDOS',
    'corridos mexicanos': 'CORRIDOS',
    'narcocorridos': 'CORRIDOS',
    'narco corridos': 'CORRIDOS',

    // GOSPEL
    'gospel': 'GOSPEL',
    'gospels': 'GOSPEL',
    'cristiana': 'GOSPEL',
    'cristiano': 'GOSPEL',
    'cristianas': 'GOSPEL',
    'cristianos': 'GOSPEL',
    'musica cristiana': 'GOSPEL',
    'alabanzas': 'GOSPEL',
    'alabanza': 'GOSPEL',
    'adoracion': 'GOSPEL',
    'worship': 'GOSPEL',
    'religioso': 'GOSPEL',
    'religiosa': 'GOSPEL',

    // ROMANTICA
    'romantica': 'ROMANTICA',
    'romantico': 'ROMANTICA',
    'romanticas': 'ROMANTICA',
    'romanticos': 'ROMANTICA',
    'musica romantica': 'ROMANTICA',
    'amor': 'ROMANTICA',
    'amores': 'ROMANTICA',
    'de amor': 'ROMANTICA',
    'romanticona': 'ROMANTICA',

    // OLDIES
    'oldies': 'OLDIES',
    'old': 'OLDIES',
    'vieja escuela': 'OLDIES',
    'vieja guardia': 'OLDIES',
    'viejas': 'OLDIES',
    'viejitas': 'OLDIES',
    'viejita': 'OLDIES',
    'de los viejos': 'OLDIES',
    'anos 50': 'OLDIES',
    'anos 60': 'OLDIES',
    'anos 70': 'OLDIES',
    'anos 80': 'OLDIES',
    'anos 90': 'OLDIES',
    'decada 50': 'OLDIES',
    'decada 60': 'OLDIES',
    'decada 70': 'OLDIES',
    'decada 80': 'OLDIES',
    'decada 90': 'OLDIES',
    '50s': 'OLDIES',
    '60s': 'OLDIES',
    '70s': 'OLDIES',
    '80s': 'OLDIES',
    '90s': 'OLDIES',
    'retro': 'OLDIES',
    'retromusica': 'OLDIES',
    'musica retro': 'OLDIES',
    'de antes': 'OLDIES',
    'de antano': 'OLDIES',
    'clasicos 80': 'OLDIES',
    'clasicos 90': 'OLDIES',
    'clasicos 80s 90s': 'OLDIES',
    'exitos del recuerdo': 'OLDIES',
    'del recuerdo': 'OLDIES',
    'recuerdos': 'OLDIES',

    // DISCO
    'disco': 'DISCO',
    'discos': 'DISCO',
    'discoteca': 'DISCO',
    'disco music': 'DISCO',
    'musica disco': 'DISCO',
    'funky': 'DISCO',
    'funk': 'DISCO',

    // COUNTRY
    'country': 'COUNTRY',
    'contry': 'COUNTRY', // typo
    'countri': 'COUNTRY', // typo
    'country music': 'COUNTRY',

    // BLUES
    'blues': 'BLUES',
    'blu': 'BLUES', // typo
    'bluesy': 'BLUES',
    'rhythm and blues': 'BLUES',

    // SOUL
    'soul': 'SOUL',
    'souls': 'SOUL',
    'soul music': 'SOUL',
    'soulful': 'SOUL',

    // R&B
    'rnb': 'RNB',
    'r&b': 'RNB',
    'r n b': 'RNB',
    'rhythm n blues': 'RNB',

    // FOLK
    'folk': 'FOLK',
    'folklorico': 'FOLK',
    'folklorica': 'FOLK',
    'folklore': 'FOLK',
    'folclor': 'FOLK',
    'folclorico': 'FOLK',
    'folclorica': 'FOLK',
    'musica folclorica': 'FOLK',
    'musica folklorica': 'FOLK',
    'andina': 'FOLK',
    'musica andina': 'FOLK',
    'indigena': 'FOLK',
    'etnica': 'FOLK',

    // LATINA (general latin music)
    'latina': 'LATINA',
    'latino': 'LATINA',
    'latinas': 'LATINA',
    'latinos': 'LATINA',
    'latin': 'LATINA',
    'musica latina': 'LATINA',
    'latin music': 'LATINA',

    // MIXED_GENRES (indicators of wanting variety)
    'crossover': 'MIXED_GENRES',
    'crosover': 'MIXED_GENRES', // typo
    'cross over': 'MIXED_GENRES',
    'fusion': 'MIXED_GENRES',
    'mezclado': 'MIXED_GENRES',
    'mezcla': 'MIXED_GENRES',
    'mezclas': 'MIXED_GENRES',
    'mixto': 'MIXED_GENRES',
    'mixta': 'MIXED_GENRES',
    'mix': 'MIXED_GENRES',
    'mixes': 'MIXED_GENRES',
    'variado': 'MIXED_GENRES',
    'variada': 'MIXED_GENRES',
    'variados': 'MIXED_GENRES',
    'variadas': 'MIXED_GENRES',
    'de todo': 'MIXED_GENRES',
    'de todo un poco': 'MIXED_GENRES',
    'un poco de todo': 'MIXED_GENRES',
    'todos los generos': 'MIXED_GENRES',
    'todo tipo': 'MIXED_GENRES',
    'de todos': 'MIXED_GENRES',
    'varios generos': 'MIXED_GENRES',
    'varios': 'MIXED_GENRES',
    'varias': 'MIXED_GENRES',
    'world music': 'MIXED_GENRES',
    'world': 'MIXED_GENRES',
    'musica del mundo': 'MIXED_GENRES',
    'diferentes generos': 'MIXED_GENRES',
    'diferentes': 'MIXED_GENRES',
    'diverso': 'MIXED_GENRES',
    'diversa': 'MIXED_GENRES',
    'diversos': 'MIXED_GENRES',
    'eclectico': 'MIXED_GENRES',
    'eclectica': 'MIXED_GENRES',
    'lo que sea': 'MIXED_GENRES',
    'cualquier genero': 'MIXED_GENRES',
    'cualquiera': 'MIXED_GENRES',
    'general': 'MIXED_GENRES',
    'me gusta de todo': 'MIXED_GENRES',
    'me gusta todo': 'MIXED_GENRES',
    'variedad': 'MIXED_GENRES',
};

// Pre-compute sorted keys for efficient matching (longest first)
const SORTED_LEXICON_KEYS = Object.keys(GENRE_LEXICON).sort((a, b) => b.length - a.length);

// Pre-compile regexes for all lexicon keys
const LEXICON_REGEXES = new Map<string, RegExp>();
for (const key of SORTED_LEXICON_KEYS) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    LEXICON_REGEXES.set(key, new RegExp(`\\b${escapedKey}\\b`, 'g'));
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract canonical genres from user input text.
 * - Normalizes input (lowercase, no accents, collapse spaces)
 * - Matches against lexicon
 * - Returns only canonical genre keys (never artists)
 * - Handles multiple genres in a single input
 * 
 * @param input - User input text (e.g., "salsa, vallenato y popular")
 * @returns Array of unique canonical genres found
 */
export function extractCanonicalGenres(input: string): CanonicalGenre[] {
    if (!input || typeof input !== 'string') {
        return [];
    }

    const normalized = normalizeText(input);
    const foundGenres = new Set<CanonicalGenre>();

    let remainingText = normalized;
    
    // Use pre-sorted keys (longest first) with pre-compiled regexes
    for (const key of SORTED_LEXICON_KEYS) {
        const regex = LEXICON_REGEXES.get(key)!;
        // Reset lastIndex to avoid issues with 'g' flag
        regex.lastIndex = 0;
        
        if (regex.test(remainingText)) {
            foundGenres.add(GENRE_LEXICON[key]);
            // Reset lastIndex again before replace
            regex.lastIndex = 0;
            // Remove matched text to avoid double-matching
            remainingText = remainingText.replace(regex, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    return Array.from(foundGenres);
}

/**
 * Check if input indicates mixed/varied genre preference
 * 
 * @param input - User input text
 * @returns true if user wants mixed/varied genres
 */
export function isMixedGenreRequest(input: string): boolean {
    const genres = extractCanonicalGenres(input);
    return genres.includes('MIXED_GENRES');
}

/**
 * Get the canonical genre for a single input string
 * Returns null if no match found
 * 
 * @param input - Single genre input (e.g., "salsa" or "valenato")
 * @returns Canonical genre or null
 */
export function getCanonicalGenre(input: string): CanonicalGenre | null {
    if (!input || typeof input !== 'string') {
        return null;
    }

    const normalized = normalizeText(input);
    return GENRE_LEXICON[normalized] || null;
}

/**
 * Check if a string represents a valid genre (exists in lexicon)
 * 
 * @param input - Input string to check
 * @returns true if input is a recognized genre
 */
export function isValidGenre(input: string): boolean {
    return getCanonicalGenre(input) !== null;
}

/**
 * Get all synonyms for a canonical genre
 * 
 * @param canonicalGenre - The canonical genre key
 * @returns Array of all synonyms that map to this genre
 */
export function getGenreSynonyms(canonicalGenre: CanonicalGenre): string[] {
    const synonyms: string[] = [];
    
    for (const [synonym, genre] of Object.entries(GENRE_LEXICON)) {
        if (genre === canonicalGenre) {
            synonyms.push(synonym);
        }
    }
    
    return synonyms;
}

/**
 * Normalize genre display name for user-facing output
 * 
 * @param canonicalGenre - The canonical genre key
 * @returns Human-readable genre name
 */
export function getGenreDisplayName(canonicalGenre: CanonicalGenre): string {
    const displayNames: Record<CanonicalGenre, string> = {
        'SALSA': 'Salsa',
        'VALLENATO': 'Vallenato',
        'TROPICAL': 'Tropical',
        'REGGAETON': 'Reggaetón',
        'ROCK': 'Rock',
        'BALADAS': 'Baladas',
        'POP': 'Pop',
        'RAP': 'Rap',
        'HIPHOP': 'Hip-Hop',
        'ELECTRONICA': 'Electrónica',
        'MERENGUE': 'Merengue',
        'BACHATA': 'Bachata',
        'CUMBIA': 'Cumbia',
        'TANGO': 'Tango',
        'BOLERO': 'Bolero',
        'URBANO': 'Urbano',
        'CLASICA': 'Clásica',
        'JAZZ': 'Jazz',
        'RANCHERA': 'Ranchera',
        'NORTENA': 'Norteña',
        'CORRIDOS': 'Corridos',
        'GOSPEL': 'Gospel/Cristiana',
        'ROMANTICA': 'Romántica',
        'OLDIES': 'Clásicos/Oldies',
        'DISCO': 'Disco',
        'COUNTRY': 'Country',
        'BLUES': 'Blues',
        'SOUL': 'Soul',
        'RNB': 'R&B',
        'FOLK': 'Folklórica',
        'LATINA': 'Latina',
        'MIXED_GENRES': 'Variado/Mix',
    };

    return displayNames[canonicalGenre] || canonicalGenre;
}
