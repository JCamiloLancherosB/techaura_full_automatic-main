import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { USBDevice } from '../../types/processing';

const execAsync = promisify(exec);

export default class USBDetector {
    private detectionMode: 'auto' | 'manual';
    private monitorDrives: string[];
    private manualPaths: string[];
    private detectionInterval: number;
    private minSizeGB: number;
    private detectedDevices: Map<string, USBDevice> = new Map();

    constructor() {
        this.detectionMode = (process.env.USB_DETECTION_MODE || 'auto') as 'auto' | 'manual';
        this.monitorDrives = (process.env.USB_MONITOR_DRIVES || 'E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z').split(',');
        this.manualPaths = (process.env.USB_MANUAL_PATHS || '').split(';').filter(p => p.trim() !== '');
        this.detectionInterval = parseInt(process.env.USB_DETECTION_INTERVAL || '5') * 1000;
        this.minSizeGB = parseInt(process.env.USB_MIN_SIZE_GB || '8');
    }

    // ✅ INICIAR MONITOREO DE USBs
    startMonitoring(callback: (devices: USBDevice[]) => void): void {
        console.log('🔍 Iniciando monitoreo de USBs...');
        
        setInterval(async () => {
            const devices = await this.detectUSBDevices();
            if (devices.length > 0) {
                callback(devices);
            }
        }, this.detectionInterval);

        // Detección inicial
        this.detectUSBDevices().then(devices => {
            if (devices.length > 0) {
                callback(devices);
            }
        });
    }

    // ✅ DETECTAR DISPOSITIVOS USB
    async detectUSBDevices(): Promise<USBDevice[]> {
        if (this.detectionMode === 'manual') {
            return await this.detectManualPaths();
        }

        if (process.platform === 'win32') {
            return await this.detectWindowsUSB();
        } else if (process.platform === 'linux') {
            return await this.detectLinuxUSB();
        } else if (process.platform === 'darwin') {
            return await this.detectMacUSB();
        }

        return [];
    }

    // ✅ DETECTAR USBs EN WINDOWS
    private async detectWindowsUSB(): Promise<USBDevice[]> {
        const devices: USBDevice[] = [];

        for (const drive of this.monitorDrives) {
            const drivePath = `${drive.trim()}:/`;
            
            try {
                if (fs.existsSync(drivePath)) {
                    const stats = await this.getDriveInfo(drivePath);
                    
                    if (stats && this.isValidUSB(stats)) {
                        const device: USBDevice = {
                            id: this.generateDeviceId(drivePath),
                            path: drivePath,
                            size: stats.total,
                            freeSpace: stats.free,
                            volumeName: stats.volumeName || `USB_${drive}`,
                            isAvailable: true,
                            lastUsed: null,
                            currentJob: null
                        };

                        devices.push(device);
                        this.detectedDevices.set(device.id, device);
                    }
                }
            } catch (error) {
                // Drive no accesible o no es USB
            }
        }

        return devices;
    }

    // ✅ DETECTAR USBs EN LINUX
    private async detectLinuxUSB(): Promise<USBDevice[]> {
        const devices: USBDevice[] = [];

        try {
            const { stdout } = await execAsync('lsblk -J -o NAME,SIZE,MOUNTPOINT,TYPE');
            const data = JSON.parse(stdout);

            for (const device of data.blockdevices) {
                if (device.type === 'disk' && device.mountpoint) {
                    const stats = await this.getDriveInfo(device.mountpoint);
                    
                    if (stats && this.isValidUSB(stats)) {
                        const usbDevice: USBDevice = {
                            id: this.generateDeviceId(device.mountpoint),
                            path: device.mountpoint,
                            size: stats.total,
                            freeSpace: stats.free,
                            volumeName: path.basename(device.mountpoint),
                            isAvailable: true,
                            lastUsed: null,
                            currentJob: null
                        };

                        devices.push(usbDevice);
                        this.detectedDevices.set(usbDevice.id, usbDevice);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error detectando USBs en Linux:', error);
        }

        return devices;
    }

    // ✅ DETECTAR USBs EN MAC
    private async detectMacUSB(): Promise<USBDevice[]> {
        const devices: USBDevice[] = [];

        try {
            const { stdout } = await execAsync('diskutil list -plist external');
            // Parsear plist y extraer dispositivos externos
            // Implementación simplificada
            const volumesPath = '/Volumes';
            
            if (fs.existsSync(volumesPath)) {
                const volumes = fs.readdirSync(volumesPath);
                
                for (const volume of volumes) {
                    const volumePath = path.join(volumesPath, volume);
                    const stats = await this.getDriveInfo(volumePath);
                    
                    if (stats && this.isValidUSB(stats)) {
                        const device: USBDevice = {
                            id: this.generateDeviceId(volumePath),
                            path: volumePath,
                            size: stats.total,
                            freeSpace: stats.free,
                            volumeName: volume,
                            isAvailable: true,
                            lastUsed: null,
                            currentJob: null
                        };

                        devices.push(device);
                        this.detectedDevices.set(device.id, device);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error detectando USBs en Mac:', error);
        }

        return devices;
    }

    // ✅ DETECTAR RUTAS MANUALES
    private async detectManualPaths(): Promise<USBDevice[]> {
        const devices: USBDevice[] = [];

        for (const manualPath of this.manualPaths) {
            const trimmedPath = manualPath.trim();
            
            if (fs.existsSync(trimmedPath)) {
                const stats = await this.getDriveInfo(trimmedPath);
                
                if (stats) {
                    const device: USBDevice = {
                        id: this.generateDeviceId(trimmedPath),
                        path: trimmedPath,
                        size: stats.total,
                        freeSpace: stats.free,
                        volumeName: path.basename(trimmedPath) || 'USB_Manual',
                        isAvailable: true,
                        lastUsed: null,
                        currentJob: null
                    };

                    devices.push(device);
                    this.detectedDevices.set(device.id, device);
                }
            }
        }

        return devices;
    }

    // ✅ OBTENER INFORMACIÓN DE UNIDAD
    private async getDriveInfo(drivePath: string): Promise<{ total: number; free: number; volumeName: string } | null> {
        try {
            if (process.platform === 'win32') {
                // Windows: usar wmic
                const { stdout } = await execAsync(`wmic logicaldisk where "DeviceID='${drivePath.replace('/', '').replace(':', '')}:'" get Size,FreeSpace,VolumeName /format:csv`);
                const lines = stdout.trim().split('\n').filter(l => l.trim() !== '');
                
                if (lines.length > 1) {
                    const parts = lines[1].split(',');
                    return {
                        total: parseInt(parts[2]) || 0,
                        free: parseInt(parts[1]) || 0,
                        volumeName: parts[3] || ''
                    };
                }
            } else {
                // Linux/Mac: usar df
                const { stdout } = await execAsync(`df -B1 "${drivePath}" | tail -1`);
                const parts = stdout.trim().split(/\s+/);
                
                return {
                    total: parseInt(parts[1]) || 0,
                    free: parseInt(parts[3]) || 0,
                    volumeName: path.basename(drivePath)
                };
            }
        } catch (error) {
            console.error(`❌ Error obteniendo info de ${drivePath}:`, error);
        }

        return null;
    }

    // ✅ VALIDAR SI ES USB VÁLIDO
    private isValidUSB(stats: { total: number; free: number; volumeName: string }): boolean {
        const sizeGB = stats.total / (1024 * 1024 * 1024);
        return sizeGB >= this.minSizeGB;
    }

    // ✅ GENERAR ID DE DISPOSITIVO
    private generateDeviceId(path: string): string {
        return `usb_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }

    // ✅ OBTENER DISPOSITIVOS DETECTADOS
    getDetectedDevices(): USBDevice[] {
        return Array.from(this.detectedDevices.values());
    }

    // ✅ OBTENER DISPOSITIVO POR ID
    getDeviceById(id: string): USBDevice | undefined {
        return this.detectedDevices.get(id);
    }

    // ✅ MARCAR DISPOSITIVO COMO USADO
    markDeviceAsUsed(id: string, jobId: string): void {
        const device = this.detectedDevices.get(id);
        if (device) {
            device.lastUsed = new Date();
            device.currentJob = jobId;
            device.isAvailable = false;
        }
    }

    // ✅ LIBERAR DISPOSITIVO
    releaseDevice(id: string): void {
        const device = this.detectedDevices.get(id);
        if (device) {
            device.currentJob = null;
            device.isAvailable = true;
        }
    }
}
