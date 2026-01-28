/**
 * Migration: Create message_telemetry_events table
 * 
 * This table stores telemetry events for inbound message processing pipeline.
 * Tracks state transitions: RECEIVED → QUEUED → PROCESSING → RESPONDED/SKIPPED/ERROR
 * 
 * Columns:
 * - id: Primary key
 * - event_id: Unique event identifier
 * - message_id: WhatsApp message ID
 * - phone_hash: SHA-256 hash of phone number (NO raw PII)
 * - timestamp: When the event occurred
 * - state: Current state (RECEIVED, QUEUED, PROCESSING, RESPONDED, SKIPPED, ERROR)
 * - previous_state: Previous state (for state transitions)
 * - skip_reason: Reason for skipping (when state is SKIPPED)
 * - error_type: Type of error (when state is ERROR)
 * - detail: Short, redacted description
 * - processing_time_ms: Processing time in milliseconds
 * - stage: Pipeline stage where event occurred
 * - correlation_id: Request correlation ID
 * - created_at: Record creation timestamp
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating message_telemetry_events table...');

    // Check if table already exists
    const tableExists = await knex.schema.hasTable('message_telemetry_events');
    if (tableExists) {
        console.log('ℹ️  message_telemetry_events table already exists, skipping creation');
        return;
    }

    await knex.schema.createTable('message_telemetry_events', (table) => {
        table.increments('id').primary();
        table.string('event_id', 100).notNullable().unique();
        table.string('message_id', 255).notNullable().index();
        table.string('phone_hash', 64).notNullable().index();
        table.timestamp('timestamp').notNullable().index();
        table.string('state', 20).notNullable().index();
        table.string('previous_state', 20).nullable();
        table.string('skip_reason', 50).nullable().index();
        table.string('error_type', 50).nullable().index();
        table.string('detail', 500).nullable();
        table.integer('processing_time_ms').nullable();
        table.string('stage', 50).nullable();
        table.string('correlation_id', 100).nullable().index();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    console.log('✅ message_telemetry_events table created successfully');

    // Add composite indices for common queries
    console.log('📦 Adding composite indices...');

    // Index for filtering by phone_hash and timestamp (most common admin query)
    await knex.raw(`
        CREATE INDEX idx_telemetry_phone_timestamp 
        ON message_telemetry_events (phone_hash, timestamp)
    `);

    // Index for filtering by state and timestamp (funnel queries)
    await knex.raw(`
        CREATE INDEX idx_telemetry_state_timestamp 
        ON message_telemetry_events (state, timestamp)
    `);

    // Index for filtering by message_id (message journey queries)
    await knex.raw(`
        CREATE INDEX idx_telemetry_message_timestamp 
        ON message_telemetry_events (message_id, timestamp)
    `);

    console.log('✅ Composite indices created');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Dropping message_telemetry_events table...');

    const tableExists = await knex.schema.hasTable('message_telemetry_events');
    if (tableExists) {
        await knex.schema.dropTable('message_telemetry_events');
        console.log('✅ message_telemetry_events table dropped');
    } else {
        console.log('ℹ️  message_telemetry_events table does not exist, nothing to drop');
    }
}

module.exports = { up, down };
