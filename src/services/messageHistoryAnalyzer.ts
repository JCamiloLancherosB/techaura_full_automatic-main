/**
 * Message History Analyzer Service
 * Tracks and analyzes message history to prevent repetitive responses
 * and improve personalization based on past interactions
 */

import type { UserSession } from '../../types/global';

/**
 * Message record structure for history tracking
 */
export interface MessageRecord {
  timestamp: Date;
  content: string;
  type: 'follow_up' | 'response' | 'promotional' | 'informational';
  category?: string; // e.g., 'pricing', 'features', 'urgency', 'social_proof'
  templateId?: string;
  wasResponded: boolean;
}

/**
 * Message history structure stored in session
 */
export interface MessageHistory {
  messages: MessageRecord[];
  lastAnalyzedAt?: Date;
  totalFollowUpsSent: number;
  totalResponsesReceived: number;
  responseRate: number;
}

/**
 * Get message history from session
 */
export function getMessageHistory(session: UserSession): MessageHistory {
  const conversationData = session.conversationData || {};
  const messageHistory = (conversationData.messageHistory as MessageHistory) || {
    messages: [],
    totalFollowUpsSent: 0,
    totalResponsesReceived: 0,
    responseRate: 0
  };
  
  return messageHistory;
}

/**
 * Add a message to user's history
 */
export function addMessageToHistory(
  session: UserSession,
  content: string,
  type: 'follow_up' | 'response' | 'promotional' | 'informational',
  options?: {
    category?: string;
    templateId?: string;
  }
): void {
  if (!session.conversationData) {
    session.conversationData = {};
  }
  
  const history = getMessageHistory(session);
  
  const newMessage: MessageRecord = {
    timestamp: new Date(),
    content,
    type,
    category: options?.category,
    templateId: options?.templateId,
    wasResponded: false
  };
  
  history.messages.push(newMessage);
  
  // Keep only last 20 messages to avoid memory bloat
  if (history.messages.length > 20) {
    history.messages = history.messages.slice(-20);
  }
  
  // Update counters
  if (type === 'follow_up') {
    history.totalFollowUpsSent++;
  }
  
  // Update session
  session.conversationData.messageHistory = history;
  
  console.log(`📝 Added ${type} message to history for ${session.phone} (total: ${history.messages.length})`);
}

/**
 * Mark last follow-up message as responded
 */
export function markLastFollowUpAsResponded(session: UserSession): void {
  const history = getMessageHistory(session);
  
  // Find the most recent follow-up message
  for (let i = history.messages.length - 1; i >= 0; i--) {
    if (history.messages[i].type === 'follow_up' && !history.messages[i].wasResponded) {
      history.messages[i].wasResponded = true;
      history.totalResponsesReceived++;
      
      // Update response rate
      if (history.totalFollowUpsSent > 0) {
        history.responseRate = history.totalResponsesReceived / history.totalFollowUpsSent;
      }
      
      if (!session.conversationData) {
        session.conversationData = {};
      }
      session.conversationData.messageHistory = history;
      
      console.log(`✅ Marked last follow-up as responded for ${session.phone} (response rate: ${(history.responseRate * 100).toFixed(1)}%)`);
      break;
    }
  }
}

/**
 * Get recent message categories sent to user
 */
export function getRecentMessageCategories(session: UserSession, limit: number = 5): string[] {
  const history = getMessageHistory(session);
  
  return history.messages
    .slice(-limit)
    .filter(m => m.category)
    .map(m => m.category as string);
}

/**
 * Check if a similar message was recently sent
 */
export function wasSimilarMessageRecentlySent(
  session: UserSession,
  content: string,
  hoursAgo: number = 24
): boolean {
  const history = getMessageHistory(session);
  const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  
  // Get recent messages within timeframe
  const recentMessages = history.messages.filter(m => 
    new Date(m.timestamp) > cutoffTime
  );
  
  // Simple similarity check: if content shares >60% of words
  const normalizedContent = normalizeText(content);
  
  for (const msg of recentMessages) {
    const normalizedMsg = normalizeText(msg.content);
    const similarity = calculateTextSimilarity(normalizedContent, normalizedMsg);
    
    if (similarity > 0.6) {
      console.log(`⚠️ Similar message found in history (similarity: ${(similarity * 100).toFixed(1)}%)`);
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a specific category was recently used
 */
export function wasCategoryRecentlyUsed(
  session: UserSession,
  category: string,
  hoursAgo: number = 12
): boolean {
  const history = getMessageHistory(session);
  const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  
  return history.messages.some(m => 
    m.category === category && 
    new Date(m.timestamp) > cutoffTime
  );
}

/**
 * Get message statistics for analytics
 */
export function getMessageStats(session: UserSession): {
  totalSent: number;
  totalResponded: number;
  responseRate: number;
  averageResponseTime?: number;
  lastFollowUpDate?: Date;
  daysSinceLastFollowUp?: number;
} {
  const history = getMessageHistory(session);
  
  // Find last follow-up
  let lastFollowUp: MessageRecord | undefined;
  for (let i = history.messages.length - 1; i >= 0; i--) {
    if (history.messages[i].type === 'follow_up') {
      lastFollowUp = history.messages[i];
      break;
    }
  }
  
  const stats = {
    totalSent: history.totalFollowUpsSent,
    totalResponded: history.totalResponsesReceived,
    responseRate: history.responseRate,
    lastFollowUpDate: lastFollowUp ? new Date(lastFollowUp.timestamp) : undefined,
    daysSinceLastFollowUp: lastFollowUp 
      ? Math.floor((Date.now() - new Date(lastFollowUp.timestamp).getTime()) / (24 * 60 * 60 * 1000))
      : undefined
  };
  
  return stats;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Calculate text similarity using Jaccard coefficient
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(' '));
  const words2 = new Set(text2.split(' '));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 0;
  
  return intersection.size / union.size;
}

/**
 * Get recommended message type based on history
 */
export function getRecommendedMessageType(session: UserSession): string {
  const recentCategories = getRecentMessageCategories(session, 3);
  const history = getMessageHistory(session);
  
  // If no history, start with warm re-engagement
  if (history.messages.length === 0) {
    return 're-engage_warm';
  }
  
  // Avoid recently used categories
  const availableCategories = [
    're-engage_warm',
    'value_benefit',
    'discount_offer',
    'urgency_soft',
    'content_teaser',
    'social_proof'
  ];
  
  // Filter out recently used categories
  const freshCategories = availableCategories.filter(cat => 
    !recentCategories.includes(cat)
  );
  
  // If all categories were used, reset and use any
  if (freshCategories.length === 0) {
    return availableCategories[Math.floor(Math.random() * availableCategories.length)];
  }
  
  // Return a random fresh category
  return freshCategories[Math.floor(Math.random() * freshCategories.length)];
}

console.log('✅ Message History Analyzer Service initialized');
