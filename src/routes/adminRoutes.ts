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
import { catalogRepository } from '../repositories/CatalogRepository';
import { messageDecisionService } from '../services/MessageDecisionService';
import { hashPhone } from '../utils/phoneHasher';
import type { DecisionTraceFilter } from '../types/DecisionTrace';
import type { UsbPricing, UsbPricingItem, UsbCapacity, OrderFilter } from '../admin/types/AdminTypes';
import { explainOutboundGateStatus } from '../services/gating';
import { getUserSession } from '../flows/userTrackingSystem';
import { stageBasedFollowUpService } from '../services/StageBasedFollowUpService';
import { getSuppressionStatus } from '../services/followupSuppression';
import { detectProductIntent as detectProductIntentFromTemplates } from '../services/persuasionTemplates';
import { getPipelineLagInfo } from '../scripts/verifyAnalyticsPipelines';

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
                        const nextFlow = routerDecision.targetFlow;

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
    // ORDER MANAGEMENT ROUTES
    // ============================================

    /**
     * Get all orders with pagination and filters
     * GET /api/admin/orders
     * 
     * Query parameters:
     * - page: Page number (default: 1)
     * - limit: Items per page (default: 50, max: 200)
     * - status: Filter by order status
     * - contentType: Filter by content type
     * - searchTerm: Search in customer name, phone, order number
     * - dateFrom: Filter orders from this date
     * - dateTo: Filter orders until this date
     */
    server.get('/api/admin/orders', async (req: Request, res: Response) => {
        try {
            const {
                page = '1',
                limit = '50',
                status,
                contentType,
                searchTerm,
                dateFrom,
                dateTo
            } = req.query;

            // Parse and validate pagination params
            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50));

            // Build filters using the OrderFilter interface
            const filters: OrderFilter = {};
            if (status && typeof status === 'string') {
                filters.status = status as any;
            }
            if (contentType && typeof contentType === 'string') {
                filters.contentType = contentType as any;
            }
            if (searchTerm && typeof searchTerm === 'string') {
                filters.searchTerm = searchTerm;
            }
            if (dateFrom && typeof dateFrom === 'string') {
                const parsedDateFrom = new Date(dateFrom);
                if (!isNaN(parsedDateFrom.getTime())) {
                    filters.dateFrom = parsedDateFrom;
                }
            }
            if (dateTo && typeof dateTo === 'string') {
                const parsedDateTo = new Date(dateTo);
                if (!isNaN(parsedDateTo.getTime())) {
                    filters.dateTo = parsedDateTo;
                }
            }

            // Get orders from service
            const result = await orderService.getOrders(filters, pageNum, limitNum);

            // Ensure totalPages is at least 1 when there are results, or calculated correctly
            const total = result.pagination.total;
            const totalPages = total > 0 ? Math.ceil(total / limitNum) : 0;

            return res.status(200).json({
                success: true,
                data: result.data,
                pagination: {
                    page: result.pagination.page,
                    limit: result.pagination.limit,
                    total: total,
                    totalPages: totalPages
                }
            });

        } catch (error) {
            console.error('Error fetching orders:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Get a single order by ID
     * GET /api/admin/orders/:orderId
     */
    server.get('/api/admin/orders/:orderId', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            const order = await orderService.getOrderById(orderId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: `Order ${orderId} not found`
                });
            }

            return res.status(200).json({
                success: true,
                data: order
            });

        } catch (error) {
            console.error('Error fetching order:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Confirm an order
     * POST /api/admin/orders/:orderId/confirm
     */
    server.post('/api/admin/orders/:orderId/confirm', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            const result = await orderService.confirmOrder(orderId);

            return res.status(200).json({
                success: result,
                message: result ? 'Order confirmed successfully' : 'Failed to confirm order'
            });

        } catch (error) {
            console.error('Error confirming order:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Cancel an order
     * POST /api/admin/orders/:orderId/cancel
     */
    server.post('/api/admin/orders/:orderId/cancel', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;
            const { reason } = req.body;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            const result = await orderService.cancelOrder(orderId, reason);

            return res.status(200).json({
                success: result,
                message: result ? 'Order cancelled successfully' : 'Failed to cancel order'
            });

        } catch (error) {
            console.error('Error cancelling order:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Add a note to an order
     * POST /api/admin/orders/:orderId/note
     */
    server.post('/api/admin/orders/:orderId/note', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;
            const { note } = req.body;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'orderId is required'
                });
            }

            if (!note || typeof note !== 'string' || note.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'note is required and must be a non-empty string'
                });
            }

            const result = await orderService.addOrderNote(orderId, note);

            return res.status(200).json({
                success: result,
                message: result ? 'Note added successfully' : 'Failed to add note'
            });

        } catch (error) {
            console.error('Error adding note to order:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Update an order
     * PUT /api/admin/orders/:orderId
     */
    server.put('/api/admin/orders/:orderId', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;
            const updateData = req.body;
            
            // Validate required fields
            if (!updateData.customerName || !updateData.capacity) {
                return res.status(400).json({
                    success: false,
                    error: 'Nombre del cliente y capacidad son requeridos'
                });
            }
            
            // Import businessDB
            const { businessDB } = await import('../mysql-database');
            
            // Update order in database
            const updated = await businessDB.updateOrder(orderId, {
                customer_name: updateData.customerName,
                phone_number: updateData.customerPhone,
                capacity: updateData.capacity,
                product_type: updateData.contentType,
                price: updateData.price,
                processing_status: updateData.status,
                usb_label: updateData.usbLabel,
                customization: JSON.stringify(updateData.customization),
                shipping_address: updateData.shippingAddress,
                updated_at: new Date()
            });
            
            if (updated) {
                // Emit socket event for real-time update
                emitSocketEvent('orderUpdated', { orderId, ...updateData });
                
                return res.status(200).json({
                    success: true,
                    message: 'Pedido actualizado correctamente'
                });
            } else {
                return res.status(404).json({
                    success: false,
                    error: 'Pedido no encontrado'
                });
            }
        } catch (error) {
            console.error('Error updating order:', error);
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Error interno'
            });
        }
    });

    /**
     * Get available USBs
     * GET /api/admin/usbs/available
     */
    server.get('/api/admin/usbs/available', async (req: Request, res: Response) => {
        try {
            // Import businessDB
            const { businessDB } = await import('../mysql-database');
            
            const usbs = await businessDB.getAvailableUSBs();
            return res.status(200).json({
                success: true,
                data: usbs
            });
        } catch (error) {
            console.error('Error getting available USBs:', error);
            return res.status(500).json({
                success: false,
                error: 'Error obteniendo USBs disponibles'
            });
        }
    });

    /**
     * Assign USB to an order
     * POST /api/admin/orders/:orderId/assign-usb
     */
    server.post('/api/admin/orders/:orderId/assign-usb', async (req: Request, res: Response) => {
        try {
            const { orderId } = req.params;
            const { usbLabel } = req.body;
            
            // Import businessDB
            const { businessDB } = await import('../mysql-database');
            
            const assigned = await businessDB.assignUSBToOrder(orderId, usbLabel);
            
            if (assigned) {
                emitSocketEvent('usbAssigned', { orderId, usbLabel });
                return res.status(200).json({
                    success: true,
                    message: `USB ${usbLabel} asignada al pedido`
                });
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'No se pudo asignar la USB'
                });
            }
        } catch (error) {
            console.error('Error assigning USB:', error);
            return res.status(500).json({
                success: false,
                error: 'Error asignando USB'
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
     * Get daily order statistics with caching (120s TTL for date-range queries)
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

            // Cache for 120s (date-range analytics query)
            cacheService.set(cacheKey, responseData, { ttl: CACHE_TTL.ANALYTICS_DATE_RANGE });
            
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
     * Get intent conversion statistics with caching (120s TTL for date-range queries)
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

            // Cache for 120s (date-range analytics query)
            cacheService.set(cacheKey, responseData, { ttl: CACHE_TTL.ANALYTICS_DATE_RANGE });
            
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
     * Get follow-up performance statistics with caching (120s TTL)
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

            // Cache for 120s (date-range analytics query)
            cacheService.set(cacheKey, responseData, { ttl: CACHE_TTL.ANALYTICS_DATE_RANGE });
            
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
     * Get analytics watermarks status with estimated lag per pipeline
     * GET /api/admin/analytics/watermarks
     */
    server.get('/api/admin/analytics/watermarks', async (req: Request, res: Response) => {
        try {
            // Get watermarks
            const watermarks = await analyticsWatermarkRepository.getAll();
            
            // Get pipeline lag information
            let pipelineLag;
            try {
                pipelineLag = await getPipelineLagInfo();
            } catch (lagError) {
                console.warn('Could not get pipeline lag info:', lagError);
                pipelineLag = [];
            }
            
            // Get stale watermark status from refresher
            const staleStatus = analyticsRefresher.getStaleWatermarkStatus();
            
            // Merge watermarks with lag info
            const enrichedWatermarks = watermarks.map(watermark => {
                const lag = pipelineLag.find(p => p.watermarkName === watermark.name);
                const stale = staleStatus.find(s => s.watermarkName === watermark.name);
                
                return {
                    ...watermark,
                    pipelineStatus: lag?.status || 'UNKNOWN',
                    pendingEvents: lag?.pendingEvents || 0,
                    estimatedLagMinutes: lag?.estimatedLagMinutes,
                    discrepancy: lag?.discrepancy,
                    isStale: stale?.isStale || false,
                    cyclesWithoutProgress: stale?.cyclesWithoutProgress || 0
                };
            });
            
            // Calculate max lag, handling empty arrays and null values
            const lagValues = enrichedWatermarks
                .map(w => w.estimatedLagMinutes)
                .filter((v): v is number => v !== null && v !== undefined);
            const maxLagMinutes = lagValues.length > 0 ? Math.max(...lagValues) : null;
            
            return res.status(200).json({
                success: true,
                data: {
                    watermarks: enrichedWatermarks,
                    summary: {
                        totalPipelines: enrichedWatermarks.length,
                        stalePipelines: enrichedWatermarks.filter(w => w.isStale).length,
                        pipelinesWithPendingEvents: enrichedWatermarks.filter(w => w.pendingEvents > 0).length,
                        maxLagMinutes
                    }
                }
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
                    skipped: true,
                    skip_reason: 'RECENT_ANALYSIS'
                });
            }

            if (analysisId === -2) {
                return res.status(200).json({
                    success: true,
                    message: 'Analysis skipped - insufficient conversation history',
                    skipped: true,
                    skip_reason: 'NO_HISTORY'
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

            // Cache the response for 60s (date range dashboard)
            cacheService.set(cacheKey, summary, { ttl: CACHE_TTL.ANALYTICS_DATE_RANGE });

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

    // ============================================
    // USB PRICING ENDPOINTS - Single Source of Truth
    // ============================================

    /**
     * Get USB pricing for all content types
     * GET /api/admin/pricing/usb
     * 
     * Returns pricing information for all USB capacities (8/32/64/128/256 GB)
     * across all content types (music, videos, movies)
     */
    server.get('/api/admin/pricing/usb', async (req: Request, res: Response) => {
        try {
            // Check cache first (60s TTL)
            const cacheKey = 'usb_pricing_all';
            const cached = cacheService.get<UsbPricing>(cacheKey);
            
            if (cached) {
                return res.status(200).json({
                    success: true,
                    data: cached,
                    cached: true
                });
            }

            // Get all catalog items from database
            const allItems = await catalogRepository.getAllItems(true); // Only active items

            // Transform to UsbPricing structure
            const pricing: UsbPricing = {
                music: [],
                videos: [],
                movies: [],
                lastUpdated: new Date()
            };

            for (const item of allItems) {
                // Validate capacity is a valid UsbCapacity
                const validCapacities = ['8GB', '32GB', '64GB', '128GB', '256GB', '512GB'];
                if (!validCapacities.includes(item.capacity)) {
                    console.warn(`[USB Pricing] Skipping invalid capacity: ${item.capacity}`);
                    continue;
                }

                const pricingItem: UsbPricingItem = {
                    capacity: item.capacity as UsbCapacity,
                    capacityGb: item.capacity_gb,
                    price: Number(item.price),
                    contentCount: item.content_count,
                    contentUnit: item.content_unit,
                    isActive: item.is_active ?? true,
                    isPopular: item.is_popular ?? false,
                    isRecommended: item.is_recommended ?? false
                };

                if (item.category_id === 'music') {
                    pricing.music.push(pricingItem);
                } else if (item.category_id === 'videos') {
                    pricing.videos.push(pricingItem);
                } else if (item.category_id === 'movies') {
                    pricing.movies.push(pricingItem);
                }
            }

            // Sort by capacity
            pricing.music.sort((a, b) => a.capacityGb - b.capacityGb);
            pricing.videos.sort((a, b) => a.capacityGb - b.capacityGb);
            pricing.movies.sort((a, b) => a.capacityGb - b.capacityGb);

            // Cache the result
            cacheService.set(cacheKey, pricing, { ttl: CACHE_TTL.ANALYTICS }); // 60 seconds TTL

            return res.status(200).json({
                success: true,
                data: pricing,
                cached: false
            });

        } catch (error) {
            structuredLogger.error('api', 'Error fetching USB pricing', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Update USB pricing for a specific content type and capacity
     * PUT /api/admin/pricing/usb
     * 
     * Body:
     * {
     *   categoryId: 'music' | 'videos' | 'movies',
     *   capacity: '8GB' | '32GB' | '64GB' | '128GB' | '256GB',
     *   price: number,
     *   contentCount?: number,
     *   isActive?: boolean,
     *   isPopular?: boolean,
     *   isRecommended?: boolean,
     *   changedBy?: string,
     *   changeReason?: string
     * }
     */
    server.put('/api/admin/pricing/usb', async (req: Request, res: Response) => {
        try {
            const {
                categoryId,
                capacity,
                price,
                contentCount,
                isActive,
                isPopular,
                isRecommended,
                changedBy = 'admin',
                changeReason
            } = req.body;

            // Validate required fields
            if (!categoryId || !capacity || price === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: categoryId, capacity, price'
                });
            }

            // Validate categoryId
            const validCategories = ['music', 'videos', 'movies'];
            if (!validCategories.includes(categoryId)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid categoryId. Must be one of: ${validCategories.join(', ')}`
                });
            }

            // Validate capacity
            const validCapacities = ['8GB', '32GB', '64GB', '128GB', '256GB', '512GB'];
            if (!validCapacities.includes(capacity)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid capacity. Must be one of: ${validCapacities.join(', ')}`
                });
            }

            // Validate price
            if (typeof price !== 'number' || price < 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Price must be a non-negative number'
                });
            }

            // Get existing item
            const existingItem = await catalogRepository.getItem(categoryId, capacity);

            if (!existingItem || existingItem.id === undefined || existingItem.id === null) {
                return res.status(404).json({
                    success: false,
                    error: `Pricing item not found for ${categoryId} ${capacity}`
                });
            }

            const itemId = existingItem.id;

            // Build updates object
            const updates: any = { price };
            if (contentCount !== undefined) updates.content_count = contentCount;
            if (isActive !== undefined) updates.is_active = isActive;
            if (isPopular !== undefined) updates.is_popular = isPopular;
            if (isRecommended !== undefined) updates.is_recommended = isRecommended;

            // Get IP address
            const ipAddress = req.headers['x-forwarded-for'] as string || 
                              req.socket?.remoteAddress || 
                              'unknown';

            // Update the item
            const success = await catalogRepository.updateItem(
                itemId,
                updates,
                changedBy,
                changeReason,
                ipAddress
            );

            if (!success) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to update pricing'
                });
            }

            // Clear pricing cache to ensure fresh data
            catalogService.clearPricingCache();
            cacheService.delete('usb_pricing_all');

            // Get updated item
            const updatedItem = await catalogRepository.getItemById(itemId);

            return res.status(200).json({
                success: true,
                message: `Updated ${categoryId} ${capacity} pricing`,
                data: {
                    capacity: updatedItem?.capacity,
                    capacityGb: updatedItem?.capacity_gb,
                    price: Number(updatedItem?.price),
                    contentCount: updatedItem?.content_count,
                    contentUnit: updatedItem?.content_unit,
                    isActive: updatedItem?.is_active,
                    isPopular: updatedItem?.is_popular,
                    isRecommended: updatedItem?.is_recommended
                }
            });

        } catch (error) {
            structuredLogger.error('api', 'Error updating USB pricing', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Analytics diagnostics endpoint
     * GET /api/admin/diagnostics/analytics
     * 
     * Returns diagnostic information about analytics pipeline:
     * - Current watermark status for each processor
     * - Count of events pending processing since each watermark
     * - Count of rows in aggregate tables
     * - Identifies if there's a backlog of unprocessed events
     */
    server.get('/api/admin/diagnostics/analytics', async (req: Request, res: Response) => {
        try {
            // Get comprehensive diagnostics from the watermark repository
            const diagnostics = await analyticsWatermarkRepository.getDiagnostics();
            
            // Calculate backlog status for each processor
            const backlogStatus = {
                orders_stats: {
                    hasBacklog: diagnostics.eventCounts.order_events_since_orders_watermark > 0,
                    pendingEvents: diagnostics.eventCounts.order_events_since_orders_watermark
                },
                intent_conversion: {
                    hasBacklog: diagnostics.eventCounts.order_events_since_intent_watermark > 0,
                    pendingEvents: diagnostics.eventCounts.order_events_since_intent_watermark
                },
                followup_performance: {
                    hasBacklog: diagnostics.eventCounts.order_events_since_followup_watermark > 0,
                    pendingEvents: diagnostics.eventCounts.order_events_since_followup_watermark
                }
            };
            
            // Overall health check
            const totalBacklog = backlogStatus.orders_stats.pendingEvents + 
                                 backlogStatus.intent_conversion.pendingEvents + 
                                 backlogStatus.followup_performance.pendingEvents;
            
            const healthStatus = totalBacklog === 0 ? 'healthy' : 
                                 totalBacklog < 100 ? 'minor_backlog' : 
                                 totalBacklog < 1000 ? 'moderate_backlog' : 'significant_backlog';

            return res.status(200).json({
                success: true,
                data: {
                    timestamp: new Date().toISOString(),
                    healthStatus,
                    watermarks: diagnostics.watermarks.map(w => ({
                        name: w.name,
                        lastEventId: w.last_event_id || 0,
                        lastProcessedAt: w.last_processed_at,
                        totalProcessed: w.total_processed || 0,
                        updatedAt: w.updated_at
                    })),
                    eventCounts: diagnostics.eventCounts,
                    aggregateTableCounts: diagnostics.aggregateTableCounts,
                    backlogStatus
                }
            });

        } catch (error) {
            console.error('Error fetching analytics diagnostics:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    // ==================== MESSAGE DECISION TRACE ENDPOINTS ====================

    /**
     * Get message decision traces with filtering and pagination
     * GET /v1/messages/decisions
     * 
     * Query parameters:
     * - phone: Phone number (will be hashed)
     * - phoneHash: Already hashed phone (alternative to phone)
     * - messageId: Filter by message ID
     * - stage: Filter by pipeline stage
     * - decision: Filter by decision type
     * - reasonCode: Filter by reason code
     * - correlationId: Filter by correlation ID
     * - dateFrom: Filter from date (ISO format)
     * - dateTo: Filter to date (ISO format)
     * - page: Page number (default: 1)
     * - limit: Results per page (default: 50, max: 100)
     */
    server.get('/v1/messages/decisions', async (req: Request, res: Response) => {
        try {
            const {
                phone,
                phoneHash,
                messageId,
                stage,
                decision,
                reasonCode,
                correlationId,
                dateFrom,
                dateTo,
                page = '1',
                limit = '50'
            } = req.query;

            // Build filter
            const filter: DecisionTraceFilter = {};

            // Handle phone - hash if raw phone provided
            if (phone && typeof phone === 'string') {
                filter.phoneHash = hashPhone(phone);
            } else if (phoneHash && typeof phoneHash === 'string') {
                filter.phoneHash = phoneHash;
            }

            if (messageId && typeof messageId === 'string') {
                filter.messageId = messageId;
            }

            if (stage && typeof stage === 'string') {
                filter.stage = stage as any;
            }

            if (decision && typeof decision === 'string') {
                filter.decision = decision as any;
            }

            if (reasonCode && typeof reasonCode === 'string') {
                filter.reasonCode = reasonCode as any;
            }

            if (correlationId && typeof correlationId === 'string') {
                filter.correlationId = correlationId;
            }

            if (dateFrom && typeof dateFrom === 'string') {
                filter.dateFrom = new Date(dateFrom);
            }

            if (dateTo && typeof dateTo === 'string') {
                filter.dateTo = new Date(dateTo);
            }

            // Pagination
            const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
            const perPage = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));

            // Query decisions
            const result = await messageDecisionService.queryDecisions(filter, pageNum, perPage);

            return res.status(200).json({
                success: true,
                data: result.data,
                pagination: {
                    page: result.page,
                    perPage: result.perPage,
                    total: result.total,
                    totalPages: result.totalPages
                }
            });

        } catch (error) {
            structuredLogger.error('api', 'Error fetching message decisions', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Get decision traces for a specific message
     * GET /v1/messages/decisions/:messageId
     * 
     * Returns all decision traces for a specific WhatsApp message ID
     * Traces are ordered by timestamp ascending to show the processing timeline
     */
    server.get('/v1/messages/decisions/:messageId', async (req: Request, res: Response) => {
        try {
            const { messageId } = req.params;

            if (!messageId) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad request',
                    message: 'messageId parameter is required'
                });
            }

            const decisions = await messageDecisionService.getDecisionsByMessageId(messageId);

            return res.status(200).json({
                success: true,
                data: decisions,
                count: decisions.length
            });

        } catch (error) {
            structuredLogger.error('api', 'Error fetching message decisions by ID', {
                error: error instanceof Error ? error.message : 'Unknown error',
                messageId: req.params.messageId
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Get decision summary statistics
     * GET /v1/messages/decisions/summary
     * 
     * Query parameters:
     * - phone: Phone number (will be hashed)
     * - phoneHash: Already hashed phone
     * - dateFrom: Filter from date
     * - dateTo: Filter to date
     */
    server.get('/v1/messages/decisions/summary', async (req: Request, res: Response) => {
        try {
            const {
                phone,
                phoneHash,
                dateFrom,
                dateTo
            } = req.query;

            // Build filter
            const filter: DecisionTraceFilter = {};

            if (phone && typeof phone === 'string') {
                filter.phoneHash = hashPhone(phone);
            } else if (phoneHash && typeof phoneHash === 'string') {
                filter.phoneHash = phoneHash;
            }

            if (dateFrom && typeof dateFrom === 'string') {
                filter.dateFrom = new Date(dateFrom);
            }

            if (dateTo && typeof dateTo === 'string') {
                filter.dateTo = new Date(dateTo);
            }

            // Get summaries
            const [decisionSummary, reasonCodeSummary] = await Promise.all([
                messageDecisionService.getDecisionSummary(filter),
                messageDecisionService.getReasonCodeSummary(filter)
            ]);

            return res.status(200).json({
                success: true,
                data: {
                    byDecision: decisionSummary,
                    byReasonCode: reasonCodeSummary
                }
            });

        } catch (error) {
            structuredLogger.error('api', 'Error fetching message decision summary', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Helper function to handle follow-up explanation request
     * Shared between /v1/followup/explain/:phone and /api/admin/followup/explain/:phone
     * Enhanced to include stage-based follow-up information
     */
    async function handleFollowUpExplainRequest(req: Request, res: Response): Promise<any> {
        const { phone } = req.params;

        // Validate phone parameter
        if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required',
                example: '/v1/followup/explain/573001234567'
            });
        }

        // Clean phone number (remove all non-digits)
        const cleanPhone = phone.replace(/\D/g, '');

        // Get user session
        const session = await getUserSession(cleanPhone);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'User session not found',
                phone: cleanPhone
            });
        }

        // Get detailed explanation using the gating module
        const gateExplanation = await explainOutboundGateStatus(cleanPhone, session);

        // Get stage-based follow-up explanation
        const stageExplanation = await stageBasedFollowUpService.getFollowUpExplanation(cleanPhone);

        // Get product intent (what type of USB the user is interested in)
        const productIntent = detectProductIntentFromTemplates(session);
        
        // Get suppression status (checks if shipping confirmed, order completed, etc.)
        const suppressionStatus = await getSuppressionStatus(cleanPhone);

        return res.status(200).json({
            success: true,
            data: {
                ...gateExplanation,
                // Stage-based follow-up info
                stage: stageExplanation.currentStage,
                stageInfo: stageExplanation.stageInfo,
                nextFollowUpAt: stageExplanation.nextFollowUpAt?.toISOString() || null,
                pendingFollowUps: stageExplanation.pendingFollowUps.map(f => ({
                    ...f,
                    scheduledAt: f.scheduledAt.toISOString()
                })),
                stageAttempts: stageExplanation.counters.stageAttempts,
                // Product intent info (NEW - helps debug why certain templates are selected)
                productIntent: {
                    type: productIntent,
                    description: productIntent === 'MUSIC_USB' ? 'User interested in Music USB'
                        : productIntent === 'VIDEO_USB' ? 'User interested in Video USB'
                        : productIntent === 'MOVIES_USB' ? 'User interested in Movies USB'
                        : 'No specific product intent detected',
                    contentType: (session as any).contentType || null,
                    currentFlow: session.currentFlow || null
                },
                // Suppression status info (NEW - explains if follow-ups are blocked due to shipping/order status)
                suppression: {
                    isSuppressed: suppressionStatus.suppressed,
                    reason: suppressionStatus.reason,
                    evidence: suppressionStatus.evidence
                },
                reason: suppressionStatus.suppressed 
                    ? `Follow-up suppressed: ${suppressionStatus.reason}`
                    : stageExplanation.stageInfo 
                        ? `Waiting for response to ${stageExplanation.stageInfo.expectedAnswerType} in ${stageExplanation.stageInfo.flowName}`
                        : gateExplanation.blockingReasons.length > 0 
                            ? gateExplanation.blockingReasons.join(', ')
                            : 'No blocking reasons'
            }
        });
    }


    /**
     * Get follow-up eligibility explanation for a phone number
     * GET /v1/followup/explain/:phone
     * 
     * Returns detailed information about why a user can or cannot receive follow-ups:
     * - Current counter values (followUpAttempts, followUpCount24h)
     * - Configured limits
     * - Last interaction timestamps
     * - Next eligible time (if blocked)
     * - Exact blocking reason(s)
     * 
     * This endpoint is useful for debugging follow-up delivery issues.
     */
    server.get('/v1/followup/explain/:phone', async (req: Request, res: Response) => {
        try {
            return await handleFollowUpExplainRequest(req, res);
        } catch (error) {
            structuredLogger.error('api', 'Error explaining follow-up status', {
                error: error instanceof Error ? error.message : 'Unknown error',
                phone: req.params.phone
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Alias endpoint: GET /api/admin/followup/explain/:phone
     * Same functionality as /v1/followup/explain/:phone for admin panel consistency
     */
    server.get('/api/admin/followup/explain/:phone', async (req: Request, res: Response) => {
        try {
            return await handleFollowUpExplainRequest(req, res);
        } catch (error) {
            structuredLogger.error('api', 'Error explaining follow-up status', {
                error: error instanceof Error ? error.message : 'Unknown error',
                phone: req.params.phone
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /v1/followup/queue/stage
     * Returns the queue of pending stage-based follow-ups
     * 
     * Returns:
     * - List of pending follow-ups with stage, scheduledAt, reason
     * - Sorted by scheduledAt (soonest first)
     */
    server.get('/v1/followup/queue/stage', async (req: Request, res: Response) => {
        try {
            const queue = stageBasedFollowUpService.getFollowUpQueue();
            
            return res.status(200).json({
                success: true,
                data: {
                    totalPending: queue.length,
                    followUps: queue.map(f => ({
                        id: f.id,
                        phoneHash: f.phoneHash,
                        stage: f.stage,
                        questionId: f.questionId,
                        scheduledAt: f.scheduledAt.toISOString(),
                        reason: f.reason,
                        attemptNumber: f.attemptNumber,
                        status: f.status,
                        createdAt: f.createdAt.toISOString()
                    }))
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            structuredLogger.error('api', 'Error getting stage follow-up queue', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * Alias endpoint: GET /api/admin/followup/queue/stage
     * Same functionality as /v1/followup/queue/stage for admin panel consistency
     */
    server.get('/api/admin/followup/queue/stage', async (req: Request, res: Response) => {
        try {
            const queue = stageBasedFollowUpService.getFollowUpQueue();
            
            return res.status(200).json({
                success: true,
                data: {
                    totalPending: queue.length,
                    followUps: queue.map(f => ({
                        id: f.id,
                        phoneHash: f.phoneHash,
                        stage: f.stage,
                        questionId: f.questionId,
                        scheduledAt: f.scheduledAt.toISOString(),
                        reason: f.reason,
                        attemptNumber: f.attemptNumber,
                        status: f.status,
                        createdAt: f.createdAt.toISOString()
                    }))
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            structuredLogger.error('api', 'Error getting stage follow-up queue', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /api/admin/followup/suppression/:phone
     * Check if follow-ups are suppressed for a phone number
     * 
     * Returns:
     * - suppressed: boolean - Whether follow-ups are suppressed
     * - reason: string - Reason for suppression (e.g., SHIPPING_CONFIRMED, ORDER_COMPLETED)
     * - evidence: object - Redacted evidence supporting the decision
     * - checkedAt: string - ISO timestamp of the check
     * 
     * Privacy note: PII is redacted (order IDs show only last 4 chars)
     */
    
    // Shared handler for suppression status endpoint
    async function handleSuppressionStatusRequest(req: Request, res: Response): Promise<Response> {
        try {
            const { phone } = req.params;
            
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number is required'
                });
            }
            
            // Import dynamically to avoid circular dependencies
            const { getSuppressionStatus } = await import('../services/followupSuppression');
            
            const status = await getSuppressionStatus(phone);
            
            structuredLogger.info('api', 'Suppression status checked', {
                phoneHash: status.phoneHash,
                suppressed: status.suppressed,
                reason: status.reason
            });
            
            return res.status(200).json({
                success: true,
                data: status,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            structuredLogger.error('api', 'Error checking suppression status', {
                error: error instanceof Error ? error.message : 'Unknown error',
                phone: hashPhone(req.params.phone)
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    server.get('/api/admin/followup/suppression/:phone', handleSuppressionStatusRequest);

    /**
     * Alias endpoint: GET /v1/followup/suppression/:phone
     * Same functionality as /api/admin/followup/suppression/:phone
     */
    server.get('/v1/followup/suppression/:phone', handleSuppressionStatusRequest);

    /**
     * POST /api/admin/followup/pause/:phone
     * Manually pause follow-ups for a phone number
     * 
     * Body parameters:
     * - reason: Optional string - Reason for pausing
     * - pausedBy: Optional string - Admin user ID who paused
     * 
     * Returns:
     * - success: boolean - Whether pause was successful
     * - data: PauseResult - Details of the pause operation
     */
    server.post('/api/admin/followup/pause/:phone', async (req: Request, res: Response) => {
        try {
            const { phone } = req.params;
            const { reason, pausedBy } = req.body;
            
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number is required'
                });
            }
            
            // Basic phone validation - must be numeric and reasonable length
            const normalizedPhone = phone.replace(/\D/g, '');
            if (normalizedPhone.length < 8 || normalizedPhone.length > 20) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number format'
                });
            }
            
            // Import repository
            const { followupPausesRepository } = await import('../repositories/FollowupPausesRepository');
            
            const result = await followupPausesRepository.pause(phone, pausedBy, reason);
            
            structuredLogger.info('api', 'Follow-ups paused via admin endpoint', {
                phoneHash: result.phoneHash,
                pausedBy,
                reason,
                success: result.success
            });
            
            return res.status(result.success ? 200 : 500).json({
                success: result.success,
                data: {
                    // Redact phone for privacy (show only last 4 digits)
                    phoneRedacted: `***${result.phone.slice(-4)}`,
                    phoneHash: result.phoneHash,
                    isPaused: result.isPaused,
                    pausedBy: result.pausedBy,
                    pauseReason: result.pauseReason,
                    pausedAt: result.pausedAt?.toISOString()
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            structuredLogger.error('api', 'Error pausing follow-ups', {
                error: error instanceof Error ? error.message : 'Unknown error',
                phone: hashPhone(req.params.phone)
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * POST /api/admin/followup/unpause/:phone
     * Resume follow-ups for a phone number that was manually paused
     * 
     * Body parameters:
     * - unpausedBy: Optional string - Admin user ID who unpaused
     * 
     * Returns:
     * - success: boolean - Whether unpause was successful
     * - data: UnpauseResult - Details of the unpause operation
     */
    server.post('/api/admin/followup/unpause/:phone', async (req: Request, res: Response) => {
        try {
            const { phone } = req.params;
            const { unpausedBy } = req.body;
            
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number is required'
                });
            }
            
            // Basic phone validation - must be numeric and reasonable length
            const normalizedPhone = phone.replace(/\D/g, '');
            if (normalizedPhone.length < 8 || normalizedPhone.length > 20) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid phone number format'
                });
            }
            
            // Import repository
            const { followupPausesRepository } = await import('../repositories/FollowupPausesRepository');
            
            const result = await followupPausesRepository.unpause(phone, unpausedBy);
            
            structuredLogger.info('api', 'Follow-ups unpaused via admin endpoint', {
                phoneHash: result.phoneHash,
                unpausedBy,
                success: result.success
            });
            
            return res.status(result.success ? 200 : 500).json({
                success: result.success,
                data: {
                    // Redact phone for privacy (show only last 4 digits)
                    phoneRedacted: `***${result.phone.slice(-4)}`,
                    phoneHash: result.phoneHash,
                    isPaused: result.isPaused,
                    unpausedBy: result.unpausedBy,
                    unpausedAt: result.unpausedAt?.toISOString()
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            structuredLogger.error('api', 'Error unpausing follow-ups', {
                error: error instanceof Error ? error.message : 'Unknown error',
                phone: hashPhone(req.params.phone)
            });
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /api/admin/followup/paused
     * Get list of all currently paused phone numbers
     * 
     * Query parameters:
     * - limit: Optional number - Max records to return (default: 100)
     * - offset: Optional number - Offset for pagination (default: 0)
     * 
     * Returns:
     * - success: boolean
     * - data: Array of paused records (with redacted phone numbers)
     * - pagination: { total, limit, offset }
     */
    server.get('/api/admin/followup/paused', async (req: Request, res: Response) => {
        try {
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 100));
            const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
            
            // Import repository
            const { followupPausesRepository } = await import('../repositories/FollowupPausesRepository');
            
            const [paused, total] = await Promise.all([
                followupPausesRepository.getAllPaused(limit, offset),
                followupPausesRepository.countPaused()
            ]);
            
            return res.status(200).json({
                success: true,
                data: paused.map(p => ({
                    phoneHash: p.phone_hash,
                    // Redact phone number for privacy (show only last 4 digits)
                    phoneRedacted: `***${p.phone.slice(-4)}`,
                    isPaused: p.is_paused,
                    pausedBy: p.paused_by,
                    pauseReason: p.pause_reason,
                    pausedAt: p.paused_at?.toISOString(),
                    unpausedAt: p.unpaused_at?.toISOString(),
                    unpausedBy: p.unpaused_by
                })),
                pagination: {
                    total,
                    limit,
                    offset
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            structuredLogger.error('api', 'Error getting paused list', {
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
