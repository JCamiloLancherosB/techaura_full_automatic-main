/**
 * BurningQueueService - Manages the queue of USB burning orders
 * Handles adding, retrieving, and updating items in the burning queue
 */

import { businessDB } from '../mysql-database';

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
}

/**
 * BurningQueueService class for managing the USB burning queue
 */
class BurningQueueService {
    private queue: Map<string, BurningQueueItem> = new Map();

    /**
     * Add an order to the burning queue
     * @param order - Order data to add to the queue
     * @returns The created BurningQueueItem
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
        
        const queueItem: BurningQueueItem = {
            orderId,
            orderNumber: order.orderNumber,
            customerPhone: order.customerPhone,
            contentType: order.contentType || 'music',
            capacity: order.capacity,
            customization: order.customization || {},
            priority: order.priority || 'normal',
            addedAt: new Date(),
            confirmedAt: null,
            status: 'pending'
        };

        // Store in memory cache
        this.queue.set(orderId, queueItem);

        // Try to update database burning status
        try {
            await this.updateBurningStatusInDB(order.orderNumber, 'pending');
        } catch (error) {
            console.warn(`⚠️ Could not update burning status in DB for order ${order.orderNumber}:`, error);
        }

        console.log(`📋 Order ${order.orderNumber} added to burning queue with priority: ${queueItem.priority}`);
        return queueItem;
    }

    /**
     * Get the status of a specific order in the queue
     * @param orderId - The order ID to look up
     * @returns The BurningQueueItem or null if not found
     */
    async getQueueStatus(orderId: string): Promise<BurningQueueItem | null> {
        return this.queue.get(orderId) || null;
    }

    /**
     * Remove an order from the burning queue
     * @param orderId - The order ID to remove
     * @returns true if removed, false if not found
     */
    async removeFromQueue(orderId: string): Promise<boolean> {
        const item = this.queue.get(orderId);
        if (item) {
            this.queue.delete(orderId);
            console.log(`🗑️ Order ${orderId} removed from burning queue`);
            return true;
        }
        return false;
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
     * Update the status of an item in the queue
     * @param orderId - The order ID to update
     * @param status - The new status
     * @returns true if updated, false if not found
     */
    async updateItemStatus(orderId: string, status: BurningQueueItem['status']): Promise<boolean> {
        const item = this.queue.get(orderId);
        if (item) {
            item.status = status;
            
            // Update confirmedAt if status is being set to 'queued' or beyond
            if (status === 'queued' && !item.confirmedAt) {
                item.confirmedAt = new Date();
            }

            this.queue.set(orderId, item);

            // Try to update database
            try {
                await this.updateBurningStatusInDB(item.orderNumber, status);
            } catch (error) {
                console.warn(`⚠️ Could not update burning status in DB:`, error);
            }

            console.log(`🔄 Order ${orderId} status updated to: ${status}`);
            return true;
        }
        return false;
    }

    /**
     * Mark an order as ready for burning (confirmed by user)
     * @param orderId - The order ID to confirm
     * @returns true if confirmed, false if not found
     */
    async confirmForBurning(orderId: string): Promise<boolean> {
        const item = this.queue.get(orderId);
        if (item) {
            item.status = 'queued';
            item.confirmedAt = new Date();
            this.queue.set(orderId, item);

            try {
                await this.updateBurningStatusInDB(item.orderNumber, 'queued');
            } catch (error) {
                console.warn(`⚠️ Could not update burning status in DB:`, error);
            }

            console.log(`✅ Order ${orderId} confirmed and ready for burning`);
            return true;
        }
        return false;
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
            // Silently handle if the method doesn't exist or fails
            console.debug(`Could not update burning status in DB:`, error);
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
                return item;
            }
        }
        return null;
    }
}

// Export singleton instance
export const burningQueueService = new BurningQueueService();

export default burningQueueService;
