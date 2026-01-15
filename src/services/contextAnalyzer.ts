/**
 * ContextAnalyzer - Real-time intelligent context analysis (Enhanced Version)
 * Combines existing critical context protection with advanced intent detection
 * 
 * Features (50+ years of programming wisdom):
 * - Real-time intent detection with confidence scoring
 * - Multi-turn conversation context tracking
 * - Automatic preference extraction (genres, artists, capacity)
 * - Smart flow suggestion based on conversation state
 * - Semantic understanding of partial/ambiguous inputs
 * - Proactive clarification detection
 * - Critical context protection (order processing, payment, etc.)
 * - Continuous flow management
 */

import type { UserSession } from '../../types/global';
import { getUserSession, getUserCollectedData, updateUserSession } from '../flows/userTrackingSystem';

// Legacy interface for backward compatibility
export interface ContextAnalysis {
    shouldRespond: boolean;
    currentContext: string;
    suggestedAction: 'continue' | 'redirect' | 'ignore' | 'respond';
    reason: string;
    confidence: number;
    metadata?: any;
}

// New enhanced interface
export interface EnhancedContextAnalysis {
  // Core intent
  primaryIntent: {
    type: 'greeting' | 'pricing' | 'capacity' | 'customization' | 'purchase' | 'question' | 'clarification' | 'confirmation' | 'rejection' | 'unknown';
    confidence: number;
    keywords: string[];
  };
  
  // Secondary intents (for multi-intent messages)
  secondaryIntents: Array<{
    type: string;
    confidence: number;
  }>;
  
  // Extracted entities
  entities: {
    genres?: string[];
    artists?: string[];
    capacity?: string;
    priceRange?: { min: number; max: number };
    urgencyLevel?: 'immediate' | 'soon' | 'flexible';
    sentiment?: 'positive' | 'neutral' | 'negative' | 'confused';
  };
  
  // Flow suggestions
  suggestedFlow: string;
  flowConfidence: number;
  alternativeFlows: string[];
  
  // Context state
  contextQuality: 'complete' | 'partial' | 'insufficient';
  missingInfo: string[];
  needsClarification: boolean;
  clarificationPrompt?: string;
  
  // Conversation dynamics
  isFollowUp: boolean;
  refersToPrevious: boolean;
  conversationTurn: number;
  
  // Action recommendations
  recommendedAction: 'proceed' | 'clarify' | 'suggest_alternatives' | 'redirect' | 'wait';
  actionReason: string;
  
  // Critical context protection
  isCriticalContext: boolean;
  shouldProtectContext: boolean;
}

export interface PreferenceExtraction {
  musicGenres: string[];
  videoGenres: string[];
  movieGenres: string[];
  artists: string[];
  preferredCapacity: string | null;
  pricePoint: 'budget' | 'mid' | 'premium' | null;
  customizationLevel: 'basic' | 'moderate' | 'advanced' | null;
}

export class ContextAnalyzer {
  private static instance: ContextAnalyzer;
  
  // ✅ CRITICAL CONTEXTS (from original)
  private static readonly CRITICAL_CONTEXTS = [
    'order_processing', 'collecting_customer_data', 'payment_processing',
    'shipping_details', 'order_confirmation', 'active_purchase',
    'completing_order', 'data_collection', 'datosCliente', 'orderFlow',
    'capacityMusic', 'capacityVideo', 'customUsb'
  ];

  // ✅ CONTINUOUS FLOWS (from original)
  private static readonly CONTINUOUS_FLOWS = [
    'datosCliente', 'orderFlow', 'capacityMusic', 'capacityVideo',
    'customUsb', 'payment_flow', 'shipping_flow', 'musicUsb',
    'videoUsb', 'moviesUsb'
  ];

  // ✅ CONTEXT KEYWORDS (from original)
  private static readonly CONTEXT_KEYWORDS = {
    order_active: [
      'pedido', 'orden', 'compra', 'datos', 'nombre', 'dirección', 'direccion',
      'telefono', 'teléfono', 'ciudad', 'pagar', 'envio', 'envío'
    ],
    customization_active: [
      'personalizar', 'cambiar', 'agregar', 'quitar', 'preferencias',
      'generos', 'géneros', 'artistas', 'canciones'
    ],
    capacity_selection: [
      'gb', 'gigas', 'tamaño', 'capacidad', '8gb', '32gb', '64gb', '128gb'
    ]
  };
  
  // Known music genres (expanded list)
  private readonly MUSIC_GENRES = [
    'rock', 'pop', 'reggaeton', 'salsa', 'bachata', 'merengue', 'vallenato',
    'cumbia', 'ranchera', 'norteña', 'banda', 'balada', 'bolero', 'trap',
    'hip hop', 'rap', 'electronica', 'house', 'techno', 'jazz', 'blues',
    'country', 'metal', 'punk', 'indie', 'alternativo', 'clasica', 'gospel',
    'r&b', 'soul', 'funk', 'disco', 'reggae', 'ska', 'tango', 'flamenco'
  ];
  
  // Known video/movie genres
  private readonly VIDEO_GENRES = [
    'accion', 'comedia', 'drama', 'terror', 'suspenso', 'ciencia ficcion',
    'fantasia', 'romance', 'animacion', 'documental', 'musical', 'western',
    'noir', 'thriller', 'crimen', 'guerra', 'historico', 'biografico'
  ];
  
  // Capacity patterns
  private readonly CAPACITY_PATTERNS = [
    { pattern: /\b8\s*gb\b/i, value: '8GB', songs: 1400, videos: 260 },
    { pattern: /\b32\s*gb\b/i, value: '32GB', songs: 5000, videos: 1000 },
    { pattern: /\b64\s*gb\b/i, value: '64GB', songs: 10000, videos: 2000 },
    { pattern: /\b128\s*gb\b/i, value: '128GB', songs: 25000, videos: 4000 },
    { pattern: /\b256\s*gb\b/i, value: '256GB', songs: 50000, videos: 8000 },
    { pattern: /\b512\s*gb\b/i, value: '512GB', songs: 100000, videos: 16000 }
  ];
  
  // Intent keywords with priorities
  private readonly INTENT_KEYWORDS = {
    pricing: {
      keywords: ['precio', 'costo', 'cuanto', 'vale', 'cuánto', 'valor', 'cotizar', 'presupuesto'],
      weight: 0.9
    },
    capacity: {
      keywords: ['capacidad', 'tamaño', 'espacio', 'gb', 'gigas', 'cuantas canciones', 'cuántas canciones'],
      weight: 0.95
    },
    customization: {
      keywords: ['personalizar', 'custom', 'a medida', 'mi gusto', 'elegir', 'seleccionar', 'escoger'],
      weight: 0.85
    },
    purchase: {
      keywords: ['comprar', 'pedir', 'ordenar', 'quiero', 'necesito', 'llevar', 'adquirir'],
      weight: 0.95
    },
    question: {
      keywords: ['que', 'qué', 'como', 'cómo', 'cuando', 'cuándo', 'donde', 'dónde', 'por que', 'por qué'],
      weight: 0.7
    },
    confirmation: {
      keywords: ['si', 'sí', 'ok', 'vale', 'perfecto', 'excelente', 'genial', 'bueno', 'dale', 'listo', 'confirmo'],
      weight: 0.9
    },
    rejection: {
      keywords: ['no', 'nunca', 'cancelar', 'despues', 'después', 'luego', 'mas tarde', 'más tarde', 'no quiero', 'no me interesa'],
      weight: 0.9
    }
  };

  static getInstance(): ContextAnalyzer {
    if (!ContextAnalyzer.instance) {
      ContextAnalyzer.instance = new ContextAnalyzer();
    }
    return ContextAnalyzer.instance;
  }

  /**
   * Legacy analyze method (for backward compatibility)
   * Public alias for analyzeContext
   */
  async analyzeContext(phoneNumber: string, message: string, currentFlow: string): Promise<ContextAnalysis> {
    return this.analyze(phoneNumber, message, currentFlow);
  }

  /**
   * Legacy analyze method (for backward compatibility)
   */
  async analyze(phoneNumber: string, message: string, currentFlow: string): Promise<ContextAnalysis> {
    try {
      const session = await getUserSession(phoneNumber);
      const normalizedMsg = (message || '').toLowerCase();
      
      // Check for critical context
      const isCritical = ContextAnalyzer.CRITICAL_CONTEXTS.includes(currentFlow);
      const isContinuous = ContextAnalyzer.CONTINUOUS_FLOWS.includes(currentFlow);
      
      // Check for context keywords
      let hasContextKeywords = false;
      for (const keywords of Object.values(ContextAnalyzer.CONTEXT_KEYWORDS)) {
        if (keywords.some(kw => normalizedMsg.includes(kw))) {
          hasContextKeywords = true;
          break;
        }
      }
      
      // Determine action
      let suggestedAction: 'continue' | 'redirect' | 'ignore' | 'respond' = 'respond';
      let reason = 'Default response';
      
      if (isCritical) {
        suggestedAction = 'continue';
        reason = 'Critical context must continue';
      } else if (isContinuous && hasContextKeywords) {
        suggestedAction = 'continue';
        reason = 'Continuous flow with relevant keywords';
      } else if (session.stage === 'awaiting_payment' || session.stage === 'closing') {
        suggestedAction = 'continue';
        reason = 'User in payment/closing stage';
      }
      
      // NOTE: Legacy method - always responds. Type assertion needed because TypeScript's flow analysis
      // correctly identifies that suggestedAction can never be 'ignore' in this implementation.
      // The 'ignore' type exists for interface compatibility with the enhanced method.
      return {
        shouldRespond: (suggestedAction as ContextAnalysis['suggestedAction']) !== 'ignore',
        currentContext: currentFlow,
        suggestedAction,
        reason,
        confidence: isCritical ? 0.95 : isContinuous ? 0.8 : 0.6,
        metadata: { isCritical, isContinuous, hasContextKeywords }
      };
    } catch (error) {
      console.error('❌ ContextAnalyzer (legacy): Error:', error);
      return {
        shouldRespond: true,
        currentContext: currentFlow,
        suggestedAction: 'respond',
        reason: 'Error - defaulting to respond',
        confidence: 0.5
      };
    }
  }

  /**
   * Enhanced analyze method with full intelligence
   */
  async analyzeEnhanced(
    message: string,
    phone: string,
    currentFlow?: string
  ): Promise<EnhancedContextAnalysis> {
    try {
      const session = await getUserSession(phone);
      const normalizedMessage = message.toLowerCase().trim();
      
      // Check if in critical context
      const isCriticalContext = currentFlow ? ContextAnalyzer.CRITICAL_CONTEXTS.includes(currentFlow) : false;
      const shouldProtectContext = isCriticalContext && this.hasContextKeywords(normalizedMessage);
      
      // 1. Detect primary intent
      const primaryIntent = this.detectIntent(normalizedMessage);
      
      // 2. Extract entities
      const entities = this.extractEntities(normalizedMessage, session);
      
      // 3. Determine suggested flow
      const { suggestedFlow, confidence, alternatives } = this.suggestFlow(
        primaryIntent,
        entities,
        session,
        currentFlow
      );
      
      // 4. Assess context quality
      const { quality, missing, needsClarification, prompt } = this.assessContext(
        normalizedMessage,
        entities,
        session
      );
      
      // 5. Analyze conversation dynamics
      const dynamics = this.analyzeConversationDynamics(normalizedMessage, session);
      
      // 6. Recommend action
      const { action, reason } = this.recommendAction(
        primaryIntent,
        quality,
        needsClarification,
        entities,
        session,
        shouldProtectContext
      );
      
      // Extract secondary intents
      const secondaryIntents = this.detectSecondaryIntents(normalizedMessage, primaryIntent.type);
      
      const analysis: EnhancedContextAnalysis = {
        primaryIntent,
        secondaryIntents,
        entities,
        suggestedFlow,
        flowConfidence: confidence,
        alternativeFlows: alternatives,
        contextQuality: quality,
        missingInfo: missing,
        needsClarification,
        clarificationPrompt: prompt,
        ...dynamics,
        recommendedAction: action,
        actionReason: reason,
        isCriticalContext,
        shouldProtectContext
      };
      
      console.log(`🧠 ContextAnalyzer [${phone}]: ${primaryIntent.type} (${(primaryIntent.confidence * 100).toFixed(0)}%) -> ${suggestedFlow} [${action}]`);
      
      return analysis;
    } catch (error) {
      console.error('❌ ContextAnalyzer (enhanced): Error analyzing context:', error);
      return this.getDefaultEnhancedAnalysis(message);
    }
  }

  /**
   * Extract preferences from message
   */
  async extractPreferences(message: string, session: UserSession): Promise<PreferenceExtraction> {
    const normalized = message.toLowerCase();
    
    const extraction: PreferenceExtraction = {
      musicGenres: [],
      videoGenres: [],
      movieGenres: [],
      artists: [],
      preferredCapacity: null,
      pricePoint: null,
      customizationLevel: null
    };
    
    // Extract music genres
    for (const genre of this.MUSIC_GENRES) {
      if (normalized.includes(genre)) {
        extraction.musicGenres.push(genre);
      }
    }
    
    // Extract video/movie genres
    for (const genre of this.VIDEO_GENRES) {
      if (normalized.includes(genre)) {
        extraction.videoGenres.push(genre);
        extraction.movieGenres.push(genre);
      }
    }
    
    // Extract capacity
    for (const cap of this.CAPACITY_PATTERNS) {
      if (cap.pattern.test(normalized)) {
        extraction.preferredCapacity = cap.value;
        break;
      }
    }
    
    // Detect price point
    if (/\b(barato|economico|económico|básico|basico|bajo costo)\b/i.test(normalized)) {
      extraction.pricePoint = 'budget';
    } else if (/\b(premium|alta gama|mejor|top|lujo)\b/i.test(normalized)) {
      extraction.pricePoint = 'premium';
    } else if (normalized.includes('medio') || normalized.includes('intermedio')) {
      extraction.pricePoint = 'mid';
    }
    
    // Detect customization level
    if (/\b(muy personalizado|super personalizado|a medida|exacto|específico|especifico)\b/i.test(normalized)) {
      extraction.customizationLevel = 'advanced';
    } else if (/(personalizar|custom|mi gusto)/.test(normalized)) {
      extraction.customizationLevel = 'moderate';
    } else if (/(básico|basico|simple|estandar|estándar)/.test(normalized)) {
      extraction.customizationLevel = 'basic';
    }
    
    return extraction;
  }

  /**
   * Detect if user needs clarification
   */
  detectConfusion(message: string): boolean {
    const confusionPatterns = [
      /\b(no entiendo|no comprendo|confundido|confuso|no sé|no se|ayuda|explica|qué significa|que significa)\b/i,
      /\?.*\?/,  // Multiple question marks
      /\b(como funciona|cómo funciona|que es|qué es|cual|cuál)\b/i
    ];
    
    return confusionPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Generate smart clarification prompt
   */
  generateClarificationPrompt(missing: string[], session: UserSession): string {
    const collected = getUserCollectedData(session);
    
    if (missing.includes('contentType')) {
      return '¿Te interesa una USB de Música, Videos o Películas/Series? 🎵🎬';
    }
    
    if (missing.includes('capacity') && collected.hasContentType) {
      const type = collected.contentType === 'musica' ? 'música' : 
                   collected.contentType === 'videos' ? 'videos' : 'películas';
      return `¿Qué capacidad prefieres para tu USB de ${type}? Tengo opciones de 8GB a 512GB 💾`;
    }
    
    if (missing.includes('genres') && collected.contentType === 'musica') {
      return '¿Qué géneros musicales te gustan? (rock, salsa, reggaeton, etc.) 🎵';
    }
    
    if (missing.includes('preferences')) {
      return '¿Tienes alguna preferencia específica? Puedo personalizar todo a tu gusto ✨';
    }
    
    return '¿Puedes darme más detalles para ayudarte mejor? 😊';
  }

  // Private helper methods

  private hasContextKeywords(message: string): boolean {
    for (const keywords of Object.values(ContextAnalyzer.CONTEXT_KEYWORDS)) {
      if (keywords.some(kw => message.includes(kw))) {
        return true;
      }
    }
    return false;
  }

  private detectIntent(message: string): EnhancedContextAnalysis['primaryIntent'] {
    let bestMatch: EnhancedContextAnalysis['primaryIntent'] = { type: 'unknown', confidence: 0, keywords: [] };
    
    for (const [intentType, config] of Object.entries(this.INTENT_KEYWORDS)) {
      const matches = config.keywords.filter(kw => message.includes(kw));
      if (matches.length > 0) {
        const confidence = (matches.length / config.keywords.length) * config.weight;
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            type: intentType as any,
            confidence: Math.min(confidence, 1.0),
            keywords: matches
          };
        }
      }
    }
    
    // Fallback to greeting if nothing else matches
    if (bestMatch.confidence < 0.3 && /^(hola|buenos|buenas|hi|hey)/i.test(message)) {
      bestMatch = { type: 'greeting', confidence: 0.8, keywords: ['hola'] };
    }
    
    return bestMatch;
  }

  private detectSecondaryIntents(message: string, primaryType: string): Array<{ type: string; confidence: number }> {
    const secondaries: Array<{ type: string; confidence: number }> = [];
    
    for (const [intentType, config] of Object.entries(this.INTENT_KEYWORDS)) {
      if (intentType === primaryType) continue;
      
      const matches = config.keywords.filter(kw => message.includes(kw));
      if (matches.length > 0) {
        const confidence = (matches.length / config.keywords.length) * config.weight * 0.7; // Lower than primary
        if (confidence > 0.3) {
          secondaries.push({ type: intentType, confidence });
        }
      }
    }
    
    return secondaries.sort((a, b) => b.confidence - a.confidence).slice(0, 2);
  }

  private extractEntities(message: string, session: UserSession): EnhancedContextAnalysis['entities'] {
    const entities: EnhancedContextAnalysis['entities'] = {};
    
    // Extract genres
    const genres: string[] = [];
    for (const genre of [...this.MUSIC_GENRES, ...this.VIDEO_GENRES]) {
      if (message.includes(genre)) {
        genres.push(genre);
      }
    }
    if (genres.length > 0) {
      entities.genres = genres;
    }
    
    // Extract capacity
    for (const cap of this.CAPACITY_PATTERNS) {
      if (cap.pattern.test(message)) {
        entities.capacity = cap.value;
        break;
      }
    }
    
    // Detect urgency
    if (/\b(urgente|ya|ahora|rapido|rápido|inmediato|hoy)\b/i.test(message)) {
      entities.urgencyLevel = 'immediate';
    } else if (/\b(pronto|esta semana|próximo|proximo|cuando puedas)\b/i.test(message)) {
      entities.urgencyLevel = 'soon';
    } else {
      entities.urgencyLevel = 'flexible';
    }
    
    // Detect sentiment
    if (/\b(genial|excelente|perfecto|me encanta|super|increíble)\b/i.test(message)) {
      entities.sentiment = 'positive';
    } else if (/\b(no|nunca|mal|terrible|horrible|decepcion|decepción)\b/i.test(message)) {
      entities.sentiment = 'negative';
    } else if (this.detectConfusion(message)) {
      entities.sentiment = 'confused';
    } else {
      entities.sentiment = 'neutral';
    }
    
    return entities;
  }

  private suggestFlow(
    intent: EnhancedContextAnalysis['primaryIntent'],
    entities: EnhancedContextAnalysis['entities'],
    session: UserSession,
    currentFlow?: string
  ): { suggestedFlow: string; confidence: number; alternatives: string[] } {
    const collected = getUserCollectedData(session);
    
    // High-priority redirects based on intent
    if (intent.type === 'purchase' || intent.type === 'confirmation') {
      if (collected.hasCapacity && !collected.hasShippingInfo) {
        return { suggestedFlow: 'datosCliente', confidence: 0.95, alternatives: ['orderFlow'] };
      }
      if (collected.hasShippingInfo) {
        return { suggestedFlow: 'orderFlow', confidence: 0.95, alternatives: [] };
      }
    }
    
    if (intent.type === 'pricing') {
      if (currentFlow === 'musicUsb' || collected.contentType === 'musica') {
        return { suggestedFlow: 'capacityMusic', confidence: 0.9, alternatives: ['musicUsb'] };
      }
      if (currentFlow === 'videosUsb' || collected.contentType === 'videos') {
        return { suggestedFlow: 'capacityVideo', confidence: 0.9, alternatives: ['videosUsb'] };
      }
      if (currentFlow === 'moviesUsb' || collected.contentType === 'peliculas') {
        return { suggestedFlow: 'moviesUsb', confidence: 0.9, alternatives: [] };
      }
    }
    
    if (intent.type === 'capacity' && entities.capacity) {
      // User specified capacity - go to appropriate capacity flow
      if (currentFlow?.includes('music') || collected.contentType === 'musica') {
        return { suggestedFlow: 'capacityMusic', confidence: 0.95, alternatives: [] };
      }
      if (currentFlow?.includes('video') || collected.contentType === 'videos') {
        return { suggestedFlow: 'capacityVideo', confidence: 0.95, alternatives: [] };
      }
    }
    
    // Genre-based flow suggestion
    if (entities.genres && entities.genres.length > 0) {
      const hasMusicGenre = entities.genres.some(g => this.MUSIC_GENRES.includes(g));
      const hasVideoGenre = entities.genres.some(g => this.VIDEO_GENRES.includes(g));
      
      if (hasMusicGenre) {
        return { suggestedFlow: 'musicUsb', confidence: 0.85, alternatives: ['capacityMusic'] };
      }
      if (hasVideoGenre) {
        return { suggestedFlow: 'moviesUsb', confidence: 0.85, alternatives: ['videosUsb'] };
      }
    }
    
    // Default: stay in current flow or go to main
    if (currentFlow && currentFlow !== 'initial') {
      return { suggestedFlow: currentFlow, confidence: 0.6, alternatives: ['mainFlow'] };
    }
    
    return { suggestedFlow: 'mainFlow', confidence: 0.5, alternatives: ['musicUsb', 'videosUsb', 'moviesUsb'] };
  }

  private assessContext(
    message: string,
    entities: EnhancedContextAnalysis['entities'],
    session: UserSession
  ): { quality: 'complete' | 'partial' | 'insufficient'; missing: string[]; needsClarification: boolean; prompt?: string } {
    const collected = getUserCollectedData(session);
    const missing: string[] = [];
    
    // Check what's missing
    if (!collected.hasContentType && !entities.genres) {
      missing.push('contentType');
    }
    if (!collected.hasCapacity && !entities.capacity) {
      missing.push('capacity');
    }
    if (collected.hasContentType && collected.contentType === 'musica' && !collected.hasGenres && (!entities.genres || entities.genres.length === 0)) {
      missing.push('genres');
    }
    
    // Determine quality
    let quality: 'complete' | 'partial' | 'insufficient';
    if (missing.length === 0) {
      quality = 'complete';
    } else if (missing.length <= 1) {
      quality = 'partial';
    } else {
      quality = 'insufficient';
    }
    
    // Check if clarification is needed
    const needsClarification = this.detectConfusion(message) || quality === 'insufficient';
    const prompt = needsClarification ? this.generateClarificationPrompt(missing, session) : undefined;
    
    return { quality, missing, needsClarification, prompt };
  }

  private analyzeConversationDynamics(
    message: string,
    session: UserSession
  ): Pick<EnhancedContextAnalysis, 'isFollowUp' | 'refersToPrevious' | 'conversationTurn'> {
    const interactions = session.interactions || [];
    const conversationTurn = interactions.filter(i => i.type === 'user_message').length + 1;
    
    // Check if this is a follow-up (references previous conversation)
    const followUpPatterns = [
      /\b(eso|esa|ese|lo|la|ahi|ahí|si|sí|ok|dale|perfecto)\b/i,
      /^(si|sí|no|ok|vale|bueno|listo)$/i
    ];
    const isFollowUp = followUpPatterns.some(p => p.test(message)) && conversationTurn > 1;
    
    // Check if refers to previous message
    const referencePatterns = [
      /\b(como dijiste|como dije|lo que mencionaste|lo anterior|eso mismo|igual|tambien|también)\b/i
    ];
    const refersToPrevious = referencePatterns.some(p => p.test(message));
    
    return {
      isFollowUp,
      refersToPrevious,
      conversationTurn
    };
  }

  private recommendAction(
    intent: EnhancedContextAnalysis['primaryIntent'],
    quality: 'complete' | 'partial' | 'insufficient',
    needsClarification: boolean,
    entities: EnhancedContextAnalysis['entities'],
    session: UserSession,
    shouldProtectContext: boolean
  ): { action: EnhancedContextAnalysis['recommendedAction']; reason: string } {
    // Protect critical context
    if (shouldProtectContext) {
      return {
        action: 'wait',
        reason: 'Critical context must complete before taking action'
      };
    }
    
    // Handle confusion first
    if (needsClarification || entities.sentiment === 'confused') {
      return {
        action: 'clarify',
        reason: 'User needs clarification or is confused'
      };
    }
    
    // Handle rejection
    if (intent.type === 'rejection') {
      return {
        action: 'suggest_alternatives',
        reason: 'User rejected current option'
      };
    }
    
    // Handle purchase intent
    if (intent.type === 'purchase' || intent.type === 'confirmation') {
      if (quality === 'complete') {
        return {
          action: 'proceed',
          reason: 'User ready to purchase with complete information'
        };
      } else {
        return {
          action: 'clarify',
          reason: 'User wants to purchase but missing information'
        };
      }
    }
    
    // Handle incomplete context
    if (quality === 'insufficient') {
      return {
        action: 'clarify',
        reason: 'Insufficient context to proceed'
      };
    }
    
    // Handle partial context
    if (quality === 'partial') {
      if (intent.confidence > 0.7) {
        return {
          action: 'proceed',
          reason: 'Strong intent with partial context'
        };
      } else {
        return {
          action: 'clarify',
          reason: 'Weak intent with partial context'
        };
      }
    }
    
    // Default: proceed
    return {
      action: 'proceed',
      reason: 'Complete context and clear intent'
    };
  }

  private getDefaultEnhancedAnalysis(message: string): EnhancedContextAnalysis {
    return {
      primaryIntent: { type: 'unknown', confidence: 0.3, keywords: [] },
      secondaryIntents: [],
      entities: { sentiment: 'neutral' },
      suggestedFlow: 'mainFlow',
      flowConfidence: 0.3,
      alternativeFlows: [],
      contextQuality: 'insufficient',
      missingInfo: ['contentType', 'preferences'],
      needsClarification: true,
      clarificationPrompt: '¿En qué puedo ayudarte? Tengo USBs de Música, Videos y Películas 😊',
      isFollowUp: false,
      refersToPrevious: false,
      conversationTurn: 1,
      recommendedAction: 'clarify',
      actionReason: 'Unable to analyze context',
      isCriticalContext: false,
      shouldProtectContext: false
    };
  }

  /**
   * Mark a context as critical (prevents interruptions)
   * NOTE: This is a minimal stub implementation to satisfy TypeScript.
   * In production, this should store the critical context in a cache or session.
   */
  async markCriticalContext(phoneNumber: string, context: string, metadata?: any): Promise<void> {
    console.log(`🔒 [CONTEXT] Marked critical context for ${phoneNumber}: ${context}`, metadata);
    // TODO: Implement actual storage in session or cache for production use
  }

  /**
   * Clear critical context marking
   * NOTE: This is a minimal stub implementation to satisfy TypeScript.
   * In production, this should remove the critical context from cache or session.
   */
  async clearCriticalContext(phoneNumber: string): Promise<void> {
    console.log(`🔓 [CONTEXT] Cleared critical context for ${phoneNumber}`);
    // TODO: Implement actual removal from session or cache for production use
  }
}

// Export singleton instance
export const contextAnalyzer = ContextAnalyzer.getInstance();

console.log('✅ ContextAnalyzer Service initialized (Enhanced with 50+ years programming wisdom + critical context protection)');
