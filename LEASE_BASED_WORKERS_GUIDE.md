# Lease-Based Workers (Recoverable Jobs) - Implementation Guide

## Overview

This implementation adds a lease-based system for processing jobs that ensures jobs can be recovered if the bot crashes during processing. The key feature is that jobs are never duplicated, even if the worker crashes mid-execution.

## Key Features

1. **Atomic Lease Acquisition**: Jobs are acquired atomically using database transactions
2. **Automatic Recovery**: On startup, expired leases are automatically reset
3. **Retry Limits**: Jobs fail permanently after 3 attempts
4. **Lease Extension**: Long-running jobs can extend their leases automatically
5. **Graceful Shutdown**: Workers release leases on graceful shutdown
6. **No Duplication**: Same job never processed by multiple workers simultaneously

## Database Schema Changes

The migration adds the following columns to `processing_jobs` table:

```sql
- locked_by VARCHAR(100)      -- Worker/process that owns the lease
- locked_until TIMESTAMP       -- When the lease expires
- attempts INT DEFAULT 0       -- Number of retry attempts
- last_error TEXT             -- Last error message
```

And creates indexes:
```sql
- idx_processing_jobs_lease_acquisition (status, locked_until, created_at)
- idx_processing_jobs_locked_until (locked_until)
```

## Installation

### 1. Run the Migration

```bash
# Make sure your .env file has MySQL credentials configured
npx knex migrate:latest
```

The migration file is: `migrations/20260123210000_add_lease_columns_to_processing_jobs.js`

### 2. Verify Migration

Check that the new columns exist:

```sql
DESCRIBE processing_jobs;
```

You should see: `locked_by`, `locked_until`, `attempts`, `last_error`

## Usage

### Basic Worker Setup

```typescript
import { processingWorker } from './services/ProcessingWorker';

// Start the worker (will automatically reset expired leases)
await processingWorker.start();

// The worker will:
// 1. Reset any expired leases on startup
// 2. Poll for available jobs
// 3. Acquire leases atomically
// 4. Process jobs with automatic lease extension
// 5. Release leases on completion

// Graceful shutdown (press Ctrl+C or send SIGTERM)
// Worker will release all active leases before exiting
```

### Custom Worker Configuration

```typescript
import { ProcessingWorker } from './services/ProcessingWorker';

const worker = new ProcessingWorker({
    workerId: 'custom-worker-1',           // Unique worker ID
    leaseDurationSeconds: 600,              // 10 minutes
    pollIntervalMs: 10000,                  // Poll every 10 seconds
    maxConcurrentJobs: 3,                   // Process 3 jobs at a time
    leaseExtensionThresholdPercent: 50      // Extend at 50% of lease time
});

await worker.start();
```

### Implementing Custom Job Processing

Extend the `ProcessingWorker` class to implement your own job processing logic:

```typescript
import { ProcessingWorker } from './services/ProcessingWorker';
import { ProcessingJob } from '../repositories/ProcessingJobRepository';

class MyCustomWorker extends ProcessingWorker {
    protected async processJob(job: ProcessingJob): Promise<void> {
        const jobId = job.id!;
        
        try {
            console.log(`Processing job ${jobId}...`);
            
            // Your custom processing logic here
            await this.step1(job);
            await processingJobService.updateProgress(jobId, 33, 'Step 1 complete');
            
            await this.step2(job);
            await processingJobService.updateProgress(jobId, 66, 'Step 2 complete');
            
            await this.step3(job);
            await processingJobService.updateProgress(jobId, 100, 'All steps complete');
            
            // Mark as completed
            await processingJobService.releaseLease(jobId, this.workerId, 'done');
            
        } catch (error: any) {
            // Mark as failed or retry
            const shouldRetry = job.attempts && job.attempts < 3;
            await processingJobService.releaseLease(
                jobId,
                this.workerId,
                shouldRetry ? 'retry' : 'failed',
                error.message
            );
        }
    }
    
    private async step1(job: ProcessingJob) { /* ... */ }
    private async step2(job: ProcessingJob) { /* ... */ }
    private async step3(job: ProcessingJob) { /* ... */ }
}

// Use your custom worker
const myWorker = new MyCustomWorker({ 
    workerId: 'my-worker-1',
    leaseDurationSeconds: 300 
});
await myWorker.start();
```

### Manual Lease Management

If you need more control, use the repository methods directly:

```typescript
import { processingJobRepository } from './repositories/ProcessingJobRepository';

const workerId = 'my-worker-1';

// Acquire a lease
const job = await processingJobRepository.acquireLease(workerId, 300);
if (job) {
    console.log(`Acquired job ${job.id}`);
    
    try {
        // Process the job...
        
        // Extend lease if needed (for long-running jobs)
        await processingJobRepository.extendLease(job.id!, workerId, 300);
        
        // Release lease when done
        await processingJobRepository.releaseLease(job.id!, workerId, 'done');
        
    } catch (error) {
        // Release lease with error
        await processingJobRepository.releaseLease(
            job.id!, 
            workerId, 
            'retry', 
            error.message
        );
    }
}
```

## How It Works

### Lease Acquisition

When a worker wants to process a job, it executes this atomic update:

```sql
UPDATE processing_jobs 
SET locked_by = 'worker-123',
    locked_until = NOW() + INTERVAL 300 SECOND,
    status = 'processing',
    attempts = attempts + 1,
    updated_at = NOW()
WHERE id = (
    SELECT id FROM (
        SELECT id 
        FROM processing_jobs 
        WHERE status IN ('queued', 'pending')
        AND (locked_until IS NULL OR locked_until < NOW())
        AND attempts < 3
        ORDER BY created_at ASC
        LIMIT 1
    ) AS subquery
)
```

Only one worker can successfully acquire the lease due to MySQL's transaction isolation.

### Expired Lease Reset

On startup and periodically, workers reset expired leases:

```sql
UPDATE processing_jobs 
SET locked_by = NULL,
    locked_until = NULL,
    status = IF(attempts >= 3, 'failed', 'queued'),
    last_error = CONCAT(
        COALESCE(last_error, ''),
        IF(last_error IS NOT NULL, '; ', ''),
        'Lease expired - worker crashed or timed out'
    ),
    finished_at = IF(attempts >= 3, NOW(), finished_at),
    updated_at = NOW()
WHERE status = 'processing'
AND locked_until IS NOT NULL
AND locked_until < NOW()
```

## Testing

### Running the Test Suite

```bash
# Make sure MySQL is running and .env is configured
node test-lease-jobs.js
```

The test script will:
1. Run migrations
2. Verify lease columns exist
3. Create test jobs
4. Test lease acquisition
5. Test lease extension
6. Test lease release
7. Test expired lease reset
8. Test retry attempt limits
9. Clean up test data

### Manual Testing - Simulating a Crash

1. Start a worker:
```bash
node -e "require('./src/services/ProcessingWorker').processingWorker.start()"
```

2. Create a test job in the database:
```sql
INSERT INTO processing_jobs 
(job_id, order_id, job_type, status, progress, attempts, created_at)
VALUES ('test-crash-job', 'test-order-1', 'test', 'queued', 0, 0, NOW());
```

3. Watch the worker pick up the job (check logs)

4. Kill the worker process abruptly (Ctrl+C twice or kill -9)

5. Restart the worker:
```bash
node -e "require('./src/services/ProcessingWorker').processingWorker.start()"
```

6. Check logs - you should see:
   - "Reset N expired leases on startup"
   - The job being picked up again
   - Job processing resumes (or fails if max attempts reached)

7. Verify in database:
```sql
SELECT id, status, attempts, locked_by, locked_until, last_error 
FROM processing_jobs 
WHERE job_id = 'test-crash-job';
```

## Monitoring

### Check Active Leases

```typescript
import { processingJobService } from './services/ProcessingJobService';

// Get all jobs with active leases
const activeLeases = await processingJobService.getActiveLeases();
console.log('Active leases:', activeLeases.length);
activeLeases.forEach(job => {
    console.log(`Job ${job.id}: locked by ${job.locked_by} until ${job.locked_until}`);
});
```

### Check Expired Leases

```typescript
// Get jobs with expired leases (indicates potential issues)
const expiredLeases = await processingJobService.getExpiredLeases();
console.log('Expired leases:', expiredLeases.length);
```

### Worker Status

```typescript
import { processingWorker } from './services/ProcessingWorker';

const status = processingWorker.getStatus();
console.log('Worker status:', status);
// {
//   workerId: 'worker-hostname-12345',
//   isRunning: true,
//   activeJobs: 2,
//   maxConcurrentJobs: 1,
//   leaseDurationSeconds: 300,
//   activeJobIds: [123, 456]
// }
```

## Troubleshooting

### Jobs Stuck in "processing" Status

If jobs are stuck in "processing" status with expired leases:

```typescript
// Manually reset expired leases
const resetCount = await processingJobService.resetExpiredLeases();
console.log(`Reset ${resetCount} expired leases`);
```

Or via SQL:
```sql
-- See stuck jobs
SELECT id, job_id, status, attempts, locked_by, locked_until, last_error
FROM processing_jobs 
WHERE status = 'processing' 
AND locked_until < NOW();

-- Reset them manually
UPDATE processing_jobs 
SET locked_by = NULL,
    locked_until = NULL,
    status = 'queued',
    last_error = 'Manually reset'
WHERE status = 'processing' 
AND locked_until < NOW();
```

### Jobs Failing After 3 Attempts

Check the `last_error` column to see why jobs are failing:

```sql
SELECT id, job_id, attempts, last_error
FROM processing_jobs 
WHERE status = 'failed' 
AND attempts >= 3;
```

### Worker Not Picking Up Jobs

Check:
1. Worker is running: `processingWorker.getStatus()`
2. Jobs are in correct status: `SELECT * FROM processing_jobs WHERE status = 'queued'`
3. No lease lock issues: `SELECT * FROM processing_jobs WHERE locked_until > NOW()`
4. Database connection is working

## Configuration Best Practices

### Lease Duration

Choose lease duration based on expected job duration:
- Short jobs (< 1 min): 120 seconds (2 minutes)
- Medium jobs (1-5 min): 300 seconds (5 minutes)
- Long jobs (5-30 min): 600-1800 seconds (10-30 minutes)

Always set lease duration > expected job duration to avoid false timeouts.

### Lease Extension

Set `leaseExtensionThresholdPercent` to extend leases before they expire:
- For jobs with consistent duration: 50% (extend at halfway point)
- For jobs with variable duration: 75% (extend later, near expiration)

### Max Concurrent Jobs

Set based on:
- Available CPU/memory resources
- Database connection pool size
- I/O bottlenecks (disk, network)

Start with 1-3 concurrent jobs per worker and increase based on monitoring.

### Retry Attempts

The system is configured for 3 retry attempts by default. After 3 attempts:
- Job status changes to 'failed'
- Job is no longer picked up by workers
- Manual intervention may be required

## Integration with Existing Code

### Update Job Creation

When creating jobs, ensure they start with proper status:

```typescript
const jobId = await processingJobRepository.create({
    order_id: orderId,
    job_type: 'usb_processing',
    status: 'pending',  // or 'queued' - both work
    progress: 0,
    // ... other fields
});
```

### Monitoring Job Progress

```typescript
// Get job with logs
const job = await processingJobService.getJobById(jobId, true);
console.log('Job status:', job.status);
console.log('Attempts:', job.attempts);
console.log('Locked by:', job.locked_by);
console.log('Lease expires:', job.locked_until);
console.log('Recent logs:', job.logs);
```

## Security Considerations

1. **Worker ID Uniqueness**: Worker IDs should be unique per process to avoid conflicts
2. **Lease Duration**: Don't set too long (risk of stuck jobs) or too short (false timeouts)
3. **Database Transactions**: All lease operations use transactions for atomicity
4. **Error Handling**: Always release leases in error handlers to avoid deadlocks

## Performance Considerations

1. **Indexes**: The migration creates indexes on `(status, locked_until, created_at)` for efficient lease acquisition
2. **Polling Interval**: Don't poll too frequently (causes DB load) - 5-10 seconds is reasonable
3. **Connection Pooling**: Ensure MySQL connection pool is sized appropriately for number of workers
4. **Job Priority**: Jobs are processed in FIFO order by `created_at`

## Future Enhancements

Potential improvements for future versions:

1. **Job Priority Queues**: Add priority field for high-priority jobs
2. **Worker Pools**: Distribute work across multiple worker processes
3. **Dead Letter Queue**: Move permanently failed jobs to separate table
4. **Job Dependencies**: Support jobs that depend on other jobs completing
5. **Scheduled Jobs**: Add `scheduled_at` field for delayed job execution
6. **Job Metrics**: Track processing time, success rate, failure patterns

## API Reference

See the full API documentation in:
- `src/repositories/ProcessingJobRepository.ts` - Repository methods
- `src/services/ProcessingJobService.ts` - Service layer methods
- `src/services/ProcessingWorker.ts` - Worker implementation

## Support

For questions or issues:
1. Check the test suite: `test-lease-jobs.js`
2. Review the migration: `migrations/20260123210000_add_lease_columns_to_processing_jobs.js`
3. Check database logs for transaction conflicts or deadlocks
4. Review worker logs for lease acquisition/release events
