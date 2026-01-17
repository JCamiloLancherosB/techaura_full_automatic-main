/**
 * Flow Coordinator - Ensures all flows are synchronized and messages flow coherently
 * Validates flow transitions and prevents message conflicts
 */

import type { UserSession } from '../../types/global';
import { getUserSession, updateUserSession } from '../flows/userTrackingSystem';
import { businessDB } from '../mysql-database';

export interface FlowTransition {
    from: string;
    to: string;
    isValid: boolean;
    reason?: string;
}

export interface MessageQueueItem {
    phone: string;
    message: string;
    priority: number;
    timestamp: Date;
    flow: string;
}

export class FlowCoordinator {
    private static instance: FlowCoordinator;
    private messageQueues = new Map<string, MessageQueueItem[]>();
    private activeFlows = new Map<string, string>();
    
    // Continuity keywords for context detection
    private static readonly CONTINUITY_KEYWORDS = [
        'eso', 'esa', 'ese', 'lo', 'la', 'si', 'sí', 'ok', 'también', 
        'tambien', 'además', 'ademas', 'pero', 'y', 'entonces'
    ];
    
    // Define valid flow transitions
    private readonly VALID_TRANSITIONS: Record<string, string[]> = {
        'initial': ['welcome', 'mainFlow', 'musicUsb', 'videosUsb', 'moviesUsb'],
        'welcome': ['mainFlow', 'musicUsb', 'videosUsb', 'moviesUsb', 'catalogFlow'],
        'mainFlow': ['musicUsb', 'videosUsb', 'moviesUsb', 'customizationFlow', 'orderFlow', 'catalogFlow'],
        'musicUsb': ['customizationFlow', 'capacityMusic', 'orderFlow'],
        'videosUsb': ['customizationFlow', 'capacityVideo', 'orderFlow'],
        'moviesUsb': ['customizationFlow', 'orderFlow'],
        'customizationFlow': ['capacityMusic', 'capacityVideo', 'orderFlow'],
        'capacityMusic': ['orderFlow', 'datosCliente'],
        'capacityVideo': ['orderFlow', 'datosCliente'],
        'orderFlow': ['datosCliente', 'paymentFlow', 'order_confirmed'],
        'datosCliente': ['paymentFlow', 'order_confirmed'],
        'paymentFlow': ['order_confirmed'],
        'catalogFlow': ['customizationFlow', 'orderFlow']
    };

    // Flow stages in purchase journey order
    private readonly FLOW_STAGES: Record<string, number> = {
        'initial': 0,
        'welcome': 1,
        'mainFlow': 2,
        'musicUsb': 3,
        'videosUsb': 3,
        'moviesUsb': 3,
        'catalogFlow': 3,
        'customizationFlow': 4,
        'capacityMusic': 5,
        'capacityVideo': 5,
        'orderFlow': 6,
        'datosCliente': 7,
        'paymentFlow': 8,
        'order_confirmed': 9
    };

    static getInstance(): FlowCoordinator {
        if (!FlowCoordinator.instance) {
            FlowCoordinator.instance = new FlowCoordinator();
        }
        return FlowCoordinator.instance;
    }

    /**
     * Validate if a flow transition is allowed
     */
    validateTransition(from: string, to: string): FlowTransition {
        // Always allow backward navigation for user corrections
        const fromStage = this.FLOW_STAGES[from] || 0;
        const toStage = this.FLOW_STAGES[to] || 0;
        
        if (toStage < fromStage) {
            return {
                from,
                to,
                isValid: true,
                reason: 'Backward navigation allowed'
            };
        }

        // Check if transition is in allowed list
        const allowedTransitions = this.VALID_TRANSITIONS[from] || [];
        const isValid = allowedTransitions.includes(to);

        return {
            from,
            to,
            isValid,
            reason: isValid ? 'Valid transition' : `Invalid: ${from} -> ${to} not allowed`
        };
    }

    /**
     * Coordinate flow transition for a user
     */
    async coordinateFlowTransition(
        phone: string,
        newFlow: string,
        reason: string = 'user_action'
    ): Promise<{ success: boolean; message?: string }> {
        try {
            const currentFlow = this.activeFlows.get(phone) || 'initial';
            
            // Validate transition
            const transition = this.validateTransition(currentFlow, newFlow);
            
            if (!transition.isValid) {
                console.warn(`⚠️ Invalid flow transition for ${phone}: ${transition.reason}`);
                
                // Suggest correct flow based on stage
                const suggestedFlow = this.suggestNextFlow(currentFlow);
                console.log(`💡 Suggested flow: ${suggestedFlow}`);
                
                return {
                    success: false,
                    message: `Transición inválida. Deberías continuar en ${suggestedFlow}`
                };
            }

            // Update active flow
            this.activeFlows.set(phone, newFlow);
            console.log(`✅ Flow transition: ${currentFlow} -> ${newFlow} (${reason})`);

            // Clear message queue if moving to a new major stage
            if (this.FLOW_STAGES[newFlow] > this.FLOW_STAGES[currentFlow]) {
                this.clearMessageQueue(phone);
            }

            return { success: true };
        } catch (error) {
            console.error('❌ Error coordinating flow transition:', error);
            return {
                success: false,
                message: 'Error en la transición de flujo'
            };
        }
    }

    /**
     * Suggest the next appropriate flow based on current state
     */
    private suggestNextFlow(currentFlow: string): string {
        const allowedTransitions = this.VALID_TRANSITIONS[currentFlow] || [];
        return allowedTransitions[0] || 'mainFlow';
    }

    /**
     * Queue a message for orderly delivery
     */
    async queueMessage(
        phone: string,
        message: string,
        flow: string,
        priority: number = 5
    ): Promise<void> {
        const queue = this.messageQueues.get(phone) || [];
        
        queue.push({
            phone,
            message,
            priority,
            timestamp: new Date(),
            flow
        });

        // Sort by priority (higher first) and timestamp (older first)
        queue.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return a.timestamp.getTime() - b.timestamp.getTime();
        });

        this.messageQueues.set(phone, queue);
        console.log(`📩 Message queued for ${phone} (${flow}): ${queue.length} in queue`);
    }

    /**
     * Get next message from queue
     */
    getNextMessage(phone: string): MessageQueueItem | null {
        const queue = this.messageQueues.get(phone);
        if (!queue || queue.length === 0) {
            return null;
        }

        const message = queue.shift()!;
        this.messageQueues.set(phone, queue);
        return message;
    }

    /**
     * Clear message queue for a user
     */
    clearMessageQueue(phone: string): void {
        this.messageQueues.delete(phone);
        console.log(`🧹 Message queue cleared for ${phone}`);
    }

    /**
     * Check if user is in a critical flow that shouldn't be interrupted
     */
    isInCriticalFlow(phone: string): boolean {
        const currentFlow = this.activeFlows.get(phone);
        const criticalFlows = ['orderFlow', 'datosCliente', 'paymentFlow', 'customizationFlow'];
        return currentFlow ? criticalFlows.includes(currentFlow) : false;
    }

    /**
     * Check if conversation context should be preserved
     * This prevents jumping to unrelated topics mid-conversation
     */
    async shouldPreserveContext(phone: string, newMessage: string): Promise<{ preserve: boolean; reason: string }> {
        try {
            const session = await getUserSession(phone);
            if (!session) {
                return { preserve: false, reason: 'No session found' };
            }

            const currentFlow = this.getCurrentFlow(phone);
            const interactions = session.interactions || [];
            const recentInteractions = interactions.slice(-5); // Last 5 interactions

            // Preserve context if user is in the middle of customization
            if (currentFlow === 'customizationFlow' && recentInteractions.length > 0) {
                const lastInteraction = recentInteractions[recentInteractions.length - 1];
                const timeSinceLastInteraction = Date.now() - new Date(lastInteraction.timestamp).getTime();
                
                // If less than 30 minutes since last interaction in customization
                if (timeSinceLastInteraction < 30 * 60 * 1000) {
                    return { 
                        preserve: true, 
                        reason: 'Active customization session (< 30 min)' 
                    };
                }
            }

            // Preserve context if user is in critical flow
            if (this.isInCriticalFlow(phone)) {
                return { 
                    preserve: true, 
                    reason: 'User in critical flow' 
                };
            }

            // Preserve context if user is actively engaged (multiple messages in short time)
            if (recentInteractions.length >= 3) {
                const last3Interactions = recentInteractions.slice(-3);
                const timeSpan = new Date(last3Interactions[2].timestamp).getTime() - 
                               new Date(last3Interactions[0].timestamp).getTime();
                
                // If 3 messages within 10 minutes - user is actively engaged
                if (timeSpan < 10 * 60 * 1000) {
                    return { 
                        preserve: true, 
                        reason: 'Highly engaged user (3 messages in 10 min)' 
                    };
                }
            }

            // Check if new message is a follow-up to previous topic
            if (recentInteractions.length > 0) {
                const lastMessage = recentInteractions[recentInteractions.length - 1].message.toLowerCase();
                const newMessageLower = newMessage.toLowerCase();
                
                // Check for contextual continuity keywords
                const hasContinuity = FlowCoordinator.CONTINUITY_KEYWORDS.some(kw => 
                    newMessageLower.startsWith(kw) || newMessageLower.includes(` ${kw} `)
                );
                
                if (hasContinuity) {
                    return { 
                        preserve: true, 
                        reason: 'Message shows contextual continuity' 
                    };
                }
            }

            return { preserve: false, reason: 'No context preservation needed' };
        } catch (error) {
            console.error('❌ Error checking context preservation:', error);
            return { preserve: false, reason: 'Error checking context' };
        }
    }

    /**
     * Restore conversation context if it was lost
     */
    async restoreContextIfNeeded(phone: string): Promise<{ restored: boolean; contextSummary?: string }> {
        try {
            const session = await getUserSession(phone);
            if (!session) {
                return { restored: false };
            }

            // Check if context was lost (e.g., bot restarted, session expired)
            if (!this.activeFlows.has(phone) && session.currentFlow) {
                // Restore active flow from session
                this.activeFlows.set(phone, session.currentFlow);
                
                // Create context summary from recent interactions
                const interactions = session.interactions || [];
                const recentInteractions = interactions.slice(-3);
                
                let contextSummary = '';
                if (recentInteractions.length > 0) {
                    contextSummary = `Continuando desde: ${session.currentFlow}. `;
                    contextSummary += `Último tema: ${recentInteractions[recentInteractions.length - 1].intent || 'general'}`;
                }

                console.log(`🔄 Context restored for ${phone}: ${contextSummary}`);
                
                return { 
                    restored: true, 
                    contextSummary 
                };
            }

            return { restored: false };
        } catch (error) {
            console.error('❌ Error restoring context:', error);
            return { restored: false };
        }
    }

    /**
     * Get current flow for user
     */
    getCurrentFlow(phone: string): string {
        return this.activeFlows.get(phone) || 'initial';
    }

    /**
     * Synchronize flow state with user session
     */
    async syncWithUserSession(phone: string): Promise<void> {
        try {
            const session = await getUserSession(phone);
            if (session && session.currentFlow) {
                this.activeFlows.set(phone, session.currentFlow);
                console.log(`🔄 Flow synced with session: ${session.currentFlow}`);
            }
        } catch (error) {
            console.error('❌ Error syncing flow with session:', error);
        }
    }

    /**
     * Ensure message ordering within a flow
     */
    async ensureMessageOrder(
        phone: string,
        messages: string[],
        flow: string
    ): Promise<string[]> {
        // Check if flow transition is valid
        const currentFlow = this.getCurrentFlow(phone);
        const transition = this.validateTransition(currentFlow, flow);

        if (!transition.isValid) {
            console.warn(`⚠️ Skipping messages due to invalid transition: ${transition.reason}`);
            return [];
        }

        // Ensure messages are sent in order
        const orderedMessages: string[] = [];

        for (const message of messages) {
            // Validate message coherence with flow
            if (this.validateMessageForFlow(message, flow)) {
                orderedMessages.push(message);
            } else {
                console.warn(`⚠️ Message skipped: doesn't match flow ${flow}`);
            }
        }

        return orderedMessages;
    }

    /**
     * Validate if a message is appropriate for the current flow
     */
    private validateMessageForFlow(message: string, flow: string): boolean {
        // Define flow-specific keywords
        const flowKeywords: Record<string, string[]> = {
            'musicUsb': ['música', 'género', 'artista', 'canción'],
            'videosUsb': ['video', 'película', 'serie'],
            'customizationFlow': ['personaliz', 'custom', 'preferen'],
            'orderFlow': ['pedido', 'orden', 'compra', 'precio'],
            'datosCliente': ['nombre', 'dirección', 'teléfono', 'datos'],
            'paymentFlow': ['pago', 'efectivo', 'transferencia', 'tarjeta']
        };

        const keywords = flowKeywords[flow];
        if (!keywords) {
            return true; // Allow if no specific keywords defined
        }

        // Check if message contains at least one relevant keyword
        const lowerMessage = message.toLowerCase();
        return keywords.some(keyword => lowerMessage.includes(keyword));
    }

    /**
     * Get statistics about flow coordination
     */
    getStats() {
        const queueSizes: Record<string, number> = {};
        this.messageQueues.forEach((queue, phone) => {
            queueSizes[phone] = queue.length;
        });

        return {
            activeFlows: this.activeFlows.size,
            totalQueuedMessages: Array.from(this.messageQueues.values()).reduce(
                (sum, queue) => sum + queue.length,
                0
            ),
            queueSizes,
            flowDistribution: this.getFlowDistribution()
        };
    }

    /**
     * Get distribution of users across flows
     */
    private getFlowDistribution(): Record<string, number> {
        const distribution: Record<string, number> = {};
        
        this.activeFlows.forEach(flow => {
            distribution[flow] = (distribution[flow] || 0) + 1;
        });

        return distribution;
    }

    /**
     * Reset user flow to initial state
     */
    async resetUserFlow(phone: string): Promise<void> {
        this.activeFlows.delete(phone);
        this.clearMessageQueue(phone);
        console.log(`🔄 Flow reset for ${phone}`);
    }

    /**
     * Validate and log a flow transition with database persistence
     */
    async validateAndLogTransition(
        phone: string,
        fromFlow: string,
        toFlow: string,
        fromStage: string,
        toStage: string,
        trigger: string = 'user_action'
    ): Promise<{ isValid: boolean; reason?: string }> {
        // Validate the transition
        const validation = this.validateTransition(fromFlow, toFlow);
        
        if (!validation.isValid) {
            console.warn(`⚠️ Invalid flow transition for ${phone}: ${fromFlow} -> ${toFlow}`);
            return { isValid: false, reason: validation.reason };
        }
        
        // Log to database
        try {
            await businessDB.logFlowTransition({
                phone,
                fromFlow,
                toFlow,
                fromStage,
                toStage,
                trigger,
                metadata: {
                    timestamp: new Date(),
                    validation: 'passed'
                }
            });
            
            console.log(`✅ Flow transition validated and logged: ${phone} ${fromFlow}/${fromStage} -> ${toFlow}/${toStage}`);
        } catch (error) {
            console.error('❌ Error logging flow transition:', error);
        }
        
        return { isValid: true };
    }
}

export const flowCoordinator = FlowCoordinator.getInstance();
