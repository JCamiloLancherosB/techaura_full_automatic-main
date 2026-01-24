/**
 * Processing Job Service
 * Business logic for managing processing jobs
 */

import { 
    processingJobRepository, 
    ProcessingJob, 
    ProcessingJobFilter,
    JobStatus 
} from '../repositories/ProcessingJobRepository';
import { jobLogRepository, JobLog } from '../repositories/JobLogRepository';
import { cacheService } from './CacheService';

export interface JobWithLogs extends ProcessingJob {
    logs?: JobLog[];
    errorSummary?: {
        total: number;
        by_category: Array<{ category: string; count: number }>;
        by_error_code: Array<{ error_code: string; count: number }>;
    };
}

export interface JobListResponse {
    jobs: ProcessingJob[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export class ProcessingJobService {
    /**
     * Get job by ID with optional logs
     */
    async getJobById(id: number, includeLogs: boolean = false): Promise<JobWithLogs | null> {
        const job = await processingJobRepository.getById(id);
        
        if (!job) {
            return null;
        }
        
        const result: JobWithLogs = { ...job };
        
        if (includeLogs) {
            result.logs = await jobLogRepository.getByJobId(id, 100);
            
            if (job.status === 'failed' || job.status === 'done') {
                result.errorSummary = await jobLogRepository.getErrorSummary(id);
            }
        }
        
        return result;
    }
    
    /**
     * Get jobs by order ID
     */
    async getJobsByOrderId(orderId: string): Promise<ProcessingJob[]> {
        const job = await processingJobRepository.getByOrderId(orderId);
        return job ? [job] : [];
    }
    
    /**
     * List jobs with pagination
     */
    async listJobs(
        filter: ProcessingJobFilter = {},
        page: number = 1,
        limit: number = 50
    ): Promise<JobListResponse> {
        const jobs = await processingJobRepository.list(filter, limit);
        
        // For simplicity, we don't have a count method yet, so we estimate
        const total = jobs.length;
        const totalPages = Math.ceil(total / limit);
        
        return {
            jobs,
            total,
            page,
            limit,
            totalPages
        };
    }
    
    /**
     * Get active jobs (processing, writing, verifying)
     */
    async getActiveJobs(): Promise<ProcessingJob[]> {
        return processingJobRepository.list({
            status: ['processing', 'writing', 'verifying']
        }, 100);
    }
    
    /**
     * Get pending jobs (queued)
     */
    async getPendingJobs(): Promise<ProcessingJob[]> {
        return processingJobRepository.list({
            status: 'pending'
        }, 100);
    }
    
    /**
     * Get failed jobs
     */
    async getFailedJobs(limit: number = 50): Promise<JobWithLogs[]> {
        const jobs = await processingJobRepository.list({
            status: 'failed'
        }, limit);
        
        // Get error summaries for failed jobs
        const jobsWithErrors = await Promise.all(
            jobs.map(async (job) => {
                const errorSummary = await jobLogRepository.getErrorSummary(job.id!);
                return { ...job, errorSummary };
            })
        );
        
        return jobsWithErrors;
    }
    
    /**
     * Get job statistics
     */
    async getStatistics() {
        return processingJobRepository.getStatistics();
    }
    
    /**
     * Get job logs
     */
    async getJobLogs(jobId: number, limit: number = 100): Promise<JobLog[]> {
        return jobLogRepository.getByJobId(jobId, limit);
    }
    
    /**
     * Get job error summary
     */
    async getJobErrorSummary(jobId: number) {
        return jobLogRepository.getErrorSummary(jobId);
    }
    
    /**
     * Create a new processing job
     */
    async createJob(job: Omit<ProcessingJob, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const jobId = await processingJobRepository.create(job);
        // Invalidate job and dashboard caches
        cacheService.invalidateJob(jobId);
        return jobId;
    }
    
    /**
     * Update job progress
     */
    async updateProgress(id: number, progress: number, message?: string): Promise<void> {
        await processingJobRepository.updateProgress(id, progress, message);
        // Invalidate job cache
        cacheService.invalidateJob(id);
    }
    
    /**
     * Mark job as failed
     */
    async markAsFailed(id: number, reason: string, errorDetails?: any): Promise<void> {
        await processingJobRepository.markAsFailed(id, reason, errorDetails);
        // Invalidate job cache
        cacheService.invalidateJob(id);
    }
    
    /**
     * Mark job as completed
     */
    async markAsCompleted(id: number): Promise<void> {
        await processingJobRepository.markAsCompleted(id);
        // Invalidate job cache
        cacheService.invalidateJob(id);
    }
    
    /**
     * Get real-time job status summary for dashboard
     */
    async getJobStatusSummary(): Promise<{
        active: number;
        pending: number;
        completed_today: number;
        failed_today: number;
        total_today: number;
    }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [active, pending, todayJobs] = await Promise.all([
            processingJobRepository.list({ status: ['processing', 'writing', 'verifying'] }, 1000),
            processingJobRepository.list({ status: 'pending' }, 1000),
            processingJobRepository.list({ date_from: today }, 1000)
        ]);
        
        const completedToday = todayJobs.filter(j => j.status === 'done').length;
        const failedToday = todayJobs.filter(j => j.status === 'failed').length;
        
        return {
            active: active.length,
            pending: pending.length,
            completed_today: completedToday,
            failed_today: failedToday,
            total_today: todayJobs.length
        };
    }
    
    /**
     * Create job log with correlation ID support
     * This is a helper method for logging job events with observability
     */
    async createJobLog(
        jobId: number,
        level: 'debug' | 'info' | 'warning' | 'error',
        category: string,
        message: string,
        options?: {
            details?: any;
            file_path?: string;
            file_size?: number;
            error_code?: string;
            correlation_id?: string;
        }
    ): Promise<number> {
        return jobLogRepository.create({
            job_id: jobId,
            level,
            category,
            message,
            details: options?.details,
            file_path: options?.file_path,
            file_size: options?.file_size,
            error_code: options?.error_code,
            correlation_id: options?.correlation_id,
        });
    }
    
    /**
     * Get logs by correlation ID (for end-to-end tracing)
     */
    async getLogsByCorrelationId(correlationId: string): Promise<JobLog[]> {
        return jobLogRepository.getByCorrelationId(correlationId);
    }
    
    // ============================================
    // LEASE-BASED JOB PROCESSING
    // ============================================
    
    /**
     * Acquire a lease on an available job for processing
     */
    async acquireLease(workerId: string, leaseDurationSeconds: number = 300): Promise<JobWithLogs | null> {
        return processingJobRepository.acquireLease(workerId, leaseDurationSeconds);
    }
    
    /**
     * Release a lease when job completes or fails
     */
    async releaseLease(jobId: number, workerId: string, status: JobStatus, error?: string): Promise<void> {
        return processingJobRepository.releaseLease(jobId, workerId, status, error);
    }
    
    /**
     * Extend an existing lease
     */
    async extendLease(jobId: number, workerId: string, additionalSeconds: number = 300): Promise<boolean> {
        return processingJobRepository.extendLease(jobId, workerId, additionalSeconds);
    }
    
    /**
     * Reset expired leases (should be called on worker startup)
     */
    async resetExpiredLeases(): Promise<number> {
        return processingJobRepository.resetExpiredLeases();
    }
    
    /**
     * Get jobs with active leases (for monitoring)
     */
    async getActiveLeases() {
        return processingJobRepository.getActiveLeases();
    }
    
    /**
     * Get jobs with expired leases (for monitoring)
     */
    async getExpiredLeases() {
        return processingJobRepository.getExpiredLeases();
    }
}

// Export singleton instance
export const processingJobService = new ProcessingJobService();
