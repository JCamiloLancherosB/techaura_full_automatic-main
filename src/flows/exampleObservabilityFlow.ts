/**
 * Example Flow with Observability v1 Integration
 * Demonstrates how to use correlation IDs, structured logging, and event tracking
 * 
 * This is a reference implementation showing best practices for:
 * - Generating and propagating correlation IDs
 * - Using structured logger
 * - Tracking events to database
 * - Maintaining correlation context through async operations
 */

import { addKeyword } from '@builderbot/bot';
import { correlationIdManager, getCorrelationId } from '../services/CorrelationIdManager';
import { structuredLogger } from '../utils/structuredLogger';
import { orderEventRepository } from '../repositories/OrderEventRepository';
import { orderEventEmitter } from '../services/OrderEventEmitter';

/**
 * Example flow demonstrating observability integration
 */
export const exampleObservabilityFlow = addKeyword(['example', 'demo'])
    .addAction(async (ctx, { flowDynamic }) => {
        const phone = ctx.from;
        
        // ✅ STEP 1: Run with correlation context
        // This automatically generates a correlation ID and maintains it through async operations
        await correlationIdManager.run(phone, async () => {
            const correlationId = getCorrelationId();
            
            // ✅ STEP 2: Update correlation context with additional info
            correlationIdManager.updateContext({
                phone: phone,
                flow: 'exampleObservabilityFlow',
            });
            
            // ✅ STEP 3: Get contextual logger (includes correlation ID automatically)
            const logger = correlationIdManager.getLogger();
            
            // ✅ STEP 4: Log flow entry
            logger.info('flow', 'Example flow started', {
                event: 'flow_started',
                message: ctx.body,
            });
            
            // ✅ STEP 5: Track event to database
            await orderEventRepository.create({
                phone: phone,
                event_type: 'flow_started',
                event_source: 'bot',
                event_description: 'User entered example observability flow',
                flow_name: 'exampleObservabilityFlow',
                user_input: ctx.body,
                correlation_id: correlationId,
            });
            
            // ✅ STEP 6: Simulate some processing
            await flowDynamic('Processing your request...');
            
            // Log processing
            logger.info('flow', 'Processing request', {
                event: 'processing',
            });
            
            // ✅ STEP 7: Simulate order creation
            const mockOrderId = `ORDER-${Date.now()}`;
            
            // Update context with order ID
            correlationIdManager.updateContext({
                orderId: mockOrderId,
            });
            
            // ✅ STEP 8: Log order creation
            logger.info('order-events', 'Order created', {
                event: 'order_created',
                order_id: mockOrderId,
            });
            
            // ✅ STEP 9: Emit order event (with correlation ID)
            await orderEventEmitter.onOrderCreated(
                mockOrderId,
                phone,
                undefined,
                undefined,
                {
                    productType: 'example',
                    price: 100,
                },
                correlationId  // Pass correlation ID
            );
            
            // ✅ STEP 10: Log flow completion
            logger.info('flow', 'Example flow completed', {
                event: 'flow_completed',
                order_id: mockOrderId,
            });
            
            // Track completion event
            await orderEventRepository.create({
                phone: phone,
                order_number: mockOrderId,
                event_type: 'flow_completed',
                event_source: 'bot',
                event_description: 'Example observability flow completed',
                flow_name: 'exampleObservabilityFlow',
                correlation_id: correlationId,
            });
            
            await flowDynamic(`✅ Done! Order ${mockOrderId} created.\n\nCorrelation ID: ${correlationId}\n\nYou can trace this entire interaction using this correlation ID.`);
        });
    });

/**
 * Alternative approach: Using withCorrelation for automatic entry/exit logging
 */
export const exampleWithCorrelationFlow = addKeyword(['example2', 'demo2'])
    .addAction(async (ctx, { flowDynamic }) => {
        const phone = ctx.from;
        
        // This automatically logs entry/exit and handles errors
        await correlationIdManager.withCorrelation(
            phone,
            'exampleWithCorrelationFlow',
            async () => {
                const correlationId = getCorrelationId();
                const logger = correlationIdManager.getLogger();
                
                // Update context
                correlationIdManager.updateContext({
                    phone: phone,
                    flow: 'exampleWithCorrelationFlow',
                });
                
                // Your business logic here
                logger.info('flow', 'Processing in withCorrelation wrapper');
                
                await flowDynamic(`Processing with correlation ID: ${correlationId}`);
                
                // Simulate some work
                await new Promise(resolve => setTimeout(resolve, 100));
                
                await flowDynamic('Done!');
                
                return 'success';
            }
        );
    });

/**
 * Example of error handling with correlation tracking
 */
export const exampleErrorHandlingFlow = addKeyword(['example-error'])
    .addAction(async (ctx, { flowDynamic }) => {
        const phone = ctx.from;
        
        await correlationIdManager.run(phone, async () => {
            const correlationId = getCorrelationId();
            const logger = correlationIdManager.getLogger();
            
            try {
                logger.info('flow', 'Starting error handling example');
                
                // Simulate an error
                throw new Error('Example error for demonstration');
                
            } catch (error) {
                // Log error with correlation context
                logger.error('flow', 'Error occurred in flow', {
                    error: error,
                    event: 'flow_error',
                });
                
                // Track error event to database
                await orderEventRepository.create({
                    phone: phone,
                    event_type: 'error',
                    event_source: 'bot',
                    event_description: `Error: ${error.message}`,
                    flow_name: 'exampleErrorHandlingFlow',
                    event_data: {
                        error: error.message,
                        stack: error.stack,
                    },
                    correlation_id: correlationId,
                });
                
                await flowDynamic(`Sorry, an error occurred. Correlation ID for support: ${correlationId}`);
            }
        });
    });

export default exampleObservabilityFlow;
