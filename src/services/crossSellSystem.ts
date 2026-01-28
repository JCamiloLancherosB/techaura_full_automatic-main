import { UserSession } from '../../types/global';

// ===== Tipos =====
export interface TechProduct {
  id: string;
  name: string;
  category: 'audio' | 'storage' | 'accessories' | 'cables' | 'power' | 'protection';
  price: number;
  description: string;
  compatibleWith: string[]; // ['music','videos','movies','documents']
  stock: number;
  discount?: number; // porcentaje 0-100
  image?: string;
  features: string[];
}

export interface CrossSellRecommendation {
  product: TechProduct;
  relevanceScore: number; // 0-100
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  discount?: number;
  bundlePrice?: number;
}

export interface CrossSellContext {
  // Dónde del embudo estamos ofreciendo
  stage:
    | 'afterCapacitySelected'
    | 'beforePayment'
    | 'highIntentNoConfirm'
    | 'postPurchase';

  // Si ya hay productos agregados para evitar duplicados
  alreadyAddedProductIds?: string[];

  // Tope de ofertas por mensaje para no abrumar
  maxItems?: number;

  // Forzar categorías si la UX lo requiere (ej: solo audio)
  forceCategories?: Array<TechProduct['category']>;
}

export class CrossSellSystem {
  private readonly TECH_PRODUCTS: TechProduct[] = [
    {
      id: 'AUD001',
      name: 'Audífonos Bluetooth Premium JBL',
      category: 'audio',
      price: 89900,
      description: 'Inalámbricos con cancelación de ruido, 30h de batería',
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
      description: 'Compactos con excelente calidad de sonido',
      compatibleWith: ['music', 'videos'],
      stock: 40,
      features: ['Cable reforzado', 'Almohadillas de silicona', 'Estuche incluido']
    },
    {
      id: 'AUD003',
      name: 'Parlante Bluetooth Portátil',
      category: 'audio',
      price: 129900,
      description: 'Resistente al agua con sonido 360°',
      compatibleWith: ['music', 'videos', 'movies'],
      stock: 15,
      discount: 10,
      features: ['IPX7', 'Sonido 360°', '20h batería', 'Power bank integrado']
    },
    {
      id: 'STO001',
      name: 'Memoria USB 3.0 Kingston 64GB',
      category: 'storage',
      price: 35900,
      description: 'USB adicional para respaldo o segunda colección',
      compatibleWith: ['music', 'videos', 'movies', 'documents'],
      stock: 50,
      features: ['USB 3.0', '100MB/s', 'Garantía 5 años']
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
      features: ['1TB', 'USB 3.0', 'Portátil', 'Backup automático']
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
      description: 'Alta velocidad para transferencias rápidas',
      compatibleWith: ['music', 'videos', 'movies', 'documents'],
      stock: 60,
      features: ['USB 3.0', '1.5 m', 'Trenzado reforzado', 'Garantía 2 años']
    },
    {
      id: 'CAB002',
      name: 'Cable Auxiliar 3.5mm Premium',
      category: 'cables',
      price: 12900,
      description: 'Cable de audio de alta fidelidad',
      compatibleWith: ['music', 'audio'],
      stock: 45,
      features: ['Conectores dorados', '1.2 m', 'Blindaje anti-interferencia']
    },
    {
      id: 'POW001',
      name: 'Cargador Rápido USB-C 20W',
      category: 'power',
      price: 34900,
      description: 'Carga rápida para todos tus dispositivos',
      compatibleWith: ['music', 'videos', 'movies', 'documents'],
      stock: 35,
      features: ['20W', 'USB-C', 'Protección sobrecarga', 'Compacto']
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
      features: ['Resistente al agua', 'Mosquetón', 'Compacto', 'Varios colores']
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

  // ===== API PRINCIPAL =====

  public generateRecommendations(session: UserSession, ctx?: CrossSellContext): CrossSellRecommendation[] {
    const contentType = (session as any).contentType || (session as any).customization?.selectedType;
    const buyingIntent = (session as any).buyingIntent ?? (session as any).aiAnalysis?.buyingIntent ?? 50;
    const capacity = (session as any).capacity; // '32GB' | '64GB' | '128GB'...
    const already = new Set(ctx?.alreadyAddedProductIds || []);
    const forcedCats = ctx?.forceCategories;

    // 1) Filtrar por compatibilidad y opcionalmente por categoría forzada
    const products = this.TECH_PRODUCTS.filter(p => {
      const compatible =
        !contentType ||
        p.compatibleWith.includes(contentType) ||
        p.compatibleWith.includes('music') ||
        p.compatibleWith.includes('videos') ||
        p.compatibleWith.includes('movies');
      const notRepeated = !already.has(p.id);
      const catOk = !forcedCats || forcedCats.includes(p.category);
      return compatible && notRepeated && catOk && p.stock > 0;
    });

    // 2) Scoring
    const scored = products
      .map(p => {
        const score = this.calculateRelevance(p, { contentType, capacity, buyingIntent });
        return { p, score };
      })
      .filter(x => x.score > 30) // umbral mínimo
      .sort((a, b) => b.score - a.score)
      .slice(0, ctx?.maxItems ?? 5);

    // 3) Construcción de recomendaciones
    const recs: CrossSellRecommendation[] = scored.map(({ p, score }) => ({
      product: p,
      relevanceScore: score,
      reason: this.generateReason(p, contentType),
      urgency: this.calculateUrgency(score, buyingIntent),
      discount: p.discount,
      bundlePrice: this.calculateBundlePrice(p)
    }));

    // 4) Ajustes por etapa del funnel (priorizar categorías según momento)
    if (ctx?.stage === 'afterCapacitySelected') {
      // justo después de elegir capacidad: accesorios y protección convierten muy bien
      return this.reorderByCategories(recs, ['protection', 'cables', 'accessories', 'audio', 'power', 'storage']);
    }
    if (ctx?.stage === 'beforePayment') {
      // en checkout: audio + power (valor percibido alto), luego protección
      return this.reorderByCategories(recs, ['audio', 'power', 'protection', 'cables', 'accessories', 'storage']);
    }
    if (ctx?.stage === 'highIntentNoConfirm') {
      // empuje suave: productos de ticket bajo primero
      return this.reorderByPriceAsc(recs);
    }
    if (ctx?.stage === 'postPurchase') {
      // up-sell: productos complementarios no redundantes
      return this.reorderByCategories(recs, ['audio', 'protection', 'cables', 'accessories', 'power', 'storage']).slice(0, 3);
    }

    return recs;
  }

  // ===== Helpers de ranking =====
  private reorderByCategories(recs: CrossSellRecommendation[], categories: Array<TechProduct['category']>) {
    const rank = new Map(categories.map((c, i) => [c, i]));
    return [...recs].sort((a, b) => {
      const ra = rank.get(a.product.category) ?? 999;
      const rb = rank.get(b.product.category) ?? 999;
      if (ra !== rb) return ra - rb;
      return b.relevanceScore - a.relevanceScore;
    });
  }

  private reorderByPriceAsc(recs: CrossSellRecommendation[]) {
    return [...recs].sort((a, b) => a.product.price - b.product.price);
    }

  // ===== Scoring y textos =====
  private calculateRelevance(
    product: TechProduct,
    params: { contentType?: string; capacity?: string; buyingIntent: number }
  ): number {
    let score = 50;

    if (params.contentType && product.compatibleWith.includes(params.contentType)) score += 20;

    if (params.contentType === 'music' || params.contentType === 'musica') {
      if (product.category === 'audio') score += 25;
    }
    if (params.contentType === 'videos' || params.contentType === 'movies' || params.contentType === 'peliculas') {
      if (product.category === 'audio') score += 15;
      if (product.category === 'storage') score += 10;
    }

    if (['128GB', '256GB', '512GB'].includes(params.capacity || '')) {
      if (['storage', 'protection'].includes(product.category)) score += 15;
    }

    if (params.buyingIntent > 70) score += 10;

    if (product.discount && product.discount > 0) score += product.discount / 2;

    if (product.stock < 10) score += 5;

    return Math.min(score, 100);
  }

  private generateReason(product: TechProduct, contentType?: string): string {
    const reasons: string[] = [];

    if (product.category === 'audio' && (contentType === 'music' || contentType === 'musica')) {
      reasons.push('Disfruta tu música con la mejor calidad');
    }
    if (product.category === 'storage') {
      reasons.push('Expande tu colección o crea un respaldo');
    }
    if (product.category === 'protection') {
      reasons.push('Protege tu USB de golpes y agua');
    }
    if (product.category === 'power') {
      reasons.push('No te quedes sin batería mientras disfrutas');
    }
    if (product.category === 'cables') {
      reasons.push('Transferencias más rápidas y estables');
    }
    if (product.category === 'accessories') {
      reasons.push('Mayor comodidad y organización');
    }

    if (product.discount && product.discount > 0) reasons.push(`-${product.discount}% HOY`);
    if (product.stock < 10) reasons.push(`Últimas ${product.stock} unidades`);

    if (!reasons.length) reasons.push('Complemento perfecto para tu compra');
    return reasons.join(' • ');
  }

  private calculateUrgency(relevanceScore: number, buyingIntent: number): 'high' | 'medium' | 'low' {
    const combined = (relevanceScore + buyingIntent) / 2;
    if (combined > 75) return 'high';
    if (combined > 50) return 'medium';
    return 'low';
  }

  private calculateBundlePrice(product: TechProduct): number {
    const base = product.price;
    const bundleDiscount = 0.10;
    if (product.discount) {
      const discounted = base * (1 - product.discount / 100);
      return Math.round(discounted * (1 - bundleDiscount));
    }
    return Math.round(base * (1 - bundleDiscount));
  }

  // ===== Render de mensajes =====
  public generateCrossSellMessage(recommendations: CrossSellRecommendation[]): string {
    if (!recommendations.length) return '';

    let msg = '\n\n🎁 *COMPLEMENTA TU COMPRA*\n';
    msg += '━━━━━━━━━━━━━━━━━━━━\n\n';

    recommendations.forEach((rec, i) => {
      const p = rec.product;
      const emoji = this.getCategoryEmoji(p.category);
      const idx = i + 1;
      const priceLine = `💰 $${p.price.toLocaleString('es-CO')}`;
      const bundleLine =
        rec.bundlePrice && rec.bundlePrice < p.price
          ? `🎉 Bundle: $${rec.bundlePrice.toLocaleString('es-CO')} (ahorras $${(p.price - rec.bundlePrice).toLocaleString('es-CO')})`
          : '';
      const discountLine = p.discount ? `🔥 ${p.discount}% OFF` : '';
      const urgency = rec.urgency === 'high' ? '⏰ Alta demanda' : rec.urgency === 'medium' ? '⚡ Oportunidad' : '✅ Disponible';

      msg += `${idx}) ${emoji} *${p.name}*\n`;
      msg += `   ${priceLine}${bundleLine ? ` • ${bundleLine}` : ''}${discountLine ? ` • ${discountLine}` : ''}\n`;
      msg += `   ✨ ${rec.reason}\n`;
      msg += `   ${urgency}\n\n`;
    });

    msg += '━━━━━━━━━━━━━━━━━━━━\n';
    msg += 'Responde con el número del producto para añadirlo, o escribe "continuar" para seguir con el pedido.';

    return msg;
  }

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

  // ===== Utilidades públicas adicionales =====
  public getProductById(productId: string): TechProduct | undefined {
    return this.TECH_PRODUCTS.find(p => p.id === productId);
  }

  public getProductsByCategory(category: TechProduct['category']): TechProduct[] {
    return this.TECH_PRODUCTS.filter(p => p.category === category);
  }

  public getAllProducts(): TechProduct[] {
    return [...this.TECH_PRODUCTS];
  }
}

// Singleton
export const crossSellSystem = new CrossSellSystem();
