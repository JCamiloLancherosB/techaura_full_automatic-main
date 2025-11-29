import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// --- Interfaces ---
interface DownloadTask {
    id: string;
    contentName: string;
    jobId: string;
    status: 'queued' | 'downloading' | 'completed' | 'error';
    progress: number;
    downloadUrl: string;
    destinationPath: string;
    createdAt: Date;
    metadata?: any;
    error?: string;
}

interface SearchResult {
    found: boolean;
    url: string;
    metadata: any;
    score: number; // Puntuación de calidad
}

interface ProcessingJob {
    id: string;
    logs: any[];
}

export default class DownloadManager {
    private downloadQueue: DownloadTask[] = [];
    private activeDownloads: Map<string, DownloadTask> = new Map();
    private maxConcurrentDownloads: number = 3;

    // Rutas base (Ajusta según tu servidor)
    private basePaths = {
        music: path.join(__dirname, 'downloads', 'music'),
        video: path.join(__dirname, 'downloads', 'video')
    };

    constructor() {
        // Asegurar que existan las carpetas
        if (!fs.existsSync(this.basePaths.music)) fs.mkdirSync(this.basePaths.music, { recursive: true });
        if (!fs.existsSync(this.basePaths.video)) fs.mkdirSync(this.basePaths.video, { recursive: true });
    }

    // ✅ PUNTO DE ENTRADA PRINCIPAL
    async downloadMissingContent(contentList: string[], job: ProcessingJob): Promise<void> {
        console.log(`⬇️ Procesando lote de ${contentList.length} items...`);

        // Crear tareas (Búsqueda inteligente asíncrona)
        const promises = contentList.map(async (query) => {
            try {
                // 1. Búsqueda Inteligente (Smart Filter)
                const result = await this.smartSearch(query);

                if (!result.found) {
                    console.warn(`⚠️ No encontrado: ${query}`);
                    return null;
                }

                // 2. Definir ruta
                const safeName = query.replace(/[^a-zA-Z0-9 -]/g, '').trim();
                const destPath = path.join(this.basePaths.music, `${safeName}.mp3`);

                return {
                    id: `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                    contentName: query,
                    jobId: job.id,
                    status: 'queued' as const,
                    progress: 0,
                    downloadUrl: result.url,
                    destinationPath: destPath,
                    metadata: result.metadata,
                    createdAt: new Date()
                };
            } catch (e) {
                console.error(`Error preparando ${query}:`, e);
                return null;
            }
        });

        const tasks = (await Promise.all(promises)).filter(t => t !== null) as DownloadTask[];

        this.downloadQueue.push(...tasks);
        this.processQueue();
    }

    // ✅ SMART SEARCH (La lógica de Python portada a TS)
    private async smartSearch(query: string): Promise<SearchResult> {
        return new Promise((resolve) => {
            // Usamos yt-dlp para obtener JSON de los primeros 3 resultados
            // -J (dump json), --flat-playlist (rápido), ytsearch3: (busca 3)
            const process = spawn('yt-dlp', [
                `ytsearch3:${query}`,
                '-J',
                '--flat-playlist',
                '--no-playlist'
            ]);

            let stdout = '';

            process.stdout.on('data', (d) => stdout += d.toString());

            process.on('close', (code) => {
                if (code !== 0 || !stdout) {
                    return resolve({ found: false, url: '', metadata: {}, score: 0 });
                }

                try {
                    const json = JSON.parse(stdout);
                    const entries = json.entries || [];

                    if (entries.length === 0) return resolve({ found: false, url: '', metadata: {}, score: 0 });

                    // Lógica de Puntuación (Igual que en tu script Python)
                    const scoredEntries = entries.map((entry: any) => {
                        let score = 0;
                        const title = (entry.title || '').toLowerCase();

                        if (title.includes('official') || title.includes('oficial')) score += 10;
                        if (title.includes('video')) score += 5;
                        if (title.includes('audio')) score += 5;

                        // Penalizaciones
                        if (title.includes('lyrics') || title.includes('letra')) score -= 5;
                        if (title.includes('cover')) score -= 10;
                        if (title.includes('live') || title.includes('vivo')) score -= 5;
                        if (title.includes('shorts')) score -= 20;

                        return { ...entry, score };
                    });

                    // Ordenar por mejor puntuación
                    scoredEntries.sort((a: any, b: any) => b.score - a.score);
                    const bestMatch = scoredEntries[0];

                    console.log(`🔍 Smart Search '${query}': Ganador -> '${bestMatch.title}' (Score: ${bestMatch.score})`);

                    resolve({
                        found: true,
                        url: bestMatch.url || `https://www.youtube.com/watch?v=${bestMatch.id}`,
                        metadata: { title: bestMatch.title, duration: bestMatch.duration },
                        score: bestMatch.score
                    });

                } catch (e) {
                    console.error("Error parseando JSON de yt-dlp", e);
                    resolve({ found: false, url: '', metadata: {}, score: 0 });
                }
            });
        });
    }

    // ✅ PROCESAR COLA
    private async processQueue() {
        if (this.downloadQueue.length === 0 && this.activeDownloads.size === 0) return;

        while (this.activeDownloads.size < this.maxConcurrentDownloads && this.downloadQueue.length > 0) {
            const task = this.downloadQueue.shift();
            if (task) {
                this.activeDownloads.set(task.id, task);
                task.status = 'downloading';

                // Ejecutar sin await para no bloquear el loop
                this.executeDownload(task).finally(() => {
                    this.activeDownloads.delete(task.id);
                    this.processQueue(); // Recursividad para seguir procesando
                });
            }
        }
    }

    // ✅ EJECUCIÓN CON METADATA (Feature de Python)
    private async executeDownload(task: DownloadTask): Promise<void> {
        console.log(`🚀 Descargando: ${task.contentName}`);

        return new Promise((resolve, reject) => {
            // Argumentos avanzados copiados de la lógica "Master Media Suite"
            const args = [
                task.downloadUrl,
                '-o', task.destinationPath,
                '--no-playlist',

                // Audio Settings
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '192K',

                // Metadata & Covers (Lo que pediste)
                '--embed-thumbnail',
                '--add-metadata',
                '--xattrs', // Atributos extendidos

                // Bypasses básicos
                '--no-check-certificate',
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            ];

            const proc = spawn('yt-dlp', args);

            proc.stdout.on('data', (data) => {
                const str = data.toString();
                // Regex simple para capturar porcentaje [download]  45.5%
                const match = str.match(/\[download\]\s+(\d+\.\d+)%/);
                if (match) {
                    task.progress = parseFloat(match[1]);
                }
            });

            proc.stderr.on('data', (d) => console.log(`[yt-dlp stderr] ${d}`)); // Logs informativos de yt-dlp

            proc.on('close', (code) => {
                if (code === 0) {
                    task.status = 'completed';
                    console.log(`✅ Completado: ${task.contentName}`);
                    resolve();
                } else {
                    task.status = 'error';
                    task.error = `Código de salida ${code}`;
                    console.error(`❌ Falló: ${task.contentName}`);
                    reject(new Error(task.error));
                }
            });
        });
    }
}