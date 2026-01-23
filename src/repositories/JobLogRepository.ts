/**
 * Repository for processing_job_logs table
 * Handles CRUD operations for job logs with proper typing
 */

import { pool } from '../mysql-database';

export interface JobLog {
    id?: number;
    job_id: number;
    level: 'debug' | 'info' | 'warning' | 'error';
    category: string; // 'copy', 'verify', 'format', 'system', etc.
    message: string;
    details?: any; // JSON data
    file_path?: string;
    file_size?: number;
    error_code?: string;
    correlation_id?: string;
    created_at?: Date;
}

export interface JobLogFilter {
    job_id?: number;
    level?: 'debug' | 'info' | 'warning' | 'error';
    category?: string;
    error_code?: string;
    correlation_id?: string;
    date_from?: Date;
    date_to?: Date;
}

export class JobLogRepository {
    /**
     * Insert a new job log
     */
    async create(log: JobLog): Promise<number> {
        const sql = `
            INSERT INTO processing_job_logs 
            (job_id, level, category, message, details, file_path, file_size, error_code, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            log.job_id,
            log.level,
            log.category,
            log.message,
            log.details ? JSON.stringify(log.details) : null,
            log.file_path || null,
            log.file_size || null,
            log.error_code || null,
            log.correlation_id || null
        ]) as any;
        
        return result.insertId;
    }
    
    /**
     * Bulk insert multiple job logs (more efficient for batch operations)
     */
    async createBatch(logs: JobLog[]): Promise<void> {
        if (logs.length === 0) return;
        
        const sql = `
            INSERT INTO processing_job_logs 
            (job_id, level, category, message, details, file_path, file_size, error_code, correlation_id)
            VALUES ?
        `;
        
        const values = logs.map(log => [
            log.job_id,
            log.level,
            log.category,
            log.message,
            log.details ? JSON.stringify(log.details) : null,
            log.file_path || null,
            log.file_size || null,
            log.error_code || null,
            log.correlation_id || null
        ]);
        
        await pool.query(sql, [values]);
    }
    
    /**
     * Get logs for a specific job
     */
    async getByJobId(jobId: number, limit: number = 100): Promise<JobLog[]> {
        const sql = `
            SELECT * FROM processing_job_logs 
            WHERE job_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [jobId, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get logs by correlation ID (for end-to-end tracing)
     */
    async getByCorrelationId(correlationId: string, limit: number = 1000): Promise<JobLog[]> {
        const sql = `
            SELECT * FROM processing_job_logs 
            WHERE correlation_id = ? 
            ORDER BY created_at ASC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [correlationId, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get logs with filters
     */
    async findByFilter(filter: JobLogFilter, limit: number = 100): Promise<JobLog[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter.job_id !== undefined) {
            conditions.push('job_id = ?');
            params.push(filter.job_id);
        }
        
        if (filter.level) {
            conditions.push('level = ?');
            params.push(filter.level);
        }
        
        if (filter.category) {
            conditions.push('category = ?');
            params.push(filter.category);
        }
        
        if (filter.error_code) {
            conditions.push('error_code = ?');
            params.push(filter.error_code);
        }
        
        if (filter.correlation_id) {
            conditions.push('correlation_id = ?');
            params.push(filter.correlation_id);
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
            SELECT * FROM processing_job_logs 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        params.push(limit);
        const [rows] = await pool.execute(sql, params) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get error summary for a job
     */
    async getErrorSummary(jobId: number): Promise<{
        total: number;
        by_category: Array<{ category: string; count: number }>;
        by_error_code: Array<{ error_code: string; count: number }>;
    }> {
        const [totalResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM processing_job_logs WHERE job_id = ? AND level = ?',
            [jobId, 'error']
        ) as any;
        
        const [byCategory] = await pool.execute(
            `SELECT category, COUNT(*) as count 
             FROM processing_job_logs 
             WHERE job_id = ? AND level = ? 
             GROUP BY category 
             ORDER BY count DESC`,
            [jobId, 'error']
        ) as any;
        
        const [byErrorCode] = await pool.execute(
            `SELECT error_code, COUNT(*) as count 
             FROM processing_job_logs 
             WHERE job_id = ? AND level = ? AND error_code IS NOT NULL 
             GROUP BY error_code 
             ORDER BY count DESC`,
            [jobId, 'error']
        ) as any;
        
        return {
            total: totalResult[0]?.total || 0,
            by_category: byCategory,
            by_error_code: byErrorCode
        };
    }
    
    /**
     * Delete logs for a job (cleanup)
     */
    async deleteByJobId(jobId: number): Promise<number> {
        const [result] = await pool.execute(
            'DELETE FROM processing_job_logs WHERE job_id = ?',
            [jobId]
        ) as any;
        
        return result.affectedRows;
    }
    
    /**
     * Delete old logs (cleanup)
     */
    async deleteOlderThan(days: number): Promise<number> {
        const [result] = await pool.execute(
            'DELETE FROM processing_job_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        ) as any;
        
        return result.affectedRows;
    }
    
    /**
     * Map database rows to JobLog objects
     */
    private mapRows(rows: any[]): JobLog[] {
        return rows.map(row => ({
            id: row.id,
            job_id: row.job_id,
            level: row.level,
            category: row.category,
            message: row.message,
            details: row.details ? JSON.parse(row.details) : null,
            file_path: row.file_path,
            file_size: row.file_size,
            error_code: row.error_code,
            correlation_id: row.correlation_id,
            created_at: new Date(row.created_at)
        }));
    }
}

// Export singleton instance
export const jobLogRepository = new JobLogRepository();
