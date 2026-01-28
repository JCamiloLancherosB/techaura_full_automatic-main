/**
 * Inbound Message Queue
 * Temporary queue for messages received during RECONNECTING state
 * 
 * Features:
 * - In-memory queue with TTL
 * - Process queued messages when state becomes CONNECTED
 * - No silent drops - all messages logged via DecisionTrace
 * - Configurable TTL and max queue size
 */

import { whatsAppProviderState, ProviderState } from './WhatsAppProviderState';
import { messageDecisionService, DecisionStage, Decision, DecisionReasonCode } from './MessageDecisionService';
import { messageTelemetryService, TelemetrySkipReason } from './MessageTelemetryService';

export interface QueuedInboundMessage {
    /** Message ID from WhatsApp */
    messageId: string;
    /** Phone number of sender */
    phone: string;
    /** Message content */
    message: string;
    /** Timestamp when message was queued */
    queuedAt: Date;
    /** Expiration timestamp (TTL) */
    expiresAt: Date;
    /** Additional context */
    context?: {
        messageType?: string;
        correlationId?: string;
        [key: string]: any;
    };
}

export interface QueueStats {
    queuedCount: number;
    processedCount: number;
    expiredCount: number;
    maxQueueSize: number;
    ttlMs: number;
}

type MessageProcessor = (msg: QueuedInboundMessage) => Promise<void>;

/**
 * Inbound Message Queue
 * Buffers incoming messages during RECONNECTING state
 */
export class InboundMessageQueue {
    private static instance: InboundMessageQueue;

    // Queue configuration
    private readonly DEFAULT_TTL_MS = 30 * 1000; // 30 seconds default TTL
    private readonly MAX_QUEUE_SIZE = 100; // Maximum messages to queue

    // Queue storage
    private queue: Map<string, QueuedInboundMessage> = new Map();
    
    // Statistics
    private stats = {
        totalQueued: 0,
        totalProcessed: 0,
        totalExpired: 0
    };

    // Message processor callback
    private messageProcessor: MessageProcessor | null = null;

    // TTL configuration
    private ttlMs: number;

    // Processing lock to prevent concurrent queue processing
    private isProcessing: boolean = false;

    // Cleanup interval handle for proper shutdown
    private cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null;

    private constructor() {
        this.ttlMs = this.DEFAULT_TTL_MS;

        // Register for provider state changes
        whatsAppProviderState.onStateChange('inbound-message-queue', (newState, oldState) => {
            this.handleStateChange(newState, oldState);
        });

        // Start cleanup interval
        this.startCleanupInterval();

        console.log('✅ InboundMessageQueue initialized');
    }

    static getInstance(): InboundMessageQueue {
        if (!InboundMessageQueue.instance) {
            InboundMessageQueue.instance = new InboundMessageQueue();
        }
        return InboundMessageQueue.instance;
    }

    /**
     * Set the message processor callback
     * Called when messages are processed from the queue
     */
    setMessageProcessor(processor: MessageProcessor): void {
        this.messageProcessor = processor;
        console.log('📝 InboundMessageQueue: Message processor registered');
    }

    /**
     * Check if a message processor is registered
     * Used by health checks and startup validation
     */
    isProcessorRegistered(): boolean {
        return this.messageProcessor !== null;
    }

    /**
     * Configure TTL for queued messages
     */
    setTTL(ttlMs: number): void {
        this.ttlMs = Math.max(5000, ttlMs); // Minimum 5 seconds
        console.log(`⏱️ InboundMessageQueue: TTL set to ${this.ttlMs}ms`);
    }

    /**
     * Queue an inbound message during RECONNECTING state
     * @returns true if queued, false if not (e.g., should process immediately or dropped)
     */
    async queueMessage(
        messageId: string,
        phone: string,
        message: string,
        context?: QueuedInboundMessage['context']
    ): Promise<{ queued: boolean; reason: string }> {
        // Input validation
        if (!messageId || typeof messageId !== 'string' || messageId.trim() === '') {
            console.warn('⚠️ InboundMessageQueue: Invalid messageId provided');
            return { queued: false, reason: 'Invalid messageId' };
        }
        if (!phone || typeof phone !== 'string' || phone.trim() === '') {
            console.warn('⚠️ InboundMessageQueue: Invalid phone provided');
            return { queued: false, reason: 'Invalid phone' };
        }
        if (!message || typeof message !== 'string') {
            console.warn('⚠️ InboundMessageQueue: Invalid message provided');
            return { queued: false, reason: 'Invalid message' };
        }

        const state = whatsAppProviderState.getState();

        // If CONNECTED, don't queue - process immediately
        if (state === ProviderState.CONNECTED) {
            return { 
                queued: false, 
                reason: 'Provider connected - process immediately' 
            };
        }

        // If DISCONNECTED (not reconnecting), still queue briefly
        // The message might be processable when connection is restored
        
        // Check queue size limit
        if (this.queue.size >= this.MAX_QUEUE_SIZE) {
            console.warn(`⚠️ InboundMessageQueue: Queue full (${this.MAX_QUEUE_SIZE}), dropping oldest message`);
            // Remove oldest message
            const oldestKey = this.queue.keys().next().value;
            if (oldestKey) {
                const oldestMsg = this.queue.get(oldestKey);
                this.queue.delete(oldestKey);
                this.stats.totalExpired++;

                // Log dropped message via DecisionTrace
                if (oldestMsg) {
                    await this.recordDroppedMessage(oldestMsg, 'Queue full - dropped oldest');
                }
            }
        }

        // Create queued message
        const now = new Date();
        const queuedMessage: QueuedInboundMessage = {
            messageId,
            phone,
            message,
            queuedAt: now,
            expiresAt: new Date(now.getTime() + this.ttlMs),
            context
        };

        // Add to queue
        this.queue.set(messageId, queuedMessage);
        this.stats.totalQueued++;

        console.log(`📥 InboundMessageQueue: Queued message ${messageId.substring(0, 10)}... from ${phone} (state: ${state}, queue size: ${this.queue.size})`);

        // Record deferred decision via DecisionTrace
        await messageDecisionService.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.INBOUND_RECEIVED,
            decision: Decision.DEFER,
            reasonCode: DecisionReasonCode.PROCESSING,
            reasonDetail: `Message queued during ${state} state, TTL ${this.ttlMs}ms`,
            nextEligibleAt: queuedMessage.expiresAt,
            correlationId: context?.correlationId
        });

        // Record QUEUED telemetry event
        messageTelemetryService.recordQueued(
            messageId, phone, `Queued during ${state} state, TTL ${this.ttlMs}ms`, context?.correlationId
        ).catch(err => console.error('Telemetry error:', err));

        return { 
            queued: true, 
            reason: `Queued during ${state} state` 
        };
    }

    /**
     * Check if a message should be queued based on current state
     */
    shouldQueueMessage(): boolean {
        const state = whatsAppProviderState.getState();
        return state !== ProviderState.CONNECTED;
    }

    /**
     * Get current queue size
     */
    getQueueSize(): number {
        return this.queue.size;
    }

    /**
     * Get queue statistics
     */
    getStats(): QueueStats {
        return {
            queuedCount: this.queue.size,
            processedCount: this.stats.totalProcessed,
            expiredCount: this.stats.totalExpired,
            maxQueueSize: this.MAX_QUEUE_SIZE,
            ttlMs: this.ttlMs
        };
    }

    /**
     * Get all queued messages (for debugging)
     */
    getQueuedMessages(): QueuedInboundMessage[] {
        return Array.from(this.queue.values());
    }

    /**
     * Process all queued messages
     * Called when state transitions to CONNECTED
     * Uses a lock to prevent concurrent processing
     */
    async processQueue(): Promise<number> {
        // Prevent concurrent processing
        if (this.isProcessing) {
            console.log('⚠️ InboundMessageQueue: Queue processing already in progress, skipping');
            return 0;
        }

        if (!this.messageProcessor) {
            console.warn('⚠️ InboundMessageQueue: No message processor registered - messages remain in buffer mode');
            console.warn(`⚠️ InboundMessageQueue: ${this.queue.size} messages buffered, waiting for processor registration`);
            return 0;
        }

        this.isProcessing = true;
        const now = Date.now();
        let processed = 0;
        let expired = 0;

        try {
            console.log(`🔄 InboundMessageQueue: Processing ${this.queue.size} queued messages`);

            // Process in FIFO order
            for (const [messageId, msg] of this.queue) {
                // Check if expired
                if (msg.expiresAt.getTime() < now) {
                    console.log(`⏰ InboundMessageQueue: Message ${messageId.substring(0, 10)}... expired (TTL)`);
                    this.queue.delete(messageId);
                    expired++;
                    this.stats.totalExpired++;

                    // Record expired message via DecisionTrace
                    await this.recordExpiredMessage(msg);
                    continue;
                }

                // Process the message
                try {
                    await this.messageProcessor(msg);
                    this.queue.delete(messageId);
                    processed++;
                    this.stats.totalProcessed++;

                    console.log(`✅ InboundMessageQueue: Processed queued message ${messageId.substring(0, 10)}...`);

                    // Record successful processing via DecisionTrace
                    await messageDecisionService.recordSuccess(
                        messageId,
                        msg.phone,
                        DecisionStage.INBOUND_RECEIVED,
                        'Processed from reconnection queue',
                        msg.context?.correlationId
                    );
                } catch (error) {
                    console.error(`❌ InboundMessageQueue: Error processing message ${messageId.substring(0, 10)}...:`, error);
                    // Message remains in queue - will expire via TTL if processing continues to fail
                    // This prevents infinite retry loops while still giving the message a chance
                }
            }

            console.log(`📊 InboundMessageQueue: Processed ${processed}, expired ${expired}, remaining ${this.queue.size}`);
        } finally {
            this.isProcessing = false;
        }
        
        return processed;
    }

    /**
     * Handle provider state changes
     */
    private handleStateChange(newState: ProviderState, oldState: ProviderState): void {
        console.log(`📡 InboundMessageQueue: Provider state changed ${oldState} → ${newState}`);

        // When transitioning to CONNECTED, check for processor and process the queue
        if (newState === ProviderState.CONNECTED && oldState !== ProviderState.CONNECTED) {
            // HIGH SEVERITY: Log error if no processor registered when connecting
            if (!this.messageProcessor) {
                console.error('🚨 CRITICAL: InboundMessageQueue: No message processor registered when provider connected!');
                console.error('🚨 CRITICAL: Incoming messages will be buffered but NOT processed until a processor is registered.');
                console.error('🚨 CRITICAL: Call inboundMessageQueue.setMessageProcessor() during bootstrap BEFORE connecting WhatsApp.');
                // Messages will remain in buffer mode - they won't be lost, just not processed
                return;
            }
            
            // Use setImmediate to avoid blocking the state change notification
            setImmediate(async () => {
                await this.processQueue();
            });
        }
    }

    /**
     * Clean up expired messages
     */
    private cleanupExpired(): void {
        const now = Date.now();
        let expired = 0;

        for (const [messageId, msg] of this.queue) {
            if (msg.expiresAt.getTime() < now) {
                this.queue.delete(messageId);
                expired++;
                this.stats.totalExpired++;

                // Record expired message (async, don't await)
                this.recordExpiredMessage(msg).catch(err => {
                    console.error('Error recording expired message:', err);
                });
            }
        }

        if (expired > 0) {
            console.log(`🧹 InboundMessageQueue: Cleaned up ${expired} expired messages`);
        }
    }

    /**
     * Start periodic cleanup of expired messages
     */
    private startCleanupInterval(): void {
        this.cleanupIntervalHandle = setInterval(() => {
            this.cleanupExpired();
        }, 10000); // Check every 10 seconds
    }

    /**
     * Stop the cleanup interval (for shutdown)
     */
    stopCleanupInterval(): void {
        if (this.cleanupIntervalHandle) {
            clearInterval(this.cleanupIntervalHandle);
            this.cleanupIntervalHandle = null;
            console.log('🛑 InboundMessageQueue: Cleanup interval stopped');
        }
    }

    /**
     * Record a dropped message via DecisionTrace
     */
    private async recordDroppedMessage(msg: QueuedInboundMessage, reason: string): Promise<void> {
        try {
            await messageDecisionService.recordDecision({
                messageId: msg.messageId,
                phone: msg.phone,
                stage: DecisionStage.INBOUND_RECEIVED,
                decision: Decision.SKIP,
                reasonCode: DecisionReasonCode.QUEUE_CAPACITY_EXCEEDED,
                reasonDetail: `Inbound queue: ${reason}`,
                correlationId: msg.context?.correlationId
            });

            // Record SKIPPED telemetry for dropped message
            await messageTelemetryService.recordSkipped(
                msg.messageId, msg.phone, TelemetrySkipReason.QUEUE_DROPPED,
                `Queue dropped: ${reason}`, 'inbound_queue', msg.context?.correlationId
            );
        } catch (error) {
            console.error('Error recording dropped message:', error);
        }
    }

    /**
     * Record an expired message via DecisionTrace
     */
    private async recordExpiredMessage(msg: QueuedInboundMessage): Promise<void> {
        try {
            await messageDecisionService.recordDecision({
                messageId: msg.messageId,
                phone: msg.phone,
                stage: DecisionStage.INBOUND_RECEIVED,
                decision: Decision.SKIP,
                reasonCode: DecisionReasonCode.QUEUE_MESSAGE_EXPIRED,
                reasonDetail: `Inbound queue: Message expired (TTL ${this.ttlMs}ms)`,
                correlationId: msg.context?.correlationId
            });

            // Record SKIPPED telemetry for expired message
            await messageTelemetryService.recordSkipped(
                msg.messageId, msg.phone, TelemetrySkipReason.QUEUE_EXPIRED,
                `Queue expired: TTL ${this.ttlMs}ms`, 'inbound_queue', msg.context?.correlationId
            );
        } catch (error) {
            console.error('Error recording expired message:', error);
        }
    }

    /**
     * Clear the queue (for testing or manual intervention)
     */
    clear(): void {
        this.queue.clear();
        console.log('🧹 InboundMessageQueue: Queue cleared');
    }

    /**
     * Reset statistics (for testing)
     */
    resetStats(): void {
        this.stats = {
            totalQueued: 0,
            totalProcessed: 0,
            totalExpired: 0
        };
    }

    /**
     * Clear the message processor (for testing only)
     * This allows tests to verify behavior when no processor is registered
     */
    clearProcessor(): void {
        this.messageProcessor = null;
        console.log('🧹 InboundMessageQueue: Message processor cleared (for testing)');
    }

    /**
     * Shutdown the queue (cleanup resources)
     */
    shutdown(): void {
        this.stopCleanupInterval();
        this.clear();
        this.isProcessing = false;
        console.log('🛑 InboundMessageQueue: Shutdown complete');
    }
}

// Export singleton instance
export const inboundMessageQueue = InboundMessageQueue.getInstance();

console.log('✅ InboundMessageQueue module loaded');
