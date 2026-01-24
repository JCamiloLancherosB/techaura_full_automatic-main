/**
 * Centralized Cache Service with TTL and Event-based Invalidation
 * Provides dashboard live mode with short TTL (10-30s) and instant invalidation
 */

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

export interface CacheOptions {
    ttl?: number; // Time to live in milliseconds
}

/**
 * Cache patterns for different data types
 */
export const CACHE_KEYS = {
    DASHBOARD_STATS: 'dashboard:stats',
    ANALYTICS_DAILY: 'analytics:daily',
    ANALYTICS_INTENTS: 'analytics:intents',
    ANALYTICS_FOLLOWUP: 'analytics:followup',
    ANALYTICS_WATERMARKS: 'analytics:watermarks',
    ORDER_EVENTS: (orderId: string) => `order:${orderId}:events`,
    ORDER_TIMELINE: (orderId: string) => `order:${orderId}:timeline`,
    CATALOG_ITEMS: 'catalog:items',
    CATALOG_ITEM: (itemId: number) => `catalog:item:${itemId}`,
    CATALOG_CATEGORY: (category: string) => `catalog:category:${category}`,
    PRODUCTION_JOBS: 'production:jobs',
    JOB_DETAILS: (jobId: number) => `job:${jobId}:details`,
    CHATBOT_ANALYTICS: 'chatbot:analytics',
} as const;

/**
 * TTL configurations for different cache types (in milliseconds)
 */
export const CACHE_TTL = {
    DASHBOARD: 15 * 1000,      // 15 seconds for dashboard stats
    ANALYTICS: 20 * 1000,      // 20 seconds for analytics
    ORDER_EVENTS: 15 * 1000,   // 15 seconds for order events
    CATALOG: 30 * 1000,        // 30 seconds for catalog
    JOBS: 20 * 1000,           // 20 seconds for production jobs
    DEFAULT: 30 * 1000,        // 30 seconds default
} as const;

/**
 * Centralized Cache Service
 * Supports TTL-based expiration and event-based invalidation
 */
export class CacheService {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private readonly defaultTTL: number = CACHE_TTL.DEFAULT;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Start auto-cleanup
        this.startAutoCleanup();
    }

    /**
     * Start automatic cleanup interval
     */
    private startAutoCleanup(): void {
        if (!this.cleanupInterval) {
            this.cleanupInterval = setInterval(() => {
                this.cleanup();
            }, 60 * 1000);
            
            // Unref the interval so it doesn't keep the process alive
            if (this.cleanupInterval.unref) {
                this.cleanupInterval.unref();
            }
        }
    }

    /**
     * Stop automatic cleanup interval (for testing)
     */
    stopAutoCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Get cached value if it exists and is not expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }

        const now = Date.now();
        const age = now - entry.timestamp;

        // Check if entry has expired
        if (age > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Set cache value with optional TTL
     */
    set<T>(key: string, data: T, options?: CacheOptions): void {
        const ttl = options?.ttl ?? this.defaultTTL;
        
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Delete specific cache entry
     */
    delete(key: string): boolean {
        return this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Invalidate cache by pattern (e.g., "order:*" invalidates all order caches)
     */
    invalidatePattern(pattern: string): number {
        let count = 0;
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }
        
        return count;
    }

    /**
     * Invalidate all dashboard-related caches
     * Called when orders, jobs, or events are created/updated
     */
    invalidateDashboard(): void {
        this.invalidatePattern('dashboard:*');
        this.invalidatePattern('analytics:*');
        this.invalidatePattern('chatbot:*');
        console.log('🔄 Dashboard cache invalidated');
    }

    /**
     * Invalidate order-related caches
     * Called when an order is created/updated
     */
    invalidateOrder(orderId?: string): void {
        if (orderId) {
            this.invalidatePattern(`order:${orderId}:*`);
        }
        this.invalidateDashboard(); // Orders affect dashboard stats
        console.log(`🔄 Order cache invalidated${orderId ? ` for order ${orderId}` : ''}`);
    }

    /**
     * Invalidate job-related caches
     * Called when a processing job is created/updated
     */
    invalidateJob(jobId?: number): void {
        if (jobId) {
            this.delete(CACHE_KEYS.JOB_DETAILS(jobId));
        }
        this.delete(CACHE_KEYS.PRODUCTION_JOBS);
        this.invalidateDashboard(); // Jobs affect dashboard stats
        console.log(`🔄 Job cache invalidated${jobId ? ` for job ${jobId}` : ''}`);
    }

    /**
     * Invalidate event-related caches
     * Called when an order event is created
     */
    invalidateEvent(orderId?: string): void {
        if (orderId) {
            this.invalidatePattern(`order:${orderId}:*`);
        }
        // Events may affect analytics
        this.invalidatePattern('analytics:*');
        console.log(`🔄 Event cache invalidated${orderId ? ` for order ${orderId}` : ''}`);
    }

    /**
     * Invalidate catalog-related caches
     * Called when catalog items are created/updated
     */
    invalidateCatalog(itemId?: number, category?: string): void {
        if (itemId) {
            this.delete(CACHE_KEYS.CATALOG_ITEM(itemId));
        }
        if (category) {
            this.delete(CACHE_KEYS.CATALOG_CATEGORY(category));
        }
        this.delete(CACHE_KEYS.CATALOG_ITEMS);
        console.log('🔄 Catalog cache invalidated');
    }

    /**
     * Get cache statistics for monitoring
     */
    getStats(): {
        size: number;
        keys: string[];
        entries: Array<{ key: string; age: number; ttl: number }>;
    } {
        const now = Date.now();
        const entries: Array<{ key: string; age: number; ttl: number }> = [];
        
        for (const [key, entry] of this.cache.entries()) {
            entries.push({
                key,
                age: now - entry.timestamp,
                ttl: entry.ttl
            });
        }
        
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
            entries
        };
    }

    /**
     * Clean up expired entries (call periodically)
     */
    cleanup(): number {
        let count = 0;
        const now = Date.now();
        
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                count++;
            }
        }
        
        if (count > 0) {
            console.log(`🧹 Cleaned up ${count} expired cache entries`);
        }
        
        return count;
    }
}

// Singleton instance
export const cacheService = new CacheService();
