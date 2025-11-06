import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ContentPaths, ContentFile, ContentPlan } from '../../types/processing';
import { ProcessingJob } from '../models/ProcessingJob';

export default class ContentManager {
    private rootPaths: {
        music: string;
        movies: string;
        series: string;
        videos: string;
        apps: string;
    };
    
    private contentIndex: Map<string, ContentFile> = new Map();
    private genreCache: Map<string, ContentFile[]> = new Map();
    private cacheEnabled: boolean;
    private cacheTTL: number;
    
    constructor() {
        this.rootPaths = {
            music: process.env.MUSIC_LIBRARY_PATH || 'D:/Musica',
            movies: process.env.MOVIES_LIBRARY_PATH || 'D:/Peliculas',
            series: process.env.SERIES_LIBRARY_PATH || 'D:/Series',
            videos: process.env.VIDEOS_LIBRARY_PATH || 'D:/Videos',
            apps: process.env.APPS_LIBRARY_PATH || 'D:/Apps'
        };
        
        this.cacheEnabled = process.env.ENABLE_CONTENT_CACHE === 'true';
        this.cacheTTL = parseInt(process.env.CACHE_TTL_MINUTES || '60') * 60 * 1000;
    }

    // ✅ VERIFICAR Y CREAR DIRECTORIOS RAÍZ
    async verifyContentDirectories(): Promise<void> {
        console.log('📁 Verificando directorios raíz de contenido...');
        
        for (const [category, rootPath] of Object.entries(this.rootPaths)) {
            if (!fs.existsSync(rootPath)) {
                console.warn(`⚠️ Directorio raíz no encontrado: ${rootPath}`);
                try {
                    fs.mkdirSync(rootPath, { recursive: true });
                    console.log(`✅ Directorio creado: ${rootPath}`);
                } catch (error) {
                    console.error(`❌ Error creando directorio ${rootPath}:`, error);
                }
            } else {
                console.log(`✅ Directorio verificado: ${rootPath}`);
            }
        }
        
        await this.indexExistingContent();
    }

    // ✅ INDEXAR CONTENIDO DESDE RAÍZ (RECURSIVO)
    private async indexExistingContent(): Promise<void> {
        console.log('🗂️ Indexando contenido desde directorios raíz...');
        const startTime = Date.now();
        
        for (const [category, rootPath] of Object.entries(this.rootPaths)) {
            try {
                console.log(`📂 Escaneando ${category}: ${rootPath}`);
                const files = await this.scanDirectoryRecursive(rootPath);
                
                for (const file of files) {
                    const contentFile: ContentFile = {
                        id: this.generateContentId(file),
                        name: path.parse(file).name,
                        path: file,
                        category: this.mapCategoryToType(category),
                        subcategory: this.extractSubcategory(file, rootPath),
                        size: fs.statSync(file).size,
                        extension: path.extname(file).toLowerCase(),
                        lastModified: fs.statSync(file).mtime,
                        metadata: await this.extractMetadata(file)
                    };
                    
                    this.contentIndex.set(contentFile.id, contentFile);
                    
                    // Agregar a cache de género
                    if (this.cacheEnabled) {
                        const genreKey = contentFile.subcategory.toLowerCase();
                        if (!this.genreCache.has(genreKey)) {
                            this.genreCache.set(genreKey, []);
                        }
                        this.genreCache.get(genreKey)?.push(contentFile);
                    }
                }
                
                console.log(`✅ ${category}: ${files.length} archivos indexados`);
                
            } catch (error) {
                console.error(`❌ Error indexando ${category}:`, error);
            }
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Indexación completada: ${this.contentIndex.size} archivos en ${duration}s`);
    }

    // ✅ ESCANEAR DIRECTORIO RECURSIVAMENTE
    private async scanDirectoryRecursive(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        const supportedExtensions = this.getSupportedExtensions();
        
        const scanRecursive = (currentPath: string) => {
            try {
                if (!fs.existsSync(currentPath)) return;
                
                const items = fs.readdirSync(currentPath);
                
                for (const item of items) {
                    const fullPath = path.join(currentPath, item);
                    
                    try {
                        const stat = fs.statSync(fullPath);
                        
                        if (stat.isDirectory()) {
                            scanRecursive(fullPath);
                        } else if (supportedExtensions.includes(path.extname(item).toLowerCase())) {
                            files.push(fullPath);
                        }
                    } catch (err) {
                        console.warn(`⚠️ No se pudo acceder a: ${fullPath}`);
                    }
                }
            } catch (error) {
                console.error(`❌ Error escaneando directorio ${currentPath}:`, error);
            }
        };
        
        scanRecursive(dirPath);
        return files;
    }

    // ✅ EXTRAER SUBCATEGORÍA (GÉNERO) DESDE RUTA
    private extractSubcategory(filePath: string, rootPath: string): string {
        try {
            const relativePath = path.relative(rootPath, filePath);
            const parts = relativePath.split(path.sep);
            
            // La primera carpeta después de la raíz es el género/subcategoría
            if (parts.length > 1) {
                return parts[0];
            }
            
            return 'General';
        } catch (error) {
            return 'Unknown';
        }
    }

    // ✅ PREPARAR CONTENIDO PARA PEDIDO
    async prepareContent(job: ProcessingJob): Promise<ContentPlan> {
        console.log(`📋 Preparando contenido para job ${job.id}`);
        
        let plan: ContentPlan = {
            finalContent: [],
            missingContent: [],
            totalSize: 0,
            estimatedCopyTime: 0
        };

        try {
            switch (job.contentType) {
                case 'music':
                    await this.prepareMusicContent(job, plan);
                    break;
                case 'videos':
                    await this.prepareVideoContent(job, plan);
                    break;
                case 'movies':
                    await this.prepareMovieContent(job, plan);
                    break;
                case 'mixed':
                    await this.prepareMixedContent(job, plan);
                    break;
                default:
                    throw new Error(`Tipo de contenido no soportado: ${job.contentType}`);
            }

            const capacityBytes = this.parseCapacity(job.capacity);
            if (plan.totalSize > capacityBytes) {
                plan = await this.optimizeContentForCapacity(plan, capacityBytes);
            }

            await this.verifyContentExists(plan);
            
            plan.estimatedCopyTime = this.calculateCopyTime(plan.totalSize);

            return plan;

        } catch (error) {
            console.error(`❌ Error preparando contenido:`, error);
            throw error;
        }
    }

    // ✅ PREPARAR CONTENIDO MUSICAL
    private async prepareMusicContent(job: ProcessingJob, plan: ContentPlan): Promise<void> {
        console.log('🎵 Preparando contenido musical...');
        
        if (job.preferences.includes('crossover')) {
            await this.addCrossoverContent(plan, job);
        } else {
            // Buscar géneros específicos
            for (const preference of job.preferences) {
                const genre = this.extractGenreFromPreference(preference);
                if (genre) {
                    await this.addGenreContent(genre, plan, job.capacity);
                }
            }
        }

        // Agregar contenido específico solicitado
        if (job.contentList && job.contentList.length > 0) {
            await this.addSpecificContent(job.contentList, plan, 'music');
        }
    }

    // ✅ AGREGAR CONTENIDO CROSSOVER (VARIADO)
    private async addCrossoverContent(plan: ContentPlan, job: ProcessingJob): Promise<void> {
        console.log('🎭 Agregando contenido crossover (variado)...');
        
        const capacityBytes = this.parseCapacity(job.capacity);
        const genres = this.getAvailableGenres('music');
        
        // Filtrar géneros excluidos
        const allowedGenres = genres.filter(genre => 
            !job.preferences.some(pref => 
                pref.toLowerCase().includes(`no ${genre.toLowerCase()}`) || 
                pref.toLowerCase().includes(`sin ${genre.toLowerCase()}`)
            )
        );

        const filesPerGenre = Math.floor(capacityBytes / (allowedGenres.length * 7 * 1024 * 1024));

        for (const genre of allowedGenres) {
            await this.addGenreContent(genre, plan, `${filesPerGenre * 7}MB`, allowedGenres.length);
        }
    }

    // ✅ AGREGAR CONTENIDO DE GÉNERO ESPECÍFICO
    private async addGenreContent(genre: string, plan: ContentPlan, capacity: string, totalGenres: number = 1): Promise<void> {
        console.log(`🎼 Agregando contenido de género: ${genre}`);
        
        const genreKey = genre.toLowerCase();
        let genreFiles: ContentFile[] = [];

        // Buscar en cache primero
        if (this.cacheEnabled && this.genreCache.has(genreKey)) {
            genreFiles = this.genreCache.get(genreKey) || [];
        } else {
            // Buscar en índice
            for (const [id, content] of this.contentIndex.entries()) {
                if (content.category === 'music' && 
                    content.subcategory.toLowerCase().includes(genreKey)) {
                    genreFiles.push(content);
                }
            }
        }

        if (genreFiles.length === 0) {
            console.warn(`⚠️ No se encontraron archivos para el género: ${genre}`);
            return;
        }

        const capacityBytes = this.parseCapacity(capacity);
        const maxSizePerGenre = Math.floor(capacityBytes / totalGenres * 0.9);

        let currentSize = 0;
        const shuffledFiles = this.shuffleArray(genreFiles);

        for (const file of shuffledFiles) {
            if (currentSize + file.size <= maxSizePerGenre) {
                plan.finalContent.push(file);
                plan.totalSize += file.size;
                currentSize += file.size;
            } else {
                break;
            }
        }

        console.log(`✅ Agregados ${plan.finalContent.length} archivos de ${genre}`);
    }

    // ✅ PREPARAR CONTENIDO DE VIDEOS
    private async prepareVideoContent(job: ProcessingJob, plan: ContentPlan): Promise<void> {
        console.log('📹 Preparando contenido de videos...');
        
        const videoFiles = Array.from(this.contentIndex.values()).filter(
            content => content.category === 'videos'
        );

        const capacityBytes = this.parseCapacity(job.capacity);
        const shuffledFiles = this.shuffleArray(videoFiles);

        for (const file of shuffledFiles) {
            if (plan.totalSize + file.size <= capacityBytes * 0.95) {
                plan.finalContent.push(file);
                plan.totalSize += file.size;
            } else {
                break;
            }
        }

        if (job.contentList && job.contentList.length > 0) {
            await this.addSpecificContent(job.contentList, plan, 'videos');
        }
    }

    // ✅ PREPARAR CONTENIDO DE PELÍCULAS
    private async prepareMovieContent(job: ProcessingJob, plan: ContentPlan): Promise<void> {
        console.log('🎬 Preparando contenido de películas...');
        
        const movieFiles = Array.from(this.contentIndex.values()).filter(
            content => content.category === 'movies'
        );

        const capacityBytes = this.parseCapacity(job.capacity);
        const avgMovieSize = 1.5 * 1024 * 1024 * 1024;
        const maxMovies = Math.floor(capacityBytes / avgMovieSize);

        const shuffledFiles = this.shuffleArray(movieFiles);
        let addedMovies = 0;

        for (const file of shuffledFiles) {
            if (addedMovies >= maxMovies) break;
            
            if (plan.totalSize + file.size <= capacityBytes * 0.95) {
                plan.finalContent.push(file);
                plan.totalSize += file.size;
                addedMovies++;
            }
        }

        if (job.contentList && job.contentList.length > 0) {
            await this.addSpecificContent(job.contentList, plan, 'movies');
        }
    }

    // ✅ PREPARAR CONTENIDO MIXTO - USANDO CLONE
    private async prepareMixedContent(job: ProcessingJob, plan: ContentPlan): Promise<void> {
    console.log('🎭 Preparando contenido mixto...');
    
    const capacityBytes = this.parseCapacity(job.capacity);
    
    // ✅ CLONAR Y MODIFICAR JOBS
    const musicJob = job.clone({
        contentType: 'music',
        capacity: `${Math.floor(capacityBytes * 0.5 / (1024 * 1024 * 1024))}GB`
    });
    await this.prepareMusicContent(musicJob, plan);
    
    const videoJob = job.clone({
        contentType: 'videos',
        capacity: `${Math.floor(capacityBytes * 0.3 / (1024 * 1024 * 1024))}GB`
    });
    await this.prepareVideoContent(videoJob, plan);
    
    const movieJob = job.clone({
        contentType: 'movies',
        capacity: `${Math.floor(capacityBytes * 0.2 / (1024 * 1024 * 1024))}GB`
    });
    await this.prepareMovieContent(movieJob, plan);
    }

    // ✅ AGREGAR CONTENIDO ESPECÍFICO
    private async addSpecificContent(contentList: string[], plan: ContentPlan, category: string): Promise<void> {
        console.log(`🎯 Agregando ${contentList.length} elementos específicos de ${category}...`);
        
        for (const contentName of contentList) {
            let found = false;
            
            for (const [id, content] of this.contentIndex.entries()) {
                const normalizedContentName = contentName.toLowerCase().trim();
                const normalizedFileName = content.name.toLowerCase().trim();
                
                if (normalizedFileName.includes(normalizedContentName) && content.category === category) {
                    plan.finalContent.push(content);
                    plan.totalSize += content.size;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                console.warn(`⚠️ No se encontró: ${contentName}`);
                plan.missingContent.push(contentName);
            }
        }
    }

    // ✅ COPIAR CONTENIDO A USB (ORGANIZADO)
    async copyToUSB(plan: ContentPlan, usbPath: string, job: ProcessingJob): Promise<void> {
        console.log(`💾 Copiando ${plan.finalContent.length} archivos a ${usbPath}`);
        
        const organizedStructure = this.organizeContentByCategory(plan.finalContent);
        
        for (const [category, files] of Object.entries(organizedStructure)) {
            const categoryPath = path.join(usbPath, category);
            
            if (!fs.existsSync(categoryPath)) {
                fs.mkdirSync(categoryPath, { recursive: true });
            }
            
            for (const file of files) {
                const genrePath = path.join(categoryPath, file.subcategory);
                
                if (!fs.existsSync(genrePath)) {
                    fs.mkdirSync(genrePath, { recursive: true });
                }
                
                const destPath = path.join(genrePath, path.basename(file.path));
                
                try {
                    await this.copyFileWithProgress(file.path, destPath, job);
                } catch (error) {
                    console.error(`❌ Error copiando ${file.name}:`, error);
                }
            }
        }
    }

    // ✅ ORGANIZAR CONTENIDO POR CATEGORÍA
    private organizeContentByCategory(files: ContentFile[]): Record<string, ContentFile[]> {
        const organized: Record<string, ContentFile[]> = {};
        
        for (const file of files) {
            const category = file.category.charAt(0).toUpperCase() + file.category.slice(1);
            
            if (!organized[category]) {
                organized[category] = [];
            }
            
            organized[category].push(file);
        }
        
        return organized;
    }

    // ✅ COPIAR ARCHIVO CON PROGRESO
    private async copyFileWithProgress(source: string, dest: string, job: ProcessingJob): Promise<void> {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(source);
            const writeStream = fs.createWriteStream(dest);
            
            readStream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
            
            readStream.pipe(writeStream);
        });
    }

    // ✅ OPTIMIZAR CONTENIDO PARA CAPACIDAD
    private async optimizeContentForCapacity(plan: ContentPlan, capacityBytes: number): Promise<ContentPlan> {
        console.log(`⚙️ Optimizando contenido para capacidad de ${this.formatBytes(capacityBytes)}...`);
        
        const optimizedPlan: ContentPlan = {
            finalContent: [],
            missingContent: plan.missingContent,
            totalSize: 0,
            estimatedCopyTime: 0
        };
        
        const sortedContent = [...plan.finalContent].sort((a, b) => a.size - b.size);
        
        for (const content of sortedContent) {
            if (optimizedPlan.totalSize + content.size <= capacityBytes * 0.95) {
                optimizedPlan.finalContent.push(content);
                optimizedPlan.totalSize += content.size;
            }
        }
        
        console.log(`✅ Optimización completada: ${optimizedPlan.finalContent.length} archivos, ${this.formatBytes(optimizedPlan.totalSize)}`);
        
        return optimizedPlan;
    }

    // ✅ VERIFICAR EXISTENCIA DE CONTENIDO
    private async verifyContentExists(plan: ContentPlan): Promise<void> {
        console.log('🔍 Verificando existencia de archivos...');
        
        const missingFiles: string[] = [];
        
        for (const content of plan.finalContent) {
            if (!fs.existsSync(content.path)) {
                console.warn(`⚠️ Archivo no encontrado: ${content.path}`);
                missingFiles.push(content.name);
            }
        }
        
        plan.missingContent.push(...missingFiles);
        
        if (missingFiles.length > 0) {
            console.warn(`⚠️ ${missingFiles.length} archivos no encontrados`);
        }
    }

    // ✅ AGREGAR ARCHIVO AL ÍNDICE (PÚBLICO)
    public addToIndex(contentFile: ContentFile): void {
        this.contentIndex.set(contentFile.id, contentFile);
        
        if (this.cacheEnabled) {
            const genreKey = contentFile.subcategory.toLowerCase();
            if (!this.genreCache.has(genreKey)) {
                this.genreCache.set(genreKey, []);
            }
            this.genreCache.get(genreKey)?.push(contentFile);
        }
        
        console.log(`📁 Archivo agregado al índice: ${contentFile.name}`);
    }

    // ✅ OBTENER GÉNEROS DISPONIBLES
    private getAvailableGenres(category: 'music' | 'movies' | 'videos'): string[] {
        const genres = new Set<string>();
        
        for (const [id, content] of this.contentIndex.entries()) {
            if (content.category === category) {
                genres.add(content.subcategory);
            }
        }
        
        return Array.from(genres);
    }

    // ✅ CALCULAR TIEMPO DE COPIA
    private calculateCopyTime(sizeBytes: number): number {
        const writeSpeedMBps = parseInt(process.env.USB_WRITE_SPEED || '30');
        const sizeMB = sizeBytes / (1024 * 1024);
        return Math.ceil(sizeMB / writeSpeedMBps);
    }

    // ✅ UTILIDADES
    private generateContentId(filePath: string): string {
        return crypto.createHash('md5').update(filePath).digest('hex');
    }

    private async extractMetadata(filePath: string): Promise<any> {
        try {
            const stats = fs.statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            
            return {
                fileName: path.basename(filePath),
                extension: ext,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                type: this.getFileType(ext)
            };
        } catch (error) {
            return {
                fileName: path.basename(filePath),
                extension: path.extname(filePath),
                size: 0
            };
        }
    }

    private extractGenreFromPreference(preference: string): string | null {
        const lowerPref = preference.toLowerCase();
        const genres = this.getAvailableGenres('music');
        
        for (const genre of genres) {
            if (lowerPref.includes(genre.toLowerCase())) {
                return genre;
            }
        }
        
        return null;
    }

    private mapCategoryToType(category: string): 'music' | 'videos' | 'movies' {
        switch (category.toLowerCase()) {
            case 'music':
            case 'musica':
                return 'music';
            case 'videos':
                return 'videos';
            case 'movies':
            case 'peliculas':
            case 'series':
                return 'movies';
            default:
                return 'music';
        }
    }

    private getSupportedExtensions(): string[] {
        const audio = (process.env.ALLOWED_AUDIO_EXTENSIONS || 'mp3,flac,wav,m4a').split(',');
        const video = (process.env.ALLOWED_VIDEO_EXTENSIONS || 'mp4,avi,mkv,divx').split(',');
        const image = (process.env.ALLOWED_IMAGE_EXTENSIONS || 'jpg,jpeg,png').split(',');
        
        return [...audio, ...video, ...image].map(ext => ext.startsWith('.') ? ext : `.${ext}`);
    }

    private parseCapacity(capacity: string): number {
        const num = parseInt(capacity.replace(/[^0-9]/g, ''));
        if (capacity.toLowerCase().includes('gb')) {
            return num * 1024 * 1024 * 1024;
        }
        if (capacity.toLowerCase().includes('mb')) {
            return num * 1024 * 1024;
        }
        return num * 1024 * 1024 * 1024;
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private getFileType(extension: string): string {
        const audioExts = ['.mp3', '.flac', '.wav', '.m4a', '.aac'];
        const videoExts = ['.mp4', '.avi', '.mkv', '.divx', '.mov'];
        
        if (audioExts.includes(extension)) return 'audio';
        if (videoExts.includes(extension)) return 'video';
        return 'unknown';
    }
}
