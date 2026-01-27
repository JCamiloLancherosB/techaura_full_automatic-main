/**
 * Centralized Cache Service with TTL and Event-based Invalidation
 * Provides dashboard live mode with configurable TTL (30-120s) and instant invalidation
 * 
 * Features:
 * - Cache TTL 30-120s for analytics/dashboard endpoints by date range
 * - Automatic invalidation when orders, settings, or events change
 * - Cache hit logging for monitoring
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
    DASHBOARD_SUMMARY: 'dashboard_summary',
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
    SETTINGS: 'settings',
} as const;

/**
 * TTL configurations for different cache types (in milliseconds)
 * Analytics/dashboard caches use 30-120s TTL for better performance
 */
export const CACHE_TTL = {
    DASHBOARD: 30 * 1000,               // 30 seconds for dashboard stats
    ANALYTICS: 60 * 1000,               // 60 seconds for analytics
    ANALYTICS_DATE_RANGE: 120 * 1000,   // 120 seconds for date-range analytics queries
    ORDER_EVENTS: 30 * 1000,            // 30 seconds for order events
    CATALOG: 60 * 1000,                 // 60 seconds for catalog
    JOBS: 30 * 1000,                    // 30 seconds for production jobs
    SETTINGS: 120 * 1000,               // 120 seconds for settings cache
    DEFAULT: 60 * 1000,                 // 60 seconds default
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
     * Logs cache hit for monitoring
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

        // Log cache hit for monitoring (only for analytics/dashboard keys)
        if (key.startsWith('dashboard') || key.startsWith('analytics')) {
            console.log(`📦 Cache HIT: ${key} (age: ${Math.round(age / 1000)}s, ttl: ${Math.round(entry.ttl / 1000)}s)`);
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
     * Invalidate settings-related caches
     * Called when system settings are updated
     * Settings can affect dashboard/analytics behavior, so we invalidate them too
     */
    invalidateSettings(): void {
        this.invalidatePattern('settings:*');
        this.delete(CACHE_KEYS.SETTINGS);
        // Settings changes may affect dashboard calculations (e.g., pricing settings)
        this.invalidateDashboard();
        console.log('🔄 Settings cache invalidated - dashboard and analytics refreshed');
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
