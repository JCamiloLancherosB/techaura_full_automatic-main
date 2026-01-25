# PR-FIX-1: Database Schema Missing Tables/Columns

## Summary

This PR is the "surgical patch" to fix database schema issues that were causing the system to fail at startup with errors about missing columns and tables.

## Problem

The system was failing to start with errors such as:
- `unknown column locked_until`
- `unknown column contact_status`
- `no such table processing_job_logs`
- `no such table analytics_watermarks`
- `no such table sync_runs`
- `no such table conversation_analysis`

## Solution

Created a comprehensive migration (`20260125120000_fix_missing_schema_fields.js`) that adds all missing schema elements without breaking existing data.

### Changes Made

#### A) `processing_jobs` Table
**Already existed via previous migrations, added:**
- ✅ `locked_by` VARCHAR(100) NULL - Worker/process owning the lease (migration 20260123210000)
- ✅ `locked_until` TIMESTAMP NULL - Lease expiration time (migration 20260123210000)
- ✅ `attempts` INT DEFAULT 0 - Retry attempt count (migration 20260123210000)
- ✅ `last_error` TEXT NULL - Last error message (migration 20260123210000)
- ✅ `finished_at` DATETIME NULL - Job completion time (THIS PR)
- ✅ Indexes: `(status, locked_until)`, `(created_at)` (migration 20260123210000)

#### B) `processing_job_logs` Table
**Already existed via migration 20241217000002:**
- ✅ Full table with all required fields
- ✅ Fields: id, job_id, level, category, message, details, created_at

#### C) `user_sessions` Table
**Already existed, updated:**
- ✅ `contact_status` ENUM - Updated to include BLOCKED and PAUSED (THIS PR)
  - Original: `ENUM('ACTIVE', 'OPT_OUT', 'CLOSED')`
  - Updated: `ENUM('ACTIVE', 'BLOCKED', 'PAUSED', 'OPT_OUT', 'CLOSED')`
- ✅ `cooldown_until` DATETIME NULL (migration 20260122000001)
- ✅ `follow_up_attempts` INT DEFAULT 0 (migration 20260122000001)
- ✅ `last_activity` DATETIME NULL (migration 20260122000001)
- ✅ Indexes: `(contact_status)`, `(cooldown_until)`, `(last_activity)` (THIS PR ensures all exist)

#### D) `analytics_watermarks` Table
**Already existed via migration 20260124000000:**
- ✅ Full table with all required fields
- ✅ Fields: id, name, last_event_id, last_processed_at, updated_at

#### E) `sync_runs` Table
**Already existed via migration 20260124120000, added:**
- ✅ `cursor` JSON NULL - Incremental sync cursor (THIS PR)
- ✅ Original table has: id, source_type, source_identifier, status, started_at, completed_at, sync_metadata, created_at, updated_at

#### F) `conversation_analysis` Table
**Already existed via migration 20260125000000, added:**
- ✅ `result_json` JSON NULL - Full analysis result (THIS PR)
- ✅ `finished_at` DATETIME NULL - Analysis completion time (THIS PR)
- ✅ Original table has: id, phone, status, summary, intent, objections, purchase_probability, etc.

## Migration Details

### Migration File
`migrations/20260125120000_fix_missing_schema_fields.js`

### Safety Features
1. **Idempotent**: Checks if columns/indexes exist before adding
2. **Backward Compatible**: All new columns are nullable
3. **No Data Loss**: Uses ALTER TABLE instead of DROP/CREATE
4. **Safe Rollback**: Checks existence before dropping in down()
5. **Proper Error Handling**: Uses IF NOT EXISTS for indexes

### Testing

Run the verification script:
```bash
./verify-pr-fix-1.sh
```

Expected output: All checks pass ✅

## Acceptance Criteria Met

✅ Clean startup without errors:
- ✅ No "unknown column locked_until/contact_status"
- ✅ No "no such table processing_job_logs"
- ✅ No "no such table analytics_watermarks"
- ✅ No "no such table sync_runs"
- ✅ No "no such table conversation_analysis"

## How to Deploy

1. **Backup Database** (recommended):
   ```bash
   mysqldump -u user -p database > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Run Migrations**:
   ```bash
   npm run migrate
   ```

3. **Verify Migration**:
   ```bash
   npm run migrate:status
   ```

4. **Start Application**:
   ```bash
   npm start
   ```

## Rollback Plan

If issues occur:
```bash
npm run migrate:rollback
```

This will revert the migration, removing added columns and reverting enum changes.

## Security Summary

- ✅ CodeQL scan passed with 0 alerts
- ✅ No SQL injection vulnerabilities
- ✅ No sensitive data exposure
- ✅ All migrations use parameterized queries via Knex

## Files Changed

- `migrations/20260125120000_fix_missing_schema_fields.js` (NEW)
- `verify-pr-fix-1.sh` (NEW)

## Related Issues

Fixes: PR-FIX-1 - DB schema missing tables/columns (leases, logs, watermarks, sync, analysis)

## Notes

- This is a **surgical patch** - only adds what's missing
- Does not modify existing working code
- Does not remove or alter existing data
- All previous migrations remain intact and functional
