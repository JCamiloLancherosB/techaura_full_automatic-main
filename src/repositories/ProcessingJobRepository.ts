/**
 * Repository for processing_jobs table
 * Handles CRUD operations for processing jobs with proper typing
 */

import { pool } from '../mysql-database';
import { jobLogRepository, JobLog } from './JobLogRepository';

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
    async list(filter: ProcessingJobFilter = {}, limit: number = 100): Promise<ProcessingJob[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter.status) {
            if (Array.isArray(filter.status)) {
                const v1Statuses = filter.status.map(s => this.mapStatusToV1(s));
                conditions.push(`status IN (${v1Statuses.map(() => '?').join(',')})`);
                params.push(...v1Statuses);
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
        
        params.push(Math.min(limit, 1000));
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
            updated_at: row.updated_at ? new Date(row.updated_at) : undefined
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
}

// Export singleton instance
export const processingJobRepository = new ProcessingJobRepository();
