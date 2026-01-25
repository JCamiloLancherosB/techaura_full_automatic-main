/**
 * Migration: Add customers table and update orders table
 * Adds proper customer management and order validation fields
 */

/**
 * @param {import('knex').Knex} knex
 */

async function getColumnType(knex, tableName, columnName) {
    const res = await knex.raw(
        `
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
    `,
        [tableName, columnName]
    );

    // mysql2: res[0] es array de rows
    const row = res?.[0]?.[0];
    return row?.COLUMN_TYPE ? String(row.COLUMN_TYPE).toLowerCase() : null;
}

async function foreignKeyExists(knex, tableName, constraintName) {
    const res = await knex.raw(
        `
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      AND CONSTRAINT_NAME = ?
    LIMIT 1
    `,
        [tableName, constraintName]
    );

    return Boolean(res?.[0]?.length);
}

async function up(knex) {
    const exists = await knex.schema.hasTable('flow_transitions');

    if (!exists) {
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
        });
    }

    // Ensure indexes (safe even if table existed)
    // Nota: Knex no tiene "hasIndex" portable; en MySQL toca revisar INFORMATION_SCHEMA si quieres evitar duplicados.
    // Como mínimo, intenta crear y si falla por duplicado, puedes ignorar con try/catch.
    try {
        await knex.schema.alterTable('flow_transitions', (t) => {
            t.index(['phone'], 'flow_transitions_phone_index');
            t.index(['created_at'], 'flow_transitions_created_at_index');
            t.index(['order_number'], 'flow_transitions_order_number_index');
        });
    } catch (e) {
        // Ignorar si ya existen índices
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
