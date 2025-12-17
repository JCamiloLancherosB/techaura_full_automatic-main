/**
 * Migration to add follow-up control columns to user_sessions table
 */

import type mysql from 'mysql2/promise';

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
    
    // Add indexes for better query performance
    await pool.execute(`
      CREATE INDEX IF NOT EXISTS idx_contact_status 
      ON user_sessions(contact_status)
    `).catch(() => {
      console.log('ℹ️ idx_contact_status index might already exist, skipping...');
    });
    
    await pool.execute(`
      CREATE INDEX IF NOT EXISTS idx_last_user_reply 
      ON user_sessions(last_user_reply_at)
    `).catch(() => {
      console.log('ℹ️ idx_last_user_reply index might already exist, skipping...');
    });
    
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
    
    console.log('✅ Follow-up control columns removed successfully');
  } catch (error) {
    console.error('❌ Error removing follow-up columns:', error);
    throw error;
  }
}
