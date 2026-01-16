/**
 * User Intention Analyzer Service
 * Extracts and tracks user interests, preferences, and intentions
 * from conversation history to enable personalized follow-ups
 */

import type { UserSession } from '../../types/global';

/**
 * User interests profile
 */
export interface UserInterests {
  // Content preferences
  contentType?: 'musica' | 'videos' | 'peliculas' | 'mixed';
  preferredCapacity?: string; // e.g., '32GB', '64GB'
  mentionedGenres: string[];
  mentionedArtists: string[];
  
  // Price sensitivity
  priceSensitive: boolean;
  budgetRange?: { min: number; max: number };
  askedAboutDiscounts: boolean;
  askedAboutPaymentPlans: boolean;
  
  // Purchase readiness
  buyingIntent: 'low' | 'medium' | 'high';
  urgencyLevel: 'low' | 'medium' | 'high';
  mainObjection?: string; // e.g., 'price', 'trust', 'need_time'
  
  // Interaction patterns
  preferredResponseTime?: 'immediate' | 'hours' | 'days';
  responseStyle?: 'brief' | 'detailed';
  engagementLevel: number; // 0-100
  
  // Journey tracking
  hasSeenPricing: boolean;
  hasSeenFeatures: boolean;
  hasSeenTestimonials: boolean;
  
  // Last updated
  lastUpdated: Date;
}

/**
 * Get user interests from session
 */
export function getUserInterests(session: UserSession): UserInterests {
  const conversationData = session.conversationData || {};
  const interests = (conversationData.userInterests as UserInterests) || {
    mentionedGenres: [],
    mentionedArtists: [],
    priceSensitive: false,
    askedAboutDiscounts: false,
    askedAboutPaymentPlans: false,
    buyingIntent: 'low',
    urgencyLevel: 'low',
    engagementLevel: 50,
    hasSeenPricing: false,
    hasSeenFeatures: false,
    hasSeenTestimonials: false,
    lastUpdated: new Date()
  };
  
  return interests;
}

/**
 * Update user interests based on new interaction
 */
export function updateUserInterests(
  session: UserSession,
  message: string,
  interactionType: 'user_message' | 'bot_message' | 'system_event'
): void {
  const interests = getUserInterests(session);
  const normalizedMsg = message.toLowerCase();
  
  // Extract content type preferences
  if (normalizedMsg.includes('música') || normalizedMsg.includes('musica') || normalizedMsg.includes('canciones')) {
    interests.contentType = 'musica';
  } else if (normalizedMsg.includes('video') || normalizedMsg.includes('clips')) {
    interests.contentType = 'videos';
  } else if (normalizedMsg.includes('película') || normalizedMsg.includes('pelicula') || normalizedMsg.includes('serie')) {
    interests.contentType = 'peliculas';
  }
  
  // Extract capacity preferences
  const capacityMatches = message.match(/\b(8|16|32|64|128)\s*gb\b/i);
  if (capacityMatches) {
    interests.preferredCapacity = `${capacityMatches[1]}GB`;
  }
  
  // Detect price sensitivity
  if (/(precio|costo|valor|cuanto|económico|barato|descuento|oferta|promoción)/i.test(normalizedMsg)) {
    interests.priceSensitive = true;
  }
  
  if (/(descuento|rebaja|oferta|promoción|especial)/i.test(normalizedMsg)) {
    interests.askedAboutDiscounts = true;
  }
  
  if (/(cuota|pagar en partes|financiar|plan de pago)/i.test(normalizedMsg)) {
    interests.askedAboutPaymentPlans = true;
  }
  
  // Detect urgency
  if (/(urgente|rápido|ya|hoy|ahora|pronto)/i.test(normalizedMsg)) {
    interests.urgencyLevel = 'high';
  } else if (/(mañana|esta semana|pronto)/i.test(normalizedMsg)) {
    interests.urgencyLevel = 'medium';
  }
  
  // Detect buying intent
  if (/(quiero|necesito|me interesa|confirmar|comprar|pedir|ordenar)/i.test(normalizedMsg)) {
    interests.buyingIntent = 'high';
  } else if (/(tal vez|quizás|pensando|considerar)/i.test(normalizedMsg)) {
    interests.buyingIntent = 'medium';
  }
  
  // Detect objections
  if (/(caro|costoso|muy alto|no tengo|presupuesto)/i.test(normalizedMsg)) {
    interests.mainObjection = 'price';
  } else if (/(confío|seguro|garantía|confiable|dudas)/i.test(normalizedMsg)) {
    interests.mainObjection = 'trust';
  } else if (/(tiempo|pensarlo|decidir|consultar)/i.test(normalizedMsg)) {
    interests.mainObjection = 'need_time';
  }
  
  // Track what user has seen (from bot messages)
  if (interactionType === 'bot_message') {
    if (/(precio|costo|\$|pesos)/i.test(normalizedMsg)) {
      interests.hasSeenPricing = true;
    }
    if (/(característica|incluye|beneficio|ventaja)/i.test(normalizedMsg)) {
      interests.hasSeenFeatures = true;
    }
    if (/(cliente|testimonial|reseña|recomendado|estrellas)/i.test(normalizedMsg)) {
      interests.hasSeenTestimonials = true;
    }
  }
  
  // Update engagement level based on message length and frequency
  if (interactionType === 'user_message') {
    if (message.length > 50) {
      interests.engagementLevel = Math.min(100, interests.engagementLevel + 10);
    } else if (message.length > 20) {
      interests.engagementLevel = Math.min(100, interests.engagementLevel + 5);
    }
  }
  
  interests.lastUpdated = new Date();
  
  // Save to session
  if (!session.conversationData) {
    session.conversationData = {};
  }
  session.conversationData.userInterests = interests;
  
  console.log(`🎯 Updated interests for ${session.phone}: buyingIntent=${interests.buyingIntent}, urgency=${interests.urgencyLevel}`);
}

/**
 * Analyze user's interests from entire conversation history
 */
export function analyzeConversationHistory(session: UserSession): UserInterests {
  const interests = getUserInterests(session);
  
  // Analyze all interactions
  if (session.interactions && Array.isArray(session.interactions)) {
    for (const interaction of session.interactions) {
      updateUserInterests(session, interaction.message, interaction.type);
    }
  }
  
  return interests;
}

/**
 * Get personalized follow-up recommendations based on interests
 */
export function getPersonalizedRecommendations(session: UserSession): {
  shouldMentionDiscount: boolean;
  shouldMentionPaymentPlan: boolean;
  shouldHighlightFeatures: string[];
  recommendedCapacity?: string;
  recommendedMessageAngle: string;
} {
  const interests = getUserInterests(session);
  
  const recommendations = {
    shouldMentionDiscount: interests.priceSensitive || interests.askedAboutDiscounts,
    shouldMentionPaymentPlan: interests.askedAboutPaymentPlans,
    shouldHighlightFeatures: [] as string[],
    recommendedCapacity: interests.preferredCapacity,
    recommendedMessageAngle: 'value_benefit'
  };
  
  // Determine which features to highlight
  if (interests.contentType === 'musica') {
    recommendations.shouldHighlightFeatures.push('playlist personalizada', 'géneros favoritos');
  } else if (interests.contentType === 'videos') {
    recommendations.shouldHighlightFeatures.push('videos HD', 'organización por carpetas');
  } else if (interests.contentType === 'peliculas') {
    recommendations.shouldHighlightFeatures.push('películas y series', 'compatibilidad total');
  }
  
  // Determine message angle based on buying intent and objections
  if (interests.mainObjection === 'price') {
    recommendations.recommendedMessageAngle = 'discount_offer';
  } else if (interests.mainObjection === 'trust') {
    recommendations.recommendedMessageAngle = 'social_proof';
  } else if (interests.urgencyLevel === 'high') {
    recommendations.recommendedMessageAngle = 'urgency_soft';
  } else if (interests.buyingIntent === 'high') {
    recommendations.recommendedMessageAngle = 'content_teaser';
  } else if (!interests.hasSeenFeatures) {
    recommendations.recommendedMessageAngle = 'value_benefit';
  } else {
    recommendations.recommendedMessageAngle = 're-engage_warm';
  }
  
  return recommendations;
}

/**
 * Calculate user's readiness to purchase (0-100)
 */
export function calculatePurchaseReadiness(session: UserSession): number {
  const interests = getUserInterests(session);
  let score = 0;
  
  // Buying intent (0-30 points)
  if (interests.buyingIntent === 'high') score += 30;
  else if (interests.buyingIntent === 'medium') score += 15;
  
  // Urgency (0-20 points)
  if (interests.urgencyLevel === 'high') score += 20;
  else if (interests.urgencyLevel === 'medium') score += 10;
  
  // Engagement (0-20 points)
  score += Math.min(20, interests.engagementLevel / 5);
  
  // Has preferences (0-15 points)
  if (interests.preferredCapacity) score += 5;
  if (interests.contentType) score += 5;
  if (interests.mentionedGenres.length > 0) score += 5;
  
  // Has seen key info (0-15 points)
  if (interests.hasSeenPricing) score += 5;
  if (interests.hasSeenFeatures) score += 5;
  if (interests.hasSeenTestimonials) score += 5;
  
  return Math.min(100, score);
}

/**
 * Generate insights summary for user
 */
export function generateUserInsights(session: UserSession): string {
  const interests = getUserInterests(session);
  const readiness = calculatePurchaseReadiness(session);
  
  const insights: string[] = [];
  
  if (interests.contentType) {
    insights.push(`Interested in ${interests.contentType}`);
  }
  
  if (interests.preferredCapacity) {
    insights.push(`Prefers ${interests.preferredCapacity} capacity`);
  }
  
  if (interests.priceSensitive) {
    insights.push('Price sensitive');
  }
  
  if (interests.mainObjection) {
    insights.push(`Main objection: ${interests.mainObjection}`);
  }
  
  insights.push(`Buying intent: ${interests.buyingIntent}`);
  insights.push(`Urgency: ${interests.urgencyLevel}`);
  insights.push(`Purchase readiness: ${readiness}%`);
  
  return insights.join(' | ');
}

console.log('✅ User Intention Analyzer Service initialized');
