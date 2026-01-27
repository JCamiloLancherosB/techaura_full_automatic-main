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

    /**
     * Get diagnostics data including watermarks and event counts
     */
    async getDiagnostics(): Promise<{
        watermarks: AnalyticsWatermark[];
        eventCounts: {
            order_events_total: number;
            order_events_since_orders_watermark: number;
            order_events_since_intent_watermark: number;
            order_events_since_followup_watermark: number;
            analytics_events_total: number;
        };
        aggregateTableCounts: {
            daily_order_stats: number;
            intent_conversion_stats: number;
            followup_performance_daily: number;
        };
    }> {
        // Get all watermarks
        const watermarks = await this.getAll();

        // Get watermark IDs for counting pending events
        const ordersWatermark = watermarks.find(w => w.name === 'orders_stats_v1');
        const intentWatermark = watermarks.find(w => w.name === 'intent_conversion_v1');
        const followupWatermark = watermarks.find(w => w.name === 'followup_performance_v1');

        // Count events in order_events table
        const [orderEventsTotal] = await db('order_events').count('* as count');
        
        // Count events since each watermark
        const [orderEventsSinceOrders] = await db('order_events')
            .where('id', '>', ordersWatermark?.last_event_id || 0)
            .count('* as count');
        
        const [orderEventsSinceIntent] = await db('order_events')
            .where('id', '>', intentWatermark?.last_event_id || 0)
            .count('* as count');
        
        const [orderEventsSinceFollowup] = await db('order_events')
            .where('id', '>', followupWatermark?.last_event_id || 0)
            .count('* as count');

        // Count analytics_events (if table exists - optional legacy table)
        let analyticsEventsTotal = 0;
        try {
            const [result] = await db('analytics_events').count('* as count');
            analyticsEventsTotal = Number(result?.count || 0);
        } catch (error: unknown) {
            // Table may not exist in database - this is expected in some configurations
            console.debug('[AnalyticsWatermarkRepository] analytics_events table not accessible:', 
                error instanceof Error ? error.message : 'Unknown error');
        }

        // Count rows in aggregate tables
        const [dailyOrderStatsCount] = await db('daily_order_stats').count('* as count');
        const [intentConversionStatsCount] = await db('intent_conversion_stats').count('* as count');
        const [followupPerformanceDailyCount] = await db('followup_performance_daily').count('* as count');

        return {
            watermarks,
            eventCounts: {
                order_events_total: Number(orderEventsTotal?.count || 0),
                order_events_since_orders_watermark: Number(orderEventsSinceOrders?.count || 0),
                order_events_since_intent_watermark: Number(orderEventsSinceIntent?.count || 0),
                order_events_since_followup_watermark: Number(orderEventsSinceFollowup?.count || 0),
                analytics_events_total: analyticsEventsTotal
            },
            aggregateTableCounts: {
                daily_order_stats: Number(dailyOrderStatsCount?.count || 0),
                intent_conversion_stats: Number(intentConversionStatsCount?.count || 0),
                followup_performance_daily: Number(followupPerformanceDailyCount?.count || 0)
            }
        };
    }
}

export const analyticsWatermarkRepository = new AnalyticsWatermarkRepository();
