/**
 * Migration: Create aggregated analytics tables
 * Creates tables for daily order stats, intent conversion stats, and followup performance
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Create daily_order_stats table
    await knex.schema.createTable('daily_order_stats', (table) => {
        table.increments('id').primary();
        
        // Date dimension
        table.date('date').notNullable().index();
        
        // Order metrics
        table.integer('orders_initiated').defaultTo(0);
        table.integer('orders_completed').defaultTo(0);
        table.integer('orders_cancelled').defaultTo(0);
        table.decimal('total_revenue', 12, 2).defaultTo(0);
        table.decimal('average_order_value', 12, 2).defaultTo(0);
        
        // Conversion metrics
        table.decimal('conversion_rate', 5, 2).defaultTo(0); // percentage
        table.integer('unique_users').defaultTo(0);
        
        // Timestamps
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        
        // Unique constraint on date
        table.unique(['date']);
    });

    console.log('✅ Created daily_order_stats table');

    // Create intent_conversion_stats table
    await knex.schema.createTable('intent_conversion_stats', (table) => {
        table.increments('id').primary();
        
        // Date and intent dimensions
        table.date('date').notNullable().index();
        table.string('intent', 100).notNullable().index();
        
        // Intent metrics
        table.integer('intent_count').defaultTo(0);
        table.integer('successful_conversions').defaultTo(0);
        table.decimal('conversion_rate', 5, 2).defaultTo(0); // percentage
        table.decimal('avg_confidence', 5, 2).defaultTo(0);
        
        // Timestamps
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        
        // Unique constraint on date + intent
        table.unique(['date', 'intent']);
    });

    console.log('✅ Created intent_conversion_stats table');

    // Create followup_performance_daily table
    await knex.schema.createTable('followup_performance_daily', (table) => {
        table.increments('id').primary();
        
        // Date dimension
        table.date('date').notNullable().index();
        
        // Follow-up metrics
        table.integer('followups_sent').defaultTo(0);
        table.integer('followups_responded').defaultTo(0);
        table.decimal('response_rate', 5, 2).defaultTo(0); // percentage
        table.integer('followup_orders').defaultTo(0); // orders resulting from follow-ups
        table.decimal('followup_revenue', 12, 2).defaultTo(0);
        
        // Timing metrics
        table.decimal('avg_response_time_minutes', 10, 2).defaultTo(0);
        
        // Timestamps
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        
        // Unique constraint on date
        table.unique(['date']);
    });

    console.log('✅ Created followup_performance_daily table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('followup_performance_daily');
    await knex.schema.dropTableIfExists('intent_conversion_stats');
    await knex.schema.dropTableIfExists('daily_order_stats');
    console.log('✅ Dropped analytics aggregate tables');
}

module.exports = { up, down };
