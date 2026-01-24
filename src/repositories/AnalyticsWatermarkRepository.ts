/**
 * Repository for analytics_watermarks table
 * Manages watermarks for incremental analytics processing
 */

import { db } from '../database/knex';

export interface AnalyticsWatermark {
    id?: number;
    name: string;
    last_event_id?: number;
    last_processed_at?: Date;
    total_processed?: number;
    metadata?: string;
    created_at?: Date;
    updated_at?: Date;
}

export class AnalyticsWatermarkRepository {
    /**
     * Get watermark by name
     */
    async getByName(name: string): Promise<AnalyticsWatermark | null> {
        const watermark = await db('analytics_watermarks')
            .where({ name })
            .first();
        
        return watermark || null;
    }

    /**
     * Update watermark
     */
    async update(name: string, updates: Partial<AnalyticsWatermark>): Promise<void> {
        await db('analytics_watermarks')
            .where({ name })
            .update({
                ...updates,
                updated_at: db.fn.now()
            });
    }

    /**
     * Increment watermark by event ID
     */
    async incrementByEventId(name: string, lastEventId: number, processedCount: number = 1): Promise<void> {
        await db('analytics_watermarks')
            .where({ name })
            .update({
                last_event_id: lastEventId,
                last_processed_at: db.fn.now(),
                total_processed: db.raw('total_processed + ?', [processedCount]),
                updated_at: db.fn.now()
            });
    }

    /**
     * Create or update watermark
     */
    async upsert(watermark: AnalyticsWatermark): Promise<void> {
        const existing = await this.getByName(watermark.name);
        
        if (existing) {
            await this.update(watermark.name, watermark);
        } else {
            await db('analytics_watermarks').insert({
                ...watermark,
                created_at: db.fn.now(),
                updated_at: db.fn.now()
            });
        }
    }

    /**
     * Get all watermarks
     */
    async getAll(): Promise<AnalyticsWatermark[]> {
        return db('analytics_watermarks').select('*');
    }
}

export const analyticsWatermarkRepository = new AnalyticsWatermarkRepository();
