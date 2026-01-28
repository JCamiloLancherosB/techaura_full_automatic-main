import { usbManager } from './usbManager';
import { adapterDB } from './mysql-database';
import { businessDB } from './mysql-database';
import { whatsappNotifications } from './services/whatsappNotifications';
import cron from 'node-cron';
import { EventEmitter } from 'events';
import { MUSIC_ROOT, VIDEO_ROOT, MOVIES_ROOT, SERIES_ROOT, CONTENT_PATHS, PROCESSING_CONFIG } from './config';
import { buscarArchivosPorNombre, copiarSinDuplicados } from './utils/fileSearch';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { CustomerOrder } from '../types/global';
import { PREDEFINED_KEYWORDS } from './constants/keywords';
import { emitSocketEvent } from './utils/socketUtils';

// Extensiones válidas por tipo
const VALID_EXTENSIONS = {
    music: ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'],
    video: ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm'],
    movies: ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm'],
    series: ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm']
};

// Busca archivos recursivamente que contengan el nombre dado (case-insensitive, extensiones válidas)
async function findFilesByNameRecursive(root: string, name: string, validExts: string[]): Promise<string[]> {
    let found: string[] = [];
    try {
        const entries = await fs.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(root, entry.name);
            if (entry.isDirectory()) {
                found = found.concat(await findFilesByNameRecursive(entryPath, name, validExts));
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (
                    validExts.includes(ext) &&
                    entry.name.toLowerCase().includes(name.toLowerCase())
                ) {
                    found.push(entryPath);
                }
            }
        }
    } catch (error) {
        // Silenciar errores en carpetas vacías
    }
    return found;
}

// Copia todos los archivos a la carpeta destino, sin duplicar por nombre base
async function copyFilesNoDuplicates(files: string[], destDir: string, registry: Set<string>) {
    await fs.mkdir(destDir, { recursive: true });
    for (const file of files) {
        const base = path.basename(file);
        if (registry.has(base)) continue;
        const destPath = path.join(destDir, base);
        await fs.copyFile(file, destPath);
        registry.add(base);
    }
}

// Copia carpetas completas (recursivo) de origen a destino, sin duplicar carpetas por nombre
async function copyFolderRecursive(src: string, dest: string, copiedFolders: Set<string>) {
    const folderName = path.basename(src);
    if (copiedFolders.has(folderName)) return;
    await fs.mkdir(dest, { recursive: true });
    // Copia estructura interna
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyFolderRecursive(srcPath, destPath, copiedFolders);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
    copiedFolders.add(folderName);
}

export async function prepararYCopiarPedido(order: CustomerOrder, usbPath: string) {
    // 1. Música
    if (order.customization.genres?.length || order.customization.artists?.length) {
        const musicaDir = path.join(usbPath, 'MUSICA');
        const archivosCopiados = new Set<string>();

        // Por género
        for (const genero of order.customization.genres || []) {
            const genreDir = path.join(musicaDir, genero.toUpperCase());
            const archivos = await findFilesByNameRecursive(MUSIC_ROOT, genero, VALID_EXTENSIONS.music);
            await copyFilesNoDuplicates(archivos, genreDir, archivosCopiados);
        }
        // Por artista
        for (const artista of order.customization.artists || []) {
            const artistDir = path.join(musicaDir, 'ARTISTAS', artista.toUpperCase());
            const archivos = await findFilesByNameRecursive(MUSIC_ROOT, artista, VALID_EXTENSIONS.music);
            await copyFilesNoDuplicates(archivos, artistDir, archivosCopiados);
        }
    }

    // 2. Videos
    if (order.customization.videos?.length) {
        const videosDir = path.join(usbPath, 'VIDEOS');
        const archivosCopiados = new Set<string>();
        for (const videoTema of order.customization.videos) {
            const videoTopicDir = path.join(videosDir, videoTema.toUpperCase());
            const archivos = await findFilesByNameRecursive(VIDEO_ROOT, videoTema, VALID_EXTENSIONS.video);
            await copyFilesNoDuplicates(archivos, videoTopicDir, archivosCopiados);
        }
        // Artistas de video, si existen
        if (order.customization.videoArtists?.length) {
            for (const artista of order.customization.videoArtists) {
                const artistDir = path.join(videosDir, 'ARTISTAS', artista.toUpperCase());
                const archivos = await findFilesByNameRecursive(VIDEO_ROOT, artista, VALID_EXTENSIONS.video);
                await copyFilesNoDuplicates(archivos, artistDir, archivosCopiados);
            }
        }
    }

    // 3. Películas y Series
    const peliculasDir = path.join(usbPath, 'PELICULAS');
    const seriesDir = path.join(usbPath, 'SERIES');
    const archivosPeliculasCopiados = new Set<string>();
    const seriesCopiadas = new Set<string>();

    // Películas individuales
    if (order.customization.movies?.length) {
        for (const pelicula of order.customization.movies) {
            // Buscar archivos de película en MOVIES_ROOT y subcarpetas
            const archivos = await findFilesByNameRecursive(MOVIES_ROOT, pelicula, VALID_EXTENSIONS.movies);
            await copyFilesNoDuplicates(archivos, peliculasDir, archivosPeliculasCopiados);
        }
    }

    // Series (copia la carpeta completa que coincida con el nombre de la serie)
    if (order.customization.series?.length) {
        for (const serie of order.customization.series) {
            // Buscar carpeta que coincida con el nombre de la serie (case-insensitive, en MOVIES_ROOT y subcarpetas)
            const seriesFolders = await findFoldersByNameRecursive(MOVIES_ROOT, serie);
            for (const folder of seriesFolders) {
                const destSerieDir = path.join(seriesDir, path.basename(folder));
                await copyFolderRecursive(folder, destSerieDir, seriesCopiadas);
            }
        }
    }
}

// Busca carpetas por nombre (case-insensitive) en root y subcarpetas
async function findFoldersByNameRecursive(root: string, name: string): Promise<string[]> {
    let found: string[] = [];
    try {
        const entries = await fs.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(root, entry.name);
            if (entry.isDirectory()) {
                if (entry.name.toLowerCase().includes(name.toLowerCase())) {
                    found.push(entryPath);
                }
                found = found.concat(await findFoldersByNameRecursive(entryPath, name));
            }
        }
    } catch (error) {
        // Silenciar errores en carpetas vacías
    }
    return found;
}

export const autoProcessorEvents = new EventEmitter();

export async function copyContentByType(
    order: CustomerOrder, 
    usbPath: string, 
    contentRoot: string, 
    validExtensions: string[], 
    mainFolder: string, 
    byArtistOrSeries: boolean = false
) {
    const archivosYaCopiados = new Set<string>();
    const destino = path.join(usbPath, mainFolder);

    // Por género
    for (const genero of order.customization.genres || []) {
        const genrePath = path.join(destino, genero.toUpperCase());
        const archivos = await buscarArchivosPorNombre(contentRoot, genero);
        const filtrados = archivos.filter(file => validExtensions.includes(path.extname(file).toLowerCase()));
        await copiarSinDuplicados(filtrados, genrePath, archivosYaCopiados);
    }

    // Por artista/serie si aplica
    if (byArtistOrSeries) {
        const entityList = order.customization.artists || order.customization.series || [];
        for (const entity of entityList) {
            const entityPath = path.join(destino, byArtistOrSeries ? "SERIES" : "ARTISTAS", entity.toUpperCase());
            const archivos = await buscarArchivosPorNombre(contentRoot, entity);
            const filtrados = archivos.filter(file => validExtensions.includes(path.extname(file).toLowerCase()));
            await copiarSinDuplicados(filtrados, entityPath, archivosYaCopiados);
        }
    }
}

// Configuración de administradores
const ADMIN_PHONES = ['573008602789'];

interface SystemReport {
    timestamp: string;
    orders: {
        total: number;
        completed: number;
        pending: number;
        processing: number;
    };
    usbs: {
        connected: number;
        empty: number;
        devices: Array<{
            label: string;
            size: string;
            freeSpace: string;
            isEmpty: boolean;
        }>;
    };
    revenue: {
        total: number;
        average: number;
    };
}

// Default progress for jobs without detailed tracking
const DEFAULT_PROCESSING_PROGRESS = 50;

class AutoProcessor {
    private isProcessing = false;
    private processingQueue: CustomerOrder[] = [];
    private paused = false;

    constructor() {
        this.startAutoProcessing();
        this.startPeriodicTasks();
    }

    // Procesa lo más rápido posible, sin superponer tareas
    private startAutoProcessing(): void {
        setInterval(async () => {
            if (!this.isProcessing && !this.paused) {
                await this.processNextOrder();
            }
        }, 5000); // cada 5 segundos, más reactivo
        console.log('🔄 Sistema de procesamiento automático iniciado');
    }

    // Tareas periódicas: actualizar cola, chequear USBs, generar reporte
    private startPeriodicTasks(): void {
        cron.schedule('*/2 * * * *', async () => { // cada 2 min
            await this.updateProcessingQueue();
            await this.checkUSBStatus();
            await this.generateReport();
        });
    }

    // Actualiza la cola usando solo IDs pendientes (evita duplicados)
    private async updateProcessingQueue(): Promise<void> {
        try {
            const pendingOrders = await businessDB.getPendingOrders();
            const uniqueMap = new Map<string, CustomerOrder>();
            pendingOrders.forEach(order => uniqueMap.set(order.orderNumber, order));
            this.processingQueue = Array.from(uniqueMap.values()).sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
            );
            autoProcessorEvents.emit('queueUpdated', this.processingQueue);
            
            // Emit Socket.io event
            emitSocketEvent('processingUpdate', {
                queueLength: this.processingQueue.length,
                queue: this.processingQueue.map(o => ({
                    orderNumber: o.orderNumber,
                    customerName: o.customerName,
                    status: 'pending'
                }))
            });
            
            console.log(
                `📋 Cola de procesamiento actualizada: ${this.processingQueue.length} pedidos pendientes`
            );
        } catch (error) {
            console.error('❌ Error actualizando cola de procesamiento:', error);
        }
    }

    // Procesa el siguiente pedido
    private async processNextOrder(): Promise<void> {
        if (this.processingQueue.length === 0) return;
        this.isProcessing = true;
        const order = this.processingQueue.shift()!;

        try {
            await businessDB.updateOrderStatus(order.orderNumber, 'processing');
            
            // Emit Socket.io event for order starting processing
            emitSocketEvent('processingStarted', {
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                timestamp: new Date().toISOString()
            });
            
            await this.sendProcessingNotification(order);

            // 1. Buscar USB disponible
            const usb = await usbManager.findAvailableUSB();
            if (!usb) {
                // No USB available: defer production by requeuing the order
                // Update status to 'awaiting_usb' instead of 'error'
                await businessDB.updateOrderStatus(order.orderNumber, 'awaiting_usb');
                
                // Re-add order to processing queue for later retry
                this.processingQueue.push(order);
                
                console.log(`⏳ Pedido ${order.orderNumber}: En cola esperando USB disponible (producción diferida)`);
                
                emitSocketEvent('orderDeferred', {
                    orderNumber: order.orderNumber,
                    customerName: order.customerName,
                    reason: 'awaiting_usb',
                    timestamp: new Date().toISOString()
                });
                
                // Exit early without error - the order stays in queue
                return;
            }

            // 2. Preparar USB
            const label = `USB_${order.orderNumber}`;
            await usbManager.formatUSB(usb, label);

            // 3. Copiar contenido según tipo
            switch(order.productType) {
                case 'music':
                    await this.copyMusicContent(order, usb.devicePath);
                    break;
                case 'video':
                    await this.copyVideoContent(order, usb.devicePath);
                    break;
                case 'movies':
                    await this.copyMovieContent(order, usb.devicePath);
                    break;
            }

            // 4. Finalizar y notificar
            await businessDB.updateOrderStatus(order.orderNumber, 'completed');
            
            // Emit Socket.io event for order completed
            emitSocketEvent('orderCompleted', {
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                timestamp: new Date().toISOString()
            });
            
            await this.sendCompletionNotification(order);

        } catch (error) {
            console.error(`Error procesando pedido ${order.orderNumber}:`, error);
            await businessDB.updateOrderStatus(order.orderNumber, 'error');
            await this.sendErrorNotification(order);
        } finally {
            this.isProcessing = false;
        }
    }

    private async copyMusicContent(order: CustomerOrder, usbPath: string) {
    console.log(`🎵 Iniciando copia de música para orden ${order.orderNumber}`);
    const archivosYaCopiados = new Set<string>();
    let totalFilesCopied = 0;
    let totalSizeCopied = 0;

    try {
        // 1. Verificar y crear estructura de carpetas
        const destino = path.join(usbPath, 'MUSICA');
        console.log(`📂 Creando estructura en: ${destino}`);
        await fs.mkdir(destino, { recursive: true });

        // 2. Validar rutas de origen
        const musicRoot = await this.validateContentPath(CONTENT_PATHS.MUSIC_ROOT, CONTENT_PATHS.MUSIC_FALLBACK);
        console.log(`📁 Usando ruta de música: ${musicRoot}`);

        // 3. Procesar géneros
        for (const genero of order.customization.genres || []) {
            console.log(`🎵 Procesando género: ${genero}`);
            const genrePath = path.join(destino, genero.toUpperCase());
            
            const archivosGenero = await this.findMusicFiles(musicRoot, genero);
            console.log(`🔍 Encontrados ${archivosGenero.length} archivos para ${genero}`);

            const copiados = await this.copyFilesWithProgress(
                archivosGenero,
                genrePath,
                archivosYaCopiados,
                order.orderNumber
            );
            
            totalFilesCopied += copiados.files;
            totalSizeCopied += copiados.size;
        }

        // 4. Generar y copiar playlist
        await this.generatePlaylist(destino, archivosYaCopiados);

        // 5. Verificar integridad
        const verificacion = await this.verifyContentIntegrity(destino, archivosYaCopiados);
        
        console.log(`✅ Copia completada para orden ${order.orderNumber}:`);
        console.log(`📊 Estadísticas:
            - Archivos copiados: ${totalFilesCopied}
            - Tamaño total: ${this.formatBytes(totalSizeCopied)}
            - Integridad: ${verificacion.success ? 'OK' : 'Error'}
        `);

        return verificacion.success;

    } catch (error) {
        console.error(`❌ Error copiando música para orden ${order.orderNumber}:`, error);
        throw error;
    }
}

// Nuevos métodos auxiliares
private async validateContentPath(primaryPath: string, fallbackPath: string): Promise<string> {
    try {
        await fs.access(primaryPath);
        return primaryPath;
    } catch {
        console.log(`⚠️ Ruta principal no accesible, usando fallback: ${fallbackPath}`);
        await fs.mkdir(fallbackPath, { recursive: true });
        return fallbackPath;
    }
}

private async findMusicFiles(root: string, searchTerm: string): Promise<string[]> {
    const files = await buscarArchivosPorNombre(root, searchTerm);
    return files.filter(file => 
        PROCESSING_CONFIG.VALID_EXTENSIONS.music.includes(
            path.extname(file).toLowerCase()
        )
    );
}

private async copyFilesWithProgress(
    files: string[],
    destination: string,
    registry: Set<string>,
    orderNumber: string
): Promise<{ files: number, size: number }> {
    let copiedFiles = 0;
    let totalSize = 0;

    await fs.mkdir(destination, { recursive: true });

    for (const file of files) {
        const fileName = path.basename(file);
        if (registry.has(fileName)) {
            console.log(`⏩ Archivo ya copiado, saltando: ${fileName}`);
            continue;
        }

        try {
            const stats = await fs.stat(file);
            const destPath = path.join(destination, fileName);
            
            console.log(`📝 Copiando: ${fileName} (${this.formatBytes(stats.size)})`);
            
            await this.copyFileWithRetry(file, destPath);
            
            registry.add(fileName);
            copiedFiles++;
            totalSize += stats.size;

            // Notificar progreso
            const progress = (copiedFiles / files.length) * 100;
            console.log(`📊 Progreso orden ${orderNumber}: ${progress.toFixed(1)}%`);
            autoProcessorEvents.emit('copyProgress', {
                orderNumber,
                file: fileName,
                progress
            });

        } catch (error) {
            console.error(`❌ Error copiando ${fileName}:`, error);
        }
    }

    return { files: copiedFiles, size: totalSize };
}

private async copyFileWithRetry(source: string, dest: string, retries = PROCESSING_CONFIG.MAX_RETRIES): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await fs.copyFile(source, dest);
            return;
        } catch (error) {
            if (attempt === retries) throw error;
            console.log(`⚠️ Reintento ${attempt}/${retries} para ${path.basename(source)}`);
            // await new Promise(r => setTimeout(r, PROCESSING_CONFIG.RETRY_DELAY));
            try {
                await new Promise(r => setTimeout(r, PROCESSING_CONFIG.RETRY_DELAY));
            }
            catch (error){
                console.error(`❌ Error al esperar entre reintentos:`, error);
            }
        }
    }
}

private async generatePlaylist(directory: string, files: Set<string>): Promise<void> {
    const playlist = Array.from(files).map(file => ({
        name: path.basename(file, path.extname(file)),
        file: file
    }));

    const playlistPath = path.join(directory, 'playlist.json');
    await fs.writeFile(playlistPath, JSON.stringify(playlist, null, 2));
    console.log(`📝 Playlist generada en: ${playlistPath}`);
}

private async verifyContentIntegrity(directory: string, expectedFiles: Set<string>): Promise<{
    success: boolean;
    missing: string[];
    corrupt: string[];
}> {
    const missing: string[] = [];
    const corrupt: string[] = [];

    for (const fileName of expectedFiles) {
        const filePath = path.join(directory, fileName);
        try {
            await fs.access(filePath);
            // Verificar tamaño mínimo
            const stats = await fs.stat(filePath);
            if (stats.size < 1024) { // menos de 1KB
                corrupt.push(fileName);
            }
        } catch {
            missing.push(fileName);
        }
    }

    return {
        success: missing.length === 0 && corrupt.length === 0,
        missing,
        corrupt
    };
}

    private async copyVideoContent(order: CustomerOrder, usbPath: string) {
        try {
            const archivosYaCopiados = new Set<string>();
            
            // 1. Crear estructura de carpetas
            const destino = path.join(usbPath, 'VIDEOS');
            
            // 2. Por cada género seleccionado
            for (const genero of order.customization.genres || []) {
                const genrePath = path.join(destino, genero.toUpperCase());
                
                const archivosGenero = await buscarArchivosPorNombre(
                    VIDEO_ROOT,
                    genero
                );
                
                await copiarSinDuplicados(archivosGenero, genrePath, archivosYaCopiados);
            }

            // 3. Por cada artista seleccionado
            for (const artista of order.customization.artists || []) {
                const artistPath = path.join(destino, 'ARTISTAS', artista.toUpperCase());
                
                const archivosArtista = await buscarArchivosPorNombre(
                    VIDEO_ROOT,
                    artista
                );
                
                await copiarSinDuplicados(archivosArtista, artistPath, archivosYaCopiados);
            }

            console.log(`✅ Videos copiados para orden ${order.orderNumber}`);
            return true;

        } catch (error) {
            console.error(`❌ Error copiando videos para orden ${order.orderNumber}:`, error);
            throw error;
        }
    }

    private async copyMovieContent(order: CustomerOrder, usbPath: string) {
        try {
            const archivosYaCopiados = new Set<string>();
            
            // 1. Crear estructura de carpetas
            const destino = path.join(usbPath, 'PELICULAS');
            
            // 2. Por cada género de película
            for (const genero of order.customization.genres || []) {
                const genrePath = path.join(destino, genero.toUpperCase());
                
                const archivosPeliculas = await buscarArchivosPorNombre(
                    MOVIES_ROOT,
                    genero
                );
                
                await copiarSinDuplicados(archivosPeliculas, genrePath, archivosYaCopiados);
            }

            // 3. Series si están incluidas
            if (order.customization.series?.length) {
                const seriesPath = path.join(destino, 'SERIES');
                
                for (const serie of order.customization.series) {
                    const seriePath = path.join(seriesPath, serie.toUpperCase());
                    
                    const archivosSerie = await buscarArchivosPorNombre(
                        MOVIES_ROOT,
                        serie
                    );
                    
                    await copiarSinDuplicados(archivosSerie, seriePath, archivosYaCopiados);
                }
            }

            console.log(`✅ Películas copiadas para orden ${order.orderNumber}`);
            return true;

        } catch (error) {
            console.error(`❌ Error copiando películas para orden ${order.orderNumber}:`, error);
            throw error;
        }
    }

    // Chequeo y alerta de USBs/vacíos
    private async checkUSBStatus(): Promise<void> {
        try {
            const status = await usbManager.getUSBStatus();
            autoProcessorEvents.emit('usbStatus', status);
            if (status.empty === 0 && this.processingQueue.length > 0) {
                await whatsappNotifications.sendAdminAlert(
                    `⚠️ No hay USBs vacías disponibles para procesar pedidos.`
                );
            }
            if (this.processingQueue.length > 10) {
                await whatsappNotifications.sendAdminAlert(
                    `⚠️ Hay más de 10 pedidos en cola. Revisa el sistema para evitar demoras.`
                );
            }
        } catch (error) {
            console.error('❌ Error verificando estado de USBs:', error);
        }
    }

    // Reporte visual y archivo
    private async generateReport(): Promise<void> {
        try {
            const stats = await businessDB.getOrderStatistics();
            const usbStatus = await usbManager.getUSBStatus();

            const report: SystemReport = {
                timestamp: new Date().toISOString(),
                orders: {
                    total: stats.total_orders || 0,
                    completed: stats.completed_orders || 0,
                    pending: stats.pending_orders || 0,
                    processing: stats.processing_orders || 0
                },
                usbs: {
                    connected: usbStatus.connected,
                    empty: usbStatus.empty,
                    devices: usbStatus.devices.map(d => ({
                        label: d.label,
                        size: this.formatBytes(d.size),
                        freeSpace: this.formatBytes(d.freeSpace),
                        isEmpty: d.isEmpty
                    }))
                },
                revenue: {
                    total: stats.total_revenue || 0,
                    average: stats.average_price || 0
                }
            };
            autoProcessorEvents.emit('systemReport', report);
            await this.saveReport(report);

        } catch (error) {
            console.error('❌ Error generando reporte:', error);
        }
    }

    private async saveReport(report: SystemReport): Promise<void> {
        try {
            const reportsDir = './reports';
            await fs.mkdir(reportsDir, { recursive: true });
            const filename = `report_${new Date().toISOString().split('T')[0]}.json`;
            const filepath = path.join(reportsDir, filename);
            await fs.writeFile(filepath, JSON.stringify(report, null, 2));
        } catch (error) {
            console.error('❌ Error guardando reporte:', error);
        }
    }

    // Notificaciones
    private async sendCompletionNotification(order: CustomerOrder): Promise<void> {
        try {
            await whatsappNotifications.sendOrderCompletedNotification(order);
        } catch (error) {
            // Silenciar error
        }
    }
    private async sendErrorNotification(order: CustomerOrder): Promise<void> {
        try {
            await whatsappNotifications.sendOrderErrorNotification(order);
            await whatsappNotifications.sendAdminAlert(
                `⚠️ Error procesando orden ${order.orderNumber}: Error en el sistema`
            );
        } catch (error) {
            // Silenciar error
        }
    }
    private async sendProcessingNotification(order: CustomerOrder): Promise<void> {
        try {
            await whatsappNotifications.sendOrderProcessingNotification(order);
        } catch (error) {
            // Silenciar error
        }
    }

    private formatBytes(bytes: number): string {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Acciones manuales públicas
    public async addOrderToQueue(order: CustomerOrder): Promise<void> {
        await businessDB.saveOrder(order);
        if (!this.processingQueue.some(o => o.orderNumber === order.orderNumber)) {
            this.processingQueue.push(order);
            autoProcessorEvents.emit('queueUpdated', this.processingQueue);
        }
    }
    public async forceProcessOrder(orderNumber: string): Promise<boolean> {
        try {
            const order = await businessDB.getOrder(orderNumber);
            if (!order) return false;
            this.processingQueue = this.processingQueue.filter(o => o.orderNumber !== orderNumber);
            this.processingQueue.unshift(order);
            autoProcessorEvents.emit('queueUpdated', this.processingQueue);
            if (!this.isProcessing) await this.processNextOrder();
            return true;
        } catch (error) {
            return false;
        }
    }
    public getQueueStatus() {
        return {
            processing: this.isProcessing,
            queueLength: this.processingQueue.length,
            paused: this.paused,
            nextOrder: this.processingQueue[0]?.orderNumber,
            queue: this.processingQueue.map(order => ({
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                productType: order.productType,
                capacity: order.capacity,
                status: 'pending'
            })),
            active: this.isProcessing && this.processingQueue.length > 0 ? [{
                orderNumber: this.processingQueue[0]?.orderNumber,
                customerName: this.processingQueue[0]?.customerName,
                status: 'processing',
                progress: DEFAULT_PROCESSING_PROGRESS // Could be enhanced with actual progress tracking
            }] : []
        };
    }
    public pause() {
        this.paused = true;
        autoProcessorEvents.emit('paused');
    }
    public resume() {
        this.paused = false;
        autoProcessorEvents.emit('resumed');
    }
}

export const autoProcessor = new AutoProcessor();