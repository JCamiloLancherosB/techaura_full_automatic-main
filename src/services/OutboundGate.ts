/**
 * OutboundGate - Unified Outbound Message Gatekeeper
 * Single source of truth for ALL message sending rules and protections
 * 
 * Features:
 * - Rate limiting (per-chat and global)
 * - Jitter/delay (human-like timing)
 * - Time windows (business hours enforcement)
 * - User cooldown (respect cooldown_until timestamps)
 * - Recency gating (prevent spam based on last interaction)
 * - No-reach gating (contact status, opt-out, tags)
 * - Order status guards (prevent promos when confirmed)
 * - Content validation (via MessagePolicyEngine)
 * 
 * Usage:
 *   const gate = OutboundGate.getInstance();
 *   await gate.sendMessage(phone, message, context, flowDynamic);
 */

import { flowGuard } from './flowGuard';
import { messagePolicyEngine } from './MessagePolicyEngine';
import type { MessagePolicyContext } from './MessagePolicyEngine';
import { getUserSession } from '../flows/userTrackingSystem';
import type { UserSession } from '../../types/global';
import { getRandomDelay } from '../utils/antiBanDelays';
import { whatsAppProviderState, ProviderState } from './WhatsAppProviderState';
import { messageDecisionService, DecisionStage, Decision, DecisionReasonCode } from './MessageDecisionService';

export interface OutboundContext {
  phone: string;
  messageType?: 'catalog' | 'persuasive' | 'order' | 'general' | 'followup' | 'notification';
  stage?: string;
  status?: string;
  flowName?: string;
  priority?: 'low' | 'normal' | 'high';
  bypassTimeWindow?: boolean; // For urgent notifications
  bypassRateLimit?: boolean; // For critical messages (use sparingly)
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  blockedBy?: string[];
  delayApplied?: number;
  /** If true, message was deferred due to provider not connected */
  deferred?: boolean;
  /** When the message can be retried */
  retryAfter?: Date;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
  lastSendAt: number;
}

interface GlobalRateLimit {
  count: number;
  resetAt: number;
}

export class OutboundGate {
  private static instance: OutboundGate;

  // Rate limiting configuration
  private readonly PER_CHAT_LIMIT_PER_HOUR = 10; // Max messages per chat per hour
  private readonly PER_CHAT_LIMIT_PER_DAY = 30; // Max messages per chat per day
  private readonly GLOBAL_LIMIT_PER_HOUR = 100; // Max total messages per hour
  private readonly GLOBAL_LIMIT_PER_DAY = 500; // Max total messages per day
  private readonly MIN_MESSAGE_INTERVAL_MS = 60000; // Min 1 minute between messages to same chat

  // Time window configuration (business hours)
  private readonly ALLOWED_START_HOUR = 9; // 9 AM
  private readonly ALLOWED_END_HOUR = 21; // 9 PM

  // Recency gating configuration
  private readonly MIN_INTERACTION_GAP_MS = 3600000; // 1 hour minimum between follow-ups
  private readonly MIN_FOLLOWUP_GAP_MS = 86400000; // 24 hours minimum between automated follow-ups

  // Rate limit tracking
  private perChatBuckets = new Map<string, RateLimitBucket>();
  private globalHourlyLimit: GlobalRateLimit = { count: 0, resetAt: 0 };
  private globalDailyLimit: GlobalRateLimit = { count: 0, resetAt: 0 };

  // Statistics
  private stats = {
    totalSent: 0,
    totalBlocked: 0,
    totalDeferred: 0,
    blockedByRateLimit: 0,
    blockedByTimeWindow: 0,
    blockedByCooldown: 0,
    blockedByRecency: 0,
    blockedByNoReach: 0,
    blockedByOrderStatus: 0,
    blockedByContent: 0,
    blockedByProviderState: 0
  };

  static getInstance(): OutboundGate {
    if (!OutboundGate.instance) {
      OutboundGate.instance = new OutboundGate();
      OutboundGate.instance.startCleanupWatchdog();
    }
    return OutboundGate.instance;
  }

  /**
   * Main entry point: Send a message through all gates
   * @param flowDynamic - Optional. If not provided, will use global.botInstance.sendMessage
   */
  async sendMessage(
    phone: string,
    message: string,
    context: OutboundContext,
    flowDynamic?: Function
  ): Promise<SendResult> {
    const blockedBy: string[] = [];

    try {
      console.log(`🚪 OutboundGate: Checking gates for message to ${phone} (type: ${context.messageType || 'general'})`);

      // Gate 0: Provider State Check (must be CONNECTED to send)
      const providerState = whatsAppProviderState.getState();
      if (providerState !== ProviderState.CONNECTED) {
        const stateInfo = whatsAppProviderState.getStateInfo();
        console.log(`📵 OutboundGate: Provider not connected (state: ${providerState}), deferring message`);
        
        this.stats.totalDeferred++;
        this.stats.blockedByProviderState++;

        // Record decision trace for deferred message
        const messageId = `outbound_${Date.now()}_${phone}`;
        await messageDecisionService.recordDecision({
          messageId,
          phone,
          stage: DecisionStage.SEND,
          decision: Decision.DEFER,
          reasonCode: DecisionReasonCode.PROVIDER_SEND_FAIL,
          reasonDetail: `Provider state: ${providerState}. Message deferred until reconnection.`,
          nextEligibleAt: new Date(Date.now() + 30000) // Retry after 30 seconds
        });

        return {
          sent: false,
          reason: `Provider not connected (state: ${providerState})`,
          blockedBy: ['provider-state'],
          deferred: true,
          retryAfter: new Date(Date.now() + 30000)
        };
      }

      // Get user session for validation
      const session = await getUserSession(phone);

      // Gate 1: No-Reach Gating (contact status, opt-out, blacklist)
      const noReachCheck = await this.checkNoReachGate(session);
      if (!noReachCheck.canProceed) {
        blockedBy.push('no-reach');
        console.log(`🚫 OutboundGate: Blocked by no-reach gate - ${noReachCheck.reason}`);
      }

      // Gate 2: Order Status Guard (prevent promos when order confirmed)
      if (context.messageType === 'followup' || context.messageType === 'persuasive') {
        const orderCheck = await flowGuard.hasConfirmedOrActiveOrder(phone);
        if (orderCheck) {
          blockedBy.push('order-status');
          console.log(`🚫 OutboundGate: Blocked by order status - user has active order`);
        }
      }

      // Gate 3: Cooldown Guard (respect cooldown_until)
      const cooldownCheck = await flowGuard.isInCooldown(phone);
      if (cooldownCheck.inCooldown) {
        blockedBy.push('cooldown');
        console.log(`🚫 OutboundGate: Blocked by cooldown - active until ${cooldownCheck.until?.toISOString()}`);
      }

      // Gate 4: Recency Gating (prevent spam based on recent interactions)
      const recencyCheck = this.checkRecencyGate(session, context);
      if (!recencyCheck.canProceed) {
        blockedBy.push('recency');
        console.log(`🚫 OutboundGate: Blocked by recency gate - ${recencyCheck.reason}`);
      }

      // Gate 5: Time Window (business hours)
      if (!context.bypassTimeWindow) {
        const timeWindowCheck = this.checkTimeWindow();
        if (!timeWindowCheck.canProceed) {
          blockedBy.push('time-window');
          console.log(`🚫 OutboundGate: Blocked by time window - ${timeWindowCheck.reason}`);
        }
      }

      // Gate 6: Rate Limiting (per-chat and global)
      if (!context.bypassRateLimit) {
        const rateLimitCheck = this.checkRateLimit(phone);
        if (!rateLimitCheck.canProceed) {
          blockedBy.push('rate-limit');
          console.log(`🚫 OutboundGate: Blocked by rate limit - ${rateLimitCheck.reason}`);
        }
      }

      // Gate 7: Content Validation (via MessagePolicyEngine)
      const contentCheck = this.validateContent(message, session, context);
      if (!contentCheck.isValid) {
        blockedBy.push('content-policy');
        console.log(`🚫 OutboundGate: Blocked by content policy - ${contentCheck.reason}`);
      }

      // If any gate blocked, return blocked result
      if (blockedBy.length > 0) {
        this.stats.totalBlocked++;
        if (blockedBy.includes('rate-limit')) this.stats.blockedByRateLimit++;
        if (blockedBy.includes('time-window')) this.stats.blockedByTimeWindow++;
        if (blockedBy.includes('cooldown')) this.stats.blockedByCooldown++;
        if (blockedBy.includes('recency')) this.stats.blockedByRecency++;
        if (blockedBy.includes('no-reach')) this.stats.blockedByNoReach++;
        if (blockedBy.includes('order-status')) this.stats.blockedByOrderStatus++;
        if (blockedBy.includes('content-policy')) this.stats.blockedByContent++;

        return {
          sent: false,
          reason: `Blocked by: ${blockedBy.join(', ')}`,
          blockedBy
        };
      }

      // All gates passed - apply jitter/delay and send
      const delay = this.calculateDelay(context);
      console.log(`⏳ OutboundGate: Applying ${delay}ms delay before sending`);
      await this.applyDelay(delay);

      // Use transformed message if content validation suggested changes
      const finalMessage = contentCheck.transformedMessage || message;

      // Send the message - use flowDynamic if provided, otherwise use global bot instance
      if (flowDynamic) {
        await flowDynamic([finalMessage]);
      } else if (global.botInstance && typeof global.botInstance.sendMessage === 'function') {
        // Ensure phone has proper JID format for Baileys
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        
        // Send with timeout
        const sendPromise = global.botInstance.sendMessage(jid, { text: finalMessage });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Message send timeout after 15s')), 15000)
        );
        
        const result = await Promise.race([sendPromise, timeoutPromise]);
        
        // Validate response
        if (result === undefined || result === null) {
          throw new Error('Bot returned undefined/null response - possible USync error');
        }
      } else {
        throw new Error('No message sending mechanism available (no flowDynamic or botInstance)');
      }

      // Update rate limit counters
      this.updateRateLimitCounters(phone);

      // Update statistics
      this.stats.totalSent++;

      console.log(`✅ OutboundGate: Message sent successfully to ${phone}`);

      return {
        sent: true,
        delayApplied: delay
      };

    } catch (error) {
      console.error(`❌ OutboundGate: Error processing message to ${phone}:`, error);
      return {
        sent: false,
        reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        blockedBy: ['error']
      };
    }
  }

  /**
   * Gate 1: No-Reach Gating
   * Check if user can receive messages based on contact status and tags
   */
  private async checkNoReachGate(session: UserSession): Promise<{ canProceed: boolean; reason?: string }> {
    // Block if contact status is OPT_OUT
    if (session.contactStatus === 'OPT_OUT') {
      return { canProceed: false, reason: 'User opted out' };
    }

    // Block if user has blacklist tag
    if (session.tags && session.tags.includes('blacklist')) {
      return { canProceed: false, reason: 'User is blacklisted' };
    }

    // Block if contact status is CLOSED and no re-engagement
    if (session.contactStatus === 'CLOSED' && session.tags?.includes('decision_made')) {
      return { canProceed: false, reason: 'User completed interaction' };
    }

    return { canProceed: true };
  }

  /**
   * Gate 4: Recency Gating
   * Prevent spam based on recent interactions and follow-up timing
   */
  private checkRecencyGate(
    session: UserSession, 
    context: OutboundContext
  ): { canProceed: boolean; reason?: string } {
    const now = Date.now();

    // For follow-up messages, check minimum gap
    if (context.messageType === 'followup') {
      if (session.lastFollowUp) {
        const lastFollowUpTime = new Date(session.lastFollowUp).getTime();
        const timeSinceLastFollowUp = now - lastFollowUpTime;
        
        if (timeSinceLastFollowUp < this.MIN_FOLLOWUP_GAP_MS) {
          const hoursRemaining = Math.ceil((this.MIN_FOLLOWUP_GAP_MS - timeSinceLastFollowUp) / 3600000);
          return { 
            canProceed: false, 
            reason: `Too soon since last follow-up (${hoursRemaining}h remaining)` 
          };
        }
      }
    }

    // Check minimum interaction gap for non-critical messages
    if (context.priority !== 'high' && session.lastInteraction) {
      const lastInteractionTime = new Date(session.lastInteraction).getTime();
      const timeSinceLastInteraction = now - lastInteractionTime;

      // If user recently interacted, don't send automated messages
      if (context.messageType === 'followup' && timeSinceLastInteraction < this.MIN_INTERACTION_GAP_MS) {
        const minutesRemaining = Math.ceil((this.MIN_INTERACTION_GAP_MS - timeSinceLastInteraction) / 60000);
        return { 
          canProceed: false, 
          reason: `User recently active (${minutesRemaining}m ago)` 
        };
      }
    }

    return { canProceed: true };
  }

  /**
   * Gate 5: Time Window
   * Enforce business hours (9 AM - 9 PM)
   */
  private checkTimeWindow(): { canProceed: boolean; reason?: string } {
    const now = new Date();
    const hour = now.getHours();

    if (hour < this.ALLOWED_START_HOUR || hour >= this.ALLOWED_END_HOUR) {
      return { 
        canProceed: false, 
        reason: `Outside business hours (${this.ALLOWED_START_HOUR}:00-${this.ALLOWED_END_HOUR}:00), current: ${hour}:00` 
      };
    }

    return { canProceed: true };
  }

  /**
   * Gate 6: Rate Limiting
   * Check per-chat and global rate limits
   */
  private checkRateLimit(phone: string): { canProceed: boolean; reason?: string } {
    const now = Date.now();

    // Initialize global limits if needed
    this.initializeGlobalLimits(now);

    // Check global hourly limit
    if (this.globalHourlyLimit.count >= this.GLOBAL_LIMIT_PER_HOUR) {
      return { 
        canProceed: false, 
        reason: `Global hourly limit reached (${this.GLOBAL_LIMIT_PER_HOUR})` 
      };
    }

    // Check global daily limit
    if (this.globalDailyLimit.count >= this.GLOBAL_LIMIT_PER_DAY) {
      return { 
        canProceed: false, 
        reason: `Global daily limit reached (${this.GLOBAL_LIMIT_PER_DAY})` 
      };
    }

    // Get or create per-chat bucket
    let bucket = this.perChatBuckets.get(phone);
    if (!bucket || now >= bucket.resetAt) {
      bucket = {
        count: 0,
        resetAt: now + 3600000, // Reset in 1 hour
        lastSendAt: 0
      };
      this.perChatBuckets.set(phone, bucket);
    }

    // Check minimum interval between messages to same chat
    if (bucket.lastSendAt > 0) {
      const timeSinceLastSend = now - bucket.lastSendAt;
      if (timeSinceLastSend < this.MIN_MESSAGE_INTERVAL_MS) {
        const secondsRemaining = Math.ceil((this.MIN_MESSAGE_INTERVAL_MS - timeSinceLastSend) / 1000);
        return { 
          canProceed: false, 
          reason: `Too soon since last message to this chat (${secondsRemaining}s remaining)` 
        };
      }
    }

    // Check per-chat hourly limit
    if (bucket.count >= this.PER_CHAT_LIMIT_PER_HOUR) {
      return { 
        canProceed: false, 
        reason: `Per-chat hourly limit reached (${this.PER_CHAT_LIMIT_PER_HOUR})` 
      };
    }

    return { canProceed: true };
  }

  /**
   * Gate 7: Content Validation
   * Validate message content via MessagePolicyEngine
   */
  private validateContent(
    message: string,
    session: UserSession,
    context: OutboundContext
  ): { isValid: boolean; reason?: string; transformedMessage?: string } {
    try {
      const policyContext: MessagePolicyContext = {
        userSession: session,
        persuasionContext: {
          interactionCount: session.interactionCount || 0,
          hasSelectedProduct: !!(session.orderData?.selectedProduct),
          orderStage: session.stage || 'awareness',
          hasOrders: !!(session.orderData?.orderNumber),
          orderValue: session.orderData?.totalAmount || 0,
          productType: session.orderData?.selectedProduct || '',
          lastInteraction: session.lastInteraction || new Date(),
          responseTime: 0
        },
        messageType: context.messageType,
        stage: context.stage || session.stage || 'awareness',
        status: context.status || session.orderData?.status || 'initial'
      };

      const validation = messagePolicyEngine.validateMessage(message, policyContext);

      if (!validation.isValid) {
        const summary = messagePolicyEngine.getViolationSummary(validation.violations);
        return { 
          isValid: false, 
          reason: summary,
          transformedMessage: validation.transformedMessage
        };
      }

      return { 
        isValid: true,
        transformedMessage: validation.transformedMessage
      };
    } catch (error) {
      console.error('❌ OutboundGate: Error in content validation:', error);
      // Fail-open: allow message if validation fails
      return { isValid: true };
    }
  }

  /**
   * Calculate appropriate delay based on message type
   */
  private calculateDelay(context: OutboundContext): number {
    switch (context.messageType) {
      case 'notification':
        return getRandomDelay(1000, 2000); // Quick for notifications
      case 'order':
        return getRandomDelay(1500, 3000); // Fast for order-related
      case 'catalog':
        return getRandomDelay(3000, 6000); // Longer for media/catalog
      case 'followup':
        return getRandomDelay(2000, 4000); // Normal for follow-ups
      case 'persuasive':
      case 'general':
      default:
        return getRandomDelay(2000, 5000); // Standard human delay
    }
  }

  /**
   * Apply delay (jitter) before sending
   */
  private async applyDelay(delayMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Update rate limit counters after successful send
   */
  private updateRateLimitCounters(phone: string): void {
    const now = Date.now();

    // Update per-chat bucket
    const bucket = this.perChatBuckets.get(phone);
    if (bucket) {
      bucket.count++;
      bucket.lastSendAt = now;
    }

    // Update global limits
    this.globalHourlyLimit.count++;
    this.globalDailyLimit.count++;
  }

  /**
   * Initialize global rate limit buckets
   */
  private initializeGlobalLimits(now: number): void {
    // Reset hourly limit if expired
    if (now >= this.globalHourlyLimit.resetAt) {
      this.globalHourlyLimit.count = 0;
      this.globalHourlyLimit.resetAt = now + 3600000; // +1 hour
    }

    // Reset daily limit if expired
    if (now >= this.globalDailyLimit.resetAt) {
      this.globalDailyLimit.count = 0;
      this.globalDailyLimit.resetAt = now + 86400000; // +24 hours
    }
  }

  /**
   * Cleanup expired rate limit buckets
   */
  private startCleanupWatchdog(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      // Clean expired per-chat buckets
      for (const [phone, bucket] of this.perChatBuckets.entries()) {
        if (now >= bucket.resetAt + 86400000) { // Keep for 24h after reset
          this.perChatBuckets.delete(phone);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`🧹 OutboundGate: Cleaned ${cleaned} expired rate limit buckets`);
      }
    }, 3600000); // Run every hour

    console.log('👁️ OutboundGate Watchdog: Started (cleanup every hour)');
  }

  /**
   * Get gate statistics
   */
  getStats() {
    return {
      ...this.stats,
      perChatBuckets: this.perChatBuckets.size,
      globalHourlyCount: this.globalHourlyLimit.count,
      globalDailyCount: this.globalDailyLimit.count
    };
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats(): void {
    this.stats = {
      totalSent: 0,
      totalBlocked: 0,
      totalDeferred: 0,
      blockedByRateLimit: 0,
      blockedByTimeWindow: 0,
      blockedByCooldown: 0,
      blockedByRecency: 0,
      blockedByNoReach: 0,
      blockedByOrderStatus: 0,
      blockedByContent: 0,
      blockedByProviderState: 0
    };
  }

  /**
   * Clear all rate limit buckets (for testing)
   */
  clearRateLimits(): void {
    this.perChatBuckets.clear();
    this.globalHourlyLimit = { count: 0, resetAt: 0 };
    this.globalDailyLimit = { count: 0, resetAt: 0 };
  }
}

// Export singleton instance
export const outboundGate = OutboundGate.getInstance();

console.log('✅ OutboundGate Service initialized');
