/**
 * Migration: Add status column to orders table
 * Maps processing_status to a standard status field for consistency
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Check if orders table exists
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        console.log('⚠️ Orders table does not exist, skipping migration');
        return;
    }

    // Check if status column already exists
    const hasStatusColumn = await knex.schema.hasColumn('orders', 'status');
    if (hasStatusColumn) {
        console.log('✓ Status column already exists in orders table');
        return;
    }

    // Add status column
    await knex.schema.alterTable('orders', (table) => {
        table.string('status', 50).nullable().defaultTo('pending');
        table.index(['status']);
    });

    // Copy values from processing_status to status for existing records
    await knex.raw(`
        UPDATE orders 
        SET status = COALESCE(processing_status, 'pending')
        WHERE status IS NULL
    `);

    console.log('✅ Added status column to orders table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        return;
    }

    const hasStatusColumn = await knex.schema.hasColumn('orders', 'status');
    if (hasStatusColumn) {
        await knex.schema.alterTable('orders', (table) => {
            table.dropColumn('status');
        });
        console.log('✅ Removed status column from orders table');
    }
}

module.exports = { up, down };
