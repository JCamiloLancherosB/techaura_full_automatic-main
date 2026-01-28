/**
 * USB Processing Deferral Test
 * Ensures orders are queued when no USB is available without blocking flows.
 */

async function runTest() {
    process.env.MYSQL_DB_USER = process.env.MYSQL_DB_USER || 'test';
    process.env.MYSQL_DB_PASSWORD = process.env.MYSQL_DB_PASSWORD || 'test';
    process.env.MYSQL_DB_NAME = process.env.MYSQL_DB_NAME || 'test';
    process.env.MYSQL_DB_HOST = process.env.MYSQL_DB_HOST || 'localhost';
    process.env.MYSQL_DB_PORT = process.env.MYSQL_DB_PORT || '3306';
    process.env.MYSQL_DB_CONNECT_TIMEOUT = process.env.MYSQL_DB_CONNECT_TIMEOUT || '1000';
    process.env.SKIP_DB_UPDATES = 'true';

    const { ProcessingSystem } = await import('../core/ProcessingSystem');
    const { ProcessingJob } = await import('../models/ProcessingJob');

    const system = new ProcessingSystem();
    (system as any).content.verifyContentDirectories = async () => {};
    (system as any).content.prepareContent = async () => ({
        finalContent: [],
        missingContent: [],
        totalSize: 0,
        estimatedCopyTime: 0
    });
    (system as any).writer.detectAvailableDevices = async () => {};
    (system as any).writer.getAvailableDevice = async () => null;

    const job = new ProcessingJob({
        orderId: 'TEST-ORDER',
        customerId: 'TEST-CUSTOMER',
        customerPhone: '3001234567',
        customerName: 'Cliente',
        contentType: 'music',
        capacity: '32GB',
        preferences: ['rock']
    });

    const result = await system.run({ job });
    if (!result || !result.deferred) {
        throw new Error('Expected job to be deferred when no USB is available');
    }

    if (job.status !== 'queued') {
        throw new Error(`Expected job status queued, got ${job.status}`);
    }

    delete process.env.SKIP_DB_UPDATES;
}

if (require.main === module) {
    runTest()
        .then(() => {
            console.log('✅ USB deferral test passed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ USB deferral test failed:', error);
            process.exit(1);
        });
}

export { runTest };
