# PR-D1a Quick Reference

## What Was Implemented

Backend-only order events and timeline endpoints with pagination support.

## Endpoints

### 1. GET `/api/admin/orders/:orderId/events`
**Enhanced with pagination and filters**

```bash
# Basic usage
GET /api/admin/orders/123/events

# With pagination
GET /api/admin/orders/123/events?page=1&perPage=50

# With filters
GET /api/admin/orders/123/events?eventType=order_created&eventSource=bot

# With date range
GET /api/admin/orders/123/events?dateFrom=2026-01-01&dateTo=2026-01-31
```

### 2. GET `/api/admin/orders/:orderId/timeline`
**New simplified timeline view**

```bash
# Basic usage
GET /api/admin/orders/123/timeline

# With pagination (default: 20 items per page)
GET /api/admin/orders/123/timeline?page=2&perPage=10
```

## Query Parameters (Both Endpoints)

| Parameter | Description | Default | Example |
|-----------|-------------|---------|---------|
| `page` | Page number | 1 | `page=2` |
| `perPage` | Items per page | 50 (events), 20 (timeline) | `perPage=25` |
| `limit` | Alternative to perPage | - | `limit=100` |
| `eventType` | Filter by type | - | `eventType=order_created` |
| `eventSource` | Filter by source | - | `eventSource=bot` |
| `flowName` | Filter by flow | - | `flowName=orderFlow` |
| `dateFrom` | Start date (ISO) | - | `dateFrom=2026-01-01` |
| `dateTo` | End date (ISO) | - | `dateTo=2026-01-31` |
| `refresh` | Force cache refresh | false | `refresh=true` |

## Response Structure

### Events Endpoint
```json
{
  "success": true,
  "data": {
    "orderId": "123",
    "orderNumber": "ORD-123",
    "customerPhone": "+57...",
    "customerName": "John Doe",
    "orderStatus": "confirmed",
    "timeline": [...],      // Backward compatible
    "events": [...],        // Same as timeline
    "summary": [...],       // Event type counts
    "filter": {...},        // Applied filters
    "count": 25,           // Backward compatible
    "pagination": {
      "page": 1,
      "perPage": 50,
      "total": 125,
      "totalPages": 3
    }
  }
}
```

### Timeline Endpoint
```json
{
  "success": true,
  "data": {
    "orderId": "123",
    "orderNumber": "ORD-123",
    "timeline": [
      {
        "id": 1234,
        "timestamp": "2026-01-24T14:30:00.000Z",
        "type": "order_created",
        "source": "bot",
        "title": "Order created",
        "flow": "orderFlow",      // Optional
        "stage": "initial",       // Optional
        "userMessage": "...",     // Optional
        "botMessage": "...",      // Optional
        "metadata": {...}         // Optional
      }
    ],
    "summary": [...],
    "pagination": {...}
  }
}
```

## Testing

```bash
# Run test suite
node test-pr-d1a-endpoints.js

# Manual testing with curl
curl http://localhost:3000/api/admin/orders/1/events
curl http://localhost:3000/api/admin/orders/1/timeline?page=1&perPage=10
```

## Key Features

✅ **Pagination**: Full support with page, perPage, total, totalPages
✅ **Filters**: eventType, eventSource, flowName, date range
✅ **Caching**: 15-second TTL, filter-aware cache keys
✅ **Backward Compatible**: Existing UI works without changes
✅ **Security**: No vulnerabilities (CodeQL verified)
✅ **No UI Changes**: Backend only as specified

## Backward Compatibility

The implementation maintains full backward compatibility:
- Supports both `limit` (old) and `perPage` (new)
- Returns both `timeline` (old) and `events` (new)
- Returns both `count` (old) and `pagination.total` (new)
- Existing admin UI continues to work without modifications

## Performance

- Efficient pagination with LIMIT/OFFSET
- 15-second cache reduces database load
- Indexed queries on order_number and created_at
- Filter-aware cache keys prevent collisions

## Files Modified

1. `src/repositories/OrderEventRepository.ts` - Added pagination method
2. `src/routes/adminRoutes.ts` - Enhanced events, added timeline
3. `test-pr-d1a-endpoints.js` - Test suite
4. `PR_D1A_DOCUMENTATION.md` - Full documentation

## Common Event Types

- `order_created` - Order initiated
- `capacity_selected` - USB capacity chosen
- `genre_added` - Music genre added
- `order_confirmed` - Order confirmed
- `payment_method_selected` - Payment method chosen
- `address_provided` - Shipping address provided
- `order_cancelled` - Order cancelled

## Common Event Sources

- `bot` - WhatsApp bot
- `web` - Web interface
- `api` - External API
- `admin` - Admin panel

## Example Queries

```bash
# Get all bot events for an order
GET /api/admin/orders/123/events?eventSource=bot

# Get order creation events only
GET /api/admin/orders/123/events?eventType=order_created

# Get events from orderFlow
GET /api/admin/orders/123/events?flowName=orderFlow

# Get last month's events
GET /api/admin/orders/123/events?dateFrom=2025-12-24&dateTo=2026-01-24

# Get page 2 with 25 items per page
GET /api/admin/orders/123/events?page=2&perPage=25

# Timeline view with 5 items per page
GET /api/admin/orders/123/timeline?perPage=5

# Force cache refresh
GET /api/admin/orders/123/events?refresh=true
```

## Next Steps

For manual verification:
1. Start the server: `npm run dev`
2. Run tests: `node test-pr-d1a-endpoints.js`
3. Check existing admin UI still works
4. Verify new pagination features work as expected

For full documentation, see `PR_D1A_DOCUMENTATION.md`
