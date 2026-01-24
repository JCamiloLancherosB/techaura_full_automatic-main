/**
 * RAG Context Retriever Service
 * 
 * Retrieves structured context BEFORE AI calls to prevent hallucinations:
 * - Catalog data (products, prices, capacities)
 * - Order status and history
 * - Customer journey stage
 * - Business rules
 * 
 * Part of PR-G2: RAG ligero implementation
 */

import { CatalogService, type Product, type CategoryId } from './CatalogService';
import { OrderStateManager, type OrderStatus } from './OrderStateManager';
import { businessDB } from '../mysql-database';
import type { UserSession } from '../../types/global';
import { unifiedLogger } from '../utils/unifiedLogger';

export interface CatalogContext {
    categories: {
        id: CategoryId;
        name: string;
        displayName: string;
        description: string;
        icon: string;
    }[];
    products: Product[];
    priceRanges: {
        music: { min: number; max: number };
        videos: { min: number; max: number };
        movies: { min: number; max: number };
    };
}

export interface OrderContext {
    hasActiveOrder: boolean;
    currentOrder?: {
        orderId: string;
        status: OrderStatus;
        category?: string;
        capacity?: string;
        preferences?: any;
        shippingInfo?: any;
        createdAt: Date;
    };
    orderHistory: {
        orderId: string;
        status: OrderStatus;
        category?: string;
        completedAt?: Date;
    }[];
}

export interface CustomerJourneyContext {
    stage: 'awareness' | 'interest' | 'consideration' | 'decision' | 'purchase' | 'post-purchase';
    indicators: {
        hasDiscussedPrice: boolean;
        hasSpecifiedPreferences: boolean;
        hasProvidedShipping: boolean;
        interactionCount: number;
        daysSinceFirstContact: number;
    };
}

export interface BusinessRulesContext {
    shipping: {
        isFree: boolean;
        estimatedDays: string;
        restrictions: string[];
    };
    warranties: {
        durationMonths: number;
        coverage: string[];
    };
    customization: {
        available: boolean;
        options: string[];
        additionalCost: number;
    };
    promotions: {
        active: boolean;
        description?: string;
        discountPercent?: number;
        validUntil?: Date;
    };
}

export interface RAGContext {
    catalog: CatalogContext;
    order: OrderContext;
    customerJourney: CustomerJourneyContext;
    businessRules: BusinessRulesContext;
    metadata: {
        retrievedAt: Date;
        phone: string;
    };
}

export class RAGContextRetriever {
    private static instance: RAGContextRetriever;
    private catalogService: CatalogService;
    private contextCache = new Map<string, { context: RAGContext; timestamp: number }>();
    private readonly CACHE_TTL = 60000; // 60 seconds

    private constructor() {
        this.catalogService = CatalogService.getInstance();
    }

    static getInstance(): RAGContextRetriever {
        if (!RAGContextRetriever.instance) {
            RAGContextRetriever.instance = new RAGContextRetriever();
        }
        return RAGContextRetriever.instance;
    }

    /**
     * Main method: Retrieve complete structured context for RAG
     */
    async retrieveContext(userSession: UserSession): Promise<RAGContext> {
        const startTime = Date.now();
        const phone = userSession.phone;

        try {
            // Check cache first
            const cached = this.getCachedContext(phone);
            if (cached) {
                unifiedLogger.debug('rag', 'Using cached RAG context', { phone });
                return cached;
            }

            unifiedLogger.info('rag', 'Retrieving fresh RAG context', { phone });

            // Retrieve all context in parallel for efficiency
            const [catalog, order, customerJourney, businessRules] = await Promise.all([
                this.retrieveCatalogContext(),
                this.retrieveOrderContext(phone),
                this.retrieveCustomerJourneyContext(userSession),
                this.retrieveBusinessRulesContext()
            ]);

            const context: RAGContext = {
                catalog,
                order,
                customerJourney,
                businessRules,
                metadata: {
                    retrievedAt: new Date(),
                    phone
                }
            };

            // Cache the context
            this.cacheContext(phone, context);

            const duration = Date.now() - startTime;
            unifiedLogger.info('rag', 'RAG context retrieved successfully', {
                phone,
                duration: `${duration}ms`,
                hasActiveOrder: order.hasActiveOrder,
                stage: customerJourney.stage
            });

            return context;

        } catch (error: any) {
            unifiedLogger.error('rag', 'Error retrieving RAG context', {
                phone,
                error: error.message
            });
            
            // Return minimal safe context on error
            return this.getMinimalSafeContext(phone);
        }
    }

    /**
     * Retrieve catalog context (products, prices, capacities)
     */
    private async retrieveCatalogContext(): Promise<CatalogContext> {
        try {
            const categories = this.catalogService.getAllCategories();
            const products: Product[] = [];

            // Get all products from all categories
            for (const category of categories) {
                const categoryProducts = await this.catalogService.getProductsByCategory(category.id);
                products.push(...categoryProducts);
            }

            // Calculate price ranges
            const musicProducts = products.filter(p => p.categoryId === 'music');
            const videosProducts = products.filter(p => p.categoryId === 'videos');
            const moviesProducts = products.filter(p => p.categoryId === 'movies');

            const priceRanges = {
                music: {
                    min: musicProducts.length > 0 ? Math.min(...musicProducts.map(p => p.price)) : 59900,
                    max: musicProducts.length > 0 ? Math.max(...musicProducts.map(p => p.price)) : 59900
                },
                videos: {
                    min: videosProducts.length > 0 ? Math.min(...videosProducts.map(p => p.price)) : 69900,
                    max: videosProducts.length > 0 ? Math.max(...videosProducts.map(p => p.price)) : 69900
                },
                movies: {
                    min: moviesProducts.length > 0 ? Math.min(...moviesProducts.map(p => p.price)) : 79900,
                    max: moviesProducts.length > 0 ? Math.max(...moviesProducts.map(p => p.price)) : 79900
                }
            };

            return {
                categories: categories.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    displayName: cat.displayName,
                    description: cat.description,
                    icon: cat.icon
                })),
                products,
                priceRanges
            };

        } catch (error: any) {
            unifiedLogger.error('rag', 'Error retrieving catalog context', { error: error.message });
            
            // Return minimal catalog with known prices
            return {
                categories: [
                    { id: 'music', name: 'music', displayName: 'USB Musical', description: 'Miles de canciones', icon: '🎵' },
                    { id: 'videos', name: 'videos', displayName: 'USB Videos', description: 'Videos de alta calidad', icon: '🎬' },
                    { id: 'movies', name: 'movies', displayName: 'USB Películas', description: 'Las mejores películas', icon: '🎥' }
                ],
                products: [],
                priceRanges: {
                    music: { min: 59900, max: 59900 },
                    videos: { min: 69900, max: 69900 },
                    movies: { min: 79900, max: 79900 }
                }
            };
        }
    }

    /**
     * Retrieve order context (current order, history)
     */
    private async retrieveOrderContext(phone: string): Promise<OrderContext> {
        try {
            // Query active orders
            const activeOrders = await businessDB
                .select('*')
                .from('orders')
                .where('phone', phone)
                .whereIn('status', ['NEEDS_INTENT', 'NEEDS_CAPACITY', 'NEEDS_PREFERENCES', 'NEEDS_SHIPPING', 'CONFIRMED', 'PROCESSING'])
                .orderBy('created_at', 'desc')
                .limit(1);

            const hasActiveOrder = activeOrders.length > 0;
            let currentOrder = undefined;

            if (hasActiveOrder) {
                const order = activeOrders[0];
                currentOrder = {
                    orderId: order.id,
                    status: order.status as OrderStatus,
                    category: order.category || order.product_type,
                    capacity: order.capacity,
                    preferences: order.preferences ? JSON.parse(order.preferences) : null,
                    shippingInfo: order.shipping_address ? JSON.parse(order.shipping_address) : null,
                    createdAt: new Date(order.created_at)
                };
            }

            // Query order history
            const historyOrders = await businessDB
                .select('id', 'status', 'category', 'product_type', 'completed_at')
                .from('orders')
                .where('phone', phone)
                .whereIn('status', ['COMPLETED', 'DELIVERED', 'CANCELLED'])
                .orderBy('completed_at', 'desc')
                .limit(5);

            const orderHistory = historyOrders.map((order: any) => ({
                orderId: order.id,
                status: order.status as OrderStatus,
                category: order.category || order.product_type,
                completedAt: order.completed_at ? new Date(order.completed_at) : undefined
            }));

            return {
                hasActiveOrder,
                currentOrder,
                orderHistory
            };

        } catch (error: any) {
            unifiedLogger.error('rag', 'Error retrieving order context', {
                phone,
                error: error.message
            });

            return {
                hasActiveOrder: false,
                orderHistory: []
            };
        }
    }

    /**
     * Retrieve customer journey context (stage, indicators)
     */
    private async retrieveCustomerJourneyContext(userSession: UserSession): Promise<CustomerJourneyContext> {
        try {
            const phone = userSession.phone;

            // Get interaction count
            const interactions = Array.isArray(userSession.interactions) ? userSession.interactions.length : 0;

            // Calculate days since first contact
            const firstContact = await businessDB
                .select('created_at')
                .from('user_sessions')
                .where('phone', phone)
                .orderBy('created_at', 'asc')
                .first();

            const daysSinceFirstContact = firstContact 
                ? Math.floor((Date.now() - new Date(firstContact.created_at).getTime()) / (1000 * 60 * 60 * 24))
                : 0;

            // Analyze session metadata for indicators
            const metadata = userSession.metadata || {};
            const hasDiscussedPrice = metadata.priceDiscussed || false;
            const hasSpecifiedPreferences = !!(userSession.preferences || metadata.preferences);
            const hasProvidedShipping = !!(metadata.shippingInfo || metadata.shipping);

            // Determine stage based on indicators
            let stage: CustomerJourneyContext['stage'] = 'awareness';
            
            if (hasProvidedShipping) {
                stage = 'purchase';
            } else if (hasSpecifiedPreferences && hasDiscussedPrice) {
                stage = 'decision';
            } else if (hasDiscussedPrice || hasSpecifiedPreferences) {
                stage = 'consideration';
            } else if (interactions > 2) {
                stage = 'interest';
            }

            return {
                stage,
                indicators: {
                    hasDiscussedPrice,
                    hasSpecifiedPreferences,
                    hasProvidedShipping,
                    interactionCount: interactions,
                    daysSinceFirstContact
                }
            };

        } catch (error: any) {
            unifiedLogger.error('rag', 'Error retrieving customer journey context', {
                error: error.message
            });

            return {
                stage: 'awareness',
                indicators: {
                    hasDiscussedPrice: false,
                    hasSpecifiedPreferences: false,
                    hasProvidedShipping: false,
                    interactionCount: 0,
                    daysSinceFirstContact: 0
                }
            };
        }
    }

    /**
     * Retrieve business rules context (shipping, warranties, promotions)
     */
    private async retrieveBusinessRulesContext(): Promise<BusinessRulesContext> {
        // These are relatively static, so we can return them directly
        // In the future, these could be stored in database and retrieved dynamically
        
        return {
            shipping: {
                isFree: true,
                estimatedDays: '2-3 días hábiles',
                restrictions: ['Cobertura nacional', 'Requiere dirección completa']
            },
            warranties: {
                durationMonths: 6,
                coverage: [
                    'Defectos de fabricación',
                    'Garantía de satisfacción',
                    'Reemplazo gratuito si falla'
                ]
            },
            customization: {
                available: true,
                options: [
                    'Selección de géneros musicales',
                    'Artistas específicos',
                    'Películas por categoría',
                    'Organización personalizada de archivos'
                ],
                additionalCost: 0
            },
            promotions: {
                active: false,
                // When active, add: description, discountPercent, validUntil
            }
        };
    }

    /**
     * Format context for AI prompt injection
     */
    formatContextForPrompt(context: RAGContext): string {
        const { catalog, order, customerJourney, businessRules } = context;

        let prompt = `
=== CONTEXTO ESTRUCTURADO (NO INVENTAR, SOLO USAR ESTOS DATOS) ===

📦 CATÁLOGO DISPONIBLE:
`;

        // Add catalog information
        prompt += `Categorías disponibles:\n`;
        for (const category of catalog.categories) {
            prompt += `- ${category.icon} ${category.displayName}: ${category.description}\n`;
        }

        prompt += `\nPrecios reales del catálogo:\n`;
        // Validate and format prices safely
        const formatPrice = (price: number, fallback: number): string => {
            const validPrice = !isFinite(price) || price <= 0 ? fallback : price;
            return validPrice.toLocaleString('es-CO');
        };
        prompt += `- 🎵 Música: desde $${formatPrice(catalog.priceRanges.music.min, 59900)}\n`;
        prompt += `- 🎬 Videos: desde $${formatPrice(catalog.priceRanges.videos.min, 69900)}\n`;
        prompt += `- 🎥 Películas: desde $${formatPrice(catalog.priceRanges.movies.min, 79900)}\n`;

        // Add order context if exists
        if (order.hasActiveOrder && order.currentOrder) {
            prompt += `\n📋 ORDEN ACTUAL DEL CLIENTE:
- ID de orden: ${order.currentOrder.orderId}
- Estado: ${order.currentOrder.status}
- Categoría: ${order.currentOrder.category || 'No especificada'}
- Capacidad: ${order.currentOrder.capacity || 'No especificada'}
`;
            if (order.currentOrder.preferences) {
                prompt += `- Preferencias: ${JSON.stringify(order.currentOrder.preferences)}\n`;
            }
        } else {
            prompt += `\n📋 ORDEN ACTUAL: El cliente NO tiene una orden activa en este momento.\n`;
        }

        // Add customer journey stage
        prompt += `\n🎯 ETAPA DEL CLIENTE: ${customerJourney.stage.toUpperCase()}
- Ha discutido precios: ${customerJourney.indicators.hasDiscussedPrice ? 'Sí' : 'No'}
- Ha especificado preferencias: ${customerJourney.indicators.hasSpecifiedPreferences ? 'Sí' : 'No'}
- Ha proporcionado info de envío: ${customerJourney.indicators.hasProvidedShipping ? 'Sí' : 'No'}
- Número de interacciones: ${customerJourney.indicators.interactionCount}
`;

        // Add business rules
        prompt += `\n📜 REGLAS DEL NEGOCIO:
✅ Envío: ${businessRules.shipping.isFree ? 'GRATIS' : 'Con costo'} - ${businessRules.shipping.estimatedDays}
✅ Garantía: ${businessRules.warranties.durationMonths} meses
✅ Personalización: ${businessRules.customization.available ? 'Disponible SIN COSTO adicional' : 'No disponible'}
`;

        if (businessRules.promotions.active) {
            prompt += `✅ Promoción activa: ${businessRules.promotions.description}\n`;
        }

        prompt += `\n⚠️ INSTRUCCIÓN CRÍTICA: USA ÚNICAMENTE los precios, estados de orden y reglas listados arriba. NO inventes ni asumas información que no esté en este contexto.\n`;

        return prompt;
    }

    /**
     * Cache context for performance
     */
    private cacheContext(phone: string, context: RAGContext): void {
        this.contextCache.set(phone, {
            context,
            timestamp: Date.now()
        });

        // Cleanup old cache entries if exceeding limit
        if (this.contextCache.size > 500) {
            // More efficient cleanup: remove oldest 20% of entries
            const entriesToRemove = Math.floor(this.contextCache.size * 0.2);
            let removed = 0;
            const cutoffTime = Date.now() - this.CACHE_TTL;
            
            // First pass: remove expired entries
            for (const [key, value] of this.contextCache.entries()) {
                if (value.timestamp < cutoffTime) {
                    this.contextCache.delete(key);
                    removed++;
                    if (removed >= entriesToRemove) break;
                }
            }
            
            // Second pass: if still need to remove more, remove oldest entries
            if (removed < entriesToRemove && this.contextCache.size > 500) {
                const entries = Array.from(this.contextCache.entries());
                entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
                
                for (let i = 0; i < entriesToRemove - removed && i < entries.length; i++) {
                    this.contextCache.delete(entries[i][0]);
                }
            }
        }
    }

    /**
     * Get cached context if still valid
     */
    private getCachedContext(phone: string): RAGContext | null {
        const cached = this.contextCache.get(phone);
        
        if (!cached) {
            return null;
        }

        const age = Date.now() - cached.timestamp;
        if (age > this.CACHE_TTL) {
            this.contextCache.delete(phone);
            return null;
        }

        return cached.context;
    }

    /**
     * Get minimal safe context on error
     */
    private getMinimalSafeContext(phone: string): RAGContext {
        return {
            catalog: {
                categories: [
                    { id: 'music', name: 'music', displayName: 'USB Musical', description: 'Miles de canciones', icon: '🎵' },
                    { id: 'videos', name: 'videos', displayName: 'USB Videos', description: 'Videos de alta calidad', icon: '🎬' },
                    { id: 'movies', name: 'movies', displayName: 'USB Películas', description: 'Las mejores películas', icon: '🎥' }
                ],
                products: [],
                priceRanges: {
                    music: { min: 59900, max: 59900 },
                    videos: { min: 69900, max: 69900 },
                    movies: { min: 79900, max: 79900 }
                }
            },
            order: {
                hasActiveOrder: false,
                orderHistory: []
            },
            customerJourney: {
                stage: 'awareness',
                indicators: {
                    hasDiscussedPrice: false,
                    hasSpecifiedPreferences: false,
                    hasProvidedShipping: false,
                    interactionCount: 0,
                    daysSinceFirstContact: 0
                }
            },
            businessRules: {
                shipping: {
                    isFree: true,
                    estimatedDays: '2-3 días hábiles',
                    restrictions: []
                },
                warranties: {
                    durationMonths: 6,
                    coverage: ['Garantía de satisfacción']
                },
                customization: {
                    available: true,
                    options: [],
                    additionalCost: 0
                },
                promotions: {
                    active: false
                }
            },
            metadata: {
                retrievedAt: new Date(),
                phone
            }
        };
    }

    /**
     * Clear cache for a specific user (useful after order completion)
     */
    clearCache(phone: string): void {
        this.contextCache.delete(phone);
        unifiedLogger.debug('rag', 'Cache cleared for user', { phone });
    }

    /**
     * Clear all cache
     */
    clearAllCache(): void {
        this.contextCache.clear();
        unifiedLogger.info('rag', 'All RAG cache cleared');
    }
}

// Export singleton instance
export const ragContextRetriever = RAGContextRetriever.getInstance();
