/**
 * Flow Coordinator - Ensures all flows are synchronized and messages flow coherently
 * Validates flow transitions and prevents message conflicts
 */

import type { UserSession } from '../../types/global';
import { getUserSession, updateUserSession } from '../flows/userTrackingSystem';

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
}

export const flowCoordinator = FlowCoordinator.getInstance();
