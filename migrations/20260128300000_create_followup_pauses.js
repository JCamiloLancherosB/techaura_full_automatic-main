/**
 * Migration: Create followup_pauses table
 * Stores manual pause/unpause status for follow-ups per phone number
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Check if followup_pauses table exists
    const tableExists = await knex.schema.hasTable('followup_pauses');
    if (tableExists) {
        console.log('✓ followup_pauses table already exists');
        return;
    }

    // Create followup_pauses table
    await knex.schema.createTable('followup_pauses', (table) => {
        table.increments('id').primary();
        table.string('phone', 20).notNullable();
        table.string('phone_hash', 64).notNullable();
        table.boolean('is_paused').notNullable().defaultTo(true);
        table.string('paused_by', 100).nullable();
        table.text('pause_reason').nullable();
        table.timestamp('paused_at').defaultTo(knex.fn.now());
        table.timestamp('unpaused_at').nullable();
        table.string('unpaused_by', 100).nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        
        // Indexes for efficient lookups
        table.unique(['phone'], 'idx_followup_pauses_phone');
        table.index(['phone_hash'], 'idx_followup_pauses_phone_hash');
        table.index(['is_paused'], 'idx_followup_pauses_status');
    });

    console.log('✅ Created followup_pauses table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const tableExists = await knex.schema.hasTable('followup_pauses');
    if (tableExists) {
        await knex.schema.dropTable('followup_pauses');
        console.log('✅ Removed followup_pauses table');
    }
}

module.exports = { up, down };
