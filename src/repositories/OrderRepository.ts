/**
 * Order Repository - Database access layer for orders
 * Handles all order-related database operations
 */

import { db } from '../database/knex';
import { v4 as uuidv4 } from 'uuid';

export interface OrderRecord {
    id: string;
    order_number?: string;
    customer_id: string;
    customer_name?: string;
    phone_number?: string;
    content_type: string;
    capacity: string;
    preferences?: string; // JSON string
    customization?: string; // JSON string
    price: number;
    delivery_date?: Date;
    status: string;
    payment_status?: string;
    processing_status?: string;
    notes?: string;
    admin_notes?: string; // JSON array
    created_at?: Date;
    updated_at?: Date;
    completed_at?: Date;
}

export class OrderRepository {
    private tableName = 'orders';

    /**
     * Generate order number
     */
    private generateOrderNumber(): string {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `ORD-${timestamp}-${random}`;
    }

    /**
     * Create a new order
     */
    async create(order: Omit<OrderRecord, 'id' | 'order_number' | 'created_at' | 'updated_at'>): Promise<OrderRecord> {
        const id = uuidv4();
        const orderNumber = this.generateOrderNumber();
        const now = new Date();
        
        const record: OrderRecord = {
            id,
            order_number: orderNumber,
            ...order,
            status: order.status || 'pending',
            payment_status: order.payment_status || 'pending',
            processing_status: order.processing_status || 'pending',
            created_at: now,
            updated_at: now
        };

        await db(this.tableName).insert({
            ...record,
            preferences: record.preferences ? JSON.stringify(record.preferences) : null,
            customization: record.customization ? JSON.stringify(record.customization) : null,
            admin_notes: record.admin_notes ? JSON.stringify(record.admin_notes) : null
        });

        return record;
    }

    /**
     * Find order by ID
     */
    async findById(id: string): Promise<OrderRecord | null> {
        const result = await db(this.tableName)
            .where({ id })
            .first();

        if (!result) return null;

        return this.parseOrderRecord(result);
    }

    /**
     * Find order by order number
     */
    async findByOrderNumber(orderNumber: string): Promise<OrderRecord | null> {
        const result = await db(this.tableName)
            .where({ order_number: orderNumber })
            .first();

        if (!result) return null;

        return this.parseOrderRecord(result);
    }

    /**
     * Find orders by customer ID
     */
    async findByCustomerId(customerId: string): Promise<OrderRecord[]> {
        const results = await db(this.tableName)
            .where({ customer_id: customerId })
            .orderBy('created_at', 'desc');

        return results.map(this.parseOrderRecord);
    }

    /**
     * Update order
     */
    async update(id: string, updates: Partial<OrderRecord>): Promise<boolean> {
        const updateData: any = {
            ...updates,
            updated_at: new Date()
        };

        if (updates.preferences) {
            updateData.preferences = JSON.stringify(updates.preferences);
        }
        if (updates.customization) {
            updateData.customization = JSON.stringify(updates.customization);
        }
        if (updates.admin_notes) {
            updateData.admin_notes = JSON.stringify(updates.admin_notes);
        }

        const result = await db(this.tableName)
            .where({ id })
            .update(updateData);

        return result > 0;
    }

    /**
     * Update order status
     */
    async updateStatus(id: string, status: string): Promise<boolean> {
        const updates: Partial<OrderRecord> = {
            status,
            updated_at: new Date()
        };

        if (status === 'completed') {
            updates.completed_at = new Date();
        }

        return this.update(id, updates);
    }

    /**
     * Update processing status
     */
    async updateProcessingStatus(id: string, processingStatus: string): Promise<boolean> {
        return this.update(id, { processing_status: processingStatus });
    }

    /**
     * Delete order
     */
    async delete(id: string): Promise<boolean> {
        const result = await db(this.tableName)
            .where({ id })
            .delete();

        return result > 0;
    }

    /**
     * List orders with pagination and filters
     */
    async list(page: number = 1, limit: number = 50, filters?: {
        status?: string;
        contentType?: string;
        dateFrom?: Date;
        dateTo?: Date;
        customerPhone?: string;
        searchTerm?: string;
    }): Promise<{ data: OrderRecord[]; total: number }> {
        const offset = (page - 1) * limit;
        let query = db(this.tableName);
        let countQuery = db(this.tableName);

        // Apply filters
        if (filters?.status) {
            query = query.where({ status: filters.status });
            countQuery = countQuery.where({ status: filters.status });
        }

        if (filters?.contentType) {
            query = query.where({ content_type: filters.contentType });
            countQuery = countQuery.where({ content_type: filters.contentType });
        }

        if (filters?.dateFrom) {
            query = query.where('created_at', '>=', filters.dateFrom);
            countQuery = countQuery.where('created_at', '>=', filters.dateFrom);
        }

        if (filters?.dateTo) {
            query = query.where('created_at', '<=', filters.dateTo);
            countQuery = countQuery.where('created_at', '<=', filters.dateTo);
        }

        if (filters?.customerPhone) {
            query = query.where({ phone_number: filters.customerPhone });
            countQuery = countQuery.where({ phone_number: filters.customerPhone });
        }

        if (filters?.searchTerm) {
            const searchTerm = `%${filters.searchTerm}%`;
            query = query.where(function() {
                this.where('order_number', 'like', searchTerm)
                    .orWhere('customer_name', 'like', searchTerm)
                    .orWhere('phone_number', 'like', searchTerm);
            });
            countQuery = countQuery.where(function() {
                this.where('order_number', 'like', searchTerm)
                    .orWhere('customer_name', 'like', searchTerm)
                    .orWhere('phone_number', 'like', searchTerm);
            });
        }

        const [data, countResult] = await Promise.all([
            query.limit(limit).offset(offset).orderBy('created_at', 'desc'),
            countQuery.count('* as count').first()
        ]);

        const orders = data.map(this.parseOrderRecord);

        return {
            data: orders,
            total: typeof countResult?.count === 'number' ? countResult.count : parseInt(countResult?.count || '0')
        };
    }

    /**
     * Get order statistics
     */
    async getStats(): Promise<{
        total: number;
        pending: number;
        processing: number;
        completed: number;
        cancelled: number;
        totalRevenue: number;
    }> {
        const [countResult, revenueResult] = await Promise.all([
            db(this.tableName)
                .select('status')
                .count('* as count')
                .groupBy('status'),
            db(this.tableName)
                .where({ status: 'completed' })
                .sum('price as total')
                .first()
        ]);

        const stats = {
            total: 0,
            pending: 0,
            processing: 0,
            completed: 0,
            cancelled: 0,
            totalRevenue: revenueResult?.total || 0
        };

        countResult.forEach((row: any) => {
            stats.total += row.count;
            if (row.status === 'pending') stats.pending = row.count;
            else if (row.status === 'processing') stats.processing = row.count;
            else if (row.status === 'completed') stats.completed = row.count;
            else if (row.status === 'cancelled') stats.cancelled = row.count;
        });

        return stats;
    }

    /**
     * Parse order record from database
     */
    private parseOrderRecord(row: any): OrderRecord {
        return {
            ...row,
            preferences: row.preferences ? JSON.parse(row.preferences) : [],
            customization: row.customization ? JSON.parse(row.customization) : null,
            admin_notes: row.admin_notes ? JSON.parse(row.admin_notes) : []
        };
    }

    /**
     * Add note to order
     */
    async addNote(id: string, note: string): Promise<boolean> {
        const order = await this.findById(id);
        if (!order) return false;

        const notes = order.admin_notes ? (typeof order.admin_notes === 'string' ? JSON.parse(order.admin_notes) : order.admin_notes) : [];
        notes.push(`[${new Date().toISOString()}] ${note}`);

        return this.update(id, { admin_notes: JSON.stringify(notes) });
    }
}

export const orderRepository = new OrderRepository();
