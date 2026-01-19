export const MUSIC_ROOT = 'C:\Users\Torre\Music\Musica3';
export const VIDEO_ROOT = 'F:/VIDEOS/';
export const MOVIES_ROOT = 'D:/';
export const SERIES_ROOT = 'D:/';

export const CONTENT_PATHS = {
    MUSIC_ROOT,
    VIDEO_ROOT,
    MOVIES_ROOT,
    SERIES_ROOT,
    MUSIC_FALLBACK: './Nueva carpeta/', // Updated to use local music library
    VIDEO_FALLBACK: './content/videos/',
    MOVIES_FALLBACK: './content/movies/',
};

export const PROCESSING_CONFIG = {
    MAX_CONCURRENT_COPIES: 2,
    COPY_CHUNK_SIZE: 1024 * 1024 * 10,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    VALID_EXTENSIONS: {
        music: ['.mp3', '.m4a', '.wav', '.flac'],
        video: ['.mp4', '.mkv', '.avi', '.mov'],
        movies: ['.mp4', '.mkv', '.avi']
    }
};