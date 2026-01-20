/**
 * Migration: Ensure notes and admin_notes columns exist in orders table
 * This migration ensures backward compatibility by adding these columns if they don't exist
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        console.log('⚠️  Orders table does not exist, skipping migration');
        return;
    }

    // Check which columns exist
    const hasNotes = await knex.schema.hasColumn('orders', 'notes');
    const hasAdminNotes = await knex.schema.hasColumn('orders', 'admin_notes');
    const hasConfirmedAt = await knex.schema.hasColumn('orders', 'confirmed_at');

    // Add missing columns
    if (!hasNotes || !hasAdminNotes || !hasConfirmedAt) {
        await knex.schema.alterTable('orders', (table) => {
            if (!hasNotes) {
                table.text('notes').nullable();
                console.log('✅ Added notes column to orders table');
            }

            if (!hasAdminNotes) {
                table.json('admin_notes').nullable();
                console.log('✅ Added admin_notes column to orders table');
            }

            if (!hasConfirmedAt) {
                table.timestamp('confirmed_at').nullable();
                console.log('✅ Added confirmed_at column to orders table');
            }
        });

        console.log('✅ Ensured all required columns exist in orders table');
    } else {
        console.log('✅ All required columns already exist in orders table');
    }
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        return;
    }

    // Check which columns exist before dropping
    const hasNotes = await knex.schema.hasColumn('orders', 'notes');
    const hasAdminNotes = await knex.schema.hasColumn('orders', 'admin_notes');
    const hasConfirmedAt = await knex.schema.hasColumn('orders', 'confirmed_at');

    await knex.schema.alterTable('orders', (table) => {
        if (hasNotes) {
            table.dropColumn('notes');
        }
        if (hasAdminNotes) {
            table.dropColumn('admin_notes');
        }
        if (hasConfirmedAt) {
            table.dropColumn('confirmed_at');
        }
    });

    console.log('✅ Removed notes-related columns from orders table');
}

module.exports = { up, down };
