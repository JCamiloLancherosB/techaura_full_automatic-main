import * as fs from 'fs';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';
import { Attachment, ParsedOrder } from '../../types/processing';
import { normalizeText, parsePreferences } from '../utils/textUtils';

export default class OrderParser {
    private musicGenres: string[] = ['rock', 'salsa', 'pop', 'reggaeton', 'electronica', 'bachata', 'merengue', 'vallenato', 'cristiana', 'clasica', 'jazz', 'blues'];
    private videoCategories: string[] = ['conciertos', 'documentales', 'videos musicales', 'videos', 'karaoke'];
    private movieGenres: string[] = ['accion', 'comedia', 'drama', 'thriller', 'terror', 'romance', 'infantil', 'peliculas', 'movies'];

    private readonly AVG_MUSIC_SIZE_MB = 7;
    private readonly AVG_VIDEO_SIZE_MB = 50;
    private readonly AVG_MOVIE_SIZE_MB = 1500;
    
    private readonly BASE_CROSSOVER_FILES = 200;
    private readonly FILES_PER_GENRE = 100;
    private readonly FILES_PER_ARTIST = 20;

    async parseOrder(orderData: any): Promise<ParsedOrder> {
        console.log(`🔍 Analizando pedido de ${orderData.customerName}`);
        
        const result: ParsedOrder = {
            isValid: false,
            preferences: [],
            contentList: [],
            customizations: orderData.customizations || {},
            errors: [],
            contentType: 'music',
            estimatedFiles: 0,
            estimatedSize: 0
        };

        try {
            if (orderData.preferences) {
                result.preferences = await this.extractPreferences(orderData.preferences);
            }

            if (orderData.attachments && orderData.attachments.length > 0) {
                const extractedContent = await this.processAttachments(orderData.attachments);
                result.contentList.push(...extractedContent);
            }

            result.contentType = this.determineContentType(result.preferences, result.contentList);

            if (!this.isValidCapacity(orderData.capacity)) {
                result.errors.push(`Capacidad no válida: ${orderData.capacity}`);
            }

            const estimation = await this.estimateContent(result);
            result.estimatedFiles = estimation.files;
            result.estimatedSize = estimation.size;

            if (result.preferences.length === 0 && result.contentList.length === 0) {
                result.errors.push("No se especificaron preferencias ni listas de contenido.");
            }
            
            result.isValid = result.errors.length === 0;

            console.log(`✅ Pedido analizado: ${result.isValid ? 'VÁLIDO' : 'INVÁLIDO'}. Tipo: ${result.contentType}, Archivos: ${result.estimatedFiles}, Tamaño: ${result.estimatedSize}MB`);
            return result;

        } catch (error: any) {
            console.error('❌ Error fatal analizando pedido:', error);
            result.errors.push(`Error de análisis interno: ${error.message}`);
            result.isValid = false;
            return result;
        }
    }

    private async extractPreferences(text: string): Promise<string[]> {
        // Use the new parsePreferences utility for better extraction
        const parsedPreferences = parsePreferences(text);
        const preferences: string[] = [];
        const normalizedText = normalizeText(text);

        // Keep existing logic for crossover detection
        if (normalizedText.includes('crossover') || normalizedText.includes('variado')) {
            preferences.push('crossover');
        }

        // Keep existing logic for exclusions
        const exclusions = normalizedText.match(/(no quiero|sin|excepto)\s+([a-zA-Záéíóúñ]+)/g);
        if (exclusions) {
            exclusions.forEach(exclusion => {
                preferences.push(exclusion.trim());
            });
        }

        // Keep existing logic for "only" matches
        const onlyMatches = normalizedText.match(/(solo|solamente)\s+([a-zA-Záéíóúñ]+)/g);
        if (onlyMatches) {
            onlyMatches.forEach(match => {
                preferences.push(match.trim());
            });
        }

        // Keep existing genre detection
        const allGenres = [...this.musicGenres, ...this.videoCategories, ...this.movieGenres];
        allGenres.forEach(genre => {
            if (normalizedText.includes(genre)) {
                preferences.push(genre);
            }
        });

        // Keep existing artist detection
        const artistMatches = normalizedText.match(/artista[s]?[:\s]+([^,.\n]+)/g);
        if (artistMatches) {
            artistMatches.forEach(match => {
                const artist = match.replace(/artista[s]?[:\s]+/i, '').trim();
                preferences.push(`artista:${artist}`);
            });
        }
        
        // Add parsed preferences that aren't already in the list
        parsedPreferences.forEach(pref => {
            if (!preferences.some(p => normalizeText(p).includes(pref))) {
                preferences.push(pref);
            }
        });
        
        return [...new Set(preferences)];
    }

    private async processAttachments(attachments: Attachment[]): Promise<string[]> {
        let contentList: string[] = [];

        for (const attachment of attachments) {
            try {
                if (!fs.existsSync(attachment.path)) {
                    console.warn(`⚠️ Archivo adjunto no encontrado: ${attachment.path}`);
                    continue;
                }

                let text = '';
                switch (attachment.type) {
                    case 'image':
                        text = await this.extractTextFromImage(attachment.path);
                        break;
                    case 'pdf':
                        text = await this.extractTextFromPDF(attachment.path);
                        break;
                    case 'document':
                        text = await this.extractTextFromDocument(attachment.path);
                        break;
                }
                
                if (text) {
                    const items = this.extractSongList(text);
                    contentList = [...contentList, ...items];
                }

            } catch (error) {
                console.error(`❌ Error procesando archivo ${attachment.path}:`, error);
            }
        }
        
        return [...new Set(contentList)];
    }

    private async extractTextFromImage(imagePath: string): Promise<string> {
        console.log(`🖼️ Iniciando OCR en ${imagePath}`);
        try {
            const worker = await createWorker('spa');
            const { data: { text } } = await worker.recognize(imagePath);
            await worker.terminate();
            console.log(`✅ OCR completado`);
            return text;
        } catch (error) {
            console.error('❌ Error en OCR:', error);
            return '';
        }
    }

    private async extractTextFromPDF(pdfPath: string): Promise<string> {
        console.log(`📄 Extrayendo texto de PDF: ${pdfPath}`);
        try {
            // Implementar con pdf-parse si está disponible
            // const dataBuffer = fs.readFileSync(pdfPath);
            // const data = await pdf(dataBuffer);
            // return data.text;
            console.warn('⚠️ Extracción de PDF no implementada completamente');
            return '';
        } catch (error) {
            console.error('❌ Error leyendo PDF:', error);
            return '';
        }
    }

    private async extractTextFromDocument(docPath: string): Promise<string> {
        console.log(`📝 Extrayendo texto de DOCX: ${docPath}`);
        try {
            const result = await mammoth.extractRawText({ path: docPath });
            console.log(`✅ Extracción de DOCX completada`);
            return result.value;
        } catch (error) {
            console.error('❌ Error leyendo Documento:', error);
            return '';
        }
    }

    private isValidCapacity(capacity: string | number): boolean {
        const validCapacities: number[] = [16, 32, 64, 128, 256, 512, 1000];
        if (!capacity) return false;
        
        const normalized = parseInt(String(capacity).replace(/gb/i, '').trim());
        
        if (isNaN(normalized)) return false;

        return validCapacities.includes(normalized);
    }

    private async estimateContent(order: ParsedOrder): Promise<{ files: number; size: number }> {
        let files = 0;
        let size = 0;

        files += order.contentList.length;

        const genres = order.preferences.filter(p => 
            this.musicGenres.includes(p) || this.videoCategories.includes(p) || this.movieGenres.includes(p)
        );
        const artists = order.preferences.filter(p => p.startsWith('artista:'));
        
        if (order.preferences.includes('crossover')) {
            files += this.BASE_CROSSOVER_FILES;
        } else {
            if (order.contentType !== 'movies') {
                files += genres.length * this.FILES_PER_GENRE;
                files += artists.length * this.FILES_PER_ARTIST;
            }
        }
        
        switch (order.contentType) {
            case 'music':
                size = files * this.AVG_MUSIC_SIZE_MB;
                break;
            case 'videos':
                size = files * this.AVG_VIDEO_SIZE_MB;
                break;
            case 'movies':
                const movieFiles = order.contentList.length + (genres.length * 5);
                files = movieFiles;
                size = files * this.AVG_MOVIE_SIZE_MB;
                break;
            case 'mixed':
                const musicFiles = Math.floor(files * 0.7);
                const videoFiles = Math.floor(files * 0.3);
                size = (musicFiles * this.AVG_MUSIC_SIZE_MB) + (videoFiles * this.AVG_VIDEO_SIZE_MB);
                break;
        }

        return { files, size: Math.round(size) };
    }

    private extractSongList(text: string): string[] {
        const items: string[] = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (this.looksLikeSong(trimmedLine)) {
                items.push(trimmedLine);
            }
        }
        return items;
    }

    private looksLikeSong(line: string): boolean {
        if (line.length < 3 || line.length > 150) return false;
        if (/^\d+\.?\s*$/.test(line)) return false;
        if (/^[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+$/.test(line)) return false;
        if (line.startsWith("Lista de reproducción") || line.startsWith("Canciones de")) return false;

        if (!/\b[a-zA-Z]{3,}\b/.test(line)) return false;
        
        const songPatterns = [
            /\d+[\.\-\)]\s+.+/,
            /.+\s+-\s+.+/,
            /.+\s+ft\.\s+.+/,
        ];

        if (songPatterns.some(pattern => pattern.test(line))) {
            return true;
        }

        if (line.split(' ').length > 1 && line.split(' ').length < 10) {
            return true;
        }

        return false;
    }

    private determineContentType(preferences: string[], contentList: string[]): 'music' | 'videos' | 'movies' | 'mixed' {
        const allText = [...preferences, ...contentList].join(' ').toLowerCase();
        
        const hasMusic = this.musicGenres.some(g => allText.includes(g)) || allText.includes('musica');
        const hasVideos = this.videoCategories.some(c => allText.includes(c));
        const hasMovies = this.movieGenres.some(g => allText.includes(g));

        if ((hasMusic && (hasVideos || hasMovies)) || (hasVideos && hasMovies)) {
            return 'mixed';
        }
        if (hasMovies) {
            return 'movies';
        }
        if (hasVideos) {
            return 'videos';
        }
        
        return 'music';
    }
}
