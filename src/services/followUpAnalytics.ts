/**
 * Follow-up Analytics Service
 * Tracks and analyzes follow-up message effectiveness
 * to optimize timing and content strategies
 */

import type { UserSession } from '../../types/global';
import { getMessageHistory } from './messageHistoryAnalyzer';
import { getUserInterests, calculatePurchaseReadiness } from './userIntentionAnalyzer';

/**
 * Follow-up effectiveness metrics
 */
export interface FollowUpMetrics {
  totalFollowUpsSent: number;
  totalResponses: number;
  responseRate: number;
  averageResponseTimeHours: number;
  conversionRate: number;
  
  // Breakdown by attempt number
  byAttempt: {
    attempt1: { sent: number; responded: number; responseRate: number };
    attempt2: { sent: number; responded: number; responseRate: number };
    attempt3: { sent: number; responded: number; responseRate: number };
  };
  
  // Breakdown by message category
  byCategory: Record<string, {
    sent: number;
    responded: number;
    responseRate: number;
    averageResponseTimeHours: number;
  }>;
  
  // Breakdown by day of week
  byDayOfWeek: Record<string, {
    sent: number;
    responded: number;
    responseRate: number;
  }>;
  
  // Breakdown by hour of day
  byHourOfDay: Record<number, {
    sent: number;
    responded: number;
    responseRate: number;
  }>;
}

/**
 * User journey metrics
 */
export interface UserJourneyMetrics {
  phone: string;
  name?: string;
  totalInteractions: number;
  totalFollowUps: number;
  followUpResponseRate: number;
  purchaseReadiness: number;
  daysSinceFirstContact: number;
  daysSinceLastInteraction: number;
  currentStage: string;
  buyingIntent: 'low' | 'medium' | 'high';
  mainObjection?: string;
  recommendedAction: string;
}

/**
 * Global analytics state
 */
interface AnalyticsState {
  totalSessions: number;
  activeFollowUps: number;
  completedConversions: number;
  lastUpdated: Date;
  metrics: FollowUpMetrics;
}

const analyticsState: AnalyticsState = {
  totalSessions: 0,
  activeFollowUps: 0,
  completedConversions: 0,
  lastUpdated: new Date(),
  metrics: {
    totalFollowUpsSent: 0,
    totalResponses: 0,
    responseRate: 0,
    averageResponseTimeHours: 0,
    conversionRate: 0,
    byAttempt: {
      attempt1: { sent: 0, responded: 0, responseRate: 0 },
      attempt2: { sent: 0, responded: 0, responseRate: 0 },
      attempt3: { sent: 0, responded: 0, responseRate: 0 }
    },
    byCategory: {},
    byDayOfWeek: {},
    byHourOfDay: {}
  }
};

/**
 * Calculate metrics from a single session
 */
export function calculateSessionMetrics(session: UserSession): UserJourneyMetrics {
  const messageHistory = getMessageHistory(session);
  const userInterests = getUserInterests(session);
  const purchaseReadiness = calculatePurchaseReadiness(session);
  
  const daysSinceFirstContact = session.createdAt
    ? Math.floor((Date.now() - new Date(session.createdAt as any).getTime()) / (24 * 60 * 60 * 1000))
    : 0;
  
  const daysSinceLastInteraction = session.lastInteraction
    ? Math.floor((Date.now() - new Date(session.lastInteraction as any).getTime()) / (24 * 60 * 60 * 1000))
    : 0;
  
  // Determine recommended action
  let recommendedAction = 'Monitor';
  
  if (purchaseReadiness >= 70) {
    recommendedAction = 'Send closing offer';
  } else if (purchaseReadiness >= 50) {
    recommendedAction = 'Send value-focused follow-up';
  } else if (purchaseReadiness >= 30) {
    recommendedAction = 'Send re-engagement message';
  } else if (daysSinceLastInteraction > 7) {
    recommendedAction = 'Mark as stale';
  }
  
  return {
    phone: session.phone,
    name: session.name,
    totalInteractions: session.interactions?.length || 0,
    totalFollowUps: messageHistory.totalFollowUpsSent,
    followUpResponseRate: messageHistory.responseRate,
    purchaseReadiness,
    daysSinceFirstContact,
    daysSinceLastInteraction,
    currentStage: session.stage || 'initial',
    buyingIntent: userInterests.buyingIntent,
    mainObjection: userInterests.mainObjection,
    recommendedAction
  };
}

/**
 * Calculate aggregate metrics from all sessions
 */
export function calculateAggregateMetrics(sessions: any): FollowUpMetrics {
  const metrics: FollowUpMetrics = {
    totalFollowUpsSent: 0,
    totalResponses: 0,
    responseRate: 0,
    averageResponseTimeHours: 0,
    conversionRate: 0,
    byAttempt: {
      attempt1: { sent: 0, responded: 0, responseRate: 0 },
      attempt2: { sent: 0, responded: 0, responseRate: 0 },
      attempt3: { sent: 0, responded: 0, responseRate: 0 }
    },
    byCategory: {},
    byDayOfWeek: {},
    byHourOfDay: {}
  };
  
  let totalResponseTime = 0;
  let responseCount = 0;
  let conversions = 0;
  
  // Initialize day of week and hour counters
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const day of daysOfWeek) {
    metrics.byDayOfWeek[day] = { sent: 0, responded: 0, responseRate: 0 };
  }
  
  for (let hour = 0; hour < 24; hour++) {
    metrics.byHourOfDay[hour] = { sent: 0, responded: 0, responseRate: 0 };
  }
  
  // Aggregate from all sessions
  for (const session of sessions.values()) {
    const messageHistory = getMessageHistory(session);
    
    metrics.totalFollowUpsSent += messageHistory.totalFollowUpsSent;
    metrics.totalResponses += messageHistory.totalResponsesReceived;
    
    // Track conversions
    if (session.stage === 'converted' || session.stage === 'completed') {
      conversions++;
    }
    
    // Process each message for detailed analytics
    for (const msg of messageHistory.messages) {
      if (msg.type !== 'follow_up') continue;
      
      const msgDate = new Date(msg.timestamp as any);
      const dayOfWeek = daysOfWeek[msgDate.getDay()];
      const hour = msgDate.getHours();
      
      // Track by day of week
      metrics.byDayOfWeek[dayOfWeek].sent++;
      if (msg.wasResponded) {
        metrics.byDayOfWeek[dayOfWeek].responded++;
      }
      
      // Track by hour of day
      metrics.byHourOfDay[hour].sent++;
      if (msg.wasResponded) {
        metrics.byHourOfDay[hour].responded++;
      }
      
      // Track by category
      if (msg.category) {
        if (!metrics.byCategory[msg.category]) {
          metrics.byCategory[msg.category] = {
            sent: 0,
            responded: 0,
            responseRate: 0,
            averageResponseTimeHours: 0
          };
        }
        metrics.byCategory[msg.category].sent++;
        if (msg.wasResponded) {
          metrics.byCategory[msg.category].responded++;
        }
      }
    }
  }
  
  // Calculate rates
  if (metrics.totalFollowUpsSent > 0) {
    metrics.responseRate = metrics.totalResponses / metrics.totalFollowUpsSent;
    metrics.conversionRate = conversions / sessions.size;
  }
  
  if (responseCount > 0) {
    metrics.averageResponseTimeHours = totalResponseTime / responseCount;
  }
  
  // Calculate rates for day of week
  for (const day of daysOfWeek) {
    const data = metrics.byDayOfWeek[day];
    if (data.sent > 0) {
      data.responseRate = data.responded / data.sent;
    }
  }
  
  // Calculate rates for hour of day
  for (let hour = 0; hour < 24; hour++) {
    const data = metrics.byHourOfDay[hour];
    if (data.sent > 0) {
      data.responseRate = data.responded / data.sent;
    }
  }
  
  // Calculate rates for categories
  for (const category in metrics.byCategory) {
    const data = metrics.byCategory[category];
    if (data.sent > 0) {
      data.responseRate = data.responded / data.sent;
    }
  }
  
  return metrics;
}

/**
 * Get top performing message categories
 */
export function getTopPerformingCategories(metrics: FollowUpMetrics, limit: number = 3): Array<{
  category: string;
  responseRate: number;
  sent: number;
}> {
  return Object.keys(metrics.byCategory)
    .map((category) => ({
      category,
      responseRate: metrics.byCategory[category].responseRate,
      sent: metrics.byCategory[category].sent
    }))
    .filter(item => item.sent >= 5) // Only categories with at least 5 sends
    .sort((a, b) => b.responseRate - a.responseRate)
    .slice(0, limit);
}

/**
 * Get best times to send follow-ups
 */
export function getBestFollowUpTimes(metrics: FollowUpMetrics): {
  bestHours: number[];
  bestDays: string[];
  worstHours: number[];
  worstDays: string[];
} {
  // Find best hours (top 3)
  const hourData = Object.keys(metrics.byHourOfDay)
    .map((hourStr) => {
      const hour = parseInt(hourStr);
      return { hour, ...metrics.byHourOfDay[hour] };
    })
    .filter(item => item.sent >= 3)
    .sort((a, b) => b.responseRate - a.responseRate);
  
  const bestHours = hourData.slice(0, 3).map(item => item.hour);
  const worstHours = hourData.slice(-3).map(item => item.hour);
  
  // Find best days (top 3)
  const dayData = Object.keys(metrics.byDayOfWeek)
    .map((day) => ({ day, ...metrics.byDayOfWeek[day] }))
    .filter(item => item.sent >= 3)
    .sort((a, b) => b.responseRate - a.responseRate);
  
  const bestDays = dayData.slice(0, 3).map(item => item.day);
  const worstDays = dayData.slice(-3).map(item => item.day);
  
  return { bestHours, bestDays, worstHours, worstDays };
}

/**
 * Get users who need immediate attention
 */
export function getUsersNeedingAttention(sessions: any): UserJourneyMetrics[] {
  const needsAttention: UserJourneyMetrics[] = [];
  
  const sessionsArray: UserSession[] = [];
  sessions.forEach((session: UserSession) => {
    sessionsArray.push(session);
  });
  
  for (const session of sessionsArray) {
    const metrics = calculateSessionMetrics(session);
    
    // High purchase readiness but hasn't completed
    const completedStages = ['converted', 'completed'];
    if (metrics.purchaseReadiness >= 60 && 
        completedStages.indexOf(metrics.currentStage) === -1) {
      needsAttention.push(metrics);
    }
    // Has been interacting but stalled
    else if (metrics.totalInteractions >= 5 && 
             metrics.daysSinceLastInteraction >= 2 &&
             metrics.daysSinceLastInteraction <= 7) {
      needsAttention.push(metrics);
    }
    // Sent follow-ups but no response
    else if (metrics.totalFollowUps >= 2 && 
             metrics.followUpResponseRate < 0.3 &&
             metrics.daysSinceLastInteraction <= 5) {
      needsAttention.push(metrics);
    }
  }
  
  // Sort by purchase readiness (highest first)
  return needsAttention.sort((a, b) => b.purchaseReadiness - a.purchaseReadiness);
}

/**
 * Generate analytics report
 */
export function generateAnalyticsReport(sessions: any): {
  summary: string;
  metrics: FollowUpMetrics;
  topCategories: Array<{ category: string; responseRate: number; sent: number }>;
  bestTimes: ReturnType<typeof getBestFollowUpTimes>;
  usersNeedingAttention: UserJourneyMetrics[];
} {
  const metrics = calculateAggregateMetrics(sessions);
  const topCategories = getTopPerformingCategories(metrics);
  const bestTimes = getBestFollowUpTimes(metrics);
  const usersNeedingAttention = getUsersNeedingAttention(sessions);
  
  const summary = `
📊 Follow-up Analytics Report
================================
Total Follow-ups Sent: ${metrics.totalFollowUpsSent}
Total Responses: ${metrics.totalResponses}
Response Rate: ${(metrics.responseRate * 100).toFixed(1)}%
Conversion Rate: ${(metrics.conversionRate * 100).toFixed(1)}%

🏆 Top Performing Categories:
${topCategories.map((cat, i) => 
  `${i + 1}. ${cat.category}: ${(cat.responseRate * 100).toFixed(1)}% (${cat.sent} sent)`
).join('\n')}

⏰ Best Times to Send:
Hours: ${bestTimes.bestHours.map(h => `${h}:00`).join(', ')}
Days: ${bestTimes.bestDays.join(', ')}

⚠️ Users Needing Attention: ${usersNeedingAttention.length}
`;
  
  return {
    summary,
    metrics,
    topCategories,
    bestTimes,
    usersNeedingAttention
  };
}

/**
 * Update analytics state
 */
export function updateAnalyticsState(sessions: any): void {
  let totalSessions = 0;
  let activeFollowUps = 0;
  let completedConversions = 0;
  
  sessions.forEach((session: UserSession) => {
    totalSessions++;
    if ((session.followUpAttempts || 0) > 0 && (session.followUpAttempts || 0) < 3) {
      activeFollowUps++;
    }
    if (session.stage === 'converted' || session.stage === 'completed') {
      completedConversions++;
    }
  });
  
  analyticsState.totalSessions = totalSessions;
  analyticsState.activeFollowUps = activeFollowUps;
  analyticsState.completedConversions = completedConversions;
  analyticsState.metrics = calculateAggregateMetrics(sessions);
  analyticsState.lastUpdated = new Date();
}

/**
 * Get current analytics state
 */
export function getAnalyticsState(): AnalyticsState {
  return analyticsState;
}

console.log('✅ Follow-up Analytics Service initialized');
