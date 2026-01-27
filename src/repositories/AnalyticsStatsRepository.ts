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
    followups_sent?: number;
    followups_responded?: number;
    response_rate?: number;
    followup_orders?: number;
    followup_revenue?: number;
    avg_response_time_minutes?: number;
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
     */
    async upsertFollowupPerformanceDaily(stats: FollowupPerformanceDaily): Promise<void> {
        const dateStr = this.formatDate(stats.date);
        
        await db.raw(`
            INSERT INTO followup_performance_daily
            (date, followups_sent, followups_responded, response_rate, 
             followup_orders, followup_revenue, avg_response_time_minutes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                followups_sent = VALUES(followups_sent),
                followups_responded = VALUES(followups_responded),
                response_rate = VALUES(response_rate),
                followup_orders = VALUES(followup_orders),
                followup_revenue = VALUES(followup_revenue),
                avg_response_time_minutes = VALUES(avg_response_time_minutes),
                updated_at = NOW()
        `, [
            dateStr,
            stats.followups_sent || 0,
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
     */
    async getFollowupSummary(dateFrom: Date, dateTo: Date): Promise<{
        totalFollowupsSent: number;
        totalFollowupsResponded: number;
        overallResponseRate: number;
        totalFollowupOrders: number;
        totalFollowupRevenue: number;
        avgResponseTimeMinutes: number;
    }> {
        const result = await db('followup_performance_daily')
            .whereBetween('date', [this.formatDate(dateFrom), this.formatDate(dateTo)])
            .select(
                db.raw('COALESCE(SUM(followups_sent), 0) as totalFollowupsSent'),
                db.raw('COALESCE(SUM(followups_responded), 0) as totalFollowupsResponded'),
                db.raw('COALESCE(SUM(followup_orders), 0) as totalFollowupOrders'),
                db.raw('COALESCE(SUM(followup_revenue), 0) as totalFollowupRevenue'),
                db.raw('COALESCE(AVG(avg_response_time_minutes), 0) as avgResponseTimeMinutes')
            )
            .first() as any;

        const sent = Number(result?.totalFollowupsSent || 0);
        const responded = Number(result?.totalFollowupsResponded || 0);

        return {
            totalFollowupsSent: sent,
            totalFollowupsResponded: responded,
            overallResponseRate: sent > 0 ? (responded / sent) * 100 : 0,
            totalFollowupOrders: Number(result?.totalFollowupOrders || 0),
            totalFollowupRevenue: Number(result?.totalFollowupRevenue || 0),
            avgResponseTimeMinutes: Number(result?.avgResponseTimeMinutes || 0)
        };
    }

    /**
     * Format date as YYYY-MM-DD string
     */
    private formatDate(date: Date): string {
        return date.toISOString().split('T')[0];
    }
}

export const analyticsStatsRepository = new AnalyticsStatsRepository();
