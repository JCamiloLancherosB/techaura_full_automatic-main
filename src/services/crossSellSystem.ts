// ✅ SISTEMA DE VENTAS CRUZADAS CON PRODUCTOS TECNOLÓGICOS
// src/services/crossSellSystem.ts

import { UserSession } from '../../types/global';

export interface TechProduct {
    id: string;
    name: string;
    category: 'audio' | 'storage' | 'accessories' | 'cables' | 'power' | 'protection';
    price: number;
    description: string;
    compatibleWith: string[];
    stock: number;
    discount?: number;
    image?: string;
    features: string[];
}

export interface CrossSellRecommendation {
    product: TechProduct;
    relevanceScore: number;
    reason: string;
    urgency: 'high' | 'medium' | 'low';
    discount?: number;
    bundlePrice?: number;
}

export class CrossSellSystem {
    
    private readonly TECH_PRODUCTS: TechProduct[] = [
        {
            id: 'AUD001',
            name: 'Audífonos Bluetooth Premium JBL',
            category: 'audio',
            price: 89900,
            description: 'Audífonos inalámbricos con cancelación de ruido, 30h de batería',
            compatibleWith: ['music', 'videos', 'movies'],
            stock: 25,
            discount: 15,
            features: ['Bluetooth 5.0', 'Cancelación de ruido', '30h batería', 'Micrófono integrado']
        },
        {
            id: 'AUD002',
            name: 'Audífonos In-Ear Sony',
            category: 'audio',
            price: 49900,
            description: 'Audífonos compactos con excelente calidad de sonido',
            compatibleWith: ['music', 'videos'],
            stock: 40,
            features: ['Cable reforzado', 'Almohadillas de silicona', 'Estuche incluido']
        },
        {
            id: 'AUD003',
            name: 'Parlante Bluetooth Portátil',
            category: 'audio',
            price: 129900,
            description: 'Parlante resistente al agua con sonido 360°',
            compatibleWith: ['music', 'videos', 'movies'],
            stock: 15,
            discount: 10,
            features: ['Resistente al agua IPX7', 'Sonido 360°', '20h batería', 'Power bank integrado']
        },
        {
            id: 'STO001',
            name: 'Memoria USB 3.0 Kingston 64GB',
            category: 'storage',
            price: 35900,
            description: 'USB adicional para respaldo o segunda colección',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 50,
            features: ['USB 3.0', 'Velocidad 100MB/s', 'Garantía 5 años']
        },
        {
            id: 'STO002',
            name: 'Disco Duro Externo 1TB',
            category: 'storage',
            price: 189900,
            description: 'Almacenamiento masivo para toda tu colección',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 20,
            discount: 20,
            features: ['1TB capacidad', 'USB 3.0', 'Portátil', 'Backup automático']
        },
        {
            id: 'ACC001',
            name: 'Hub USB 4 Puertos',
            category: 'accessories',
            price: 29900,
            description: 'Conecta múltiples dispositivos USB simultáneamente',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 30,
            features: ['4 puertos USB 3.0', 'Plug & Play', 'LED indicador', 'Compacto']
        },
        {
            id: 'CAB001',
            name: 'Cable USB-C a USB 3.0',
            category: 'cables',
            price: 15900,
            description: 'Cable de alta velocidad para transferencias rápidas',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 60,
            features: ['USB 3.0', '1.5 metros', 'Trenzado reforzado', 'Garantía 2 años']
        },
        {
            id: 'CAB002',
            name: 'Cable Auxiliar 3.5mm Premium',
            category: 'cables',
            price: 12900,
            description: 'Cable de audio de alta fidelidad',
            compatibleWith: ['music', 'audio'],
            stock: 45,
            features: ['Conectores dorados', '1.2 metros', 'Blindaje anti-interferencia']
        },
        {
            id: 'POW001',
            name: 'Cargador Rápido USB-C 20W',
            category: 'power',
            price: 34900,
            description: 'Carga rápida para todos tus dispositivos',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 35,
            features: ['20W carga rápida', 'USB-C', 'Protección sobrecarga', 'Compacto']
        },
        {
            id: 'POW002',
            name: 'Power Bank 20000mAh',
            category: 'power',
            price: 79900,
            description: 'Batería portátil de alta capacidad',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 18,
            discount: 12,
            features: ['20000mAh', 'Carga rápida', '2 puertos USB', 'Display LED']
        },
        {
            id: 'PRO001',
            name: 'Estuche Protector para USB',
            category: 'protection',
            price: 9900,
            description: 'Protege tu USB de golpes y agua',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 70,
            features: ['Resistente al agua', 'Mosquetón incluido', 'Compacto', 'Varios colores']
        },
        {
            id: 'PRO002',
            name: 'Organizador de Cables',
            category: 'protection',
            price: 14900,
            description: 'Mantén tus cables organizados y sin enredos',
            compatibleWith: ['music', 'videos', 'movies', 'documents'],
            stock: 55,
            features: ['6 compartimentos', 'Cierre elástico', 'Material premium', 'Portátil']
        }
    ];

    /**
     * ✅ GENERAR RECOMENDACIONES DE CROSS-SELL BASADAS EN EL PERFIL DEL USUARIO
     */
    public generateRecommendations(session: UserSession): CrossSellRecommendation[] {
        const recommendations: CrossSellRecommendation[] = [];
        const contentType = session.contentType || session.customization?.selectedType;
        const capacity = session.capacity;
        const buyingIntent = session.buyingIntent || 50;

        // Filtrar productos compatibles
        const compatibleProducts = this.TECH_PRODUCTS.filter(product => {
            if (!contentType) return true;
            return product.compatibleWith.includes(contentType) || 
                   product.compatibleWith.includes('music') ||
                   product.compatibleWith.includes('videos') ||
                   product.compatibleWith.includes('movies');
        });

        // Calcular relevancia para cada producto
        compatibleProducts.forEach(product => {
            const relevanceScore = this.calculateRelevance(product, session);
            
            if (relevanceScore > 30) { // Solo recomendar si la relevancia es > 30%
                const recommendation: CrossSellRecommendation = {
                    product,
                    relevanceScore,
                    reason: this.generateReason(product, session),
                    urgency: this.calculateUrgency(relevanceScore, buyingIntent),
                    discount: product.discount,
                    bundlePrice: this.calculateBundlePrice(product, session)
                };
                
                recommendations.push(recommendation);
            }
        });

        // Ordenar por relevancia
        recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Retornar top 5 recomendaciones
        return recommendations.slice(0, 5);
    }

    /**
     * ✅ CALCULAR RELEVANCIA DEL PRODUCTO
     */
    private calculateRelevance(product: TechProduct, session: UserSession): number {
        let score = 50; // Base score

        const contentType = session.contentType || session.customization?.selectedType;
        const capacity = session.capacity;
        const buyingIntent = session.buyingIntent || 50;

        // Bonus por tipo de contenido
        if (contentType) {
            if (product.compatibleWith.includes(contentType)) {
                score += 20;
            }
        }

        // Bonus por categoría según contenido
        if (contentType === 'music' || contentType === 'musica') {
            if (product.category === 'audio') score += 25;
        }

        if (contentType === 'videos' || contentType === 'movies' || contentType === 'peliculas') {
            if (product.category === 'audio') score += 15;
            if (product.category === 'storage') score += 10;
        }

        // Bonus por capacidad grande (más probable que necesite accesorios)
        if (capacity === '128GB' || capacity === '256GB' || capacity === '512GB') {
            if (product.category === 'storage' || product.category === 'protection') {
                score += 15;
            }
        }

        // Bonus por buying intent alto
        if (buyingIntent > 70) {
            score += 10;
        }

        // Bonus por descuento
        if (product.discount && product.discount > 0) {
            score += product.discount / 2;
        }

        // Bonus por stock bajo (urgencia)
        if (product.stock < 10) {
            score += 5;
        }

        return Math.min(score, 100);
    }

    /**
     * ✅ GENERAR RAZÓN DE RECOMENDACIÓN
     */
    private generateReason(product: TechProduct, session: UserSession): string {
        const contentType = session.contentType || session.customization?.selectedType;
        const reasons: string[] = [];

        if (product.category === 'audio' && (contentType === 'music' || contentType === 'musica')) {
            reasons.push('Perfecto para disfrutar tu música con la mejor calidad');
        }

        if (product.category === 'storage') {
            reasons.push('Ideal para expandir tu colección o hacer respaldos');
        }

        if (product.category === 'protection') {
            reasons.push('Protege tu inversión de golpes y daños');
        }

        if (product.discount && product.discount > 0) {
            reasons.push(`¡${product.discount}% de descuento especial!`);
        }

        if (product.stock < 10) {
            reasons.push(`¡Solo quedan ${product.stock} unidades!`);
        }

        if (reasons.length === 0) {
            reasons.push('Complemento perfecto para tu compra');
        }

        return reasons.join(' • ');
    }

    /**
     * ✅ CALCULAR URGENCIA
     */
    private calculateUrgency(relevanceScore: number, buyingIntent: number): 'high' | 'medium' | 'low' {
        const combinedScore = (relevanceScore + buyingIntent) / 2;
        
        if (combinedScore > 75) return 'high';
        if (combinedScore > 50) return 'medium';
        return 'low';
    }

    /**
     * ✅ CALCULAR PRECIO DE BUNDLE
     */
    private calculateBundlePrice(product: TechProduct, session: UserSession): number {
        const basePrice = product.price;
        const bundleDiscount = 0.10; // 10% descuento adicional en bundle
        
        if (product.discount) {
            const discountedPrice = basePrice * (1 - product.discount / 100);
            return Math.round(discountedPrice * (1 - bundleDiscount));
        }
        
        return Math.round(basePrice * (1 - bundleDiscount));
    }

    /**
     * ✅ GENERAR MENSAJE DE CROSS-SELL
     */
    public generateCrossSellMessage(recommendations: CrossSellRecommendation[]): string {
        if (recommendations.length === 0) {
            return '';
        }

        let message = '\n\n🎁 *COMPLEMENTA TU COMPRA*\n';
        message += '━━━━━━━━━━━━━━━━━━━━\n\n';

        recommendations.forEach((rec, index) => {
            const product = rec.product;
            const emoji = this.getCategoryEmoji(product.category);
            
            message += `${emoji} *${product.name}*\n`;
            message += `   💰 Precio: $${product.price.toLocaleString()}\n`;
            
            if (rec.bundlePrice && rec.bundlePrice < product.price) {
                const savings = product.price - rec.bundlePrice;
                message += `   🎉 En bundle: $${rec.bundlePrice.toLocaleString()} (Ahorras $${savings.toLocaleString()})\n`;
            }
            
            if (product.discount) {
                message += `   🔥 ${product.discount}% OFF\n`;
            }
            
            message += `   ✨ ${rec.reason}\n`;
            
            if (index < recommendations.length - 1) {
                message += '\n';
            }
        });

        message += '\n━━━━━━━━━━━━━━━━━━━━\n';
        message += '💬 Responde con el número del producto que te interesa\n';
        message += 'o escribe "continuar" para finalizar tu pedido';

        return message;
    }

    /**
     * ✅ OBTENER EMOJI POR CATEGORÍA
     */
    private getCategoryEmoji(category: string): string {
        const emojis: Record<string, string> = {
            audio: '🎧',
            storage: '💾',
            accessories: '🔌',
            cables: '🔗',
            power: '🔋',
            protection: '🛡️'
        };
        return emojis[category] || '📦';
    }

    /**
     * ✅ OBTENER PRODUCTO POR ID
     */
    public getProductById(productId: string): TechProduct | undefined {
        return this.TECH_PRODUCTS.find(p => p.id === productId);
    }

    /**
     * ✅ BUSCAR PRODUCTOS POR CATEGORÍA
     */
    public getProductsByCategory(category: string): TechProduct[] {
        return this.TECH_PRODUCTS.filter(p => p.category === category);
    }

    /**
     * ✅ OBTENER TODOS LOS PRODUCTOS
     */
    public getAllProducts(): TechProduct[] {
        return [...this.TECH_PRODUCTS];
    }
}

// Exportar instancia singleton
export const crossSellSystem = new CrossSellSystem();
