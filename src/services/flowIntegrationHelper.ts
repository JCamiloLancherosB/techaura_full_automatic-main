/**
 * Flow Integration Helper
 * Provides unified access to persuasion, coherence validation, and flow coordination
 * for all chatbot flows
 * 
 * Enhanced Features:
 * - Pre-send message validation with policy engine
 * - Context memory integration for last 20 interactions
 * - Automatic transformation of incoherent messages
 * - Contradiction detection against previous information
 */

import { persuasionEngine } from '../services/persuasionEngine';
import { flowCoordinator } from '../services/flowCoordinator';
import { conversationMemory } from '../services/conversationMemory';
import { intentClassifier } from '../services/intentClassifier';
import { messagePolicyEngine, type MessagePolicyContext, type ContextInteraction } from '../services/MessagePolicyEngine';
import { humanDelay } from '../utils/antiBanDelays';
import type { UserSession } from '../../types/global';

export interface FlowMessageOptions {
    userSession: UserSession;
    userMessage: string;
    currentFlow: string;
    nextFlow?: string;
    priority?: number;
    skipCoherence?: boolean;
    /** Additional context metadata for policy validation */
    contextMetadata?: ContextInteraction['metadata'];
}

export interface FlowMessageResult {
    message: string;
    isCoherent: boolean;
    canTransition: boolean;
    issues?: string[];
    suggestions?: string[];
    /** Indicates if message was transformed by policy engine */
    wasTransformed?: boolean;
    /** Policy violations that were detected */
    policyViolations?: string[];
}

export class FlowIntegrationHelper {
    
    // ==========================================
    // === CONTEXT MEMORY HELPERS ===
    // ==========================================
    
    /**
     * Add user message to context memory for tracking
     */
    static addUserMessageToContext(
        phone: string,
        message: string,
        metadata?: ContextInteraction['metadata']
    ): void {
        messagePolicyEngine.addToContextMemory(phone, 'user', message, metadata);
    }

    /**
     * Add assistant message to context memory after sending
     */
    static addAssistantMessageToContext(
        phone: string,
        message: string,
        metadata?: ContextInteraction['metadata']
    ): void {
        messagePolicyEngine.addToContextMemory(phone, 'assistant', message, metadata);
    }

    /**
     * Get recent context for a user (last 20 interactions)
     */
    static getRecentContext(phone: string, limit?: number): ContextInteraction[] {
        return messagePolicyEngine.getContextMemory(phone, limit);
    }

    /**
     * Clear context memory for a user (e.g., on session reset)
     */
    static clearUserContext(phone: string): void {
        messagePolicyEngine.clearContextMemory(phone);
    }

    // ==========================================
    // === POLICY VIOLATION ANALYTICS ===
    // ==========================================
    
    /**
     * Get policy violation statistics
     */
    static getPolicyViolationStats(): {
        total: number;
        byType: Record<string, number>;
        bySeverity: Record<string, number>;
        recent24h: number;
    } {
        return messagePolicyEngine.getViolationStats();
    }

    /**
     * Get violation log entries for a specific phone
     */
    static getUserViolationHistory(phone: string) {
        return messagePolicyEngine.getViolationLog({ phone });
    }

    /**
     * Build and validate a persuasive message for a flow
     */
    static async buildFlowMessage(options: FlowMessageOptions): Promise<FlowMessageResult> {
        const { userSession, userMessage, currentFlow, skipCoherence, contextMetadata } = options;

        try {
            // 1. Log user message to conversation memory AND policy engine context
            await conversationMemory.addTurn(
                userSession.phone,
                'user',
                userMessage,
                { flowState: currentFlow }
            );
            
            // Also add to policy engine context memory for contradiction detection
            this.addUserMessageToContext(userSession.phone, userMessage, {
                ...contextMetadata,
                flow: currentFlow,
                stage: userSession.stage
            });

            // 2. Get conversation context
            const context = await conversationMemory.getContext(userSession.phone);

            // 3. Classify intent
            const classification = await intentClassifier.classify(
                userMessage,
                userSession,
                context
            );

            console.log(`🎯 [${currentFlow}] Intent: ${classification.primaryIntent.name} (${(classification.primaryIntent.confidence * 100).toFixed(0)}%)`);

            // 4. Build persuasive message
            const persuasiveMessage = await persuasionEngine.buildPersuasiveMessage(
                userMessage,
                userSession
            );

            // 5. Get persuasion context for validations
            const persuasionContext = await persuasionEngine['analyzeContext'](userSession);

            // 6. Apply message policy validation (pre-send hook)
            const policyContext: MessagePolicyContext = {
                userSession,
                persuasionContext,
                messageType: 'persuasive',
                stage: persuasionContext.stage,
                status: userSession.stage
            };

            const policyValidation = messagePolicyEngine.validateMessage(persuasiveMessage, policyContext);
            
            let finalMessage = persuasiveMessage;
            const allIssues: string[] = [];
            const allSuggestions: string[] = [];

            // Handle policy violations
            if (!policyValidation.isValid) {
                const summary = messagePolicyEngine.getViolationSummary(policyValidation.violations);
                console.log(`🚨 [${currentFlow}] Policy violations: ${summary}`);
                
                // Use transformed message if available
                if (policyValidation.transformedMessage) {
                    finalMessage = policyValidation.transformedMessage;
                    console.log(`✅ [${currentFlow}] Message transformed by policy engine`);
                }

                // Collect policy issues
                policyValidation.violations.forEach(v => {
                    allIssues.push(`[Policy] ${v.message}`);
                    if (v.suggestedFix) {
                        allSuggestions.push(v.suggestedFix);
                    }
                });
            }

            // 7. Validate coherence if not skipped (existing validation)
            if (!skipCoherence) {
                const validation = persuasionEngine.validateMessageCoherence(
                    finalMessage,
                    persuasionContext
                );

                if (!validation.isCoherent) {
                    console.log(`⚠️ [${currentFlow}] Message coherence issues: ${validation.issues.join(', ')}`);
                    allIssues.push(...validation.issues);
                    allSuggestions.push(...validation.suggestions);
                    
                    return {
                        message: finalMessage,
                        isCoherent: false,
                        canTransition: true,
                        issues: allIssues,
                        suggestions: allSuggestions,
                        wasTransformed: !!policyValidation.transformedMessage,
                        policyViolations: policyValidation.violations.map(v => v.rule)
                    };
                }
            }

            // Add assistant message to context memory after successful validation
            this.addAssistantMessageToContext(userSession.phone, finalMessage, {
                flow: currentFlow,
                stage: userSession.stage
            });

            return {
                message: finalMessage,
                isCoherent: allIssues.length === 0,
                canTransition: true,
                issues: allIssues.length > 0 ? allIssues : undefined,
                suggestions: allSuggestions.length > 0 ? allSuggestions : undefined,
                wasTransformed: !!policyValidation.transformedMessage,
                policyViolations: policyValidation.violations.length > 0 
                    ? policyValidation.violations.map(v => v.rule) 
                    : undefined
            };
        } catch (error) {
            console.error(`❌ [${currentFlow}] Error building flow message:`, error);
            
            // Fallback to simple message
            return {
                message: '¿En qué más puedo ayudarte?',
                isCoherent: true,
                canTransition: true,
                issues: ['Error in message generation']
            };
        }
    }

    /**
     * Validate flow transition before changing flows
     */
    static async validateFlowTransition(
        phone: string,
        fromFlow: string,
        toFlow: string
    ): Promise<{ canTransition: boolean; reason?: string }> {
        try {
            // Sync with user session first
            await flowCoordinator.syncWithUserSession(phone);

            // Validate transition
            const transition = flowCoordinator.validateTransition(fromFlow, toFlow);

            if (!transition.isValid) {
                console.warn(`⚠️ Invalid flow transition: ${fromFlow} -> ${toFlow}: ${transition.reason}`);
                return {
                    canTransition: false,
                    reason: transition.reason
                };
            }

            // Coordinate the transition
            const result = await flowCoordinator.coordinateFlowTransition(phone, toFlow, 'user_action');

            return {
                canTransition: result.success,
                reason: result.message
            };
        } catch (error) {
            console.error(`❌ Error validating flow transition:`, error);
            return {
                canTransition: true, // Allow transition on error to not block user
                reason: 'Validation error - proceeding anyway'
            };
        }
    }

    /**
     * Check if user is in a critical flow that shouldn't be interrupted
     */
    static isInCriticalFlow(phone: string): boolean {
        return flowCoordinator.isInCriticalFlow(phone);
    }

    /**
     * Queue a message for orderly delivery
     */
    static async queueMessage(
        phone: string,
        message: string,
        flow: string,
        priority: number = 5
    ): Promise<void> {
        await flowCoordinator.queueMessage(phone, message, flow, priority);
    }

    /**
     * Get next queued message for a user
     */
    static getNextQueuedMessage(phone: string) {
        return flowCoordinator.getNextMessage(phone);
    }

    /**
     * Send message with persuasion and coherence validation
     * Enhanced with context memory integration for contradiction detection
     */
    static async sendPersuasiveMessage(
        phone: string,
        baseMessage: string,
        userSession: UserSession,
        flowDynamic: any,
        options: {
            flow: string;
            priority?: number;
            enhanceWithSocialProof?: boolean;
            enhanceWithUrgency?: boolean;
            messageType?: 'catalog' | 'persuasive' | 'order' | 'general';
        }
    ): Promise<void> {
        try {
            // Humanized delay before sending
            await humanDelay();
            
            // Get persuasion context
            const persuasionContext = await persuasionEngine['analyzeContext'](userSession);

            // Build policy context
            const policyContext: MessagePolicyContext = {
                userSession,
                persuasionContext,
                messageType: options.messageType || 'persuasive',
                stage: persuasionContext.stage,
                status: userSession.stage
            };

            // Apply message policy validation with context memory (pre-send hook)
            // This validates against context memory for contradictions
            const policyValidation = messagePolicyEngine.validateMessageWithContext(baseMessage, policyContext);
            
            if (!policyValidation.isValid) {
                const summary = messagePolicyEngine.getViolationSummary(policyValidation.violations);
                console.log(`🚨 [${options.flow}] Policy violations: ${summary}`);
                
                // Log each violation
                policyValidation.violations.forEach(v => {
                    console.log(`  - [${v.severity}] ${v.rule}: ${v.message}`);
                    if (v.suggestedFix) {
                        console.log(`    Fix: ${v.suggestedFix}`);
                    }
                });
            }

            // Use transformed message if policy engine provided one
            const workingMessage = policyValidation.transformedMessage || baseMessage;

            // Validate coherence (existing validation)
            const validation = persuasionEngine.validateMessageCoherence(
                workingMessage,
                persuasionContext
            );

            let finalMessage = workingMessage;

            if (!validation.isCoherent) {
                console.log(`⚠️ [${options.flow}] Message coherence issues: ${validation.issues.join(', ')}`);
                console.log(`💡 [${options.flow}] Suggestions: ${validation.suggestions.join(', ')}`);
                
                // Check if it's a length issue
                const hasLengthIssue = validation.issues.some(issue => 
                    issue.includes('length') || issue.includes('characters') || issue.includes('cap')
                );
                
                if (hasLengthIssue) {
                    // Apply brevity enforcement directly
                    const stage = persuasionEngine['determineJourneyStage'](persuasionContext);
                    finalMessage = persuasionEngine['enforceBrevityAndUniqueness'](workingMessage, phone, stage);
                    console.log(`✅ [${options.flow}] Message trimmed to ${finalMessage.length} chars`);
                } else {
                    // Rebuild with persuasion engine for other coherence issues
                    console.log(`🔄 [${options.flow}] Rebuilding incoherent message with persuasion engine...`);
                    finalMessage = await persuasionEngine.buildPersuasiveMessage(
                        workingMessage,
                        userSession
                    );
                }
            } else {
                // Message is coherent, but enhance with persuasion elements if requested
                if (options.enhanceWithSocialProof || options.enhanceWithUrgency) {
                    finalMessage = persuasionEngine.enhanceMessage(
                        workingMessage,
                        persuasionContext,
                        phone  // Pass phone for duplicate detection
                    );
                } else {
                    // Still enforce brevity and uniqueness even if not enhancing
                    const stage = persuasionEngine['determineJourneyStage'](persuasionContext);
                    finalMessage = persuasionEngine['enforceBrevityAndUniqueness'](finalMessage, phone, stage);
                }
            }

            // Log to conversation memory
            await conversationMemory.addTurn(
                phone,
                'assistant',
                finalMessage,
                { flowState: options.flow }
            );

            // Also add to policy engine context memory
            this.addAssistantMessageToContext(phone, finalMessage, {
                flow: options.flow,
                stage: userSession.stage
            });

            // Send message
            await flowDynamic([finalMessage]);

            console.log(`✅ [${options.flow}] Persuasive message sent to ${phone} (${finalMessage.length} chars)`);
        } catch (error) {
            console.error(`❌ [${options.flow}] Error sending persuasive message:`, error);
            // Fallback: send original message with length enforcement
            try {
                const persuasionContext = await persuasionEngine['analyzeContext'](userSession);
                const stage = persuasionEngine['determineJourneyStage'](persuasionContext);
                const trimmedMessage = persuasionEngine['enforceBrevityAndUniqueness'](baseMessage, phone, stage);
                await flowDynamic([trimmedMessage]);
            } catch (fallbackError) {
                // Last resort: send original without any processing
                await flowDynamic([baseMessage]);
            }
        }
    }

    /**
     * Handle objections intelligently
     */
    static async handleObjection(
        phone: string,
        objectionMessage: string,
        userSession: UserSession,
        flowDynamic: any,
        flow: string
    ): Promise<boolean> {
        try {
            // Get context
            const context = await conversationMemory.getContext(phone);
            const persuasionContext = await persuasionEngine['analyzeContext'](userSession);

            // Build persuasive response (which includes objection handling)
            const response = await persuasionEngine.buildPersuasiveMessage(
                objectionMessage,
                userSession
            );

            // Send response
            await this.sendPersuasiveMessage(
                phone,
                response,
                userSession,
                flowDynamic,
                { flow, enhanceWithSocialProof: true }
            );

            return true;
        } catch (error) {
            console.error(`❌ [${flow}] Error handling objection:`, error);
            return false;
        }
    }

    /**
     * Get contextual CTA based on user's journey stage
     */
    static async getContextualCTA(userSession: UserSession): Promise<string> {
        try {
            const context = await conversationMemory.getContext(userSession.phone);
            const persuasionContext = await persuasionEngine['analyzeContext'](userSession);

            // Get next step CTA
            return persuasionEngine['getNextStepCTA'](persuasionContext);
        } catch (error) {
            console.error('❌ Error getting contextual CTA:', error);
            return '¿En qué más puedo ayudarte?';
        }
    }

    /**
     * Build a complete persuasive flow message with context
     */
    static async buildCompleteMessage(
        userSession: UserSession,
        messageType: 'greeting' | 'product_intro' | 'customization' | 'pricing' | 'closing',
        additionalContext?: Record<string, any>
    ): Promise<string> {
        try {
            const context = await conversationMemory.getContext(userSession.phone);
            const stage = this.mapMessageTypeToStage(messageType);

            // Update session stage if needed
            const tempSession = { ...userSession, stage };

            // Build persuasive message
            const message = await persuasionEngine.buildPersuasiveMessage(
                this.getDefaultMessageForType(messageType, additionalContext),
                tempSession
            );

            return message;
        } catch (error) {
            console.error(`❌ Error building complete message:`, error);
            return this.getDefaultMessageForType(messageType, additionalContext);
        }
    }

    /**
     * Map message type to journey stage
     */
    private static mapMessageTypeToStage(messageType: string): string {
        const mapping: Record<string, string> = {
            'greeting': 'awareness',
            'product_intro': 'interest',
            'customization': 'customizing',
            'pricing': 'pricing',
            'closing': 'closing'
        };
        return mapping[messageType] || 'interest';
    }

    /**
     * Get default message for type
     */
    private static getDefaultMessageForType(
        messageType: string,
        additionalContext?: Record<string, any>
    ): string {
        const defaults: Record<string, string> = {
            'greeting': '¡Hola! ¿En qué puedo ayudarte hoy?',
            'product_intro': 'Te cuento sobre nuestros productos personalizados',
            'customization': '¿Qué te gustaría personalizar?',
            'pricing': 'Estos son nuestros precios',
            'closing': '¿Confirmamos tu pedido?'
        };

        return defaults[messageType] || '¿En qué puedo ayudarte?';
    }

    /**
     * Clear user's flow state
     * Also clears context memory for a fresh start
     */
    static async resetUserFlow(phone: string): Promise<void> {
        await flowCoordinator.resetUserFlow(phone);
        // Also clear context memory
        this.clearUserContext(phone);
        console.log(`🔄 Flow reset for ${phone} (including context memory)`);
    }

    /**
     * Get flow statistics
     */
    static getFlowStats() {
        return flowCoordinator.getStats();
    }

    /**
     * Get conversation memory stats
     */
    static getMemoryStats() {
        return conversationMemory.getStats();
    }

    /**
     * Get comprehensive stats including policy violations
     */
    static getComprehensiveStats() {
        return {
            flowStats: flowCoordinator.getStats(),
            memoryStats: conversationMemory.getStats(),
            policyViolationStats: this.getPolicyViolationStats()
        };
    }
}

export const flowHelper = FlowIntegrationHelper;
