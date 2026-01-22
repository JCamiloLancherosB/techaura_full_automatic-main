/**
 * Processing Jobs Pipeline Integration Test
 * Tests the complete flow from order confirmation to job processing
 */

import { processingJobRepository } from '../repositories/ProcessingJobRepository';
import { jobLogRepository } from '../repositories/JobLogRepository';
import { processingJobService } from '../services/ProcessingJobService';

/**
 * Test scenario: Order confirmation creates processing job
 * 
 * This test verifies:
 * 1. Job is created with status PENDING
 * 2. Job can be retrieved from database
 * 3. Job status can be updated
 * 4. Logs are created for each stage
 */
async function testOrderConfirmationCreatesJob() {
    console.log('\n📋 Test: Order confirmation creates processing job');
    
    try {
        // Create a test job (simulating ORDER_CONFIRMED event)
        const jobId = await processingJobService.createJob({
            order_id: 'TEST-ORDER-' + Date.now(),
            usb_capacity: '32GB',
            preferences: [{ genre: 'rock', artist: 'test' }],
            status: 'pending',
            progress: 0
        });
        
        console.log(`✅ Job created with ID: ${jobId}`);
        
        // Verify job exists in database
        const job = await processingJobRepository.getById(jobId);
        if (!job) {
            throw new Error('Job not found in database');
        }
        
        console.log(`✅ Job retrieved from database: status=${job.status}, progress=${job.progress}`);
        
        // Verify job has correct initial state
        if (job.status !== 'pending') {
            throw new Error(`Expected status 'pending', got '${job.status}'`);
        }
        
        if (job.progress !== 0) {
            throw new Error(`Expected progress 0, got ${job.progress}`);
        }
        
        console.log('✅ Job has correct initial state');
        
        return jobId;
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

/**
 * Test scenario: Job progresses through stages with logging
 * 
 * This test verifies:
 * 1. Job status can be updated to PROCESSING
 * 2. Progress updates are saved
 * 3. Logs are created for each stage
 * 4. Job can be marked as completed
 */
async function testJobProgressionWithLogs(jobId: number) {
    console.log('\n📋 Test: Job progression through stages');
    
    try {
        // Stage 1: Update to PROCESSING
        await processingJobRepository.update({
            id: jobId,
            status: 'processing',
            started_at: new Date()
        });
        
        await jobLogRepository.create({
            job_id: jobId,
            level: 'info',
            category: 'validation',
            message: 'Starting validation',
            details: { test: true }
        });
        
        console.log('✅ Stage 1: Validation started');
        
        // Stage 2: Progress update
        await processingJobRepository.updateProgress(jobId, 30, 'Content selection in progress');
        
        await jobLogRepository.create({
            job_id: jobId,
            level: 'info',
            category: 'content_selection',
            message: 'Content selected',
            details: { test: true }
        });
        
        console.log('✅ Stage 2: Content selection (30% progress)');
        
        // Stage 3: USB Writing
        await processingJobRepository.updateProgress(jobId, 70, 'USB writing in progress');
        
        await jobLogRepository.create({
            job_id: jobId,
            level: 'info',
            category: 'copy',
            message: 'USB writing started',
            details: { test: true }
        });
        
        console.log('✅ Stage 3: USB writing (70% progress)');
        
        // Stage 4: Verification
        await processingJobRepository.updateProgress(jobId, 90, 'Verifying files');
        
        await jobLogRepository.create({
            job_id: jobId,
            level: 'info',
            category: 'verify',
            message: 'Verification started',
            details: { test: true }
        });
        
        console.log('✅ Stage 4: Verification (90% progress)');
        
        // Mark as completed
        await processingJobRepository.markAsCompleted(jobId);
        
        console.log('✅ Job marked as completed');
        
        // Verify final state
        const job = await processingJobRepository.getById(jobId);
        if (!job) {
            throw new Error('Job not found');
        }
        
        if (job.status !== 'done') {
            throw new Error(`Expected status 'done', got '${job.status}'`);
        }
        
        if (job.progress !== 100) {
            throw new Error(`Expected progress 100, got ${job.progress}`);
        }
        
        console.log('✅ Job has correct final state');
        
        // Verify logs were created
        const logs = await jobLogRepository.getByJobId(jobId, 100);
        console.log(`✅ Found ${logs.length} log entries`);
        
        if (logs.length < 4) {
            throw new Error(`Expected at least 4 log entries, found ${logs.length}`);
        }
        
        console.log('✅ All logs created successfully');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

/**
 * Test scenario: Job failure is handled correctly
 * 
 * This test verifies:
 * 1. Job can be marked as failed
 * 2. Failure reason is saved
 * 3. Error logs are created
 */
async function testJobFailureHandling() {
    console.log('\n📋 Test: Job failure handling');
    
    try {
        // Create a test job
        const jobId = await processingJobService.createJob({
            order_id: 'TEST-FAIL-' + Date.now(),
            usb_capacity: '64GB',
            preferences: [],
            status: 'pending',
            progress: 0
        });
        
        console.log(`✅ Test job created with ID: ${jobId}`);
        
        // Mark as failed
        await processingJobRepository.markAsFailed(
            jobId,
            'Test failure reason',
            { error: 'Simulated error', test: true }
        );
        
        console.log('✅ Job marked as failed');
        
        // Verify failure state
        const job = await processingJobRepository.getById(jobId);
        if (!job) {
            throw new Error('Job not found');
        }
        
        if (job.status !== 'failed') {
            throw new Error(`Expected status 'failed', got '${job.status}'`);
        }
        
        if (!job.fail_reason) {
            throw new Error('Expected fail_reason to be set');
        }
        
        console.log(`✅ Job has correct failure state: ${job.fail_reason}`);
        
        // Verify error log was created
        const logs = await jobLogRepository.getByJobId(jobId, 100);
        const errorLogs = logs.filter(log => log.level === 'error');
        
        if (errorLogs.length === 0) {
            throw new Error('Expected error log to be created');
        }
        
        console.log('✅ Error log created successfully');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('🧪 Starting Processing Jobs Pipeline Integration Tests\n');
    console.log('=' .repeat(60));
    
    try {
        // Test 1: Order confirmation creates job
        const jobId = await testOrderConfirmationCreatesJob();
        
        // Test 2: Job progression with logs
        await testJobProgressionWithLogs(jobId);
        
        // Test 3: Failure handling
        await testJobFailureHandling();
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests passed!\n');
        
        return true;
    } catch (error) {
        console.log('\n' + '='.repeat(60));
        console.error('❌ Tests failed!\n');
        return false;
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

export { runTests };
