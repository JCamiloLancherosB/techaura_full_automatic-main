import * as fs from 'fs';
import * as path from 'path';
import { USBDevice, ContentFile } from '../../types/processing';
import ProgressTracker from './ProgressTracker';
import { ProcessingJob } from '../models/ProcessingJob';

export default class USBWriter {
    private progressTracker: ProgressTracker;
    private availableDevices: USBDevice[] = [];
    private busyDevices: Set<string> = new Set();
    private maxConcurrentWrites: number = 21;

    constructor(progressTracker: ProgressTracker) {
        this.progressTracker = progressTracker;
    }

    // ✅ AGREGAR MÉTODO updateJobProgress
    private async updateJobProgress(job: ProcessingJob): Promise<void> {
        await this.progressTracker.updateJobProgress(job);
    }

    // ✅ DETECTAR DISPOSITIVOS USB DISPONIBLES
    async detectAvailableDevices(): Promise<void> {
        console.log('🔍 Detectando dispositivos USB...');
        
        try {
            // ✅ USAR POWERSHELL PARA DETECTAR DISPOSITIVOS
            const { exec } = require('child_process');
            const command = `Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DriveType -eq 2} | Select-Object DeviceID, Size, FreeSpace, VolumeName`;
            
            const devices = await new Promise<USBDevice[]>((resolve, reject) => {
                exec(`powershell "${command}"`, (error: any, stdout: string) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    
                    const deviceList: USBDevice[] = [];
                    const lines = stdout.split('\n').filter(line => line.trim());
                    
                    for (let i = 1; i < lines.length; i += 4) {
                        if (lines[i] && lines[i+1] && lines[i+2]) {
                            const deviceId = lines[i].split(':')[1]?.trim();
                            const size = parseInt(lines[i+1].split(':')[1]?.trim() || '0');
                            const freeSpace = parseInt(lines[i+2].split(':')[1]?.trim() || '0');
                            const volumeName = lines[i+3]?.split(':')[1]?.trim() || '';
                            
                            if (deviceId && size > 0) {
                                deviceList.push({
                                    id: deviceId,
                                    path: deviceId + '\\',
                                                                        size: size,
                                    freeSpace: freeSpace,
                                    volumeName: volumeName,
                                    isAvailable: true,
                                    lastUsed: null,
                                    currentJob: null
                                });
                            }
                        }
                    }
                    
                    resolve(deviceList);
                });
            });
            
            this.availableDevices = devices;
            console.log(`✅ ${devices.length} dispositivos USB detectados`);
            
        } catch (error) {
            console.error('❌ Error detectando dispositivos USB:', error);
            this.availableDevices = [];
        }
    }

    // ✅ OBTENER DISPOSITIVO DISPONIBLE
    async getAvailableDevice(requiredCapacity: string): Promise<USBDevice | null> {
        const requiredBytes = this.parseCapacity(requiredCapacity);
        
        // ✅ BUSCAR DISPOSITIVO DISPONIBLE CON CAPACIDAD SUFICIENTE
        const availableDevice = this.availableDevices.find(device => 
            device.isAvailable && 
            !this.busyDevices.has(device.id) &&
            device.size >= requiredBytes
        );
        
        if (availableDevice) {
            // ✅ MARCAR COMO OCUPADO
            this.busyDevices.add(availableDevice.id);
            availableDevice.isAvailable = false;
            availableDevice.lastUsed = new Date();
            
            console.log(`📱 Dispositivo ${availableDevice.id} asignado (${this.formatBytes(availableDevice.size)})`);
            return availableDevice;
        }
        
        // ✅ SI NO HAY DISPONIBLES, REFRESCAR LISTA
        await this.detectAvailableDevices();
        
        const refreshedDevice = this.availableDevices.find(device => 
            device.isAvailable && 
            !this.busyDevices.has(device.id) &&
            device.size >= requiredBytes
        );
        
        if (refreshedDevice) {
            this.busyDevices.add(refreshedDevice.id);
            refreshedDevice.isAvailable = false;
            refreshedDevice.lastUsed = new Date();
            return refreshedDevice;
        }
        
        console.warn('⚠️ No hay dispositivos USB disponibles');
        return null;
    }

    // ✅ FORMATEAR USB
    async formatUSB(device: USBDevice, job: ProcessingJob): Promise<void> {
    console.log(`💾 Formateando dispositivo ${device.id}...`);
    
    try {
        const { exec } = require('child_process');
        
        // ✅ USAR customerName Y customerPhone
        const label = `${job.customerName.substring(0, 6)}_${job.customerPhone.substring(job.customerPhone.length - 6)}`.replace(/[^a-zA-Z0-9]/g, '');
        const formatCommand = `format ${device.id} /FS:FAT32 /V:${label} /Q /Y`;
        
        await new Promise<void>((resolve, reject) => {
            exec(formatCommand, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    console.error(`❌ Error formateando ${device.id}:`, error);
                    reject(error);
                    return;
                }
                
                console.log(`✅ Dispositivo ${device.id} formateado como ${label}`);
                device.volumeName = label;
                resolve();
            });
        });
        
        await this.createFolderStructure(device, job);
        
    } catch (error) {
        console.error(`❌ Error en formateo:`, error);
        throw error;
    }
}

    // ✅ CREAR ESTRUCTURA DE CARPETAS EN USB
    private async createFolderStructure(device: USBDevice, job: ProcessingJob): Promise<void> {
        const basePath = device.path;
        
        try {
            // ✅ CREAR CARPETAS SEGÚN TIPO DE CONTENIDO
            switch (job.contentType) {
                case 'music':
                    fs.mkdirSync(path.join(basePath, 'Musica'), { recursive: true });
                    if (job.preferences.includes('crossover')) {
                        fs.mkdirSync(path.join(basePath, 'Musica', 'Rock'), { recursive: true });
                        fs.mkdirSync(path.join(basePath, 'Musica', 'Salsa'), { recursive: true });
                        fs.mkdirSync(path.join(basePath, 'Musica', 'Pop'), { recursive: true });
                        fs.mkdirSync(path.join(basePath, 'Musica', 'Reggaeton'), { recursive: true });
                    }
                    break;
                    
                case 'videos':
                    fs.mkdirSync(path.join(basePath, 'Videos'), { recursive: true });
                    fs.mkdirSync(path.join(basePath, 'Videos', 'Musicales'), { recursive: true });
                    fs.mkdirSync(path.join(basePath, 'Videos', 'Conciertos'), { recursive: true });
                    break;
                    
                case 'movies':
                    fs.mkdirSync(path.join(basePath, 'Peliculas'), { recursive: true });
                    break;
                    
                case 'mixed':
                    fs.mkdirSync(path.join(basePath, 'Musica'), { recursive: true });
                    fs.mkdirSync(path.join(basePath, 'Videos'), { recursive: true });
                    fs.mkdirSync(path.join(basePath, 'Peliculas'), { recursive: true });
                    break;
            }
            
            // ✅ CREAR ARCHIVO DE INFORMACIÓN
            const infoContent = [
            `USB personalizada para: ${job.customerName}`,
            `Teléfono: ${job.customerPhone}`,
            `Pedido: ${job.orderId}`,
            `Fecha: ${new Date().toLocaleDateString('es-CO')}`,
            `Capacidad: ${job.capacity}`,
            `Tipo: ${job.contentType}`,
            ``,
            `¡Gracias por elegirnos! 🎵`,
            `WhatsApp: +57 XXX XXX XXXX`
        ].join('\n');
        
        fs.writeFileSync(path.join(basePath, 'INFO.txt'), infoContent, 'utf8');
        
    } catch (error) {
        console.error('❌ Error creando estructura de carpetas:', error);
        throw error;
    }
}

    // ✅ COPIAR CONTENIDO A USB
    async copyContent(contentList: ContentFile[], device: USBDevice, job: ProcessingJob): Promise<void> {
        console.log(`📁 Copiando ${contentList.length} archivos a ${device.id}...`);
        
        let copiedFiles = 0;
        let totalSize = 0;
        const errors: string[] = [];
        
        try {
            for (const content of contentList) {
                try {
                    // ✅ DETERMINAR CARPETA DE DESTINO
                    const destinationFolder = this.getDestinationFolder(device.path, content, job);
                    const destinationPath = path.join(destinationFolder, path.basename(content.path));
                    
                    // ✅ VERIFICAR ESPACIO DISPONIBLE
                    const fileSize = fs.statSync(content.path).size;
                    if (totalSize + fileSize > device.freeSpace) {
                        console.warn(`⚠️ No hay suficiente espacio para ${content.name}`);
                        break;
                    }
                    
                    // ✅ COPIAR ARCHIVO
                    await this.copyFileWithProgress(content.path, destinationPath, job);
                    
                    copiedFiles++;
                    totalSize += fileSize;

                    const progress = Math.floor((copiedFiles / contentList.length) * 40) + 50;
                    job.progress = progress;
                    
                    // ✅ ACTUALIZAR PROGRESO
                    job.progress = progress;
                    await this.updateJobProgress(job);
                    
                } catch (error) {
                    console.error(`❌ Error copiando ${content.name}:`, error);
                    errors.push(`Error copiando ${content.name}: ${error.message}`);
                }
            }
            
            console.log(`✅ ${copiedFiles} archivos copiados exitosamente (${this.formatBytes(totalSize)})`);
            
            if (errors.length > 0) {
                job.logs.push({
                    step: 'copy_warnings',
                    timestamp: new Date(),
                    message: `Advertencias: ${errors.join(', ')}`
                });
            }
            
        } catch (error) {
            console.error('❌ Error en proceso de copiado:', error);
            throw error;
        }
    }

    // ✅ DETERMINAR CARPETA DE DESTINO
    private getDestinationFolder(basePath: string, content: ContentFile, job: ProcessingJob): string {
        switch (content.category) {
            case 'music':
                if (job.preferences.includes('crossover')) {
                    return path.join(basePath, 'Musica', this.capitalizeFirst(content.subcategory));
                }
                return path.join(basePath, 'Musica');
                
            case 'videos':
                return path.join(basePath, 'Videos', this.capitalizeFirst(content.subcategory));
                
            case 'movies':
                return path.join(basePath, 'Peliculas');
                
            default:
                return basePath;
        }
    }

    // ✅ COPIAR ARCHIVO CON PROGRESO
    private async copyFileWithProgress(source: string, destination: string, job: ProcessingJob): Promise<void> {
        return new Promise((resolve, reject) => {
            const sourceStream = fs.createReadStream(source);
            const destStream = fs.createWriteStream(destination);
            
            let copiedBytes = 0;
            const totalBytes = fs.statSync(source).size;
            
            sourceStream.on('data', (chunk) => {
                copiedBytes += chunk.length;
                // ✅ ACTUALIZAR PROGRESO INTERNO DEL ARCHIVO
                const fileProgress = Math.floor((copiedBytes / totalBytes) * 100);
                // Opcional: emitir progreso detallado
            });
            
            sourceStream.on('error', reject);
            destStream.on('error', reject);
            destStream.on('finish', resolve);
            
            sourceStream.pipe(destStream);
        });
    }

    // ✅ LIBERAR DISPOSITIVO
    async releaseDevice(device: USBDevice): Promise<void> {
        this.busyDevices.delete(device.id);
        device.isAvailable = true;
        device.currentJob = null;
        
        console.log(`🔓 Dispositivo ${device.id} liberado`);
    }

    // ✅ UTILIDADES
    private parseCapacity(capacity: string): number {
        const num = parseInt(capacity.replace(/[^0-9]/g, ''));
        if (capacity.toLowerCase().includes('gb')) {
            return num * 1024 * 1024 * 1024;
        }
        return num * 1024 * 1024;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

