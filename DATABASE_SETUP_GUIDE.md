# Database Setup and Migration Guide

## Overview
This guide explains how to set up the database and run migrations to ensure all required tables and columns exist for the admin panel to display data correctly.

## Prerequisites
1. MySQL/MariaDB server running
2. Database credentials configured in `.env` file
3. Node.js and npm/pnpm installed

## Environment Configuration

Create or update your `.env` file with the following database configuration:

```bash
# MySQL Database Configuration
MYSQL_DB_HOST=localhost
MYSQL_DB_PORT=3306
MYSQL_DB_USER=techaura_bot
MYSQL_DB_PASSWORD=your_secure_mysql_password
MYSQL_DB_NAME=techaura_bot
```

## Installing Dependencies

```bash
# Install all dependencies (including knex for migrations)
npm install

# Or with pnpm
pnpm install
```

## Running Migrations

The migrations add all necessary tables and columns to the database. Run them in order:

```bash
# Run all pending migrations
npm run migrate

# Or manually with knex
npx knex migrate:latest --knexfile knexfile.js
```

### Migration Details

The system includes several migrations that add required tables and columns:

1. **20240810000000_create_tables.js** - Creates base tables (orders, user_sessions, etc.)
2. **20241217000000_add_customers_and_validation.js** - Adds customer management tables
3. **20241217000001_create_usb_orders.js** - Creates usb_orders table for web orders
4. **20241218000000_add_status_column_to_orders.js** - Adds status column to orders
5. **20250119000000_add_missing_order_columns.js** - Adds missing columns needed for order persistence:
   - `total_amount` - Total order amount
   - `discount_amount` - Discount applied
   - `shipping_address` - Shipping address
   - `shipping_phone` - Shipping phone
   - `usb_label` - USB label text

All migrations are idempotent and safe to run multiple times.

### Manual Migration (if needed)

If the automated migration fails, you can manually apply the SQL commands:

```sql
-- Add missing columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_address TEXT,
ADD COLUMN IF NOT EXISTS shipping_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS usb_label VARCHAR(255);

-- Update existing rows to populate total_amount from price
UPDATE orders 
SET total_amount = price 
WHERE total_amount IS NULL OR total_amount = 0;
```

Note: The `status` column is added by a separate migration (20241218000000_add_status_column_to_orders.js) and does not need to be added here.

## Verifying Database Schema

After running migrations, verify that the orders table has all required columns:

```sql
DESCRIBE orders;
```

Expected columns should include:
- `id` (primary key)
- `order_number` (unique)
- `customer_name`
- `phone_number`
- `product_type`
- `capacity`
- `price`
- `total_amount` ⭐ (newly added)
- `discount_amount` ⭐ (newly added)
- `shipping_address` ⭐ (newly added)
- `shipping_phone` ⭐ (newly added)
- `usb_label` ⭐ (newly added)
- `status` (added by separate migration)
- `processing_status`
- `customization` (JSON)
- `preferences` (JSON)
- `created_at`
- `updated_at`

## Common Issues and Solutions

### Issue: "Table 'orders' doesn't exist"

**Solution:** Run the initial migration first:
```bash
npx knex migrate:up 20240810000000_create_tables.js
```

### Issue: "Column already exists" error

**Solution:** The migration checks for existing columns before adding them. If you get this error, the columns may have been partially created. You can:

1. Skip this migration: `npx knex migrate:up --skip-on-error`
2. Or manually check which columns exist and only add the missing ones

### Issue: "Connection refused" or "Access denied"

**Solution:** 
1. Check that MySQL is running: `systemctl status mysql` (Linux) or check Task Manager (Windows)
2. Verify your `.env` credentials are correct
3. Test the connection: `mysql -u techaura_bot -p techaura_bot`

### Issue: Admin panel shows zeros everywhere

**Possible causes:**
1. Database not connected - Check console logs for connection errors
2. No orders in database - Create test orders or wait for real orders
3. Migrations not run - Run migrations as described above
4. Wrong database credentials - Verify `.env` configuration

**Solution for testing:** Create sample orders:
```sql
INSERT INTO orders (
    order_number, customer_name, phone_number, product_type, 
    capacity, price, total_amount, processing_status, status, created_at
) VALUES 
('ORD-001', 'Test Customer 1', '3001234567', 'music', '64GB', 35000, 35000, 'completed', 'completed', NOW()),
('ORD-002', 'Test Customer 2', '3007654321', 'videos', '128GB', 50000, 50000, 'processing', 'processing', NOW()),
('ORD-003', 'Test Customer 3', '3009876543', 'movies', '256GB', 80000, 80000, 'pending', 'pending', NOW());
```

## Data Flow for Admin Panel

Understanding how data flows helps troubleshoot issues:

1. **Order Creation** (`src/flows/helpers/finalizeOrder.ts`)
   - User completes order via chatbot/web
   - `businessDB.createOrder()` is called with order data
   - Data is inserted into `orders` table

2. **Analytics Service** (`src/admin/services/AnalyticsService.ts`)
   - Dashboard queries `businessDB.getOrderStatistics()`
   - Aggregates data from `orders` table
   - Returns statistics (totals, revenue, distributions)

3. **Admin Panel** (`src/admin/AdminPanel.ts`)
   - Serves dashboard API at `/api/admin/dashboard`
   - Caches results for 30 seconds
   - Returns JSON data to frontend

4. **Frontend** (`public/admin/index.html`)
   - Fetches data from `/api/admin/dashboard`
   - Displays statistics in cards and charts

## Testing the Setup

1. **Start the application:**
   ```bash
   npm run dev
   ```

2. **Access the admin panel:**
   - Open: http://localhost:3009/admin
   - Should show dashboard with real data (if orders exist)

3. **Create a test order via API:**
   ```bash
   curl -X POST http://localhost:3009/api/orders \
     -H "Content-Type: application/json" \
     -d '{
       "customerPhone": "3001234567",
       "items": [{
         "capacity": "64GB",
         "contentType": "music",
         "price": 35000,
         "quantity": 1
       }]
     }'
   ```

4. **Verify in database:**
   ```sql
   SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
   ```

## Maintenance

### Backup Database
```bash
mysqldump -u techaura_bot -p techaura_bot > backup_$(date +%Y%m%d).sql
```

### Check Database Size
```sql
SELECT 
    table_name AS 'Table',
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.TABLES
WHERE table_schema = 'techaura_bot'
ORDER BY (data_length + index_length) DESC;
```

### Clean Old Data (optional)
```sql
-- Delete orders older than 1 year
DELETE FROM orders WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);

-- Delete inactive user sessions older than 6 months
DELETE FROM user_sessions WHERE last_interaction < DATE_SUB(NOW(), INTERVAL 6 MONTH);
```

## Adding New Migrations

When you need to modify the database schema:

1. Create a new migration file:
   ```bash
   npx knex migrate:make your_migration_name
   ```

2. Edit the generated file in `migrations/` directory

3. Run the migration:
   ```bash
   npx knex migrate:latest
   ```

4. Test thoroughly before deploying to production

## Support

If you encounter issues not covered in this guide:

1. Check application logs for error messages
2. Verify database connection: `npm run test:mysql`
3. Review the error logs in the console
4. Check database permissions for the user account

## Summary of Changes

This PR includes:

1. ✅ Fixed TypeScript import errors in `premium-customer-service.ts`
2. ✅ Added missing types to `types/global.d.ts`
3. ✅ Created migration to add missing columns to `orders` table
4. ✅ Documented database setup and troubleshooting procedures

After applying these changes, the admin panel at `http://localhost:3009/admin/` should display real data from the database instead of zeros.
