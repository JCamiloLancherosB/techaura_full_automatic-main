/**
 * Order Service - Manages order operations for admin panel
 */

import { businessDB } from '../../mysql-database';
import type { AdminOrder, OrderFilter, OrderStatus, PaginatedResponse } from '../types/AdminTypes';
import type { CustomerOrder } from '../../../types/global';

export class OrderService {
    /**
     * Get all orders with optional filters and pagination
     */
    async getOrders(
        filters?: OrderFilter,
        page: number = 1,
        limit: number = 50
    ): Promise<PaginatedResponse<AdminOrder>> {
        try {
            // Build query based on filters
            const offset = (page - 1) * limit;
            
            // Get orders from database (using existing businessDB)
            // Note: Adjust based on actual database schema
            const orders = await this.fetchOrdersFromDB(filters, limit, offset);
            const total = await this.countOrders(filters);
            
            return {
                data: orders,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            console.error('Error fetching orders:', error);
            throw error;
        }
    }

    /**
     * Get single order by ID
     */
    async getOrderById(orderId: string): Promise<AdminOrder | null> {
        try {
            const order = await this.fetchOrderFromDB(orderId);
            return order;
        } catch (error) {
            console.error('Error fetching order:', error);
            throw error;
        }
    }

    /**
     * Update order status
     */
    async updateOrderStatus(orderId: string, status: OrderStatus): Promise<boolean> {
        try {
            // Update in database
            await this.updateOrderInDB(orderId, { status });
            
            // Log the status change
            await this.addOrderNote(orderId, `Status changed to: ${status}`);
            
            return true;
        } catch (error) {
            console.error('Error updating order status:', error);
            throw error;
        }
    }

    /**
     * Update order details
     */
    async updateOrder(orderId: string, updates: Partial<AdminOrder>): Promise<boolean> {
        try {
            await this.updateOrderInDB(orderId, updates);
            return true;
        } catch (error) {
            console.error('Error updating order:', error);
            throw error;
        }
    }

    /**
     * Add note to order
     */
    async addOrderNote(orderId: string, note: string): Promise<boolean> {
        try {
            const order = await this.getOrderById(orderId);
            if (!order) return false;
            
            const notes = order.adminNotes || [];
            notes.push(`[${new Date().toISOString()}] ${note}`);
            
            await this.updateOrderInDB(orderId, { adminNotes: notes });
            return true;
        } catch (error) {
            console.error('Error adding note:', error);
            throw error;
        }
    }

    /**
     * Confirm order
     */
    async confirmOrder(orderId: string): Promise<boolean> {
        try {
            await this.updateOrderInDB(orderId, {
                status: 'confirmed',
                confirmedAt: new Date()
            });
            await this.addOrderNote(orderId, 'Order confirmed by admin');
            return true;
        } catch (error) {
            console.error('Error confirming order:', error);
            throw error;
        }
    }

    /**
     * Cancel order
     */
    async cancelOrder(orderId: string, reason?: string): Promise<boolean> {
        try {
            await this.updateOrderInDB(orderId, {
                status: 'cancelled'
            });
            const note = reason ? `Order cancelled: ${reason}` : 'Order cancelled by admin';
            await this.addOrderNote(orderId, note);
            return true;
        } catch (error) {
            console.error('Error cancelling order:', error);
            throw error;
        }
    }

    /**
     * Get pending orders
     */
    async getPendingOrders(): Promise<AdminOrder[]> {
        try {
            const result = await this.getOrders({ status: 'pending' }, 1, 100);
            return result.data;
        } catch (error) {
            console.error('Error fetching pending orders:', error);
            throw error;
        }
    }

    // ========================================
    // Private helper methods for DB operations
    // ========================================

    private async fetchOrdersFromDB(
        filters?: OrderFilter,
        limit: number = 50,
        offset: number = 0
    ): Promise<AdminOrder[]> {
        // Implementation will integrate with businessDB
        // For now, return mock data structure
        const mockOrders: AdminOrder[] = [];
        
        try {
            // Query database using businessDB methods
            // This is a placeholder - adjust based on actual schema
            const dbOrders: any[] = []; // await businessDB.getOrders(filters, limit, offset);
            
            return dbOrders.map(this.mapDBOrderToAdmin);
        } catch (error) {
            console.error('Error in fetchOrdersFromDB:', error);
            return mockOrders;
        }
    }

    private async fetchOrderFromDB(orderId: string): Promise<AdminOrder | null> {
        try {
            // Query single order from database
            // Placeholder - adjust based on actual implementation
            const dbOrder: any = null; // await businessDB.getOrderById(orderId);
            
            if (!dbOrder) return null;
            return this.mapDBOrderToAdmin(dbOrder);
        } catch (error) {
            console.error('Error in fetchOrderFromDB:', error);
            return null;
        }
    }

    private async updateOrderInDB(orderId: string, updates: Partial<AdminOrder>): Promise<void> {
        try {
            // Update order in database using businessDB
            // Placeholder - adjust based on actual implementation
            // await businessDB.updateOrder(orderId, updates);
        } catch (error) {
            console.error('Error in updateOrderInDB:', error);
            throw error;
        }
    }

    private async countOrders(filters?: OrderFilter): Promise<number> {
        try {
            // Count orders matching filters
            // Placeholder
            return 0; // await businessDB.countOrders(filters);
        } catch (error) {
            console.error('Error in countOrders:', error);
            return 0;
        }
    }

    private mapDBOrderToAdmin(dbOrder: any): AdminOrder {
        // Map database order format to AdminOrder format
        return {
            id: dbOrder.id || dbOrder.orderId,
            orderNumber: dbOrder.orderNumber || dbOrder.order_number || dbOrder.id,
            customerPhone: dbOrder.customerPhone || dbOrder.phone,
            customerName: dbOrder.customerName || dbOrder.name || 'Unknown',
            status: this.normalizeStatus(dbOrder.status),
            contentType: dbOrder.contentType || dbOrder.content_type || 'mixed',
            capacity: dbOrder.capacity || '32GB',
            customization: this.parseCustomization(dbOrder.customization || dbOrder.preferences),
            createdAt: new Date(dbOrder.createdAt || dbOrder.created_at || Date.now()),
            updatedAt: new Date(dbOrder.updatedAt || dbOrder.updated_at || Date.now()),
            confirmedAt: dbOrder.confirmedAt ? new Date(dbOrder.confirmedAt) : undefined,
            completedAt: dbOrder.completedAt ? new Date(dbOrder.completedAt) : undefined,
            notes: dbOrder.notes,
            adminNotes: this.parseAdminNotes(dbOrder.adminNotes || dbOrder.admin_notes),
            price: dbOrder.price || dbOrder.total || 0,
            paymentMethod: dbOrder.paymentMethod || dbOrder.payment_method,
            processingProgress: dbOrder.processingProgress || 0,
            estimatedCompletion: dbOrder.estimatedCompletion ? new Date(dbOrder.estimatedCompletion) : undefined
        };
    }

    private normalizeStatus(status: any): OrderStatus {
        const statusMap: { [key: string]: OrderStatus } = {
            'pending': 'pending',
            'pendiente': 'pending',
            'confirmed': 'confirmed',
            'confirmado': 'confirmed',
            'processing': 'processing',
            'en_proceso': 'processing',
            'completed': 'completed',
            'completado': 'completed',
            'cancelled': 'cancelled',
            'cancelado': 'cancelled'
        };
        
        return statusMap[String(status).toLowerCase()] || 'pending';
    }

    private parseCustomization(customization: any): any {
        if (typeof customization === 'string') {
            try {
                return JSON.parse(customization);
            } catch {
                return {};
            }
        }
        return customization || {};
    }

    private parseAdminNotes(notes: any): string[] {
        if (Array.isArray(notes)) return notes;
        if (typeof notes === 'string') {
            try {
                return JSON.parse(notes);
            } catch {
                return notes ? [notes] : [];
            }
        }
        return [];
    }
}

// Singleton instance
export const orderService = new OrderService();
