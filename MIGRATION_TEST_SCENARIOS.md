# Migration Consolidation - Test Scenarios

## Overview
This document outlines test scenarios to verify the database migration consolidation is working correctly.

## Prerequisites
1. MySQL 8.0+ running
2. Database configured in `.env`
3. All dependencies installed: `pnpm install`

## Test Scenario 1: Fresh Database Migration

**Objective**: Verify that all migrations run successfully on a fresh database.

**Steps**:
1. Create a fresh database:
   ```sql
   CREATE DATABASE techaura_bot_test;
   ```

2. Configure `.env` to point to test database:
   ```
   MYSQL_DB_NAME=techaura_bot_test
   ```

3. Run migrations:
   ```bash
   pnpm run migrate
   ```

**Expected Result**:
- All migrations complete without errors
- Migration status shows all migrations applied:
  ```bash
  pnpm run migrate:status
  ```
- Orders table includes all required columns:
  - notes (TEXT)
  - admin_notes (JSON)
  - completed_at (TIMESTAMP)
  - confirmed_at (TIMESTAMP)
  - total_amount (DECIMAL)
  - discount_amount (DECIMAL)
  - shipping_address (TEXT)
  - shipping_phone (VARCHAR)

## Test Scenario 2: Application Startup (No Runtime Schema Warnings)

**Objective**: Verify application starts without "Optional columns missing" warnings.

**Steps**:
1. Start the development server:
   ```bash
   pnpm run dev
   ```

2. Watch console output during startup

**Expected Result**:
- ✅ No "Optional columns missing" warnings
- ✅ No "CRITICAL: Missing required columns" errors
- ✅ Message: "Database schema is valid"
- ✅ No runtime migration execution

**What NOT to see**:
- ❌ "Optional columns missing: notes, admin_notes..."
- ❌ "Adding follow-up columns to user_sessions..."
- ❌ "Verificando columnas de base de datos..."

## Test Scenario 3: Verify Indices Created

**Objective**: Confirm all required indices exist for query performance.

**Steps**:
1. Connect to MySQL:
   ```bash
   mysql -u techaura_bot -p techaura_bot
   ```

2. Check indices on orders table:
   ```sql
   SHOW INDEX FROM orders WHERE Key_name IN (
     'orders_phone_number_index',
     'orders_processing_status_index'
   );
   ```

3. Check indices on order_events table:
   ```sql
   SHOW INDEX FROM order_events WHERE Key_name = 'order_events_order_number_created_at_index';
   ```

**Expected Result**:
- orders_phone_number_index exists on phone_number column
- orders_processing_status_index exists on processing_status column
- order_events_order_number_created_at_index exists as composite index

## Test Scenario 4: Order Creation (Data Persistence)

**Objective**: Verify POST /api/orders persists data correctly including nullable fields.

**Steps**:
1. Start the application:
   ```bash
   pnpm run dev
   ```

2. Create an order with all fields via API or UI

3. Verify in database:
   ```sql
   SELECT 
     order_number,
     notes,
     admin_notes,
     confirmed_at,
     completed_at,
     total_amount,
     discount_amount,
     shipping_address,
     shipping_phone
   FROM orders 
   WHERE order_number = 'TEST-001';
   ```

**Expected Result**:
- Order record exists with all nullable fields
- No SQL errors about missing columns
- Data persisted correctly

## Test Scenario 5: Existing Database (Idempotent Migrations)

**Objective**: Verify migrations are safe to run on existing database with some columns already present.

**Steps**:
1. Use database that already has some but not all columns

2. Run migrations:
   ```bash
   pnpm run migrate
   ```

3. Check logs for idempotent behavior

**Expected Result**:
- Migrations complete successfully
- Log messages like:
  - "✅ Added notes column" (for missing columns)
  - "ℹ️ Index on orders(phone_number) already exists" (for existing items)
- No duplicate column errors
- No constraint conflicts

## Test Scenario 6: Migration Rollback

**Objective**: Verify rollback functionality works correctly.

**Steps**:
1. Note current migration batch:
   ```bash
   pnpm run migrate:status
   ```

2. Rollback last batch:
   ```bash
   pnpm run migrate:rollback
   ```

3. Re-run migrations:
   ```bash
   pnpm run migrate
   ```

**Expected Result**:
- Rollback completes without errors
- Re-running migrations brings database back to current state
- Application works after re-migration

## Test Scenario 7: User Sessions Follow-up Columns

**Objective**: Verify user_sessions table has follow-up tracking columns.

**Steps**:
1. Check user_sessions schema:
   ```sql
   DESCRIBE user_sessions;
   ```

2. Look for follow-up columns:
   - contact_status
   - last_user_reply_at
   - last_user_reply_category
   - follow_up_count_24h
   - follow_up_attempts
   - cooldown_until

**Expected Result**:
- All follow-up columns exist
- Indices exist on key columns
- Default values are appropriate

## Troubleshooting

### Issue: "Optional columns missing" still appears

**Solution**:
```bash
# Check migration status
pnpm run migrate:status

# If pending migrations exist, run them
pnpm run migrate

# Restart the application
pnpm run dev
```

### Issue: "Duplicate column name" error

**Cause**: Migration tried to add column that already exists
**Solution**: This shouldn't happen with our idempotent migrations, but if it does:
```bash
# Check which migrations ran
pnpm run migrate:status

# Rollback if needed
pnpm run migrate:rollback

# Re-run
pnpm run migrate
```

### Issue: Index creation fails

**Cause**: Index might already exist with different name
**Solution**:
```sql
-- Check existing indices
SHOW INDEX FROM orders;

-- If duplicate, drop old index
ALTER TABLE orders DROP INDEX old_index_name;

-- Re-run migration
```

## Success Criteria Summary

✅ All migrations run without errors
✅ No runtime schema warnings on app startup
✅ All required columns exist in orders table
✅ All required indices exist for performance
✅ Order creation persists data correctly
✅ Migrations are idempotent (safe to re-run)
✅ No runtime migration code executed in mysql-database.ts

## Related Documentation
- See `MIGRATIONS.md` for complete migration documentation
- See `verify-migration-consolidation.sh` for automated verification
