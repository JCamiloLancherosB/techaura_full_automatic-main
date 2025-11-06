import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// 1. Configuración base
const BASE_PATH = path.join(__dirname, 'demos_videos');
const OUTPUT_PATH = path.join(__dirname, 'demos_videos_recortados');
if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH);

// 2. Estructura original (rutas online, solo para referencia de nombres)
const videoTopHits = {
    "bachata": [
        { name: "Romeo Santos - Propuesta Indecente", file: "" },
        { name: "Aventura - Obsesión", file: "" },
        { name: "Juan Luis Guerra - Burbujas de Amor", file: "" }
    ],
    "reggaeton": [
        { name: "Daddy Yankee - Gasolina", file: "" },
        { name: "FloyyMenor - Gata Only", file: "" },
        { name: "Bad Bunny - Tití Me Preguntó", file: "" }
    ],
    "salsa": [
        { name: "Marc Anthony - Vivir Mi Vida", file: "" },
        { name: "Joe Arroyo - La Rebelión", file: "" },
        { name: "Willie Colón - Pedro Navaja", file: "" }
    ],
    "vallenato": [
        { name: "Carlos Vives - La Tierra del Olvido", file: "" },
        { name: "Silvestre Dangond - Materialista", file: "" },
        { name: "Los Diablitos - A Besitos", file: "" }
    ],
    "rock": [
        { name: "Queen - Bohemian Rhapsody", file: "" },
        { name: "Guns N' Roses - Sweet Child O' Mine", file: "" },
        { name: "Led Zeppelin - Stairway to Heaven", file: "" }
    ],
    "merengue": [
        { name: "Juan Luis Guerra - El Niágara en Bicicleta", file: "" },
        { name: "Elvis Crespo - Suavemente", file: "" },
        { name: "Wilfrido Vargas - El Jardinero", file: "" }
    ],
    "baladas": [
        { name: "Ricardo Arjona - Historia de Taxi", file: "" },
        { name: "Maná - Rayando el Sol", file: "" },
        { name: "Jesse & Joy - Espacio Sideral", file: "" }
    ],
    "electronica": [
        { name: "David Guetta ft. Sia - Titanium", file: "" },
        { name: "Avicii - Levels", file: "" },
        { name: "Martin Garrix - Animals", file: "" }
    ],
    "cumbia": [
        { name: "Los Ángeles Azules - Nunca Es Suficiente", file: "" },
        { name: "Celso Piña - Cumbia Sobre el Río", file: "" },
        { name: "La Sonora Dinamita - Que Bello", file: "" }
    ]
};

// 3. Función para buscar el archivo real en la carpeta de cada género
function buscarArchivoLocal(genre: string, videoName: string): string | null {
    const genreFolder = path.join(BASE_PATH, genre.charAt(0).toUpperCase() + genre.slice(1));
    if (!fs.existsSync(genreFolder)) return null;
    const files = fs.readdirSync(genreFolder);
    // Busca por coincidencia en el nombre (ignorando extensión y mayúsculas)
    const cleanName = videoName.toLowerCase().replace(/[^a-z0-9]/gi, '');
    for (const file of files) {
        const fileNoExt = path.parse(file).name.toLowerCase().replace(/[^a-z0-9]/gi, '');
        if (fileNoExt.includes(cleanName) || cleanName.includes(fileNoExt)) {
            return path.join(genreFolder, file);
        }
    }
    return null;
}

// 4. Recortar videos y actualizar estructura
const videoTopHitsLocales: any = {};

Object.entries(videoTopHits).forEach(([genre, videos]) => {
    videoTopHitsLocales[genre] = [];
    for (const video of videos) {
        const localPath = buscarArchivoLocal(genre, video.name);
        if (localPath && fs.existsSync(localPath)) {
            // Crear carpeta de salida por género
            const outGenre = path.join(OUTPUT_PATH, genre.charAt(0).toUpperCase() + genre.slice(1));
            if (!fs.existsSync(outGenre)) fs.mkdirSync(outGenre);

            // Nuevo nombre de archivo recortado
            const outName = path.parse(localPath).name + '_demo.mp4';
            const outPath = path.join(outGenre, outName);

            // Recortar solo si aún no existe
            if (!fs.existsSync(outPath)) {
                // Recorta el primer minuto con ffmpeg
                try {
                    execSync(`ffmpeg -y -i "${localPath}" -ss 0 -t 60 -c:v libx264 -c:a aac -strict experimental "${outPath}"`);
                    console.log(`✅ Video recortado: ${outPath}`);
                } catch (e: any) {
                    console.log(`❌ Error recortando ${localPath}: ${e.message}`);
                    continue;
                }
            } else {
                console.log(`ℹ️ Ya existe demo: ${outPath}`);
            }

            // Actualizar la estructura con la ruta local recortada
            videoTopHitsLocales[genre].push({
                ...video,
                file: outPath
            });
        } else {
            console.log(`❌ No se encontró archivo local para: ${genre} - ${video.name}`);
        }
    }
});

// 5. Guardar el nuevo videoTopHitsLocales en un archivo JSON para copiar fácilmente
fs.writeFileSync(
    path.join(OUTPUT_PATH, 'videoTopHitsLocales.json'),
    JSON.stringify(videoTopHitsLocales, null, 2),
    'utf-8'
);

console.log('\n¡Listo! Estructura actualizada con rutas locales guardada en videoTopHitsLocales.json');