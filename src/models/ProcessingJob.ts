import { ContentPlan } from '../../types/processing';
import { USBDevice } from '../../types/processing';

export type JobStatus = 
    | 'pending'
    | 'queued'
    | 'preparing'
    | 'awaiting_payment'
    | 'payment_pending'
    | 'awaiting_usb'
    | 'processing'
    | 'copying'
    | 'verifying'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'paused'
    | 'error';

export interface JobLog {
    step: string;
    timestamp: Date;
    message: string;
}

export interface QualityReport {
    passed: boolean;
    errors: string[];
    warnings?: string[];
    verifiedFiles?: number;
    totalFiles?: number;
    integrityCheck?: boolean;
    timestamp?: Date;
}

export interface ProcessingJobData {
    id?: string;
    orderId: string;
    customerId: string;
    customerPhone?: string; // ✅ AGREGADO
    customerName?: string; // ✅ AGREGADO
    contentType: 'music' | 'videos' | 'movies' | 'mixed';
    capacity: string;
    preferences: string[];
    contentList?: string[];
    customizations?: any; // ✅ AGREGADO
    deliveryDate?: Date;
    priority?: number;
    notes?: string;
    estimatedTime?: number; // ✅ AGREGADO
}

export class ProcessingJob {
    id: string;
    orderId: string;
    customerId: string;
    customerPhone: string; // ✅ AGREGADO
    customerName: string; // ✅ AGREGADO
    contentType: 'music' | 'videos' | 'movies' | 'mixed';
    capacity: string;
    preferences: string[];
    contentList: string[];
    customizations?: any; // ✅ AGREGADO
    deliveryDate?: Date;
    priority: number;
    notes?: string;
    estimatedTime?: number; // ✅ AGREGADO

    // Estados y progreso
    status: JobStatus;
    progress: number;
    statusMessage?: string;
    lastUpdate: Date;

    // Contenido y USB
    contentPlan?: ContentPlan;
    assignedUSB?: string;
    assignedDevice?: USBDevice; // ✅ AGREGADO

    // Tiempos
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    processingTime?: number;

    // Errores y logs
    error?: string; // ✅ AGREGADO
    failureReason?: string;
    retryCount: number;
    logs: JobLog[]; // ✅ AGREGADO

    // Reporte de calidad
    qualityReport?: QualityReport; // ✅ AGREGADO

    constructor(data: ProcessingJobData) {
        this.id = data.id || `JOB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.orderId = data.orderId;
        this.customerId = data.customerId;
        this.customerPhone = data.customerPhone || 'Unknown'; // ✅ AGREGADO
        this.customerName = data.customerName || 'Cliente'; // ✅ AGREGADO
        this.contentType = data.contentType;
        this.capacity = data.capacity;
        this.preferences = data.preferences;
        this.contentList = data.contentList || [];
        this.customizations = data.customizations; // ✅ AGREGADO
        this.deliveryDate = data.deliveryDate;
        this.priority = data.priority || 5;
        this.notes = data.notes;
        this.estimatedTime = data.estimatedTime; // ✅ AGREGADO

        // Inicializar estados
        this.status = 'pending';
        this.progress = 0;
        this.lastUpdate = new Date();
        this.createdAt = new Date();
        this.retryCount = 0;
        this.logs = []; // ✅ AGREGADO
    }

    /**
     * Crea una copia del job con modificaciones opcionales
     */
    clone(overrides?: Partial<ProcessingJobData>): ProcessingJob {
        return new ProcessingJob({
            id: overrides?.id,
            orderId: overrides?.orderId || this.orderId,
            customerId: overrides?.customerId || this.customerId,
            customerPhone: overrides?.customerPhone || this.customerPhone,
            customerName: overrides?.customerName || this.customerName,
            contentType: overrides?.contentType || this.contentType,
            capacity: overrides?.capacity || this.capacity,
            preferences: overrides?.preferences || this.preferences,
            contentList: overrides?.contentList || this.contentList,
            customizations: overrides?.customizations || this.customizations,
            deliveryDate: overrides?.deliveryDate || this.deliveryDate,
            priority: overrides?.priority || this.priority,
            notes: overrides?.notes || this.notes,
            estimatedTime: overrides?.estimatedTime || this.estimatedTime
        });
    }

    // ============================================
    // MÉTODOS DE ACTUALIZACIÓN
    // ============================================

    updateStatus(status: JobStatus, message?: string): void {
        this.status = status;
        this.statusMessage = message;
        this.lastUpdate = new Date();

        // ✅ Agregar log
        this.logs.push({
            step: status,
            timestamp: new Date(),
            message: message || `Estado actualizado a: ${status}`
        });

        if (status === 'processing' && !this.startedAt) {
            this.startedAt = new Date();
        }

        if (status === 'completed') {
            this.completedAt = new Date();
            this.progress = 100;
            if (this.startedAt) {
                this.processingTime = this.completedAt.getTime() - this.startedAt.getTime();
            }
        }

        if (status === 'failed') {
            this.failedAt = new Date();
        }
    }

    updateProgress(progress: number, message?: string): void {
        this.progress = Math.min(100, Math.max(0, progress));
        if (message) {
            this.statusMessage = message;
        }
        this.lastUpdate = new Date();

        // ✅ Agregar log de progreso significativo
        if (progress % 10 === 0 || progress === 100) {
            this.logs.push({
                step: 'progress_update',
                timestamp: new Date(),
                message: message || `Progreso: ${progress}%`
            });
        }
    }

    setContentPlan(plan: ContentPlan): void {
        this.contentPlan = plan;
        this.logs.push({
            step: 'content_plan_set',
            timestamp: new Date(),
            message: `Plan de contenido establecido: ${plan.finalContent.length} archivos`
        });
    }

    assignUSB(usbId: string): void {
        this.assignedUSB = usbId;
        this.logs.push({
            step: 'usb_assigned',
            timestamp: new Date(),
            message: `USB asignado: ${usbId}`
        });
    }

    setFailure(reason: string): void {
        this.status = 'failed';
        this.error = reason;
        this.failureReason = reason;
        this.failedAt = new Date();
        this.retryCount++;

        this.logs.push({
            step: 'failure',
            timestamp: new Date(),
            message: `Error: ${reason}`
        });
    }

    canRetry(): boolean {
        return this.retryCount < 3;
    }

    // ✅ AGREGAR LOG MANUALMENTE
    addLog(step: string, message: string): void {
        this.logs.push({
            step,
            timestamp: new Date(),
            message
        });
    }

    // ✅ OBTENER DURACIÓN DEL PROCESAMIENTO
    getProcessingDuration(): string {
        if (!this.startedAt) return 'No iniciado';
        
        const endTime = this.completedAt || new Date();
        const duration = endTime.getTime() - this.startedAt.getTime();
        
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        return `${minutes}m ${seconds}s`;
    }

    // ✅ OBTENER RESUMEN DEL JOB
    getSummary(): string {
        return [
            `📋 Job: ${this.id}`,
            `👤 Cliente: ${this.customerName} (${this.customerPhone})`,
            `📦 Orden: ${this.orderId}`,
            `💾 Capacidad: ${this.capacity}`,
            `🎵 Tipo: ${this.contentType}`,
            `📊 Estado: ${this.status}`,
            `⚡ Progreso: ${this.progress}%`,
            `⏱️ Duración: ${this.getProcessingDuration()}`
        ].join('\n');
    }

    // ============================================
    // SERIALIZACIÓN
    // ============================================

    toJSON(): any {
        return {
            id: this.id,
            orderId: this.orderId,
            customerId: this.customerId,
            customerPhone: this.customerPhone,
            customerName: this.customerName,
            contentType: this.contentType,
            capacity: this.capacity,
            preferences: this.preferences,
            contentList: this.contentList,
            customizations: this.customizations,
            deliveryDate: this.deliveryDate,
            priority: this.priority,
            notes: this.notes,
            estimatedTime: this.estimatedTime,
            status: this.status,
            progress: this.progress,
            statusMessage: this.statusMessage,
            lastUpdate: this.lastUpdate,
            contentPlan: this.contentPlan,
            assignedUSB: this.assignedUSB,
            assignedDevice: this.assignedDevice,
            createdAt: this.createdAt,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            failedAt: this.failedAt,
            processingTime: this.processingTime,
            error: this.error,
            failureReason: this.failureReason,
            retryCount: this.retryCount,
            logs: this.logs,
            qualityReport: this.qualityReport
        };
    }

    static fromJSON(data: any): ProcessingJob {
        const job = new ProcessingJob({
            id: data.id,
            orderId: data.orderId,
            customerId: data.customerId,
            customerPhone: data.customerPhone,
            customerName: data.customerName,
            contentType: data.contentType,
            capacity: data.capacity,
            preferences: data.preferences,
            contentList: data.contentList,
            customizations: data.customizations,
            deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : undefined,
            priority: data.priority,
            notes: data.notes,
            estimatedTime: data.estimatedTime
        });

        // Restaurar estados
        job.status = data.status;
        job.progress = data.progress;
        job.statusMessage = data.statusMessage;
        job.lastUpdate = new Date(data.lastUpdate);
        job.contentPlan = data.contentPlan;
        job.assignedUSB = data.assignedUSB;
        job.assignedDevice = data.assignedDevice;
        job.createdAt = new Date(data.createdAt);
        job.startedAt = data.startedAt ? new Date(data.startedAt) : undefined;
        job.completedAt = data.completedAt ? new Date(data.completedAt) : undefined;
        job.failedAt = data.failedAt ? new Date(data.failedAt) : undefined;
        job.processingTime = data.processingTime;
        job.error = data.error;
        job.failureReason = data.failureReason;
        job.retryCount = data.retryCount;
        job.logs = data.logs || [];
        job.qualityReport = data.qualityReport;

        return job;
    }

    // ============================================
    // VALIDACIÓN
    // ============================================

    static validate(data: Partial<ProcessingJobData>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!data.orderId) {
            errors.push('orderId es requerido');
        }

        if (!data.customerId) {
            errors.push('customerId es requerido');
        }

        if (!data.contentType) {
            errors.push('contentType es requerido');
        } else if (!['music', 'videos', 'movies', 'mixed'].includes(data.contentType)) {
            errors.push('contentType debe ser: music, videos, movies o mixed');
        }

        if (!data.capacity) {
            errors.push('capacity es requerido');
        }

        if (!data.preferences || data.preferences.length === 0) {
            errors.push('preferences es requerido');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
