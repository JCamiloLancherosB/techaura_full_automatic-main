/**
 * OrderStateManager Service
 * Manages order state transitions and lifecycle
 * Emits events for notifications and webhooks
 */

import { EventEmitter } from 'events';

export type OrderStatus = 
    | 'draft' 
    | 'confirmed' 
    | 'processing' 
    | 'shipped' 
    | 'delivered' 
    | 'completed'
    | 'cancelled';

export interface OrderStateTransition {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
    timestamp: Date;
    reason?: string;
    userId?: string;
}

export interface OrderHistoryEntry {
    status: OrderStatus;
    timestamp: Date;
    reason?: string;
    userId?: string;
}

export interface OrderStateData {
    orderId: string;
    currentStatus: OrderStatus;
    history: OrderHistoryEntry[];
    createdAt: Date;
    updatedAt: Date;
}

// Valid state transitions
const VALID_TRANSITIONS: { [key in OrderStatus]?: OrderStatus[] } = {
    'draft': ['confirmed', 'cancelled'],
    'confirmed': ['processing', 'cancelled'],
    'processing': ['shipped', 'cancelled'],
    'shipped': ['delivered', 'cancelled'],
    'delivered': ['completed'],
    'completed': [],
    'cancelled': [],
};

export class OrderStateManager extends EventEmitter {
    private orderStates: Map<string, OrderStateData> = new Map();

    /**
     * Initialize order with draft status
     */
    createOrder(orderId: string): OrderStateData {
        const initialStatus: OrderStatus = 'draft';
        const now = new Date();

        const stateData: OrderStateData = {
            orderId,
            currentStatus: initialStatus,
            history: [{
                status: initialStatus,
                timestamp: now,
                reason: 'Order created',
            }],
            createdAt: now,
            updatedAt: now,
        };

        this.orderStates.set(orderId, stateData);
        this.emit('order:created', { orderId, status: initialStatus, timestamp: now });

        return stateData;
    }

    /**
     * Transition order to a new status
     */
    transitionOrder(
        orderId: string,
        newStatus: OrderStatus,
        reason?: string,
        userId?: string
    ): { success: boolean; error?: string; data?: OrderStateData } {
        const stateData = this.orderStates.get(orderId);

        if (!stateData) {
            return {
                success: false,
                error: `Order ${orderId} not found`,
            };
        }

        const currentStatus = stateData.currentStatus;

        // Validate transition
        const validTransitions = VALID_TRANSITIONS[currentStatus] || [];
        if (!validTransitions.includes(newStatus)) {
            return {
                success: false,
                error: `Invalid transition from ${currentStatus} to ${newStatus}`,
            };
        }

        // Perform transition
        const now = new Date();
        const transition: OrderStateTransition = {
            orderId,
            from: currentStatus,
            to: newStatus,
            timestamp: now,
            reason,
            userId,
        };

        stateData.currentStatus = newStatus;
        stateData.updatedAt = now;
        stateData.history.push({
            status: newStatus,
            timestamp: now,
            reason,
            userId,
        });

        // Emit transition event
        this.emit('order:transition', transition);
        this.emit(`order:${newStatus}`, { orderId, timestamp: now, reason, userId });

        // Special event handlers
        if (newStatus === 'confirmed') {
            this.emit('order:confirmed', { orderId, timestamp: now, reason, userId });
        } else if (newStatus === 'completed') {
            this.emit('order:completed', { orderId, timestamp: now, reason, userId });
        } else if (newStatus === 'cancelled') {
            this.emit('order:cancelled', { orderId, timestamp: now, reason, userId });
        }

        return {
            success: true,
            data: stateData,
        };
    }

    /**
     * Get current order state
     */
    getOrderState(orderId: string): OrderStateData | null {
        return this.orderStates.get(orderId) || null;
    }

    /**
     * Get order history
     */
    getOrderHistory(orderId: string): OrderHistoryEntry[] {
        const stateData = this.orderStates.get(orderId);
        return stateData ? [...stateData.history] : [];
    }

    /**
     * Check if transition is valid
     */
    canTransition(orderId: string, newStatus: OrderStatus): boolean {
        const stateData = this.orderStates.get(orderId);
        if (!stateData) return false;

        const validTransitions = VALID_TRANSITIONS[stateData.currentStatus] || [];
        return validTransitions.includes(newStatus);
    }

    /**
     * Get all valid transitions for current state
     */
    getValidTransitions(orderId: string): OrderStatus[] {
        const stateData = this.orderStates.get(orderId);
        if (!stateData) return [];

        return VALID_TRANSITIONS[stateData.currentStatus] || [];
    }

    /**
     * Confirm order (draft -> confirmed)
     */
    confirmOrder(orderId: string, userId?: string): { success: boolean; error?: string } {
        return this.transitionOrder(orderId, 'confirmed', 'Order confirmed by customer', userId);
    }

    /**
     * Start processing order (confirmed -> processing)
     */
    startProcessing(orderId: string, userId?: string): { success: boolean; error?: string } {
        return this.transitionOrder(orderId, 'processing', 'Order processing started', userId);
    }

    /**
     * Mark order as shipped (processing -> shipped)
     */
    markShipped(orderId: string, userId?: string): { success: boolean; error?: string } {
        return this.transitionOrder(orderId, 'shipped', 'Order shipped', userId);
    }

    /**
     * Mark order as delivered (shipped -> delivered)
     */
    markDelivered(orderId: string, userId?: string): { success: boolean; error?: string } {
        return this.transitionOrder(orderId, 'delivered', 'Order delivered', userId);
    }

    /**
     * Complete order (delivered -> completed)
     */
    completeOrder(orderId: string, userId?: string): { success: boolean; error?: string } {
        return this.transitionOrder(orderId, 'completed', 'Order completed', userId);
    }

    /**
     * Cancel order
     */
    cancelOrder(orderId: string, reason?: string, userId?: string): { success: boolean; error?: string } {
        return this.transitionOrder(orderId, 'cancelled', reason || 'Order cancelled', userId);
    }

    /**
     * Get order lifecycle duration
     */
    getOrderDuration(orderId: string): number | null {
        const stateData = this.orderStates.get(orderId);
        if (!stateData) return null;

        return stateData.updatedAt.getTime() - stateData.createdAt.getTime();
    }

    /**
     * Get time in current status
     */
    getTimeInCurrentStatus(orderId: string): number | null {
        const stateData = this.orderStates.get(orderId);
        if (!stateData || stateData.history.length === 0) return null;

        const lastEntry = stateData.history[stateData.history.length - 1];
        return Date.now() - lastEntry.timestamp.getTime();
    }

    /**
     * Get orders by status
     */
    getOrdersByStatus(status: OrderStatus): OrderStateData[] {
        return Array.from(this.orderStates.values()).filter(
            order => order.currentStatus === status
        );
    }

    /**
     * Load order state from external data (e.g., database)
     */
    loadOrderState(stateData: OrderStateData): void {
        this.orderStates.set(stateData.orderId, stateData);
    }

    /**
     * Remove order from memory (cleanup)
     */
    removeOrder(orderId: string): boolean {
        return this.orderStates.delete(orderId);
    }

    /**
     * Get statistics
     */
    getStatistics(): {
        total: number;
        byStatus: { [key in OrderStatus]?: number };
    } {
        const stats = {
            total: this.orderStates.size,
            byStatus: {} as { [key in OrderStatus]?: number },
        };

        for (const order of this.orderStates.values()) {
            const status = order.currentStatus;
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
        }

        return stats;
    }
}

// Singleton instance
export const orderStateManager = new OrderStateManager();

// Setup event listeners for notifications
orderStateManager.on('order:confirmed', async (data) => {
    console.log(`📦 Order ${data.orderId} confirmed at ${data.timestamp}`);
    // TODO: Send notification to admin
    // TODO: Send confirmation message to customer
});

orderStateManager.on('order:completed', async (data) => {
    console.log(`✅ Order ${data.orderId} completed at ${data.timestamp}`);
    // TODO: Send completion notification
});

orderStateManager.on('order:cancelled', async (data) => {
    console.log(`❌ Order ${data.orderId} cancelled: ${data.reason}`);
    // TODO: Send cancellation notification
});
