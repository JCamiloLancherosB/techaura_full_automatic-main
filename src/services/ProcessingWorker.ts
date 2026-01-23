/**
 * Processing Worker with Lease-based Job Recovery
 * 
 * This worker implements a lease-based system to ensure jobs can be recovered
 * if the bot crashes during processing. Key features:
 * - Atomically acquires leases on jobs
 * - Extends leases for long-running jobs
 * - Releases leases on completion
 * - Resets expired leases on startup
 */

import { EventEmitter } from 'events';
import { processingJobService } from './ProcessingJobService';
import { ProcessingJob, JobStatus } from '../repositories/ProcessingJobRepository';
import * as os from 'os';

export interface WorkerConfig {
    workerId?: string;
    leaseDurationSeconds?: number;
    pollIntervalMs?: number;
    maxConcurrentJobs?: number;
    leaseExtensionThresholdPercent?: number;
}

export class ProcessingWorker extends EventEmitter {
    private workerId: string;
    private leaseDurationSeconds: number;
    private pollIntervalMs: number;
    private maxConcurrentJobs: number;
    private leaseExtensionThresholdPercent: number;
    
    private isRunning: boolean = false;
    private pollTimer: NodeJS.Timeout | null = null;
    private activeJobs: Map<number, ProcessingJob> = new Map();
    private leaseExtensionTimers: Map<number, NodeJS.Timeout> = new Map();
    
    constructor(config: WorkerConfig = {}) {
        super();
        
        // Generate unique worker ID based on hostname and PID
        this.workerId = config.workerId || `worker-${os.hostname()}-${process.pid}`;
        this.leaseDurationSeconds = config.leaseDurationSeconds || 300; // 5 minutes default
        this.pollIntervalMs = config.pollIntervalMs || 5000; // 5 seconds default
        this.maxConcurrentJobs = config.maxConcurrentJobs || 1;
        this.leaseExtensionThresholdPercent = config.leaseExtensionThresholdPercent || 50; // Extend at 50% of lease time
    }
    
    /**
     * Start the worker
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log(`⚠️  Worker ${this.workerId} is already running`);
            return;
        }
        
        console.log(`🚀 Starting worker ${this.workerId}...`);
        
        // Reset expired leases on startup
        try {
            const resetCount = await processingJobService.resetExpiredLeases();
            if (resetCount > 0) {
                console.log(`🔄 Reset ${resetCount} expired leases on startup`);
            }
        } catch (error) {
            console.error('❌ Error resetting expired leases:', error);
        }
        
        this.isRunning = true;
        this.emit('worker:started', { workerId: this.workerId });
        
        // Start polling for jobs
        this.startPolling();
        
        // Set up graceful shutdown
        this.setupGracefulShutdown();
        
        console.log(`✅ Worker ${this.workerId} started successfully`);
    }
    
    /**
     * Stop the worker
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        console.log(`🛑 Stopping worker ${this.workerId}...`);
        
        this.isRunning = false;
        
        // Stop polling
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        
        // Clear all lease extension timers
        for (const timer of this.leaseExtensionTimers.values()) {
            clearTimeout(timer);
        }
        this.leaseExtensionTimers.clear();
        
        // Wait for active jobs to complete or release their leases
        if (this.activeJobs.size > 0) {
            console.log(`⏳ Waiting for ${this.activeJobs.size} active jobs to complete...`);
            
            // Give jobs up to 30 seconds to finish gracefully
            const timeout = new Promise((resolve) => setTimeout(resolve, 30000));
            const jobsComplete = new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.activeJobs.size === 0) {
                        clearInterval(checkInterval);
                        resolve(undefined);
                    }
                }, 1000);
            });
            
            await Promise.race([timeout, jobsComplete]);
            
            // Release any remaining leases
            for (const [jobId, job] of this.activeJobs.entries()) {
                try {
                    await processingJobService.releaseLease(
                        jobId,
                        this.workerId,
                        'retry',
                        'Worker shutdown before job completion'
                    );
                    console.log(`🔓 Released lease for job ${jobId}`);
                } catch (error) {
                    console.error(`❌ Error releasing lease for job ${jobId}:`, error);
                }
            }
            
            this.activeJobs.clear();
        }
        
        this.emit('worker:stopped', { workerId: this.workerId });
        console.log(`✅ Worker ${this.workerId} stopped`);
    }
    
    /**
     * Start polling for available jobs
     */
    private startPolling(): void {
        const poll = async () => {
            if (!this.isRunning) {
                return;
            }
            
            try {
                // Check if we can take more jobs
                if (this.activeJobs.size >= this.maxConcurrentJobs) {
                    this.pollTimer = setTimeout(poll, this.pollIntervalMs);
                    return;
                }
                
                // Try to acquire a job
                const job = await processingJobService.acquireLease(
                    this.workerId,
                    this.leaseDurationSeconds
                );
                
                if (job && job.id) {
                    console.log(`📋 Acquired job ${job.id} (order: ${job.order_id})`);
                    this.activeJobs.set(job.id, job);
                    
                    // Start processing the job
                    this.processJob(job).catch((error) => {
                        console.error(`❌ Error processing job ${job.id}:`, error);
                    });
                    
                    // Set up lease extension
                    this.setupLeaseExtension(job);
                }
                
            } catch (error) {
                console.error('❌ Error in polling loop:', error);
            }
            
            // Schedule next poll
            this.pollTimer = setTimeout(poll, this.pollIntervalMs);
        };
        
        // Start polling
        poll();
    }
    
    /**
     * Process a job (override this method in subclasses for actual processing logic)
     */
    protected async processJob(job: ProcessingJob): Promise<void> {
        const jobId = job.id!;
        
        try {
            console.log(`⚙️  Processing job ${jobId} (attempt ${job.attempts})...`);
            
            this.emit('job:started', { job });
            
            // TODO: Implement actual job processing logic here
            // This is a placeholder that simulates work
            
            // Log progress
            await processingJobService.updateProgress(jobId, 25, 'Starting job processing');
            
            // Simulate some work
            await this.sleep(2000);
            
            await processingJobService.updateProgress(jobId, 50, 'Processing content');
            
            await this.sleep(2000);
            
            await processingJobService.updateProgress(jobId, 75, 'Finalizing');
            
            await this.sleep(2000);
            
            await processingJobService.updateProgress(jobId, 100, 'Completed');
            
            // Mark as completed and release lease
            await processingJobService.releaseLease(jobId, this.workerId, 'done');
            
            console.log(`✅ Job ${jobId} completed successfully`);
            this.emit('job:completed', { job });
            
        } catch (error: any) {
            console.error(`❌ Job ${jobId} failed:`, error);
            
            // Mark as failed and release lease
            await processingJobService.releaseLease(
                jobId,
                this.workerId,
                job.attempts && job.attempts >= 3 ? 'failed' : 'retry',
                error.message
            );
            
            this.emit('job:failed', { job, error });
            
        } finally {
            // Clean up
            this.activeJobs.delete(jobId);
            
            const timer = this.leaseExtensionTimers.get(jobId);
            if (timer) {
                clearTimeout(timer);
                this.leaseExtensionTimers.delete(jobId);
            }
        }
    }
    
    /**
     * Set up automatic lease extension for long-running jobs
     */
    private setupLeaseExtension(job: ProcessingJob): void {
        if (!job.id) return;
        
        const jobId = job.id;
        
        // Calculate when to extend (at threshold % of lease duration)
        const extendAt = (this.leaseDurationSeconds * 1000 * this.leaseExtensionThresholdPercent) / 100;
        
        const timer = setTimeout(async () => {
            // Check if job is still active
            if (!this.activeJobs.has(jobId)) {
                return;
            }
            
            try {
                const extended = await processingJobService.extendLease(
                    jobId,
                    this.workerId,
                    this.leaseDurationSeconds
                );
                
                if (extended) {
                    console.log(`🔄 Extended lease for job ${jobId}`);
                    // Set up next extension
                    this.setupLeaseExtension(job);
                } else {
                    console.warn(`⚠️  Failed to extend lease for job ${jobId} - may have expired`);
                }
            } catch (error) {
                console.error(`❌ Error extending lease for job ${jobId}:`, error);
            }
        }, extendAt);
        
        this.leaseExtensionTimers.set(jobId, timer);
    }
    
    /**
     * Set up graceful shutdown handlers
     */
    private setupGracefulShutdown(): void {
        const shutdown = async (signal: string) => {
            console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
            await this.stop();
            process.exit(0);
        };
        
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    
    /**
     * Utility method to sleep
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    
    /**
     * Get worker status
     */
    getStatus() {
        return {
            workerId: this.workerId,
            isRunning: this.isRunning,
            activeJobs: this.activeJobs.size,
            maxConcurrentJobs: this.maxConcurrentJobs,
            leaseDurationSeconds: this.leaseDurationSeconds,
            activeJobIds: Array.from(this.activeJobs.keys())
        };
    }
}

// Export a singleton instance
export const processingWorker = new ProcessingWorker();
