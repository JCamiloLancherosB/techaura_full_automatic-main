// migrations/20241217000002_create_processing_job_logs.js
/**
 * Migration for processing_job_logs table
 * Stores detailed logs per processing job
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Create processing_job_logs table
    await knex.schema.createTable('processing_job_logs', (table) => {
        table.increments('id').primary();
        
        // Reference to processing job
        table.integer('job_id').unsigned().notNullable().index();
        
        // Log Details
        table.enum('level', ['debug', 'info', 'warning', 'error']).notNullable().index();
        table.string('category', 50).notNullable().index(); // e.g., 'copy', 'verify', 'format', 'system'
        table.text('message').notNullable();
        table.json('details').nullable(); // Additional structured data
        
        // File-specific info (if applicable)
        table.string('file_path', 500).nullable();
        table.integer('file_size').nullable();
        table.string('error_code', 50).nullable().index();
        
        // Timestamp
        table.timestamp('created_at').defaultTo(knex.fn.now()).index();
        
        // Composite indices for common queries
        table.index(['job_id', 'created_at']);
        table.index(['job_id', 'level']);
        table.index(['level', 'created_at']);
    });

    console.log('✅ Created processing_job_logs table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('processing_job_logs');
    console.log('✅ Dropped processing_job_logs table');
}

module.exports = { up, down };
