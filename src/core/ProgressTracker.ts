import { businessDB } from '../mysql-database';
import NotificationService from '../services/NotificationService';
import { ProcessingJob } from '../models/ProcessingJob';
import { systemEvents } from './EventBridge'; // <--- Importar

export default class ProgressTracker {
  private notificationService?: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService;
  }

  public async updateJobProgress(job: ProcessingJob): Promise<void> {
    try {
      // Actualizar BD
      await (businessDB as any).updateProcessingJob(job);

      // Notificar al Frontend (Socket.io)
      systemEvents.notifyProgress(job); // <--- Esto actualiza la UI

      // Notificar WhatsApp (si aplica)
      if (this.notificationService && (job.progress % 25 === 0 || job.status === 'completed')) {
        await this.notificationService.sendProgressUpdate(job);
      }
    } catch (error) {
      console.error(`❌ Error updating progress:`, error);
    }
  }
}