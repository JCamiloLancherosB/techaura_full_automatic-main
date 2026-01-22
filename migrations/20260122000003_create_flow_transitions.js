/**
 * Migration: Create flow_transitions table
 * Tracks state transitions for orders/sessions to ensure proper flow management
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Create flow_transitions table
    await knex.schema.createTable('flow_transitions', (table) => {
        table.increments('id').primary();
        
        // Order/Session Reference
        table.string('order_number', 255).nullable().index();
        table.string('phone', 50).notNullable().index();
        table.string('session_id', 255).nullable();
        
        // State Transition Details
        table.string('previous_state', 100).nullable();
        table.string('new_state', 100).notNullable().index();
        table.string('flow_name', 100).nullable(); // e.g., 'musicUsb', 'videosUsb', 'orderFlow'
        
        // Transition Context
        table.text('reason').nullable(); // Why the transition occurred
        table.json('metadata').nullable(); // Additional context data
        
        // User/System Actor
        table.string('triggered_by', 100).nullable(); // 'user', 'system', 'admin', user_id
        
        // Timestamp
        table.timestamp('created_at').defaultTo(knex.fn.now()).index();
        
        // Composite indices for common queries
        table.index(['phone', 'created_at']);
        table.index(['order_number', 'created_at']);
        table.index(['new_state', 'created_at']);
        table.index(['phone', 'new_state']);
    });

    console.log('✅ Created flow_transitions table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('flow_transitions');
    console.log('✅ Dropped flow_transitions table');
}

module.exports = { up, down };
