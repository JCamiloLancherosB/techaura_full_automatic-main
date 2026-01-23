/**
 * Migration: Create catalog tables for dynamic pricing and audit trail
 * 
 * This migration creates:
 * 1. catalog_items - Stores product catalog with dynamic prices/capacities
 * 2. catalog_change_log - Audit trail for all catalog changes
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Creating catalog tables...');
    
    // ============================================
    // CATALOG_ITEMS TABLE - Dynamic product catalog
    // ============================================
    const catalogItemsExists = await knex.schema.hasTable('catalog_items');
    if (!catalogItemsExists) {
        await knex.schema.createTable('catalog_items', (table) => {
            table.increments('id').primary();
            table.string('category_id', 50).notNullable().comment('music, videos, movies');
            table.string('capacity', 20).notNullable().comment('8GB, 32GB, 64GB, etc.');
            table.integer('capacity_gb').notNullable().comment('Numeric capacity for sorting');
            table.decimal('price', 10, 2).notNullable().comment('Price in Colombian Pesos');
            table.integer('content_count').notNullable().comment('Number of songs/videos/movies');
            table.string('content_unit', 50).notNullable().comment('canciones, videos, películas');
            table.boolean('is_active').defaultTo(true).comment('Whether this product is available');
            table.boolean('is_popular').defaultTo(false).comment('Mark as popular product');
            table.boolean('is_recommended').defaultTo(false).comment('Mark as recommended');
            table.decimal('min_price', 10, 2).nullable().comment('Minimum allowed price');
            table.decimal('max_price', 10, 2).nullable().comment('Maximum allowed price');
            table.json('metadata').nullable().comment('Additional product metadata');
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            
            // Indices for performance
            table.index(['category_id', 'capacity'], 'idx_catalog_category_capacity');
            table.index(['is_active'], 'idx_catalog_active');
            table.unique(['category_id', 'capacity'], 'uniq_catalog_category_capacity');
        });
        console.log('✅ Created catalog_items table');
    } else {
        console.log('ℹ️  catalog_items table already exists');
    }
    
    // ============================================
    // CATALOG_CHANGE_LOG TABLE - Audit trail
    // ============================================
    const catalogChangeLogExists = await knex.schema.hasTable('catalog_change_log');
    if (!catalogChangeLogExists) {
        await knex.schema.createTable('catalog_change_log', (table) => {
            table.increments('id').primary();
            table.integer('catalog_item_id').nullable().comment('Reference to catalog_items.id');
            table.string('category_id', 50).notNullable();
            table.string('capacity', 20).notNullable();
            table.string('action', 50).notNullable().comment('create, update, delete, activate, deactivate');
            table.string('field_changed', 100).nullable().comment('price, content_count, etc.');
            table.text('old_value').nullable().comment('Previous value');
            table.text('new_value').nullable().comment('New value');
            table.string('changed_by', 100).notNullable().comment('User/admin who made the change');
            table.string('change_reason', 500).nullable().comment('Reason for the change');
            table.json('change_data').nullable().comment('Full change details');
            table.string('ip_address', 50).nullable().comment('IP address of requester');
            table.timestamp('created_at').defaultTo(knex.fn.now());
            
            // Indices for performance
            table.index(['catalog_item_id'], 'idx_changelog_item');
            table.index(['category_id', 'capacity'], 'idx_changelog_category_capacity');
            table.index(['action'], 'idx_changelog_action');
            table.index(['changed_by'], 'idx_changelog_user');
            table.index(['created_at'], 'idx_changelog_created');
            
            // Foreign key (nullable for deleted items)
            table.foreign('catalog_item_id')
                .references('id')
                .inTable('catalog_items')
                .onDelete('SET NULL')
                .onUpdate('CASCADE');
        });
        console.log('✅ Created catalog_change_log table');
    } else {
        console.log('ℹ️  catalog_change_log table already exists');
    }
    
    // ============================================
    // SEED DATA - Populate from current pricing constants
    // ============================================
    const itemCount = await knex('catalog_items').count('* as count').first();
    
    if (itemCount && itemCount.count === 0) {
        console.log('📦 Seeding catalog_items with current pricing data...');
        
        const catalogSeed = [
            // Music
            { category_id: 'music', capacity: '8GB', capacity_gb: 8, price: 54900, content_count: 1400, content_unit: 'canciones', min_price: 40000, max_price: 100000 },
            { category_id: 'music', capacity: '32GB', capacity_gb: 32, price: 84900, content_count: 5000, content_unit: 'canciones', is_popular: true, min_price: 60000, max_price: 150000 },
            { category_id: 'music', capacity: '64GB', capacity_gb: 64, price: 119900, content_count: 10000, content_unit: 'canciones', is_recommended: true, min_price: 80000, max_price: 200000 },
            { category_id: 'music', capacity: '128GB', capacity_gb: 128, price: 159900, content_count: 25000, content_unit: 'canciones', min_price: 100000, max_price: 250000 },
            
            // Videos
            { category_id: 'videos', capacity: '8GB', capacity_gb: 8, price: 54900, content_count: 500, content_unit: 'videos', min_price: 40000, max_price: 100000 },
            { category_id: 'videos', capacity: '32GB', capacity_gb: 32, price: 84900, content_count: 1000, content_unit: 'videos', is_popular: true, min_price: 60000, max_price: 150000 },
            { category_id: 'videos', capacity: '64GB', capacity_gb: 64, price: 119900, content_count: 2000, content_unit: 'videos', is_recommended: true, min_price: 80000, max_price: 200000 },
            { category_id: 'videos', capacity: '128GB', capacity_gb: 128, price: 159900, content_count: 4000, content_unit: 'videos', min_price: 100000, max_price: 250000 },
            
            // Movies
            { category_id: 'movies', capacity: '64GB', capacity_gb: 64, price: 119900, content_count: 55, content_unit: 'películas', min_price: 80000, max_price: 200000 },
            { category_id: 'movies', capacity: '128GB', capacity_gb: 128, price: 159900, content_count: 120, content_unit: 'películas', is_recommended: true, min_price: 100000, max_price: 250000 },
            { category_id: 'movies', capacity: '256GB', capacity_gb: 256, price: 219900, content_count: 250, content_unit: 'películas', min_price: 150000, max_price: 350000 },
            { category_id: 'movies', capacity: '512GB', capacity_gb: 512, price: 319900, content_count: 520, content_unit: 'películas', min_price: 200000, max_price: 500000 }
        ];
        
        await knex('catalog_items').insert(catalogSeed);
        console.log(`✅ Seeded ${catalogSeed.length} catalog items`);
        
        // Log initial seed as audit entry
        await knex('catalog_change_log').insert({
            category_id: 'system',
            capacity: 'all',
            action: 'seed',
            changed_by: 'system_migration',
            change_reason: 'Initial catalog seed from pricing.ts constants',
            change_data: JSON.stringify({ items_count: catalogSeed.length })
        });
        console.log('✅ Created audit log entry for initial seed');
    } else {
        console.log('ℹ️  Catalog items already seeded, skipping seed data');
    }
    
    console.log('✅ Catalog tables creation completed');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back catalog tables...');
    
    // Drop tables in reverse order (due to foreign key)
    await knex.schema.dropTableIfExists('catalog_change_log');
    console.log('✅ Dropped catalog_change_log table');
    
    await knex.schema.dropTableIfExists('catalog_items');
    console.log('✅ Dropped catalog_items table');
    
    console.log('✅ Rollback completed');
}

module.exports = { up, down };
