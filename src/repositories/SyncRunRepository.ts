/**
 * Sync Run Repository
 * Database access layer for sync_runs table
 */

import { db } from '../database/knex';

export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type SourceType = 'csv' | 'api' | 'drive' | 'usb' | 'manual';

export interface SyncRun {
    id?: number;
    source_type: SourceType;
    source_identifier: string;
    status: SyncStatus;
    started_at?: Date;
    completed_at?: Date;
    items_processed?: number;
    items_failed?: number;
    items_skipped?: number;
    sync_metadata?: any;
    error_message?: string;
    created_at?: Date;
    updated_at?: Date;
}

export interface SyncRunFilter {
    source_type?: SourceType;
    status?: SyncStatus | SyncStatus[];
    created_after?: Date;
    created_before?: Date;
}

export class SyncRunRepository {
    private static instance: SyncRunRepository;
    
    private constructor() {}
    
    public static getInstance(): SyncRunRepository {
        if (!SyncRunRepository.instance) {
            SyncRunRepository.instance = new SyncRunRepository();
        }
        return SyncRunRepository.instance;
    }
    
    /**
     * Create a new sync run
     */
    async create(syncRun: SyncRun): Promise<number> {
        const [id] = await db('sync_runs').insert({
            ...syncRun,
            created_at: new Date(),
            updated_at: new Date()
        });
        return id;
    }
    
    /**
     * Get sync run by ID
     */
    async getById(id: number): Promise<SyncRun | null> {
        const run = await db('sync_runs').where({ id }).first();
        return run || null;
    }
    
    /**
     * Update sync run
     */
    async update(id: number, updates: Partial<SyncRun>): Promise<boolean> {
        const affected = await db('sync_runs')
            .where({ id })
            .update({
                ...updates,
                updated_at: new Date()
            });
        return affected > 0;
    }
    
    /**
     * Start a sync run
     */
    async start(id: number): Promise<boolean> {
        return this.update(id, {
            status: 'in_progress',
            started_at: new Date()
        });
    }
    
    /**
     * Complete a sync run
     */
    async complete(id: number, stats?: { processed: number; failed: number; skipped: number }): Promise<boolean> {
        return this.update(id, {
            status: 'completed',
            completed_at: new Date(),
            ...(stats && {
                items_processed: stats.processed,
                items_failed: stats.failed,
                items_skipped: stats.skipped
            })
        });
    }
    
    /**
     * Fail a sync run
     */
    async fail(id: number, errorMessage: string, stats?: { processed: number; failed: number; skipped: number }): Promise<boolean> {
        return this.update(id, {
            status: 'failed',
            completed_at: new Date(),
            error_message: errorMessage,
            ...(stats && {
                items_processed: stats.processed,
                items_failed: stats.failed,
                items_skipped: stats.skipped
            })
        });
    }
    
    /**
     * Cancel a sync run
     */
    async cancel(id: number): Promise<boolean> {
        return this.update(id, {
            status: 'cancelled',
            completed_at: new Date()
        });
    }
    
    /**
     * Get pending sync runs
     */
    async getPending(): Promise<SyncRun[]> {
        return db('sync_runs')
            .where({ status: 'pending' })
            .orderBy('created_at', 'asc');
    }
    
    /**
     * Get in-progress sync runs
     */
    async getInProgress(): Promise<SyncRun[]> {
        return db('sync_runs')
            .where({ status: 'in_progress' })
            .orderBy('started_at', 'asc');
    }
    
    /**
     * List sync runs with filters
     */
    async list(filter: SyncRunFilter = {}, limit: number = 100): Promise<SyncRun[]> {
        let query = db('sync_runs');
        
        if (filter.source_type) {
            query = query.where('source_type', filter.source_type);
        }
        
        if (filter.status) {
            if (Array.isArray(filter.status)) {
                query = query.whereIn('status', filter.status);
            } else {
                query = query.where('status', filter.status);
            }
        }
        
        if (filter.created_after) {
            query = query.where('created_at', '>=', filter.created_after);
        }
        
        if (filter.created_before) {
            query = query.where('created_at', '<=', filter.created_before);
        }
        
        return query.orderBy('created_at', 'desc').limit(limit);
    }
    
    /**
     * Get recent sync runs for a source
     */
    async getRecentBySource(sourceType: SourceType, sourceIdentifier: string, limit: number = 10): Promise<SyncRun[]> {
        return db('sync_runs')
            .where({
                source_type: sourceType,
                source_identifier: sourceIdentifier
            })
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    
    /**
     * Get last successful sync for a source
     */
    async getLastSuccessful(sourceType: SourceType, sourceIdentifier: string): Promise<SyncRun | null> {
        const run = await db('sync_runs')
            .where({
                source_type: sourceType,
                source_identifier: sourceIdentifier,
                status: 'completed'
            })
            .orderBy('completed_at', 'desc')
            .first();
        
        return run || null;
    }
    
    /**
     * Get sync statistics
     */
    async getStats(sourceType?: SourceType): Promise<{
        total: number;
        pending: number;
        in_progress: number;
        completed: number;
        failed: number;
        cancelled: number;
    }> {
        let query = db('sync_runs');
        
        if (sourceType) {
            query = query.where('source_type', sourceType);
        }
        
        const results = await query
            .select('status')
            .count('* as count')
            .groupBy('status');
        
        const stats = {
            total: 0,
            pending: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
            cancelled: 0
        };
        
        for (const row of results) {
            const count = Number(row.count);
            stats.total += count;
            stats[row.status as keyof typeof stats] = count;
        }
        
        return stats;
    }
    
    /**
     * Clean up old completed sync runs
     */
    async cleanupOld(daysToKeep: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        return db('sync_runs')
            .where('status', 'completed')
            .where('completed_at', '<', cutoffDate)
            .delete();
    }
}

// Export singleton instance
export const syncRunRepository = SyncRunRepository.getInstance();
