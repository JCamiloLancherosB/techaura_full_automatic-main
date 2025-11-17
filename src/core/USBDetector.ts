import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { USBDevice } from '../../types/processing';

const execAsync = promisify(exec);

type DriveInfo = { total: number; free: number; volumeName: string; fs?: string; };

export default class USBDetector {
  private detectionMode: 'auto' | 'manual';
  private monitorDrives: string[];
  private manualPaths: string[];
  private detectionInterval: number;
  private minSizeGB: number;
  private requireUSBInterface: boolean;
  private allowedFileSystems: Set<string> | null;

  private detectedDevices: Map<string, USBDevice> = new Map();
  private lastSnapshotKey: string = '';
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.detectionMode = (process.env.USB_DETECTION_MODE || 'auto') as 'auto' | 'manual';
    this.monitorDrives = (process.env.USB_MONITOR_DRIVES || 'E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z').split(',');
    this.manualPaths = (process.env.USB_MANUAL_PATHS || '').split(';').filter(p => p.trim() !== '');
    this.detectionInterval = parseInt(process.env.USB_DETECTION_INTERVAL || '5') * 1000;
    this.minSizeGB = parseInt(process.env.USB_MIN_SIZE_GB || '8');
    this.requireUSBInterface = (process.env.USB_REQUIRE_INTERFACE || 'true') === 'true';
    const fsList = (process.env.USB_ALLOWED_FILESYSTEMS || '').trim();
    this.allowedFileSystems = fsList ? new Set(fsList.split(',').map(x => x.trim().toLowerCase())) : null;
  }

  // Inicia monitoreo con debounce de cambios
  startMonitoring(callback: (devices: USBDevice[]) => void): void {
    console.log('🔍 Iniciando monitoreo de USBs...');
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(async () => {
      const list = await this.detectUSBDevices();
      const snapshotKey = this.serializeDevices(list);
      if (snapshotKey !== this.lastSnapshotKey) {
        this.lastSnapshotKey = snapshotKey;
        callback(list);
      }
    }, this.detectionInterval);

    // Detección inicial
    this.detectUSBDevices().then(list => {
      this.lastSnapshotKey = this.serializeDevices(list);
      if (list.length > 0) callback(list);
    });
  }

  stopMonitoring(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async refresh(): Promise<USBDevice[]> {
    return this.detectUSBDevices();
  }

  // Espera a que aparezca un dispositivo con capacidad >= requerida
  async waitForDevice(requiredCapacityGB: number, timeoutMs = 60000): Promise<USBDevice | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const list = await this.detectUSBDevices();
      const dev = list.find(d => (d.size / (1024 ** 3)) >= requiredCapacityGB && d.isAvailable);
      if (dev) return dev;
      await new Promise(r => setTimeout(r, Math.min(3000, this.detectionInterval)));
    }
    return null;
  }

  // Detección por SO
  async detectUSBDevices(): Promise<USBDevice[]> {
    if (this.detectionMode === 'manual') return this.detectManualPaths();
    if (process.platform === 'win32') return this.detectWindowsUSB();
    if (process.platform === 'linux') return this.detectLinuxUSB();
    if (process.platform === 'darwin') return this.detectMacUSB();
    return [];
  }

  // WINDOWS con PowerShell moderno
  private async detectWindowsUSB(): Promise<USBDevice[]> {
    try {
      const devices = await this.getWindowsUsbVolumes();
      // cache interna
      this.detectedDevices.clear();
      devices.forEach(d => this.detectedDevices.set(d.id, d));
      return devices;
    } catch (e) {
      console.error('❌ Error detectando USBs en Windows:', e);
      return [];
    }
  }

  // Usa Get-Volume + Get-Partition + Get-PhysicalDisk y DriveInfo de .NET
  private async getWindowsUsbVolumes(): Promise<USBDevice[]> {
    // Script PowerShell: crea JSON de volúmenes con drive letter, label, filesystem y físico (BusType, Removable)
    const ps = `
$ErrorActionPreference = "SilentlyContinue"
$vols = Get-Volume | Where-Object { $_.DriveLetter -ne $null }
$result = @()
foreach ($v in $vols) {
  try {
    $dl = $v.DriveLetter + ":\\"
    $p = Get-Partition -DriveLetter $v.DriveLetter
    $pd = $null
    if ($p) { $pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq $p.DiskNumber } }
    $obj = [PSCustomObject]@{
      DriveLetter = $v.DriveLetter
      Path = $dl
      FileSystem = $v.FileSystem
      Label = $v.FileSystemLabel
      Size = $v.Size
      SizeRemaining = $v.SizeRemaining
      DiskNumber = if ($p) { $p.DiskNumber } else { $null }
      BusType = if ($pd) { $pd.BusType } else { $null }
      Removable = if ($pd) { $pd.MediaType -eq "RemovableMedia" -or $pd.BusType -eq "USB" } else { $false }
    }
    $result += $obj
  } catch {}
}
$result | ConvertTo-Json -Compress
`.trim();

    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/\n/g, ';')}"`, { windowsHide: true, maxBuffer: 1024 * 1024 });

    const json = stdout && stdout.trim().length ? JSON.parse(stdout) : [];
    const arr = Array.isArray(json) ? json : [json];

    const out: USBDevice[] = [];
    for (const it of arr) {
      // Filtro por interfaz si se exige
      const isUsb = (String(it.BusType || '').toLowerCase() === 'usb') || Boolean(it.Removable);
      if (this.requireUSBInterface && !isUsb) continue;

      // DriveInfo para tamaño/espacio preciso
      const di = await this.getWindowsDriveInfoDotNet(it.DriveLetter);
      if (!di) continue;

      // Filtrar por FS si se configuró
      if (this.allowedFileSystems && it.FileSystem && !this.allowedFileSystems.has(String(it.FileSystem).toLowerCase())) {
        continue;
      }

      const stats: DriveInfo = {
        total: di.total,
        free: di.free,
        volumeName: it.Label || `USB_${it.DriveLetter}`,
        fs: it.FileSystem
      };

      if (!this.isValidUSB(stats)) continue;

      const dev: USBDevice = {
        id: this.generateDeviceId(`${it.DriveLetter}:`),
        path: `${it.DriveLetter}:\\`,
        size: stats.total,
        freeSpace: stats.free,
        volumeName: stats.volumeName,
        isAvailable: true,
        lastUsed: null,
        currentJob: null
      };
      out.push(dev);
    }
    return out;
  }

  // Usa .NET DriveInfo desde PowerShell para espacio libre/total
  private async getWindowsDriveInfoDotNet(driveLetter: string): Promise<{ total: number; free: number } | null> {
    if (!driveLetter) return null;
    const ps = `
Add-Type -AssemblyName System.IO
$di = New-Object System.IO.DriveInfo('${driveLetter}:')
if ($di.IsReady) {
  [PSCustomObject]@{
    Total = [int64]$di.TotalSize
    Free = [int64]$di.TotalFreeSpace
  } | ConvertTo-Json -Compress
}
`.trim();

    try {
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/\n/g, ';')}"`, { windowsHide: true });
      if (!stdout || !stdout.trim()) return null;
      const obj = JSON.parse(stdout);
      return { total: Number(obj.Total) || 0, free: Number(obj.Free) || 0 };
    } catch {
      return null;
    }
  }

  // LINUX
  private async detectLinuxUSB(): Promise<USBDevice[]> {
    const devices: USBDevice[] = [];
    try {
      const { stdout } = await execAsync('lsblk -J -o NAME,SIZE,MOUNTPOINT,TYPE,RM,TRAN');
      const data = JSON.parse(stdout);
      const toBytes = (s: string) => {
        // Tamaños como "29.3G" → bytes
        const m = String(s || '').match(/([\d\.]+)([KMGTP]?)/i);
        if (!m) return 0;
        const n = parseFloat(m[1]); const u = (m[2] || '').toUpperCase();
        const mul: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4, P: 1024 ** 5 };
        return Math.floor(n * (mul[u] || 1));
      };

      for (const dev of data.blockdevices || []) {
        if (dev.type === 'disk' || dev.type === 'part') {
          const isUsb = dev.rm === true || String(dev.tran || '').toLowerCase() === 'usb';
          const mnt = dev.mountpoint;
          if (!mnt) continue;
          const info = await this.getDriveInfoPosix(mnt);
          if (!info) continue;
          if (this.requireUSBInterface && !isUsb) continue;
          if (!this.isValidUSB(info)) continue;

          const volName = path.basename(mnt);
          const usb: USBDevice = {
            id: this.generateDeviceId(mnt),
            path: mnt,
            size: info.total,
            freeSpace: info.free,
            volumeName: volName,
            isAvailable: true,
            lastUsed: null,
            currentJob: null
          };
          devices.push(usb);
        }
      }
      this.detectedDevices.clear();
      devices.forEach(d => this.detectedDevices.set(d.id, d));
    } catch (error) {
      console.error('❌ Error detectando USBs en Linux:', error);
    }
    return devices;
  }

  // MAC
  private async detectMacUSB(): Promise<USBDevice[]> {
    const devices: USBDevice[] = [];
    try {
      const volumesPath = '/Volumes';
      if (!fs.existsSync(volumesPath)) return [];
      const volumes = fs.readdirSync(volumesPath);
      for (const volume of volumes) {
        const volPath = path.join(volumesPath, volume);
        const info = await this.getDriveInfoPosix(volPath);
        if (!info) continue;
        if (!this.isValidUSB(info)) continue;
        const dev: USBDevice = {
          id: this.generateDeviceId(volPath),
          path: volPath,
          size: info.total,
          freeSpace: info.free,
          volumeName: volume,
          isAvailable: true,
          lastUsed: null,
          currentJob: null
        };
        devices.push(dev);
      }
      this.detectedDevices.clear();
      devices.forEach(d => this.detectedDevices.set(d.id, d));
    } catch (error) {
      console.error('❌ Error detectando USBs en Mac:', error);
    }
    return devices;
  }

  // Manual
  private async detectManualPaths(): Promise<USBDevice[]> {
    const devices: USBDevice[] = [];
    for (const manualPath of this.manualPaths) {
      const p = manualPath.trim();
      if (!p || !fs.existsSync(p)) continue;
      const stats = await this.getDriveInfoPosix(p);
      if (!stats) continue;
      const dev: USBDevice = {
        id: this.generateDeviceId(p),
        path: p,
        size: stats.total,
        freeSpace: stats.free,
        volumeName: path.basename(p) || 'USB_Manual',
        isAvailable: true,
        lastUsed: null,
        currentJob: null
      };
      devices.push(dev);
      this.detectedDevices.set(dev.id, dev);
    }
    return devices;
  }

  // POSIX df
  private async getDriveInfoPosix(mountPath: string): Promise<DriveInfo | null> {
    try {
      const { stdout } = await execAsync(`df -B1 "${mountPath}" | tail -1`);
      const parts = stdout.trim().split(/\s+/);
      if (parts.length < 6) return null;
      return {
        total: parseInt(parts[1]) || 0,
        free: parseInt(parts[3]) || 0,
        volumeName: path.basename(mountPath)
      };
    } catch {
      return null;
    }
  }

  // Validación de capacidad mínima (GB) y FS permitido (si aplica)
  private isValidUSB(stats: { total: number; free: number; volumeName: string }): boolean {
    const sizeGB = stats.total / (1024 ** 3);
    return sizeGB >= this.minSizeGB;
  }

  private generateDeviceId(p: string): string {
    return `usb_${p.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  getDetectedDevices(): USBDevice[] {
    return Array.from(this.detectedDevices.values());
  }

  getDeviceById(id: string): USBDevice | undefined {
    return this.detectedDevices.get(id);
  }

  markDeviceAsUsed(id: string, jobId: string): void {
    const device = this.detectedDevices.get(id);
    if (device) {
      device.lastUsed = new Date();
      device.currentJob = jobId;
      device.isAvailable = false;
    }
  }

  releaseDevice(id: string): void {
    const device = this.detectedDevices.get(id);
    if (device) {
      device.currentJob = null;
      device.isAvailable = true;
    }
  }

  // Helpers
  private serializeDevices(list: USBDevice[]): string {
    return list
      .map(d => `${d.id}|${d.path}|${d.size}|${d.freeSpace}|${d.volumeName}|${d.isAvailable}`)
      .sort()
      .join('||');
  }
}
