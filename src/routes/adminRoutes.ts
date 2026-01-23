/**
 * Admin API Routes
 * Provides endpoints for admin panel functionality including order timeline and replay
 */

import type { Request, Response } from 'express';
import { orderEventRepository, OrderEventFilter } from '../repositories/OrderEventRepository';
import { orderService } from '../admin/services/OrderService';
import { hybridIntentRouter } from '../services/hybridIntentRouter';
import { aiService } from '../services/aiService';

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
        reasoning?: string;
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
     * Get order timeline events with filtering
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
            const maxLimit = Math.min(parseInt(limit as string) || 100, 1000);
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

            return res.status(200).json({
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
            });

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
            const events = await orderEventRepository.getByOrderNumber(order.orderNumber, 100);

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
                    reasoning: routerDecision.reason // Use 'reason' field from IntentResult
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
}
