// Si usas ESM, descomenta las siguientes líneas:
// import { fileURLToPath } from 'url';
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

import fs from 'fs';
import path from 'path';

const videoTopHits = {
    "bachata": [],
    "reggaeton": [],
    "salsa": [],
    "vallenato": [],
    "rock": [],
    "merengue": [],
    "baladas": [],
    "electronica": [],
    "cumbia": []
};

const BASE_PATH = path.join(__dirname, 'demos_videos');

Object.keys(videoTopHits).forEach(genre => {
    const dir = path.join(BASE_PATH, genre[0].toUpperCase() + genre.slice(1));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Carpeta creada: ${dir}`);
    } else {
        console.log(`ℹ️ Ya existe: ${dir}`);
    }
});

console.log('Estructura de carpetas creada correctamente.');