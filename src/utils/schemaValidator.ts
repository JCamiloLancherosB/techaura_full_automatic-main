/**
 * Database Schema Validator
 * Ensures critical columns exist in the orders table and provides migration status
 */

import { businessDB } from '../mysql-database';

export interface SchemaValidationResult {
    valid: boolean;
    missingColumns: string[];
    existingColumns: string[];
    recommendations: string[];
}

/**
 * Check if required columns exist in the orders table
 */
export async function validateOrdersSchema(): Promise<SchemaValidationResult> {
    const db = businessDB as any;
    if (!db || !db.pool) {
        return {
            valid: false,
            missingColumns: [],
            existingColumns: [],
            recommendations: ['Database pool not initialized']
        };
    }

    const requiredColumns = [
        'id',
        'order_number',
        'customer_name',
        'phone_number',
        'product_type',
        'capacity',
        'price',
        'processing_status',
        'created_at',
        'updated_at'
    ];

    const optionalColumns = [
        'notes',
        'admin_notes',
        'completed_at',
        'confirmed_at',
        'customization',
        'preferences',
        'total_amount',
        'discount_amount',
        'shipping_address',
        'shipping_phone'
    ];

    try {
        const [columns] = await db.pool.execute(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'`
        ) as any[];

        const existingColumns = columns.map((row: any) => row.COLUMN_NAME.toLowerCase());
        const existingSet = new Set(existingColumns);

        const missingRequired = requiredColumns.filter(col => !existingSet.has(col.toLowerCase()));
        const missingOptional = optionalColumns.filter(col => !existingSet.has(col.toLowerCase()));

        const recommendations: string[] = [];
        
        if (missingRequired.length > 0) {
            recommendations.push(`CRITICAL: Missing required columns: ${missingRequired.join(', ')}`);
            recommendations.push('Run migrations: npx knex migrate:latest');
        }

        if (missingOptional.length > 0) {
            recommendations.push(`Optional columns missing: ${missingOptional.join(', ')}`);
            recommendations.push('Run migrations: pnpm run migrate');
        }

        return {
            valid: missingRequired.length === 0,
            missingColumns: [...missingRequired, ...missingOptional],
            existingColumns,
            recommendations
        };
    } catch (error) {
        console.error('Error validating schema:', error);
        return {
            valid: false,
            missingColumns: [],
            existingColumns: [],
            recommendations: ['Error checking schema: ' + (error as Error).message]
        };
    }
}

/**
 * Run any pending migrations
 */
export async function runPendingMigrations(): Promise<{ success: boolean; message: string }> {
    try {
        const knex = require('knex');
        const knexConfig = require('../../knexfile');
        
        const env = process.env.NODE_ENV || 'development';
        const config = knexConfig[env];
        
        if (!config) {
            return {
                success: false,
                message: `No configuration found for environment: ${env}`
            };
        }

        const db = knex(config);
        
        try {
            const [batchNo, log] = await db.migrate.latest();
            
            if (log.length === 0) {
                return {
                    success: true,
                    message: 'Database is already up to date'
                };
            }

            return {
                success: true,
                message: `Batch ${batchNo} run: ${log.length} migrations\n${log.join('\n')}`
            };
        } finally {
            await db.destroy();
        }
    } catch (error) {
        console.error('Error running migrations:', error);
        return {
            success: false,
            message: 'Error running migrations: ' + (error as Error).message
        };
    }
}

/**
 * Ensure database schema is valid on startup
 */
export async function ensureDatabaseSchema(): Promise<void> {
    console.log('🔍 Validating database schema...');
    
    // Always run pending migrations first to ensure all tables exist
    // This is critical for tables like chatbot_events that are checked by other services
    console.log('🔧 Running pending migrations...');
    const migrationResult = await runPendingMigrations();
    
    if (migrationResult.success) {
        console.log('✅ Migrations completed:', migrationResult.message);
    } else {
        console.error('❌ Migration failed:', migrationResult.message);
    }
    
    const validation = await validateOrdersSchema();
    
    if (!validation.valid) {
        console.warn('⚠️  Database schema validation failed:');
        console.warn('   Missing columns:', validation.missingColumns.join(', '));
        console.warn('   Recommendations:', validation.recommendations.join('\n   '));
        
        // Re-validate after migration (migrations already ran above)
        const revalidation = await validateOrdersSchema();
        if (revalidation.valid) {
            console.log('✅ Database schema is now valid');
        } else {
            console.warn('⚠️  Schema still has issues after migration:');
            console.warn('   ', revalidation.recommendations.join('\n    '));
        }
    } else {
        console.log('✅ Database schema is valid');
        if (validation.missingColumns.length > 0) {
            console.log('ℹ️  Optional columns missing:', validation.missingColumns.join(', '));
        }
    }
}
