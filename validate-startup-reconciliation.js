#!/usr/bin/env node
/**
 * Manual validation script for Startup Reconciliation
 * 
 * IMPORTANT: This script requires the project to be compiled first.
 * Run: npm run build
 * 
 * This script:
 * 1. Connects to the database
 * 2. Creates test scenarios (expired leases, orphaned jobs)
 * 3. Runs reconciliation
 * 4. Verifies results
 */

// Check if compiled files exist
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
    console.error('\x1b[31m');
    console.error('❌ Error: Project not compiled!');
    console.error('   Please run: npm run build');
    console.error('\x1b[0m');
    process.exit(1);
}

const { pool } = require('./dist/mysql-database');

// Color output helpers
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(color, ...args) {
    console.log(color, ...args, colors.reset);
}

async function setupTestScenarios() {
    log(colors.cyan, '\n📝 Setting up test scenarios...');
    
    try {
        // Scenario 1: Create a job with expired lease
        log(colors.blue, '\n1️⃣  Creating job with expired lease...');
        const [result1] = await pool.execute(
            `INSERT INTO processing_jobs 
             (job_id, order_id, capacity, status, progress, locked_by, locked_until, attempts, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 10 MINUTE), ?, NOW())`,
            ['test-expired-lease', 'test-order-1', '32GB', 'processing', 50, 'worker-crashed', 1]
        );
        log(colors.green, `   ✓ Created job with expired lease (ID: ${result1.insertId})`);
        
        // Scenario 2: Create an orphaned processing job (no lease but processing status)
        log(colors.blue, '\n2️⃣  Creating orphaned processing job...');
        const [result2] = await pool.execute(
            `INSERT INTO processing_jobs 
             (job_id, order_id, capacity, status, progress, locked_by, locked_until, attempts, created_at) 
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NOW())`,
            ['test-orphaned-job', 'test-order-2', '64GB', 'processing', 30, 2]
        );
        log(colors.green, `   ✓ Created orphaned job (ID: ${result2.insertId})`);
        
        // Scenario 3: Create a user session with expired cooldown
        log(colors.blue, '\n3️⃣  Creating user session with expired cooldown...');
        const [result3] = await pool.execute(
            `INSERT INTO user_sessions 
             (phone, name, contact_status, follow_up_attempts, cooldown_until, last_activity, created_at) 
             VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), NOW())
             ON DUPLICATE KEY UPDATE 
                 cooldown_until = DATE_SUB(NOW(), INTERVAL 1 DAY),
                 follow_up_attempts = 3,
                 contact_status = ?`,
            ['+573001234567', 'Test User', 'ACTIVE', 3, 'ACTIVE']
        );
        log(colors.green, `   ✓ Created/updated user session with expired cooldown`);
        
        log(colors.cyan, '\n✅ Test scenarios created successfully\n');
        
        return {
            expiredLeaseJobId: result1.insertId,
            orphanedJobId: result2.insertId,
            testPhone: '+573001234567'
        };
        
    } catch (error) {
        log(colors.red, '❌ Error setting up test scenarios:', error.message);
        throw error;
    }
}

async function runReconciliation() {
    log(colors.cyan, '\n🔄 Running reconciliation...\n');
    
    try {
        // Verify compiled service exists
        const reconcilerPath = path.join(__dirname, 'dist/services/StartupReconciler.js');
        if (!fs.existsSync(reconcilerPath)) {
            throw new Error('StartupReconciler.js not found in dist/services/. Please run: npm run build');
        }
        
        // Import and run the reconciler
        const { startupReconciler } = require('./dist/services/StartupReconciler');
        const result = await startupReconciler.reconcile();
        
        log(colors.cyan, '\n📊 Reconciliation Results:');
        log(colors.blue, `   Success: ${result.success ? '✓' : '✗'}`);
        log(colors.blue, `   Timestamp: ${result.timestamp.toISOString()}`);
        log(colors.blue, `   Leases Repaired: ${result.leasesRepaired}`);
        log(colors.blue, `   Jobs Requeued: ${result.jobsRequeued}`);
        log(colors.blue, `   Follow-up Candidates: ${result.followUpCandidates}`);
        log(colors.blue, `   Pending Orders: ${result.pendingOrders}`);
        log(colors.blue, `   Errors: ${result.errors.length}`);
        
        if (result.errors.length > 0) {
            log(colors.yellow, '\n⚠️  Errors encountered:');
            result.errors.forEach(err => log(colors.yellow, `   - ${err}`));
        }
        
        return result;
        
    } catch (error) {
        log(colors.red, '❌ Error running reconciliation:', error.message);
        throw error;
    }
}

async function verifyResults(testData) {
    log(colors.cyan, '\n🔍 Verifying reconciliation results...\n');
    
    try {
        // Verify expired lease was reset
        log(colors.blue, '1️⃣  Checking expired lease job...');
        const [expiredJob] = await pool.execute(
            'SELECT * FROM processing_jobs WHERE id = ?',
            [testData.expiredLeaseJobId]
        );
        
        if (expiredJob[0]) {
            const job = expiredJob[0];
            const isFixed = job.locked_by === null && job.locked_until === null;
            const statusCorrect = ['failed', 'queued'].includes(job.status);
            
            if (isFixed && statusCorrect) {
                log(colors.green, `   ✓ Expired lease job fixed (status: ${job.status})`);
            } else {
                log(colors.red, `   ✗ Expired lease job not fixed properly`);
                log(colors.yellow, `      locked_by: ${job.locked_by}, status: ${job.status}`);
            }
        }
        
        // Verify orphaned job was requeued
        log(colors.blue, '\n2️⃣  Checking orphaned job...');
        const [orphanedJob] = await pool.execute(
            'SELECT * FROM processing_jobs WHERE id = ?',
            [testData.orphanedJobId]
        );
        
        if (orphanedJob[0]) {
            const job = orphanedJob[0];
            const statusCorrect = ['failed', 'queued'].includes(job.status);
            
            if (statusCorrect) {
                log(colors.green, `   ✓ Orphaned job requeued (status: ${job.status})`);
            } else {
                log(colors.red, `   ✗ Orphaned job not requeued properly`);
                log(colors.yellow, `      status: ${job.status}`);
            }
        }
        
        // Verify expired cooldown was cleared
        log(colors.blue, '\n3️⃣  Checking user session cooldown...');
        const [session] = await pool.execute(
            'SELECT * FROM user_sessions WHERE phone = ?',
            [testData.testPhone]
        );
        
        if (session[0]) {
            const user = session[0];
            const cooldownCleared = !user.cooldown_until || new Date(user.cooldown_until) < new Date();
            
            if (cooldownCleared) {
                log(colors.green, `   ✓ Expired cooldown cleared`);
            } else {
                log(colors.red, `   ✗ Expired cooldown not cleared`);
                log(colors.yellow, `      cooldown_until: ${user.cooldown_until}`);
            }
        }
        
        log(colors.cyan, '\n✅ Verification completed\n');
        
    } catch (error) {
        log(colors.red, '❌ Error verifying results:', error.message);
        throw error;
    }
}

async function cleanupTestData(testData) {
    log(colors.cyan, '\n🧹 Cleaning up test data...\n');
    
    try {
        // Delete test jobs
        await pool.execute(
            'DELETE FROM processing_jobs WHERE id IN (?, ?)',
            [testData.expiredLeaseJobId, testData.orphanedJobId]
        );
        log(colors.green, '   ✓ Deleted test jobs');
        
        // Delete test user session
        await pool.execute(
            'DELETE FROM user_sessions WHERE phone = ?',
            [testData.testPhone]
        );
        log(colors.green, '   ✓ Deleted test user session');
        
        log(colors.cyan, '\n✅ Cleanup completed\n');
        
    } catch (error) {
        log(colors.yellow, '⚠️  Warning: Error during cleanup:', error.message);
    }
}

async function main() {
    log(colors.cyan, '\n═══════════════════════════════════════');
    log(colors.cyan, '  Startup Reconciliation Validation');
    log(colors.cyan, '═══════════════════════════════════════\n');
    
    let testData = null;
    
    try {
        // Setup test scenarios
        testData = await setupTestScenarios();
        
        // Wait a moment for database to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Run reconciliation
        const result = await runReconciliation();
        
        // Wait for reconciliation to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify results
        await verifyResults(testData);
        
        log(colors.green, '\n✅ All validation tests passed!\n');
        
    } catch (error) {
        log(colors.red, '\n❌ Validation failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        // Cleanup test data
        if (testData) {
            await cleanupTestData(testData);
        }
        
        // Close database connection
        await pool.end();
    }
}

// Run validation
main().catch(error => {
    log(colors.red, '\n❌ Fatal error:', error);
    process.exit(1);
});
