import { UserSession } from '../../types/global';

// Type guards para validación segura de propiedades de UserSession

export function hasContentType(session: UserSession): session is UserSession & { 
    contentType: NonNullable<UserSession['contentType']> 
} {
    return session.contentType !== undefined && session.contentType !== null;
}

export function hasCapacity(session: UserSession): session is UserSession & { 
    capacity: NonNullable<UserSession['capacity']> 
} {
    return session.capacity !== undefined && session.capacity !== null;
}

export function hasCustomization(session: UserSession): session is UserSession & { 
    customization: NonNullable<UserSession['customization']> 
} {
    return session.customization !== undefined && session.customization !== null;
}

export function hasCustomerData(session: UserSession): session is UserSession & { 
    customerData: NonNullable<UserSession['customerData']> 
} {
    return session.customerData !== undefined && session.customerData !== null;
}

export function hasOrderId(session: UserSession): session is UserSession & { 
    orderId: NonNullable<UserSession['orderId']> 
} {
    return session.orderId !== undefined && session.orderId !== null;
}

export function hasPrice(session: UserSession): session is UserSession & { 
    price: NonNullable<UserSession['price']> 
} {
    return session.price !== undefined && session.price !== null;
}

// Función helper para verificar si el usuario está en proceso de compra
export function isInPurchaseFlow(session: UserSession): boolean {
    return hasContentType(session) || hasCapacity(session) || 
           ['option_selected', 'purchase_intent', 'customizing', 'checkout', 'closing'].includes(session.stage);
}

// Función helper para verificar si el pedido está completo
export function hasCompleteOrder(session: UserSession): boolean {
    return hasContentType(session) && 
           hasCapacity(session) && 
           hasPrice(session) && 
           hasCustomerData(session);
}

// Función helper para obtener el tipo de contenido de forma segura
export function getContentType(session: UserSession): string | null {
    if (hasContentType(session)) {
        return session.contentType;
    }
    return null;
}

// Función helper para obtener la capacidad de forma segura
export function getCapacity(session: UserSession): string | null {
    if (hasCapacity(session)) {
        return session.capacity;
    }
    return null;
}

// Función helper para obtener el precio de forma segura
export function getPrice(session: UserSession): number | null {
    if (hasPrice(session)) {
        return session.price;
    }
    return null;
}

// Función para verificar si el usuario tiene alta intención de compra
export function hasHighBuyingIntent(session: UserSession): boolean {
    return session.buyingIntent >= 70;
}

// Función para verificar si el usuario necesita seguimiento
export function needsFollowUp(session: UserSession): boolean {
    if (!session.lastFollowUp) return true;
    
    const hoursSinceLastFollowUp = (Date.now() - new Date(session.lastFollowUp).getTime()) / (1000 * 60 * 60);
    const spamCount = session.followUpSpamCount || 0;
    
    // No hacer seguimiento si ya se enviaron muchos mensajes
    if (spamCount >= 3) return false;
    
    // Seguimiento más frecuente para alta intención de compra
    if (hasHighBuyingIntent(session)) {
        return hoursSinceLastFollowUp >= 24;
    }
    
    // Seguimiento menos frecuente para baja intención
    return hoursSinceLastFollowUp >= 48;
}

// Nuevas funciones para gestionar el carrito

export function hasCartData(session: UserSession): session is UserSession & {
    cartData: NonNullable<UserSession['cartData']>;
} {
    return session.cartData !== undefined && session.cartData !== null;
}

export function getCartData(session: UserSession): UserSession['cartData'] | null {
    if (hasCartData(session)) {
        return session.cartData;
    }
    return null;
}

export function getCartTotal(session: UserSession): number {
    if (hasCartData(session)) {
        return session.cartData.items.reduce((total, item) => total + item.price * item.quantity, 0);
    }
    return 0;
}

export function getCartItemCount(session: UserSession): number {
    if (hasCartData(session)) {
        return session.cartData.items.reduce((count, item) => count + item.quantity, 0);
    }
    return 0;
}

export function hasSelectedProduct(session: UserSession): boolean {
    return hasCartData(session) && session.cartData.selectedProduct !== undefined;
}

export function getSelectedProduct(session: UserSession): UserSession['cartData']['selectedProduct'] | null {
    if (hasSelectedProduct(session)) {
        return session.cartData.selectedProduct;
    }
    return null;
}
