/**
 * Hybrid Intent Router v2: Deterministic First, AI Second
 * 
 * Priority order:
 * 0. Flow Continuity Check - HIGHEST PRIORITY (new)
 * 0.5. YES_NO Fast-Path - Short confirmations when expecting YES/NO
 * 1. Deterministic keyword/pattern matching (highest confidence)
 * 2. Context-aware flow preservation (respect current stage)
 * 3. AI analysis for ambiguous cases
 * 4. Menu fallback for very low confidence
 * 
 * Key Features:
 * - Flow Continuity: Checks for active flow state before any routing
 * - YES_NO Fast-Path: Resolves "si/sí/ok/dale/listo" as CONFIRM_YES and "no/nel/negativo" as CONFIRM_NO
 * - Strong keyword scoring for: "usb", "pelis", "audífonos", "luces", "herramientas"
 * - Respects context/history/stage - e.g., "8GB" in USB flow stays in USB
 * - Persists intent_confidence and intent_source in conversation_turns
 */

import type { UserSession } from '../../../types/global';
import { intentClassifier } from './intentClassifier';
import { aiService } from './aiService';
import { flowContinuityService } from './FlowContinuityService';
import { FlowContinuityReasonCode } from '../types/flowState';
import { classifyYesNoResponse, isPoliteGraciasResponse, type ConfirmationType } from '../utils/textUtils';

export interface IntentResult {
    intent: string;
    confidence: number;
    source: 'rule' | 'ai' | 'menu' | 'context' | 'flow_continuity' | 'yes_no_fastpath';
    reason: string;
    shouldRoute: boolean;
    targetFlow?: string;
    metadata?: Record<string, any>;
}

export class HybridIntentRouter {
    private static instance: HybridIntentRouter;

    // Configuration constants
    private static readonly CONFIDENCE_THRESHOLDS = {
        HIGH_KEYWORD: 85,
        MEDIUM_CLASSIFIER: 0.7,
        HIGH_CLASSIFIER: 0.8,
        AI_MIN: 60,
        AI_ROUTE: 70,
        MENU_FALLBACK: 40
    };

    private static readonly TIMING_THRESHOLDS = {
        RECENT_INTERACTION_MS: 30000, // 30 seconds
        VERY_STRONG_INTENT_CONFIDENCE: 95
    };

    // Strong keyword patterns with high priority
    private strongKeywords = {
        // USB-related keywords (high priority in USB context)
        usb: {
            patterns: [/\busb\b/i, /memoria/i, /pendrive/i],
            intent: 'usb_inquiry',
            confidence: 90,
            targetFlow: 'usbFlow'
        },
        // Movie keywords
        pelis: {
            patterns: [/\bpel[ií]s?\b/i, /\bpel[ií]culas?\b/i, /\bmovies?\b/i, /\bseries?\b/i],
            intent: 'movies',
            confidence: 95,
            targetFlow: 'moviesUsb'
        },
        // Headphones keywords
        audifonos: {
            patterns: [/\baud[ií]fonos?\b/i, /\bauriculares?\b/i, /\bheadphones?\b/i, /\bcascos?\b/i],
            intent: 'headphones',
            confidence: 95,
            targetFlow: 'flowHeadPhones'
        },
        // Lights keywords
        luces: {
            patterns: [/\bluces?\b/i, /\biluminaci[oó]n\b/i, /\bleds?\b/i, /\blights?\b/i],
            intent: 'lights',
            confidence: 95,
            targetFlow: 'flowTechnology'
        },
        // Tools keywords
        herramientas: {
            patterns: [/\bherramientas?\b/i, /\btornillos?\b/i, /\bdestornillador/i, /\btools?\b/i],
            intent: 'tools',
            confidence: 95,
            targetFlow: 'flowTechnology'
        },
        // Pricing keywords
        precio: {
            patterns: [/\bprecios?\b/i, /\bcostos?\b/i, /\bcu[aá]nto\b/i, /\bvale\b/i, /\bpagar\b/i],
            intent: 'pricing',
            confidence: 90,
            targetFlow: 'prices'
        },
        // Catalog keywords
        catalogo: {
            patterns: [/\bcat[aá]logos?\b/i, /\bproductos?\b/i, /\bopciones?\b/i, /\bmostrar\b/i],
            intent: 'catalog',
            confidence: 85,
            targetFlow: 'catalogFlow'
        },
        // Music keywords
        musica: {
            patterns: [/\bm[uú]sica\b/i, /\bcancion(es)?\b/i, /\bplaylist/i, /\bartistas?\b/i],
            intent: 'music',
            confidence: 90,
            targetFlow: 'musicUsb'
        },
        // Video keywords
        videos: {
            patterns: [/\bvideos?\b/i, /\bv[ií]deos?\b/i, /\bclips?\b/i],
            intent: 'videos',
            confidence: 90,
            targetFlow: 'videosUsb'
        }
    };

    // Capacity patterns that should stay in current flow
    private capacityPatterns = [
        /\b(8|16|32|64|128|256)\s*(gb|gigas?)\b/i,
        /\b\d+\s*(gb|gigas?)\b/i
    ];

    // Context-sensitive patterns (should NOT trigger re-routing)
    private contextualPatterns = {
        // Numbers and sizes in USB/product context
        capacity: /\b\d+\s*(gb|gigas?|mb|megas?|tb|teras?)\b/i,
        // Simple affirmations
        affirmation: /^\s*(s[ií]|ok|vale|listo|claro|perfecto|dale|bueno)\s*$/i,
        // Simple negations
        negation: /^\s*(no|nada|ning[uú]n|ninguna?)\s*$/i
    };

    static getInstance(): HybridIntentRouter {
        if (!HybridIntentRouter.instance) {
            HybridIntentRouter.instance = new HybridIntentRouter();
        }
        return HybridIntentRouter.instance;
    }

    /**
     * Main routing method: flow continuity first, then deterministic, then AI
     */
    async route(
        message: string,
        session: UserSession
    ): Promise<IntentResult> {
        const normalizedMessage = message.toLowerCase().trim();
        const phone = session.phone || session.phoneNumber;

        // Step 0: HIGHEST PRIORITY - Check for active flow that should handle this message
        // This ensures conversational continuity when a flow has asked a question
        if (phone) {
            const continuityDecision = await flowContinuityService.checkFlowContinuity(phone);
            
            if (continuityDecision.shouldContinueInFlow && continuityDecision.activeFlowId) {
                // Handle stale conversations with rehydration
                if (continuityDecision.isStale) {
                    const resumptionInfo = await flowContinuityService.getResumptionInfo(phone);
                    
                    console.log(`⏰ [Intent Router] Flow ${continuityDecision.activeFlowId} is stale, providing context`);
                    return {
                        intent: 'continue_stale_flow',
                        confidence: 90,
                        source: 'flow_continuity',
                        reason: `Stale flow detected: ${continuityDecision.activeFlowId}/${continuityDecision.activeStep}`,
                        shouldRoute: false,
                        targetFlow: continuityDecision.activeFlowId,
                        metadata: {
                            isStale: true,
                            hoursSinceUpdate: continuityDecision.hoursSinceUpdate,
                            resumptionInfo,
                            reasonCode: continuityDecision.reasonCode
                        }
                    };
                }
                
                // Step 0.5: YES_NO FAST-PATH - Resolve short confirmations BEFORE intentClassifier
                // This prevents "si", "sí", "ok", "dale", "listo" from being misclassified
                if (continuityDecision.expectedInput === 'YES_NO') {
                    const yesNoResult = classifyYesNoResponse(message);
                    
                    if (yesNoResult) {
                        console.log(`✅ [Intent Router] YES_NO fast-path: "${message}" -> ${yesNoResult} in ${continuityDecision.activeFlowId}/${continuityDecision.activeStep}`);
                        return {
                            intent: yesNoResult, // 'CONFIRM_YES' or 'CONFIRM_NO'
                            confidence: 99,
                            source: 'yes_no_fastpath',
                            reason: `YES_NO fast-path: ${yesNoResult} for "${message}" (expected YES_NO in ${continuityDecision.activeFlowId})`,
                            shouldRoute: false, // Don't re-route, stay in current flow
                            targetFlow: continuityDecision.activeFlowId,
                            metadata: {
                                activeStep: continuityDecision.activeStep,
                                expectedInput: 'YES_NO',
                                confirmationType: yesNoResult,
                                originalMessage: message,
                                reasonCode: FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE
                            }
                        };
                    }
                    // If not a clear yes/no, fall through to active flow handling
                    console.log(`⚠️ [Intent Router] YES_NO expected but got ambiguous input: "${message}"`);
                }
                
                // Step 0.6: GENRES FAST-PATH - Handle genre selection context
                // When expecting GENRES, keep user in flow even for polite responses like "gracias"
                if (continuityDecision.expectedInput === 'GENRES') {
                    // Check if user said "gracias" or similar polite response
                    // Instead of resetting context, suggest they check prices
                    if (isPoliteGraciasResponse(message)) {
                        console.log(`✅ [Intent Router] GENRES fast-path: "${message}" -> polite_response with CTA in ${continuityDecision.activeFlowId}/${continuityDecision.activeStep}`);
                        return {
                            intent: 'polite_response_with_cta',
                            confidence: 99,
                            source: 'flow_continuity',
                            reason: `GENRES fast-path: polite response "${message}" - showing CTA (expected GENRES in ${continuityDecision.activeFlowId})`,
                            shouldRoute: false, // Don't re-route, stay in current flow
                            targetFlow: continuityDecision.activeFlowId,
                            metadata: {
                                activeStep: continuityDecision.activeStep,
                                expectedInput: 'GENRES',
                                suggestPrices: true, // Signal to flow to suggest prices
                                originalMessage: message,
                                reasonCode: FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE
                            }
                        };
                    }
                    
                    // All other inputs in GENRES context go to the flow
                    console.log(`✅ [Intent Router] GENRES fast-path: routing "${message}" to active flow ${continuityDecision.activeFlowId}/${continuityDecision.activeStep}`);
                }
                
                // Active flow should handle this message
                console.log(`✅ [Intent Router] Routing to active flow: ${continuityDecision.activeFlowId}/${continuityDecision.activeStep}`);
                return {
                    intent: 'continue_active_flow',
                    confidence: 98,
                    source: 'flow_continuity',
                    reason: continuityDecision.reason,
                    shouldRoute: false, // Don't re-route, stay in current flow
                    targetFlow: continuityDecision.activeFlowId,
                    metadata: {
                        activeStep: continuityDecision.activeStep,
                        expectedInput: continuityDecision.expectedInput,
                        reasonCode: continuityDecision.reasonCode
                    }
                };
            }
        }

        // Step 1: Check if message is contextual (capacity, affirmation, etc.)
        const contextual = this.checkContextualMessage(normalizedMessage);
        if (contextual.isContextual && session.currentFlow && session.stage) {
            return {
                intent: contextual.type || 'continue',
                confidence: 95,
                source: 'context',
                reason: `Contextual message "${contextual.type}" in ${session.currentFlow}/${session.stage}`,
                shouldRoute: false,
                metadata: { contextType: contextual.type }
            };
        }

        // Step 2: Deterministic keyword matching
        const keywordResult = this.matchStrongKeywords(normalizedMessage);
        if (keywordResult.confidence >= HybridIntentRouter.CONFIDENCE_THRESHOLDS.HIGH_KEYWORD) {
            // High confidence keyword match
            // BUT check if we should stay in current flow
            const shouldStayInFlow = this.shouldPreserveCurrentFlow(
                normalizedMessage,
                session,
                keywordResult
            );

            if (shouldStayInFlow) {
                return {
                    intent: session.currentFlow || keywordResult.intent,
                    confidence: 90,
                    source: 'context',
                    reason: `Preserving current flow: ${session.currentFlow}, stage: ${session.stage}`,
                    shouldRoute: false,
                    metadata: { 
                        keywordMatched: keywordResult.intent,
                        stayingInFlow: session.currentFlow 
                    }
                };
            }

            return {
                ...keywordResult,
                source: 'rule',
                reason: `Strong keyword match: ${keywordResult.intent}`,
                shouldRoute: true
            };
        }

        // Step 3: Intent classifier (pattern-based)
        const classifierResult = await intentClassifier.classify(
            message,
            session,
            undefined
        );

        if (classifierResult.primaryIntent.confidence >= HybridIntentRouter.CONFIDENCE_THRESHOLDS.MEDIUM_CLASSIFIER) {
            return {
                intent: classifierResult.primaryIntent.name,
                confidence: Math.round(classifierResult.primaryIntent.confidence * 100),
                source: 'rule',
                reason: `Intent classifier: ${classifierResult.primaryIntent.name}`,
                shouldRoute: classifierResult.primaryIntent.confidence >= HybridIntentRouter.CONFIDENCE_THRESHOLDS.HIGH_CLASSIFIER,
                targetFlow: this.mapIntentToFlow(classifierResult.primaryIntent.name),
                metadata: {
                    entities: classifierResult.entities,
                    sentiment: classifierResult.sentiment
                }
            };
        }

        // Step 4: AI analysis for ambiguous cases
        if (aiService?.isAvailable()) {
            try {
                const aiResult = await this.analyzeWithAI(message, session);
                if (aiResult && aiResult.confidence >= HybridIntentRouter.CONFIDENCE_THRESHOLDS.AI_MIN) {
                    return {
                        ...aiResult,
                        source: 'ai',
                        reason: `AI analysis: ${aiResult.intent}`,
                        shouldRoute: aiResult.confidence >= HybridIntentRouter.CONFIDENCE_THRESHOLDS.AI_ROUTE
                    };
                }
            } catch (error) {
                console.warn('⚠️ AI analysis failed, falling back to menu:', error);
            }
        }

        // Step 5: Menu fallback for very low confidence
        return {
            intent: 'menu',
            confidence: 30,
            source: 'menu',
            reason: 'Low confidence - showing menu',
            shouldRoute: true,
            targetFlow: 'menuFlow',
            metadata: { fallback: true }
        };
    }

    /**
     * Check if message is contextual (shouldn't trigger re-routing)
     */
    private checkContextualMessage(message: string): { 
        isContextual: boolean; 
        type?: string 
    } {
        // Check capacity pattern
        if (this.contextualPatterns.capacity.test(message)) {
            return { isContextual: true, type: 'capacity' };
        }

        // Check affirmation
        if (this.contextualPatterns.affirmation.test(message)) {
            return { isContextual: true, type: 'affirmation' };
        }

        // Check negation
        if (this.contextualPatterns.negation.test(message)) {
            return { isContextual: true, type: 'negation' };
        }

        return { isContextual: false };
    }

    /**
     * Match strong keywords deterministically
     */
    private matchStrongKeywords(message: string): Partial<IntentResult> {
        let bestMatch: Partial<IntentResult> = { confidence: 0 };

        for (const [keyword, config] of Object.entries(this.strongKeywords)) {
            for (const pattern of config.patterns) {
                if (pattern.test(message)) {
                    if (config.confidence > (bestMatch.confidence || 0)) {
                        bestMatch = {
                            intent: config.intent,
                            confidence: config.confidence,
                            targetFlow: config.targetFlow,
                            metadata: { keyword, pattern: pattern.source }
                        };
                    }
                }
            }
        }

        return bestMatch;
    }

    /**
     * Determine if we should preserve current flow
     * Key logic: If user is in a product flow (USB, movies, etc.) and types
     * contextual info (like "8GB", "32", etc.), don't jump to another flow
     */
    private shouldPreserveCurrentFlow(
        message: string,
        session: UserSession,
        keywordResult: Partial<IntentResult>
    ): boolean {
        // If no current flow, can't preserve
        if (!session.currentFlow || session.currentFlow === 'initial' || session.currentFlow === 'welcomeFlow') {
            return false;
        }

        // If in active product/customization stage, preserve flow
        const activeStages = [
            'customizing',
            'pricing',
            'awaiting_capacity',
            'capacity_selected',
            'genre_selection',
            'content_selection',
            'closing',
            'checkout_started',
            'awaiting_payment'
        ];

        if (activeStages.includes(session.stage)) {
            // Check if message is about capacity or technical specs
            const isCapacityMessage = this.capacityPatterns.some(p => p.test(message));
            if (isCapacityMessage) {
                console.log(`🔒 Preserving flow: ${session.currentFlow} - capacity message in active stage ${session.stage}`);
                return true;
            }

            // If user is in USB flow and mentions USB-related things, stay
            if (session.currentFlow.toLowerCase().includes('usb')) {
                // Don't jump to movies/videos unless explicitly mentioned with strong signal
                const hasStrongNewIntent = keywordResult.confidence && 
                    keywordResult.confidence >= HybridIntentRouter.CONFIDENCE_THRESHOLDS.VERY_STRONG_INTENT_CONFIDENCE;
                const isDifferentCategory = keywordResult.intent && 
                    !keywordResult.intent.includes('usb') && 
                    !keywordResult.intent.includes('capacity');

                if (!hasStrongNewIntent || !isDifferentCategory) {
                    console.log(`🔒 Preserving USB flow: ${session.currentFlow} in stage ${session.stage}`);
                    return true;
                }
            }
        }

        // If recent interaction (< 30 seconds), preserve flow unless strong new intent
        if (session.lastInteraction) {
            const timeSinceInteraction = Date.now() - new Date(session.lastInteraction).getTime();
            if (timeSinceInteraction < HybridIntentRouter.TIMING_THRESHOLDS.RECENT_INTERACTION_MS) {
                const hasVeryStrongNewIntent = keywordResult.confidence && 
                    keywordResult.confidence >= HybridIntentRouter.CONFIDENCE_THRESHOLDS.VERY_STRONG_INTENT_CONFIDENCE;
                if (!hasVeryStrongNewIntent) {
                    console.log(`🔒 Preserving flow: ${session.currentFlow} - recent interaction (${Math.round(timeSinceInteraction/1000)}s ago)`);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Map intent name to flow name
     */
    private mapIntentToFlow(intent: string): string | undefined {
        const mapping: Record<string, string> = {
            'purchase': 'orderFlow',
            'pricing': 'prices',
            'product_inquiry': 'catalogFlow',
            'customization': 'customizationFlow',
            'capacity_inquiry': 'capacityUsb',
            'gaming': 'gamesUsb',
            'music': 'musicUsb',
            'movies': 'moviesUsb',
            'videos': 'videosUsb',
            'shipping': 'orderFlow',
            'warranty': 'orderFlow',
            'greeting': 'welcomeFlow',
            'help': 'menuFlow',
            'affirmative': undefined, // Stay in current flow
            'negative': undefined // Stay in current flow
        };

        return mapping[intent];
    }

    /**
     * AI analysis for ambiguous cases
     */
    private async analyzeWithAI(
        message: string,
        session: UserSession
    ): Promise<Partial<IntentResult> | null> {
        try {
            const prompt = `Analyze user intent for routing:

Message: "${message}"
Current Flow: ${session.currentFlow || 'none'}
Current Stage: ${session.stage || 'none'}
User Interests: ${session.interests?.join(', ') || 'none'}
Buying Intent: ${session.buyingIntent || 0}%

Available intents:
- usb_inquiry: User asking about USB products
- movies: User interested in movie USBs
- music: User interested in music USBs
- videos: User interested in video USBs
- headphones: User asking about headphones
- lights: User asking about lights/LEDs
- tools: User asking about tools
- pricing: User asking about prices
- catalog: User wants to see product catalog
- continue: Stay in current flow

Respond with: INTENT|CONFIDENCE(0-100)|REASON

Example: usb_inquiry|85|User explicitly asks about USB memory`;

            const response = await aiService.generateResponse(prompt, session);
            const parts = response.split('|');

            if (parts.length >= 3) {
                return {
                    intent: parts[0].trim(),
                    confidence: parseInt(parts[1].trim()) || 50,
                    reason: parts[2].trim()
                };
            }
        } catch (error) {
            console.error('❌ AI intent analysis error:', error);
        }

        return null;
    }

    /**
     * Get human-readable explanation of routing decision
     */
    explainDecision(result: IntentResult): string {
        return `
Intent: ${result.intent}
Confidence: ${result.confidence}%
Source: ${result.source}
Reason: ${result.reason}
Should Route: ${result.shouldRoute}
Target Flow: ${result.targetFlow || 'N/A'}
`.trim();
    }
}

export const hybridIntentRouter = HybridIntentRouter.getInstance();
