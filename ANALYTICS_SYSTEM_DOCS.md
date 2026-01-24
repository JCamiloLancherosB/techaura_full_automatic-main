# Analytics "Always Fresh" System

## Overview

This system implements incremental analytics refresh using watermarks to keep statistics up-to-date without recalculating the entire history. The system processes new events since the last watermark and updates aggregated statistics tables.

## Architecture

### Components

1. **Watermark Tracking** (`analytics_watermarks` table)
   - Tracks the last processed event ID and timestamp for each analytics type
   - Enables incremental processing without missing events
   - Survives bot restarts

2. **Aggregated Statistics Tables**
   - `daily_order_stats`: Daily aggregated order metrics
   - `intent_conversion_stats`: Intent classification and conversion metrics
   - `followup_performance_daily`: Follow-up message effectiveness metrics

3. **Services**
   - `AnalyticsRefresher`: Main service that processes new events incrementally
   - `AnalyticsWatermarkRepository`: Manages watermark state
   - `AnalyticsStatsRepository`: Manages aggregated statistics

4. **API Routes** (`/api/admin/analytics/*`)
   - Query endpoints for daily stats, intent stats, followup stats
   - Watermark status endpoint
   - Manual refresh trigger

## How It Works

### Incremental Processing

1. **On Startup**: The system runs a "catch-up" process
   - Reads the last watermark for each analytics type
   - Processes all events since that watermark
   - Updates aggregated statistics
   - Moves the watermark forward

2. **Scheduled Refresh**: Every 3 minutes (configurable)
   - Reads new events since last watermark
   - Groups events by date
   - Updates or creates aggregated statistics
   - Moves watermark to latest processed event

3. **No Full Recalculation**: Only new events are processed, making the system efficient and scalable

### Watermarks

Each analytics type has its own watermark:
- `orders_stats_v1`: Tracks order-related events
- `intent_conversion_v1`: Tracks intent classification events
- `followup_performance_v1`: Tracks follow-up message events

Watermarks store:
- `last_event_id`: ID of the last processed event
- `last_processed_at`: Timestamp of last processing
- `total_processed`: Total number of events processed

## Database Schema

### analytics_watermarks
```sql
CREATE TABLE analytics_watermarks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) UNIQUE NOT NULL,
  last_event_id INT,
  last_processed_at TIMESTAMP,
  total_processed INT DEFAULT 0,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### daily_order_stats
```sql
CREATE TABLE daily_order_stats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE UNIQUE NOT NULL,
  orders_initiated INT DEFAULT 0,
  orders_completed INT DEFAULT 0,
  orders_cancelled INT DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  average_order_value DECIMAL(12,2) DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  unique_users INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### intent_conversion_stats
```sql
CREATE TABLE intent_conversion_stats (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  intent VARCHAR(100) NOT NULL,
  intent_count INT DEFAULT 0,
  successful_conversions INT DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  avg_confidence DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_date_intent (date, intent)
);
```

### followup_performance_daily
```sql
CREATE TABLE followup_performance_daily (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE UNIQUE NOT NULL,
  followups_sent INT DEFAULT 0,
  followups_responded INT DEFAULT 0,
  response_rate DECIMAL(5,2) DEFAULT 0,
  followup_orders INT DEFAULT 0,
  followup_revenue DECIMAL(12,2) DEFAULT 0,
  avg_response_time_minutes DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### GET /api/admin/analytics/orders/daily
Get daily order statistics.

**Query Parameters:**
- `dateFrom` (optional): Start date (ISO format)
- `dateTo` (optional): End date (ISO format)
- Default: Last 30 days

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-01-24",
      "orders_initiated": 10,
      "orders_completed": 7,
      "orders_cancelled": 1,
      "total_revenue": 1500.00,
      "average_order_value": 214.29,
      "conversion_rate": 70.00,
      "unique_users": 8
    }
  ],
  "dateFrom": "2026-01-01T00:00:00.000Z",
  "dateTo": "2026-01-24T00:00:00.000Z"
}
```

### GET /api/admin/analytics/intents
Get intent conversion statistics.

**Query Parameters:**
- `dateFrom` (optional): Start date
- `dateTo` (optional): End date
- Default: Last 30 days

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-01-24",
      "intent": "order",
      "intent_count": 15,
      "successful_conversions": 10,
      "conversion_rate": 66.67,
      "avg_confidence": 0.85
    }
  ]
}
```

### GET /api/admin/analytics/followup
Get follow-up performance statistics.

**Query Parameters:**
- `dateFrom` (optional): Start date
- `dateTo` (optional): End date
- Default: Last 30 days

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-01-24",
      "followups_sent": 20,
      "followups_responded": 12,
      "response_rate": 60.00,
      "followup_orders": 5,
      "followup_revenue": 750.00,
      "avg_response_time_minutes": 45.5
    }
  ]
}
```

### GET /api/admin/analytics/watermarks
Get current watermark status for all analytics types.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "orders_stats_v1",
      "last_event_id": 1523,
      "last_processed_at": "2026-01-24T13:45:00.000Z",
      "total_processed": 1523
    }
  ]
}
```

### POST /api/admin/analytics/refresh
Trigger a manual analytics refresh.

**Response:**
```json
{
  "success": true,
  "message": "Analytics refresh triggered"
}
```

## Configuration

The analytics refresher runs every 3 minutes by default. This can be configured in `app.ts`:

```typescript
await analyticsRefresher.start(3); // Run every 3 minutes
```

## Testing

Run the test script to verify the analytics system:

```bash
npm run dev test-analytics-system.ts
# or
tsx test-analytics-system.ts
```

The test script will:
1. Check that watermarks exist
2. Query the order_events table
3. Run a manual refresh
4. Verify updated watermarks
5. Query aggregated statistics

## Deployment

### Initial Setup

1. **Run Migrations**:
   ```bash
   npm run migrate
   ```
   This creates the `analytics_watermarks` and aggregated statistics tables.

2. **Verify Tables**:
   ```sql
   SHOW TABLES LIKE 'analytics_%';
   SHOW TABLES LIKE '%_stats';
   SHOW TABLES LIKE 'followup_performance_daily';
   ```

3. **Start the Bot**:
   The analytics refresher starts automatically with the bot.

### Monitoring

Check the logs for analytics activity:
```
📊 Starting AnalyticsRefresher...
✅ AnalyticsRefresher started successfully
[INFO] [analytics  ] Running catch-up from last watermark
[INFO] [analytics  ] Processed order stats (eventsProcessed: 50, maxEventId: 1523)
```

Query watermark status via API:
```bash
curl http://localhost:3000/api/admin/analytics/watermarks
```

## Benefits

1. **Always Up-to-Date**: Statistics update automatically every 3 minutes
2. **Efficient**: Only processes new events, not entire history
3. **Resilient**: Survives bot restarts; catches up on missed events
4. **Scalable**: Performance doesn't degrade as history grows
5. **Real-time Queries**: Aggregated data enables fast dashboard queries

## Troubleshooting

### Watermarks not updating
- Check that order_events are being created
- Verify the AnalyticsRefresher is running (check logs)
- Trigger a manual refresh via API

### Missing statistics
- Ensure migrations have been run
- Check that events have the correct event_type values
- Verify event_data JSON structure

### Performance issues
- Adjust refresh interval if needed (default: 3 minutes)
- Add database indexes on frequently queried columns
- Monitor batch size (default: 1000 events per refresh)

## Future Enhancements

- Add more analytics types (customer lifetime value, product performance, etc.)
- Implement real-time streaming for critical metrics
- Add alerting for anomalies in statistics
- Create dashboard UI for visualizing analytics
- Add export functionality for reports
