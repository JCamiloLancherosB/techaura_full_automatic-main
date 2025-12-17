// migrations/20241217000001_create_usb_orders.js
/**
 * Migration for usb_orders table
 * Stores orders submitted via web/API interface
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Create usb_orders table
    await knex.schema.createTable('usb_orders', (table) => {
        table.increments('id').primary();
        
        // USB Configuration
        table.string('usb_capacity', 20).notNullable().index();
        table.decimal('usb_price', 10, 2).notNullable();
        
        // Customer Information
        table.string('name', 255).notNullable();
        table.string('phone', 50).notNullable().index();
        table.string('email', 255).nullable();
        
        // Address Information
        table.string('department', 100).notNullable();
        table.string('city', 100).notNullable();
        table.string('address', 500).notNullable();
        table.string('neighborhood', 255).notNullable();
        table.string('house', 100).notNullable();
        
        // Content Selection (JSON)
        table.json('selected_content').nullable();
        
        // Request Metadata
        table.string('ip_address', 100).nullable();
        table.text('user_agent').nullable();
        
        // Order Status
        table.enum('status', ['pending', 'confirmed', 'processing', 'completed', 'cancelled'])
            .defaultTo('pending')
            .index();
        
        // Audit Fields
        table.timestamp('created_at').defaultTo(knex.fn.now()).index();
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.timestamp('confirmed_at').nullable();
        table.timestamp('completed_at').nullable();
        
        // Additional indices for common queries
        table.index(['status', 'created_at']);
        table.index(['phone', 'created_at']);
    });

    console.log('✅ Created usb_orders table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('usb_orders');
    console.log('✅ Dropped usb_orders table');
}

module.exports = { up, down };
