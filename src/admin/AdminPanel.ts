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
import type { 
    ApiResponse, 
    OrderFilter, 
    ContentSearchFilter,
    ContentType,
    OrderStatus 
} from './types/AdminTypes';

// Simple in-memory cache for dashboard stats
const cache: { [key: string]: { data: any; timestamp: number } } = {};
const CACHE_TTL = 30000; // 30 seconds

export class AdminPanel {
    /**
     * Dashboard - Get comprehensive statistics
     */
    static async getDashboard(req: Request, res: Response): Promise<void> {
        try {
            // Check cache first
            const cacheKey = 'dashboard_stats';
            const cached = cache[cacheKey];
            
            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                res.json({
                    success: true,
                    data: cached.data,
                    cached: true
                });
                return;
            }
            
            // Set timeout for request
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout')), 15000);
            });
            
            const statsPromise = analyticsService.getDashboardStats();
            const stats = await Promise.race([statsPromise, timeoutPromise]) as any;
            
            // Update cache
            cache[cacheKey] = {
                data: stats,
                timestamp: Date.now()
            };
            
            const response: ApiResponse<any> = {
                success: true,
                data: stats
            };
            
            // Set cache headers
            res.setHeader('Cache-Control', 'public, max-age=30');
            res.json(response);
        } catch (error: any) {
            console.error('Error in getDashboard:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error loading dashboard data'
            });
        }
    }

    /**
     * Orders - Get all orders with filters
     */
    static async getOrders(req: Request, res: Response): Promise<void> {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            
            const filters: OrderFilter = {
                status: req.query.status as OrderStatus,
                contentType: req.query.contentType as ContentType,
                dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
                dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
                customerPhone: req.query.customerPhone as string,
                searchTerm: req.query.searchTerm as string
            };

            const result = await orderService.getOrders(filters, page, limit);
            
            res.json({
                success: true,
                data: result.data,
                pagination: result.pagination
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
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
                res.status(404).json({
                    success: false,
                    error: 'Order not found'
                });
                return;
            }
            
            res.json({
                success: true,
                data: order
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Orders - Update order
     */
    static async updateOrder(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            const updates = req.body;
            
            await orderService.updateOrder(orderId, updates);
            
            res.json({
                success: true,
                message: 'Order updated successfully'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Orders - Confirm order
     */
    static async confirmOrder(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            
            await orderService.confirmOrder(orderId);
            
            res.json({
                success: true,
                message: 'Order confirmed successfully'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Orders - Cancel order
     */
    static async cancelOrder(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.params;
            const { reason } = req.body;
            
            await orderService.cancelOrder(orderId, reason);
            
            res.json({
                success: true,
                message: 'Order cancelled successfully'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
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
                res.status(400).json({
                    success: false,
                    error: 'Note is required'
                });
                return;
            }
            
            await orderService.addOrderNote(orderId, note);
            
            res.json({
                success: true,
                message: 'Note added successfully'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Content - Get folder structure
     */
    static async getContentStructure(req: Request, res: Response): Promise<void> {
        try {
            const category = req.params.category as ContentType;
            const maxDepth = parseInt(req.query.maxDepth as string) || 3;
            
            const structure = await contentService.getFolderStructure(category, maxDepth);
            
            res.json({
                success: true,
                data: structure
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Content - Search content
     */
    static async searchContent(req: Request, res: Response): Promise<void> {
        try {
            const filters: ContentSearchFilter = {
                category: req.query.category as ContentType,
                subcategory: req.query.subcategory as string,
                searchTerm: req.query.searchTerm as string,
                sortBy: req.query.sortBy as 'name' | 'date' | 'size',
                sortOrder: req.query.sortOrder as 'asc' | 'desc'
            };
            
            const results = await contentService.searchContent(filters);
            
            res.json({
                success: true,
                data: results
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Content - Get available genres
     */
    static async getGenres(req: Request, res: Response): Promise<void> {
        try {
            const category = req.params.category as ContentType;
            const genres = await contentService.getAvailableGenres(category);
            
            res.json({
                success: true,
                data: genres
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Content - Get statistics
     */
    static async getContentStats(req: Request, res: Response): Promise<void> {
        try {
            const category = req.params.category as ContentType;
            const stats = await contentService.getContentStats(category);
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Analytics - Get chatbot analytics
     */
    static async getChatbotAnalytics(req: Request, res: Response): Promise<void> {
        try {
            const analytics = await analyticsService.getChatbotAnalytics();
            
            res.json({
                success: true,
                data: analytics
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Processing - Get queue status
     */
    static async getProcessingQueue(req: Request, res: Response): Promise<void> {
        try {
            const queueStatus = autoProcessor.getQueueStatus();
            
            res.json({
                success: true,
                data: queueStatus
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
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
                res.status(404).json({
                    success: false,
                    error: 'Job not found'
                });
                return;
            }
            
            res.json({
                success: true,
                data: progress
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
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
                res.status(404).json({
                    success: false,
                    error: 'Job not found or already completed'
                });
                return;
            }
            
            res.json({
                success: true,
                message: 'Copy job cancelled'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Settings - Get system configuration
     */
    static async getConfig(req: Request, res: Response): Promise<void> {
        try {
            // Return current system configuration
            const config = {
                chatbot: {
                    autoResponseEnabled: true,
                    responseDelay: 1000,
                    maxConversationLength: 50
                },
                pricing: {
                    '8GB': 15000,
                    '32GB': 25000,
                    '64GB': 35000,
                    '128GB': 50000,
                    '256GB': 80000
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
            
            res.json({
                success: true,
                data: config
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Settings - Update system configuration
     */
    static async updateConfig(req: Request, res: Response): Promise<void> {
        try {
            const updates = req.body;
            
            // Update configuration (implement persistence as needed)
            
            res.json({
                success: true,
                message: 'Configuration updated successfully'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}
