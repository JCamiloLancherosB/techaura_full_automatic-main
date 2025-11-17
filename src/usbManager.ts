// import { exec } from 'child_process';
// import { promisify } from 'util';
// import fs from 'fs/promises';
// import path from 'path';
// import { CustomerOrder } from '../types/global';

// const execAsync = promisify(exec);

// // interface CustomerOrder {
// //     orderNumber: string;
// //     phoneNumber: string;
// //     customerName: string;
// //     productType: 'music' | 'video' | 'movies' | 'series';
// //     capacity: string;
// //     price: number;
// //     customization: {
// //         genres: string[];
// //         artists: string[];
// //         eras: string[];
// //         movies?: string[];
// //         series?: string[];
// //     };
// //     preferences: {
// //         videoQuality: string;
// //         audioQuality: string;
// //         subtitles: boolean;
// //         language: string;
// //     };
// //     processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
// //     usbLabel?: string;
// //     createdAt: Date;
// //     updatedAt?: Date;
// // }

// export interface USBDevice {
//     devicePath: string;
//     label: string;
//     size: number;
//     freeSpace: number;
//     usedSpace: number;
//     fileSystem: string;
//     isEmpty: boolean;
//     isReady: boolean;
// }

// export interface USBStatus {
//     connected: number;
//     empty: number;
//     devices: USBDevice[];
// }

// // export interface CustomerOrder {
// //     orderNumber: string;
// //     phoneNumber: string;
// //     customerName: string;
// //     productType: 'music' | 'video' | 'movies' | 'series';
// //     capacity: string;
// //     price: number;
// //     customization: {
// //         genres: string[];
// //         artists: string[];
// //         eras: string[];
// //         movies?: string[];
// //         series?: string[];
// //     };
// //     preferences: {
// //         videoQuality: string;
// //         audioQuality: string;
// //         subtitles: boolean;
// //         language: string;
// //     };
// //     processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
// //     createdAt: Date;
// // }

// class USBManager {
//     private detectionInterval: NodeJS.Timeout | null = null;
//     private lastKnownDevices: USBDevice[] = [];
//     private customerOrders: Map<string, CustomerOrder> = new Map(); // ✅ AGREGAR ESTA PROPIEDAD

//     constructor() {
//         this.startMonitoring();
//     }

//     // ✅ AGREGAR ESTOS MÉTODOS QUE FALTAN
//     addCustomerOrder(order: CustomerOrder): void {
//         this.customerOrders.set(order.orderNumber, order);
//         console.log(`📋 Orden ${order.orderNumber} agregada al sistema`);
//     }

//     getCustomerOrder(orderNumber: string): CustomerOrder | undefined {
//         return this.customerOrders.get(orderNumber);
//     }

//     getAllCustomerOrders(): CustomerOrder[] {
//         return Array.from(this.customerOrders.values());
//     }

//      async processCustomerOrder(orderNumber: string): Promise<boolean> {
//         const order = this.getCustomerOrder(orderNumber);
//         if (!order) {
//             console.error(`❌ Pedido no encontrado: ${orderNumber}`);
//             return false;
//         }

//         try {
//             console.log(`🔄 Procesando pedido: ${orderNumber}`);
//             // Lógica de procesamiento aquí
//             order.processingStatus = 'completed';
//             return true;
//         } catch (error) {
//             console.error(`❌ Error procesando pedido ${orderNumber}:`, error);
//             order.processingStatus = 'failed';
//             return false;
//         }
//     }

//     private initializeUSBDetection(): void {
//         console.log('🔌 Inicializando detección de USB...');
//     }

//     // Detectar USBs usando PowerShell como alternativa a wmic
// async detectUSBDevices(): Promise<USBDevice[]> {
//     try {
//         // Intentar primero con PowerShell
//         console.log('🔍 Detectando USBs con PowerShell...');
//         const devices = await this.detectWithPowerShell();
//         if (devices.length >= 0) { // Cambiar > 0 por >= 0 para aceptar arrays vacíos
//             return devices;
//         }

//         // Fallback: intentar con wmic si PowerShell falla
//         console.log('🔍 Fallback: intentando con WMIC...');
//         return await this.detectWithWMIC();
//     } catch (error) {
//         console.error('Error detectando USBs con PowerShell, intentando fallback:', error);
        
//         try {
//             // Fallback: intentar con wmic
//             return await this.detectWithWMIC();
//         } catch (wmicError) {
//             console.error('Error con WMIC también:', wmicError);
            
//             // Fallback final: detectar manualmente las unidades removibles
//             console.log('🔍 Fallback final: detección manual...');
//             return await this.detectManually();
//         }
//     }
// }

//     // Método principal usando PowerShell
// private async detectWithPowerShell(): Promise<USBDevice[]> {
//     try {
//         // Usar un enfoque más directo sin comillas complejas
//         const { stdout } = await execAsync('powershell "Get-WmiObject -Class Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | ConvertTo-Json"');
        
//         if (!stdout.trim()) {
//             return [];
//         }

//         let diskData;
//         try {
//             diskData = JSON.parse(stdout);
//             // Si es un solo objeto, convertirlo a array
//             if (!Array.isArray(diskData)) {
//                 diskData = [diskData];
//             }
//         } catch (parseError) {
//             console.error('Error parsing PowerShell output:', parseError);
//             console.log('Raw output:', stdout);
//             return [];
//         }

//         const devices: USBDevice[] = [];

//         for (const disk of diskData) {
//             if (!disk.DeviceID) continue;

//             const size = parseInt(disk.Size) || 0;
//             const freeSpace = parseInt(disk.FreeSpace) || 0;
//             const usedSpace = size - freeSpace;

//             // Verificar si la USB está vacía
//             const isEmpty = await this.checkIfUSBIsEmpty(disk.DeviceID, usedSpace, size);

//             devices.push({
//                 devicePath: disk.DeviceID,
//                 label: disk.VolumeName || `USB_${disk.DeviceID.replace(':', '')}`,
//                 size,
//                 freeSpace,
//                 usedSpace,
//                 fileSystem: disk.FileSystem || 'Unknown',
//                 isEmpty,
//                 isReady: true
//             });
//         }

//         console.log(`✅ PowerShell detectó ${devices.length} USBs`);
//         return devices;
//     } catch (error) {
//         console.error('Error con PowerShell:', error);
//         throw error;
//     }
// }


//     // Método fallback usando wmic
//     private async detectWithWMIC(): Promise<USBDevice[]> {
//         try {
//             const { stdout } = await execAsync(
//                 'wmic logicaldisk where "DriveType=2" get Size,FreeSpace,DeviceID,VolumeName,FileSystem /format:csv'
//             );

//             const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
//             const devices: USBDevice[] = [];

//             for (const line of lines) {
//                 const parts = line.split(',').map(part => part.trim());
//                 if (parts.length < 5) continue;

//                 const [, deviceId, fileSystem, freeSpace, size, volumeName] = parts;
                
//                 if (!deviceId || !size) continue;

//                 const sizeNum = parseInt(size) || 0;
//                 const freeSpaceNum = parseInt(freeSpace) || 0;
//                 const usedSpace = sizeNum - freeSpaceNum;

//                 const isEmpty = await this.checkIfUSBIsEmpty(deviceId, usedSpace, sizeNum);

//                 devices.push({
//                     devicePath: deviceId,
//                     label: volumeName || `USB_${deviceId.replace(':', '')}`,
//                     size: sizeNum,
//                     freeSpace: freeSpaceNum,
//                     usedSpace,
//                     fileSystem: fileSystem || 'Unknown',
//                     isEmpty,
//                     isReady: true
//                 });
//             }

//             return devices;
//         } catch (error) {
//             console.error('Error con WMIC:', error);
//             throw error;
//         }
//     }

//     // Detección manual como último recurso
//     private async detectManually(): Promise<USBDevice[]> {
//         try {
//             const devices: USBDevice[] = [];
            
//             // Verificar unidades comunes (D: a Z:)
//             for (let i = 68; i <= 90; i++) { // ASCII D-Z
//                 const drive = String.fromCharCode(i) + ':';
//                 const drivePath = drive + '\\';
                
//                 try {
//                     // Verificar si la unidad existe y es accesible
//                     const stats = await fs.stat(drivePath);
//                     if (stats.isDirectory()) {
//                         // Intentar obtener información de la unidad
//                         const device = await this.getManualDriveInfo(drive);
//                         if (device) {
//                             devices.push(device);
//                         }
//                     }
//                 } catch (error) {
//                     // La unidad no existe o no es accesible
//                     continue;
//                 }
//             }

//             return devices;
//         } catch (error) {
//             console.error('Error en detección manual:', error);
//             return [];
//         }
//     }

//     // Obtener información de unidad manualmente
//     private async getManualDriveInfo(drive: string): Promise<USBDevice | null> {
//         try {
//             const drivePath = drive + '\\';
            
//             // Verificar si es una unidad removible usando fsutil
//             const { stdout } = await execAsync(`fsutil fsinfo drivetype ${drive}`);
            
//             if (!stdout.toLowerCase().includes('removable')) {
//                 return null;
//             }

//             // Obtener espacio libre
//             const { stdout: spaceInfo } = await execAsync(`dir ${drive} /-c`);
//             const freeSpaceMatch = spaceInfo.match(/(\d+)\s+bytes\s+free/i);
//             const freeSpace = freeSpaceMatch ? parseInt(freeSpaceMatch[1]) : 0;

//             // Calcular espacio usado
//             const usedSpace = await this.calculateUsedSpace(drivePath);
//             const totalSize = freeSpace + usedSpace;

//             const isEmpty = await this.checkIfUSBIsEmpty(drive, usedSpace, totalSize);

//             return {
//                 devicePath: drive,
//                 label: `USB_${drive.replace(':', '')}`,
//                 size: totalSize,
//                 freeSpace,
//                 usedSpace,
//                 fileSystem: 'Unknown',
//                 isEmpty,
//                 isReady: true
//             };
//         } catch (error) {
//             console.error(`Error obteniendo info de ${drive}:`, error);
//             return null;
//         }
//     }

//     // Calcular espacio usado en una unidad
//     private async calculateUsedSpace(drivePath: string): Promise<number> {
//         try {
//             let totalSize = 0;
//             const items = await fs.readdir(drivePath);
            
//             for (const item of items) {
//                 try {
//                     const itemPath = path.join(drivePath, item);
//                     const stats = await fs.stat(itemPath);
                    
//                     if (stats.isFile()) {
//                         totalSize += stats.size;
//                     } else if (stats.isDirectory()) {
//                         // Recursivo para directorios (limitado para evitar demoras)
//                         const dirSize = await this.calculateDirectorySize(itemPath, 2);
//                         totalSize += dirSize;
//                     }
//                 } catch (error) {
//                     // Ignorar archivos/carpetas inaccesibles
//                     continue;
//                 }
//             }
            
//             return totalSize;
//         } catch (error) {
//             return 0;
//         }
//     }

//     // Calcular tamaño de directorio con límite de profundidad
//     private async calculateDirectorySize(dirPath: string, maxDepth: number): Promise<number> {
//         if (maxDepth <= 0) return 0;
        
//         try {
//             let totalSize = 0;
//             const items = await fs.readdir(dirPath);
            
//             for (const item of items) {
//                 try {
//                     const itemPath = path.join(dirPath, item);
//                     const stats = await fs.stat(itemPath);
                    
//                     if (stats.isFile()) {
//                         totalSize += stats.size;
//                     } else if (stats.isDirectory()) {
//                         const dirSize = await this.calculateDirectorySize(itemPath, maxDepth - 1);
//                         totalSize += dirSize;
//                     }
//                 } catch (error) {
//                     continue;
//                 }
//             }
            
//             return totalSize;
//         } catch (error) {
//             return 0;
//         }
//     }

//     // Verificar si la USB está vacía
//     private async checkIfUSBIsEmpty(devicePath: string, usedSpace: number, totalSize: number): Promise<boolean> {
//         try {
//             // Si el espacio usado es menos del 5% del total, considerarla vacía
//             if (totalSize > 0 && (usedSpace / totalSize) < 0.05) {
//                 return true;
//             }

//             // Verificar físicamente si hay archivos importantes
//             const drivePath = devicePath.endsWith('\\') ? devicePath : devicePath + '\\';
//             const files = await fs.readdir(drivePath);
            
//             // Filtrar archivos del sistema que no cuentan como "contenido"
//             const systemFiles = [
//                 'System Volume Information',
//                 '$RECYCLE.BIN',
//                 'autorun.inf',
//                 'desktop.ini',
//                 '.Trash-1000',
//                 '.Trashes'
//             ];
            
//             const contentFiles = files.filter(file => 
//                 !systemFiles.some(sysFile => 
//                     file.toLowerCase().includes(sysFile.toLowerCase())
//                 )
//             );
            
//             return contentFiles.length === 0;
//         } catch (error) {
//             // Si no podemos verificar, asumir que no está vacía por seguridad
//             return false;
//         }
//     }

//     // Obtener estado general de USBs
//     async getUSBStatus(): Promise<USBStatus> {
//         const devices = await this.detectUSBDevices();
        
//         return {
//             connected: devices.length,
//             empty: devices.filter(device => device.isEmpty).length,
//             devices
//         };
//     }

//     // Formatear USB con etiqueta personalizada
//     async formatUSB(device: USBDevice, customerPhone: string): Promise<boolean> {
//         try {
//             const label = `USB_${customerPhone.slice(-4)}_${Date.now().toString().slice(-6)}`;
            
//             console.log(`🔄 Formateando USB ${device.devicePath} con etiqueta: ${label}`);
            
//             // Comando para formatear (requiere permisos de administrador)
//             const formatCommand = `format ${device.devicePath} /FS:FAT32 /V:${label} /Q /Y`;
            
//             await execAsync(formatCommand);
            
//             console.log(`✅ USB ${device.devicePath} formateada exitosamente`);
//             return true;
//         } catch (error) {
//             console.error(`❌ Error formateando USB ${device.devicePath}:`, error);
//             return false;
//         }
//     }

//     // Copiar archivos a USB
//     async copyFilesToUSB(device: USBDevice, sourcePath: string): Promise<boolean> {
//         try {
//             console.log(`📁 Copiando archivos de ${sourcePath} a ${device.devicePath}`);
            
//             const copyCommand = `xcopy "${sourcePath}" "${device.devicePath}\\" /E /H /C /I /Y`;
//             await execAsync(copyCommand);
            
//             console.log(`✅ Archivos copiados exitosamente a ${device.devicePath}`);
//             return true;
//         } catch (error) {
//             console.error(`❌ Error copiando archivos a ${device.devicePath}:`, error);
//             return false;
//         }
//     }

//     // Encontrar primera USB vacía disponible
//     async findAvailableUSB(): Promise<USBDevice | null> {
//         const devices = await this.detectUSBDevices();
//         return devices.find(device => device.isEmpty && device.isReady) || null;
//     }

//     // Iniciar monitoreo automático
//     private startMonitoring(): void {
//         this.detectionInterval = setInterval(async () => {
//             try {
//                 const currentDevices = await this.detectUSBDevices();
                
//                 // Detectar cambios
//                 const newDevices = currentDevices.filter(current => 
//                     !this.lastKnownDevices.some(last => last.devicePath === current.devicePath)
//                 );
                
//                 const removedDevices = this.lastKnownDevices.filter(last =>
//                     !currentDevices.some(current => current.devicePath === last.devicePath)
//                 );
                
//                 // Notificar cambios
//                 if (newDevices.length > 0) {
//                     console.log(`🔌 USBs conectadas: ${newDevices.map(d => d.label).join(', ')}`);
//                 }
                
//                 if (removedDevices.length > 0) {
//                     console.log(`🔌 USBs desconectadas: ${removedDevices.map(d => d.label).join(', ')}`);
//                 }
                
//                 this.lastKnownDevices = currentDevices;
//             } catch (error) {
//                 // Error silencioso para no spam en logs
//             }
//         }, 10000); // Verificar cada 10 segundos
//     }

//     // Detener monitoreo
//     stopMonitoring(): void {
//         if (this.detectionInterval) {
//             clearInterval(this.detectionInterval);
//             this.detectionInterval = null;
//         }
//     }

//     // Obtener información detallada de una USB específica
//     async getUSBDetails(devicePath: string): Promise<USBDevice | null> {
//         const devices = await this.detectUSBDevices();
//         return devices.find(device => device.devicePath === devicePath) || null;
//     }

//     // Verificar si una USB está lista para usar
//     async isUSBReady(devicePath: string): Promise<boolean> {
//         try {
//             const device = await this.getUSBDetails(devicePath);
//             return device ? device.isReady && device.isEmpty : false;
//         } catch (error) {
//             return false;
//         }
//     }
// }

// // Función para inicializar el sistema USB
// export async function initializeUSBSystem(): Promise<void> {
//     try {
//         console.log('🔌 Inicializando sistema USB...');
        
//         const status = await usbManager.getUSBStatus();
//         console.log(`✅ Sistema USB inicializado: ${status.connected} USBs conectadas, ${status.empty} vacías`);
        
//         if (status.devices.length > 0) {
//             console.log('📋 USBs detectadas:');
//             status.devices.forEach(device => {
//                 console.log(`  - ${device.label} (${device.devicePath}) - ${device.isEmpty ? 'Vacía' : 'Con contenido'}`);
//             });
//         }
//     } catch (error) {
//         console.error('❌ Error inicializando sistema USB:', error);
//     }
// }

// export const usbManager = new USBManager();
// export { CustomerOrder };

import * as fs from 'fs/promises';
import * as path from 'path';
import { MUSIC_ROOT, VIDEO_ROOT, MOVIES_ROOT, SERIES_ROOT } from './config';
import { buscarArchivosPorNombre, copiarSinDuplicados, copiarCarpetaCompleta } from './utils/fileSearch';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CustomerOrder } from '../types/global';

// Extensiones válidas por tipo
const VALID_EXTENSIONS = {
    music: ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'],
    video: ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm'],
    movies: ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm'],
    series: ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm']
};

// Función principal a exportar
export async function prepararYCopiarPedido(order: CustomerOrder, usbPath: string) {
    // === 1. MÚSICA ===
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

    // === 2. VIDEOS ===
    if (order.customization.videos?.length || order.customization.videoArtists?.length) {
        const videosDir = path.join(usbPath, 'VIDEOS');
        const archivosCopiados = new Set<string>();
        for (const videoTema of order.customization.videos || []) {
            const videoTopicDir = path.join(videosDir, videoTema.toUpperCase());
            const archivos = await findFilesByNameRecursive(VIDEO_ROOT, videoTema, VALID_EXTENSIONS.video);
            await copyFilesNoDuplicates(archivos, videoTopicDir, archivosCopiados);
        }
        // Artistas de video, si existen
        for (const artista of order.customization.videoArtists || []) {
            const artistDir = path.join(videosDir, 'ARTISTAS', artista.toUpperCase());
            const archivos = await findFilesByNameRecursive(VIDEO_ROOT, artista, VALID_EXTENSIONS.video);
            await copyFilesNoDuplicates(archivos, artistDir, archivosCopiados);
        }
    }

    // === 3. PELÍCULAS ===
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
            // Buscar carpeta que coincida con el nombre de la serie (case-insensitive)
            const seriesFolders = await findFoldersByNameRecursive(MOVIES_ROOT, serie);
            for (const folder of seriesFolders) {
                const destSerieDir = path.join(seriesDir, path.basename(folder));
                await copyFolderRecursive(folder, destSerieDir, seriesCopiadas);
            }
        }
    }
}

// Auxiliar: busca archivos por nombre, recursivo, extensiones válidas
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
        // Silenciar errores
    }
    return found;
}

// Auxiliar: copia archivos a destino, sin duplicar por nombre base
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

// Auxiliar: copia carpetas completas (recursivo), sin duplicar por nombre de carpeta
async function copyFolderRecursive(src: string, dest: string, copiedFolders: Set<string>) {
    const folderName = path.basename(src);
    if (copiedFolders.has(folderName)) return;
    await fs.mkdir(dest, { recursive: true });
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

// Auxiliar: busca carpetas por nombre (case-insensitive) en root y subcarpetas
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
        // Silenciar errores
    }
    return found;
}

const execAsync = promisify(exec);

export interface USBDevice {
    devicePath: string;
    label: string;
    size: number;
    freeSpace: number;
    usedSpace: number;
    fileSystem: string;
    isEmpty: boolean;
    isReady: boolean;
}

export interface USBStatus {
    connected: number;
    empty: number;
    devices: USBDevice[];
}

class USBManager {
    private detectionInterval: NodeJS.Timeout | null = null;
    private lastKnownDevices: USBDevice[] = [];
    private customerOrders: Map<string, CustomerOrder> = new Map();
    private statusAnnounceInterval: NodeJS.Timeout | null = null;

    constructor() {
        // this.startMonitoring();
        this.startAnnounceStatus();
    }

    addCustomerOrder(order: CustomerOrder): void {
        this.customerOrders.set(order.orderNumber, order);
        console.log(`📋 Orden ${order.orderNumber} agregada al sistema`);
    }

    getCustomerOrder(orderNumber: string): CustomerOrder | undefined {
        return this.customerOrders.get(orderNumber);
    }

    getAllCustomerOrders(): CustomerOrder[] {
        return Array.from(this.customerOrders.values());
    }

    async processCustomerOrder(orderNumber: string): Promise<boolean> {
        const order = this.getCustomerOrder(orderNumber);
        if (!order) {
            console.error(`❌ Pedido no encontrado: ${orderNumber}`);
            return false;
        }
        try {
            console.log(`🔄 Procesando pedido: ${orderNumber}`);
            order.processingStatus = 'completed';
            return true;
        } catch (error) {
            console.error(`❌ Error procesando pedido ${orderNumber}:`, error);
            order.processingStatus = 'failed';
            return false;
        }
    }

    private initializeUSBDetection(): void {
        console.log('🔌 Inicializando detección de USB...');
    }

    async detectUSBDevices(): Promise<USBDevice[]> {
    try {
        // No log aquí: solo retorna los dispositivos
        const devices = await this.detectWithPowerShell();
        return devices;
    } catch (error) {
        // Si falla PowerShell, intenta con WMIC o manual (sin logs repetitivos)
        try {
            return await this.detectWithWMIC();
        } catch (wmicError) {
            // return await this.detectManually();
        }
    }
}

private async detectWithPowerShell(): Promise<USBDevice[]> {
    try {
        const { stdout } = await execAsync('powershell "Get-WmiObject -Class Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | ConvertTo-Json"');
        if (!stdout.trim()) {
            return [];
        }
        let diskData;
        try {
            diskData = JSON.parse(stdout);
            if (!Array.isArray(diskData)) {
                diskData = [diskData];
            }
        } catch (parseError) {
            // Solo log si hay error de parseo
            console.error('Error parsing PowerShell output:', parseError);
            return [];
        }
        const devices: USBDevice[] = [];
        for (const disk of diskData) {
            if (!disk.DeviceID) continue;
            const size = parseInt(disk.Size) || 0;
            const freeSpace = parseInt(disk.FreeSpace) || 0;
            const usedSpace = size - freeSpace;
            const isEmpty = await this.checkIfUSBIsEmpty(disk.DeviceID, usedSpace, size);
            devices.push({
                devicePath: disk.DeviceID,
                label: disk.VolumeName || `USB_${disk.DeviceID.replace(':', '')}`,
                size,
                freeSpace,
                usedSpace,
                fileSystem: disk.FileSystem || 'Unknown',
                isEmpty,
                isReady: true
            });
        }
        // No log aquí para evitar spam
        return devices;
    } catch (error) {
        console.error('Error con PowerShell:', error);
        throw error;
    }
}

    private async detectWithWMIC(): Promise<USBDevice[]> {
        try {
            const { stdout } = await execAsync(
                'wmic logicaldisk where "DriveType=2" get Size,FreeSpace,DeviceID,VolumeName,FileSystem /format:csv'
            );
            const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
            const devices: USBDevice[] = [];
            for (const line of lines) {
                const parts = line.split(',').map(part => part.trim());
                if (parts.length < 5) continue;
                const [, deviceId, fileSystem, freeSpace, size, volumeName] = parts;
                if (!deviceId || !size) continue;
                const sizeNum = parseInt(size) || 0;
                const freeSpaceNum = parseInt(freeSpace) || 0;
                const usedSpace = sizeNum - freeSpaceNum;
                const isEmpty = await this.checkIfUSBIsEmpty(deviceId, usedSpace, sizeNum);
                devices.push({
                    devicePath: deviceId,
                    label: volumeName || `USB_${deviceId.replace(':', '')}`,
                    size: sizeNum,
                    freeSpace: freeSpaceNum,
                    usedSpace,
                    fileSystem: fileSystem || 'Unknown',
                    isEmpty,
                    isReady: true
                });
            }
            return devices;
        } catch (error) {
            console.error('Error con WMIC:', error);
            throw error;
        }
    }

    // private async detectManually(): Promise<USBDevice[]> {
    //     try {
    //         const devices: USBDevice[] = [];
    //         for (let i = 68; i <= 90; i++) {
    //             const drive = String.fromCharCode(i) + ':';
    //             const drivePath = drive + '\\';
    //             try {
    //                 const stats = await fs.stat(drivePath);
    //                 if (stats.isDirectory()) {
    //                     const device = await this.getManualDriveInfo(drive);
    //                     if (device) {
    //                         devices.push(device);
    //                     }
    //                 }
    //             } catch (error) {
    //                 continue;
    //             }
    //         }
    //         return devices;
    //     } catch (error) {
    //         console.error('Error en detección manual:', error);
    //         return [];
    //     }
    // }

    private async getManualDriveInfo(drive: string): Promise<USBDevice | null> {
        try {
            const drivePath = drive + '\\';
            const { stdout } = await execAsync(`fsutil fsinfo drivetype ${drive}`);
            if (!stdout.toLowerCase().includes('removable')) {
                return null;
            }
            const { stdout: spaceInfo } = await execAsync(`dir ${drive} /-c`);
            const freeSpaceMatch = spaceInfo.match(/(\d+)\s+bytes\s+free/i);
            const freeSpace = freeSpaceMatch ? parseInt(freeSpaceMatch[1]) : 0;
            const usedSpace = await this.calculateUsedSpace(drivePath);
            const totalSize = freeSpace + usedSpace;
            const isEmpty = await this.checkIfUSBIsEmpty(drive, usedSpace, totalSize);
            return {
                devicePath: drive,
                label: `USB_${drive.replace(':', '')}`,
                size: totalSize,
                freeSpace,
                usedSpace,
                fileSystem: 'Unknown',
                isEmpty,
                isReady: true
            };
        } catch (error) {
            console.error(`Error obteniendo info de ${drive}:`, error);
            return null;
        }
    }

    private async calculateUsedSpace(drivePath: string): Promise<number> {
        try {
            let totalSize = 0;
            const items = await fs.readdir(drivePath);
            for (const item of items) {
                try {
                    const itemPath = path.join(drivePath, item);
                    const stats = await fs.stat(itemPath);
                    if (stats.isFile()) {
                        totalSize += stats.size;
                    } else if (stats.isDirectory()) {
                        const dirSize = await this.calculateDirectorySize(itemPath, 2);
                        totalSize += dirSize;
                    }
                } catch (error) {
                    continue;
                }
            }
            return totalSize;
        } catch (error) {
            return 0;
        }
    }

    private async calculateDirectorySize(dirPath: string, maxDepth: number): Promise<number> {
        if (maxDepth <= 0) return 0;
        try {
            let totalSize = 0;
            const items = await fs.readdir(dirPath);
            for (const item of items) {
                try {
                    const itemPath = path.join(dirPath, item);
                    const stats = await fs.stat(itemPath);
                    if (stats.isFile()) {
                        totalSize += stats.size;
                    } else if (stats.isDirectory()) {
                        const dirSize = await this.calculateDirectorySize(itemPath, maxDepth - 1);
                        totalSize += dirSize;
                    }
                } catch (error) {
                    continue;
                }
            }
            return totalSize;
        } catch (error) {
            return 0;
        }
    }

    private async checkIfUSBIsEmpty(devicePath: string, usedSpace: number, totalSize: number): Promise<boolean> {
        try {
            if (totalSize > 0 && (usedSpace / totalSize) < 0.05) {
                return true;
            }
            const drivePath = devicePath.endsWith('\\') ? devicePath : devicePath + '\\';
            const files = await fs.readdir(drivePath);
            const systemFiles = [
                'System Volume Information',
                '$RECYCLE.BIN',
                'autorun.inf',
                'desktop.ini',
                '.Trash-1000',
                '.Trashes'
            ];
            const contentFiles = files.filter(file =>
                !systemFiles.some(sysFile =>
                    file.toLowerCase().includes(sysFile.toLowerCase())
                )
            );
            return contentFiles.length === 0;
        } catch (error) {
            return false;
        }
    }

    async getUSBStatus(): Promise<USBStatus> {
        const devices = await this.detectUSBDevices();
        return {
            connected: devices.length,
            empty: devices.filter(device => device.isEmpty).length,
            devices
        };
    }

    async formatUSB(device: USBDevice, customerPhone: string): Promise<boolean> {
        try {
            const label = `USB_${customerPhone.slice(-4)}_${Date.now().toString().slice(-6)}`;
            console.log(`🔄 Formateando USB ${device.devicePath} con etiqueta: ${label}`);
            const formatCommand = `format ${device.devicePath} /FS:FAT32 /V:${label} /Q /Y`;
            await execAsync(formatCommand);
            console.log(`✅ USB ${device.devicePath} formateada exitosamente`);
            return true;
        } catch (error) {
            console.error(`❌ Error formateando USB ${device.devicePath}:`, error);
            return false;
        }
    }

    async copyFilesToUSB(device: USBDevice, sourcePath: string): Promise<boolean> {
        try {
            console.log(`📁 Copiando archivos de ${sourcePath} a ${device.devicePath}`);
            const copyCommand = `xcopy "${sourcePath}" "${device.devicePath}\\" /E /H /C /I /Y`;
            await execAsync(copyCommand);
            console.log(`✅ Archivos copiados exitosamente a ${device.devicePath}`);
            return true;
        } catch (error) {
            console.error(`❌ Error copiando archivos a ${device.devicePath}:`, error);
            return false;
        }
    }

    async findAvailableUSB(): Promise<USBDevice | null> {
        const devices = await this.detectUSBDevices();
        return devices.find(device => device.isEmpty && device.isReady) || null;
    }

    // private startMonitoring(): void {
    //     this.detectionInterval = setInterval(async () => {
    //         try {
    //             const currentDevices = await this.detectUSBDevices();
    //             const newDevices = currentDevices.filter(current =>
    //                 !this.lastKnownDevices.some(last => last.devicePath === current.devicePath)
    //             );
    //             const removedDevices = this.lastKnownDevices.filter(last =>
    //                 !currentDevices.some(current => current.devicePath === last.devicePath)
    //             );
    //             if (newDevices.length > 0) {
    //                 console.log(`🔌 USBs conectadas: ${newDevices.map(d => d.label).join(', ')}`);
    //             }
    //             if (removedDevices.length > 0) {
    //                 console.log(`🔌 USBs desconectadas: ${removedDevices.map(d => d.label).join(', ')}`);
    //             }
    //             this.lastKnownDevices = currentDevices;
    //         } catch (error) {
    //             // Silenciar error
    //         }
    //     }, 10000);
    // }

    private lastUSBCheck = 0;
private USB_CHECK_COOLDOWN = 60000; // 1 minuto mínimo entre checks

async detectUSBDevicesSafe(): Promise<void> {
  const now = Date.now();
  
  // Throttling: máximo 1 check por minuto
  if (now - this.lastUSBCheck < this.USB_CHECK_COOLDOWN) {
    console.log(`⏳ USB check en cooldown (${Math.round((this.USB_CHECK_COOLDOWN - (now - this.lastUSBCheck)) / 1000)}s restantes)`);
    return;
  }
  
  this.lastUSBCheck = now;
  
  try {
    // Usar solo método manual (más ligero)
    await this.detectManually();
  } catch (error) {
    console.error('Error detectando USBs:', error);
  }
}

// Detección manual simplificada (sin PowerShell)
private async detectManually(): Promise<void> {
  const drives = ['D:', 'E:', 'F:', 'G:', 'H:', 'I:'];
  const detectedUSBs: any[] = [];
  
//   for (const drive of drives) {
//     try {
//       const stats = await fs.promises.stat(drive);
//       if (stats.isDirectory()) {
//         detectedUSBs.push({
//           deviceID: drive,
//           volumeName: `USB_${drive.charAt(0)}`,
//           size: 0,
//           freeSpace: 0,
//           fileSystem: 'NTFS'
//         });
//       }
//     } catch {
//       // Drive no existe, continuar
//     }
//   }
  
//   this.connectedUSBs = detectedUSBs;
  console.log(`💾 USBs detectadas manualmente: ${detectedUSBs.length}`);
}

    private startAnnounceStatus(): void {
        this.statusAnnounceInterval = setInterval(async () => {
            const status = await this.getUSBStatus();
            console.log(
                `⏰ [Aviso] Estado USBs: ${status.connected} conectadas, ${status.empty} vacías. ` +
                status.devices.map(d => `${d.label}: ${d.isEmpty ? 'Vacía' : 'Con contenido'}`).join(' | ')
            );
        }, 5 * 60 * 1000); // Cada 5 minutos
    }

    stopMonitoring(): void {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        if (this.statusAnnounceInterval) {
            clearInterval(this.statusAnnounceInterval);
            this.statusAnnounceInterval = null;
        }
    }

    async getUSBDetails(devicePath: string): Promise<USBDevice | null> {
        const devices = await this.detectUSBDevices();
        return devices.find(device => device.devicePath === devicePath) || null;
    }

    async isUSBReady(devicePath: string): Promise<boolean> {
        try {
            const device = await this.getUSBDetails(devicePath);
            return device ? device.isReady && device.isEmpty : false;
        } catch (error) {
            return false;
        }
    }
}

// export async function prepararYCopiarPedido(order: CustomerOrder, usbPath: string): Promise<void> {
//     const archivosYaCopiados = new Set<string>();
//     if (order.productType === 'music') {
//         // Por género
//         for (const genero of order.customization.genres || []) {
//             const origenGenero = path.join(MUSIC_ROOT, genero);
//             const destinoGenero = path.join(usbPath, genero);
//             await copiarCarpetaCompleta(origenGenero, destinoGenero, archivosYaCopiados);
//         }
//         // Por artista
//         for (const artista of order.customization.artists || []) {
//             const origenArtista = path.join(MUSIC_ROOT, artista);
//             const destinoArtista = path.join(usbPath, artista);
//             await copiarCarpetaCompleta(origenArtista, destinoArtista, archivosYaCopiados);
//         }
//     } else if (order.productType === 'video') {
//         for (const genero of order.customization.genres || []) {
//             const origenGenero = path.join(VIDEO_ROOT, genero);
//             const destinoGenero = path.join(usbPath, genero);
//             await copiarCarpetaCompleta(origenGenero, destinoGenero, archivosYaCopiados);
//         }
//     } else if (order.productType === 'movie') {
//         for (const pelicula of order.customization.movies || []) {
//             const rutas = await buscarArchivosPorNombre(MOVIES_ROOT, pelicula);
//             await copiarSinDuplicados(rutas, usbPath, archivosYaCopiados);
//         }
//     } else if (order.productType === 'series') {
//         for (const serie of order.customization.series || []) {
//             const rutas = await buscarArchivosPorNombre(SERIES_ROOT, serie);
//             for (const ruta of rutas) {
//                 const destinoSerie = path.join(usbPath, serie);
//                 await copiarCarpetaCompleta(path.dirname(ruta), destinoSerie, archivosYaCopiados);
//             }
//         }
//     }
// } 

export async function initializeUSBSystem(): Promise<void> {
    try {
        console.log('🔌 Inicializando sistema USB...');
        const status = await usbManager.getUSBStatus();
        console.log(`✅ Sistema USB inicializado: ${status.connected} USBs conectadas, ${status.empty} vacías`);
        if (status.devices.length > 0) {
            console.log('📋 USBs detectadas:');
            status.devices.forEach(device => {
                console.log(`  - ${device.label} (${device.devicePath}) - ${device.isEmpty ? 'Vacía' : 'Con contenido'}`);
            });
        }
    } catch (error) {
        console.error('❌ Error inicializando sistema USB:', error);
    }
}

export const usbManager = new USBManager();
export { CustomerOrder };