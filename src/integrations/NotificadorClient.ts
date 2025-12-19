// src/integrations/NotificadorClient.ts
// SDK/Client for consuming the external Notificador service via REST API

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  NotificadorConfig,
  SendNotificationRequest,
  SendNotificationResponse,
  ScheduleNotificationRequest,
  ScheduleNotificationResponse,
  NotificationHistoryRequest,
  NotificationHistoryResponse,
  TemplateListResponse,
  SubscriptionCheckResponse,
  NotificadorError,
  NotificationChannel
} from '../../types/notificador';

export class NotificadorClient {
  private axiosInstance: AxiosInstance;
  private config: NotificadorConfig;
  private readonly MAX_RETRIES: number;
  private readonly RETRY_DELAY: number;

  constructor(config: NotificadorConfig) {
    this.config = config;
    this.MAX_RETRIES = config.maxRetries || 3;
    this.RETRY_DELAY = config.retryDelay || 1000;

    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      error => this.handleError(error)
    );
  }

  /**
   * Send a notification via specified channel
   */
  async send(request: SendNotificationRequest): Promise<SendNotificationResponse> {
    try {
      console.log(`📤 [NotificadorClient] Sending ${request.channel} notification to:`, 
        request.recipient.phone || request.recipient.email);

      const response = await this.retryRequest(async () => {
        return await this.axiosInstance.post<SendNotificationResponse>('/notifications/send', request);
      });

      console.log(`✅ [NotificadorClient] Notification sent successfully:`, response.data.messageId);
      return response.data;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Failed to send notification:`, error);
      throw this.createNotificadorError(error);
    }
  }

  /**
   * Schedule a notification for future delivery
   */
  async schedule(request: ScheduleNotificationRequest): Promise<ScheduleNotificationResponse> {
    try {
      console.log(`📅 [NotificadorClient] Scheduling ${request.channel} notification for:`, 
        request.scheduledFor);

      const response = await this.retryRequest(async () => {
        return await this.axiosInstance.post<ScheduleNotificationResponse>('/notifications/schedule', request);
      });

      console.log(`✅ [NotificadorClient] Notification scheduled:`, response.data.scheduleId);
      return response.data;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Failed to schedule notification:`, error);
      throw this.createNotificadorError(error);
    }
  }

  /**
   * Get notification history
   */
  async getHistory(request: NotificationHistoryRequest = {}): Promise<NotificationHistoryResponse> {
    try {
      const params = new URLSearchParams();
      
      if (request.channel) params.append('channel', request.channel);
      if (request.status) params.append('status', request.status);
      if (request.recipient) params.append('recipient', request.recipient);
      if (request.fromDate) params.append('fromDate', request.fromDate);
      if (request.toDate) params.append('toDate', request.toDate);
      if (request.limit) params.append('limit', request.limit.toString());
      if (request.offset) params.append('offset', request.offset.toString());

      const response = await this.axiosInstance.get<NotificationHistoryResponse>(
        `/notifications/history?${params.toString()}`
      );

      console.log(`📋 [NotificadorClient] Retrieved ${response.data.items.length} history items`);
      return response.data;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Failed to get history:`, error);
      throw this.createNotificadorError(error);
    }
  }

  /**
   * List available notification templates
   */
  async listTemplates(channel?: NotificationChannel): Promise<TemplateListResponse> {
    try {
      const params = channel ? `?channel=${channel}` : '';
      const response = await this.axiosInstance.get<TemplateListResponse>(
        `/notifications/templates${params}`
      );

      console.log(`📝 [NotificadorClient] Retrieved ${response.data.templates.length} templates`);
      return response.data;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Failed to list templates:`, error);
      throw this.createNotificadorError(error);
    }
  }

  /**
   * Check if recipient can receive notifications (opt-in/out status)
   */
  async checkSubscription(
    recipient: string, 
    channel: NotificationChannel
  ): Promise<SubscriptionCheckResponse> {
    try {
      const response = await this.axiosInstance.get<SubscriptionCheckResponse>(
        `/subscriptions/check`,
        {
          params: { recipient, channel }
        }
      );

      console.log(`🔍 [NotificadorClient] Subscription check for ${recipient}:`, 
        response.data.canSend ? 'ALLOWED' : 'BLOCKED');
      return response.data;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Failed to check subscription:`, error);
      throw this.createNotificadorError(error);
    }
  }

  /**
   * Opt-in a recipient to notifications
   */
  async optIn(recipient: string, channel: NotificationChannel): Promise<boolean> {
    try {
      const response = await this.axiosInstance.post('/subscriptions/opt-in', {
        recipient,
        channel
      });

      console.log(`✅ [NotificadorClient] Opted in ${recipient} to ${channel}`);
      return response.data.success;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Failed to opt-in:`, error);
      throw this.createNotificadorError(error);
    }
  }

  /**
   * Opt-out a recipient from notifications
   */
  async optOut(recipient: string, channel: NotificationChannel, reason?: string): Promise<boolean> {
    try {
      const response = await this.axiosInstance.post('/subscriptions/opt-out', {
        recipient,
        channel,
        reason
      });

      console.log(`🚫 [NotificadorClient] Opted out ${recipient} from ${channel}`);
      return response.data.success;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Failed to opt-out:`, error);
      throw this.createNotificadorError(error);
    }
  }

  /**
   * Health check for Notificador service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/health');
      return response.status === 200;
    } catch (error) {
      console.error(`❌ [NotificadorClient] Health check failed:`, error);
      return false;
    }
  }

  /**
   * Retry request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt >= this.MAX_RETRIES) {
        throw error;
      }

      const isRetryable = this.isRetryableError(error);
      if (!isRetryable) {
        throw error;
      }

      const delay = this.RETRY_DELAY * Math.pow(2, attempt);
      console.log(`⏳ [NotificadorClient] Retrying in ${delay}ms (attempt ${attempt + 1}/${this.MAX_RETRIES})`);
      
      await this.sleep(delay);
      return this.retryRequest(requestFn, attempt + 1);
    }
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Retry on network errors, timeouts, and 5xx errors
      return !status || status >= 500 || error.code === 'ECONNABORTED';
    }
    return false;
  }

  /**
   * Handle and transform axios errors
   */
  private handleError(error: AxiosError): Promise<never> {
    const notificadorError = this.createNotificadorError(error);
    return Promise.reject(notificadorError);
  }

  /**
   * Create NotificadorError from generic error
   */
  private createNotificadorError(error: any): NotificadorError {
    const notifError = new Error() as NotificadorError;
    
    if (axios.isAxiosError(error)) {
      notifError.message = error.response?.data?.message || error.message;
      notifError.code = error.response?.data?.code || error.code;
      notifError.statusCode = error.response?.status;
      notifError.response = error.response?.data;
    } else if (error instanceof Error) {
      notifError.message = error.message;
    } else {
      notifError.message = 'Unknown error occurred';
    }
    
    notifError.name = 'NotificadorError';
    return notifError;
  }

  /**
   * Sleep utility for retry delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate contact information before sending
   */
  validateContact(channel: NotificationChannel, recipient: any): boolean {
    switch (channel) {
      case NotificationChannel.WHATSAPP:
      case NotificationChannel.SMS:
        return this.validatePhoneNumber(recipient.phone);
      case NotificationChannel.EMAIL:
        return this.validateEmail(recipient.email);
      default:
        return false;
    }
  }

  /**
   * Validate phone number format
   */
  private validatePhoneNumber(phone?: string): boolean {
    if (!phone) return false;
    // Basic validation: remove non-digits and check length
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  /**
   * Validate email format
   */
  private validateEmail(email?: string): boolean {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export default NotificadorClient;
