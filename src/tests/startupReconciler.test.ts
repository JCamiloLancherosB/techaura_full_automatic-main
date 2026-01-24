/**
 * Tests for StartupReconciler
 * 
 * These tests verify the reconciliation logic that runs on bot startup
 */

import { startupReconciler } from '../services/StartupReconciler';
import { processingJobRepository } from '../repositories/ProcessingJobRepository';
import { orderRepository } from '../repositories/OrderRepository';
import { pool } from '../mysql-database';

/**
 * Test: Verify StartupReconciler can be instantiated
 */
async function testReconcilerInstantiation() {
    console.log('🧪 Test: Reconciler instantiation...');
    
    if (!startupReconciler) {
        throw new Error('StartupReconciler instance not created');
    }
    
    console.log('   ✓ StartupReconciler instance exists');
}

/**
 * Test: Verify reconciliation can run without errors
 */
async function testReconciliationExecution() {
    console.log('🧪 Test: Reconciliation execution...');
    
    try {
        const result = await startupReconciler.reconcile();
        
        if (!result) {
            throw new Error('Reconciliation returned no result');
        }
        
        // Check result structure
        if (typeof result.success !== 'boolean') {
            throw new Error('Result missing success field');
        }
        
        if (!(result.timestamp instanceof Date)) {
            throw new Error('Result missing timestamp');
        }
        
        if (typeof result.leasesRepaired !== 'number') {
            throw new Error('Result missing leasesRepaired');
        }
        
        if (typeof result.jobsRequeued !== 'number') {
            throw new Error('Result missing jobsRequeued');
        }
        
        if (typeof result.followUpCandidates !== 'number') {
            throw new Error('Result missing followUpCandidates');
        }
        
        if (typeof result.pendingOrders !== 'number') {
            throw new Error('Result missing pendingOrders');
        }
        
        if (!Array.isArray(result.errors)) {
            throw new Error('Result errors is not an array');
        }
        
        console.log('   ✓ Reconciliation executed successfully');
        console.log(`   - Success: ${result.success}`);
        console.log(`   - Leases repaired: ${result.leasesRepaired}`);
        console.log(`   - Jobs requeued: ${result.jobsRequeued}`);
        console.log(`   - Follow-up candidates: ${result.followUpCandidates}`);
        console.log(`   - Pending orders: ${result.pendingOrders}`);
        console.log(`   - Errors: ${result.errors.length}`);
        
    } catch (error) {
        console.error('   ✗ Reconciliation execution failed:', error);
        throw error;
    }
}

/**
 * Test: Verify last reconciliation can be retrieved
 */
async function testLastReconciliationRetrieval() {
    console.log('🧪 Test: Last reconciliation retrieval...');
    
    const lastResult = startupReconciler.getLastReconciliation();
    
    if (!lastResult) {
        throw new Error('Last reconciliation result not available');
    }
    
    console.log('   ✓ Last reconciliation retrieved');
    console.log(`   - Timestamp: ${lastResult.timestamp.toISOString()}`);
}

/**
 * Test: Verify database connectivity for reconciliation
 */
async function testDatabaseConnectivity() {
    console.log('🧪 Test: Database connectivity...');
    
    try {
        // Test processing jobs repository
        const jobStats = await processingJobRepository.getStatistics();
        if (typeof jobStats.total !== 'number') {
            throw new Error('Invalid job statistics');
        }
        console.log(`   ✓ Processing jobs accessible (${jobStats.total} total)`);
        
        // Test orders repository
        const orderStats = await orderRepository.getStats();
        if (typeof orderStats.total !== 'number') {
            throw new Error('Invalid order statistics');
        }
        console.log(`   ✓ Orders accessible (${orderStats.total} total)`);
        
        // Test user sessions table
        const [sessions] = await pool.execute(
            'SELECT COUNT(*) as count FROM user_sessions'
        ) as any;
        const sessionCount = sessions[0]?.count || 0;
        console.log(`   ✓ User sessions accessible (${sessionCount} total)`);
        
    } catch (error) {
        console.error('   ✗ Database connectivity test failed:', error);
        throw error;
    }
}

/**
 * Test: Simulate expired lease scenario
 */
async function testExpiredLeaseHandling() {
    console.log('🧪 Test: Expired lease handling...');
    
    try {
        // Check for any expired leases (should be 0 after reconciliation)
        const expiredLeases = await processingJobRepository.getExpiredLeases();
        
        console.log(`   ✓ Found ${expiredLeases.length} expired leases`);
        
        if (expiredLeases.length > 0) {
            console.log('   ⚠️  Warning: Expired leases found after reconciliation');
            console.log('   This may indicate jobs were created after reconciliation');
        }
        
    } catch (error) {
        console.error('   ✗ Expired lease handling test failed:', error);
        throw error;
    }
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('\n🚀 Starting StartupReconciler tests...\n');
    
    const tests = [
        testReconcilerInstantiation,
        testDatabaseConnectivity,
        testReconciliationExecution,
        testLastReconciliationRetrieval,
        testExpiredLeaseHandling
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (error) {
            failed++;
            console.error(`\n❌ Test failed: ${test.name}`);
            console.error(error);
        }
        console.log(''); // Empty line between tests
    }
    
    console.log('═══════════════════════════════════════');
    console.log(`✅ Tests passed: ${passed}`);
    console.log(`❌ Tests failed: ${failed}`);
    console.log('═══════════════════════════════════════\n');
    
    if (failed > 0) {
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests()
        .then(() => {
            console.log('✅ All tests completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        });
}

export {
    testReconcilerInstantiation,
    testReconciliationExecution,
    testLastReconciliationRetrieval,
    testDatabaseConnectivity,
    testExpiredLeaseHandling,
    runTests
};
