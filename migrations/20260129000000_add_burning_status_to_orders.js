/**
 * Migration: Add burning_status column to orders table
 * Adds a column to track the USB burning process status
 * Possible values: 'pending', 'queued', 'burning', 'completed', 'failed'
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Adding burning_status column to orders table...');
    
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        console.log('⚠️ orders table does not exist, skipping migration');
        return;
    }

    // Check if column already exists
    const columns = await knex('information_schema.columns')
        .select('column_name')
        .where('table_schema', knex.raw('DATABASE()'))
        .where('table_name', 'orders');
    
    const existingColumns = columns.map(c => c.column_name || c.COLUMN_NAME);

    // Add burning_status column if it doesn't exist
    if (!existingColumns.includes('burning_status')) {
        await knex.schema.alterTable('orders', (table) => {
            table.string('burning_status', 20).nullable().defaultTo('pending')
                .comment('Status of USB burning process: pending, queued, burning, completed, failed');
        });
        console.log('✅ Added burning_status column');
    } else {
        console.log('ℹ️ burning_status column already exists');
    }

    // Add burning_confirmed_at column if it doesn't exist
    if (!existingColumns.includes('burning_confirmed_at')) {
        await knex.schema.alterTable('orders', (table) => {
            table.datetime('burning_confirmed_at').nullable()
                .comment('Timestamp when user confirmed burning details');
        });
        console.log('✅ Added burning_confirmed_at column');
    } else {
        console.log('ℹ️ burning_confirmed_at column already exists');
    }

    // Add index on burning_status for efficient querying
    const existingIndices = await knex.raw(`
        SELECT DISTINCT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'orders'
    `);
    
    const indexNames = existingIndices[0].map(row => row.INDEX_NAME);

    if (!indexNames.includes('idx_orders_burning_status')) {
        await knex.schema.alterTable('orders', (table) => {
            table.index(['burning_status'], 'idx_orders_burning_status');
        });
        console.log('✅ Added index on burning_status');
    } else {
        console.log('ℹ️ Index idx_orders_burning_status already exists');
    }

    console.log('✅ Burning status migration completed successfully');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back burning_status column from orders table...');
    
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        return;
    }

    // Drop index first
    try {
        await knex.schema.alterTable('orders', (table) => {
            table.dropIndex(['burning_status'], 'idx_orders_burning_status');
        });
        console.log('✅ Dropped index idx_orders_burning_status');
    } catch (error) {
        console.log('ℹ️ Index idx_orders_burning_status may not exist');
    }

    // Check which columns exist before dropping
    const columns = await knex('information_schema.columns')
        .select('column_name')
        .where('table_schema', knex.raw('DATABASE()'))
        .where('table_name', 'orders');
    
    const existingColumns = columns.map(c => c.column_name || c.COLUMN_NAME);

    // Drop burning_status column
    if (existingColumns.includes('burning_status')) {
        await knex.schema.alterTable('orders', (table) => {
            table.dropColumn('burning_status');
        });
        console.log('✅ Dropped burning_status column');
    }

    // Drop burning_confirmed_at column
    if (existingColumns.includes('burning_confirmed_at')) {
        await knex.schema.alterTable('orders', (table) => {
            table.dropColumn('burning_confirmed_at');
        });
        console.log('✅ Dropped burning_confirmed_at column');
    }

    console.log('✅ Rollback completed');
}

module.exports = { up, down };
