/**
 * Repository for processing_jobs table
 * Handles CRUD operations for processing jobs with proper typing
 */

import { pool } from '../mysql-database';
import { jobLogRepository, JobLog } from './JobLogRepository';
import { toSafeInt } from '../utils/numberUtils';

export type JobStatus = 'pending' | 'processing' | 'writing' | 'verifying' | 'done' | 'failed' | 'retry' | 'canceled';

export interface ProcessingJob {
    id?: number;
    job_id?: string;
    order_id: string;
    usb_capacity: string;
    content_plan_id?: string;
    preferences?: any;
    volume_label?: string;
    assigned_device_id?: string | null;
    status: JobStatus;
    progress: number;
    fail_reason?: string | null;
    started_at?: Date | null;
    finished_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
    // Lease-based fields
    locked_by?: string | null;
    locked_until?: Date | null;
    attempts?: number;
    last_error?: string | null;
}

export interface ProcessingJobFilter {
    status?: JobStatus | JobStatus[];
    order_id?: string;
    assigned_device_id?: string;
    date_from?: Date;
    date_to?: Date;
}

export interface ProcessingJobUpdate {
    id: number;
    status?: JobStatus;
    progress?: number;
    fail_reason?: string | null;
    assigned_device_id?: string | null;
    started_at?: Date | null;
    finished_at?: Date | null;
    volume_label?: string | null;
}

export class ProcessingJobRepository {
    /**
     * Create a new processing job
     */
    async create(job: Omit<ProcessingJob, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const jobId = job.job_id || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Map v2 status to v1 for storage (maintaining compatibility)
        const v1Status = this.mapStatusToV1(job.status);
        
        const sql = `
            INSERT INTO processing_jobs 
            (job_id, order_id, customer_phone, customer_name, capacity, content_type, 
             preferences, content_list, customizations, status, progress, priority, 
             estimated_time, usb_capacity, content_plan_id, volume_label, 
             assigned_device_id, fail_reason, started_at, finished_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        
        const [result] = await pool.execute(sql, [
            jobId,
            job.order_id,
            '', // customer_phone (legacy)
            '', // customer_name (legacy)
            job.usb_capacity || '',
            'mixed', // content_type (legacy)
            job.preferences ? JSON.stringify(job.preferences) : null,
            null, // content_list (legacy)
            null, // customizations (legacy)
            v1Status,
            job.progress ?? 0,
            5, // default priority
            null, // estimated_time
            job.usb_capacity || null,
            job.content_plan_id || null,
            job.volume_label || null,
            job.assigned_device_id || null,
            job.fail_reason || null,
            job.started_at || null,
            job.finished_at || null
        ]) as any;
        
        const insertId = result.insertId;
        
        // Log job creation
        await jobLogRepository.create({
            job_id: insertId,
            level: 'info',
            category: 'system',
            message: `Processing job created for order ${job.order_id}`,
            details: { job_id: jobId, status: job.status, capacity: job.usb_capacity }
        });
        
        return insertId;
    }
    
    /**
     * Update a processing job
     */
    async update(update: ProcessingJobUpdate): Promise<boolean> {
        const fields: string[] = [];
        const params: any[] = [];
        
        if (update.status !== undefined) {
            fields.push('status = ?');
            params.push(this.mapStatusToV1(update.status));
        }
        
        if (update.progress !== undefined) {
            fields.push('progress = ?');
            params.push(update.progress);
        }
        
        if (update.fail_reason !== undefined) {
            fields.push('fail_reason = ?');
            params.push(update.fail_reason);
        }
        
        if (update.assigned_device_id !== undefined) {
            fields.push('assigned_device_id = ?');
            params.push(update.assigned_device_id);
        }
        
        if (update.started_at !== undefined) {
            fields.push('started_at = ?');
            params.push(update.started_at);
        }
        
        if (update.finished_at !== undefined) {
            fields.push('finished_at = ?');
            fields.push('completed_at = ?'); // v1 compatibility
            params.push(update.finished_at, update.finished_at);
        }
        
        if (update.volume_label !== undefined) {
            fields.push('volume_label = ?');
            params.push(update.volume_label);
        }
        
        if (fields.length === 0) {
            return true;
        }
        
        fields.push('updated_at = NOW()');
        params.push(update.id);
        
        const sql = `UPDATE processing_jobs SET ${fields.join(', ')} WHERE id = ?`;
        const [result] = await pool.execute(sql, params) as any;
        
        // Log significant updates
        if (update.status || update.fail_reason) {
            const logLevel = update.fail_reason ? 'error' : 'info';
            const message = update.fail_reason 
                ? `Job failed: ${update.fail_reason}`
                : `Job status updated to ${update.status}`;
            
            await jobLogRepository.create({
                job_id: update.id,
                level: logLevel,
                category: 'system',
                message,
                details: update
            });
        }
        
        return result.affectedRows > 0;
    }
    
    /**
     * Update job progress
     */
    async updateProgress(id: number, progress: number, message?: string): Promise<void> {
        await this.update({ id, progress });
        
        if (message) {
            await jobLogRepository.create({
                job_id: id,
                level: 'info',
                category: 'progress',
                message,
                details: { progress }
            });
        }
    }
    
    /**
     * Mark job as failed
     */
    async markAsFailed(id: number, reason: string, errorDetails?: any): Promise<void> {
        await this.update({
            id,
            status: 'failed',
            fail_reason: reason,
            finished_at: new Date()
        });
        
        await jobLogRepository.create({
            job_id: id,
            level: 'error',
            category: 'system',
            message: `Job failed: ${reason}`,
            details: errorDetails
        });
    }
    
    /**
     * Mark job as completed
     */
    async markAsCompleted(id: number): Promise<void> {
        await this.update({
            id,
            status: 'done',
            progress: 100,
            finished_at: new Date()
        });
        
        await jobLogRepository.create({
            job_id: id,
            level: 'info',
            category: 'system',
            message: 'Job completed successfully',
            details: { finished_at: new Date() }
        });
    }
    
    /**
     * Get job by ID
     */
    async getById(id: number): Promise<ProcessingJob | null> {
        const [rows] = await pool.execute(
            'SELECT * FROM processing_jobs WHERE id = ? LIMIT 1',
            [id]
        ) as any;
        
        if (!rows || rows.length === 0) {
            return null;
        }
        
        return this.mapRow(rows[0]);
    }
    
    /**
     * Get job by order ID
     */
    async getByOrderId(orderId: string): Promise<ProcessingJob | null> {
        const [rows] = await pool.execute(
            'SELECT * FROM processing_jobs WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
            [orderId]
        ) as any;
        
        if (!rows || rows.length === 0) {
            return null;
        }
        
        return this.mapRow(rows[0]);
    }
    
    /**
     * List jobs with filters
     */
    async list(filter: ProcessingJobFilter = {}, limit: number = 50): Promise<ProcessingJob[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        const maxLimit = 200;
        const safeLimit = toSafeInt(limit, { min: 1, max: maxLimit, fallback: 50 });
        
        if (filter.status) {
            if (Array.isArray(filter.status)) {
                if (filter.status.length > 0) {
                    const v1Statuses = filter.status.map(s => this.mapStatusToV1(s));
                    conditions.push(`status IN (${v1Statuses.map(() => '?').join(',')})`);
                    params.push(...v1Statuses);
                }
            } else {
                conditions.push('status = ?');
                params.push(this.mapStatusToV1(filter.status));
            }
        }
        
        if (filter.order_id) {
            conditions.push('order_id = ?');
            params.push(filter.order_id);
        }
        
        if (filter.assigned_device_id) {
            conditions.push('assigned_device_id = ?');
            params.push(filter.assigned_device_id);
        }
        
        if (filter.date_from) {
            conditions.push('created_at >= ?');
            params.push(filter.date_from);
        }
        
        if (filter.date_to) {
            conditions.push('created_at <= ?');
            params.push(filter.date_to);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT * FROM processing_jobs 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        params.push(safeLimit);
        const [rows] = await pool.execute(sql, params) as any;
        
        return rows.map((row: any) => this.mapRow(row));
    }
    
    /**
     * Get statistics
     */
    async getStatistics(): Promise<{
        total: number;
        by_status: Array<{ status: string; count: number }>;
        avg_duration_minutes: number;
    }> {
        const [totalResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM processing_jobs'
        ) as any;
        
        const [byStatus] = await pool.execute(
            `SELECT status, COUNT(*) as count 
             FROM processing_jobs 
             GROUP BY status 
             ORDER BY count DESC`
        ) as any;
        
        const [avgDuration] = await pool.execute(
            `SELECT AVG(TIMESTAMPDIFF(MINUTE, started_at, finished_at)) as avg_minutes 
             FROM processing_jobs 
             WHERE status IN ('completed', 'done') 
             AND started_at IS NOT NULL 
             AND finished_at IS NOT NULL`
        ) as any;
        
        return {
            total: totalResult[0]?.total || 0,
            by_status: byStatus.map((row: any) => ({
                status: this.mapStatusToV2(row.status),
                count: row.count
            })),
            avg_duration_minutes: avgDuration[0]?.avg_minutes || 0
        };
    }
    
    /**
     * Map database row to ProcessingJob object
     */
    private mapRow(row: any): ProcessingJob {
        return {
            id: row.id,
            job_id: row.job_id,
            order_id: row.order_id,
            usb_capacity: row.usb_capacity || row.capacity,
            content_plan_id: row.content_plan_id,
            preferences: row.preferences ? JSON.parse(row.preferences) : null,
            volume_label: row.volume_label,
            assigned_device_id: row.assigned_device_id,
            status: this.mapStatusToV2(row.status),
            progress: row.progress || 0,
            fail_reason: row.fail_reason || row.error || null,
            started_at: row.started_at ? new Date(row.started_at) : null,
            finished_at: row.finished_at || row.completed_at ? new Date(row.finished_at || row.completed_at) : null,
            created_at: row.created_at ? new Date(row.created_at) : undefined,
            updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
            // Lease-based fields
            locked_by: row.locked_by || null,
            locked_until: row.locked_until ? new Date(row.locked_until) : null,
            attempts: row.attempts || 0,
            last_error: row.last_error || null
        };
    }
    
    /**
     * Map v2 status to v1 (for storage)
     */
    private mapStatusToV1(status: JobStatus): 'queued' | 'processing' | 'completed' | 'error' | 'failed' {
        switch (status) {
            case 'pending': return 'queued';
            case 'processing':
            case 'writing':
            case 'verifying': return 'processing';
            case 'done': return 'completed';
            case 'failed':
            case 'canceled': return 'failed';
            case 'retry': return 'queued';
            default: return 'queued';
        }
    }
    
    /**
     * Map v1 status to v2 (for retrieval)
     */
    private mapStatusToV2(status: string): JobStatus {
        switch (status) {
            case 'queued': return 'pending';
            case 'processing': return 'processing';
            case 'completed': return 'done';
            case 'failed':
            case 'error': return 'failed';
            default: return 'pending';
        }
    }
    
    // ============================================
    // LEASE-BASED JOB PROCESSING
    // ============================================
    
    /**
     * Atomically acquire a lease on an available job
     * Returns the job if successfully acquired, null otherwise
     */
    async acquireLease(
        workerId: string,
        leaseDurationSeconds: number = 300
    ): Promise<ProcessingJob | null> {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Calculate lease expiration time
            const leaseUntil = new Date();
            leaseUntil.setSeconds(leaseUntil.getSeconds() + leaseDurationSeconds);
            
            // Find and lock an available job atomically
            // A job is available if:
            // 1. Status is 'pending' or 'retry'
            // 2. No active lease (locked_until IS NULL OR locked_until < NOW())
            // 3. Not exceeded max retry attempts (attempts < 3)
            const [rows] = await connection.execute(
                `UPDATE processing_jobs 
                 SET locked_by = ?,
                     locked_until = ?,
                     status = 'processing',
                     attempts = attempts + 1,
                     updated_at = NOW()
                 WHERE id = (
                     SELECT id FROM (
                         SELECT id 
                         FROM processing_jobs 
                         WHERE status IN ('pending', 'retry')
                         AND (locked_until IS NULL OR locked_until < NOW())
                         AND attempts < 3
                         ORDER BY created_at ASC
                         LIMIT 1
                     ) AS subquery
                 )`,
                [workerId, leaseUntil]
            ) as any;
            
            if (rows.affectedRows === 0) {
                await connection.rollback();
                return null;
            }
            
            // Get the job we just locked
            const [jobRows] = await connection.execute(
                `SELECT * FROM processing_jobs 
                 WHERE locked_by = ? 
                 AND locked_until = ?
                 ORDER BY updated_at DESC 
                 LIMIT 1`,
                [workerId, leaseUntil]
            ) as any;
            
            await connection.commit();
            
            if (!jobRows || jobRows.length === 0) {
                return null;
            }
            
            const job = this.mapRow(jobRows[0]);
            
            // Log lease acquisition
            await jobLogRepository.create({
                job_id: job.id!,
                level: 'info',
                category: 'lease',
                message: `Lease acquired by worker ${workerId}`,
                details: { 
                    worker_id: workerId, 
                    lease_until: leaseUntil,
                    attempt: job.attempts 
                }
            });
            
            return job;
            
        } catch (error) {
            await connection.rollback();
            console.error('Error acquiring lease:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
    
    /**
     * Release a lease when job completes or fails
     */
    async releaseLease(jobId: number, workerId: string, status: JobStatus, error?: string): Promise<void> {
        const sql = `
            UPDATE processing_jobs 
            SET locked_by = NULL,
                locked_until = NULL,
                status = ?,
                last_error = ?,
                finished_at = IF(? IN ('done', 'failed'), NOW(), finished_at),
                updated_at = NOW()
            WHERE id = ? 
            AND locked_by = ?
        `;
        
        const [result] = await pool.execute(sql, [
            this.mapStatusToV1(status),
            error || null,
            status,
            jobId,
            workerId
        ]) as any;
        
        if (result.affectedRows > 0) {
            await jobLogRepository.create({
                job_id: jobId,
                level: status === 'failed' ? 'error' : 'info',
                category: 'lease',
                message: `Lease released with status ${status}`,
                details: { worker_id: workerId, status, error }
            });
        }
    }
    
    /**
     * Extend an existing lease if still valid
     */
    async extendLease(
        jobId: number, 
        workerId: string, 
        additionalSeconds: number = 300
    ): Promise<boolean> {
        const newLeaseUntil = new Date();
        newLeaseUntil.setSeconds(newLeaseUntil.getSeconds() + additionalSeconds);
        
        const sql = `
            UPDATE processing_jobs 
            SET locked_until = ?,
                updated_at = NOW()
            WHERE id = ? 
            AND locked_by = ?
            AND locked_until > NOW()
        `;
        
        const [result] = await pool.execute(sql, [newLeaseUntil, jobId, workerId]) as any;
        
        return result.affectedRows > 0;
    }
    
    /**
     * Reset expired leases on startup or periodically
     * Jobs with status='processing' and expired lease are reset to 'retry' or 'failed'
     */
    async resetExpiredLeases(): Promise<number> {
        const sql = `
            UPDATE processing_jobs 
            SET locked_by = NULL,
                locked_until = NULL,
                status = IF(attempts >= 3, 'failed', 'retry'),
                last_error = CONCAT(
                    COALESCE(last_error, ''),
                    IF(last_error IS NOT NULL, '; ', ''),
                    'Lease expired - worker crashed or timed out'
                ),
                finished_at = IF(attempts >= 3, NOW(), finished_at),
                updated_at = NOW()
            WHERE status = 'processing'
            AND locked_until IS NOT NULL
            AND locked_until < NOW()
        `;
        
        const [result] = await pool.execute(sql) as any;
        const resetCount = result.affectedRows;
        
        if (resetCount > 0) {
            console.log(`🔄 Reset ${resetCount} expired leases`);
            
            // Log the recovery action
            const [resetJobs] = await pool.execute(
                `SELECT id FROM processing_jobs 
                 WHERE last_error LIKE '%Lease expired%'
                 AND updated_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
                 LIMIT 100`
            ) as any;
            
            for (const job of resetJobs) {
                await jobLogRepository.create({
                    job_id: job.id,
                    level: 'warning',
                    category: 'lease',
                    message: 'Lease expired - job reset for retry',
                    details: { reset_reason: 'expired_lease' }
                });
            }
        }
        
        return resetCount;
    }
    
    /**
     * Get jobs with active leases (for monitoring)
     */
    async getActiveLeases(): Promise<ProcessingJob[]> {
        const [rows] = await pool.execute(
            `SELECT * FROM processing_jobs 
             WHERE locked_by IS NOT NULL 
             AND locked_until > NOW()
             ORDER BY locked_until ASC`
        ) as any;
        
        return rows.map((row: any) => this.mapRow(row));
    }
    
    /**
     * Get jobs with expired leases (for monitoring/debugging)
     */
    async getExpiredLeases(): Promise<ProcessingJob[]> {
        const [rows] = await pool.execute(
            `SELECT * FROM processing_jobs 
             WHERE locked_by IS NOT NULL 
             AND locked_until < NOW()
             ORDER BY locked_until ASC`
        ) as any;
        
        return rows.map((row: any) => this.mapRow(row));
    }
}

// Export singleton instance
export const processingJobRepository = new ProcessingJobRepository();
