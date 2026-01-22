# Database Migration System - Consolidated

## Overview
This project uses **Knex.js migrations** as the single source of truth for database schema changes.

## Migration System

### Active System: Knex Migrations (JavaScript)
- **Location**: `/migrations/*.js`
- **Configuration**: `knexfile.js`
- **Commands**:
  - Run all pending migrations: `pnpm run migrate`
  - Rollback last batch: `pnpm run migrate:rollback`
  - Check migration status: `pnpm run migrate:status`

### Deprecated: TypeScript Runtime Migrations
- **Location**: `src/database/migrations/*.ts` (DEPRECATED)
- **Status**: These have been consolidated into proper Knex migrations
- **Migration mapping**:
  - `add-followup-columns.ts` → `20260122000001_add_user_sessions_followup_columns.js`
  - `ensure-all-columns.ts` → `20260122000002_add_orders_processing_columns.js`

## Schema Consolidation (January 2026)

### What Changed
1. **Unified Migration System**: All schema changes now use Knex migrations exclusively
2. **Runtime Migrations Removed**: The TypeScript runtime migrations have been removed from `mysql-database.ts`
3. **New Migrations Added**:
   - `20260122000000_consolidate_schema_and_indices.js` - Ensures all required columns and indices
   - `20260122000001_add_user_sessions_followup_columns.js` - Follow-up tracking columns
   - `20260122000002_add_orders_processing_columns.js` - Additional order/job columns

### Required Columns (All Nullable)
Orders table now includes:
- `notes` - Customer notes
- `admin_notes` - Admin notes (JSON)
- `completed_at` - Completion timestamp
- `confirmed_at` - Confirmation timestamp
- `total_amount` - Total order amount
- `discount_amount` - Discount applied
- `shipping_address` - Delivery address
- `shipping_phone` - Delivery contact

### Indices Added
For better query performance:
- `orders(phone_number)` - Customer phone lookups
- `orders(processing_status)` - Status filtering
- `order_events(order_number, created_at)` - Event queries

## Running Migrations

### Initial Setup
```bash
# Ensure MySQL is running and configured in .env
# See .env.example for required variables

# Run all migrations
pnpm run migrate
```

### Development Workflow
```bash
# Check current migration status
pnpm run migrate:status

# Run pending migrations
pnpm run migrate

# Rollback last batch (if needed)
pnpm run migrate:rollback
```

### Creating New Migrations
```bash
# Create a new migration file
npx knex migrate:make migration_name --knexfile knexfile.js
```

**Naming Convention**: `YYYYMMDDHHMMSS_description.js`
- Example: `20260122000000_add_user_column.js`

## Best Practices

1. **Use Knex Only**: Never add columns via runtime SQL in application code
2. **Idempotent Migrations**: Always check if columns/tables exist before adding
3. **Nullable Columns**: Make new columns nullable to avoid breaking existing data
4. **Test Locally**: Run migrations on a test database before production
5. **No Force Push**: Migrations use regular git push (force push not available)

## Troubleshooting

### "Optional columns missing" Warning
**Solution**: Run `pnpm run migrate` to apply all pending migrations

### Migration Fails with "Column already exists"
**Solution**: The migration is idempotent and should check for existence. If it fails, check the migration file.

### Table doesn't exist
**Solution**: Ensure you've run all migrations in order: `pnpm run migrate`

## Migration History

### Phase 1: Initial Schema (2024-08)
- `20240810000000_create_tables.js` - Base tables

### Phase 2: Customer Management (2024-12)
- `20241217000000_add_customers_and_validation.js` - Customer tracking
- `20241217000001_create_usb_orders.js` - Web orders
- `20241217000002_create_processing_job_logs.js` - Job logging
- `20241217000003_create_order_events.js` - Event auditing
- `20241218000000_add_status_column_to_orders.js` - Status field

### Phase 3: Order Enhancement (2025-01)
- `20250119000000_add_missing_order_columns.js` - Shipping & pricing
- `20250119000001_create_panel_settings.js` - Admin settings

### Phase 4: Notes & Admin (2026-01)
- `20260120000000_ensure_orders_notes_columns.js` - Notes fields

### Phase 5: Consolidation (2026-01)
- `20260122000000_consolidate_schema_and_indices.js` - Complete schema validation
- `20260122000001_add_user_sessions_followup_columns.js` - Follow-up tracking
- `20260122000002_add_orders_processing_columns.js` - Processing columns

## Support

For migration issues, check:
1. Database connection in `.env`
2. MySQL version compatibility (8.0+)
3. Migration status: `pnpm run migrate:status`
4. Knex configuration: `knexfile.js`
