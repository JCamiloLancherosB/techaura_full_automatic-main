import { businessDB } from '../mysql-database';
import NotificationService from '../services/NotificationService';
import { ProcessingJob } from '../models/ProcessingJob';

export default class ProgressTracker {
  private notificationService?: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService;
  }

  public async updateJobProgress(job: ProcessingJob): Promise<void> {
    try {
      await (businessDB as any).updateProcessingJob(job); 
      if (this.notificationService) {
        await this.notificationService.sendProgressUpdate(job);
      }
    } catch (error) {
      console.error(`❌ Error al actualizar progreso del job ${job.id}:`, error);
    }
  }
}
