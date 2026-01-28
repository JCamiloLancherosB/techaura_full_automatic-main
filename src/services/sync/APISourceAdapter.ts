/**
 * API Source Adapter
 * Adapter for syncing data from REST APIs
 */

import axios, { AxiosInstance } from 'axios';
import { ExternalSourceAdapter, SyncResult, SourceConfig } from './ExternalSourceAdapter';
import { contentIndexRepository, ContentIndex, ContentType } from '../../repositories/ContentIndexRepository';

interface APIConfig extends SourceConfig {
    sourceType: 'api';
    sourceIdentifier: string; // API URL
    options?: {
        method?: 'GET' | 'POST';
        headers?: { [key: string]: string };
        auth?: {
            type: 'bearer' | 'basic' | 'apikey';
            token?: string;
            username?: string;
            password?: string;
            apiKeyHeader?: string;
            apiKeyValue?: string;
        };
        dataPath?: string; // JSONPath to extract data array from response
        contentType?: ContentType;
        fieldMapping?: {
            [key: string]: string; // API field -> DB field
        };
        pagination?: {
            enabled: boolean;
            type: 'offset' | 'page' | 'cursor';
            limitParam?: string;
            offsetParam?: string;
            pageParam?: string;
            cursorParam?: string;
            maxPages?: number;
        };
    };
}

/**
 * API Source Adapter
 * Syncs data from REST APIs to content_index
 */
export class APISourceAdapter extends ExternalSourceAdapter {
    private apiConfig: APIConfig;
    private client: AxiosInstance;
    
    constructor(config: APIConfig) {
        super(config);
        this.apiConfig = config;
        
        // Create axios instance with config
        this.client = axios.create({
            baseURL: this.apiConfig.sourceIdentifier,
            timeout: 30000,
            headers: this.apiConfig.options?.headers || {}
        });
        
        // Setup authentication
        this.setupAuth();
    }
    
    private setupAuth(): void {
        const auth = this.apiConfig.options?.auth;
        if (!auth) return;
        
        switch (auth.type) {
            case 'bearer':
                if (auth.token) {
                    this.client.defaults.headers.common['Authorization'] = `Bearer ${auth.token}`;
                }
                break;
            case 'basic':
                if (auth.username && auth.password) {
                    this.client.defaults.auth = {
                        username: auth.username,
                        password: auth.password
                    };
                }
                break;
            case 'apikey':
                if (auth.apiKeyHeader && auth.apiKeyValue) {
                    this.client.defaults.headers.common[auth.apiKeyHeader] = auth.apiKeyValue;
                }
                break;
        }
    }
    
    async validate(): Promise<{ valid: boolean; error?: string }> {
        try {
            // Validate URL
            new URL(this.apiConfig.sourceIdentifier);
            return { valid: true };
        } catch (error: any) {
            return { valid: false, error: `Invalid URL: ${error.message}` };
        }
    }
    
    async testConnection(): Promise<boolean> {
        try {
            const method = this.apiConfig.options?.method || 'GET';
            const response = await this.client.request({
                method,
                url: '',
                params: { limit: 1 } // Test with minimal data
            });
            
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            return false;
        }
    }
    
    async sync(): Promise<SyncResult> {
        try {
            // Validate first
            const validation = await this.validate();
            if (!validation.valid) {
                return this.createFailureResult({
                    type: 'validation',
                    code: 'INVALID_SOURCE',
                    message: validation.error || 'Invalid API source'
                });
            }
            
            let processed = 0;
            let failed = 0;
            let skipped = 0;
            const errors: any[] = [];
            
            // Check if pagination is enabled
            const pagination = this.apiConfig.options?.pagination;
            
            if (pagination?.enabled) {
                // Paginated sync
                const result = await this.syncWithPagination();
                processed = result.itemsProcessed;
                failed = result.itemsFailed;
                skipped = result.itemsSkipped;
                errors.push(...result.errors);
            } else {
                // Single request sync
                const method = this.apiConfig.options?.method || 'GET';
                const response = await this.client.request({
                    method,
                    url: ''
                });
                
                const items = this.extractDataFromResponse(response.data);
                
                for (const item of items) {
                    try {
                        await this.syncContentItem(item);
                        processed++;
                    } catch (error: any) {
                        failed++;
                        errors.push({
                            type: 'processing',
                            code: 'ITEM_SYNC_ERROR',
                            message: error.message,
                            itemIdentifier: this.getItemIdentifier(item),
                            details: item
                        });
                    }
                }
            }
            
            return {
                success: failed === 0,
                itemsProcessed: processed,
                itemsFailed: failed,
                itemsSkipped: skipped,
                errors
            };
            
        } catch (error: any) {
            return this.createFailureResult({
                type: 'network',
                code: 'API_ERROR',
                message: error.message,
                details: error.response?.data || error.stack
            });
        }
    }
    
    /**
     * Sync with pagination support
     */
    private async syncWithPagination(): Promise<SyncResult> {
        let processed = 0;
        let failed = 0;
        const skipped = 0;
        const errors: any[] = [];
        
        const pagination = this.apiConfig.options!.pagination!;
        const maxPages = pagination.maxPages || 100;
        let currentPage = 0;
        let hasMore = true;
        let cursor: string | undefined;
        
        while (hasMore && currentPage < maxPages) {
            try {
                const params: any = {};
                
                // Build pagination params
                switch (pagination.type) {
                    case 'offset':
                        params[pagination.limitParam || 'limit'] = 100;
                        params[pagination.offsetParam || 'offset'] = currentPage * 100;
                        break;
                    case 'page':
                        params[pagination.limitParam || 'limit'] = 100;
                        params[pagination.pageParam || 'page'] = currentPage + 1;
                        break;
                    case 'cursor':
                        if (cursor) {
                            params[pagination.cursorParam || 'cursor'] = cursor;
                        }
                        params[pagination.limitParam || 'limit'] = 100;
                        break;
                }
                
                const method = this.apiConfig.options?.method || 'GET';
                const response = await this.client.request({
                    method,
                    url: '',
                    params
                });
                
                const items = this.extractDataFromResponse(response.data);
                
                if (items.length === 0) {
                    hasMore = false;
                    break;
                }
                
                for (const item of items) {
                    try {
                        await this.syncContentItem(item);
                        processed++;
                    } catch (error: any) {
                        failed++;
                        errors.push({
                            type: 'processing',
                            code: 'ITEM_SYNC_ERROR',
                            message: error.message,
                            itemIdentifier: this.getItemIdentifier(item),
                            details: item
                        });
                    }
                }
                
                // Update cursor for next iteration
                if (pagination.type === 'cursor') {
                    cursor = this.extractCursor(response.data);
                    if (!cursor) {
                        hasMore = false;
                    }
                }
                
                currentPage++;
                
            } catch (error: any) {
                errors.push({
                    type: 'network',
                    code: 'PAGINATION_ERROR',
                    message: error.message,
                    itemIdentifier: `page_${currentPage}`,
                    details: error.response?.data
                });
                hasMore = false;
            }
        }
        
        return {
            success: failed === 0,
            itemsProcessed: processed,
            itemsFailed: failed,
            itemsSkipped: skipped,
            errors
        };
    }
    
    /**
     * Extract data array from API response using dataPath
     */
    private extractDataFromResponse(data: any): any[] {
        const dataPath = this.apiConfig.options?.dataPath;
        
        if (!dataPath) {
            // If no path specified, assume data is the array or has a 'data' property
            if (Array.isArray(data)) {
                return data;
            }
            if (data.data && Array.isArray(data.data)) {
                return data.data;
            }
            if (data.items && Array.isArray(data.items)) {
                return data.items;
            }
            return [];
        }
        
        // Simple JSONPath implementation (supports dot notation)
        const paths = dataPath.split('.');
        let current = data;
        
        for (const path of paths) {
            if (current && typeof current === 'object' && path in current) {
                current = current[path];
            } else {
                return [];
            }
        }
        
        return Array.isArray(current) ? current : [];
    }
    
    /**
     * Extract cursor for pagination
     */
    private extractCursor(data: any): string | undefined {
        // Common cursor locations
        if (data.cursor) return data.cursor;
        if (data.nextCursor) return data.nextCursor;
        if (data.next_cursor) return data.next_cursor;
        if (data.pagination?.cursor) return data.pagination.cursor;
        if (data.pagination?.nextCursor) return data.pagination.nextCursor;
        return undefined;
    }
    
    /**
     * Sync a single content item
     */
    private async syncContentItem(item: any): Promise<void> {
        const mapping = this.apiConfig.options?.fieldMapping || {};
        
        const content: ContentIndex = {
            content_type: this.getField(item, mapping, 'content_type', this.apiConfig.options?.contentType || 'music') as ContentType,
            title: this.getField(item, mapping, 'title', ''),
            artist: this.getField(item, mapping, 'artist'),
            genre: this.getField(item, mapping, 'genre'),
            source_type: 'api',
            source_identifier: this.apiConfig.sourceIdentifier,
            external_id: this.getField(item, mapping, 'external_id', this.getItemIdentifier(item)),
            metadata: item,
            is_available: true
        };
        
        if (!content.title) {
            throw new Error('Title is required');
        }
        
        await contentIndexRepository.upsert(content);
    }
    
    /**
     * Get field value from item with mapping support
     */
    private getField(item: any, mapping: { [key: string]: string }, field: string, defaultValue?: string): string {
        const mappedField = mapping[field] || field;
        
        // Support dot notation for nested fields
        const paths = mappedField.split('.');
        let current = item;
        
        for (const path of paths) {
            if (current && typeof current === 'object' && path in current) {
                current = current[path];
            } else {
                return defaultValue || '';
            }
        }
        
        return String(current || defaultValue || '');
    }
    
    /**
     * Get item identifier (try common ID fields)
     */
    private getItemIdentifier(item: any): string {
        return item.id || item._id || item.external_id || item.uuid || JSON.stringify(item).substring(0, 50);
    }
}
