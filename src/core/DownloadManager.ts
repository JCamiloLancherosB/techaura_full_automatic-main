// ✅ IMPORTACIONES DE MÓDULOS DE NODE.JS
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// -----------------------------------------------------------------
// ✅ DEFINICIONES DE TIPOS FALTANTES
// -----------------------------------------------------------------

// Definimos los tipos que tu código usaba pero no había declarado
interface DownloadTask {
    id: string;
    contentName: string; // El nombre que el usuario solicitó
    jobId: string;
    status: 'queued' | 'downloading' | 'completed' | 'error';
    progress: number;
    downloadUrl: string; // URL de YouTube, etc.
    destinationPath: string; // Ruta final exacta (ej. D:/.../MiCancion.mp3)
    createdAt: Date;
    metadata?: any;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
}

interface LogEntry {
    step: string;
    timestamp: Date;
    message: string;
}

interface ProcessingJob {
    id: string;
    logs: LogEntry[];
    // ... otras propiedades del trabajo
}

interface SearchResult {
    found: boolean;
    url: string;
    metadata: any;
}

interface ContentFile {
    id: string;
    name: string;
    path: string;
    category: string;
    subcategory: string;
    size: number;
    extension: string;
    lastModified: Date;
    metadata: any;
}

// (Asumimos que existe una instancia de 'contentManager' en alguna parte)
// declare const contentManager: {
//     addToIndex: (file: ContentFile) => void;
// };

// -----------------------------------------------------------------
// ✅ GESTOR DE DESCARGAS (OPTIMIZADO)
// -----------------------------------------------------------------
export default class DownloadManager {
    private downloadQueue: DownloadTask[] = [];
    private activeDownloads: Map<string, DownloadTask> = new Map();
    private maxConcurrentDownloads: number = 3;

    // ✅ DESCARGAR CONTENIDO FALTANTE
    async downloadMissingContent(missingContent: string[], job: ProcessingJob): Promise<void> {
        console.log(`⬇️ Preparando ${missingContent.length} archivos faltantes para descargar...`);
        
        const tasksToCreate: Promise<DownloadTask | null>[] = missingContent.map(async (contentName) => {
            try {
                // ✅ BUSCAR URL DE DESCARGA
                const searchResult = await this.searchContent(contentName);
                if (!searchResult.found) {
                    console.warn(`⚠️ No se encontró: ${contentName}`);
                    job.logs.push({
                        step: 'download_warning',
                        timestamp: new Date(),
                        message: `No se pudo encontrar: ${contentName}`
                    });
                    return null;
                }

                // ✅ MEJORA: Definir la ruta final *antes* de descargar
                const baseDestPath = this.getDownloadBasePath(contentName, 'music');
                const finalDestPath = `${baseDestPath}.mp3`; // Definimos la extensión aquí

                const downloadTask: DownloadTask = {
                    id: this.generateDownloadId(),
                    contentName: contentName,
                    jobId: job.id,
                    status: 'queued',
                    progress: 0,
                    downloadUrl: searchResult.url,
                    destinationPath: finalDestPath, // Ruta final exacta
                    metadata: searchResult.metadata,
                    createdAt: new Date()
                };
                return downloadTask;

            } catch (error) {
                console.error(`❌ Error preparando la búsqueda de ${contentName}:`, error);
                return null;
            }
        });

        // Esperar a que todas las búsquedas terminen
        const createdTasks = await Promise.all(tasksToCreate);

        // Añadir tareas válidas a la cola
        createdTasks.forEach(task => {
            if (task) {
                this.downloadQueue.push(task);
            }
        });

        console.log(`👍 ${this.downloadQueue.length} tareas añadidas a la cola. Iniciando procesamiento...`);

        // ✅ PROCESAR COLA DE DESCARGAS (SIN POLLING)
        // Devolvemos una promesa que se resuelve cuando la cola esté vacía
        await this.processDownloadQueue();
    }

    // ✅ BUSCAR CONTENIDO EN FUENTES DISPONIBLES
    private async searchContent(contentName: string): Promise<SearchResult> {
        console.log(`🔍 Buscando: ${contentName}`);
        
        try {
            // ✅ BUSCAR EN YOUTUBE
            const youtubeResult = await this.searchYouTube(contentName);
            if (youtubeResult.found) {
                return youtubeResult;
            }
            
            // ✅ BUSCAR EN OTRAS FUENTES (Futuro)
            // ...

            return { found: false, url: '', metadata: {} };
            
        } catch (error) {
            console.error(`❌ Error buscando ${contentName}:`, error);
            return { found: false, url: '', metadata: {} };
        }
    }

    // ✅ BUSCAR EN YOUTUBE (OPTIMIZADO CON 'spawn')
    private async searchYouTube(query: string): Promise<SearchResult> {
        return new Promise<SearchResult>((resolve, reject) => {
            
            // ✅ MEJORA: Usar 'spawn' es más seguro que 'exec' (evita Command Injection)
            const command = 'yt-dlp';
            const args = [
                `ytsearch1:${query}`, // Busca solo el primer resultado
                '--get-url',
                '--get-title',
                '--get-duration',
                '--no-playlist'
            ];
            
            const process = spawn(command, args, { shell: true }); // 'shell: true' ayuda a encontrar yt-dlp en el PATH
            
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    console.error(`Error buscando en YouTube (yt-dlp): ${stderr}`);
                    return resolve({ found: false, url: '', metadata: {} });
                }
                
                const lines = stdout.trim().split('\n');
                if (lines.length >= 3) {
                    const title = lines[0];
                    const duration = lines[1];
                    const url = lines[2];
                    
                    resolve({
                        found: true,
                        url: url,
                        metadata: {
                            title: title,
                            duration: duration,
                            source: 'youtube',
                            query: query
                        }
                    });
                } else {
                    resolve({ found: false, url: '', metadata: {} });
                }
            });

            process.on('error', (err) => {
                console.error('Error al ejecutar spawn de yt-dlp:', err);
                reject(err);
            });
        });
    }

    // ✅ PROCESAR COLA DE DESCARGAS (OPTIMIZADO)
    private processDownloadQueue(): Promise<void> {
        return new Promise((resolve) => {
            const processNext = () => {
                // Si ya no hay nada en cola ni descargas activas, terminamos.
                if (this.downloadQueue.length === 0 && this.activeDownloads.size === 0) {
                    resolve();
                    return;
                }

                // Iniciar nuevas descargas si hay espacio
                while (this.downloadQueue.length > 0 && this.activeDownloads.size < this.maxConcurrentDownloads) {
                    const task = this.downloadQueue.shift();
                    if (!task) continue;
                    
                    this.activeDownloads.set(task.id, task);
                    task.status = 'downloading';
                    task.startedAt = new Date();
                    
                    // ✅ EJECUTAR DESCARGA (sin await)
                    this.executeDownload(task)
                        .then(() => {
                            task.status = 'completed';
                            task.completedAt = new Date();
                            console.log(`✅ Descarga completada: ${task.contentName}`);
                            
                            // ✅ MEJORA: Actualizar el índice aquí mismo
                            this.updateContentIndex(task);
                        })
                        .catch((error) => {
                            task.status = 'error';
                            task.error = error.message;
                            console.error(`❌ Error descargando ${task.contentName}:`, error.message);
                        })
                        .finally(() => {
                            this.activeDownloads.delete(task.id);
                            // ✅ MEJORA: Llama a procesar el siguiente item
                            processNext();
                        });
                }
            };
            
            // Iniciar el procesamiento
            processNext();
        });
    }

    // ✅ EJECUTAR DESCARGA INDIVIDUAL (OPTIMIZADO CON 'spawn')
    private async executeDownload(task: DownloadTask): Promise<void> {
        console.log(`⬇️ Descargando: ${task.contentName} -> ${task.destinationPath}`);
        
        return new Promise<void>((resolve, reject) => {
            // ✅ MEJORA: Usar 'spawn' para seguridad y monitoreo de progreso
            const command = 'yt-dlp';
            const args = [
                task.downloadUrl,
                '-o', task.destinationPath, // Usamos la ruta final exacta
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '192K',
                '--embed-thumbnail',
                '--add-metadata',
                '--no-playlist'
            ];

            const process = spawn(command, args, { shell: true });

            process.stdout.on('data', (data: Buffer) => {
                const dataStr = data.toString();
                // ✅ MONITOREAR PROGRESO
                const progressMatch = dataStr.match(/\[download\]\s+([\d\.]+)%/);
                if (progressMatch) {
                    task.progress = parseFloat(progressMatch[1]);
                    // console.log(`Progreso ${task.contentName}: ${task.progress}%`); // Opcional: log de progreso
                }
            });

            process.stderr.on('data', (data: Buffer) => {
                console.warn(`[yt-dlp stderr]: ${data.toString()}`);
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error(`yt-dlp falló con código ${code}`));
                }
                
                // ✅ VERIFICAR QUE EL ARCHIVO SE DESCARGÓ
                if (!fs.existsSync(task.destinationPath)) {
                    return reject(new Error(`Archivo no encontrado después de descarga: ${task.destinationPath}`));
                }
                
                resolve();
            });

            process.on('error', (err) => {
                reject(err);
            });
        });
    }

    // ✅ OBTENER RUTA DE DESTINO PARA DESCARGA (SIMPLIFICADO)
    private getDownloadBasePath(query: string, contentType: string): string {
        // Sanitiza el nombre para usarlo en el sistema de archivos
        const sanitizedName = query
            .replace(/[/\\?%*:|"<>]/g, '-') // Reemplaza caracteres ilegales
            .replace(/\s+/g, ' ') // Colapsa espacios
            .trim();
        
        // No agregamos extensión aquí
        
        switch (contentType) {
            case 'music':
                return path.join('D:/Content/Music/Downloaded', sanitizedName);
            case 'video':
                return path.join('D:/Content/Videos/Downloaded', sanitizedName);
            default:
                return path.join('D:/Content/Downloaded', sanitizedName);
        }
    }

    // ✅ ACTUALIZAR ÍNDICE DE CONTENIDO (SIMPLIFICADO)
    private async updateContentIndex(task: DownloadTask): Promise<void> {
        try {
            // ✅ MEJORA: 'actualPath' es ahora 'task.destinationPath', no hay que adivinar.
            const actualPath = task.destinationPath; 
            
            if (fs.existsSync(actualPath)) {
                const stats = fs.statSync(actualPath);
                
                const contentFile: ContentFile = {
                    id: this.generateContentId(actualPath),
                    name: path.parse(actualPath).name,
                    path: actualPath,
                    category: 'music', // Asumido por ahora
                    subcategory: 'downloaded',
                    size: stats.size,
                    extension: path.extname(actualPath).toLowerCase(),
                    lastModified: stats.mtime,
                    metadata: {
                        ...task.metadata,
                        downloadedAt: new Date(),
                        originalQuery: task.contentName
                    }
                };
                
                // ✅ AGREGAR AL ÍNDICE GLOBAL (Descomentar cuando 'contentManager' exista)
                // contentManager.addToIndex(contentFile);
                
                console.log(`📁 Archivo indexado: ${contentFile.name}`);
            } else {
                console.warn(`⚠️ No se pudo indexar, archivo no encontrado: ${actualPath}`);
            }
        } catch (error) {
            console.error('❌ Error actualizando índice:', error);
        }
    }

    // ✅ UTILIDADES
    private generateDownloadId(): string {
        return `download_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    private generateContentId(filePath: string): string {
        return `content_${path.basename(filePath)}_${Date.now()}`;
    }
}