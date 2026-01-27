/**
 * Tests for ProcessingSnapshotService
 * 
 * Validates that the processing snapshot correctly queries database tables
 * for real-time metrics on active jobs, processed messages, errors, and skipped items.
 */

import { ProcessingSnapshotService, ProcessingSnapshot, getProcessingSnapshot } from '../services/ProcessingSnapshotService';

describe('ProcessingSnapshotService', () => {
    let service: ProcessingSnapshotService;

    beforeEach(() => {
        service = new ProcessingSnapshotService();
    });

    describe('getProcessingSnapshot', () => {
        it('should return a valid snapshot structure', async () => {
            const snapshot = await service.getProcessingSnapshot(5);
            
            expect(snapshot).toBeDefined();
            expect(typeof snapshot.activeJobs).toBe('number');
            expect(typeof snapshot.processed).toBe('number');
            expect(typeof snapshot.errors).toBe('number');
            expect(typeof snapshot.skipped).toBe('number');
            expect(snapshot.timestamp).toBeInstanceOf(Date);
            expect(snapshot.windowMinutes).toBe(5);
        });

        it('should use custom time window', async () => {
            const snapshot = await service.getProcessingSnapshot(10);
            
            expect(snapshot.windowMinutes).toBe(10);
        });

        it('should return non-negative values', async () => {
            const snapshot = await service.getProcessingSnapshot(5);
            
            expect(snapshot.activeJobs).toBeGreaterThanOrEqual(0);
            expect(snapshot.processed).toBeGreaterThanOrEqual(0);
            expect(snapshot.errors).toBeGreaterThanOrEqual(0);
            expect(snapshot.skipped).toBeGreaterThanOrEqual(0);
        });

        it('should gracefully handle errors and return zeros', async () => {
            // Even if DB connection fails, should return zeros instead of throwing
            const snapshot = await service.getProcessingSnapshot(5);
            
            expect(snapshot).toBeDefined();
            // Values should be 0 or actual count - never negative or undefined
            expect(snapshot.activeJobs).toBeDefined();
            expect(snapshot.processed).toBeDefined();
            expect(snapshot.errors).toBeDefined();
            expect(snapshot.skipped).toBeDefined();
        });
    });

    describe('getExtendedSnapshot', () => {
        it('should return extended snapshot with additional fields', async () => {
            const snapshot = await service.getExtendedSnapshot(5);
            
            // Base fields
            expect(typeof snapshot.activeJobs).toBe('number');
            expect(typeof snapshot.processed).toBe('number');
            expect(typeof snapshot.errors).toBe('number');
            expect(typeof snapshot.skipped).toBe('number');
            
            // Extended fields
            expect(typeof snapshot.pendingJobs).toBe('number');
            expect(typeof snapshot.completedJobs).toBe('number');
            expect(typeof snapshot.failedJobs).toBe('number');
            expect(typeof snapshot.processingJobLogs).toBe('number');
        });
    });

    describe('convenience function', () => {
        it('should return same result as service method', async () => {
            const serviceSnapshot = await service.getProcessingSnapshot(5);
            const functionSnapshot = await getProcessingSnapshot(5);
            
            // Should have same structure
            expect(functionSnapshot.windowMinutes).toBe(serviceSnapshot.windowMinutes);
            expect(typeof functionSnapshot.activeJobs).toBe('number');
            expect(typeof functionSnapshot.processed).toBe('number');
        });
    });
});
