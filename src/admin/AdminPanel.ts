/**
 * Admin Panel - Main controller for admin interface
 * Integrates all admin services and provides API endpoints
 */

import type { Request, Response } from 'express';
import { orderService } from './services/OrderService';
import { contentService } from './services/ContentService';
import { analyticsService } from './services/AnalyticsService';
import { copyService } from './services/CopyService';
import { autoProcessor } from '../autoProcessor';
import { enhancedAutoProcessor } from '../services/enhancedAutoProcessor';
import { processingJobService } from '../services/ProcessingJobService';
import { panelSettingsRepository } from '../repositories/PanelSettingsRepository';
import { cacheService, CACHE_KEYS, CACHE_TTL } from '../services/CacheService';
import { toSafeInt } from '../utils/numberUtils';
import type {
    ApiResponse,
    OrderFilter,
    ContentSearchFilter,
    ContentType,
    OrderStatus
} from './types/AdminTypes';

// Valid content categories for validation
const VALID_CONTENT_CATEGORIES: ContentType[] = ['music', 'videos', 'movies', 'series'];

// Validation limits - prevents display issues and database overload
const VALIDATION_LIMITS = {
    MAX_ORDERS: 1_000_000,      // Maximum orders to prevent count overflow
    MAX_REVENUE: 1_000_000_000, // $1 billion - prevents display issues
    MAX_TOP_COUNT: 10_000,      // Maximum count in top lists
    MAX_PERCENTAGE: 100,        // Maximum percentage value
    MIN_VALUE: 0                // Minimum for all counts
} as const;

// Export cache invalidation for use by OrderService
export function invalidateDashboardCache() {
    cacheService.invalidateDashboard();
}

export class AdminPanel {
    /**
     * Invalidate cache - for manual refresh
     */
    static async invalidateCache(req: Request, res: Response): Promise<void> {
        try {
            const { key } = req.query;

            if (key) {
                cacheService.delete(key as string);
            } else {
                cacheService.clear();
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: key ? `Cache invalidated for key: ${key}` : 'All cache invalidated'
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Dashboard - Get comprehensive statistics
     * Now uses CacheService with 15s TTL and automatic invalidation
     */
    static async getDashboard(req: Request, res: Response): Promise<void> {
        try {
            // Check for explicit refresh request (uses cache by default)
            const forceRefresh = req.query.refresh === 'true';

            // If force refresh, clear cache first
            if (forceRefresh) {
                cacheService.delete(CACHE_KEYS.DASHBOARD_STATS);
            }

            // Check cache first (unless force refresh)
            const cached = cacheService.get<any>(CACHE_KEYS.DASHBOARD_STATS);

            if (!forceRefresh && cached) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: cached,
                    cached: true
                }));
                return;
            }

            // Set timeout for request
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout')), 15000);
            });

            const statsPromise = analyticsService.getDashboardStats(forceRefresh);
            const stats = await Promise.race([statsPromise, timeoutPromise]) as any;

            // Validate stats - ensure no impossible values
            const validatedStats = AdminPanel.validateDashboardStats(stats);

            // Update cache with 15s TTL
            cacheService.set(CACHE_KEYS.DASHBOARD_STATS, validatedStats, { ttl: CACHE_TTL.DASHBOARD });

            const response: ApiResponse<any> = {
                success: true,
                data: validatedStats
            };

            // Set cache headers and send response (15s cache)
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=15'
            });
            res.end(JSON.stringify(response));
        } catch (error: any) {
            console.error('Error in getDashboard:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message || 'Error loading dashboard data'
            }));
        }
    }

    /**
     * Dashboard Summary - Get statistics with optional date range filtering
     * Supports from/to query parameters for date filtering
     */
    static async getDashboardSummary(req: Request, res: Response): Promise<void> {
        try {
            const from = req.query.from ? new Date(req.query.from as string) : undefined;
            const to = req.query.to ? new Date(req.query.to as string) : undefined;

            // Validate dates
            if (from && isNaN(from.getTime())) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid "from" date format'
                }));
                return;
            }
            if (to && isNaN(to.getTime())) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Invalid "to" date format'
                }));
                return;
            }

            const stats = await analyticsService.getDashboardSummary(from, to);

            const response: ApiResponse<any> = {
                success: true,
                data: stats
            };

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60'
            });
            res.end(JSON.stringify(response));
        } catch (error: any) {
            console.error('Error in getDashboardSummary:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message || 'Error loading dashboard summary'
            }));
        }
    }

    /**
     * Validate dashboard stats to ensure data integrity
     */
    private static validateDashboardStats(stats: any): any {
        const validated = { ...stats };
        const { MAX_ORDERS, MAX_REVENUE, MAX_TOP_COUNT, MAX_PERCENTAGE, MIN_VALUE } = VALIDATION_LIMITS;

        // Validate order counts
        validated.totalOrders = Math.min(Math.max(MIN_VALUE, validated.totalOrders || 0), MAX_ORDERS);
        validated.pendingOrders = Math.min(Math.max(MIN_VALUE, validated.pendingOrders || 0), validated.totalOrders);
        validated.processingOrders = Math.min(Math.max(MIN_VALUE, validated.processingOrders || 0), validated.totalOrders);
        validated.completedOrders = Math.min(Math.max(MIN_VALUE, validated.completedOrders || 0), validated.totalOrders);
        validated.cancelledOrders = Math.min(Math.max(MIN_VALUE, validated.cancelledOrders || 0), validated.totalOrders);
        validated.ordersToday = Math.min(Math.max(MIN_VALUE, validated.ordersToday || 0), validated.totalOrders);
        validated.ordersThisWeek = Math.min(Math.max(MIN_VALUE, validated.ordersThisWeek || 0), validated.totalOrders);
        validated.ordersThisMonth = Math.min(Math.max(MIN_VALUE, validated.ordersThisMonth || 0), validated.totalOrders);

        // Validate revenue
        validated.totalRevenue = Math.min(Math.max(MIN_VALUE, validated.totalRevenue || 0), MAX_REVENUE);
        validated.averageOrderValue = Math.min(Math.max(MIN_VALUE, validated.averageOrderValue || 0), MAX_REVENUE);

        // Validate conversion rate (0-100%)
        validated.conversionRate = Math.min(Math.max(MIN_VALUE, validated.conversionRate || 0), MAX_PERCENTAGE);

        // Validate conversation count
        validated.conversationCount = Math.min(Math.max(MIN_VALUE, validated.conversationCount || 0), MAX_ORDERS);

        // Validate content distributions
        if (validated.contentDistribution) {
            Object.keys(validated.contentDistribution).forEach(key => {
                validated.contentDistribution[key] = Math.min(
                    Math.max(MIN_VALUE, validated.contentDistribution[key] || 0),
                    MAX_ORDERS
                );
            });
        }

        if (validated.capacityDistribution) {
            Object.keys(validated.capacityDistribution).forEach(key => {
                validated.capacityDistribution[key] = Math.min(
                    Math.max(MIN_VALUE, validated.capacityDistribution[key] || 0),
                    MAX_ORDERS
                );
            });
        }

        // Validate top arrays (ensure reasonable counts)
        const validateTopArray = (arr: any[]) => {
            return arr.map(item => ({
                ...item,
                count: Math.min(Math.max(MIN_VALUE, item.count || 0), MAX_TOP_COUNT)
            }));
        };

        if (validated.topGenres) validated.topGenres = validateTopArray(validated.topGenres);
        if (validated.topArtists) validated.topArtists = validateTopArray(validated.topArtists);
        if (validated.topMovies) validated.topMovies = validateTopArray(validated.topMovies);

        return validated;
    }

    /**
     * Orders - Get all orders with filters
     */
    static async getOrders(req: Request, res: Response): Promise<void> {
        try {
            const page = toSafeInt(req.query.page, { fallback: 1, min: 1 });
            const limit = toSafeInt(req.query.limit, { fallback: 50, min: 1, max: 200 });

            const filters: OrderFilter = {
                status: req.query.status as OrderStatus,
                contentType: req.query.contentType as ContentType,
                dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
                dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
                customerPhone: req.query.customerPhone as string,
                searchTerm: req.query.searchTerm as string
            };

            const result = await orderService.getOrders(filters, page, limit);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: result.data,
                pagination: result.pagination
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Orders - Get single order
     */
    static async getOrder(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            const order = await orderService.getOrderById(orderId);

            if (!order) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Order not found'
                }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: order
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Orders - Update order
     * Note: Cache is automatically invalidated by OrderService
     */
    static async updateOrder(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            const updates = req.body;

            await orderService.updateOrder(orderId, updates);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Order updated successfully'
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Orders - Confirm order
     * Note: Cache is automatically invalidated by OrderService
     */
    static async confirmOrder(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;

            await orderService.confirmOrder(orderId);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Order confirmed successfully'
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Orders - Cancel order
     * Note: Cache is automatically invalidated by OrderService
     */
    static async cancelOrder(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            const { reason } = req.body;

            await orderService.cancelOrder(orderId, reason);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Order cancelled successfully'
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Orders - Add note
     */
    static async addOrderNote(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            const { note } = req.body;

            if (!note) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Note is required'
                }));
                return;
            }

            await orderService.addOrderNote(orderId, note);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Note added successfully'
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Content - Get folder structure
     */
    static async getContentStructure(req: Request, res: Response): Promise<void> {
        try {
            const category = req.params.category as ContentType;

            // Validate category
            if (!VALID_CONTENT_CATEGORIES.includes(category)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: `Invalid category. Must be one of: ${VALID_CONTENT_CATEGORIES.join(', ')}`
                }));
                return;
            }

            const maxDepth = parseInt(req.query.maxDepth as string) || 3;

            // Validate maxDepth
            if (maxDepth < 1 || maxDepth > 10) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'maxDepth must be between 1 and 10'
                }));
                return;
            }

            const structure = await contentService.getFolderStructure(category, maxDepth);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: structure
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Content - Search content
     */
    static async searchContent(req: Request, res: Response): Promise<void> {
        try {
            const category = req.query.category as ContentType;

            // Validate category if provided
            if (category && !VALID_CONTENT_CATEGORIES.includes(category)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: `Invalid category. Must be one of: ${VALID_CONTENT_CATEGORIES.join(', ')}`
                }));
                return;
            }

            const filters: ContentSearchFilter = {
                category: category,
                subcategory: req.query.subcategory as string,
                searchTerm: req.query.searchTerm as string,
                sortBy: req.query.sortBy as 'name' | 'date' | 'size',
                sortOrder: req.query.sortOrder as 'asc' | 'desc'
            };

            // Validate searchTerm is not empty if searching
            if (filters.searchTerm && filters.searchTerm.trim().length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'searchTerm cannot be empty'
                }));
                return;
            }

            const results = await contentService.searchContent(filters);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: results
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Content - Get available genres
     */
    static async getGenres(req: Request, res: Response): Promise<void> {
        try {
            const category = req.params.category as ContentType;

            // Validate category
            if (!VALID_CONTENT_CATEGORIES.includes(category)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: `Invalid category. Must be one of: ${VALID_CONTENT_CATEGORIES.join(', ')}`
                }));
                return;
            }

            const genres = await contentService.getAvailableGenres(category);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: genres
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Content - Get statistics
     */
    static async getContentStats(req: Request, res: Response): Promise<void> {
        try {
            const category = req.params.category as ContentType;

            // Validate category
            if (!VALID_CONTENT_CATEGORIES.includes(category)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: `Invalid category. Must be one of: ${VALID_CONTENT_CATEGORIES.join(', ')}`
                }));
                return;
            }

            const stats = await contentService.getContentStats(category);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: stats
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Analytics - Get chatbot analytics
     * Supports optional from/to query parameters for date range filtering
     */
    static async getChatbotAnalytics(req: Request, res: Response): Promise<void> {
        try {
            // Parse date range from query parameters
            const from = req.query.from ? new Date(req.query.from as string) : undefined;
            const to = req.query.to ? new Date(req.query.to as string) : undefined;
            const forceRefresh = req.query.refresh === 'true';

            const analytics = await analyticsService.getChatbotAnalytics({ from, to, forceRefresh });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: analytics,
                dateRange: {
                    from: from?.toISOString() || null,
                    to: to?.toISOString() || null
                }
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing - Get queue status
     */
    static async getProcessingQueue(req: Request, res: Response): Promise<void> {
        try {
            const queueStatus = await enhancedAutoProcessor.getQueueStatus();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: queueStatus
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing - Get copy progress
     */
    static async getCopyProgress(req: Request, res: Response): Promise<void> {
        try {
            const { jobId } = req.params;
            const progress = copyService.getProgress(jobId);

            if (!progress) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Job not found'
                }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: progress
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing - Cancel copy job
     */
    static async cancelCopyJob(req: Request, res: Response): Promise<void> {
        try {
            const { jobId } = req.params;
            const cancelled = copyService.cancelCopy(jobId);

            if (!cancelled) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Job not found or already completed'
                }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Copy job cancelled'
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Settings - Get system configuration
     * USB Pricing is managed via panel_settings as the single source of truth
     */
    static async getConfig(req: Request, res: Response): Promise<void> {
        try {
            // Try to load from database first
            let config = await panelSettingsRepository.exportSettings();

            // If no settings in database, create defaults (but NO pricing defaults - pricing comes from catalog/panel_settings)
            if (Object.keys(config).length === 0) {
                config = {
                    chatbot: {
                        autoResponseEnabled: true,
                        responseDelay: 1000,
                        maxConversationLength: 50
                    },
                    processing: {
                        maxConcurrentJobs: 2,
                        autoProcessingEnabled: true,
                        sourcePaths: {
                            music: 'D:/MUSICA3/',
                            videos: 'E:/VIDEOS/',
                            movies: 'D:/PELICULAS/',
                            series: 'D:/SERIES/'
                        }
                    }
                };

                // Save default config to database (no pricing - that comes from catalog)
                await panelSettingsRepository.set('chatbot', config.chatbot, 'system', 'system');
                await panelSettingsRepository.set('processing', config.processing, 'system', 'system');
            } else {
                // Ensure all required keys exist (except pricing)
                if (!config.chatbot) {
                    config.chatbot = {
                        autoResponseEnabled: true,
                        responseDelay: 1000,
                        maxConversationLength: 50
                    };
                }
                if (!config.processing) {
                    config.processing = {
                        maxConcurrentJobs: 2,
                        autoProcessingEnabled: true,
                        sourcePaths: {
                            music: 'D:/MUSICA3/',
                            videos: 'E:/VIDEOS/',
                            movies: 'D:/PELICULAS/',
                            series: 'D:/SERIES/'
                        }
                    };
                }
            }

            // Include usbPricing from panel_settings if available (for backup/persistence)
            try {
                const usbPricing = await panelSettingsRepository.get('usbPricing');
                if (usbPricing) {
                    config.usbPricing = usbPricing;
                }
            } catch (usbPricingError) {
                console.warn('Error fetching usbPricing from panel_settings, continuing without it:', usbPricingError);
            }

            res.writeHead(200, { 'Content-Type': 'application/json');
            res.end(JSON.stringify({
                success: true,
                data: config
            }));
        } catch (error: any) {
            console.error('Error getting config:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    private static validateSettings(updates: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Validate chatbot settings
        if (updates.chatbot) {
            if (typeof updates.chatbot.responseDelay === 'number') {
                if (updates.chatbot.responseDelay < 0 || updates.chatbot.responseDelay > 10000) {
                    errors.push('responseDelay must be between 0 and 10000 ms');
                }
            }
        }

        // Validate pricing
        if (updates.pricing) {
            for (const [capacity, price] of Object.entries(updates.pricing)) {
                if (typeof price !== 'number' || price < 0 || !Number.isInteger(price)) {
                    errors.push(`Price for ${capacity} must be a non-negative integer`);
                }
            }
        }

        // Validate paths
        if (updates.processing?.sourcePaths) {
            for (const [key, path] of Object.entries(updates.processing.sourcePaths)) {
                if (typeof path !== 'string' || path.trim() === '') {
                    errors.push(`Path for ${key} cannot be empty`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Settings - Update system configuration
     * Invalidates cache to ensure dashboard/analytics reflect new settings
     * USB Pricing is persisted to panel_settings as single source of truth
     */
    static async updateConfig(req: Request, res: Response): Promise<void> {
        try {
            const updates = req.body;
            const userId = req.headers['x-user-id'] as string || 'admin';

            // Save each section to database
            if (updates.chatbot) {
                await panelSettingsRepository.set('chatbot', updates.chatbot, 'system', userId);
            }
            if (updates.pricing) {
                // Save pricing as legacy key for backwards compatibility
                await panelSettingsRepository.set('pricing', updates.pricing, 'business', userId);
            }
            if (updates.usbPricing) {
                // Save USB pricing to panel_settings as single source of truth
                await panelSettingsRepository.set('usbPricing', updates.usbPricing, 'business', userId);
                console.log(`💾 USB Pricing saved to panel_settings by ${userId}:`, updates.usbPricing);
            }
            if (updates.processing) {
                await panelSettingsRepository.set('processing', updates.processing, 'system', userId);
            }

            // Save any other custom settings
            for (const [key, value] of Object.entries(updates)) {
                if (!['chatbot', 'pricing', 'usbPricing', 'processing'].includes(key)) {
                    await panelSettingsRepository.set(key, value, 'custom', userId);
                }
            }

            // Invalidate settings and related dashboard/analytics caches
            cacheService.invalidateSettings();

            console.log(`✅ Configuration updated by ${userId}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Configuration updated and persisted to database successfully'
            }));
        } catch (error: any) {
            console.error('Error updating config:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing Jobs - Get all jobs with filters
     */
    static async getProcessingJobs(req: Request, res: Response): Promise<void> {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;

            const statusFilter = req.query.status as string;
            const statuses = statusFilter ? statusFilter.split(',') : undefined;

            const filter: any = {
                status: statuses,
                order_id: req.query.orderId as string,
                assigned_device_id: req.query.deviceId as string,
                date_from: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
                date_to: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined
            };

            const result = await processingJobService.listJobs(filter, page, limit);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: result
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing Jobs - Get job by ID with logs
     */
    static async getProcessingJob(req: Request, res: Response): Promise<void> {
        try {
            const jobId = parseInt(req.params.jobId);
            const includeLogs = req.query.includeLogs === 'true';

            const job = await processingJobService.getJobById(jobId, includeLogs);

            if (!job) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: 'Job not found'
                }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: job
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing Jobs - Get job logs
     */
    static async getProcessingJobLogs(req: Request, res: Response): Promise<void> {
        try {
            const jobId = parseInt(req.params.jobId);
            const limit = parseInt(req.query.limit as string) || 100;

            const logs = await processingJobService.getJobLogs(jobId, limit);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: logs
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing Jobs - Get active jobs
     */
    static async getActiveJobs(req: Request, res: Response): Promise<void> {
        try {
            const jobs = await processingJobService.getActiveJobs();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: jobs
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing Jobs - Get failed jobs
     */
    static async getFailedJobs(req: Request, res: Response): Promise<void> {
        try {
            const limit = parseInt(req.query.limit as string) || 50;
            const jobs = await processingJobService.getFailedJobs(limit);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: jobs
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing Jobs - Get statistics
     */
    static async getProcessingJobStats(req: Request, res: Response): Promise<void> {
        try {
            const stats = await processingJobService.getStatistics();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: stats
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }

    /**
     * Processing Jobs - Get status summary
     */
    static async getJobStatusSummary(req: Request, res: Response): Promise<void> {
        try {
            const summary = await processingJobService.getJobStatusSummary();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: summary
            }));
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: error.message
            }));
        }
    }
}
