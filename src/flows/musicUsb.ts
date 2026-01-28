import { addKeyword } from '@builderbot/bot';
import capacityMusicFlow from './capacityMusic';
import videoUsb from './videosUsb';
import { updateUserSession, getUserSession, userSessions, getUserCollectedData, buildConfirmationMessage } from './userTrackingSystem';
import { promises as fs } from 'fs';
import path from 'path';
import { saveUserCustomizationState, loadUserCustomizationState } from '../userCustomizationDb';
import { UserSession } from '../../types/global';
import { EnhancedMusicFlow } from './enhancedMusicFlow';
import { flowHelper } from '../services/flowIntegrationHelper';
import { humanDelay } from '../utils/antiBanDelays';
import { isPricingIntent as sharedIsPricingIntent, isConfirmation as sharedIsConfirmation, isMixedGenreInput, isPoliteGraciasResponse } from '../utils/textUtils';
import { buildCompactPriceLadder, buildPostGenrePrompt } from '../utils/priceLadder';
import { ContextualPersuasionComposer } from '../services/persuasion/ContextualPersuasionComposer';
import type { UserContext } from '../types/UserContext';
import { registerBlockingQuestion, ConversationStage } from '../services/stageFollowUpHelper';
import { flowContinuityService } from '../services/FlowContinuityService';

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

const persuasionComposer = new ContextualPersuasionComposer();

const buildUserContext = (session: UserSession): UserContext => {
  const preferencesAny = session.preferences as any;
  const conversationAny = session.conversationData as any;
  const genres =
    session.selectedGenres
    || preferencesAny?.musicGenres
    || conversationAny?.customization?.genres
    || session.movieGenres
    || [];

  return {
    phone: session.phone || session.phoneNumber,
    firstName: session.name?.split(' ')[0],
    stage: session.stage === 'converted' || session.stage === 'completed' ? 'postpurchase' : 'consideration',
    preferences: {
      contentTypes: session.contentType ? [session.contentType] : ['music'],
      genres: Array.isArray(genres) ? genres : [genres].filter(Boolean),
      capacityPreference: session.capacity
    },
    signals: {
      urgency: conversationAny?.urgency === 'high' ? 'high' : undefined,
      trustLevel: session.isReturningUser ? 'high' : undefined
    },
    history: {
      lastInteractionAt: session.lastInteraction,
      messagesCount: session.messageCount,
      previousOrdersCount: session.totalOrders || (session.isReturningUser ? 1 : 0)
    },
    objections: conversationAny?.objections || [],
    cart: {
      selectedProduct: session.selectedProduct?.name || session.selectedProduct?.id,
      capacity: session.capacity,
      priceQuoted: session.price
    },
    flow: {
      currentFlow: session.currentFlow,
      currentStep: session.currentStep
    }
  };
};

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
  static isPricingIntent(message: string): boolean {
    return sharedIsPricingIntent(message);
  }
  
  static isConfirmation(message: string): boolean {
    return sharedIsConfirmation(message);
  }
  
  static isMixedGenreInput(message: string): boolean {
    return isMixedGenreInput(message);
  }
  
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

  // ✅ FIX: Sync genres to main session conversationData for persistence
  const session: Partial<UserSession> = userSessions.get(phoneNumber) || {};
  Object.assign(session as any, {
    finalizedGenres: state.finalizedGenres,
    finalizedArtists: state.finalizedArtists,
    finalizedMoods: state.finalizedMoods,
    finalizedUsbName: state.finalizedUsbName,
    finalizedCapacity: state.finalizedCapacity,
    finalizedOrderAt: state.finalizedOrderAt
  });
  
  // Also store in conversationData for getUserCollectedData to find
  if (!session.conversationData) {
    session.conversationData = {};
  }
  (session.conversationData as any).selectedGenres = state.selectedGenres || state.finalizedGenres;
  (session.conversationData as any).selectedArtists = state.mentionedArtists || state.finalizedArtists;
  (session.conversationData as any).customization = {
    ...(session.conversationData as any).customization,
    genres: state.selectedGenres || state.finalizedGenres,
    artists: state.mentionedArtists || state.finalizedArtists
  };
  
  userSessions.set(phoneNumber, session as UserSession);
}

// --- Objection Handler ---
async function handleObjections(userInput: string, flowDynamic: any) {
  const input = MusicUtils.normalizeText(userInput);

  // Precio
  if (/(precio|car[oa]|costos?|vale|cu[aá]nto|muy caro)/i.test(input)) {
    await humanDelay();
    await flowDynamic([
      '💡 *Incluye todo lo que necesitas:*\n' +
      '✅ Miles de canciones de tus artistas favoritos\n' +
      '✅ Artistas destacados: Bad Bunny, Marc Anthony, Queen, Maná...\n' +
      '✅ Organizada por género y artista para fácil acceso\n' +
      '✅ Garantía 7 días - Satisfacción asegurada\n' +
      '✅ Soporte técnico incluido\n\n' +
      '💸 *Calcula:* Con 5,000 canciones en 32GB, ¡cada canción te cuesta solo $17!'
    ]);
    await humanDelay();
    await flowDynamic([
      '🎁 *OFERTA ESPECIAL HOY:*\n' +
      '• Upgrade de capacidad: -15% descuento\n' +
      '• Segunda USB: -35% descuento\n' +
      '• ¡No dejes pasar esta oportunidad!'
    ]);
    await humanDelay();
    await sendPricingTable(flowDynamic);
    return true;
  }

  // Tiempo/entrega
  if (/(demora|tarda|cu[aá]nto (demora|tiempo)|entrega)/i.test(input)) {
    await humanDelay();
    await flowDynamic([
      '⏱️ *Tiempos de entrega súper rápidos:*\n' +
      '🚀 Preparación Premium: Solo 24 horas\n' +
      '📦 Preparación Básica: 48 horas\n' +
      '🚚 Envío nacional: 1-3 días hábiles\n\n' +
      '¡Tu música personalizada lista en un abrir y cerrar de ojos!'
    ]);
    return true;
  }

  // Confianza/seguridad
  if (/(conf[ií]o|seguro|garant[ií]a|fraude|es real|confiable)/i.test(input)) {
    await humanDelay();
    await flowDynamic([
      '✅ *100% Compra Segura y Garantizada:*\n' +
      '🛡️ Garantía de satisfacción 7 días\n' +
      '🔄 Reposición sin costo si hay algún problema\n' +
      '📞 Soporte técnico siempre disponible\n' +
      '💯 Miles de clientes satisfechos\n\n' +
      '¡Tu inversión está completamente protegida!'
    ]);
    return true;
  }

  return false;
}

// --- Upselling / Cross-selling Helper ---
async function suggestUpsell(phoneNumber: string, flowDynamic: any, userState: UserCustomizationState) {
  if (!userState.upsellOfferSent) {
    userState.upsellOfferSent = true;
    await UserStateManager.save(userState);
    await humanDelay();
    await flowDynamic([
      '🎬 *¡OFERTA ESPECIAL COMBO!*\n\n' +
      '🎵 Música + 🎥 Videos = 💰 -25% descuento\n\n' +
      '✨ *Agrega la USB de VIDEOS musicales ahora:*\n' +
      '• Videoclips HD/4K de Bad Bunny, Karol G, Marc Anthony...\n' +
      '• 1,000 a 4,000 videoclips según capacidad\n' +
      '• Perfecta para fiestas, reuniones y disfrutar en TV\n\n' +
      '💬 Escribe *"QUIERO COMBO"* para aprovechar el descuento\n' +
      'O *"SOLO MÚSICA"* para continuar solo con música'
    ]);
  }
}

// --- Payment Step Helper ---
async function offerQuickPayment(phoneNumber: string, flowDynamic: any, userState: UserCustomizationState) {
  userState.lastPurchaseStep = 'payment_offered';
  await UserStateManager.save(userState);
  await humanDelay();
  await flowDynamic([
    '🛒 *¡ÚLTIMO PASO PARA RECIBIR TU USB!*\n\n' +
    '💳 *Métodos de pago disponibles:*\n' +
    '• Nequi - Instantáneo\n' +
    '• Daviplata - Rápido y seguro\n' +
    '• Bancolombia - Transferencia\n' +
    '• Contraentrega - En ciudades habilitadas\n\n' +
    '¿Listo para finalizar? Escribe *"PAGAR"* y te envío el enlace 👇'
  ]);
}

async function sendPricingTable(flowDynamic: any) {
  // Standard textual pricing format - no images
  await humanDelay();
  await flowDynamic([
    [
      '🎵 *USB de Música Personalizada*',
      '',
      '✨ *¿Qué incluye cada USB?*',
      '✅ Canciones top organizadas por género y artista',
      '✅ Audio en alta calidad (MP3 320kbps)',
      '✅ Artistas destacados: Bad Bunny, Marc Anthony, Queen...',
      '✅ Carpetas organizadas para fácil navegación',
      '✅ Compatible con auto, TV, PC y celular',
      '',
      '📦 *Elige tu capacidad ideal:*',
      '',
      '1️⃣ *8GB* - 1,400 canciones - *$54.900*',
      '   💡 Perfecto para empezar tu colección musical',
      '',
      '2️⃣ *32GB* - 5,000 canciones - *$84.900*',
      '   🎁 Incluye canciones bonus de géneros variados',
      '',
      '3️⃣ *64GB* - 10,000 canciones - *$119.900* ⭐',
      '   🔥 ¡OPCIÓN MÁS POPULAR! Mejor relación calidad-precio',
      '',
      '4️⃣ *128GB* - 25,000 canciones - *$159.900*',
      '   👑 La colección musical definitiva completa',
      '',
      '🎁 *VENTAJAS EXCLUSIVAS:*',
      '🚚 Envío GRATIS a todo Colombia',
      '💰 Pago contraentrega disponible',
      '🛡️ Garantía 7 días - Satisfacción asegurada',
      '',
      '💬 Responde con el número (1, 2, 3 o 4) para continuar 👇'
    ].join('\n')
  ]);
}

// --- MAIN FLOW ---
const musicUsb = addKeyword(['Hola, me interesa la USB con música.'])
  .addAction(async (ctx, { flowDynamic }) => {
    const phoneNumber = ctx.from;
    await updateUserSession(phoneNumber, ctx.body, 'musicUsb');
    try {
      if (!phoneNumber || !ctx.body) return;
      if (ProcessingController.isProcessing(phoneNumber)) return;
      
      // ✅ FIX: Check if welcome was recently sent (within 30 seconds)
      const session = (await getUserSession(phoneNumber)) as UserSession;
      const conversationData = (session.conversationData || {}) as any;
      const welcomeSentAt = conversationData.welcomeSentAt || 0;
      const timeSinceWelcome = Date.now() - welcomeSentAt;
      
      // If welcome was sent less than 30 seconds ago, skip duplicate
      if (timeSinceWelcome < 30000) {
        console.log(`⏸️ [MUSIC USB] Welcome already sent ${timeSinceWelcome / 1000}s ago. Skipping duplicate.`);
        return;
      }
      
       // ✅ FIX: Check if user already has genres selected
       const collectedData = getUserCollectedData(session);
       if (collectedData.hasGenres && collectedData.genres && collectedData.genres.length > 0) {
         console.log(`✅ [MUSIC USB] User already has genres: ${collectedData.genres.join(', ')}`);
         const msg = persuasionComposer.compose({
           flowId: 'musicUsb',
           flowState: { step: 'onboarding' },
           userContext: buildUserContext(session),
           messageIntent: 'ask_question'
         });
         await humanDelay();
         await flowDynamic([msg.text]);
         
         (session.conversationData as any).genresAlreadySelected = true;
         return;
       }
      
      ProcessingController.setProcessing(phoneNumber, 'music_presentation');

      session.currentFlow = 'musicUsb';
      session.isActive = true;

      // Consolidated welcome message (single message, max 10 lines)
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'onboarding' },
         userContext: buildUserContext(session),
         messageIntent: 'ask_question'
       });
       await humanDelay();
       await flowDynamic([msg.text]);

      session.conversationData = session.conversationData || {};
      (session.conversationData as any).stage = 'personalization';

      // ✅ Mark welcome as sent with current timestamp
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

      // 🔔 Register blocking question for stage-based follow-up
      // If user doesn't respond to genre question, follow-up will be sent after 20-30 min
      await registerBlockingQuestion(
        phoneNumber,
        ConversationStage.ASK_GENRE,
        'music_genre_selection',
        'genre_selection',
        'musicUsb',
        { contentType: 'music', step: 'personalization' }
      ).catch(err => console.warn('⚠️ Failed to register blocking question:', err));

      // 🎯 Set flow state for continuity - ensures user's next response stays in musicUsb flow
      // This is critical to prevent the router from redirecting genre answers to other flows
      await flowContinuityService.setFlowState(phoneNumber, {
        flowId: 'musicUsb',
        step: 'genre_selection',
        expectedInput: 'GENRES',
        questionId: 'music_genre_selection',
        questionText: '¿Qué géneros musicales te gustan?',
        timeoutHours: 2,
        context: { contentType: 'music', stage: 'personalization' }
      }).catch(err => console.warn('⚠️ Failed to set flow continuity state:', err));

      ProcessingController.clearProcessing(phoneNumber);
    } catch (error) {
      ProcessingController.clearProcessing(phoneNumber);
      await humanDelay();
      await flowDynamic(['⚠️ Ocurrió un error. Por favor intenta nuevamente o escribe "música".']);
    }
  })
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const phoneNumber = ctx.from;
    const userInput = ctx.body?.trim() || '';
    const session = (await getUserSession(phoneNumber)) as UserSession;

    // Update session with proper stage tracking
    await updateUserSession(phoneNumber, userInput, 'musicUsb', 'processing_preference_response', false, {
      metadata: { userMessage: userInput }
    });
    
    // ✅ FIX: Handle genre confirmation/change response
    const conversationData = (session.conversationData || {}) as any;
    const normalizedInput = userInput.toLowerCase().trim();
    
    if (conversationData.genresAlreadySelected) {
      if (normalizedInput.includes('cambiar')) {
        // Clear existing genres and let user select new ones
        delete conversationData.selectedGenres;
        delete conversationData.customization;
        conversationData.genresAlreadySelected = false;
        
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'preference_collection' },
         userContext: buildUserContext(session),
         messageIntent: 'ask_question'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
       return;
      } else if (normalizedInput.includes('continuar') || normalizedInput.includes('si') || normalizedInput === 'ok') {
        // Continue with existing genres, go to capacity
        conversationData.genresAlreadySelected = false;
        const msg = persuasionComposer.compose({
          flowId: 'musicUsb',
          flowState: { step: 'capacity_choice' },
          userContext: buildUserContext(session),
          messageIntent: 'present_options'
        });
        await humanDelay();
        await flowDynamic([msg.text]);
        await humanDelay();
        await sendPricingTable(flowDynamic);
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      }
    }

    // 🎯 COHERENCE FIX: Handle "gracias" during genre selection - show prices CTA instead of resetting
    // If user says "gracias" while we're expecting genre selection, guide them to prices
    if (isPoliteGraciasResponse(userInput)) {
      console.log(`✅ [MUSIC USB] User said "${userInput}" during genre selection - showing prices CTA`);
      await humanDelay();
      await flowDynamic([
        '¡De nada! 😊\n\n' +
        '¿Te gustaría ver los *precios y capacidades* disponibles?\n\n' +
        'Escribe *PRECIOS* o cuéntame qué géneros musicales te gustan 🎵'
      ]);
      // Keep flow state active - don't clear it
      ProcessingController.clearProcessing(phoneNumber);
      return; // Stay in flow, don't redirect
    }

    // === PRIORITY 1: Detect pricing intent immediately ===
    if (IntentDetector.isPricingIntent(userInput)) {
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'capacity_choice' },
         userContext: buildUserContext(session),
         messageIntent: 'present_options'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
       await humanDelay();
       await sendPricingTable(flowDynamic);
       ProcessingController.clearProcessing(phoneNumber);
       return gotoFlow(capacityMusicFlow);
    }

    // === PRIORITY 2: Detect confirmation (Okey, OK, etc.) ===
    if (IntentDetector.isConfirmation(userInput)) {
      // Check if user was asking for prices or confirming genre selection
      const conv = (session.conversationData || {}) as any;
      const askedForPrices = conv.askedForPrices || false;
      
      if (askedForPrices) {
        // User confirmed they want to see prices
        const msg = persuasionComposer.compose({
          flowId: 'musicUsb',
          flowState: { step: 'capacity_choice' },
          userContext: buildUserContext(session),
          messageIntent: 'present_options'
        });
        await humanDelay();
        await flowDynamic([msg.text]);
        await humanDelay();
        await sendPricingTable(flowDynamic);
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      } else {
        // User confirmed genre selection, show capacity options
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'capacity_choice' },
         userContext: buildUserContext(session),
         messageIntent: 'present_options'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
       await humanDelay();
       await sendPricingTable(flowDynamic);
       ProcessingController.clearProcessing(phoneNumber);
       return gotoFlow(capacityMusicFlow);
      }
    }

    // === Manejo de objeciones con persuasión ===
    const lowerInput = userInput.toLowerCase();
     if (/caro|costoso|mucho|precio alto|no s[eé]|dud|no est[oó]y segur/i.test(lowerInput)) {
       // Track objection handling
       await updateUserSession(phoneNumber, userInput, 'musicUsb', 'objection_handling', false, {
         metadata: { objectionType: 'price_concern' }
       });
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'objection' },
         userContext: buildUserContext(session),
         messageIntent: 'objection_reply'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
       return;
     }

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

          // Direct and concise message (max 8 lines)
         const msg = persuasionComposer.compose({
           flowId: 'musicUsb',
           flowState: { step: 'capacity_choice' },
           userContext: buildUserContext(session),
           messageIntent: 'present_options'
         });
         await humanDelay();
         await flowDynamic([msg.text]);

         await sendPricingTable(flowDynamic);
         ProcessingController.clearProcessing(phoneNumber);
         return gotoFlow(capacityMusicFlow);

        }
      }
    } catch (e) {
      console.error('Error en auto salto a precios después de 1h (musicUsb):', e);
    }

    // Detección directa de capacidad por número/texto
    const detectedCap = IntentDetector.extractCapacitySelection(userInput);
    if (detectedCap) {
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'confirmation' },
         userContext: buildUserContext(session),
         messageIntent: 'confirm'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
       await humanDelay();
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
        await humanDelay();
        await flowDynamic([
          '🎁 *¡Increíble elección! La mejor decisión*\n\n' +
          '✅ Combo Música + Videos Musicales activado\n' +
          '🎵 Canciones de tus artistas favoritos\n' +
          '🎬 Videoclips HD/4K de los mismos artistas\n' +
          '💰 Descuento especial del -25% aplicado\n\n' +
          '¡Disfrutarás de Bad Bunny, Marc Anthony, Queen y más en audio Y video! 🎉'
        ]);
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(videoUsb);
      }

      const userState = await UserStateManager.getOrCreate(phoneNumber);

      // Mixed/Crossover genre detection - handles "de todo", "me gusta todo", "variado", etc.
      if (IntentDetector.isMixedGenreInput(userInput) || /^(crossover|ok de todo)$/i.test(MusicUtils.normalizeText(userInput))) {
        userState.selectedGenres = musicData.playlistsData[0].genres;
        userState.customizationStage = 'personalizing';
        await UserStateManager.save(userState);
        
        // Clear genre selection flow state - user is progressing to capacity selection
        await flowContinuityService.clearFlowState(phoneNumber).catch(err => 
          console.warn('⚠️ Failed to clear flow state:', err)
        );
        
        await humanDelay();
        // Short price-forward message (< 450 chars)
        await flowDynamic([
          '🎵 *Mix Variado anotado.*\n\n' +
          buildCompactPriceLadder('music')
        ]);
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

        // IMPORTANT: Persist to userTrackingSystem session as well
        await persistOrderProgress(phoneNumber, {
          finalizedGenres: userState.selectedGenres,
          finalizedArtists: userState.mentionedArtists,
          finalizedMoods: userState.moodPreferences
        });

        // Update session tracking with collected data
        await updateUserSession(
          phoneNumber,
          userInput,
          'musicUsb',
          'preferences_collected',
          false,
          {
            metadata: {
              genres: userState.selectedGenres,
              artists: userState.mentionedArtists,
              moods: userState.moodPreferences,
              personalizationComplete: true
            }
          }
        );

        // Check what data we've already collected to avoid redundancy
        const session = await getUserSession(phoneNumber);
        const collectedData = getUserCollectedData(session);
        console.log(`📊 Music flow - Data collected: ${collectedData.completionPercentage}% complete`);

        // SHORT price-forward message after genre capture (< 450 chars)
        // Shows prices within next 1-2 messages as per requirement
        await humanDelay();
        await flowDynamic([buildPostGenrePrompt('music', userState.selectedGenres)]);

        ProcessingController.clearProcessing(phoneNumber);
        return;
      }

      // Continue with OK (concise message)
      if (IntentDetector.isContinueKeyword(userInput)) {
        // ✅ FIX: If capacity already selected, skip to data collection instead of showing pricing again
        const collectedData = getUserCollectedData(session);
        if (collectedData.hasCapacity) {
         const msg = persuasionComposer.compose({
           flowId: 'musicUsb',
           flowState: { step: 'confirmation' },
           userContext: buildUserContext(session),
           messageIntent: 'confirm'
         });
         await humanDelay();
         await flowDynamic([msg.text]);
         ProcessingController.clearProcessing(phoneNumber);
          
          // Import and go to shipping data collection
          const { default: capacityMusicFlow } = await import('./capacityMusic');
          return gotoFlow(capacityMusicFlow);
        }
        
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'capacity_choice' },
         userContext: buildUserContext(session),
         messageIntent: 'present_options'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
       await sendPricingTable(flowDynamic);
       ProcessingController.clearProcessing(phoneNumber);
       return gotoFlow(capacityMusicFlow);
      }

      // High buying intent (simplified message)
      const buyingIntent = IntentDetector.detectBuyingIntent(userInput);
      if (buyingIntent.intent === 'high') {
       const msg = persuasionComposer.compose({
         flowId: 'musicUsb',
         flowState: { step: 'capacity_choice' },
         userContext: buildUserContext(session),
         messageIntent: 'present_options'
       });
       await humanDelay();
       await flowDynamic([msg.text]);
       await humanDelay();
       await sendPricingTable(flowDynamic);
       ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      }

      if (buyingIntent.intent === 'medium') {
        await humanDelay();
        await flowDynamic(['🛒 ¡Perfecto! Aquí están las capacidades disponibles para ti:']);
        await humanDelay();
        await sendPricingTable(flowDynamic);
        ProcessingController.clearProcessing(phoneNumber);
        return gotoFlow(capacityMusicFlow);
      }

      // Contextual fallback - guide user to next step without generic "help" message
      userState.unrecognizedResponses = (userState.unrecognizedResponses || 0) + 1;
      userState.touchpoints = [...(userState.touchpoints || []), 'unrecognized_response'];
      await UserStateManager.save(userState);
      await humanDelay();
      await flowDynamic([
        '🎵 *Elige cómo personalizar tu USB:*\n\n' +
        '1️⃣ Escribe un género: salsa, reggaetón, rock, baladas\n' +
        '2️⃣ Escribe "de todo" para mix variado\n' +
        '3️⃣ Escribe "PRECIOS" para ver capacidades\n' +
        '4️⃣ Escribe "OK" para continuar\n\n' +
        '¿Cuál prefieres? 👇'
      ]);
      ProcessingController.clearProcessing(phoneNumber);
    } catch (error) {
      ProcessingController.clearProcessing(phoneNumber);
    }
  });

export default musicUsb;
