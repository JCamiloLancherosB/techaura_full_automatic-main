/**
 * Data Normalization Constants and Utilities
 * 
 * Single source of truth for valid values and normalization mappings
 * to reduce inconsistencies in processing_status, capacity, and contentType
 */

// ============================================
// VALID VALUES (Canonical/Authorized)
// ============================================

/**
 * Valid order statuses - these are the ONLY statuses allowed in the system
 */
export const VALID_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'completed', 'cancelled'] as const;
export type OrderStatus = typeof VALID_ORDER_STATUSES[number];

/**
 * Valid processing statuses (DB column) - maps to order statuses for compatibility
 */
export const VALID_PROCESSING_STATUSES = ['pending', 'processing', 'completed', 'error', 'failed'] as const;
export type ProcessingStatus = typeof VALID_PROCESSING_STATUSES[number];

/**
 * Valid USB capacities
 */
export const VALID_CAPACITIES = ['8GB', '32GB', '64GB', '128GB', '256GB'] as const;
export type UsbCapacity = typeof VALID_CAPACITIES[number];

/**
 * Valid content types
 */
export const VALID_CONTENT_TYPES = ['music', 'videos', 'movies', 'series', 'mixed'] as const;
export type ContentType = typeof VALID_CONTENT_TYPES[number];

// ============================================
// NORMALIZATION MAPS
// ============================================

/**
 * Maps various status values (including typos, Spanish translations, aliases) to canonical status
 * Returns undefined for completely invalid values
 */
export const STATUS_NORMALIZATION_MAP: Record<string, OrderStatus> = {
    // English canonical
    'pending': 'pending',
    'confirmed': 'confirmed',
    'processing': 'processing',
    'completed': 'completed',
    'cancelled': 'cancelled',
    
    // Spanish translations
    'pendiente': 'pending',
    'confirmado': 'confirmed',
    'procesando': 'processing',
    'en_proceso': 'processing',
    'completado': 'completed',
    'cancelado': 'cancelled',
    
    // Common typos and variations
    'peding': 'pending',
    'pendig': 'pending',
    'confimed': 'confirmed',
    'confirmd': 'confirmed',
    'procesing': 'processing',
    'proccessing': 'processing',
    'complted': 'completed',
    'complet': 'completed',
    'canceld': 'cancelled',
    'canceled': 'cancelled',
    
    // DB processing_status values mapping
    'error': 'cancelled',
    'failed': 'cancelled',
};

/**
 * Maps various capacity values to canonical capacity
 */
export const CAPACITY_NORMALIZATION_MAP: Record<string, UsbCapacity> = {
    // Canonical values
    '8GB': '8GB',
    '32GB': '32GB',
    '64GB': '64GB',
    '128GB': '128GB',
    '256GB': '256GB',
    
    // Lowercase variations
    '8gb': '8GB',
    '32gb': '32GB',
    '64gb': '64GB',
    '128gb': '128GB',
    '256gb': '256GB',
    
    // Without 'GB' suffix
    '8': '8GB',
    '32': '32GB',
    '64': '64GB',
    '128': '128GB',
    '256': '256GB',
    
    // With spaces
    '8 GB': '8GB',
    '32 GB': '32GB',
    '64 GB': '64GB',
    '128 GB': '128GB',
    '256 GB': '256GB',
    
    // Common typos
    '8g': '8GB',
    '32g': '32GB',
    '64g': '64GB',
    '128g': '128GB',
    '256g': '256GB',
    '8 g': '8GB',
    '32 g': '32GB',
    '64 g': '64GB',
    '128 g': '128GB',
    '256 g': '256GB',
};

/**
 * Maps various content type values to canonical content type
 */
export const CONTENT_TYPE_NORMALIZATION_MAP: Record<string, ContentType> = {
    // Canonical values
    'music': 'music',
    'videos': 'videos',
    'movies': 'movies',
    'series': 'series',
    'mixed': 'mixed',
    
    // Spanish translations
    'musica': 'music',
    'música': 'music',
    'video': 'videos',
    'pelicula': 'movies',
    'película': 'movies',
    'peliculas': 'movies',
    'películas': 'movies',
    'serie': 'series',
    'mixto': 'mixed',
    
    // Common variations
    'music_usb': 'music',
    'musicusb': 'music',
    'video_usb': 'videos',
    'videousb': 'videos',
    'movie': 'movies',
    'films': 'movies',
    'film': 'movies',
    'tv_series': 'series',
    'tvseries': 'series',
    'tv': 'series',
    'all': 'mixed',
    'combo': 'mixed',
    'custom': 'mixed',
};

// ============================================
// NORMALIZATION FUNCTIONS
// ============================================

/**
 * Normalize a status value to a canonical OrderStatus
 * Returns 'pending' as default for invalid values (safe fallback)
 */
export function normalizeStatus(value: any): OrderStatus {
    if (!value) return 'pending';
    
    const normalized = String(value).toLowerCase().trim();
    const mapped = STATUS_NORMALIZATION_MAP[normalized];
    
    if (mapped) return mapped;
    
    // Log unknown status for debugging
    console.warn(`[DataNormalization] Unknown status value: "${value}", defaulting to 'pending'`);
    return 'pending';
}

/**
 * Normalize a capacity value to a canonical UsbCapacity
 * Returns '32GB' as default for invalid values (most common capacity)
 */
export function normalizeCapacity(value: any): UsbCapacity {
    if (!value) return '32GB';
    
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '');
    
    // Check direct mapping
    const mapped = CAPACITY_NORMALIZATION_MAP[normalized];
    if (mapped) return mapped;
    
    // Check original value in case normalization map has case-sensitive entries
    const mappedOriginal = CAPACITY_NORMALIZATION_MAP[String(value).trim()];
    if (mappedOriginal) return mappedOriginal;
    
    // Try to extract numeric value and match
    const numericMatch = normalized.match(/(\d+)/);
    if (numericMatch) {
        const numericValue = numericMatch[1];
        const numericMapped = CAPACITY_NORMALIZATION_MAP[numericValue];
        if (numericMapped) return numericMapped;
    }
    
    // Log unknown capacity for debugging
    console.warn(`[DataNormalization] Unknown capacity value: "${value}", defaulting to '32GB'`);
    return '32GB';
}

/**
 * Normalize a content type value to a canonical ContentType
 * Returns 'music' as default for invalid values (most common type)
 */
export function normalizeContentType(value: any): ContentType {
    if (!value) return 'music';
    
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '_');
    
    // Check direct mapping
    const mapped = CONTENT_TYPE_NORMALIZATION_MAP[normalized];
    if (mapped) return mapped;
    
    // Check without underscores
    const withoutUnderscores = normalized.replace(/_/g, '');
    const mappedNoUnderscores = CONTENT_TYPE_NORMALIZATION_MAP[withoutUnderscores];
    if (mappedNoUnderscores) return mappedNoUnderscores;
    
    // Log unknown content type for debugging
    console.warn(`[DataNormalization] Unknown contentType value: "${value}", defaulting to 'music'`);
    return 'music';
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if a status value is valid (can be normalized to a known status)
 */
export function isValidStatus(value: any): boolean {
    if (!value) return false;
    const normalized = String(value).toLowerCase().trim();
    return STATUS_NORMALIZATION_MAP.hasOwnProperty(normalized);
}

/**
 * Check if a capacity value is valid (can be normalized to a known capacity)
 */
export function isValidCapacity(value: any): boolean {
    if (!value) return false;
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '');
    
    if (CAPACITY_NORMALIZATION_MAP.hasOwnProperty(normalized)) return true;
    if (CAPACITY_NORMALIZATION_MAP.hasOwnProperty(String(value).trim())) return true;
    
    // Check numeric extraction
    const numericMatch = normalized.match(/(\d+)/);
    if (numericMatch) {
        return CAPACITY_NORMALIZATION_MAP.hasOwnProperty(numericMatch[1]);
    }
    
    return false;
}

/**
 * Check if a content type value is valid (can be normalized to a known type)
 */
export function isValidContentType(value: any): boolean {
    if (!value) return false;
    const normalized = String(value).toLowerCase().trim().replace(/\s+/g, '_');
    
    if (CONTENT_TYPE_NORMALIZATION_MAP.hasOwnProperty(normalized)) return true;
    
    const withoutUnderscores = normalized.replace(/_/g, '');
    return CONTENT_TYPE_NORMALIZATION_MAP.hasOwnProperty(withoutUnderscores);
}

/**
 * Validate and normalize all order data fields
 * Returns normalized values and validation errors
 */
export function validateAndNormalizeOrderData(data: {
    status?: any;
    capacity?: any;
    contentType?: any;
}): {
    normalized: {
        status: OrderStatus;
        capacity: UsbCapacity;
        contentType: ContentType;
    };
    warnings: string[];
    originalValues: {
        status?: any;
        capacity?: any;
        contentType?: any;
    };
} {
    const warnings: string[] = [];
    const originalValues = { ...data };
    
    // Track if values needed normalization
    if (data.status && !isValidStatus(data.status)) {
        warnings.push(`Status "${data.status}" was normalized to a valid value`);
    }
    if (data.capacity && !isValidCapacity(data.capacity)) {
        warnings.push(`Capacity "${data.capacity}" was normalized to a valid value`);
    }
    if (data.contentType && !isValidContentType(data.contentType)) {
        warnings.push(`ContentType "${data.contentType}" was normalized to a valid value`);
    }
    
    return {
        normalized: {
            status: normalizeStatus(data.status),
            capacity: normalizeCapacity(data.capacity),
            contentType: normalizeContentType(data.contentType),
        },
        warnings,
        originalValues,
    };
}
