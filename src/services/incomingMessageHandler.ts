/**
 * Incoming Message Handler
 * Processes incoming user messages and updates contact status based on response classification
 */

import { classifyResponse, shouldOptOut, shouldMarkClosed, isSimpleConfirmation, showsInterest } from './responseClassifier';
import { businessDB } from '../mysql-database';
import type { UserSession } from '../../types/global';

/**
 * Process incoming user message and update session status
 */
export async function processIncomingMessage(
  phone: string,
  message: string,
  session: UserSession
): Promise<{
  updated: boolean;
  statusChanged: boolean;
  newStatus?: 'ACTIVE' | 'OPT_OUT' | 'CLOSED';
  classification?: any;
}> {
  try {
    // First, check if user's cooldown has expired and clear it if needed
    await clearCooldownIfExpired(session);
    
    // Classify the user's response
    const classification = classifyResponse(message);
    
    console.log(`📨 Message from ${phone}: "${message.substring(0, 50)}..." - Category: ${classification.category} (${classification.confidence})`);
    
    let statusChanged = false;
    let newStatus = session.contactStatus || 'ACTIVE';
    const updates: Partial<UserSession> = {
      lastUserReplyAt: new Date(),
      lastInteraction: new Date(), // CRITICAL: Always update lastInteraction for follow-up timing
      lastUserReplyCategory: classification.category,
      // RESET follow-up attempts when user responds - they're engaged again
      followUpAttempts: 0,
      lastFollowUpAttemptResetAt: new Date()
    };
    
    // Clear follow-up queue entries for this user when they respond
    // This prevents sending scheduled follow-ups when user is actively engaging
    if (global.followUpQueueManager) {
      try {
        (global.followUpQueueManager as any).remove?.(phone);
        console.log(`🧹 Cleared follow-up queue entry for ${phone} (user responded)`);
      } catch (err) {
        console.warn(`⚠️ Could not clear follow-up queue for ${phone}:`, err);
      }
    }
    
    // Handle OPT-OUT requests
    if (shouldOptOut(message)) {
      console.log(`🚫 User ${phone} wants to opt-out. Marking as OPT_OUT.`);
      updates.contactStatus = 'OPT_OUT';
      newStatus = 'OPT_OUT';
      statusChanged = true;
      
      // Add opt-out tag if not already present
      if (!session.tags) session.tags = [];
      if (!session.tags.includes('blacklist')) {
        session.tags.push('blacklist');
      }
    }
    // Handle CLOSED (already decided/completed) status
    else if (shouldMarkClosed(message)) {
      console.log(`✅ User ${phone} indicated completion. Marking as CLOSED.`);
      updates.contactStatus = 'CLOSED';
      newStatus = 'CLOSED';
      statusChanged = true;
      
      // Update stage to converted or completed
      if (session.stage !== 'converted' && session.stage !== 'completed') {
        updates.stage = 'converted';
      }
      
      // Add decision_made tag
      if (!session.tags) session.tags = [];
      if (!session.tags.includes('decision_made')) {
        session.tags.push('decision_made');
      }
    }
    // Handle simple confirmations (don't trigger more follow-ups immediately)
    else if (isSimpleConfirmation(message)) {
      console.log(`👍 User ${phone} sent a simple confirmation.`);
      // Don't change status, but record the response
      // This will prevent immediate follow-ups via the lastUserReplyAt timestamp
    }
    // Handle positive interest (re-engage)
    else if (showsInterest(message)) {
      console.log(`💚 User ${phone} shows interest. Re-engaging if needed.`);
      
      // If user was OPT_OUT or CLOSED, reactivate them
      if (session.contactStatus === 'OPT_OUT' || session.contactStatus === 'CLOSED') {
        console.log(`🔄 Reactivating user ${phone} from ${session.contactStatus} to ACTIVE`);
        updates.contactStatus = 'ACTIVE';
        newStatus = 'ACTIVE';
        statusChanged = true;
        
        // Remove blacklist tag if present
        if (session.tags && session.tags.includes('blacklist')) {
          session.tags = session.tags.filter(t => t !== 'blacklist');
        }
      }
    }
    // Fallback: any non-negative message from CLOSED user should reactivate them
    // (separate from showsInterest above to catch neutral messages like greetings)
    else if (session.contactStatus === 'CLOSED') {
      console.log(`🔄 User ${phone} sent a new message while CLOSED. Reactivating to ACTIVE.`);
      updates.contactStatus = 'ACTIVE';
      newStatus = 'ACTIVE';
      statusChanged = true;
    }
    
    // Update session in database
    const updated = await businessDB.updateUserSession(phone, updates);
    
    // Update in-memory session if it exists
    if (global.userSessions && global.userSessions.has(phone)) {
      const memSession = global.userSessions.get(phone);
      if (memSession) {
        Object.assign(memSession, updates);
        global.userSessions.set(phone, memSession);
      }
    }
    
    return {
      updated,
      statusChanged,
      newStatus: statusChanged ? newStatus : undefined,
      classification
    };
  } catch (error) {
    console.error(`❌ Error processing incoming message from ${phone}:`, error);
    return {
      updated: false,
      statusChanged: false
    };
  }
}

/**
 * Check if user can receive follow-ups based on contact status
 */
export function canReceiveFollowUps(session: UserSession): { can: boolean; reason?: string } {
  // Check if user is in active cooldown period
  const cooldownCheck = isInCooldown(session);
  if (cooldownCheck.inCooldown) {
    const hours = cooldownCheck.remainingHours?.toFixed(1) || '?';
    return { can: false, reason: `User in cooldown (${hours}h remaining)` };
  }
  
  // Check contact status
  if (session.contactStatus === 'OPT_OUT') {
    return { can: false, reason: 'User opted out' };
  }
  
  if (session.contactStatus === 'CLOSED') {
    return { can: false, reason: 'User already completed/decided' };
  }
  
  // Check blacklist tag (legacy support)
  if (session.tags && session.tags.includes('blacklist')) {
    return { can: false, reason: 'User is blacklisted' };
  }
  
  // Check do_not_disturb tag
  if (session.tags && session.tags.includes('do_not_disturb')) {
    return { can: false, reason: 'User marked as do not disturb' };
  }
  
  return { can: true };
}

/**
 * Reset 24-hour follow-up counter if needed
 */
export async function resetFollowUpCounterIfNeeded(session: UserSession): Promise<boolean> {
  const now = new Date();
  const lastReset = session.lastFollowUpResetAt;
  
  // If never reset, or reset was more than 24 hours ago
  if (!lastReset || (now.getTime() - new Date(lastReset).getTime()) >= 24 * 60 * 60 * 1000) {
    console.log(`🔄 Resetting 24h follow-up counter for ${session.phone}`);
    
    const updates: Partial<UserSession> = {
      followUpCount24h: 0,
      lastFollowUpResetAt: now
    };
    
    const updated = await businessDB.updateUserSession(session.phone, updates);
    
    // Update in-memory session
    if (global.userSessions && global.userSessions.has(session.phone)) {
      const memSession = global.userSessions.get(session.phone);
      if (memSession) {
        memSession.followUpCount24h = 0;
        memSession.lastFollowUpResetAt = now;
        global.userSessions.set(session.phone, memSession);
      }
    }
    
    return updated;
  }
  
  return false;
}

/**
 * Increment follow-up counter
 */
export async function incrementFollowUpCounter(session: UserSession): Promise<boolean> {
  // Reset counter if needed first
  await resetFollowUpCounterIfNeeded(session);
  
  const currentCount = session.followUpCount24h || 0;
  const newCount = currentCount + 1;
  
  console.log(`📊 Incrementing follow-up counter for ${session.phone}: ${currentCount} -> ${newCount}`);
  
  const updates: Partial<UserSession> = {
    followUpCount24h: newCount
  };
  
  const updated = await businessDB.updateUserSession(session.phone, updates);
  
  // Update in-memory session
  if (global.userSessions && global.userSessions.has(session.phone)) {
    const memSession = global.userSessions.get(session.phone);
    if (memSession) {
      memSession.followUpCount24h = newCount;
      global.userSessions.set(session.phone, memSession);
    }
  }
  
  return updated;
}

/**
 * Check if user has reached daily follow-up limit
 */
export function hasReachedDailyLimit(session: UserSession): boolean {
  // Reset counter if needed (synchronous check)
  const now = new Date();
  const lastReset = session.lastFollowUpResetAt;
  
  if (lastReset && (now.getTime() - new Date(lastReset).getTime()) < 24 * 60 * 60 * 1000) {
    // Within 24h window, check the count
    const count = session.followUpCount24h || 0;
    return count >= 1; // MAX 1 follow-up per 24 hours
  }
  
  // If more than 24h, counter should be reset, so no limit reached
  return false;
}

/**
 * Reset follow-up attempts counter when user responds
 * This is called automatically when user sends any message
 */
export async function resetFollowUpAttempts(session: UserSession): Promise<boolean> {
  console.log(`🔄 Resetting follow-up attempts for ${session.phone} (user responded)`);
  
  const updates: Partial<UserSession> = {
    followUpAttempts: 0,
    lastFollowUpAttemptResetAt: new Date()
  };
  
  const updated = await businessDB.updateUserSession(session.phone, updates);
  
  // Update in-memory session
  if (global.userSessions && global.userSessions.has(session.phone)) {
    const memSession = global.userSessions.get(session.phone);
    if (memSession) {
      memSession.followUpAttempts = 0;
      memSession.lastFollowUpAttemptResetAt = new Date();
      global.userSessions.set(session.phone, memSession);
    }
  }
  
  return updated;
}

/**
 * Increment follow-up attempts counter (max 3 before marking as not interested)
 * After 3 attempts, user is marked as not interested with a 2-day cooldown
 */
export async function incrementFollowUpAttempts(session: UserSession): Promise<boolean> {
  const currentAttempts = session.followUpAttempts || 0;
  const newAttempts = currentAttempts + 1;
  
  console.log(`📊 Incrementing follow-up attempts for ${session.phone}: ${currentAttempts} -> ${newAttempts}`);
  
  const updates: Partial<UserSession> = {
    followUpAttempts: newAttempts
  };
  
  // If reached 3 attempts, mark as not interested and set 2-day cooldown
  if (newAttempts >= 3) {
    const now = new Date();
    const cooldownEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 2 days from now
    
    console.log(`🚫 User ${session.phone} reached 3 follow-up attempts - marking as not interested with 2-day cooldown until ${cooldownEnd.toISOString()}`);
    updates.contactStatus = 'CLOSED';
    updates.stage = 'not_interested';
    updates.cooldownUntil = cooldownEnd;
    updates.lastFollowUpAttemptResetAt = now; // Set cooldown start timestamp
    
    // Add tag to indicate user is not interested after multiple attempts
    if (!session.tags) session.tags = [];
    if (!session.tags.includes('not_interested')) {
      session.tags.push('not_interested');
    }
    if (!session.tags.includes('do_not_disturb')) {
      session.tags.push('do_not_disturb');
    }
  }
  
  const updated = await businessDB.updateUserSession(session.phone, updates);
  
  // Update in-memory session
  if (global.userSessions && global.userSessions.has(session.phone)) {
    const memSession = global.userSessions.get(session.phone);
    if (memSession) {
      memSession.followUpAttempts = newAttempts;
      if (newAttempts >= 3) {
        memSession.contactStatus = 'CLOSED';
        memSession.stage = 'not_interested';
        memSession.cooldownUntil = updates.cooldownUntil;
        memSession.lastFollowUpAttemptResetAt = updates.lastFollowUpAttemptResetAt;
        if (!memSession.tags) memSession.tags = [];
        if (!memSession.tags.includes('not_interested')) {
          memSession.tags.push('not_interested');
        }
        if (!memSession.tags.includes('do_not_disturb')) {
          memSession.tags.push('do_not_disturb');
        }
      }
      global.userSessions.set(session.phone, memSession);
    }
  }
  
  return updated;
}

/**
 * Check if user has reached maximum follow-up attempts (3)
 */
export function hasReachedMaxAttempts(session: UserSession): boolean {
  const attempts = session.followUpAttempts || 0;
  return attempts >= 3;
}

/**
 * Check if user is currently in cooldown period (2 days after 3 attempts)
 */
export function isInCooldown(session: UserSession): { inCooldown: boolean; remainingHours?: number } {
  if (!session.cooldownUntil) {
    return { inCooldown: false };
  }
  
  const now = new Date();
  const cooldownEnd = new Date(session.cooldownUntil);
  
  if (now < cooldownEnd) {
    const remainingMs = cooldownEnd.getTime() - now.getTime();
    const remainingHours = remainingMs / (60 * 60 * 1000);
    return { inCooldown: true, remainingHours };
  }
  
  // Cooldown has expired
  return { inCooldown: false };
}

/**
 * Clear cooldown and reset counters when user reinitiates conversation
 * This allows users to re-engage after cooldown period expires
 */
export async function clearCooldownIfExpired(session: UserSession): Promise<boolean> {
  const cooldownCheck = isInCooldown(session);
  
  // If not in cooldown or cooldown has expired, clear it
  if (!cooldownCheck.inCooldown && session.cooldownUntil) {
    console.log(`🔄 Clearing expired cooldown for ${session.phone}`);
    
    const updates: Partial<UserSession> = {
      cooldownUntil: null as any, // Explicitly set to null to clear DB field
      followUpAttempts: 0,
      contactStatus: 'ACTIVE',
      // Don't remove not_interested stage - let user interaction update it
    };
    
    // Remove do_not_disturb tag if present
    if (session.tags && session.tags.includes('do_not_disturb')) {
      session.tags = session.tags.filter(t => t !== 'do_not_disturb');
    }
    
    const updated = await businessDB.updateUserSession(session.phone, updates);
    
    // Update in-memory session
    if (global.userSessions && global.userSessions.has(session.phone)) {
      const memSession = global.userSessions.get(session.phone);
      if (memSession) {
        Object.assign(memSession, updates);
        if (memSession.tags) {
          memSession.tags = memSession.tags.filter(t => t !== 'do_not_disturb');
        }
        global.userSessions.set(session.phone, memSession);
      }
    }
    
    return updated;
  }
  
  return false;
}

/**
 * Ensure critical timestamps are updated consistently across all message handlers
 * This helper should be called from all message processing flows to maintain
 * accurate follow-up timing and prevent stale session issues
 * 
 * @param session - User session to update
 * @param phone - Phone number
 * @returns Promise<boolean> - Success status
 */
export async function updateCriticalTimestamps(
  phone: string,
  session: UserSession,
  additionalUpdates?: Partial<UserSession>
): Promise<boolean> {
  const now = new Date();
  
  const updates: Partial<UserSession> = {
    lastInteraction: now,
    lastUserReplyAt: now,
    ...additionalUpdates
  };
  
  console.log(`⏰ Updating critical timestamps for ${phone}`, {
    lastInteraction: now.toISOString(),
    lastUserReplyAt: now.toISOString()
  });
  
  // Update in database
  const updated = await businessDB.updateUserSession(phone, updates);
  
  // Update in-memory session
  if (global.userSessions && global.userSessions.has(phone)) {
    const memSession = global.userSessions.get(phone);
    if (memSession) {
      Object.assign(memSession, updates);
      global.userSessions.set(phone, memSession);
    }
  }
  
  return updated;
}
