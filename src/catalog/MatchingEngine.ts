import { UserSession } from '../../types/global';

// Tipos de contenido disponibles
export type ContentType = 'movies' | 'music' | 'videos' | 'series' | 'documentaries' | 'custom';
export type ContentGenre = 'acción' | 'comedia' | 'drama' | 'romance' | 'terror' | 'animadas' | 
                          'rock' | 'salsa' | 'vallenato' | 'reggaeton' | 'bachata' | 'merengue' | 
                          'baladas' | 'rancheras' | 'cumbia' | 'electronica' | 'hiphop' | 'indie';

// Interfaz para configuración de matching
export interface MatchingOptions {
  detectNegations?: boolean;
  confidenceThreshold?: number;
  maxResults?: number;
  includeSimilar?: boolean;
  prioritizeRecent?: boolean;
}

// Interfaz para resultados del matching
export interface MatchingResult {
  genres: ContentGenre[];
  artists: string[];
  titles: string[];
  contentTypes: ContentType[];
  confidence: number;
  recommendations: string[];
  metadata?: {
    detectedKeywords: string[];
    processedText: string;
    timestamp: string;
  };
}

// Base de datos de conocimiento del sistema
const CONTENT_KNOWLEDGE_BASE = {
  genres: {
    'acción': ['avengers', 'john wick', 'star wars', 'misión imposible', 'rápidos y furiosos', 'explosiones', 'peleas', 'adrenalina'],
    'comedia': ['shrek', 'toy story', 'mi villano favorito', 'madagascar', 'the office', 'friends', 'risa', 'divertido', 'chiste'],
    'drama': ['breaking bad', 'el padrino', 'forrest gump', 'titanic', 'joker', 'el lobo de wall street', 'emocional', 'intenso'],
    'romance': ['orgullo y prejuicio', 'diario de una pasión', 'la la land', 'notting hill', 'casablanca', 'amor', 'pareja'],
    'terror': ['el conjuro', 'it', 'annabelle', 'scream', 'el exorcista', 'hereditary', 'miedo', 'suspenso', 'escalofrío'],
    'animadas': ['coco', 'frozen', 'moana', 'encanto', 'soul', 'rick & morty', 'dragon ball', 'naruto', 'animación', 'dibujos'],
    'rock': ['guns n roses', 'metallica', 'ac/dc', 'queen', 'led zeppelin', 'pink floyd', 'nirvana', 'guitarra', 'batería'],
    'salsa': ['marc anthony', 'willie colon', 'hector lavoe', 'celia cruz', 'joe arroyo', 'gilberto santa rosa', 'baile', 'tropical'],
    'vallenato': ['carlos vives', 'diomedes diaz', 'jorge celedon', 'silvestre dangond', 'martin elias', 'acordeón', 'folclor'],
    'reggaeton': ['daddy yankee', 'bad bunny', 'j balvin', 'ozuna', 'maluma', 'karol g', 'anuel aa', 'perreo', 'urbano'],
    'bachata': ['romeo santos', 'aventura', 'prince royce', 'frank reyes', 'anthony santos', 'romántico', 'tropical'],
    'merengue': ['juan luis guerra', 'elvis crespo', 'wilfrido vargas', 'sergio vargas', 'eddy herrera', 'alegre', 'fiesta'],
    'baladas': ['ricardo arjona', 'mana', 'jesse y joy', 'camila', 'sin bandera', 'alejandro sanz', 'romántico', 'suave'],
    'rancheras': ['vicente fernández', 'alejandro fernández', 'pedro infante', 'jorge negrete', 'antonio aguilar', 'mexicano'],
    'cumbia': ['los ángeles azules', 'celso piña', 'la sonora dinamita', 'grupo niche', 'los askis', 'ritmo', 'colombiano'],
    'electronica': ['david guetta', 'avicii', 'tiësto', 'calvin harris', 'martin garrix', 'dance', 'electrónico'],
    'hiphop': ['eminem', 'jay-z', 'kendrick lamar', 'drake', 'kanye west', 'rap', 'urbano'],
    'indie': ['arctic monkeys', 'tame impala', 'lorde', 'florence + the machine', 'alt-j', 'alternativo']
  },
  artists: {
    'bad bunny': ['reggaeton', 'urbano latino'],
    'karol g': ['reggaeton', 'urbano latino'],
    'j balvin': ['reggaeton', 'urbano latino'],
    'romeo santos': ['bachata', 'tropical'],
    'marc anthony': ['salsa', 'tropical'],
    'carlos vives': ['vallenato', 'tropical'],
    'metallica': ['rock', 'heavy metal'],
    'queen': ['rock', 'clásico'],
    'avengers': ['acción', 'superhéroes'],
    'star wars': ['acción', 'ciencia ficción'],
    'pixar': ['animadas', 'familia'],
    'disney': ['animadas', 'familia']
  },
  contentTypes: {
    'movies': ['película', 'pelicula', 'cine', 'film', 'filme', 'movie'],
    'music': ['música', 'musica', 'canción', 'cancion', 'song', 'artista', 'banda', 'álbum'],
    'videos': ['video', 'videoclip', 'youtube', 'tiktok', 'reels', 'clip'],
    'series': ['serie', 'netflix', 'hbo', 'amazon prime', 'disney+', 'capítulo'],
    'documentaries': ['documental', 'national geographic', 'discovery', 'historia'],
    'custom': ['personalizado', 'mezcla', 'variado', 'diferente', 'especial']
  }
};

// Palabras de negación para detección de exclusiones
const NEGATION_WORDS = new Set(['no', 'sin', 'excepto', 'menos', 'evitar', 'nada de', 'tampoco']);

export class MatchingEngine {
  private static instance: MatchingEngine;
  private userHistory: Map<string, string[]> = new Map();

  private constructor() {}

  public static getInstance(): MatchingEngine {
    if (!MatchingEngine.instance) {
      MatchingEngine.instance = new MatchingEngine();
    }
    return MatchingEngine.instance;
  }

  /**
   * Normaliza texto para matching consistente
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Detecta negaciones en el texto
   */
  private detectNegations(text: string): { cleanText: string; excluded: Set<string> } {
    const words = text.split(/\s+/);
    const excluded = new Set<string>();
    const cleanWords: string[] = [];

    for (let i = 0; i < words.length; i++) {
      if (NEGATION_WORDS.has(words[i]) && i + 1 < words.length) {
        excluded.add(words[i + 1]);
        i++; // Saltar la palabra excluida
      } else {
        cleanWords.push(words[i]);
      }
    }

    return {
      cleanText: cleanWords.join(' '),
      excluded
    };
  }

  /**
   * Calcula similitud entre textos usando Jaccard similarity
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const set1 = new Set(text1.split(/\s+/));
    const set2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Encuentra géneros basados en palabras clave
   */
  private findGenres(text: string, excluded: Set<string>): ContentGenre[] {
    const foundGenres: Set<ContentGenre> = new Set();
    const normalizedText = this.normalizeText(text);

    for (const [genre, keywords] of Object.entries(CONTENT_KNOWLEDGE_BASE.genres)) {
      if (excluded.has(genre)) continue;

      const genreKeywords = keywords as string[];
      const hasMatch = genreKeywords.some(keyword => 
        normalizedText.includes(this.normalizeText(keyword))
      );

      if (hasMatch) {
        foundGenres.add(genre as ContentGenre);
      }
    }

    return Array.from(foundGenres);
  }

  /**
   * Encuentra artistas mencionados
   */
  private findArtists(text: string, excluded: Set<string>): string[] {
    const foundArtists: Set<string> = new Set();
    const normalizedText = this.normalizeText(text);

    for (const [artist, genres] of Object.entries(CONTENT_KNOWLEDGE_BASE.artists)) {
      if (excluded.has(artist)) continue;

      if (normalizedText.includes(this.normalizeText(artist))) {
        foundArtists.add(artist);
      }
    }

    return Array.from(foundArtists);
  }

  /**
   * Detecta tipos de contenido solicitados
   */
  private detectContentTypes(text: string): ContentType[] {
    const foundTypes: Set<ContentType> = new Set();
    const normalizedText = this.normalizeText(text);

    for (const [contentType, keywords] of Object.entries(CONTENT_KNOWLEDGE_BASE.contentTypes)) {
      const typeKeywords = keywords as string[];
      const hasMatch = typeKeywords.some(keyword => 
        normalizedText.includes(this.normalizeText(keyword))
      );

      if (hasMatch) {
        foundTypes.add(contentType as ContentType);
      }
    }

    // Default a música si no se detecta nada específico
    if (foundTypes.size === 0) {
      foundTypes.add('music');
    }

    return Array.from(foundTypes);
  }

  /**
   * Extrae títulos específicos mencionados
   */
  private extractTitles(text: string): string[] {
    const titles: string[] = [];
    const normalizedText = this.normalizeText(text);
    
    // Patrones para detectar títulos entre comillas o mayúsculas
    const titlePatterns = [
      /"([^"]+)"/g, // Comillas dobles
      /'([^']+)'/g, // Comillas simples
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g // Palabras con mayúsculas consecutivas
    ];

    for (const pattern of titlePatterns) {
      let match;
      while ((match = pattern.exec(normalizedText)) !== null) {
        titles.push(match[1] || match[0]);
      }
    }

    return titles;
  }

  /**
   * Genera recomendaciones inteligentes basadas en el matching
   */
  private generateRecommendations(
    genres: ContentGenre[], 
    artists: string[], 
    contentTypes: ContentType[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Recomendaciones basadas en géneros
    if (genres.length > 0) {
      const mainGenre = genres[0];
      recommendations.push(
        `Te recomiendo nuestra colección premium de ${mainGenre} con los mejores títulos`
      );
    }

    // Recomendaciones basadas en artistas
    if (artists.length > 0) {
      recommendations.push(
        `Incluiremos todos los éxitos de ${artists.join(', ')} en tu USB`
      );
    }

    // Recomendaciones cruzadas
    if (genres.includes('reggaeton') && contentTypes.includes('videos')) {
      recommendations.push(
        '¿Te gustaría agregar videos musicales en 4K de tus artistas favoritos?'
      );
    }

    if (genres.includes('animadas') && contentTypes.includes('movies')) {
      recommendations.push(
        'Puedo incluir sagas completas de Disney, Pixar y Anime premium'
      );
    }

    // Recomendación general de capacidad
    recommendations.push(
      'Basado en tus gustos, te recomiendo la capacidad de 128GB para tener contenido variado'
    );

    return recommendations;
  }

  /**
   * Calcula confianza del matching basado en varios factores
   */
  private calculateConfidence(
    genres: ContentGenre[], 
    artists: string[], 
    titles: string[]
  ): number {
    let confidence = 0;

    // Puntos por géneros detectados
    confidence += genres.length * 0.2;

    // Puntos por artistas específicos
    confidence += artists.length * 0.3;

    // Puntos por títulos específicos
    confidence += titles.length * 0.4;

    // Bonus por múltiples coincidencias
    if (genres.length > 1) confidence += 0.1;
    if (artists.length > 1) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  /**
   * Método principal para matching de contenido
   */
  public match(
    userInput: string, 
    defaultContentType: ContentType = 'music',
    options: MatchingOptions = {}
  ): MatchingResult {
    const {
      detectNegations = true,
      confidenceThreshold = 0.3,
      maxResults = 10,
      includeSimilar = true
    } = options;

    // Procesar texto y detectar negaciones
    const normalizedInput = this.normalizeText(userInput);
    let processedText = normalizedInput;
    let excluded = new Set<string>();

    if (detectNegations) {
      const negationResult = this.detectNegations(normalizedInput);
      processedText = negationResult.cleanText;
      excluded = negationResult.excluded;
    }

    // Realizar detecciones
    const genres = this.findGenres(processedText, excluded);
    const artists = this.findArtists(processedText, excluded);
    const titles = this.extractTitles(processedText);
    const contentTypes = this.detectContentTypes(processedText);

    // Calcular confianza
    const confidence = this.calculateConfidence(genres, artists, titles);

    // Generar recomendaciones
    const recommendations = this.generateRecommendations(genres, artists, contentTypes);

    // Filtrar resultados por umbral de confianza
    const finalGenres = confidence >= confidenceThreshold ? genres : [];
    const finalArtists = confidence >= confidenceThreshold ? artists : [];
    const finalTitles = confidence >= confidenceThreshold ? titles.slice(0, maxResults) : [];

    return {
      genres: finalGenres,
      artists: finalArtists,
      titles: finalTitles,
      contentTypes: contentTypes.length > 0 ? contentTypes : [defaultContentType],
      confidence,
      recommendations,
      metadata: {
        detectedKeywords: [...finalGenres, ...finalArtists, ...finalTitles],
        processedText,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Actualiza historial del usuario para recomendaciones personalizadas
   */
  public updateUserHistory(phoneNumber: string, preferences: string[]): void {
    if (!this.userHistory.has(phoneNumber)) {
      this.userHistory.set(phoneNumber, []);
    }
    
    const currentHistory = this.userHistory.get(phoneNumber)!;
    const updatedHistory = [...new Set([...currentHistory, ...preferences])];
    
    this.userHistory.set(phoneNumber, updatedHistory.slice(-50)); // Mantener últimas 50 preferencias
  }

  /**
   * Obtiene recomendaciones personalizadas basadas en historial
   */
  public getPersonalizedRecommendations(phoneNumber: string): string[] {
    const history = this.userHistory.get(phoneNumber) || [];
    
    if (history.length === 0) {
      return ['Basado en tendencias populares, te recomiendo nuestra colección crossover'];
    }

    // Análisis simple de preferencias frecuentes
    const frequency: Record<string, number> = {};
    history.forEach(item => {
      frequency[item] = (frequency[item] || 0) + 1;
    });

    const topPreferences = Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([pref]) => pref);

    return [
      `Como te gusta ${topPreferences.join(', ')}, te recomiendo ampliar con géneros similares`,
      '¿Has considerado nuestra USB premium con contenido exclusivo?',
      'Basado en tu historial, la capacidad de 256GB sería ideal para ti'
    ];
  }

  /**
   * Reinicia historial de usuario
   */
  public clearUserHistory(phoneNumber: string): void {
    this.userHistory.delete(phoneNumber);
  }
}

// Exportar instancia singleton
export const matchingEngine = MatchingEngine.getInstance();
