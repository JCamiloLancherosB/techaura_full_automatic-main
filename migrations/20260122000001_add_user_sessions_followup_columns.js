/**
 * Migration: Add follow-up columns to user_sessions
 * 
 * This migration consolidates the runtime TypeScript migrations 
 * into proper Knex migrations for user_sessions table.
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Adding follow-up columns to user_sessions...');
    
    const userSessionsExists = await knex.schema.hasTable('user_sessions');
    if (!userSessionsExists) {
        console.log('⚠️  user_sessions table does not exist, skipping migration');
        return;
    }

    // Check which columns already exist
    const hasContactStatus = await knex.schema.hasColumn('user_sessions', 'contact_status');
    const hasLastUserReplyAt = await knex.schema.hasColumn('user_sessions', 'last_user_reply_at');
    const hasLastUserReplyCategory = await knex.schema.hasColumn('user_sessions', 'last_user_reply_category');
    const hasFollowUpCount24h = await knex.schema.hasColumn('user_sessions', 'follow_up_count_24h');
    const hasLastFollowUpResetAt = await knex.schema.hasColumn('user_sessions', 'last_follow_up_reset_at');
    const hasFollowUpAttempts = await knex.schema.hasColumn('user_sessions', 'follow_up_attempts');
    const hasLastFollowUpAttemptResetAt = await knex.schema.hasColumn('user_sessions', 'last_follow_up_attempt_reset_at');
    const hasCooldownUntil = await knex.schema.hasColumn('user_sessions', 'cooldown_until');
    const hasLastActivity = await knex.schema.hasColumn('user_sessions', 'last_activity');

    await knex.schema.alterTable('user_sessions', (table) => {
        if (!hasContactStatus) {
            table.enum('contact_status', ['ACTIVE', 'OPT_OUT', 'CLOSED'])
                .defaultTo('ACTIVE')
                .comment('Contact status: ACTIVE=can receive follow-ups, OPT_OUT=user opted out, CLOSED=user completed/decided');
            console.log('✅ Added contact_status column');
        }
        
        if (!hasLastUserReplyAt) {
            table.timestamp('last_user_reply_at').nullable()
                .comment('Timestamp of last user reply');
            console.log('✅ Added last_user_reply_at column');
        }
        
        if (!hasLastUserReplyCategory) {
            table.enum('last_user_reply_category', ['NEGATIVE', 'COMPLETED', 'CONFIRMATION', 'POSITIVE', 'NEUTRAL'])
                .nullable()
                .comment('Category of last user reply');
            console.log('✅ Added last_user_reply_category column');
        }
        
        if (!hasFollowUpCount24h) {
            table.integer('follow_up_count_24h').defaultTo(0)
                .comment('Number of follow-ups sent in last 24 hours');
            console.log('✅ Added follow_up_count_24h column');
        }
        
        if (!hasLastFollowUpResetAt) {
            table.timestamp('last_follow_up_reset_at').nullable()
                .comment('Timestamp when follow_up_count_24h was last reset');
            console.log('✅ Added last_follow_up_reset_at column');
        }
        
        if (!hasFollowUpAttempts) {
            table.integer('follow_up_attempts').defaultTo(0)
                .comment('Number of follow-up attempts without user reply (max 3 before cooldown)');
            console.log('✅ Added follow_up_attempts column');
        }
        
        if (!hasLastFollowUpAttemptResetAt) {
            table.timestamp('last_follow_up_attempt_reset_at').nullable()
                .comment('Timestamp when follow_up_attempts was last reset (user replied or cooldown started)');
            console.log('✅ Added last_follow_up_attempt_reset_at column');
        }
        
        if (!hasCooldownUntil) {
            table.timestamp('cooldown_until').nullable()
                .comment('2-day cooldown end timestamp after reaching 3 follow-up attempts');
            console.log('✅ Added cooldown_until column');
        }
        
        if (!hasLastActivity) {
            table.timestamp('last_activity').nullable()
                .comment('Last activity timestamp');
            console.log('✅ Added last_activity column');
        }
    });

    // Add indices for better query performance
    console.log('📦 Adding indices for user_sessions...');
    
    const existingIndices = await knex.raw(`
        SELECT DISTINCT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'user_sessions'
    `);
    
    const indexNames = existingIndices[0].map(row => row.INDEX_NAME);

    await knex.schema.alterTable('user_sessions', (table) => {
        if (!indexNames.includes('idx_contact_status')) {
            table.index(['contact_status'], 'idx_contact_status');
            console.log('✅ Added index on contact_status');
        }
        
        if (!indexNames.includes('idx_last_user_reply')) {
            table.index(['last_user_reply_at'], 'idx_last_user_reply');
            console.log('✅ Added index on last_user_reply_at');
        }
        
        if (!indexNames.includes('idx_cooldown_until')) {
            table.index(['cooldown_until'], 'idx_cooldown_until');
            console.log('✅ Added index on cooldown_until');
        }
        
        if (!indexNames.includes('idx_follow_up_attempts')) {
            table.index(['follow_up_attempts'], 'idx_follow_up_attempts');
            console.log('✅ Added index on follow_up_attempts');
        }
    });

    console.log('✅ Follow-up columns and indices added successfully');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back follow-up columns from user_sessions...');
    
    const userSessionsExists = await knex.schema.hasTable('user_sessions');
    if (!userSessionsExists) {
        return;
    }

    // Drop indices first
    await knex.schema.alterTable('user_sessions', (table) => {
        table.dropIndex(['contact_status'], 'idx_contact_status');
        table.dropIndex(['last_user_reply_at'], 'idx_last_user_reply');
        table.dropIndex(['cooldown_until'], 'idx_cooldown_until');
        table.dropIndex(['follow_up_attempts'], 'idx_follow_up_attempts');
    }).catch(() => {
        console.log('ℹ️  Some indices may not exist to drop');
    });

    // Drop columns
    await knex.schema.alterTable('user_sessions', (table) => {
        table.dropColumn('contact_status');
        table.dropColumn('last_user_reply_at');
        table.dropColumn('last_user_reply_category');
        table.dropColumn('follow_up_count_24h');
        table.dropColumn('last_follow_up_reset_at');
        table.dropColumn('follow_up_attempts');
        table.dropColumn('last_follow_up_attempt_reset_at');
        table.dropColumn('cooldown_until');
        table.dropColumn('last_activity');
    }).catch(() => {
        console.log('ℹ️  Some columns may not exist to drop');
    });

    console.log('✅ Rollback completed');
}

module.exports = { up, down };
