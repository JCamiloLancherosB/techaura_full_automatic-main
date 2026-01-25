/**
 * Migration to add follow-up control columns to user_sessions table
 */

import type mysql from 'mysql2/promise';

async function indexExists(pool: mysql.Pool, tableName: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );

  return Array.isArray(rows) && rows.length > 0;
}

export async function addFollowUpColumns(pool: mysql.Pool): Promise<void> {
  console.log('📦 Adding follow-up control columns to user_sessions...');
  
  try {
    // Add contact_status column if it doesn't exist
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS contact_status 
      ENUM('ACTIVE', 'OPT_OUT', 'CLOSED') 
      DEFAULT 'ACTIVE' 
      COMMENT 'Contact status: ACTIVE=can receive follow-ups, OPT_OUT=user opted out, CLOSED=user completed/decided'
    `).catch(() => {
      console.log('ℹ️ contact_status column might already exist, skipping...');
    });
    
    // Add last_user_reply_at column if it doesn't exist
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS last_user_reply_at 
      DATETIME NULL 
      COMMENT 'Timestamp of last user reply'
    `).catch(() => {
      console.log('ℹ️ last_user_reply_at column might already exist, skipping...');
    });
    
    // Add last_user_reply_category column if it doesn't exist
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS last_user_reply_category 
      ENUM('NEGATIVE', 'COMPLETED', 'CONFIRMATION', 'POSITIVE', 'NEUTRAL') 
      NULL 
      COMMENT 'Category of last user reply'
    `).catch(() => {
      console.log('ℹ️ last_user_reply_category column might already exist, skipping...');
    });
    
    // Add follow_up_count_24h column if it doesn't exist
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS follow_up_count_24h 
      INT DEFAULT 0 
      COMMENT 'Number of follow-ups sent in last 24 hours'
    `).catch(() => {
      console.log('ℹ️ follow_up_count_24h column might already exist, skipping...');
    });
    
    // Add last_follow_up_reset_at column if it doesn't exist
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS last_follow_up_reset_at 
      DATETIME NULL 
      COMMENT 'Timestamp when follow_up_count_24h was last reset'
    `).catch(() => {
      console.log('ℹ️ last_follow_up_reset_at column might already exist, skipping...');
    });
    
    // Add follow_up_attempts column if it doesn't exist
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS follow_up_attempts 
      INT DEFAULT 0 
      COMMENT 'Number of follow-up attempts without user reply (max 3 before cooldown)'
    `).catch(() => {
      console.log('ℹ️ follow_up_attempts column might already exist, skipping...');
    });
    
    // Add last_follow_up_attempt_reset_at column if it doesn't exist
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS last_follow_up_attempt_reset_at 
      DATETIME NULL 
      COMMENT 'Timestamp when follow_up_attempts was last reset (user replied or cooldown started)'
    `).catch(() => {
      console.log('ℹ️ last_follow_up_attempt_reset_at column might already exist, skipping...');
    });
    
    // Add cooldown_until column if it doesn't exist (for 2-day cooldown after 3 attempts)
    await pool.execute(`
      ALTER TABLE user_sessions 
      ADD COLUMN IF NOT EXISTS cooldown_until 
      DATETIME NULL 
      COMMENT '2-day cooldown end timestamp after reaching 3 follow-up attempts'
    `).catch(() => {
      console.log('ℹ️ cooldown_until column might already exist, skipping...');
    });
    
    // Add indexes for better query performance
    const tableName = 'user_sessions';
    const contactStatusIndex = 'idx_contact_status';
    if (!(await indexExists(pool, tableName, contactStatusIndex))) {
      await pool.execute(
        `ALTER TABLE user_sessions ADD INDEX ${contactStatusIndex} (contact_status)`
      );
    } else {
      console.log('ℹ️ idx_contact_status index already exists, skipping...');
    }
    
    const lastUserReplyIndex = 'idx_last_user_reply';
    if (!(await indexExists(pool, tableName, lastUserReplyIndex))) {
      await pool.execute(
        `ALTER TABLE user_sessions ADD INDEX ${lastUserReplyIndex} (last_user_reply_at)`
      );
    } else {
      console.log('ℹ️ idx_last_user_reply index already exists, skipping...');
    }
    
    const cooldownUntilIndex = 'idx_cooldown_until';
    if (!(await indexExists(pool, tableName, cooldownUntilIndex))) {
      await pool.execute(
        `ALTER TABLE user_sessions ADD INDEX ${cooldownUntilIndex} (cooldown_until)`
      );
    } else {
      console.log('ℹ️ idx_cooldown_until index already exists, skipping...');
    }
    
    const followUpAttemptsIndex = 'idx_follow_up_attempts';
    if (!(await indexExists(pool, tableName, followUpAttemptsIndex))) {
      await pool.execute(
        `ALTER TABLE user_sessions ADD INDEX ${followUpAttemptsIndex} (follow_up_attempts)`
      );
    } else {
      console.log('ℹ️ idx_follow_up_attempts index already exists, skipping...');
    }
    
    console.log('✅ Follow-up control columns added successfully');
  } catch (error) {
    console.error('❌ Error adding follow-up columns:', error);
    throw error;
  }
}

/**
 * Rollback migration (remove columns)
 */
export async function removeFollowUpColumns(pool: mysql.Pool): Promise<void> {
  console.log('📦 Removing follow-up control columns from user_sessions...');
  
  try {
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS contact_status`);
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS last_user_reply_at`);
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS last_user_reply_category`);
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS follow_up_count_24h`);
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS last_follow_up_reset_at`);
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS follow_up_attempts`);
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS last_follow_up_attempt_reset_at`);
    await pool.execute(`ALTER TABLE user_sessions DROP COLUMN IF EXISTS cooldown_until`);
    
    console.log('✅ Follow-up control columns removed successfully');
  } catch (error) {
    console.error('❌ Error removing follow-up columns:', error);
    throw error;
  }
}
