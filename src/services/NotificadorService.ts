// src/services/NotificadorService.ts
// Service wrapper for Notificador integration with order workflow and event hooks

import NotificadorClient from '../integrations/NotificadorClient';
import {
  NotificadorConfig,
  NotificationChannel,
  SendNotificationRequest,
  SendNotificationResponse,
  ScheduleNotificationRequest,
  OrderNotificationEvent,
  OrderNotificationContext,
  NotificationRecipient
} from '../../types/notificador';
import { unifiedLogger } from '../utils/unifiedLogger';
import { EventEmitter } from 'node:events';

export class NotificadorService extends EventEmitter {
  private client: NotificadorClient;
  private isEnabled: boolean;

  constructor() {
    super();

    const config: NotificadorConfig = {
      baseUrl: process.env.NOTIFIER_BASE_URL || '',
      apiKey: process.env.NOTIFIER_API_KEY || '',
      defaultWhatsAppNumber: process.env.DEFAULT_WHATSAPP_NUMBER || '3008602789',
      defaultEmailFrom: process.env.DEFAULT_EMAIL_FROM || 'noreply@techaura.com',
      timeout: parseInt(process.env.NOTIFIER_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.NOTIFIER_MAX_RETRIES || '3'),
      retryDelay: parseInt(process.env.NOTIFIER_RETRY_DELAY || '1000')
    };

    this.isEnabled = !!(config.baseUrl && config.apiKey);

    if (!this.isEnabled) {
      unifiedLogger.warn('system', 'NotificadorService disabled: Missing NOTIFIER_BASE_URL or NOTIFIER_API_KEY');
    } else {
      this.client = new NotificadorClient(config);
      unifiedLogger.info('system', 'NotificadorService initialized', { baseUrl: config.baseUrl });
    }
  }

  /**
   * Check if service is properly configured
   */
  isConfigured(): boolean {
    return this.isEnabled;
  }

  /**
   * Handle order workflow events
   */
  async handleOrderEvent(context: OrderNotificationContext): Promise<void> {
    if (!this.isEnabled) {
      unifiedLogger.debug('notificador', 'Service disabled, skipping notification');
      return;
    }

    // Emit hook for external listeners (processing jobs, extra automations, etc.)
    this.emit('order_event', context);

    try {
      unifiedLogger.info('notificador', `Handling order event: ${context.event}`, {
        orderId: context.orderId,
        customer: context.customerPhone
      });

      switch (context.event) {
        case OrderNotificationEvent.ORDER_CREATED:
          await this.sendOrderConfirmation(context);
          break;
        case OrderNotificationEvent.PAYMENT_CONFIRMED:
          await this.sendPaymentReceipt(context);
          break;
        case OrderNotificationEvent.STATUS_CHANGED:
          await this.sendStatusUpdate(context);
          break;
        case OrderNotificationEvent.ABANDONED_CART:
          await this.sendAbandonedCartReminder(context);
          break;
        case OrderNotificationEvent.PROMO_CAMPAIGN:
          await this.sendPromoCampaign(context);
          break;
        default:
          unifiedLogger.warn('notificador', `Unknown event type: ${context.event}`);
      }
    } catch (error) {
      unifiedLogger.error('notificador', 'Error handling order event', error);
      // Don't throw - notification failures shouldn't break order flow
    }
  }

  /**
   * Send order confirmation notification
   */
  private async sendOrderConfirmation(context: OrderNotificationContext): Promise<void> {
    const recipient: NotificationRecipient = {
      phone: context.customerPhone,
      email: context.customerEmail,
      name: context.customerName
    };

    // Check opt-in status before sending
    const canSend = await this.checkOptIn(recipient, NotificationChannel.WHATSAPP);
    if (!canSend) {
      unifiedLogger.info('notificador', 'Recipient opted out, skipping notification', {
        phone: context.customerPhone
      });
      return;
    }

    const request: SendNotificationRequest = {
      channel: NotificationChannel.WHATSAPP,
      recipient,
      template: 'order_confirmation',
      variables: {
        customerName: context.customerName || 'Cliente',
        orderId: context.orderId,
        orderDetails: this.formatOrderDetails(context.orderData)
      },
      metadata: {
        event: context.event,
        orderId: context.orderId
      }
    };

    await this.sendWithValidation(request);
  }

  /**
   * Send payment receipt notification
   */
  private async sendPaymentReceipt(context: OrderNotificationContext): Promise<void> {
    const recipient: NotificationRecipient = {
      phone: context.customerPhone,
      email: context.customerEmail,
      name: context.customerName
    };

    // Try WhatsApp first, fallback to Email
    const channels = [NotificationChannel.WHATSAPP, NotificationChannel.EMAIL];

    for (const channel of channels) {
      try {
        const canSend = await this.checkOptIn(recipient, channel);
        if (!canSend) continue;

        const request: SendNotificationRequest = {
          channel,
          recipient,
          template: 'payment_receipt',
          variables: {
            customerName: context.customerName || 'Cliente',
            orderId: context.orderId,
            amount: context.orderData?.total || '0',
            paymentMethod: context.orderData?.paymentMethod || 'No especificado'
          },
          metadata: {
            event: context.event,
            orderId: context.orderId
          }
        };

        await this.sendWithValidation(request);
        break; // Success, no need to try other channels
      } catch (error) {
        unifiedLogger.warn('notificador', `Failed to send via ${channel}, trying next`, error);
      }
    }
  }

  /**
   * Send order status update notification
   */
  private async sendStatusUpdate(context: OrderNotificationContext): Promise<void> {
    const recipient: NotificationRecipient = {
      phone: context.customerPhone,
      email: context.customerEmail,
      name: context.customerName
    };

    const canSend = await this.checkOptIn(recipient, NotificationChannel.WHATSAPP);
    if (!canSend) return;

    const statusMessages: Record<string, string> = {
      'preparacion': '📦 Tu pedido está en preparación',
      'en_camino': '🚚 Tu pedido está en camino',
      'entregado': '✅ Tu pedido ha sido entregado',
      'processing': '⚙️ Procesando tu pedido',
      'completed': '🎉 Pedido completado'
    };

    const status = context.orderData?.status || 'processing';
    const statusMessage = statusMessages[status] || `Estado actualizado: ${status}`;

    const request: SendNotificationRequest = {
      channel: NotificationChannel.WHATSAPP,
      recipient,
      template: 'status_update',
      variables: {
        customerName: context.customerName || 'Cliente',
        orderId: context.orderId,
        status: statusMessage,
        trackingUrl: context.orderData?.trackingUrl || ''
      },
      metadata: {
        event: context.event,
        orderId: context.orderId,
        status
      }
    };

    await this.sendWithValidation(request);
  }

  /**
   * Send abandoned cart reminder
   */
  private async sendAbandonedCartReminder(context: OrderNotificationContext): Promise<void> {
    const recipient: NotificationRecipient = {
      phone: context.customerPhone,
      email: context.customerEmail,
      name: context.customerName
    };

    const canSend = await this.checkOptIn(recipient, NotificationChannel.WHATSAPP);
    if (!canSend) return;

    // Schedule for 24 hours later
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const request: ScheduleNotificationRequest = {
      channel: NotificationChannel.WHATSAPP,
      recipient,
      template: 'abandoned_cart',
      scheduledFor,
      variables: {
        customerName: context.customerName || 'Cliente',
        cartItems: this.formatCartItems(context.orderData?.items || []),
        cartTotal: context.orderData?.total || '0'
      },
      metadata: {
        event: context.event,
        orderId: context.orderId
      }
    };

    try {
      const response = await this.client.schedule(request);
      unifiedLogger.info('notificador', 'Abandoned cart reminder scheduled', {
        scheduleId: response.scheduleId,
        scheduledFor
      });
    } catch (error) {
      unifiedLogger.error('notificador', 'Failed to schedule abandoned cart reminder', error);
    }
  }

  /**
   * Send promotional campaign notification
   */
  private async sendPromoCampaign(context: OrderNotificationContext): Promise<void> {
    const recipient: NotificationRecipient = {
      phone: context.customerPhone,
      email: context.customerEmail,
      name: context.customerName
    };

    // Check opt-in for marketing messages
    const canSend = await this.checkOptIn(recipient, NotificationChannel.WHATSAPP);
    if (!canSend) return;

    const request: SendNotificationRequest = {
      channel: NotificationChannel.WHATSAPP,
      recipient,
      template: 'promo_campaign',
      variables: {
        customerName: context.customerName || 'Cliente',
        promoTitle: context.metadata?.promoTitle || 'Promoción especial',
        promoDetails: context.metadata?.promoDetails || '',
        discountCode: context.metadata?.discountCode || ''
      },
      metadata: {
        event: context.event,
        campaignId: context.metadata?.campaignId
      }
    };

    await this.sendWithValidation(request);
  }

  /**
   * Send notification with contact validation
   */
  private async sendWithValidation(request: SendNotificationRequest): Promise<SendNotificationResponse> {
    // Validate contact information
    if (!this.client.validateContact(request.channel, request.recipient)) {
      throw new Error(`Invalid contact information for ${request.channel}`);
    }

    return await this.client.send(request);
  }

  /**
   * Check opt-in status for recipient
   */
  private async checkOptIn(recipient: NotificationRecipient, channel: NotificationChannel): Promise<boolean> {
    try {
      const contactId = channel === NotificationChannel.EMAIL ? recipient.email : recipient.phone;
      if (!contactId) return false;

      const subscription = await this.client.checkSubscription(contactId, channel);
      return subscription.canSend;
    } catch (error) {
      unifiedLogger.error('notificador', 'Error checking opt-in status', error);
      // Default to false on error for safety
      return false;
    }
  }

  /**
   * Get notification history (for admin UI)
   */
  async getHistory(limit: number = 50, offset: number = 0) {
    if (!this.isEnabled) {
      return { success: true, items: [], total: 0, limit, offset };
    }

    try {
      return await this.client.getHistory({ limit, offset });
    } catch (error) {
      unifiedLogger.error('notificador', 'Error fetching history', error);
      throw error;
    }
  }

  /**
   * Get available templates (for admin UI)
   */
  async getTemplates(channel?: NotificationChannel) {
    if (!this.isEnabled) {
      return { success: true, templates: [] };
    }

    try {
      return await this.client.listTemplates(channel);
    } catch (error) {
      unifiedLogger.error('notificador', 'Error fetching templates', error);
      throw error;
    }
  }

  /**
   * Send test notification (for admin UI)
   */
  async sendTestNotification(channel: NotificationChannel, recipient: NotificationRecipient): Promise<SendNotificationResponse> {
    if (!this.isEnabled) {
      throw new Error('Notificador service is not configured');
    }

    const request: SendNotificationRequest = {
      channel,
      recipient,
      message: `🧪 Test notification from TechauraBot - ${new Date().toISOString()}`,
      subject: 'Test Notification',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    };

    return await this.sendWithValidation(request);
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<boolean> {
    if (!this.isEnabled) {
      return false;
    }

    try {
      return await this.client.healthCheck();
    } catch (error) {
      unifiedLogger.error('notificador', 'Health check failed', error);
      return false;
    }
  }

  /**
   * Get configuration status (for admin UI)
   */
  getConfigStatus() {
    return {
      enabled: this.isEnabled,
      baseUrl: process.env.NOTIFIER_BASE_URL ? '***configured***' : 'not set',
      apiKey: process.env.NOTIFIER_API_KEY ? '***configured***' : 'not set',
      defaultWhatsAppNumber: process.env.DEFAULT_WHATSAPP_NUMBER || 'not set',
      defaultEmailFrom: process.env.DEFAULT_EMAIL_FROM || 'not set'
    };
  }

  // Helper methods

  private formatOrderDetails(orderData: any): string {
    if (!orderData) return 'Detalles no disponibles';

    const items = orderData.items || [];
    const total = orderData.total || '0';

    return items.map((item: any) =>
      `• ${item.name || item.description}: $${item.price}`
    ).join('\n') + `\n\nTotal: $${total}`;
  }

  private formatCartItems(items: any[]): string {
    if (!items || items.length === 0) return 'No hay items en el carrito';

    return items.map((item: any) =>
      `• ${item.name || item.description}: $${item.price}`
    ).join('\n');
  }
}

// Singleton instance
export const notificadorService = new NotificadorService();

export default notificadorService;
