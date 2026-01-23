/**
 * Migration: Add shipping_json column to orders table
 * Stores structured shipping slot data extracted by SlotExtractor
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

    // Check if column already exists
    const hasShippingJson = await knex.schema.hasColumn('orders', 'shipping_json');

    if (!hasShippingJson) {
        await knex.schema.alterTable('orders', (table) => {
            table.json('shipping_json').nullable().comment('Structured shipping data extracted by SlotExtractor');
        });
        console.log('✅ Added shipping_json column to orders table');
    } else {
        console.log('ℹ️  shipping_json column already exists in orders table');
    }
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        return;
    }

    const hasShippingJson = await knex.schema.hasColumn('orders', 'shipping_json');

    if (hasShippingJson) {
        await knex.schema.alterTable('orders', (table) => {
            table.dropColumn('shipping_json');
        });
        console.log('✅ Removed shipping_json column from orders table');
    }
}

module.exports = { up, down };
