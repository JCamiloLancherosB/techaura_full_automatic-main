// src/services/OrderEventEmitter.ts
// Event emitter for order workflow events that trigger notifications

import { notificadorService } from './NotificadorService';
import { OrderNotificationEvent, OrderNotificationContext } from '../../types/notificador';
import { structuredLogger } from '../utils/structuredLogger';
import { orderEventRepository } from '../repositories/OrderEventRepository';

/**
 * Order Event Emitter
 * Emits order workflow events to the Notificador service
 * Also persists events to the database with correlation IDs
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
    orderData?: any,
    correlationId?: string
  ): Promise<void> {
    try {
      // Log with structured logger
      structuredLogger.logOrderEvent(
        'info',
        'order_created',
        orderId,
        customerPhone,
        {
          correlation_id: correlationId,
          flow: 'orderFlow',
          customerName,
        }
      );

      // Persist to database
      await orderEventRepository.create({
        order_number: orderId,
        phone: customerPhone,
        event_type: 'order_created',
        event_source: 'bot',
        event_description: 'Order created successfully',
        event_data: orderData,
        flow_name: 'orderFlow',
        correlation_id: correlationId,
      });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.ORDER_CREATED,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'orderFlow',
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in onOrderCreated', {
        error,
        order_id: orderId,
        correlation_id: correlationId
      });
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
    orderData?: any,
    correlationId?: string
  ): Promise<void> {
    try {
      structuredLogger.logOrderEvent(
        'info',
        'payment_confirmed',
        orderId,
        customerPhone,
        {
          correlation_id: correlationId,
          paymentMethod: orderData?.paymentMethod,
          amount: orderData?.total,
        }
      );

      await orderEventRepository.create({
        order_number: orderId,
        phone: customerPhone,
        event_type: 'payment_confirmed',
        event_source: 'bot',
        event_description: 'Payment confirmed',
        event_data: { paymentMethod: orderData?.paymentMethod, amount: orderData?.total },
        correlation_id: correlationId,
      });
      
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
          amount: orderData?.total,
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in onPaymentConfirmed', {
        error,
        order_id: orderId,
        correlation_id: correlationId
      });
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
    orderData?: any,
    correlationId?: string
  ): Promise<void> {
    try {
      structuredLogger.logOrderEvent(
        'info',
        'status_changed',
        orderId,
        customerPhone,
        {
          correlation_id: correlationId,
          newStatus,
          previousStatus: orderData?.previousStatus,
        }
      );

      await orderEventRepository.create({
        order_number: orderId,
        phone: customerPhone,
        event_type: 'status_changed',
        event_source: 'bot',
        event_description: `Status changed to ${newStatus}`,
        event_data: { newStatus, previousStatus: orderData?.previousStatus },
        correlation_id: correlationId,
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
          newStatus,
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in onStatusChanged', {
        error,
        order_id: orderId,
        correlation_id: correlationId
      });
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
    cartData?: any,
    correlationId?: string
  ): Promise<void> {
    try {
      structuredLogger.logOrderEvent(
        'info',
        'abandoned_cart',
        orderId,
        customerPhone,
        { correlation_id: correlationId }
      );

      await orderEventRepository.create({
        order_number: orderId,
        phone: customerPhone,
        event_type: 'abandoned_cart',
        event_source: 'bot',
        event_description: 'Cart abandoned',
        event_data: cartData,
        correlation_id: correlationId,
      });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.ABANDONED_CART,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData: cartData,
        metadata: {
          timestamp: new Date().toISOString(),
          abandonedAt: new Date().toISOString(),
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in onAbandonedCart', {
        error,
        order_id: orderId,
        correlation_id: correlationId
      });
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
    promoData?: any,
    correlationId?: string
  ): Promise<void> {
    try {
      structuredLogger.logWithPhone(
        'info',
        'order-events',
        'Promo campaign event',
        customerPhone,
        {
          correlation_id: correlationId,
          event: 'promo_campaign',
          campaignId,
        }
      );

      await orderEventRepository.create({
        phone: customerPhone,
        event_type: 'promo_campaign',
        event_source: 'bot',
        event_description: `Promotional campaign: ${campaignId}`,
        event_data: promoData,
        correlation_id: correlationId,
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
          discountCode: promoData?.discountCode,
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in onPromoCampaign', {
        error,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Emit shipping data captured event
   */
  async onShippingCaptured(
    orderId: string,
    customerPhone: string,
    shippingData: any,
    customerName?: string,
    customerEmail?: string,
    correlationId?: string
  ): Promise<void> {
    try {
      structuredLogger.logOrderEvent(
        'info',
        'shipping_captured',
        orderId,
        customerPhone,
        { correlation_id: correlationId }
      );

      await orderEventRepository.create({
        order_number: orderId,
        phone: customerPhone,
        event_type: 'shipping_captured',
        event_source: 'bot',
        event_description: 'Shipping data captured',
        event_data: shippingData,
        correlation_id: correlationId,
      });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.SHIPPING_CAPTURED,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData: { shippingData },
        metadata: {
          timestamp: new Date().toISOString(),
          completeness: shippingData.completeness,
          confidence: shippingData.confidence,
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in onShippingCaptured', {
        error,
        order_id: orderId,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Emit shipping validation failed event
   */
  async onShippingValidationFailed(
    orderId: string,
    customerPhone: string,
    validationErrors: string[],
    customerName?: string,
    customerEmail?: string,
    correlationId?: string
  ): Promise<void> {
    try {
      structuredLogger.logOrderEvent(
        'warn',
        'shipping_validation_failed',
        orderId,
        customerPhone,
        {
          correlation_id: correlationId,
          errors: validationErrors,
        }
      );

      await orderEventRepository.create({
        order_number: orderId,
        phone: customerPhone,
        event_type: 'shipping_validation_failed',
        event_source: 'bot',
        event_description: 'Shipping validation failed',
        event_data: { validationErrors },
        correlation_id: correlationId,
      });
      
      const context: OrderNotificationContext = {
        event: OrderNotificationEvent.SHIPPING_VALIDATION_FAILED,
        orderId,
        customerPhone,
        customerEmail,
        customerName,
        orderData: { validationErrors },
        metadata: {
          timestamp: new Date().toISOString(),
          errorCount: validationErrors.length,
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(context);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in onShippingValidationFailed', {
        error,
        order_id: orderId,
        correlation_id: correlationId
      });
    }
  }

  /**
   * Emit custom order event
   */
  async emitCustomEvent(
    event: OrderNotificationEvent,
    context: Partial<OrderNotificationContext>,
    correlationId?: string
  ): Promise<void> {
    try {
      const orderId = context.orderId || 'UNKNOWN';
      const customerPhone = context.customerPhone || '';

      structuredLogger.logOrderEvent(
        'info',
        event.toString(),
        orderId,
        customerPhone,
        { correlation_id: correlationId, event }
      );

      if (customerPhone) {
        await orderEventRepository.create({
          order_number: orderId,
          phone: customerPhone,
          event_type: event.toString(),
          event_source: 'bot',
          event_description: `Custom event: ${event}`,
          event_data: context.orderData,
          correlation_id: correlationId,
        });
      }
      
      const fullContext: OrderNotificationContext = {
        event,
        orderId,
        customerPhone,
        customerEmail: context.customerEmail,
        customerName: context.customerName,
        orderData: context.orderData,
        metadata: {
          ...context.metadata,
          timestamp: new Date().toISOString(),
          correlation_id: correlationId
        }
      };

      await notificadorService.handleOrderEvent(fullContext);
    } catch (error) {
      structuredLogger.error('order-events', 'Error in emitCustomEvent', {
        error,
        correlation_id: correlationId
      });
    }
  }
}

// Singleton instance
export const orderEventEmitter = new OrderEventEmitter();

export default orderEventEmitter;

