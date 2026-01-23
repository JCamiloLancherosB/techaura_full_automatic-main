/**
 * Order Repository - Database access layer for orders
 * Handles all order-related database operations
 */

import { db } from '../database/knex';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt, generateHash, getLast4 } from '../utils/encryptionUtils';

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
    shipping_json?: string; // JSON string (deprecated, use shipping_encrypted)
    shipping_encrypted?: string; // Encrypted shipping data
    phone_hash?: string; // SHA-256 hash for search
    phone_last4?: string; // Last 4 digits for partial match
    address_hash?: string; // SHA-256 hash for search
    created_at?: Date;
    updated_at?: Date;
    completed_at?: Date;
}

export interface ShippingData {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    department?: string;
    specialInstructions?: string;
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
     * Encrypt shipping data and generate searchable hashes
     */
    private encryptShippingData(shippingData: ShippingData): {
        shipping_encrypted: string;
        phone_hash?: string;
        phone_last4?: string;
        address_hash?: string;
    } {
        const shippingJson = JSON.stringify(shippingData);
        const encrypted = encrypt(shippingJson);
        
        const result: any = {
            shipping_encrypted: encrypted
        };
        
        // Generate searchable hashes
        if (shippingData.phone) {
            result.phone_hash = generateHash(shippingData.phone);
            result.phone_last4 = getLast4(shippingData.phone);
        }
        
        if (shippingData.address) {
            result.address_hash = generateHash(shippingData.address);
        }
        
        return result;
    }
    
    /**
     * Decrypt shipping data
     */
    private decryptShippingData(encryptedData: string): ShippingData | null {
        if (!encryptedData) return null;
        
        try {
            const decrypted = decrypt(encryptedData);
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Failed to decrypt shipping data:', error);
            return null;
        }
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
            processing_status: order.processing_status || order.status || 'pending',  // Use status as fallback
            created_at: now,
            updated_at: now
        };

        // Handle shipping data encryption if shipping_json is provided
        let encryptedShippingFields: any = {};
        if (order.shipping_json) {
            try {
                const shippingData = JSON.parse(order.shipping_json);
                encryptedShippingFields = this.encryptShippingData(shippingData);
            } catch (error) {
                console.error('Failed to parse shipping_json for encryption:', error);
            }
        }

        await db(this.tableName).insert({
            ...record,
            preferences: record.preferences ? JSON.stringify(record.preferences) : null,
            customization: record.customization ? JSON.stringify(record.customization) : null,
            admin_notes: record.admin_notes ? JSON.stringify(record.admin_notes) : null,
            shipping_json: null, // Don't store plaintext
            ...encryptedShippingFields
        });

        return record;
    }

    /**
     * Find order by ID
     */
    async findById(id: string, decryptForAdmin: boolean = false): Promise<OrderRecord | null> {
        const result = await db(this.tableName)
            .where({ id })
            .first();

        if (!result) return null;

        return this.parseOrderRecord(result, decryptForAdmin);
    }

    /**
     * Find order by order number
     */
    async findByOrderNumber(orderNumber: string, decryptForAdmin: boolean = false): Promise<OrderRecord | null> {
        const result = await db(this.tableName)
            .where({ order_number: orderNumber })
            .first();

        if (!result) return null;

        return this.parseOrderRecord(result, decryptForAdmin);
    }

    /**
     * Find orders by customer ID
     */
    async findByCustomerId(customerId: string, decryptForAdmin: boolean = false): Promise<OrderRecord[]> {
        const results = await db(this.tableName)
            .where({ customer_id: customerId })
            .orderBy('created_at', 'desc');

        return results.map(r => this.parseOrderRecord(r, decryptForAdmin));
    }

    /**
     * Find orders by phone number hash
     */
    async findByPhoneHash(phoneHash: string, decryptForAdmin: boolean = false): Promise<OrderRecord[]> {
        const results = await db(this.tableName)
            .where({ phone_hash: phoneHash })
            .orderBy('created_at', 'desc');

        return results.map(r => this.parseOrderRecord(r, decryptForAdmin));
    }

    /**
     * Find orders by phone last 4 digits
     */
    async findByPhoneLast4(last4: string, decryptForAdmin: boolean = false): Promise<OrderRecord[]> {
        const results = await db(this.tableName)
            .where({ phone_last4: last4 })
            .orderBy('created_at', 'desc');

        return results.map(r => this.parseOrderRecord(r, decryptForAdmin));
    }
    
    /**
     * Find orders by phone number (searches by hash)
     */
    async findByPhoneNumber(phoneNumber: string, decryptForAdmin: boolean = false): Promise<OrderRecord[]> {
        const phoneHash = generateHash(phoneNumber);
        return this.findByPhoneHash(phoneHash, decryptForAdmin);
    }

    /**
     * Update order
     */
    async update(id: string, updates: Partial<OrderRecord>): Promise<boolean> {
        const updateData: any = {
            ...updates,
            updated_at: new Date()
        };

        // Handle shipping data encryption if shipping_json is updated
        if (updates.shipping_json) {
            try {
                const shippingData = JSON.parse(updates.shipping_json);
                const encryptedFields = this.encryptShippingData(shippingData);
                Object.assign(updateData, encryptedFields);
                updateData.shipping_json = null; // Don't store plaintext
            } catch (error) {
                console.error('Failed to parse shipping_json for encryption:', error);
            }
        }

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
     * Updates both status and processing_status for compatibility
     */
    async updateStatus(id: string, status: string): Promise<boolean> {
        const updates: any = {
            processing_status: status,  // Primary status field that exists in schema
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
            // Use processing_status which exists in the schema
            query = query.where({ processing_status: filters.status });
            countQuery = countQuery.where({ processing_status: filters.status });
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

        const orders = data.map((r: any) => this.parseOrderRecord(r, false));

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
                .select('processing_status as status')  // Use processing_status which exists
                .count('* as count')
                .groupBy('processing_status'),
            db(this.tableName)
                .where({ processing_status: 'completed' })  // Use processing_status which exists
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
     * Parse order record from database with decryption
     */
    private parseOrderRecord(row: any, decryptForAdmin: boolean = false): OrderRecord {
        const record: OrderRecord = {
            ...row,
            preferences: row.preferences ? JSON.parse(row.preferences) : [],
            customization: row.customization ? JSON.parse(row.customization) : null,
            admin_notes: row.admin_notes ? JSON.parse(row.admin_notes) : []
        };
        
        // Decrypt shipping data if requested (for admin views only)
        if (decryptForAdmin && row.shipping_encrypted) {
            const shippingData = this.decryptShippingData(row.shipping_encrypted);
            if (shippingData) {
                record.shipping_json = JSON.stringify(shippingData);
            }
        }
        
        return record;
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

    /**
     * Create order confirmation record
     */
    async createOrderConfirmation(data: {
        orderId: string;
        customerPhone: string;
        customerName?: string;
        customerCedula?: string;
        shippingAddress?: string;
        shippingCity?: string;
        shippingDepartment?: string;
        paymentMethod?: string;
        totalAmount?: number;
        status?: string;
    }): Promise<boolean> {
        try {
            await db('order_confirmations').insert({
                order_id: data.orderId,
                customer_phone: data.customerPhone,
                customer_name: data.customerName,
                customer_cedula: data.customerCedula,
                shipping_address: data.shippingAddress,
                shipping_city: data.shippingCity,
                shipping_department: data.shippingDepartment,
                payment_method: data.paymentMethod,
                total_amount: data.totalAmount,
                status: data.status || 'pending',
                confirmed_at: data.status === 'confirmed' ? new Date() : null,
            });
            return true;
        } catch (error) {
            console.error('Error creating order confirmation:', error);
            return false;
        }
    }

    /**
     * Update order confirmation status
     */
    async updateOrderConfirmationStatus(orderId: string, status: string): Promise<boolean> {
        try {
            const updates: any = {
                status,
                updated_at: new Date(),
            };

            if (status === 'confirmed' || status === 'processing') {
                updates.confirmed_at = new Date();
            }

            await db('order_confirmations')
                .where({ order_id: orderId })
                .update(updates);
            
            return true;
        } catch (error) {
            console.error('Error updating order confirmation status:', error);
            return false;
        }
    }

    /**
     * Get order confirmation by order ID
     */
    async getOrderConfirmation(orderId: string): Promise<any | null> {
        try {
            const result = await db('order_confirmations')
                .where({ order_id: orderId })
                .first();
            
            return result || null;
        } catch (error) {
            console.error('Error getting order confirmation:', error);
            return null;
        }
    }

    /**
     * Get order confirmations by customer phone
     */
    async getCustomerOrderConfirmations(customerPhone: string): Promise<any[]> {
        try {
            const results = await db('order_confirmations')
                .where({ customer_phone: customerPhone })
                .orderBy('created_at', 'desc');
            
            return results;
        } catch (error) {
            console.error('Error getting customer order confirmations:', error);
            return [];
        }
    }

    /**
     * Get last confirmed order for customer
     */
    async getLastCustomerOrder(customerPhone: string): Promise<any | null> {
        try {
            const result = await db('order_confirmations')
                .where({ customer_phone: customerPhone })
                .whereIn('status', ['confirmed', 'processing', 'shipped', 'delivered'])
                .orderBy('confirmed_at', 'desc')
                .first();
            
            return result || null;
        } catch (error) {
            console.error('Error getting last customer order:', error);
            return null;
        }
    }
}

export const orderRepository = new OrderRepository();
