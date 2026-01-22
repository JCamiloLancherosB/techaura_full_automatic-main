/**
 * Unified Product Catalog Service (SSOT)
 * Single source of truth for categories, capacities, prices, promos, inclusions, and restrictions
 */

import { PRICING, PricingOption, getPrice as legacyGetPrice, formatPrice, getCapacityInfo } from '../constants/pricing';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type CategoryId = 'music' | 'videos' | 'movies';

export interface Category {
    id: CategoryId;
    name: string;
    displayName: string;
    description: string;
    icon: string;
}

export interface Product {
    id: string;
    categoryId: CategoryId;
    capacity: string;
    capacityGb: number;
    price: number;
    content: {
        count: number;
        unit: string; // 'canciones', 'videos', 'películas'
    };
    inclusions: string[];
    restrictions?: string[];
    promos?: string[];
    popular?: boolean;
    recommended?: boolean;
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings?: string[];
}

// ============================================================================
// Catalog Data (Single Source of Truth)
// ============================================================================

const CATEGORIES: Record<CategoryId, Category> = {
    music: {
        id: 'music',
        name: 'music',
        displayName: 'USB Musical',
        description: 'Miles de canciones de todos los géneros musicales',
        icon: '🎵'
    },
    videos: {
        id: 'videos',
        name: 'videos',
        displayName: 'USB Videos',
        description: 'Colección de videos de alta calidad',
        icon: '🎬'
    },
    movies: {
        id: 'movies',
        name: 'movies',
        displayName: 'USB Películas',
        description: 'Las mejores películas en un solo dispositivo',
        icon: '🎥'
    }
};

const COMMON_INCLUSIONS = [
    'Contenido personalizado a tu gusto',
    'Envío gratis a domicilio',
    'Garantía de satisfacción',
    'Soporte técnico'
];

const COMMON_RESTRICTIONS = [
    'Disponibilidad sujeta a stock',
    'Tiempo de preparación: 2-3 días hábiles'
];

// ============================================================================
// CatalogService Class
// ============================================================================

export class CatalogService {
    private static instance: CatalogService;

    private constructor() {}

    public static getInstance(): CatalogService {
        if (!CatalogService.instance) {
            CatalogService.instance = new CatalogService();
        }
        return CatalogService.instance;
    }

    /**
     * Get all available product categories
     */
    public getCategories(): Category[] {
        return Object.values(CATEGORIES);
    }

    /**
     * Get a specific category by ID
     */
    public getCategory(categoryId: CategoryId): Category | null {
        return CATEGORIES[categoryId] || null;
    }

    /**
     * Get all products for a specific category
     */
    public getProductsByCategory(categoryId: CategoryId): Product[] {
        const category = CATEGORIES[categoryId];
        if (!category) {
            console.warn(`[CatalogService] Invalid category: ${categoryId}`);
            return [];
        }

        const pricingData = PRICING[categoryId];
        if (!pricingData) {
            console.warn(`[CatalogService] No pricing data for category: ${categoryId}`);
            return [];
        }

        const products: Product[] = [];
        
        for (const [capacityKey, pricingOption] of Object.entries(pricingData)) {
            const capacityGb = parseInt(capacityKey.replace('GB', ''));
            const capacityInfo = getCapacityInfo(categoryId, capacityKey);
            
            if (!capacityInfo) continue;

            products.push({
                id: `${categoryId}_${capacityKey.toLowerCase()}`,
                categoryId,
                capacity: capacityKey,
                capacityGb,
                price: pricingOption.price,
                content: {
                    count: capacityInfo.count,
                    unit: capacityInfo.type
                },
                inclusions: COMMON_INCLUSIONS,
                restrictions: COMMON_RESTRICTIONS,
                popular: this.isPopularCapacity(capacityKey),
                recommended: this.isRecommendedCapacity(categoryId, capacityKey)
            });
        }

        return products.sort((a, b) => a.capacityGb - b.capacityGb);
    }

    /**
     * Get price for a specific product configuration
     * @param categoryId - Product category (music, videos, movies)
     * @param capacityGb - Capacity in GB (as number or string like "32GB")
     * @param variant - Optional variant (not currently used, for future extensions)
     */
    public getPrice(categoryId: CategoryId, capacityGb: string | number, variant?: string): number {
        // Normalize capacity to string format (e.g., "32GB")
        const capacity = typeof capacityGb === 'number' 
            ? `${capacityGb}GB` 
            : capacityGb.toUpperCase().includes('GB') 
                ? capacityGb.toUpperCase() 
                : `${capacityGb}GB`;

        // Use the centralized pricing function
        const price = legacyGetPrice(categoryId, capacity);

        if (price === 0) {
            console.warn(`[CatalogService] No price found for ${categoryId} ${capacity}`);
        }

        return price;
    }

    /**
     * Get formatted price string
     */
    public getFormattedPrice(categoryId: CategoryId, capacityGb: string | number, variant?: string): string {
        const price = this.getPrice(categoryId, capacityGb, variant);
        return formatPrice(price);
    }

    /**
     * Validate a product selection
     */
    public validateSelection(categoryId: CategoryId, capacityGb: string | number): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate category
        if (!CATEGORIES[categoryId]) {
            errors.push(`Categoría inválida: ${categoryId}`);
        }

        // Normalize capacity
        const capacity = typeof capacityGb === 'number' 
            ? `${capacityGb}GB` 
            : capacityGb.toUpperCase().includes('GB') 
                ? capacityGb.toUpperCase() 
                : `${capacityGb}GB`;

        // Validate capacity exists for category
        const pricingData = PRICING[categoryId];
        if (pricingData && !pricingData[capacity]) {
            errors.push(`Capacidad no disponible: ${capacity} para categoría ${categoryId}`);
            
            // Suggest available capacities
            const availableCapacities = Object.keys(pricingData).join(', ');
            warnings.push(`Capacidades disponibles: ${availableCapacities}`);
        }

        // Check if price is valid
        if (errors.length === 0) {
            const price = this.getPrice(categoryId, capacityGb);
            if (price === 0) {
                errors.push(`No se pudo determinar el precio para ${categoryId} ${capacity}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * Get available capacities for a category
     */
    public getAvailableCapacities(categoryId: CategoryId): string[] {
        const pricingData = PRICING[categoryId];
        if (!pricingData) {
            console.warn(`[CatalogService] Invalid category: ${categoryId}`);
            return [];
        }
        return Object.keys(pricingData);
    }

    /**
     * Get detailed product information
     */
    public getProduct(categoryId: CategoryId, capacityGb: string | number): Product | null {
        const products = this.getProductsByCategory(categoryId);
        const capacity = typeof capacityGb === 'number' 
            ? `${capacityGb}GB` 
            : capacityGb.toUpperCase().includes('GB') 
                ? capacityGb.toUpperCase() 
                : `${capacityGb}GB`;
        
        return products.find(p => p.capacity === capacity) || null;
    }

    /**
     * Check if capacity is marked as popular (32GB typically)
     */
    private isPopularCapacity(capacity: string): boolean {
        return capacity === '32GB';
    }

    /**
     * Check if capacity is recommended for a category
     */
    private isRecommendedCapacity(categoryId: CategoryId, capacity: string): boolean {
        // 64GB is typically recommended as best value
        return capacity === '64GB';
    }

    /**
     * Get all products across all categories (for admin/reporting)
     */
    public getAllProducts(): Product[] {
        const allProducts: Product[] = [];
        for (const categoryId of Object.keys(CATEGORIES) as CategoryId[]) {
            allProducts.push(...this.getProductsByCategory(categoryId));
        }
        return allProducts;
    }

    /**
     * Search products by criteria
     */
    public searchProducts(criteria: {
        categoryId?: CategoryId;
        minPrice?: number;
        maxPrice?: number;
        minCapacity?: number;
        maxCapacity?: number;
    }): Product[] {
        let products = this.getAllProducts();

        if (criteria.categoryId) {
            products = products.filter(p => p.categoryId === criteria.categoryId);
        }

        if (criteria.minPrice !== undefined) {
            products = products.filter(p => p.price >= criteria.minPrice!);
        }

        if (criteria.maxPrice !== undefined) {
            products = products.filter(p => p.price <= criteria.maxPrice!);
        }

        if (criteria.minCapacity !== undefined) {
            products = products.filter(p => p.capacityGb >= criteria.minCapacity!);
        }

        if (criteria.maxCapacity !== undefined) {
            products = products.filter(p => p.capacityGb <= criteria.maxCapacity!);
        }

        return products;
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const catalogService = CatalogService.getInstance();

// ============================================================================
// Helper Functions (for backward compatibility)
// ============================================================================

/**
 * Get price for a product (convenience function)
 */
export function getCatalogPrice(categoryId: CategoryId, capacityGb: string | number): number {
    return catalogService.getPrice(categoryId, capacityGb);
}

/**
 * Get formatted price (convenience function)
 */
export function getCatalogFormattedPrice(categoryId: CategoryId, capacityGb: string | number): string {
    return catalogService.getFormattedPrice(categoryId, capacityGb);
}

/**
 * Validate selection (convenience function)
 */
export function validateCatalogSelection(categoryId: CategoryId, capacityGb: string | number): ValidationResult {
    return catalogService.validateSelection(categoryId, capacityGb);
}
