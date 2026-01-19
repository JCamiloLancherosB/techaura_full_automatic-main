/**
 * Test script to verify the MySQL status column fix
 * This script tests the getPendingOrders and related functions
 */

const dotenv = require('dotenv');
dotenv.config();

// Test MySQL connection and queries
async function testStatusFix() {
    console.log('🔍 Testing MySQL Status Column Fix...\n');
    
    try {
        // Import the database module
        const { businessDB } = require('./src/mysql-database.ts');
        
        console.log('✅ Database module loaded successfully');
        
        // Test connection
        console.log('\n📡 Testing database connection...');
        const connected = await businessDB.testConnection();
        
        if (!connected) {
            throw new Error('Database connection failed');
        }
        console.log('✅ Database connection successful');
        
        // Test getPendingOrders
        console.log('\n📋 Testing getPendingOrders...');
        const pendingOrders = await businessDB.getPendingOrders();
        console.log(`✅ getPendingOrders executed successfully - Found ${pendingOrders.length} pending orders`);
        
        if (pendingOrders.length > 0) {
            console.log('   First order:', {
                orderNumber: pendingOrders[0].order_number,
                status: pendingOrders[0].status,
                processing_status: pendingOrders[0].processing_status
            });
        }
        
        // Test getOrderStatistics
        console.log('\n📊 Testing getOrderStatistics...');
        const stats = await businessDB.getOrderStatistics();
        console.log('✅ getOrderStatistics executed successfully');
        console.log('   Stats:', {
            total_orders: stats.total_orders,
            pending_orders: stats.pending_orders,
            completed_orders: stats.completed_orders,
            processing_orders: stats.processing_orders
        });
        
        // Test getSalesStatsByProduct
        console.log('\n📈 Testing getSalesStatsByProduct...');
        const salesStats = await businessDB.getSalesStatsByProduct(30);
        console.log(`✅ getSalesStatsByProduct executed successfully - Found ${salesStats.length} product types`);
        
        // Test getProcessingStatistics
        console.log('\n📉 Testing getProcessingStatistics...');
        const procStats = await businessDB.getProcessingStatistics();
        console.log('✅ getProcessingStatistics executed successfully');
        console.log('   Status breakdown:', procStats.byStatus);
        
        console.log('\n✅ All tests passed! The status column fix is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        // Close database connection
        try {
            const { businessDB } = require('./src/mysql-database.ts');
            await businessDB.close();
        } catch (e) {
            // Ignore close errors
        }
    }
}

// Run tests
testStatusFix();
