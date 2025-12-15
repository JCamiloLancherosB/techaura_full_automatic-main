/**
 * Enhanced Auto-Processor with improved error handling and monitoring
 * Provides better data validation, retry logic, and failure recovery
 */

import { EventEmitter } from 'events';
import { businessDB } from '../mysql-database';
import type { CustomerOrder } from '../../types/global';

export interface ProcessingJob {
    id: number;
    orderNumber: string;
    customerPhone: string;
    orderData: CustomerOrder;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
    priority: 'high' | 'medium' | 'low';
    attempts: number;
    maxAttempts: number;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProcessingResult {
    success: boolean;
    jobId: number;
    message: string;
    error?: string;
    metrics?: {
        processingTime: number;
        filesProcessed: number;
        bytesProcessed: number;
    };
}

export class EnhancedAutoProcessor extends EventEmitter {
    private static instance: EnhancedAutoProcessor;
    private processingQueue: Map<number, ProcessingJob> = new Map();
    private isProcessing = false;
    private readonly MAX_CONCURRENT = 3;
    private activeJobs = 0;
    private readonly RETRY_DELAYS = [5000, 15000, 60000]; // 5s, 15s, 1min

    static getInstance(): EnhancedAutoProcessor {
        if (!EnhancedAutoProcessor.instance) {
            EnhancedAutoProcessor.instance = new EnhancedAutoProcessor();
        }
        return EnhancedAutoProcessor.instance;
    }

    private constructor() {
        super();
        this.initializeProcessor();
    }

    /**
     * Initialize processor and start monitoring
     */
    private initializeProcessor(): void {
        console.log('🔧 Initializing enhanced auto-processor...');

        // Start processing loop
        this.startProcessingLoop();

        // Monitor stuck jobs
        setInterval(() => this.monitorStuckJobs(), 60000); // Every minute

        console.log('✅ Enhanced auto-processor initialized');
    }

    /**
     * Add a job to the processing queue with validation
     */
    async addJob(orderData: CustomerOrder, priority: 'high' | 'medium' | 'low' = 'medium'): Promise<ProcessingResult> {
        try {
            // Validate order data
            const validation = this.validateOrderData(orderData);
            if (!validation.isValid) {
                console.error('❌ Invalid order data:', validation.errors);
                return {
                    success: false,
                    jobId: -1,
                    message: 'Invalid order data',
                    error: validation.errors.join(', ')
                };
            }

            // Create processing job
            const job: Omit<ProcessingJob, 'id'> = {
                orderNumber: orderData.orderNumber || this.generateOrderNumber(),
                customerPhone: orderData.customerPhone,
                orderData,
                status: 'pending',
                priority,
                attempts: 0,
                maxAttempts: 3,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Save to database
            const jobId = await this.saveJobToDB(job);

            // Add to queue
            const fullJob = { ...job, id: jobId };
            this.processingQueue.set(jobId, fullJob as ProcessingJob);

            console.log(`✅ Job ${jobId} added to queue (priority: ${priority})`);
            this.emit('job_added', fullJob);

            // Trigger processing
            this.processQueue();

            return {
                success: true,
                jobId,
                message: 'Job queued successfully'
            };
        } catch (error: any) {
            console.error('❌ Error adding job:', error);
            return {
                success: false,
                jobId: -1,
                message: 'Failed to add job',
                error: error.message
            };
        }
    }

    /**
     * Validate order data before processing
     */
    private validateOrderData(orderData: any): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!orderData) {
            errors.push('Order data is null or undefined');
            return { isValid: false, errors };
        }

        if (!orderData.customerPhone || typeof orderData.customerPhone !== 'string') {
            errors.push('Invalid customer phone');
        }

        if (!orderData.customization) {
            errors.push('Missing customization data');
        } else {
            const { genres, artists, videos, movies } = orderData.customization;
            const hasContent = (genres && genres.length > 0) ||
                             (artists && artists.length > 0) ||
                             (videos && videos.length > 0) ||
                             (movies && movies.length > 0);

            if (!hasContent) {
                errors.push('No content specified in customization');
            }
        }

        if (!orderData.capacity) {
            errors.push('Missing capacity information');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Process a single job with error handling
     */
    private async processJob(job: ProcessingJob): Promise<ProcessingResult> {
        const startTime = Date.now();

        try {
            console.log(`🔄 Processing job ${job.id} (attempt ${job.attempts + 1}/${job.maxAttempts})`);

            // Update status
            job.status = 'processing';
            job.attempts++;
            job.updatedAt = new Date();
            await this.updateJobInDB(job);

            this.emit('job_started', job);

            // Simulate processing (replace with actual processing logic)
            await this.executeProcessing(job);

            // Update success status
            job.status = 'completed';
            job.updatedAt = new Date();
            await this.updateJobInDB(job);

            const processingTime = Date.now() - startTime;

            console.log(`✅ Job ${job.id} completed in ${processingTime}ms`);
            this.emit('job_completed', job);

            return {
                success: true,
                jobId: job.id,
                message: 'Job processed successfully',
                metrics: {
                    processingTime,
                    filesProcessed: 0, // TODO: Add actual metrics
                    bytesProcessed: 0
                }
            };
        } catch (error: any) {
            console.error(`❌ Error processing job ${job.id}:`, error);

            job.error = error.message;
            job.updatedAt = new Date();

            // Determine if should retry
            if (job.attempts < job.maxAttempts) {
                job.status = 'retry';
                await this.updateJobInDB(job);

                // Schedule retry
                const delay = this.RETRY_DELAYS[job.attempts - 1] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
                setTimeout(() => {
                    console.log(`🔄 Retrying job ${job.id} after ${delay}ms`);
                    this.processQueue();
                }, delay);

                this.emit('job_retry', job);
            } else {
                job.status = 'failed';
                await this.updateJobInDB(job);
                this.emit('job_failed', job);
            }

            return {
                success: false,
                jobId: job.id,
                message: 'Job processing failed',
                error: error.message
            };
        } finally {
            this.activeJobs--;
        }
    }

    /**
     * Execute the actual processing logic
     */
    private async executeProcessing(job: ProcessingJob): Promise<void> {
        // TODO: Implement actual processing logic
        // This is where you would:
        // 1. Prepare USB content
        // 2. Copy files
        // 3. Organize folders
        // 4. Notify customer
        
        // Simulate processing time
        await this.delay(2000);

        // For now, just log
        console.log(`📦 Processing order ${job.orderNumber} for ${job.customerPhone}`);
    }

    /**
     * Start the processing loop
     */
    private startProcessingLoop(): void {
        setInterval(() => {
            if (!this.isProcessing && this.activeJobs < this.MAX_CONCURRENT) {
                this.processQueue();
            }
        }, 5000); // Check every 5 seconds
    }

    /**
     * Process jobs from queue
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.activeJobs >= this.MAX_CONCURRENT) {
            return;
        }

        this.isProcessing = true;

        try {
            // Get jobs sorted by priority and creation time
            const jobs = Array.from(this.processingQueue.values())
                .filter(job => job.status === 'pending' || job.status === 'retry')
                .sort((a, b) => {
                    // Priority: high > medium > low
                    const priorityOrder = { high: 3, medium: 2, low: 1 };
                    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
                    if (priorityDiff !== 0) return priorityDiff;

                    // Then by creation time (older first)
                    return a.createdAt.getTime() - b.createdAt.getTime();
                });

            // Process available jobs
            const availableSlots = this.MAX_CONCURRENT - this.activeJobs;
            const jobsToProcess = jobs.slice(0, availableSlots);

            for (const job of jobsToProcess) {
                this.activeJobs++;
                this.processJob(job).catch(error => {
                    console.error(`❌ Unhandled error in job ${job.id}:`, error);
                    this.activeJobs--;
                });
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Monitor and handle stuck jobs
     */
    private async monitorStuckJobs(): Promise<void> {
        const now = Date.now();
        const STUCK_THRESHOLD = 5 * 60 * 1000; // 5 minutes

        for (const job of this.processingQueue.values()) {
            if (job.status === 'processing') {
                const timeSinceUpdate = now - job.updatedAt.getTime();
                
                if (timeSinceUpdate > STUCK_THRESHOLD) {
                    console.warn(`⚠️ Job ${job.id} appears stuck, marking for retry`);
                    job.status = 'retry';
                    job.error = 'Job stuck - exceeded time threshold';
                    await this.updateJobInDB(job);
                    this.activeJobs = Math.max(0, this.activeJobs - 1);
                }
            }
        }
    }

    /**
     * Generate order number
     */
    private generateOrderNumber(): string {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `ORD-${timestamp}-${random}`;
    }

    /**
     * Save job to database
     */
    private async saveJobToDB(job: Omit<ProcessingJob, 'id'>): Promise<number> {
        try {
            if (typeof (businessDB as any).createProcessingJob === 'function') {
                return await (businessDB as any).createProcessingJob(job);
            }
            // Fallback: use in-memory ID
            return Date.now();
        } catch (error) {
            console.error('❌ Error saving job to DB:', error);
            return Date.now();
        }
    }

    /**
     * Update job in database
     */
    private async updateJobInDB(job: ProcessingJob): Promise<void> {
        try {
            if (typeof (businessDB as any).updateProcessingJob === 'function') {
                await (businessDB as any).updateProcessingJob(job);
            }
        } catch (error) {
            console.error('❌ Error updating job in DB:', error);
        }
    }

    /**
     * Get queue status
     */
    getQueueStatus() {
        const jobs = Array.from(this.processingQueue.values());

        return {
            total: jobs.length,
            pending: jobs.filter(j => j.status === 'pending').length,
            processing: jobs.filter(j => j.status === 'processing').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            retry: jobs.filter(j => j.status === 'retry').length,
            activeJobs: this.activeJobs,
            maxConcurrent: this.MAX_CONCURRENT
        };
    }

    /**
     * Get job by ID
     */
    getJob(jobId: number): ProcessingJob | undefined {
        return this.processingQueue.get(jobId);
    }

    /**
     * Cancel a job
     */
    async cancelJob(jobId: number): Promise<boolean> {
        const job = this.processingQueue.get(jobId);
        if (!job) return false;

        if (job.status === 'processing') {
            console.warn(`⚠️ Cannot cancel job ${jobId} - currently processing`);
            return false;
        }

        this.processingQueue.delete(jobId);
        console.log(`🗑️ Job ${jobId} cancelled`);
        this.emit('job_cancelled', job);
        return true;
    }

    /**
     * Retry a failed job
     */
    async retryJob(jobId: number): Promise<boolean> {
        const job = this.processingQueue.get(jobId);
        if (!job) return false;

        if (job.status !== 'failed') {
            console.warn(`⚠️ Job ${jobId} is not in failed state`);
            return false;
        }

        job.status = 'retry';
        job.attempts = 0;
        job.error = undefined;
        job.updatedAt = new Date();

        await this.updateJobInDB(job);
        this.processQueue();

        console.log(`🔄 Job ${jobId} queued for retry`);
        return true;
    }

    /**
     * Helper: delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const enhancedAutoProcessor = EnhancedAutoProcessor.getInstance();
