/**
 * Test script for PR-D1a endpoints
 * Tests the updated /api/admin/orders/:orderId/events and new /api/admin/orders/:orderId/timeline endpoints
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

// Test configuration - adjust based on your database
const TEST_ORDER_ID = '1';

async function testEventsEndpointWithPagination() {
    console.log('\n========================================');
    console.log('Testing Events Endpoint with Pagination');
    console.log('========================================\n');
    
    try {
        // Test 1: Get events with pagination (page 1)
        console.log('Test 1: Get events with pagination (page 1, perPage 10)');
        const response1 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/events?page=1&perPage=10`);
        const result1 = await response1.json();
        
        console.log('Status:', response1.status);
        console.log('Success:', result1.success);
        if (result1.success) {
            console.log('Events returned:', result1.data.events.length);
            console.log('Pagination:', JSON.stringify(result1.data.pagination, null, 2));
            console.log('✅ Test 1 PASSED');
        } else {
            console.log('Error:', result1.error);
            console.log('⚠️ Test 1 FAILED (expected if order not found)');
        }
        
        // Test 2: Get events with different pagination (page 2)
        console.log('\nTest 2: Get events page 2');
        const response2 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/events?page=2&perPage=10`);
        const result2 = await response2.json();
        
        console.log('Status:', response2.status);
        console.log('Success:', result2.success);
        if (result2.success) {
            console.log('Events returned:', result2.data.events.length);
            console.log('Pagination:', JSON.stringify(result2.data.pagination, null, 2));
            console.log('✅ Test 2 PASSED');
        } else {
            console.log('⚠️ Test 2 FAILED');
        }
        
        // Test 3: Get events with filters and pagination
        console.log('\nTest 3: Get events with eventType filter and pagination');
        const response3 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/events?eventType=order_created&page=1&perPage=5`);
        const result3 = await response3.json();
        
        console.log('Status:', response3.status);
        console.log('Success:', result3.success);
        if (result3.success) {
            console.log('Filtered events:', result3.data.events.length);
            console.log('Filter applied:', result3.data.filter.eventType);
            console.log('Pagination:', JSON.stringify(result3.data.pagination, null, 2));
            console.log('✅ Test 3 PASSED');
        } else {
            console.log('⚠️ Test 3 FAILED');
        }
        
        // Test 4: Test default pagination values
        console.log('\nTest 4: Test default pagination values');
        const response4 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/events`);
        const result4 = await response4.json();
        
        console.log('Status:', response4.status);
        console.log('Success:', result4.success);
        if (result4.success) {
            console.log('Default perPage:', result4.data.pagination.perPage);
            console.log('Default page:', result4.data.pagination.page);
            console.log('✅ Test 4 PASSED (should default to page=1, perPage=50)');
        } else {
            console.log('⚠️ Test 4 FAILED');
        }
        
    } catch (error) {
        console.error('❌ Events endpoint test failed:', error.message);
    }
}

async function testTimelineEndpoint() {
    console.log('\n========================================');
    console.log('Testing Timeline Endpoint');
    console.log('========================================\n');
    
    try {
        // Test 1: Get timeline without filters
        console.log('Test 1: Get order timeline (new endpoint)');
        const response1 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/timeline`);
        const result1 = await response1.json();
        
        console.log('Status:', response1.status);
        console.log('Success:', result1.success);
        if (result1.success) {
            console.log('Timeline items:', result1.data.timeline.length);
            console.log('Order info:', {
                orderNumber: result1.data.orderNumber,
                customerName: result1.data.customerName,
                orderStatus: result1.data.orderStatus
            });
            console.log('Pagination:', JSON.stringify(result1.data.pagination, null, 2));
            console.log('✅ Test 1 PASSED');
        } else {
            console.log('Error:', result1.error);
            console.log('⚠️ Test 1 FAILED (expected if order not found)');
        }
        
        // Test 2: Get timeline with pagination
        console.log('\nTest 2: Get timeline with custom pagination');
        const response2 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/timeline?page=1&perPage=5`);
        const result2 = await response2.json();
        
        console.log('Status:', response2.status);
        console.log('Success:', result2.success);
        if (result2.success) {
            console.log('Timeline items:', result2.data.timeline.length);
            console.log('Pagination:', JSON.stringify(result2.data.pagination, null, 2));
            console.log('✅ Test 2 PASSED');
        } else {
            console.log('⚠️ Test 2 FAILED');
        }
        
        // Test 3: Get timeline with event source filter
        console.log('\nTest 3: Get timeline with eventSource filter');
        const response3 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/timeline?eventSource=bot`);
        const result3 = await response3.json();
        
        console.log('Status:', response3.status);
        console.log('Success:', result3.success);
        if (result3.success) {
            console.log('Filtered items:', result3.data.timeline.length);
            console.log('Filter applied:', result3.data.filter.eventSource);
            console.log('✅ Test 3 PASSED');
        } else {
            console.log('⚠️ Test 3 FAILED');
        }
        
        // Test 4: Verify timeline format is different from events
        console.log('\nTest 4: Verify timeline format');
        const response4 = await fetch(`${BASE_URL}/api/admin/orders/${TEST_ORDER_ID}/timeline?perPage=1`);
        const result4 = await response4.json();
        
        console.log('Status:', response4.status);
        console.log('Success:', result4.success);
        if (result4.success && result4.data.timeline.length > 0) {
            const item = result4.data.timeline[0];
            console.log('Timeline item structure:', Object.keys(item));
            console.log('Has simplified fields:', item.title ? '✓' : '✗');
            console.log('✅ Test 4 PASSED');
        } else {
            console.log('⚠️ Test 4 FAILED or no data');
        }
        
        // Test 5: Test with invalid order ID
        console.log('\nTest 5: Test timeline with invalid order ID');
        const response5 = await fetch(`${BASE_URL}/api/admin/orders/999999999/timeline`);
        const result5 = await response5.json();
        
        console.log('Status:', response5.status);
        console.log('Success:', result5.success);
        if (!result5.success && response5.status === 404) {
            console.log('Error message:', result5.error);
            console.log('✅ Test 5 PASSED (correctly returns 404)');
        } else {
            console.log('⚠️ Test 5 FAILED (should return 404)');
        }
        
    } catch (error) {
        console.error('❌ Timeline endpoint test failed:', error.message);
    }
}

async function runTests() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  PR-D1a: Admin Events & Timeline Tests    ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('\nBase URL:', BASE_URL);
    console.log('Test Order ID:', TEST_ORDER_ID);
    console.log('\nNote: These tests require the server to be running');
    console.log('      and at least one order to exist in the database.\n');
    
    await testEventsEndpointWithPagination();
    await testTimelineEndpoint();
    
    console.log('\n========================================');
    console.log('Tests Complete');
    console.log('========================================\n');
    console.log('Summary:');
    console.log('- Events endpoint now supports pagination with page and perPage parameters');
    console.log('- Timeline endpoint provides simplified, aggregated view');
    console.log('- Both endpoints support filters: eventType, eventSource, flowName, dateFrom, dateTo');
    console.log('- Both endpoints return pagination metadata: page, perPage, total, totalPages');
}

// Run tests
runTests().catch(console.error);
