import { addKeyword } from '@builderbot/bot';
import capacityMusicFlow from './capacityMusic';
import videoUsb from './videosUsb';
import { updateUserSession, getUserSession, userSessions } from './userTrackingSystem';
import { promises as fs } from 'fs';
import path from 'path';
import { saveUserCustomizationState, loadUserCustomizationState } from '../userCustomizationDb';
import { UserSession } from '../../types/global';

// --- User Customization State ---
export interface ExtendedContext {
  currentFlow: string;
  from: string;
  body: string;
  name?: string;
  pushName?: string;
  session?: UserSession;
}

interface UserCustomizationState {
  phoneNumber: string;
  selectedGenres: string[];
  mentionedArtists: string[];
  customizationStage:
  | 'initial'
  | 'personalizing'
  | 'satisfied'
  | 'ready_to_continue'
  | 'naming'
  | 'completed'
  | 'quick_selection'
  | 'advanced_personalizing';
  lastPersonalizationTime: Date | null;
  personalizationCount: number;
  entryTime?: Date | null;
  conversionStage?: string | null;
  interactionCount?: number;
  touchpoints?: string[];
  usbName?: string;
  moodPreferences?: string[];
  unrecognizedResponses?: number;
  finalizedGenres?: string[];
  finalizedArtists?: string[];
  finalizedMoods?: string[];
  finalizedUsbName?: string;
  finalizedCapacity?: string;
  finalizedOrderAt?: string;
  lastProductOffered?: string;
  lastPurchaseStep?: string;
  purchaseCompleted?: boolean;
  upsellOfferSent?: boolean;
  videoQuality?: string | null;
  showedPreview?: boolean;
}

class UserStateManager {
  private static userStates = new Map<string, UserCustomizationState>();

  static async getOrCreate(phoneNumber: string): Promise<UserCustomizationState> {
    if (!this.userStates.has(phoneNumber)) {
      const dbState = await loadUserCustomizationState(phoneNumber);
      this.userStates.set(
        phoneNumber,
        dbState || {
          phoneNumber,
          selectedGenres: [],
          mentionedArtists: [],
          customizationStage: 'initial',
          lastPersonalizationTime: new Date(),
          personalizationCount: 0
        }
      );
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

function formatCurrency(n: number) {
  return `$${n.toLocaleString('es-CO')}`;
}

// --- Music Data y utilidades ---

class MusicUtils {
  static normalizeText(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  static dedupeArray<T>(arr: T[]): T[] {
    return [...new Set(arr)];
  }
  static async getValidMediaPath(relativeOrAbsolutePath: string) {
    if (!relativeOrAbsolutePath) return { valid: false };
    try {
      const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.resolve(__dirname, relativeOrAbsolutePath);
      await fs.access(absolutePath);
      return { valid: true, path: absolutePath };
    } catch {
      return { valid: false };
    }
  }
  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// --- MUSIC DATA (recortado en la explicación, pero aquí va completo como lo tenías) ---
export const musicData = {
  artistsByGenre: {
    rock: [
      'guns n roses',
      'metallica',
      'ac/dc',
      'queen',
      'led zeppelin',
      'pink floyd',
      'nirvana',
      'bon jovi',
      'aerosmith',
      'kiss',
      'the beatles',
      'rolling stones',
      'u2',
      'linkin park',
      'green day',
      'foo fighters',
      'red hot chili peppers',
      'pearl jam',
      'radiohead'
    ],
    salsa: [
      'marc anthony',
      'willie colon',
      'hector lavoe',
      'celia cruz',
      'joe arroyo',
      'gilberto santa rosa',
      'victor manuelle',
      'la india',
      'tito nieves',
      'eddie santiago',
      'jerry rivera',
      'luis enrique',
      "oscar d'leon",
      'ruben blades',
      'ismael rivera',
      'cheo feliciano',
      'andy montañez'
    ],
    vallenato: [
      'carlos vives',
      'diomedes diaz',
      'jorge celedon',
      'silvestre dangond',
      'martin elias',
      'los diablitos',
      'binomio de oro',
      'los inquietos',
      'miguel morales',
      'luis mateus',
      'kaleth morales',
      'felipe pelaez',
      'peter manjarres',
      'jean carlos centeno'
    ],
    reggaeton: [
      'daddy yankee',
      'bad bunny',
      'j balvin',
      'ozuna',
      'maluma',
      'karol g',
      'anuel aa',
      'nicky jam',
      'wisin y yandel',
      'don omar',
      'tego calderon',
      'arcangel',
      'plan b',
      'farruko',
      'myke towers',
      'sech',
      'rauw alejandro',
      'feid'
    ],
    bachata: [
      'romeo santos',
      'aventura',
      'prince royce',
      'frank reyes',
      'anthony santos',
      'xtreme',
      'toby love',
      'elvis martinez',
      'zacarias ferreira',
      'joe veras',
      'luis vargas',
      'antony santos',
      'alex bueno',
      'yoskar sarante'
    ],
    merengue: [
      'juan luis guerra',
      'elvis crespo',
      'wilfrido vargas',
      'sergio vargas',
      'eddy herrera',
      'fernando villalona',
      'johnny ventura',
      'los hermanos rosario',
      'milly quezada',
      'bonny cepeda',
      'alex bueno',
      'kinito mendez',
      'jossie esteban'
    ],
    baladas: [
      'ricardo arjona',
      'mana',
      'jesse y joy',
      'camila',
      'sin bandera',
      'alejandro sanz',
      'luis miguel',
      'marco antonio solis',
      'cristian castro',
      'chayanne',
      'ricky martin',
      'david bisbal',
      'pablo alboran',
      'reik',
      'franco de vita'
    ],
    rancheras: [
      'vicente fernandez',
      'alejandro fernandez',
      'pedro infante',
      'jorge negrete',
      'antonio aguilar',
      'jose alfredo jimenez',
      'javier solis',
      'lola beltran',
      'amalia mendoza',
      'lucha villa',
      'pepe aguilar',
      'christian nodal',
      'angela aguilar'
    ],
    cumbia: [
      'los angeles azules',
      'celso piña',
      'la sonora dinamita',
      'grupo niche',
      'los askis',
      'aaron y su grupo ilusion',
      'la santa cecilia',
      'bomba estereo',
      'monsieur perine',
      'systema solar',
      'chico trujillo',
      'la delio valdez'
    ]
  },
  // genreTopHits: (todo tu objeto original tal cual)...
  genreTopHits: {
    "bachata": [
      { name: "Obsesión - Aventura", file: '../demos/Bachata/recortado Romeo Santos - Necio.mp3' },
      { name: "Burbujas de amor - Juan Luis Guerra", file: '../demos/Bachata/recortado_Aventura - Inmortal Official Video.mp3' },
      { name: "Romeo Santos - Propuesta indecente", file: '../demos/Bachata/recortado_Aventura, Bad Bunny - Volv.mp3' },
      { name: "Burbujas de amor - Juan Luis Guerra", file: '../demos/Bachata/recortado_Chayanne - Bailando Bachata.mp3' },
      { name: "Burbujas de amor - Juan Luis Guerra", file: '../demos/Bachata/recortado_La Bachata - MTZ Manuel Turizo Video Oficial.mp3' },
      { name: "Burbujas de amor - Juan Luis Guerra", file: '../demos/Bachata/recortado_Romeo Santos - Imitadora.mp3' },
      { name: "Burbujas de amor - Juan Luis Guerra", file: '../demos/Bachata/recortado_Romeo Santos - Propuesta Indecente.mp3' }
    ],
    "bailables": [
      { name: "La pollera colora - Aniceto Molina", file: '../demos/Bailables/recortado_El negrito de la Salsa.mp3' },
      { name: "Los del rio - Macarena", file: '../demos/Bailables/recortado_Guallando.mp3' },
      { name: "El Africano - Wilfrido Vargas", file: '../demos/Bailables/recortado_Mix Tropinavideño BandaFiesta  Bailable -  DJ DIEGO MORENO.mp3' },
      { name: "El Africano - Wilfrido Vargas", file: '../demos/Bailables/recortado_No Quiero Envejecer - Lucho y Rafa Discos Fuentes.mp3' },
      { name: "El Africano - Wilfrido Vargas", file: '../demos/Bailables/recortado_Pegame Tu Vicio.mp3' },
      { name: "El Africano - Wilfrido Vargas", file: '../demos/Bailables/recortado_Zúmbalo.mp3' }
    ],
    "baladas": [
      { name: "Ana Belén - Vuelo Blanco de Gaviota", file: '../demos/Baladas/recortado_¿Qué pasará mañana.mp3' },
      { name: "Los Prisioneros - Tren Al Sur", file: '../demos/Baladas/recortado_DUELE SABER Wason.mp3' },
      { name: "Ricardo Arjona - Historia De Taxi", file: '../demos/Baladas/recortado_Esta Cobardía.mp3' },
      { name: "Ricardo Arjona - Historia De Taxi", file: '../demos/Baladas/recortado_Leo Dan - Tú Me Pides Que Te Olvide (Letra).mp3' },
      { name: "Ricardo Arjona - Historia De Taxi", file: '../demos/Baladas/recortado_Jose Luis Perales - Me llamas.mp3' },
      { name: "Ricardo Arjona - Historia De Taxi", file: '../demos/Baladas/recortado_Leonardo Favio - Ella ya me olvido.mp3' },
      { name: "Ricardo Arjona - Historia De Taxi", file: '../demos/Baladas/recortado_Manolo Galvan - Deja de Llorar.mp3' },
      { name: "Ricardo Arjona - Historia De Taxi", file: '../demos/Baladas/recortado_Y Si Te Quedas.mp3' }
    ],
    "banda": [
      { name: "BANDA MS - TU POSTURA", file: '../demos/Banda/recortado_Banda Los Recoditos - Mi Último Deseo (Video Oficial).mp3' },
      { name: "Banda Sinaloense Los Recoditos - Ya Se Fue", file: '../demos/Banda/recortado_Banda MS - La Adictiva (VIDEO MIX) - DJ Alexis.mp3' },
      { name: "Banda Toro - Busca Tu Hueco", file: '../demos/Banda/recortado_Grupo Arriesgado - Ansiedad (Video Oficial).mp3' },
      { name: "Banda Toro - Busca Tu Hueco", file: '../demos/Banda/recortado_Grupo Firme - El Beneficio De La Duda (Video Oficial).mp3' },
      { name: "Banda Toro - Busca Tu Hueco", file: '../demos/Banda/recortado_Grupo Firme - Gerardo Coronel  El Jerry  - Qué Onda Perdida (Video Oficial).mp3' },
      { name: "Banda Toro - Busca Tu Hueco", file: '../demos/Banda/recortado_JERE KLEIN - LA BANDA (VISUALIZER) PROYECTO A-KLEIN.mp3' },
      { name: "Banda Toro - Busca Tu Hueco", file: '../demos/Banda/recortado_Julión Álvarez y su Norteño Banda - Regalo de Dios (Video Lyric).mp3' },
      { name: "Banda Toro - Busca Tu Hueco", file: '../demos/Banda/recortado_Ni Diablo Ni Santo.mp3' }
    ],
    "blues": [
      { name: "The Thrill Is Gone - B.B. King", file: '../demos/Blues/recortado_Blues Boys Tune.mp3' },
      { name: "Cross Road Blues - Robert Johnson", file: '../demos/Blues/recortado_Blues Delight - If I Had Money.mp3' },
      { name: "Sweet Home Chicago - The Blues Brothers", file: '../demos/Blues/recortado_Daniel Castro - Ill Play The Blues For You.mp3' },
      { name: "Sweet Home Chicago - The Blues Brothers", file: '../demos/Blues/recortado_Gary B.B. Coleman - The Sky is Crying.mp3' },
      { name: "Sweet Home Chicago - The Blues Brothers", file: '../demos/Blues/recortado_Muddy Waters - Mannish Boy (Audio).mp3' },
      { name: "Sweet Home Chicago - The Blues Brothers", file: '../demos/Blues/recortado_Sam Myers - I Got The Blues.mp3' }
    ],
    "boleros": [
      { name: "Bésame Mucho - Consuelo Velázquez", file: '../demos/Boleros/recortado_Cuanto Te Debo - Ricardo Fuentes ( Video Oficial )  Discos Fuentes.mp3' },
      { name: "El Reloj - Los Panchos", file: '../demos/Boleros/recortado_Las cuarenta (Bolero) Rolando Laserie.mp3' },
      { name: "La Barca - Luis Miguel", file: '../demos/Boleros/recortado_LOS 3 BOLEROS MAS ROMANTICOS   BOLERO SOUL.mp3' },
      { name: "La Barca - Luis Miguel", file: '../demos/Boleros/recortado_Miltinho - Dedo de guante.mp3' },
      { name: "La Barca - Luis Miguel", file: '../demos/Boleros/recortado_No Renunciaré - Alci Acosta.mp3' },
      { name: "La Barca - Luis Miguel", file: '../demos/Boleros/recortado_Óyelo Bien - Los Astros - VII Festival Mundial Del Bolero.mp3' },
      { name: "La Barca - Luis Miguel", file: '../demos/Boleros/recortado_Rolando La Serie  Hola Soledad  (Autor Palito Ortega).mp3' }
    ],
    "clasica": [
      { name: "Berlinerh Philharmoniker - Symphony No. 5", file: '../demos/Clasica/recortado_André Rieu ft. Gheorghe Zamfir - The Lonely Shepherd.mp3' },
      { name: "Elise Beethoven - Fur Elise", file: '../demos/Clasica/recortado_Howls Moving Castle - Merry go round of Life cover by Grissini Project.mp3' },
      { name: "Johann Pachelbel - Canon in d Major", file: '../demos/Clasica/recortado_Dmitri Shostakovich - The Second Waltz.mp3' },
      { name: "Johann Pachelbel - Canon in d Major", file: '../demos/Clasica/recortado_La canción mas hermosa de la música clásica - Albinoni - Adagio in G Minor.mp3' },
      { name: "Johann Pachelbel - Canon in d Major", file: '../demos/Clasica/recortado_Música Clásica - Canon en Re mayor, Johann Pachelbel.mp3' },
      { name: "Johann Pachelbel - Canon in d Major", file: '../demos/Clasica/recortado_Ofelia.mp3' },
      { name: "Johann Pachelbel - Canon in d Major", file: '../demos/Clasica/recortado_Vienna Philharmonic & Gustavo Dudamel Barber Adagio for Strings, Op.11 (SNC 2019) (1).mp3' }
    ],
    "country": [
      { name: "Cassyette - Friends in low places", file: '../demos/Country/recortado_Alan Jackson - Country Boy (Official Music Video).mp3' },
      { name: "Dolly Parton - Jolene", file: '../demos/Country/recortado_Alan Jackson - Livin On Love (Official Music Video).mp3' },
      { name: "John Denver - Take Me Home", file: '../demos/Country/recortado_Blake Shelton - Gods Country (Official Music Video).mp3' },
      { name: "John Denver - Take Me Home", file: '../demos/Country/recortado_Kenny Rogers - The Gambler.mp3' },
      { name: "John Denver - Take Me Home", file: '../demos/Country/recortado_Kenny Rogers-Coward of the county Subtitulado.mp3' },
      { name: "John Denver - Take Me Home", file: '../demos/Country/recortado_Rednex - Cotton Eye Joe (Official Music Video) [HD] - RednexMusic com.mp3' },
      { name: "John Denver - Take Me Home", file: '../demos/Country/recortado_Shania Twain - Any Man Of Mine (Official Music Video).mp3' },
      { name: "John Denver - Take Me Home", file: '../demos/Country/recortado_Take Me Home, Country Roads - The Petersens (LIVE).mp3' },
      { name: "John Denver - Take Me Home", file: '../demos/Country/Rednex - Cotton Eye Joe (Official Music Video) [HD] - RednexMusic com.mp3' }
    ],
    "cumbia": [
      { name: "Cumbia Sonidera - La cumbia del sol", file: '../demos/Cumbia/recortado_Arce - Amor prestado (Video oficial).mp3' },
      { name: "La Cumbia Cienaguera", file: '../demos/Cumbia/recortado_Ary Rumberos Fenix de Fuego - Louie Louie (Video oficial).mp3' },
      { name: "La piragua", file: '../demos/Cumbia/recortado_Bonita - Cumbia [Letra].mp3' },
      { name: "La piragua", file: '../demos/Cumbia/recortado_Cumbia.mp3' },
      { name: "La piragua", file: '../demos/Cumbia/recortado_Ilan Amores - Tiro Tiro (feat. Damas Gratis) (Video Oficial).mp3' },
      { name: "La piragua", file: '../demos/Cumbia/recortado_La Sonora Dinamita - Qué Bello ft. Kika Edgar.mp3' },
      { name: "La piragua", file: '../demos/Cumbia/recortado_maldito vicio cumbia.mp3' },
      { name: "La piragua", file: '../demos/Cumbia/recortado_Tu forma de amar - Cumbia.mp3' },
      { name: "La piragua", file: '../demos/Cumbia/recortado_Valentino Merlo X The la planta - Hoy (video oficial ).mp3' }
    ],
    "diciembre": [
      { name: "Faltan cinco pa' las doce - Hugo Liscano", file: '../demos/Diciembre/recortado_Bendito Diciembre.mp3' },
      { name: "El Año Viejo - Tony Camargo", file: '../demos/Diciembre/recortado_Cariñito.mp3' },
      { name: "Los 50 de Joselito - La Vispera de Año Nuevo", file: '../demos/Diciembre/recortado_El Bailador.mp3' },
      { name: "Los 50 de Joselito - La Vispera de Año Nuevo", file: '../demos/Diciembre/recortado_Las Cuatro Fiestas.mp3' },
      { name: "Los 50 de Joselito - La Vispera de Año Nuevo", file: '../demos/Diciembre/recortado_Se Va la Vida.mp3' }
    ],
    "electronica": [
      { name: "Avicii - Levels", file: '../demos/Electronica/recortado_(HQ) HIMNO DJ TIESTO ELECTRONICO.mp3' },
      { name: "Titanium - David Guetta ft. Sia", file: '../demos/Electronica/recortado_David Guetta & Showtek - Bad ft.Vassy (Lyrics Video).mp3' },
      { name: "Martin Garrix - Animals", file: '../demos/Electronica/recortado_electronica titanic.mp3' },
      { name: "Martin Garrix - Animals", file: '../demos/Electronica/recortado_Fumaratto - Me Provocas Ft. Valka (Official Music Video).mp3' },
      { name: "Martin Garrix - Animals", file: '../demos/Electronica/recortado_Gigi DAgostino Bla Bla Bla.mp3' },
      { name: "Martin Garrix - Animals", file: '../demos/Electronica/recortado_komodo - mauro picotto ( electronica ).mp3' },
      { name: "Martin Garrix - Animals", file: '../demos/Electronica/recortado_Martin Garrix - Animals (Official Video).mp3' },
      { name: "Martin Garrix - Animals", file: '../demos/Electronica/recortado_musica electronica para bailar xdxdxd.mp3' },
      { name: "Martin Garrix - Animals", file: '../demos/Electronica/recortado_Nenyx Pereira, Aleteo Zapateo Triba (Guaracha 2024).mp3' }
    ],
    "funk": [
      { name: "James Brown - Get Up I Feel Like Being Like A...", file: '../demos/Funk/recortado_DYGO & Mxng0 - FUNK INFERNAL [Brazilian Phonk].mp3' },
      { name: "Superstition - Stevie Wonder", file: '../demos/Funk/recortado_ENGANCHADO BRASILERO FUNK 7 - LUISINHODJ.mp3' },
      { name: "Superstition - Stevie Wonder", file: '../demos/Funk/recortado_Funk De Beleza.mp3' },
      { name: "Superstition - Stevie Wonder", file: '../demos/Funk/recortado_Montagem Mario Funk (Super Slowed).mp3' },
      { name: "Superstition - Stevie Wonder", file: '../demos/Funk/recortado_MONTAGEM TOMADA (Slowed)   La vida es un carrusel.mp3' },
      { name: "Superstition - Stevie Wonder", file: '../demos/Funk/recortado_RETOLAM FUNK − DJ Raulipues.mp3' },
      { name: "Superstition - Stevie Wonder", file: '../demos/Funk/recortado_SPOOKY (Slowed).mp3' },
      { name: "Superstition - Stevie Wonder", file: '../demos/Funk/recortado_Top 10 Viral Brazilian Phonk Mix 2025.mp3' }
    ],
    "gospel": [
      { name: "Kirk Franklin - I Smile", file: '../demos/Gospel/recortado_Alabaré - Nacho, Redimi2, Alex Zurdo (Video Oficial).mp3' },
      { name: "Phil Driscoll - Amazing Grace", file: '../demos/Gospel/recortado_Dr. Dre - Gospel (with Eminem) [Official Audio].mp3' },
      { name: "The Edwin Hawkins Singers - Oh Happy Day", file: '../demos/Gospel/recortado_JP Cooper - Call My Name (Gospel Live).mp3' },
      { name: "The Edwin Hawkins Singers - Oh Happy Day", file: '../demos/Gospel/recortado_Rich Brian x Keith Ape x XXXTentacion - Gospel (Prod. RONNYJ).mp3' },
      { name: "The Edwin Hawkins Singers - Oh Happy Day", file: '../demos/Gospel/recortado_Teddy Swims - Lose Control (The Village Sessions).mp3' }
    ],
    "hiphop": [
      { name: "Lose Yourself - Eminem", file: '../demos/HipHop/recortado_50 Cent - In Da Club (Official Music Video).mp3' },
      { name: "Sicko Mode - Travis Scott", file: '../demos/HipHop/recortado_Coolio - Gangstas Paradise.mp3' },
      { name: "The Notorious B.I.G. - Juicy", file: '../demos/HipHop/recortado_DaBaby - BOP on Broadway (Hip Hop Musical).mp3' },
      { name: "The Notorious B.I.G. - Juicy", file: '../demos/HipHop/recortado_Fat Joe - Whats Luv ft. Ashanti.mp3' },
      { name: "The Notorious B.I.G. - Juicy", file: '../demos/HipHop/recortado_Lil Wayne - Lollipop (Official Music Video) ft. Static.mp3' }
    ],
    "indie": [
      { name: "Take Me Out - Franz Ferdinand", file: '../demos/Indie/recortado_Arctic Monkeys - Do I Wanna Know (Official Video).mp3' },
      { name: "MGMT - Electric Feel ", file: '../demos/Indie/recortado_Foster The People - Pumped Up Kicks (Official Video).mp3' },
      { name: "The Killers - Mr. Brightside", file: '../demos/Indie/recortado_Sub Urban - Cradles [Official Music Video].mp3' },
      { name: "The Killers - Mr. Brightside", file: '../demos/Indie/recortado_The Smiths - This Charming Man (Official Music Video).mp3' },
      { name: "The Killers - Mr. Brightside", file: '../demos/Indie/recortado_The Strokes - Reptilia (Official HD Video).mp3' }
    ],
    "jazz": [
      { name: "Take Five - Dave Brubeck", file: '../demos/Jazz/recortado_Dave Brubeck - Take Five.mp3' },
      { name: "Miles Davis - So What", file: '../demos/Jazz/recortado_Horace Silver - Song for My Father.mp3' },
      { name: "Miles Davis - So What", file: '../demos/Jazz/recortado_Lee Morgan - The Sidewinder.mp3' },
      { name: "Miles Davis - So What", file: '../demos/Jazz/recortado_Miles Davis - Freddie Freeloader (Official Audio).mp3' },
      { name: "Miles Davis - So What", file: '../demos/Jazz/recortado_So What - Miles Davis (1959).mp3' }
    ],
    "merengue": [
      { name: "Juan Luis Guerra- El Niágara en Bicicleta", file: '../demos/Merengue/recortado_BONNY CEPEDA - UNA FOTOGRAFIA 1986.mp3' },
      { name: "La Bilirrubina - Juan Luis Guerra", file: '../demos/Merengue/recortado_Elvis Crespo - Suavemente.mp3' },
      { name: "Wilfrido Vargas - El Jardinero", file: '../demos/Merengue/recortado_Elvis Crespo - Tu Sonrisa.mp3' },
      { name: "Wilfrido Vargas - El Jardinero", file: '../demos/Merengue/recortado_Guallando.mp3' },
      { name: "Wilfrido Vargas - El Jardinero", file: '../demos/Merengue/recortado_Lastima de tanto amor - Sergio Vargas.mp3' },
      { name: "Wilfrido Vargas - El Jardinero", file: '../demos/Merengue/recortado_Liz - A Dormir Juntitos (Official Music Video) ft. Eddy Herrera.mp3' },
      { name: "Wilfrido Vargas - El Jardinero", file: '../demos/Merengue/recortado_No Hay Pesos.mp3' },
      { name: "Wilfrido Vargas - El Jardinero", file: '../demos/Merengue/recortado_Sergio Vargas Si Algun Dia La Ves.mp3' },
      { name: "Wilfrido Vargas - El Jardinero", file: '../demos/Merengue/recortado_Te Voy hacer Falta.mp3' }
    ],
    "metal": [
      { name: "Metallica - Enter Sandman", file: '../demos/Metal/recortado_Metallica Master of Puppets (Manchester, England - June 18, 2019).mp3' },
      { name: "Iron Maiden - Fear of the Dark", file: '../demos/Metal/recortado_Ozzy Osbourne - Crazy Train (Official Animated Video).mp3' },
      { name: "Paranoid - Black Sabbath", file: '../demos/Metal/recortado_Pantera - Walk (Official Music Video) [4K].mp3' },
      { name: "Paranoid - Black Sabbath", file: '../demos/Metal/recortado_TOOL - Ænema (Official Video).mp3' },
      { name: "Paranoid - Black Sabbath", file: '../demos/Metal/recortado_Type O Negative - Black No. 1 (Little Miss Scare -All) [HD Remaster] [OFFICIAL VIDEO].mp3' }
    ],
    "norteñas": [
      { name: "El corral de piedra", file: '../demos/Norteñas/recortado_Antonio Aguilar - Triste Recuerdo.mp3' },
      { name: "A la Luz de una Vela", file: '../demos/Norteñas/recortado_CABALLO DE PATAS BLANCAS, ANTONIO AGUILAR.mp3' },
      { name: "Los Dos De Tamaulipas - Pura Adrenalina", file: '../demos/Norteñas/recortado_Grupo Aguilas Del Norte - Cruz De Marihuana (Video Oficial).mp3' },
      { name: "Los Dos De Tamaulipas - Pura Adrenalina", file: '../demos/Norteñas/recortado_Los Tigres Del Norte - Jefe De Jefes.mp3' },
      { name: "Los Dos De Tamaulipas - Pura Adrenalina", file: '../demos/Norteñas/recortado_Los Tigres Del Norte - Mi Fantasia.mp3' }
    ],
    "punk": [
      { name: "Blitzkrieg Bop - Ramones", file: '../demos/Punk/recortado_Green Day - Basket Case [Official Music Video] (4K Upgrade).mp3' },
      { name: "American Idiot - Green Day", file: '../demos/Punk/recortado_Simple Plan - Perfect (Official Video) [HD].mp3' },
      { name: "Sex Pistols - Anarchy in the U.K", file: '../demos/Punk/recortado_The Offspring - The Kids Arent Alright (Official Music Video).mp3' },
      { name: "Sex Pistols - Anarchy in the U.K", file: '../demos/Punk/recortado_The Offspring - Youre Gonna Go Far, Kid (Official Music Video).mp3' },
      { name: "Sex Pistols - Anarchy in the U.K", file: '../demos/Punk/recortado_Wheatus - Teenage Dirtbag (Official Video).mp3' }
    ],
    "r&b": [
      { name: "No Scrubs - TLC", file: '../demos/R&B/recortado_Baby Bash - Suga Suga (Official Music Video) ft. Frankie J.mp3' },
      { name: "Miguel - Adorn", file: '../demos/R&B/recortado_Busta Rhymes, Mariah Carey - I Know What You Want (Official HD Video) ft. Flipmode Squad.mp3' },
      { name: "Beyoncé - Crazy In Love", file: '../demos/R&B/recortado_Eve - Let Me Blow Ya Mind (Official Music Video) ft. Gwen Stefani.mp3' },
      { name: "Beyoncé - Crazy In Love", file: '../demos/R&B/recortado_Fat Joe - Whats Luv ft. Ashanti.mp3' },
      { name: "Beyoncé - Crazy In Love", file: '../demos/R&B/recortado_Fugees - Killing Me Softly With His Song (Official Video).mp3' }
    ],
    "rancheras": [
      { name: "Alan Ramírez - Soy un Bohemio", file: '../demos/Rancheras/recortado_Antonio Aguilar - Alta y Delgadita.mp3' },
      { name: "Alci Acosta - El Preso Número 9", file: '../demos/Rancheras/recortado_Antonio Aguilar - El Adolorido.mp3' },
      { name: "Alejandro Fernández - Abrázame", file: '../demos/Rancheras/recortado_Antonio Aguilar, Por el Amor a Mi Madre.mp3' },
      { name: "Alejandro Fernández - Abrázame", file: '../demos/Rancheras/recortado_Christian Nodal, Ángela Aguilar - Dime Cómo Quieres (Video Oficial).mp3' },
      { name: "Alejandro Fernández - Abrázame", file: '../demos/Rancheras/recortado_Contentoso - Luis Alfonso   Video Oficial.mp3' },
      { name: "Alejandro Fernández - Abrázame", file: '../demos/Rancheras/recortado_Vicente Fernández - Le Pese a Quien Le Pese (Video de Película).mp3' },
      { name: "Alejandro Fernández - Abrázame", file: '../demos/Rancheras/recortado_Vicente Fernández - Sublime Mujer (Video) (Album Version).mp3' },
      { name: "Alejandro Fernández - Abrázame", file: '../demos/Rancheras/recortado_Vicente Fernández - Un Millón de Primaveras (Letra   Lyrics).mp3' }
    ],
    "reggaeton": [
      { name: "Daddy Yankee - Gasolina", file: '../demos/Reggaeton/recortado_Agárrala (Remix).mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_BLESSD ANUEL AA   DEPORTIVO  (VIDEO OFICIAL).mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_BLESSD ANUEL AA   MIRAME REMIX (VIDEO OFICIAL).mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Darell - Lollipop (Official Video).mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_KAROL G, Feid, DFZM ft. Ovy On The Drums, J Balvin, Maluma, Ryan Castro, Blessd - +57.mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Key-Key  - Tengo Un Plan Remix ft. OZUNA.mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Mírame.mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Pa Que Retozen.mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Plan B - Candy [Official Audio].mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Quiero Saber.mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Ryan Castro, Feid - Monastery (Vídeo Oficial).mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_Ven Bailalo - Reggaeton Mix.mp3' },
      { name: "FloyyMenor - Gata Only", file: '../demos/Reggaeton/recortado_W Sound 05  LA PLENA  - Beéle, Westcol, Ovy On The Drums.mp3' }
    ],
    "rock": [
      { name: "Guns N' Roses - Sweet Child O' Mine", file: '../demos/Rock/recortado_Audioslave - Like a Stone (Official Video).mp3' },
      { name: "Led Zeppelin - Stairway to Heaven", file: '../demos/Rock/recortado_Back in Black - AC DC (Sub Español).mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Bon Jovi - Its My Life Lyrics (subtitulada y traducida al español).mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Héroes del Silencio - Entre dos tierras (videoclip oficial).mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Hotel California Subtitulado en español.mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Kiss - I Was Made For LovinYou.mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Nirvana - Smells Like Teen Spirit (Official Music Video).mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Pink Floyd - Another Brick In The Wall (Subtitulada en Español).mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Slipknot - Psychosocial [OFFICIAL VIDEO] [HD].mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_Soda Stereo - De Musica Ligera (El Último Concierto).mp3' },
      { name: "Queen - Bohemian Rhapsody", file: '../demos/Rock/recortado_System Of A Down - Toxicity (Official HD Video).mp3' }
    ],
    "salsa": [
      { name: "Joe Arroyo - La rebelion", file: '../demos/Salsa/recortado_Como tu Amante o Tu Amigo Eddie Santiago.mp3' },
      { name: "Marc Anthony - Vivir Mi Vida", file: '../demos/Salsa/recortado_Jerry Rivera - Amores Como el Nuestro (Audio).mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Lloraras.mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Luis Vázquez - Peligro de Amor (Oficial).mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Me Hace Daño Verte, Fresto Music - Video Oficial.mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Me Tengo Que Ir.mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Siempre Seré.mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Te Va A Doler, Maelo Ruiz - Audio.mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Tito Nieves - Fabricando Fantasías (Version salsa).mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Ven Devorame Otra Vez.mp3' },
      { name: "Willie Colón - Pedro Navaja", file: '../demos/Salsa/recortado_Veneno para dos letra   La bronko   Frases en Salsa.mp3' }
    ],
    "techno": [
      { name: "Darude - Sandstorm", file: '../demos/Techno/recortado_Coco Jamboo.mp3' },
      { name: "Techno N Tequilla - Eins Zwei Polizei", file: '../demos/Techno/recortado_Be My Lover.mp3' },
      { name: "Zapravka - Techno", file: '../demos/Techno/recortado_Brother Louie Mix 98 (Radio Edit).mp3' },
      { name: "Zapravka - Techno", file: '../demos/Techno/recortado_Its My Life (Remix).mp3' },
      { name: "Zapravka - Techno", file: '../demos/Techno/recortado_Techno oscuro 2019 (CHESES SET).mp3' },
      { name: "Zapravka - Techno", file: '../demos/Techno/recortado_Tonight Is The Night.mp3' },
      { name: "Zapravka - Techno", file: '../demos/Techno/recortado_Tujamo, VINNE & Murotani - Techno Party (Bass House   Tech House).mp3' },
      { name: "Zapravka - Techno", file: '../demos/Techno/recortado_ZENoN - GO AGAIN.mp3' }
    ],
    "vallenato": [
      { name: "A Besitos - Los Diablitos", file: '../demos/Vallenato/recortado_A Pesar De Todo, La Combinación Vallenata, Vídeo Letra - Sentir Vallenato.mp3' },
      { name: "Acompáñame, Miguel Morales", file: '../demos/Vallenato/recortado_Ayer Y Hoy, La Combinación Vallenata, Video Letra - Sentir Vallenato.mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_Ceniza Fría, Conjunto Sentir Vallenato, Video Letra - Sentir Vallenato.mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_diez razones para amarte martin elias letra.mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_No Pude Olvidarte, Binomio De Oro De América, Video Letra - Sentir Vallenato.mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_Rafa Pérez - Si No Me Falla El Corazón (Video Oficial).mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_Te Sorprenderás, Los Inquietos Del Vallenato, Video Letra.mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_Tres Noches, Jesús Manuel, Vídeo Letra - Sentir Vallenato.mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_Volver, Nelson Velásquez, Video Letra - Sentir Vallenato.mp3' },
      { name: "Adiós Amor  - Luis Mateus & David Rendón", file: '../demos/Vallenato/recortado_Y No Regresas, Binomio De Oro De América, Video Letra - Sentir Vallenato.mp3' }
    ]
  } as Record<string, { name: string; file: string }[]>,
  playlistImages: {
    crossover: path.join(__dirname, '../Portada/cross.png'),
    cristiana: path.join(__dirname, '../Portada/cristiana.png'),
    vallenato: path.join(__dirname, '../Portada/vallenato.png'),
    salsa: path.join(__dirname, '../Portada/salsa.png'),
    tropical: path.join(__dirname, '../Portada/tropical_y_bailable.png'),
    rancheras: path.join(__dirname, '../Portada/rancheras_y_norteñas.png'),
    rock: path.join(__dirname, '../Portada/rock_and_roll.png'),
    baladas: path.join(__dirname, '../Portada/baladas_y_popSONGS.png'),
    despecho: path.join(__dirname, '../Portada/Despecho_y_sentimiento.png'),
    recuerdos: path.join(__dirname, '../Portada/Recuerdos_de_oro.png')
  },
  playlistsData: [
    {
      name: '🎵 Playlist Crossover: lo mejor en salsa, vallenato, reggaetón, popular, baladas, cumbia y más.',
      genres: ['salsa', 'vallenato', 'merengue', 'norteñas', 'rancheras', 'popular', 'baladas', 'reggaeton', 'electronica', 'boleros', 'tango', 'cumbia'],
      img: 'crossover'
    },
    {
      name: '🕺 Colombia en el Alma',
      genres: ['vallenato', 'cumbia', 'merengue', 'popular'],
      img: 'vallenato'
    },
    {
      name: '💃 Bailoteo Latino',
      genres: ['salsa', 'merengue', 'reggaeton'],
      img: 'tropical'
    },
    {
      name: '🌍 Sonidos del Mundo 🎶',
      genres: ['rock', 'electronica', 'pop', 'clasica'],
      img: 'rock'
    },
    {
      name: '🎶 Personalizada',
      genres: [],
      img: null
    }
  ]
};

class DemoManager {
  static async getRandomSongsByGenres(
    selectedGenres: string[],
    count = 2
  ): Promise<{ name: string; filePath: string; genre: string }[]> {
    const songs: { name: string; filePath: string; genre: string }[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (songs.length < count && attempts < selectedGenres.length * 3) {
      for (const genre of selectedGenres) {
        const genreSongs = musicData.genreTopHits[genre] || [];
        if (genreSongs.length > 0) {
          const randSong = genreSongs[Math.floor(Math.random() * genreSongs.length)];
          if (!used.has(randSong.name)) {
            const fileCheck = await MusicUtils.getValidMediaPath(randSong.file);
            if (fileCheck.valid) {
              songs.push({ name: randSong.name, filePath: fileCheck.path, genre });
              used.add(randSong.name);
            }
          }
        }
        if (songs.length >= count) break;
      }
      attempts++;
    }
    return songs.slice(0, count);
  }
}

class IntentDetector {
  static isContinueKeyword(input: string): boolean {
    const norm = MusicUtils.normalizeText(input.trim());
    return /^(ok|okay|si|sí|continuar|siguiente|listo|aceptar|confirmo|dale|va|de una|perfecto)$/i.test(norm);
  }
  static extractGenres(message: string): string[] {
    const normalized = MusicUtils.normalizeText(message);
    return Object.keys(musicData.genreTopHits).filter(genre => normalized.includes(genre));
  }
  static extractArtists(message: string, genres: string[] = []): string[] {
    const normalized = MusicUtils.normalizeText(message);
    const genresToSearch = genres.length > 0 ? genres : Object.keys(musicData.artistsByGenre);
    const found: string[] = [];
    genresToSearch.forEach(genre => {
      (musicData.artistsByGenre as any)[genre]?.forEach((artist: string) => {
        if (normalized.includes(MusicUtils.normalizeText(artist))) found.push(artist);
      });
    });
    return MusicUtils.dedupeArray(found);
  }
  static extractMoodKeywords(message: string): string[] {
    const normalized = MusicUtils.normalizeText(message);
    const moodKeywords = ['feliz', 'triste', 'emocionante', 'relajante', 'romántico', 'energético', 'nostálgico'];
    return moodKeywords.filter(keyword => normalized.includes(keyword));
  }
  static extractCapacitySelection(message: string): string | null {
    const norm = MusicUtils.normalizeText(message);
    if (/(^|\s)(1|8\sgb)(\s|$)/.test(norm)) return '8GB';
    if (/(^|\s)(2|32\sgb)(\s|$)/.test(norm)) return '32GB';
    if (/(^|\s)(3|64\sgb)(\s|$)/.test(norm)) return '64GB';
    if (/(^|\s)(4|128\sgb)(\s|$)/.test(norm)) return '128GB';
    return null;

  }
  static detectBuyingIntent(message: string): { intent: 'high' | 'medium' | 'low'; keywords: string[] } {
    const normalized = MusicUtils.normalizeText(message);
    const buyingKeywords = ['comprar', 'ordenar', 'quiero ya', 'deseo adquirir', 'tomar', 'llevar'];
    const matches = buyingKeywords.filter(keyword => normalized.includes(keyword));
    return { intent: matches.length > 2 ? 'high' : matches.length > 0 ? 'medium' : 'low', keywords: matches };
  }
}

// --- Processing Controller ---
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

// --- Order Progress Helper ---
async function persistOrderProgress(phoneNumber: string, data: Partial<UserCustomizationState>) {
  const state = await UserStateManager.getOrCreate(phoneNumber);
  Object.assign(state, data);
  await UserStateManager.save(state);

  const session = userSessions.get(phoneNumber) || {};
  Object.assign(session as any, {
    finalizedGenres: state.finalizedGenres,
    finalizedArtists: state.finalizedArtists,
    finalizedMoods: state.finalizedMoods,
    finalizedUsbName: state.finalizedUsbName,
    finalizedCapacity: state.finalizedCapacity,
    finalizedOrderAt: state.finalizedOrderAt
  });
  userSessions.set(phoneNumber, session as UserSession);
}

// --- Objection Handler ---
async function handleObjections(userInput: string, flowDynamic: any) {
  const input = MusicUtils.normalizeText(userInput);

  // Precio
  if (/(precio|car[oa]|costos?|vale|cu[aá]nto|muy caro)/i.test(input)) {
    await flowDynamic([
      '💡 Incluye: música 100% a elección, carpetas por género y garantía 7 días.',
      '🎁 HOY: Upgrade -15% y 2da USB -35%.'
    ]);
    await MusicUtils.delay(300);
    await sendPricingTable(flowDynamic);
    return true;
  }

  // Tiempo/entrega
  if (/(demora|tarda|cu[aá]nto (demora|tiempo)|entrega)/i.test(input)) {
    await flowDynamic(['⏱️ Preparación: Premium 24h / Básico 48h. Envío nacional 1–3 días hábiles.']);
    return true;
  }

  // Confianza/seguridad
  if (/(conf[ií]o|seguro|garant[ií]a|fraude|es real|confiable)/i.test(input)) {
    await flowDynamic(['✅ Compra segura: garantía 7 días y reposición sin costo si algún archivo falla.']);
    return true;
  }

  return false;
}

// --- Upselling / Cross-selling Helper ---
async function suggestUpsell(phoneNumber: string, flowDynamic: any, userState: UserCustomizationState) {
  if (!userState.upsellOfferSent) {
    userState.upsellOfferSent = true;
    await UserStateManager.save(userState);
    await flowDynamic([
      '🎬 Oferta: Combo Música + Videos -25%. ¿Deseas agregar la USB de VIDEOS (1.000 a 4.000 videoclips según capacidad)? Escribe "QUIERO COMBO" o "SOLO MÚSICA".'
    ]);
  }
}

// --- Payment Step Helper ---
async function offerQuickPayment(phoneNumber: string, flowDynamic: any, userState: UserCustomizationState) {
  userState.lastPurchaseStep = 'payment_offered';
  await UserStateManager.save(userState);
  await flowDynamic([
    '🛒 Último paso:\nPaga por Nequi/Daviplata/Bancolombia o contraentrega en ciudades habilitadas. ¿Te envío el enlace de pago? Escribe "PAGAR".'
  ]);
}

async function sendPricingTable(flowDynamic: any) {
  try {
    const pricingImagePath = path.resolve(__dirname, '../Portada/pricing_music_table.png');
    const canAccess = await fs.access(pricingImagePath).then(() => true).catch(() => false);
    if (canAccess) {
      await flowDynamic([{ body: 'Indica cual opción de la tabla prefieres: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.', media: pricingImagePath }]);
    } else {
      await flowDynamic(['💾 Capacidades: 1) 8GB  2) 32GB  3) 64GB  4) 128GB. Responde con el número.']);
    }
  } catch {
    await flowDynamic(['💾 Capacidades: 1) 8GB  2) 32GB  3) 64GB  4) 128GB. Responde con el número.']);
  }
}

// --- MAIN FLOW ---
const musicUsb = addKeyword(['Hola, me interesa la USB con música.'])
  .addAction(async (ctx, { flowDynamic }) => {
    const phoneNumber = ctx.from;
    await updateUserSession(phoneNumber, ctx.body, 'musicUsb');
    try {
      if (!phoneNumber || !ctx.body) return;
      if (ProcessingController.isProcessing(phoneNumber)) return;
      ProcessingController.setProcessing(phoneNumber, 'music_presentation');

      const session = (await getUserSession(phoneNumber)) as UserSession;
      session.currentFlow = 'musicUsb';
      session.isActive = true;

      // 1. Bienvenida y beneficios
      await flowDynamic([
        '🚀 Bienvenido: USB musical personalizada con envío GRATIS en Colombia.\n' +
        '🎶 Música 100% a tu gusto (géneros/artistas) + carpetas ordenadas.\n' +
        '🔥 Promos activas HOY.'
      ].join('\n'));
      await MusicUtils.delay(400);


      // 2. Playlist top
      const playlist = musicData.playlistsData[0];
      let playlistMedia: string | null = null;
      if (playlist.img) {
        const mediaResult = await MusicUtils.getValidMediaPath(musicData.playlistImages[playlist.img]);
        if (mediaResult.valid) playlistMedia = mediaResult.path;
      }
      if (playlistMedia) {
        await flowDynamic([{ body: `🎵 Playlist Top: ${playlist.name}`, media: playlistMedia }]);
      } else {
        await flowDynamic([`🎵 Playlist Top: ${playlist.name}`]);
      }
      await MusicUtils.delay(400);

      // 3. Demos
      const strategicGenres = ['reggaeton', 'salsa', 'bachata'];
      const demos = await DemoManager.getRandomSongsByGenres(strategicGenres, 2);
      if (demos.length > 0) {
        await flowDynamic(['👂 Escucha cómo suena tu USB:']);
        for (const demo of demos) {
          await flowDynamic([{ body: `🎵 ${demo.name}`, media: demo.filePath }]);
          await MusicUtils.delay(200);
        }
      }

      // 4. Prompt de personalización (directo y enfocado en música)
      await flowDynamic([
        '🙌 Personaliza tu USB: escribe 1 género o artista (ej: "vallenato", "Karol G") o responde "OK" para Crossover (de todo un poco) y ver capacidades/precios.'
      ]);

      session.conversationData = session.conversationData || {};
      (session.conversationData as any).stage = 'personalization';

      // Guardamos la hora en que se envió el mensaje de géneros
      (session.conversationData as any).welcomeSentAt = Date.now();
      (session.conversationData as any).musicGenresPromptAt = Date.now();
      (session.conversationData as any).musicPricesShown =
        (session.conversationData as any).musicPricesShown || false;

      const userState = await UserStateManager.getOrCreate(phoneNumber);
      userState.customizationStage = 'initial';
      userState.conversionStage = 'awareness';
      userState.interactionCount = (userState.interactionCount || 0) + 1;
      userState.touchpoints = [...(userState.touchpoints || []), 'music_entry'];
      await UserStateManager.save(userState);

      ProcessingController.clearProcessing(phoneNumber);
    } catch (error) {
      ProcessingController.clearProcessing(phoneNumber);
      await flowDynamic(['⚠️ Ocurrió un error. Por favor intenta nuevamente o escribe "música".']);
    }
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const phoneNumber = ctx.from;
    const userInput = ctx.body?.trim() || '';
    const session = (await getUserSession(phoneNumber)) as UserSession;

    await updateUserSession(phoneNumber, userInput, 'musicUsb');

    // --- AUTO-SALTO A PRECIOS DESPUÉS DE 1 HORA SIN DEFINIR GÉNEROS ---
    try {
      const conv = (session.conversationData || {}) as any;
      const promptTs = conv.musicGenresPromptAt as number | undefined;
      const pricesAlreadyShown = !!conv.musicPricesShown;

      if (promptTs && !pricesAlreadyShown) {
        const elapsedMs = Date.now() - promptTs;
        const ONE_HOUR_MS = 60 * 60 * 1000;

        if (elapsedMs >= ONE_HOUR_MS) {
          conv.musicPricesShown = true;
          session.conversationData = conv;

          await updateUserSession(
            phoneNumber,
            userInput,
            'musicUsb',
            'auto_prices_after_1h',
            false,
            {
              metadata: {
                reason: 'auto_prices_after_1h',
                elapsedMinutes: Math.round(elapsedMs / 60000)
              }
            }
          );

          // Mensaje especial para festividades sin parecer spam
          await flowDynamic([
            [
              '🎉 Se acercan las festividades y es un buen momento para dejar tu música lista.',
              'Te muestro directamente las capacidades y precios de la USB con música para que elijas la que mejor se ajusta a ti:'
            ].join('\n')
          ]);

          try {
            const pricingImagePath = path.resolve(__dirname, '../Portada/pricing_music_table.png');
            const canAccess = await fs.access(pricingImagePath).then(() => true).catch(() => false);

            if (canAccess) {
              await flowDynamic([{ body: 'Indica cual opción de la tabla prefieres: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.', media: pricingImagePath }]);
            } else {
              await flowDynamic([
                '📊 No se pudo cargar la imagen, pero puedes elegir: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.'
              ]);
            }
          } catch {
            await flowDynamic([
              '⚠️ No se pudo cargar la imagen de precios. Elige: 1️⃣ 8GB • 2️⃣ 32GB • 3️⃣ 64GB • 4️⃣ 128GB.'
            ]);
          }

          // Saltamos a selección de capacidad
          await flowDynamic([
            [
              '🎉 Aprovecha para dejar tu música lista.',
              'Te muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
            ].join('\n')
          ]);
          await sendPricingTable(flowDynamic);
          ProcessingController.clearProcessing(phoneNumber);
          return gotoFlow(capacityMusicFlow);

        }
      }
    } catch (e) {
      console.error('Error en auto salto a precios después de 1h (musicUsb):', e);
    }

    // Pregunta directa por precio -> mostramos imagen de la tabla
    if (/(precio|cu[aá]nto|vale|cost[oó]s?)/i.test(userInput)) {
      // await sendPricingTable(flowDynamic);
      await flowDynamic([
        [
          '🎉 Aprovecha para dejar tu música lista.',
          'Te muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
        ].join('\n')
      ]);
      await sendPricingTable(flowDynamic);
      ProcessingController.clearProcessing(phoneNumber);
      return gotoFlow(capacityMusicFlow);

    }

    // OK -> capacidad directa
    if (userInput.toLowerCase() === 'ok') {
      session.currentFlow = 'recommendedPlaylist';
      await flowDynamic([
        [
          '🎉 Aprovecha para dejar tu música lista.',
          'Te muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
        ].join('\n')
      ]);
      await sendPricingTable(flowDynamic);
      ProcessingController.clearProcessing(phoneNumber);
      return gotoFlow(capacityMusicFlow);

    }
    // Detección directa de capacidad por número/texto
    const detectedCap = IntentDetector.extractCapacitySelection(userInput);
    if (detectedCap) {
      await flowDynamic([`✅ Perfecto, ${detectedCap}. Te muestro opciones y continuamos.`]);
      await MusicUtils.delay(250);
      // await sendPricingTable(flowDynamic);
      await flowDynamic([
        [
          '🎉 Aprovecha para dejar tu música lista.',
          'Te muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
        ].join('\n')
      ]);
      await sendPricingTable(flowDynamic);
      ProcessingController.clearProcessing(phoneNumber);
      return gotoFlow(capacityMusicFlow);

    }

    try {
      if (!phoneNumber || !userInput) return;
      if (userInput.startsWith('_event_media__') || userInput.startsWith('_event_')) return;
      if (ProcessingController.isProcessing(phoneNumber)) return;

      ProcessingController.setProcessing(phoneNumber, 'music_capture');

      // Objections
      if (await handleObjections(userInput, flowDynamic)) {
        ProcessingController.clearProcessing(phoneNumber);
        return;
      }

      // Upsell combo
      if (/pack completo|quiero ambos|quiero video|quiero combo/i.test(userInput)) {
        await flowDynamic(['🎁 Perfecto: aplicamos Combo Música + Videos (-25%).']);
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(videoUsb);
      }

      const userState = await UserStateManager.getOrCreate(phoneNumber);

      // Confirmación de preferencias enfocada en música (sin preguntas de uso/regalo)
      if (/^(crossover|ok de todo|de todo)$/i.test(MusicUtils.normalizeText(userInput))) {
        const userState = await UserStateManager.getOrCreate(phoneNumber);
        userState.selectedGenres = musicData.playlistsData[0].genres;
        userState.customizationStage = 'personalizing';
        await UserStateManager.save(userState);
        await flowDynamic([
          [
            '🎉 Aprovecha para dejar tu música lista.',
            'Te muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
          ].join('\n')
        ]);
        await sendPricingTable(flowDynamic);
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      }

      // Preferencias avanzadas
      const userGenres = IntentDetector.extractGenres(userInput);
      const userArtists = IntentDetector.extractArtists(userInput, userGenres);
      const moodKeywords = IntentDetector.extractMoodKeywords(userInput);

      if (userGenres.length > 0 || userArtists.length > 0 || moodKeywords.length > 0) {
        userState.selectedGenres = MusicUtils.dedupeArray([...(userState.selectedGenres || []), ...userGenres]);
        userState.mentionedArtists = MusicUtils.dedupeArray([...(userState.mentionedArtists || []), ...userArtists]);
        userState.moodPreferences = MusicUtils.dedupeArray([...(userState.moodPreferences || []), ...moodKeywords]);
        userState.customizationStage = 'advanced_personalizing';
        userState.conversionStage = 'personalization';
        userState.personalizationCount = (userState.personalizationCount || 0) + 1;
        userState.touchpoints = [...(userState.touchpoints || []), 'advanced_personalization'];
        await UserStateManager.save(userState);
        await persistOrderProgress(phoneNumber, {
          finalizedGenres: userState.selectedGenres,
          finalizedArtists: userState.mentionedArtists,
          finalizedMoods: userState.moodPreferences
        });

        await flowDynamic([
          [
            '🎵 Listo, armamos tu USB con esa música que te gusta.',
            `Géneros: ${userState.selectedGenres.join(', ') || '-'}`,
            `Artistas: ${userState.mentionedArtists.join(', ') || '-'}`,
            '✅ Escribe "OK" para elegir capacidad y aplicar las promos de HOY.'
          ].join('\n')
        ]);
        await MusicUtils.delay(250);

        await suggestUpsell(phoneNumber, flowDynamic, userState);

        ProcessingController.clearProcessing(phoneNumber);
        return;
      }

      // Continuar con OK cuando hay preferencias guardadas
      if (IntentDetector.isContinueKeyword(userInput)) {
        const s = await UserStateManager.getOrCreate(ctx.from);
        // Si no hay preferencias, igual permitimos continuar a tabla para no frenar conversión
        await flowDynamic([
          [
            '🎉 Aprovecha para dejar tu música lista.',
            'Te muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
          ].join('\n')
        ]);
        await sendPricingTable(flowDynamic);
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      }

      // Cierre inmediato si intención alta
      const buyingIntent = IntentDetector.detectBuyingIntent(userInput);
      if (buyingIntent.intent === 'high') {
        // Unificamos mensajes para evitar desorden
        await flowDynamic([
          '🚀 Genial, vamos directo al grano.',
          '🎉 Aprovecha para dejar tu música lista.\nTe muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
        ]);

        await MusicUtils.delay(300);
        await sendPricingTable(flowDynamic);

        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      }

      if (buyingIntent.intent === 'medium') {
        // 1. Enviamos todos los textos juntos para garantizar el orden visual
        await flowDynamic([
          '🛒 Perfecto, te muestro las capacidades para elegir y cerrar.',
          '🎉 Aprovecha para dejar tu música lista.\nTe muestro capacidades y precios de la USB musical (contenido 100% a tu gusto):'
        ].join('\n'));

        // 2. Pequeña pausa para naturalidad
        await MusicUtils.delay(1500);

        // 3. Enviamos la tabla UNA SOLA VEZ
        await sendPricingTable(flowDynamic);

        // 4. Limpiamos estado y derivamos al flujo de selección
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      }

      // Fallback
      userState.unrecognizedResponses = (userState.unrecognizedResponses || 0) + 1;
      userState.touchpoints = [...(userState.touchpoints || []), 'unrecognized_response'];
      await UserStateManager.save(userState);
      await flowDynamic([
        '🙋 Para seguir: escribe 1 género o artista (ej: "salsa", "Bad Bunny") o responde "OK" para ver capacidades y precios.'
      ]);
      ProcessingController.clearProcessing(phoneNumber);
    } catch (error) {
      ProcessingController.clearProcessing(phoneNumber);
    }
  });

export default musicUsb;
