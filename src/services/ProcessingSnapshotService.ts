/**
 * Processing Snapshot Service
 * 
 * Provides real-time processing metrics by querying the database.
 * This ensures the system monitor shows actual activity instead of zeros.
 * 
 * Data Sources:
 * - processing_jobs: Active job count (status = processing/writing/verifying)
 * - processed_messages: Processed message count in time window
 * - error_logs: Error count in time window
 * - conversation_analysis: Skipped analysis count (status = skipped)
 */

import { pool } from '../mysql-database';
import { processingJobRepository } from '../repositories/ProcessingJobRepository';

// Configuration constants
const MAX_ACTIVE_JOBS_LIMIT = 1000; // Maximum jobs to count as active

export interface ProcessingSnapshot {
    /** Number of jobs currently running (processing, writing, verifying) */
    activeJobs: number;
    /** Number of messages processed in the time window */
    processed: number;
    /** Number of errors logged in the time window */
    errors: number;
    /** Number of messages/analyses skipped in the time window */
    skipped: number;
    /** Timestamp when snapshot was taken */
    timestamp: Date;
    /** Time window in minutes */
    windowMinutes: number;
}

export class ProcessingSnapshotService {
    /**
     * Get a snapshot of processing activity from the database
     * 
     * @param lastMinutes - Time window in minutes (default: 5)
     * @returns ProcessingSnapshot with real DB-based metrics
     */
    async getProcessingSnapshot(lastMinutes: number = 5): Promise<ProcessingSnapshot> {
        const timestamp = new Date();
        const windowStart = new Date(timestamp.getTime() - lastMinutes * 60 * 1000);

        try {
            // Run all queries in parallel for efficiency
            const [activeJobs, processed, errors, skipped] = await Promise.all([
                this.countActiveJobs(),
                this.countProcessedMessages(windowStart),
                this.countErrors(windowStart),
                this.countSkipped(windowStart)
            ]);

            return {
                activeJobs,
                processed,
                errors,
                skipped,
                timestamp,
                windowMinutes: lastMinutes
            };
        } catch (error) {
            console.error('Error getting processing snapshot:', error);
            // Return zeros on error to avoid breaking the system monitor
            return {
                activeJobs: 0,
                processed: 0,
                errors: 0,
                skipped: 0,
                timestamp,
                windowMinutes: lastMinutes
            };
        }
    }

    /**
     * Count active processing jobs from processing_jobs table
     * Active = status is processing, writing, or verifying
     */
    private async countActiveJobs(): Promise<number> {
        try {
            // Use the repository which handles status mapping
            const activeJobs = await processingJobRepository.list({
                status: ['processing', 'writing', 'verifying']
            }, MAX_ACTIVE_JOBS_LIMIT);
            return activeJobs.length;
        } catch (error) {
            // If repository fails, try direct query
            try {
                const [rows] = await pool.execute(
                    `SELECT COUNT(*) as count 
                     FROM processing_jobs 
                     WHERE status IN ('processing', 'writing', 'verifying')`
                ) as any;
                return rows[0]?.count || 0;
            } catch {
                return 0;
            }
        }
    }

    /**
     * Count processed messages from processed_messages table
     * Messages with processed_at >= windowStart
     */
    private async countProcessedMessages(windowStart: Date): Promise<number> {
        try {
            const [rows] = await pool.execute(
                `SELECT COUNT(*) as count 
                 FROM processed_messages 
                 WHERE processed_at >= ?`,
                [windowStart]
            ) as any;
            return rows[0]?.count || 0;
        } catch (error) {
            // Table may not exist
            return 0;
        }
    }

    /**
     * Count errors from error_logs table
     * Errors with created_at >= windowStart
     */
    private async countErrors(windowStart: Date): Promise<number> {
        try {
            const [rows] = await pool.execute(
                `SELECT COUNT(*) as count 
                 FROM error_logs 
                 WHERE created_at >= ?`,
                [windowStart]
            ) as any;
            return rows[0]?.count || 0;
        } catch (error) {
            // Table may not exist
            return 0;
        }
    }

    /**
     * Count skipped items from conversation_analysis table
     * Items with status = 'skipped' and created_at >= windowStart
     */
    private async countSkipped(windowStart: Date): Promise<number> {
        try {
            const [rows] = await pool.execute(
                `SELECT COUNT(*) as count 
                 FROM conversation_analysis 
                 WHERE status = 'skipped' AND created_at >= ?`,
                [windowStart]
            ) as any;
            return rows[0]?.count || 0;
        } catch (error) {
            // Table may not exist
            return 0;
        }
    }

    /**
     * Get extended snapshot with more detailed metrics
     * Useful for admin dashboards
     */
    async getExtendedSnapshot(lastMinutes: number = 5): Promise<ProcessingSnapshot & {
        pendingJobs: number;
        completedJobs: number;
        failedJobs: number;
        processingJobLogs: number;
    }> {
        const baseSnapshot = await this.getProcessingSnapshot(lastMinutes);
        const windowStart = new Date(Date.now() - lastMinutes * 60 * 1000);

        try {
            const [pending, completed, failed, jobLogs] = await Promise.all([
                this.countJobsByStatus('pending'),
                this.countJobsByStatus('done', windowStart),
                this.countJobsByStatus('failed', windowStart),
                this.countJobLogs(windowStart)
            ]);

            return {
                ...baseSnapshot,
                pendingJobs: pending,
                completedJobs: completed,
                failedJobs: failed,
                processingJobLogs: jobLogs
            };
        } catch (error) {
            console.error('Error getting extended snapshot:', error);
            return {
                ...baseSnapshot,
                pendingJobs: 0,
                completedJobs: 0,
                failedJobs: 0,
                processingJobLogs: 0
            };
        }
    }

    /**
     * Count jobs by status
     */
    private async countJobsByStatus(status: string, windowStart?: Date): Promise<number> {
        try {
            let sql = 'SELECT COUNT(*) as count FROM processing_jobs WHERE status = ?';
            const params: any[] = [status];

            if (windowStart) {
                sql += ' AND created_at >= ?';
                params.push(windowStart);
            }

            const [rows] = await pool.execute(sql, params) as any;
            return rows[0]?.count || 0;
        } catch {
            return 0;
        }
    }

    /**
     * Count job logs in time window
     */
    private async countJobLogs(windowStart: Date): Promise<number> {
        try {
            const [rows] = await pool.execute(
                `SELECT COUNT(*) as count 
                 FROM processing_job_logs 
                 WHERE created_at >= ?`,
                [windowStart]
            ) as any;
            return rows[0]?.count || 0;
        } catch {
            return 0;
        }
    }
}

// Export singleton instance
export const processingSnapshotService = new ProcessingSnapshotService();

// Export convenience function
export async function getProcessingSnapshot(lastMinutes: number = 5): Promise<ProcessingSnapshot> {
    return processingSnapshotService.getProcessingSnapshot(lastMinutes);
}
