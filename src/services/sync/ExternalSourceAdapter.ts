/**
 * External Source Adapter Interface
 * Base interface for all external source adapters
 */

export interface SyncResult {
    success: boolean;
    itemsProcessed: number;
    itemsFailed: number;
    itemsSkipped: number;
    errors: Array<{
        type: string;
        code?: string;
        message: string;
        details?: any;
        itemIdentifier?: string;
    }>;
}

export interface SourceConfig {
    sourceType: string;
    sourceIdentifier: string;
    options?: any;
}

/**
 * Base interface for external source adapters
 */
export interface IExternalSourceAdapter {
    /**
     * Validate the source configuration
     */
    validate(): Promise<{ valid: boolean; error?: string }>;
    
    /**
     * Fetch and sync data from the external source
     */
    sync(): Promise<SyncResult>;
    
    /**
     * Get source information
     */
    getSourceInfo(): SourceConfig;
    
    /**
     * Test connection to the source
     */
    testConnection(): Promise<boolean>;
}

/**
 * Base abstract class for external source adapters
 */
export abstract class ExternalSourceAdapter implements IExternalSourceAdapter {
    protected config: SourceConfig;
    
    constructor(config: SourceConfig) {
        this.config = config;
    }
    
    abstract validate(): Promise<{ valid: boolean; error?: string }>;
    abstract sync(): Promise<SyncResult>;
    abstract testConnection(): Promise<boolean>;
    
    getSourceInfo(): SourceConfig {
        return this.config;
    }
    
    /**
     * Helper to create a success result
     */
    protected createSuccessResult(processed: number, failed: number = 0, skipped: number = 0): SyncResult {
        return {
            success: true,
            itemsProcessed: processed,
            itemsFailed: failed,
            itemsSkipped: skipped,
            errors: []
        };
    }
    
    /**
     * Helper to create a failure result
     */
    protected createFailureResult(
        error: { type: string; code?: string; message: string; details?: any },
        processed: number = 0,
        failed: number = 0,
        skipped: number = 0
    ): SyncResult {
        return {
            success: false,
            itemsProcessed: processed,
            itemsFailed: failed,
            itemsSkipped: skipped,
            errors: [error]
        };
    }
}
