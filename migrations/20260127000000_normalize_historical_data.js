/**
 * Migration: Normalize historical order data
 * 
 * This migration normalizes existing order data to fix inconsistencies:
 * 1. Normalizes processing_status values to canonical statuses
 * 2. Normalizes capacity values to standard formats (8GB, 32GB, etc.)
 * 3. Normalizes product_type values to canonical content types
 * 
 * This migration is OPTIONAL and can be run to clean up historical data.
 * The application will also normalize data at read-time.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
    console.log('🔧 Starting historical data normalization...');
    
    // Check if orders table exists
    const ordersExists = await knex.schema.hasTable('orders');
    if (!ordersExists) {
        console.log('⚠️  Orders table does not exist, skipping migration');
        return;
    }

    // ============================================
    // 1. NORMALIZE PROCESSING_STATUS
    // ============================================
    console.log('📦 Normalizing processing_status values...');
    
    // Status normalization mapping (match dataNormalization.ts)
    const statusNormalization = [
        // Spanish translations
        { old: 'pendiente', new: 'pending' },
        { old: 'confirmado', new: 'confirmed' },
        { old: 'procesando', new: 'processing' },
        { old: 'en_proceso', new: 'processing' },
        { old: 'completado', new: 'completed' },
        { old: 'cancelado', new: 'cancelled' },
        // Common typos
        { old: 'peding', new: 'pending' },
        { old: 'pendig', new: 'pending' },
        { old: 'confimed', new: 'confirmed' },
        { old: 'confirmd', new: 'confirmed' },
        { old: 'procesing', new: 'processing' },
        { old: 'proccessing', new: 'processing' },
        { old: 'complted', new: 'completed' },
        { old: 'complet', new: 'completed' },
        { old: 'canceld', new: 'cancelled' },
        { old: 'canceled', new: 'cancelled' },
    ];

    for (const mapping of statusNormalization) {
        const updated = await knex('orders')
            .where('processing_status', mapping.old)
            .update({ processing_status: mapping.new });
        
        if (updated > 0) {
            console.log(`  ✅ Normalized ${updated} records: "${mapping.old}" → "${mapping.new}"`);
        }
    }

    // ============================================
    // 2. NORMALIZE CAPACITY
    // ============================================
    console.log('📦 Normalizing capacity values...');
    
    // Capacity normalization mapping
    const capacityNormalization = [
        // Lowercase variations
        { old: '8gb', new: '8GB' },
        { old: '32gb', new: '32GB' },
        { old: '64gb', new: '64GB' },
        { old: '128gb', new: '128GB' },
        { old: '256gb', new: '256GB' },
        // Without 'GB' suffix
        { old: '8', new: '8GB' },
        { old: '32', new: '32GB' },
        { old: '64', new: '64GB' },
        { old: '128', new: '128GB' },
        { old: '256', new: '256GB' },
        // With spaces
        { old: '8 GB', new: '8GB' },
        { old: '32 GB', new: '32GB' },
        { old: '64 GB', new: '64GB' },
        { old: '128 GB', new: '128GB' },
        { old: '256 GB', new: '256GB' },
        // Common typos
        { old: '8g', new: '8GB' },
        { old: '32g', new: '32GB' },
        { old: '64g', new: '64GB' },
        { old: '128g', new: '128GB' },
        { old: '256g', new: '256GB' },
    ];

    for (const mapping of capacityNormalization) {
        const updated = await knex('orders')
            .whereRaw('LOWER(capacity) = ?', [mapping.old.toLowerCase()])
            .update({ capacity: mapping.new });
        
        if (updated > 0) {
            console.log(`  ✅ Normalized ${updated} records: "${mapping.old}" → "${mapping.new}"`);
        }
    }

    // ============================================
    // 3. NORMALIZE PRODUCT_TYPE (contentType)
    // ============================================
    console.log('📦 Normalizing product_type values...');
    
    // Content type normalization mapping
    const contentTypeNormalization = [
        // Spanish translations
        { old: 'musica', new: 'music' },
        { old: 'música', new: 'music' },
        { old: 'video', new: 'videos' },
        { old: 'pelicula', new: 'movies' },
        { old: 'película', new: 'movies' },
        { old: 'peliculas', new: 'movies' },
        { old: 'películas', new: 'movies' },
        { old: 'serie', new: 'series' },
        { old: 'mixto', new: 'mixed' },
        // Common variations
        { old: 'music_usb', new: 'music' },
        { old: 'musicusb', new: 'music' },
        { old: 'video_usb', new: 'videos' },
        { old: 'videousb', new: 'videos' },
        { old: 'movie', new: 'movies' },
        { old: 'films', new: 'movies' },
        { old: 'film', new: 'movies' },
        { old: 'tv_series', new: 'series' },
        { old: 'tvseries', new: 'series' },
        { old: 'tv', new: 'series' },
        { old: 'all', new: 'mixed' },
        { old: 'combo', new: 'mixed' },
        { old: 'custom', new: 'mixed' },
    ];

    for (const mapping of contentTypeNormalization) {
        const updated = await knex('orders')
            .whereRaw('LOWER(product_type) = ?', [mapping.old.toLowerCase()])
            .update({ product_type: mapping.new });
        
        if (updated > 0) {
            console.log(`  ✅ Normalized ${updated} records: "${mapping.old}" → "${mapping.new}"`);
        }
    }

    // ============================================
    // 4. LOG REMAINING NON-STANDARD VALUES
    // ============================================
    console.log('📊 Checking for remaining non-standard values...');

    // Check for any remaining non-standard statuses
    const remainingStatuses = await knex('orders')
        .select('processing_status')
        .whereNotIn('processing_status', ['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'error', 'failed'])
        .groupBy('processing_status');
    
    if (remainingStatuses.length > 0) {
        console.log('⚠️  Non-standard statuses found:', remainingStatuses.map(r => r.processing_status).join(', '));
    }

    // Check for any remaining non-standard capacities
    const remainingCapacities = await knex('orders')
        .select('capacity')
        .whereNotIn('capacity', ['8GB', '32GB', '64GB', '128GB', '256GB', '512GB'])
        .groupBy('capacity');
    
    if (remainingCapacities.length > 0) {
        console.log('⚠️  Non-standard capacities found:', remainingCapacities.map(r => r.capacity).join(', '));
    }

    // Check for any remaining non-standard content types
    const remainingTypes = await knex('orders')
        .select('product_type')
        .whereNotIn('product_type', ['music', 'videos', 'movies', 'series', 'mixed'])
        .groupBy('product_type');
    
    if (remainingTypes.length > 0) {
        console.log('⚠️  Non-standard product_types found:', remainingTypes.map(r => r.product_type).join(', '));
    }

    console.log('✅ Historical data normalization complete');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
    // This migration normalizes data - there's no way to reverse it
    // as we don't store the original values
    console.log('⚠️  Data normalization cannot be reversed');
    console.log('   Historical values were replaced with normalized equivalents');
};
