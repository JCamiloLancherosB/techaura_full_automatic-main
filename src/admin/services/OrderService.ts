/**
 * Order Service - Manages order operations for admin panel
 */

import { businessDB } from '../../mysql-database';
import type { AdminOrder, OrderFilter, OrderStatus, PaginatedResponse } from '../types/AdminTypes';
import type { CustomerOrder } from '../../../types/global';

// Validation limits for data integrity
const VALIDATION_LIMITS = {
    MAX_ORDERS: 1_000_000  // Maximum orders to prevent overflow and performance issues
} as const;

// Helper to safely access database pool
function getDatabasePool(): any | null {
    const db = businessDB as any;
    return db && db.pool ? db.pool : null;
}

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
        try {
            // Query database using helper function for type safety
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available, returning empty orders');
                return [];
            }

            // Build WHERE clause based on filters
            const whereClauses: string[] = [];
            const params: any[] = [];

            if (filters?.status) {
                // Check both status and processing_status columns
                whereClauses.push('(status = ? OR processing_status = ?)');
                params.push(filters.status, filters.status);
            }
            if (filters?.contentType) {
                whereClauses.push('product_type = ?');
                params.push(filters.contentType);
            }
            if (filters?.customerPhone) {
                whereClauses.push('phone_number LIKE ?');
                params.push(`%${filters.customerPhone}%`);
            }
            if (filters?.searchTerm) {
                whereClauses.push('(customer_name LIKE ? OR phone_number LIKE ? OR order_number LIKE ?)');
                const searchPattern = `%${filters.searchTerm}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }
            if (filters?.dateFrom) {
                whereClauses.push('created_at >= ?');
                params.push(filters.dateFrom);
            }
            if (filters?.dateTo) {
                whereClauses.push('created_at <= ?');
                params.push(filters.dateTo);
            }

            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Query orders with pagination
            const query = `
                SELECT 
                    id,
                    order_number,
                    customer_name,
                    phone_number,
                    product_type,
                    capacity,
                    price,
                    processing_status as status,
                    processing_status,
                    preferences,
                    customization,
                    notes,
                    admin_notes,
                    created_at,
                    updated_at,
                    completed_at
                FROM orders
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `;
            
            params.push(limit, offset);
            const [rows] = await pool.execute(query, params);
            
            // Transform database rows to AdminOrder format
            return (rows as any[]).map(row => this.transformDBRowToAdminOrder(row));
        } catch (error) {
            console.error('Error in fetchOrdersFromDB:', error);
            return [];
        }
    }

    private async fetchOrderFromDB(orderId: string): Promise<AdminOrder | null> {
        try {
            // Query single order from database
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available');
                return null;
            }

            const query = `
                SELECT 
                    id,
                    order_number,
                    customer_name,
                    phone_number,
                    product_type,
                    capacity,
                    price,
                    processing_status as status,
                    processing_status,
                    preferences,
                    customization,
                    notes,
                    admin_notes,
                    created_at,
                    updated_at,
                    completed_at
                FROM orders
                WHERE id = ?
                LIMIT 1
            `;
            
            const [rows] = await pool.execute(query, [orderId]);
            const orders = rows as any[];
            
            if (orders.length === 0) {
                return null;
            }
            
            return this.transformDBRowToAdminOrder(orders[0]);
        } catch (error) {
            console.error('Error in fetchOrderFromDB:', error);
            return null;
        }
    }

    private async updateOrderInDB(orderId: string, updates: Partial<AdminOrder>): Promise<void> {
        try {
            // Update order in database
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available');
                return;
            }

            // Build SET clause dynamically
            const setClauses: string[] = [];
            const params: any[] = [];

            if (updates.status !== undefined) {
                // Update both status and processing_status for compatibility
                setClauses.push('status = ?', 'processing_status = ?');
                params.push(updates.status, updates.status);
            }
            if (updates.notes !== undefined) {
                setClauses.push('notes = ?');
                params.push(updates.notes);
            }
            if (updates.adminNotes !== undefined) {
                setClauses.push('admin_notes = ?');
                params.push(JSON.stringify(updates.adminNotes));
            }
            if (updates.customization !== undefined) {
                setClauses.push('customization = ?');
                params.push(JSON.stringify(updates.customization));
            }
            if (updates.confirmedAt !== undefined) {
                setClauses.push('confirmed_at = ?');
                params.push(updates.confirmedAt);
            }
            if (updates.completedAt !== undefined) {
                setClauses.push('completed_at = ?');
                params.push(updates.completedAt);
            }

            // Always update updated_at
            setClauses.push('updated_at = ?');
            params.push(new Date());

            if (setClauses.length === 1) { // Only updated_at
                console.warn('No updates to apply');
                return;
            }

            params.push(orderId); // For WHERE clause

            const query = `
                UPDATE orders 
                SET ${setClauses.join(', ')}
                WHERE id = ?
            `;

            await pool.execute(query, params);
            console.log(`Order ${orderId} updated successfully`);
        } catch (error) {
            console.error('Error in updateOrderInDB:', error);
            throw error;
        }
    }

    private async countOrders(filters?: OrderFilter): Promise<number> {
        try {
            // Count orders matching filters
            const pool = getDatabasePool();
            if (!pool) {
                console.warn('Database pool not available');
                return 0;
            }

            // Build WHERE clause (same as in fetchOrdersFromDB)
            const whereClauses: string[] = [];
            const params: any[] = [];

            if (filters?.status) {
                whereClauses.push('(status = ? OR processing_status = ?)');
                params.push(filters.status, filters.status);
            }
            if (filters?.contentType) {
                whereClauses.push('product_type = ?');
                params.push(filters.contentType);
            }
            if (filters?.customerPhone) {
                whereClauses.push('phone_number LIKE ?');
                params.push(`%${filters.customerPhone}%`);
            }
            if (filters?.searchTerm) {
                whereClauses.push('(customer_name LIKE ? OR phone_number LIKE ? OR order_number LIKE ?)');
                const searchPattern = `%${filters.searchTerm}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }
            if (filters?.dateFrom) {
                whereClauses.push('created_at >= ?');
                params.push(filters.dateFrom);
            }
            if (filters?.dateTo) {
                whereClauses.push('created_at <= ?');
                params.push(filters.dateTo);
            }

            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            const query = `SELECT COUNT(*) as count FROM orders ${whereClause}`;
            const [rows] = await pool.execute(query, params);
            const count = (rows as any[])[0]?.count || 0;
            
            // Validate count is reasonable using named constant
            return Math.max(0, Math.min(Number(count), VALIDATION_LIMITS.MAX_ORDERS));
        } catch (error) {
            console.error('Error in countOrders:', error);
            return 0;
        }
    }
    
    /**
     * Transform database row to AdminOrder format
     */
    private transformDBRowToAdminOrder(row: any): AdminOrder {
        // Parse JSON fields safely
        const parseJSON = (field: any) => {
            if (!field) return undefined;
            if (typeof field === 'object') return field;
            try {
                return JSON.parse(field);
            } catch {
                return undefined;
            }
        };

        return {
            id: String(row.id),
            orderNumber: row.order_number || `ORD-${row.id}`,
            customerName: row.customer_name || 'Unknown',
            customerPhone: row.phone_number || 'Unknown',
            status: row.status || 'pending',
            contentType: row.product_type || 'music',
            capacity: row.capacity || '32GB',
            customization: parseJSON(row.customization) || parseJSON(row.preferences) || {},
            createdAt: row.created_at ? new Date(row.created_at) : new Date(),
            updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
            confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            notes: row.notes || '',
            adminNotes: parseJSON(row.admin_notes) || [],
            price: Number(row.price) || 0,
            processingProgress: 0 // Calculate based on processing status if needed
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
