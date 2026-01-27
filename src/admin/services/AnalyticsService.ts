/**
 * Analytics Service - Provides statistics and analytics for the admin panel
 */

import { businessDB } from '../../mysql-database';
import { userSessions } from '../../flows/userTrackingSystem';
import { cacheService, CACHE_KEYS, CACHE_TTL } from '../../services/CacheService';
import type { DashboardStats, ChatbotAnalytics } from '../types/AdminTypes';

// Validation limits to prevent data corruption and overflow
const ANALYTICS_LIMITS = {
    MAX_REASONABLE_COUNT: 1_000_000,           // Maximum reasonable count for orders/stats (prevents overflow)
    MAX_TOTAL_REVENUE: 999_999_999_999,        // ~$1 trillion COP (prevents overflow in DECIMAL(12,2))
    MAX_AVERAGE_PRICE: 999_999_999,            // ~$1 billion COP per order (sanity check)
    MAX_POPULAR_ITEMS_COUNT: 10_000            // Maximum count for popular content items
} as const;

// Default time range for dashboard summary when no dates provided
const DEFAULT_DAYS_LOOKBACK = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Helper to safely access database pool
// Note: pool is a private property, so we use type assertion with runtime check
function getDatabasePool(): any | null {
    const db = businessDB as any;
    return db && db.pool ? db.pool : null;
}

export class AnalyticsService {
    /**
     * Clear analytics cache to force refresh
     */
    clearCache(): void {
        cacheService.invalidateDashboard();
        console.log('✅ Analytics cache cleared');
    }

    /**
     * Get comprehensive dashboard statistics with caching
     */
    async getDashboardStats(forceRefresh: boolean = false): Promise<DashboardStats> {
        try {
            // Return cached data if still valid and not forcing refresh
            if (!forceRefresh) {
                const cached = cacheService.get<DashboardStats>(CACHE_KEYS.DASHBOARD_STATS);
                if (cached) {
                    console.log('📊 Returning cached dashboard stats');
                    return cached;
                }
            }

            console.log('🔄 Fetching fresh dashboard stats from database');

            const [
                orderStats,
                contentStats,
                revenueStats,
                conversionMetrics
            ] = await Promise.all([
                this.getOrderStatistics(),
                this.getContentStatistics(),
                this.getRevenueStatistics(),
                this.getConversionMetrics()
            ]);

            // Calculate conversation count from sessions
            const conversationCount = userSessions.size;

            const stats: DashboardStats = {
                // Order statistics with defaults
                totalOrders: orderStats.totalOrders || 0,
                pendingOrders: orderStats.pendingOrders || 0,
                processingOrders: orderStats.processingOrders || 0,
                completedOrders: orderStats.completedOrders || 0,
                cancelledOrders: orderStats.cancelledOrders || 0,
                ordersToday: orderStats.ordersToday || 0,
                ordersThisWeek: orderStats.ordersThisWeek || 0,
                ordersThisMonth: orderStats.ordersThisMonth || 0,

                // Revenue with defaults
                totalRevenue: revenueStats.totalRevenue || 0,
                averageOrderValue: revenueStats.averageOrderValue || 0,

                // Conversion metrics with defaults
                conversationCount: conversationCount,
                conversionRate: conversionMetrics.conversionRate || 0,

                // Content statistics with defaults
                contentDistribution: contentStats.contentDistribution || { music: 0, videos: 0, movies: 0, series: 0, mixed: 0 },
                capacityDistribution: contentStats.capacityDistribution || { '8GB': 0, '32GB': 0, '64GB': 0, '128GB': 0, '256GB': 0 },
                topGenres: contentStats.topGenres || [],
                topArtists: contentStats.topArtists || [],
                topMovies: contentStats.topMovies || []
            };

            // Update cache with 15s TTL
            cacheService.set(CACHE_KEYS.DASHBOARD_STATS, stats, { ttl: CACHE_TTL.DASHBOARD });

            console.log('✅ Dashboard stats fetched and cached successfully');
            return stats;
        } catch (error) {
            console.error('Error getting dashboard stats:', error);

            // Return cached data if available, even if expired
            const cachedData = cacheService.get<DashboardStats>(CACHE_KEYS.DASHBOARD_STATS);
            if (cachedData) {
                console.warn('⚠️ Returning stale cached data due to error');
                return cachedData;
            }

            // Return empty stats as last resort
            console.error('❌ No cached data available, returning empty stats');
            throw error;
        }
    }

    /**
     * Get dashboard summary with optional date range filtering
     * Used by GET /api/admin/dashboard/summary endpoint
     */
    async getDashboardSummary(from?: Date, to?: Date): Promise<DashboardStats> {
        try {
            // If no date range specified, use the standard getDashboardStats
            if (!from && !to) {
                return await this.getDashboardStats();
            }

            // Default date range: from start of month if only 'to' provided, or to now if only 'from' provided
            const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const dateTo = to || new Date();

            console.log(`🔄 Fetching dashboard summary for date range: ${dateFrom.toISOString()} to ${dateTo.toISOString()}`);

            // Build cache key based on date range
            const cacheKey = `dashboard_summary_${dateFrom.toISOString().split('T')[0]}_${dateTo.toISOString().split('T')[0]}`;

            // Check cache first
            const cached = cacheService.get<DashboardStats>(cacheKey);
            if (cached) {
                console.log('📊 Returning cached dashboard summary');
                return cached;
            }

            // Fetch date-filtered statistics
            const stats = await businessDB.getOrderStatisticsForDateRange(dateFrom, dateTo);

            // Get content and capacity distributions (these are not date-filtered for now)
            const [contentDist, capacityDist, topGenres] = await Promise.all([
                this.getContentDistribution(),
                this.getCapacityDistribution(),
                businessDB.getTopGenres(5)
            ]);

            const result: DashboardStats = {
                totalOrders: stats.total_orders,
                pendingOrders: stats.pending_orders,
                processingOrders: stats.processing_orders,
                completedOrders: stats.completed_orders,
                cancelledOrders: stats.error_orders + stats.failed_orders,
                ordersToday: 0, // Not applicable for date range
                ordersThisWeek: 0,
                ordersThisMonth: stats.total_orders,
                totalRevenue: stats.total_revenue,
                averageOrderValue: stats.average_price,
                conversationCount: 0,
                conversionRate: 0,
                contentDistribution: contentDist,
                capacityDistribution: capacityDist,
                topGenres: topGenres || [],
                topArtists: [],
                topMovies: []
            };

            // Cache with 120s TTL for date-filtered queries
            cacheService.set(cacheKey, result, { ttl: CACHE_TTL.ANALYTICS_DATE_RANGE });

            console.log('✅ Dashboard summary fetched successfully');
            return result;
        } catch (error) {
            console.error('Error getting dashboard summary:', error);
            throw error;
        }
    }

    /**
     * Get chatbot analytics with caching
     * Supports optional date range filtering for real-time analytics
     */
    async getChatbotAnalytics(options: {
        from?: Date;
        to?: Date;
        forceRefresh?: boolean;
    } = {}): Promise<ChatbotAnalytics> {
        const { from, to, forceRefresh = false } = options;

        // Default date range: last 30 days if not specified
        const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dateTo = to || new Date();

        // Build cache key based on date range
        const cacheKey = `${CACHE_KEYS.CHATBOT_ANALYTICS}_${dateFrom.toISOString().split('T')[0]}_${dateTo.toISOString().split('T')[0]}`;

        try {
            // Return cached data if still valid and not forcing refresh
            if (!forceRefresh) {
                const cached = cacheService.get<ChatbotAnalytics>(cacheKey);
                if (cached) {
                    console.log('📊 Returning cached chatbot analytics for date range');
                    return cached;
                }
            }

            console.log(`🔄 Fetching fresh chatbot analytics from database (${dateFrom.toISOString()} to ${dateTo.toISOString()})`);

            const [
                conversationMetrics,
                intentMetrics,
                popularityMetrics,
                timingMetrics,
                userMetrics
            ] = await Promise.all([
                this.getConversationMetrics(dateFrom, dateTo),
                this.getIntentMetrics(dateFrom, dateTo),
                this.getPopularityMetrics(),
                this.getTimingMetrics(dateFrom, dateTo),
                this.getUserMetrics()
            ]);

            const analytics: ChatbotAnalytics = {
                // Conversation metrics with defaults
                activeConversations: conversationMetrics.activeConversations || 0,
                totalConversations: conversationMetrics.totalConversations || 0,
                averageResponseTime: conversationMetrics.averageResponseTime || 0,
                medianResponseTime: conversationMetrics.medianResponseTime,
                p95ResponseTime: conversationMetrics.p95ResponseTime,
                conversionRate: conversationMetrics.conversionRate,

                // Intent metrics with defaults
                intents: intentMetrics.intents || [],

                // Popularity metrics with defaults
                popularGenres: popularityMetrics.popularGenres || [],
                popularArtists: popularityMetrics.popularArtists || [],
                popularMovies: popularityMetrics.popularMovies || [],

                // Timing metrics with defaults
                peakHours: timingMetrics.peakHours || [],

                // User metrics with defaults
                newUsers: userMetrics.newUsers || 0,
                returningUsers: userMetrics.returningUsers || 0
            };

            // Update cache with 120s TTL for date-filtered queries
            cacheService.set(cacheKey, analytics, { ttl: CACHE_TTL.ANALYTICS_DATE_RANGE });

            console.log('✅ Chatbot analytics fetched and cached successfully');
            return analytics;
        } catch (error) {
            console.error('Error getting chatbot analytics:', error);

            // Return cached data if available, even if expired
            const cachedData = cacheService.get<ChatbotAnalytics>(cacheKey);
            if (cachedData) {
                console.warn('⚠️ Returning stale cached chatbot analytics due to error');
                return cachedData;
            }

            // Return empty analytics as last resort
            console.error('❌ No cached chatbot analytics available, returning empty data');
            throw error;
        }
    }

    /**
     * Get popular content by type
     * UPDATED: Fetches data from MySQL database (SSOT)
     * Uses user_customization_states and orders tables for popular content metrics
     */
    async getPopularContent(type: 'genres' | 'artists' | 'movies', limit: number = 10): Promise<Array<{ name: string; count: number }>> {
        try {
            // Query MySQL database for popular content
            let results: Array<{ name: string; count: number }> = [];

            if (type === 'genres') {
                results = await businessDB.getTopGenres(limit);
            } else if (type === 'artists') {
                results = await businessDB.getTopArtists(limit);
            } else if (type === 'movies') {
                results = await businessDB.getTopMovies(limit);
            }

            // Validate: ensure no negative or impossibly high counts
            return results.filter(item =>
                item.count > 0 &&
                item.count < ANALYTICS_LIMITS.MAX_POPULAR_ITEMS_COUNT &&
                item.name &&
                item.name.length > 0
            );
        } catch (error: any) {
            console.error(`Error getting popular ${type} from MySQL:`, error);
            console.error('Stack:', error.stack);
            // Return empty array on error - no fallback to demo data
            return [];
        }
    }

    /**
     * Get conversion metrics
     */
    async getConversionMetrics(): Promise<{
        conversionRate: number;
        averageTimeToConversion: number;
        dropoffStages: Array<{ stage: string; count: number }>;
    }> {
        try {
            // Calculate conversion metrics from user sessions
            const totalConversations = userSessions.size;
            const conversionsCount = await this.countCompletedOrders();

            return {
                conversionRate: totalConversations > 0 ? (conversionsCount / totalConversations) * 100 : 0,
                averageTimeToConversion: 0, // Calculate from session data
                dropoffStages: []
            };
        } catch (error) {
            console.error('Error getting conversion metrics:', error);
            return {
                conversionRate: 0,
                averageTimeToConversion: 0,
                dropoffStages: []
            };
        }
    }

    // ========================================
    // Private helper methods
    // ========================================

    private async getOrderStatistics(): Promise<Partial<DashboardStats>> {
        try {
            // Always fetch fresh data from database
            const stats = await businessDB.getOrderStatistics();

            // Validate statistics are reasonable
            const validatedStats = {
                total_orders: Math.max(0, Math.min(Number(stats.total_orders) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                pending_orders: Math.max(0, Math.min(Number(stats.pending_orders) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                processing_orders: Math.max(0, Math.min(Number(stats.processing_orders) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                completed_orders: Math.max(0, Math.min(Number(stats.completed_orders) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                error_orders: Math.max(0, Math.min(Number(stats.error_orders) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                failed_orders: Math.max(0, Math.min(Number(stats.failed_orders) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT))
            };

            // Get time-based counts with validated dates
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            const [ordersToday, ordersThisWeek, ordersThisMonth] = await Promise.all([
                this.countOrdersSince(todayStart),
                this.countOrdersSince(weekStart),
                this.countOrdersSince(monthStart)
            ]);

            return {
                totalOrders: validatedStats.total_orders,
                pendingOrders: validatedStats.pending_orders,
                processingOrders: validatedStats.processing_orders,
                completedOrders: validatedStats.completed_orders,
                cancelledOrders: validatedStats.error_orders + validatedStats.failed_orders,
                ordersToday,
                ordersThisWeek,
                ordersThisMonth
            };
        } catch (error) {
            console.error('Error getting order statistics:', error);
            // Return zeros instead of throwing to prevent dashboard failure
            return {
                totalOrders: 0,
                pendingOrders: 0,
                processingOrders: 0,
                completedOrders: 0,
                cancelledOrders: 0,
                ordersToday: 0,
                ordersThisWeek: 0,
                ordersThisMonth: 0
            };
        }
    }

    private async getContentStatistics(): Promise<Partial<DashboardStats>> {
        try {
            // Always fetch fresh data from database
            const [contentDist, capacityDist, topGenres, topArtists, topMovies] = await Promise.all([
                this.getContentDistribution(),
                this.getCapacityDistribution(),
                businessDB.getTopGenres(5),
                this.getPopularContent('artists', 5),
                this.getPopularContent('movies', 5)
            ]);

            // Validate distributions
            const validatedContentDist = {
                music: Math.max(0, Math.min(Number(contentDist.music) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                videos: Math.max(0, Math.min(Number(contentDist.videos) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                movies: Math.max(0, Math.min(Number(contentDist.movies) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                series: Math.max(0, Math.min(Number(contentDist.series) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                mixed: Math.max(0, Math.min(Number(contentDist.mixed) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT))
            };

            const validatedCapacityDist = {
                '8GB': Math.max(0, Math.min(Number(capacityDist['8GB']) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                '32GB': Math.max(0, Math.min(Number(capacityDist['32GB']) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                '64GB': Math.max(0, Math.min(Number(capacityDist['64GB']) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                '128GB': Math.max(0, Math.min(Number(capacityDist['128GB']) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                '256GB': Math.max(0, Math.min(Number(capacityDist['256GB']) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT))
            };

            return {
                contentDistribution: validatedContentDist,
                capacityDistribution: validatedCapacityDist,
                topGenres: topGenres || [],
                topArtists: topArtists || [],
                topMovies: topMovies || []
            };
        } catch (error) {
            console.error('Error getting content statistics:', error);
            // Return empty distributions instead of throwing
            return {
                contentDistribution: { music: 0, videos: 0, movies: 0, series: 0, mixed: 0 },
                capacityDistribution: { '8GB': 0, '32GB': 0, '64GB': 0, '128GB': 0, '256GB': 0 },
                topGenres: [],
                topArtists: [],
                topMovies: []
            };
        }
    }

    private async getRevenueStatistics(): Promise<Partial<DashboardStats>> {
        try {
            // Always fetch fresh data from database
            const stats = await businessDB.getOrderStatistics();

            // Validate revenue statistics
            const totalRevenue = Math.max(0, Math.min(Number(stats.total_revenue) || 0, ANALYTICS_LIMITS.MAX_TOTAL_REVENUE));
            const averagePrice = Math.max(0, Math.min(Number(stats.average_price) || 0, ANALYTICS_LIMITS.MAX_AVERAGE_PRICE));

            return {
                totalRevenue,
                averageOrderValue: averagePrice
            };
        } catch (error) {
            console.error('Error getting revenue statistics:', error);
            // Return zeros instead of throwing
            return {
                totalRevenue: 0,
                averageOrderValue: 0
            };
        }
    }

    private async getConversationMetrics(dateFrom: Date, dateTo: Date): Promise<Partial<ChatbotAnalytics>> {
        try {
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available for conversation metrics');
                return this.getFallbackConversationMetrics();
            }

            // Total unique conversations (distinct phones with events in date range)
            const [totalRows] = await pool.execute(
                `SELECT COUNT(DISTINCT phone) as total_conversations 
                 FROM order_events 
                 WHERE created_at BETWEEN ? AND ?`,
                [dateFrom, dateTo]
            );
            const totalConversations = (totalRows as any[])[0]?.total_conversations || 0;

            // Active conversations (activity in last 30 minutes)
            const [activeRows] = await pool.execute(
                `SELECT COUNT(DISTINCT phone) as active_conversations 
                 FROM order_events 
                 WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
            );
            const activeConversations = (activeRows as any[])[0]?.active_conversations || 0;

            // Conversion rate: users with order_created or payment_confirmed / total users
            const [conversionRows] = await pool.execute(
                `SELECT 
                    COUNT(DISTINCT CASE WHEN event_type IN ('order_created', 'payment_confirmed', 'order_confirmed') THEN phone END) as converted,
                    COUNT(DISTINCT phone) as total
                 FROM order_events 
                 WHERE created_at BETWEEN ? AND ?`,
                [dateFrom, dateTo]
            );
            const converted = (conversionRows as any[])[0]?.converted || 0;
            const totalForConversion = (conversionRows as any[])[0]?.total || 0;
            const conversionRate = totalForConversion > 0 ? (converted / totalForConversion) * 100 : 0;

            // Response time calculation - find pairs of user messages and bot responses
            const [timingRows] = await pool.execute(
                `SELECT response_time_seconds FROM (
                    SELECT 
                        TIMESTAMPDIFF(SECOND, e1.created_at, MIN(e2.created_at)) as response_time_seconds
                    FROM order_events e1
                    INNER JOIN order_events e2 ON e1.phone = e2.phone 
                        AND e2.created_at > e1.created_at
                        AND e2.event_source = 'bot'
                    WHERE e1.event_source != 'bot'
                        AND e1.created_at BETWEEN ? AND ?
                    GROUP BY e1.id, e1.created_at
                    HAVING response_time_seconds IS NOT NULL AND response_time_seconds > 0 AND response_time_seconds < 3600
                ) timing
                ORDER BY response_time_seconds`,
                [dateFrom, dateTo]
            );

            // Calculate avg, median, p95 from response times
            const times = (timingRows as any[]).map(r => r.response_time_seconds).filter(t => t > 0);
            let averageResponseTime = 0;
            let medianResponseTime = 0;
            let p95ResponseTime = 0;

            if (times.length > 0) {
                averageResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
                times.sort((a, b) => a - b);
                medianResponseTime = times[Math.floor(times.length / 2)];
                p95ResponseTime = times[Math.floor(times.length * 0.95)] || times[times.length - 1];
            }

            return {
                activeConversations,
                totalConversations,
                averageResponseTime: Math.round(averageResponseTime),
                medianResponseTime: Math.round(medianResponseTime),
                p95ResponseTime: Math.round(p95ResponseTime),
                conversionRate: Math.round(conversionRate * 100) / 100
            };
        } catch (error) {
            console.error('Error getting conversation metrics from DB:', error);
            return this.getFallbackConversationMetrics();
        }
    }

    private getFallbackConversationMetrics(): Partial<ChatbotAnalytics> {
        // Fallback to in-memory sessions if DB fails
        const activeConversations = Array.from(userSessions.values()).filter(
            session => {
                const lastInteraction = session.lastInteraction || new Date(0);
                const hoursSinceLastInteraction = (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60);
                return hoursSinceLastInteraction < 24;
            }
        ).length;

        return {
            activeConversations,
            totalConversations: userSessions.size,
            averageResponseTime: 0,
            medianResponseTime: 0,
            p95ResponseTime: 0,
            conversionRate: 0
        };
    }

    private async getIntentMetrics(dateFrom: Date, dateTo: Date): Promise<Partial<ChatbotAnalytics>> {
        try {
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available for intent metrics');
                return { intents: [] };
            }

            // Query intent_conversion_stats table for aggregated intent data
            const [rows] = await pool.execute(
                `SELECT 
                    intent as name,
                    SUM(intent_count) as count,
                    CASE 
                        WHEN SUM(intent_count) > 0 
                        THEN (SUM(successful_conversions) / SUM(intent_count)) * 100 
                        ELSE 0 
                    END as success_rate
                 FROM intent_conversion_stats 
                 WHERE date BETWEEN DATE(?) AND DATE(?)
                 GROUP BY intent 
                 ORDER BY count DESC 
                 LIMIT 10`,
                [dateFrom, dateTo]
            );

            const intents = (rows as any[]).map(row => ({
                name: row.name || 'unknown',
                count: parseInt(row.count) || 0,
                successRate: Math.round((parseFloat(row.success_rate) || 0) * 100) / 100
            }));

            return { intents };
        } catch (error) {
            console.error('Error getting intent metrics from DB:', error);
            return { intents: [] };
        }
    }

    private async getPopularityMetrics(): Promise<Partial<ChatbotAnalytics>> {
        try {
            const [popularGenres, popularArtists, popularMovies] = await Promise.all([
                this.getPopularContent('genres', 10),
                this.getPopularContent('artists', 10),
                this.getPopularContent('movies', 10)
            ]);

            return {
                popularGenres: popularGenres.map(item => ({ genre: item.name, count: item.count })),
                popularArtists: popularArtists.map(item => ({ artist: item.name, count: item.count })),
                popularMovies: popularMovies.map(item => ({ title: item.name, count: item.count }))
            };
        } catch (error) {
            console.error('Error getting popularity metrics:', error);
            return {
                popularGenres: [],
                popularArtists: [],
                popularMovies: []
            };
        }
    }

    private async getTimingMetrics(dateFrom: Date, dateTo: Date): Promise<Partial<ChatbotAnalytics>> {
        try {
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available for timing metrics');
                return { peakHours: this.getEmptyPeakHours() };
            }

            // Calculate peak hours from order_events
            const [rows] = await pool.execute(
                `SELECT 
                    HOUR(created_at) as hour,
                    COUNT(*) as count
                 FROM order_events 
                 WHERE created_at BETWEEN ? AND ?
                 GROUP BY HOUR(created_at)
                 ORDER BY hour`,
                [dateFrom, dateTo]
            );

            // Initialize all hours with zero
            const peakHours: Array<{ hour: number; count: number }> = [];
            for (let hour = 0; hour < 24; hour++) {
                peakHours.push({ hour, count: 0 });
            }

            // Fill in actual counts from DB
            for (const row of rows as any[]) {
                const hour = parseInt(row.hour);
                if (hour >= 0 && hour < 24) {
                    peakHours[hour].count = parseInt(row.count) || 0;
                }
            }

            return { peakHours };
        } catch (error) {
            console.error('Error getting timing metrics from DB:', error);
            return { peakHours: this.getEmptyPeakHours() };
        }
    }

    private getEmptyPeakHours(): Array<{ hour: number; count: number }> {
        const peakHours: Array<{ hour: number; count: number }> = [];
        for (let hour = 0; hour < 24; hour++) {
            peakHours.push({ hour, count: 0 });
        }
        return peakHours;
    }

    private async getUserMetrics(): Promise<Partial<ChatbotAnalytics>> {
        try {
            const sessions = Array.from(userSessions.values());
            const newUsers = sessions.filter(s => s.isNewUser).length;
            const returningUsers = sessions.filter(s => s.isReturningUser).length;

            return {
                newUsers,
                returningUsers
            };
        } catch (error) {
            console.error('Error getting user metrics:', error);
            return {
                newUsers: 0,
                returningUsers: 0
            };
        }
    }

    private async countOrdersSince(date: Date): Promise<number> {
        try {
            // Query database for orders since date
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available');
                return 0;
            }

            const query = `
                SELECT COUNT(*) as count 
                FROM orders 
                WHERE created_at >= ?
            `;

            const [rows] = await pool.execute(query, [date]);
            const count = (rows as any[])[0]?.count || 0;

            // Validate: ensure reasonable count (no negative, no impossibly high)
            const validatedCount = Math.max(0, Math.min(Number(count), 100000));
            return validatedCount;
        } catch (error) {
            console.error('Error counting orders:', error);
            return 0;
        }
    }

    private async countCompletedOrders(): Promise<number> {
        try {
            const stats = await businessDB.getOrderStatistics();
            return stats.completed_orders || 0;
        } catch (error) {
            console.error('Error counting completed orders:', error);
            return 0;
        }
    }

    private async getContentDistribution(): Promise<DashboardStats['contentDistribution']> {
        try {
            // Use businessDB method for consistency
            const dist = await businessDB.getContentDistribution();

            // Ensure all required keys are present
            return {
                music: dist.music || 0,
                videos: dist.videos || 0,
                movies: dist.movies || 0,
                series: dist.series || 0,
                mixed: dist.mixed || 0
            };
        } catch (error) {
            console.error('Error getting content distribution:', error);
            return {
                music: 0,
                videos: 0,
                movies: 0,
                series: 0,
                mixed: 0
            };
        }
    }

    private async getCapacityDistribution(): Promise<DashboardStats['capacityDistribution']> {
        try {
            // Use businessDB method for consistency
            const dist = await businessDB.getCapacityDistribution();

            // Ensure all required keys are present
            return {
                '8GB': dist['8GB'] || 0,
                '32GB': dist['32GB'] || 0,
                '64GB': dist['64GB'] || 0,
                '128GB': dist['128GB'] || 0,
                '256GB': dist['256GB'] || 0
            };
        } catch (error) {
            console.error('Error getting capacity distribution:', error);
            return {
                '8GB': 0,
                '32GB': 0,
                '64GB': 0,
                '128GB': 0,
                '256GB': 0
            };
        }
    }

    // ========================================
    // Dashboard Summary with Date Range
    // ========================================

    /**
     * Get dashboard summary with optional date range filtering
     * Returns KPIs, distributions by type/capacity for dashboard charts
     */
    async getDashboardSummary(dateFrom?: Date, dateTo?: Date): Promise<{
        kpis: {
            total: number;
            pending: number;
            processing: number;
            completed: number;
        };
        distributionByType: Array<{ type: string; count: number }>;
        distributionByCapacity: Array<{ capacity: string; count: number }>;
        dailyTimeSeries?: Array<{ date: string; count: number }>;
    }> {
        try {
            console.log(`🔄 Fetching dashboard summary${dateFrom || dateTo ? ` for date range: ${dateFrom?.toISOString()} - ${dateTo?.toISOString()}` : ''}`);
            
            const pool = getDatabasePool();
            if (!pool) {
                throw new Error('Database pool not available');
            }

            // Build date filters
            const dateFilter = this.buildDateFilter(dateFrom, dateTo);
            const params: any[] = [];
            
            if (dateFrom) params.push(dateFrom);
            if (dateTo) params.push(dateTo);
            
            // Run all queries in parallel for performance
            const [kpis, typeDistribution, capacityDistribution, timeSeries] = await Promise.all([
                this.getKPIsWithDateRange(pool, dateFilter, params),
                this.getTypeDistributionWithDateRange(pool, dateFilter, params),
                this.getCapacityDistributionWithDateRange(pool, dateFilter, params),
                this.getDailyTimeSeriesWithDateRange(pool, dateFrom, dateTo)
            ]);

            return {
                kpis,
                distributionByType: typeDistribution,
                distributionByCapacity: capacityDistribution,
                dailyTimeSeries: timeSeries
            };

        } catch (error) {
            console.error('Error getting dashboard summary:', error);
            // Return empty data on error
            return {
                kpis: {
                    total: 0,
                    pending: 0,
                    processing: 0,
                    completed: 0
                },
                distributionByType: [],
                distributionByCapacity: [],
                dailyTimeSeries: []
            };
        }
    }

    /**
     * Build SQL date filter clause
     */
    private buildDateFilter(dateFrom?: Date, dateTo?: Date): string {
        const clauses: string[] = [];
        
        if (dateFrom) {
            clauses.push('created_at >= ?');
        }
        if (dateTo) {
            clauses.push('created_at <= ?');
        }
        
        return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    }

    /**
     * Get KPIs (total, pending, processing, completed) with date range
     */
    private async getKPIsWithDateRange(
        pool: any,
        dateFilter: string,
        params: any[]
    ): Promise<{ total: number; pending: number; processing: number; completed: number }> {
        try {
            const query = `
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN processing_status = 'pending' THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN processing_status = 'processing' THEN 1 ELSE 0 END) AS processing,
                    SUM(CASE WHEN processing_status = 'completed' THEN 1 ELSE 0 END) AS completed
                FROM orders
                ${dateFilter}
            `;

            const [rows] = await pool.execute(query, params);
            const row = (rows as any[])[0] || {};

            return {
                total: Math.max(0, Math.min(Number(row.total) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                pending: Math.max(0, Math.min(Number(row.pending) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                processing: Math.max(0, Math.min(Number(row.processing) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT)),
                completed: Math.max(0, Math.min(Number(row.completed) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT))
            };
        } catch (error) {
            console.error('Error getting KPIs with date range:', error);
            return { total: 0, pending: 0, processing: 0, completed: 0 };
        }
    }

    /**
     * Get distribution by product type with date range
     */
    private async getTypeDistributionWithDateRange(
        pool: any,
        dateFilter: string,
        params: any[]
    ): Promise<Array<{ type: string; count: number }>> {
        try {
            const query = `
                SELECT 
                    COALESCE(product_type, 'unknown') AS type,
                    COUNT(*) AS count
                FROM orders
                ${dateFilter}
                GROUP BY product_type
                ORDER BY count DESC
            `;

            const [rows] = await pool.execute(query, params);
            
            return (rows as any[]).map(row => ({
                type: String(row.type || 'unknown'),
                count: Math.max(0, Math.min(Number(row.count) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT))
            }));
        } catch (error) {
            console.error('Error getting type distribution with date range:', error);
            return [];
        }
    }

    /**
     * Get distribution by capacity with date range
     */
    private async getCapacityDistributionWithDateRange(
        pool: any,
        dateFilter: string,
        params: any[]
    ): Promise<Array<{ capacity: string; count: number }>> {
        try {
            const query = `
                SELECT 
                    COALESCE(capacity, 'unknown') AS capacity,
                    COUNT(*) AS count
                FROM orders
                ${dateFilter}
                GROUP BY capacity
                ORDER BY count DESC
            `;

            const [rows] = await pool.execute(query, params);
            
            return (rows as any[]).map(row => ({
                capacity: String(row.capacity || 'unknown'),
                count: Math.max(0, Math.min(Number(row.count) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT))
            }));
        } catch (error) {
            console.error('Error getting capacity distribution with date range:', error);
            return [];
        }
    }

    /**
     * Get daily time series of orders within date range
     */
    private async getDailyTimeSeriesWithDateRange(
        pool: any,
        dateFrom?: Date,
        dateTo?: Date
    ): Promise<Array<{ date: string; count: number }>> {
        try {
            // Default to last DEFAULT_DAYS_LOOKBACK days if no date range provided
            const effectiveFrom = dateFrom || new Date(Date.now() - DEFAULT_DAYS_LOOKBACK * MS_PER_DAY);
            const effectiveTo = dateTo || new Date();

            const query = `
                SELECT 
                    DATE(created_at) AS date,
                    COUNT(*) AS count
                FROM orders
                WHERE created_at >= ? AND created_at <= ?
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            `;

            const [rows] = await pool.execute(query, [effectiveFrom, effectiveTo]);
            
            return (rows as any[]).map(row => ({
                date: row.date instanceof Date 
                    ? row.date.toISOString().split('T')[0]
                    : String(row.date),
                count: Math.max(0, Math.min(Number(row.count) || 0, ANALYTICS_LIMITS.MAX_REASONABLE_COUNT))
            }));
        } catch (error) {
            console.error('Error getting daily time series:', error);
            return [];
        }
    }
}

// Singleton instance
export const analyticsService = new AnalyticsService();
