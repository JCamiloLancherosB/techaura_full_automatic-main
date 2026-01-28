/**
 * Migration: Create chatbot_events table
 * 
 * This table stores all chatbot events for audit and analytics purposes.
 * Events include: messages, intents, state changes, order confirmations, etc.
 * 
 * Columns:
 * - id: Primary key
 * - conversation_id: Unique identifier for the conversation session
 * - order_id: Associated order (nullable)
 * - phone: Customer phone number
 * - event_type: Type of event (e.g., ORDER_CONFIRMED, STATUS_CHANGED, MESSAGE_RECEIVED)
 * - payload_json: JSON payload with event-specific data
 * - created_at: Timestamp when the event occurred
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating chatbot_events table...');
    
    // Check if table already exists
    const tableExists = await knex.schema.hasTable('chatbot_events');
    if (tableExists) {
        console.log('ℹ️  chatbot_events table already exists, skipping creation');
        return;
    }

    await knex.schema.createTable('chatbot_events', (table) => {
        table.increments('id').primary();
        table.string('conversation_id', 100).notNullable().index();
        table.string('order_id', 100).nullable().index();
        table.string('phone', 50).notNullable().index();
        table.string('event_type', 100).notNullable().index();
        table.json('payload_json').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    });
    
    console.log('✅ chatbot_events table created successfully');
    
    // Add composite indices for common queries
    console.log('📦 Adding composite indices...');
    
    // Index for filtering by date range and type
    try {
        await knex.schema.alterTable('chatbot_events', (table) => {
            table.index(['event_type', 'created_at'], 'idx_chatbot_events_type_created');
        });
        console.log('✅ Added composite index idx_chatbot_events_type_created');
    } catch (error) {
        // Index might already exist
        if (error.code === 'ER_DUP_KEYNAME' || error.message?.includes('Duplicate key name')) {
            console.log('ℹ️  Index idx_chatbot_events_type_created already exists');
        } else {
            throw error;
        }
    }
    
    // Index for phone + date range queries
    try {
        await knex.schema.alterTable('chatbot_events', (table) => {
            table.index(['phone', 'created_at'], 'idx_chatbot_events_phone_created');
        });
        console.log('✅ Added composite index idx_chatbot_events_phone_created');
    } catch (error) {
        // Index might already exist
        if (error.code === 'ER_DUP_KEYNAME' || error.message?.includes('Duplicate key name')) {
            console.log('ℹ️  Index idx_chatbot_events_phone_created already exists');
        } else {
            throw error;
        }
    }
    
    console.log('✅ Composite indices created');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Dropping chatbot_events table...');
    
    const tableExists = await knex.schema.hasTable('chatbot_events');
    if (tableExists) {
        await knex.schema.dropTable('chatbot_events');
        console.log('✅ chatbot_events table dropped');
    } else {
        console.log('ℹ️  chatbot_events table does not exist, nothing to drop');
    }
}

module.exports = { up, down };
