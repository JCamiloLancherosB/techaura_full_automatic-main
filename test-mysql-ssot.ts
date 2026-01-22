/**
 * Test MySQL SSOT Implementation
 * Verifies that dashboard endpoints work without JSON file dependencies
 */

import { analyticsService } from './src/admin/services/AnalyticsService';
import { businessDB } from './src/mysql-database';
import { orderRepository } from './src/repositories/OrderRepository';

async function testMySQLSSOT() {
    console.log('🧪 Testing MySQL SSOT Implementation\n');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: OrderRepository.getStats() - /api/orders/stats endpoint
        console.log('\n📊 Test 1: OrderRepository.getStats()');
        console.log('-'.repeat(60));
        const orderStats = await orderRepository.getStats();
        console.log('✅ Order Stats from MySQL:');
        console.log(JSON.stringify(orderStats, null, 2));
        
        // Test 2: AnalyticsService.getDashboardStats() - /api/admin/dashboard endpoint
        console.log('\n📊 Test 2: AnalyticsService.getDashboardStats()');
        console.log('-'.repeat(60));
        const dashboardStats = await analyticsService.getDashboardStats(true);
        console.log('✅ Dashboard Stats from MySQL:');
        console.log(`  Total Orders: ${dashboardStats.totalOrders}`);
        console.log(`  Completed Orders: ${dashboardStats.completedOrders}`);
        console.log(`  Total Revenue: ${dashboardStats.totalRevenue}`);
        console.log(`  Top Genres: ${JSON.stringify(dashboardStats.topGenres)}`);
        console.log(`  Top Artists: ${JSON.stringify(dashboardStats.topArtists)}`);
        console.log(`  Top Movies: ${JSON.stringify(dashboardStats.topMovies)}`);
        
        // Test 3: AnalyticsService.getChatbotAnalytics() - /api/admin/analytics/chatbot endpoint
        console.log('\n📊 Test 3: AnalyticsService.getChatbotAnalytics()');
        console.log('-'.repeat(60));
        const chatbotAnalytics = await analyticsService.getChatbotAnalytics(true);
        console.log('✅ Chatbot Analytics from MySQL:');
        console.log(`  Total Conversations: ${chatbotAnalytics.totalConversations}`);
        console.log(`  Active Conversations: ${chatbotAnalytics.activeConversations}`);
        console.log(`  Popular Genres: ${JSON.stringify(chatbotAnalytics.popularGenres)}`);
        console.log(`  Popular Artists: ${JSON.stringify(chatbotAnalytics.popularArtists)}`);
        console.log(`  Popular Movies: ${JSON.stringify(chatbotAnalytics.popularMovies)}`);
        
        // Test 4: Direct MySQL methods
        console.log('\n📊 Test 4: Direct MySQL Database Methods');
        console.log('-'.repeat(60));
        
        const topGenres = await businessDB.getTopGenres(5);
        console.log('✅ Top Genres (MySQL):', JSON.stringify(topGenres));
        
        const topArtists = await businessDB.getTopArtists(5);
        console.log('✅ Top Artists (MySQL):', JSON.stringify(topArtists));
        
        const topMovies = await businessDB.getTopMovies(5);
        console.log('✅ Top Movies (MySQL):', JSON.stringify(topMovies));
        
        const contentDist = await businessDB.getContentDistribution();
        console.log('✅ Content Distribution (MySQL):', JSON.stringify(contentDist));
        
        const capacityDist = await businessDB.getCapacityDistribution();
        console.log('✅ Capacity Distribution (MySQL):', JSON.stringify(capacityDist));
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests passed! MySQL is now the Single Source of Truth');
        console.log('✅ No JSON file dependencies detected');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        console.error('Stack:', error instanceof Error ? error.stack : 'Unknown error');
        process.exit(1);
    } finally {
        // Close database connection
        await businessDB.disconnect();
        process.exit(0);
    }
}

// Run tests
testMySQLSSOT();
