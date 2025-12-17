/**
 * Migration: Add customers table and update orders table
 * Adds proper customer management and order validation fields
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Create customers table
    const customersExists = await knex.schema.hasTable('customers');
    if (!customersExists) {
        await knex.schema.createTable('customers', (table) => {
            table.uuid('id').primary();
            table.string('name', 100).notNullable();
            table.string('phone', 20).notNullable().unique();
            table.string('email', 100).nullable();
            table.string('address', 200).nullable();
            table.string('city', 100).nullable();
            table.string('country', 100).defaultTo('Colombia');
            table.json('preferences').nullable();
            table.text('notes').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            table.timestamp('last_interaction').defaultTo(knex.fn.now());
            table.timestamp('last_order_date').nullable();
            table.integer('total_orders').defaultTo(0);
            table.decimal('total_spent', 12, 2).defaultTo(0);
            table.boolean('vip_status').defaultTo(false);
            
            table.index(['phone']);
            table.index(['email']);
            table.index(['vip_status']);
            table.index(['created_at']);
        });
    }

    // Update orders table to add new fields if they don't exist
    const ordersExists = await knex.schema.hasTable('orders');
    if (ordersExists) {
        await knex.schema.alterTable('orders', (table) => {
            // Check if columns exist before adding
            table.uuid('customer_id').nullable();
            table.json('preferences').nullable();
            table.json('customization').nullable();
            table.string('payment_status', 50).nullable();
            table.text('notes').nullable();
            table.json('admin_notes').nullable();
            table.timestamp('completed_at').nullable();
            
            // Add foreign key to customers
            table.foreign('customer_id').references('id').inTable('customers').onDelete('SET NULL');
            
            // Add indexes for better performance
            table.index(['customer_id']);
            table.index(['status']);
            table.index(['processing_status']);
            table.index(['created_at']);
        });
    }

    // Create processing_jobs table for file processing tracking
    const processingJobsExists = await knex.schema.hasTable('processing_jobs');
    if (!processingJobsExists) {
        await knex.schema.createTable('processing_jobs', (table) => {
            table.uuid('id').primary();
            table.uuid('order_id').nullable();
            table.string('job_type', 50).notNullable();
            table.string('status', 50).notNullable().defaultTo('pending');
            table.integer('progress').defaultTo(0);
            table.integer('total_files').defaultTo(0);
            table.integer('processed_files').defaultTo(0);
            table.json('errors').nullable();
            table.json('metadata').nullable();
            table.timestamp('started_at').nullable();
            table.timestamp('completed_at').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            
            table.foreign('order_id').references('id').inTable('orders').onDelete('CASCADE');
            
            table.index(['order_id']);
            table.index(['status']);
            table.index(['created_at']);
        });
    }

    // Create file_uploads table for tracking uploaded files
    const fileUploadsExists = await knex.schema.hasTable('file_uploads');
    if (!fileUploadsExists) {
        await knex.schema.createTable('file_uploads', (table) => {
            table.uuid('id').primary();
            table.uuid('processing_job_id').nullable();
            table.string('filename', 255).notNullable();
            table.string('original_name', 255).notNullable();
            table.string('mimetype', 100).notNullable();
            table.integer('size').notNullable();
            table.string('path', 500).notNullable();
            table.string('status', 50).notNullable().defaultTo('uploaded');
            table.json('validation_errors').nullable();
            table.integer('total_records').defaultTo(0);
            table.integer('valid_records').defaultTo(0);
            table.integer('invalid_records').defaultTo(0);
            table.timestamp('uploaded_at').defaultTo(knex.fn.now());
            table.timestamp('processed_at').nullable();
            
            table.foreign('processing_job_id').references('id').inTable('processing_jobs').onDelete('CASCADE');
            
            table.index(['processing_job_id']);
            table.index(['status']);
            table.index(['uploaded_at']);
        });
    }
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('file_uploads');
    await knex.schema.dropTableIfExists('processing_jobs');
    
    // Remove added columns from orders table
    const ordersExists = await knex.schema.hasTable('orders');
    if (ordersExists) {
        await knex.schema.alterTable('orders', (table) => {
            table.dropColumn('customer_id');
            table.dropColumn('preferences');
            table.dropColumn('customization');
            table.dropColumn('payment_status');
            table.dropColumn('notes');
            table.dropColumn('admin_notes');
            table.dropColumn('completed_at');
        });
    }
    
    await knex.schema.dropTableIfExists('customers');
}

module.exports = { up, down };
