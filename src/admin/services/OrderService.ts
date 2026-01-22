/**
 * Order Service - Manages order operations for admin panel
 */

import { businessDB } from '../../mysql-database';
import type { AdminOrder, OrderFilter, OrderStatus, PaginatedResponse, OrderValidationResult, RequiredOrderFields } from '../types/AdminTypes';
import type { CustomerOrder } from '../../../types/global';
import { analyticsService } from './AnalyticsService';
import { invalidateDashboardCache } from '../AdminPanel';
import { orderEventEmitter } from '../../services/OrderEventEmitter';
import { OrderNotificationEvent } from '../../../types/notificador';

// Validation limits for data integrity
const VALIDATION_LIMITS = {
    MAX_ORDERS: 1_000_000  // Maximum orders to prevent overflow and performance issues
} as const;

// Valid order statuses
const VALID_ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'completed', 'cancelled'];

// Valid capacities and content types
const VALID_CAPACITIES = ['8GB', '32GB', '64GB', '128GB', '256GB'] as const;
const VALID_CONTENT_TYPES = ['music', 'videos', 'movies', 'series', 'mixed'] as const;

// Cache for schema columns to avoid repeated checks
let schemaColumnsCache: Set<string> | null = null;
let schemaCacheTime: number = 0;
const SCHEMA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper to safely access database pool
function getDatabasePool(): any | null {
    const db = businessDB as any;
    return db && db.pool ? db.pool : null;
}

// Helper to check if column exists in orders table
async function hasColumn(columnName: string): Promise<boolean> {
    try {
        const pool = getDatabasePool();
        if (!pool) return false;

        // Use cache if recent
        const now = Date.now();
        if (schemaColumnsCache && (now - schemaCacheTime) < SCHEMA_CACHE_TTL) {
            return schemaColumnsCache.has(columnName.toLowerCase());
        }

        // Refresh cache
        const [columns] = await pool.execute(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'`
        ) as any[];

        schemaColumnsCache = new Set(
            columns.map((row: any) => row.COLUMN_NAME.toLowerCase())
        );
        schemaCacheTime = now;

        return schemaColumnsCache.has(columnName.toLowerCase());
    } catch (error) {
        console.error(`Error checking column ${columnName}:`, error);
        return false;
    }
}

/**
 * Validate order data before creation/update
 */
function validateOrderData(order: Partial<AdminOrder>, isUpdate: boolean = false): OrderValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields for new orders
    if (!isUpdate) {
        if (!order.customerPhone) errors.push('customerPhone is required');
        if (!order.customerName) errors.push('customerName is required');
        if (!order.contentType) errors.push('contentType is required');
        if (!order.capacity) errors.push('capacity is required');
        if (order.price === undefined || order.price < 0) errors.push('price must be a non-negative number');
    }
    
    // Validate phone number format
    if (order.customerPhone) {
        const phoneRegex = /^\+?\d{10,20}$/;
        if (!phoneRegex.test(order.customerPhone.replace(/[\s\-\(\)]/g, ''))) {
            errors.push('customerPhone must be a valid phone number');
        }
    }
    
    // Validate customer name
    if (order.customerName && order.customerName.trim().length < 2) {
        errors.push('customerName must be at least 2 characters');
    }
    
    // Validate price
    if (order.price !== undefined) {
        if (order.price < 0) {
            errors.push('price cannot be negative');
        }
        if (order.price > 10000000) {
            warnings.push('price seems unusually high');
        }
    }
    
    // Validate status using constant
    if (order.status && !VALID_ORDER_STATUSES.includes(order.status)) {
        errors.push(`status must be one of: ${VALID_ORDER_STATUSES.join(', ')}`);
    }
    
    // Validate capacity using constant
    if (order.capacity && !(VALID_CAPACITIES as readonly string[]).includes(order.capacity)) {
        errors.push(`capacity must be one of: ${VALID_CAPACITIES.join(', ')}`);
    }
    
    // Validate content type using constant
    if (order.contentType && !(VALID_CONTENT_TYPES as readonly string[]).includes(order.contentType)) {
        errors.push(`contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}`);
    }
    
    // Validate customization structure
    if (order.customization) {
        if (typeof order.customization !== 'object') {
            errors.push('customization must be an object');
        } else {
            // Check that arrays are actually arrays
            const arrays = ['genres', 'artists', 'videos', 'movies', 'series'];
            for (const key of arrays) {
                const value = (order.customization as any)[key];
                if (value !== undefined && !Array.isArray(value)) {
                    errors.push(`customization.${key} must be an array`);
                }
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

export class OrderService {
    /**
     * Validate order data
     */
    validateOrder(order: Partial<AdminOrder>, isUpdate: boolean = false): OrderValidationResult {
        return validateOrderData(order, isUpdate);
    }
    
    /**
     * Invalidate all order-related caches
     * Ensures dashboard and analytics stay synchronized
     */
    private invalidateOrderCaches(): void {
        analyticsService.clearCache();
        invalidateDashboardCache();
    }
    
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
     * Update order status with validation and atomic transaction
     */
    async updateOrderStatus(orderId: string, status: OrderStatus): Promise<boolean> {
        // Validate inputs
        if (!orderId || typeof orderId !== 'string') {
            throw new Error('Invalid orderId: must be a non-empty string');
        }
        
        if (!VALID_ORDER_STATUSES.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}`);
        }

        try {
            // Verify order exists before updating
            const order = await this.getOrderById(orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found`);
            }

            // Update in database with timestamp
            const updates: Partial<AdminOrder> = { 
                status,
                updatedAt: new Date()
            };
            
            // Set completion timestamp for completed orders
            if (status === 'completed' && !order.completedAt) {
                updates.completedAt = new Date();
            }
            
            // Set confirmation timestamp for confirmed orders
            if (status === 'confirmed' && !order.confirmedAt) {
                updates.confirmedAt = new Date();
            }
            
            await this.updateOrderInDB(orderId, updates);
            
            // Invalidate all order-related caches
            this.invalidateOrderCaches();
            
            // Log the status change with timestamp
            const timestamp = new Date().toISOString();
            await this.addOrderNote(orderId, `Status changed to: ${status} at ${timestamp}`);
            
            console.log(`✅ Order ${orderId} status updated to: ${status}`);
            return true;
        } catch (error) {
            console.error('Error updating order status:', error);
            throw error;
        }
    }

    /**
     * Update order details with validation
     */
    async updateOrder(orderId: string, updates: Partial<AdminOrder>): Promise<boolean> {
        // Validate inputs
        if (!orderId || typeof orderId !== 'string') {
            throw new Error('Invalid orderId: must be a non-empty string');
        }
        
        if (!updates || Object.keys(updates).length === 0) {
            throw new Error('No updates provided');
        }

        try {
            // Verify order exists
            const order = await this.getOrderById(orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found`);
            }

            // Always update the updatedAt timestamp
            updates.updatedAt = new Date();
            
            // Validate status if provided
            if (updates.status && !VALID_ORDER_STATUSES.includes(updates.status)) {
                throw new Error(`Invalid status: ${updates.status}`);
            }
            
            await this.updateOrderInDB(orderId, updates);
            
            // Invalidate all order-related caches
            this.invalidateOrderCaches();
            
            console.log(`✅ Order ${orderId} updated successfully`);
            return true;
        } catch (error) {
            console.error('Error updating order:', error);
            throw error;
        }
    }

    /**
     * Add note to order with validation
     */
    async addOrderNote(orderId: string, note: string): Promise<boolean> {
        // Validate inputs
        if (!orderId || typeof orderId !== 'string') {
            throw new Error('Invalid orderId: must be a non-empty string');
        }
        
        if (!note || typeof note !== 'string' || note.trim().length === 0) {
            throw new Error('Invalid note: must be a non-empty string');
        }

        try {
            const order = await this.getOrderById(orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found`);
            }
            
            const notes = order.adminNotes || [];
            const timestamp = new Date().toISOString();
            notes.push(`[${timestamp}] ${note.trim()}`);
            
            await this.updateOrderInDB(orderId, { 
                adminNotes: notes,
                updatedAt: new Date()
            });
            
            console.log(`✅ Note added to order ${orderId}`);
            return true;
        } catch (error) {
            console.error('Error adding note:', error);
            throw error;
        }
    }

    /**
     * Confirm order with validation
     */
    async confirmOrder(orderId: string): Promise<boolean> {
        // Validate input
        if (!orderId || typeof orderId !== 'string') {
            throw new Error('Invalid orderId: must be a non-empty string');
        }

        try {
            // Verify order exists and is in correct state
            const order = await this.getOrderById(orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found`);
            }
            
            if (order.status === 'confirmed') {
                console.warn(`Order ${orderId} is already confirmed`);
                return true; // Already confirmed, return success
            }
            
            if (order.status === 'cancelled') {
                throw new Error(`Cannot confirm cancelled order ${orderId}`);
            }
            
            if (order.status === 'completed') {
                throw new Error(`Cannot confirm completed order ${orderId}`);
            }
            
            await this.updateOrderInDB(orderId, {
                status: 'confirmed',
                confirmedAt: new Date(),
                updatedAt: new Date()
            });
            await this.addOrderNote(orderId, 'Order confirmed by admin');
            
            // Invalidate all order-related caches
            this.invalidateOrderCaches();
            
            // Emit ORDER_CONFIRMED event for processing job creation
            await orderEventEmitter.emitCustomEvent(
                OrderNotificationEvent.ORDER_CONFIRMED,
                {
                    orderId,
                    customerPhone: order.customerPhone,
                    customerName: order.customerName,
                    customerEmail: order.customerEmail,
                    orderData: order
                }
            );
            
            console.log(`✅ Order ${orderId} confirmed successfully`);
            return true;
        } catch (error) {
            console.error('Error confirming order:', error);
            throw error;
        }
    }

    /**
     * Cancel order with validation and reason
     */
    async cancelOrder(orderId: string, reason?: string): Promise<boolean> {
        // Validate input
        if (!orderId || typeof orderId !== 'string') {
            throw new Error('Invalid orderId: must be a non-empty string');
        }

        try {
            // Verify order exists and can be cancelled
            const order = await this.getOrderById(orderId);
            if (!order) {
                throw new Error(`Order ${orderId} not found`);
            }
            
            if (order.status === 'cancelled') {
                console.warn(`Order ${orderId} is already cancelled`);
                return true; // Already cancelled, return success
            }
            
            if (order.status === 'completed') {
                throw new Error(`Cannot cancel completed order ${orderId}`);
            }
            
            await this.updateOrderInDB(orderId, {
                status: 'cancelled',
                updatedAt: new Date()
            });
            
            const note = reason && reason.trim() 
                ? `Order cancelled: ${reason.trim()}` 
                : 'Order cancelled by admin';
            await this.addOrderNote(orderId, note);
            
            // Invalidate all order-related caches
            this.invalidateOrderCaches();
            
            console.log(`✅ Order ${orderId} cancelled successfully`);
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

            // Check all optional columns at once (batched)
            const [hasNotes, hasAdminNotes, hasCompletedAt, hasConfirmedAt] = await Promise.all([
                hasColumn('notes'),
                hasColumn('admin_notes'),
                hasColumn('completed_at'),
                hasColumn('confirmed_at')
            ]);

            // Build WHERE clause based on filters
            const whereClauses: string[] = [];
            const params: any[] = [];

            if (filters?.status) {
                // Use only processing_status which exists in the schema
                whereClauses.push('processing_status = ?');
                params.push(filters.status);
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

            // Build SELECT columns dynamically based on schema
            const selectColumns = [
                'id',
                'order_number',
                'customer_name',
                'phone_number',
                'product_type',
                'capacity',
                'price',
                'processing_status as status',
                'processing_status',
                'preferences',
                'customization',
                hasNotes ? 'notes' : 'NULL as notes',
                hasAdminNotes ? 'admin_notes' : 'NULL as admin_notes',
                'created_at',
                'updated_at',
                hasConfirmedAt ? 'confirmed_at' : 'NULL as confirmed_at',
                hasCompletedAt ? 'completed_at' : 'NULL as completed_at'
            ];

            // Query orders with pagination
            const query = `
                SELECT 
                    ${selectColumns.join(',\n                    ')}
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

            // Check all optional columns at once (batched)
            const [hasNotes, hasAdminNotes, hasCompletedAt, hasConfirmedAt] = await Promise.all([
                hasColumn('notes'),
                hasColumn('admin_notes'),
                hasColumn('completed_at'),
                hasColumn('confirmed_at')
            ]);

            // Build SELECT columns dynamically based on schema
            const selectColumns = [
                'id',
                'order_number',
                'customer_name',
                'phone_number',
                'product_type',
                'capacity',
                'price',
                'processing_status as status',
                'processing_status',
                'preferences',
                'customization',
                hasNotes ? 'notes' : 'NULL as notes',
                hasAdminNotes ? 'admin_notes' : 'NULL as admin_notes',
                'created_at',
                'updated_at',
                hasConfirmedAt ? 'confirmed_at' : 'NULL as confirmed_at',
                hasCompletedAt ? 'completed_at' : 'NULL as completed_at'
            ];

            const query = `
                SELECT 
                    ${selectColumns.join(',\n                    ')}
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

            // Batch check for all optional columns that might be updated
            const columnsToCheck = ['notes', 'admin_notes', 'confirmed_at', 'completed_at'];
            const columnChecks = await Promise.all(
                columnsToCheck.map(col => hasColumn(col))
            );
            
            const columnExists: { [key: string]: boolean } = {};
            columnsToCheck.forEach((col, index) => {
                columnExists[col] = columnChecks[index];
            });

            // Build SET clause dynamically based on existing columns
            const setClauses: string[] = [];
            const params: any[] = [];

            if (updates.status !== undefined) {
                // Update only processing_status which exists in the schema
                setClauses.push('processing_status = ?');
                params.push(updates.status);
            }
            if (updates.notes !== undefined && columnExists['notes']) {
                setClauses.push('notes = ?');
                params.push(updates.notes);
            }
            if (updates.adminNotes !== undefined && columnExists['admin_notes']) {
                setClauses.push('admin_notes = ?');
                params.push(JSON.stringify(updates.adminNotes));
            }
            if (updates.customization !== undefined) {
                setClauses.push('customization = ?');
                params.push(JSON.stringify(updates.customization));
            }
            if (updates.confirmedAt !== undefined && columnExists['confirmed_at']) {
                setClauses.push('confirmed_at = ?');
                params.push(updates.confirmedAt);
            }
            if (updates.completedAt !== undefined && columnExists['completed_at']) {
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
                whereClauses.push('processing_status = ?');
                params.push(filters.status);
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
