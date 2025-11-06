/**
 * Lógica para procesar el precio de la USB según el tipo de contenido y capacidad.
 */

type USBContentType = 'musica' | 'videos' | 'peliculas';

interface USBOption {
    id: number;
    label: string;
    capacityGB: number;
    desc: string;
    quantity: string;
    price: number;
    emoji: string;
}

const musicOptions: USBOption[] = [
    { id: 1, label: '8GB', capacityGB: 8, desc: '1,400 canciones', quantity: '1400 canciones', price: 59900, emoji: '🚀' },
    { id: 2, label: '32GB', capacityGB: 32, desc: '5,000 canciones', quantity: '5000 canciones', price: 89900, emoji: '🌟' },
    { id: 3, label: '64GB', capacityGB: 64, desc: '10,000 canciones', quantity: '10000 canciones', price: 129900, emoji: '🔥' },
    { id: 4, label: '128GB', capacityGB: 128, desc: '25,000 canciones', quantity: '25000 canciones', price: 169900, emoji: '🏆' }
];

const videoOptions: USBOption[] = [
    { id: 1, label: '8GB', capacityGB: 8, desc: '260 vídeos', quantity: '260 videos', price: 59900, emoji: '🚀' },
    { id: 2, label: '32GB', capacityGB: 32, desc: '1,000 vídeos', quantity: '1000 videos', price: 89900, emoji: '🌟' },
    { id: 3, label: '64GB', capacityGB: 64, desc: '2,000 vídeos', quantity: '2000 videos', price: 129900, emoji: '🔥' },
    { id: 4, label: '128GB', capacityGB: 128, desc: '4,000 vídeos', quantity: '4000 videos', price: 169900, emoji: '🏆' }
];

const movieOptions: USBOption[] = [
    { id: 1, label: '8GB', capacityGB: 8, desc: '10 películas o 30 episodios', quantity: '10 películas / 30 episodios', price: 59900, emoji: '🚀' },
    { id: 2, label: '32GB', capacityGB: 32, desc: '30 películas o 90 episodios', quantity: '30 películas / 90 episodios', price: 89900, emoji: '🌟' },
    { id: 3, label: '64GB', capacityGB: 64, desc: '70 películas o 210 episodios', quantity: '70 películas / 210 episodios', price: 129900, emoji: '🔥' },
    { id: 4, label: '128GB', capacityGB: 128, desc: '140 películas o 420 episodios', quantity: '140 películas / 420 episodios', price: 169900, emoji: '🏆' }
];

/**
 * Devuelve las opciones de USB según el tipo de contenido.
 */
export function getUSBOptions(contentType: USBContentType): USBOption[] {
    if (contentType === 'musica') return musicOptions;
    if (contentType === 'videos') return videoOptions;
    return movieOptions;
}

/**
 * Obtiene el precio y descripción de una opción según el tipo de contenido y la elección del usuario.
 */
export function getUSBPriceAndDesc(contentType: USBContentType, optionId: number): USBOption | undefined {
    const opts = getUSBOptions(contentType);
    return opts.find(opt => opt.id === optionId);
}

/**
 * Genera el mensaje para mostrar las opciones de USB según el tipo de contenido.
 */
export function generateUSBSelectionMessage(contentType: USBContentType): string {
    switch (contentType) {
        case 'musica':
            return `🎵 ¡Selecciona la cantidad de canciones y lleva tu música favorita a todas partes! 🎶

${musicOptions.map(opt => `${opt.id}. ${opt.emoji} ${opt.label} - ¡${opt.desc} por solo $${opt.price.toLocaleString('es-CO')}!`).join('\n')}
            
👉 Escribe el número de tu elección y comienza a disfrutar!`;
        case 'videos':
            return `🎬 Selecciona la cantidad de vídeos en USB que deseas:

${videoOptions.map(opt => `${opt.id}. ${opt.label} - ${opt.desc} - $${opt.price.toLocaleString('es-CO')}`).join('\n')}

Escribe el número de tu elección:`;
        default:
            return `🍿 Recuerda seleccionar cualquier película deseada o serie, o solicita todo variado:

${movieOptions.map(opt => `${opt.id}. USB ${opt.label}: Hasta ${opt.desc}. 👉 Oferta exclusiva: $${opt.price.toLocaleString('es-CO')}`).join('\n')}
            
*En la opción 4 (128GB), además, disfruta de un 30% de descuento en la segunda USB.*`;
    }
}