/**
 * Demo: Lease-Based Processing Worker
 * 
 * This script demonstrates the lease-based worker system in action.
 * Run this to see how jobs are acquired, processed, and recovered.
 * 
 * Usage:
 *   node demo-lease-worker.js
 */

const { ProcessingWorker } = require('./dist/services/ProcessingWorker');
const { processingJobService } = require('./dist/services/ProcessingJobService');
const { processingJobRepository } = require('./dist/repositories/ProcessingJobRepository');

/**
 * Custom worker that simulates actual job processing
 */
class DemoWorker extends ProcessingWorker {
    constructor(config) {
        super(config);
        this.jobsProcessed = 0;
    }
    
    async processJob(job) {
        const jobId = job.id;
        
        try {
            console.log(`\n🎬 [${this.workerId}] Starting job ${jobId}`);
            console.log(`   Order: ${job.order_id}`);
            console.log(`   Attempt: ${job.attempts}`);
            console.log(`   Lease until: ${job.locked_until}`);
            
            // Simulate different processing steps
            await this.simulateStep(jobId, 'Initializing', 10);
            await this.simulateStep(jobId, 'Loading content', 30);
            await this.simulateStep(jobId, 'Processing files', 60);
            await this.simulateStep(jobId, 'Verifying output', 85);
            await this.simulateStep(jobId, 'Finalizing', 100);
            
            // Release lease with success
            await processingJobService.releaseLease(jobId, this.workerId, 'done');
            
            this.jobsProcessed++;
            console.log(`✅ [${this.workerId}] Job ${jobId} completed successfully`);
            console.log(`   Total jobs processed: ${this.jobsProcessed}`);
            
            this.emit('job:completed', { job });
            
        } catch (error) {
            console.error(`❌ [${this.workerId}] Job ${jobId} failed:`, error.message);
            
            // Determine if we should retry
            const shouldRetry = job.attempts < 3;
            const status = shouldRetry ? 'retry' : 'failed';
            
            await processingJobService.releaseLease(jobId, this.workerId, status, error.message);
            
            console.log(`   Status: ${status} (attempt ${job.attempts}/3)`);
            
            this.emit('job:failed', { job, error });
        } finally {
            // Clean up
            this.activeJobs.delete(jobId);
            
            const timer = this.leaseExtensionTimers.get(jobId);
            if (timer) {
                clearTimeout(timer);
                this.leaseExtensionTimers.delete(jobId);
            }
        }
    }
    
    async simulateStep(jobId, stepName, progress) {
        console.log(`   ⚙️  ${stepName}... (${progress}%)`);
        await processingJobService.updateProgress(jobId, progress, stepName);
        
        // Simulate work with random delay
        const delay = Math.random() * 2000 + 1000; // 1-3 seconds
        await this.sleep(delay);
    }
}

/**
 * Main demo function
 */
async function runDemo() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║      Lease-Based Processing Worker - Demo                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    console.log('This demo shows how the lease-based worker system handles:');
    console.log('  1. Job acquisition with atomic leases');
    console.log('  2. Automatic lease extension for long jobs');
    console.log('  3. Recovery from expired leases on restart');
    console.log('  4. Retry logic for failed jobs');
    console.log('  5. Graceful shutdown with lease release\n');
    
    console.log('Press Ctrl+C to simulate a crash and see recovery in action!\n');
    console.log('─────────────────────────────────────────────────────────────\n');
    
    // Create worker instance
    const worker = new DemoWorker({
        workerId: `demo-worker-${process.pid}`,
        leaseDurationSeconds: 60,      // 1 minute leases
        pollIntervalMs: 3000,           // Check every 3 seconds
        maxConcurrentJobs: 1,           // Process one at a time for demo
        leaseExtensionThresholdPercent: 50  // Extend at 50%
    });
    
    // Set up event listeners
    worker.on('worker:started', ({ workerId }) => {
        console.log(`🚀 Worker started: ${workerId}`);
    });
    
    worker.on('worker:stopped', ({ workerId }) => {
        console.log(`🛑 Worker stopped: ${workerId}`);
    });
    
    worker.on('job:started', ({ job }) => {
        console.log(`📋 Job acquired: ${job.id}`);
    });
    
    worker.on('job:completed', ({ job }) => {
        console.log(`✅ Job completed: ${job.id}`);
    });
    
    worker.on('job:failed', ({ job, error }) => {
        console.log(`❌ Job failed: ${job.id} - ${error.message}`);
    });
    
    // Start the worker
    try {
        await worker.start();
        
        console.log('\n📊 Worker Status:');
        console.log(JSON.stringify(worker.getStatus(), null, 2));
        console.log('\n─────────────────────────────────────────────────────────────');
        
        // Keep the process running
        console.log('\n👀 Watching for jobs... (worker will poll every 3 seconds)');
        console.log('💡 Tip: Add jobs to the queue to see them being processed');
        console.log('💡 Tip: Kill this process and restart to see lease recovery\n');
        
        // Periodic status updates
        setInterval(() => {
            const status = worker.getStatus();
            if (status.activeJobs > 0) {
                console.log(`\n📊 Status: Processing ${status.activeJobs} job(s)...`);
            }
        }, 10000);
        
    } catch (error) {
        console.error('❌ Failed to start worker:', error);
        process.exit(1);
    }
}

/**
 * Helper function to create test jobs
 * Run this in a separate terminal to add jobs for the worker to process
 */
async function createTestJobs(count = 3) {
    console.log(`\n📝 Creating ${count} test jobs...\n`);
    
    for (let i = 1; i <= count; i++) {
        try {
            const jobId = await processingJobRepository.create({
                order_id: `demo-order-${Date.now()}-${i}`,
                usb_capacity: '32GB',
                preferences: { genre: 'test' },
                status: 'pending',
                progress: 0
            });
            
            console.log(`✅ Created job ${jobId}: demo-order-${Date.now()}-${i}`);
        } catch (error) {
            console.error(`❌ Failed to create job ${i}:`, error.message);
        }
    }
    
    console.log(`\n✅ Created ${count} test jobs`);
    console.log('💡 Start the worker with: node demo-lease-worker.js\n');
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === 'create-jobs') {
    const count = parseInt(args[1]) || 3;
    createTestJobs(count)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Failed to create jobs:', error);
            process.exit(1);
        });
} else if (command === 'help' || command === '--help' || command === '-h') {
    console.log('Usage:');
    console.log('  node demo-lease-worker.js              # Start the demo worker');
    console.log('  node demo-lease-worker.js create-jobs  # Create 3 test jobs');
    console.log('  node demo-lease-worker.js create-jobs 5 # Create 5 test jobs');
    console.log('  node demo-lease-worker.js help         # Show this help');
    process.exit(0);
} else {
    // Run the demo worker
    runDemo().catch((error) => {
        console.error('Demo failed:', error);
        process.exit(1);
    });
}
