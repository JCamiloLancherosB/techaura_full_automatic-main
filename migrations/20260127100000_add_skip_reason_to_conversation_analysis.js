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
    
    // Add composite index for status/skip_reason queries using Knex schema builder
    // This avoids raw SQL interpolation for better security
    try {
        await knex.schema.alterTable('conversation_analysis', (table) => {
            table.index(['status', 'skip_reason'], 'idx_conversation_analysis_status_skip_reason');
        });
        console.log('✅ Added composite index on (status, skip_reason)');
    } catch (error) {
        // Index might already exist - check if it's a duplicate key error
        if (error.code === 'ER_DUP_KEYNAME' || error.message?.includes('Duplicate key name')) {
            console.log('ℹ️  Index idx_conversation_analysis_status_skip_reason already exists');
        } else {
            throw error;
        }
    }
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    // Drop index first if it exists using Knex schema builder
    try {
        await knex.schema.alterTable('conversation_analysis', (table) => {
            table.dropIndex(['status', 'skip_reason'], 'idx_conversation_analysis_status_skip_reason');
        });
        console.log('✅ Dropped index idx_conversation_analysis_status_skip_reason');
    } catch (error) {
        // Index might not exist - ignore the error
        if (!error.message?.includes("doesn't exist") && !error.message?.includes('does not exist')) {
            throw error;
        }
        console.log('ℹ️  Index idx_conversation_analysis_status_skip_reason does not exist');
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
