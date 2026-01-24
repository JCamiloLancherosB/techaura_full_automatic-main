/**
 * Migration: Create external source sync tables
 * 
 * This migration creates:
 * 1. sync_runs - Track all sync operations from external sources
 * 2. sync_errors - Log errors during sync operations
 * 3. content_index - Index of content from external sources
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating external source sync tables...');
    
    // ============================================
    // SYNC_RUNS TABLE - Track sync operations
    // ============================================
    const syncRunsExists = await knex.schema.hasTable('sync_runs');
    if (!syncRunsExists) {
        await knex.schema.createTable('sync_runs', (table) => {
            table.increments('id').primary();
            table.string('source_type', 50).notNullable().comment('csv, api, drive, usb, etc.');
            table.string('source_identifier', 255).notNullable().comment('File path, URL, or unique identifier');
            table.string('status', 50).notNullable().comment('pending, in_progress, completed, failed, cancelled');
            table.timestamp('started_at').nullable();
            table.timestamp('completed_at').nullable();
            table.integer('items_processed').defaultTo(0).comment('Number of items successfully processed');
            table.integer('items_failed').defaultTo(0).comment('Number of items that failed');
            table.integer('items_skipped').defaultTo(0).comment('Number of items skipped');
            table.json('sync_metadata').nullable().comment('Additional sync metadata');
            table.text('error_message').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            
            // Indices for performance
            table.index(['source_type'], 'idx_sync_runs_source_type');
            table.index(['status'], 'idx_sync_runs_status');
            table.index(['created_at'], 'idx_sync_runs_created');
            table.index(['source_type', 'status'], 'idx_sync_runs_type_status');
        });
        console.log('✅ Created sync_runs table');
    } else {
        console.log('ℹ️  sync_runs table already exists');
    }
    
    // ============================================
    // SYNC_ERRORS TABLE - Log sync errors
    // ============================================
    const syncErrorsExists = await knex.schema.hasTable('sync_errors');
    if (!syncErrorsExists) {
        await knex.schema.createTable('sync_errors', (table) => {
            table.increments('id').primary();
            table.integer('sync_run_id').notNullable().comment('Reference to sync_runs.id');
            table.string('error_type', 100).notNullable().comment('validation, network, parsing, etc.');
            table.string('error_code', 50).nullable().comment('Specific error code');
            table.text('error_message').notNullable();
            table.text('error_details').nullable().comment('Stack trace or additional details');
            table.string('item_identifier', 255).nullable().comment('Identifier of the failed item');
            table.json('item_data').nullable().comment('Data of the item that failed');
            table.boolean('is_retryable').defaultTo(true).comment('Whether this error can be retried');
            table.timestamp('created_at').defaultTo(knex.fn.now());
            
            // Indices for performance
            table.index(['sync_run_id'], 'idx_sync_errors_run_id');
            table.index(['error_type'], 'idx_sync_errors_type');
            table.index(['created_at'], 'idx_sync_errors_created');
            
            // Foreign key
            table.foreign('sync_run_id')
                .references('id')
                .inTable('sync_runs')
                .onDelete('CASCADE')
                .onUpdate('CASCADE');
        });
        console.log('✅ Created sync_errors table');
    } else {
        console.log('ℹ️  sync_errors table already exists');
    }
    
    // ============================================
    // CONTENT_INDEX TABLE - Index content from external sources
    // ============================================
    const contentIndexExists = await knex.schema.hasTable('content_index');
    if (!contentIndexExists) {
        await knex.schema.createTable('content_index', (table) => {
            table.increments('id').primary();
            table.string('content_type', 50).notNullable().comment('music, video, movie, etc.');
            table.string('title', 500).notNullable();
            table.string('artist', 255).nullable().comment('Artist/Author/Director');
            table.string('genre', 100).nullable();
            table.string('source_type', 50).notNullable().comment('csv, api, drive, usb');
            table.string('source_identifier', 255).notNullable().comment('File path, URL, or identifier');
            table.string('external_id', 255).nullable().comment('ID from external source');
            table.json('metadata').nullable().comment('Additional content metadata');
            table.boolean('is_available').defaultTo(true).comment('Whether content is available');
            table.timestamp('last_synced_at').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            
            // Indices for performance
            table.index(['content_type'], 'idx_content_index_type');
            table.index(['source_type'], 'idx_content_index_source');
            table.index(['title'], 'idx_content_index_title');
            table.index(['artist'], 'idx_content_index_artist');
            table.index(['genre'], 'idx_content_index_genre');
            table.index(['is_available'], 'idx_content_index_available');
            table.index(['content_type', 'is_available'], 'idx_content_index_type_available');
            // Unique constraint on external_id per source
            table.unique(['source_type', 'source_identifier', 'external_id'], 'uniq_content_source_external_id');
        });
        console.log('✅ Created content_index table');
    } else {
        console.log('ℹ️  content_index table already exists');
    }
    
    console.log('✅ External source sync tables creation completed');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back external source sync tables...');
    
    // Drop tables in reverse order (due to foreign keys)
    await knex.schema.dropTableIfExists('content_index');
    console.log('✅ Dropped content_index table');
    
    await knex.schema.dropTableIfExists('sync_errors');
    console.log('✅ Dropped sync_errors table');
    
    await knex.schema.dropTableIfExists('sync_runs');
    console.log('✅ Dropped sync_runs table');
    
    console.log('✅ Rollback completed');
}

module.exports = { up, down };
