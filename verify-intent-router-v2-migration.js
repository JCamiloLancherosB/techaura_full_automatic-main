#!/usr/bin/env node
/**
 * Verify Intent Router v2 Migration
 * 
 * This script verifies that the conversation_turns table has been
 * properly updated with the new intent routing columns.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyMigration() {
    console.log('🔍 Verifying Intent Router v2 Migration...\n');

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'techaura_bot'
    });

    try {
        // Check if table exists
        const [tables] = await connection.execute(
            "SHOW TABLES LIKE 'conversation_turns'"
        );

        if (tables.length === 0) {
            console.log('❌ conversation_turns table does not exist');
            console.log('   Run migrations first: npm run migrate\n');
            process.exit(1);
        }

        console.log('✅ conversation_turns table exists');

        // Check columns
        const [columns] = await connection.execute(
            "SHOW COLUMNS FROM conversation_turns"
        );

        const columnNames = columns.map(col => col.Field);
        
        // Check for intent_confidence
        const hasIntentConfidence = columnNames.includes('intent_confidence');
        if (hasIntentConfidence) {
            const confCol = columns.find(c => c.Field === 'intent_confidence');
            console.log(`✅ intent_confidence column exists (${confCol.Type})`);
        } else {
            console.log('❌ intent_confidence column missing');
        }

        // Check for intent_source
        const hasIntentSource = columnNames.includes('intent_source');
        if (hasIntentSource) {
            const srcCol = columns.find(c => c.Field === 'intent_source');
            console.log(`✅ intent_source column exists (${srcCol.Type})`);
        } else {
            console.log('❌ intent_source column missing');
        }

        console.log('\n📊 Column Summary:');
        console.log('─'.repeat(50));
        columns.forEach(col => {
            console.log(`   ${col.Field.padEnd(25)} ${col.Type}`);
        });
        console.log('─'.repeat(50));

        // Test insert
        console.log('\n🧪 Testing insert with new columns...');
        try {
            await connection.execute(
                `INSERT INTO conversation_turns 
                 (phone, role, content, metadata, timestamp, intent_confidence, intent_source)
                 VALUES (?, ?, ?, ?, NOW(), ?, ?)`,
                ['test_phone', 'system', 'Migration verification test', '{}', 95.5, 'rule']
            );
            console.log('✅ Insert successful with new columns');

            // Clean up test data
            await connection.execute(
                "DELETE FROM conversation_turns WHERE phone = 'test_phone' AND role = 'system'"
            );
            console.log('✅ Test cleanup successful');
        } catch (error) {
            console.log('❌ Insert failed:', error.message);
        }

        // Final verdict
        console.log('\n' + '='.repeat(50));
        if (hasIntentConfidence && hasIntentSource) {
            console.log('🎉 Migration Verified Successfully!');
            console.log('   Intent Router v2 is ready to use.');
            console.log('='.repeat(50) + '\n');
            process.exit(0);
        } else {
            console.log('⚠️  Migration Incomplete');
            console.log('   Please run: npm run migrate');
            console.log('='.repeat(50) + '\n');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\nTroubleshooting:');
        console.log('1. Check database connection settings in .env');
        console.log('2. Ensure database exists');
        console.log('3. Run migrations: npm run migrate\n');
        process.exit(1);
    } finally {
        await connection.end();
    }
}

// Run verification
verifyMigration().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
