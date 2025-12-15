/**
 * Analytics Service - Provides statistics and analytics for the admin panel
 */

import { businessDB } from '../../mysql-database';
import { userSessions } from '../../flows/userTrackingSystem';
import type { DashboardStats, ChatbotAnalytics } from '../types/AdminTypes';

export class AnalyticsService {
    /**
     * Get comprehensive dashboard statistics
     */
    async getDashboardStats(): Promise<DashboardStats> {
        try {
            const [
                orderStats,
                contentStats,
                revenueStats
            ] = await Promise.all([
                this.getOrderStatistics(),
                this.getContentStatistics(),
                this.getRevenueStatistics()
            ]);

            return {
                ...orderStats,
                ...contentStats,
                ...revenueStats
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
                ...conversationMetrics,
                ...intentMetrics,
                ...popularityMetrics,
                ...timingMetrics,
                ...userMetrics
            };
        } catch (error) {
            console.error('Error getting chatbot analytics:', error);
            throw error;
        }
    }

    /**
     * Get popular content by type
     */
    async getPopularContent(type: 'genres' | 'artists' | 'movies', limit: number = 10): Promise<Array<{ name: string; count: number }>> {
        try {
            // Query from database based on order customizations
            // For now, return demo data as fallback
            const demoData = {
                genres: [
                    { name: 'Reggaeton', count: 25 },
                    { name: 'Salsa', count: 18 },
                    { name: 'Rock', count: 15 },
                    { name: 'Pop', count: 12 },
                    { name: 'Vallenato', count: 10 },
                    { name: 'Electrónica', count: 8 },
                    { name: 'Bachata', count: 7 },
                    { name: 'Merengue', count: 6 },
                    { name: 'Rap', count: 5 },
                    { name: 'Cumbia', count: 4 }
                ],
                artists: [
                    { name: 'Feid', count: 8 },
                    { name: 'Karol G', count: 7 },
                    { name: 'Bad Bunny', count: 6 },
                    { name: 'J Balvin', count: 5 },
                    { name: 'Shakira', count: 4 },
                    { name: 'Maluma', count: 4 },
                    { name: 'Nicky Jam', count: 3 },
                    { name: 'Daddy Yankee', count: 3 },
                    { name: 'Ozuna', count: 2 },
                    { name: 'Anuel AA', count: 2 }
                ],
                movies: [
                    { name: 'Avatar 2', count: 5 },
                    { name: 'Top Gun Maverick', count: 4 },
                    { name: 'Spider-Man: No Way Home', count: 4 },
                    { name: 'The Batman', count: 3 },
                    { name: 'Jurassic World Dominion', count: 3 },
                    { name: 'Thor: Love and Thunder', count: 2 },
                    { name: 'Black Panther: Wakanda Forever', count: 2 },
                    { name: 'Doctor Strange 2', count: 2 },
                    { name: 'Minions: The Rise of Gru', count: 1 },
                    { name: 'Lightyear', count: 1 }
                ]
            };
            
            return (demoData[type] || []).slice(0, limit);
        } catch (error) {
            console.error(`Error getting popular ${type}:`, error);
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
                popularGenres,
                popularArtists,
                popularMovies
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
            // TODO: Implement real database query when schema is available
            // For now, return demo count based on date range
            const now = Date.now();
            const timeDiff = now - date.getTime();
            const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
            
            // Return demo counts: ~2 orders per day on average
            return Math.floor(daysDiff * 2);
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
            // Query and aggregate from orders
            // TODO: Implement real database aggregation when schema is available
            // For now, return demo distribution
            return {
                music: 8,
                videos: 3,
                movies: 2,
                series: 1,
                mixed: 1
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
            // Query and aggregate from orders
            // TODO: Implement real database aggregation when schema is available
            // For now, return demo distribution
            return {
                '8GB': 2,
                '32GB': 7,
                '64GB': 4,
                '128GB': 2,
                '256GB': 0
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
