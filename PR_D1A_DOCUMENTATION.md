# PR-D1a: Backend Order Events & Timeline Endpoints

## Overview

This PR implements two backend endpoints for managing and viewing order events in the admin panel:

1. **Enhanced** `/api/admin/orders/:orderId/events` - Full event data with pagination
2. **New** `/api/admin/orders/:orderId/timeline` - Simplified timeline view with pagination

Both endpoints are fully backward compatible with the existing UI and require no frontend changes.

## Endpoints

### GET `/api/admin/orders/:orderId/events`

Returns detailed order events with pagination and filtering support.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination |
| `perPage` | number | 50 | Items per page (max: 100) |
| `limit` | number | - | Alternative to perPage (backward compatibility) |
| `eventType` | string | - | Filter by event type |
| `eventSource` | string | - | Filter by event source (bot, web, api, admin) |
| `flowName` | string | - | Filter by flow name |
| `dateFrom` | ISO date | - | Filter events from this date |
| `dateTo` | ISO date | - | Filter events until this date |
| `refresh` | boolean | false | Force cache refresh |

#### Response Format

```json
{
  "success": true,
  "data": {
    "orderId": "123",
    "orderNumber": "ORD-123",
    "customerPhone": "+57...",
    "customerName": "John Doe",
    "orderStatus": "confirmed",
    "timeline": [...],  // Array of events (backward compatibility)
    "events": [...],    // Same as timeline (new format)
    "summary": [
      { "event_type": "order_created", "count": 5 },
      { "event_type": "capacity_selected", "count": 3 }
    ],
    "filter": {
      "eventType": null,
      "eventSource": null,
      "flowName": null,
      "dateFrom": null,
      "dateTo": null
    },
    "count": 25,  // Total events on this page (backward compatibility)
    "pagination": {
      "page": 1,
      "perPage": 50,
      "total": 125,
      "totalPages": 3
    }
  },
  "cached": false  // Indicates if response came from cache
}
```

#### Event Object Structure

```json
{
  "id": 1234,
  "timestamp": "2026-01-24T14:30:00.000Z",
  "eventType": "order_created",
  "eventSource": "bot",
  "description": "Order created by customer",
  "data": { ... },  // Event-specific metadata
  "flowName": "orderFlow",
  "flowStage": "initial",
  "userInput": "Quiero un USB de 32GB",
  "botResponse": "Perfecto, te ayudaré..."
}
```

### GET `/api/admin/orders/:orderId/timeline`

Returns a simplified, aggregated view of order events optimized for timeline visualization.

#### Query Parameters

Same as `/events` endpoint, but with different defaults:
- `perPage` default: 20 (instead of 50)

#### Response Format

```json
{
  "success": true,
  "data": {
    "orderId": "123",
    "orderNumber": "ORD-123",
    "customerPhone": "+57...",
    "customerName": "John Doe",
    "orderStatus": "confirmed",
    "orderCreatedAt": "2026-01-24T14:00:00.000Z",
    "orderUpdatedAt": "2026-01-24T14:30:00.000Z",
    "timeline": [
      {
        "id": 1234,
        "timestamp": "2026-01-24T14:30:00.000Z",
        "type": "order_created",
        "source": "bot",
        "title": "Order created by customer",
        "flow": "orderFlow",  // Optional
        "stage": "initial",   // Optional
        "userMessage": "...", // Optional
        "botMessage": "...",  // Optional
        "metadata": { ... }   // Optional
      }
    ],
    "summary": [...],
    "filter": {...},
    "pagination": {
      "page": 1,
      "perPage": 20,
      "total": 125,
      "totalPages": 7
    }
  }
}
```

#### Timeline Item Structure

The timeline endpoint provides a cleaner structure:
- Simplified field names (`type` instead of `eventType`)
- Optional fields are only included if they have values
- Better suited for UI timeline components

## Database Schema

Uses existing `order_events` table with the following key columns:

```sql
CREATE TABLE order_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    phone_hash VARCHAR(255),
    session_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    event_source VARCHAR(50) NOT NULL,
    event_description TEXT,
    event_data JSON,
    flow_name VARCHAR(100),
    flow_stage VARCHAR(100),
    user_input TEXT,
    bot_response TEXT,
    ip_address VARCHAR(100),
    user_agent TEXT,
    correlation_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Indices for performance
    INDEX idx_order_number (order_number),
    INDEX idx_phone (phone),
    INDEX idx_event_type (event_type),
    INDEX idx_event_source (event_source),
    INDEX idx_created_at (created_at),
    INDEX idx_order_created (order_number, created_at),
    INDEX idx_phone_event (phone, event_type)
);
```

## Implementation Details

### OrderEventRepository Enhancement

Added `findByFilterPaginated` method that:
- Performs efficient pagination with LIMIT/OFFSET
- Returns total count alongside paginated results
- Supports all existing filters
- Uses prepared statements for SQL injection prevention

```typescript
async findByFilterPaginated(
    filter: OrderEventFilter, 
    page: number = 1, 
    perPage: number = 50
): Promise<{ 
    data: OrderEvent[]; 
    total: number; 
    page: number; 
    perPage: number; 
    totalPages: number 
}>
```

### Caching Strategy

Both endpoints use a 15-second cache TTL to balance freshness and performance:
- Cache key includes: orderId, pagination params, and filter params
- Prevents cache collisions when same order is queried with different filters
- Can be bypassed with `refresh=true` parameter

### Backward Compatibility

The enhanced `/events` endpoint maintains full backward compatibility:

1. **Field Names**: Returns both old (`timeline`, `count`) and new (`events`, `pagination`) field names
2. **Parameters**: Supports both `limit` (old) and `perPage` (new) parameters
3. **Behavior**: When only `limit` is specified, it works as before but also returns pagination metadata

This ensures existing UI code continues to work without modifications.

## Testing

### Manual Testing

Run the test script:

```bash
node test-pr-d1a-endpoints.js
```

This tests:
- Pagination with different page sizes
- Filtering by event type, source, flow
- Date range filtering
- Default parameter values
- Error handling (invalid order ID)
- Cache functionality
- Response format validation

### Integration Testing

The existing admin UI can be used to verify:
1. Order timeline still loads correctly
2. Event filtering works as before
3. No JavaScript errors in console
4. Performance is acceptable

## Performance Considerations

1. **Pagination**: Uses LIMIT/OFFSET which is efficient for small-to-medium datasets
   - For very large datasets (>100K events per order), consider cursor-based pagination
   
2. **Caching**: 15-second cache significantly reduces database load for frequently accessed orders

3. **Indexes**: Existing composite indexes on `(order_number, created_at)` optimize common queries

4. **Query Count**: Two queries per request (count + data) is standard and acceptable

## Security

✅ **CodeQL Analysis**: No security vulnerabilities detected

Key security features:
- SQL injection prevention via prepared statements
- Input validation for all parameters
- Rate limiting via existing cache mechanism
- No sensitive data in cache keys

## Migration Path

No database migrations required - uses existing `order_events` table.

## Rollback Plan

If issues arise:
1. Revert to previous commit
2. No data loss as no database changes were made
3. Existing UI will continue to work

## Future Enhancements

Potential improvements for future PRs:
1. Cursor-based pagination for very large datasets
2. Real-time event streaming via WebSocket
3. Event export functionality (CSV/JSON)
4. Advanced analytics on event patterns
5. Event deduplication logic
