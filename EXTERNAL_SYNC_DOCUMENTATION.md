# External Source Sync Implementation (PR-F3)

## Overview

This implementation provides a robust system for synchronizing external data sources (CSV files, REST APIs, Google Drive, USB inventories, etc.) to MySQL database with comprehensive tracking, error handling, and automatic recovery.

## Features

### 1. Multiple Source Types Supported
- **CSV Files**: Sync data from CSV files with configurable column mapping
- **REST APIs**: Sync from any REST API with support for pagination and authentication
- **Extensible**: Easy to add new source types (Drive, USB inventory, etc.)

### 2. Comprehensive Tracking
- **Sync Runs**: Track every sync operation with status, timestamps, and statistics
- **Error Logging**: Detailed error tracking with categorization and retry capabilities
- **Content Index**: Maintain a searchable index of all synced content

### 3. Automatic Recovery
- **Resume on Startup**: Automatically resumes pending syncs when bot restarts
- **Retry Failed Syncs**: Automatically retries failed syncs with retryable errors
- **Consistent State**: Ensures catalog_items and content_index remain consistent even after failures

### 4. Scheduled Syncs
- **Daily Sync**: Automatically checks for sync operations daily at 3:00 AM
- **Manual Trigger**: API endpoints for triggering syncs on demand
- **Flexible Scheduling**: Easy to customize sync frequency

## Database Schema

### `sync_runs` Table
Tracks all sync operations:
- `id`: Primary key
- `source_type`: Type of source (csv, api, drive, usb)
- `source_identifier`: Path/URL to the source
- `status`: pending, in_progress, completed, failed, cancelled
- `items_processed/failed/skipped`: Statistics
- `started_at/completed_at`: Timestamps
- `sync_metadata`: Additional metadata (JSON)
- `error_message`: Error details if failed

### `sync_errors` Table
Logs errors during sync operations:
- `id`: Primary key
- `sync_run_id`: Reference to sync_runs
- `error_type`: Type of error (validation, network, parsing, etc.)
- `error_code`: Specific error code
- `error_message`: Human-readable error
- `item_identifier`: Identifier of failed item
- `is_retryable`: Whether error can be retried

### `content_index` Table
Index of content from external sources:
- `id`: Primary key
- `content_type`: music, video, movie, game
- `title`: Content title
- `artist`: Artist/author/director
- `genre`: Genre/category
- `source_type/source_identifier`: Source information
- `external_id`: ID from external source
- `is_available`: Availability flag
- `last_synced_at`: Last sync timestamp

## API Endpoints

### GET /v1/sync/stats
Get sync statistics across all source types.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 50,
    "pending": 2,
    "in_progress": 1,
    "completed": 45,
    "failed": 2,
    "cancelled": 0
  },
  "timestamp": "2026-01-24T14:30:00.000Z"
}
```

### GET /v1/sync/:syncRunId
Get status of a specific sync run.

**Response:**
```json
{
  "success": true,
  "data": {
    "syncRunId": 123,
    "status": "completed",
    "itemsProcessed": 1500,
    "itemsFailed": 5,
    "itemsSkipped": 10,
    "errors": [
      {
        "type": "parsing",
        "message": "Invalid row format at line 42"
      }
    ]
  },
  "timestamp": "2026-01-24T14:30:00.000Z"
}
```

### POST /v1/sync/trigger
Trigger a manual sync operation.

**Request Body:**
```json
{
  "sourceType": "csv",
  "sourceIdentifier": "/path/to/music_catalog.csv",
  "options": {
    "targetTable": "content_index",
    "contentType": "music",
    "hasHeader": true,
    "columnMapping": {
      "title": "song_name",
      "artist": "artist_name",
      "genre": "music_genre"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "syncRunId": 124
  },
  "message": "Sync scheduled successfully",
  "timestamp": "2026-01-24T14:30:00.000Z"
}
```

### POST /v1/sync/resume
Resume all pending sync operations.

**Response:**
```json
{
  "success": true,
  "message": "Pending syncs resumed",
  "timestamp": "2026-01-24T14:30:00.000Z"
}
```

## Usage Examples

### Example 1: Sync Music Catalog from CSV

**CSV File Format** (`music_catalog.csv`):
```csv
song_name,artist_name,music_genre,album
Despacito,Luis Fonsi,Reggaeton,Vida
Shape of You,Ed Sheeran,Pop,Divide
Bohemian Rhapsody,Queen,Rock,A Night at the Opera
```

**API Request:**
```bash
curl -X POST http://localhost:3006/v1/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "sourceType": "csv",
    "sourceIdentifier": "/data/music_catalog.csv",
    "options": {
      "targetTable": "content_index",
      "contentType": "music",
      "hasHeader": true,
      "delimiter": ",",
      "columnMapping": {
        "title": "song_name",
        "artist": "artist_name",
        "genre": "music_genre"
      }
    }
  }'
```

### Example 2: Sync from REST API

**API Request:**
```bash
curl -X POST http://localhost:3006/v1/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "sourceType": "api",
    "sourceIdentifier": "https://api.example.com/music/catalog",
    "options": {
      "method": "GET",
      "auth": {
        "type": "bearer",
        "token": "your-api-token"
      },
      "dataPath": "data.items",
      "contentType": "music",
      "fieldMapping": {
        "title": "name",
        "artist": "artist.name",
        "genre": "category",
        "external_id": "id"
      },
      "pagination": {
        "enabled": true,
        "type": "page",
        "limitParam": "limit",
        "pageParam": "page",
        "maxPages": 50
      }
    }
  }'
```

### Example 3: Sync Catalog Pricing from CSV

**CSV File Format** (`catalog_pricing.csv`):
```csv
category_id,capacity,capacity_gb,price,content_count,content_unit,is_active,is_popular
music,8GB,8,54900,1400,canciones,true,false
music,32GB,32,84900,5000,canciones,true,true
music,64GB,64,119900,10000,canciones,true,false
```

**API Request:**
```bash
curl -X POST http://localhost:3006/v1/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "sourceType": "csv",
    "sourceIdentifier": "/data/catalog_pricing.csv",
    "options": {
      "targetTable": "catalog_items",
      "hasHeader": true
    }
  }'
```

## Programmatic Usage

### Schedule a Sync from Code

```typescript
import { syncService } from './services/sync/SyncService';

// Schedule a CSV sync
const syncRunId = await syncService.scheduleSync({
  sourceType: 'csv',
  sourceIdentifier: '/data/music_catalog.csv',
  options: {
    targetTable: 'content_index',
    contentType: 'music',
    hasHeader: true,
    columnMapping: {
      title: 'song_name',
      artist: 'artist_name',
      genre: 'music_genre'
    }
  }
});

console.log(`Sync scheduled with ID: ${syncRunId}`);

// Execute immediately
const result = await syncService.executeSync(syncRunId);
console.log(`Sync completed: ${result.itemsProcessed} items processed`);
```

### Schedule and Execute in One Call

```typescript
import { syncService } from './services/sync/SyncService';

const result = await syncService.sync({
  sourceType: 'api',
  sourceIdentifier: 'https://api.example.com/music',
  options: {
    auth: { type: 'bearer', token: 'your-token' },
    contentType: 'music'
  }
});

if (result.success) {
  console.log(`Synced ${result.itemsProcessed} items`);
} else {
  console.error(`Sync failed with ${result.itemsFailed} errors`);
}
```

## Configuration

### Environment Variables

No additional environment variables are required. The sync service uses the existing MySQL database connection.

### Scheduled Jobs

The sync service includes two scheduled jobs:

1. **Daily Sync Check** (3:00 AM): Retries failed syncs with retryable errors
2. **Startup Resume**: Automatically resumes pending syncs when bot restarts

To customize the schedule, modify the cron expression in `src/app.ts`:

```typescript
// Change from daily at 3:00 AM to every 6 hours
cron.schedule('0 */6 * * *', async () => {
  await syncService.retryFailedSyncs();
});
```

## Error Handling

### Retryable Errors
These errors will be automatically retried:
- Network errors (timeouts, connection failures)
- Temporary API errors (503, 429)
- System errors (transient database issues)

### Non-Retryable Errors
These errors require manual intervention:
- Validation errors (invalid data format)
- Authentication errors (invalid credentials)
- Parsing errors (malformed CSV/JSON)

### Error Investigation

Check sync errors for a specific run:
```bash
curl http://localhost:3006/v1/sync/123
```

View error details in the database:
```sql
SELECT * FROM sync_errors WHERE sync_run_id = 123;
```

## Performance Considerations

### Batch Processing
The CSV adapter processes files sequentially. For large files (>10K rows), consider:
- Breaking into smaller files
- Using the API adapter with pagination instead

### Database Load
Content upsert operations check for existing items before inserting. For high-volume syncs:
- Run during off-peak hours (scheduled at 3:00 AM by default)
- Monitor database performance during sync

### Memory Usage
Large API responses are processed in chunks using pagination. Configure appropriate pagination limits:
```json
{
  "pagination": {
    "enabled": true,
    "limitParam": "limit",
    "maxPages": 100
  }
}
```

## Extending the System

### Adding New Source Types

To add a new source type (e.g., Google Drive):

1. Create adapter class:
```typescript
// src/services/sync/DriveSourceAdapter.ts
import { ExternalSourceAdapter, SyncResult } from './ExternalSourceAdapter';

export class DriveSourceAdapter extends ExternalSourceAdapter {
  async validate() {
    // Validate Drive credentials and file access
  }
  
  async sync(): Promise<SyncResult> {
    // Implement Drive sync logic
  }
  
  async testConnection(): Promise<boolean> {
    // Test Drive API connection
  }
}
```

2. Register in SyncService:
```typescript
// src/services/sync/SyncService.ts
private createAdapter(config: SourceConfig): IExternalSourceAdapter {
  switch (config.sourceType) {
    case 'csv':
      return new CSVSourceAdapter(config as any);
    case 'api':
      return new APISourceAdapter(config as any);
    case 'drive':
      return new DriveSourceAdapter(config as any);
    default:
      throw new Error(`Unsupported source type: ${config.sourceType}`);
  }
}
```

## Monitoring and Maintenance

### Check Sync Health
```bash
# Get overall sync statistics
curl http://localhost:3006/v1/sync/stats

# Check recent sync runs
mysql> SELECT * FROM sync_runs ORDER BY created_at DESC LIMIT 10;

# Check error rates
mysql> SELECT 
  error_type, 
  COUNT(*) as count 
FROM sync_errors 
WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY error_type;
```

### Cleanup Old Data
The system includes automatic cleanup for old completed syncs (default: 30 days):
```typescript
await syncService.cleanup(30); // Keep last 30 days
```

### Content Index Maintenance
Clean up stale content not synced recently:
```typescript
import { contentIndexRepository } from './repositories/ContentIndexRepository';

// Remove content not synced in 90 days
await contentIndexRepository.cleanupOld(90);
```

## Troubleshooting

### Sync Stuck in "in_progress" State
If bot crashes during sync, the run may remain in "in_progress":
```sql
-- Manually mark as failed to allow retry
UPDATE sync_runs 
SET status = 'failed', 
    error_message = 'Interrupted by system restart',
    completed_at = NOW()
WHERE status = 'in_progress' 
  AND started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);
```

Then resume pending syncs:
```bash
curl -X POST http://localhost:3006/v1/sync/resume
```

### CSV Parsing Errors
Check CSV file format:
- Ensure proper delimiter (default: comma)
- Check for quotes in text fields
- Verify header row matches column mapping

### API Connection Failures
Verify:
- API URL is accessible
- Authentication credentials are valid
- Rate limits are not exceeded
- Network connectivity is stable

## Security Considerations

### Credential Management
- Store API keys in environment variables
- Use secure methods for file access
- Implement proper authentication for sync endpoints

### Data Validation
- All synced data is validated before insertion
- Malformed data is logged but doesn't stop sync
- SQL injection prevention through parameterized queries

### Access Control
Consider adding authentication to sync endpoints in production:
```typescript
adapterProvider.server.post('/v1/sync/trigger', 
  authenticateAdmin, // Add middleware
  handleCtx(async (bot, req, res) => {
    // ... sync logic
  })
);
```

## Future Enhancements

Planned improvements:
- [ ] Google Drive adapter implementation
- [ ] USB inventory monitoring
- [ ] Real-time sync notifications
- [ ] Sync scheduling UI in admin panel
- [ ] Webhook support for external triggers
- [ ] Incremental sync support
- [ ] Sync preview/dry-run mode
- [ ] Advanced conflict resolution
