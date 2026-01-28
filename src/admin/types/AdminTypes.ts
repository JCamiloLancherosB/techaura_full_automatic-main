/**
 * Type definitions for Admin Panel
 * Comprehensive types for order management, content catalog, and analytics
 */

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
export type ContentType = 'music' | 'videos' | 'movies' | 'series' | 'mixed';
export type UsbCapacity = '8GB' | '32GB' | '64GB' | '128GB' | '256GB';

/**
 * USB Pricing item for a specific capacity
 */
export interface UsbPricingItem {
    capacity: UsbCapacity;
    capacityGb: number;
    price: number;
    contentCount: number;
    contentUnit: string;
    isActive: boolean;
    isPopular: boolean;
    isRecommended: boolean;
}

/**
 * USB Pricing structure for all content types
 * Single source of truth for USB product pricing
 */
export interface UsbPricing {
    music: UsbPricingItem[];
    videos: UsbPricingItem[];
    movies: UsbPricingItem[];
    lastUpdated?: Date;
}

/**
 * Admin Order Interface - Extended from existing order system
 */
export interface AdminOrder {
    id: string;
    orderNumber: string;
    customerPhone: string;
    customerName: string;
    status: OrderStatus;
    contentType: ContentType;
    capacity: UsbCapacity;

    // Content details
    customization: {
        genres?: string[];
        artists?: string[];
        videos?: string[];
        movies?: string[];
        series?: string[];
    };

    // Order metadata
    createdAt: Date;
    updatedAt: Date;
    confirmedAt?: Date;
    completedAt?: Date;

    // Admin notes and actions
    notes?: string;
    adminNotes?: string[];

    // Pricing
    price: number;
    paymentMethod?: string;

    // Processing info
    processingProgress?: number;
    estimatedCompletion?: Date;

    // Shipping information (from WhatsApp flow)
    shippingAddress?: string;
    shippingCity?: string;
    shippingDepartment?: string;
    shippingNeighborhood?: string;
    shippingPhone?: string;

    // Decrypted shipping data (for admin views only)
    shippingData?: {
        name?: string;
        phone?: string;
        address?: string;
        city?: string;
        department?: string;
        specialInstructions?: string;
    };
}

/**
 * Order validation result
 */
export interface OrderValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Required fields for order creation
 */
export interface RequiredOrderFields {
    customerPhone: string;
    customerName: string;
    contentType: ContentType;
    capacity: UsbCapacity;
    price: number;
}

/**
 * Optional fields for order updates
 */
export interface OptionalOrderFields {
    status?: OrderStatus;
    notes?: string;
    adminNotes?: string[];
    customization?: AdminOrder['customization'];
    shippingAddress?: string;
    shippingCity?: string;
    shippingDepartment?: string;
    shippingNeighborhood?: string;
    shippingPhone?: string;
    paymentMethod?: string;
    // Note: processingProgress and estimatedCompletion are intentionally not included here
    // as they should be managed internally by the system, not directly updated
}

/**
 * Content File in the catalog
 */
export interface ContentFile {
    id: string;
    name: string;
    path: string;
    category: ContentType;
    subcategory?: string; // genre, artist, etc.
    size: number;
    extension: string;
    lastModified: Date;
    metadata?: {
        title?: string;
        artist?: string;
        album?: string;
        duration?: number;
        resolution?: string;
        season?: number;
        episode?: number;
    };
}

/**
 * Content Folder Structure
 */
export interface ContentFolder {
    name: string;
    path: string;
    category: ContentType;
    fileCount: number;
    totalSize: number;
    subfolders: ContentFolder[];
    error?: string; // Error message if path is not accessible
}

/**
 * Analytics Dashboard Data
 */
export interface DashboardStats {
    // Order statistics
    totalOrders: number;
    pendingOrders: number;
    processingOrders: number;
    completedOrders: number;
    cancelledOrders: number;

    // Time-based metrics
    ordersToday: number;
    ordersThisWeek: number;
    ordersThisMonth: number;

    // Revenue
    totalRevenue: number;
    averageOrderValue: number;

    // Conversion metrics
    conversationCount: number;
    conversionRate: number;

    // Popular content
    topGenres: Array<{ name: string; count: number }>;
    topArtists: Array<{ name: string; count: number }>;
    topMovies: Array<{ name: string; count: number }>;

    // Top intents from aggregated analytics (optional)
    topIntents?: Array<{
        intent: string;
        totalCount: number;
        totalConversions: number;
        avgConversionRate: number;
        avgConfidence: number;
    }>;

    // Content type distribution
    contentDistribution: {
        music: number;
        videos: number;
        movies: number;
        series: number;
        mixed: number;
    };

    // Capacity distribution
    capacityDistribution: {
        '8GB': number;
        '32GB': number;
        '64GB': number;
        '128GB': number;
        '256GB': number;
    };
}

/**
 * Chatbot Analytics
 * 
 * Note on nullable metrics:
 * - `null` indicates "data not available" (e.g., no events to calculate from)
 * - `0` indicates "real zero" (e.g., query returned 0 results in the date range)
 * This distinction helps identify pipeline issues vs actual zero values.
 */
export interface ChatbotAnalytics {
    // Conversation metrics
    // null = no data available, 0 = real zero
    activeConversations: number;
    totalConversations: number;
    averageResponseTime: number | null;
    medianResponseTime?: number | null;
    p95ResponseTime?: number | null;
    conversionRate?: number | null;

    // Intent detection
    intents: Array<{
        name: string;
        count: number;
        successRate: number;
    }>;

    // Popular requests
    popularGenres: Array<{ genre: string; count: number }>;
    popularArtists: Array<{ artist: string; count: number }>;
    popularMovies: Array<{ title: string; count: number }>;

    // Timing metrics
    peakHours: Array<{ hour: number; count: number }>;

    // User engagement
    newUsers: number;
    returningUsers: number;

    // Followup metrics from aggregated analytics (optional)
    // null values indicate no data available vs 0 = real zero
    followupMetrics?: {
        totalFollowupsSent: number | null;
        totalFollowupsResponded: number | null;
        responseRate: number | null;
        followupOrders: number | null;
        followupRevenue: number | null;
        avgResponseTimeMinutes: number | null;
    };

    // Stage funnel analytics (for abandonment analysis)
    stageFunnel?: Array<{
        stage: string;
        questionsAsked: number;
        responsesReceived: number;
        abandonmentRate: number;
        conversionsToOrder: number;
    }>;

    // Blocked followup reasons (for OutboundGate visibility)
    blockedFollowups?: Array<{
        reason: string;
        blockedCount: number;
        uniquePhones: number;
    }>;
}

/**
 * Processing Queue Item
 */
export interface ProcessingQueueItem {
    jobId: string;
    orderId: string;
    orderNumber: string;
    customerPhone: string;
    customerName: string;
    status: 'queued' | 'processing' | 'completed' | 'error';
    progress: number;
    startedAt?: Date;
    estimatedCompletion?: Date;
    logs: ProcessingLog[];
}

/**
 * Processing Log Entry
 */
export interface ProcessingLog {
    timestamp: Date;
    level: 'info' | 'warning' | 'error';
    message: string;
    details?: any;
}

/**
 * USB Device Status
 */
export interface UsbDeviceStatus {
    devicePath: string;
    label: string;
    capacity: number;
    freeSpace: number;
    inUse: boolean;
    currentOrder?: string;
}

/**
 * Content Search Filters
 */
export interface ContentSearchFilter {
    category?: ContentType;
    subcategory?: string;
    searchTerm?: string;
    sortBy?: 'name' | 'date' | 'size';
    sortOrder?: 'asc' | 'desc';
}

/**
 * Order Filters
 */
export interface OrderFilter {
    status?: OrderStatus;
    contentType?: ContentType;
    dateFrom?: Date;
    dateTo?: Date;
    customerPhone?: string;
    searchTerm?: string;
}

/**
 * System Configuration
 */
export interface SystemConfig {
    // Chatbot settings
    chatbot: {
        autoResponseEnabled: boolean;
        responseDelay: number;
        maxConversationLength: number;
    };

    // Pricing
    pricing: {
        '8GB': number;
        '32GB': number;
        '64GB': number;
        '128GB': number;
        '256GB': number;
    };

    // Processing settings
    processing: {
        maxConcurrentJobs: number;
        autoProcessingEnabled: boolean;
        sourcePaths: {
            music: string;
            videos: string;
            movies: string;
            series: string;
        };
    };
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
    page: number;
    limit: number;
    total?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
