/**
 * Test script for Admin Timeline and Replay endpoints
 * Tests the new /api/admin/orders/:orderId/events and /api/admin/orders/:orderId/replay endpoints
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// Test configuration
const TEST_ORDER_ID = '1'; // You may need to adjust this based on your database

async function testTimelineEndpoint() {
    console.log('\n========================================');
    console.log('Testing Timeline Endpoint');
    console.log('========================================\n');
    
    try {
        // Test 1: Get timeline without filters
        console.log('Test 1: Get order timeline without filters');
        const response1 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/events`);
        const result1 = await response1.json();
        
        console.log('Status:', response1.status);
        console.log('Success:', result1.success);
        if (result1.success) {
            console.log('Event count:', result1.data.count);
            console.log('Order number:', result1.data.orderNumber);
            console.log('✅ Test 1 PASSED');
        } else {
            console.log('Error:', result1.error);
            console.log('⚠️ Test 1 FAILED (expected if order not found)');
        }
        
        // Test 2: Get timeline with event type filter
        console.log('\nTest 2: Get timeline with event type filter');
        const response2 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/events?eventType=order_created`);
        const result2 = await response2.json();
        
        console.log('Status:', response2.status);
        console.log('Success:', result2.success);
        if (result2.success) {
            console.log('Filtered event count:', result2.data.count);
            console.log('✅ Test 2 PASSED');
        } else {
            console.log('⚠️ Test 2 FAILED');
        }
        
        // Test 3: Get timeline with event source filter
        console.log('\nTest 3: Get timeline with event source filter');
        const response3 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/events?eventSource=bot`);
        const result3 = await response3.json();
        
        console.log('Status:', response3.status);
        console.log('Success:', result3.success);
        if (result3.success) {
            console.log('Filtered event count:', result3.data.count);
            console.log('✅ Test 3 PASSED');
        } else {
            console.log('⚠️ Test 3 FAILED');
        }
        
        // Test 4: Test with invalid order ID
        console.log('\nTest 4: Test with invalid order ID');
        const response4 = await fetch(`${BASE_URL}/api/admin/orders/999999999/events`);
        const result4 = await response4.json();
        
        console.log('Status:', response4.status);
        console.log('Success:', result4.success);
        if (!result4.success && response4.status === 404) {
            console.log('Error message:', result4.error);
            console.log('✅ Test 4 PASSED (correctly returns 404)');
        } else {
            console.log('⚠️ Test 4 FAILED (should return 404)');
        }
        
    } catch (error) {
        console.error('❌ Timeline endpoint test failed:', error.message);
    }
}

async function testReplayEndpoint() {
    console.log('\n========================================');
    console.log('Testing Replay Endpoint');
    console.log('========================================\n');
    
    try {
        // Test 1: Replay without custom input
        console.log('Test 1: Replay order flow (dry-run)');
        const response1 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/replay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const result1 = await response1.json();
        
        console.log('Status:', response1.status);
        console.log('Success:', result1.success);
        if (result1.success) {
            console.log('Dry-run:', result1.data.dryRun);
            console.log('Router Intent:', result1.data.routerDecision.intent);
            console.log('Confidence:', result1.data.routerDecision.confidence);
            console.log('Source:', result1.data.routerDecision.source);
            console.log('Warning:', result1.data.warning);
            console.log('✅ Test 1 PASSED');
        } else {
            console.log('Error:', result1.error);
            console.log('⚠️ Test 1 FAILED (expected if order not found)');
        }
        
        // Test 2: Replay with custom input
        console.log('\nTest 2: Replay with custom user input');
        const response2 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/replay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userInput: 'Quiero un USB de 32GB con música',
                context: {
                    testMode: true
                }
            })
        });
        const result2 = await response2.json();
        
        console.log('Status:', response2.status);
        console.log('Success:', result2.success);
        if (result2.success) {
            console.log('Router Intent:', result2.data.routerDecision.intent);
            console.log('Simulated Message:', result2.data.simulatedResponse.message.substring(0, 100) + '...');
            console.log('✅ Test 2 PASSED');
        } else {
            console.log('⚠️ Test 2 FAILED');
        }
        
        // Test 3: Test with invalid order ID
        console.log('\nTest 3: Test replay with invalid order ID');
        const response3 = await fetch(`${BASE_URL}/api/admin/orders/999999999/replay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        const result3 = await response3.json();
        
        console.log('Status:', response3.status);
        console.log('Success:', result3.success);
        if (!result3.success && response3.status === 404) {
            console.log('Error message:', result3.error);
            console.log('✅ Test 3 PASSED (correctly returns 404)');
        } else {
            console.log('⚠️ Test 3 FAILED (should return 404)');
        }
        
    } catch (error) {
        console.error('❌ Replay endpoint test failed:', error.message);
    }
}

async function runTests() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  Admin Timeline & Replay Endpoint Tests   ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('\nBase URL:', BASE_URL);
    console.log('Test Order ID:', TEST_ORDER_ID);
    console.log('\nNote: These tests require the server to be running');
    console.log('      and at least one order to exist in the database.\n');
    
    await testTimelineEndpoint();
    await testReplayEndpoint();
    
    console.log('\n========================================');
    console.log('Tests Complete');
    console.log('========================================\n');
}

// Run tests
runTests().catch(console.error);
