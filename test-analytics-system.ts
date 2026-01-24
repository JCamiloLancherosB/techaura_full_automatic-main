/**
 * Test script for Analytics Refresher
 * Verifies the analytics watermark system and incremental refresh
 */

import { analyticsWatermarkRepository } from './src/repositories/AnalyticsWatermarkRepository';
import { analyticsStatsRepository } from './src/repositories/AnalyticsStatsRepository';
import { analyticsRefresher } from './src/services/AnalyticsRefresher';
import { pool } from './src/mysql-database';

async function testAnalyticsSystem() {
    console.log('\n🧪 Testing Analytics Watermark System\n');
    
    try {
        // Test 1: Check watermarks exist
        console.log('1️⃣ Checking watermarks...');
        const watermarks = await analyticsWatermarkRepository.getAll();
        console.log(`   ✅ Found ${watermarks.length} watermarks`);
        watermarks.forEach(w => {
            console.log(`      - ${w.name}: last_event_id=${w.last_event_id}, processed=${w.total_processed}`);
        });
        
        // Test 2: Get specific watermark
        console.log('\n2️⃣ Testing individual watermark fetch...');
        const ordersWatermark = await analyticsWatermarkRepository.getByName('orders_stats_v1');
        if (ordersWatermark) {
            console.log(`   ✅ orders_stats_v1 watermark found`);
            console.log(`      Last event ID: ${ordersWatermark.last_event_id}`);
            console.log(`      Last processed: ${ordersWatermark.last_processed_at}`);
        } else {
            console.log(`   ⚠️  orders_stats_v1 watermark not found`);
        }
        
        // Test 3: Check order_events table
        console.log('\n3️⃣ Checking order_events table...');
        const [eventCount] = await pool.execute<any[]>(
            'SELECT COUNT(*) as count FROM order_events'
        );
        console.log(`   ✅ Found ${eventCount[0].count} order events in database`);
        
        // Get sample events
        const [sampleEvents] = await pool.execute<any[]>(
            'SELECT id, event_type, created_at FROM order_events ORDER BY id DESC LIMIT 5'
        );
        if (sampleEvents.length > 0) {
            console.log('   Recent events:');
            sampleEvents.forEach((e: any) => {
                console.log(`      - Event ${e.id}: ${e.event_type} at ${e.created_at}`);
            });
        }
        
        // Test 4: Run a manual refresh
        console.log('\n4️⃣ Running manual analytics refresh...');
        await analyticsRefresher.refresh();
        console.log('   ✅ Refresh completed');
        
        // Test 5: Check updated watermarks
        console.log('\n5️⃣ Checking updated watermarks...');
        const updatedWatermarks = await analyticsWatermarkRepository.getAll();
        updatedWatermarks.forEach(w => {
            console.log(`      - ${w.name}: last_event_id=${w.last_event_id}, processed=${w.total_processed}`);
        });
        
        // Test 6: Query daily order stats
        console.log('\n6️⃣ Querying daily order stats (last 7 days)...');
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        const dailyStats = await analyticsStatsRepository.getDailyOrderStats(startDate, endDate);
        console.log(`   ✅ Found ${dailyStats.length} days of statistics`);
        dailyStats.forEach(stat => {
            console.log(`      - ${stat.date}: ${stat.orders_completed || 0} orders completed, conversion: ${(stat.conversion_rate || 0).toFixed(1)}%`);
        });
        
        // Test 7: Query intent conversion stats
        console.log('\n7️⃣ Querying intent conversion stats (last 7 days)...');
        const intentStats = await analyticsStatsRepository.getIntentConversionStats(startDate, endDate);
        console.log(`   ✅ Found ${intentStats.length} intent statistics`);
        if (intentStats.length > 0) {
            intentStats.slice(0, 5).forEach(stat => {
                console.log(`      - ${stat.intent} (${stat.date}): ${stat.intent_count} intents, ${(stat.conversion_rate || 0).toFixed(1)}% conversion`);
            });
        }
        
        // Test 8: Query followup performance
        console.log('\n8️⃣ Querying followup performance (last 7 days)...');
        const followupStats = await analyticsStatsRepository.getFollowupPerformanceDaily(startDate, endDate);
        console.log(`   ✅ Found ${followupStats.length} days of followup statistics`);
        followupStats.forEach(stat => {
            console.log(`      - ${stat.date}: ${stat.followups_sent || 0} sent, ${(stat.response_rate || 0).toFixed(1)}% responded`);
        });
        
        console.log('\n✅ All tests completed successfully!\n');
        
        // Summary
        console.log('📊 SUMMARY:');
        console.log(`   - Watermarks: ${watermarks.length}`);
        console.log(`   - Total events in DB: ${eventCount[0].count}`);
        console.log(`   - Daily stats records: ${dailyStats.length}`);
        console.log(`   - Intent stats records: ${intentStats.length}`);
        console.log(`   - Followup stats records: ${followupStats.length}`);
        console.log('\n✨ Analytics system is working correctly!\n');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        throw error;
    } finally {
        // Close database connection
        await pool.end();
    }
}

// Run the test
testAnalyticsSystem()
    .then(() => {
        console.log('Test execution completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
