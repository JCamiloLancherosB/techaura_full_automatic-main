// migrations/20240810000000_create_tables.ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    // Tabla user_sessions
    await knex.schema.createTable('user_sessions', (table) => {
        table.string('phone').primary();
        table.string('name').nullable();
        table.string('stage').notNullable().defaultTo('initial');
        table.json('interests').nullable();
        table.json('conversation_data').nullable();
        table.integer('follow_up_spam_count').defaultTo(0);
        table.decimal('buying_intent', 5, 2).defaultTo(0.00);
        table.timestamp('last_interaction').defaultTo(knex.fn.now());
        table.timestamp('last_follow_up').nullable();
        table.boolean('is_blacklisted').defaultTo(false);
    });

    // Tabla orders
    await knex.schema.createTable('orders', (table) => {
        table.increments('id').primary();
        table.string('order_number').unique();
        table.string('customer_name').notNullable();
        table.string('phone_number').notNullable();
        table.string('product_type').notNullable();
        table.string('capacity').notNullable();
        table.decimal('price', 10, 2).notNullable();
        table.string('processing_status').defaultTo('pending');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').nullable();
    });

    // Tablas adicionales requeridas por el sistema
    await knex.schema.createTable('user_analytics', (table) => {
        table.string('phone').primary().references('phone').inTable('user_sessions');
        table.integer('total_orders').defaultTo(0);
        table.json('preferred_categories').nullable();
        table.decimal('conversion_rate', 5, 2).defaultTo(0.00);
    });

    await knex.schema.createTable('follow_up_events', (table) => {
        table.increments('id').primary();
        table.string('phone').references('phone').inTable('user_sessions');
        table.string('type').notNullable();
        table.json('messages').notNullable();
        table.boolean('success').notNullable();
        table.timestamp('timestamp').defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable('follow_up_events');
    await knex.schema.dropTable('user_analytics');
    await knex.schema.dropTable('orders');
    await knex.schema.dropTable('user_sessions');
}
