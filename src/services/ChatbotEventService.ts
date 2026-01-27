/**
 * ChatbotEventService
 * Service layer for tracking and persisting chatbot events for audit and analytics
 */

import { 
    chatbotEventRepository, 
    ChatbotEvent, 
    ChatbotEventType,
    ChatbotEventFilter,
    ChatbotEventPaginatedResult
} from '../repositories/ChatbotEventRepository';
import { structuredLogger } from '../utils/structuredLogger';

interface EventPayload {
    [key: string]: any;
}

/**
 * Service for tracking chatbot events
 * Provides a high-level API for emitting events that are persisted for audit and analytics
 */
export class ChatbotEventService {
    
    /**
     * Track a generic chatbot event
     */
    async trackEvent(
        conversationId: string,
        phone: string,
        eventType: string,
        payload?: EventPayload,
        orderId?: string
    ): Promise<number> {
        try {
            const eventId = await chatbotEventRepository.create({
                conversation_id: conversationId,
                phone,
                event_type: eventType,
                payload_json: payload,
                order_id: orderId
            });
            
            structuredLogger.logWithPhone(
                'debug',
                'chatbot',
                `Event tracked: ${eventType}`,
                phone,
                { conversationId, eventType, orderId }
            );
            
            return eventId;
        } catch (error) {
            structuredLogger.error('chatbot', 'Error tracking event', {
                error,
                conversationId,
                phone,
                eventType
            });
            throw error;
        }
    }
    
    /**
     * Track when a message is received from the user
     */
    async trackMessageReceived(
        conversationId: string,
        phone: string,
        message: string,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.MESSAGE_RECEIVED,
            {
                message: message.substring(0, 1000), // Truncate long messages
                messageLength: message.length,
                ...metadata
            }
        );
    }
    
    /**
     * Track when a message is sent by the bot
     */
    async trackMessageSent(
        conversationId: string,
        phone: string,
        message: string,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.MESSAGE_SENT,
            {
                message: message.substring(0, 1000),
                messageLength: message.length,
                ...metadata
            }
        );
    }
    
    /**
     * Track when an intent is detected
     */
    async trackIntentDetected(
        conversationId: string,
        phone: string,
        intent: string,
        confidence: number,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.INTENT_DETECTED,
            {
                intent,
                confidence,
                ...metadata
            }
        );
    }
    
    /**
     * Track a state change in the conversation
     */
    async trackStateChanged(
        conversationId: string,
        phone: string,
        previousState: string,
        newState: string,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.STATE_CHANGED,
            {
                previousState,
                newState,
                ...metadata
            }
        );
    }
    
    /**
     * Track when an order is confirmed
     */
    async trackOrderConfirmed(
        conversationId: string,
        phone: string,
        orderId: string,
        orderData?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.ORDER_CONFIRMED,
            {
                orderId,
                ...orderData
            },
            orderId
        );
    }
    
    /**
     * Track when an order status changes
     */
    async trackStatusChanged(
        conversationId: string,
        phone: string,
        orderId: string,
        previousStatus: string,
        newStatus: string,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.STATUS_CHANGED,
            {
                orderId,
                previousStatus,
                newStatus,
                ...metadata
            },
            orderId
        );
    }
    
    /**
     * Track when a flow starts
     */
    async trackFlowStarted(
        conversationId: string,
        phone: string,
        flowName: string,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.FLOW_STARTED,
            {
                flowName,
                ...metadata
            }
        );
    }
    
    /**
     * Track when a flow completes
     */
    async trackFlowCompleted(
        conversationId: string,
        phone: string,
        flowName: string,
        success: boolean,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.FLOW_COMPLETED,
            {
                flowName,
                success,
                ...metadata
            }
        );
    }
    
    /**
     * Track when a follow-up is sent
     */
    async trackFollowupSent(
        conversationId: string,
        phone: string,
        followupType: string,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.FOLLOWUP_SENT,
            {
                followupType,
                ...metadata
            }
        );
    }
    
    /**
     * Track an error event
     */
    async trackError(
        conversationId: string,
        phone: string,
        errorMessage: string,
        errorCode?: string,
        metadata?: EventPayload
    ): Promise<number> {
        return this.trackEvent(
            conversationId,
            phone,
            ChatbotEventType.ERROR_OCCURRED,
            {
                errorMessage,
                errorCode,
                ...metadata
            }
        );
    }
    
    /**
     * Get events with filtering and pagination (for admin API)
     */
    async getEvents(
        filter: ChatbotEventFilter,
        page: number = 1,
        perPage: number = 50
    ): Promise<ChatbotEventPaginatedResult> {
        return chatbotEventRepository.findByFilterPaginated(filter, page, perPage);
    }
    
    /**
     * Get event type summary for analytics
     */
    async getEventTypeSummary(filter?: ChatbotEventFilter): Promise<Array<{ event_type: string; count: number }>> {
        return chatbotEventRepository.getEventTypeSummary(filter);
    }
    
    /**
     * Get available event types
     */
    async getAvailableEventTypes(): Promise<string[]> {
        return chatbotEventRepository.getDistinctEventTypes();
    }
    
    /**
     * Get events for a specific conversation
     */
    async getConversationEvents(conversationId: string, limit: number = 100): Promise<ChatbotEvent[]> {
        return chatbotEventRepository.getByConversationId(conversationId, limit);
    }
    
    /**
     * Get events for a specific order
     */
    async getOrderEvents(orderId: string, limit: number = 100): Promise<ChatbotEvent[]> {
        return chatbotEventRepository.getByOrderId(orderId, limit);
    }
    
    /**
     * Cleanup old events (retention policy)
     */
    async cleanupOldEvents(retentionDays: number = 90): Promise<number> {
        const deletedCount = await chatbotEventRepository.deleteOlderThan(retentionDays);
        
        structuredLogger.info('chatbot', `Cleaned up ${deletedCount} old events`, {
            retentionDays,
            deletedCount
        });
        
        return deletedCount;
    }
}

// Export singleton instance
export const chatbotEventService = new ChatbotEventService();
