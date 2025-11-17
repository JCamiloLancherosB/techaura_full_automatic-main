import { UserSession } from '../../types/global';

// Tipos exportados
export type ContentType = 'movies' | 'music' | 'videos' | 'series' | 'documentaries' | 'custom';
export type ContentGenre =
  | 'acción' | 'comedia' | 'drama' | 'romance' | 'terror' | 'animadas'
  | 'rock' | 'salsa' | 'vallenato' | 'reggaeton' | 'bachata' | 'merengue'
  | 'baladas' | 'rancheras' | 'cumbia' | 'electronica' | 'hiphop' | 'indie';

export interface MatchingOptions {
  detectNegations?: boolean;
  confidenceThreshold?: number;
  maxResults?: number;
  includeSimilar?: boolean;
  prioritizeRecent?: boolean;
}

export interface MatchingResult {
  genres: ContentGenre[];
  artists: string[];
  titles: string[];
  contentTypes: ContentType[];
  confidence: number;
  recommendations: string[];
  metadata?: { detectedKeywords: string[]; processedText: string; timestamp: string; };
}

// Base de conocimiento (palabras clave)
const CONTENT_KNOWLEDGE_BASE = {
  genres: {
    'acción': ['avengers','john wick','star wars','mision imposible','rapidos y furiosos','explosiones','peleas','adrenalina'],
    'comedia': ['shrek','toy story','mi villano favorito','madagascar','the office','friends','risa','divertido','chiste'],
    'drama': ['breaking bad','el padrino','forrest gump','titanic','joker','el lobo de wall street','emocional','intenso'],
    'romance': ['orgullo y prejuicio','diario de una pasion','la la land','notting hill','casablanca','amor','pareja'],
    'terror': ['el conjuro','it','annabelle','scream','el exorcista','hereditary','miedo','suspenso','escalofrio'],
    'animadas': ['coco','frozen','moana','encanto','soul','rick morty','dragon ball','naruto','animacion','dibujos'],
    'rock': ['guns n roses','metallica','ac dc','queen','led zeppelin','pink floyd','nirvana','guitarra','bateria'],
    'salsa': ['marc anthony','willie colon','hector lavoe','celia cruz','joe arroyo','gilberto santa rosa','baile','tropical'],
    'vallenato': ['carlos vives','diomedes diaz','jorge celedon','silvestre dangond','martin elias','acordeon','folclor'],
    'reggaeton': ['daddy yankee','bad bunny','j balvin','ozuna','maluma','karol g','anuel aa','perreo','urbano'],
    'bachata': ['romeo santos','aventura','prince royce','frank reyes','anthony santos','romantico','tropical'],
    'merengue': ['juan luis guerra','elvis crespo','wilfrido vargas','sergio vargas','eddy herrera','alegre','fiesta'],
    'baladas': ['ricardo arjona','mana','jesse y joy','camila','sin bandera','alejandro sanz','romantico','suave'],
    'rancheras': ['vicente fernandez','alejandro fernandez','pedro infante','jorge negrete','antonio aguilar','mexicano'],
    'cumbia': ['los angeles azules','celso pina','la sonora dinamita','grupo niche','los askis','ritmo','colombiano'],
    'electronica': ['david guetta','avicii','tiesto','calvin harris','martin garrix','dance','electronico'],
    'hiphop': ['eminem','jay z','kendrick lamar','drake','kanye west','rap','urbano'],
    'indie': ['arctic monkeys','tame impala','lorde','florence the machine','alt j','alternativo']
  },
  artists: {
    'bad bunny': ['reggaeton'],
    'karol g': ['reggaeton'],
    'j balvin': ['reggaeton'],
    'romeo santos': ['bachata'],
    'marc anthony': ['salsa'],
    'carlos vives': ['vallenato'],
    'metallica': ['rock'],
    'queen': ['rock'],
    'avengers': ['acción'],
    'star wars': ['acción'],
    'pixar': ['animadas'],
    'disney': ['animadas']
  },
  contentTypes: {
    movies: ['pelicula','cine','film','filme','movie'],
    music: ['musica','cancion','song','artista','banda','album'],
    videos: ['video','videoclip','clip'],
    series: ['serie','netflix','hbo','prime','capitulo'],
    documentaries: ['documental','national geographic','discovery','historia'],
    custom: ['personalizado','mezcla','variado','especial']
  }
};

const NEGATION_WORDS = new Set(['no','sin','excepto','menos','evitar','nada de','tampoco']);

export class MatchingEngine {
  private static instance: MatchingEngine;
  private userHistory: Map<string, string[]> = new Map();
  private constructor() {}
  public static getInstance(): MatchingEngine {
    if (!MatchingEngine.instance) MatchingEngine.instance = new MatchingEngine();
    return MatchingEngine.instance;
  }

  private normalizeText(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private detectNegations(text: string): { cleanText: string; excluded: Set<string> } {
    const words = (text || '').split(/\s+/);
    const excluded = new Set<string>();
    const clean: string[] = [];
    for (let i = 0; i < words.length; i++) {
      if (NEGATION_WORDS.has(words[i]) && i + 1 < words.length) { excluded.add(words[i + 1]); i++; }
      else clean.push(words[i]);
    }
    return { cleanText: clean.join(' '), excluded };
  }

  private findGenres(text: string, excluded: Set<string>): ContentGenre[] {
    const found = new Set<ContentGenre>();
    const t = this.normalizeText(text);
    for (const [genre, keywords] of Object.entries(CONTENT_KNOWLEDGE_BASE.genres)) {
      if (excluded.has(genre)) continue;
      const has = (keywords as string[]).some(k => t.includes(this.normalizeText(k)));
      if (has) found.add(genre as ContentGenre);
    }
    return Array.from(found);
  }

  private findArtists(text: string, excluded: Set<string>): string[] {
    const found = new Set<string>();
    const t = this.normalizeText(text);
    for (const artist of Object.keys(CONTENT_KNOWLEDGE_BASE.artists)) {
      if (excluded.has(artist)) continue;
      if (t.includes(this.normalizeText(artist))) found.add(artist);
    }
    return Array.from(found);
  }

  private detectContentTypes(text: string): ContentType[] {
    const found = new Set<ContentType>();
    const t = this.normalizeText(text);
    for (const [type, keywords] of Object.entries(CONTENT_KNOWLEDGE_BASE.contentTypes)) {
      const has = (keywords as string[]).some(k => t.includes(this.normalizeText(k)));
      if (has) found.add(type as ContentType);
    }
    if (found.size === 0) found.add('music'); // default
    return Array.from(found);
  }

  private extractTitles(text: string): string[] {
    const titles: string[] = [];
    // Buscamos frases capitalizadas de 2+ palabras como potencial título (simplificado por normalización)
    const quoted = (text.match(/"([^"]+)"/g) || []).map(q => q.replace(/"/g,''));
    return [...new Set([...titles, ...quoted])].slice(0, 10);
  }

  private generateRecommendations(genres: ContentGenre[], artists: string[], types: ContentType[]): string[] {
    const recs: string[] = [];
    if (genres.length) recs.push(`Colección premium de ${genres[0]} con los mejores títulos.`);
    if (artists.length) recs.push(`Incluiremos éxitos de ${artists.slice(0,3).join(', ')}.`);
    if (genres.includes('reggaeton') && types.includes('videos')) recs.push('Suma videos musicales en 4K de tus artistas.');
    if (genres.includes('animadas') && types.includes('movies')) recs.push('Podemos incluir sagas Disney, Pixar y Anime premium.');
    recs.push('Recomendación de 128GB para variedad y espacio.');
    return recs;
  }

  private calculateConfidence(genres: ContentGenre[], artists: string[], titles: string[]): number {
    let c = 0;
    c += genres.length * 0.2;
    c += artists.length * 0.3;
    c += titles.length * 0.4;
    if (genres.length > 1) c += 0.1;
    if (artists.length > 1) c += 0.1;
    return Math.min(1, c);
  }

  public match(userInput: string, defaultContentType: ContentType = 'music', options: MatchingOptions = {}): MatchingResult {
    const { detectNegations = true, confidenceThreshold = 0.3, maxResults = 10 } = options;
    const normalized = this.normalizeText(userInput);
    const neg = detectNegations ? this.detectNegations(normalized) : { cleanText: normalized, excluded: new Set<string>() };

    const genres = this.findGenres(neg.cleanText, neg.excluded);
    const artists = this.findArtists(neg.cleanText, neg.excluded);
    const titles = this.extractTitles(userInput);
    const types = this.detectContentTypes(neg.cleanText);

    const confidence = this.calculateConfidence(genres, artists, titles);
    const recs = this.generateRecommendations(genres, artists, types);

    const ok = confidence >= confidenceThreshold;
    return {
      genres: ok ? genres : [],
      artists: ok ? artists : [],
      titles: ok ? titles.slice(0, maxResults) : [],
      contentTypes: types.length ? types as ContentType[] : [defaultContentType],
      confidence,
      recommendations: recs,
      metadata: { detectedKeywords: [...genres, ...artists, ...titles], processedText: neg.cleanText, timestamp: new Date().toISOString() }
    };
  }

  public updateUserHistory(phone: string, prefs: string[]): void {
    if (!this.userHistory.has(phone)) this.userHistory.set(phone, []);
    const curr = this.userHistory.get(phone)!;
    const updated = [...new Set([...(curr || []), ...(prefs || [])])];
    this.userHistory.set(phone, updated.slice(-50));
  }

  public getPersonalizedRecommendations(phone: string): string[] {
    const hist = this.userHistory.get(phone) || [];
    if (!hist.length) return ['Basado en tendencias, te recomiendo colección crossover.'];
    const freq: Record<string, number> = {};
    hist.forEach(h => { freq[h] = (freq[h] || 0) + 1; });
    const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k);
    return [
      `Como te gusta ${top.join(', ')}, ampliaremos con géneros cercanos.`,
      '¿Probamos una USB premium con exclusivas?',
      'Según tu historial, 256GB se ajusta perfecto.'
    ];
  }

  public clearUserHistory(phone: string): void { this.userHistory.delete(phone); }
}

export const MatchingEngineSingleton = MatchingEngine.getInstance();
export const matchingEngine = MatchingEngine.getInstance();
