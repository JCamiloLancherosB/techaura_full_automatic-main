/**
 * Migration: Add skip_reason column to conversation_analysis table
 * 
 * This migration adds support for tracking why an analysis was skipped
 * (e.g., NO_HISTORY, INVALID_PHONE) instead of failing with an error.
 * Also adds a composite index on (status, skip_reason) for efficient queries.
 * 
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Adding skip_reason column to conversation_analysis table...');
    
    const hasColumn = await knex.schema.hasColumn('conversation_analysis', 'skip_reason');
    
    if (!hasColumn) {
        await knex.schema.alterTable('conversation_analysis', (table) => {
            table.string('skip_reason', 64).nullable().after('error_message');
        });
        console.log('✅ Added skip_reason column to conversation_analysis table');
    } else {
        console.log('ℹ️  skip_reason column already exists');
    }
    
    // Add composite index for status/skip_reason queries
    const indexName = 'idx_conversation_analysis_status_skip_reason';
    const [rows] = await knex.raw(`
        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'conversation_analysis'
        AND INDEX_NAME = ?
    `, [indexName]);
    
    if (rows[0].cnt === 0) {
        await knex.raw(`
            CREATE INDEX ${indexName} ON conversation_analysis (status, skip_reason)
        `);
        console.log('✅ Added composite index on (status, skip_reason)');
    } else {
        console.log('ℹ️  Index idx_conversation_analysis_status_skip_reason already exists');
    }
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    // Drop index first if it exists
    const indexName = 'idx_conversation_analysis_status_skip_reason';
    const [rows] = await knex.raw(`
        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'conversation_analysis'
        AND INDEX_NAME = ?
    `, [indexName]);
    
    if (rows[0].cnt > 0) {
        await knex.raw(`DROP INDEX ${indexName} ON conversation_analysis`);
        console.log('✅ Dropped index idx_conversation_analysis_status_skip_reason');
    }
    
    const hasColumn = await knex.schema.hasColumn('conversation_analysis', 'skip_reason');
    
    if (hasColumn) {
        await knex.schema.alterTable('conversation_analysis', (table) => {
            table.dropColumn('skip_reason');
        });
        console.log('✅ Removed skip_reason column from conversation_analysis table');
    }
}

module.exports = { up, down };
