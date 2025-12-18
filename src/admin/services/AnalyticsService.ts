/**
 * Analytics Service - Provides statistics and analytics for the admin panel
 */

import { businessDB } from '../../mysql-database';
import { userSessions } from '../../flows/userTrackingSystem';
import type { DashboardStats, ChatbotAnalytics } from '../types/AdminTypes';

// Helper to safely access database pool
// Note: pool is a private property, so we use type assertion with runtime check
function getDatabasePool(): any | null {
    const db = businessDB as any;
    return db && db.pool ? db.pool : null;
}

export class AnalyticsService {
    /**
     * Get comprehensive dashboard statistics
     */
    async getDashboardStats(): Promise<DashboardStats> {
        try {
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

            return {
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
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            throw error;
        }
    }

    /**
     * Get chatbot analytics
     */
    async getChatbotAnalytics(): Promise<ChatbotAnalytics> {
        try {
            const [
                conversationMetrics,
                intentMetrics,
                popularityMetrics,
                timingMetrics,
                userMetrics
            ] = await Promise.all([
                this.getConversationMetrics(),
                this.getIntentMetrics(),
                this.getPopularityMetrics(),
                this.getTimingMetrics(),
                this.getUserMetrics()
            ]);

            return {
                // Conversation metrics with defaults
                activeConversations: conversationMetrics.activeConversations || 0,
                totalConversations: conversationMetrics.totalConversations || 0,
                averageResponseTime: conversationMetrics.averageResponseTime || 0,
                
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
        } catch (error) {
            console.error('Error getting chatbot analytics:', error);
            throw error;
        }
    }

    /**
     * Get popular content by type
     * UPDATED: Now fetches real data from MySQL orders table with robust column detection
     */
    async getPopularContent(type: 'genres' | 'artists' | 'movies', limit: number = 10): Promise<Array<{ name: string; count: number }>> {
        try {
            // Query real data from database based on order customizations
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available, returning empty data');
                return [];
            }

            // First, check which columns exist in the orders table
            const [columns] = await pool.execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'orders'
                AND COLUMN_NAME IN ('preferences', 'customization')
            `);
            
            const availableColumns = (columns as any[]).map(col => col.COLUMN_NAME);
            const hasPreferences = availableColumns.includes('preferences');
            const hasCustomization = availableColumns.includes('customization');
            
            if (!hasPreferences && !hasCustomization) {
                console.warn(`Neither preferences nor customization columns exist in orders table`);
                return [];
            }

            // Use whitelisted column name only
            const ALLOWED_COLUMNS = ['preferences', 'customization'];
            const jsonColumn = hasPreferences ? 'preferences' : 'customization';
            
            if (!ALLOWED_COLUMNS.includes(jsonColumn)) {
                console.error('Invalid column name detected, aborting query');
                return [];
            }
            
            let query = '';
            
            if (type === 'genres') {
                // Extract genres from JSON field - using parameterized column name through whitelist
                query = `
                    SELECT 
                        JSON_UNQUOTE(genre_value) as name,
                        COUNT(*) as count
                    FROM orders,
                    JSON_TABLE(
                        COALESCE(${jsonColumn}, '{}'),
                        '$.genres[*]' COLUMNS (genre_value VARCHAR(100) PATH '$')
                    ) AS jt
                    WHERE JSON_UNQUOTE(genre_value) IS NOT NULL 
                    AND JSON_UNQUOTE(genre_value) != ''
                    GROUP BY name
                    ORDER BY count DESC
                    LIMIT ?
                `;
            } else if (type === 'artists') {
                // Extract artists from JSON field
                query = `
                    SELECT 
                        JSON_UNQUOTE(artist_value) as name,
                        COUNT(*) as count
                    FROM orders,
                    JSON_TABLE(
                        COALESCE(${jsonColumn}, '{}'),
                        '$.artists[*]' COLUMNS (artist_value VARCHAR(100) PATH '$')
                    ) AS jt
                    WHERE JSON_UNQUOTE(artist_value) IS NOT NULL 
                    AND JSON_UNQUOTE(artist_value) != ''
                    GROUP BY name
                    ORDER BY count DESC
                    LIMIT ?
                `;
            } else if (type === 'movies') {
                // Extract movies/titles from JSON field
                // Try both 'titles' and 'movies' paths in the JSON
                query = `
                    SELECT name, SUM(count) as count
                    FROM (
                        SELECT 
                            JSON_UNQUOTE(title_value) as name,
                            COUNT(*) as count
                        FROM orders,
                        JSON_TABLE(
                            COALESCE(${jsonColumn}, '{}'),
                            '$.titles[*]' COLUMNS (title_value VARCHAR(200) PATH '$')
                        ) AS jt
                        WHERE JSON_UNQUOTE(title_value) IS NOT NULL 
                        AND JSON_UNQUOTE(title_value) != ''
                        
                        UNION ALL
                        
                        SELECT 
                            JSON_UNQUOTE(movie_value) as name,
                            COUNT(*) as count
                        FROM orders,
                        JSON_TABLE(
                            COALESCE(${jsonColumn}, '{}'),
                            '$.movies[*]' COLUMNS (movie_value VARCHAR(200) PATH '$')
                        ) AS jt
                        WHERE JSON_UNQUOTE(movie_value) IS NOT NULL 
                        AND JSON_UNQUOTE(movie_value) != ''
                    ) AS combined
                    GROUP BY name
                    ORDER BY count DESC
                    LIMIT ?
                `;
            }

            const [rows] = await pool.execute(query, [limit]);
            const results = (rows as any[]).map(row => ({
                name: row.name,
                count: Number(row.count) || 0
            }));

            // Validate: ensure no negative or impossibly high counts
            return results.filter(item => 
                item.count > 0 && 
                item.count < 10000 && 
                item.name && 
                item.name.length > 0
            );
        } catch (error: any) {
            console.error(`Error getting popular ${type} from database:`, error);
            // Log specific error details for debugging
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                console.error('Database schema issue: column may be missing', error.message);
            }
            // Return empty array instead of demo data
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
            const stats = await businessDB.getOrderStatistics();
            
            // Get time-based counts
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            return {
                totalOrders: stats.total_orders || 0,
                pendingOrders: stats.pending_orders || 0,
                processingOrders: stats.processing_orders || 0,
                completedOrders: stats.completed_orders || 0,
                cancelledOrders: stats.error_orders || stats.failed_orders || 0,
                ordersToday: await this.countOrdersSince(todayStart),
                ordersThisWeek: await this.countOrdersSince(weekStart),
                ordersThisMonth: await this.countOrdersSince(monthStart)
            };
        } catch (error) {
            console.error('Error getting order statistics:', error);
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
            // Aggregate content type distribution from orders
            const contentDist = await this.getContentDistribution();
            const capacityDist = await this.getCapacityDistribution();
            const topGenres = await this.getPopularContent('genres', 5);
            const topArtists = await this.getPopularContent('artists', 5);
            const topMovies = await this.getPopularContent('movies', 5);

            return {
                contentDistribution: contentDist,
                capacityDistribution: capacityDist,
                topGenres,
                topArtists,
                topMovies
            };
        } catch (error) {
            console.error('Error getting content statistics:', error);
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
            const stats = await businessDB.getOrderStatistics();
            
            return {
                totalRevenue: stats.total_revenue || 0,
                averageOrderValue: stats.average_price || 0
            };
        } catch (error) {
            console.error('Error getting revenue statistics:', error);
            return {
                totalRevenue: 0,
                averageOrderValue: 0
            };
        }
    }

    private async getConversationMetrics(): Promise<Partial<ChatbotAnalytics>> {
        try {
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
                averageResponseTime: 0 // Calculate from message logs
            };
        } catch (error) {
            console.error('Error getting conversation metrics:', error);
            return {
                activeConversations: 0,
                totalConversations: 0,
                averageResponseTime: 0
            };
        }
    }

    private async getIntentMetrics(): Promise<Partial<ChatbotAnalytics>> {
        try {
            // Get intent statistics from database or AI service
            // Placeholder
            return {
                intents: []
            };
        } catch (error) {
            console.error('Error getting intent metrics:', error);
            return {
                intents: []
            };
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

    private async getTimingMetrics(): Promise<Partial<ChatbotAnalytics>> {
        try {
            // Calculate peak hours from interaction logs
            // Placeholder
            const peakHours: Array<{ hour: number; count: number }> = [];
            
            for (let hour = 0; hour < 24; hour++) {
                peakHours.push({ hour, count: 0 });
            }

            return {
                peakHours
            };
        } catch (error) {
            console.error('Error getting timing metrics:', error);
            return {
                peakHours: []
            };
        }
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
            // Query and aggregate from orders table
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available');
                return {
                    music: 0,
                    videos: 0,
                    movies: 0,
                    series: 0,
                    mixed: 0
                };
            }

            const query = `
                SELECT 
                    product_type,
                    COUNT(*) as count
                FROM orders
                GROUP BY product_type
            `;
            
            const [rows] = await pool.execute(query);
            const distribution: DashboardStats['contentDistribution'] = {
                music: 0,
                videos: 0,
                movies: 0,
                series: 0,
                mixed: 0
            };

            // Map database results to distribution object
            (rows as any[]).forEach(row => {
                const type = row.product_type;
                const count = Number(row.count) || 0;
                
                // Validate count is reasonable
                if (count >= 0 && count < 100000) {
                    if (type === 'music') distribution.music = count;
                    else if (type === 'video') distribution.videos = count;
                    else if (type === 'movies') distribution.movies = count;
                    else if (type === 'series') distribution.series = count;
                    else if (type === 'custom') distribution.mixed = count;
                }
            });

            return distribution;
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
            // Query and aggregate from orders table
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available');
                return {
                    '8GB': 0,
                    '32GB': 0,
                    '64GB': 0,
                    '128GB': 0,
                    '256GB': 0
                };
            }

            const query = `
                SELECT 
                    capacity,
                    COUNT(*) as count
                FROM orders
                WHERE capacity IS NOT NULL AND capacity != ''
                GROUP BY capacity
            `;
            
            const [rows] = await pool.execute(query);
            const distribution: DashboardStats['capacityDistribution'] = {
                '8GB': 0,
                '32GB': 0,
                '64GB': 0,
                '128GB': 0,
                '256GB': 0
            };

            // Map database results to distribution object
            (rows as any[]).forEach(row => {
                const capacity = row.capacity;
                const count = Number(row.count) || 0;
                
                // Validate count is reasonable and capacity is valid
                if (count >= 0 && count < 100000) {
                    if (capacity in distribution) {
                        distribution[capacity as keyof typeof distribution] = count;
                    }
                }
            });

            return distribution;
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
}

// Singleton instance
export const analyticsService = new AnalyticsService();
