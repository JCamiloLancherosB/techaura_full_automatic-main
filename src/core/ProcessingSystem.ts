import { businessDB } from '../mysql-database';
import USBDetector from './USBDetector';
import USBWriter from './USBWriter';
import { QualityController } from './QualityController';
import DownloadManager from './DownloadManager';
import ContentManager from './ContentManager';
import ProgressTracker from './ProgressTracker';
import { ProcessingJob } from '../models/ProcessingJob';
import path from 'path';
import fsp from 'fs/promises';

export interface ProcessingContext {
  job: ProcessingJob;
  device?: any; // USBDevice
}

export class ProcessingSystem {
  private detector: USBDetector;
  private writer: USBWriter;
  private qc: QualityController;
  private downloader: DownloadManager;
  private content: ContentManager;
  private progress: ProgressTracker;

  constructor() {
    this.detector = new USBDetector();
    this.progress = new ProgressTracker();
    this.writer = new USBWriter(this.progress);
    this.qc = new QualityController();
    this.downloader = new DownloadManager();
    this.content = new ContentManager();
  }

  async run(ctx: ProcessingContext) {
    if (process.env.SKIP_DB_UPDATES === 'true') {
      return this.runWithoutDB(ctx);
    }
    const job = ctx.job;
    await (businessDB as any).updateProcessingJob({ id: job.id, status: 'processing', started_at: new Date() });

    // 1) preparar contenido usando ContentManager
    await this.content.verifyContentDirectories();
    const plan = await this.content.prepareContent(job);

    // 2) detectar/obtener USB
    let device = ctx.device;
    if (!device) {
      await this.writer.detectAvailableDevices();
      device = await this.writer.getAvailableDevice(job.capacity);
    }
    if (!device) {
      job.status = 'queued';
      job.progress = Math.min(job.progress || 0, 15);
      if (typeof (job as any).addLog === 'function') {
        (job as any).addLog('awaiting_production', 'Sin medios disponibles, reintentando en cola.');
      }
      await (businessDB as any).updateProcessingJob({
        id: job.id,
        status: 'queued',
        progress: job.progress || 0,
        logs: job.logs || [],
        error: null,
        startedAt: null,
        completedAt: null,
        qualityReport: null
      });
      return { ok: false, deferred: true, reason: 'awaiting_usb' };
    }

    // 3) formateo/estructura y label
    try {
      await this.writer.formatUSB(device, job);
    } catch {}

    // 4) copiado con progreso
    await (businessDB as any).updateProcessingJob({ id: job.id, status: 'writing' });
    await this.writer.copyFiles(plan.finalContent, device.path, (p) => {
      try {
        job.progress = p.percent;
        this.progress.updateJobProgress(job);
      } catch {}
    }, job);

    // 5) QA básico (usa QualityController.verify si ya lo tienes)
    await (businessDB as any).updateProcessingJob({ id: job.id, status: 'verifying' });
    const ok = await this.basicVerify(device.path, plan.finalContent);
    if (!ok) {
      await (businessDB as any).updateProcessingJob({ id: job.id, status: 'failed', fail_reason: 'Verificación fallida' });
      await this.writer.releaseDevice(device);
      throw new Error('Verificación fallida');
    }

    await (businessDB as any).updateProcessingJob({ id: job.id, status: 'done', finished_at: new Date() });
    await this.writer.releaseDevice(device);
    return { ok: true };
  }

  private async runWithoutDB(ctx: ProcessingContext) {
    const job = ctx.job;
    await this.content.verifyContentDirectories();
    const plan = await this.content.prepareContent(job);

    let device = ctx.device;
    if (!device) {
      await this.writer.detectAvailableDevices();
      device = await this.writer.getAvailableDevice(job.capacity);
    }
    if (!device) {
      job.status = 'queued';
      job.progress = Math.min(job.progress || 0, 15);
      if (typeof (job as any).addLog === 'function') {
        (job as any).addLog('awaiting_production', 'Sin medios disponibles, reintentando en cola.');
      }
      return { ok: false, deferred: true, reason: 'awaiting_usb' };
    }

    try {
      await this.writer.formatUSB(device, job);
    } catch {}

    await this.writer.copyFiles(plan.finalContent, device.path, (p) => {
      try {
        job.progress = p.percent;
        this.progress.updateJobProgress(job);
      } catch {}
    }, job);

    const ok = await this.basicVerify(device.path, plan.finalContent);
    if (!ok) {
      await this.writer.releaseDevice(device);
      throw new Error('Verificación fallida');
    }

    await this.writer.releaseDevice(device);
    return { ok: true };
  }

  private async basicVerify(root: string, files: { path: string }[]): Promise<boolean> {
    let missing = 0;
    for (const f of files.slice(0, Math.min(10, files.length))) {
      const dest = path.join(root, path.basename(f.path));
      try { await fsp.access(dest); } catch { missing++; }
    }
    return missing === 0;
  }
}
