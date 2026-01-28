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
    FollowupPerformanceDaily,
    StageFunnelDaily,
    FollowupBlockedDaily
} from '../repositories/AnalyticsStatsRepository';
import { chatbotEventRepository } from '../repositories/ChatbotEventRepository';
import { unifiedLogger } from '../utils/unifiedLogger';
import { toSafeInt } from '../utils/numberUtils';

// Constants for watermark names
const WATERMARK_NAMES = {
    ORDERS_STATS: 'orders_stats_v1',
    INTENT_CONVERSION: 'intent_conversion_v1',
    FOLLOWUP_PERFORMANCE: 'followup_performance_v1',
    STAGE_FUNNEL: 'stage_funnel_v1',
    FOLLOWUP_BLOCKED: 'followup_blocked_v1'
} as const;

// Configuration constants
const BATCH_SIZE_LIMIT = 1000; // Maximum events to process per batch

interface OrderEventRow {
    id: number;
    order_number?: string;
    phone: string;
    event_type: string;
    event_source: string;
    event_data?: string;
    created_at: Date;
}

// Configuration for stale watermark detection
const STALE_WATERMARK_CYCLES_THRESHOLD = 3; // Alert after N cycles without progress

// Interface to track watermark state per pipeline
interface WatermarkState {
    lastEventId: number;
    cyclesWithoutProgress: number;
    hasNewEventsWithoutProgress: boolean;
}

export class AnalyticsRefresher {
    private isRunning: boolean = false;
    private refreshInterval: NodeJS.Timeout | null = null;
    private schemaChecked: boolean = false;
    private schemaAvailable: boolean = true;
    private schemaWarningLogged: boolean = false;
    private chatbotEventsTableChecked: boolean = false;
    private chatbotEventsTableAvailable: boolean = false;
    private chatbotEventsTableWarningLogged: boolean = false;
    
    // Track watermark states for stale detection
    private watermarkStates: Map<string, WatermarkState> = new Map();

    /**
     * Start the analytics refresher with scheduled updates
     */
    async start(intervalMinutes: number = 3): Promise<void> {
        unifiedLogger.info('analytics', 'Starting AnalyticsRefresher', { intervalMinutes });

        if (!(await this.ensureSchemaAvailable())) {
            return;
        }
        
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

    private async ensureSchemaAvailable(): Promise<boolean> {
        if (this.schemaChecked) {
            return this.schemaAvailable;
        }

        this.schemaChecked = true;

        try {
            const [tables] = await pool.execute<any[]>(
                `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analytics_watermarks'`
            );
            this.schemaAvailable = Array.isArray(tables) && tables.length > 0;
        } catch (error) {
            this.schemaAvailable = false;
        }

        if (!this.schemaAvailable && !this.schemaWarningLogged) {
            unifiedLogger.warn('analytics', 'AnalyticsRefresher disabled until migrations applied', {
                missingTable: 'analytics_watermarks'
            });
            this.schemaWarningLogged = true;
        }

        return this.schemaAvailable;
    }

    /**
     * Check if the chatbot_events table exists
     * Required for stage funnel and blocked followup stats processing
     */
    private async ensureChatbotEventsTableAvailable(): Promise<boolean> {
        if (this.chatbotEventsTableChecked) {
            return this.chatbotEventsTableAvailable;
        }

        this.chatbotEventsTableChecked = true;

        try {
            const [tables] = await pool.execute<any[]>(
                `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chatbot_events'`
            );
            this.chatbotEventsTableAvailable = Array.isArray(tables) && tables.length > 0;
        } catch (error) {
            this.chatbotEventsTableAvailable = false;
        }

        if (!this.chatbotEventsTableAvailable && !this.chatbotEventsTableWarningLogged) {
            unifiedLogger.warn('analytics', 'chatbot_events table not available, skipping stage funnel and blocked followup stats', {
                missingTable: 'chatbot_events'
            });
            this.chatbotEventsTableWarningLogged = true;
        }

        return this.chatbotEventsTableAvailable;
    }

    /**
     * Track watermark progress and detect stale watermarks
     * Logs a warning when a watermark doesn't progress for N cycles but events exist
     * 
     * @param watermarkName - The name of the watermark being tracked
     * @param currentEventId - The current event ID from the watermark
     * @param hasNewEvents - Whether new events were found and processed
     */
    private trackWatermarkProgress(
        watermarkName: string,
        currentEventId: number,
        hasNewEvents: boolean
    ): void {
        const state = this.watermarkStates.get(watermarkName) || {
            lastEventId: 0,
            cyclesWithoutProgress: 0,
            hasNewEventsWithoutProgress: false
        };
        
        const eventIdChanged = currentEventId !== state.lastEventId;
        
        if (eventIdChanged) {
            // Watermark progressed - reset counter
            state.lastEventId = currentEventId;
            state.cyclesWithoutProgress = 0;
            state.hasNewEventsWithoutProgress = false;
        } else if (!hasNewEvents) {
            // No new events and watermark didn't change - this is normal
            // Don't increment counter since there's nothing to process
        } else {
            // New events exist but watermark didn't change - potential issue
            state.cyclesWithoutProgress++;
            state.hasNewEventsWithoutProgress = true;
            
            if (state.cyclesWithoutProgress >= STALE_WATERMARK_CYCLES_THRESHOLD) {
                unifiedLogger.warn('analytics', 'Stale watermark detected - events exist but watermark not moving', {
                    watermarkName,
                    currentEventId,
                    cyclesWithoutProgress: state.cyclesWithoutProgress,
                    threshold: STALE_WATERMARK_CYCLES_THRESHOLD
                });
            }
        }
        
        this.watermarkStates.set(watermarkName, state);
    }

    /**
     * Get current stale watermark status (for admin endpoint)
     */
    getStaleWatermarkStatus(): Array<{
        watermarkName: string;
        cyclesWithoutProgress: number;
        hasNewEventsWithoutProgress: boolean;
        isStale: boolean;
    }> {
        const results: Array<{
            watermarkName: string;
            cyclesWithoutProgress: number;
            hasNewEventsWithoutProgress: boolean;
            isStale: boolean;
        }> = [];
        
        for (const [watermarkName, state] of this.watermarkStates.entries()) {
            results.push({
                watermarkName,
                cyclesWithoutProgress: state.cyclesWithoutProgress,
                hasNewEventsWithoutProgress: state.hasNewEventsWithoutProgress,
                isStale: state.cyclesWithoutProgress >= STALE_WATERMARK_CYCLES_THRESHOLD
            });
        }
        
        return results;
    }

    /**
     * Run catch-up processing from last watermark
     * This runs on startup to process any missed events
     */
    async runCatchUp(): Promise<void> {
        unifiedLogger.info('analytics', 'Running catch-up from last watermark');

        if (!(await this.ensureSchemaAvailable())) {
            return;
        }
        
        try {
            // Process all analytics types
            await this.processOrderStats();
            await this.processIntentConversionStats();
            await this.processFollowupPerformance();
            await this.processStageFunnelStats();
            await this.processFollowupBlockedStats();
            
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
        if (!(await this.ensureSchemaAvailable())) {
            return;
        }

        if (this.isRunning) {
            unifiedLogger.debug('analytics', 'Refresh already running, skipping');
            return;
        }

        this.isRunning = true;
        
        try {
            await this.processOrderStats();
            await this.processIntentConversionStats();
            await this.processFollowupPerformance();
            await this.processStageFunnelStats();
            await this.processFollowupBlockedStats();
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
        const watermarkName = WATERMARK_NAMES.ORDERS_STATS;
        
        try {
            // Get current watermark
            const watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                unifiedLogger.error('analytics', 'Watermark not found', { watermarkName });
                return;
            }

            const lastEventId = toSafeInt(watermark.last_event_id, { min: 0, fallback: 0 });
            
            // Get new order events since watermark
            const [newEvents] = await pool.query<any[]>(
                `SELECT id, order_number, phone, event_type, event_source, event_data, created_at
                 FROM order_events 
                 WHERE id > ? 
                 AND event_type IN ('order_initiated', 'order_confirmed', 'order_cancelled')
                 ORDER BY id ASC
                 LIMIT ?`,
                [lastEventId, toSafeInt(BATCH_SIZE_LIMIT, { min: 1 })]
            );

            if (!newEvents || newEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new order events to process', { watermarkName });
                // Track that no new events exist (watermark is up to date)
                this.trackWatermarkProgress(watermarkName, lastEventId, false);
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
            
            // Track watermark progress
            this.trackWatermarkProgress(watermarkName, maxEventId, true);

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
        const watermarkName = WATERMARK_NAMES.INTENT_CONVERSION;
        
        try {
            // Get current watermark
            const watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                unifiedLogger.error('analytics', 'Watermark not found', { watermarkName });
                return;
            }

            const lastEventId = toSafeInt(watermark.last_event_id, { min: 0, fallback: 0 });
            
            // Get new order events with intent data
            const [newEvents] = await pool.query<any[]>(
                `SELECT id, event_type, event_data, created_at
                 FROM order_events 
                 WHERE id > ? 
                 AND event_data IS NOT NULL
                 ORDER BY id ASC
                 LIMIT ?`,
                [lastEventId, toSafeInt(BATCH_SIZE_LIMIT, { min: 1 })]
            );

            if (!newEvents || newEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new intent events to process', { watermarkName });
                // Track that no new events exist (watermark is up to date)
                this.trackWatermarkProgress(watermarkName, lastEventId, false);
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
            
            // Track watermark progress
            this.trackWatermarkProgress(watermarkName, maxEventId, true);

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
     * Enhanced to process events from both order_events and chatbot_events tables
     */
    private async processFollowupPerformance(): Promise<void> {
        const watermarkName = WATERMARK_NAMES.FOLLOWUP_PERFORMANCE;
        
        try {
            // Get current watermark
            const watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                unifiedLogger.error('analytics', 'Watermark not found', { watermarkName });
                return;
            }

            const lastEventId = toSafeInt(watermark.last_event_id, { min: 0, fallback: 0 });
            
            // Get new follow-up events from order_events (legacy)
            const [newOrderEvents] = await pool.query<any[]>(
                `SELECT id, event_type, phone, event_data, created_at
                 FROM order_events 
                 WHERE id > ? 
                 AND event_type LIKE 'followup_%'
                 ORDER BY id ASC
                 LIMIT ?`,
                [lastEventId, toSafeInt(BATCH_SIZE_LIMIT, { min: 1 })]
            );

            // Also get follow-up events from chatbot_events table
            let chatbotFollowupEvents: any[] = [];
            if (await this.ensureChatbotEventsTableAvailable()) {
                chatbotFollowupEvents = await chatbotEventRepository.getFollowupPerformanceEvents(
                    lastEventId, 
                    BATCH_SIZE_LIMIT
                );
            }

            const allEvents = [
                ...(newOrderEvents || []).map((e: OrderEventRow) => ({
                    id: e.id,
                    event_type: e.event_type,
                    phone: e.phone,
                    created_at: e.created_at,
                    source: 'order_events' as const
                })),
                ...chatbotFollowupEvents.map(e => ({
                    id: e.id,
                    event_type: e.event_type,
                    phone: e.phone,
                    created_at: e.created_at,
                    source: 'chatbot_events' as const
                }))
            ];

            if (allEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new followup events to process', { watermarkName });
                // Track that no new events exist (watermark is up to date)
                this.trackWatermarkProgress(watermarkName, lastEventId, false);
                return;
            }

            // Group events by date
            const eventsByDate = this.groupFollowupEventsByDate(allEvents);
            
            // Process each date
            for (const [dateStr, events] of Object.entries(eventsByDate)) {
                await this.aggregateFollowupPerformanceStatsForDate(new Date(dateStr), events);
            }

            // Update watermark (use max ID from both sources)
            const maxEventId = Math.max(
                ...allEvents.map(e => e.id),
                lastEventId
            );
            await analyticsWatermarkRepository.incrementByEventId(
                watermarkName, 
                maxEventId, 
                allEvents.length
            );
            
            // Track watermark progress
            this.trackWatermarkProgress(watermarkName, maxEventId, true);

            unifiedLogger.info('analytics', 'Processed followup performance stats', { 
                eventsProcessed: allEvents.length,
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
                if (!event.event_data) {
                    continue;
                }
                
                const eventData = JSON.parse(event.event_data);
                const intent = eventData.intent || 'unknown';
                const confidence = typeof eventData.confidence === 'number' ? eventData.confidence : 0;
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
                unifiedLogger.debug('analytics', 'Error parsing event data for intent grouping', { 
                    eventId: event.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
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
        let validRevenueEvents = 0;
        
        for (const event of events) {
            if (event.event_type === 'order_confirmed' && event.event_data) {
                try {
                    const data = JSON.parse(event.event_data);
                    if (data.amount && typeof data.amount === 'number') {
                        totalRevenue += data.amount;
                        validRevenueEvents++;
                    }
                } catch (error) {
                    unifiedLogger.debug('analytics', 'Invalid JSON in event_data', { 
                        eventId: event.id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }

        stats.total_revenue = totalRevenue;
        stats.average_order_value = validRevenueEvents > 0 
            ? totalRevenue / validRevenueEvents 
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
     * Group follow-up events by date (from multiple sources)
     */
    private groupFollowupEventsByDate(events: Array<{
        id: number;
        event_type: string;
        phone: string;
        created_at: Date;
        source: 'order_events' | 'chatbot_events';
    }>): Record<string, Array<{
        id: number;
        event_type: string;
        phone: string;
        created_at: Date;
        source: 'order_events' | 'chatbot_events';
    }>> {
        const grouped: Record<string, typeof events> = {};
        
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
     * Aggregate follow-up performance stats for a specific date
     * Handles events from both order_events and chatbot_events tables
     */
    private async aggregateFollowupPerformanceStatsForDate(date: Date, events: Array<{
        id: number;
        event_type: string;
        phone: string;
        created_at: Date;
        source: 'order_events' | 'chatbot_events';
    }>): Promise<void> {
        // Normalize event types (chatbot_events uses uppercase, order_events uses lowercase)
        const normalizeEventType = (type: string): string => type.toUpperCase();
        
        const stats: FollowupPerformanceDaily = {
            date,
            followups_scheduled: events.filter(e => 
                normalizeEventType(e.event_type) === 'FOLLOWUP_SCHEDULED'
            ).length,
            followups_attempted: events.filter(e => 
                normalizeEventType(e.event_type) === 'FOLLOWUP_ATTEMPTED'
            ).length,
            followups_sent: events.filter(e => 
                normalizeEventType(e.event_type) === 'FOLLOWUP_SENT'
            ).length,
            followups_blocked: events.filter(e => 
                normalizeEventType(e.event_type) === 'FOLLOWUP_BLOCKED'
            ).length,
            followups_cancelled: events.filter(e => 
                normalizeEventType(e.event_type) === 'FOLLOWUP_CANCELLED'
            ).length,
            followups_responded: events.filter(e => 
                normalizeEventType(e.event_type) === 'FOLLOWUP_RESPONDED'
            ).length
        };

        // Calculate response rate based on sent
        stats.response_rate = (stats.followups_sent || 0) > 0
            ? ((stats.followups_responded || 0) / (stats.followups_sent || 0)) * 100
            : 0;

        await analyticsStatsRepository.upsertFollowupPerformanceDaily(stats);
    }

    /**
     * Process stage funnel statistics from chatbot_events
     */
    private async processStageFunnelStats(): Promise<void> {
        const watermarkName = WATERMARK_NAMES.STAGE_FUNNEL;
        
        // Check if chatbot_events table exists before querying
        if (!(await this.ensureChatbotEventsTableAvailable())) {
            unifiedLogger.debug('analytics', 'Skipping stage funnel stats - chatbot_events table not available');
            return;
        }
        
        try {
            // Get or create watermark
            let watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                // Create new watermark if it doesn't exist
                await analyticsWatermarkRepository.upsert({
                    name: watermarkName,
                    last_event_id: 0,
                    total_processed: 0
                });
                watermark = await analyticsWatermarkRepository.getByName(watermarkName);
                if (!watermark) {
                    unifiedLogger.error('analytics', 'Failed to create watermark', { watermarkName });
                    return;
                }
            }

            const lastEventId = toSafeInt(watermark.last_event_id, { min: 0, fallback: 0 });
            
            // Get stage funnel events from chatbot_events
            const newEvents = await chatbotEventRepository.getStageFunnelEvents(lastEventId, BATCH_SIZE_LIMIT);

            if (!newEvents || newEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new stage funnel events to process', { watermarkName });
                // Track that no new events exist (watermark is up to date)
                this.trackWatermarkProgress(watermarkName, lastEventId, false);
                return;
            }

            // Group events by date and stage
            const eventsByDateAndStage = this.groupStageFunnelEvents(newEvents);
            
            // Process each date and stage
            for (const [dateStr, stageData] of Object.entries(eventsByDateAndStage)) {
                for (const [stage, data] of Object.entries(stageData as Record<string, any>)) {
                    await this.aggregateStageFunnelForDate(new Date(dateStr), stage, data);
                }
            }

            // Update watermark
            const maxEventId = Math.max(...newEvents.map(e => e.id));
            await analyticsWatermarkRepository.incrementByEventId(
                watermarkName, 
                maxEventId, 
                newEvents.length
            );
            
            // Track watermark progress
            this.trackWatermarkProgress(watermarkName, maxEventId, true);

            unifiedLogger.info('analytics', 'Processed stage funnel stats', { 
                eventsProcessed: newEvents.length,
                maxEventId 
            });
        } catch (error) {
            unifiedLogger.error('analytics', 'Error processing stage funnel stats', { error });
        }
    }

    /**
     * Process blocked followup statistics from chatbot_events
     */
    private async processFollowupBlockedStats(): Promise<void> {
        const watermarkName = WATERMARK_NAMES.FOLLOWUP_BLOCKED;
        
        // Check if chatbot_events table exists before querying
        if (!(await this.ensureChatbotEventsTableAvailable())) {
            unifiedLogger.debug('analytics', 'Skipping blocked followup stats - chatbot_events table not available');
            return;
        }
        
        try {
            // Get or create watermark
            let watermark = await analyticsWatermarkRepository.getByName(watermarkName);
            if (!watermark) {
                // Create new watermark if it doesn't exist
                await analyticsWatermarkRepository.upsert({
                    name: watermarkName,
                    last_event_id: 0,
                    total_processed: 0
                });
                watermark = await analyticsWatermarkRepository.getByName(watermarkName);
                if (!watermark) {
                    unifiedLogger.error('analytics', 'Failed to create watermark', { watermarkName });
                    return;
                }
            }

            const lastEventId = toSafeInt(watermark.last_event_id, { min: 0, fallback: 0 });
            
            // Get blocked followup events from chatbot_events
            const newEvents = await chatbotEventRepository.getBlockedFollowupEvents(lastEventId, BATCH_SIZE_LIMIT);

            if (!newEvents || newEvents.length === 0) {
                unifiedLogger.debug('analytics', 'No new blocked followup events to process', { watermarkName });
                // Track that no new events exist (watermark is up to date)
                this.trackWatermarkProgress(watermarkName, lastEventId, false);
                return;
            }

            // Group events by date and reason
            const eventsByDateAndReason = this.groupBlockedFollowupEvents(newEvents);
            
            // Process each date and reason
            for (const [dateStr, reasonData] of Object.entries(eventsByDateAndReason)) {
                for (const [reason, data] of Object.entries(reasonData as Record<string, any>)) {
                    await this.aggregateBlockedFollowupForDate(new Date(dateStr), reason, data);
                }
            }

            // Update watermark
            const maxEventId = Math.max(...newEvents.map(e => e.id));
            await analyticsWatermarkRepository.incrementByEventId(
                watermarkName, 
                maxEventId, 
                newEvents.length
            );
            
            // Track watermark progress
            this.trackWatermarkProgress(watermarkName, maxEventId, true);

            unifiedLogger.info('analytics', 'Processed blocked followup stats', { 
                eventsProcessed: newEvents.length,
                maxEventId 
            });
        } catch (error) {
            unifiedLogger.error('analytics', 'Error processing blocked followup stats', { error });
        }
    }

    /**
     * Group stage funnel events by date and stage
     */
    private groupStageFunnelEvents(events: Array<{
        id: number;
        event_type: string;
        stage: string;
        phone: string;
        created_at: Date;
        payload_json: any;
    }>): Record<string, Record<string, any>> {
        const grouped: Record<string, Record<string, any>> = {};
        
        for (const event of events) {
            const dateStr = new Date(event.created_at).toISOString().split('T')[0];
            const stage = event.stage || 'unknown';
            
            if (!grouped[dateStr]) {
                grouped[dateStr] = {};
            }
            if (!grouped[dateStr][stage]) {
                grouped[dateStr][stage] = {
                    questions_asked: 0,
                    responses_received: 0,
                    conversions: 0,
                    phones: new Set()
                };
            }
            
            const data = grouped[dateStr][stage];
            data.phones.add(event.phone);
            
            if (event.event_type === 'STAGE_SET' || event.event_type === 'BLOCKING_QUESTION_ASKED') {
                data.questions_asked++;
            } else if (event.event_type === 'STAGE_RESOLVED') {
                data.responses_received++;
            } else if (event.event_type === 'ORDER_CONFIRMED') {
                data.conversions++;
            }
        }
        
        return grouped;
    }

    /**
     * Group blocked followup events by date and reason
     */
    private groupBlockedFollowupEvents(events: Array<{
        id: number;
        phone: string;
        block_reason: string;
        created_at: Date;
        payload_json: any;
    }>): Record<string, Record<string, any>> {
        const grouped: Record<string, Record<string, any>> = {};
        
        for (const event of events) {
            const dateStr = new Date(event.created_at).toISOString().split('T')[0];
            const reason = event.block_reason || 'unknown';
            
            if (!grouped[dateStr]) {
                grouped[dateStr] = {};
            }
            if (!grouped[dateStr][reason]) {
                grouped[dateStr][reason] = {
                    blocked_count: 0,
                    phones: new Set()
                };
            }
            
            const data = grouped[dateStr][reason];
            data.blocked_count++;
            data.phones.add(event.phone);
        }
        
        return grouped;
    }

    /**
     * Aggregate stage funnel stats for a specific date and stage
     */
    private async aggregateStageFunnelForDate(
        date: Date, 
        stage: string, 
        data: { questions_asked: number; responses_received: number; conversions: number; phones: Set<string> }
    ): Promise<void> {
        const stats: StageFunnelDaily = {
            date,
            stage,
            questions_asked: data.questions_asked,
            responses_received: data.responses_received,
            conversions_to_order: data.conversions,
            abandonment_rate: data.questions_asked > 0
                ? ((data.questions_asked - data.responses_received) / data.questions_asked) * 100
                : 0
        };

        await analyticsStatsRepository.upsertStageFunnelDaily(stats);
    }

    /**
     * Aggregate blocked followup stats for a specific date and reason
     */
    private async aggregateBlockedFollowupForDate(
        date: Date, 
        reason: string, 
        data: { blocked_count: number; phones: Set<string> }
    ): Promise<void> {
        const stats: FollowupBlockedDaily = {
            date,
            block_reason: reason,
            blocked_count: data.blocked_count,
            unique_phones: data.phones.size
        };

        await analyticsStatsRepository.upsertFollowupBlockedDaily(stats);
    }
}

export const analyticsRefresher = new AnalyticsRefresher();
