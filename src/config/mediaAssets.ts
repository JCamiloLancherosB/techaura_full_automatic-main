import path from 'path';

// Cambia 'true' a 'false' si prefieres usar rutas locales en lugar de URLs
const USE_URLS = true;

const getPath = (fileName: string, remoteUrl: string) => {
    if (USE_URLS) return remoteUrl;
    // Ajusta esta ruta local a donde guardes tus imágenes en el servidor
    // Ejemplo: path.join(__dirname, '../../assets/images', fileName);
    return path.join(__dirname, '../../assets/images', fileName);
};

export const MEDIA_ASSETS = {
    // 🎵 SECCIÓN MÚSICA
    music: {
        // INTROMUSICA: https://i.imgur.com/knOy2Ko.png (sobreescribe la anterior)
        intro: getPath('music_intro.jpg', 'https://i.imgur.com/knOy2Ko.png'),
        // music.playlistop: https://i.imgur.com/OD1WXgB.png
        playlistTop: getPath('music_top.jpg', 'https://i.imgur.com/OD1WXgB.png'),
        // music.crossell: https://i.imgur.com/t6mMrhy.png
        crossSell: getPath('music_promo.jpg', 'https://i.imgur.com/t6mMrhy.png'),
    },

    // 🎬 SECCIÓN PELÍCULAS
    movies: {
        // movies.intro: https://i.imgur.com/hWJRfIr.png (sobreescribe la anterior)
        intro: getPath('movies_intro.jpg', 'https://i.imgur.com/hWJRfIr.png'),
        // movies.genres: https://i.imgur.com/8cK07Ch.png
        genres: getPath('movies_genres.jpg', 'https://i.imgur.com/8cK07Ch.png'),
        // movies.crossell: https://i.imgur.com/P7LO3Ze.png
        crossSell: getPath('movies_promo.jpg', 'https://i.imgur.com/P7LO3Ze.png'),
    },

    // 📹 SECCIÓN VIDEOS
    videos: {
        // videos.intro: https://i.imgur.com/GMKAY71.png (sobreescribe la anterior)
        intro: getPath('videos_intro.jpg', 'https://i.imgur.com/GMKAY71.png'),
        // videos.hdComparison: https://i.imgur.com/MiTUN1P.png
        hdComparison: getPath('videos_hd_4k.jpg', 'https://i.imgur.com/MiTUN1P.png'),
    },

    // 💾 CAPACIDADES (Genéricas o Temáticas)
    capacities: {
        // TABLACOMPARATIVA: https://i.imgur.com/wJrtJFO.jpeg
        comparativeTable: getPath('cap_table.jpg', 'https://i.imgur.com/wJrtJFO.jpeg'),
        // 32GB: https://i.imgur.com/wOaTdDL.png
        gb32: getPath('usb_32gb.jpg', 'https://i.imgur.com/wOaTdDL.png'),
        // 64GB: https://i.imgur.com/kpluhgx.jpeg
        gb64: getPath('usb_64gb.jpg', 'https://i.imgur.com/kpluhgx.jpeg'),
        // 128GB: https://i.imgur.com/VhulVbZ.png
        gb128: getPath('usb_128gb.jpg', 'https://i.imgur.com/VhulVbZ.png'),
        // 256GB / 512GB (Usan la misma imagen)
        gb256: getPath('usb_256gb.jpg', 'https://i.imgur.com/1W9ED2S.jpeg'),
        gb512: getPath('usb_512gb.jpg', 'https://i.imgur.com/1W9ED2S.jpeg'),
    },

    // 🎁 PROMOS Y EXTRAS
    promos: {
        // COMBOPACK: https://i.imgur.com/WIOSomp.png
        comboMusicVideo: getPath('combo_mix.jpg', 'https://i.imgur.com/WIOSomp.png'),
        // upgradeoffer: https://i.imgur.com/SzyVFGI.png
        upgradeOffer: getPath('upgrade_alert.jpg', 'https://i.imgur.com/SzyVFGI.png'),
        // ENVIO: https://i.imgur.com/IskPYU1.png
        shipping: getPath('delivery_express.jpg', 'https://i.imgur.com/IskPYU1.png'),
    }
};