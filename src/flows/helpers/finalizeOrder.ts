import { UserSession } from '../../../types/global';
import { ContentType } from '../../catalog/MatchingEngine';
import { businessDB } from '../../mysql-database';
import { catalogService } from '../../services/CatalogService';

// ✅ Utilidad local de precio COP
const formatPrice = (value: number): string => {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `COP ${Math.round(value)}`;
  }
};

// ===== Tipos =====
export interface OrderItem {
  capacity: string;
  contentType: ContentType;
  price: number;
  quantity: number;
  description: string;
}

export interface ShippingData {
  name: string;
  phone: string;
  city: string;
  address: string;
  specialInstructions?: string;
}

export interface OrderPreferences {
  genres?: string[];
  artists?: string[];
  titles?: string[];
  moods?: string[];
  usbName?: string;
  // campos enriquecidos (snapshot)
  [key: string]: any;
}

export interface OrderExtras {
  secondUsb?: { capacity: string; price: number; };
  finalPrice: number;
  discountApplied?: number;
  promoCode?: string;
}

export interface OrderRequest {
  phoneNumber: string;
  capacities: string[];
  contentTypes: ContentType[];
  shippingData: string;
  overridePreferences?: OrderPreferences;
  forceConfirm?: boolean;
  existingOrderId?: string;
  extras?: OrderExtras;
}

export interface OrderResult {
  success: boolean;
  orderId: string;
  total: number;
  estimatedDelivery: string;
  updated: boolean;
  message?: string;
  warnings?: string[];
}

export interface CapacityPricing {
  [key: string]: { basePrice: number; contentMultiplier: number; minContent: number; maxContent: number; };
}

// ✅ Build pricing table from CatalogService for movies (which have custom pricing logic)
const buildCapacityPricing = (): CapacityPricing => {
  const movieProducts = catalogService.getProductsByCategory('movies');
  const pricing: CapacityPricing = {};
  
  movieProducts.forEach(product => {
    // Calculate content range based on capacity
    const minContent = Math.floor(product.content.count * 0.27);
    const maxContent = Math.floor(product.content.count * 0.35);
    
    pricing[product.capacity] = {
      basePrice: product.price,
      contentMultiplier: product.capacityGb / 64, // Normalize to 64GB
      minContent,
      maxContent
    };
  });
  
  return pricing;
};

const CAPACITY_PRICING: CapacityPricing = buildCapacityPricing();

const CONTENT_TYPE_MULTIPLIERS: Record<ContentType, number> = {
  movies: 1.0,
  music: 0.7,
  videos: 1.5,
  series: 1.2,
  documentaries: 0.9,
  custom: 1.0
};

export class OrderFinalizer {
  private static instance: OrderFinalizer;
  private constructor() {}
  public static getInstance(): OrderFinalizer {
    if (!OrderFinalizer.instance) OrderFinalizer.instance = new OrderFinalizer();
    return OrderFinalizer.instance;
  }

  // ✅ Normalización de teléfono para CO (prefijo 57)
  private normalizePhoneForCO(phone: string): string {
    const cleaned = (phone || '').replace(/[^\d+]/g, '');
    if (/^\d{10}$/.test(cleaned)) return '57' + cleaned;
    if (/^(\+?57)\d{10}$/.test(cleaned)) return cleaned.replace(/^\+/, '');
    return cleaned;
  }

  // ✅ Parseo robusto de envío con notas e indicaciones
  private parseShippingData(text: string): ShippingData {
    const parts = (text || '').split(/[,|\n]/).map(p => p.trim()).filter(Boolean);
    const phoneMatch = (text.match(/\b\d{10}\b/) || [])[0] || '';
    const phone = this.normalizePhoneForCO(phoneMatch || '');
    const cleaned = parts.filter(p => !p.includes(phoneMatch));

    const name = cleaned[0] || 'Cliente';
    const city = cleaned[1] || '';
    let address = cleaned.slice(2).join(', ');

    let specialInstructions: string | undefined;
    const notesMatch = text.match(/(nota[s]?:|indicaciones:|comentario[s]?:)\s*(.*)$/i);
    if (notesMatch && notesMatch[2]) {
      specialInstructions = notesMatch[2].trim();
    } else if (/#\w+/.test(text)) {
      specialInstructions = (text.match(/#\w[\w\s\-.,:]*/g) || []).join(' ');
    }

    return { name, phone, city, address, specialInstructions };
  }

  // ✅ Precio según capacidad y tipo (promedio de tipos)
  private calculatePrice(capacity: string, contentTypes: ContentType[]): number {
    const pricing = CAPACITY_PRICING[capacity];
    if (!pricing) throw new Error(`Capacidad no válida: ${capacity}`);
    const validTypes = (contentTypes || []).filter(t => CONTENT_TYPE_MULTIPLIERS[t] != null);
    const types = validTypes.length ? validTypes : ['movies'];
    const avgMultiplier = types.reduce((sum, t) => sum + CONTENT_TYPE_MULTIPLIERS[t], 0) / types.length;
    return Math.round(pricing.basePrice * avgMultiplier);
  }

  // ✅ Validación fuerte
  private validateOrder(request: OrderRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.phoneNumber || !/^\+?\d{10,13}$/.test(request.phoneNumber.replace(/[^\d+]/g, '')))
      errors.push('Número de teléfono inválido');

    if (!Array.isArray(request.capacities) || request.capacities.length === 0)
      errors.push('Debe especificar al menos una capacidad');

    if (!Array.isArray(request.contentTypes) || request.contentTypes.length === 0)
      errors.push('Debe especificar al menos un tipo de contenido');

    for (const c of request.capacities) if (!CAPACITY_PRICING[c]) errors.push(`Capacidad no soportada: ${c}`);

    return { isValid: errors.length === 0, errors };
  }

  private generateOrderId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 7);
    return `ORD-${timestamp}-${random}`.toUpperCase();
  }

  private estimateDelivery(city: string): string {
    const majorCities = ['bogota','medellin','cali','barranquilla','cartagena'];
    const normalized = (city || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isMajor = majorCities.some(c => normalized.includes(c));
    const days = isMajor ? 1 : 3;
    const dt = new Date(); dt.setDate(dt.getDate() + days);
    return dt.toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  }

  private createOrderItems(capacities: string[], contentTypes: ContentType[]): OrderItem[] {
    return (capacities || []).map(capacity => {
      const price = this.calculatePrice(capacity, contentTypes);
      const cfg = CAPACITY_PRICING[capacity];
      return {
        capacity,
        contentType: contentTypes[0] || 'movies',
        price,
        quantity: 1,
        description: `USB ${capacity} con ${contentTypes.join(' + ')} (${cfg.minContent}-${cfg.maxContent} items)`
      };
    });
  }

  // ✅ Descuentos coherentes con tu promo (-30% segunda) y upgrades (descuento explícito)
  private applyDiscounts(items: OrderItem[], extras?: OrderExtras): { finalItems: OrderItem[]; total: number; discount: number } {
    let total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    let discount = 0;

    if (extras?.secondUsb) {
      const secondBase = CAPACITY_PRICING[extras.secondUsb.capacity]?.basePrice || extras.secondUsb.price;
      const refPrice = extras.secondUsb.price; // ya viene con -30% aplicado en tus flujos
      const secondItem: OrderItem = {
        capacity: extras.secondUsb.capacity,
        contentType: 'music', // por defecto
        price: refPrice,
        quantity: 1,
        description: `Segunda USB ${extras.secondUsb.capacity} (-30%)`
      };
      items.push(secondItem);
      total += refPrice;
      discount += Math.round(secondBase * 0.3);
    }

    if (extras?.discountApplied) {
      discount += Math.max(0, Math.round(extras.discountApplied));
      total = Math.max(0, total - Math.max(0, Math.round(extras.discountApplied)));
    }

    return { finalItems: items, total, discount };
  }

  // 🧩 Persistencia en BD + Analytics
  private async saveOrderToDatabase(params: {
    orderId: string;
    phoneNumber: string;
    items: OrderItem[];
    shipping: ShippingData;
    total: number;
    discount: number;
    preferences?: OrderPreferences;
    status: 'pending' | 'processing';
  }): Promise<boolean> {
    try {
      await businessDB.createOrder({
        id: params.orderId,
        customerPhone: params.phoneNumber,
        items: params.items,
        totalAmount: params.total,
        discountAmount: params.discount,
        shippingAddress: `${params.shipping.name} | ${params.shipping.city} | ${params.shipping.address}`,
        shippingPhone: params.shipping.phone,
        status: params.status,
        preferences: params.preferences,
        createdAt: new Date()
      });
      // Analytics: evento 'order_created'
      try {
        await businessDB.saveAnalyticsEvent(
          params.phoneNumber,
          'order_created',
          { orderId: params.orderId, total: params.total, items: params.items.length, status: params.status }
        );
      } catch {}
      return true;
    } catch (e) {
      console.error('Error guardando pedido en BD:', e);
      return false;
    }
  }

  // ===== API pública =====
  public async finalizeOrder(request: OrderRequest): Promise<OrderResult> {
    try {
      // Normalizar teléfono de entrada
      request.phoneNumber = this.normalizePhoneForCO(request.phoneNumber);

      const validation = this.validateOrder(request);
      if (!validation.isValid && !request.forceConfirm) {
        return { success: false, orderId: '', total: 0, estimatedDelivery: '', updated: false, message: 'Datos del pedido inválidos', warnings: validation.errors };
      }

      // Verificar stock anticipadamente
      const stockCheck = await this.checkStock(request.capacities);
      const warnings: string[] = [];
      if (!stockCheck.available) {
        return { success: false, orderId: '', total: 0, estimatedDelivery: '', updated: false, message: stockCheck.message, warnings: [stockCheck.message] };
      } else if (stockCheck.message.includes('Stock limitado')) {
        warnings.push(stockCheck.message);
      }

      const shipping = this.parseShippingData(request.shippingData);
      if (!shipping.phone) {
        return { success: false, orderId: '', total: 0, estimatedDelivery: '', updated: false, message: 'Datos de envío incompletos (teléfono requerido)', warnings: ['Incluye tu número de celular de 10 dígitos.'] };
      }

      const orderId = request.existingOrderId || this.generateOrderId();
      let items = this.createOrderItems(request.capacities, request.contentTypes);

      const applied = this.applyDiscounts(items, request.extras);
      items = applied.finalItems;

      // Tolerancia para total enviado desde el flujo (si aplica)
      let finalTotal = applied.total;
      const tolerance = Math.round(applied.total * 0.15); // 15% tolerancia
      if (request.extras?.finalPrice && Math.abs(request.extras.finalPrice - applied.total) <= tolerance) {
        finalTotal = request.extras.finalPrice;
      }

      const estimatedDelivery = this.estimateDelivery(shipping.city);

      // Preferencias enriquecidas (snapshot)
      const preferences: OrderPreferences = {
        ...request.overridePreferences,
        usbName: request.overridePreferences?.usbName || `USB Personalizada ${orderId}`,
        ...(shipping.specialInstructions ? { specialInstructions: shipping.specialInstructions } : {}),
        ...(request.capacities?.length ? { capacities: request.capacities } : {}),
        ...(request.contentTypes?.length ? { contentTypes: request.contentTypes } : {}),
        ...(request.extras?.promoCode ? { promoCode: request.extras.promoCode } : {})
      };

      // Estado según confirmación
      const status: 'pending' | 'processing' = request.forceConfirm ? 'processing' : 'pending';

      // Idempotencia básica si llega existingOrderId
      if (request.existingOrderId) {
        try {
          await businessDB.updateOrderStatus(request.existingOrderId, status);
          await businessDB.saveAnalyticsEvent(request.phoneNumber, 'order_updated', { orderId: request.existingOrderId, status });
        } catch {}
      }

      // Guardar en BD
      const saved = await this.saveOrderToDatabase({
        orderId,
        phoneNumber: request.phoneNumber,
        items,
        shipping,
        total: finalTotal,
        discount: applied.discount,
        preferences,
        status
      });

      if (!saved) throw new Error('No se pudo guardar el pedido');

            // Encolar ProcessingJobs por cada USB solicitada
      try {
        const { MatchingEngine } = await import('../../catalog/MatchingEngine').catch(() => ({ MatchingEngine: null as any }));
        for (const it of items) {
          const planId = MatchingEngine && typeof MatchingEngine.planFor === 'function'
            ? MatchingEngine.planFor({ contentTypes: [it.contentType], capacities: [it.capacity], preferences })
            : `${it.contentType}:${it.capacity}`;

          const capNum = (it.capacity || '').replace(/[^0-9]/g, '');
          const volumeLabel = `TA-${String(orderId).replace(/[^A-Z0-9]/gi,'').slice(-6)}-${capNum}G`;

          if (typeof (businessDB as any).insertProcessingJob === 'function') {
            await (businessDB as any).insertProcessingJob({
              order_id: orderId,
              usb_capacity: it.capacity,
              content_plan_id: planId,
              preferences,
              volume_label: volumeLabel,
              status: 'pending',
              created_at: new Date()
            });
          }
        }
      } catch (enqueueErr) {
        console.warn('⚠️ No se pudo encolar jobs de procesamiento automáticamente:', enqueueErr);
      }

      return {
        success: true,
        orderId,
        total: finalTotal,
        estimatedDelivery,
        updated: !!request.existingOrderId,
        message: request.existingOrderId ? 'Pedido actualizado exitosamente' : 'Pedido confirmado exitosamente',
        warnings: warnings.length ? warnings : undefined
      };

    } catch (error: any) {
      console.error('Error en finalizeOrder:', error);
      // Log a BD
      try {
        await businessDB.logError({
          type: 'finalize_order_error',
          error: error?.message || String(error),
          stack: error?.stack,
          timestamp: new Date()
        });
      } catch {}
      return {
        success: false,
        orderId: '',
        total: 0,
        estimatedDelivery: '',
        updated: false,
        message: 'Error al procesar el pedido',
        warnings: [error?.message || 'Error desconocido']
      };
    }
  }

  // Mensaje resumen compacto y persuasivo
    public getOrderSummary(orderId: string, items: OrderItem[], total: number): string[] {
    const lines: string[] = [];
    lines.push('🆔 Pedido: ' + orderId, '', '📦 Items:');
    items.forEach((it, i) => {
      const promoTag = /Segunda USB/.test(it.description) ? ' (-30%)' : '';
      lines.push(`${i + 1}. ${it.description}${promoTag} — ${formatPrice(it.price)}`);
    });
    lines.push(
      '',
      `💰 Total: ${formatPrice(total)}`,
      '⏱️ Procesamiento: 3–12 horas',
      '🚚 Garantía: 30 días',
      '',
      '✅ Confirmado y en proceso'
    );
    return [lines.join('\n')];
  }

  // Verificación de stock con fallback
  public async checkStock(capacities: string[]): Promise<{ available: boolean; message: string }> {
    try {
      const stockInfo = await businessDB.getStockInfo();
      for (const c of capacities) {
        const stock = stockInfo?.[c] ?? 0;
        if (stock <= 0) return { available: false, message: `❌ Sin stock para ${c}` };
        if (stock <= 2) return { available: true, message: `⚠️ Stock limitado para ${c} (quedan ${stock})` };
      }
      return { available: true, message: '✅ Stock disponible' };
    } catch {
      return { available: true, message: '⚠️ No se pudo verificar stock, continuamos.' };
    }
  }
}

export const orderFinalizer = OrderFinalizer.getInstance();
export const finalizeOrder = orderFinalizer.finalizeOrder.bind(orderFinalizer);
