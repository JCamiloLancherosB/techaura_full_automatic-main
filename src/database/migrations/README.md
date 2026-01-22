# DEPRECATED - TypeScript Runtime Migrations

⚠️ **This directory is DEPRECATED and should not be used for new migrations.**

## Status
These runtime migrations have been consolidated into proper Knex migrations in `/migrations/*.js`.

## Migration Mapping
- `add-followup-columns.ts` → `/migrations/20260122000001_add_user_sessions_followup_columns.js`
- `ensure-all-columns.ts` → `/migrations/20260122000002_add_orders_processing_columns.js`

## Why Deprecated?
1. **Runtime migrations are error-prone** - They run on every app startup, causing unnecessary overhead
2. **No version control** - Unlike Knex migrations, these don't track what's been applied
3. **Race conditions** - Multiple app instances could try to run migrations simultaneously
4. **No rollback** - Can't easily undo changes

## What to Do Instead
Use Knex migrations for all schema changes:
```bash
# Create new migration
npx knex migrate:make migration_name --knexfile knexfile.js

# Run migrations
pnpm run migrate
```

See `/MIGRATIONS.md` for complete documentation.

## Keeping These Files
These files are kept for reference but are no longer imported or executed by the application.
See `src/mysql-database.ts` - the imports have been removed.
