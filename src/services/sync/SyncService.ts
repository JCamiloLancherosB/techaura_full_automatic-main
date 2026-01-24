/**
 * Sync Service
 * Orchestrates external source synchronization with tracking and error handling
 */

import { syncRunRepository, SyncRun, SyncStatus, SourceType } from '../../repositories/SyncRunRepository';
import { syncErrorRepository, SyncError } from '../../repositories/SyncErrorRepository';
import { IExternalSourceAdapter, SourceConfig } from './ExternalSourceAdapter';
import { CSVSourceAdapter } from './CSVSourceAdapter';
import { APISourceAdapter } from './APISourceAdapter';
import { unifiedLogger } from '../../utils/unifiedLogger';

export interface SyncOptions {
    sourceAdapter?: IExternalSourceAdapter;
    sourceConfig?: SourceConfig;
    resumeFailedRuns?: boolean;
}

export interface SyncJobStatus {
    syncRunId: number;
    status: SyncStatus;
    itemsProcessed: number;
    itemsFailed: number;
    itemsSkipped: number;
    errors: Array<{
        type: string;
        message: string;
    }>;
}

/**
 * Sync Service
 * Manages external source synchronization
 */
export class SyncService {
    private static instance: SyncService;
    private activeSyncs: Map<number, boolean> = new Map();
    
    private constructor() {}
    
    public static getInstance(): SyncService {
        if (!SyncService.instance) {
            SyncService.instance = new SyncService();
        }
        return SyncService.instance;
    }
    
    /**
     * Create a source adapter from config
     */
    private createAdapter(config: SourceConfig): IExternalSourceAdapter {
        switch (config.sourceType) {
            case 'csv':
                return new CSVSourceAdapter(config as any);
            case 'api':
                return new APISourceAdapter(config as any);
            default:
                throw new Error(`Unsupported source type: ${config.sourceType}`);
        }
    }
    
    /**
     * Schedule a sync operation
     */
    async scheduleSync(sourceConfig: SourceConfig, metadata?: any): Promise<number> {
        try {
            // Validate source config
            const adapter = this.createAdapter(sourceConfig);
            const validation = await adapter.validate();
            
            if (!validation.valid) {
                throw new Error(`Invalid source configuration: ${validation.error}`);
            }
            
            // Create sync run
            const syncRun: SyncRun = {
                source_type: sourceConfig.sourceType as SourceType,
                source_identifier: sourceConfig.sourceIdentifier,
                status: 'pending',
                items_processed: 0,
                items_failed: 0,
                items_skipped: 0,
                sync_metadata: metadata || sourceConfig.options
            };
            
            const syncRunId = await syncRunRepository.create(syncRun);
            
            unifiedLogger.info(`[SyncService] Scheduled sync run ${syncRunId} for ${sourceConfig.sourceType}:${sourceConfig.sourceIdentifier}`);
            
            return syncRunId;
            
        } catch (error: any) {
            unifiedLogger.error('[SyncService] Failed to schedule sync:', error);
            throw error;
        }
    }
    
    /**
     * Execute a sync operation
     */
    async executeSync(syncRunId: number, adapter?: IExternalSourceAdapter): Promise<SyncJobStatus> {
        try {
            // Check if sync is already running
            if (this.activeSyncs.get(syncRunId)) {
                throw new Error(`Sync run ${syncRunId} is already in progress`);
            }
            
            this.activeSyncs.set(syncRunId, true);
            
            // Get sync run
            const syncRun = await syncRunRepository.getById(syncRunId);
            if (!syncRun) {
                throw new Error(`Sync run ${syncRunId} not found`);
            }
            
            // Start sync run
            await syncRunRepository.start(syncRunId);
            unifiedLogger.info(`[SyncService] Starting sync run ${syncRunId}`);
            
            // Create adapter if not provided
            if (!adapter) {
                const config: SourceConfig = {
                    sourceType: syncRun.source_type,
                    sourceIdentifier: syncRun.source_identifier,
                    options: syncRun.sync_metadata
                };
                adapter = this.createAdapter(config);
            }
            
            // Execute sync
            const result = await adapter.sync();
            
            // Update sync run with results
            if (result.success) {
                await syncRunRepository.complete(syncRunId, {
                    processed: result.itemsProcessed,
                    failed: result.itemsFailed,
                    skipped: result.itemsSkipped
                });
                unifiedLogger.info(`[SyncService] Completed sync run ${syncRunId} - Processed: ${result.itemsProcessed}, Failed: ${result.itemsFailed}, Skipped: ${result.itemsSkipped}`);
            } else {
                await syncRunRepository.fail(
                    syncRunId,
                    `Sync failed with ${result.errors.length} errors`,
                    {
                        processed: result.itemsProcessed,
                        failed: result.itemsFailed,
                        skipped: result.itemsSkipped
                    }
                );
                unifiedLogger.error(`[SyncService] Failed sync run ${syncRunId}`);
            }
            
            // Log errors
            for (const error of result.errors) {
                await syncErrorRepository.create({
                    sync_run_id: syncRunId,
                    error_type: error.type,
                    error_code: error.code,
                    error_message: error.message,
                    error_details: JSON.stringify(error.details),
                    item_identifier: error.itemIdentifier,
                    item_data: error.details,
                    is_retryable: this.isRetryableError(error.type)
                });
            }
            
            this.activeSyncs.delete(syncRunId);
            
            return {
                syncRunId,
                status: result.success ? 'completed' : 'failed',
                itemsProcessed: result.itemsProcessed,
                itemsFailed: result.itemsFailed,
                itemsSkipped: result.itemsSkipped,
                errors: result.errors.map(e => ({ type: e.type, message: e.message }))
            };
            
        } catch (error: any) {
            this.activeSyncs.delete(syncRunId);
            
            // Mark sync as failed
            await syncRunRepository.fail(syncRunId, error.message);
            
            // Log error
            await syncErrorRepository.create({
                sync_run_id: syncRunId,
                error_type: 'system',
                error_code: 'SYNC_EXECUTION_ERROR',
                error_message: error.message,
                error_details: error.stack,
                is_retryable: true
            });
            
            unifiedLogger.error(`[SyncService] Sync run ${syncRunId} failed with exception:`, error);
            
            throw error;
        }
    }
    
    /**
     * Schedule and execute sync in one operation
     */
    async sync(sourceConfig: SourceConfig, metadata?: any): Promise<SyncJobStatus> {
        const syncRunId = await this.scheduleSync(sourceConfig, metadata);
        return this.executeSync(syncRunId);
    }
    
    /**
     * Resume pending sync runs (called on startup)
     */
    async resumePendingSyncs(): Promise<void> {
        try {
            unifiedLogger.info('[SyncService] Checking for pending sync runs...');
            
            // Get pending syncs
            const pendingSyncs = await syncRunRepository.getPending();
            
            if (pendingSyncs.length === 0) {
                unifiedLogger.info('[SyncService] No pending syncs found');
                return;
            }
            
            unifiedLogger.info(`[SyncService] Found ${pendingSyncs.length} pending sync(s), resuming...`);
            
            // Execute pending syncs sequentially
            for (const syncRun of pendingSyncs) {
                try {
                    await this.executeSync(syncRun.id!);
                } catch (error: any) {
                    unifiedLogger.error(`[SyncService] Failed to resume sync ${syncRun.id}:`, error);
                    // Continue with next sync
                }
            }
            
            unifiedLogger.info('[SyncService] Finished resuming pending syncs');
            
        } catch (error: any) {
            unifiedLogger.error('[SyncService] Error resuming pending syncs:', error);
        }
    }
    
    /**
     * Resume failed sync runs (with retryable errors)
     */
    async retryFailedSyncs(maxRetries: number = 3): Promise<void> {
        try {
            unifiedLogger.info('[SyncService] Checking for failed sync runs with retryable errors...');
            
            // Get recent failed syncs
            const failedSyncs = await syncRunRepository.list({ status: 'failed' }, 50);
            
            for (const syncRun of failedSyncs) {
                // Check if sync has retryable errors
                const errors = await syncErrorRepository.getRetryable(syncRun.id!);
                
                if (errors.length === 0) {
                    continue;
                }
                
                // Check retry count in metadata
                const retryCount = (syncRun.sync_metadata?.retry_count || 0) as number;
                
                if (retryCount >= maxRetries) {
                    unifiedLogger.info(`[SyncService] Sync ${syncRun.id} exceeded max retries (${maxRetries})`);
                    continue;
                }
                
                // Schedule retry
                unifiedLogger.info(`[SyncService] Retrying sync ${syncRun.id} (attempt ${retryCount + 1}/${maxRetries})`);
                
                const newMetadata = {
                    ...syncRun.sync_metadata,
                    retry_count: retryCount + 1,
                    previous_run_id: syncRun.id
                };
                
                const config: SourceConfig = {
                    sourceType: syncRun.source_type,
                    sourceIdentifier: syncRun.source_identifier,
                    options: syncRun.sync_metadata
                };
                
                await this.scheduleSync(config, newMetadata);
            }
            
        } catch (error: any) {
            unifiedLogger.error('[SyncService] Error retrying failed syncs:', error);
        }
    }
    
    /**
     * Get sync status
     */
    async getSyncStatus(syncRunId: number): Promise<SyncJobStatus | null> {
        const syncRun = await syncRunRepository.getById(syncRunId);
        
        if (!syncRun) {
            return null;
        }
        
        const errors = await syncErrorRepository.getBySyncRunId(syncRunId, 10);
        
        return {
            syncRunId,
            status: syncRun.status,
            itemsProcessed: syncRun.items_processed || 0,
            itemsFailed: syncRun.items_failed || 0,
            itemsSkipped: syncRun.items_skipped || 0,
            errors: errors.map(e => ({ type: e.error_type, message: e.error_message }))
        };
    }
    
    /**
     * Get sync statistics
     */
    async getSyncStats(sourceType?: SourceType) {
        return syncRunRepository.getStats(sourceType);
    }
    
    /**
     * Check if error type is retryable
     */
    private isRetryableError(errorType: string): boolean {
        const nonRetryableTypes = ['validation', 'parsing', 'authentication'];
        return !nonRetryableTypes.includes(errorType);
    }
    
    /**
     * Cancel a sync run
     */
    async cancelSync(syncRunId: number): Promise<boolean> {
        if (this.activeSyncs.get(syncRunId)) {
            // Cannot cancel active sync (would need more complex cancellation logic)
            return false;
        }
        
        return syncRunRepository.cancel(syncRunId);
    }
    
    /**
     * Cleanup old sync runs
     */
    async cleanup(daysToKeep: number = 30): Promise<void> {
        try {
            const deleted = await syncRunRepository.cleanupOld(daysToKeep);
            unifiedLogger.info(`[SyncService] Cleaned up ${deleted} old sync runs`);
        } catch (error: any) {
            unifiedLogger.error('[SyncService] Error during cleanup:', error);
        }
    }
}

// Export singleton instance
export const syncService = SyncService.getInstance();
