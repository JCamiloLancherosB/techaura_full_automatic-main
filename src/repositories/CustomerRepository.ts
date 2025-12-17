/**
 * Customer Repository - Database access layer for customers
 * Handles all customer-related database operations
 */

import { db } from '../database/knex';
import { v4 as uuidv4 } from 'uuid';

export interface CustomerRecord {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    city?: string;
    country?: string;
    preferences?: string; // JSON string
    notes?: string;
    created_at?: Date;
    updated_at?: Date;
    last_interaction?: Date;
    last_order_date?: Date;
    total_orders?: number;
    total_spent?: number;
    vip_status?: boolean;
}

export class CustomerRepository {
    private tableName = 'customers';

    /**
     * Create a new customer
     */
    async create(customer: Omit<CustomerRecord, 'id' | 'created_at' | 'updated_at'>): Promise<CustomerRecord> {
        const id = uuidv4();
        const now = new Date();
        
        const record: CustomerRecord = {
            id,
            ...customer,
            created_at: now,
            updated_at: now,
            last_interaction: now,
            total_orders: 0,
            total_spent: 0,
            vip_status: false
        };

        await db(this.tableName).insert({
            ...record,
            preferences: typeof record.preferences === 'string' ? record.preferences : JSON.stringify(record.preferences || [])
        });

        return record;
    }

    /**
     * Find customer by ID
     */
    async findById(id: string): Promise<CustomerRecord | null> {
        const result = await db(this.tableName)
            .where({ id })
            .first();

        if (!result) return null;

        return {
            ...result,
            preferences: result.preferences ? JSON.parse(result.preferences) : []
        };
    }

    /**
     * Find customer by phone
     */
    async findByPhone(phone: string): Promise<CustomerRecord | null> {
        const result = await db(this.tableName)
            .where({ phone })
            .first();

        if (!result) return null;

        return {
            ...result,
            preferences: result.preferences ? JSON.parse(result.preferences) : []
        };
    }

    /**
     * Find customer by email
     */
    async findByEmail(email: string): Promise<CustomerRecord | null> {
        const result = await db(this.tableName)
            .where({ email })
            .first();

        if (!result) return null;

        return {
            ...result,
            preferences: result.preferences ? JSON.parse(result.preferences) : []
        };
    }

    /**
     * Update customer
     */
    async update(id: string, updates: Partial<CustomerRecord>): Promise<boolean> {
        const updateData: any = {
            ...updates,
            updated_at: new Date()
        };

        if (updates.preferences) {
            updateData.preferences = typeof updates.preferences === 'string' ? updates.preferences : JSON.stringify(updates.preferences);
        }

        const result = await db(this.tableName)
            .where({ id })
            .update(updateData);

        return result > 0;
    }

    /**
     * Delete customer
     */
    async delete(id: string): Promise<boolean> {
        const result = await db(this.tableName)
            .where({ id })
            .delete();

        return result > 0;
    }

    /**
     * List customers with pagination
     */
    async list(page: number = 1, limit: number = 50, filters?: {
        search?: string;
        vipOnly?: boolean;
    }): Promise<{ data: CustomerRecord[]; total: number }> {
        const offset = (page - 1) * limit;
        let query = db(this.tableName);
        let countQuery = db(this.tableName);

        if (filters?.search) {
            const searchTerm = `%${filters.search}%`;
            query = query.where(function() {
                this.where('name', 'like', searchTerm)
                    .orWhere('phone', 'like', searchTerm)
                    .orWhere('email', 'like', searchTerm);
            });
            countQuery = countQuery.where(function() {
                this.where('name', 'like', searchTerm)
                    .orWhere('phone', 'like', searchTerm)
                    .orWhere('email', 'like', searchTerm);
            });
        }

        if (filters?.vipOnly) {
            query = query.where({ vip_status: true });
            countQuery = countQuery.where({ vip_status: true });
        }

        const [data, countResult] = await Promise.all([
            query.limit(limit).offset(offset).orderBy('created_at', 'desc'),
            countQuery.count('* as count').first()
        ]);

        const customers = data.map((row: any) => ({
            ...row,
            preferences: row.preferences ? JSON.parse(row.preferences) : []
        }));

        return {
            data: customers,
            total: typeof countResult?.count === 'number' ? countResult.count : parseInt(countResult?.count || '0')
        };
    }

    /**
     * Update last interaction
     */
    async updateLastInteraction(id: string): Promise<boolean> {
        return this.update(id, {
            last_interaction: new Date()
        });
    }

    /**
     * Increment order count and total spent
     */
    async incrementOrders(id: string, amount: number): Promise<boolean> {
        const customer = await this.findById(id);
        if (!customer) return false;

        const newTotalOrders = (customer.total_orders || 0) + 1;
        const newTotalSpent = (customer.total_spent || 0) + amount;
        const vipStatus = newTotalOrders >= 3 || newTotalSpent >= 500000;

        return this.update(id, {
            total_orders: newTotalOrders,
            total_spent: newTotalSpent,
            last_order_date: new Date(),
            vip_status: vipStatus
        });
    }

    /**
     * Find or create customer
     */
    async findOrCreate(data: {
        name: string;
        phone: string;
        email?: string;
    }): Promise<CustomerRecord> {
        const existing = await this.findByPhone(data.phone);
        if (existing) {
            await this.updateLastInteraction(existing.id);
            return existing;
        }

        return this.create({
            name: data.name,
            phone: data.phone,
            email: data.email,
            country: 'Colombia'
        });
    }
}

export const customerRepository = new CustomerRepository();
