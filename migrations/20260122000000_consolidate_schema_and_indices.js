/**
 * Migration: Consolidate schema and add missing indices
 * 
 * This migration:
 * 1. Ensures all required columns exist in orders table (idempotent)
 * 2. Adds missing indices for performance
 * 3. Consolidates runtime migrations into proper Knex migration
 * 
 * NOTE: This migration intentionally checks for columns that may have been
 * added by earlier migrations (20260120000000, 20250119000000, etc.) to serve
 * as a comprehensive "catch-all" that ensures complete schema coverage even if
 * earlier migrations were skipped or failed. This is safe due to idempotency.
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Starting schema consolidation and index creation...');
    
    // ============================================
    // ORDERS TABLE - Ensure all columns exist
    // ============================================
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        console.log('⚠️  Orders table does not exist, skipping migration');
        return;
    }

    console.log('📦 Checking orders table columns...');
    
    // Check which columns already exist to avoid errors
    const hasNotes = await knex.schema.hasColumn('orders', 'notes');
    const hasAdminNotes = await knex.schema.hasColumn('orders', 'admin_notes');
    const hasCompletedAt = await knex.schema.hasColumn('orders', 'completed_at');
    const hasConfirmedAt = await knex.schema.hasColumn('orders', 'confirmed_at');
    const hasTotalAmount = await knex.schema.hasColumn('orders', 'total_amount');
    const hasDiscountAmount = await knex.schema.hasColumn('orders', 'discount_amount');
    const hasShippingAddress = await knex.schema.hasColumn('orders', 'shipping_address');
    const hasShippingPhone = await knex.schema.hasColumn('orders', 'shipping_phone');

    // Add any missing columns (idempotent)
    await knex.schema.alterTable('orders', (table) => {
        if (!hasNotes) {
            table.text('notes').nullable();
            console.log('✅ Added notes column');
        }
        if (!hasAdminNotes) {
            table.json('admin_notes').nullable();
            console.log('✅ Added admin_notes column');
        }
        if (!hasCompletedAt) {
            table.timestamp('completed_at').nullable();
            console.log('✅ Added completed_at column');
        }
        if (!hasConfirmedAt) {
            table.timestamp('confirmed_at').nullable();
            console.log('✅ Added confirmed_at column');
        }
        if (!hasTotalAmount) {
            table.decimal('total_amount', 10, 2).nullable();
            console.log('✅ Added total_amount column');
        }
        if (!hasDiscountAmount) {
            table.decimal('discount_amount', 10, 2).nullable();
            console.log('✅ Added discount_amount column');
        }
        if (!hasShippingAddress) {
            table.text('shipping_address').nullable();
            console.log('✅ Added shipping_address column');
        }
        if (!hasShippingPhone) {
            table.string('shipping_phone', 50).nullable();
            console.log('✅ Added shipping_phone column');
        }
    });

    // ============================================
    // INDICES - Add missing indices for performance
    // ============================================
    console.log('📦 Adding indices for better query performance...');

    // Get existing indices on orders table
    const existingIndices = await knex.raw(`
        SELECT DISTINCT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'orders'
    `);
    
    const indexNames = existingIndices[0].map(row => row.INDEX_NAME);

    // Add index on phone_number if it doesn't exist
    if (!indexNames.includes('orders_phone_number_index')) {
        await knex.schema.alterTable('orders', (table) => {
            table.index(['phone_number'], 'orders_phone_number_index');
        });
        console.log('✅ Added index on orders(phone_number)');
    } else {
        console.log('ℹ️  Index on orders(phone_number) already exists');
    }

    // Add index on processing_status if it doesn't exist
    // Note: processing_status might already be indexed from previous migration
    if (!indexNames.includes('orders_processing_status_index') && 
        !indexNames.includes('idx_orders_status')) {
        await knex.schema.alterTable('orders', (table) => {
            table.index(['processing_status'], 'orders_processing_status_index');
        });
        console.log('✅ Added index on orders(processing_status)');
    } else {
        console.log('ℹ️  Index on orders(processing_status) already exists');
    }

    // ============================================
    // ORDER_EVENTS TABLE - Ensure indices exist
    // ============================================
    const orderEventsExists = await knex.schema.hasTable('order_events');
    if (orderEventsExists) {
        console.log('📦 Checking order_events table indices...');
        
        // Get existing indices on order_events table
        const existingOrderEventsIndices = await knex.raw(`
            SELECT DISTINCT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'order_events'
        `);
        
        const orderEventsIndexNames = existingOrderEventsIndices[0].map(row => row.INDEX_NAME);

        // Add composite index on (order_number, created_at) if it doesn't exist
        // Check for exact index name to avoid false positives
        const compositeIndexName = 'order_events_order_number_created_at_index';
        
        if (!orderEventsIndexNames.includes(compositeIndexName)) {
            await knex.schema.alterTable('order_events', (table) => {
                table.index(['order_number', 'created_at'], compositeIndexName);
            });
            console.log('✅ Added composite index on order_events(order_number, created_at)');
        } else {
            console.log('ℹ️  Composite index on order_events(order_number, created_at) already exists');
        }
    } else {
        console.log('⚠️  order_events table does not exist, skipping index creation');
    }

    console.log('✅ Schema consolidation and index creation completed');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back schema consolidation...');
    
    const ordersExists = await knex.schema.hasTable('orders');
    if (ordersExists) {
        // Drop indices
        await knex.schema.alterTable('orders', (table) => {
            table.dropIndex(['phone_number'], 'orders_phone_number_index');
            table.dropIndex(['processing_status'], 'orders_processing_status_index');
        }).catch(() => {
            console.log('ℹ️  Some indices may not exist to drop');
        });
    }

    const orderEventsExists = await knex.schema.hasTable('order_events');
    if (orderEventsExists) {
        await knex.schema.alterTable('order_events', (table) => {
            table.dropIndex(['order_number', 'created_at'], 'order_events_order_number_created_at_index');
        }).catch(() => {
            console.log('ℹ️  Composite index may not exist to drop');
        });
    }

    console.log('✅ Rollback completed (columns preserved for data safety)');
}

module.exports = { up, down };
