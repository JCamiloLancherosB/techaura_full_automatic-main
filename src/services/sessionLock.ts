/**
 * Session Lock Service
 * Provides mutex/lock mechanism to prevent race conditions when accessing user sessions
 */

export class SessionLock {
    private locks = new Map<string, Promise<void>>();
    private lockHolders = new Map<string, string>();
    private lockTimestamps = new Map<string, number>();
    private readonly LOCK_TIMEOUT = 5000; // 5 seconds max lock time
    private cleanupIntervalId?: NodeJS.Timeout;
    
    /**
     * Acquire a lock for a specific phone number
     * Returns a release function that must be called when done
     */
    async acquire(phone: string): Promise<() => void> {
        // Wait for existing lock to release
        while (this.locks.has(phone)) {
            const existingLock = this.locks.get(phone);
            
            // Check for stale locks (timeout)
            const lockTimestamp = this.lockTimestamps.get(phone) || 0;
            if (Date.now() - lockTimestamp > this.LOCK_TIMEOUT) {
                console.warn(`⚠️ Lock timeout for ${phone}, forcing release`);
                this.forceRelease(phone);
                break;
            }
            
            try {
                await existingLock;
            } catch (error) {
                // Lock was released with error, continue
            }
        }
        
        // Create new lock
        let release!: () => void; // Use definite assignment assertion since it's set synchronously in Promise executor
        const promise = new Promise<void>(r => { release = r; });
        
        this.locks.set(phone, promise);
        this.lockTimestamps.set(phone, Date.now());
        this.lockHolders.set(phone, new Error().stack || 'unknown');
        
        // Return release function
        return () => {
            this.locks.delete(phone);
            this.lockTimestamps.delete(phone);
            this.lockHolders.delete(phone);
            release();
        };
    }
    
    /**
     * Execute an operation with automatic lock acquisition and release
     */
    async withLock<T>(phone: string, operation: () => Promise<T> | T): Promise<T> {
        const release = await this.acquire(phone);
        try {
            return await operation();
        } finally {
            release();
        }
    }
    
    /**
     * Force release a lock (for timeout scenarios)
     */
    private forceRelease(phone: string): void {
        this.locks.delete(phone);
        this.lockTimestamps.delete(phone);
        this.lockHolders.delete(phone);
    }
    
    /**
     * Check if a phone number is currently locked
     */
    isLocked(phone: string): boolean {
        return this.locks.has(phone);
    }
    
    /**
     * Get statistics about current locks
     */
    getStats() {
        return {
            activeLocks: this.locks.size,
            locks: Array.from(this.locks.keys()),
            lockAges: Array.from(this.lockTimestamps.entries()).map(([phone, timestamp]) => ({
                phone,
                ageMs: Date.now() - timestamp
            }))
        };
    }
    
    /**
     * Clean up old locks (should be called periodically)
     */
    cleanup(): void {
        const now = Date.now();
        for (const [phone, timestamp] of this.lockTimestamps.entries()) {
            if (now - timestamp > this.LOCK_TIMEOUT) {
                console.warn(`🧹 Cleaning up stale lock for ${phone}`);
                this.forceRelease(phone);
            }
        }
    }
    
    /**
     * Start cleanup interval
     */
    startCleanup(): void {
        if (!this.cleanupIntervalId) {
            this.cleanupIntervalId = setInterval(() => this.cleanup(), 10000); // Every 10 seconds
        }
    }
    
    /**
     * Stop cleanup interval for graceful shutdown
     */
    stopCleanup(): void {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = undefined;
        }
    }
}

// Export singleton instance
export const sessionLock = new SessionLock();

// Start cleanup interval
sessionLock.startCleanup();
