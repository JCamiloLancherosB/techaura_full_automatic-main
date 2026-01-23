/**
 * Catalog Seed Data
 * Shared constants for initial catalog data used in migrations and tests
 */

export const CATALOG_SEED_DATA = [
    // Music
    { 
        category_id: 'music', 
        capacity: '8GB', 
        capacity_gb: 8, 
        price: 54900, 
        content_count: 1400, 
        content_unit: 'canciones', 
        min_price: 40000, 
        max_price: 100000 
    },
    { 
        category_id: 'music', 
        capacity: '32GB', 
        capacity_gb: 32, 
        price: 84900, 
        content_count: 5000, 
        content_unit: 'canciones', 
        is_popular: true, 
        min_price: 60000, 
        max_price: 150000 
    },
    { 
        category_id: 'music', 
        capacity: '64GB', 
        capacity_gb: 64, 
        price: 119900, 
        content_count: 10000, 
        content_unit: 'canciones', 
        is_recommended: true, 
        min_price: 80000, 
        max_price: 200000 
    },
    { 
        category_id: 'music', 
        capacity: '128GB', 
        capacity_gb: 128, 
        price: 159900, 
        content_count: 25000, 
        content_unit: 'canciones', 
        min_price: 100000, 
        max_price: 250000 
    },
    
    // Videos
    { 
        category_id: 'videos', 
        capacity: '8GB', 
        capacity_gb: 8, 
        price: 54900, 
        content_count: 500, 
        content_unit: 'videos', 
        min_price: 40000, 
        max_price: 100000 
    },
    { 
        category_id: 'videos', 
        capacity: '32GB', 
        capacity_gb: 32, 
        price: 84900, 
        content_count: 1000, 
        content_unit: 'videos', 
        is_popular: true, 
        min_price: 60000, 
        max_price: 150000 
    },
    { 
        category_id: 'videos', 
        capacity: '64GB', 
        capacity_gb: 64, 
        price: 119900, 
        content_count: 2000, 
        content_unit: 'videos', 
        is_recommended: true, 
        min_price: 80000, 
        max_price: 200000 
    },
    { 
        category_id: 'videos', 
        capacity: '128GB', 
        capacity_gb: 128, 
        price: 159900, 
        content_count: 4000, 
        content_unit: 'videos', 
        min_price: 100000, 
        max_price: 250000 
    },
    
    // Movies
    { 
        category_id: 'movies', 
        capacity: '64GB', 
        capacity_gb: 64, 
        price: 119900, 
        content_count: 55, 
        content_unit: 'películas', 
        min_price: 80000, 
        max_price: 200000 
    },
    { 
        category_id: 'movies', 
        capacity: '128GB', 
        capacity_gb: 128, 
        price: 159900, 
        content_count: 120, 
        content_unit: 'películas', 
        is_recommended: true, 
        min_price: 100000, 
        max_price: 250000 
    },
    { 
        category_id: 'movies', 
        capacity: '256GB', 
        capacity_gb: 256, 
        price: 219900, 
        content_count: 250, 
        content_unit: 'películas', 
        min_price: 150000, 
        max_price: 350000 
    },
    { 
        category_id: 'movies', 
        capacity: '512GB', 
        capacity_gb: 512, 
        price: 319900, 
        content_count: 520, 
        content_unit: 'películas', 
        min_price: 200000, 
        max_price: 500000 
    }
];
