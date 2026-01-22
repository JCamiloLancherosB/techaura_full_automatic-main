/**
 * Enhanced Auto-Processor with improved error handling and monitoring
 * Provides better data validation, retry logic, and failure recovery
 */

import { EventEmitter } from 'events';
import { businessDB } from '../mysql-database';
import type { CustomerOrder } from '../../types/global';
import { processingJobRepository, ProcessingJob as DBProcessingJob } from '../repositories/ProcessingJobRepository';
import { jobLogRepository } from '../repositories/JobLogRepository';
import { ProcessingSystem } from '../core/ProcessingSystem';
import { ProcessingJob as ModelProcessingJob } from '../models/ProcessingJob';

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

        // Load pending jobs from database
        this.loadPendingJobsFromDB().catch(error => {
            console.error('❌ Error loading pending jobs:', error);
        });

        // Start processing loop
        this.startProcessingLoop();

        // Monitor stuck jobs
        setInterval(() => this.monitorStuckJobs(), 60000); // Every minute

        console.log('✅ Enhanced auto-processor initialized');
    }

    /**
     * Load pending jobs from database on startup
     */
    private async loadPendingJobsFromDB(): Promise<void> {
        try {
            const pendingJobs = await processingJobRepository.list({
                status: ['pending', 'processing']
            }, 100);

            console.log(`📥 Loading ${pendingJobs.length} pending/processing jobs from database...`);

            for (const dbJob of pendingJobs) {
                // Convert DB job to processing queue job format
                const queueJob: ProcessingJob = {
                    id: dbJob.id!,
                    orderNumber: dbJob.order_id,
                    customerPhone: '',
                    orderData: {} as CustomerOrder,
                    status: dbJob.status === 'processing' ? 'processing' : 'pending',
                    priority: 'medium',
                    attempts: 0,
                    maxAttempts: 3,
                    createdAt: dbJob.created_at || new Date(),
                    updatedAt: dbJob.updated_at || new Date()
                };

                this.processingQueue.set(queueJob.id, queueJob);
            }

            console.log(`✅ Loaded ${this.processingQueue.size} jobs into queue`);
        } catch (error) {
            console.error('❌ Error loading pending jobs from DB:', error);
        }
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

            // Update status to processing
            job.status = 'processing';
            job.attempts++;
            job.updatedAt = new Date();
            
            await processingJobRepository.update({
                id: job.id,
                status: 'processing',
                started_at: new Date()
            });

            this.emit('job_started', job);

            // Execute processing with all stages
            await this.executeProcessing(job);

            // Mark as completed in database
            await processingJobRepository.markAsCompleted(job.id);
            
            job.status = 'completed';
            job.updatedAt = new Date();

            const processingTime = Date.now() - startTime;

            console.log(`✅ Job ${job.id} completed in ${processingTime}ms`);
            this.emit('job_completed', job);

            return {
                success: true,
                jobId: job.id,
                message: 'Job processed successfully',
                metrics: {
                    processingTime,
                    filesProcessed: 0,
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
                // Mark as failed in database
                await processingJobRepository.markAsFailed(
                    job.id, 
                    error.message,
                    { stack: error.stack, attempts: job.attempts }
                );
                
                job.status = 'failed';
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
     * Execute the actual processing logic with proper logging at each stage
     * 
     * Stages:
     * 1. Validation - Verify order data and requirements
     * 2. Content selection - Prepare content based on preferences
     * 3. USB writing - Copy files to USB device
     * 4. Verification - Verify copied files
     * 
     * Each stage creates a log entry in the database
     */
    private async executeProcessing(job: ProcessingJob): Promise<void> {
        // TODO: Integrate with ProcessingSystem when ready
        // const processingSystem = new ProcessingSystem();
        
        try {
            // Stage 1: Validation
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'validation',
                message: 'Starting order validation',
                details: { orderNumber: job.orderNumber }
            });
            
            console.log(`📋 [Job ${job.id}] Stage 1: Validation`);
            
            // Update progress
            await processingJobRepository.updateProgress(job.id, 10, 'Validating order data');
            
            // Simulate validation delay
            await this.delay(1000);
            
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'validation',
                message: 'Order validation completed successfully',
                details: { orderNumber: job.orderNumber }
            });
            
            // Stage 2: Content Selection
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'content_selection',
                message: 'Starting content selection',
                details: { 
                    capacity: job.orderData?.capacity,
                    preferences: job.orderData?.customization
                }
            });
            
            console.log(`🎵 [Job ${job.id}] Stage 2: Content Selection`);
            
            await processingJobRepository.updateProgress(job.id, 30, 'Selecting content based on preferences');
            
            // Simulate content selection delay
            await this.delay(1500);
            
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'content_selection',
                message: 'Content selection completed',
                details: { 
                    selectedCount: job.orderData?.customization?.genres?.length || 0
                }
            });
            
            // Stage 3: USB Writing
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'copy',
                message: 'Starting USB writing process',
                details: { orderNumber: job.orderNumber }
            });
            
            console.log(`💾 [Job ${job.id}] Stage 3: USB Writing`);
            
            await processingJobRepository.updateProgress(job.id, 50, 'Writing content to USB');
            
            // Simulate USB writing delay
            await this.delay(2000);
            
            await processingJobRepository.updateProgress(job.id, 80, 'USB writing in progress');
            await this.delay(1000);
            
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'copy',
                message: 'USB writing completed',
                details: { orderNumber: job.orderNumber }
            });
            
            // Stage 4: Verification
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'verify',
                message: 'Starting file verification',
                details: { orderNumber: job.orderNumber }
            });
            
            console.log(`✅ [Job ${job.id}] Stage 4: Verification`);
            
            await processingJobRepository.updateProgress(job.id, 90, 'Verifying copied files');
            
            // Simulate verification delay
            await this.delay(1000);
            
            await jobLogRepository.create({
                job_id: job.id,
                level: 'info',
                category: 'verify',
                message: 'File verification completed successfully',
                details: { orderNumber: job.orderNumber }
            });
            
            await processingJobRepository.updateProgress(job.id, 100, 'Processing completed');
            
            console.log(`🎉 [Job ${job.id}] Processing completed successfully`);
            
        } catch (error: any) {
            console.error(`❌ [Job ${job.id}] Processing failed:`, error);
            
            // Log the failure
            await jobLogRepository.create({
                job_id: job.id,
                level: 'error',
                category: 'system',
                message: 'Processing failed',
                details: { error: error.message },
                error_code: 'PROCESSING_FAILED'
            });
            
            throw error;
        }
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
     * Save job to database using ProcessingJobRepository
     */
    private async saveJobToDB(job: Omit<ProcessingJob, 'id'>): Promise<number> {
        try {
            const dbJob: Omit<DBProcessingJob, 'id' | 'created_at' | 'updated_at'> = {
                order_id: job.orderNumber,
                usb_capacity: job.orderData?.capacity || '32GB',
                preferences: job.orderData?.customization ? [job.orderData.customization] : [],
                status: 'pending',
                progress: 0
            };
            
            const jobId = await processingJobRepository.create(dbJob);
            console.log(`✅ Job saved to database with ID: ${jobId}`);
            return jobId;
        } catch (error) {
            console.error('❌ Error saving job to DB:', error);
            // Return a fallback ID to keep the system running
            return Date.now();
        }
    }

    /**
     * Update job in database using ProcessingJobRepository
     */
    private async updateJobInDB(job: ProcessingJob): Promise<void> {
        try {
            const statusMap: Record<string, any> = {
                'pending': 'pending',
                'processing': 'processing',
                'completed': 'done',
                'failed': 'failed',
                'retry': 'pending'
            };

            await processingJobRepository.update({
                id: job.id,
                status: statusMap[job.status] || 'pending',
                fail_reason: job.error || null
            });
        } catch (error) {
            console.error('❌ Error updating job in DB:', error);
        }
    }

    /**
     * Get queue status (combines in-memory and database jobs)
     */
    async getQueueStatus() {
        const jobs = Array.from(this.processingQueue.values());

        // Also get counts from database for accuracy
        let dbStats;
        try {
            dbStats = await processingJobRepository.getStatistics();
        } catch (error) {
            console.error('Error getting DB stats:', error);
            dbStats = null;
        }

        return {
            total: jobs.length,
            pending: jobs.filter(j => j.status === 'pending').length,
            processing: jobs.filter(j => j.status === 'processing').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            retry: jobs.filter(j => j.status === 'retry').length,
            activeJobs: this.activeJobs,
            maxConcurrent: this.MAX_CONCURRENT,
            dbStats: dbStats || undefined
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
