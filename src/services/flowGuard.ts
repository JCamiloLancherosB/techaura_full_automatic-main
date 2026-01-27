/**
 * FlowGuard - Centralized flow state management and protection
 * Prevents duplicate entries, manages locks, and ensures proper flow sequencing
 * 
 * Features:
 * - Per-user processing locks with auto-timeout
 * - Entry handling flags to prevent duplicate messages
 * - Stage-aware guards (awaiting_input, processing, etc.)
 * - Order status guards (prevent promos when order confirmed)
 * - Cooldown guards (respect cooldown_until)
 * - Real-time state validation
 * - Comprehensive logging
 */

import { getUserSession, updateUserSession } from '../flows/userTrackingSystem';
import type { UserSession } from '../../types/global';
import { orderStateManager } from './OrderStateManager';
import type { OrderStatus } from './OrderStateManager';

export interface FlowGuardLock {
  phone: string;
  stage: string;
  timestamp: number;
  flowName: string;
  lockId: string;
}

export interface EntryGuard {
  phone: string;
  flowName: string;
  messageHash: string;
  handledAt: number;
}

export interface GuardCheckResult {
  canProceed: boolean;
  reason?: string;
  reasonCode?: FlowGuardReasonCode;
  suggestedAction?: 'wait_for_completion' | 'skip_silently' | 'defer_to_active_flow' | 'reprompt' | 'proceed';
  currentStage?: string;
  activeFlowId?: string;
  deferredQuestion?: string;
}

/**
 * Reason codes for flow guard decisions
 * Used for Decision Trace instrumentation
 */
export enum FlowGuardReasonCode {
  /** User is currently locked in a flow step */
  USER_LOCKED = 'USER_LOCKED',
  /** Duplicate entry detected */
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  /** User is awaiting input in another step */
  AWAITING_USER_INPUT = 'AWAITING_USER_INPUT',
  /** Blocked by flow guard rules */
  FLOW_GUARD_BLOCKED = 'FLOW_GUARD_BLOCKED',
  /** Deferred to active flow for handling */
  DEFER_TO_ACTIVE_FLOW = 'DEFER_TO_ACTIVE_FLOW',
  /** Can proceed with entry */
  CAN_PROCEED = 'CAN_PROCEED',
  /** Error occurred, allowing entry as fail-safe */
  ERROR_ALLOW_ENTRY = 'ERROR_ALLOW_ENTRY'
}

class FlowGuardService {
  private static instance: FlowGuardService;
  private locks = new Map<string, FlowGuardLock>();
  private entryGuards = new Map<string, EntryGuard>();
  private readonly LOCK_TIMEOUT_MS = 30000; // 30 seconds auto-release
  private readonly ENTRY_GUARD_TIMEOUT_MS = 60000; // 1 minute deduplication window
  
  static getInstance(): FlowGuardService {
    if (!FlowGuardService.instance) {
      FlowGuardService.instance = new FlowGuardService();
      FlowGuardService.instance.startWatchdog();
    }
    return FlowGuardService.instance;
  }

  /**
   * Check if user can enter a specific flow stage
   * Returns enhanced result with reason codes for Decision Trace
   */
  async canEnterFlow(
    phone: string,
    flowName: string,
    stage: string,
    messageHash?: string
  ): Promise<GuardCheckResult> {
    try {
      const lockKey = this.getLockKey(phone, flowName);
      
      // Check for active lock
      const existingLock = this.locks.get(lockKey);
      if (existingLock && !this.isLockExpired(existingLock)) {
        console.log(`🔒 FlowGuard: User ${phone} locked in ${flowName} stage ${existingLock.stage}`);
        return {
          canProceed: false,
          reason: 'user_locked',
          reasonCode: FlowGuardReasonCode.USER_LOCKED,
          suggestedAction: 'wait_for_completion',
          currentStage: existingLock.stage
        };
      }

      // Check for duplicate entry (same message within time window)
      if (messageHash) {
        const entryKey = this.getEntryKey(phone, flowName);
        const existingEntry = this.entryGuards.get(entryKey);
        
        if (existingEntry && 
            existingEntry.messageHash === messageHash &&
            !this.isEntryGuardExpired(existingEntry)) {
          console.log(`⏭️ FlowGuard: Duplicate entry detected for ${phone} in ${flowName}`);
          return {
            canProceed: false,
            reason: 'duplicate_entry',
            reasonCode: FlowGuardReasonCode.DUPLICATE_ENTRY,
            suggestedAction: 'skip_silently'
          };
        }
      }

      // Check session state
      const session = await getUserSession(phone);
      const sessionStage = (session.conversationData as any)?.[`${flowName}_stage`];
      
      // If session is in awaiting state, must wait for user input
      const awaitingStages = [
        'awaiting_music_input',
        'awaiting_video_input',
        'awaiting_movie_input',
        'awaiting_capacity_input',
        'awaiting_shipping_data',
        'awaiting_payment_data'
      ];
      
      if (awaitingStages.includes(sessionStage) && stage === 'entry') {
        console.log(`⏳ FlowGuard: User ${phone} in awaiting state: ${sessionStage}`);
        return {
          canProceed: false,
          reason: 'awaiting_user_input',
          reasonCode: FlowGuardReasonCode.AWAITING_USER_INPUT,
          suggestedAction: 'skip_silently',
          currentStage: sessionStage
        };
      }

      return {
        canProceed: true,
        reasonCode: FlowGuardReasonCode.CAN_PROCEED,
        suggestedAction: 'proceed'
      };
    } catch (error) {
      console.error('❌ FlowGuard: Error in canEnterFlow:', error);
      // Fail-safe: allow entry on error
      return {
        canProceed: true,
        reason: 'error_allow_entry',
        reasonCode: FlowGuardReasonCode.ERROR_ALLOW_ENTRY,
        suggestedAction: 'proceed'
      };
    }
  }

  /**
   * Check if a message should be deferred to an active flow
   * This is called before routing to check for flow continuity
   * 
   * @param phone - User's phone number
   * @param targetFlowName - The flow the router wants to route to
   * @returns GuardCheckResult with deferral info
   */
  async checkFlowDeferral(
    phone: string,
    targetFlowName: string
  ): Promise<GuardCheckResult> {
    try {
      const session = await getUserSession(phone);
      const currentFlow = session.currentFlow;
      const currentStage = session.stage;
      
      // If user is in an active flow with an awaiting state, defer to that flow
      const awaitingStages = [
        'awaiting_capacity',
        'awaiting_payment',
        'checkout_started',
        'customizing',
        'pricing'
      ];
      
      if (currentFlow && 
          currentFlow !== 'initial' && 
          currentFlow !== 'welcomeFlow' &&
          currentStage && 
          awaitingStages.includes(currentStage)) {
        
        // Allow if routing to the same flow
        if (targetFlowName === currentFlow) {
          return {
            canProceed: true,
            reasonCode: FlowGuardReasonCode.CAN_PROCEED,
            suggestedAction: 'proceed',
            currentStage
          };
        }
        
        // Defer to active flow
        console.log(`↩️ FlowGuard: Deferring ${targetFlowName} to active flow ${currentFlow}/${currentStage}`);
        return {
          canProceed: false,
          reason: `User in active flow: ${currentFlow}/${currentStage}`,
          reasonCode: FlowGuardReasonCode.DEFER_TO_ACTIVE_FLOW,
          suggestedAction: 'defer_to_active_flow',
          currentStage,
          activeFlowId: currentFlow
        };
      }
      
      return {
        canProceed: true,
        reasonCode: FlowGuardReasonCode.CAN_PROCEED,
        suggestedAction: 'proceed'
      };
    } catch (error) {
      console.error('❌ FlowGuard: Error checking flow deferral:', error);
      return {
        canProceed: true,
        reason: 'error_allow_entry',
        reasonCode: FlowGuardReasonCode.ERROR_ALLOW_ENTRY,
        suggestedAction: 'proceed'
      };
    }
  }

  /**
   * Acquire a lock for flow processing
   */
  async acquireLock(
    phone: string,
    flowName: string,
    stage: string
  ): Promise<{ success: boolean; lockId?: string }> {
    try {
      const lockKey = this.getLockKey(phone, flowName);
      const existingLock = this.locks.get(lockKey);

      // Clean up expired lock
      if (existingLock && this.isLockExpired(existingLock)) {
        console.log(`🧹 FlowGuard: Cleaning up expired lock for ${phone}`);
        this.locks.delete(lockKey);
      }

      // Check if already locked
      if (this.locks.has(lockKey)) {
        console.log(`⛔ FlowGuard: Cannot acquire lock - already locked for ${phone}`);
        return { success: false };
      }

      // Create new lock
      const lockId = `${phone}_${flowName}_${Date.now()}`;
      const lock: FlowGuardLock = {
        phone,
        stage,
        timestamp: Date.now(),
        flowName,
        lockId
      };

      this.locks.set(lockKey, lock);
      console.log(`🔐 FlowGuard: Lock acquired for ${phone} in ${flowName} (stage: ${stage})`);

      // Update session with lock state
      await this.updateSessionLockState(phone, flowName, stage, 'locked');

      return { success: true, lockId };
    } catch (error) {
      console.error('❌ FlowGuard: Error acquiring lock:', error);
      return { success: false };
    }
  }

  /**
   * Release a lock
   */
  async releaseLock(phone: string, flowName: string, lockId?: string): Promise<void> {
    try {
      const lockKey = this.getLockKey(phone, flowName);
      const existingLock = this.locks.get(lockKey);

      // Verify lock ownership if lockId provided
      if (lockId && existingLock && existingLock.lockId !== lockId) {
        console.warn(`⚠️ FlowGuard: Lock ID mismatch for ${phone} - not releasing`);
        return;
      }

      if (existingLock) {
        this.locks.delete(lockKey);
        console.log(`🔓 FlowGuard: Lock released for ${phone} in ${flowName}`);
        
        // Update session
        await this.updateSessionLockState(phone, flowName, existingLock.stage, 'released');
      }
    } catch (error) {
      console.error('❌ FlowGuard: Error releasing lock:', error);
    }
  }

  /**
   * Mark an entry as handled to prevent duplicates
   */
  markEntryHandled(phone: string, flowName: string, messageHash: string): void {
    try {
      const entryKey = this.getEntryKey(phone, flowName);
      const entry: EntryGuard = {
        phone,
        flowName,
        messageHash,
        handledAt: Date.now()
      };

      this.entryGuards.set(entryKey, entry);
      console.log(`✅ FlowGuard: Entry marked as handled for ${phone} in ${flowName}`);
    } catch (error) {
      console.error('❌ FlowGuard: Error marking entry:', error);
    }
  }

  /**
   * Clear all guards for a user (useful on flow completion)
   */
  async clearUserGuards(phone: string, flowName?: string): Promise<void> {
    try {
      if (flowName) {
        // Clear specific flow
        const lockKey = this.getLockKey(phone, flowName);
        const entryKey = this.getEntryKey(phone, flowName);
        this.locks.delete(lockKey);
        this.entryGuards.delete(entryKey);
        console.log(`🧹 FlowGuard: Cleared guards for ${phone} in ${flowName}`);
      } else {
        // Clear all flows for user
        for (const [key, lock] of this.locks.entries()) {
          if (lock.phone === phone) {
            this.locks.delete(key);
          }
        }
        for (const [key, entry] of this.entryGuards.entries()) {
          if (entry.phone === phone) {
            this.entryGuards.delete(key);
          }
        }
        console.log(`🧹 FlowGuard: Cleared all guards for ${phone}`);
      }
    } catch (error) {
      console.error('❌ FlowGuard: Error clearing guards:', error);
    }
  }

  /**
   * Set user stage in a flow (awaiting_input, processing, etc.)
   */
  async setUserStage(
    phone: string,
    flowName: string,
    stage: string
  ): Promise<void> {
    try {
      const session = await getUserSession(phone);
      session.conversationData = session.conversationData || {};
      (session.conversationData as any)[`${flowName}_stage`] = stage;
      (session.conversationData as any)[`${flowName}_stage_at`] = new Date().toISOString();
      
      await updateUserSession(
        phone,
        `Stage set to ${stage}`,
        flowName,
        stage,
        false,
        { metadata: { stageChange: true, previousStage: session.stage } }
      );
      
      console.log(`📍 FlowGuard: Set stage for ${phone} in ${flowName}: ${stage}`);
    } catch (error) {
      console.error('❌ FlowGuard: Error setting user stage:', error);
    }
  }

  /**
   * Get current user stage in a flow
   */
  async getUserStage(phone: string, flowName: string): Promise<string | null> {
    try {
      const session = await getUserSession(phone);
      return (session.conversationData as any)?.[`${flowName}_stage`] || null;
    } catch (error) {
      console.error('❌ FlowGuard: Error getting user stage:', error);
      return null;
    }
  }

  // Private helper methods

  private getLockKey(phone: string, flowName: string): string {
    return `${phone}:${flowName}`;
  }

  private getEntryKey(phone: string, flowName: string): string {
    return `entry:${phone}:${flowName}`;
  }

  private isLockExpired(lock: FlowGuardLock): boolean {
    return Date.now() - lock.timestamp > this.LOCK_TIMEOUT_MS;
  }

  private isEntryGuardExpired(entry: EntryGuard): boolean {
    return Date.now() - entry.handledAt > this.ENTRY_GUARD_TIMEOUT_MS;
  }

  private async updateSessionLockState(
    phone: string,
    flowName: string,
    stage: string,
    action: 'locked' | 'released'
  ): Promise<void> {
    try {
      const session = await getUserSession(phone);
      session.conversationData = session.conversationData || {};
      (session.conversationData as any)[`${flowName}_lock_state`] = action;
      (session.conversationData as any)[`${flowName}_lock_at`] = new Date().toISOString();
    } catch (error) {
      console.error('❌ FlowGuard: Error updating session lock state:', error);
    }
  }

  /**
   * Watchdog: Clean up expired locks and entries
   */
  private startWatchdog(): void {
    setInterval(() => {
      let cleanedLocks = 0;
      let cleanedEntries = 0;

      // Clean expired locks
      for (const [key, lock] of this.locks.entries()) {
        if (this.isLockExpired(lock)) {
          this.locks.delete(key);
          cleanedLocks++;
        }
      }

      // Clean expired entry guards
      for (const [key, entry] of this.entryGuards.entries()) {
        if (this.isEntryGuardExpired(entry)) {
          this.entryGuards.delete(key);
          cleanedEntries++;
        }
      }

      if (cleanedLocks > 0 || cleanedEntries > 0) {
        console.log(`🧹 FlowGuard Watchdog: Cleaned ${cleanedLocks} locks, ${cleanedEntries} entries`);
      }
    }, 60000); // Run every minute

    console.log('👁️ FlowGuard Watchdog: Started (cleanup every 60s)');
  }

  /**
   * Get system statistics
   */
  getStats() {
    return {
      activeLocks: this.locks.size,
      activeEntryGuards: this.entryGuards.size,
      locks: Array.from(this.locks.values()).map(lock => ({
        phone: lock.phone,
        flowName: lock.flowName,
        stage: lock.stage,
        ageSeconds: Math.floor((Date.now() - lock.timestamp) / 1000)
      }))
    };
  }

  /**
   * Check if user has a confirmed or active order
   * Used to prevent promotional messages when order is already in progress
   */
  async hasConfirmedOrActiveOrder(phone: string): Promise<boolean> {
    try {
      const session = await getUserSession(phone);
      
      // Check if session has order data with confirmed status or beyond
      if (session.orderData && session.orderData.orderNumber) {
        const orderId = session.orderData.orderNumber;
        
        // Check order state in OrderStateManager
        const isConfirmed = orderStateManager.isConfirmedOrBeyond(orderId);
        if (isConfirmed) {
          console.log(`🔒 FlowGuard: User ${phone} has confirmed/active order ${orderId}`);
          return true;
        }
      }

      // Additional check: Look for order status in session (supports both uppercase and lowercase)
      const orderStatus = session.orderData?.status;
      if (orderStatus) {
        const normalizedStatus = orderStatus.toUpperCase();
        const confirmedStates = [
          'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED',
          'PAID' // Legacy status
        ];
        
        if (confirmedStates.includes(normalizedStatus)) {
          console.log(`🔒 FlowGuard: User ${phone} has order in status ${orderStatus}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('❌ FlowGuard: Error checking order status:', error);
      return false; // Fail-safe: allow if error
    }
  }

  /**
   * Check if user is in cooldown period
   * Returns true if cooldown_until is set and still active
   */
  async isInCooldown(phone: string): Promise<{ inCooldown: boolean; until?: Date }> {
    try {
      const session = await getUserSession(phone);
      
      // Check if cooldown_until is set
      if (session.cooldownUntil) {
        const cooldownEnd = new Date(session.cooldownUntil);
        const now = new Date();
        
        if (cooldownEnd > now) {
          console.log(`⏱️ FlowGuard: User ${phone} in cooldown until ${cooldownEnd.toISOString()}`);
          return { inCooldown: true, until: cooldownEnd };
        } else {
          // Cooldown expired - clear it
          console.log(`✅ FlowGuard: Cooldown expired for ${phone}, clearing...`);
          return { inCooldown: false };
        }
      }

      return { inCooldown: false };
    } catch (error) {
      console.error('❌ FlowGuard: Error checking cooldown:', error);
      return { inCooldown: false }; // Fail-safe: allow if error
    }
  }

  /**
   * Check if promotional messages should be blocked
   * Blocks "última llamada" promos when status >= CONFIRMED
   */
  async shouldBlockPromo(phone: string, promoType: 'capacity' | 'last_call' | 'general' = 'general'): Promise<{ 
    blocked: boolean; 
    reason?: string 
  }> {
    try {
      // Check if user has confirmed order
      const hasOrder = await this.hasConfirmedOrActiveOrder(phone);
      if (hasOrder) {
        console.log(`🚫 FlowGuard: Blocking ${promoType} promo for ${phone} - has active order`);
        return { 
          blocked: true, 
          reason: 'User has confirmed or active order' 
        };
      }

      // Check cooldown for follow-up type promos
      if (promoType === 'last_call' || promoType === 'capacity') {
        const cooldown = await this.isInCooldown(phone);
        if (cooldown.inCooldown) {
          console.log(`🚫 FlowGuard: Blocking ${promoType} promo for ${phone} - in cooldown`);
          return { 
            blocked: true, 
            reason: `User in cooldown until ${cooldown.until?.toISOString()}` 
          };
        }
      }

      return { blocked: false };
    } catch (error) {
      console.error('❌ FlowGuard: Error checking promo block:', error);
      return { blocked: false }; // Fail-safe: allow if error
    }
  }

  /**
   * Check if follow-up messages should be blocked
   * Blocks when cooldown_until is active OR when order is confirmed
   */
  async shouldBlockFollowUp(phone: string): Promise<{ 
    blocked: boolean; 
    reason?: string 
  }> {
    try {
      // Check cooldown first
      const cooldown = await this.isInCooldown(phone);
      if (cooldown.inCooldown) {
        console.log(`🚫 FlowGuard: Blocking follow-up for ${phone} - in cooldown`);
        return { 
          blocked: true, 
          reason: `User in cooldown until ${cooldown.until?.toISOString()}` 
        };
      }

      // Check if user has confirmed order
      const hasOrder = await this.hasConfirmedOrActiveOrder(phone);
      if (hasOrder) {
        console.log(`🚫 FlowGuard: Blocking follow-up for ${phone} - has active order`);
        return { 
          blocked: true, 
          reason: 'User has confirmed or active order' 
        };
      }

      return { blocked: false };
    } catch (error) {
      console.error('❌ FlowGuard: Error checking follow-up block:', error);
      return { blocked: false }; // Fail-safe: allow if error
    }
  }
}

// Export singleton instance
export const flowGuard = FlowGuardService.getInstance();

// Export utility function for creating message hashes
export function createMessageHash(message: string): string {
  // Simple hash for deduplication
  return Buffer.from(message.substring(0, 100)).toString('base64');
}

console.log('✅ FlowGuard Service initialized with watchdog');
