# Observability v1 - Integration Guide

## Overview

The observability v1 implementation provides structured logging with correlation IDs to track requests/flows end-to-end through the system. This enables complete reconstruction of any interaction from message → flow → order → job using a single correlation ID.

## Key Components

### 1. Structured Logger (`src/utils/structuredLogger.ts`)

A pino-based logger with structured fields:
- `level`: debug, info, warn, error, fatal
- `category`: system, chatbot, database, ai, whatsapp, api, flow, order-events, processing-jobs, etc.
- `phone_hash`: Hashed phone number (PII-safe)
- `order_id`: Order identifier
- `flow`: Current flow name
- `event`: Event type
- `correlation_id`: Correlation ID for tracing

**Usage:**

```typescript
import { structuredLogger } from './utils/structuredLogger';

// Basic logging
structuredLogger.info('chatbot', 'User message received', {
    phone_hash: hashPhone(phone),
    flow: 'mainFlow',
});

// Log with phone (automatically hashed)
structuredLogger.logWithPhone(
    'info',
    'flow',
    'Flow started',
    phone,
    { flow: 'orderFlow', correlation_id: correlationId }
);

// Log order event
structuredLogger.logOrderEvent(
    'info',
    'order_created',
    orderId,
    phone,
    { correlation_id: correlationId }
);

// Create child logger with context
const childLogger = structuredLogger.childWithContext({
    correlation_id: correlationId,
    phone_hash: hashPhone(phone),
    flow: 'orderFlow',
});
childLogger.info('flow', 'Processing order');
```

### 2. Correlation ID Generator (`src/utils/correlationId.ts`)

Generates unique correlation IDs in format: `{sessionId}_{timestamp}_{random}`

**Usage:**

```typescript
import { generateCorrelationId } from './utils/correlationId';

const correlationId = generateCorrelationId(phone);
// Example: 573001234567_1706036400000_a3f5c8d2
```

### 3. Phone Hasher (`src/utils/phoneHasher.ts`)

Consistently hashes phone numbers to avoid logging raw PII.

**Usage:**

```typescript
import { hashPhone } from './utils/phoneHasher';

const phoneHash = hashPhone('573001234567');
// Returns first 16 chars of SHA-256 hash
```

### 4. Correlation ID Manager (`src/services/CorrelationIdManager.ts`)

Manages correlation context using AsyncLocalStorage. Automatically propagates correlation IDs through async operations.

**Usage:**

```typescript
import { correlationIdManager, getCorrelationId } from './services/CorrelationIdManager';

// Run operation with correlation context
correlationIdManager.run(phone, () => {
    // All async operations within this scope have access to correlation ID
    const correlationId = getCorrelationId();
    
    // Log with automatic correlation context
    const logger = correlationIdManager.getLogger();
    logger.info('flow', 'Processing message');
});

// Execute with automatic logging
await correlationIdManager.withCorrelation(
    phone,
    'process_order',
    async () => {
        // Your code here
        await processOrder(orderId);
    }
);
```

### 5. Order Event Repository (`src/repositories/OrderEventRepository.ts`)

Persists order events to database with correlation IDs.

**Usage:**

```typescript
import { orderEventRepository } from './repositories/OrderEventRepository';

// Create order event
await orderEventRepository.create({
    order_number: orderId,
    phone: customerPhone,
    event_type: 'order_created',
    event_source: 'bot',
    event_description: 'Order created successfully',
    event_data: orderData,
    flow_name: 'orderFlow',
    correlation_id: correlationId,
});

// Query by correlation ID (end-to-end trace)
const events = await orderEventRepository.getByCorrelationId(correlationId);
```

### 6. Updated Order Event Emitter (`src/services/OrderEventEmitter.ts`)

Now supports correlation IDs and persists events to database.

**Usage:**

```typescript
import { orderEventEmitter } from './services/OrderEventEmitter';

// Emit order created event with correlation ID
await orderEventEmitter.onOrderCreated(
    orderId,
    customerPhone,
    customerName,
    customerEmail,
    orderData,
    correlationId  // <-- New parameter
);
```

## Integration Pattern for Flows

### Example: Order Flow Integration

```typescript
import { correlationIdManager, getCorrelationId } from '../services/CorrelationIdManager';
import { structuredLogger } from '../utils/structuredLogger';
import { orderEventEmitter } from '../services/OrderEventEmitter';

export const orderFlow = addKeyword(['order', 'comprar'])
    .addAction(async (ctx, { flowDynamic }) => {
        const phone = ctx.from;
        
        // Run with correlation context
        await correlationIdManager.run(phone, async () => {
            const correlationId = getCorrelationId();
            const logger = correlationIdManager.getLogger();
            
            // Update context with flow info
            correlationIdManager.updateContext({ 
                flow: 'orderFlow',
                phone: phone,
            });
            
            // Log flow entry
            logger.info('flow', 'Order flow started', {
                event: 'flow_started',
            });
            
            // Process order
            const orderId = await createOrder(phone);
            
            // Update context with order ID
            correlationIdManager.updateContext({ orderId });
            
            // Emit order event with correlation ID
            await orderEventEmitter.onOrderCreated(
                orderId,
                phone,
                undefined,
                undefined,
                undefined,
                correlationId
            );
            
            // Log flow completion
            logger.info('flow', 'Order flow completed', {
                event: 'flow_completed',
                order_id: orderId,
            });
            
            await flowDynamic('Order created successfully!');
        });
    });
```

### Example: Processing Job Integration

```typescript
import { jobLogRepository } from '../repositories/JobLogRepository';
import { getCorrelationId } from '../services/CorrelationIdManager';

async function processJob(jobId: number) {
    const correlationId = getCorrelationId();
    
    // Log job start
    await jobLogRepository.create({
        job_id: jobId,
        level: 'info',
        category: 'system',
        message: 'Job processing started',
        correlation_id: correlationId,
    });
    
    try {
        // Process job
        // ...
        
        // Log success
        await jobLogRepository.create({
            job_id: jobId,
            level: 'info',
            category: 'system',
            message: 'Job completed successfully',
            correlation_id: correlationId,
        });
    } catch (error) {
        // Log error
        await jobLogRepository.create({
            job_id: jobId,
            level: 'error',
            category: 'system',
            message: 'Job failed',
            details: { error: error.message },
            correlation_id: correlationId,
        });
        throw error;
    }
}
```

## Database Schema

### order_events table (updated)

New columns:
- `correlation_id` VARCHAR(255) - Correlation ID for tracing
- `phone_hash` VARCHAR(64) - Hashed phone number

Existing columns used for observability:
- `order_number` - Order ID (aliased as order_id)
- `flow_name` - Flow name (aliased as flow)
- `event_type` - Event type (aliased as event)

### processing_job_logs table (updated)

New columns:
- `correlation_id` VARCHAR(255) - Correlation ID for tracing

## Migration

Run the migration to add observability fields:

```bash
npm run migrate
```

Migration file: `migrations/20260123000020_add_observability_fields.js`

## End-to-End Tracing

To trace a complete interaction:

```typescript
// Get all events by correlation ID
const orderEvents = await orderEventRepository.getByCorrelationId(correlationId);
const jobLogs = await jobLogRepository.getByCorrelationId(correlationId);

console.log('Order Events:', orderEvents);
console.log('Job Logs:', jobLogs);
```

This will show the complete flow: message → order flow → order created → job started → job completed.

## Best Practices

1. **Always use correlation context**: Wrap flow handlers in `correlationIdManager.run()` or use `withCorrelation()`.

2. **Update context**: Call `updateCorrelationContext()` when important IDs are available (orderId, jobId).

3. **Use structured logger**: Replace console.log with structured logger calls.

4. **Hash phone numbers**: Always use `hashPhone()` before logging phone numbers.

5. **Persist important events**: Use repositories to persist events and logs to database.

6. **Include correlation_id**: Always pass correlation ID to event emitters and repositories.

## Environment Variables

Set log level:
```bash
LOG_LEVEL=info  # Options: debug, info, warn, error
```

## Backward Compatibility

The existing `unifiedLogger` still works but is deprecated. Gradually migrate to `structuredLogger`.

## Future Enhancements (not in v1)

- External observability systems (Grafana, ELK)
- Distributed tracing with OpenTelemetry
- Real-time log streaming
- Advanced analytics dashboards
