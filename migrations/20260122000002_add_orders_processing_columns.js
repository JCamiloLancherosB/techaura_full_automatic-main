/**
 * Migration: Add additional columns to orders and processing_jobs
 * 
 * This migration consolidates remaining runtime TypeScript migrations
 * into proper Knex migrations.
 */

/**
 * @param {import('knex').Knex} knex
 */
async function up(knex) {
    console.log('🔧 Adding additional columns to orders and processing_jobs...');
    
    // ============================================
    // ORDERS TABLE - Additional columns
    // ============================================
    const ordersExists = await knex.schema.hasTable('orders');
    if (ordersExists) {
        console.log('📦 Checking additional columns for orders table...');
        
        const hasCustomization = await knex.schema.hasColumn('orders', 'customization');
        const hasGenres = await knex.schema.hasColumn('orders', 'genres');
        const hasArtists = await knex.schema.hasColumn('orders', 'artists');
        const hasPreferences = await knex.schema.hasColumn('orders', 'preferences');
        const hasContentType = await knex.schema.hasColumn('orders', 'content_type');
        const hasCapacity = await knex.schema.hasColumn('orders', 'capacity');
        const hasPrice = await knex.schema.hasColumn('orders', 'price');
        const hasOrderNumber = await knex.schema.hasColumn('orders', 'order_number');

        await knex.schema.alterTable('orders', (table) => {
            if (!hasCustomization) {
                table.json('customization').nullable();
                console.log('✅ Added customization column');
            }
            if (!hasGenres) {
                table.text('genres').nullable();
                console.log('✅ Added genres column');
            }
            if (!hasArtists) {
                table.text('artists').nullable();
                console.log('✅ Added artists column');
            }
            if (!hasPreferences) {
                table.json('preferences').nullable();
                console.log('✅ Added preferences column');
            }
            if (!hasContentType) {
                table.string('content_type', 50).notNullable().defaultTo('music');
                console.log('✅ Added content_type column');
            }
            if (!hasCapacity) {
                table.string('capacity', 20).nullable();
                console.log('✅ Added capacity column');
            }
            if (!hasPrice) {
                table.decimal('price', 10, 2).nullable();
                console.log('✅ Added price column');
            }
            if (!hasOrderNumber) {
                table.string('order_number', 50).nullable();
                console.log('✅ Added order_number column');
            }
        });
    }

    // ============================================
    // PROCESSING_JOBS TABLE - Additional columns
    // ============================================
    const processingJobsExists = await knex.schema.hasTable('processing_jobs');
    if (processingJobsExists) {
        console.log('📦 Checking additional columns for processing_jobs table...');
        
        const hasProgress = await knex.schema.hasColumn('processing_jobs', 'progress');
        const hasLogs = await knex.schema.hasColumn('processing_jobs', 'logs');
        const hasQualityReport = await knex.schema.hasColumn('processing_jobs', 'quality_report');

        await knex.schema.alterTable('processing_jobs', (table) => {
            if (!hasProgress) {
                table.integer('progress').defaultTo(0);
                console.log('✅ Added progress column');
            }
            if (!hasLogs) {
                table.json('logs').nullable();
                console.log('✅ Added logs column');
            }
            if (!hasQualityReport) {
                table.json('quality_report').nullable();
                console.log('✅ Added quality_report column');
            }
        });
    }

    console.log('✅ Additional columns added successfully');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back additional columns...');
    
    const ordersExists = await knex.schema.hasTable('orders');
    if (ordersExists) {
        await knex.schema.alterTable('orders', (table) => {
            table.dropColumn('genres');
            table.dropColumn('artists');
        }).catch(() => {
            console.log('ℹ️  Some columns may not exist to drop');
        });
    }

    const processingJobsExists = await knex.schema.hasTable('processing_jobs');
    if (processingJobsExists) {
        await knex.schema.alterTable('processing_jobs', (table) => {
            table.dropColumn('logs');
            table.dropColumn('quality_report');
        }).catch(() => {
            console.log('ℹ️  Some columns may not exist to drop');
        });
    }

    console.log('✅ Rollback completed (preserving critical columns for data safety)');
}

module.exports = { up, down };
