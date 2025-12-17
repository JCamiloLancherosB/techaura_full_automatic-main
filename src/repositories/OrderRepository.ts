/**
 * Repository for usb_orders table
 * Handles CRUD operations for USB orders from web/API
 */

import { pool } from '../mysql-database';

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';

export interface UsbOrder {
    id?: number;
    usb_capacity: string;
    usb_price: number;
    name: string;
    phone: string;
    email?: string;
    department: string;
    city: string;
    address: string;
    neighborhood: string;
    house: string;
    selected_content?: any;
    ip_address?: string;
    user_agent?: string;
    status?: OrderStatus;
    created_at?: Date;
    updated_at?: Date;
    confirmed_at?: Date;
    completed_at?: Date;
}

export interface OrderFilter {
    status?: OrderStatus | OrderStatus[];
    phone?: string;
    capacity?: string;
    date_from?: Date;
    date_to?: Date;
}

export class OrderRepository {
    /**
     * Create a new USB order
     */
    async create(order: Omit<UsbOrder, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const sql = `
            INSERT INTO usb_orders 
            (usb_capacity, usb_price, name, phone, email, department, city, 
             address, neighborhood, house, selected_content, ip_address, 
             user_agent, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            order.usb_capacity,
            order.usb_price,
            order.name,
            order.phone,
            order.email || null,
            order.department,
            order.city,
            order.address,
            order.neighborhood,
            order.house,
            order.selected_content ? JSON.stringify(order.selected_content) : null,
            order.ip_address || null,
            order.user_agent || null,
            order.status || 'pending'
        ]) as any;
        
        console.log(`✅ Order created: ID ${result.insertId} - ${order.name} (${order.phone})`);
        return result.insertId;
    }
    
    /**
     * Update order status
     */
    async updateStatus(id: number, status: OrderStatus, timestamp?: Date): Promise<boolean> {
        const fields = ['status = ?', 'updated_at = NOW()'];
        const params: any[] = [status];
        
        // Set appropriate timestamp based on status
        if (status === 'confirmed' && timestamp) {
            fields.push('confirmed_at = ?');
            params.push(timestamp);
        } else if (status === 'completed' && timestamp) {
            fields.push('completed_at = ?');
            params.push(timestamp);
        }
        
        params.push(id);
        
        const sql = `UPDATE usb_orders SET ${fields.join(', ')} WHERE id = ?`;
        const [result] = await pool.execute(sql, params) as any;
        
        console.log(`✅ Order ${id} status updated to: ${status}`);
        return result.affectedRows > 0;
    }
    
    /**
     * Get order by ID
     */
    async getById(id: number): Promise<UsbOrder | null> {
        const [rows] = await pool.execute(
            'SELECT * FROM usb_orders WHERE id = ? LIMIT 1',
            [id]
        ) as any;
        
        if (!rows || rows.length === 0) {
            return null;
        }
        
        return this.mapRow(rows[0]);
    }
    
    /**
     * Get orders by phone number
     */
    async getByPhone(phone: string, limit: number = 10): Promise<UsbOrder[]> {
        const [rows] = await pool.execute(
            `SELECT * FROM usb_orders 
             WHERE phone = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [phone, limit]
        ) as any;
        
        return rows.map((row: any) => this.mapRow(row));
    }
    
    /**
     * List orders with filters
     */
    async list(filter: OrderFilter = {}, limit: number = 50, offset: number = 0): Promise<UsbOrder[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter.status) {
            if (Array.isArray(filter.status)) {
                conditions.push(`status IN (${filter.status.map(() => '?').join(',')})`);
                params.push(...filter.status);
            } else {
                conditions.push('status = ?');
                params.push(filter.status);
            }
        }
        
        if (filter.phone) {
            conditions.push('phone = ?');
            params.push(filter.phone);
        }
        
        if (filter.capacity) {
            conditions.push('usb_capacity = ?');
            params.push(filter.capacity);
        }
        
        if (filter.date_from) {
            conditions.push('created_at >= ?');
            params.push(filter.date_from);
        }
        
        if (filter.date_to) {
            conditions.push('created_at <= ?');
            params.push(filter.date_to);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT * FROM usb_orders 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `;
        
        params.push(limit, offset);
        const [rows] = await pool.execute(sql, params) as any;
        
        return rows.map((row: any) => this.mapRow(row));
    }
    
    /**
     * Count orders with filters
     */
    async count(filter: OrderFilter = {}): Promise<number> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter.status) {
            if (Array.isArray(filter.status)) {
                conditions.push(`status IN (${filter.status.map(() => '?').join(',')})`);
                params.push(...filter.status);
            } else {
                conditions.push('status = ?');
                params.push(filter.status);
            }
        }
        
        if (filter.phone) {
            conditions.push('phone = ?');
            params.push(filter.phone);
        }
        
        if (filter.capacity) {
            conditions.push('usb_capacity = ?');
            params.push(filter.capacity);
        }
        
        if (filter.date_from) {
            conditions.push('created_at >= ?');
            params.push(filter.date_from);
        }
        
        if (filter.date_to) {
            conditions.push('created_at <= ?');
            params.push(filter.date_to);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `SELECT COUNT(*) as total FROM usb_orders ${whereClause}`;
        const [rows] = await pool.execute(sql, params) as any;
        
        return rows[0]?.total || 0;
    }
    
    /**
     * Get order statistics
     */
    async getStatistics(): Promise<{
        total: number;
        by_status: Array<{ status: string; count: number }>;
        by_capacity: Array<{ capacity: string; count: number }>;
        total_revenue: number;
        avg_order_value: number;
    }> {
        const [totalResult] = await pool.execute(
            'SELECT COUNT(*) as total, SUM(usb_price) as revenue, AVG(usb_price) as avg_value FROM usb_orders'
        ) as any;
        
        const [byStatus] = await pool.execute(
            `SELECT status, COUNT(*) as count 
             FROM usb_orders 
             GROUP BY status 
             ORDER BY count DESC`
        ) as any;
        
        const [byCapacity] = await pool.execute(
            `SELECT usb_capacity as capacity, COUNT(*) as count 
             FROM usb_orders 
             GROUP BY usb_capacity 
             ORDER BY count DESC`
        ) as any;
        
        return {
            total: totalResult[0]?.total || 0,
            by_status: byStatus,
            by_capacity: byCapacity,
            total_revenue: totalResult[0]?.revenue || 0,
            avg_order_value: totalResult[0]?.avg_value || 0
        };
    }
    
    /**
     * Get pending orders (for processing queue)
     */
    async getPending(limit: number = 50): Promise<UsbOrder[]> {
        return this.list({ status: 'pending' }, limit);
    }
    
    /**
     * Map database row to UsbOrder object
     */
    private mapRow(row: any): UsbOrder {
        return {
            id: row.id,
            usb_capacity: row.usb_capacity,
            usb_price: parseFloat(row.usb_price),
            name: row.name,
            phone: row.phone,
            email: row.email,
            department: row.department,
            city: row.city,
            address: row.address,
            neighborhood: row.neighborhood,
            house: row.house,
            selected_content: row.selected_content ? JSON.parse(row.selected_content) : null,
            ip_address: row.ip_address,
            user_agent: row.user_agent,
            status: row.status as OrderStatus,
            created_at: row.created_at ? new Date(row.created_at) : undefined,
            updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
            confirmed_at: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
            completed_at: row.completed_at ? new Date(row.completed_at) : undefined
        };
    }
}

// Export singleton instance
export const orderRepository = new OrderRepository();
