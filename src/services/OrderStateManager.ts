/**
 * OrderStateManager Service
 * Manages order state transitions and lifecycle
 * Emits events for notifications and webhooks
 * Persists transitions to database
 */

import { EventEmitter } from 'events';
import { businessDB } from '../mysql-database';

export type OrderStatus = 
    | 'NEEDS_INTENT'
    | 'NEEDS_CAPACITY'
    | 'NEEDS_PREFERENCES'
    | 'NEEDS_SHIPPING'
    | 'CONFIRMED'
    | 'PROCESSING'
    | 'READY'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'COMPLETED'
    | 'CANCELLED';

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

// Valid state transitions - Conversational state machine
const VALID_TRANSITIONS: { [key in OrderStatus]?: OrderStatus[] } = {
    'NEEDS_INTENT': ['NEEDS_CAPACITY', 'NEEDS_PREFERENCES', 'CANCELLED'],
    'NEEDS_CAPACITY': ['NEEDS_PREFERENCES', 'NEEDS_SHIPPING', 'CANCELLED'],
    'NEEDS_PREFERENCES': ['NEEDS_SHIPPING', 'NEEDS_CAPACITY', 'CANCELLED'],
    'NEEDS_SHIPPING': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['PROCESSING', 'CANCELLED'],
    'PROCESSING': ['READY', 'CANCELLED'],
    'READY': ['SHIPPED', 'CANCELLED'],
    'SHIPPED': ['DELIVERED', 'CANCELLED'],
    'DELIVERED': ['COMPLETED'],
    'COMPLETED': [],
    'CANCELLED': [],
};

export class OrderStateManager extends EventEmitter {
    private orderStates: Map<string, OrderStateData> = new Map();

    /**
     * Initialize order with NEEDS_INTENT status
     */
    createOrder(orderId: string, phone?: string): OrderStateData {
        const initialStatus: OrderStatus = 'NEEDS_INTENT';
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
        
        // Persist to database
        if (phone) {
            this.persistTransition(orderId, phone, null, initialStatus, 'Order created', 'system').catch(err => {
                console.error('Error persisting order creation:', err);
            });
        }

        return stateData;
    }

    /**
     * Transition order to a new status
     */
    async transitionOrder(
        orderId: string,
        newStatus: OrderStatus,
        reason?: string,
        userId?: string,
        phone?: string
    ): Promise<{ success: boolean; error?: string; data?: OrderStateData }> {
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

        // Persist transition to database
        if (phone) {
            await this.persistTransition(orderId, phone, currentStatus, newStatus, reason, userId || 'system');
        }

        // Emit transition event
        this.emit('order:transition', transition);
        this.emit(`order:${newStatus}`, { orderId, timestamp: now, reason, userId });

        // Special event handlers
        if (newStatus === 'CONFIRMED') {
            this.emit('order:confirmed', { orderId, timestamp: now, reason, userId });
        } else if (newStatus === 'COMPLETED') {
            this.emit('order:completed', { orderId, timestamp: now, reason, userId });
        } else if (newStatus === 'CANCELLED') {
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
     * Confirm order (NEEDS_SHIPPING -> CONFIRMED)
     */
    async confirmOrder(orderId: string, userId?: string, phone?: string): Promise<{ success: boolean; error?: string }> {
        return await this.transitionOrder(orderId, 'CONFIRMED', 'Order confirmed by customer', userId, phone);
    }

    /**
     * Start processing order (CONFIRMED -> PROCESSING)
     */
    async startProcessing(orderId: string, userId?: string, phone?: string): Promise<{ success: boolean; error?: string }> {
        return await this.transitionOrder(orderId, 'PROCESSING', 'Order processing started', userId, phone);
    }

    /**
     * Mark order as ready (PROCESSING -> READY)
     */
    async markReady(orderId: string, userId?: string, phone?: string): Promise<{ success: boolean; error?: string }> {
        return await this.transitionOrder(orderId, 'READY', 'Order ready for shipment', userId, phone);
    }

    /**
     * Mark order as shipped (READY -> SHIPPED)
     */
    async markShipped(orderId: string, userId?: string, phone?: string): Promise<{ success: boolean; error?: string }> {
        return await this.transitionOrder(orderId, 'SHIPPED', 'Order shipped', userId, phone);
    }

    /**
     * Mark order as delivered (SHIPPED -> DELIVERED)
     */
    async markDelivered(orderId: string, userId?: string, phone?: string): Promise<{ success: boolean; error?: string }> {
        return await this.transitionOrder(orderId, 'DELIVERED', 'Order delivered', userId, phone);
    }

    /**
     * Complete order (DELIVERED -> COMPLETED)
     */
    async completeOrder(orderId: string, userId?: string, phone?: string): Promise<{ success: boolean; error?: string }> {
        return await this.transitionOrder(orderId, 'COMPLETED', 'Order completed', userId, phone);
    }

    /**
     * Cancel order
     */
    async cancelOrder(orderId: string, reason?: string, userId?: string, phone?: string): Promise<{ success: boolean; error?: string }> {
        return await this.transitionOrder(orderId, 'CANCELLED', reason || 'Order cancelled', userId, phone);
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

    /**
     * Persist state transition to database
     * @private
     */
    private async persistTransition(
        orderId: string,
        phone: string,
        previousState: OrderStatus | null,
        newState: OrderStatus,
        reason?: string,
        triggeredBy?: string
    ): Promise<void> {
        try {
            // Use businessDB to insert into flow_transitions table
            if (!businessDB || typeof (businessDB as any).execute !== 'function') {
                console.warn('Database not available for persisting transition');
                return;
            }

            const query = `
                INSERT INTO flow_transitions 
                (order_number, phone, previous_state, new_state, flow_name, reason, triggered_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            await (businessDB as any).execute(query, [
                orderId,
                phone,
                previousState,
                newState,
                'orderFlow',
                reason || null,
                triggeredBy || 'system'
            ]);

            console.log(`✅ Persisted transition: ${orderId} ${previousState || 'null'} -> ${newState}`);
        } catch (error) {
            console.error('Error persisting transition to database:', error);
            // Don't throw - allow the transition to succeed even if persistence fails
        }
    }

    /**
     * Check if order has reached or passed CONFIRMED state
     */
    isConfirmedOrBeyond(orderId: string): boolean {
        const stateData = this.orderStates.get(orderId);
        if (!stateData) return false;

        const confirmedAndBeyond: OrderStatus[] = [
            'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED'
        ];
        
        return confirmedAndBeyond.includes(stateData.currentStatus);
    }

    /**
     * Check if order status is at or beyond a given state
     */
    isAtOrBeyondState(orderId: string, targetState: OrderStatus): boolean {
        const stateData = this.orderStates.get(orderId);
        if (!stateData) return false;

        // Define state progression order
        const stateOrder: OrderStatus[] = [
            'NEEDS_INTENT',
            'NEEDS_CAPACITY',
            'NEEDS_PREFERENCES',
            'NEEDS_SHIPPING',
            'CONFIRMED',
            'PROCESSING',
            'READY',
            'SHIPPED',
            'DELIVERED',
            'COMPLETED'
        ];

        const currentIndex = stateOrder.indexOf(stateData.currentStatus);
        const targetIndex = stateOrder.indexOf(targetState);

        // If either state is not in progression (e.g., CANCELLED), handle specially
        if (currentIndex === -1 || targetIndex === -1) {
            return stateData.currentStatus === targetState;
        }

        return currentIndex >= targetIndex;
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

export { orderStateManager as default };
