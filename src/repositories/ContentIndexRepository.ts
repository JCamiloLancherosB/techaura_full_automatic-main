/**
 * Content Index Repository
 * Database access layer for content_index table
 */

import { db } from '../database/knex';

export type ContentType = 'music' | 'video' | 'movie' | 'game' | 'other';
export type ContentSourceType = 'csv' | 'api' | 'drive' | 'usb' | 'manual';

export interface ContentIndex {
    id?: number;
    content_type: ContentType;
    title: string;
    artist?: string;
    genre?: string;
    source_type: ContentSourceType;
    source_identifier: string;
    external_id?: string;
    metadata?: any;
    is_available?: boolean;
    last_synced_at?: Date;
    created_at?: Date;
    updated_at?: Date;
}

export interface ContentIndexFilter {
    content_type?: ContentType;
    source_type?: ContentSourceType;
    genre?: string;
    is_available?: boolean;
    search?: string; // Search in title or artist
}

export class ContentIndexRepository {
    private static instance: ContentIndexRepository;
    
    private constructor() {}
    
    public static getInstance(): ContentIndexRepository {
        if (!ContentIndexRepository.instance) {
            ContentIndexRepository.instance = new ContentIndexRepository();
        }
        return ContentIndexRepository.instance;
    }
    
    /**
     * Create a new content index entry
     */
    async create(content: ContentIndex): Promise<number> {
        const [id] = await db('content_index').insert({
            ...content,
            created_at: new Date(),
            updated_at: new Date(),
            last_synced_at: new Date()
        });
        return id;
    }
    
    /**
     * Get content by ID
     */
    async getById(id: number): Promise<ContentIndex | null> {
        const content = await db('content_index').where({ id }).first();
        return content || null;
    }
    
    /**
     * Get content by external ID and source
     */
    async getByExternalId(sourceType: ContentSourceType, sourceIdentifier: string, externalId: string): Promise<ContentIndex | null> {
        const content = await db('content_index')
            .where({
                source_type: sourceType,
                source_identifier: sourceIdentifier,
                external_id: externalId
            })
            .first();
        
        return content || null;
    }
    
    /**
     * Update content
     */
    async update(id: number, updates: Partial<ContentIndex>): Promise<boolean> {
        const affected = await db('content_index')
            .where({ id })
            .update({
                ...updates,
                updated_at: new Date(),
                last_synced_at: new Date()
            });
        return affected > 0;
    }
    
    /**
     * Upsert content (insert or update based on external_id)
     */
    async upsert(content: ContentIndex): Promise<number> {
        // Check if content exists
        if (content.external_id) {
            const existing = await this.getByExternalId(
                content.source_type,
                content.source_identifier,
                content.external_id
            );
            
            if (existing) {
                await this.update(existing.id!, content);
                return existing.id!;
            }
        }
        
        // Create new entry
        return this.create(content);
    }
    
    /**
     * Batch upsert content (more efficient for large imports)
     */
    async batchUpsert(contents: ContentIndex[]): Promise<{ created: number; updated: number }> {
        let created = 0;
        let updated = 0;
        
        for (const content of contents) {
            if (content.external_id) {
                const existing = await this.getByExternalId(
                    content.source_type,
                    content.source_identifier,
                    content.external_id
                );
                
                if (existing) {
                    await this.update(existing.id!, content);
                    updated++;
                } else {
                    await this.create(content);
                    created++;
                }
            } else {
                await this.create(content);
                created++;
            }
        }
        
        return { created, updated };
    }
    
    /**
     * List content with filters
     */
    async list(filter: ContentIndexFilter = {}, limit: number = 100, offset: number = 0): Promise<ContentIndex[]> {
        let query = db('content_index');
        
        if (filter.content_type) {
            query = query.where('content_type', filter.content_type);
        }
        
        if (filter.source_type) {
            query = query.where('source_type', filter.source_type);
        }
        
        if (filter.genre) {
            query = query.where('genre', filter.genre);
        }
        
        if (filter.is_available !== undefined) {
            query = query.where('is_available', filter.is_available);
        }
        
        if (filter.search) {
            query = query.where(function() {
                this.where('title', 'like', `%${filter.search}%`)
                    .orWhere('artist', 'like', `%${filter.search}%`);
            });
        }
        
        return query
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);
    }
    
    /**
     * Count content with filters
     */
    async count(filter: ContentIndexFilter = {}): Promise<number> {
        let query = db('content_index');
        
        if (filter.content_type) {
            query = query.where('content_type', filter.content_type);
        }
        
        if (filter.source_type) {
            query = query.where('source_type', filter.source_type);
        }
        
        if (filter.genre) {
            query = query.where('genre', filter.genre);
        }
        
        if (filter.is_available !== undefined) {
            query = query.where('is_available', filter.is_available);
        }
        
        if (filter.search) {
            query = query.where(function() {
                this.where('title', 'like', `%${filter.search}%`)
                    .orWhere('artist', 'like', `%${filter.search}%`);
            });
        }
        
        const result = await query.count('* as count').first();
        return Number(result?.count || 0);
    }
    
    /**
     * Get content statistics
     */
    async getStats(): Promise<{
        total: number;
        available: number;
        by_type: Array<{ content_type: string; count: number }>;
        by_source: Array<{ source_type: string; count: number }>;
    }> {
        // Get total count
        const totalResult = await db('content_index')
            .count('* as count')
            .first();
        
        const total = Number(totalResult?.count || 0);
        
        // Get available count
        const availableResult = await db('content_index')
            .where('is_available', true)
            .count('* as count')
            .first();
        
        const available = Number(availableResult?.count || 0);
        
        // Get by type
        const byType = await db('content_index')
            .select('content_type')
            .count('* as count')
            .groupBy('content_type')
            .orderBy('count', 'desc');
        
        // Get by source
        const bySource = await db('content_index')
            .select('source_type')
            .count('* as count')
            .groupBy('source_type')
            .orderBy('count', 'desc');
        
        return {
            total,
            available,
            by_type: byType.map(row => ({
                content_type: row.content_type,
                count: Number(row.count)
            })),
            by_source: bySource.map(row => ({
                source_type: row.source_type,
                count: Number(row.count)
            }))
        };
    }
    
    /**
     * Mark content as unavailable for a source
     */
    async markSourceUnavailable(sourceType: ContentSourceType, sourceIdentifier: string): Promise<number> {
        return db('content_index')
            .where({
                source_type: sourceType,
                source_identifier: sourceIdentifier
            })
            .update({
                is_available: false,
                updated_at: new Date()
            });
    }
    
    /**
     * Delete old content not synced recently
     */
    async cleanupOld(daysToKeep: number = 90): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        return db('content_index')
            .where('last_synced_at', '<', cutoffDate)
            .delete();
    }
}

// Export singleton instance
export const contentIndexRepository = ContentIndexRepository.getInstance();
