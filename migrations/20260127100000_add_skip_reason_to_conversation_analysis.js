/**
 * Migration: Add skip_reason column to conversation_analysis table
 * 
 * This migration adds support for tracking why an analysis was skipped
 * (e.g., NO_HISTORY, INVALID_PHONE) instead of failing with an error.
 * 
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Adding skip_reason column to conversation_analysis table...');
    
    const hasColumn = await knex.schema.hasColumn('conversation_analysis', 'skip_reason');
    
    if (!hasColumn) {
        await knex.schema.alterTable('conversation_analysis', (table) => {
            table.string('skip_reason', 50).nullable().after('error_message');
        });
        console.log('✅ Added skip_reason column to conversation_analysis table');
    } else {
        console.log('ℹ️  skip_reason column already exists');
    }
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const hasColumn = await knex.schema.hasColumn('conversation_analysis', 'skip_reason');
    
    if (hasColumn) {
        await knex.schema.alterTable('conversation_analysis', (table) => {
            table.dropColumn('skip_reason');
        });
        console.log('✅ Removed skip_reason column from conversation_analysis table');
    }
}

module.exports = { up, down };
