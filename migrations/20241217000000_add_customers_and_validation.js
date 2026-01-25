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
        const hasCustomerId = await knex.schema.hasColumn('orders', 'customer_id');
        const hasPreferences = await knex.schema.hasColumn('orders', 'preferences');
        const hasCustomization = await knex.schema.hasColumn('orders', 'customization');
        const hasPaymentStatus = await knex.schema.hasColumn('orders', 'payment_status');
        const hasNotes = await knex.schema.hasColumn('orders', 'notes');
        const hasAdminNotes = await knex.schema.hasColumn('orders', 'admin_notes');
        const hasCompletedAt = await knex.schema.hasColumn('orders', 'completed_at');
        const hasStatus = await knex.schema.hasColumn('orders', 'status');
        const hasCreatedAt = await knex.schema.hasColumn('orders', 'created_at');
        const hasProcessingStatus = await knex.schema.hasColumn('orders', 'processing_status');
        // Index inspection relies on MySQL metadata (this project uses mysql2).
        const isMysql = ['mysql', 'mysql2'].includes(knex.client.config.client);
        let indexNames = [];
        const willAddCustomerId = !hasCustomerId;
        const hasCustomerIdAfter = hasCustomerId || willAddCustomerId;

        if (isMysql) {
            const existingIndices = await knex.raw(`
                SELECT DISTINCT INDEX_NAME
                FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'orders'
            `);
            indexNames = existingIndices[0].map(row => row.INDEX_NAME);
        }

        const shouldAddIndex = (indexName, columnExists) => (
            isMysql && columnExists && !indexNames.includes(indexName)
        );

        await knex.schema.alterTable('orders', (table) => {
            // Check if columns exist before adding
            if (!hasCustomerId) {
                table.uuid('customer_id').nullable();
            }
            if (!hasPreferences) {
                table.json('preferences').nullable();
            }
            if (!hasCustomization) {
                table.json('customization').nullable();
            }
            if (!hasPaymentStatus) {
                table.string('payment_status', 50).nullable();
            }
            if (!hasNotes) {
                table.text('notes').nullable();
            }
            if (!hasAdminNotes) {
                table.json('admin_notes').nullable();
            }
            if (!hasCompletedAt) {
                table.timestamp('completed_at').nullable();
            }
            
            // Add foreign key to customers
            if (!hasCustomerId) {
                table.foreign('customer_id').references('id').inTable('customers').onDelete('SET NULL');
            }
            
            // Add indexes for better performance
            if (shouldAddIndex('orders_customer_id_index', hasCustomerIdAfter)) {
                table.index(['customer_id']);
            }
            if (shouldAddIndex('orders_status_index', hasStatus)) {
                table.index(['status']);
            }
            if (shouldAddIndex('orders_processing_status_index', hasProcessingStatus)) {
                table.index(['processing_status']);
            }
            if (shouldAddIndex('orders_created_at_index', hasCreatedAt)) {
                table.index(['created_at']);
            }
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
        const hasCustomerId = await knex.schema.hasColumn('orders', 'customer_id');
        const hasPreferences = await knex.schema.hasColumn('orders', 'preferences');
        const hasCustomization = await knex.schema.hasColumn('orders', 'customization');
        const hasPaymentStatus = await knex.schema.hasColumn('orders', 'payment_status');
        const hasNotes = await knex.schema.hasColumn('orders', 'notes');
        const hasAdminNotes = await knex.schema.hasColumn('orders', 'admin_notes');
        const hasCompletedAt = await knex.schema.hasColumn('orders', 'completed_at');

        await knex.schema.alterTable('orders', (table) => {
            if (hasCustomerId) {
                table.dropColumn('customer_id');
            }
            if (hasPreferences) {
                table.dropColumn('preferences');
            }
            if (hasCustomization) {
                table.dropColumn('customization');
            }
            if (hasPaymentStatus) {
                table.dropColumn('payment_status');
            }
            if (hasNotes) {
                table.dropColumn('notes');
            }
            if (hasAdminNotes) {
                table.dropColumn('admin_notes');
            }
            if (hasCompletedAt) {
                table.dropColumn('completed_at');
            }
        });
    }
    
    await knex.schema.dropTableIfExists('customers');
}

module.exports = { up, down };
