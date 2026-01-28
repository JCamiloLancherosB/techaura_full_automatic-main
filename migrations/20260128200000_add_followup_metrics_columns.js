/**
 * Migration: Add new follow-up metrics columns
 * Adds scheduled, attempted, blocked, and cancelled columns to followup_performance_daily
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Check if table exists
    const tableExists = await knex.schema.hasTable('followup_performance_daily');
    if (!tableExists) {
        console.log('⚠️ followup_performance_daily table does not exist, skipping column addition');
        return;
    }

    // Check if columns already exist and add them if they don't
    const columns = await knex('information_schema.columns')
        .select('column_name')
        .where('table_schema', knex.raw('DATABASE()'))
        .where('table_name', 'followup_performance_daily');
    
    const existingColumns = columns.map(c => c.column_name || c.COLUMN_NAME);

    // Add followups_scheduled column
    if (!existingColumns.includes('followups_scheduled')) {
        await knex.schema.alterTable('followup_performance_daily', (table) => {
            table.integer('followups_scheduled').defaultTo(0).after('date');
        });
        console.log('✅ Added followups_scheduled column');
    }

    // Add followups_attempted column
    if (!existingColumns.includes('followups_attempted')) {
        await knex.schema.alterTable('followup_performance_daily', (table) => {
            table.integer('followups_attempted').defaultTo(0).after('followups_scheduled');
        });
        console.log('✅ Added followups_attempted column');
    }

    // Add followups_blocked column
    if (!existingColumns.includes('followups_blocked')) {
        await knex.schema.alterTable('followup_performance_daily', (table) => {
            table.integer('followups_blocked').defaultTo(0).after('followups_sent');
        });
        console.log('✅ Added followups_blocked column');
    }

    // Add followups_cancelled column
    if (!existingColumns.includes('followups_cancelled')) {
        await knex.schema.alterTable('followup_performance_daily', (table) => {
            table.integer('followups_cancelled').defaultTo(0).after('followups_blocked');
        });
        console.log('✅ Added followups_cancelled column');
    }

    console.log('✅ Completed adding new follow-up metrics columns');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const tableExists = await knex.schema.hasTable('followup_performance_daily');
    if (!tableExists) {
        return;
    }

    // Check which columns exist before dropping
    const columns = await knex('information_schema.columns')
        .select('column_name')
        .where('table_schema', knex.raw('DATABASE()'))
        .where('table_name', 'followup_performance_daily');
    
    const existingColumns = columns.map(c => c.column_name || c.COLUMN_NAME);

    await knex.schema.alterTable('followup_performance_daily', (table) => {
        if (existingColumns.includes('followups_scheduled')) {
            table.dropColumn('followups_scheduled');
        }
        if (existingColumns.includes('followups_attempted')) {
            table.dropColumn('followups_attempted');
        }
        if (existingColumns.includes('followups_blocked')) {
            table.dropColumn('followups_blocked');
        }
        if (existingColumns.includes('followups_cancelled')) {
            table.dropColumn('followups_cancelled');
        }
    });

    console.log('✅ Dropped new follow-up metrics columns');
}

module.exports = { up, down };
