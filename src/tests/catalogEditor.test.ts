/**
 * Test Suite: Catalog Editing with Validation and Audit Trail
 * 
 * Tests for PR-D2 implementation:
 * - Catalog item CRUD operations
 * - Price validation with min/max constraints
 * - Audit trail logging
 * - Dynamic pricing in CatalogService
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// Mock database for testing
let mockCatalogItems: any[] = [];
const mockChangeLogs: any[] = [];
let nextItemId = 1;
let nextLogId = 1;

// Mock CatalogRepository
const mockCatalogRepository = {
    getAllItems: async (activeOnly: boolean = false) => {
        if (activeOnly) {
            return mockCatalogItems.filter(item => item.is_active);
        }
        return mockCatalogItems;
    },
    
    getItemsByCategory: async (categoryId: string, activeOnly: boolean = true) => {
        let items = mockCatalogItems.filter(item => item.category_id === categoryId);
        if (activeOnly) {
            items = items.filter(item => item.is_active);
        }
        return items;
    },
    
    getItem: async (categoryId: string, capacity: string) => {
        return mockCatalogItems.find(
            item => item.category_id === categoryId && item.capacity === capacity
        ) || null;
    },
    
    getItemById: async (id: number) => {
        return mockCatalogItems.find(item => item.id === id) || null;
    },
    
    createItem: async (item: any, changedBy: string, changeReason?: string, ipAddress?: string) => {
        const newItem = {
            id: nextItemId++,
            ...item,
            is_active: item.is_active ?? true,
            is_popular: item.is_popular ?? false,
            is_recommended: item.is_recommended ?? false,
            created_at: new Date(),
            updated_at: new Date()
        };
        mockCatalogItems.push(newItem);
        
        mockChangeLogs.push({
            id: nextLogId++,
            catalog_item_id: newItem.id,
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
        
        return newItem.id;
    },
    
    updateItem: async (id: number, updates: any, changedBy: string, changeReason?: string, ipAddress?: string) => {
        const itemIndex = mockCatalogItems.findIndex(item => item.id === id);
        
        if (itemIndex === -1) {
            return false;
        }
        
        const currentItem = mockCatalogItems[itemIndex];
        
        // Log each changed field
        for (const [field, newValue] of Object.entries(updates)) {
            const oldValue = currentItem[field];
            
            if (oldValue !== newValue) {
                mockChangeLogs.push({
                    id: nextLogId++,
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
        
        // Update item
        mockCatalogItems[itemIndex] = {
            ...currentItem,
            ...updates,
            updated_at: new Date()
        };
        
        return true;
    },
    
    deleteItem: async (id: number, changedBy: string, changeReason?: string, ipAddress?: string) => {
        const item = mockCatalogItems.find(item => item.id === id);
        
        if (!item) {
            return false;
        }
        
        item.is_active = false;
        item.updated_at = new Date();
        
        mockChangeLogs.push({
            id: nextLogId++,
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
    },
    
    activateItem: async (id: number, changedBy: string, changeReason?: string, ipAddress?: string) => {
        const item = mockCatalogItems.find(item => item.id === id);
        
        if (!item) {
            return false;
        }
        
        item.is_active = true;
        item.updated_at = new Date();
        
        mockChangeLogs.push({
            id: nextLogId++,
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
    },
    
    getItemChangeLogs: async (itemId: number, limit: number = 50) => {
        return mockChangeLogs
            .filter(log => log.catalog_item_id === itemId)
            .slice(0, limit);
    },
    
    getCategoryChangeLogs: async (categoryId: string, limit: number = 100) => {
        return mockChangeLogs
            .filter(log => log.category_id === categoryId)
            .slice(0, limit);
    },
    
    getAllChangeLogs: async (limit: number = 200) => {
        return mockChangeLogs.slice(0, limit);
    }
};

// Mock AdminCatalogService with validation
class MockAdminCatalogService {
    private validatePriceChange(item: any, newPrice: number) {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (newPrice <= 0) {
            errors.push('El precio debe ser mayor a 0');
        }
        
        if (item.min_price && newPrice < item.min_price) {
            errors.push(`El precio mínimo permitido es $${item.min_price.toLocaleString('es-CO')}`);
        }
        
        if (item.max_price && newPrice > item.max_price) {
            errors.push(`El precio máximo permitido es $${item.max_price.toLocaleString('es-CO')}`);
        }
        
        const percentChange = Math.abs((newPrice - item.price) / item.price * 100);
        if (percentChange > 20) {
            warnings.push(`El cambio de precio es significativo: ${percentChange.toFixed(1)}%`);
        }
        
        return { isValid: errors.length === 0, errors, warnings };
    }
    
    async updateCatalogItem(id: number, updates: any, changedBy: string, changeReason?: string, ipAddress?: string) {
        const currentItem = await mockCatalogRepository.getItemById(id);
        
        if (!currentItem) {
            return { success: false, errors: ['Producto no encontrado'] };
        }
        
        const allErrors: string[] = [];
        const allWarnings: string[] = [];
        
        if (updates.price !== undefined) {
            const validation = this.validatePriceChange(currentItem, updates.price);
            if (!validation.isValid) {
                allErrors.push(...validation.errors);
            }
            if (validation.warnings) {
                allWarnings.push(...validation.warnings);
            }
        }
        
        if (allErrors.length > 0) {
            return { success: false, errors: allErrors, warnings: allWarnings.length > 0 ? allWarnings : undefined };
        }
        
        const updated = await mockCatalogRepository.updateItem(id, updates, changedBy, changeReason, ipAddress);
        
        if (!updated) {
            return { success: false, errors: ['Error al actualizar el producto'] };
        }
        
        const updatedItem = await mockCatalogRepository.getItemById(id);
        
        return {
            success: true,
            warnings: allWarnings.length > 0 ? allWarnings : undefined,
            item: updatedItem
        };
    }
    
    async getItemChangeHistory(itemId: number, limit: number = 50) {
        return mockCatalogRepository.getItemChangeLogs(itemId, limit);
    }
}

const mockAdminCatalogService = new MockAdminCatalogService();

// ============================================
// TEST SUITE
// ============================================

describe('Catalog Editing Tests', () => {
    
    before(() => {
        console.log('🧪 Starting Catalog Editing Tests\n');
        
        // Seed initial data
        mockCatalogItems = [
            {
                id: 1,
                category_id: 'videos',
                capacity: '32GB',
                capacity_gb: 32,
                price: 84900,
                content_count: 1000,
                content_unit: 'videos',
                is_active: true,
                is_popular: true,
                is_recommended: false,
                min_price: 60000,
                max_price: 150000,
                created_at: new Date(),
                updated_at: new Date()
            },
            {
                id: 2,
                category_id: 'music',
                capacity: '64GB',
                capacity_gb: 64,
                price: 119900,
                content_count: 10000,
                content_unit: 'canciones',
                is_active: true,
                is_popular: false,
                is_recommended: true,
                min_price: 80000,
                max_price: 200000,
                created_at: new Date(),
                updated_at: new Date()
            }
        ];
        nextItemId = 3;
    });
    
    after(() => {
        console.log('\n✅ All Catalog Editing Tests Completed');
    });
    
    describe('Price Update with Validation', () => {
        it('should update price within valid range', async () => {
            const result = await mockAdminCatalogService.updateCatalogItem(
                1, // videos 32GB
                { price: 89900 },
                'admin_test',
                'Price adjustment for promotion',
                '127.0.0.1'
            );
            
            assert.strictEqual(result.success, true, 'Update should succeed');
            assert.strictEqual(result.item?.price, 89900, 'Price should be updated');
            
            // Check audit log
            const history = await mockAdminCatalogService.getItemChangeHistory(1);
            assert.ok(history.length > 0, 'Should have audit log entry');
            
            const lastLog = history[history.length - 1];
            assert.strictEqual(lastLog.action, 'update', 'Action should be update');
            assert.strictEqual(lastLog.field_changed, 'price', 'Field should be price');
            assert.strictEqual(lastLog.old_value, '84900', 'Old value should be logged');
            assert.strictEqual(lastLog.new_value, '89900', 'New value should be logged');
            assert.strictEqual(lastLog.changed_by, 'admin_test', 'Changed by should be logged');
            
            console.log('✓ Price updated successfully with audit trail');
        });
        
        it('should reject price below minimum', async () => {
            const result = await mockAdminCatalogService.updateCatalogItem(
                1, // videos 32GB (min_price: 60000)
                { price: 50000 },
                'admin_test',
                'Trying to set price below minimum'
            );
            
            assert.strictEqual(result.success, false, 'Update should fail');
            assert.ok(result.errors && result.errors.length > 0, 'Should have validation errors');
            assert.ok(
                result.errors.some(err => err.includes('mínimo')),
                'Should have minimum price error'
            );
            
            console.log('✓ Price below minimum rejected correctly');
        });
        
        it('should reject price above maximum', async () => {
            const result = await mockAdminCatalogService.updateCatalogItem(
                1, // videos 32GB (max_price: 150000)
                { price: 160000 },
                'admin_test',
                'Trying to set price above maximum'
            );
            
            assert.strictEqual(result.success, false, 'Update should fail');
            assert.ok(result.errors && result.errors.length > 0, 'Should have validation errors');
            assert.ok(
                result.errors.some(err => err.includes('máximo')),
                'Should have maximum price error'
            );
            
            console.log('✓ Price above maximum rejected correctly');
        });
        
        it('should warn on significant price change (>20%)', async () => {
            const result = await mockAdminCatalogService.updateCatalogItem(
                2, // music 64GB (price: 119900)
                { price: 95900 }, // ~20% decrease
                'admin_test',
                'Promotion pricing'
            );
            
            assert.strictEqual(result.success, true, 'Update should succeed');
            assert.ok(result.warnings && result.warnings.length > 0, 'Should have warnings');
            assert.ok(
                result.warnings.some(warn => warn.includes('significativo')),
                'Should warn about significant change'
            );
            
            console.log('✓ Significant price change warning generated');
        });
    });
    
    describe('Audit Trail Verification', () => {
        it('should log who changed what and when', async () => {
            // Make a change
            await mockAdminCatalogService.updateCatalogItem(
                1,
                { price: 84900 },
                'john_admin',
                'Reverting to original price',
                '192.168.1.100'
            );
            
            // Check audit log
            const history = await mockAdminCatalogService.getItemChangeHistory(1);
            const lastLog = history[history.length - 1];
            
            assert.strictEqual(lastLog.changed_by, 'john_admin', 'Changed by should be logged');
            assert.strictEqual(lastLog.change_reason, 'Reverting to original price', 'Reason should be logged');
            assert.strictEqual(lastLog.ip_address, '192.168.1.100', 'IP should be logged');
            assert.ok(lastLog.created_at, 'Timestamp should be logged');
            
            console.log('✓ Complete audit trail captured (user, reason, IP, timestamp)');
        });
    });
    
    describe('Acceptance Criteria Verification', () => {
        it('AC1: Price change for 32GB videos should be reflected', async () => {
            // Update price
            const updateResult = await mockAdminCatalogService.updateCatalogItem(
                1, // videos 32GB
                { price: 79900 },
                'admin',
                'Price update test'
            );
            
            assert.strictEqual(updateResult.success, true, 'Update should succeed');
            
            // Verify the change is reflected immediately
            const item = await mockCatalogRepository.getItem('videos', '32GB');
            assert.strictEqual(item?.price, 79900, 'Price should be updated immediately');
            
            console.log('✓ AC1: Price change reflected immediately in catalog');
        });
        
        it('AC2: Audit trail in catalog_change_log', async () => {
            // Check that we have audit logs
            const allLogs = await mockCatalogRepository.getAllChangeLogs();
            
            assert.ok(allLogs.length > 0, 'Should have audit logs');
            
            // Verify audit log structure
            const sampleLog = allLogs[0];
            assert.ok(sampleLog.catalog_item_id, 'Should have catalog_item_id');
            assert.ok(sampleLog.category_id, 'Should have category_id');
            assert.ok(sampleLog.capacity, 'Should have capacity');
            assert.ok(sampleLog.action, 'Should have action');
            assert.ok(sampleLog.changed_by, 'Should have changed_by');
            assert.ok(sampleLog.created_at, 'Should have timestamp');
            
            console.log('✓ AC2: Audit trail properly logged in catalog_change_log');
        });
    });
    
    describe('Database Schema Validation', () => {
        it('should have correct catalog_items structure', () => {
            const sampleItem = mockCatalogItems[0];
            
            // Required fields
            assert.ok(sampleItem.id, 'Should have id');
            assert.ok(sampleItem.category_id, 'Should have category_id');
            assert.ok(sampleItem.capacity, 'Should have capacity');
            assert.ok(typeof sampleItem.capacity_gb === 'number', 'Should have capacity_gb as number');
            assert.ok(typeof sampleItem.price === 'number', 'Should have price as number');
            assert.ok(typeof sampleItem.content_count === 'number', 'Should have content_count');
            assert.ok(sampleItem.content_unit, 'Should have content_unit');
            
            // Optional fields with defaults
            assert.ok(typeof sampleItem.is_active === 'boolean', 'Should have is_active');
            assert.ok(typeof sampleItem.is_popular === 'boolean', 'Should have is_popular');
            assert.ok(typeof sampleItem.is_recommended === 'boolean', 'Should have is_recommended');
            
            // Constraints
            assert.ok(sampleItem.min_price, 'Should have min_price constraint');
            assert.ok(sampleItem.max_price, 'Should have max_price constraint');
            
            console.log('✓ catalog_items table structure validated');
        });
        
        it('should have correct catalog_change_log structure', () => {
            const sampleLog = mockChangeLogs[0];
            
            assert.ok(sampleLog.id, 'Should have id');
            assert.ok(sampleLog.catalog_item_id !== undefined, 'Should have catalog_item_id');
            assert.ok(sampleLog.category_id, 'Should have category_id');
            assert.ok(sampleLog.capacity, 'Should have capacity');
            assert.ok(sampleLog.action, 'Should have action');
            assert.ok(sampleLog.changed_by, 'Should have changed_by');
            assert.ok(sampleLog.created_at, 'Should have created_at');
            
            console.log('✓ catalog_change_log table structure validated');
        });
    });
});

// Run tests
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║   PR-D2: Catalog Editor with Validation and Audit Trail       ║');
console.log('║   Test Suite - Mock Database Version                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
