/**
 * Migration: PR-FIX-1 - Fix missing database schema fields
 * 
 * This migration adds remaining missing columns and fixes enum values
 * to prevent startup errors about unknown columns and tables.
 * 
 * Changes:
 * - Add finished_at to processing_jobs (code uses this, not completed_at)
 * - Update user_sessions.contact_status enum to include BLOCKED and PAUSED
 * - Add last_activity index to user_sessions (already exists, ensure index)
 * - Add cursor field to sync_runs (currently uses sync_metadata JSON)
 * - Add result_json and finished_at to conversation_analysis
 * 
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 PR-FIX-1: Fixing missing schema fields...');
    
    // ============================================
    // A) PROCESSING_JOBS - Add finished_at column
    // ============================================
    const processingJobsExists = await knex.schema.hasTable('processing_jobs');
    if (processingJobsExists) {
        console.log('📦 Checking processing_jobs for finished_at...');
        
        const hasFinishedAt = await knex.schema.hasColumn('processing_jobs', 'finished_at');
        
        if (!hasFinishedAt) {
            await knex.schema.alterTable('processing_jobs', (table) => {
                table.datetime('finished_at').nullable()
                    .comment('When job finished (success or failure)');
            });
            console.log('✅ Added finished_at column to processing_jobs');
        } else {
            console.log('ℹ️  finished_at already exists in processing_jobs');
        }
    }
    
    // ============================================
    // C) USER_SESSIONS - Fix contact_status enum
    // ============================================
    const userSessionsExists = await knex.schema.hasTable('user_sessions');
    if (userSessionsExists) {
        console.log('📦 Updating user_sessions.contact_status enum...');
        
        const hasContactStatus = await knex.schema.hasColumn('user_sessions', 'contact_status');
        
        if (hasContactStatus) {
            // Check current enum values
            const [enumInfo] = await knex.raw(`
                SELECT COLUMN_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'user_sessions' 
                AND COLUMN_NAME = 'contact_status'
            `);
            
            const currentEnum = enumInfo[0]?.COLUMN_TYPE || '';
            const needsUpdate = !currentEnum.includes('BLOCKED') || !currentEnum.includes('PAUSED');
            
            if (needsUpdate) {
                // MySQL ALTER to update enum values
                await knex.raw(`
                    ALTER TABLE user_sessions 
                    MODIFY COLUMN contact_status 
                    ENUM('ACTIVE', 'BLOCKED', 'PAUSED', 'OPT_OUT', 'CLOSED') 
                    DEFAULT 'ACTIVE'
                    COMMENT 'Contact status: ACTIVE=can receive follow-ups, BLOCKED=temporarily blocked, PAUSED=user paused, OPT_OUT=user opted out, CLOSED=completed/decided'
                `);
                console.log('✅ Updated contact_status enum to include BLOCKED and PAUSED');
            } else {
                console.log('ℹ️  contact_status enum already includes BLOCKED and PAUSED');
            }
        } else {
            console.log('⚠️  contact_status column does not exist (should be added by previous migration)');
        }
        
        // Ensure last_activity index exists
        console.log('📦 Ensuring last_activity index on user_sessions...');
        const existingIndices = await knex.raw(`
            SELECT DISTINCT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'user_sessions'
        `);
        
        const indexNames = existingIndices[0].map(row => row.INDEX_NAME);
        
        if (!indexNames.includes('idx_last_activity')) {
            await knex.raw(`
                CREATE INDEX idx_last_activity ON user_sessions (last_activity)
            `).catch((error) => {
                console.log('⚠️  Index might already exist:', error.message);
            });
            console.log('✅ Added index on last_activity');
        } else {
            console.log('ℹ️  Index idx_last_activity already exists');
        }
    }
    
    // ============================================
    // E) SYNC_RUNS - Add cursor field if needed
    // ============================================
    const syncRunsExists = await knex.schema.hasTable('sync_runs');
    if (syncRunsExists) {
        console.log('📦 Checking sync_runs for cursor field...');
        
        const hasCursor = await knex.schema.hasColumn('sync_runs', 'cursor');
        
        if (!hasCursor) {
            await knex.schema.alterTable('sync_runs', (table) => {
                table.json('cursor').nullable()
                    .comment('Cursor for incremental sync (alternative to sync_metadata)');
            });
            console.log('✅ Added cursor column to sync_runs');
        } else {
            console.log('ℹ️  cursor already exists in sync_runs');
        }
    }
    
    // ============================================
    // F) CONVERSATION_ANALYSIS - Add missing fields
    // ============================================
    const conversationAnalysisExists = await knex.schema.hasTable('conversation_analysis');
    if (conversationAnalysisExists) {
        console.log('📦 Checking conversation_analysis for missing fields...');
        
        const hasResultJson = await knex.schema.hasColumn('conversation_analysis', 'result_json');
        const hasFinishedAt = await knex.schema.hasColumn('conversation_analysis', 'finished_at');
        
        await knex.schema.alterTable('conversation_analysis', (table) => {
            if (!hasResultJson) {
                table.json('result_json').nullable()
                    .comment('Full analysis result as JSON');
                console.log('✅ Added result_json column to conversation_analysis');
            }
            
            if (!hasFinishedAt) {
                table.datetime('finished_at').nullable()
                    .comment('When analysis finished');
                console.log('✅ Added finished_at column to conversation_analysis');
            }
        });
        
        if (hasResultJson && hasFinishedAt) {
            console.log('ℹ️  conversation_analysis already has result_json and finished_at');
        }
    }
    
    console.log('✅ PR-FIX-1: Schema fixes completed successfully');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back PR-FIX-1 schema fixes...');
    
    // Rollback conversation_analysis changes
    const conversationAnalysisExists = await knex.schema.hasTable('conversation_analysis');
    if (conversationAnalysisExists) {
        await knex.schema.alterTable('conversation_analysis', (table) => {
            table.dropColumn('result_json');
            table.dropColumn('finished_at');
        }).catch(() => {
            console.log('ℹ️  Some columns may not exist to drop');
        });
    }
    
    // Rollback sync_runs cursor
    const syncRunsExists = await knex.schema.hasTable('sync_runs');
    if (syncRunsExists) {
        await knex.schema.alterTable('sync_runs', (table) => {
            table.dropColumn('cursor');
        }).catch(() => {
            console.log('ℹ️  cursor column may not exist to drop');
        });
    }
    
    // Rollback user_sessions changes
    const userSessionsExists = await knex.schema.hasTable('user_sessions');
    if (userSessionsExists) {
        // Revert enum to original values
        await knex.raw(`
            ALTER TABLE user_sessions 
            MODIFY COLUMN contact_status 
            ENUM('ACTIVE', 'OPT_OUT', 'CLOSED') 
            DEFAULT 'ACTIVE'
        `).catch(() => {
            console.log('ℹ️  Could not revert contact_status enum');
        });
        
        // Drop index
        await knex.raw(`DROP INDEX IF EXISTS idx_last_activity ON user_sessions`);
    }
    
    // Rollback processing_jobs finished_at
    const processingJobsExists = await knex.schema.hasTable('processing_jobs');
    if (processingJobsExists) {
        await knex.schema.alterTable('processing_jobs', (table) => {
            table.dropColumn('finished_at');
        }).catch(() => {
            console.log('ℹ️  finished_at column may not exist to drop');
        });
    }
    
    console.log('✅ Rollback completed');
}

module.exports = { up, down };
