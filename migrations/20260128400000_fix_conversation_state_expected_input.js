/**
 * Migration: Fix conversation_state.expected_input column
 * 
 * Problem: The expected_input column was defined as ENUM with only
 * ['TEXT', 'NUMBER', 'CHOICE', 'MEDIA', 'ANY'] but the code uses
 * additional values like 'YES_NO' and 'GENRES'.
 * 
 * Solution: Change the column from ENUM to VARCHAR(32) to support
 * all current and future expected input types without requiring
 * additional schema migrations.
 * 
 * @param {import('knex').Knex} knex
 */

async function up(knex) {
    console.log('🔧 Fixing conversation_state.expected_input column...');
    
    const tableExists = await knex.schema.hasTable('conversation_state');
    if (!tableExists) {
        console.log('ℹ️  conversation_state table does not exist, skipping migration');
        return;
    }
    
    const hasExpectedInput = await knex.schema.hasColumn('conversation_state', 'expected_input');
    if (!hasExpectedInput) {
        console.log('ℹ️  expected_input column does not exist, will be created by main migration');
        return;
    }
    
    // Check current column type
    const [columnInfo] = await knex.raw(`
        SELECT COLUMN_TYPE, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'conversation_state' 
        AND COLUMN_NAME = 'expected_input'
    `);
    
    if (columnInfo.length === 0) {
        console.log('ℹ️  Could not determine expected_input column type');
        return;
    }
    
    const currentType = columnInfo[0].DATA_TYPE.toLowerCase();
    const currentColumnType = columnInfo[0].COLUMN_TYPE;
    
    console.log(`   Current expected_input type: ${currentColumnType}`);
    
    // If it's already VARCHAR, check if it's long enough
    if (currentType === 'varchar') {
        const lengthMatch = currentColumnType.match(/varchar\((\d+)\)/i);
        const currentLength = lengthMatch ? parseInt(lengthMatch[1], 10) : 0;
        
        if (currentLength >= 32) {
            console.log('ℹ️  expected_input is already VARCHAR(32) or larger, skipping');
            return;
        }
        
        console.log(`   Current VARCHAR length: ${currentLength}, expanding to 32`);
    }
    
    // Convert ENUM to VARCHAR(32) or expand existing VARCHAR
    try {
        await knex.raw(`
            ALTER TABLE conversation_state 
            MODIFY COLUMN expected_input VARCHAR(32) NOT NULL DEFAULT 'ANY'
            COMMENT 'Type of input expected from user (TEXT, NUMBER, CHOICE, MEDIA, ANY, YES_NO, GENRES, etc.)'
        `);
        console.log('✅ Changed expected_input from ENUM to VARCHAR(32)');
    } catch (error) {
        // If the NOT NULL constraint fails due to existing NULL values, try with NULL allowed
        console.warn('⚠️  First attempt failed, trying with NULL allowed...');
        await knex.raw(`
            ALTER TABLE conversation_state 
            MODIFY COLUMN expected_input VARCHAR(32) DEFAULT 'ANY'
            COMMENT 'Type of input expected from user (TEXT, NUMBER, CHOICE, MEDIA, ANY, YES_NO, GENRES, etc.)'
        `);
        console.log('✅ Changed expected_input to VARCHAR(32) (nullable)');
    }
    
    console.log('✅ conversation_state.expected_input fix completed');
}

/**
 * @param {import('knex').Knex} knex
 */
async function down(knex) {
    console.log('🔧 Rolling back expected_input column change...');
    
    const tableExists = await knex.schema.hasTable('conversation_state');
    if (!tableExists) {
        console.log('ℹ️  conversation_state table does not exist, nothing to rollback');
        return;
    }
    
    const hasExpectedInput = await knex.schema.hasColumn('conversation_state', 'expected_input');
    if (!hasExpectedInput) {
        console.log('ℹ️  expected_input column does not exist, nothing to rollback');
        return;
    }
    
    // Revert to ENUM - note: this may fail if data contains values outside the enum
    try {
        // First update any non-standard values to 'ANY'
        await knex.raw(`
            UPDATE conversation_state 
            SET expected_input = 'ANY' 
            WHERE expected_input NOT IN ('TEXT', 'NUMBER', 'CHOICE', 'MEDIA', 'ANY', 'YES_NO', 'GENRES')
        `);
        
        // Then change back to ENUM with expanded values
        await knex.raw(`
            ALTER TABLE conversation_state 
            MODIFY COLUMN expected_input 
            ENUM('TEXT', 'NUMBER', 'CHOICE', 'MEDIA', 'ANY', 'YES_NO', 'GENRES') 
            DEFAULT 'ANY'
            COMMENT 'Type of input expected from user'
        `);
        console.log('✅ Reverted expected_input to ENUM type');
    } catch (error) {
        console.error('❌ Failed to rollback expected_input column:', error.message);
        console.log('   Keeping VARCHAR(32) type for data safety');
    }
}

module.exports = { up, down };
