/**
 * AnalyticsRefresher Service
 * Implements watermark-based incremental analytics processing
 * Processes new events and updates aggregated statistics
 */

import { pool } from '../mysql-database';
import { 
    analyticsWatermarkRepository,
    AnalyticsWatermark 
} from '../repositories/AnalyticsWatermarkRepository';
import { 
    analyticsStatsRepository,
    DailyOrderStats,
    IntentConversionStats,
    FollowupPerformanceDaily 
} from '../repositories/AnalyticsStatsRepository';
import { unifiedLogger } from '../utils/unifiedLogger';

interface OrderEventRow {
    id: number;
    order_number?: string;
    phone: string;
    event_type: string;
    event_source: string;
    event_data?: string;
    created_at: Date;
}

export class AnalyticsRefresher {
    private isRunning: boolean = false;
    private refreshInterval: NodeJS.Timeout | null = null;

    /**
     * Start the analytics refresher with scheduled updates
     */
    async start(intervalMinutes: number = 3): Promise<void> {
        unifiedLogger.info('analytics', 'Starting AnalyticsRefresher', { intervalMinutes });
        
        // Run initial catch-up on startup
        await this.runCatchUp();
        
        // Schedule periodic refresh
        this.refreshInterval = setInterval(async () => {
            await this.refresh();
        }, intervalMinutes * 60 * 1000);

        unifiedLogger.info('analytics', 'AnalyticsRefresher started successfully');
    }

    /**
     * Stop the analytics refresher
     */
    stop(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        unifiedLogger.info('analytics', 'AnalyticsRefresher stopped');
    }

    /**
     * Run catch-up processing from last watermark
     * This runs on startup to process any missed events
     */
    async runCatchUp(): Promise<void> {
        unifiedLogger.info('analytics', 'Running catch-up from last watermark');
        
        try {
            // Process all analytics types
            await this.processOrderStats();
            await this.processIntentConversionStats();
            await this.processFollowupPerformance();
            
            unifiedLogger.info('analytics', 'Catch-up completed successfully');
        } catch (error) {
            unifiedLogger.error('analytics', 'Error during catch-up', { error });
            throw error;
        }
    }

    /**
     * Refresh all analytics
     */
    async refresh(): Promise<void> {
        if (this.isRunning) {
            unifiedLogger.debug('analytics', 'Refresh already running, skipping');
            return;
        }

        this.isRunning = true;
        
        try {
            await this.processOrderStats();
            await this.processIntentConversionStats();
            await this.processFollowupPerformance();
        } catch (error) {
            unifiedLogger.error('analytics', 'Error during refresh', { error });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Process order statistics from order_events
     */
    private async processOrderStats(): Promise<void> {
        const watermarkName = 'orders_stats_v1';
        
        try {
            // Get current watermark
            const watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                unifiedLogger.error('analytics', 'Watermark not found', { watermarkName });
                return;
            }

            const lastEventId = watermark.last_event_id || 0;
            
            // Get new order events since watermark
            const [newEvents] = await pool.execute<any[]>(
                `SELECT id, order_number, phone, event_type, event_source, event_data, created_at
                 FROM order_events 
                 WHERE id > ? 
                 AND event_type IN ('order_initiated', 'order_confirmed', 'order_cancelled')
                 ORDER BY id ASC
                 LIMIT 1000`,
                [lastEventId]
            );

            if (!newEvents || newEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new order events to process', { watermarkName });
                return;
            }

            // Group events by date
            const eventsByDate = this.groupEventsByDate(newEvents);
            
            // Process each date
            for (const [dateStr, events] of Object.entries(eventsByDate)) {
                await this.aggregateOrderStatsForDate(new Date(dateStr), events as OrderEventRow[]);
            }

            // Update watermark
            const maxEventId = Math.max(...newEvents.map((e: OrderEventRow) => e.id));
            await analyticsWatermarkRepository.incrementByEventId(
                watermarkName, 
                maxEventId, 
                newEvents.length
            );

            unifiedLogger.info('analytics', 'Processed order stats', { 
                eventsProcessed: newEvents.length,
                maxEventId 
            });
        } catch (error) {
            unifiedLogger.error('analytics', 'Error processing order stats', { error });
        }
    }

    /**
     * Process intent conversion statistics
     */
    private async processIntentConversionStats(): Promise<void> {
        const watermarkName = 'intent_conversion_v1';
        
        try {
            // Get current watermark
            const watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                unifiedLogger.error('analytics', 'Watermark not found', { watermarkName });
                return;
            }

            const lastEventId = watermark.last_event_id || 0;
            
            // Get new order events with intent data
            const [newEvents] = await pool.execute<any[]>(
                `SELECT id, event_type, event_data, created_at
                 FROM order_events 
                 WHERE id > ? 
                 AND event_data IS NOT NULL
                 ORDER BY id ASC
                 LIMIT 1000`,
                [lastEventId]
            );

            if (!newEvents || newEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new intent events to process', { watermarkName });
                return;
            }

            // Group events by date and intent
            const intentsByDate = this.groupIntentsByDate(newEvents);
            
            // Process each date and intent combination
            for (const [dateStr, intents] of Object.entries(intentsByDate)) {
                for (const [intent, intentData] of Object.entries(intents as Record<string, any>)) {
                    await this.aggregateIntentStatsForDate(new Date(dateStr), intent, intentData);
                }
            }

            // Update watermark
            const maxEventId = Math.max(...newEvents.map((e: OrderEventRow) => e.id));
            await analyticsWatermarkRepository.incrementByEventId(
                watermarkName, 
                maxEventId, 
                newEvents.length
            );

            unifiedLogger.info('analytics', 'Processed intent conversion stats', { 
                eventsProcessed: newEvents.length,
                maxEventId 
            });
        } catch (error) {
            unifiedLogger.error('analytics', 'Error processing intent stats', { error });
        }
    }

    /**
     * Process follow-up performance statistics
     */
    private async processFollowupPerformance(): Promise<void> {
        const watermarkName = 'followup_performance_v1';
        
        try {
            // Get current watermark
            const watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                unifiedLogger.error('analytics', 'Watermark not found', { watermarkName });
                return;
            }

            const lastEventId = watermark.last_event_id || 0;
            
            // Get new follow-up events
            const [newEvents] = await pool.execute<any[]>(
                `SELECT id, event_type, phone, event_data, created_at
                 FROM order_events 
                 WHERE id > ? 
                 AND event_type LIKE 'followup_%'
                 ORDER BY id ASC
                 LIMIT 1000`,
                [lastEventId]
            );

            if (!newEvents || newEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new followup events to process', { watermarkName });
                return;
            }

            // Group events by date
            const eventsByDate = this.groupEventsByDate(newEvents);
            
            // Process each date
            for (const [dateStr, events] of Object.entries(eventsByDate)) {
                await this.aggregateFollowupStatsForDate(new Date(dateStr), events as OrderEventRow[]);
            }

            // Update watermark
            const maxEventId = Math.max(...newEvents.map((e: OrderEventRow) => e.id));
            await analyticsWatermarkRepository.incrementByEventId(
                watermarkName, 
                maxEventId, 
                newEvents.length
            );

            unifiedLogger.info('analytics', 'Processed followup performance stats', { 
                eventsProcessed: newEvents.length,
                maxEventId 
            });
        } catch (error) {
            unifiedLogger.error('analytics', 'Error processing followup stats', { error });
        }
    }

    /**
     * Group events by date
     */
    private groupEventsByDate(events: OrderEventRow[]): Record<string, OrderEventRow[]> {
        const grouped: Record<string, OrderEventRow[]> = {};
        
        for (const event of events) {
            const dateStr = new Date(event.created_at).toISOString().split('T')[0];
            if (!grouped[dateStr]) {
                grouped[dateStr] = [];
            }
            grouped[dateStr].push(event);
        }
        
        return grouped;
    }

    /**
     * Group events by date and intent
     */
    private groupIntentsByDate(events: OrderEventRow[]): Record<string, Record<string, any>> {
        const grouped: Record<string, Record<string, any>> = {};
        
        for (const event of events) {
            try {
                const eventData = event.event_data ? JSON.parse(event.event_data) : {};
                const intent = eventData.intent || 'unknown';
                const confidence = eventData.confidence || 0;
                const dateStr = new Date(event.created_at).toISOString().split('T')[0];
                
                if (!grouped[dateStr]) {
                    grouped[dateStr] = {};
                }
                if (!grouped[dateStr][intent]) {
                    grouped[dateStr][intent] = {
                        count: 0,
                        conversions: 0,
                        totalConfidence: 0
                    };
                }
                
                grouped[dateStr][intent].count++;
                grouped[dateStr][intent].totalConfidence += confidence;
                
                // Count as conversion if event_type indicates success
                if (event.event_type === 'order_confirmed') {
                    grouped[dateStr][intent].conversions++;
                }
            } catch (error) {
                unifiedLogger.debug('analytics', 'Error parsing event data', { eventId: event.id });
            }
        }
        
        return grouped;
    }

    /**
     * Aggregate order stats for a specific date
     */
    private async aggregateOrderStatsForDate(date: Date, events: OrderEventRow[]): Promise<void> {
        const stats: DailyOrderStats = {
            date,
            orders_initiated: events.filter(e => e.event_type === 'order_initiated').length,
            orders_completed: events.filter(e => e.event_type === 'order_confirmed').length,
            orders_cancelled: events.filter(e => e.event_type === 'order_cancelled').length,
            unique_users: new Set(events.map(e => e.phone)).size
        };

        // Calculate revenue (would need to query orders table for actual amounts)
        // For now, using estimated values from event_data
        let totalRevenue = 0;
        for (const event of events) {
            if (event.event_type === 'order_confirmed' && event.event_data) {
                try {
                    const data = JSON.parse(event.event_data);
                    totalRevenue += data.amount || 0;
                } catch (error) {
                    // Ignore parsing errors
                }
            }
        }

        stats.total_revenue = totalRevenue;
        stats.average_order_value = stats.orders_completed > 0 
            ? totalRevenue / stats.orders_completed 
            : 0;
        stats.conversion_rate = stats.orders_initiated > 0
            ? (stats.orders_completed / stats.orders_initiated) * 100
            : 0;

        await analyticsStatsRepository.upsertDailyOrderStats(stats);
    }

    /**
     * Aggregate intent stats for a specific date and intent
     */
    private async aggregateIntentStatsForDate(date: Date, intent: string, intentData: any): Promise<void> {
        const stats: IntentConversionStats = {
            date,
            intent,
            intent_count: intentData.count,
            successful_conversions: intentData.conversions,
            conversion_rate: intentData.count > 0
                ? (intentData.conversions / intentData.count) * 100
                : 0,
            avg_confidence: intentData.count > 0
                ? intentData.totalConfidence / intentData.count
                : 0
        };

        await analyticsStatsRepository.upsertIntentConversionStats(stats);
    }

    /**
     * Aggregate follow-up stats for a specific date
     */
    private async aggregateFollowupStatsForDate(date: Date, events: OrderEventRow[]): Promise<void> {
        const stats: FollowupPerformanceDaily = {
            date,
            followups_sent: events.filter(e => e.event_type === 'followup_sent').length,
            followups_responded: events.filter(e => e.event_type === 'followup_responded').length
        };

        stats.response_rate = stats.followups_sent > 0
            ? (stats.followups_responded / stats.followups_sent) * 100
            : 0;

        // Count orders resulting from follow-ups
        stats.followup_orders = events.filter(e => 
            e.event_type === 'order_confirmed' && 
            e.event_data && 
            e.event_data.includes('followup')
        ).length;

        await analyticsStatsRepository.upsertFollowupPerformanceDaily(stats);
    }
}

export const analyticsRefresher = new AnalyticsRefresher();
