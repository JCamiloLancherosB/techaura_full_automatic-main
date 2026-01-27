/**
 * Migration: Create message_decisions table
 * 
 * This table stores decision traces for the message processing pipeline.
 * Used for debugging and auditing when the bot doesn't respond.
 * 
 * Columns:
 * - id: Primary key
 * - trace_id: Unique trace identifier
 * - message_id: WhatsApp message ID
 * - phone_hash: SHA-256 hash of phone number (NO raw PII)
 * - timestamp: When the decision was made
 * - stage: Pipeline stage (INBOUND_RECEIVED, DEDUPE, POLICY, ROUTER, FLOW, AI, SEND)
 * - decision: Outcome (RESPOND, SKIP, DEFER, ERROR)
 * - reason_code: Specific reason code
 * - reason_detail: Short, redacted description
 * - next_eligible_at: When message can be processed next (for DEFER)
 * - correlation_id: Request correlation ID
 * - created_at: Record creation timestamp
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating message_decisions table...');
    
    // Check if table already exists
    const tableExists = await knex.schema.hasTable('message_decisions');
    if (tableExists) {
        console.log('ℹ️  message_decisions table already exists, skipping creation');
        return;
    }

    await knex.schema.createTable('message_decisions', (table) => {
        table.increments('id').primary();
        table.string('trace_id', 100).notNullable().unique();
        table.string('message_id', 255).notNullable().index();
        table.string('phone_hash', 64).notNullable().index();
        table.timestamp('timestamp').notNullable().index();
        table.string('stage', 50).notNullable().index();
        table.string('decision', 20).notNullable().index();
        table.string('reason_code', 50).notNullable().index();
        table.string('reason_detail', 500).nullable();
        table.timestamp('next_eligible_at').nullable();
        table.string('correlation_id', 100).nullable().index();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    
    console.log('✅ message_decisions table created successfully');
    
    // Add composite indices for common queries
    console.log('📦 Adding composite indices...');
    
    // Index for filtering by phone_hash and timestamp (most common admin query)
    await knex.raw(`
        CREATE INDEX idx_message_decisions_phone_timestamp 
        ON message_decisions (phone_hash, timestamp)
    `);
    
    // Index for filtering by decision type and timestamp
    await knex.raw(`
        CREATE INDEX idx_message_decisions_decision_timestamp 
        ON message_decisions (decision, timestamp)
    `);
    
    // Index for filtering by reason_code and timestamp
    await knex.raw(`
        CREATE INDEX idx_message_decisions_reason_timestamp 
        ON message_decisions (reason_code, timestamp)
    `);
    
    console.log('✅ Composite indices created');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Dropping message_decisions table...');
    
    const tableExists = await knex.schema.hasTable('message_decisions');
    if (tableExists) {
        await knex.schema.dropTable('message_decisions');
        console.log('✅ message_decisions table dropped');
    } else {
        console.log('ℹ️  message_decisions table does not exist, nothing to drop');
    }
}

module.exports = { up, down };
