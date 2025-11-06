import { businessDB } from '../mysql-database';
import NotificationService from '../services/NotificationService';
import { ProcessingJob } from '../models/ProcessingJob';

/**
 * Gestiona la actualización del progreso de un ProcessingJob,
 * guardando en la BD y notificando al cliente.
 */
export default class ProgressTracker {
    
    private notificationService: NotificationService;

    // Pasamos el servicio de notificación al constructor
    constructor(notificationService: NotificationService) {
        this.notificationService = notificationService;
    }

    /**
     * Actualiza el progreso de un job.
     * Esta es la función central que llamarán tus otras clases.
     */
    public async updateJobProgress(job: ProcessingJob): Promise<void> {
        try {
            await businessDB.updateProcessingJob(job); 
            await this.notificationService.sendProgressUpdate(job);

        } catch (error) {
            console.error(`❌ Error al actualizar progreso del job ${job.id}:`, error);
        }
    }
}