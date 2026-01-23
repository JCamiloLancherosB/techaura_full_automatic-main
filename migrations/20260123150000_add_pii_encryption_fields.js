/**
 * Migration: Add encrypted PII fields to orders table
 * Adds encrypted shipping data with searchable hashes
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

    // Check which columns need to be added
    const hasShippingEncrypted = await knex.schema.hasColumn('orders', 'shipping_encrypted');
    const hasPhoneHash = await knex.schema.hasColumn('orders', 'phone_hash');
    const hasPhoneLast4 = await knex.schema.hasColumn('orders', 'phone_last4');
    const hasAddressHash = await knex.schema.hasColumn('orders', 'address_hash');

    await knex.schema.alterTable('orders', (table) => {
        if (!hasShippingEncrypted) {
            table.text('shipping_encrypted').nullable()
                .comment('Encrypted shipping data (address, phone) using AES-GCM');
        }
        
        if (!hasPhoneHash) {
            table.string('phone_hash', 64).nullable()
                .comment('SHA-256 hash of phone number for searchability');
            table.index('phone_hash', 'idx_orders_phone_hash');
        }
        
        if (!hasPhoneLast4) {
            table.string('phone_last4', 4).nullable()
                .comment('Last 4 digits of phone for partial matching');
            table.index('phone_last4', 'idx_orders_phone_last4');
        }
        
        if (!hasAddressHash) {
            table.string('address_hash', 64).nullable()
                .comment('SHA-256 hash of address for searchability');
            table.index('address_hash', 'idx_orders_address_hash');
        }
    });

    const addedColumns = [];
    if (!hasShippingEncrypted) addedColumns.push('shipping_encrypted');
    if (!hasPhoneHash) addedColumns.push('phone_hash');
    if (!hasPhoneLast4) addedColumns.push('phone_last4');
    if (!hasAddressHash) addedColumns.push('address_hash');

    if (addedColumns.length > 0) {
        console.log(`✅ Added PII encryption columns to orders table: ${addedColumns.join(', ')}`);
    } else {
        console.log('ℹ️  All PII encryption columns already exist in orders table');
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

    const hasShippingEncrypted = await knex.schema.hasColumn('orders', 'shipping_encrypted');
    const hasPhoneHash = await knex.schema.hasColumn('orders', 'phone_hash');
    const hasPhoneLast4 = await knex.schema.hasColumn('orders', 'phone_last4');
    const hasAddressHash = await knex.schema.hasColumn('orders', 'address_hash');

    await knex.schema.alterTable('orders', (table) => {
        if (hasPhoneHash) {
            table.dropIndex('phone_hash', 'idx_orders_phone_hash');
        }
        if (hasPhoneLast4) {
            table.dropIndex('phone_last4', 'idx_orders_phone_last4');
        }
        if (hasAddressHash) {
            table.dropIndex('address_hash', 'idx_orders_address_hash');
        }
        
        if (hasShippingEncrypted) {
            table.dropColumn('shipping_encrypted');
        }
        if (hasPhoneHash) {
            table.dropColumn('phone_hash');
        }
        if (hasPhoneLast4) {
            table.dropColumn('phone_last4');
        }
        if (hasAddressHash) {
            table.dropColumn('address_hash');
        }
    });

    console.log('✅ Removed PII encryption columns from orders table');
}

module.exports = { up, down };
