/**
 * Intelligent Response Middleware
 * Analyzes conversation context before generating responses to ensure coherence
 */

import { conversationAnalyzer } from '../services/conversationAnalyzer';
import { applyMediumDelay, applyShortDelay, applyLongDelay } from '../utils/antiBanDelays';
import { getUserSession } from '../flows/userTrackingSystem';

export interface IntelligentResponseResult {
  shouldProceed: boolean;
  suggestedResponse?: string;
  suggestedAction?: string;
  salesOpportunity: number;
  requiresHumanIntervention: boolean;
  recommendedDelay: number;
  context?: any;
}

/**
 * Analyze message and provide intelligent response suggestions
 * Use this before processing user messages in flows
 */
export async function analyzeBeforeResponse(
  phoneNumber: string,
  message: string,
  currentFlow: string
): Promise<IntelligentResponseResult> {
  try {
    console.log(`🧠 [INTELLIGENT MIDDLEWARE] Analyzing message for ${phoneNumber}`);
    
    // Get conversation context analysis
    const context = await conversationAnalyzer.analyzeConversationContext(phoneNumber, message);
    
    console.log(`📊 Analysis Result:`, {
      intent: context.intent,
      action: context.suggestedAction,
      salesOpportunity: context.salesOpportunity,
      coherenceScore: context.coherenceScore,
      concerns: context.detectedConcerns
    });
    
    // Determine if we should proceed with normal flow or use suggested response
    const shouldProceed = context.coherenceScore >= 70 && context.detectedConcerns.length === 0;
    
    // Check if human intervention is needed
    const requiresHumanIntervention = 
      context.detectedConcerns.includes('needs_human_help') ||
      context.detectedConcerns.includes('confused_user') ||
      (context.detectedConcerns.includes('trust_issues') && context.intent === 'abandoning');
    
    if (requiresHumanIntervention) {
      console.log(`🚨 [ALERT] User ${phoneNumber} requires human intervention!`);
    }
    
    return {
      shouldProceed,
      suggestedResponse: context.suggestedResponse,
      suggestedAction: context.suggestedAction,
      salesOpportunity: context.salesOpportunity,
      requiresHumanIntervention,
      recommendedDelay: context.recommendedDelay,
      context
    };
  } catch (error) {
    console.error(`❌ [INTELLIGENT MIDDLEWARE] Error:`, error);
    // Return safe default on error
    return {
      shouldProceed: true,
      salesOpportunity: 50,
      requiresHumanIntervention: false,
      recommendedDelay: 2000
    };
  }
}

/**
 * Send response with intelligent delay based on context
 */
export async function sendIntelligentResponse(
  flowDynamic: Function,
  message: string | string[],
  recommendedDelay?: number,
  delayType?: 'short' | 'medium' | 'long'
): Promise<void> {
  try {
    // Apply intelligent delay
    if (recommendedDelay) {
      console.log(`⏳ [INTELLIGENT DELAY] Waiting ${recommendedDelay}ms before response`);
      await new Promise(resolve => setTimeout(resolve, recommendedDelay));
    } else if (delayType === 'short') {
      await applyShortDelay();
    } else if (delayType === 'long') {
      await applyLongDelay();
    } else {
      await applyMediumDelay();
    }
    
    // Send message
    const messages = Array.isArray(message) ? message : [message];
    await flowDynamic(messages);
    
    console.log(`✅ [INTELLIGENT RESPONSE] Message sent successfully`);
  } catch (error) {
    console.error(`❌ [INTELLIGENT RESPONSE] Error:`, error);
    throw error;
  }
}

/**
 * Check if user message should interrupt current flow
 */
export async function shouldInterruptFlow(
  phoneNumber: string,
  message: string,
  currentFlow: string
): Promise<{ shouldInterrupt: boolean; reason?: string; newFlow?: string }> {
  try {
    const session = await getUserSession(phoneNumber);
    const normalizedMsg = message.toLowerCase();
    
    // Critical interruptions (always interrupt)
    if (/\b(cancelar|detener|parar|stop|ayuda urgente|hablar con humano|asesor)\b/i.test(normalizedMsg)) {
      return {
        shouldInterrupt: true,
        reason: 'user_requested_stop',
        newFlow: 'advisor'
      };
    }
    
    // User is in critical stage (don't interrupt)
    if (['closing', 'awaiting_payment', 'checkout_started'].includes(session.stage)) {
      console.log(`🔒 User in critical stage (${session.stage}), preventing interruption`);
      return {
        shouldInterrupt: false,
        reason: 'critical_stage'
      };
    }
    
    // User wants to switch product type
    if (currentFlow === 'musicUsb' && /\b(video|película|pelicula|serie)\b/i.test(normalizedMsg)) {
      return {
        shouldInterrupt: true,
        reason: 'product_type_switch',
        newFlow: 'videosUsb'
      };
    }
    
    if ((currentFlow === 'videosUsb' || currentFlow === 'moviesUsb') && /\b(música|musica|canción|cancion)\b/i.test(normalizedMsg)) {
      return {
        shouldInterrupt: true,
        reason: 'product_type_switch',
        newFlow: 'musicUsb'
      };
    }
    
    return {
      shouldInterrupt: false
    };
  } catch (error) {
    console.error(`❌ [INTERRUPT CHECK] Error:`, error);
    return { shouldInterrupt: false };
  }
}

/**
 * Validation patterns for response coherence checking
 */
const COHERENCE_PATTERNS = {
  // Product type patterns
  musicKeywords: /\b(música|musica|canción|cancion)\b/i,
  videoKeywords: /\b(video|película|pelicula)\b/i,
  crossSellKeywords: /\b(también|combo|además|adicionalmente)\b/i,
  
  // Objection patterns
  priceObjection: /\b(caro|costoso|mucho precio)\b/i,
  priceResponse: /\b(precio|descuento|oferta|barato|económico|pagar|financiar)\b/i,
  
  // Buying signals
  readyToBuy: /\b(comprar|quiero|listo|pago|confirmar)\b/i,
  goingBackwards: /\b(qué género|cuál te gusta|dime qué)\b/i,
  
  // Answer patterns
  answerIndicators: /\b(sí|si|no|correcto|exacto|puedes|claro)\b/i
} as const;

/**
 * Validate that bot response is coherent with conversation
 */
export function validateResponseCoherence(
  userMessage: string,
  botResponse: string,
  context: any
): { isCoherent: boolean; issues: string[] } {
  const issues: string[] = [];
  const userLower = userMessage.toLowerCase();
  const botLower = botResponse.toLowerCase();
  
  // Check 1: If user asked about music, bot shouldn't mention videos (unless cross-sell)
  if (COHERENCE_PATTERNS.musicKeywords.test(userLower) && 
      COHERENCE_PATTERNS.videoKeywords.test(botLower) &&
      !COHERENCE_PATTERNS.crossSellKeywords.test(botLower)) {
    issues.push('product_type_mismatch');
  }
  
  // Check 2: If user showed price objection, bot should address it
  if (COHERENCE_PATTERNS.priceObjection.test(userLower) && 
      !COHERENCE_PATTERNS.priceResponse.test(botLower)) {
    issues.push('objection_not_addressed');
  }
  
  // Check 3: If user is ready to buy, bot shouldn't go backwards
  if (COHERENCE_PATTERNS.readyToBuy.test(userLower) &&
      COHERENCE_PATTERNS.goingBackwards.test(botLower)) {
    issues.push('going_backwards_in_funnel');
  }
  
  // Check 4: If user asked a question, bot should answer it
  if (/\?/.test(userMessage) && !COHERENCE_PATTERNS.answerIndicators.test(botLower)) {
    issues.push('question_not_answered');
  }
  
  return {
    isCoherent: issues.length === 0,
    issues
  };
}

/**
 * Log interaction for analytics and debugging
 */
export async function logIntelligentInteraction(
  phoneNumber: string,
  userMessage: string,
  botResponse: string,
  analysisResult: IntelligentResponseResult
): Promise<void> {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      phoneNumber,
      userMessage: userMessage.substring(0, 200),
      botResponse: botResponse.substring(0, 200),
      intent: analysisResult.context?.intent,
      action: analysisResult.suggestedAction,
      salesOpportunity: analysisResult.salesOpportunity,
      concerns: analysisResult.context?.detectedConcerns,
      requiresHuman: analysisResult.requiresHumanIntervention
    };
    
    console.log(`📊 [INTERACTION LOG]`, JSON.stringify(logEntry, null, 2));
    
    // Here you could also send to analytics service or database
  } catch (error) {
    console.error(`❌ [INTERACTION LOG] Error:`, error);
  }
}

console.log('✅ Intelligent Response Middleware loaded');
