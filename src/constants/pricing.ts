/**
 * Centralized Pricing Configuration
 * Single source of truth for all product pricing
 */

export interface PricingOption {
    songs?: number;
    videos?: number;
    movies?: number;
    price: number;
}

export interface PricingConfig {
    music: Record<string, PricingOption>;
    videos: Record<string, PricingOption>;
    movies: Record<string, PricingOption>;
}

/**
 * Official pricing structure for all USB products
 * Updated: 2024 - Consistent across entire system
 */
export const PRICING: PricingConfig = {
    music: {
        '8GB': {
            songs: 1400,
            price: 54900
        },
        '32GB': {
            songs: 5000,
            price: 84900
        },
        '64GB': {
            songs: 10000,
            price: 119900
        },
        '128GB': {
            songs: 25000,
            price: 159900
        }
    },
    videos: {
        '8GB': {
            videos: 260,
            price: 54900
        },
        '32GB': {
            videos: 1000,
            price: 84900
        },
        '64GB': {
            videos: 2000,
            price: 119900
        },
        '128GB': {
            videos: 4000,
            price: 159900
        }
    },
    movies: {
        '64GB': {
            movies: 55,
            price: 119900
        },
        '128GB': {
            movies: 120,
            price: 159900
        },
        '256GB': {
            movies: 250,
            price: 219900
        },
        '512GB': {
            movies: 520,
            price: 319900
        }
    }
};

/**
 * Get price for a specific product type and capacity
 */
export function getPrice(productType: 'music' | 'videos' | 'movies', capacity: string): number {
    const pricing = PRICING[productType];
    if (!pricing || !pricing[capacity]) {
        console.warn(`No pricing found for ${productType} ${capacity}`);
        return 0;
    }
    return pricing[capacity].price;
}

export interface CapacityInfo {
    count: number;
    type: string;
}

/**
 * Get capacity info (songs/videos/movies count)
 */
export function getCapacityInfo(productType: 'music' | 'videos' | 'movies', capacity: string): CapacityInfo | null {
    const pricing = PRICING[productType];
    if (!pricing || !pricing[capacity]) {
        return null;
    }

    const option = pricing[capacity];
    if (option.songs) {
        return { count: option.songs, type: 'canciones' };
    }
    if (option.videos) {
        return { count: option.videos, type: 'videos' };
    }
    if (option.movies) {
        return { count: option.movies, type: 'películas' };
    }
    return null;
}

/**
 * Format price in Colombian Pesos
 */
export function formatPrice(price: number): string {
    return `$${price.toLocaleString('es-CO')}`;
}

/**
 * Get all available capacities for a product type
 */
export function getAvailableCapacities(productType: 'music' | 'videos' | 'movies'): string[] {
    if (!PRICING[productType]) {
        console.warn(`Invalid product type: ${productType}`);
        return [];
    }
    return Object.keys(PRICING[productType]);
}
