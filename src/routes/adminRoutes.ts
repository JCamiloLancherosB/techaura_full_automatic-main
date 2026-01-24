/**
 * Admin API Routes
 * Provides endpoints for admin panel functionality including order timeline, replay, and catalog management
 */

import type { Request, Response } from 'express';
import { orderEventRepository, OrderEventFilter } from '../repositories/OrderEventRepository';
import { orderService } from '../admin/services/OrderService';
import { hybridIntentRouter } from '../services/hybridIntentRouter';
import { aiService } from '../services/aiService';
import { adminCatalogService } from '../admin/services/AdminCatalogService';
import { catalogService } from '../services/CatalogService';
import { analyticsStatsRepository } from '../repositories/AnalyticsStatsRepository';
import { analyticsWatermarkRepository } from '../repositories/AnalyticsWatermarkRepository';
import { analyticsRefresher } from '../services/AnalyticsRefresher';
import { cacheService, CACHE_KEYS, CACHE_TTL } from '../services/CacheService';

// Configuration constants
const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 1000;

interface TimelineEvent {
    id: number;
    timestamp: Date;
    eventType: string;
    eventSource: string;
    description?: string;
    data?: any;
    flowName?: string;
    flowStage?: string;
    userInput?: string;
    botResponse?: string;
}

interface TimelineFilter {
    eventTypes?: string[];
    eventSource?: string;
    flowName?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

interface ReplayResult {
    orderId: string;
    orderNumber?: string;
    dryRun: true;
    timestamp: Date;
    routerDecision: {
        intent: string;
        confidence: number;
        source: string;
        targetFlow?: string;
        reason?: string; // Changed from 'reasoning' to match IntentResult interface
    };
    simulatedResponse: {
        message: string;
        nextFlow?: string;
        contextUsed: any;
    };
    originalEvents: TimelineEvent[];
    warning: string;
}

/**
 * Register admin API routes on Express server
 */
export function registerAdminRoutes(server: any) {
    
    /**
     * Get order timeline events with filtering and caching
     * GET /api/admin/orders/:orderId/events
     */
    server.get('/api/admin/orders/:orderId/events', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;
            const { 
                eventType, 
                eventSource, 
                flowName, 
                dateFrom, 
                dateTo,
                limit = '100'
            } = req.query;

            // Validate orderId
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            // Check cache first (15s TTL)
            const cacheKey = CACHE_KEYS.ORDER_EVENTS(orderId);
            const forceRefresh = req.query.refresh === 'true';
            
            if (!forceRefresh) {
                const cached = cacheService.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json({
                        ...cached,
                        cached: true
                    });
                }
            }

            // Get order to verify it exists and get order_number
            const order = await orderService.getOrderById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: `Order ${orderId} not found`
                });
            }

            // Build filter for order events
            const filter: OrderEventFilter = {
                order_number: order.orderNumber
            };

            if (eventType && typeof eventType === 'string') {
                filter.event_type = eventType;
            }

            if (eventSource && typeof eventSource === 'string') {
                filter.event_source = eventSource;
            }

            if (flowName && typeof flowName === 'string') {
                filter.flow_name = flowName;
            }

            if (dateFrom && typeof dateFrom === 'string') {
                filter.date_from = new Date(dateFrom);
            }

            if (dateTo && typeof dateTo === 'string') {
                filter.date_to = new Date(dateTo);
            }

            // Get events from repository
            const maxLimit = Math.min(parseInt(limit as string) || DEFAULT_EVENT_LIMIT, MAX_EVENT_LIMIT);
            const events = await orderEventRepository.findByFilter(filter, maxLimit);

            // Transform to timeline format
            const timeline: TimelineEvent[] = events.map(event => ({
                id: event.id!,
                timestamp: event.created_at!,
                eventType: event.event_type,
                eventSource: event.event_source,
                description: event.event_description,
                data: event.event_data,
                flowName: event.flow_name,
                flowStage: event.flow_stage,
                userInput: event.user_input,
                botResponse: event.bot_response
            }));

            // Get summary of event types
            const summary = await orderEventRepository.getEventSummary({ 
                order_number: order.orderNumber 
            });

            const responseData = {
                success: true,
                data: {
                    orderId,
                    orderNumber: order.orderNumber,
                    customerPhone: order.customerPhone,
                    customerName: order.customerName,
                    orderStatus: order.status,
                    timeline,
                    summary,
                    filter: {
                        eventType: eventType || null,
                        eventSource: eventSource || null,
                        flowName: flowName || null,
                        dateFrom: dateFrom || null,
                        dateTo: dateTo || null
                    },
                    count: timeline.length
                }
            };

            // Cache the response for 15s
            cacheService.set(cacheKey, responseData, { ttl: CACHE_TTL.ORDER_EVENTS });

            return res.status(200).json(responseData);

        } catch (error) {
            console.error('Error fetching order timeline:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Replay order flow in dry-run mode (simulation only, no side effects)
     * POST /api/admin/orders/:orderId/replay
     */
    server.post('/api/admin/orders/:orderId/replay', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;
            const { userInput, context } = req.body;

            // Validate orderId
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            // Get order to verify it exists
            const order = await orderService.getOrderById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: `Order ${orderId} not found`
                });
            }

            // Get historical events for this order
            const events = await orderEventRepository.getByOrderNumber(order.orderNumber, DEFAULT_EVENT_LIMIT);

            // Transform to timeline format
            const timeline: TimelineEvent[] = events.map(event => ({
                id: event.id!,
                timestamp: event.created_at!,
                eventType: event.event_type,
                eventSource: event.event_source,
                description: event.event_description,
                data: event.event_data,
                flowName: event.flow_name,
                flowStage: event.flow_stage,
                userInput: event.user_input,
                botResponse: event.bot_response
            }));

            // If no user input provided, use the first user input from timeline
            const inputToReplay = userInput || timeline.find(e => e.userInput)?.userInput || '';

            // Build context from order and historical events
            const replayContext = {
                phone: order.customerPhone,
                customerName: order.customerName,
                orderNumber: order.orderNumber,
                currentStatus: order.status,
                customization: order.customization,
                historicalEvents: timeline.slice(0, 10), // Include last 10 events for context
                ...(context || {})
            };

            // === DRY RUN MODE: Simulate router decision without side effects ===
            
            // Run intent router to determine what flow/intent would be triggered
            const routerDecision = await hybridIntentRouter.route(
                inputToReplay, 
                replayContext
            );

            // Generate simulated response based on router decision
            let simulatedMessage = '';
            let nextFlow = routerDecision.targetFlow;

            // Use AI to generate what the response would have been
            try {
                const simulatedSession: any = {
                    phone: order.customerPhone,
                    currentFlow: routerDecision.targetFlow,
                    stage: 'simulated',
                    customerName: order.customerName,
                    ...replayContext
                };

                const aiResponse = await aiService.generateResponse(
                    inputToReplay, 
                    simulatedSession, 
                    undefined, 
                    timeline.map(e => e.userInput || e.botResponse || '').filter(Boolean).slice(0, 5)
                );
                simulatedMessage = aiResponse || 'Respuesta simulada no disponible';
            } catch (error) {
                console.error('Error generating simulated response:', error);
                simulatedMessage = `[Simulación] Flujo: ${routerDecision.targetFlow}. Intent: ${routerDecision.intent} con ${routerDecision.confidence}% de confianza.`;
            }

            // Build replay result
            const replayResult: ReplayResult = {
                orderId,
                orderNumber: order.orderNumber,
                dryRun: true,
                timestamp: new Date(),
                routerDecision: {
                    intent: routerDecision.intent,
                    confidence: routerDecision.confidence,
                    source: routerDecision.source,
                    targetFlow: routerDecision.targetFlow,
                    reason: routerDecision.reason // Use 'reason' field from IntentResult
                },
                simulatedResponse: {
                    message: simulatedMessage,
                    nextFlow,
                    contextUsed: replayContext
                },
                originalEvents: timeline,
                warning: 'SIMULACIÓN - No se enviaron mensajes reales ni se modificó el estado del sistema'
            };

            return res.status(200).json({
                success: true,
                data: replayResult
            });

        } catch (error) {
            console.error('Error replaying order flow:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    // ============================================
    // CATALOG MANAGEMENT ROUTES
    // ============================================
    
    /**
     * Get all catalog items
     * GET /api/admin/catalog/items
     */
    server.get('/api/admin/catalog/items', async (req: Request, res: Response) => {
        try {
            const { category, activeOnly = 'true' } = req.query;
            
            let items;
            if (category && typeof category === 'string') {
                items = await adminCatalogService.getCatalogItemsByCategory(
                    category, 
                    activeOnly === 'true'
                );
            } else {
                items = await adminCatalogService.getAllCatalogItems(activeOnly === 'true');
            }
            
            return res.status(200).json({
                success: true,
                data: items
            });
            
        } catch (error) {
            console.error('Error fetching catalog items:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get a specific catalog item
     * GET /api/admin/catalog/items/:id
     */
    server.get('/api/admin/catalog/items/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);
            
            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid item ID'
                });
            }
            
            const { catalogRepository } = await import('../repositories/CatalogRepository');
            const item = await catalogRepository.getItemById(itemId);
            
            if (!item) {
                return res.status(404).json({
                    success: false,
                    error: 'Item not found'
                });
            }
            
            return res.status(200).json({
                success: true,
                data: item
            });
            
        } catch (error) {
            console.error('Error fetching catalog item:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Update a catalog item
     * PUT /api/admin/catalog/items/:id
     */
    server.put('/api/admin/catalog/items/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);
            
            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid item ID'
                });
            }
            
            const { 
                price, 
                content_count, 
                is_active, 
                is_popular, 
                is_recommended,
                min_price,
                max_price,
                metadata,
                changed_by = 'admin',
                change_reason
            } = req.body;
            
            // Build updates object
            const updates: any = {};
            if (price !== undefined) updates.price = price;
            if (content_count !== undefined) updates.content_count = content_count;
            if (is_active !== undefined) updates.is_active = is_active;
            if (is_popular !== undefined) updates.is_popular = is_popular;
            if (is_recommended !== undefined) updates.is_recommended = is_recommended;
            if (min_price !== undefined) updates.min_price = min_price;
            if (max_price !== undefined) updates.max_price = max_price;
            if (metadata !== undefined) updates.metadata = metadata;
            
            // Get IP address
            const ipAddress = req.ip || req.socket.remoteAddress;
            
            // Perform update with validation
            const result = await adminCatalogService.updateCatalogItem(
                itemId,
                updates,
                changed_by,
                change_reason,
                ipAddress
            );
            
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    errors: result.errors,
                    warnings: result.warnings
                });
            }
            
            // Clear catalog caches to reflect changes immediately
            catalogService.clearPricingCache();
            cacheService.invalidateCatalog(itemId);
            
            return res.status(200).json({
                success: true,
                data: result.item,
                warnings: result.warnings
            });
            
        } catch (error) {
            console.error('Error updating catalog item:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Create a new catalog item
     * POST /api/admin/catalog/items
     */
    server.post('/api/admin/catalog/items', async (req: Request, res: Response) => {
        try {
            const { 
                category_id,
                capacity,
                capacity_gb,
                price,
                content_count,
                content_unit,
                is_active = true,
                is_popular = false,
                is_recommended = false,
                min_price,
                max_price,
                metadata,
                changed_by = 'admin',
                change_reason
            } = req.body;
            
            // Validate required fields
            if (!category_id || !capacity || !capacity_gb || !price || !content_count || !content_unit) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: category_id, capacity, capacity_gb, price, content_count, content_unit'
                });
            }
            
            const item = {
                category_id,
                capacity,
                capacity_gb,
                price,
                content_count,
                content_unit,
                is_active,
                is_popular,
                is_recommended,
                min_price,
                max_price,
                metadata
            };
            
            // Get IP address
            const ipAddress = req.ip || req.socket.remoteAddress;
            
            // Create item with validation
            const result = await adminCatalogService.createCatalogItem(
                item,
                changed_by,
                change_reason,
                ipAddress
            );
            
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    errors: result.errors,
                    warnings: result.warnings
                });
            }
            
            // Clear catalog caches
            catalogService.clearPricingCache();
            cacheService.invalidateCatalog(result.itemId);
            
            return res.status(201).json({
                success: true,
                itemId: result.itemId,
                warnings: result.warnings
            });
            
        } catch (error) {
            console.error('Error creating catalog item:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Delete (deactivate) a catalog item
     * DELETE /api/admin/catalog/items/:id
     */
    server.delete('/api/admin/catalog/items/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);
            
            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid item ID'
                });
            }
            
            const { changed_by = 'admin', change_reason } = req.body;
            const ipAddress = req.ip || req.socket.remoteAddress;
            
            const result = await adminCatalogService.deleteCatalogItem(
                itemId,
                changed_by,
                change_reason,
                ipAddress
            );
            
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    errors: result.errors
                });
            }
            
            // Clear catalog caches (delete)
            catalogService.clearPricingCache();
            cacheService.invalidateCatalog(itemId);
            
            return res.status(200).json({
                success: true
            });
            
        } catch (error) {
            console.error('Error deleting catalog item:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Activate a catalog item
     * POST /api/admin/catalog/items/:id/activate
     */
    server.post('/api/admin/catalog/items/:id/activate', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);
            
            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid item ID'
                });
            }
            
            const { changed_by = 'admin', change_reason } = req.body;
            const ipAddress = req.ip || req.socket.remoteAddress;
            
            const result = await adminCatalogService.activateCatalogItem(
                itemId,
                changed_by,
                change_reason,
                ipAddress
            );
            
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    errors: result.errors
                });
            }
            
            // Clear catalog caches (activate)
            catalogService.clearPricingCache();
            cacheService.invalidateCatalog(itemId);
            
            return res.status(200).json({
                success: true
            });
            
        } catch (error) {
            console.error('Error activating catalog item:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get change history for an item
     * GET /api/admin/catalog/items/:id/history
     */
    server.get('/api/admin/catalog/items/:id/history', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const itemId = parseInt(id);
            const { limit = '50' } = req.query;
            
            if (isNaN(itemId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid item ID'
                });
            }
            
            const history = await adminCatalogService.getItemChangeHistory(
                itemId, 
                parseInt(limit as string)
            );
            
            return res.status(200).json({
                success: true,
                data: history
            });
            
        } catch (error) {
            console.error('Error fetching change history:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get change history for a category
     * GET /api/admin/catalog/history
     */
    server.get('/api/admin/catalog/history', async (req: Request, res: Response) => {
        try {
            const { category, limit = '100' } = req.query;
            
            let history;
            if (category && typeof category === 'string') {
                history = await adminCatalogService.getCategoryChangeHistory(
                    category, 
                    parseInt(limit as string)
                );
            } else {
                history = await adminCatalogService.getAllChangeHistory(
                    parseInt(limit as string)
                );
            }
            
            return res.status(200).json({
                success: true,
                data: history
            });
            
        } catch (error) {
            console.error('Error fetching change history:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get daily order statistics with caching (20s TTL)
     * GET /api/admin/analytics/orders/daily
     */
    server.get('/api/admin/analytics/orders/daily', async (req: Request, res: Response) => {
        try {
            const { dateFrom, dateTo } = req.query;
            
            // Default to last 30 days if not specified
            const endDate = dateTo ? new Date(dateTo as string) : new Date();
            const startDate = dateFrom 
                ? new Date(dateFrom as string) 
                : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            // Check cache first
            const cacheKey = `${CACHE_KEYS.ANALYTICS_DAILY}:${startDate.toISOString()}:${endDate.toISOString()}`;
            const forceRefresh = req.query.refresh === 'true';
            
            if (!forceRefresh) {
                const cached = cacheService.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json({
                        ...cached,
                        cached: true
                    });
                }
            }
            
            const stats = await analyticsStatsRepository.getDailyOrderStats(startDate, endDate);
            
            const responseData = {
                success: true,
                data: stats,
                dateFrom: startDate,
                dateTo: endDate
            };

            // Cache for 20s
            cacheService.set(cacheKey, responseData, { ttl: CACHE_TTL.ANALYTICS });
            
            return res.status(200).json(responseData);
            
        } catch (error) {
            console.error('Error fetching daily order stats:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get intent conversion statistics with caching (20s TTL)
     * GET /api/admin/analytics/intents
     */
    server.get('/api/admin/analytics/intents', async (req: Request, res: Response) => {
        try {
            const { dateFrom, dateTo } = req.query;
            
            // Default to last 30 days if not specified
            const endDate = dateTo ? new Date(dateTo as string) : new Date();
            const startDate = dateFrom 
                ? new Date(dateFrom as string) 
                : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            // Check cache first
            const cacheKey = `${CACHE_KEYS.ANALYTICS_INTENTS}:${startDate.toISOString()}:${endDate.toISOString()}`;
            const forceRefresh = req.query.refresh === 'true';
            
            if (!forceRefresh) {
                const cached = cacheService.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json({
                        ...cached,
                        cached: true
                    });
                }
            }
            
            const stats = await analyticsStatsRepository.getIntentConversionStats(startDate, endDate);
            
            const responseData = {
                success: true,
                data: stats,
                dateFrom: startDate,
                dateTo: endDate
            };

            // Cache for 20s
            cacheService.set(cacheKey, responseData, { ttl: CACHE_TTL.ANALYTICS });
            
            return res.status(200).json(responseData);
            
        } catch (error) {
            console.error('Error fetching intent conversion stats:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get follow-up performance statistics with caching (20s TTL)
     * GET /api/admin/analytics/followup
     */
    server.get('/api/admin/analytics/followup', async (req: Request, res: Response) => {
        try {
            const { dateFrom, dateTo } = req.query;
            
            // Default to last 30 days if not specified
            const endDate = dateTo ? new Date(dateTo as string) : new Date();
            const startDate = dateFrom 
                ? new Date(dateFrom as string) 
                : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            // Check cache first
            const cacheKey = `${CACHE_KEYS.ANALYTICS_FOLLOWUP}:${startDate.toISOString()}:${endDate.toISOString()}`;
            const forceRefresh = req.query.refresh === 'true';
            
            if (!forceRefresh) {
                const cached = cacheService.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json({
                        ...cached,
                        cached: true
                    });
                }
            }
            
            const stats = await analyticsStatsRepository.getFollowupPerformanceDaily(startDate, endDate);
            
            const responseData = {
                success: true,
                data: stats,
                dateFrom: startDate,
                dateTo: endDate
            };

            // Cache for 20s
            cacheService.set(cacheKey, responseData, { ttl: CACHE_TTL.ANALYTICS });
            
            return res.status(200).json(responseData);
            
        } catch (error) {
            console.error('Error fetching followup performance stats:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get cache statistics for monitoring
     * GET /api/admin/cache/stats
     */
    server.get('/api/admin/cache/stats', async (req: Request, res: Response) => {
        try {
            const stats = cacheService.getStats();
            
            return res.status(200).json({
                success: true,
                data: stats
            });
            
        } catch (error) {
            console.error('Error fetching cache stats:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Clear all caches or specific cache by key
     * POST /api/admin/cache/clear
     */
    server.post('/api/admin/cache/clear', async (req: Request, res: Response) => {
        try {
            const { key, pattern } = req.body;
            
            if (pattern) {
                const count = cacheService.invalidatePattern(pattern);
                return res.status(200).json({
                    success: true,
                    message: `Cleared ${count} cache entries matching pattern: ${pattern}`,
                    count
                });
            } else if (key) {
                const deleted = cacheService.delete(key);
                return res.status(200).json({
                    success: true,
                    message: deleted ? `Cache cleared for key: ${key}` : `Key not found: ${key}`,
                    deleted
                });
            } else {
                cacheService.clear();
                return res.status(200).json({
                    success: true,
                    message: 'All caches cleared'
                });
            }
            
        } catch (error) {
            console.error('Error clearing cache:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Get analytics watermarks status
     * GET /api/admin/analytics/watermarks
     */
    server.get('/api/admin/analytics/watermarks', async (req: Request, res: Response) => {
        try {
            const watermarks = await analyticsWatermarkRepository.getAll();
            
            return res.status(200).json({
                success: true,
                data: watermarks
            });
            
        } catch (error) {
            console.error('Error fetching watermarks:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    
    /**
     * Trigger manual analytics refresh
     * POST /api/admin/analytics/refresh
     */
    server.post('/api/admin/analytics/refresh', async (req: Request, res: Response) => {
        try {
            // Trigger refresh asynchronously
            analyticsRefresher.refresh().catch(error => {
                console.error('Error during manual analytics refresh:', error);
            });
            
            return res.status(200).json({
                success: true,
                message: 'Analytics refresh triggered'
            });
            
        } catch (error) {
            console.error('Error triggering analytics refresh:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
