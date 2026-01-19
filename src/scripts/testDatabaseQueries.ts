/**
 * Test script to validate database query fixes
 * Tests COALESCE-based queries for status column compatibility
 */

import { businessDB } from './mysql-database';

async function testDatabaseQueries() {
    console.log('🧪 Starting database query validation tests...\n');
    
    let testsPassed = 0;
    let testsFailed = 0;

    try {
        // Test 1: Check database connection
        console.log('Test 1: Database Connection');
        try {
            const isConnected = await businessDB.testConnection();
            if (isConnected) {
                console.log('✅ Database connection successful\n');
                testsPassed++;
            } else {
                console.log('❌ Database connection failed\n');
                testsFailed++;
            }
        } catch (error) {
            console.log('❌ Database connection error:', error);
            testsFailed++;
        }

        // Test 2: Check if status column exists
        console.log('Test 2: Status Column Existence Check');
        try {
            const [columns] = await (businessDB as any).pool.execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'orders'
            `);
            
            const columnNames = (columns as any[]).map(row => row.COLUMN_NAME);
            const hasStatus = columnNames.includes('status');
            const hasProcessingStatus = columnNames.includes('processing_status');
            
            console.log(`   - status column: ${hasStatus ? '✅ exists' : '❌ missing'}`);
            console.log(`   - processing_status column: ${hasProcessingStatus ? '✅ exists' : '❌ missing'}`);
            
            if (hasProcessingStatus) {
                console.log('✅ At least processing_status column exists (queries will work)\n');
                testsPassed++;
            } else {
                console.log('❌ Neither status column exists\n');
                testsFailed++;
            }
        } catch (error) {
            console.log('❌ Column check error:', error);
            testsFailed++;
        }

        // Test 3: Test getPendingOrders query
        console.log('Test 3: getPendingOrders Query');
        try {
            const pendingOrders = await businessDB.getPendingOrders();
            console.log(`✅ getPendingOrders query successful (${pendingOrders.length} orders)\n`);
            testsPassed++;
        } catch (error: any) {
            console.log('❌ getPendingOrders query failed:', error.message);
            testsFailed++;
        }

        // Test 4: Test getProcessingStatistics query
        console.log('Test 4: getProcessingStatistics Query');
        try {
            const stats = await businessDB.getProcessingStatistics();
            console.log(`✅ getProcessingStatistics query successful`);
            console.log(`   Status breakdown:`, stats.byStatus);
            testsPassed++;
        } catch (error: any) {
            console.log('❌ getProcessingStatistics query failed:', error.message);
            testsFailed++;
        }

        // Test 5: Test getTopSellingProducts query
        console.log('\nTest 5: getTopSellingProducts Query');
        try {
            const products = await businessDB.getTopSellingProducts(30, 10);
            console.log(`✅ getTopSellingProducts query successful (${products.length} products)\n`);
            testsPassed++;
        } catch (error: any) {
            console.log('❌ getTopSellingProducts query failed:', error.message);
            testsFailed++;
        }

        // Test 6: Test panel_settings table exists
        console.log('Test 6: panel_settings Table Check');
        try {
            const [tables] = await (businessDB as any).pool.execute(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'panel_settings'
            `);
            
            if ((tables as any[]).length > 0) {
                console.log('✅ panel_settings table exists\n');
                testsPassed++;
            } else {
                console.log('⚠️ panel_settings table does not exist (will be created on first run)\n');
                testsPassed++; // Not a failure, just a note
            }
        } catch (error: any) {
            console.log('❌ panel_settings table check failed:', error.message);
            testsFailed++;
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Tests Passed: ${testsPassed}`);
        console.log(`❌ Tests Failed: ${testsFailed}`);
        console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
        console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
        console.log('='.repeat(60));

        if (testsFailed === 0) {
            console.log('\n🎉 All tests passed! Database queries are working correctly.');
        } else {
            console.log('\n⚠️ Some tests failed. Please review the errors above.');
        }

    } catch (error) {
        console.error('\n❌ Critical error during testing:', error);
        process.exit(1);
    } finally {
        // Close database connection
        try {
            await businessDB.close();
            console.log('\n✅ Database connection closed');
        } catch (error) {
            console.log('\n⚠️ Error closing database connection:', error);
        }
    }

    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
console.log('🚀 TechAura Database Query Validation\n');
testDatabaseQueries().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
