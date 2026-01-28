/**
 * Repository for analytics aggregate tables
 * Manages daily order stats, intent conversion stats, and followup performance data
 */

import { db } from '../database/knex';

export interface DailyOrderStats {
    id?: number;
    date: Date;
    orders_initiated?: number;
    orders_completed?: number;
    orders_cancelled?: number;
    total_revenue?: number;
    average_order_value?: number;
    conversion_rate?: number;
    unique_users?: number;
    created_at?: Date;
    updated_at?: Date;
}

export interface IntentConversionStats {
    id?: number;
    date: Date;
    intent: string;
    intent_count?: number;
    successful_conversions?: number;
    conversion_rate?: number;
    avg_confidence?: number;
    created_at?: Date;
    updated_at?: Date;
}

export interface FollowupPerformanceDaily {
    id?: number;
    date: Date;
    followups_scheduled?: number;
    followups_attempted?: number;
    followups_sent?: number;
    followups_blocked?: number;
    followups_cancelled?: number;
    followups_responded?: number;
    response_rate?: number;
    followup_orders?: number;
    followup_revenue?: number;
    avg_response_time_minutes?: number;
    created_at?: Date;
    updated_at?: Date;
}

export interface StageFunnelDaily {
    id?: number;
    date: Date;
    stage: string;
    questions_asked?: number;
    responses_received?: number;
    abandonment_rate?: number;
    followups_sent?: number;
    conversions_to_order?: number;
    avg_time_in_stage_minutes?: number;
    created_at?: Date;
    updated_at?: Date;
}

export interface FollowupBlockedDaily {
    id?: number;
    date: Date;
    block_reason: string;
    blocked_count?: number;
    unique_phones?: number;
    created_at?: Date;
    updated_at?: Date;
}

export class AnalyticsStatsRepository {
    /**
     * Upsert daily order stats
     */
    async upsertDailyOrderStats(stats: DailyOrderStats): Promise<void> {
        const dateStr = this.formatDate(stats.date);
        
        await db.raw(`
            INSERT INTO daily_order_stats 
            (date, orders_initiated, orders_completed, orders_cancelled, 
             total_revenue, average_order_value, conversion_rate, unique_users, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                orders_initiated = VALUES(orders_initiated),
                orders_completed = VALUES(orders_completed),
                orders_cancelled = VALUES(orders_cancelled),
                total_revenue = VALUES(total_revenue),
                average_order_value = VALUES(average_order_value),
                conversion_rate = VALUES(conversion_rate),
                unique_users = VALUES(unique_users),
                updated_at = NOW()
        `, [
            dateStr,
            stats.orders_initiated || 0,
            stats.orders_completed || 0,
            stats.orders_cancelled || 0,
            stats.total_revenue || 0,
            stats.average_order_value || 0,
            stats.conversion_rate || 0,
            stats.unique_users || 0
        ]);
    }

    /**
     * Upsert intent conversion stats
     */
    async upsertIntentConversionStats(stats: IntentConversionStats): Promise<void> {
        const dateStr = this.formatDate(stats.date);
        
        await db.raw(`
            INSERT INTO intent_conversion_stats
            (date, intent, intent_count, successful_conversions, 
             conversion_rate, avg_confidence, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                intent_count = VALUES(intent_count),
                successful_conversions = VALUES(successful_conversions),
                conversion_rate = VALUES(conversion_rate),
                avg_confidence = VALUES(avg_confidence),
                updated_at = NOW()
        `, [
            dateStr,
            stats.intent,
            stats.intent_count || 0,
            stats.successful_conversions || 0,
            stats.conversion_rate || 0,
            stats.avg_confidence || 0
        ]);
    }

    /**
     * Upsert followup performance daily stats
     * Enhanced to include scheduled, attempted, blocked, and cancelled metrics
     * 
     * Note: response_rate is recalculated from scratch on every update based on the
     * total followups_sent and followups_responded. This ensures accurate rates even
     * when events arrive out of order. The CASE statement safely handles division by
     * zero when followups_sent is 0.
     */
    async upsertFollowupPerformanceDaily(stats: FollowupPerformanceDaily): Promise<void> {
        const dateStr = this.formatDate(stats.date);
        
        await db.raw(`
            INSERT INTO followup_performance_daily
            (date, followups_scheduled, followups_attempted, followups_sent, 
             followups_blocked, followups_cancelled, followups_responded, response_rate, 
             followup_orders, followup_revenue, avg_response_time_minutes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                followups_scheduled = COALESCE(followups_scheduled, 0) + VALUES(followups_scheduled),
                followups_attempted = COALESCE(followups_attempted, 0) + VALUES(followups_attempted),
                followups_sent = COALESCE(followups_sent, 0) + VALUES(followups_sent),
                followups_blocked = COALESCE(followups_blocked, 0) + VALUES(followups_blocked),
                followups_cancelled = COALESCE(followups_cancelled, 0) + VALUES(followups_cancelled),
                followups_responded = COALESCE(followups_responded, 0) + VALUES(followups_responded),
                /* Recalculate response_rate based on total sent and responded */
                response_rate = CASE 
                    WHEN (COALESCE(followups_sent, 0) + VALUES(followups_sent)) > 0 
                    THEN ((COALESCE(followups_responded, 0) + VALUES(followups_responded)) * 100.0 / 
                          (COALESCE(followups_sent, 0) + VALUES(followups_sent)))
                    ELSE 0 
                END,
                followup_orders = COALESCE(followup_orders, 0) + VALUES(followup_orders),
                followup_revenue = COALESCE(followup_revenue, 0) + VALUES(followup_revenue),
                avg_response_time_minutes = VALUES(avg_response_time_minutes),
                updated_at = NOW()
        `, [
            dateStr,
            stats.followups_scheduled || 0,
            stats.followups_attempted || 0,
            stats.followups_sent || 0,
            stats.followups_blocked || 0,
            stats.followups_cancelled || 0,
            stats.followups_responded || 0,
            stats.response_rate || 0,
            stats.followup_orders || 0,
            stats.followup_revenue || 0,
            stats.avg_response_time_minutes || 0
        ]);
    }

    /**
     * Get daily order stats for date range
     */
    async getDailyOrderStats(dateFrom: Date, dateTo: Date): Promise<DailyOrderStats[]> {
        return db('daily_order_stats')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .orderBy('date', 'desc');
    }

    /**
     * Get intent conversion stats for date range
     */
    async getIntentConversionStats(dateFrom: Date, dateTo: Date): Promise<IntentConversionStats[]> {
        return db('intent_conversion_stats')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .orderBy([{ column: 'date', order: 'desc' }, { column: 'intent_count', order: 'desc' }]);
    }

    /**
     * Get followup performance for date range
     */
    async getFollowupPerformanceDaily(dateFrom: Date, dateTo: Date): Promise<FollowupPerformanceDaily[]> {
        return db('followup_performance_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .orderBy('date', 'desc');
    }

    /**
     * Get aggregated summary from daily_order_stats for a date range
     */
    async getOrderStatsSummary(dateFrom: Date, dateTo: Date): Promise<{
        totalOrdersInitiated: number;
        totalOrdersCompleted: number;
        totalOrdersCancelled: number;
        totalRevenue: number;
        avgOrderValue: number;
        avgConversionRate: number;
        uniqueUsers: number;
    }> {
        const result = await db('daily_order_stats')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .select(
                db.raw('COALESCE(SUM(orders_initiated), 0) as totalOrdersInitiated'),
                db.raw('COALESCE(SUM(orders_completed), 0) as totalOrdersCompleted'),
                db.raw('COALESCE(SUM(orders_cancelled), 0) as totalOrdersCancelled'),
                db.raw('COALESCE(SUM(total_revenue), 0) as totalRevenue'),
                db.raw('COALESCE(AVG(average_order_value), 0) as avgOrderValue'),
                db.raw('COALESCE(AVG(conversion_rate), 0) as avgConversionRate'),
                db.raw('COALESCE(SUM(unique_users), 0) as uniqueUsers')
            )
            .first() as any;

        return {
            totalOrdersInitiated: Number(result?.totalOrdersInitiated || 0),
            totalOrdersCompleted: Number(result?.totalOrdersCompleted || 0),
            totalOrdersCancelled: Number(result?.totalOrdersCancelled || 0),
            totalRevenue: Number(result?.totalRevenue || 0),
            avgOrderValue: Number(result?.avgOrderValue || 0),
            avgConversionRate: Number(result?.avgConversionRate || 0),
            uniqueUsers: Number(result?.uniqueUsers || 0)
        };
    }

    /**
     * Get top intents by count for date range
     */
    async getTopIntents(dateFrom: Date, dateTo: Date, limit: number = 10): Promise<Array<{
        intent: string;
        totalCount: number;
        totalConversions: number;
        avgConversionRate: number;
        avgConfidence: number;
    }>> {
        const results = await db('intent_conversion_stats')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .select('intent')
            .sum('intent_count as totalCount')
            .sum('successful_conversions as totalConversions')
            .avg('conversion_rate as avgConversionRate')
            .avg('avg_confidence as avgConfidence')
            .groupBy('intent')
            .orderBy('totalCount', 'desc')
            .limit(limit) as any[];

        return results.map(row => ({
            intent: row.intent,
            totalCount: Number(row.totalCount || 0),
            totalConversions: Number(row.totalConversions || 0),
            avgConversionRate: Number(row.avgConversionRate || 0),
            avgConfidence: Number(row.avgConfidence || 0)
        }));
    }

    /**
     * Get followup performance summary for date range
     * 
     * Returns null for metrics when no data is available (as opposed to 0 which means real zero).
     * This helps distinguish between "no data" and "actually zero".
     */
    async getFollowupSummary(dateFrom: Date, dateTo: Date): Promise<{
        totalFollowupsScheduled: number | null;
        totalFollowupsAttempted: number | null;
        totalFollowupsSent: number | null;
        totalFollowupsBlocked: number | null;
        totalFollowupsCancelled: number | null;
        totalFollowupsResponded: number | null;
        overallResponseRate: number | null;
        totalFollowupOrders: number | null;
        totalFollowupRevenue: number | null;
        avgResponseTimeMinutes: number | null;
        hasData: boolean;
    }> {
        // First check if there's any data in the date range
        const countResult = await db('followup_performance_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .count('* as count')
            .first() as any;
        
        const hasData = Number(countResult?.count || 0) > 0;
        
        if (!hasData) {
            // No data available - return nulls to indicate "N/A" (not 0)
            return {
                totalFollowupsScheduled: null,
                totalFollowupsAttempted: null,
                totalFollowupsSent: null,
                totalFollowupsBlocked: null,
                totalFollowupsCancelled: null,
                totalFollowupsResponded: null,
                overallResponseRate: null,
                totalFollowupOrders: null,
                totalFollowupRevenue: null,
                avgResponseTimeMinutes: null,
                hasData: false
            };
        }

        const result = await db('followup_performance_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .select(
                db.raw('COALESCE(SUM(followups_scheduled), 0) as totalFollowupsScheduled'),
                db.raw('COALESCE(SUM(followups_attempted), 0) as totalFollowupsAttempted'),
                db.raw('COALESCE(SUM(followups_sent), 0) as totalFollowupsSent'),
                db.raw('COALESCE(SUM(followups_blocked), 0) as totalFollowupsBlocked'),
                db.raw('COALESCE(SUM(followups_cancelled), 0) as totalFollowupsCancelled'),
                db.raw('COALESCE(SUM(followups_responded), 0) as totalFollowupsResponded'),
                db.raw('COALESCE(SUM(followup_orders), 0) as totalFollowupOrders'),
                db.raw('COALESCE(SUM(followup_revenue), 0) as totalFollowupRevenue'),
                db.raw('AVG(avg_response_time_minutes) as avgResponseTimeMinutes')
            )
            .first() as any;

        const sent = Number(result?.totalFollowupsSent || 0);
        const responded = Number(result?.totalFollowupsResponded || 0);
        // avgResponseTimeMinutes can be null if all values are null
        // Use != null to check for both null and undefined
        const avgTime = result?.avgResponseTimeMinutes != null ? Number(result?.avgResponseTimeMinutes) : null;

        return {
            totalFollowupsScheduled: Number(result?.totalFollowupsScheduled || 0),
            totalFollowupsAttempted: Number(result?.totalFollowupsAttempted || 0),
            totalFollowupsSent: sent,
            totalFollowupsBlocked: Number(result?.totalFollowupsBlocked || 0),
            totalFollowupsCancelled: Number(result?.totalFollowupsCancelled || 0),
            totalFollowupsResponded: responded,
            overallResponseRate: sent > 0 ? (responded / sent) * 100 : 0,
            totalFollowupOrders: Number(result?.totalFollowupOrders || 0),
            totalFollowupRevenue: Number(result?.totalFollowupRevenue || 0),
            avgResponseTimeMinutes: avgTime,
            hasData: true
        };
    }

    /**
     * Upsert stage funnel daily stats
     */
    async upsertStageFunnelDaily(stats: StageFunnelDaily): Promise<void> {
        const dateStr = this.formatDate(stats.date);
        
        await db.raw(`
            INSERT INTO stage_funnel_daily 
            (date, stage, questions_asked, responses_received, abandonment_rate, 
             followups_sent, conversions_to_order, avg_time_in_stage_minutes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                questions_asked = VALUES(questions_asked),
                responses_received = VALUES(responses_received),
                abandonment_rate = VALUES(abandonment_rate),
                followups_sent = VALUES(followups_sent),
                conversions_to_order = VALUES(conversions_to_order),
                avg_time_in_stage_minutes = VALUES(avg_time_in_stage_minutes),
                updated_at = NOW()
        `, [
            dateStr,
            stats.stage,
            stats.questions_asked || 0,
            stats.responses_received || 0,
            stats.abandonment_rate || 0,
            stats.followups_sent || 0,
            stats.conversions_to_order || 0,
            stats.avg_time_in_stage_minutes || 0
        ]);
    }

    /**
     * Upsert blocked followup daily stats
     */
    async upsertFollowupBlockedDaily(stats: FollowupBlockedDaily): Promise<void> {
        const dateStr = this.formatDate(stats.date);
        
        await db.raw(`
            INSERT INTO followup_blocked_daily 
            (date, block_reason, blocked_count, unique_phones, updated_at)
            VALUES (?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                blocked_count = VALUES(blocked_count),
                unique_phones = VALUES(unique_phones),
                updated_at = NOW()
        `, [
            dateStr,
            stats.block_reason,
            stats.blocked_count || 0,
            stats.unique_phones || 0
        ]);
    }

    /**
     * Get stage funnel stats for date range
     */
    async getStageFunnelDaily(dateFrom: Date, dateTo: Date): Promise<StageFunnelDaily[]> {
        return db('stage_funnel_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .orderBy([{ column: 'date', order: 'desc' }, { column: 'questions_asked', order: 'desc' }]);
    }

    /**
     * Get blocked followup stats for date range
     */
    async getFollowupBlockedDaily(dateFrom: Date, dateTo: Date): Promise<FollowupBlockedDaily[]> {
        return db('followup_blocked_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .orderBy([{ column: 'date', order: 'desc' }, { column: 'blocked_count', order: 'desc' }]);
    }

    /**
     * Get stage funnel summary for date range (aggregated across all days)
     */
    async getStageFunnelSummary(dateFrom: Date, dateTo: Date): Promise<Array<{
        stage: string;
        totalQuestionsAsked: number;
        totalResponsesReceived: number;
        avgAbandonmentRate: number;
        totalFollowupsSent: number;
        totalConversionsToOrder: number;
    }>> {
        const results = await db('stage_funnel_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .select('stage')
            .sum('questions_asked as totalQuestionsAsked')
            .sum('responses_received as totalResponsesReceived')
            .avg('abandonment_rate as avgAbandonmentRate')
            .sum('followups_sent as totalFollowupsSent')
            .sum('conversions_to_order as totalConversionsToOrder')
            .groupBy('stage')
            .orderBy('totalQuestionsAsked', 'desc') as any[];

        return results.map(row => ({
            stage: row.stage,
            totalQuestionsAsked: Number(row.totalQuestionsAsked || 0),
            totalResponsesReceived: Number(row.totalResponsesReceived || 0),
            avgAbandonmentRate: Number(row.avgAbandonmentRate || 0),
            totalFollowupsSent: Number(row.totalFollowupsSent || 0),
            totalConversionsToOrder: Number(row.totalConversionsToOrder || 0)
        }));
    }

    /**
     * Get top blocked reasons for date range
     */
    async getTopBlockedReasons(dateFrom: Date, dateTo: Date, limit: number = 10): Promise<Array<{
        blockReason: string;
        totalBlocked: number;
        totalUniquePhones: number;
    }>> {
        const results = await db('followup_blocked_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .select('block_reason as blockReason')
            .sum('blocked_count as totalBlocked')
            .sum('unique_phones as totalUniquePhones')
            .groupBy('block_reason')
            .orderBy('totalBlocked', 'desc')
            .limit(limit) as any[];

        return results.map(row => ({
            blockReason: row.blockReason,
            totalBlocked: Number(row.totalBlocked || 0),
            totalUniquePhones: Number(row.totalUniquePhones || 0)
        }));
    }

    /**
     * Format date as YYYY-MM-DD string
     */
    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }
}

export const analyticsStatsRepository = new AnalyticsStatsRepository();
