/**
 * Admin API Routes
 * Provides endpoints for admin panel functionality including order timeline, replay, and catalog management
 */

import type { Request, Response } from 'express';
import { orderEventRepository, OrderEventFilter } from '../repositories/OrderEventRepository';
import { orderService } from '../admin/services/OrderService';
import { analyticsService } from '../admin/services/AnalyticsService';
import { hybridIntentRouter } from '../services/hybridIntentRouter';
import { aiService } from '../services/aiService';
import { adminCatalogService } from '../admin/services/AdminCatalogService';
import { catalogService } from '../services/CatalogService';
import { analyticsStatsRepository } from '../repositories/AnalyticsStatsRepository';
import { analyticsWatermarkRepository } from '../repositories/AnalyticsWatermarkRepository';
import { analyticsRefresher } from '../services/AnalyticsRefresher';
import { cacheService, CACHE_KEYS, CACHE_TTL } from '../services/CacheService';
import { correlationIdManager } from '../services/CorrelationIdManager';
import { generateCorrelationId } from '../utils/correlationId';
import { conversationAnalysisRepository } from '../repositories/ConversationAnalysisRepository';
import { conversationAnalysisWorker } from '../services/ConversationAnalysisWorker';
import { chatbotEventService } from '../services/ChatbotEventService';
import { ChatbotEventFilter } from '../repositories/ChatbotEventRepository';
import { structuredLogger } from '../utils/structuredLogger';

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
    correlationId?: string;
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
     * Get order timeline events with filtering, pagination, and caching
     * GET /api/admin/orders/:orderId/events
     * 
     * Query parameters:
     * - eventType: Filter by event type
     * - eventSource: Filter by event source
     * - flowName: Filter by flow name
     * - dateFrom: Filter events from this date
     * - dateTo: Filter events until this date
     * - page: Page number (default: 1)
     * - perPage: Items per page (default: 50, max: 100)
     * - limit: Alternative to perPage for backward compatibility
     * - refresh: Force refresh cache (default: false)
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
                page = '1',
                perPage,
                limit, // For backward compatibility
                refresh
            } = req.query;

            // Validate orderId
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            // Parse and validate pagination parameters
            // Support both 'perPage' and 'limit' (limit for backward compatibility)
            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const itemsPerPage = (perPage as string) || (limit as string) || '50'; // Use perPage if provided, otherwise limit, otherwise default to 50
            const perPageNum = Math.min(100, Math.max(1, parseInt(itemsPerPage) || 50));

            // Check cache first (15s TTL) - include pagination and filters in cache key
            const filterKey = `${eventType || ''}_${eventSource || ''}_${flowName || ''}_${dateFrom || ''}_${dateTo || ''}`;
            const cacheKey = `${CACHE_KEYS.ORDER_EVENTS(orderId)}_p${pageNum}_pp${perPageNum}_f${filterKey}`;
            const forceRefresh = refresh === 'true';
            
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

            // Get paginated events from repository
            const result = await orderEventRepository.findByFilterPaginated(filter, pageNum, perPageNum);

            // Transform to timeline format
            const timeline: TimelineEvent[] = result.data.map(event => ({
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
                    timeline: timeline, // Keep 'timeline' for backward compatibility
                    events: timeline, // Also provide 'events' for new consumers
                    summary,
                    filter: {
                        eventType: eventType || null,
                        eventSource: eventSource || null,
                        flowName: flowName || null,
                        dateFrom: dateFrom || null,
                        dateTo: dateTo || null
                    },
                    count: timeline.length, // Keep 'count' for backward compatibility
                    pagination: {
                        page: result.page,
                        perPage: result.perPage,
                        total: result.total,
                        totalPages: result.totalPages
                    }
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
     * Get order timeline in a simplified, aggregated format
     * GET /api/admin/orders/:orderId/timeline
     * 
     * This endpoint provides a higher-level view of order events, grouping related events
     * and providing a cleaner timeline visualization compared to raw events.
     * 
     * Query parameters:
     * - eventType: Filter by event type
     * - eventSource: Filter by event source
     * - flowName: Filter by flow name
     * - dateFrom: Filter events from this date
     * - dateTo: Filter events until this date
     * - page: Page number (default: 1)
     * - perPage: Items per page (default: 20, max: 100)
     * - refresh: Force refresh cache (default: false)
     */
    server.get('/api/admin/orders/:orderId/timeline', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;
            const { 
                eventType, 
                eventSource, 
                flowName, 
                dateFrom, 
                dateTo,
                page = '1',
                perPage = '20',
                refresh
            } = req.query;

            // Validate orderId
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            // Parse and validate pagination parameters
            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const perPageNum = Math.min(100, Math.max(1, parseInt(perPage as string) || 20));

            // Check cache first (15s TTL) - include pagination and filters in cache key
            const filterKey = `${eventType || ''}_${eventSource || ''}_${flowName || ''}_${dateFrom || ''}_${dateTo || ''}`;
            const cacheKey = `${CACHE_KEYS.ORDER_EVENTS(orderId)}_timeline_p${pageNum}_pp${perPageNum}_f${filterKey}`;
            const forceRefresh = refresh === 'true';
            
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

            // Get paginated events from repository
            const result = await orderEventRepository.findByFilterPaginated(filter, pageNum, perPageNum);

            // Transform to simplified timeline format with grouping
            const timelineItems = result.data.map(event => {
                // Create a simplified timeline entry
                const item: any = {
                    id: event.id,
                    timestamp: event.created_at,
                    type: event.event_type,
                    source: event.event_source,
                    title: event.event_description || event.event_type,
                };

                // Add optional fields only if they exist
                if (event.flow_name) item.flow = event.flow_name;
                if (event.flow_stage) item.stage = event.flow_stage;
                if (event.user_input) item.userMessage = event.user_input;
                if (event.bot_response) item.botMessage = event.bot_response;
                if (event.event_data) item.metadata = event.event_data;

                return item;
            });

            // Get summary statistics
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
                    orderCreatedAt: order.createdAt,
                    orderUpdatedAt: order.updatedAt,
                    timeline: timelineItems,
                    summary,
                    filter: {
                        eventType: eventType || null,
                        eventSource: eventSource || null,
                        flowName: flowName || null,
                        dateFrom: dateFrom || null,
                        dateTo: dateTo || null
                    },
                    pagination: {
                        page: result.page,
                        perPage: result.perPage,
                        total: result.total,
                        totalPages: result.totalPages
                    }
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
     * Replay order flow with optional dry-run mode (simulation or actual execution)
     * POST /api/admin/orders/:orderId/replay?dryRun=1
     * Query Parameters:
     *   - dryRun: '1' for simulation mode (default), '0' for actual execution
     */
    server.post('/api/admin/orders/:orderId/replay', async (req: Request, res: Response) => {
        // Generate correlation ID for this request
        const correlationId = generateCorrelationId(`admin-replay-${Date.now()}`);
        
        return correlationIdManager.run(
            correlationId,
            async () => {
                const logger = correlationIdManager.getLogger();
                
                try {
                    const { orderId } = req.params;
                    const { userInput, context } = req.body;
                    
                    // Parse dryRun query parameter (defaults to true/dry-run mode)
                    const dryRun = req.query.dryRun !== '0';
                    
                    logger.info('api', `Starting order replay request: orderId=${orderId}, dryRun=${dryRun}`, {
                        orderId,
                        dryRun,
                        hasUserInput: !!userInput,
                        hasContext: !!context
                    });

                    // Validate orderId
                    if (!orderId) {
                        logger.warn('api', 'Replay request missing orderId');
                        return res.status(400).json({
                            success: false,
                            error: 'orderId is required',
                            correlationId
                        });
                    }

                    // Get order to verify it exists
                    logger.debug('api', `Fetching order: ${orderId}`);
                    const order = await orderService.getOrderById(orderId);
                    if (!order) {
                        logger.warn('api', `Order not found: ${orderId}`);
                        return res.status(404).json({
                            success: false,
                            error: `Order ${orderId} not found`,
                            correlationId
                        });
                    }
                    
                    logger.info('api', `Order found: ${order.orderNumber}, customer: ${order.customerName}`, {
                        orderNumber: order.orderNumber,
                        customerName: order.customerName,
                        status: order.status
                    });

                    // Get historical events for this order
                    logger.debug('api', `Fetching historical events for order: ${order.orderNumber}`);
                    const events = await orderEventRepository.getByOrderNumber(order.orderNumber, DEFAULT_EVENT_LIMIT);
                    logger.info('api', `Retrieved ${events.length} historical events`);

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
                    logger.debug('api', `Input to replay: "${inputToReplay.substring(0, 50)}..."`);

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

                    if (dryRun) {
                        // === DRY RUN MODE: Simulate router decision without side effects ===
                        logger.info('api', 'Running in DRY-RUN mode (simulation only)');
                        
                        // Run intent router to determine what flow/intent would be triggered
                        logger.debug('api', 'Invoking intent router for simulation');
                        const routerDecision = await hybridIntentRouter.route(
                            inputToReplay, 
                            replayContext
                        );
                        
                        logger.info('api', `Router decision: intent=${routerDecision.intent}, confidence=${routerDecision.confidence}%, flow=${routerDecision.targetFlow}`, {
                            intent: routerDecision.intent,
                            confidence: routerDecision.confidence,
                            source: routerDecision.source,
                            targetFlow: routerDecision.targetFlow
                        });

                        // Generate simulated response based on router decision
                        let simulatedMessage = '';
                        let nextFlow = routerDecision.targetFlow;

                        // Use AI to generate what the response would have been
                        try {
                            logger.debug('api', 'Generating simulated AI response');
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
                            logger.info('api', 'Simulated response generated successfully');
                        } catch (error) {
                            logger.error('api', 'Error generating simulated response', { error });
                            simulatedMessage = `[Simulación] Flujo: ${routerDecision.targetFlow}. Intent: ${routerDecision.intent} con ${routerDecision.confidence}% de confianza.`;
                        }

                        // Build replay result
                        const replayResult: ReplayResult = {
                            orderId,
                            orderNumber: order.orderNumber,
                            dryRun: true,
                            timestamp: new Date(),
                            correlationId,
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

                        logger.info('api', 'Replay simulation completed successfully', {
                            orderId,
                            intent: routerDecision.intent,
                            confidence: routerDecision.confidence
                        });

                        return res.status(200).json({
                            success: true,
                            data: replayResult
                        });
                    } else {
                        // === ACTUAL EXECUTION MODE: Execute replay with side effects ===
                        logger.warn('api', 'ACTUAL EXECUTION MODE: This will trigger real side effects!');
                        
                        // TODO: Implement actual execution logic
                        // This would involve:
                        // 1. Triggering the actual flow/intent
                        // 2. Sending real messages
                        // 3. Updating order state
                        // 4. Logging all actions
                        
                        logger.error('api', 'Actual execution mode not yet implemented');
                        
                        return res.status(501).json({
                            success: false,
                            error: 'Actual execution mode (dryRun=0) is not yet implemented',
                            message: 'This endpoint currently only supports dry-run mode (dryRun=1)',
                            correlationId
                        });
                    }

                } catch (error) {
                    const logger = correlationIdManager.getLogger();
                    logger.error('api', 'Error replaying order flow', { 
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined
                    });
                    
                    return res.status(500).json({
                        success: false,
                        error: 'Internal server error',
                        message: error instanceof Error ? error.message : 'Unknown error',
                        correlationId: correlationIdManager.getCorrelationId()
                    });
                }
            }
        );
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

    /**
     * Get conversation analysis summary
     * GET /api/admin/analytics/conversation-analysis
     * 
     * Query parameters:
     * - startDate: Filter from this date (ISO format)
     * - endDate: Filter until this date (ISO format)
     */
    server.get('/api/admin/analytics/conversation-analysis', async (req: Request, res: Response) => {
        try {
            const { startDate, endDate } = req.query;
            
            // Parse dates if provided
            const start = startDate ? new Date(startDate as string) : undefined;
            const end = endDate ? new Date(endDate as string) : undefined;

            // Get analytics summary
            const summary = await conversationAnalysisRepository.getAnalyticsSummary(start, end);

            return res.status(200).json({
                success: true,
                data: summary
            });

        } catch (error) {
            console.error('Error fetching conversation analysis summary:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Get recent conversation analyses
     * GET /api/admin/analytics/conversation-analysis/recent
     * 
     * Query parameters:
     * - status: Filter by status (pending, processing, completed, failed)
     * - intent: Filter by intent
     * - limit: Number of results (default: 50)
     * - offset: Pagination offset (default: 0)
     */
    server.get('/api/admin/analytics/conversation-analysis/recent', async (req: Request, res: Response) => {
        try {
            const { status, intent, limit, offset } = req.query;

            const analyses = await conversationAnalysisRepository.getRecentAnalyses({
                status: status as string,
                intent: intent as string,
                limit: limit ? parseInt(limit as string) : 50,
                offset: offset ? parseInt(offset as string) : 0
            });

            return res.status(200).json({
                success: true,
                data: analyses,
                count: analyses.length
            });

        } catch (error) {
            console.error('Error fetching recent conversation analyses:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Get conversation analysis by phone number
     * GET /api/admin/analytics/conversation-analysis/:phone
     */
    server.get('/api/admin/analytics/conversation-analysis/:phone', async (req: Request, res: Response) => {
        try {
            const { phone } = req.params;

            const analysis = await conversationAnalysisRepository.getLatestByPhone(phone);

            if (!analysis) {
                return res.status(404).json({
                    success: false,
                    error: 'Not found',
                    message: 'No analysis found for this phone number'
                });
            }

            return res.status(200).json({
                success: true,
                data: analysis
            });

        } catch (error) {
            console.error('Error fetching conversation analysis by phone:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Queue a new conversation analysis
     * POST /api/admin/analytics/conversation-analysis/queue
     * 
     * Body:
     * - phone: Phone number to analyze
     */
    server.post('/api/admin/analytics/conversation-analysis/queue', async (req: Request, res: Response) => {
        try {
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad request',
                    message: 'Phone number is required'
                });
            }

            const analysisId = await conversationAnalysisWorker.queueAnalysis(phone);

            if (analysisId === -1) {
                return res.status(200).json({
                    success: true,
                    message: 'Analysis already exists (recent analysis found)',
                    skipped: true
                });
            }

            return res.status(201).json({
                success: true,
                message: 'Analysis queued successfully',
                data: { analysisId, phone }
            });

        } catch (error) {
            console.error('Error queueing conversation analysis:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Get conversation analysis worker status
     * GET /api/admin/analytics/conversation-analysis/worker-status
     */
    server.get('/api/admin/analytics/conversation-analysis/worker-status', async (req: Request, res: Response) => {
        try {
            const status = conversationAnalysisWorker.getStatus();

            return res.status(200).json({
                success: true,
                data: status
            });

        } catch (error) {
            console.error('Error fetching worker status:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Dashboard Summary Endpoint
     * GET /api/admin/dashboard/summary?from=&to=
     * 
     * Returns KPIs and distributions for dashboard charts based on real DB data.
     * 
     * Query parameters:
     * - from: Start date (ISO 8601, optional)
     * - to: End date (ISO 8601, optional)
     * - refresh: Force cache refresh (default: false)
     * 
     * Response:
     * - kpis: { total, pending, processing, completed }
     * - distributionByType: [{ type, count }]
     * - distributionByCapacity: [{ capacity, count }]
     * - dailyTimeSeries: [{ date, count }] (optional)
     */
    server.get('/api/admin/dashboard/summary', async (req: Request, res: Response) => {
        try {
            const { from, to, refresh } = req.query;

            // Parse date parameters
            let dateFrom: Date | undefined;
            let dateTo: Date | undefined;

            if (from && typeof from === 'string') {
                const parsedFrom = new Date(from);
                if (!isNaN(parsedFrom.getTime())) {
                    dateFrom = parsedFrom;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid "from" date format. Use ISO 8601 format (e.g., 2026-01-01)'
                    });
                }
            }

            if (to && typeof to === 'string') {
                const parsedTo = new Date(to);
                if (!isNaN(parsedTo.getTime())) {
                    dateTo = parsedTo;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid "to" date format. Use ISO 8601 format (e.g., 2026-01-31)'
                    });
                }
            }

            // Validate date range (to must be >= from)
            if (dateFrom && dateTo && dateTo < dateFrom) {
                return res.status(400).json({
                    success: false,
                    error: '"to" date must be greater than or equal to "from" date'
                });
            }

            // Build cache key based on date range
            const cacheKey = `dashboard_summary_${dateFrom?.toISOString() || 'all'}_${dateTo?.toISOString() || 'all'}`;
            const forceRefresh = refresh === 'true';

            // Check cache first (unless force refresh)
            if (!forceRefresh) {
                const cached = cacheService.get<any>(cacheKey);
                if (cached) {
                    return res.status(200).json({
                        success: true,
                        data: cached,
                        cached: true,
                        dateRange: {
                            from: dateFrom?.toISOString() || null,
                            to: dateTo?.toISOString() || null
                        }
                    });
                }
            }

            // Fetch fresh data from database
            const summary = await analyticsService.getDashboardSummary(dateFrom, dateTo);

            // Cache the response for 15s
            cacheService.set(cacheKey, summary, { ttl: CACHE_TTL.DASHBOARD });

            return res.status(200).json({
                success: true,
                data: summary,
                cached: false,
                dateRange: {
                    from: dateFrom?.toISOString() || null,
                    to: dateTo?.toISOString() || null
                }
            });

        } catch (error) {
            console.error('Error fetching dashboard summary:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Get chatbot events for audit and analytics
     * GET /api/admin/events
     * 
     * Query parameters:
     * - from: Start date (ISO 8601)
     * - to: End date (ISO 8601)
     * - type: Filter by event type (e.g., ORDER_CONFIRMED, STATUS_CHANGED)
     * - phone: Filter by phone number
     * - conversation_id: Filter by conversation ID
     * - order_id: Filter by order ID
     * - page: Page number (default: 1)
     * - perPage: Items per page (default: 50, max: 100)
     */
    server.get('/api/admin/events', async (req: Request, res: Response) => {
        try {
            const { 
                from,
                to,
                type,
                phone,
                conversation_id,
                order_id,
                page = '1',
                perPage = '50'
            } = req.query;

            // Build filter
            const filter: ChatbotEventFilter = {};

            // Parse date range
            if (from && typeof from === 'string') {
                const parsedFrom = new Date(from);
                if (!isNaN(parsedFrom.getTime())) {
                    filter.date_from = parsedFrom;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid "from" date format. Use ISO 8601 format (e.g., 2026-01-01)'
                    });
                }
            }

            if (to && typeof to === 'string') {
                const parsedTo = new Date(to);
                if (!isNaN(parsedTo.getTime())) {
                    filter.date_to = parsedTo;
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid "to" date format. Use ISO 8601 format (e.g., 2026-01-31)'
                    });
                }
            }

            // Validate date range
            if (filter.date_from && filter.date_to && filter.date_to < filter.date_from) {
                return res.status(400).json({
                    success: false,
                    error: '"to" date must be greater than or equal to "from" date'
                });
            }

            // Add other filters
            if (type && typeof type === 'string') {
                filter.event_type = type;
            }

            if (phone && typeof phone === 'string') {
                filter.phone = phone;
            }

            if (conversation_id && typeof conversation_id === 'string') {
                filter.conversation_id = conversation_id;
            }

            if (order_id && typeof order_id === 'string') {
                filter.order_id = order_id;
            }

            // Parse pagination parameters
            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const perPageNum = Math.min(100, Math.max(1, parseInt(perPage as string) || 50));

            // Get paginated events
            const result = await chatbotEventService.getEvents(filter, pageNum, perPageNum);

            // Get event type summary for the same date range and phone (excluding specific event type filter
            // to show overall distribution even when filtering by type)
            const summaryFilter: ChatbotEventFilter = {
                date_from: filter.date_from,
                date_to: filter.date_to,
                phone: filter.phone
            };
            const summary = await chatbotEventService.getEventTypeSummary(summaryFilter);

            // Get available event types for UI filter
            const availableTypes = await chatbotEventService.getAvailableEventTypes();

            return res.status(200).json({
                success: true,
                data: {
                    events: result.data,
                    summary,
                    availableTypes,
                    pagination: {
                        page: result.page,
                        perPage: result.perPage,
                        total: result.total,
                        totalPages: result.totalPages
                    },
                    filter: {
                        from: filter.date_from?.toISOString() || null,
                        to: filter.date_to?.toISOString() || null,
                        type: filter.event_type || null,
                        phone: filter.phone || null,
                        conversation_id: filter.conversation_id || null,
                        order_id: filter.order_id || null
                    }
                }
            });

        } catch (error) {
            structuredLogger.error('api', 'Error fetching chatbot events', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
