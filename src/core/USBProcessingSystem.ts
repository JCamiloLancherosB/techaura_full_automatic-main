import ContentManager from '../core/ContentManager';
import USBWriter from '../core/USBWriter';
import { QualityController } from './QualityController';
import OrderParser from '../core/OrderParser';
import NotificationService from '../services/NotificationService';
import DownloadManager from '../core/DownloadManager';
import { businessDB } from '../mysql-database';
import ProgressTracker from '../core/ProgressTracker';
import { ProcessingJob } from '../models/ProcessingJob';
import { v4 as uuidv4 } from 'uuid';

export default class USBProcessingSystem {
    private contentManager: ContentManager;
    private usbWriter: USBWriter;
    private qualityController: QualityController;
    private orderParser: OrderParser;
    private notificationService: NotificationService;
    private progressTracker: ProgressTracker;
    private downloadManager: DownloadManager;
    
    private processingQueue: ProcessingJob[] = [];
    private activeJobs: Map<string, ProcessingJob> = new Map();
    private maxConcurrentJobs: number = 21;
    private isProcessing: boolean = false;
    
    constructor() {
        this.initializeSystem();
    }

    private async initializeSystem() {
  console.log('🎵 Inicializando sistema de procesamiento de USBs...');
  try {
    this.orderParser = new OrderParser();
    this.notificationService = new NotificationService();
    this.progressTracker = new ProgressTracker(this.notificationService);
    this.contentManager = new ContentManager();        // 1) primero
    this.usbWriter = new USBWriter(this.progressTracker);
    this.qualityController = new QualityController();

    // 2) Pasa el contentManager después de instanciarlo
    this.downloadManager = new DownloadManager({
      addToIndex: (f: any) => this.contentManager.addToIndex(f)
    } as any);

    await this.loadConfiguration();
    await this.contentManager.verifyContentDirectories();
    await this.usbWriter.detectAvailableDevices();

    this.startProcessingLoop();
    console.log('✅ Sistema de procesamiento inicializado correctamente');
  } catch (error) {
    console.error('❌ Error inicializando sistema:', error);
    throw error;
  }
}


    // ✅ MÉTODOS FALTANTES
    private async loadConfiguration(): Promise<void> {
        // Cargar configuración desde archivo o variables de entorno
        console.log('⚙️ Cargando configuración del sistema...');
    }

    private generateJobId(): string {
        return `job-${Date.now()}-${uuidv4().substring(0, 8)}`;
    }

    private calculatePriority(orderData: any): number {
        let priority = 5; // Prioridad base
        
        // Clientes recurrentes tienen mayor prioridad
        if (orderData.isReturningCustomer) priority += 2;
        
        // Pedidos urgentes
        if (orderData.isUrgent) priority += 3;
        
        return priority;
    }

    private estimateProcessingTime(parsedOrder: any): number {
        const baseTime = 30; // 30 minutos base
        const contentMultiplier = parsedOrder.contentList.length * 0.5;
        return Math.ceil(baseTime + contentMultiplier);
    }

    private sortQueueByPriority(): void {
        this.processingQueue.sort((a, b) => b.priority - a.priority);
    }

    async processNewOrder(orderData: any): Promise<string> {
    try {
        console.log(`📦 Procesando nuevo pedido para ${orderData.customerPhone}`);
        
        const parsedOrder = await this.orderParser.parseOrder(orderData);
        if (!parsedOrder.isValid) {
            throw new Error(`Pedido inválido: ${parsedOrder.errors.join(', ')}`);
        }
        
        // ✅ CREAR JOB CON TODOS LOS CAMPOS
        const job = new ProcessingJob({
            orderId: orderData.orderId,
            customerId: orderData.customerId || orderData.customerPhone,
            customerPhone: orderData.customerPhone, // ✅ AGREGADO
            customerName: orderData.customerName, // ✅ AGREGADO
            capacity: orderData.capacity,
            contentType: orderData.contentType,
            preferences: parsedOrder.preferences,
            contentList: parsedOrder.contentList,
            customizations: parsedOrder.customizations,
            priority: this.calculatePriority(orderData),
            estimatedTime: this.estimateProcessingTime(parsedOrder)
        });
        
        this.processingQueue.push(job);
        this.sortQueueByPriority();
        
        await businessDB.insertProcessingJob(job);
        await this.notificationService.sendProcessingStarted(job);
        
        console.log(`✅ Pedido ${job.id} agregado a cola de procesamiento`);
        return job.id;
        
    } catch (error) {
        console.error(`❌ Error procesando pedido:`, error);
        throw error;
    }
}

    private async startProcessingLoop() {
        setInterval(async () => {
            if (this.processingQueue.length > 0 && this.activeJobs.size < this.maxConcurrentJobs) {
                await this.processNextJob();
            }
        }, 5000);
    }

    private async processNextJob() {
        if (this.processingQueue.length === 0) return;
        
        const job = this.processingQueue.shift();
        if (!job) return;
        
        this.activeJobs.set(job.id, job);
        job.status = 'processing';
        job.startedAt = new Date();
        
        try {
            await this.executeJob(job);
        } catch (error: any) {
            console.error(`❌ Error ejecutando job ${job.id}:`, error);
            job.status = 'error';
            job.error = error.message;
            await this.notificationService.sendProcessingError(job, error.message);
        } finally {
            this.activeJobs.delete(job.id);
            await businessDB.updateProcessingJob(job);
        }
    }

    private async executeJob(job: ProcessingJob) {
        console.log(`🔄 Ejecutando job ${job.id} para ${job.customerName}`);
        
        try {
            job.logs.push({ step: 'content_preparation', timestamp: new Date(), message: 'Preparando contenido...' });
            job.progress = 10;
            await this.progressTracker.updateJobProgress(job);
            
            const contentPlan = await this.contentManager.prepareContent(job);
            
            if (contentPlan.missingContent.length > 0) {
                job.logs.push({ step: 'downloading', timestamp: new Date(), message: `Descargando ${contentPlan.missingContent.length} archivos faltantes...` });
                job.progress = 20;
                await this.progressTracker.updateJobProgress(job);
                
                await this.downloadManager.downloadMissingContent(contentPlan.missingContent, job);
            }
            
            job.logs.push({ step: 'usb_detection', timestamp: new Date(), message: 'Detectando USB disponible...' });
            job.progress = 30;
            await this.progressTracker.updateJobProgress(job);
            
            const usbDevice = await this.usbWriter.getAvailableDevice(job.capacity);
            if (!usbDevice) {
                throw new Error('No hay dispositivos USB disponibles');
            }
            
            job.assignedDevice = usbDevice;
            
            job.logs.push({ step: 'usb_formatting', timestamp: new Date(), message: 'Formateando USB...' });
            job.progress = 40;
            await this.progressTracker.updateJobProgress(job);
            
            await this.usbWriter.formatUSB(usbDevice, job);
            
            job.logs.push({ step: 'content_copying', timestamp: new Date(), message: 'Copiando contenido a USB...' });
            job.progress = 50;
            await this.progressTracker.updateJobProgress(job);
            
            await this.usbWriter.copyFiles(contentPlan.finalContent, usbDevice.path, undefined, job);
            
            job.logs.push({ step: 'quality_check', timestamp: new Date(), message: 'Verificando calidad y integridad...' });
            job.progress = 90;
            await this.progressTracker.updateJobProgress(job);
            
            const qualityResult = await this.qualityController.verifyUSB(usbDevice, contentPlan.finalContent);
            if (!qualityResult.passed) {
                throw new Error(`Control de calidad falló: ${qualityResult.errors.join(', ')}`);
            }
            
            job.logs.push({ step: 'completion', timestamp: new Date(), message: 'Procesamiento completado exitosamente' });
            job.progress = 100;
            job.status = 'completed';
            job.completedAt = new Date();
            job.qualityReport = qualityResult; // ✅ CORREGIDO: Asignar QualityReport
            
            await this.progressTracker.updateJobProgress(job);
            await this.usbWriter.releaseDevice(usbDevice);
            await this.notificationService.sendProcessingCompleted(job);
            
            console.log(`✅ Job ${job.id} completado exitosamente`);
            
        } catch (error: any) {
            job.status = 'error';
            job.error = error.message;
            job.logs.push({ step: 'error', timestamp: new Date(), message: `Error: ${error.message}` });
            
            if (job.assignedDevice) {
                await this.usbWriter.releaseDevice(job.assignedDevice);
            }
            
            throw error;
        }
    }
}
