/**
 * CSV Source Adapter
 * Adapter for syncing data from CSV files
 */

import fs from 'fs/promises';
import path from 'path';
import { ExternalSourceAdapter, SyncResult, SourceConfig } from './ExternalSourceAdapter';
import { contentIndexRepository, ContentIndex, ContentType } from '../../repositories/ContentIndexRepository';
import { catalogRepository, CatalogItem } from '../../repositories/CatalogRepository';

interface CSVConfig extends SourceConfig {
    sourceType: 'csv';
    sourceIdentifier: string; // File path
    options?: {
        targetTable?: 'content_index' | 'catalog_items';
        contentType?: ContentType;
        delimiter?: string;
        hasHeader?: boolean;
        encoding?: BufferEncoding;
        columnMapping?: {
            [key: string]: string; // CSV column -> DB column
        };
    };
}

/**
 * CSV Source Adapter
 * Syncs data from CSV files to content_index or catalog_items
 */
export class CSVSourceAdapter extends ExternalSourceAdapter {
    private csvConfig: CSVConfig;
    
    constructor(config: CSVConfig) {
        super(config);
        this.csvConfig = config;
    }
    
    async validate(): Promise<{ valid: boolean; error?: string }> {
        try {
            // Check if file exists
            await fs.access(this.csvConfig.sourceIdentifier);
            
            // Check if it's a CSV file
            const ext = path.extname(this.csvConfig.sourceIdentifier).toLowerCase();
            if (ext !== '.csv') {
                return { valid: false, error: 'File must be a CSV file' };
            }
            
            return { valid: true };
        } catch (error: any) {
            return { valid: false, error: `File not accessible: ${error.message}` };
        }
    }
    
    async testConnection(): Promise<boolean> {
        const validation = await this.validate();
        return validation.valid;
    }
    
    async sync(): Promise<SyncResult> {
        try {
            // Validate first
            const validation = await this.validate();
            if (!validation.valid) {
                return this.createFailureResult({
                    type: 'validation',
                    code: 'INVALID_SOURCE',
                    message: validation.error || 'Invalid CSV source'
                });
            }
            
            // Read CSV file
            const content = await fs.readFile(this.csvConfig.sourceIdentifier, this.csvConfig.options?.encoding || 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            
            if (lines.length === 0) {
                return this.createSuccessResult(0, 0, 0);
            }
            
            const delimiter = this.csvConfig.options?.delimiter || ',';
            const hasHeader = this.csvConfig.options?.hasHeader !== false; // Default true
            
            // Parse header
            let headers: string[] = [];
            let dataStartIndex = 0;
            
            if (hasHeader) {
                headers = this.parseCSVLine(lines[0], delimiter);
                dataStartIndex = 1;
            }
            
            // Determine target table
            const targetTable = this.csvConfig.options?.targetTable || 'content_index';
            
            let processed = 0;
            let failed = 0;
            let skipped = 0;
            const errors: any[] = [];
            
            // Process data rows
            for (let i = dataStartIndex; i < lines.length; i++) {
                try {
                    const values = this.parseCSVLine(lines[i], delimiter);
                    
                    if (targetTable === 'content_index') {
                        await this.syncContentIndexRow(headers, values, i);
                        processed++;
                    } else if (targetTable === 'catalog_items') {
                        await this.syncCatalogItemRow(headers, values, i);
                        processed++;
                    } else {
                        skipped++;
                    }
                } catch (error: any) {
                    failed++;
                    errors.push({
                        type: 'parsing',
                        code: 'ROW_PARSE_ERROR',
                        message: error.message,
                        itemIdentifier: `row_${i}`,
                        details: { line: lines[i] }
                    });
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
                type: 'system',
                code: 'SYNC_ERROR',
                message: error.message,
                details: error.stack
            });
        }
    }
    
    /**
     * Parse a CSV line respecting quoted values
     */
    private parseCSVLine(line: string, delimiter: string): string[] {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current.trim());
        return values;
    }
    
    /**
     * Sync a row to content_index table
     */
    private async syncContentIndexRow(headers: string[], values: string[], rowIndex: number): Promise<void> {
        const mapping = this.csvConfig.options?.columnMapping || {};
        
        // Build content object
        const content: ContentIndex = {
            content_type: this.getValueByColumn(headers, values, mapping, 'content_type', this.csvConfig.options?.contentType || 'music') as ContentType,
            title: this.getValueByColumn(headers, values, mapping, 'title', ''),
            artist: this.getValueByColumn(headers, values, mapping, 'artist'),
            genre: this.getValueByColumn(headers, values, mapping, 'genre'),
            source_type: 'csv',
            source_identifier: this.csvConfig.sourceIdentifier,
            external_id: this.getValueByColumn(headers, values, mapping, 'external_id', `row_${rowIndex}`),
            metadata: {},
            is_available: true
        };
        
        if (!content.title) {
            throw new Error('Title is required');
        }
        
        // Upsert content
        await contentIndexRepository.upsert(content);
    }
    
    /**
     * Sync a row to catalog_items table
     */
    private async syncCatalogItemRow(headers: string[], values: string[], rowIndex: number): Promise<void> {
        const mapping = this.csvConfig.options?.columnMapping || {};
        
        // Build catalog item object
        const item: CatalogItem = {
            category_id: this.getValueByColumn(headers, values, mapping, 'category_id', 'music'),
            capacity: this.getValueByColumn(headers, values, mapping, 'capacity', ''),
            capacity_gb: parseInt(this.getValueByColumn(headers, values, mapping, 'capacity_gb', '0')),
            price: parseFloat(this.getValueByColumn(headers, values, mapping, 'price', '0')),
            content_count: parseInt(this.getValueByColumn(headers, values, mapping, 'content_count', '0')),
            content_unit: this.getValueByColumn(headers, values, mapping, 'content_unit', 'items'),
            is_active: this.getValueByColumn(headers, values, mapping, 'is_active', 'true') === 'true',
            is_popular: this.getValueByColumn(headers, values, mapping, 'is_popular', 'false') === 'true',
            is_recommended: this.getValueByColumn(headers, values, mapping, 'is_recommended', 'false') === 'true',
            metadata: {}
        };
        
        if (!item.category_id || !item.capacity) {
            throw new Error('category_id and capacity are required');
        }
        
        // Check if item exists
        const existing = await catalogRepository.getItem(item.category_id, item.capacity);
        
        if (existing) {
            // Update existing item
            await catalogRepository.updateItem(
                existing.id!,
                item,
                'csv_sync',
                `CSV sync from ${path.basename(this.csvConfig.sourceIdentifier)}`
            );
        } else {
            // Create new item
            await catalogRepository.createItem(
                item,
                'csv_sync',
                `CSV sync from ${path.basename(this.csvConfig.sourceIdentifier)}`
            );
        }
    }
    
    /**
     * Get value from CSV row by column name with mapping support
     */
    private getValueByColumn(
        headers: string[],
        values: string[],
        mapping: { [key: string]: string },
        column: string,
        defaultValue?: string
    ): string {
        // Check if there's a mapping for this column
        const mappedColumn = mapping[column] || column;
        
        // Find the column index
        const index = headers.findIndex(h => h.toLowerCase() === mappedColumn.toLowerCase());
        
        if (index >= 0 && index < values.length) {
            return values[index] || (defaultValue || '');
        }
        
        return defaultValue || '';
    }
}
