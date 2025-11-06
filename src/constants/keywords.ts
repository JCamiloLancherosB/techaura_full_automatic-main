export const PREDEFINED_KEYWORDS = {
    music: ['musica', 'música', 'canciones', 'cancion', 'canción', 'mp3', 'audio', 'sonido'],
    movies: ['pelicula', 'película', 'peliculas', 'películas', 'movie', 'movies', 'cine', 'film'],
    videos: ['video', 'videos', 'clip', 'clips', 'youtube'],
    usb: ['usb', 'memoria', 'pendrive', 'flash'],
    prices: ['precio', 'precios', 'costo', 'costos', 'cuanto', 'cuánto', 'valor'],
    greetings: ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'saludos'],
    help: ['ayuda', 'help', 'soporte', 'asistencia', 'info', 'información'],
    catalog: ['catalogo', 'catálogo', 'productos', 'opciones', 'menu', 'menú'],
    genres: {
        reggaeton: ['reggaeton', 'regueton', 'perreo', 'dembow'],
        salsa: ['salsa', 'salsa romantica', 'salsa brava'],
        bachata: ['bachata', 'bachata sensual', 'bachata moderna'],
        vallenato: ['vallenato', 'acordeon', 'guacharaca'],
        rock: ['rock', 'rock en español', 'rock clasico', 'metal'],
        pop: ['pop', 'pop latino', 'pop internacional'],
        electronica: ['electronica', 'electro', 'house', 'techno', 'edm'],
        urbano: ['urbano', 'trap', 'hip hop', 'rap'],
        romantica: ['romantica', 'baladas', 'amor', 'boleros'],
        crossover: ['crossover', 'fusion', 'world music']
    }
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
