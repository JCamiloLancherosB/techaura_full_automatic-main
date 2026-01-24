/**
 * Migration: Create analytics_watermarks table
 * Stores watermarks for incremental analytics processing
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Create analytics_watermarks table
    await knex.schema.createTable('analytics_watermarks', (table) => {
        table.increments('id').primary();
        
        // Watermark name (e.g., 'orders_stats_v1', 'intent_conversion_v1')
        table.string('name', 100).notNullable().unique();
        
        // Last processed event ID or timestamp
        table.integer('last_event_id').nullable().index();
        table.timestamp('last_processed_at').nullable().index();
        
        // Metadata
        table.integer('total_processed').defaultTo(0);
        table.text('metadata').nullable(); // JSON string for additional info
        
        // Timestamps
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    console.log('✅ Created analytics_watermarks table');
    
    // Insert initial watermarks
    await knex('analytics_watermarks').insert([
        {
            name: 'orders_stats_v1',
            last_event_id: 0,
            last_processed_at: new Date('2020-01-01'),
            total_processed: 0
        },
        {
            name: 'intent_conversion_v1',
            last_event_id: 0,
            last_processed_at: new Date('2020-01-01'),
            total_processed: 0
        },
        {
            name: 'followup_performance_v1',
            last_event_id: 0,
            last_processed_at: new Date('2020-01-01'),
            total_processed: 0
        }
    ]);

    console.log('✅ Initialized analytics watermarks');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('analytics_watermarks');
    console.log('✅ Dropped analytics_watermarks table');
}

module.exports = { up, down };
