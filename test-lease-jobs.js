/**
 * Test script for lease-based job processing
 * 
 * This script tests:
 * 1. Running the migration to add lease columns
 * 2. Creating test jobs
 * 3. Acquiring and releasing leases
 * 4. Resetting expired leases
 */

const knex = require('knex');
const path = require('path');

const knexConfig = {
    client: 'mysql2',
    connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'techaura_db'
    },
    migrations: {
        directory: path.join(__dirname, '../migrations'),
        tableName: 'knex_migrations'
    }
};

async function testLeasedJobs() {
    console.log('🧪 Testing lease-based job processing...\n');
    
    const db = knex(knexConfig);
    
    try {
        // 1. Run migrations
        console.log('📋 Running migrations...');
        await db.migrate.latest();
        console.log('✅ Migrations completed\n');
        
        // 2. Check if lease columns exist
        console.log('🔍 Checking lease columns...');
        const columns = await db('processing_jobs').columnInfo();
        
        const requiredColumns = ['locked_by', 'locked_until', 'attempts', 'last_error'];
        const missingColumns = requiredColumns.filter(col => !columns[col]);
        
        if (missingColumns.length > 0) {
            console.error('❌ Missing columns:', missingColumns);
            throw new Error('Migration did not create all required columns');
        }
        console.log('✅ All lease columns present:', requiredColumns.join(', '), '\n');
        
        // 3. Create test jobs if processing_jobs table exists and is empty
        console.log('📝 Setting up test jobs...');
        
        // Check if we need to create the order first
        const orderExists = await db('orders')
            .where('order_number', 'TEST-LEASE-001')
            .first();
        
        let orderId;
        if (!orderExists) {
            // Create a test order
            const [insertedOrderId] = await db('orders').insert({
                order_number: 'TEST-LEASE-001',
                customer_phone: '+1234567890',
                customer_name: 'Test Customer',
                status: 'pending',
                content_type: 'music',
                capacity: '32GB',
                price: 50000,
                created_at: db.fn.now()
            });
            orderId = insertedOrderId;
            console.log('✅ Created test order:', orderId);
        } else {
            orderId = orderExists.id;
            console.log('✅ Using existing test order:', orderId);
        }
        
        // Clean up any existing test jobs
        await db('processing_jobs')
            .where('order_id', orderId)
            .delete();
        
        // Create test jobs
        const testJobs = [];
        for (let i = 1; i <= 3; i++) {
            const [jobId] = await db('processing_jobs').insert({
                job_id: `test-job-${Date.now()}-${i}`,
                order_id: orderId,
                job_type: 'test',
                status: 'queued',
                progress: 0,
                attempts: 0,
                created_at: db.fn.now()
            });
            testJobs.push(jobId);
            console.log(`✅ Created test job ${i}:`, jobId);
        }
        console.log('');
        
        // 4. Test lease acquisition
        console.log('🔒 Testing lease acquisition...');
        const workerId = `test-worker-${process.pid}`;
        const leaseDuration = 60; // 60 seconds
        const leaseUntil = new Date();
        leaseUntil.setSeconds(leaseUntil.getSeconds() + leaseDuration);
        
        // Acquire first job
        await db.raw(`
            UPDATE processing_jobs 
            SET locked_by = ?,
                locked_until = ?,
                status = 'processing',
                attempts = attempts + 1,
                updated_at = NOW()
            WHERE id = (
                SELECT id FROM (
                    SELECT id 
                    FROM processing_jobs 
                    WHERE status IN ('queued', 'pending')
                    AND (locked_until IS NULL OR locked_until < NOW())
                    AND attempts < 3
                    ORDER BY created_at ASC
                    LIMIT 1
                ) AS subquery
            )
        `, [workerId, leaseUntil]);
        
        const acquiredJob = await db('processing_jobs')
            .where('locked_by', workerId)
            .first();
        
        if (!acquiredJob) {
            throw new Error('Failed to acquire lease');
        }
        
        console.log('✅ Acquired lease for job:', acquiredJob.id);
        console.log('   Worker ID:', acquiredJob.locked_by);
        console.log('   Lease until:', acquiredJob.locked_until);
        console.log('   Attempts:', acquiredJob.attempts, '\n');
        
        // 5. Test lease extension
        console.log('🔄 Testing lease extension...');
        const newLeaseUntil = new Date();
        newLeaseUntil.setSeconds(newLeaseUntil.getSeconds() + leaseDuration);
        
        await db('processing_jobs')
            .where('id', acquiredJob.id)
            .where('locked_by', workerId)
            .update({
                locked_until: newLeaseUntil,
                updated_at: db.fn.now()
            });
        
        const extendedJob = await db('processing_jobs')
            .where('id', acquiredJob.id)
            .first();
        
        console.log('✅ Extended lease for job:', extendedJob.id);
        console.log('   New lease until:', extendedJob.locked_until, '\n');
        
        // 6. Test release lease
        console.log('🔓 Testing lease release...');
        await db('processing_jobs')
            .where('id', acquiredJob.id)
            .where('locked_by', workerId)
            .update({
                locked_by: null,
                locked_until: null,
                status: 'completed',
                finished_at: db.fn.now(),
                updated_at: db.fn.now()
            });
        
        const releasedJob = await db('processing_jobs')
            .where('id', acquiredJob.id)
            .first();
        
        console.log('✅ Released lease for job:', releasedJob.id);
        console.log('   Status:', releasedJob.status);
        console.log('   Locked by:', releasedJob.locked_by, '\n');
        
        // 7. Test expired lease reset
        console.log('⏰ Testing expired lease reset...');
        
        // Create a job with an expired lease
        const expiredLeaseTime = new Date();
        expiredLeaseTime.setSeconds(expiredLeaseTime.getSeconds() - 300); // 5 minutes ago
        
        await db('processing_jobs')
            .where('id', testJobs[1])
            .update({
                locked_by: 'expired-worker',
                locked_until: expiredLeaseTime,
                status: 'processing',
                attempts: 1
            });
        
        console.log('✅ Created job with expired lease:', testJobs[1]);
        
        // Reset expired leases
        const resetResult = await db.raw(`
            UPDATE processing_jobs 
            SET locked_by = NULL,
                locked_until = NULL,
                status = IF(attempts >= 3, 'failed', 'queued'),
                last_error = CONCAT(
                    COALESCE(last_error, ''),
                    IF(last_error IS NOT NULL, '; ', ''),
                    'Lease expired - worker crashed or timed out'
                ),
                finished_at = IF(attempts >= 3, NOW(), finished_at),
                updated_at = NOW()
            WHERE status = 'processing'
            AND locked_until IS NOT NULL
            AND locked_until < NOW()
        `);
        
        const resetJob = await db('processing_jobs')
            .where('id', testJobs[1])
            .first();
        
        console.log('✅ Reset expired lease for job:', resetJob.id);
        console.log('   Status:', resetJob.status);
        console.log('   Locked by:', resetJob.locked_by);
        console.log('   Last error:', resetJob.last_error, '\n');
        
        // 8. Test retry attempts limit
        console.log('🔁 Testing retry attempts limit...');
        
        // Update job to have 3 attempts
        await db('processing_jobs')
            .where('id', testJobs[2])
            .update({ attempts: 3 });
        
        // Try to acquire it (should fail because attempts >= 3)
        await db.raw(`
            UPDATE processing_jobs 
            SET locked_by = ?,
                locked_until = ?,
                status = 'processing',
                attempts = attempts + 1,
                updated_at = NOW()
            WHERE id = (
                SELECT id FROM (
                    SELECT id 
                    FROM processing_jobs 
                    WHERE id = ?
                    AND status IN ('queued', 'pending')
                    AND (locked_until IS NULL OR locked_until < NOW())
                    AND attempts < 3
                    ORDER BY created_at ASC
                    LIMIT 1
                ) AS subquery
            )
        `, [workerId, leaseUntil, testJobs[2]]);
        
        const jobWithMaxAttempts = await db('processing_jobs')
            .where('id', testJobs[2])
            .first();
        
        if (jobWithMaxAttempts.locked_by === workerId) {
            throw new Error('Job with max attempts should not be acquired');
        }
        
        console.log('✅ Job with max attempts not acquired:', jobWithMaxAttempts.id);
        console.log('   Attempts:', jobWithMaxAttempts.attempts);
        console.log('   Locked by:', jobWithMaxAttempts.locked_by, '\n');
        
        // 9. Summary
        console.log('📊 Test Summary:');
        const allJobs = await db('processing_jobs')
            .whereIn('id', testJobs)
            .select('id', 'status', 'attempts', 'locked_by', 'locked_until');
        
        console.table(allJobs);
        
        console.log('\n✅ All lease-based job tests passed!');
        
        // Clean up test data
        console.log('\n🧹 Cleaning up test data...');
        await db('processing_jobs').whereIn('id', testJobs).delete();
        await db('orders').where('id', orderId).delete();
        console.log('✅ Test data cleaned up');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        throw error;
    } finally {
        await db.destroy();
    }
}

// Run tests
if (require.main === module) {
    testLeasedJobs()
        .then(() => {
            console.log('\n🎉 All tests completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Tests failed:', error);
            process.exit(1);
        });
}

module.exports = { testLeasedJobs };
