/**
 * Test script to verify admin dashboard fixes
 * Tests database methods and API endpoints
 */

const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:3006';
let passed = 0;
let failed = 0;

// Helper to make HTTP requests
function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        }).on('error', reject);
    });
}

// Test functions
async function testDashboardEndpoint() {
    console.log('\n📊 Testing /api/admin/dashboard endpoint...');
    try {
        const response = await makeRequest('/api/admin/dashboard');
        
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error('Response success flag is false');
        }
        
        const data = response.data.data;
        
        // Check required fields exist
        const requiredFields = [
            'totalOrders', 'pendingOrders', 'processingOrders', 'completedOrders',
            'contentDistribution', 'capacityDistribution', 'topGenres'
        ];
        
        for (const field of requiredFields) {
            if (!(field in data)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        // Verify data types
        if (typeof data.totalOrders !== 'number') {
            throw new Error('totalOrders should be a number');
        }
        
        if (typeof data.contentDistribution !== 'object') {
            throw new Error('contentDistribution should be an object');
        }
        
        if (!Array.isArray(data.topGenres)) {
            throw new Error('topGenres should be an array');
        }
        
        console.log('✅ Dashboard endpoint test passed');
        console.log(`   - Total Orders: ${data.totalOrders}`);
        console.log(`   - Pending: ${data.pendingOrders}`);
        console.log(`   - Processing: ${data.processingOrders}`);
        console.log(`   - Completed: ${data.completedOrders}`);
        console.log(`   - Top Genres: ${data.topGenres.length} items`);
        
        passed++;
        return true;
    } catch (error) {
        console.error('❌ Dashboard endpoint test failed:', error.message);
        failed++;
        return false;
    }
}

async function testOrdersEndpoint() {
    console.log('\n📦 Testing /api/admin/orders endpoint...');
    try {
        const response = await makeRequest('/api/admin/orders');
        
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error('Response success flag is false');
        }
        
        const data = response.data.data;
        
        if (!Array.isArray(data)) {
            throw new Error('Orders data should be an array');
        }
        
        console.log('✅ Orders endpoint test passed');
        console.log(`   - Total orders returned: ${data.length}`);
        
        if (data.length > 0) {
            const firstOrder = data[0];
            console.log(`   - Sample order: ${firstOrder.orderNumber || 'N/A'}`);
            console.log(`   - Customer: ${firstOrder.customerName || 'N/A'}`);
            console.log(`   - Status: ${firstOrder.status || firstOrder.processingStatus || 'N/A'}`);
        }
        
        passed++;
        return true;
    } catch (error) {
        console.error('❌ Orders endpoint test failed:', error.message);
        failed++;
        return false;
    }
}

async function testProcessingQueueEndpoint() {
    console.log('\n⚙️ Testing /api/admin/processing/queue endpoint...');
    try {
        const response = await makeRequest('/api/admin/processing/queue');
        
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error('Response success flag is false');
        }
        
        const data = response.data.data;
        
        // Check required fields
        if (!('queueLength' in data)) {
            throw new Error('Missing queueLength field');
        }
        
        if (!('queue' in data)) {
            throw new Error('Missing queue field');
        }
        
        if (!Array.isArray(data.queue)) {
            throw new Error('queue should be an array');
        }
        
        console.log('✅ Processing queue endpoint test passed');
        console.log(`   - Queue length: ${data.queueLength}`);
        console.log(`   - Queue items: ${data.queue.length}`);
        console.log(`   - Processing: ${data.processing ? 'Yes' : 'No'}`);
        console.log(`   - Paused: ${data.paused ? 'Yes' : 'No'}`);
        
        if (data.active && data.active.length > 0) {
            console.log(`   - Active jobs: ${data.active.length}`);
        }
        
        passed++;
        return true;
    } catch (error) {
        console.error('❌ Processing queue endpoint test failed:', error.message);
        failed++;
        return false;
    }
}

async function testAnalyticsEndpoint() {
    console.log('\n📈 Testing /api/admin/analytics/chatbot endpoint...');
    try {
        const response = await makeRequest('/api/admin/analytics/chatbot');
        
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        
        if (!response.data.success) {
            throw new Error('Response success flag is false');
        }
        
        const data = response.data.data;
        
        // Check required fields
        const requiredFields = [
            'activeConversations', 'totalConversations', 'popularArtists', 'popularMovies'
        ];
        
        for (const field of requiredFields) {
            if (!(field in data)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        console.log('✅ Analytics endpoint test passed');
        console.log(`   - Active Conversations: ${data.activeConversations}`);
        console.log(`   - Total Conversations: ${data.totalConversations}`);
        console.log(`   - Popular Artists: ${data.popularArtists?.length || 0} items`);
        console.log(`   - Popular Movies: ${data.popularMovies?.length || 0} items`);
        
        passed++;
        return true;
    } catch (error) {
        console.error('❌ Analytics endpoint test failed:', error.message);
        failed++;
        return false;
    }
}

// Run all tests
async function runTests() {
    console.log('🧪 Starting Admin Dashboard Fix Tests...');
    console.log('='.repeat(60));
    
    // Wait for server to be ready
    console.log('\n⏳ Waiting for server to be ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Run tests
    await testDashboardEndpoint();
    await testOrdersEndpoint();
    await testProcessingQueueEndpoint();
    await testAnalyticsEndpoint();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${passed + failed}`);
    
    if (failed === 0) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n⚠️ Some tests failed. Please check the logs above.');
        process.exit(1);
    }
}

// Check if server is running
console.log('🔍 Checking if server is running on', BASE_URL);
makeRequest('/v1/health')
    .then(() => {
        console.log('✅ Server is running');
        runTests();
    })
    .catch(() => {
        console.error('❌ Server is not running. Please start the server first:');
        console.error('   npm run dev');
        process.exit(1);
    });
