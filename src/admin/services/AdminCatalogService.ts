/**
 * Admin Catalog Service
 * Business logic for catalog management with validation and audit trail
 */

import { catalogRepository, CatalogItem } from '../../repositories/CatalogRepository';

export interface CatalogValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
}

export interface CatalogUpdateRequest {
    price?: number;
    content_count?: number;
    is_active?: boolean;
    is_popular?: boolean;
    is_recommended?: boolean;
    min_price?: number;
    max_price?: number;
    metadata?: any;
}

export class AdminCatalogService {
    private static instance: AdminCatalogService;
    
    private constructor() {}
    
    public static getInstance(): AdminCatalogService {
        if (!AdminCatalogService.instance) {
            AdminCatalogService.instance = new AdminCatalogService();
        }
        return AdminCatalogService.instance;
    }
    
    /**
     * Validate price change
     */
    private validatePriceChange(item: CatalogItem, newPrice: number): CatalogValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Check if price is positive
        if (newPrice <= 0) {
            errors.push('El precio debe ser mayor a 0');
        }
        
        // Check minimum price constraint
        if (item.min_price && newPrice < item.min_price) {
            errors.push(`El precio mínimo permitido es $${item.min_price.toLocaleString('es-CO')}`);
        }
        
        // Check maximum price constraint
        if (item.max_price && newPrice > item.max_price) {
            errors.push(`El precio máximo permitido es $${item.max_price.toLocaleString('es-CO')}`);
        }
        
        // Warning for significant price changes (>20%)
        const currentPrice = item.price;
        const percentChange = Math.abs((newPrice - currentPrice) / currentPrice * 100);
        
        if (percentChange > 20) {
            warnings.push(`El cambio de precio es significativo: ${percentChange.toFixed(1)}% (de $${currentPrice.toLocaleString('es-CO')} a $${newPrice.toLocaleString('es-CO')})`);
        }
        
        // Warning for prices not matching common patterns
        if (newPrice % 100 !== 0) {
            warnings.push('El precio no termina en 00. Considera usar precios redondeados como 84900, 119900, etc.');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
    
    /**
     * Validate content count change
     */
    private validateContentCount(newCount: number): CatalogValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (newCount <= 0) {
            errors.push('La cantidad de contenido debe ser mayor a 0');
        }
        
        if (!Number.isInteger(newCount)) {
            errors.push('La cantidad de contenido debe ser un número entero');
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }
    
    /**
     * Validate price range constraints
     */
    private validatePriceRange(minPrice?: number, maxPrice?: number): CatalogValidationResult {
        const errors: string[] = [];
        
        if (minPrice !== undefined && minPrice <= 0) {
            errors.push('El precio mínimo debe ser mayor a 0');
        }
        
        if (maxPrice !== undefined && maxPrice <= 0) {
            errors.push('El precio máximo debe ser mayor a 0');
        }
        
        if (minPrice && maxPrice && minPrice >= maxPrice) {
            errors.push('El precio mínimo debe ser menor al precio máximo');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Get all catalog items
     */
    async getAllCatalogItems(activeOnly: boolean = false): Promise<CatalogItem[]> {
        return catalogRepository.getAllItems(activeOnly);
    }
    
    /**
     * Get catalog items by category
     */
    async getCatalogItemsByCategory(categoryId: string, activeOnly: boolean = true): Promise<CatalogItem[]> {
        return catalogRepository.getItemsByCategory(categoryId, activeOnly);
    }
    
    /**
     * Get a specific catalog item
     */
    async getCatalogItem(categoryId: string, capacity: string): Promise<CatalogItem | null> {
        return catalogRepository.getItem(categoryId, capacity);
    }
    
    /**
     * Update catalog item with validation
     */
    async updateCatalogItem(
        id: number,
        updates: CatalogUpdateRequest,
        changedBy: string,
        changeReason?: string,
        ipAddress?: string
    ): Promise<{ success: boolean; errors?: string[]; warnings?: string[]; item?: CatalogItem }> {
        try {
            // Get current item
            const currentItem = await catalogRepository.getItemById(id);
            
            if (!currentItem) {
                return {
                    success: false,
                    errors: ['Producto no encontrado']
                };
            }
            
            const allErrors: string[] = [];
            const allWarnings: string[] = [];
            
            // Validate price change if present
            if (updates.price !== undefined) {
                const priceValidation = this.validatePriceChange(currentItem, updates.price);
                if (!priceValidation.isValid) {
                    allErrors.push(...priceValidation.errors);
                }
                if (priceValidation.warnings) {
                    allWarnings.push(...priceValidation.warnings);
                }
            }
            
            // Validate content count if present
            if (updates.content_count !== undefined) {
                const countValidation = this.validateContentCount(updates.content_count);
                if (!countValidation.isValid) {
                    allErrors.push(...countValidation.errors);
                }
                if (countValidation.warnings) {
                    allWarnings.push(...countValidation.warnings);
                }
            }
            
            // Validate price range if present
            if (updates.min_price !== undefined || updates.max_price !== undefined) {
                const newMinPrice = updates.min_price ?? currentItem.min_price;
                const newMaxPrice = updates.max_price ?? currentItem.max_price;
                
                const rangeValidation = this.validatePriceRange(newMinPrice, newMaxPrice);
                if (!rangeValidation.isValid) {
                    allErrors.push(...rangeValidation.errors);
                }
            }
            
            // If validation failed, return errors
            if (allErrors.length > 0) {
                return {
                    success: false,
                    errors: allErrors,
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                };
            }
            
            // Perform update
            const updated = await catalogRepository.updateItem(
                id,
                updates,
                changedBy,
                changeReason,
                ipAddress
            );
            
            if (!updated) {
                return {
                    success: false,
                    errors: ['Error al actualizar el producto']
                };
            }
            
            // Get updated item
            const updatedItem = await catalogRepository.getItemById(id);
            
            return {
                success: true,
                warnings: allWarnings.length > 0 ? allWarnings : undefined,
                item: updatedItem || undefined
            };
            
        } catch (error: any) {
            console.error('Error updating catalog item:', error);
            return {
                success: false,
                errors: [`Error interno: ${error.message}`]
            };
        }
    }
    
    /**
     * Create a new catalog item with validation
     */
    async createCatalogItem(
        item: CatalogItem,
        changedBy: string,
        changeReason?: string,
        ipAddress?: string
    ): Promise<{ success: boolean; errors?: string[]; warnings?: string[]; itemId?: number }> {
        try {
            const errors: string[] = [];
            const warnings: string[] = [];
            
            // Validate required fields
            if (!item.category_id) {
                errors.push('La categoría es requerida');
            }
            
            if (!item.capacity) {
                errors.push('La capacidad es requerida');
            }
            
            if (!item.capacity_gb || item.capacity_gb <= 0) {
                errors.push('La capacidad en GB debe ser mayor a 0');
            }
            
            // Validate price
            const priceValidation = this.validatePriceChange(item, item.price);
            if (!priceValidation.isValid) {
                errors.push(...priceValidation.errors);
            }
            if (priceValidation.warnings) {
                warnings.push(...priceValidation.warnings);
            }
            
            // Validate content count
            const countValidation = this.validateContentCount(item.content_count);
            if (!countValidation.isValid) {
                errors.push(...countValidation.errors);
            }
            
            // Check if item already exists
            const existing = await catalogRepository.getItem(item.category_id, item.capacity);
            if (existing) {
                errors.push(`Ya existe un producto ${item.category_id} con capacidad ${item.capacity}`);
            }
            
            if (errors.length > 0) {
                return {
                    success: false,
                    errors,
                    warnings: warnings.length > 0 ? warnings : undefined
                };
            }
            
            // Create item
            const itemId = await catalogRepository.createItem(item, changedBy, changeReason, ipAddress);
            
            return {
                success: true,
                itemId,
                warnings: warnings.length > 0 ? warnings : undefined
            };
            
        } catch (error: any) {
            console.error('Error creating catalog item:', error);
            return {
                success: false,
                errors: [`Error interno: ${error.message}`]
            };
        }
    }
    
    /**
     * Delete (deactivate) a catalog item
     */
    async deleteCatalogItem(
        id: number,
        changedBy: string,
        changeReason?: string,
        ipAddress?: string
    ): Promise<{ success: boolean; errors?: string[] }> {
        try {
            const deleted = await catalogRepository.deleteItem(id, changedBy, changeReason, ipAddress);
            
            if (!deleted) {
                return {
                    success: false,
                    errors: ['Producto no encontrado']
                };
            }
            
            return { success: true };
            
        } catch (error: any) {
            console.error('Error deleting catalog item:', error);
            return {
                success: false,
                errors: [`Error interno: ${error.message}`]
            };
        }
    }
    
    /**
     * Activate a catalog item
     */
    async activateCatalogItem(
        id: number,
        changedBy: string,
        changeReason?: string,
        ipAddress?: string
    ): Promise<{ success: boolean; errors?: string[] }> {
        try {
            const activated = await catalogRepository.activateItem(id, changedBy, changeReason, ipAddress);
            
            if (!activated) {
                return {
                    success: false,
                    errors: ['Producto no encontrado']
                };
            }
            
            return { success: true };
            
        } catch (error: any) {
            console.error('Error activating catalog item:', error);
            return {
                success: false,
                errors: [`Error interno: ${error.message}`]
            };
        }
    }
    
    /**
     * Get change history for an item
     */
    async getItemChangeHistory(itemId: number, limit: number = 50) {
        return catalogRepository.getItemChangeLogs(itemId, limit);
    }
    
    /**
     * Get change history for a category
     */
    async getCategoryChangeHistory(categoryId: string, limit: number = 100) {
        return catalogRepository.getCategoryChangeLogs(categoryId, limit);
    }
    
    /**
     * Get all change history
     */
    async getAllChangeHistory(limit: number = 200) {
        return catalogRepository.getAllChangeLogs(limit);
    }
}

// Export singleton instance
export const adminCatalogService = AdminCatalogService.getInstance();
