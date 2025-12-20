/**
 * Conversation Analyzer - Intelligent Context-Aware Response System
 * Analyzes conversation history and context to provide coherent, sales-focused responses
 */

import { getUserSession, getUserCollectedData } from '../flows/userTrackingSystem';
import type { UserSession } from '../../types/global';

export interface ConversationContext {
  stage: string;
  intent: 'buying' | 'browsing' | 'questioning' | 'hesitating' | 'confirming' | 'abandoning';
  confidence: number;
  suggestedResponse: string;
  suggestedAction: 'show_prices' | 'explain_product' | 'collect_data' | 'close_sale' | 'address_objection' | 'continue_flow';
  detectedConcerns: string[];
  salesOpportunity: number; // 0-100
  coherenceScore: number; // How coherent is continuing the current flow
  recommendedDelay: number; // Milliseconds to wait before responding
}

export interface MessageAnalysis {
  userIntent: string;
  mentionedTopics: string[];
  questions: string[];
  objections: string[];
  buyingSignals: string[];
  urgencyLevel: 'low' | 'medium' | 'high';
  emotionalTone: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'excited';
  requiresHumanIntervention: boolean;
}

export class ConversationAnalyzer {
  private static instance: ConversationAnalyzer;

  static getInstance(): ConversationAnalyzer {
    if (!ConversationAnalyzer.instance) {
      ConversationAnalyzer.instance = new ConversationAnalyzer();
    }
    return ConversationAnalyzer.instance;
  }

  /**
   * Analyze complete conversation context to determine best response
   */
  async analyzeConversationContext(phoneNumber: string, currentMessage: string): Promise<ConversationContext> {
    try {
      console.log(`🔍 [CONVERSATION ANALYZER] Analyzing context for ${phoneNumber}`);
      
      const session = await getUserSession(phoneNumber);
      if (!session) {
        return this.createNewUserContext(currentMessage);
      }

      // Get last 5 interactions for context
      const recentInteractions = (session.interactions || []).slice(-5);
      const messageAnalysis = this.analyzeMessage(currentMessage);
      const collectedData = getUserCollectedData(session);
      
      // Determine user intent based on conversation history
      const intent = this.determineUserIntent(session, messageAnalysis, collectedData);
      
      // Calculate sales opportunity
      const salesOpportunity = this.calculateSalesOpportunity(session, messageAnalysis, collectedData);
      
      // Determine best action
      const suggestedAction = this.determineBestAction(session, messageAnalysis, collectedData, intent);
      
      // Generate coherent response
      const suggestedResponse = this.generateCoherentResponse(
        session,
        currentMessage,
        messageAnalysis,
        collectedData,
        intent,
        suggestedAction
      );
      
      // Calculate coherence score
      const coherenceScore = this.calculateCoherenceScore(session, messageAnalysis, suggestedAction);
      
      // Detect concerns
      const detectedConcerns = this.detectConcerns(messageAnalysis, recentInteractions);
      
      // Calculate recommended delay (anti-ban + natural feel)
      const recommendedDelay = this.calculateRecommendedDelay(messageAnalysis, session);

      return {
        stage: session.stage,
        intent,
        confidence: messageAnalysis.urgencyLevel === 'high' ? 95 : 85,
        suggestedResponse,
        suggestedAction,
        detectedConcerns,
        salesOpportunity,
        coherenceScore,
        recommendedDelay
      };
    } catch (error) {
      console.error('❌ [CONVERSATION ANALYZER] Error:', error);
      return this.createFallbackContext();
    }
  }

  /**
   * Analyze individual message for intent, tone, and content
   */
  private analyzeMessage(message: string): MessageAnalysis {
    const normalizedMsg = message.toLowerCase();
    
    // Detect questions
    const questions: string[] = [];
    if (/(qué|que|cuál|cual|cómo|como|dónde|donde|cuánto|cuanto|por qué|porqué|para qué)\b/i.test(normalizedMsg)) {
      questions.push('question_detected');
    }
    if (/\?/.test(message)) {
      questions.push('explicit_question');
    }
    
    // Detect objections
    const objections: string[] = [];
    if (/\b(caro|costoso|muy caro|muy costoso|no tengo|no puedo|pensarlo|después|luego|más tarde)\b/i.test(normalizedMsg)) {
      objections.push('price_objection');
    }
    if (/\b(no (me |)interesa|no quiero|no gracias|cancelar|olvidar)\b/i.test(normalizedMsg)) {
      objections.push('not_interested');
    }
    if (/\b(no confío|desconfío|estafa|fraude|seguro|garantía)\b/i.test(normalizedMsg)) {
      objections.push('trust_concern');
    }
    
    // Detect buying signals
    const buyingSignals: string[] = [];
    if (/\b(comprar|quiero|necesito|me interesa|listo|ok|dale|sí|si|perfecto|excelente)\b/i.test(normalizedMsg)) {
      buyingSignals.push('interest_confirmed');
    }
    if (/\b(pago|precio|costo|tarjeta|efectivo|transferencia|nequi|daviplata)\b/i.test(normalizedMsg)) {
      buyingSignals.push('payment_inquiry');
    }
    if (/\b(envío|envio|entrega|dirección|direccion|cuando llega)\b/i.test(normalizedMsg)) {
      buyingSignals.push('shipping_inquiry');
    }
    if (/\b(nombre|datos|información|confirmar|proceder)\b/i.test(normalizedMsg)) {
      buyingSignals.push('data_provision');
    }
    
    // Determine urgency
    let urgencyLevel: 'low' | 'medium' | 'high' = 'low';
    if (/\b(urgente|rápido|rapido|ya|ahora|hoy|inmediato|pronto)\b/i.test(normalizedMsg)) {
      urgencyLevel = 'high';
    } else if (buyingSignals.length > 0 || /\b(quiero|necesito|me interesa)\b/i.test(normalizedMsg)) {
      urgencyLevel = 'medium';
    }
    
    // Determine emotional tone
    let emotionalTone: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'excited' = 'neutral';
    if (/\b(genial|excelente|perfecto|increíble|me encanta|súper|genio|bacano)\b/i.test(normalizedMsg)) {
      emotionalTone = 'excited';
    } else if (/\b(bien|ok|vale|entiendo|gracias)\b/i.test(normalizedMsg)) {
      emotionalTone = 'positive';
    } else if (/\b(no entiendo|confuso|complicado|difícil)\b/i.test(normalizedMsg)) {
      emotionalTone = 'frustrated';
    } else if (objections.includes('not_interested')) {
      emotionalTone = 'negative';
    }
    
    // Detect mentioned topics
    const mentionedTopics: string[] = [];
    if (/\b(música|musica|canción|cancion|playlist|artista|género|genero)\b/i.test(normalizedMsg)) {
      mentionedTopics.push('music');
    }
    if (/\b(video|película|pelicula|serie|movie)\b/i.test(normalizedMsg)) {
      mentionedTopics.push('video');
    }
    if (/\b(capacidad|gb|gigas|tamaño|espacio|32|64|128|256)\b/i.test(normalizedMsg)) {
      mentionedTopics.push('capacity');
    }
    if (/\b(precio|costo|valor|cuánto|cuanto)\b/i.test(normalizedMsg)) {
      mentionedTopics.push('pricing');
    }
    
    // Determine if human intervention is needed
    const requiresHumanIntervention = 
      objections.includes('trust_concern') ||
      emotionalTone === 'frustrated' ||
      (objections.length > 2) ||
      /\b(hablar con|asesor|humano|persona|representante|ayuda urgente)\b/i.test(normalizedMsg);

    return {
      userIntent: this.extractPrimaryIntent(normalizedMsg, buyingSignals, objections, questions),
      mentionedTopics,
      questions,
      objections,
      buyingSignals,
      urgencyLevel,
      emotionalTone,
      requiresHumanIntervention
    };
  }

  /**
   * Extract primary user intent from message
   */
  private extractPrimaryIntent(msg: string, buyingSignals: string[], objections: string[], questions: string[]): string {
    if (buyingSignals.includes('payment_inquiry') || buyingSignals.includes('shipping_inquiry')) {
      return 'ready_to_buy';
    }
    if (buyingSignals.length > 0) {
      return 'showing_interest';
    }
    if (objections.includes('not_interested')) {
      return 'not_interested';
    }
    if (objections.includes('price_objection')) {
      return 'price_concerned';
    }
    if (questions.length > 0) {
      return 'seeking_information';
    }
    if (/\b(hola|buenos|buenas|saludos)\b/i.test(msg)) {
      return 'greeting';
    }
    return 'browsing';
  }

  /**
   * Determine user intent from conversation history
   */
  private determineUserIntent(
    session: UserSession,
    analysis: MessageAnalysis,
    collectedData: any
  ): 'buying' | 'browsing' | 'questioning' | 'hesitating' | 'confirming' | 'abandoning' {
    // If user has collected data and showing buying signals -> buying
    if ((collectedData.hasCapacity || collectedData.hasPersonalInfo) && analysis.buyingSignals.length > 0) {
      return 'buying';
    }
    
    // If user reached closing stage -> buying or confirming
    if (['closing', 'awaiting_payment', 'checkout_started'].includes(session.stage)) {
      return analysis.objections.length > 0 ? 'hesitating' : 'confirming';
    }
    
    // If user has objections -> hesitating or abandoning
    if (analysis.objections.length > 0) {
      return analysis.objections.includes('not_interested') ? 'abandoning' : 'hesitating';
    }
    
    // If user asking questions -> questioning
    if (analysis.questions.length > 0) {
      return 'questioning';
    }
    
    // If user in early stages -> browsing
    if (['initial', 'interested'].includes(session.stage)) {
      return 'browsing';
    }
    
    // Default based on buying intent score
    return (session.buyingIntent || 0) > 60 ? 'buying' : 'browsing';
  }

  /**
   * Calculate sales opportunity score (0-100)
   * Scoring factors:
   * - Base: session.buyingIntent (default 30)
   * - +15 per buying signal
   * - +10 for capacity selection
   * - +5 for genre selection
   * - +15 for personal info provided
   * - +20 for advanced stage (customizing/pricing/closing)
   * - +15/+10 for high/medium urgency
   * - +10/+5 for excited/positive emotion
   * - -10 per objection
   * - -20/-15 for negative/frustrated emotion
   */
  private calculateSalesOpportunity(
    session: UserSession,
    analysis: MessageAnalysis,
    collectedData: any
  ): number {
    // Score boost constants
    const BUYING_SIGNAL_BOOST = 15;
    const CAPACITY_SELECTED_BOOST = 10;
    const GENRES_SELECTED_BOOST = 5;
    const PERSONAL_INFO_BOOST = 15;
    const ADVANCED_STAGE_BOOST = 20; // For users in customizing/pricing/closing stages
    const HIGH_URGENCY_BOOST = 15;
    const MEDIUM_URGENCY_BOOST = 10;
    const EXCITED_BOOST = 10;
    const POSITIVE_BOOST = 5;
    const OBJECTION_PENALTY = -10;
    const NEGATIVE_PENALTY = -20;
    const FRUSTRATED_PENALTY = -15;
    
    let score = session.buyingIntent || 30;
    
    // Boost for buying signals
    score += analysis.buyingSignals.length * BUYING_SIGNAL_BOOST;
    
    // Boost for collected data
    if (collectedData.hasCapacity) score += CAPACITY_SELECTED_BOOST;
    if (collectedData.hasGenres) score += GENRES_SELECTED_BOOST;
    if (collectedData.hasPersonalInfo) score += PERSONAL_INFO_BOOST;
    
    // Boost for advanced stage - indicates user is seriously considering purchase
    if (['customizing', 'pricing', 'closing'].includes(session.stage)) {
      score += ADVANCED_STAGE_BOOST;
    }
    
    // Boost for urgency
    if (analysis.urgencyLevel === 'high') score += HIGH_URGENCY_BOOST;
    else if (analysis.urgencyLevel === 'medium') score += MEDIUM_URGENCY_BOOST;
    
    // Boost for positive emotion
    if (analysis.emotionalTone === 'excited') score += EXCITED_BOOST;
    else if (analysis.emotionalTone === 'positive') score += POSITIVE_BOOST;
    
    // Penalize for objections
    score += analysis.objections.length * OBJECTION_PENALTY;
    
    // Penalize for negative emotion
    if (analysis.emotionalTone === 'negative') score += NEGATIVE_PENALTY;
    if (analysis.emotionalTone === 'frustrated') score += FRUSTRATED_PENALTY;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine best action based on context
   */
  private determineBestAction(
    session: UserSession,
    analysis: MessageAnalysis,
    collectedData: any,
    intent: string
  ): 'show_prices' | 'explain_product' | 'collect_data' | 'close_sale' | 'address_objection' | 'continue_flow' {
    // High priority: Address objections
    if (analysis.objections.length > 0) {
      return 'address_objection';
    }
    
    // High priority: Collect data if ready to buy
    if (intent === 'buying' && !collectedData.hasPersonalInfo) {
      return 'collect_data';
    }
    
    // High priority: Close sale if data collected
    if (collectedData.hasCapacity && collectedData.hasPersonalInfo) {
      return 'close_sale';
    }
    
    // Medium priority: Show prices if asked
    if (analysis.mentionedTopics.includes('pricing') || analysis.userIntent === 'showing_interest') {
      return 'show_prices';
    }
    
    // Medium priority: Explain product if questioning
    if (intent === 'questioning' || analysis.questions.length > 0) {
      return 'explain_product';
    }
    
    // Default: Continue current flow
    return 'continue_flow';
  }

  /**
   * Generate coherent response based on context
   */
  private generateCoherentResponse(
    session: UserSession,
    currentMessage: string,
    analysis: MessageAnalysis,
    collectedData: any,
    intent: string,
    action: string
  ): string {
    const userName = session.name ? session.name.split(' ')[0] : '';
    const greeting = userName ? `${userName}` : '';
    
    // Handle objections first
    if (action === 'address_objection') {
      if (analysis.objections.includes('price_objection')) {
        return `${greeting ? 'Entiendo ' + greeting + '.' : 'Entiendo.'} El precio incluye personalización completa, envío GRATIS y garantía. Además tenemos opciones desde $54.900. ¿Te gustaría ver todas las capacidades?`;
      }
      if (analysis.objections.includes('not_interested')) {
        return `${greeting ? greeting + ',' : ''} Sin problema. ¿Hay algo específico que no te convence? Me gustaría ayudarte a encontrar la mejor opción para ti.`;
      }
      if (analysis.objections.includes('trust_concern')) {
        return `${greeting ? greeting + ',' : ''} Entiendo tu preocupación. Tenemos +500 clientes satisfechos, garantía de 7 días y puedes pagar contra entrega. ¿Te gustaría ver testimonios de clientes?`;
      }
    }
    
    // Collect data if ready
    if (action === 'collect_data') {
      return `¡Perfecto${greeting ? ' ' + greeting : ''}! 🎯\n\nPara procesar tu pedido necesito:\n✅ Nombre completo\n✅ Ciudad y dirección\n✅ Número de celular\n\n📝 Ejemplo: Juan Pérez, Bogotá, Calle 123 #45-67, 3001234567`;
    }
    
    // Close sale
    if (action === 'close_sale') {
      return `¡Excelente${greeting ? ' ' + greeting : ''}! 🎉\n\nTu pedido está casi listo. Un asesor te contactará en los próximos minutos para:\n• Confirmar detalles finales\n• Coordinar entrega\n• Procesar tu pago\n\n¿Alguna pregunta antes de confirmar?`;
    }
    
    // Show prices
    if (action === 'show_prices') {
      const hasCapacity = collectedData.hasCapacity;
      if (hasCapacity) {
        return `Ya tienes seleccionada tu capacidad${greeting ? ' ' + greeting : ''}. ¿Quieres cambiarla o procedemos con tu pedido?`;
      }
      return `${greeting ? greeting + ', ' : ''}Tenemos estas opciones:\n\n💰 8GB (1,400 canciones): $54.900\n🌟 32GB (5,000 canciones): $84.900\n🔥 64GB (10,000 canciones): $119.900\n🏆 128GB (25,000 canciones): $159.900\n\nTodas incluyen envío GRATIS y personalización. ¿Cuál te interesa?`;
    }
    
    // Explain product
    if (action === 'explain_product') {
      if (analysis.mentionedTopics.includes('music')) {
        return `${greeting ? greeting + ', ' : ''}Nuestras USBs de música incluyen:\n✅ Música sin relleno (solo hits)\n✅ Organizada por géneros\n✅ Calidad 320kbps\n✅ Con carátulas e índice PDF\n✅ Garantía 7 días\n\n¿Qué géneros musicales te gustan?`;
      }
      return `${greeting ? greeting + ', ' : ''}¿Te gustaría saber más sobre nuestras USBs personalizadas? Tenemos de música, videos y películas. Todas con envío GRATIS. ¿Cuál te interesa?`;
    }
    
    // Continue flow (default)
    return `${greeting ? greeting + ', ' : ''}¿En qué puedo ayudarte? Tengo USBs personalizadas de música, videos y películas. 🎵🎬`;
  }

  /**
   * Calculate coherence score for continuing current flow
   */
  private calculateCoherenceScore(session: UserSession, analysis: MessageAnalysis, action: string): number {
    let score = 70; // Base score
    
    // Boost if action matches current stage
    if (session.stage === 'pricing' && action === 'show_prices') score += 20;
    if (session.stage === 'customizing' && analysis.mentionedTopics.includes('music')) score += 20;
    if (session.stage === 'closing' && action === 'collect_data') score += 20;
    
    // Boost if message is relevant to current flow
    if (session.currentFlow?.includes('music') && analysis.mentionedTopics.includes('music')) score += 15;
    if (session.currentFlow?.includes('video') && analysis.mentionedTopics.includes('video')) score += 15;
    
    // Penalize if user intent conflicts with current flow
    if (analysis.objections.includes('not_interested')) score -= 30;
    if (analysis.emotionalTone === 'frustrated') score -= 20;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detect user concerns from message and history
   */
  private detectConcerns(analysis: MessageAnalysis, recentInteractions: any[]): string[] {
    const concerns: string[] = [];
    
    if (analysis.objections.includes('price_objection')) {
      concerns.push('price_too_high');
    }
    if (analysis.objections.includes('trust_concern')) {
      concerns.push('trust_issues');
    }
    if (analysis.emotionalTone === 'frustrated') {
      concerns.push('user_frustrated');
    }
    if (analysis.requiresHumanIntervention) {
      concerns.push('needs_human_help');
    }
    
    // Check for repeated questions (indicates confusion)
    const recentQuestions = recentInteractions.filter(i => i.type === 'user_message' && /\?/.test(i.message));
    if (recentQuestions.length >= 3) {
      concerns.push('confused_user');
    }
    
    return concerns;
  }

  /**
   * Calculate recommended delay based on message complexity
   * Base delay: 2000ms (2 seconds)
   * Adjustments: +1000ms for questions, +1500ms for objections, -500ms for urgency, +500ms for excitement
   * Jitter: 10-30% random variation to appear human-like (Math.random() * 0.2 + 0.1 = 0.1 to 0.3)
   */
  private calculateRecommendedDelay(analysis: MessageAnalysis, session: UserSession): number {
    let baseDelay = 2000; // 2 seconds base
    
    // Longer delay for complex questions
    if (analysis.questions.length > 0) baseDelay += 1000;
    
    // Longer delay for objections (appear thoughtful)
    if (analysis.objections.length > 0) baseDelay += 1500;
    
    // Shorter delay for high urgency
    if (analysis.urgencyLevel === 'high') baseDelay -= 500;
    
    // Longer delay for excited users (build anticipation)
    if (analysis.emotionalTone === 'excited') baseDelay += 500;
    
    // Add random jitter (10-30%)
    const jitter = Math.random() * 0.2 + 0.1; // Generates 0.1-0.3 (10-30%)
    baseDelay += baseDelay * jitter;
    
    return Math.max(1500, Math.min(5000, Math.floor(baseDelay)));
  }

  /**
   * Create context for new users
   */
  private createNewUserContext(message: string): ConversationContext {
    const analysis = this.analyzeMessage(message);
    return {
      stage: 'initial',
      intent: 'browsing',
      confidence: 90,
      suggestedResponse: '¡Hola! 👋 Bienvenido a TechAura. Tenemos USBs personalizadas de música, videos y películas con envío GRATIS. ¿Cuál te interesa?',
      suggestedAction: 'explain_product',
      detectedConcerns: [],
      salesOpportunity: 50,
      coherenceScore: 100,
      recommendedDelay: 2000
    };
  }

  /**
   * Create fallback context on error
   */
  private createFallbackContext(): ConversationContext {
    return {
      stage: 'unknown',
      intent: 'browsing',
      confidence: 50,
      suggestedResponse: '¿En qué puedo ayudarte? Tengo USBs personalizadas de música, videos y películas. 🎵🎬',
      suggestedAction: 'continue_flow',
      detectedConcerns: [],
      salesOpportunity: 40,
      coherenceScore: 50,
      recommendedDelay: 2000
    };
  }
}

// Export singleton instance
export const conversationAnalyzer = ConversationAnalyzer.getInstance();

console.log('✅ Conversation Analyzer loaded - Intelligent context-aware responses enabled');
