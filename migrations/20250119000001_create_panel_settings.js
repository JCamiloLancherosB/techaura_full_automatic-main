/**
 * Migration: Create panel_settings table
 * Stores admin panel configuration settings with persistence
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    // Check if panel_settings table exists
    const panelSettingsExists = await knex.schema.hasTable('panel_settings');
    if (panelSettingsExists) {
        console.log('✓ panel_settings table already exists');
        return;
    }

    // Create panel_settings table
    await knex.schema.createTable('panel_settings', (table) => {
        table.increments('id').primary();
        table.string('setting_key', 100).unique().notNullable();
        table.json('setting_value').nullable();
        table.string('category', 50).nullable();
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.string('updated_by', 100).nullable();
        
        table.index(['setting_key'], 'idx_key');
        table.index(['category'], 'idx_category');
    });

    console.log('✅ Created panel_settings table');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const panelSettingsExists = await knex.schema.hasTable('panel_settings');
    if (panelSettingsExists) {
        await knex.schema.dropTable('panel_settings');
        console.log('✅ Removed panel_settings table');
    }
}

module.exports = { up, down };
