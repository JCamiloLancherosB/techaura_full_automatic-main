// types/notificador.ts
// Type definitions for Notificador external service integration

export enum NotificationChannel {
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email'
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  READ = 'read'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  OPT_OUT = 'opt_out',
  BLOCKED = 'blocked'
}

export interface NotificadorConfig {
  baseUrl: string;
  apiKey: string;
  defaultWhatsAppNumber?: string;
  defaultEmailFrom?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface NotificationRecipient {
  phone?: string;
  email?: string;
  name?: string;
}

export interface NotificationTemplate {
  id?: string;
  name: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  variables?: Record<string, string>;
}

export interface SendNotificationRequest {
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  template?: string;
  message?: string;
  subject?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SendNotificationResponse {
  success: boolean;
  messageId?: string;
  status: NotificationStatus;
  error?: string;
  timestamp: string;
}

export interface ScheduleNotificationRequest extends SendNotificationRequest {
  scheduledFor: Date | string;
}

export interface ScheduleNotificationResponse {
  success: boolean;
  scheduleId?: string;
  scheduledFor: string;
  error?: string;
}

export interface NotificationHistoryItem {
  id: string;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  message: string;
  subject?: string;
  status: NotificationStatus;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface NotificationHistoryRequest {
  channel?: NotificationChannel;
  status?: NotificationStatus;
  recipient?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface NotificationHistoryResponse {
  success: boolean;
  items: NotificationHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface SubscriptionInfo {
  recipient: string;
  channel: NotificationChannel;
  status: SubscriptionStatus;
  optedOutAt?: string;
  reason?: string;
}

export interface SubscriptionCheckResponse {
  canSend: boolean;
  subscription: SubscriptionInfo;
}

export interface TemplateListResponse {
  success: boolean;
  templates: NotificationTemplate[];
}

export interface NotificadorError extends Error {
  code?: string;
  statusCode?: number;
  response?: any;
}

// Event types for order workflow integration
export enum OrderNotificationEvent {
  ORDER_CREATED = 'order_created',
  ORDER_CONFIRMED = 'order_confirmed',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  STATUS_CHANGED = 'status_changed',
  ABANDONED_CART = 'abandoned_cart',
  PROMO_CAMPAIGN = 'promo_campaign'
}

export interface OrderNotificationContext {
  event: OrderNotificationEvent;
  orderId: string;
  customerPhone: string;
  customerEmail?: string;
  customerName?: string;
  orderData?: any;
  metadata?: Record<string, any>;
}
