// migrations/20260123000020_add_observability_fields.js
/**
 * Migration for adding observability v1 fields
 * - Adds correlation_id to order_events and processing_job_logs
 * - Adds structured log fields to order_events (phone_hash, order_id, flow, event)
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔄 Adding observability v1 fields...');

    // Check if order_events table exists
    const orderEventsExists = await knex.schema.hasTable('order_events');
    
    if (orderEventsExists) {
        console.log('📦 Updating order_events table...');
        
        await knex.schema.alterTable('order_events', (table) => {
            // Add correlation_id for tracking related events
            table.string('correlation_id', 255).nullable().index();
            
            // Add phone_hash for privacy-preserving logging (hashed phone numbers)
            table.string('phone_hash', 64).nullable().index();
            
            // Note: order_number already exists as order_id equivalent
            // flow_name already exists as flow equivalent
            // event_type already exists as event equivalent
        });
        
        console.log('✅ Updated order_events table with observability fields');
    } else {
        console.log('⚠️  order_events table does not exist, skipping');
    }

    // Check if processing_job_logs table exists
    const jobLogsExists = await knex.schema.hasTable('processing_job_logs');
    
    if (jobLogsExists) {
        console.log('📦 Updating processing_job_logs table...');
        
        await knex.schema.alterTable('processing_job_logs', (table) => {
            // Add correlation_id for tracking related logs
            table.string('correlation_id', 255).nullable().index();
        });
        
        console.log('✅ Updated processing_job_logs table with observability fields');
    } else {
        console.log('⚠️  processing_job_logs table does not exist, skipping');
    }

    console.log('✅ Observability v1 fields migration complete');
}

/**
 * Rollback migration
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔄 Rolling back observability v1 fields...');

    const orderEventsExists = await knex.schema.hasTable('order_events');
    if (orderEventsExists) {
        await knex.schema.alterTable('order_events', (table) => {
            table.dropColumn('correlation_id');
            table.dropColumn('phone_hash');
        });
        console.log('✅ Removed observability fields from order_events');
    }

    const jobLogsExists = await knex.schema.hasTable('processing_job_logs');
    if (jobLogsExists) {
        await knex.schema.alterTable('processing_job_logs', (table) => {
            table.dropColumn('correlation_id');
        });
        console.log('✅ Removed observability fields from processing_job_logs');
    }

    console.log('✅ Observability v1 rollback complete');
}

module.exports = { up, down };
