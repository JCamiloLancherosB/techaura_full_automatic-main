/**
 * Tests for ProcessingSnapshotService
 * 
 * Validates that the processing snapshot correctly queries database tables
 * for real-time metrics on active jobs, processed messages, errors, and skipped items.
 * 
 * Run with: npx tsx src/tests/processingSnapshotService.test.ts
 */

import { ProcessingSnapshotService, getProcessingSnapshot } from '../services/ProcessingSnapshotService';

async function runTests() {
    const service = new ProcessingSnapshotService();
    let passed = 0;
    let failed = 0;

    console.log('🧪 Testing ProcessingSnapshotService...\n');

    // Test 1: Valid snapshot structure
    try {
        const snapshot = await service.getProcessingSnapshot(5);
        
        if (typeof snapshot.activeJobs !== 'number') throw new Error('activeJobs should be number');
        if (typeof snapshot.processed !== 'number') throw new Error('processed should be number');
        if (typeof snapshot.errors !== 'number') throw new Error('errors should be number');
        if (typeof snapshot.skipped !== 'number') throw new Error('skipped should be number');
        if (!(snapshot.timestamp instanceof Date)) throw new Error('timestamp should be Date');
        if (snapshot.windowMinutes !== 5) throw new Error('windowMinutes should be 5');
        
        console.log('✅ Test 1: Valid snapshot structure');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 1: Valid snapshot structure -', error.message);
        failed++;
    }

    // Test 2: Custom time window
    try {
        const snapshot = await service.getProcessingSnapshot(10);
        
        if (snapshot.windowMinutes !== 10) throw new Error('windowMinutes should be 10');
        
        console.log('✅ Test 2: Custom time window');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 2: Custom time window -', error.message);
        failed++;
    }

    // Test 3: Non-negative values
    try {
        const snapshot = await service.getProcessingSnapshot(5);
        
        if (snapshot.activeJobs < 0) throw new Error('activeJobs should not be negative');
        if (snapshot.processed < 0) throw new Error('processed should not be negative');
        if (snapshot.errors < 0) throw new Error('errors should not be negative');
        if (snapshot.skipped < 0) throw new Error('skipped should not be negative');
        
        console.log('✅ Test 3: Non-negative values');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 3: Non-negative values -', error.message);
        failed++;
    }

    // Test 4: Extended snapshot
    try {
        const snapshot = await service.getExtendedSnapshot(5);
        
        if (typeof snapshot.pendingJobs !== 'number') throw new Error('pendingJobs should be number');
        if (typeof snapshot.completedJobs !== 'number') throw new Error('completedJobs should be number');
        if (typeof snapshot.failedJobs !== 'number') throw new Error('failedJobs should be number');
        if (typeof snapshot.processingJobLogs !== 'number') throw new Error('processingJobLogs should be number');
        
        console.log('✅ Test 4: Extended snapshot fields');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 4: Extended snapshot fields -', error.message);
        failed++;
    }

    // Test 5: Convenience function
    try {
        const snapshot = await getProcessingSnapshot(5);
        
        if (typeof snapshot.activeJobs !== 'number') throw new Error('Function should return valid snapshot');
        
        console.log('✅ Test 5: Convenience function');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 5: Convenience function -', error.message);
        failed++;
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    
    // Exit with proper code
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
});
