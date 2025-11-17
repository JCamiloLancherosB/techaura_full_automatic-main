import { businessDB } from '../mysql-database';
import { ProcessingSystem } from './ProcessingSystem';
import USBDetector from './USBDetector';

type ConcurrencyOptions = { maxParallel: number };

export class SystemOrchestrator {
  private running = new Map<number, Promise<any>>();
  private processor = new ProcessingSystem();
  private opts: ConcurrencyOptions;

  constructor(opts: ConcurrencyOptions = { maxParallel: 2 }) {
    this.opts = opts;
  }

  private cleanup() {
    for (const [jobId, p] of this.running) {
      if ((p as any).settled) this.running.delete(jobId);
    }
  }

  async tickOnce() {
    this.cleanup();
    if (this.running.size >= this.opts.maxParallel) return;

    const getJobs = (businessDB as any).listProcessingJobs || (businessDB as any).getPendingProcessingJobs;
    if (typeof getJobs !== 'function') return;

    const pending = await getJobs({ statuses: ['pending', 'retry'], limit: this.opts.maxParallel - this.running.size }).catch(() => []);
    if (!pending?.length) return;

    for (const job of pending) {
      if (this.running.size >= this.opts.maxParallel) break;

      const task = this.processor.run({ job }).catch(async (e) => {
        await (businessDB as any).updateProcessingJob({ id: job.id, status: 'failed', fail_reason: String(e?.message || e) });
      }).finally(() => {
        (task as any).settled = true;
      });

      this.running.set(job.id, task);
    }
  }

  async loop(intervalMs = 3000) {
    setInterval(() => this.tickOnce().catch(() => {}), intervalMs);
  }
}
