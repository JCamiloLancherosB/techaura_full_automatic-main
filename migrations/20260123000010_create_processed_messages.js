/**
 * Migration: Create processed_messages table for message deduplication
 * 
 * This table stores WhatsApp message IDs to prevent duplicate processing
 * under Baileys reconnection scenarios.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  console.log('🔧 Creating processed_messages table for message deduplication...');

  const exists = await knex.schema.hasTable('processed_messages');
  
  if (!exists) {
    await knex.schema.createTable('processed_messages', (table) => {
      table.increments('id').primary();
      table.string('message_id', 255).notNullable().comment('WhatsApp message ID from Baileys');
      table.string('remote_jid', 100).notNullable().comment('Remote JID (phone@s.whatsapp.net)');
      table.timestamp('processed_at').notNullable().defaultTo(knex.fn.now()).comment('When message was first processed');
      table.timestamp('expires_at').notNullable().comment('When this entry expires (TTL)');
      table.timestamp('created_at').defaultTo(knex.fn.now());

      // Composite unique index on message_id + remote_jid for deduplication
      table.unique(['message_id', 'remote_jid'], { indexName: 'idx_message_dedup' });
      
      // Index on expires_at for efficient cleanup queries
      table.index('expires_at', 'idx_expires_at');
      
      // Index on processed_at for analytics
      table.index('processed_at', 'idx_processed_at');
    });

    console.log('✅ Table processed_messages created successfully');
  } else {
    console.log('ℹ️  Table processed_messages already exists, skipping...');
  }

  // Create cleanup event (MySQL Event Scheduler for automatic cleanup)
  // This removes entries older than TTL to prevent table bloat
  try {
    await knex.raw(`
      CREATE EVENT IF NOT EXISTS cleanup_processed_messages
      ON SCHEDULE EVERY 1 HOUR
      DO
        DELETE FROM processed_messages WHERE expires_at < NOW()
    `);
    console.log('✅ Cleanup event created for automatic pruning');
  } catch (error) {
    console.log('⚠️  Could not create cleanup event (Event Scheduler may be disabled):', error.message);
    // Continue anyway - manual cleanup can be done via cron
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  console.log('🔧 Dropping processed_messages table...');

  // Drop the event first
  try {
    await knex.raw('DROP EVENT IF EXISTS cleanup_processed_messages');
    console.log('✅ Cleanup event dropped');
  } catch (error) {
    console.log('⚠️  Could not drop cleanup event:', error.message);
  }

  // Drop the table
  await knex.schema.dropTableIfExists('processed_messages');
  console.log('✅ Table processed_messages dropped');
};
