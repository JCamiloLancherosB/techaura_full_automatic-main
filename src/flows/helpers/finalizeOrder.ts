import { UserSession } from '../../../types/global';
import { ContentType } from '../../catalog/MatchingEngine';
import { businessDB } from '../../mysql-database';

// Local fallback for formatPrice (formats number as COP currency, no fractional digits)
const formatPrice = (value: number): string => {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `COP ${Math.round(value)}`;
  }
};

// Interfaces para el sistema de pedidos
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
}

export interface OrderExtras {
  secondUsb?: {
    capacity: string;
    price: number;
  };
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
  [key: string]: {
    basePrice: number;
    contentMultiplier: number;
    minContent: number;
    maxContent: number;
  };
}

// Precios y capacidades configuradas
const CAPACITY_PRICING: CapacityPricing = {
  '64GB': { basePrice: 119900, contentMultiplier: 1.0, minContent: 15, maxContent: 18 },
  '128GB': { basePrice: 159900, contentMultiplier: 1.8, minContent: 35, maxContent: 45 },
  '256GB': { basePrice: 229900, contentMultiplier: 3.2, minContent: 70, maxContent: 90 },
  '512GB': { basePrice: 349900, contentMultiplier: 6.0, minContent: 140, maxContent: 180 }
};

const CONTENT_TYPE_MULTIPLIERS: Record<ContentType, number> = {
  'movies': 1.0,
  'music': 0.7,
  'videos': 1.5,
  'series': 1.2,
  'documentaries': 0.9,
  'custom': 1.0
};

export class OrderFinalizer {
  private static instance: OrderFinalizer;

  private constructor() {}

  public static getInstance(): OrderFinalizer {
    if (!OrderFinalizer.instance) {
      OrderFinalizer.instance = new OrderFinalizer();
    }
    return OrderFinalizer.instance;
  }

  /**
   * Parsea datos de envío del texto del usuario
   */
  private parseShippingData(text: string): ShippingData {
    const parts = text.split(/[,|\n]/).map(p => p.trim()).filter(Boolean);
    
    // Extraer teléfono (formato colombiano)
    const phone = parts.find(p => /\d{10}/.test(p)) || '';
    
    // Remover teléfono para obtener otros datos
    const otherParts = parts.filter(p => p !== phone);
    
    return {
      name: otherParts[0] || 'Cliente',
      city: otherParts.length > 1 ? otherParts[1] : '',
      address: otherParts.slice(2).join(', '),
      phone
    };
  }

  /**
   * Calcula precio basado en capacidad y tipo de contenido
   */
  private calculatePrice(capacity: string, contentTypes: ContentType[]): number {
    const pricing = CAPACITY_PRICING[capacity];
    if (!pricing) throw new Error(`Capacidad no válida: ${capacity}`);

    // Calcular multiplicador promedio de tipos de contenido
    const avgMultiplier = contentTypes.reduce((sum, type) => 
      sum + CONTENT_TYPE_MULTIPLIERS[type], 0) / contentTypes.length;

    return Math.round(pricing.basePrice * avgMultiplier);
  }

  /**
   * Valida datos del pedido
   */
  private validateOrder(request: OrderRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.phoneNumber || request.phoneNumber.length < 10) {
      errors.push('Número de teléfono inválido');
    }

    if (!request.capacities || request.capacities.length === 0) {
      errors.push('Debe especificar al menos una capacidad');
    }

    if (!request.contentTypes || request.contentTypes.length === 0) {
      errors.push('Debe especificar al menos un tipo de contenido');
    }

    request.capacities.forEach(capacity => {
      if (!CAPACITY_PRICING[capacity]) {
        errors.push(`Capacidad no soportada: ${capacity}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Genera ID único de pedido
   */
  private generateOrderId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `ORD-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Estima fecha de entrega
   */
  private estimateDelivery(city: string): string {
    const majorCities = ['bogota', 'medellin', 'cali', 'barranquilla', 'cartagena'];
    const normalizedCity = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    const isMajorCity = majorCities.some(major => normalizedCity.includes(major));
    
    const deliveryDays = isMajorCity ? 1 : 3;
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + deliveryDays);
    
    return deliveryDate.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Crea items del pedido basados en capacidades y tipos de contenido
   */
  private createOrderItems(capacities: string[], contentTypes: ContentType[]): OrderItem[] {
    return capacities.map(capacity => {
      const price = this.calculatePrice(capacity, contentTypes);
      const pricing = CAPACITY_PRICING[capacity];
      
      return {
        capacity,
        contentType: contentTypes[0], // Tipo principal
        price,
        quantity: 1,
        description: `USB ${capacity} con ${contentTypes.join(' + ')} (${pricing.minContent}-${pricing.maxContent} items)`
      };
    });
  }

  /**
   * Aplica descuentos y promociones
   */
  private applyDiscounts(items: OrderItem[], extras?: OrderExtras): { finalItems: OrderItem[]; total: number; discount: number } {
    let total = items.reduce((sum, item) => sum + item.price, 0);
    let discount = 0;

    // Aplicar descuento de segunda USB
    if (extras?.secondUsb) {
      const secondUsbItem: OrderItem = {
        capacity: extras.secondUsb.capacity,
        contentType: 'music', // Default para segunda USB
        price: extras.secondUsb.price,
        quantity: 1,
        description: `Segunda USB ${extras.secondUsb.capacity} (-30% descuento)`
      };
      items.push(secondUsbItem);
      total += extras.secondUsb.price;
      discount += Math.round(CAPACITY_PRICING[extras.secondUsb.capacity].basePrice * 0.3);
    }

    // Aplicar descuento de upgrade si existe
    if (extras?.discountApplied) {
      discount += extras.discountApplied;
      total -= extras.discountApplied;
    }

    return { finalItems: items, total, discount };
  }

  /**
   * Guarda pedido en base de datos
   */
  private async saveOrderToDatabase(orderData: {
    orderId: string;
    phoneNumber: string;
    items: OrderItem[];
    shipping: ShippingData;
    total: number;
    discount: number;
    preferences?: OrderPreferences;
  }): Promise<boolean> {
    try {
      await businessDB.createOrder({
        id: orderData.orderId,
        customerPhone: orderData.phoneNumber,
        items: orderData.items,
        totalAmount: orderData.total,
        discountAmount: orderData.discount,
        shippingAddress: `${orderData.shipping.name} | ${orderData.shipping.city} | ${orderData.shipping.address}`,
        shippingPhone: orderData.shipping.phone,
        status: 'confirmed',
        preferences: orderData.preferences,
        createdAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error guardando pedido en BD:', error);
      return false;
    }
  }

  /**
   * Método principal para finalizar pedidos
   */
  public async finalizeOrder(request: OrderRequest): Promise<OrderResult> {
    try {
      // Validar pedido
      const validation = this.validateOrder(request);
      if (!validation.isValid && !request.forceConfirm) {
        return {
          success: false,
          orderId: '',
          total: 0,
          estimatedDelivery: '',
          updated: false,
          message: 'Datos del pedido inválidos',
          warnings: validation.errors
        };
      }

      // Parsear datos de envío
      const shipping = this.parseShippingData(request.shippingData);
      
      // Generar ID de pedido
      const orderId = request.existingOrderId || this.generateOrderId();
      
      // Crear items del pedido
      const orderItems = this.createOrderItems(request.capacities, request.contentTypes);
      
      // Aplicar descuentos
      const { finalItems, total, discount } = this.applyDiscounts(orderItems, request.extras);
      
      // Estimar entrega
      const estimatedDelivery = this.estimateDelivery(shipping.city);
      
      // Preparar preferencias
      const preferences: OrderPreferences = {
        ...request.overridePreferences,
        usbName: request.overridePreferences?.usbName || `USB Personalizada ${orderId}`
      };

      // Guardar en base de datos
      const saveResult = await this.saveOrderToDatabase({
        orderId,
        phoneNumber: request.phoneNumber,
        items: finalItems,
        shipping,
        total,
        discount,
        preferences
      });

      if (!saveResult) {
        throw new Error('Error al guardar el pedido en la base de datos');
      }

      return {
        success: true,
        orderId,
        total,
        estimatedDelivery,
        updated: !!request.existingOrderId,
        message: request.existingOrderId 
          ? 'Pedido actualizado exitosamente' 
          : 'Pedido confirmado exitosamente'
      };

    } catch (error) {
      console.error('Error en finalizeOrder:', error);
      
      return {
        success: false,
        orderId: '',
        total: 0,
        estimatedDelivery: '',
        updated: false,
        message: 'Error al procesar el pedido',
        warnings: [error instanceof Error ? error.message : 'Error desconocido']
      };
    }
  }

  /**
   * Obtiene resumen del pedido para confirmación
   */
  public getOrderSummary(orderId: string, items: OrderItem[], total: number): string[] {
    const summary: string[] = [
      `🆔 *Pedido:* ${orderId}`,
      '',
      '📦 *Items del pedido:*'
    ];

    items.forEach((item, index) => {
      summary.push(`${index + 1}. ${item.description} - ${formatPrice(item.price)}`);
    });

    summary.push(
      '',
      `💰 *Total:* ${formatPrice(total)}`,
      '📅 *Procesamiento:* 3-12 horas',
      '🚚 *Garantía:* 30 días',
      '',
      '✅ *Pedido confirmado y en proceso*'
    );

    return summary;
  }

  /**
   * Verifica stock disponible
   */
  public async checkStock(capacities: string[]): Promise<{ available: boolean; message: string }> {
    try {
      const stockInfo = await businessDB.getStockInfo();
      
      for (const capacity of capacities) {
        const stock = stockInfo[capacity] || 0;
        if (stock <= 0) {
          return {
            available: false,
            message: `❌ No hay stock disponible para capacidad ${capacity}`
          };
        }
        if (stock <= 2) {
          return {
            available: true,
            message: `⚠️ Stock limitado para ${capacity} (quedan ${stock})`
          };
        }
      }
      
      return {
        available: true,
        message: '✅ Stock disponible'
      };
    } catch (error) {
      return {
        available: true, // Asumir disponible en caso de error
        message: '⚠️ No se pudo verificar stock, continuando...'
      };
    }
  }
}

// Exportar instancia singleton
export const orderFinalizer = OrderFinalizer.getInstance();

// Función de conveniencia para uso directo
export const finalizeOrder = orderFinalizer.finalizeOrder.bind(orderFinalizer);
