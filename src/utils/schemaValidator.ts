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
 * Validation result for conversation_state table
 */
export interface ConversationStateValidationResult {
    valid: boolean;
    tableExists: boolean;
    columnType: string;
    supportsAllValues: boolean;
    missingValues: string[];
    recommendations: string[];
}

/**
 * Expected input types that the conversation_state.expected_input column must support
 */
const EXPECTED_INPUT_TYPES = ['TEXT', 'NUMBER', 'CHOICE', 'MEDIA', 'ANY', 'YES_NO', 'GENRES', 'OK'];

/**
 * Validate the conversation_state schema for expected_input column
 * This ensures the column type can store all expected input values
 */
export async function validateConversationStateSchema(): Promise<ConversationStateValidationResult> {
    const db = businessDB as any;
    if (!db || !db.pool) {
        return {
            valid: false,
            tableExists: false,
            columnType: 'unknown',
            supportsAllValues: false,
            missingValues: [],
            recommendations: ['Database pool not initialized']
        };
    }

    try {
        // Check if table exists
        const [tables] = await db.pool.execute(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversation_state'`
        ) as any[];

        if (!tables || tables.length === 0) {
            return {
                valid: true, // Table will be created by migration
                tableExists: false,
                columnType: 'not_created',
                supportsAllValues: true,
                missingValues: [],
                recommendations: ['Table conversation_state will be created by migration']
            };
        }

        // Check column type
        const [columns] = await db.pool.execute(
            `SELECT COLUMN_TYPE, DATA_TYPE 
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'conversation_state' 
             AND COLUMN_NAME = 'expected_input'`
        ) as any[];

        if (!columns || columns.length === 0) {
            return {
                valid: false,
                tableExists: true,
                columnType: 'not_found',
                supportsAllValues: false,
                missingValues: EXPECTED_INPUT_TYPES,
                recommendations: ['Run migration to add expected_input column']
            };
        }

        const columnType = columns[0].COLUMN_TYPE;
        const dataType = columns[0].DATA_TYPE.toLowerCase();
        const recommendations: string[] = [];
        let supportsAllValues = true;
        let missingValues: string[] = [];

        if (dataType === 'varchar') {
            // Check VARCHAR length
            const lengthMatch = columnType.match(/varchar\((\d+)\)/i);
            const length = lengthMatch ? parseInt(lengthMatch[1], 10) : 0;
            
            // Maximum length needed is 'GENRES' = 6 chars, but we recommend 32 for future flexibility
            if (length < 32) {
                recommendations.push(`VARCHAR(${length}) is small. Consider VARCHAR(32) for future flexibility.`);
            }
            supportsAllValues = length >= 6; // Minimum to fit 'GENRES'
        } else if (dataType === 'enum') {
            // Check ENUM values
            const enumMatch = columnType.match(/enum\((.*)\)/i);
            if (enumMatch) {
                const enumValues = enumMatch[1]
                    .split(',')
                    .map(v => v.trim().replace(/'/g, ''));
                
                missingValues = EXPECTED_INPUT_TYPES.filter(t => !enumValues.includes(t));
                supportsAllValues = missingValues.length === 0;
                
                if (missingValues.length > 0) {
                    recommendations.push(
                        `ENUM is missing values: ${missingValues.join(', ')}. ` +
                        `Run migration 20260128400000_fix_conversation_state_expected_input.js`
                    );
                }
            }
        } else {
            recommendations.push(`Unexpected column type: ${dataType}. Expected VARCHAR or ENUM.`);
            supportsAllValues = false;
        }

        return {
            valid: supportsAllValues,
            tableExists: true,
            columnType,
            supportsAllValues,
            missingValues,
            recommendations
        };
    } catch (error) {
        console.error('Error validating conversation_state schema:', error);
        return {
            valid: false,
            tableExists: false,
            columnType: 'error',
            supportsAllValues: false,
            missingValues: [],
            recommendations: ['Error checking schema: ' + (error as Error).message]
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
        // Continue with schema validation to provide diagnostic information
        // but log a warning that the database may be in an inconsistent state
        console.warn('⚠️  Database may be in an inconsistent state. Services depending on missing tables will fail gracefully.');
    }
    
    const validation = await validateOrdersSchema();
    
    if (!validation.valid) {
        console.warn('⚠️  Database schema validation failed:');
        console.warn('   Missing columns:', validation.missingColumns.join(', '));
        console.warn('   Recommendations:', validation.recommendations.join('\n   '));
    } else {
        console.log('✅ Database schema is valid');
        if (validation.missingColumns.length > 0) {
            console.log('ℹ️  Optional columns missing:', validation.missingColumns.join(', '));
        }
    }
    
    // Validate conversation_state schema for FlowContinuity
    console.log('🔍 Validating conversation_state schema for FlowContinuity...');
    const conversationStateValidation = await validateConversationStateSchema();
    
    if (!conversationStateValidation.valid) {
        console.error('❌ conversation_state schema validation failed:');
        console.error(`   Column type: ${conversationStateValidation.columnType}`);
        if (conversationStateValidation.missingValues.length > 0) {
            console.error(`   Missing expected_input values: ${conversationStateValidation.missingValues.join(', ')}`);
        }
        console.error('   Recommendations:');
        conversationStateValidation.recommendations.forEach(r => console.error(`     - ${r}`));
        console.error('   ⚠️  FlowContinuity may experience truncation errors until schema is fixed.');
    } else if (conversationStateValidation.tableExists) {
        console.log('✅ conversation_state schema is valid');
    }
}
