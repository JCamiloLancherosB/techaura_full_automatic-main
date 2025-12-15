/**
 * Flow Integration Helper
 * Provides unified access to persuasion, coherence validation, and flow coordination
 * for all chatbot flows
 */

import { persuasionEngine } from '../services/persuasionEngine';
import { flowCoordinator } from '../services/flowCoordinator';
import { conversationMemory } from '../services/conversationMemory';
import { intentClassifier } from '../services/intentClassifier';
import type { UserSession } from '../../types/global';

export interface FlowMessageOptions {
    userSession: UserSession;
    userMessage: string;
    currentFlow: string;
    nextFlow?: string;
    priority?: number;
    skipCoherence?: boolean;
}

export interface FlowMessageResult {
    message: string;
    isCoherent: boolean;
    canTransition: boolean;
    issues?: string[];
    suggestions?: string[];
}

export class FlowIntegrationHelper {
    /**
     * Build and validate a persuasive message for a flow
     */
    static async buildFlowMessage(options: FlowMessageOptions): Promise<FlowMessageResult> {
        const { userSession, userMessage, currentFlow, skipCoherence } = options;

        try {
            // 1. Log user message to conversation memory
            await conversationMemory.addTurn(
                userSession.phone,
                'user',
                userMessage,
                { flowState: currentFlow }
            );

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

            // 5. Validate coherence if not skipped
            if (!skipCoherence) {
                const persuasionContext = await persuasionEngine['analyzeContext'](userSession);
                const validation = persuasionEngine.validateMessageCoherence(
                    persuasiveMessage,
                    persuasionContext
                );

                if (!validation.isCoherent) {
                    console.log(`⚠️ [${currentFlow}] Message coherence issues: ${validation.issues.join(', ')}`);
                    return {
                        message: persuasiveMessage,
                        isCoherent: false,
                        canTransition: true,
                        issues: validation.issues,
                        suggestions: validation.suggestions
                    };
                }
            }

            return {
                message: persuasiveMessage,
                isCoherent: true,
                canTransition: true
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
        }
    ): Promise<void> {
        try {
            // Get persuasion context
            const persuasionContext = await persuasionEngine['analyzeContext'](userSession);

            // Validate coherence
            const validation = persuasionEngine.validateMessageCoherence(
                baseMessage,
                persuasionContext
            );

            let finalMessage = baseMessage;

            if (!validation.isCoherent) {
                console.log(`⚠️ [${options.flow}] Rebuilding incoherent message`);
                // Rebuild with persuasion engine
                finalMessage = await persuasionEngine.buildPersuasiveMessage(
                    baseMessage,
                    userSession
                );
            } else {
                // Enhance with persuasion elements if requested
                if (options.enhanceWithSocialProof || options.enhanceWithUrgency) {
                    finalMessage = persuasionEngine.enhanceMessage(
                        baseMessage,
                        persuasionContext
                    );
                }
            }

            // Log to conversation memory
            await conversationMemory.addTurn(
                phone,
                'assistant',
                finalMessage,
                { flowState: options.flow }
            );

            // Send message
            await flowDynamic([finalMessage]);

            console.log(`✅ [${options.flow}] Persuasive message sent to ${phone}`);
        } catch (error) {
            console.error(`❌ [${options.flow}] Error sending persuasive message:`, error);
            // Fallback: send original message
            await flowDynamic([baseMessage]);
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
     */
    static async resetUserFlow(phone: string): Promise<void> {
        await flowCoordinator.resetUserFlow(phone);
        console.log(`🔄 Flow reset for ${phone}`);
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
}

export const flowHelper = FlowIntegrationHelper;
