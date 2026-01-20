/**
 * Analytics Service - Provides statistics and analytics for the admin panel
 */

import { businessDB } from '../../mysql-database';
import { userSessions } from '../../flows/userTrackingSystem';
import type { DashboardStats, ChatbotAnalytics } from '../types/AdminTypes';
import * as fs from 'fs';
import * as path from 'path';

// Helper to safely access database pool
// Note: pool is a private property, so we use type assertion with runtime check
function getDatabasePool(): any | null {
    const db = businessDB as any;
    return db && db.pool ? db.pool : null;
}

export class AnalyticsService {
    // Cache for analytics data with expiration
    private dashboardStatsCache: { data: DashboardStats | null; timestamp: number } = {
        data: null,
        timestamp: 0
    };
    
    private chatbotAnalyticsCache: { data: ChatbotAnalytics | null; timestamp: number } = {
        data: null,
        timestamp: 0
    };
    
    // Cache TTL in milliseconds (5 minutes by default)
    private readonly CACHE_TTL = 5 * 60 * 1000;
    
    /**
     * Helper method to find userCustomizationState.json file
     * Tries multiple possible paths and returns the first valid one
     */
    private findUserCustomizationFile(): string | null {
        const possiblePaths = [
            path.join(__dirname, '../../data/userCustomizationState.json'),
            path.join(process.cwd(), 'src/data/userCustomizationState.json'),
            path.join(process.cwd(), 'data/userCustomizationState.json')
        ];
        
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }
        
        return null;
    }

    /**
     * Clear analytics cache to force refresh
     */
    clearCache(): void {
        this.dashboardStatsCache = { data: null, timestamp: 0 };
        this.chatbotAnalyticsCache = { data: null, timestamp: 0 };
        console.log('✅ Analytics cache cleared');
    }
    
    /**
     * Check if cache is still valid
     */
    private isCacheValid(timestamp: number): boolean {
        return Date.now() - timestamp < this.CACHE_TTL;
    }

    /**
     * Get comprehensive dashboard statistics with caching
     */
    async getDashboardStats(forceRefresh: boolean = false): Promise<DashboardStats> {
        try {
            // Return cached data if still valid and not forcing refresh
            if (!forceRefresh && 
                this.isCacheValid(this.dashboardStatsCache.timestamp) && 
                this.dashboardStatsCache.data) {
                console.log('📊 Returning cached dashboard stats');
                return this.dashboardStatsCache.data;
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
            
            // Update cache
            this.dashboardStatsCache = {
                data: stats,
                timestamp: Date.now()
            };
            
            console.log('✅ Dashboard stats fetched and cached successfully');
            return stats;
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            
            // Return cached data if available, even if expired
            if (this.dashboardStatsCache.data) {
                console.warn('⚠️ Returning stale cached data due to error');
                return this.dashboardStatsCache.data;
            }
            
            // Return empty stats as last resort
            console.error('❌ No cached data available, returning empty stats');
            throw error;
        }
    }

    /**
     * Get chatbot analytics with caching
     */
    async getChatbotAnalytics(forceRefresh: boolean = false): Promise<ChatbotAnalytics> {
        try {
            // Return cached data if still valid and not forcing refresh
            if (!forceRefresh && 
                this.isCacheValid(this.chatbotAnalyticsCache.timestamp) && 
                this.chatbotAnalyticsCache.data) {
                console.log('📊 Returning cached chatbot analytics');
                return this.chatbotAnalyticsCache.data;
            }

            console.log('🔄 Fetching fresh chatbot analytics from database');
            
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

            const analytics: ChatbotAnalytics = {
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
            
            // Update cache
            this.chatbotAnalyticsCache = {
                data: analytics,
                timestamp: Date.now()
            };
            
            console.log('✅ Chatbot analytics fetched and cached successfully');
            return analytics;
        } catch (error) {
            console.error('Error getting chatbot analytics:', error);
            
            // Return cached data if available, even if expired
            if (this.chatbotAnalyticsCache.data) {
                console.warn('⚠️ Returning stale cached chatbot analytics due to error');
                return this.chatbotAnalyticsCache.data;
            }
            
            // Return empty analytics as last resort
            console.error('❌ No cached chatbot analytics available, returning empty data');
            throw error;
        }
    }

    /**
     * Get popular content by type
     * UPDATED: Fetches data from JSON files (userCustomizationState.json) since
     * the orders table doesn't have preferences/customization columns
     */
    async getPopularContent(type: 'genres' | 'artists' | 'movies', limit: number = 10): Promise<Array<{ name: string; count: number }>> {
        try {
            // Read data from userCustomizationState.json
            const userCustomizationPath = this.findUserCustomizationFile();
            
            if (!userCustomizationPath) {
                console.warn('userCustomizationState.json not found in any expected location');
                return [];
            }
            
            const fileContent = fs.readFileSync(userCustomizationPath, 'utf8');
            const userCustomizationData = JSON.parse(fileContent);
            
            return this.extractPopularFromJSON(userCustomizationData, type, limit);
        } catch (error: any) {
            console.error(`Error getting popular ${type} from JSON files:`, error);
            console.error('Stack:', error.stack);
            // Return empty array on error - no fallback to demo data
            return [];
        }
    }

    /**
     * Extract popular content from user customization JSON data
     */
    private extractPopularFromJSON(data: any, type: 'genres' | 'artists' | 'movies', limit: number): Array<{ name: string; count: number }> {
        const countMap = new Map<string, number>();
        
        // Iterate through all users in the JSON data
        Object.values(data || {}).forEach((user: any) => {
            let items: string[] = [];
            
            if (type === 'genres') {
                items = user.selectedGenres || [];
            } else if (type === 'artists') {
                items = user.mentionedArtists || [];
            } else if (type === 'movies') {
                // Movies could be in various fields depending on the flow
                items = [
                    ...(user.requestedTitles || []),
                    ...(user.selectedMovies || []),
                    ...(user.titles || [])
                ];
            }
            
            // Count each item
            items.forEach(item => {
                if (item && typeof item === 'string' && item.trim()) {
                    const normalized = item.trim();
                    countMap.set(normalized, (countMap.get(normalized) || 0) + 1);
                }
            });
        });
        
        // Convert to array and sort by count
        const results = Array.from(countMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
        
        // Validate: ensure no negative or impossibly high counts
        return results.filter(item => 
            item.count > 0 && 
            item.count < 10000 && 
            item.name && 
            item.name.length > 0
        );
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
                total_orders: Math.max(0, Math.min(Number(stats.total_orders) || 0, 1000000)),
                pending_orders: Math.max(0, Math.min(Number(stats.pending_orders) || 0, 1000000)),
                processing_orders: Math.max(0, Math.min(Number(stats.processing_orders) || 0, 1000000)),
                completed_orders: Math.max(0, Math.min(Number(stats.completed_orders) || 0, 1000000)),
                error_orders: Math.max(0, Math.min(Number(stats.error_orders) || 0, 1000000)),
                failed_orders: Math.max(0, Math.min(Number(stats.failed_orders) || 0, 1000000))
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
                music: Math.max(0, Math.min(Number(contentDist.music) || 0, 1000000)),
                videos: Math.max(0, Math.min(Number(contentDist.videos) || 0, 1000000)),
                movies: Math.max(0, Math.min(Number(contentDist.movies) || 0, 1000000)),
                series: Math.max(0, Math.min(Number(contentDist.series) || 0, 1000000)),
                mixed: Math.max(0, Math.min(Number(contentDist.mixed) || 0, 1000000))
            };
            
            const validatedCapacityDist = {
                '8GB': Math.max(0, Math.min(Number(capacityDist['8GB']) || 0, 1000000)),
                '32GB': Math.max(0, Math.min(Number(capacityDist['32GB']) || 0, 1000000)),
                '64GB': Math.max(0, Math.min(Number(capacityDist['64GB']) || 0, 1000000)),
                '128GB': Math.max(0, Math.min(Number(capacityDist['128GB']) || 0, 1000000)),
                '256GB': Math.max(0, Math.min(Number(capacityDist['256GB']) || 0, 1000000))
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
            const totalRevenue = Math.max(0, Math.min(Number(stats.total_revenue) || 0, 999999999999));
            const averagePrice = Math.max(0, Math.min(Number(stats.average_price) || 0, 999999999));
            
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
}

// Singleton instance
export const analyticsService = new AnalyticsService();
