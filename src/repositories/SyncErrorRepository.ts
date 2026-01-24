/**
 * Sync Error Repository
 * Database access layer for sync_errors table
 */

import { db } from '../database/knex';

export interface SyncError {
    id?: number;
    sync_run_id: number;
    error_type: string;
    error_code?: string;
    error_message: string;
    error_details?: string;
    item_identifier?: string;
    item_data?: any;
    is_retryable?: boolean;
    created_at?: Date;
}

export class SyncErrorRepository {
    private static instance: SyncErrorRepository;
    
    private constructor() {}
    
    public static getInstance(): SyncErrorRepository {
        if (!SyncErrorRepository.instance) {
            SyncErrorRepository.instance = new SyncErrorRepository();
        }
        return SyncErrorRepository.instance;
    }
    
    /**
     * Create a new sync error
     */
    async create(error: SyncError): Promise<number> {
        const [id] = await db('sync_errors').insert({
            ...error,
            created_at: new Date()
        });
        return id;
    }
    
    /**
     * Get error by ID
     */
    async getById(id: number): Promise<SyncError | null> {
        const error = await db('sync_errors').where({ id }).first();
        return error || null;
    }
    
    /**
     * Get errors by sync run ID
     */
    async getBySyncRunId(syncRunId: number, limit: number = 100): Promise<SyncError[]> {
        return db('sync_errors')
            .where('sync_run_id', syncRunId)
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    
    /**
     * Get retryable errors for a sync run
     */
    async getRetryable(syncRunId: number): Promise<SyncError[]> {
        return db('sync_errors')
            .where({
                sync_run_id: syncRunId,
                is_retryable: true
            })
            .orderBy('created_at', 'asc');
    }
    
    /**
     * Get error summary for a sync run
     */
    async getSummary(syncRunId: number): Promise<{
        total: number;
        by_type: Array<{ error_type: string; count: number }>;
        by_code: Array<{ error_code: string; count: number }>;
        retryable_count: number;
    }> {
        // Get total count
        const totalResult = await db('sync_errors')
            .where('sync_run_id', syncRunId)
            .count('* as count')
            .first();
        
        const total = Number(totalResult?.count || 0);
        
        // Get errors by type
        const byType = await db('sync_errors')
            .where('sync_run_id', syncRunId)
            .select('error_type')
            .count('* as count')
            .groupBy('error_type')
            .orderBy('count', 'desc');
        
        // Get errors by code (where code is not null)
        const byCode = await db('sync_errors')
            .where('sync_run_id', syncRunId)
            .whereNotNull('error_code')
            .select('error_code')
            .count('* as count')
            .groupBy('error_code')
            .orderBy('count', 'desc');
        
        // Get retryable count
        const retryableResult = await db('sync_errors')
            .where({
                sync_run_id: syncRunId,
                is_retryable: true
            })
            .count('* as count')
            .first();
        
        const retryable_count = Number(retryableResult?.count || 0);
        
        return {
            total,
            by_type: byType.map(row => ({
                error_type: row.error_type,
                count: Number(row.count)
            })),
            by_code: byCode.map(row => ({
                error_code: row.error_code,
                count: Number(row.count)
            })),
            retryable_count
        };
    }
    
    /**
     * Delete errors for a sync run
     */
    async deleteBySyncRunId(syncRunId: number): Promise<number> {
        return db('sync_errors')
            .where('sync_run_id', syncRunId)
            .delete();
    }
}

// Export singleton instance
export const syncErrorRepository = SyncErrorRepository.getInstance();
