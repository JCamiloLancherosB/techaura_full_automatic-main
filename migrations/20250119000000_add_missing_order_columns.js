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

    // Check which columns already exist
    const hasTotalAmount = await knex.schema.hasColumn('orders', 'total_amount');
    const hasDiscountAmount = await knex.schema.hasColumn('orders', 'discount_amount');
    const hasShippingAddress = await knex.schema.hasColumn('orders', 'shipping_address');
    const hasShippingPhone = await knex.schema.hasColumn('orders', 'shipping_phone');
    const hasUsbLabel = await knex.schema.hasColumn('orders', 'usb_label');
    const hasStatus = await knex.schema.hasColumn('orders', 'status');

    // Add missing columns
    await knex.schema.alterTable('orders', (table) => {
        if (!hasTotalAmount) {
            table.decimal('total_amount', 10, 2).nullable().defaultTo(0);
        }

        if (!hasDiscountAmount) {
            table.decimal('discount_amount', 10, 2).nullable().defaultTo(0);
        }

        if (!hasShippingAddress) {
            table.text('shipping_address').nullable();
        }

        if (!hasShippingPhone) {
            table.string('shipping_phone', 50).nullable();
        }

        if (!hasUsbLabel) {
            table.string('usb_label', 255).nullable();
        }

        if (!hasStatus) {
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
