import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import ContentManager from '../core/ContentManager';
import USBDetector from '../core/USBDetector';
import { ProcessingJob } from '../models/ProcessingJob';
import { Customer } from '../models/Customer'; // ✅ Importar clase
import { Order } from '../models/Order'; // ✅ Importar clase
import { ContentPlan, USBDevice, JobStatus } from '../../types/processing';
import NotificationService from '../services/NotificationService';
import PaymentService from '../services/PaymentService';
import AIService from '../services/AIService';
import DatabaseService from '../services/DatabaseService';

export default class ProcessingOrchestrator extends EventEmitter {
    private contentManager: ContentManager;
    private usbDetector: USBDetector;
    private notificationService: NotificationService;
    private paymentService: PaymentService;
    private aiService: AIService;
    private dbService: DatabaseService;

    private activeJobs: Map<string, ProcessingJob> = new Map();
    private jobQueue: ProcessingJob[] = [];
    private completedJobs: Map<string, ProcessingJob> = new Map();
    private failedJobs: Map<string, ProcessingJob> = new Map();

    private maxConcurrentJobs: number;
    private isProcessing: boolean = false;
    private processingInterval: NodeJS.Timeout | null = null;

    // Métricas del sistema
    private metrics = {
        totalJobsProcessed: 0,
        totalJobsFailed: 0,
        totalBytesProcessed: 0,
        averageProcessingTime: 0,
        totalRevenue: 0,
        activeUSBs: 0
    };

    constructor() {
        super();
        
        this.contentManager = new ContentManager();
        this.usbDetector = new USBDetector();
        this.notificationService = new NotificationService();
        this.paymentService = new PaymentService();
        this.aiService = new AIService();
        this.dbService = new DatabaseService();

        this.maxConcurrentJobs = parseInt(process.env.MAX_CONCURRENT_USB_JOBS || '21');

        this.initialize();
    }

    // ============================================
    // 🚀 INICIALIZACIÓN DEL SISTEMA
    // ============================================

    private async initialize(): Promise<void> {
        console.log('🚀 Inicializando Processing Orchestrator...');

        try {
            await this.contentManager.verifyContentDirectories();
            this.startUSBMonitoring();
            await this.loadPendingJobs();
            this.startAutoProcessing();
            this.setupPeriodicCleanup();
            this.setupMetricsBackup();

            console.log('✅ Processing Orchestrator inicializado correctamente');
            this.emit('orchestrator:ready');

        } catch (error) {
            console.error('❌ Error inicializando orchestrator:', error);
            this.emit('orchestrator:error', error);
        }
    }

    // ============================================
    // 📋 GESTIÓN DE TRABAJOS (JOBS)
    // ============================================

    /**
     * Crear nuevo trabajo de procesamiento
     */
    async createJob(orderData: {
        customerId: string;
        contentType: 'music' | 'videos' | 'movies' | 'mixed';
        capacity: string;
        preferences: string[];
        contentList?: string[];
        deliveryDate?: Date;
        priority?: number;
        notes?: string;
    }): Promise<ProcessingJob> {
        console.log('📝 Creando nuevo trabajo de procesamiento...');

        try {
            // Validar cliente
            const customer = await this.dbService.getCustomerById(orderData.customerId);
            if (!customer) {
                throw new Error(`Cliente no encontrado: ${orderData.customerId}`);
            }

            // ✅ Crear orden usando await
            const order = await this.createOrder(customer, orderData);

            // Crear trabajo de procesamiento
            const job = new ProcessingJob({
                orderId: order.id,
                customerId: customer.id,
                contentType: orderData.contentType,
                capacity: orderData.capacity,
                preferences: orderData.preferences,
                contentList: orderData.contentList || [],
                deliveryDate: orderData.deliveryDate,
                priority: orderData.priority || 5,
                notes: orderData.notes
            });

            // Guardar en BD
            await this.dbService.saveJob(job);

            // Agregar a cola
            this.addToQueue(job);

            // Notificar al cliente
            await this.notificationService.sendJobCreated(customer, job);

            // Emitir evento
            this.emit('job:created', job);

            console.log(`✅ Trabajo creado: ${job.id}`);
            return job;

        } catch (error) {
            console.error('❌ Error creando trabajo:', error);
            throw error;
        }
    }

    /**
     * Agregar trabajo a la cola
     */
    private addToQueue(job: ProcessingJob): void {
        const insertIndex = this.jobQueue.findIndex(j => j.priority < job.priority);
        
        if (insertIndex === -1) {
            this.jobQueue.push(job);
        } else {
            this.jobQueue.splice(insertIndex, 0, job);
        }

        console.log(`📥 Trabajo agregado a cola: ${job.id} (Prioridad: ${job.priority})`);
        this.emit('queue:updated', this.jobQueue.length);
    }

    /**
     * Procesar siguiente trabajo en cola
     */
    private async processNextJob(): Promise<void> {
        if (this.activeJobs.size >= this.maxConcurrentJobs) {
            console.log('⏸️ Máximo de trabajos concurrentes alcanzado');
            return;
        }

        const job = this.jobQueue.shift();
        if (!job) return;

        console.log(`🔄 Procesando trabajo: ${job.id}`);
        this.activeJobs.set(job.id, job);

        try {
            await this.processJob(job);
        } catch (error) {
            console.error(`❌ Error procesando trabajo ${job.id}:`, error);
            await this.handleJobFailure(job, error);
        }
    }

    /**
     * Procesar trabajo completo
     */
    private async processJob(job: ProcessingJob): Promise<void> {
        const startTime = Date.now();

        try {
            await this.updateJobStatus(job, 'preparing');

            console.log(`📦 Preparando contenido para ${job.id}...`);
            const contentPlan = await this.contentManager.prepareContent(job);
            job.contentPlan = contentPlan;

            if (contentPlan.missingContent.length > 0) {
                await this.handleMissingContent(job, contentPlan.missingContent);
            }

            await this.updateJobStatus(job, 'awaiting_payment');
            const paymentConfirmed = await this.verifyPayment(job);
            
            if (!paymentConfirmed) {
                await this.updateJobStatus(job, 'payment_pending');
                await this.notificationService.sendPaymentReminder(job);
                return;
            }

            await this.updateJobStatus(job, 'awaiting_usb');
            const usbDevice = await this.assignUSB(job);
            
            if (!usbDevice) {
                console.log(`⏳ No hay USB disponible para ${job.id}, reintentando...`);
                this.addToQueue(job);
                return;
            }

            job.assignedUSB = usbDevice.id;

            await this.updateJobStatus(job, 'copying');
            await this.copyContentToUSB(job, usbDevice, contentPlan);

            if (process.env.USB_VERIFY_AFTER_COPY === 'true') {
                await this.updateJobStatus(job, 'verifying');
                await this.verifyUSBContent(job, usbDevice);
            }

            await this.generateUSBLabel(job, usbDevice);

            await this.updateJobStatus(job, 'completed');
            await this.completeJob(job, startTime);

            this.usbDetector.releaseDevice(usbDevice.id);

        } catch (error) {
            console.error(`❌ Error en proceso de trabajo ${job.id}:`, error);
            throw error;
        }
    }

    /**
     * Actualizar estado del trabajo
     */
    private async updateJobStatus(job: ProcessingJob, status: JobStatus, message?: string): Promise<void> {
        job.updateStatus(status, message);

        await this.dbService.updateJob(job);
        await this.notificationService.sendStatusUpdate(job, status);

        this.emit('job:status_changed', { job, status, message });

        console.log(`📊 Estado de ${job.id}: ${status}${message ? ` - ${message}` : ''}`);
    }

    /**
     * Completar trabajo exitosamente
     */
    private async completeJob(job: ProcessingJob, startTime: number): Promise<void> {
        const processingTime = Date.now() - startTime;
        job.completedAt = new Date();
        job.processingTime = processingTime;

        this.activeJobs.delete(job.id);
        this.completedJobs.set(job.id, job);

        this.metrics.totalJobsProcessed++;
        this.metrics.totalBytesProcessed += job.contentPlan?.totalSize || 0;
        this.metrics.averageProcessingTime = 
            (this.metrics.averageProcessingTime * (this.metrics.totalJobsProcessed - 1) + processingTime) / 
            this.metrics.totalJobsProcessed;

        await this.dbService.updateJob(job);
        await this.notificationService.sendJobCompleted(job);
        await this.generateInvoice(job);

        this.emit('job:completed', job);

        console.log(`✅ Trabajo completado: ${job.id} (${(processingTime / 1000 / 60).toFixed(2)} min)`);
    }

    /**
     * Manejar fallo de trabajo
     */
    private async handleJobFailure(job: ProcessingJob, error: any): Promise<void> {
        job.setFailure(error.message || 'Error desconocido');

        this.activeJobs.delete(job.id);
        this.failedJobs.set(job.id, job);

        this.metrics.totalJobsFailed++;

        if (job.assignedUSB) {
            this.usbDetector.releaseDevice(job.assignedUSB);
        }

        await this.dbService.updateJob(job);
        await this.notificationService.sendJobFailed(job, error);

        this.emit('job:failed', { job, error });

        console.error(`❌ Trabajo fallido: ${job.id} - ${error.message}`);
    }

    // ============================================
    // 💾 GESTIÓN DE USBs
    // ============================================

    private startUSBMonitoring(): void {
        console.log('🔍 Iniciando monitoreo de USBs...');

        this.usbDetector.startMonitoring((devices) => {
            this.metrics.activeUSBs = devices.length;
            
            console.log(`💾 ${devices.length} USB(s) detectado(s):`);
            devices.forEach(device => {
                console.log(`  - ${device.volumeName} (${this.formatBytes(device.size)}) en ${device.path}`);
            });

            this.emit('usb:detected', devices);

            if (this.jobQueue.length > 0) {
                this.processNextJob();
            }
        });
    }

    private async assignUSB(job: ProcessingJob): Promise<USBDevice | null> {
        console.log(`🔍 Buscando USB disponible para ${job.id}...`);

        const devices = this.usbDetector.getDetectedDevices();
        const requiredSpace = this.parseCapacity(job.capacity);

        for (const device of devices) {
            if (device.isAvailable && device.size >= requiredSpace) {
                this.usbDetector.markDeviceAsUsed(device.id, job.id);
                
                console.log(`✅ USB asignado: ${device.volumeName} para ${job.id}`);
                this.emit('usb:assigned', { device, job });
                
                return device;
            }
        }

        console.log(`⚠️ No hay USB disponible con capacidad suficiente (${this.formatBytes(requiredSpace)})`);
        return null;
    }

    private async copyContentToUSB(
        job: ProcessingJob, 
        usbDevice: USBDevice, 
        contentPlan: ContentPlan
    ): Promise<void> {
        console.log(`💾 Copiando ${contentPlan.finalContent.length} archivos a ${usbDevice.path}...`);

        const startTime = Date.now();
        let copiedBytes = 0;

        try {
            await this.createUSBFolderStructure(usbDevice.path);

            for (let i = 0; i < contentPlan.finalContent.length; i++) {
                const file = contentPlan.finalContent[i];
                
                const progress = Math.round((i / contentPlan.finalContent.length) * 100);
                
                await this.updateJobProgress(job, progress, `Copiando: ${file.name}`);

                await this.contentManager.copyToUSB(
                    { ...contentPlan, finalContent: [file] },
                    usbDevice.path,
                    job
                );

                copiedBytes += file.size;

                this.emit('copy:progress', {
                    job,
                    progress,
                    copiedBytes,
                    totalBytes: contentPlan.totalSize,
                    currentFile: file.name
                });
            }

            const copyTime = (Date.now() - startTime) / 1000;
            const speedMBps = (copiedBytes / (1024 * 1024)) / copyTime;

            console.log(`✅ Copia completada: ${this.formatBytes(copiedBytes)} en ${copyTime.toFixed(2)}s (${speedMBps.toFixed(2)} MB/s)`);

        } catch (error) {
            console.error('❌ Error copiando contenido:', error);
            throw error;
        }
    }

    private async createUSBFolderStructure(usbPath: string): Promise<void> {
        const folders = [
            process.env.USB_FOLDER_MUSIC || 'Musica',
            process.env.USB_FOLDER_VIDEOS || 'Videos',
            process.env.USB_FOLDER_MOVIES || 'Peliculas',
            process.env.USB_FOLDER_APPS || 'Apps'
        ];

        for (const folder of folders) {
            const folderPath = path.join(usbPath, folder);
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
        }
    }

    private async verifyUSBContent(job: ProcessingJob, usbDevice: USBDevice): Promise<void> {
        console.log(`🔍 Verificando integridad del contenido en ${usbDevice.path}...`);

        if (!job.contentPlan) {
            throw new Error('No hay plan de contenido para verificar');
        }

        let verifiedFiles = 0;
        const totalFiles = job.contentPlan.finalContent.length;

        for (const file of job.contentPlan.finalContent) {
            const destPath = this.getDestinationPath(usbDevice.path, file);
            
            if (fs.existsSync(destPath)) {
                const stats = fs.statSync(destPath);
                if (stats.size === file.size) {
                    verifiedFiles++;
                } else {
                    console.warn(`⚠️ Tamaño incorrecto: ${file.name}`);
                }
            } else {
                console.warn(`⚠️ Archivo no encontrado: ${file.name}`);
            }
        }

        const verificationRate = (verifiedFiles / totalFiles) * 100;
        console.log(`✅ Verificación completada: ${verifiedFiles}/${totalFiles} archivos (${verificationRate.toFixed(2)}%)`);

        if (verificationRate < 95) {
            throw new Error(`Verificación fallida: solo ${verificationRate.toFixed(2)}% de archivos correctos`);
        }
    }

    private async generateUSBLabel(job: ProcessingJob, usbDevice: USBDevice): Promise<void> {
        console.log(`🏷️ Generando etiqueta para USB ${usbDevice.volumeName}...`);

        const customer = await this.dbService.getCustomerById(job.customerId);
        if (!customer) return;

        const labelData = {
            customerName: customer.name,
            orderId: job.orderId,
            contentType: job.contentType,
            capacity: job.capacity,
            date: new Date().toLocaleDateString('es-CO'),
            fileCount: job.contentPlan?.finalContent.length || 0,
            genres: this.extractGenresFromJob(job)
        };

        const labelPath = path.join(usbDevice.path, 'ETIQUETA.txt');
        const labelContent = `
╔════════════════════════════════════════╗
║        TECH AURA - USB MUSIC           ║
╚════════════════════════════════════════╝

Cliente: ${labelData.customerName}
Orden: ${labelData.orderId}
Fecha: ${labelData.date}

Tipo: ${labelData.contentType}
Capacidad: ${labelData.capacity}
Archivos: ${labelData.fileCount}
Géneros: ${labelData.genres.join(', ')}

¡Gracias por tu compra!
WhatsApp: ${process.env.PHONE_NUMBER}
        `.trim();

        fs.writeFileSync(labelPath, labelContent, 'utf-8');
        console.log(`✅ Etiqueta generada en ${labelPath}`);
    }

    // ============================================
    // 💰 GESTIÓN DE PAGOS Y ÓRDENES
    // ============================================

    /**
     * ✅ Crear orden - CORREGIDO
     */
    private async createOrder(customer: Customer, orderData: any): Promise<Order> {
        // ✅ Usar la clase Order correctamente
        const order = new Order({
            customerId: customer.id,
            contentType: orderData.contentType,
            capacity: orderData.capacity,
            preferences: orderData.preferences,
            price: this.calculatePrice(orderData),
            deliveryDate: orderData.deliveryDate
        });

        await this.dbService.saveOrder(order);
        return order;
    }

    private calculatePrice(orderData: any): number {
        // ✅ Usar método estático de Order
        return Order.calculatePrice(orderData.capacity, orderData.contentType);
    }

    private async verifyPayment(job: ProcessingJob): Promise<boolean> {
        console.log(`💰 Verificando pago para ${job.id}...`);

        const order = await this.dbService.getOrderById(job.orderId);
        if (!order) return false;

        const paymentStatus = await this.paymentService.checkPaymentStatus(order.id);
        
        if (paymentStatus === 'confirmed') {
            console.log(`✅ Pago confirmado para ${job.id}`);
            this.metrics.totalRevenue += order.price;
            return true;
        }

        console.log(`⏳ Pago pendiente para ${job.id}`);
        return false;
    }

    private async generateInvoice(job: ProcessingJob): Promise<void> {
        console.log(`🧾 Generando factura para ${job.id}...`);

        const order = await this.dbService.getOrderById(job.orderId);
        const customer = await this.dbService.getCustomerById(job.customerId);

        if (!order || !customer) return;

        const invoice = {
            invoiceNumber: `INV-${Date.now()}`,
            orderId: order.id,
            customerId: customer.id,
            customerName: customer.name,
            date: new Date(),
            items: [
                {
                    description: `USB ${job.contentType} - ${job.capacity}`,
                    quantity: 1,
                    price: order.price
                }
            ],
            total: order.price
        };

        await this.dbService.saveInvoice(invoice);
        await this.notificationService.sendInvoice(customer, invoice);

        console.log(`✅ Factura generada: ${invoice.invoiceNumber}`);
    }

    // ============================================
    // 🤖 PROCESAMIENTO AUTOMÁTICO
    // ============================================

    private startAutoProcessing(): void {
        console.log('⚙️ Iniciando procesamiento automático...');

        this.isProcessing = true;

        this.processingInterval = setInterval(async () => {
            if (this.jobQueue.length > 0 && this.activeJobs.size < this.maxConcurrentJobs) {
                await this.processNextJob();
            }
        }, 5000);

        console.log('✅ Procesamiento automático iniciado');
    }

    stopAutoProcessing(): void {
        console.log('⏸️ Deteniendo procesamiento automático...');

        this.isProcessing = false;

        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        console.log('✅ Procesamiento automático detenido');
    }

    // ============================================
    // 🧹 MANTENIMIENTO Y LIMPIEZA
    // ============================================

    private setupPeriodicCleanup(): void {
        setInterval(() => {
            this.cleanupOldJobs();
        }, 24 * 60 * 60 * 1000);

        setInterval(() => {
            this.cleanupCache();
        }, 60 * 60 * 1000);
    }

    private async cleanupOldJobs(): Promise<void> {
        console.log('🧹 Limpiando trabajos antiguos...');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);

        let cleaned = 0;

        for (const [id, job] of this.completedJobs.entries()) {
            if (job.completedAt && job.completedAt < cutoffDate) {
                this.completedJobs.delete(id);
                cleaned++;
            }
        }

        console.log(`✅ ${cleaned} trabajos antiguos limpiados`);
    }

    private cleanupCache(): void {
        console.log('🧹 Limpiando cache...');
    }

    private setupMetricsBackup(): void {
        setInterval(() => {
            this.backupMetrics();
        }, 60 * 60 * 1000);
    }

    private async backupMetrics(): Promise<void> {
        try {
            await this.dbService.saveMetrics(this.metrics);
        } catch (error) {
            console.error('❌ Error guardando métricas:', error);
        }
    }

    // ============================================
    // 📊 CONSULTAS Y REPORTES
    // ============================================

    getSystemStatus(): any {
        return {
            isProcessing: this.isProcessing,
            activeJobs: this.activeJobs.size,
            queuedJobs: this.jobQueue.length,
            completedJobs: this.completedJobs.size,
            failedJobs: this.failedJobs.size,
            activeUSBs: this.metrics.activeUSBs,
            metrics: this.metrics
        };
    }

    getJobById(jobId: string): ProcessingJob | undefined {
        return this.activeJobs.get(jobId) || 
               this.completedJobs.get(jobId) || 
               this.failedJobs.get(jobId);
    }

    getActiveJobs(): ProcessingJob[] {
        return Array.from(this.activeJobs.values());
    }

    getJobQueue(): ProcessingJob[] {
        return [...this.jobQueue];
    }

    getMetrics(): any {
        return { ...this.metrics };
    }

    async generateDailyReport(): Promise<any> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayJobs = Array.from(this.completedJobs.values()).filter(
            job => job.completedAt && job.completedAt >= today
        );

        const totalRevenue = await this.calculateTotalRevenue(todayJobs);

        const report = {
            date: today,
            totalJobs: todayJobs.length,
            totalRevenue: totalRevenue,
            averageProcessingTime: todayJobs.reduce((sum, job) => 
                sum + (job.processingTime || 0), 0) / todayJobs.length,
            contentTypes: this.groupByContentType(todayJobs)
        };

        await this.dbService.saveDailyReport(report);
        return report;
    }

    private async calculateTotalRevenue(jobs: ProcessingJob[]): Promise<number> {
        let total = 0;

        for (const job of jobs) {
            const order = await this.dbService.getOrderById(job.orderId);
            if (order) {
                total += order.price;
            }
        }

        return total;
    }

    // ============================================
    // 🛠️ UTILIDADES PRIVADAS
    // ============================================

    private async loadPendingJobs(): Promise<void> {
        console.log('📂 Cargando trabajos pendientes...');

        try {
            const pendingJobs = await this.dbService.getPendingJobs();
            
            for (const job of pendingJobs) {
                this.addToQueue(job);
            }

            console.log(`✅ ${pendingJobs.length} trabajos pendientes cargados`);

        } catch (error) {
            console.error('❌ Error cargando trabajos pendientes:', error);
        }
    }

    private async updateJobProgress(job: ProcessingJob, progress: number, message: string): Promise<void> {
        job.updateProgress(progress, message);

        await this.dbService.updateJob(job);
        this.emit('job:progress', { job, progress, message });
    }

    private async handleMissingContent(job: ProcessingJob, missingContent: string[]): Promise<void> {
        console.log(`⚠️ Contenido faltante para ${job.id}:`, missingContent);

        const customer = await this.dbService.getCustomerById(job.customerId);
        if (customer) {
            await this.notificationService.sendMissingContentAlert(customer, job, missingContent);
        }

        this.emit('job:missing_content', { job, missingContent });
    }

    private getDestinationPath(usbPath: string, file: any): string {
        const categoryFolder = this.getCategoryFolder(file.category);
        return path.join(usbPath, categoryFolder, file.subcategory, path.basename(file.path));
    }

    private getCategoryFolder(category: string): string {
        const folders: any = {
            music: process.env.USB_FOLDER_MUSIC || 'Musica',
            videos: process.env.USB_FOLDER_VIDEOS || 'Videos',
            movies: process.env.USB_FOLDER_MOVIES || 'Peliculas'
        };

        return folders[category] || 'Otros';
    }

    private extractGenresFromJob(job: ProcessingJob): string[] {
        const genres = new Set<string>();

        if (job.contentPlan) {
            for (const file of job.contentPlan.finalContent) {
                genres.add(file.subcategory);
            }
        }

        return Array.from(genres);
    }

    private groupByContentType(jobs: ProcessingJob[]): any {
        return jobs.reduce((acc: any, job) => {
            acc[job.contentType] = (acc[job.contentType] || 0) + 1;
            return acc;
        }, {});
    }

    private getCapacityMultiplier(capacity: string): number {
        const gb = parseInt(capacity.replace(/[^0-9]/g, ''));
        
        if (gb <= 8) return 1;
        if (gb <= 16) return 1.5;
        if (gb <= 32) return 2;
        if (gb <= 64) return 3;
        return 4;
    }

    private getContentMultiplier(contentType: string): number {
        const multipliers: any = {
            music: 1,
            videos: 1.2,
            movies: 1.5,
            mixed: 1.3
        };

        return multipliers[contentType] || 1;
    }

    private parseCapacity(capacity: string): number {
        const num = parseInt(capacity.replace(/[^0-9]/g, ''));
        if (capacity.toLowerCase().includes('gb')) {
            return num * 1024 * 1024 * 1024;
        }
        if (capacity.toLowerCase().includes('mb')) {
            return num * 1024 * 1024;
        }
        return num * 1024 * 1024 * 1024;
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ============================================
    // 🔧 MÉTODOS PÚBLICOS DE CONTROL
    // ============================================

    async pauseJob(jobId: string): Promise<void> {
        const job = this.activeJobs.get(jobId);
        if (job) {
            await this.updateJobStatus(job, 'paused');
            console.log(`⏸️ Trabajo pausado: ${jobId}`);
        }
    }

    async resumeJob(jobId: string): Promise<void> {
        const job = this.getJobById(jobId);
        if (job && job.status === 'paused') {
            this.addToQueue(job);
            console.log(`▶️ Trabajo reanudado: ${jobId}`);
        }
    }

    async cancelJob(jobId: string, reason?: string): Promise<void> {
        const job = this.activeJobs.get(jobId) || this.jobQueue.find(j => j.id === jobId);
        
        if (job) {
            job.updateStatus('cancelled', reason || 'Cancelado por usuario');
            
            this.activeJobs.delete(jobId);
            this.jobQueue = this.jobQueue.filter(j => j.id !== jobId);

            if (job.assignedUSB) {
                this.usbDetector.releaseDevice(job.assignedUSB);
            }

            await this.dbService.updateJob(job);
            await this.notificationService.sendJobCancelled(job);

            console.log(`❌ Trabajo cancelado: ${jobId}`);
        }
    }

    async retryJob(jobId: string): Promise<void> {
        const job = this.failedJobs.get(jobId);
        
        if (job) {
            this.failedJobs.delete(jobId);
            job.updateStatus('pending');
            job.failureReason = undefined;
            job.failedAt = undefined;
            
            this.addToQueue(job);
            console.log(`🔄 Reintentando trabajo: ${jobId}`);
        }
    }

    clearQueue(): void {
        this.jobQueue = [];
        console.log('🧹 Cola de trabajos limpiada');
    }

    async shutdown(): Promise<void> {
        console.log('🛑 Iniciando shutdown del orchestrator...');

        this.stopAutoProcessing();

        console.log(`⏳ Esperando ${this.activeJobs.size} trabajos activos...`);
        
        const timeout = 5 * 60 * 1000;
        const startTime = Date.now();

        while (this.activeJobs.size > 0 && Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await this.backupMetrics();

        console.log('✅ Orchestrator apagado correctamente');
        this.emit('orchestrator:shutdown');
    }
}
