/**
 * Migration: Add follow-up template persistence columns
 * Adds last_followup_template_id and last_followup_sent_at to user_sessions
 * for blocking repetition of the same template within X hours
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Adding follow-up template persistence columns to user_sessions...');
    
    const userSessionsExists = await knex.schema.hasTable('user_sessions');
    if (!userSessionsExists) {
        console.log('⚠️ user_sessions table does not exist, skipping migration');
        return;
    }

    // Check which columns already exist
    const columns = await knex('information_schema.columns')
        .select('column_name')
        .where('table_schema', knex.raw('DATABASE()'))
        .where('table_name', 'user_sessions');
    
    const existingColumns = columns.map(c => c.column_name || c.COLUMN_NAME);

    // Add last_followup_template_id column
    if (!existingColumns.includes('last_followup_template_id')) {
        await knex.schema.alterTable('user_sessions', (table) => {
            table.string('last_followup_template_id', 100).nullable()
                .comment('Last follow-up template ID used for this user');
        });
        console.log('✅ Added last_followup_template_id column');
    }

    // Add last_followup_sent_at column
    if (!existingColumns.includes('last_followup_sent_at')) {
        await knex.schema.alterTable('user_sessions', (table) => {
            table.datetime('last_followup_sent_at').nullable()
                .comment('Timestamp when last follow-up was sent');
        });
        console.log('✅ Added last_followup_sent_at column');
    }

    // Add index for querying by template and timestamp
    const existingIndices = await knex.raw(`
        SELECT DISTINCT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'user_sessions'
    `);
    
    const indexNames = existingIndices[0].map(row => row.INDEX_NAME);

    if (!indexNames.includes('idx_last_followup_sent')) {
        await knex.schema.alterTable('user_sessions', (table) => {
            table.index(['last_followup_sent_at'], 'idx_last_followup_sent');
        });
        console.log('✅ Added index on last_followup_sent_at');
    }

    console.log('✅ Follow-up template persistence columns added successfully');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back follow-up template persistence columns from user_sessions...');
    
    const userSessionsExists = await knex.schema.hasTable('user_sessions');
    if (!userSessionsExists) {
        return;
    }

    // Drop index first
    try {
        await knex.schema.alterTable('user_sessions', (table) => {
            table.dropIndex(['last_followup_sent_at'], 'idx_last_followup_sent');
        });
        console.log('✅ Dropped index idx_last_followup_sent');
    } catch (error) {
        console.log('ℹ️ Index idx_last_followup_sent may not exist');
    }

    // Check which columns exist before dropping
    const columns = await knex('information_schema.columns')
        .select('column_name')
        .where('table_schema', knex.raw('DATABASE()'))
        .where('table_name', 'user_sessions');
    
    const existingColumns = columns.map(c => c.column_name || c.COLUMN_NAME);

    // Drop columns
    if (existingColumns.includes('last_followup_template_id')) {
        await knex.schema.alterTable('user_sessions', (table) => {
            table.dropColumn('last_followup_template_id');
        });
        console.log('✅ Dropped last_followup_template_id column');
    }

    if (existingColumns.includes('last_followup_sent_at')) {
        await knex.schema.alterTable('user_sessions', (table) => {
            table.dropColumn('last_followup_sent_at');
        });
        console.log('✅ Dropped last_followup_sent_at column');
    }

    console.log('✅ Rollback completed');
}

module.exports = { up, down };
