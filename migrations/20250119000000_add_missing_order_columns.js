/**
 * Migration: Add missing columns to orders table
 * Adds total_amount, discount_amount, shipping_address, shipping_phone, and usb_label columns
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        console.log('⚠️  Orders table does not exist, skipping migration');
        return;
    }

    await knex.schema.alterTable('orders', (table) => {
        // Check if columns already exist
        const hasColumn = async (columnName) => {
            const exists = await knex.schema.hasColumn('orders', columnName);
            return exists;
        };

        // Add total_amount if it doesn't exist
        if (!hasColumn('total_amount')) {
            table.decimal('total_amount', 10, 2).nullable().defaultTo(0);
        }

        // Add discount_amount if it doesn't exist  
        if (!hasColumn('discount_amount')) {
            table.decimal('discount_amount', 10, 2).nullable().defaultTo(0);
        }

        // Add shipping_address if it doesn't exist
        if (!hasColumn('shipping_address')) {
            table.text('shipping_address').nullable();
        }

        // Add shipping_phone if it doesn't exist
        if (!hasColumn('shipping_phone')) {
            table.string('shipping_phone', 50).nullable();
        }

        // Add usb_label if it doesn't exist
        if (!hasColumn('usb_label')) {
            table.string('usb_label', 255).nullable();
        }

        // Add status column if it doesn't exist (for compatibility)
        if (!hasColumn('status')) {
            table.string('status', 50).nullable();
        }
    });

    console.log('✅ Added missing columns to orders table');

    // Update existing rows: copy price to total_amount if total_amount is null
    await knex.raw(`
        UPDATE orders 
        SET total_amount = price 
        WHERE total_amount IS NULL OR total_amount = 0
    `);

    // Update existing rows: set default status from processing_status if status is null
    await knex.raw(`
        UPDATE orders 
        SET status = processing_status 
        WHERE status IS NULL
    `);

    console.log('✅ Updated existing order data');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        return;
    }

    await knex.schema.alterTable('orders', (table) => {
        table.dropColumn('total_amount');
        table.dropColumn('discount_amount');
        table.dropColumn('shipping_address');
        table.dropColumn('shipping_phone');
        table.dropColumn('usb_label');
        table.dropColumn('status');
    });

    console.log('✅ Removed columns from orders table');
}

module.exports = { up, down };
