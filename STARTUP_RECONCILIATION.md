# Startup Reconciliation System

## Overview

The Startup Reconciliation system ensures that when the bot restarts after being down (e.g., 2 hours), all system state is properly recovered and updated from the database. This prevents issues like lost follow-ups, stuck jobs, or stale metrics.

## How It Works

The `StartupReconciler` service runs automatically during bot initialization, before the bot becomes ready to handle messages. It executes three main reconciliation tasks in order:

### 1. Repair Leases and Jobs

**Problem**: Workers may crash or the system may shut down while processing jobs, leaving jobs in an inconsistent state with expired leases.

**Solution**:
- **Reset Expired Leases**: Jobs with `locked_until < NOW()` have their leases cleared (`locked_by=NULL`, `locked_until=NULL`)
- **Requeue Orphaned Jobs**: Jobs in `processing` status without any lease are marked for retry or failed (based on attempt count)
- **Apply Retry Logic**: Jobs with `attempts < 3` are set to `retry` status, jobs with `attempts >= 3` are marked as `failed`

**Example**:
```typescript
// Before reconciliation
{
  id: 123,
  status: 'processing',
  locked_by: 'worker-abc',
  locked_until: '2024-01-24 10:00:00', // expired
  attempts: 1
}

// After reconciliation
{
  id: 123,
  status: 'retry', // or 'failed' if attempts >= 3
  locked_by: null,
  locked_until: null,
  attempts: 1,
  last_error: 'Lease expired - worker crashed or timed out'
}
```

### 2. Rehydrate Derived Queues

**Problem**: In-memory queues (like follow-up queue) are lost when the bot restarts, causing users to miss follow-ups.

**Solution**:
- **Follow-up Queue**: Rebuild from `user_sessions` table
  - Find users with `contact_status='ACTIVE'`
  - Clear expired cooldowns (`cooldown_until < NOW()`)
  - Count eligible candidates (`follow_up_attempts < 3`, not in cooldown)
  - Reset attempts for users whose cooldown expired

- **Pending Orders Queue**: Count from `orders` table
  - Query orders with `processing_status IN ('pending', 'processing')`
  - Provide accurate count for dashboard and processing endpoints

**Example**:
```sql
-- Clear expired cooldowns
UPDATE user_sessions 
SET cooldown_until = NULL, follow_up_attempts = 0
WHERE cooldown_until < NOW() AND cooldown_until IS NOT NULL;

-- Count follow-up candidates
SELECT COUNT(*) FROM user_sessions 
WHERE contact_status = 'ACTIVE'
  AND (cooldown_until IS NULL OR cooldown_until < NOW())
  AND follow_up_attempts < 3
  AND last_activity >= DATE_SUB(NOW(), INTERVAL 365 DAY);
```

### 3. Verify Metrics

**Problem**: Cached or stale metrics may show incorrect dashboard data after restart.

**Solution**:
- Query fresh statistics from database:
  - Processing jobs statistics (by status, avg duration)
  - Orders statistics (total, by status, revenue)
- Verify database connectivity
- Ensure all endpoints query MySQL directly (no stale cache)

## Integration

The reconciler is integrated into the app initialization process in `src/app.ts`:

```typescript
async function initializeApp() {
  // ... database connection and validation ...
  
  // Run startup reconciliation before bot is ready
  console.log('🔄 Running startup reconciliation...');
  const reconciliationResult = await startupReconciler.reconcile();
  
  if (!reconciliationResult.success) {
    console.warn('⚠️  Startup reconciliation completed with errors:', 
                 reconciliationResult.errors);
  }
  
  console.log('✅ Inicialización completada exitosamente');
}
```

## Monitoring

### Reconciliation Status Endpoint

**GET** `/v1/reconciliation/status`

Returns the results of the last reconciliation execution:

```json
{
  "status": "success",
  "timestamp": "2024-01-24T13:30:00.000Z",
  "results": {
    "leasesRepaired": 5,
    "jobsRequeued": 2,
    "followUpCandidates": 127,
    "pendingOrders": 15
  },
  "errors": [],
  "uptime": 3600
}
```

### Logs

Reconciliation results are logged to the `processing_job_logs` table with:
- `job_id = 0` (system-level log)
- `category = 'startup_reconciliation'`
- `level = 'info'` or `'warning'` (if errors occurred)
- `details` = JSON with full reconciliation results

Example query:
```sql
SELECT * FROM processing_job_logs 
WHERE category = 'startup_reconciliation' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Testing

### Automated Tests

Run the test suite:
```bash
tsx src/tests/startupReconciler.test.ts
```

Tests verify:
- ✅ Reconciler instantiation
- ✅ Database connectivity for all tables
- ✅ Reconciliation execution without errors
- ✅ Result structure and data types
- ✅ Expired lease handling

### Manual Validation

Run the validation script to test with real scenarios:
```bash
node validate-startup-reconciliation.js
```

This script:
1. Creates test scenarios (expired leases, orphaned jobs, expired cooldowns)
2. Runs reconciliation
3. Verifies results
4. Cleans up test data

### Manual Testing Steps

1. **Start the bot**:
   ```bash
   npm start
   ```

2. **Verify reconciliation ran**:
   Check logs for:
   ```
   🔄 Starting startup reconciliation...
   ✅ Startup reconciliation completed in XXXms
   ```

3. **Check reconciliation status**:
   ```bash
   curl http://localhost:3006/v1/reconciliation/status
   ```

4. **Verify dashboard shows real data**:
   ```bash
   curl http://localhost:3006/api/admin/dashboard
   ```

5. **Verify processing queue is correct**:
   ```bash
   curl http://localhost:3006/v1/processing/queue
   ```

## Acceptance Criteria

✅ **Criterion 1**: After restarting the bot, `/api/admin/dashboard` reflects real data immediately
- Dashboard queries fresh data from MySQL (orders, jobs, analytics)
- No stale cached data

✅ **Criterion 2**: `/v1/processing/queue` shows the correct queue
- Expired leases are freed
- Orphaned jobs are requeued
- Queue count matches database state

✅ **Criterion 3**: Follow-ups don't "lose" users due to shutdown
- Follow-up candidates are recalculated from user_sessions
- Expired cooldowns are cleared
- Users eligible for follow-ups are properly identified

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Bot Startup                          │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              initializeApp()                            │
│  1. Database connection                                 │
│  2. Schema validation                                   │
│  3. Message deduplication init                          │
│  4. ⭐ Startup Reconciliation ⭐                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│         StartupReconciler.reconcile()                   │
│                                                         │
│  ┌───────────────────────────────────────────────┐     │
│  │ Step 1: Repair Leases/Jobs                    │     │
│  │  - processingJobRepository.resetExpiredLeases()│     │
│  │  - Query orphaned jobs                         │     │
│  │  - Apply retry logic                           │     │
│  └───────────────────────────────────────────────┘     │
│                      │                                  │
│                      ▼                                  │
│  ┌───────────────────────────────────────────────┐     │
│  │ Step 2: Rehydrate Queues                      │     │
│  │  - Count follow-up candidates                 │     │
│  │  - Clear expired cooldowns                    │     │
│  │  - Count pending orders                       │     │
│  └───────────────────────────────────────────────┘     │
│                      │                                  │
│                      ▼                                  │
│  ┌───────────────────────────────────────────────┐     │
│  │ Step 3: Verify Metrics                        │     │
│  │  - Query job statistics                       │     │
│  │  - Query order statistics                     │     │
│  │  - Verify DB connection                       │     │
│  └───────────────────────────────────────────────┘     │
│                      │                                  │
│                      ▼                                  │
│  ┌───────────────────────────────────────────────┐     │
│  │ Log Results                                    │     │
│  │  - Insert into processing_job_logs             │     │
│  │  - Return ReconciliationResult                 │     │
│  └───────────────────────────────────────────────┘     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Bot Ready to Handle Messages               │
└─────────────────────────────────────────────────────────┘
```

## Configuration

No configuration needed - the reconciler runs automatically on every bot startup.

### Constants

Defined in the code:
- **Max Retry Attempts**: 3 (jobs marked as failed after 3 attempts)
- **Stale Contact Threshold**: 365 days (contacts inactive for over 1 year are excluded)
- **Lease Reconciliation**: Happens on every startup

## Dependencies

- `ProcessingJobRepository`: For job lease operations
- `OrderRepository`: For order statistics
- `pool` (MySQL connection): For user_sessions queries
- `logger`: For structured logging

## Files

- `src/services/StartupReconciler.ts` - Main reconciliation service
- `src/app.ts` - Integration point (initializeApp function)
- `src/tests/startupReconciler.test.ts` - Automated tests
- `validate-startup-reconciliation.js` - Manual validation script

## Troubleshooting

### Issue: Reconciliation not running

**Check**:
1. Look for reconciliation log messages on startup
2. Check `/v1/reconciliation/status` endpoint
3. Verify database connection is successful before reconciliation

### Issue: Expired leases not being reset

**Check**:
1. Verify `locked_until` column exists in `processing_jobs` table
2. Run migration: `npm run migrate`
3. Check `processing_job_logs` for reconciliation errors

### Issue: Follow-ups still missing users

**Check**:
1. Verify user_sessions table has follow-up columns
2. Check user `contact_status` is 'ACTIVE'
3. Verify cooldowns are being cleared correctly
4. Check follow-up service is starting after reconciliation

## Performance

- **Execution Time**: Typically 100-500ms depending on database size
- **Database Queries**: ~5-8 queries total
- **Impact**: Minimal - runs once on startup, blocks initialization only
- **Scalability**: Queries are optimized with appropriate indexes

## Future Enhancements

Potential improvements:
- [ ] Add reconciliation interval option (e.g., every 6 hours)
- [ ] Add webhook/notification on reconciliation failures
- [ ] Add detailed reconciliation report endpoint with history
- [ ] Add dry-run mode for testing without making changes
- [ ] Add reconciliation metrics to Prometheus/Grafana
