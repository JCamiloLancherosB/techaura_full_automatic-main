// migrations/20241217000003_create_order_events.js
/**
 * Migration for order_events table
 * Stores structured bot conversation captures and order-related events
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Create order_events table
    await knex.schema.createTable('order_events', (table) => {
        table.increments('id').primary();
        
        // Reference to order (can be null if event happens before order creation)
        table.string('order_number', 255).nullable().index();
        
        // User/Session Information
        table.string('phone', 50).notNullable().index();
        table.string('session_id', 255).nullable();
        
        // Event Details
        table.string('event_type', 100).notNullable().index(); 
        // e.g., 'order_initiated', 'capacity_selected', 'genre_added', 'order_confirmed', 
        //      'payment_method_selected', 'address_provided', 'order_cancelled'
        
        table.string('event_source', 50).notNullable().index(); // 'bot', 'web', 'api', 'admin'
        table.text('event_description').nullable();
        
        // Event Data (structured)
        table.json('event_data').nullable(); // Flexible storage for event-specific data
        
        // Flow Context
        table.string('flow_name', 100).nullable().index(); // Current flow when event occurred
        table.string('flow_stage', 100).nullable(); // Current stage in flow
        
        // User Input (if applicable)
        table.text('user_input').nullable();
        table.text('bot_response').nullable();
        
        // Metadata
        table.string('ip_address', 100).nullable();
        table.text('user_agent').nullable();
        
        // Timestamp
        table.timestamp('created_at').defaultTo(knex.fn.now()).index();
        
        // Composite indices for common queries
        table.index(['phone', 'created_at']);
        table.index(['order_number', 'created_at']);
        table.index(['event_type', 'created_at']);
        table.index(['phone', 'event_type']);
    });

    console.log('✅ Created order_events table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('order_events');
    console.log('✅ Dropped order_events table');
}

module.exports = { up, down };
