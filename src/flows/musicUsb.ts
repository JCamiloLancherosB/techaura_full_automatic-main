import { addKeyword, EVENTS } from '@builderbot/bot';
import capacityMusic from './capacityMusic';
import videoUsb from './videosUsb';
import { updateUserSession, getUserSession, userSessions, canSendOnce } from './userTrackingSystem';
import { promises as fs } from 'fs';
import path from 'path';
import { saveUserCustomizationState, loadUserCustomizationState } from '../userCustomizationDb';
import { UserSession } from '../../types/global';
import { preHandler, postHandler } from './middlewareFlowGuard';
import { MEDIA_ASSETS } from '../config/mediaAssets';
import { VideoUtils, hasSentBody } from './videosUsb';

// --- INTERFACES & STATE ---

interface UserCustomizationState {
  phoneNumber: string;
  selectedGenres: string[];
  mentionedArtists: string[];
  customizationStage: 'initial' | 'personalizing' | 'satisfied' | 'ready_to_continue' | 'naming' | 'completed' | 'quick_selection' | 'advanced_personalizing';
  lastPersonalizationTime: Date;
  personalizationCount: number;
  touchpoints?: string[];
  moodPreferences?: string[];
  unrecognizedResponses?: number;
  // Datos automáticos para preparar pedido:
  finalizedGenres?: string[];
  finalizedArtists?: string[];
  finalizedMoods?: string[];
  finalizedUsbName?: string;
  finalizedCapacity?: string;
  finalizedOrderAt?: string;
  lastPurchaseStep?: string;
}

// --- DATA (Optimizada) ---

export const musicData = {
  artistsByGenre: {
    "rock": [
      // Clásicos Rock en Inglés
      "guns n roses", "metallica", "ac/dc", "queen", "led zeppelin", "pink floyd", "nirvana",
      "bon jovi", "aerosmith", "kiss", "the beatles", "rolling stones", "u2", "linkin park",
      "green day", "foo fighters", "red hot chili peppers", "pearl jam", "radiohead",
      "system of a down", "iron maiden", "black sabbath", "the doors", "david bowie",
      "scorpions", "def leppard", "eagles", "creedence clearwater revival", "evanescence",
      "coldplay", "imagine dragons", "arctic monkeys", "the strokes", "muse", "kings of leon",
      "oasis", "blur", "the cure", "depeche mode", "r.e.m.", "blink-182", "paramore", "panic! at the disco",
      "korn", "limp bizkit", "slipknot", "rammstein", "disturbed", "avenged sevenfold",

      // Rock en Español / Latino
      "soda stereo", "gustavo cerati", "caifanes", "héroes del silencio", "bunbury",
      "maná", "los enanitos verdes", "hombres g", "café tacvba", "molotov", "mago de oz",
      "rata blanca", "los prisioneros", "los fabulosos cadillacs", "auténticos decadentes",
      "andrés calamaro", "charly garcía", "fito páez", "luis alberto spinetta", "el tri",
      "zoé", "cuarteto de nos", "no te va gustar", "la ley", "jarabe de palo", "juanes",
      "aterciopelados", "estopa", "fito y fitipaldis", "vetusta morla", "bunnbury"
    ],
    "salsa": [
      // Salsa Clásica / Fania / Dura
      "hector lavoe", "willie colon", "celia cruz", "ruben blades", "cheo feliciano",
      "ismael rivera", "la fania all stars", "richie ray y bobby cruz", "el gran combo de puerto rico",
      "la sonora ponceña", "oscar d'leon", "andy montañez", "tito puente", "johnny pacheco",
      "ray barretto", "roberto roena", "bobby valentin", "ismael miranda", "adalerberto santiago",

      // Salsa Romántica
      "marc anthony", "gilberto santa rosa", "victor manuelle", "jerry rivera", "eddie santiago",
      "la india", "tito nieves", "luis enrique", "rey ruiz", "tony vega", "willie gonzalez",
      "frankie ruiz", "grupo niche", "guayacán orquesta", "fruko y sus tesos", "joe arroyo",
      "maelo ruiz", "david pabon", "hildemaro", "paquito guzman", "lalo rodriguez",
      "tito rojas", "galy galiano", "adolescent's orquesta", "los titanes"
    ],
    "vallenato": [
      // Juglares y Clásicos
      "diomedes diaz", "rafael orozco", "binomio de oro", "jorge oñate", "poncho zuleta",
      "los hermanos zuleta", "los betos", "alfredo gutierrez", "alejo duran", "ivan villazon",
      "beto zabaleta", "diomedes dionisio", "farid ortiz",

      // Vallenato Romántico / Nueva Ola
      "carlos vives", "silvestre dangond", "jorge celedon", "martin elias", "kaleth morales",
      "felipe pelaez", "peter manjarres", "jean carlos centeno", "nelson velasquez",
      "los inquietos del vallenato", "los diablitos", "los gigantes del vallenato",
      "miguel morales", "luis mateus", "hebert vargas", "alex manga", "omar geles",
      "patricia teheran", "jesus manuel estrada", "churo diaz", "elder dayan diaz",
      "diego daza", "ana del castillo", "mono zabaleta", "grupo kvrass", "karen lizarazo"
    ],
    "reggaeton": [
      // The Big Bosses & Old School
      "daddy yankee", "don omar", "wisin y yandel", "tego calderon", "ivy queen",
      "tito el bambino", "zion y lennox", "arcangel", "de la ghetto", "jowell y randy",
      "alexis y fido", "plan b", "chencho corleone", "hector el father", "trebol clan",
      "baby rasta y gringo", "ñejo y dalmata", "ñengo flow", "cosculluela", "tempo",

      // Superestrellas Globales & Nueva Escuela
      "bad bunny", "karol g", "j balvin", "maluma", "ozuna", "anuel aa", "rauw alejandro",
      "feid", "ferxxo", "myke towers", "sech", "farruko", "nicky jam", "becky g", "natti natasha",
      "rosalia", "manuel turizo", "piso 21", "sebastian yatra", "camilo", "mau y ricky",
      "ryan castro", "blessd", "el alfa", "rochy rd", "tokischa", "cris mj", "young miko",
      "quevedo", "bizarrap", "duki", "tiago pzk", "maria becerra", "nicki nicole", "tini"
    ],
    "bachata": [
      "romeo santos", "aventura", "prince royce", "juan luis guerra", "frank reyes",
      "anthony santos", "zacarias ferreira", "elvis martinez", "raulín rodríguez",
      "luis vargas", "yoskar sarante", "joe veras", "alex bueno", "monchy y alexandra",
      "xtreme", "toby love", "grupo extra", "dani j", "kewin cosmos", "el chaval de la bachata",
      "luis miguel del amargue", "leornado paniagua"
    ],
    "merengue": [
      "juan luis guerra", "elvis crespo", "wilfrido vargas", "sergio vargas", "eddy herrera",
      "los hermanos rosario", "toño rosario", "johnny ventura", "fernando villalona",
      "milly quezada", "olga tañon", "las chicas del can", "bonny cepeda", "kinito mendez",
      "jossie esteban", "proyecto uno", "ilegales", "rikarena", "oro solido", "fulanito",
      "sandy y papo", "chichi peralta", "pochy familia", "miriam cruz", "joseíto mateo",
      "omega el fuerte", "ala jaza"
    ],
    "baladas": [
      // Iconos
      "luis miguel", "josé josé", "juan gabriel", "rocío dúrcal", "camilo sesto", "raphael",
      "julio iglesias", "roberto carlos", "ana gabriel", "isabel pantoja", "josé luis perales",
      "nino bravo", "sandro", "leo dan", "pimpinela", "paloma san basilio",

      // Pop Romántico 90s/00s/Actual
      "ricky martin", "chayanne", "shakira", "alejandro sanz", "enrique iglesias",
      "ricardo arjona", "thalia", "paulina rubio", "gloria trevi", "alejandra guzman",
      "cristian castro", "marco antonio solis", "franco de vita", "ricardo montaner",
      "sin bandera", "camila", "reik", "jesse y joy", "ha*ash", "morat", "aitana",
      "pablo alboran", "david bisbal", "laura pausini", "eros ramazzotti", "tiziano ferro",
      "kany garcia", "natalia jimenez", "la quinta estacion", "alex ubago", "axel", "luis fonsi"
    ],
    "rancheras": [
      // Mariachi Clásico
      "vicente fernandez", "alejandro fernandez", "pedro infante", "jorge negrete",
      "javier solis", "antonio aguilar", "pepe aguilar", "lola beltran", "lucha villa",
      "jose alfredo jimenez", "juan gabriel (mariachi)", "rocío dúrcal", "aida cuevas",

      // Regional Mexicano Moderno / Banda / Corridos
      "christian nodal", "angela aguilar", "banda ms", "calibre 50", "los tigres del norte",
      "grupo firme", "carin leon", "alfredo olivas", "julion alvarez", "espinosa paz",
      "la arrolladora banda el limón", "el recodo", "intocable", "bronco", "los tucanes de tijuana",
      "joan sebastian", "marco antonio solis (bukis)", "ana barbara", "jenni rivera",

      // Corridos Tumbados / Bélicos (Tendencia Actual)
      "peso pluma", "natanael cano", "junior h", "eslabon armado", "fuerza regida",
      "grupo frontera", "yahritza y su esencia", "xavi", "gabito ballesteros", "luis r conriquez"
    ],
    "cumbia": [
      // Cumbia Mexicana / Sonidera
      "los angeles azules", "los angeles de charly", "grupo cañaveral", "aaron y su grupo ilusion",
      "raymix", "celso piña", "chico che", "los askis", "selena", "kumbia kings",

      // Cumbia Colombiana / Tropical
      "la sonora dinamita", "lisandro meza", "aniceto molina", "pastor lopez", "rodolfo aicardi",
      "los corraleros de majagual", "lucho bermudez", "los hispanos", "gustavo quintero",
      "bomba estereo", "systema solar", "monsieur perine", "puerto candelaria",

      // Cumbia Argentina (Villera) / Peruana / Chilena
      "damas gratis", "pibes chorros", "yerba brava", "amar azul", "rafaga", "la delio valdez",
      "los palmeras", "ke personajes", "grupo 5", "agua marina", "armonía 10", "chico trujillo",
      "americo", "noche de brujas", "corazon serrano"
    ],
    "pop_global": [
      "taylor swift", "the weeknd", "bruno mars", "dua lipa", "ariana grande",
      "justin bieber", "harry styles", "billie eilish", "lady gaga", "katy perry",
      "rihanna", "beyoncé", "adele", "ed sheeran", "shawn mendes", "miley cyrus",
      "maroon 5", "sam smith", "post malone", "sza", "olivia rodrigo", "doja cat",
      "michael jackson", "madonna", "whitney houston", "britney spears", "backstreet boys"
    ],
    "electronica": [
      "david guetta", "calvin harris", "avicii", "martin garrix", "tiesto",
      "armin van buuren", "daft punk", "marshmello", "the chainsmokers", "alan walker",
      "skrillex", "diplo", "major lazer", "steve aoki", "swedish house mafia",
      "kygo", "robin schulz", "disclosure", "rufus du sol", "fred again"
    ],
    "hip_hop": [
      "eminem", "drake", "kanye west", "jay-z", "travis scott", "kendrick lamar",
      "j. cole", "snoop dogg", "dr. dre", "50 cent", "2pac", "notorious b.i.g.",
      "post malone", "cardi b", "nicki minaj", "megan thee stallion", "future",
      "21 savage", "lil wayne", "wiz khalifa", "macklemore", "pitbull"
    ]
  },
  // Palabras clave para detectar intenciones
  intentKeywords: {
    continue: ['ok', 'okay', 'si', 'sí', 'continuar', 'siguiente', 'listo', 'dale', 'bueno', 'bien'],
    buying: ['comprar', 'ordenar', 'quiero', 'precio', 'costo', 'valor', 'interesa', 'llevar', 'pago'],
    video: ['video', 'pelicula', 'cine', 'mp4', 'visual']
  },
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
  },
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
      name: "🔥🎶 Crossover (Salsa, vallenato, merengue, norteñas, rancheras, popular, baladas, reggaeton, electronica, boleros, tango, cumbia, y más...",
      genres: ["salsa", "vallenato", "merengue", "norteñas", "rancheras", "popular", "baladas", "reggaeton", "electronica", "boleros", "tango", "cumbia"],
      img: 'crossover'
    },
    {
      name: "🕺 Colombia en el Alma",
      genres: ["vallenato", "cumbia", "merengue", "popular"],
      img: 'vallenato'
    },
    {
      name: "💃 Bailoteo Latino",
      genres: ["salsa", "merengue", "reggaeton"],
      img: 'tropical'
    },
    {
      name: "🌍 Sonidos del Mundo 🎶",
      genres: ["rock", "electronica", "pop", "clasica"],
      img: 'rock'
    },
    {
      name: "🎶 Personalizada",
      genres: [],
      img: null
    }
  ]
};

// --- GESTOR DE ESTADO (Singleton) ---

class UserStateManager {
  private static userStates = new Map<string, UserCustomizationState>();

  static async getOrCreate(phoneNumber: string): Promise<UserCustomizationState> {
    if (!this.userStates.has(phoneNumber)) {
      const dbState = await loadUserCustomizationState(phoneNumber);
      this.userStates.set(phoneNumber, dbState || {
        phoneNumber,
        selectedGenres: [],
        mentionedArtists: [],
        customizationStage: 'initial',
        lastPersonalizationTime: new Date(),
        personalizationCount: 0,
      });
    }
    return this.userStates.get(phoneNumber)!;
  }

  static async save(userState: UserCustomizationState): Promise<void> {
    this.userStates.set(userState.phoneNumber, userState);
    await saveUserCustomizationState(userState);
  }
}

// --- UTILITIES ---

class MusicUtils {
  static normalizeText(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  static dedupeArray<T>(arr: T[]): T[] {
    return [...new Set(arr)];
  }
}

class IntentDetector {
  static isContinueKeyword(input: string): boolean {
    const norm = MusicUtils.normalizeText(input.trim());
    return musicData.intentKeywords.continue.some(k => norm === k || norm.startsWith(k));
  }

  static extractGenres(message: string): string[] {
    const normalized = MusicUtils.normalizeText(message);
    return Object.keys(musicData.artistsByGenre).filter(genre => normalized.includes(genre));
  }

  static extractArtists(message: string): string[] {
    const normalized = MusicUtils.normalizeText(message);
    const found: string[] = [];
    Object.values(musicData.artistsByGenre).flat().forEach(artist => {
      if (normalized.includes(artist)) found.push(artist);
    });
    return MusicUtils.dedupeArray(found);
  }
}

// --- GUARD DE CROSS-SELL (Venta Cruzada) ---
async function safeCrossSell(flowDynamic: any, session: any, phone: string) {
  // Solo mostramos esto si NO se ha mostrado recientemente
  if (canSendOnce(session, 'cross_sell_video_hint', 360)) {
    await flowDynamic([{
      body: '💡 *Tip:* También tenemos USBs con VIDEOS/Películas. Si te interesa el combo, escribe "VIDEO" en cualquier momento.',
      delay: 2000
    }]);
  }
}

// --- MANEJO DE OBJECIONES Y PREGUNTAS FRECUENTES ---
async function handleObjections(phoneNumber: string, userInput: string, flowDynamic: any) {
  const input = MusicUtils.normalizeText(userInput);

  // 1. Precio
  if (/precio|cu[aá]nto|vale|cost[oá]|tarifas/i.test(userInput)) {
    await flowDynamic([
      { body: '💰 *Precios Oferta Flash (Envío Gratis):*\n\n• 32GB (3.000 canciones): *$89.900*\n• 64GB (5.400 canciones): *$129.900*\n• 128GB (10.000 canciones): *$169.900*', delay: 500 },
      { body: '👇 ¿Cuál capacidad prefieres? O dime tus géneros favoritos.', delay: 1500 }
    ]);
    return true;
  }

  // 2. Confianza / Seguridad
  if (/confio|seguro|garanti|fraude|es real|confiable|estafa|pagar antes/i.test(input)) {
    await flowDynamic([
      { body: '✅ *Compra Segura:* Somos TechAura. Ofrecemos garantía de 30 días, factura y soporte.', delay: 800 },
      { body: '🚚 Manejamos **Pago Contraentrega**: pagas al recibir.', delay: 1200 }
    ]);
    return true;
  }

  // 3. Tiempo de entrega
  if (/demora|tarda|tiempo|llega/i.test(input)) {
    await flowDynamic([{ body: '⏱️ *Envío Rápido:* Despachamos hoy mismo. Llega en 1-3 días hábiles.', delay: 1000 }]);
    return true;
  }

  return false;
}

// =================================================================
// FLUJO PRINCIPAL: USB MÚSICA
// =================================================================

const musicUsb = addKeyword([
  'Hola, me interesa la USB con música.',
  'USB con música',
  'usb musica',
  'quiero musica'
])
  .addAction(async (ctx, { flowDynamic, gotoFlow }) => {
    const phoneNumber = ctx.from;

    // 1. Guard de entrada (Middleware)
    // Evita reiniciar si el usuario ya está en checkout
    const pre = await preHandler(ctx, { flowDynamic, gotoFlow: async () => { } }, 'musicUsb', ['entry', 'personalization'], {
      lockOnStages: ['awaiting_capacity', 'awaiting_payment'],
      resumeMessages: { awaiting_capacity: 'Estábamos eligiendo capacidad. ¿Cuál prefieres?', awaiting_payment: 'Retomemos el pago.' }
    });
    if (!pre.proceed) return;

    const session = await getUserSession(phoneNumber) as any;

    // 2. Saludo y Propuesta de Valor (Limpio, sin flood)
    const isReturning = session?.conversationData?.interactionCount > 0;

    // Mensaje 1
    await flowDynamic([{
      body: isReturning
        ? '👋 ¡Hola de nuevo! Sigamos con tu colección.'
        : '👋 ¡Hola! Bienvenido a TechAura.\n🎶 La mejor música organizada en Alta Calidad para tu carro o casa.',
      delay: 500
    }]);

    // Mensaje 2 (Visual + Gancho)
    await flowDynamic([{
      body: '🔥 Tenemos listas por géneros (Salsa, Rock, Vallenato...) o podemos crear un **Mix Crossover** a tu gusto.',
      media: MEDIA_ASSETS.music.intro, // Imagen de portada atractiva
      delay: 1000
    }]);

    // Mensaje 3 (CTA - Call to Action claro)
    await flowDynamic([{
      body: 'Para empezar: **¿Qué géneros o artistas NO pueden faltar en tu USB?**\n\n_(Ej: "Salsa y Reggaeton", o escribe "OK" para ver precios del Mix Variado)_',
      delay: 2000
    }]);

    // Actualizamos estado para saber que esperamos respuesta
    // CORRECCIÓN: Usamos 'personalization' que es un estado válido
    await postHandler(phoneNumber, 'musicUsb', 'personalization');
  })

  // --- CAPTURA DE RESPUESTA ---
  .addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
    const phoneNumber = ctx.from;
    const userInput = ctx.body?.trim() || '';
    const userState = await UserStateManager.getOrCreate(phoneNumber);
    const session = await getUserSession(phoneNumber);

    // 1. Detección de cambio de flujo (Videos)
    if (musicData.intentKeywords.video.some(k => userInput.toLowerCase().includes(k))) {
      await flowDynamic('🎬 ¡Entendido! Te muestro las opciones de VIDEO.');
      return gotoFlow(videoUsb);
    }

    // 2. Manejo de Objeciones (Precio, Envío, etc.)
    const handled = await handleObjections(phoneNumber, userInput, flowDynamic);
    if (handled) {
      // Si respondió una objeción, nos quedamos aquí esperando la siguiente instrucción
      return;
    }

    // 3. Atajo "OK" / Crossover / Continuar
    // Si el usuario dice "OK", "Listo", o "Crossover", asumimos que quiere avanzar rápido.
    if (IntentDetector.isContinueKeyword(userInput) || /^ok$/i.test(userInput)) {
      await flowDynamic([
        { body: '⚡ ¡Excelente! El **Pack Crossover Premium** es el más vendido. Música variada lista para la fiesta.', delay: 500 },
        { body: 'Solo falta elegir el tamaño. Vamos a ver las capacidades disponibles...', delay: 1000 }
      ]);

      // Guardamos que quiere crossover
      userState.selectedGenres = ['Crossover', 'Variado'];
      userState.customizationStage = 'quick_selection';
      await UserStateManager.save(userState);

      // Cross-sell sutil antes de ir a capacidad
      await safeCrossSell(flowDynamic, session, phoneNumber);

      return gotoFlow(capacityMusic);
    }

    // 4. Extracción de Gustos Musicales
    const detectedGenres = IntentDetector.extractGenres(userInput);
    const detectedArtists = IntentDetector.extractArtists(userInput);

    if (detectedGenres.length > 0 || detectedArtists.length > 0) {
      // Guardar preferencias
      userState.selectedGenres = MusicUtils.dedupeArray([...(userState.selectedGenres || []), ...detectedGenres]);
      userState.mentionedArtists = MusicUtils.dedupeArray([...(userState.mentionedArtists || []), ...detectedArtists]);
      await UserStateManager.save(userState);

      // Respuesta personalizada (Empatía)
      const summary = [
        detectedGenres.length ? `Géneros: ${detectedGenres.join(', ')}` : '',
        detectedArtists.length ? `Artistas: ${detectedArtists.join(', ')}` : ''
      ].filter(Boolean).join(' + ');

      await flowDynamic([
        { body: `🎵 ¡Anotado! Tu USB incluirá: *${summary}*. Va a quedar genial.`, delay: 1000 },
        { body: '¿Quieres agregar algún otro género/artista, o pasamos a ver los tamaños? (Escribe *"Ver tamaños"* o dime más música).', delay: 2000 }
      ]);
      return; // Esperamos nueva respuesta (más música o confirmar)
    }

    // 5. Intención de Compra Explicita
    // Si dice "ver tamaños", "comprar", "capacidades"
    if (musicData.intentKeywords.buying.some(k => userInput.toLowerCase().includes(k))) {
      return gotoFlow(capacityMusic);
    }

    // 6. Fallback (No entendió)
    // No bloqueamos, guiamos.
    userState.unrecognizedResponses = (userState.unrecognizedResponses || 0) + 1;
    await UserStateManager.save(userState);

    if (userState.unrecognizedResponses >= 2) {
      // Si falla 2 veces, asumimos que quiere avanzar para no frustrar.
      await flowDynamic('😅 Veo que quieres algo especial. Vamos a elegir la capacidad primero y luego afinamos los detalles.');
      return gotoFlow(capacityMusic);
    }

    return fallBack('🤔 Mmm, no reconozco ese género específico. \n\nIntenta escribir algo general como "Salsa", "Rock", o escribe *"OK"* para ver las capacidades y precios.');
  });

export default musicUsb;