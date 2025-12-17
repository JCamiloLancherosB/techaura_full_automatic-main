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
    // Classify the user's response
    const classification = classifyResponse(message);
    
    console.log(`📨 Message from ${phone}: "${message.substring(0, 50)}..." - Category: ${classification.category} (${classification.confidence})`);
    
    let statusChanged = false;
    let newStatus = session.contactStatus || 'ACTIVE';
    const updates: Partial<UserSession> = {
      lastUserReplyAt: new Date(),
      lastUserReplyCategory: classification.category
    };
    
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
