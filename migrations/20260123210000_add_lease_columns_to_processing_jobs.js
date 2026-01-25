/**
 * Migration: Add lease-based columns to processing_jobs table
 * 
 * This migration adds columns needed for lease-based job processing
 * to support recoverable jobs that can be retried if the bot crashes.
 * 
 * New columns:
 * - locked_by: Identifier of the worker/process that owns the lease
 * - locked_until: Timestamp when the lease expires
 * - attempts: Number of times this job has been attempted
 * - last_error: Last error message if job failed
 */

/**
 * @param {import('knex').Knex} knex
 */
async function indexExists(knex, tableName, indexName) {
    const res = await knex.raw(
        `
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    LIMIT 1
    `,
        [tableName, indexName]
    );

    return Boolean(res?.[0]?.length);
}

async function up(knex) {
    console.log('🔧 Adding lease-based columns to processing_jobs...');
    
    const processingJobsExists = await knex.schema.hasTable('processing_jobs');
    if (!processingJobsExists) {
        console.log('⚠️  processing_jobs table does not exist, skipping migration');
        return;
    }
    
    // Check if columns already exist
    const hasLockedBy = await knex.schema.hasColumn('processing_jobs', 'locked_by');
    const hasLockedUntil = await knex.schema.hasColumn('processing_jobs', 'locked_until');
    const hasAttempts = await knex.schema.hasColumn('processing_jobs', 'attempts');
    const hasLastError = await knex.schema.hasColumn('processing_jobs', 'last_error');
    
    await knex.schema.alterTable('processing_jobs', (table) => {
        // Add lease management columns
        if (!hasLockedBy) {
            table.string('locked_by', 100).nullable().comment('Worker/process that owns the lease');
            console.log('✅ Added locked_by column');
        }
        
        if (!hasLockedUntil) {
            table.timestamp('locked_until').nullable().comment('When the lease expires');
            console.log('✅ Added locked_until column');
        }
        
        if (!hasAttempts) {
            table.integer('attempts').defaultTo(0).notNullable().comment('Number of retry attempts');
            console.log('✅ Added attempts column');
        }
        
        if (!hasLastError) {
            table.text('last_error').nullable().comment('Last error message');
            console.log('✅ Added last_error column');
        }
    });
    
    // Add indexes for efficient lease acquisition
    console.log('🔧 Adding indexes for lease management...');
    
    // Index for finding jobs available for lease acquisition
    // Jobs with status='pending' or expired leases (locked_until < NOW())
    const leaseAcquisitionIndex = 'idx_processing_jobs_lease_acquisition';
    const hasLeaseAcquisitionIndex = await indexExists(knex, 'processing_jobs', leaseAcquisitionIndex);
    if (!hasLeaseAcquisitionIndex) {
        await knex.schema.alterTable('processing_jobs', (table) => {
            table.index(['status', 'locked_until', 'created_at'], leaseAcquisitionIndex);
        });
    } else {
        console.log(`⚠️  Index ${leaseAcquisitionIndex} already exists`);
    }
    
    // Index for finding expired leases
    const lockedUntilIndex = 'idx_processing_jobs_locked_until';
    const hasLockedUntilIndex = await indexExists(knex, 'processing_jobs', lockedUntilIndex);
    if (!hasLockedUntilIndex) {
        await knex.schema.alterTable('processing_jobs', (table) => {
            table.index(['locked_until'], lockedUntilIndex);
        });
    } else {
        console.log(`⚠️  Index ${lockedUntilIndex} already exists`);
    }
    
    console.log('✅ Lease-based columns and indexes added successfully');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back lease-based columns...');
    
    const processingJobsExists = await knex.schema.hasTable('processing_jobs');
    if (!processingJobsExists) {
        console.log('⚠️  processing_jobs table does not exist, skipping rollback');
        return;
    }
    
    // Drop indexes
    await knex.raw(`DROP INDEX IF EXISTS idx_processing_jobs_lease_acquisition`);
    await knex.raw(`DROP INDEX IF EXISTS idx_processing_jobs_locked_until`);
    
    await knex.schema.alterTable('processing_jobs', (table) => {
        table.dropColumn('locked_by');
        table.dropColumn('locked_until');
        table.dropColumn('attempts');
        table.dropColumn('last_error');
    });
    
    console.log('✅ Rollback completed');
}

module.exports = { up, down };
