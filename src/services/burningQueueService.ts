/**
 * BurningQueueService - Manages the queue of USB burning orders
 * Handles adding, retrieving, and updating items in the burning queue
 * 
 * Features:
 * - Thread-safe operations with locking mechanism
 * - Optimistic locking for updates with version control
 * - Orphan order cleanup (24h inactive)
 * - Duplicate order prevention
 */

import { businessDB } from '../mysql-database';
import { USB_INTEGRATION, isValidBurningStatus } from '../constants/usbIntegration';
import { unifiedLogger } from '../utils/unifiedLogger';

/**
 * Interface representing an item in the burning queue
 */
export interface BurningQueueItem {
    orderId: string;
    orderNumber: string;
    customerPhone: string;
    contentType: 'music' | 'videos' | 'movies';
    capacity: string;
    customization: {
        genres?: string[];
        artists?: string[];
        titles?: string[];
        moods?: string[];
    };
    priority: 'high' | 'normal' | 'low';
    addedAt: Date;
    confirmedAt: Date | null;
    status: 'pending' | 'queued' | 'burning' | 'completed' | 'failed';
    lastActivityAt: Date;
    version: number; // For optimistic locking
}

/**
 * Result of an add operation
 */
export interface AddToQueueResult {
    success: boolean;
    item?: BurningQueueItem;
    error?: string;
    alreadyExists?: boolean;
}

/**
 * Result of an update operation
 */
export interface UpdateResult {
    success: boolean;
    error?: string;
    conflictDetected?: boolean;
}

/**
 * BurningQueueService class for managing the USB burning queue
 */
class BurningQueueService {
    private queue: Map<string, BurningQueueItem> = new Map();
    private locks: Map<string, Promise<void>> = new Map();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Start cleanup interval for orphan orders
        this.startCleanupInterval();
    }

    /**
     * Start the cleanup interval for orphan orders
     */
    private startCleanupInterval(): void {
        // Clean up every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanupOrphanOrders().catch(err => {
                unifiedLogger.error('api', 'Error during orphan order cleanup', { error: err });
            });
        }, 60 * 60 * 1000); // 1 hour
        
        unifiedLogger.info('api', 'Burning queue cleanup interval started', {
            intervalHours: 1,
            cleanupThresholdHours: USB_INTEGRATION.QUEUE_CLEANUP_HOURS
        });
    }

    /**
     * Stop the cleanup interval (for graceful shutdown)
     */
    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            unifiedLogger.info('api', 'Burning queue cleanup interval stopped');
        }
    }

    /**
     * Acquire a lock for an order to prevent race conditions
     */
    private async acquireLock(orderId: string): Promise<() => void> {
        // Wait for any existing lock to be released
        const existingLock = this.locks.get(orderId);
        if (existingLock) {
            await existingLock;
        }

        // Create a new lock
        let releaseLock: () => void;
        const lockPromise = new Promise<void>(resolve => {
            releaseLock = resolve;
        });
        
        this.locks.set(orderId, lockPromise);
        
        return () => {
            this.locks.delete(orderId);
            releaseLock!();
        };
    }

    /**
     * Add an order to the burning queue
     * @param order - Order data to add to the queue
     * @returns Result object with success status and item or error
     */
    async addToQueue(order: {
        orderId?: string;
        orderNumber: string;
        customerPhone: string;
        contentType?: 'music' | 'videos' | 'movies';
        capacity: string;
        customization?: {
            genres?: string[];
            artists?: string[];
            titles?: string[];
            moods?: string[];
        };
        priority?: 'high' | 'normal' | 'low';
    }): Promise<BurningQueueItem> {
        const orderId = order.orderId || order.orderNumber;
        
        // Acquire lock to prevent race conditions
        const releaseLock = await this.acquireLock(orderId);
        
        try {
            // Check if order already exists in queue
            const existingItem = this.queue.get(orderId);
            if (existingItem) {
                // If order exists and is not completed/failed, don't add again
                if (existingItem.status !== 'completed' && existingItem.status !== 'failed') {
                    unifiedLogger.warn('api', 'Order already in queue', { 
                        orderId, 
                        orderNumber: order.orderNumber,
                        existingStatus: existingItem.status 
                    });
                    // Return existing item instead of creating duplicate
                    return existingItem;
                }
                // If completed/failed, allow re-adding by removing old entry
                this.queue.delete(orderId);
                unifiedLogger.info('api', 'Removing completed/failed order to allow re-queue', { orderId });
            }
            
            const now = new Date();
            const queueItem: BurningQueueItem = {
                orderId,
                orderNumber: order.orderNumber,
                customerPhone: order.customerPhone,
                contentType: order.contentType || 'music',
                capacity: order.capacity,
                customization: order.customization || {},
                priority: order.priority || 'normal',
                addedAt: now,
                confirmedAt: null,
                status: 'pending',
                lastActivityAt: now,
                version: 1
            };

            // Store in memory cache
            this.queue.set(orderId, queueItem);

            // Try to update database burning status
            try {
                await this.updateBurningStatusInDB(order.orderNumber, 'pending');
            } catch (error) {
                unifiedLogger.warn('api', 'Could not update burning status in DB', { 
                    orderNumber: order.orderNumber, 
                    error: error instanceof Error ? error.message : 'Unknown error' 
                });
            }

            unifiedLogger.info('api', 'Order added to burning queue', { 
                orderId, 
                orderNumber: order.orderNumber, 
                priority: queueItem.priority 
            });
            
            return queueItem;
        } finally {
            releaseLock();
        }
    }

    /**
     * Get the status of a specific order in the queue
     * @param orderId - The order ID to look up
     * @returns The BurningQueueItem or null if not found
     */
    async getQueueStatus(orderId: string): Promise<BurningQueueItem | null> {
        const item = this.queue.get(orderId);
        if (item) {
            // Update last activity timestamp
            item.lastActivityAt = new Date();
        }
        return item || null;
    }

    /**
     * Remove an order from the burning queue
     * @param orderId - The order ID to remove
     * @returns true if removed, false if not found
     */
    async removeFromQueue(orderId: string): Promise<boolean> {
        const releaseLock = await this.acquireLock(orderId);
        
        try {
            const item = this.queue.get(orderId);
            if (item) {
                this.queue.delete(orderId);
                unifiedLogger.info('api', 'Order removed from burning queue', { orderId });
                return true;
            }
            return false;
        } finally {
            releaseLock();
        }
    }

    /**
     * Get all pending items in the queue
     * @returns Array of pending BurningQueueItems sorted by priority and date
     */
    async getPendingItems(): Promise<BurningQueueItem[]> {
        const items = Array.from(this.queue.values())
            .filter(item => item.status === 'pending' || item.status === 'queued');

        // Sort by priority (high first) and then by addedAt (oldest first)
        const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 };
        
        return items.sort((a, b) => {
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return a.addedAt.getTime() - b.addedAt.getTime();
        });
    }

    /**
     * Update the status of an item in the queue with optimistic locking
     * @param orderId - The order ID to update
     * @param status - The new status
     * @param expectedVersion - Optional expected version for optimistic locking
     * @returns Result object with success status
     */
    async updateItemStatus(
        orderId: string, 
        status: BurningQueueItem['status'],
        expectedVersion?: number
    ): Promise<UpdateResult> {
        // Validate status
        if (!isValidBurningStatus(status)) {
            return { success: false, error: `Invalid status: ${status}` };
        }
        
        const releaseLock = await this.acquireLock(orderId);
        
        try {
            const item = this.queue.get(orderId);
            if (!item) {
                return { success: false, error: 'Order not found in queue' };
            }
            
            // Optimistic locking check
            if (expectedVersion !== undefined && item.version !== expectedVersion) {
                unifiedLogger.warn('api', 'Optimistic lock conflict detected', { 
                    orderId, 
                    expectedVersion, 
                    actualVersion: item.version 
                });
                return { 
                    success: false, 
                    error: 'Conflict: item was modified by another process',
                    conflictDetected: true 
                };
            }
            
            const oldStatus = item.status;
            item.status = status;
            item.lastActivityAt = new Date();
            item.version++; // Increment version for optimistic locking
            
            // Update confirmedAt if status is being set to 'queued' or beyond
            if (status === 'queued' && !item.confirmedAt) {
                item.confirmedAt = new Date();
            }

            this.queue.set(orderId, item);

            // Try to update database
            try {
                await this.updateBurningStatusInDB(item.orderNumber, status);
            } catch (error) {
                unifiedLogger.warn('api', 'Could not update burning status in DB', { 
                    orderNumber: item.orderNumber,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            unifiedLogger.info('api', 'Order status updated', { 
                orderId, 
                oldStatus, 
                newStatus: status, 
                version: item.version 
            });
            
            return { success: true };
        } finally {
            releaseLock();
        }
    }

    /**
     * Mark an order as ready for burning (confirmed by user)
     * @param orderId - The order ID to confirm
     * @returns true if confirmed, false if not found
     */
    async confirmForBurning(orderId: string): Promise<boolean> {
        const result = await this.updateItemStatus(orderId, 'queued');
        
        if (result.success) {
            const item = this.queue.get(orderId);
            if (item) {
                item.confirmedAt = new Date();
                this.queue.set(orderId, item);
            }
            unifiedLogger.info('api', 'Order confirmed and ready for burning', { orderId });
        }
        
        return result.success;
    }

    /**
     * Check if an order is already in the queue (and not completed/failed)
     * @param orderId - The order ID to check
     * @returns true if order is already in queue and active
     */
    async isOrderInQueue(orderId: string): Promise<boolean> {
        const item = this.queue.get(orderId);
        return item !== undefined && item.status !== 'completed' && item.status !== 'failed';
    }

    /**
     * Get queue statistics
     * @returns Statistics about the burning queue
     */
    getQueueStats(): {
        total: number;
        pending: number;
        queued: number;
        burning: number;
        completed: number;
        failed: number;
    } {
        const items = Array.from(this.queue.values());
        return {
            total: items.length,
            pending: items.filter(i => i.status === 'pending').length,
            queued: items.filter(i => i.status === 'queued').length,
            burning: items.filter(i => i.status === 'burning').length,
            completed: items.filter(i => i.status === 'completed').length,
            failed: items.filter(i => i.status === 'failed').length
        };
    }

    /**
     * Clean up orphan orders (no activity for QUEUE_CLEANUP_HOURS)
     * @returns Number of orders cleaned up
     */
    async cleanupOrphanOrders(): Promise<number> {
        const now = new Date();
        const thresholdMs = USB_INTEGRATION.QUEUE_CLEANUP_HOURS * 60 * 60 * 1000;
        const orphanThreshold = new Date(now.getTime() - thresholdMs);
        
        let cleanedCount = 0;
        const orphanOrders: string[] = [];
        
        // Use forEach instead of for...of for ES5 compatibility
        this.queue.forEach((item, orderId) => {
            // Only clean up pending or queued items that have been inactive
            if ((item.status === 'pending' || item.status === 'queued') && 
                item.lastActivityAt < orphanThreshold) {
                orphanOrders.push(orderId);
            }
        });
        
        // Remove orphan orders
        for (const orderId of orphanOrders) {
            const releaseLock = await this.acquireLock(orderId);
            try {
                const item = this.queue.get(orderId);
                if (item && item.lastActivityAt < orphanThreshold) {
                    this.queue.delete(orderId);
                    cleanedCount++;
                    
                    unifiedLogger.info('api', 'Orphan order cleaned up', { 
                        orderId, 
                        orderNumber: item.orderNumber,
                        lastActivity: item.lastActivityAt.toISOString(),
                        status: item.status
                    });
                }
            } finally {
                releaseLock();
            }
        }
        
        if (cleanedCount > 0) {
            unifiedLogger.info('api', 'Orphan order cleanup completed', { 
                cleanedCount, 
                totalInQueue: this.queue.size 
            });
        }
        
        return cleanedCount;
    }

    /**
     * Update burning status in database
     * @param orderNumber - The order number
     * @param status - The burning status
     */
    private async updateBurningStatusInDB(orderNumber: string, status: string): Promise<void> {
        try {
            // Use businessDB if available to update the burning_status column
            if (businessDB && typeof (businessDB as any).updateOrderBurningStatus === 'function') {
                await (businessDB as any).updateOrderBurningStatus(orderNumber, status);
            }
        } catch (error) {
            // Log but don't throw - DB update is best effort
            unifiedLogger.debug('api', 'Could not update burning status in DB', { 
                orderNumber, 
                status,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get item by order number
     * @param orderNumber - The order number to find
     * @returns The BurningQueueItem or null
     */
    async getByOrderNumber(orderNumber: string): Promise<BurningQueueItem | null> {
        for (const item of this.queue.values()) {
            if (item.orderNumber === orderNumber) {
                // Update last activity
                item.lastActivityAt = new Date();
                return item;
            }
        }
        return null;
    }

    /**
     * Get the current version of an item (for optimistic locking)
     * @param orderId - The order ID
     * @returns The current version or null if not found
     */
    async getItemVersion(orderId: string): Promise<number | null> {
        const item = this.queue.get(orderId);
        return item ? item.version : null;
    }
}

// Export singleton instance
export const burningQueueService = new BurningQueueService();

export default burningQueueService;
