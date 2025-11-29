import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import os from 'os';

import { USBDevice, ContentFile } from '../../types/processing';
import ProgressTracker from './ProgressTracker';
import { ProcessingJob } from '../models/ProcessingJob';

type ProgressEvent = {
  totalBytes: number;
  writtenBytes: number;
  percent: number; // 0-100
  file?: string;
};

const DEFAULT_CONCURRENCY = Math.min(4, Math.max(2, os.cpus()?.length ? Math.floor(os.cpus().length / 2) : 2));
const RETRY_DELAY = 800;
const MAX_RETRIES = 3;

export default class USBWriter {
  private progressTracker?: ProgressTracker;
  private availableDevices: USBDevice[] = [];
  private busyDevices: Set<string> = new Set();
  private maxConcurrentWrites: number;

  constructor(progressTracker?: ProgressTracker, maxConcurrentWrites: number = DEFAULT_CONCURRENCY) {
    this.progressTracker = progressTracker;
    this.maxConcurrentWrites = Math.max(1, maxConcurrentWrites);
  }

  private async updateJobProgress(job: ProcessingJob): Promise<void> {
    if (!this.progressTracker) return;
    try {
      await this.progressTracker.updateJobProgress(job);
    } catch (e) {
      // no romper el flujo de copiado
    }
  }

  // Detección de dispositivos (Windows PowerShell; fallback simple en otros SO)
  async detectAvailableDevices(): Promise<void> {
    try {
      const platform = process.platform;
      if (platform === 'win32') {
        const command = `Get-WmiObject -Class Win32_LogicalDisk | Where-Object {$_.DriveType -eq 2} | Select-Object DeviceID, Size, FreeSpace, VolumeName`;
        const devices = await new Promise<USBDevice[]>((resolve, reject) => {
          exec(`powershell "${command}"`, (error, stdout) => {
            if (error) return reject(error);
            const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const out: USBDevice[] = [];
            // Formato naive: leer bloques de 4 líneas
            for (let i = 1; i + 2 < lines.length; i += 4) {
              const deviceId = lines[i]?.split(':')[1]?.trim();
              const size = parseInt(lines[i + 1]?.split(':')[1]?.trim() || '0');
              const freeSpace = parseInt(lines[i + 2]?.split(':')[1]?.trim() || '0');
              const volumeName = lines[i + 3]?.split(':')[1]?.trim() || '';
              if (deviceId && size > 0) {
                out.push({
                  id: deviceId,
                  path: deviceId + '\\',
                  size,
                  freeSpace,
                  volumeName,
                  isAvailable: !this.busyDevices.has(deviceId),
                  lastUsed: null,
                  currentJob: null
                } as any);
              }
            }
            resolve(out);
          });
        });
        this.availableDevices = devices;
      } else if (platform === 'linux') {
        // Fallback: montar puntos en /media y /run/media
        const guesses: string[] = [];
        for (const base of ['/media', '/run/media']) {
          try {
            const users = await fsp.readdir(base).catch(() => []);
            for (const u of users) {
              const full = path.join(base, u);
              const entries = await fsp.readdir(full).catch(() => []);
              for (const m of entries) guesses.push(path.join(full, m));
            }
          } catch {}
        }
        const devices: USBDevice[] = [];
        for (const mp of guesses) {
          try {
            const stat = await fsp.stat(mp).catch(() => null);
            if (!stat) continue;
            // Estimar tamaño/espacio (no portable sin 'df', así que omite y marca valores 0)
            devices.push({
              id: mp,
              path: mp,
              size: 0,
              freeSpace: 0,
              volumeName: path.basename(mp),
              isAvailable: !this.busyDevices.has(mp),
              lastUsed: null,
              currentJob: null
            } as any);
          } catch {}
        }
        this.availableDevices = devices;
      } else if (platform === 'darwin') {
        // macOS: listar /Volumes
        const vols = await fsp.readdir('/Volumes').catch(() => []);
        this.availableDevices = vols
          .filter(v => v && v !== 'Macintosh HD')
          .map(v => ({
            id: path.join('/Volumes', v),
            path: path.join('/Volumes', v),
            size: 0,
            freeSpace: 0,
            volumeName: v,
            isAvailable: !this.busyDevices.has(path.join('/Volumes', v)),
            lastUsed: null,
            currentJob: null
          } as any));
      } else {
        this.availableDevices = [];
      }
    } catch (error) {
      console.error('❌ Error detectando dispositivos USB:', error);
      this.availableDevices = [];
    }
  }

  async getAvailableDevice(requiredCapacity: string): Promise<USBDevice | null> {
    const requiredBytes = this.parseCapacity(requiredCapacity);
    const pick = () =>
      this.availableDevices.find(d => d.isAvailable && !this.busyDevices.has(d.id) && (!d.size || d.size >= requiredBytes));

    let device = pick();
    if (!device) {
      await this.detectAvailableDevices();
      device = pick();
    }
    if (device) {
      this.busyDevices.add(device.id);
      device.isAvailable = false;
      device.lastUsed = new Date();
      return device;
    }
    return null;
  }

  async formatUSB(device: USBDevice, job: ProcessingJob): Promise<void> {
    const phoneTail = (job.customerPhone || '').replace(/\D/g, '').slice(-6) || '000000';
    const nameSafe = (job.customerName || 'USB').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
    const label = `${nameSafe}_${phoneTail}`.toUpperCase();

    try {
      const platform = process.platform;
      if (platform === 'win32') {
        // Quick format FAT32 con etiqueta
        await new Promise<void>((resolve, reject) => {
          exec(`format ${device.id} /FS:FAT32 /V:${label} /Q /Y`, { windowsHide: true }, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      } else if (platform === 'linux') {
        // Intentar etiquetar volumen (no formatear para evitar pérdida accidental)
        await this.setVolumeLabel(device, label).catch(() => {});
      } else if (platform === 'darwin') {
        await new Promise<void>((resolve) => {
          exec(`diskutil rename "${device.path}" "${label}"`, () => resolve());
        });
      }
      device.volumeName = label;
      await this.createFolderStructure(device, job);
    } catch (e) {
      console.error(`❌ Error formateando/etiquetando ${device.id}:`, e);
      throw e;
    }
  }

  async setVolumeLabel(device: USBDevice, label: string): Promise<void> {
    const platform = process.platform;
    if (platform === 'win32') {
      await new Promise<void>((resolve, reject) => {
        exec(`label ${device.id} ${label}`, { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
      });
      return;
    }
    if (platform === 'linux') {
      // Intentar exfatlabel o fatlabel (no fatal si falla)
      await new Promise<void>((resolve) => {
        exec(`exfatlabel "${device.path}" "${label}" || fatlabel "${device.path}" "${label}" || true`, () => resolve());
      });
      return;
    }
    if (platform === 'darwin') {
      await new Promise<void>((resolve) => {
        exec(`diskutil rename "${device.path}" "${label}"`, () => resolve());
      });
      return;
    }
  }

  private async createFolderStructure(device: USBDevice, job: ProcessingJob): Promise<void> {
    const basePath = device.path;
    const mkdir = async (p: string) => fsp.mkdir(p, { recursive: true }).catch(() => {});
    switch (job.contentType) {
      case 'music':
        await mkdir(path.join(basePath, 'Musica'));
        if ((job.preferences || []).includes('crossover')) {
          for (const g of ['Rock', 'Salsa', 'Pop', 'Reggaeton']) {
            await mkdir(path.join(basePath, 'Musica', g));
          }
        }
        break;
      case 'videos':
        for (const d of ['Videos', path.join('Videos', 'Musicales'), path.join('Videos', 'Conciertos')]) {
          await mkdir(path.join(basePath, d));
        }
        break;
      case 'movies':
        await mkdir(path.join(basePath, 'Peliculas'));
        break;
      case 'mixed':
        for (const d of ['Musica', 'Videos', 'Peliculas']) await mkdir(path.join(basePath, d));
        break;
    }
    const infoContent = [
      `USB personalizada para: ${job.customerName || ''}`,
      `Teléfono: ${job.customerPhone || ''}`,
      `Pedido: ${job.orderId || ''}`,
      `Fecha: ${new Date().toLocaleDateString('es-CO')}`,
      `Capacidad: ${job.capacity || ''}`,
      `Tipo: ${job.contentType || ''}`,
      '',
      `¡Gracias por elegirnos!`,
      `WhatsApp: +57 XXX XXX XXXX`
    ].join('\n');
    await fsp.writeFile(path.join(basePath, 'INFO.txt'), infoContent, 'utf8').catch(() => {});
  }

  // Copiado de múltiples archivos con progreso global y paralelismo controlado
  async copyFiles(files: ContentFile[], destRoot: string, onProgress?: (p: ProgressEvent) => void, job?: ProcessingJob): Promise<void> {
    const totalBytes = files.reduce((s, f) => s + (f.size || this.safeFileSize(f.path)), 0);
    let writtenBytes = 0;

    const queue = [...files];
    const workers: Promise<void>[] = [];

    const runNext = async (): Promise<void> => {
      const file = queue.shift();
      if (!file) return;
      const destDir = this.resolveDestinationFolder(destRoot, file, job);
      await fsp.mkdir(destDir, { recursive: true }).catch(() => {});
      const destPath = path.join(destDir, path.basename(file.path));
      await this.copyFileWithProgress(file.path, destPath, (delta, fileName) => {
        writtenBytes += delta;
        const percent = totalBytes ? Math.min(100, Math.floor((writtenBytes / totalBytes) * 100)) : 0;
        onProgress?.({ totalBytes, writtenBytes, percent, file: fileName });
        if (job) {
          job.progress = percent;
          this.updateJobProgress(job).catch(() => {});
        }
      });
      await runNext();
    };

    const slots = Math.min(this.maxConcurrentWrites, queue.length || 1);
    for (let i = 0; i < slots; i++) workers.push(runNext());
    await Promise.all(workers);
  }

  private resolveDestinationFolder(basePath: string, content: ContentFile, job?: ProcessingJob): string {
    switch (content.category) {
      case 'music':
        if ((job?.preferences || []).includes('crossover')) {
          return path.join(basePath, 'Musica', this.capitalizeFirst(content.subcategory || 'General'));
        }
        return path.join(basePath, 'Musica');
      case 'videos':
        return path.join(basePath, 'Videos', this.capitalizeFirst(content.subcategory || 'General'));
      case 'movies':
        return path.join(basePath, 'Peliculas');
      default:
        return basePath;
    }
  }

  private async copyFileWithProgress(source: string, destination: string, onChunk?: (deltaBytes: number, fileName: string) => void): Promise<void> {
    await this.copyFileWithRetry(source, destination, onChunk);
  }

  private async copyFileWithRetry(source: string, destination: string, onChunk?: (deltaBytes: number, fileName: string) => void, retries = MAX_RETRIES): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const total = this.safeFileSize(source);
          let written = 0;
          const rs = fs.createReadStream(source, { highWaterMark: 256 * 1024 });
          const ws = fs.createWriteStream(destination);
          rs.on('data', (chunk) => {
            written += chunk.length;
            onChunk?.(chunk.length, path.basename(source));
          });
          rs.on('error', reject);
          ws.on('error', reject);
          ws.on('finish', () => resolve());
          rs.pipe(ws);
        });
        return;
      } catch (e) {
        if (attempt === retries) throw e;
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  async releaseDevice(device: USBDevice): Promise<void> {
    this.busyDevices.delete(device.id);
    device.isAvailable = true;
    device.currentJob = null as any;
  }

  // Utils
  private parseCapacity(capacity: string): number {
    const num = parseInt(String(capacity).replace(/[^0-9]/g, '')) || 0;
    if (capacity.toLowerCase().includes('tb')) return num * 1024 * 1024 * 1024 * 1024;
    if (capacity.toLowerCase().includes('gb')) return num * 1024 * 1024 * 1024;
    if (capacity.toLowerCase().includes('mb')) return num * 1024 * 1024;
    return num;
  }

  private formatBytes(bytes: number): string {
    if (!bytes) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  private safeFileSize(p: string): number {
    try { return fs.statSync(p).size; } catch { return 0; }
  }

  private capitalizeFirst(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
