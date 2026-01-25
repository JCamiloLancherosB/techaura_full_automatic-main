/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    const exists = await knex.schema.hasTable('flow_transitions');
    if (exists) return;

    await knex.schema.createTable('flow_transitions', (table) => {
        table.increments('id').unsigned().primary();
        table.string('order_number', 255).nullable();
        table.string('phone', 50).notNullable();
        table.string('session_id', 255).nullable();
        table.string('previous_state', 100).nullable();
        table.string('new_state', 100).notNullable();
        table.string('flow_name', 100).nullable();
        table.text('reason').nullable();
        table.json('metadata').nullable();
        table.string('triggered_by', 100).nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index(['phone'], 'flow_transitions_phone_index');
        table.index(['created_at'], 'flow_transitions_created_at_index');
        table.index(['order_number'], 'flow_transitions_order_number_index');
    });
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    await knex.schema.dropTableIfExists('flow_transitions');
}

module.exports = { up, down };
