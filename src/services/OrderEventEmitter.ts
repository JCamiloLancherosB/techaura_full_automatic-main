// src/services/OrderEventEmitter.ts
// Event emitter for order workflow events that trigger notifications

import { notificadorService } from './NotificadorService';
import { OrderNotificationEvent, OrderNotificationContext } from '../../types/notificador';
import { unifiedLogger } from '../utils/unifiedLogger';

/**
 * Order Event Emitter
 * Emits order workflow events to the Notificador service
 */
export class OrderEventEmitter {
  
  /**
   * Emit order created event
   */
  async onOrderCreated(
    orderId: string,
    customerPhone: string,
    customerName?: string,
    customerEmail?: string,
    orderData?: any
  ): Promise<void> {
    try {
      unifiedLogger.info('order-events', 'Order created event', { orderId, customerPhone });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.ORDER_CREATED,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'orderFlow'
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      unifiedLogger.error('order-events', 'Error in onOrderCreated', error);
      // Don't throw - notification failures shouldn't break order flow
    }
  }

  /**
   * Emit payment confirmed event
   */
  async onPaymentConfirmed(
    orderId: string,
    customerPhone: string,
    customerName?: string,
    customerEmail?: string,
    orderData?: any
  ): Promise<void> {
    try {
      unifiedLogger.info('order-events', 'Payment confirmed event', { orderId, customerPhone });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.PAYMENT_CONFIRMED,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData,
        metadata: {
          timestamp: new Date().toISOString(),
          paymentMethod: orderData?.paymentMethod,
          amount: orderData?.total
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      unifiedLogger.error('order-events', 'Error in onPaymentConfirmed', error);
    }
  }

  /**
   * Emit order status changed event
   */
  async onStatusChanged(
    orderId: string,
    customerPhone: string,
    newStatus: string,
    customerName?: string,
    customerEmail?: string,
    orderData?: any
  ): Promise<void> {
    try {
      unifiedLogger.info('order-events', 'Status changed event', { 
        orderId, 
        customerPhone, 
        newStatus 
      });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.STATUS_CHANGED,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData: {
          ...orderData,
          status: newStatus
        },
        metadata: {
          timestamp: new Date().toISOString(),
          previousStatus: orderData?.previousStatus,
          newStatus
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      unifiedLogger.error('order-events', 'Error in onStatusChanged', error);
    }
  }

  /**
   * Emit abandoned cart event
   */
  async onAbandonedCart(
    orderId: string,
    customerPhone: string,
    customerName?: string,
    customerEmail?: string,
    cartData?: any
  ): Promise<void> {
    try {
      unifiedLogger.info('order-events', 'Abandoned cart event', { orderId, customerPhone });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.ABANDONED_CART,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData: cartData,
        metadata: {
          timestamp: new Date().toISOString(),
          abandonedAt: new Date().toISOString()
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      unifiedLogger.error('order-events', 'Error in onAbandonedCart', error);
    }
  }

  /**
   * Emit promotional campaign event
   */
  async onPromoCampaign(
    customerPhone: string,
    campaignId: string,
    customerName?: string,
    customerEmail?: string,
    promoData?: any
  ): Promise<void> {
    try {
      unifiedLogger.info('order-events', 'Promo campaign event', { 
        customerPhone, 
        campaignId 
      });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.PROMO_CAMPAIGN,
        orderId: `PROMO-${campaignId}`,
        customerPhone,
        customerEmail,
        customerName,
        orderData: promoData,
        metadata: {
          timestamp: new Date().toISOString(),
          campaignId,
          promoTitle: promoData?.title,
          promoDetails: promoData?.details,
          discountCode: promoData?.discountCode
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      unifiedLogger.error('order-events', 'Error in onPromoCampaign', error);
    }
  }

  /**
   * Emit custom order event
   */
  async emitCustomEvent(
    event: OrderNotificationEvent,
    context: Partial<OrderNotificationContext>
  ): Promise<void> {
    try {
      unifiedLogger.info('order-events', 'Custom event', { event });
      
      const fullContext: OrderNotificationContext = {
        event,
        orderId: context.orderId || 'UNKNOWN',
        customerPhone: context.customerPhone || '',
        customerEmail: context.customerEmail,
        customerName: context.customerName,
        orderData: context.orderData,
        metadata: {
          ...context.metadata,
          timestamp: new Date().toISOString()
        }
      };

      await notificadorService.handleOrderEvent(fullContext);
    } catch (error) {
      unifiedLogger.error('order-events', 'Error in emitCustomEvent', error);
    }
  }
}

// Singleton instance
export const orderEventEmitter = new OrderEventEmitter();

export default orderEventEmitter;
