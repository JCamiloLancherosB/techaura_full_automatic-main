/**
 * Order Utilities
 * Handles order number generation and order data management
 */

import { businessDB } from '../mysql-database';

/**
 * Generates a unique order number with format: TEC-YYYY-XXXX
 * @returns Unique order number string
 */
export async function generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    let orderNumber = `TEC-${year}-${random}`;
    
    // Ensure uniqueness by checking database
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
        try {
            const existing = await businessDB.getOrder(orderNumber);
            if (!existing) {
                return orderNumber;
            }
            // If exists, generate new number with consistent format
            const newRandom = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            orderNumber = `TEC-${year}-${newRandom}`;
            attempts++;
        } catch (error) {
            console.error('Error checking order number uniqueness:', error);
            // If error checking, return generated number
            return orderNumber;
        }
    }
    
    return orderNumber;
}

/**
 * Validates order data completeness
 */
export interface OrderValidationResult {
    valid: boolean;
    missing: string[];
    errors: string[];
}

export function validateOrderData(data: any): OrderValidationResult {
    const missing: string[] = [];
    const errors: string[] = [];
    
    // Required fields
    if (!data.customerName || data.customerName.trim().length < 2) {
        missing.push('customerName');
    }
    
    if (!data.customerPhone || data.customerPhone.trim().length < 10) {
        missing.push('customerPhone');
    }
    
    if (!data.city || data.city.trim().length < 2) {
        missing.push('city');
    }
    
    if (!data.address || data.address.trim().length < 5) {
        missing.push('address');
    }
    
    if (!data.capacity) {
        missing.push('capacity');
    }
    
    if (!data.productType) {
        missing.push('productType');
    }
    
    if (!data.price || isNaN(parseFloat(data.price))) {
        missing.push('price');
    }
    
    // Optional but recommended
    if (!data.department) {
        errors.push('Department not provided - recommended for shipping');
    }
    
    return {
        valid: missing.length === 0,
        missing,
        errors
    };
}

/**
 * Formats order confirmation message
 */
export function formatOrderConfirmation(orderData: {
    orderNumber: string;
    customerName: string;
    productType: string;
    capacity: string;
    price: number;
    genres?: string[];
    city: string;
    department?: string;
    address: string;
    customerPhone: string;
}): string {
    const formatPrice = (price: number) => 
        new Intl.NumberFormat('es-CO', { 
            style: 'currency', 
            currency: 'COP', 
            minimumFractionDigits: 0 
        }).format(price);
    
    let message = `✅ *Pedido #${orderData.orderNumber} confirmado*\n\n`;
    
    // Product details
    message += `📦 *USB ${orderData.capacity} ${orderData.productType === 'music' ? 'Música' : orderData.productType === 'videos' ? 'Videos' : 'Películas'}*\n`;
    
    if (orderData.genres && orderData.genres.length > 0) {
        message += `🎵 Géneros: ${orderData.genres.join(', ')}\n`;
    }
    
    message += `💰 *${formatPrice(orderData.price)}* - Pago contraentrega\n\n`;
    
    // Customer details
    message += `📍 *Datos de entrega:*\n`;
    message += `👤 ${orderData.customerName}\n`;
    message += `📱 ${orderData.customerPhone}\n`;
    message += `🏠 ${orderData.city}${orderData.department ? `, ${orderData.department}` : ''}\n`;
    message += `   ${orderData.address}\n\n`;
    
    // Shipping info
    message += `🚚 *Envío GRATIS* - Llega en 2-3 días hábiles\n\n`;
    message += `✨ ¡Gracias por tu compra! Un asesor te contactará pronto.`;
    
    return message;
}

/**
 * Creates complete order data structure
 */
export function createOrderData(params: {
    orderNumber: string;
    phoneNumber: string;
    customerName: string;
    productType: 'music' | 'videos' | 'movies';
    capacity: string;
    price: number;
    customization?: any;
    preferences?: any;
    city: string;
    department?: string;
    address: string;
    customerPhone?: string;
    cedula?: string;
}) {
    return {
        orderNumber: params.orderNumber,
        phoneNumber: params.phoneNumber,
        customerName: params.customerName,
        productType: params.productType,
        capacity: params.capacity,
        price: params.price,
        customization: params.customization || {},
        preferences: params.preferences || {},
        processingStatus: 'pending' as const,
        shippingAddress: `${params.customerName} | ${params.city}${params.department ? ', ' + params.department : ''} | ${params.address}`,
        shippingPhone: params.customerPhone || params.phoneNumber,
        city: params.city,
        department: params.department,
        address: params.address,
        cedula: params.cedula,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}
