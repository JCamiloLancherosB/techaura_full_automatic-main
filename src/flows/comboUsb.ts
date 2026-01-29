import { addKeyword } from '@builderbot/bot';
// Importa los módulos de datos o flujos de toma de datos si los usas
import { datosCliente } from './datosCliente';
import {
    applyReadabilityBudget,
    createPendingDetails,
    isMoreRequest,
    hasPendingDetails,
    getPendingDetails,
    clearPendingDetails,
    formatPendingDetails
} from '../utils/readabilityBudget';
import { getUserSession, updateUserSession } from './userTrackingSystem';

// 1. Bases de datos de música, películas y videos (usa tu base de datos original aquí)
// Puedes importar genreTopHits, playlists, etc., desde tus archivos existentes

const genreTopHits = {
    "bachata": [
        { name: "Obsesión - Aventura", file: 'https://drive.usercontent.google.com/u/0/uc?id=13Isl85FZL69STlKoP1EbWhYXDiGiaB5H&export=download' }, 
        { name: "Burbujas de amor - Juan Luis Guerra", file: 'https://drive.usercontent.google.com/u/0/uc?id=1ysi0mxuYKqfXBrUtGY5Bg9FnQWMUbbfl&export=download' }, 
        { name: "Romeo Santos - Propuesta indecente", file: 'https://drive.usercontent.google.com/u/0/uc?id=1Gt5EgMFPXe6RDKRlDwoJDvCAtu4nR6Ta&export=download' } 
    ],
    "bailables": [
        { name: "La pollera colora - Aniceto Molina", file: 'https://drive.usercontent.google.com/u/0/uc?id=1qUPXFdr86UiqYpsct0JAHmrXm79Mw1tD&export=download' }, 
        { name: "Los del rio - Macarena", file: 'https://drive.usercontent.google.com/u/0/uc?id=16v0NOHvNOBO87jdusZ4of_1fs4SMSVmF&export=download' }, 
        { name: "El Africano - Wilfrido Vargas", file: 'https://drive.usercontent.google.com/u/0/uc?id=1H8NQKkbx7oEO_OU1ERsPgrSm3tfdhqj6&export=download' } 
    ],
    "blues": [
        { name: "The Thrill Is Gone - B.B. King", file: 'https://drive.usercontent.google.com/u/0/uc?id=13jwcWFpUL9YyyrMLLsRH8fadOdJbPW2z&export=download' }, 
        { name: "Cross Road Blues - Robert Johnson", file: 'https://drive.usercontent.google.com/u/0/uc?id=18TzbDhtsYzbemK8oiqoKO2PU59aLR4tP&export=download' }, 
        { name: "Sweet Home Chicago - The Blues Brothers", file: 'https://drive.usercontent.google.com/u/0/uc?id=1kidkHf8K8rgOain7JiEU1koJ6TsZ2TCb&export=download' } 
    ],
    "boleros": [
        { name: "Bésame Mucho - Consuelo Velázquez", file: 'https://drive.usercontent.google.com/u/0/uc?id=12I81qXz7y0tF_Ex7_qH23sBRbV5pOYdE&export=download' }, 
        { name: "El Reloj - Los Panchos", file: 'https://drive.usercontent.google.com/u/0/uc?id=1KupjzhzS_Tov4cq_DeDExIP-Wl1a4hZ-&export=download' }, 
        { name: "La Barca - Luis Miguel", file: 'https://drive.usercontent.google.com/u/0/uc?id=1K8eALDabNnhWqkeQq_pN7Jqif1w3j0Yw&export=download' } 
    ],
    "clasica": [
        { name: "Berlinerh Philharmoniker - Symphony No. 5", file: 'https://drive.usercontent.google.com/u/0/uc?id=1W2gSDt5b-y1-pZzFT9j8BJWyTgAWKWrE&export=download' }, 
        { name: "Elise Beethoven - Fur Elise", file: 'https://drive.usercontent.google.com/u/0/uc?id=1tTia44KVVl_TyshrUP7OdjY_zfcz_Drs&export=download' }, 
        { name: "Johann Pachelbel - Canon in d Major", file: 'https://drive.usercontent.google.com/u/0/uc?id=1W755dPQN1UHamzu5bYIB8-ROAVrk_aY7&export=download' } 
    ],
    "country": [
        { name: "Cassyette - Friends in low places", file: 'https://drive.usercontent.google.com/u/0/uc?id=1wfPxmFZXDcpfgOhlX62m0EGhX8yVpnRZ&export=download' }, 
        { name: "Dolly Parton - Jolene", file: 'https://drive.usercontent.google.com/u/0/uc?id=10fpvkrxYk19sIJ5cXWeHKAqsd7j3q8jh&export=download' }, 
        { name: "John Denver - Take Me Home", file: 'https://drive.usercontent.google.com/u/0/uc?id=1y1wkj2aQM1XPS8mNerJszesyOpEwOxqw&export=download' } 
    ],
    "cumbia": [
        { name: "Cumbia Sonidera - La cumbia del sol", file: 'https://drive.usercontent.google.com/u/0/uc?id=1kxz6NPK-YdA2TqnRH_P52lZjuhoHjCUB&export=download' }, 
        { name: "La Cumbia Cienaguera", file: 'https://drive.usercontent.google.com/u/0/uc?id=1cPEPH7hMg2TdOqm4D-ZJQMmVf9uPc_6l&export=download' }, 
        { name: "La piragua", file: 'https://drive.usercontent.google.com/u/0/uc?id=1DdfwozruBGvEAERG2wvERq742Y6skCX5&export=download' } 
    ],
    "diciembre": [
        { name: "Faltan cinco pa' las doce - Hugo Liscano", file: 'https://drive.usercontent.google.com/u/0/uc?id=1jKTxC3HK5_KrY5wbuv3XaGgjsaLaUlRf&export=download' }, 
        { name: "El Año Viejo - Tony Camargo", file: 'https://drive.usercontent.google.com/u/0/uc?id=14zCydueuNi71-bCL7gKDiHq0mPE8sRKy&export=download' }, 
        { name: "Los 50 de Joselito - La Vispera de Año Nuevo", file: 'https://drive.usercontent.google.com/u/0/uc?id=1XnLfJB4Zrtw4GfFKOzBj_eE4LyT3pYy9&export=download' } 
    ],
    "electronica": [
        { name: "Avicii - Levels", file: 'https://drive.usercontent.google.com/u/0/uc?id=1nhLsH0gJ3Ji5Zs05d9y6tbURIImSxZug&export=download' }, 
        { name: "Titanium - David Guetta ft. Sia", file: 'https://drive.usercontent.google.com/u/0/uc?id=1-DwGPNq_3m_Y8s1TEsQg6wWaAu3hMG4C&export=download' }, 
        { name: "Martin Garrix - Animals", file: 'https://drive.usercontent.google.com/u/0/uc?id=1q-N_uaDHad1Q9MGCi7umaLe0ZYMlY1p_&export=download' } 
    ],
    "funk": [
        { name: "James Brown - Get Up I Feel Like Being Like A...", file: 'https://drive.usercontent.google.com/u/0/uc?id=1abLDgsBPupmxbjxZe0IWNo4ldd4r7jyS&export=download' }, 
        { name: "Superstition - Stevie Wonder", file: 'https://drive.usercontent.google.com/u/0/uc?id=1LBF0H_zQ20uVYu8ewHfahq0CPW7HDCfa&export=download' }, 
    ],
    "gospel": [
        { name: "Kirk Franklin - I Smile", file: 'https://drive.usercontent.google.com/u/0/uc?id=1c3RORlOdxUAnqjgvPkkVLxRlxF78jU_K&export=download' }, 
        { name: "Phil Driscoll - Amazing Grace", file: 'https://drive.usercontent.google.com/u/0/uc?id=173q6Km29LYB-Afe10mn5e3L4u8FQvUZ1&export=download' }, 
        { name: "The Edwin Hawkins Singers - Oh Happy Day", file: 'https://drive.usercontent.google.com/u/0/uc?id=1TGB34XsysqT7rdhL0rFB4v53KoVc5nd3&export=download' } 
    ],
    "hiphop": [
        { name: "Lose Yourself - Eminem", file: 'https://drive.usercontent.google.com/u/0/uc?id=1IO7V1iYIUO0lalj6K8dDlDfEhO474rM8&export=download' }, 
        { name: "Sicko Mode - Travis Scott", file: 'https://drive.usercontent.google.com/u/0/uc?id=1YmC7nM2xvz2RVzxiFrGHutr7pWI0XXd_&export=download' }, 
        { name: "The Notorious B.I.G. - Juicy", file: 'https://drive.usercontent.google.com/u/0/uc?id=1Gp4S2DT1kGG62aLypbiHUaNErtDH-mmG&export=download' } 
    ],
    "indie": [
        { name: "Take Me Out - Franz Ferdinand", file: 'https://drive.usercontent.google.com/u/0/uc?id=1ueaa0eYE4N80j7u3_7cyRbsAOCa-qqWW&export=download' }, 
        { name: "MGMT - Electric Feel ", file: 'https://drive.usercontent.google.com/u/0/uc?id=1nkjO4o3rlSeINJizXSi0j5oIvC2hmq0v&export=download' }, 
        { name: "The Killers - Mr. Brightside", file: 'https://drive.usercontent.google.com/u/0/uc?id=1ykrGFFOswKBTmSabquJlipebin1AbWvZ&export=download' } 
    ],
    "jazz": [
        { name: "Take Five - Dave Brubeck", file: 'https://drive.usercontent.google.com/u/0/uc?id=1ysmrJQ31SzN3mv19M0Vmr4H1eEzxeWu_&export=download' }, 
        { name: "Miles Davis - So What", file: 'https://drive.usercontent.google.com/u/0/uc?id=1JNuS-ZwUc39UTBlFodXiGzDFSgwYZxwn&export=download' }, 
    ],
    "merengue": [
        { name: "Juan Luis Guerra- El Niágara en Bicicleta", file: 'https://drive.usercontent.google.com/u/0/uc?id=15kirx5Vwnjt_yaFD-HiRXUekD3Tpa8yX&export=download' }, 
        { name: "La Bilirrubina - Juan Luis Guerra", file: 'https://drive.usercontent.google.com/u/0/uc?id=1s03BfmFHJtRdeYuLsfMTZDrS4XPnnDKM&export=download' }, 
        { name: "Wilfrido Vargas - El Jardinero", file: 'https://drive.usercontent.google.com/u/0/uc?id=1fKp8cCGxYXsr6loTqi-fUQKBOyuZAd5H&export=download' } 
    ],
    "metal": [
        { name: "Metallica - Enter Sandman", file: 'https://drive.usercontent.google.com/u/0/uc?id=1cbEdpkeo9IrgkvHFaN_XqvzlPaGOEKCh&export=download' }, 
        { name: "Iron Maiden - Fear of the Dark", file: 'https://drive.usercontent.google.com/u/0/uc?id=1cwA0_xc9tjCcAV8JwdH2DiS0Xx5K9BsW&export=download' }, 
        { name: "Paranoid - Black Sabbath", file: 'https://drive.usercontent.google.com/u/0/uc?id=1GAAINWCl6V-i1SiXA8V2xlMUnbuf2VBV&export=download' } 
    ],
    "punk": [
        { name: "Blitzkrieg Bop - Ramones", file: 'https://drive.usercontent.google.com/u/0/uc?id=17-KPKWkjEJ6JPCegmS8SuADFF1hrvvlV&export=download' }, 
        { name: "American Idiot - Green Day", file: 'https://drive.usercontent.google.com/u/0/uc?id=1S68tggNy3HF-jtLj2FglVW6rDXuH9GO4&export=download' }, 
        { name: "Sex Pistols - Anarchy in the U.K", file: 'https://drive.usercontent.google.com/u/0/uc?id=1APWH4Fu0ECPy_W8G0N9FbcDMPZKH9CyP&export=download' } 
    ],
    "r&b": [
        { name: "No Scrubs - TLC", file: 'https://drive.usercontent.google.com/u/0/uc?id=1Rc2gPLGohZh9ep-zwgb7fHzLmAT41GOU&export=download' }, 
        { name: "Miguel - Adorn", file: 'https://drive.usercontent.google.com/u/0/uc?id=12w-D5t2nQwGxpsgY3Go4oPb8kUjNKm4s&export=download' }, 
        { name: "Beyoncé - Crazy In Love", file: 'https://drive.usercontent.google.com/u/0/uc?id=1XYTrULKEN-lFfW37iMvSot3b3BzJn6hV&export=download' } 
    ],
    // "reggae": [
    //     { name: "No Woman, No Cry - Bob Marley", file: 'https://drive.usercontent.google.com/u/0/uc?id=1bx3mkzyxG82b2CPcuDDlsLL1ZfpbJ1-k&export=download' }, 
    //     { name: "Inner Circle - Bad Boys", file: 'https://drive.usercontent.google.com/u/0/uc?id=11hrBZAxxG0GEcYcdR02OqGinXzWKeR-v&export=download' }, 
    //     { name: "UB40 - Red Red Wine", file: 'https://drive.usercontent.google.com/u/0/uc?id=1dEZONIYNM9wrxrLZIey8YLYlaSGjNaMX&export=download' } 
    // ],
    "techno": [
        { name: "Darude - Sandstorm", file: 'https://drive.usercontent.google.com/u/0/uc?id=1HxWBvrhUhaIurdtp0EErag5o5KwJHt9a&export=download' }, 
        { name: "Techno N Tequilla - Eins Zwei Polizei", file: 'https://drive.usercontent.google.com/u/0/uc?id=1X5hxavwSwEbDZo7oux_IWH-LGMlec26a&export=download' }, 
        { name: "Zapravka - Techno", file: 'https://drive.usercontent.google.com/u/0/uc?id=1XeQ7rTqkuaiuL13t6pY8x-yjnYBgxOwr&export=download' } 
    ],
    "baladas": [
        { name: "Ana Belén - Vuelo Blanco de Gaviota", file: 'https://drive.usercontent.google.com/u/0/uc?id=1gD0IHAhppDH_4k68afkY6ppP2YnITyuE&export=download' }, 
        { name: "Los Prisioneros - Tren Al Sur", file: 'https://drive.usercontent.google.com/u/0/uc?id=12T3Cs8A6AmxOk2YjKDZN_zyoSg7zUFWf&export=download' }, 
        { name: "Ricardo Arjona - Historia De Taxi", file: 'https://drive.usercontent.google.com/u/0/uc?id=1h-3H7c3kg80g6hO7k8LAgCc20vfrJIDD&export=download' } 
    ],
    "banda": [
        { name: "BANDA MS - TU POSTURA", file: 'https://drive.usercontent.google.com/u/0/uc?id=15IwAoLWgA-rgjDBDnPCf8u_08p-HFCpe&export=download' }, 
        { name: "Banda Sinaloense Los Recoditos - Ya Se Fue", file: 'https://drive.usercontent.google.com/u/0/uc?id=1HyH1RPOHKUjQrTnf-VLMeT3NR_mDNGNK&export=download' }, 
        { name: "Banda Toro - Busca Tu Hueco", file: 'https://drive.usercontent.google.com/u/0/uc?id=1cCizdwyLMODoCevGmk07jiE1wd6iBixj&export=download' } 
    ],
    "norteñas": [
        { name: "El corral de piedra", file: 'https://drive.usercontent.google.com/u/0/uc?id=1oDh35Zlnr-Tr4AAStJcX4-21LHIxYiLK&export=download' }, 
        { name: "A la Luz de una Vela", file: 'https://drive.usercontent.google.com/u/0/uc?id=13XU81SAmcSDJxbbvtrINtYY5zEqblx2U&export=download' }, 
        { name: "Los Dos De Tamaulipas - Pura Adrenalina", file: 'https://drive.usercontent.google.com/u/0/uc?id=1qy5ULTpqYQ0AdYHOsAJT6iU_eC6qVDRC&export=download' } 
    ],
    "reggaeton": [
        // { name: "Bad Bunny - Perro Negro", file: 'https://drive.usercontent.google.com/u/0/uc?id=1pNKLjeXLm080RcDhJT5f_rh6in9Nhpy_&export=download' }, 
        { name: "Daddy Yankee - Gasolina", file: 'https://drive.usercontent.google.com/u/0/uc?id=1vaV4Q9AuAwDqZDlQ57oAUuNQE_O2T6zM&export=download' }, 
        { name: "FloyyMenor - Gata Only", file: 'https://drive.usercontent.google.com/u/0/uc?id=1DbqgbDCR0GZdlnYASU6a8LMdDw13QwhA&export=download' } 
    ],
    "rancheras": [
        { name: "Alan Ramírez - Soy un Bohemio", file: 'https://drive.usercontent.google.com/u/0/uc?id=1QyxuvlFyEa9KY2xizUO8wLavd3F5ftHQ&export=download' }, 
        { name: "Alci Acosta - El Preso Número 9", file: 'https://drive.usercontent.google.com/u/0/uc?id=1xxAM7K-YOjRON5dSuBPjpLhH8hQUf1Lt&export=download' }, 
        { name: "Alejandro Fernández - Abrázame", file: 'https://drive.usercontent.google.com/u/0/uc?id=1ytGB1heAbLcU7h2UTpf5SEkpyu8NZ3au&export=download' } 
    ],
    "vallenato": [
        { name: "A Besitos - Los Diablitos", file: 'https://drive.usercontent.google.com/u/0/uc?id=1_B88StGsiunofUiKryX-8wrdNbyPnlfS&export=download' }, 
        { name: "Acompáñame, Miguel Morales", file: 'https://drive.usercontent.google.com/u/0/uc?id=1MF8bkA4343N6XXI4dKfvs2l58MsuN3rB&export=download' }, 
        { name: "Adiós Amor  - Luis Mateus & David Rendón", file: 'https://drive.usercontent.google.com/u/0/uc?id=1tP3U6Ju9cLZ0q8cja0IdjN6x7Sf71FeP&export=download' } 
    ],
    "rock": [
        { name: "Guns N' Roses - Sweet Child O' Mine", file: 'https://drive.usercontent.google.com/u/0/uc?id=1bMQIkSr1Lku0fUyUU5--3eEHMc66dhXl&export=download' }, 
        { name: "Led Zeppelin - Stairway to Heaven", file: 'https://drive.usercontent.google.com/u/0/uc?id=1w6b8LCUTBCy_s49lnpSeXHe40mplF6i7&export=download' }, 
        { name: "Queen - Bohemian Rhapsody", file: 'https://drive.usercontent.google.com/u/0/uc?id=19dMqmIfb8uFCg2g0VVxILBAuYI5hwzH4&export=download' } 
    ],
    // "pop": [
    //     { name: "Ed Sheeran - Shape of You", file: 'https://drive.usercontent.google.com/u/0/uc?id=1g-YTRVmrFQtUUvaIldYlfMUPhYcJLaAm&export=download' }, 
    //     { name: "Madonna - Like a Prayer", file: 'https://drive.usercontent.google.com/u/0/uc?id=1Mb0uA1RlxvebYVLZxObLd3qxVqDCSSHt&export=download' }, 
    //     { name: "Michael Jackson - Thriller", file: 'https://drive.usercontent.google.com/u/0/uc?id=1pgO7S9O34LyMYDH02c4Eot-grPNUSe5f&export=download' } 
    // ],
    "salsa": [
        { name: "Joe Arroyo - La rebelion", file: 'https://drive.usercontent.google.com/u/0/uc?id=1P2q3YbHwOqJOMdu21wIUg3w6Co128MVz&export=download' }, 
        { name: "Marc Anthony - Vivir Mi Vida", file: 'https://drive.usercontent.google.com/u/0/uc?id=1CZwQd1m5GXd6x6xkJN9Qicg36GMxmlXs&export=download' }, 
        { name: "Willie Colón - Pedro Navaja", file: 'https://drive.usercontent.google.com/u/0/uc?id=1dXytmRS1PqD3-NrVxGeO0oaj8jJ_cQVV&export=download' } 
    ]
};

// 2. Utilidades de normalización y extracción de géneros (igual que en tus flujos previos)
function normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
const validGenres = Object.keys(genreTopHits).map(normalizeText);
function extractGenresFromMessage(message) {
    const normalizedMessage = normalizeText(message);
    return validGenres.filter(genre => normalizedMessage.includes(genre));
}

// 3. Función para obtener canciones demo variadas
function getRandomSongsByGenres(selectedGenres, count = 3) {
    const songs = [];
    const usedSongs = new Set();
    let attempts = 0;
    const maxAttempts = selectedGenres.length * count * 2;
    while (songs.length < count && attempts < maxAttempts) {
        for (const genre of selectedGenres) {
            const genreSongs = genreTopHits[genre] || [];
            if (genreSongs.length > 0) {
                const randomSong = genreSongs[Math.floor(Math.random() * genreSongs.length)];
                if (!usedSongs.has(randomSong.name)) {
                    songs.push(randomSong);
                    usedSongs.add(randomSong.name);
                }
            }
            if (songs.length >= count) break;
        }
        attempts++;
    }
    return songs;
}

// 4. Capacidad y cantidades combinadas (aproximadas, siempre dejar margen)
const capacidades = [
    {
        txt: "1️⃣ 8GB: Hasta 3 películas + 90 videos musicales + 480 canciones (mezcla flexible)",
        value: 8,
        precio: "$54.900"
    },
    {
        txt: "2️⃣ 32GB: Hasta 13 películas + 360 videos musicales + 1,920 canciones",
        value: 32,
        precio: "$84.900"
    },
    {
        txt: "3️⃣ 64GB: Hasta 27 películas + 720 videos musicales + 3,840 canciones",
        value: 64,
        precio: "$119.900"
    },
    {
        txt: "4️⃣ 128GB: Más de 54 películas + 1,450 videos musicales + 7,680 canciones",
        value: 128,
        precio: "$159.900"
    }
];

// 5. Mensajes de conversión y tips
const conversionTips = [
    "🎁 *¡Hoy tienes 20% de descuento en la segunda USB!*",
    "🚚 *Envío gratis a todo el país por tiempo limitado!*",
    "🔄 *Personaliza tu USB combinando música, videos y películas como quieras, ¡sin costo extra!*"
];

// 6. Listas de ejemplo para cada tipo de contenido
const ejemplosPeliculas = [
    "🔥 Acción: Avengers, John Wick, Star Wars",
    "😂 Comedia: Shrek, Toy Story, Mi Villano Favorito",
    "🎭 Drama: Breaking Bad, El Padrino, Forrest Gump",
    "💖 Romance: Orgullo y Prejuicio, Diario de una Pasión",
    "👻 Terror: El Conjuro, IT, Annabelle",
    "🎨 Animadas: Coco, Frozen, Moana, Encanto"
];
const ejemplosVideos = [
    "🎬 Videos musicales: Salsa, Vallenato, Reggaetón, Pop, Rock, Crossover, Electrónica, Tropical y más.",
    "🎥 Videos de conciertos, karaokes, bailables y éxitos de todos los tiempos."
];

// 7. FLUJO UNIFICADO
const comboUsb = addKeyword([
    "Hola, información sobre la USB con música, vídeos y películas."
])
.addAction(async (ctx, { flowDynamic, endFlow }) => {
    // Check if user is requesting MORE details
    const session = await getUserSession(ctx.from);
    if (isMoreRequest(ctx.body || '') && hasPendingDetails(session.conversationData)) {
        const pending = getPendingDetails(session.conversationData);
        if (pending) {
            const chunks = formatPendingDetails(pending);
            for (const chunk of chunks) {
                await flowDynamic([{ body: chunk }]);
            }
            // Clear pending details after sending by directly modifying session
            session.conversationData = clearPendingDetails(session.conversationData);
            await updateUserSession(
                ctx.from,
                ctx.body || 'MORE',
                'comboUsb',
                'viewing_combo',
                false
            );
            return endFlow();
        }
    }

    // Build full welcome message for potential storage
    const fullWelcome = `🎉 *¡Bienvenido a la USB más completa de Colombia!* 🎉

¿Te imaginas tener *música, videos musicales y películas/series* en un solo dispositivo?

${conversionTips.join('\n')}

👇 Así funciona:

Puedes elegir la combinación que prefieras:
- *Música* (por géneros, artistas o playlists)
- *Videos musicales* (por género, época o artista)
- *Películas/series* (por género, saga, año o título)

¡Todo organizado y listo para usar en cualquier TV, carro, PC o parlante USB!

🎶 *Géneros musicales disponibles:*
Salsa, Vallenato, Merengue, Reggaetón, Baladas, Cumbia, Rock, Pop, Electrónica, Rancheras, Tropical, Recuerdos, Despecho y más.

🎬 *Películas y series:*
${ejemplosPeliculas.join('\n')}

🎥 *Videos musicales:*
${ejemplosVideos.join('\n')}`;

    // Apply readability budget
    const budgetResult = applyReadabilityBudget(fullWelcome);
    
    // Send the main message (truncated if needed)
    await flowDynamic([{ body: budgetResult.message }]);
    
    // Store pending details if truncated
    if (budgetResult.wasTruncated && budgetResult.pendingDetails) {
        const pendingDetails = createPendingDetails(budgetResult.pendingDetails, 'combo');
        // Directly modify session.conversationData to store pending details
        session.conversationData = session.conversationData || {};
        (session.conversationData as any).pendingDetails = pendingDetails;
        await updateUserSession(
            ctx.from,
            ctx.body || 'Consultó combo',
            'comboUsb',
            'viewing_combo',
            false
        );
    }
    
    // Always send the CTA separately
    await flowDynamic([{
        body: "¿Qué te gustaría priorizar en tu USB?\n\nA) Música\nB) Videos musicales\nC) Películas/series\nD) *¡Quiero de todo!*"
    }]);
})
.addAction({ capture: true }, async (ctx, { flowDynamic }) => {
    const input = ctx.body.trim().toLowerCase();

    // Detecta la preferencia principal del usuario
    let tipo = "todo";
    if (input.includes("a") || input.includes("música")) tipo = "musica";
    else if (input.includes("b") || input.includes("video")) tipo = "video";
    else if (input.includes("c") || input.includes("pelicula") || input.includes("serie")) tipo = "peliculas";

    if (tipo === "musica") {
        await flowDynamic([
            "🎶 *¡Perfecto!* ¿Qué géneros, artistas o playlists te gustaría incluir? (Ejemplo: Salsa, Vallenato, Juan Luis Guerra, crossover, pop 2000s...)"
        ]);
    } else if (tipo === "video") {
        await flowDynamic([
            "🎥 *¡Genial!* ¿Qué géneros, artistas o épocas de videos musicales prefieres? (Ejemplo: Videos salsa, reggaetón 2010s, pop internacional, conciertos, etc.)"
        ]);
    } else if (tipo === "peliculas") {
        await flowDynamic([
            "🎬 *¡Excelente!* ¿Qué géneros, sagas o títulos quieres? (Ejemplo: Avengers, comedias, películas animadas, terror clásico, Harry Potter, etc.)"
        ]);
    } else {
        await flowDynamic([
            "💿 *¡Combo total!* Indica tus géneros, artistas, playlists o títulos favoritos de música, videos y películas. (Puedes escribir una lista separada por comas o por tipo de contenido)."
        ]);
    }
})
.addAction({ capture: true }, async (ctx, { flowDynamic }) => {
    const input = ctx.body.trim().toLowerCase();

    // Extrae géneros musicales y muestra demos
    const userGenres = extractGenresFromMessage(input);
    if (userGenres.length > 0) {
        const variedHits = getRandomSongsByGenres(userGenres, 3);
        await flowDynamic([
            `🎵 *¡Genial!* Has elegido los géneros: *${userGenres.join(", ")}*.\nAquí tienes una muestra personalizada:`
        ]);
        for (const hit of variedHits) {
            await flowDynamic([{ body: `🎵 *${hit.name}*`, media: hit.file }]);
        }
    }

    // Si el usuario menciona películas, responde con ejemplos
    if (["pelicula", "serie", "avengers", "harry potter", "comedia", "acción", "terror", "romance"].some(word => input.includes(word))) {
        await flowDynamic([
            "🎬 *¡Tus películas/series favoritas estarán listas!*\n¿Te gustaría alguna saga, género o título especial? (Ejemplo: Marvel, Star Wars, comedia, animadas, etc.)"
        ]);
    }

    // Si el usuario menciona videos musicales
    if (["video", "karaoke", "concierto", "musical"].some(word => input.includes(word))) {
        await flowDynamic([
            "🎥 *Incluimos videos musicales de los géneros, artistas o décadas que prefieras!*"
        ]);
    }

    await flowDynamic([
        "¿Quieres agregar más géneros/artistas/títulos o continuamos? Escribe más o responde *OK* para seguir con la capacidad y precio."
    ]);
})
.addAction({ capture: true }, async (ctx, { flowDynamic }) => {
    const input = ctx.body.trim().toLowerCase();
    if (["ok", "continuar", "siguiente", "precio", "listo"].includes(input)) {
        // Build full capacity message
        const fullCapacityMsg = [
            "💾 *Elige la capacidad ideal para tu USB combo (música + videos + películas):*",
            "",
            ...capacidades.map(c => `${c.txt} → *${c.precio}*`),
            "",
            "✍️ Responde con el número de la capacidad que prefieres para continuar tu pedido."
        ].join('\n');
        
        // Apply readability budget to capacity message
        const budgetResult = applyReadabilityBudget(fullCapacityMsg);
        await flowDynamic([budgetResult.message]);
        
        // Store pending details if truncated
        if (budgetResult.wasTruncated && budgetResult.pendingDetails) {
            const session = await getUserSession(ctx.from);
            const pendingDetails = createPendingDetails(budgetResult.pendingDetails, 'capacity');
            // Directly modify session.conversationData to store pending details
            session.conversationData = session.conversationData || {};
            (session.conversationData as any).pendingDetails = pendingDetails;
            await updateUserSession(
                ctx.from,
                ctx.body || 'Ver capacidades',
                'comboUsb',
                'viewing_capacity',
                false
            );
        }
    } else {
        // Permite seguir agregando contenido
        await flowDynamic([
            "¡Perfecto! Puedes seguir agregando más géneros, artistas, videos o títulos. Cuando estés listo, responde *OK* para continuar."
        ]);
    }
})
.addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
    const opcion = parseInt(ctx.body.trim(), 10);
    if (opcion >= 1 && opcion <= capacidades.length) {
        await flowDynamic([
            `👌 ¡Perfecto! Has elegido la opción: ${capacidades[opcion - 1].txt}\nPrecio: *${capacidades[opcion - 1].precio}*`,
            'Por favor, envíanos tu nombre completo y ciudad para continuar con tu pedido y coordinar el envío 📦.'
        ]);
        return gotoFlow(datosCliente);
    } 
    // else {
    //     await flowDynamic([
    //         "❌ Opción no válida. Por favor responde con el número de la capacidad que deseas."
    //     ]);
    // }
});

export default comboUsb;
