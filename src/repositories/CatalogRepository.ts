/**
 * Catalog Repository
 * Database access layer for catalog items and change logs
 */

import { db } from '../database/knex';

export interface CatalogItem {
    id?: number;
    category_id: string;
    capacity: string;
    capacity_gb: number;
    price: number;
    content_count: number;
    content_unit: string;
    is_active?: boolean;
    is_popular?: boolean;
    is_recommended?: boolean;
    min_price?: number;
    max_price?: number;
    metadata?: any;
    created_at?: Date;
    updated_at?: Date;
}

export interface CatalogChangeLog {
    id?: number;
    catalog_item_id?: number;
    category_id: string;
    capacity: string;
    action: 'create' | 'update' | 'delete' | 'activate' | 'deactivate';
    field_changed?: string;
    old_value?: string;
    new_value?: string;
    changed_by: string;
    change_reason?: string;
    change_data?: any;
    ip_address?: string;
    created_at?: Date;
}

export class CatalogRepository {
    private static instance: CatalogRepository;
    
    private constructor() {}
    
    public static getInstance(): CatalogRepository {
        if (!CatalogRepository.instance) {
            CatalogRepository.instance = new CatalogRepository();
        }
        return CatalogRepository.instance;
    }
    
    // ============================================
    // CATALOG ITEMS - CRUD Operations
    // ============================================
    
    /**
     * Get all catalog items
     */
    async getAllItems(activeOnly: boolean = false): Promise<CatalogItem[]> {
        let query = db('catalog_items');
        
        if (activeOnly) {
            query = query.where('is_active', true);
        }
        
        return query.orderBy('category_id').orderBy('capacity_gb');
    }
    
    /**
     * Get items by category
     */
    async getItemsByCategory(categoryId: string, activeOnly: boolean = true): Promise<CatalogItem[]> {
        let query = db('catalog_items').where('category_id', categoryId);
        
        if (activeOnly) {
            query = query.where('is_active', true);
        }
        
        return query.orderBy('capacity_gb');
    }
    
    /**
     * Get a specific item
     */
    async getItem(categoryId: string, capacity: string): Promise<CatalogItem | null> {
        const item = await db('catalog_items')
            .where({ category_id: categoryId, capacity })
            .first();
        
        return item || null;
    }
    
    /**
     * Get item by ID
     */
    async getItemById(id: number): Promise<CatalogItem | null> {
        const item = await db('catalog_items').where({ id }).first();
        return item || null;
    }
    
    /**
     * Create a new catalog item
     */
    async createItem(item: CatalogItem, changedBy: string, changeReason?: string, ipAddress?: string): Promise<number> {
        // Start transaction
        return db.transaction(async (trx) => {
            // Insert catalog item
            const [itemId] = await trx('catalog_items').insert({
                ...item,
                created_at: new Date(),
                updated_at: new Date()
            });
            
            // Log the change
            await trx('catalog_change_log').insert({
                catalog_item_id: itemId,
                category_id: item.category_id,
                capacity: item.capacity,
                action: 'create',
                new_value: JSON.stringify(item),
                changed_by: changedBy,
                change_reason: changeReason,
                change_data: item,
                ip_address: ipAddress,
                created_at: new Date()
            });
            
            return itemId;
        });
    }
    
    /**
     * Update a catalog item
     */
    async updateItem(
        id: number, 
        updates: Partial<CatalogItem>, 
        changedBy: string, 
        changeReason?: string,
        ipAddress?: string
    ): Promise<boolean> {
        return db.transaction(async (trx) => {
            // Get current item
            const currentItem = await trx('catalog_items').where({ id }).first();
            
            if (!currentItem) {
                return false;
            }
            
            // Update item
            await trx('catalog_items')
                .where({ id })
                .update({
                    ...updates,
                    updated_at: new Date()
                });
            
            // Log each changed field
            const changedFields = Object.keys(updates);
            
            for (const field of changedFields) {
                const oldValue = currentItem[field];
                const newValue = updates[field as keyof CatalogItem];
                
                if (oldValue !== newValue) {
                    await trx('catalog_change_log').insert({
                        catalog_item_id: id,
                        category_id: currentItem.category_id,
                        capacity: currentItem.capacity,
                        action: 'update',
                        field_changed: field,
                        old_value: String(oldValue),
                        new_value: String(newValue),
                        changed_by: changedBy,
                        change_reason: changeReason,
                        change_data: { field, oldValue, newValue },
                        ip_address: ipAddress,
                        created_at: new Date()
                    });
                }
            }
            
            return true;
        });
    }
    
    /**
     * Delete a catalog item (soft delete by setting is_active = false)
     */
    async deleteItem(id: number, changedBy: string, changeReason?: string, ipAddress?: string): Promise<boolean> {
        return db.transaction(async (trx) => {
            const item = await trx('catalog_items').where({ id }).first();
            
            if (!item) {
                return false;
            }
            
            // Soft delete
            await trx('catalog_items')
                .where({ id })
                .update({ is_active: false, updated_at: new Date() });
            
            // Log the deletion
            await trx('catalog_change_log').insert({
                catalog_item_id: id,
                category_id: item.category_id,
                capacity: item.capacity,
                action: 'deactivate',
                old_value: 'active',
                new_value: 'inactive',
                changed_by: changedBy,
                change_reason: changeReason,
                change_data: item,
                ip_address: ipAddress,
                created_at: new Date()
            });
            
            return true;
        });
    }
    
    /**
     * Activate a catalog item
     */
    async activateItem(id: number, changedBy: string, changeReason?: string, ipAddress?: string): Promise<boolean> {
        return db.transaction(async (trx) => {
            const item = await trx('catalog_items').where({ id }).first();
            
            if (!item) {
                return false;
            }
            
            await trx('catalog_items')
                .where({ id })
                .update({ is_active: true, updated_at: new Date() });
            
            await trx('catalog_change_log').insert({
                catalog_item_id: id,
                category_id: item.category_id,
                capacity: item.capacity,
                action: 'activate',
                old_value: 'inactive',
                new_value: 'active',
                changed_by: changedBy,
                change_reason: changeReason,
                change_data: item,
                ip_address: ipAddress,
                created_at: new Date()
            });
            
            return true;
        });
    }
    
    // ============================================
    // CHANGE LOG - Query Operations
    // ============================================
    
    /**
     * Get change logs for a specific item
     */
    async getItemChangeLogs(itemId: number, limit: number = 50): Promise<CatalogChangeLog[]> {
        return db('catalog_change_log')
            .where('catalog_item_id', itemId)
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    
    /**
     * Get change logs for a category
     */
    async getCategoryChangeLogs(categoryId: string, limit: number = 100): Promise<CatalogChangeLog[]> {
        return db('catalog_change_log')
            .where('category_id', categoryId)
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    
    /**
     * Get all change logs
     */
    async getAllChangeLogs(limit: number = 200): Promise<CatalogChangeLog[]> {
        return db('catalog_change_log')
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    
    /**
     * Get change logs by user
     */
    async getChangeLogsByUser(changedBy: string, limit: number = 100): Promise<CatalogChangeLog[]> {
        return db('catalog_change_log')
            .where('changed_by', changedBy)
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    
    /**
     * Get change logs for a specific action
     */
    async getChangeLogsByAction(action: string, limit: number = 100): Promise<CatalogChangeLog[]> {
        return db('catalog_change_log')
            .where('action', action)
            .orderBy('created_at', 'desc')
            .limit(limit);
    }
    
    /**
     * Get change logs with filters
     */
    async getChangeLogsFiltered(filters: {
        categoryId?: string;
        capacity?: string;
        action?: string;
        changedBy?: string;
        dateFrom?: Date;
        dateTo?: Date;
    }, limit: number = 100): Promise<CatalogChangeLog[]> {
        let query = db('catalog_change_log');
        
        if (filters.categoryId) {
            query = query.where('category_id', filters.categoryId);
        }
        
        if (filters.capacity) {
            query = query.where('capacity', filters.capacity);
        }
        
        if (filters.action) {
            query = query.where('action', filters.action);
        }
        
        if (filters.changedBy) {
            query = query.where('changed_by', filters.changedBy);
        }
        
        if (filters.dateFrom) {
            query = query.where('created_at', '>=', filters.dateFrom);
        }
        
        if (filters.dateTo) {
            query = query.where('created_at', '<=', filters.dateTo);
        }
        
        return query.orderBy('created_at', 'desc').limit(limit);
    }
}

// Export singleton instance
export const catalogRepository = CatalogRepository.getInstance();
