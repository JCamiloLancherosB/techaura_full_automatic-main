/**
 * Message Telemetry Service
 * Tracks inbound message lifecycle: RECEIVED → QUEUED → PROCESSING → RESPONDED/SKIPPED/ERROR
 * Provides specialized methods for telemetry events and funnel analysis
 */

import { messageDecisionService, DecisionStage, Decision, DecisionReasonCode } from './MessageDecisionService';
import { messageDecisionRepository } from '../repositories/MessageDecisionRepository';
import { hashPhone } from '../utils/phoneHasher';
import { getCorrelationId } from './CorrelationIdManager';
import { structuredLogger } from '../utils/structuredLogger';

/**
 * Telemetry outcome types for final message state
 */
export type TelemetryOutcome = 'RESPONDED' | 'SKIPPED' | 'ERROR';

/**
 * Telemetry event data for tracking
 */
export interface TelemetryEvent {
    messageId: string;
    phone: string;
    stage: DecisionStage;
    outcome?: TelemetryOutcome;
    reason?: string;
    processingTimeMs?: number;
    correlationId?: string;
}

/**
 * Funnel statistics for a time window
 */
export interface TelemetryFunnel {
    windowMinutes: number;
    received: number;
    queued: number;
    processing: number;
    responded: number;
    skipped: number;
    errors: number;
    skipReasons: { [reason: string]: number };
}

/**
 * Message history by phone for diagnostics
 */
export interface PhoneMessageHistory {
    phoneHash: string;
    messages: Array<{
        messageId: string;
        timestamp: Date;
        stage: DecisionStage;
        decision: Decision;
        reasonCode: string;
        reasonDetail?: string;
        processingTimeMs?: number;
    }>;
}

/**
 * Message Telemetry Service
 * Specialized service for inbound message telemetry
 */
export class MessageTelemetryService {
    private static instance: MessageTelemetryService;

    // In-memory start time tracking for processing time calculation
    private processingStartTimes: Map<string, number> = new Map();

    private constructor() {
        // Cleanup old start times periodically (every 5 minutes)
        setInterval(() => {
            this.cleanupOldStartTimes();
        }, 5 * 60 * 1000);
    }

    static getInstance(): MessageTelemetryService {
        if (!MessageTelemetryService.instance) {
            MessageTelemetryService.instance = new MessageTelemetryService();
        }
        return MessageTelemetryService.instance;
    }

    /**
     * Record RECEIVED - message arrived at inbound handler
     */
    async recordReceived(messageId: string, phone: string, correlationId?: string): Promise<void> {
        const cid = correlationId || getCorrelationId();
        
        // Store start time for processing time calculation
        this.processingStartTimes.set(messageId, Date.now());

        await messageDecisionService.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.INBOUND_RECEIVED,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.RECEIVED,
            reasonDetail: 'Message received at inbound handler',
            correlationId: cid
        });

        structuredLogger.info('message_telemetry', 'RECEIVED', {
            message_id: messageId.substring(0, 20),
            phone_hash: hashPhone(phone),
            correlation_id: cid
        });
    }

    /**
     * Record QUEUED - message placed in queue for processing
     */
    async recordQueued(messageId: string, phone: string, reason?: string, correlationId?: string): Promise<void> {
        const cid = correlationId || getCorrelationId();

        await messageDecisionService.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.QUEUED,
            decision: Decision.DEFER,
            reasonCode: DecisionReasonCode.QUEUED,
            reasonDetail: reason || 'Message queued for processing',
            correlationId: cid
        });

        structuredLogger.info('message_telemetry', 'QUEUED', {
            message_id: messageId.substring(0, 20),
            phone_hash: hashPhone(phone),
            reason,
            correlation_id: cid
        });
    }

    /**
     * Record PROCESSING - message is being actively processed
     */
    async recordProcessing(messageId: string, phone: string, correlationId?: string): Promise<void> {
        const cid = correlationId || getCorrelationId();

        // Update start time if not already set
        if (!this.processingStartTimes.has(messageId)) {
            this.processingStartTimes.set(messageId, Date.now());
        }

        await messageDecisionService.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.FLOW,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.PROCESSING,
            reasonDetail: 'Message processing started',
            correlationId: cid
        });

        structuredLogger.info('message_telemetry', 'PROCESSING', {
            message_id: messageId.substring(0, 20),
            phone_hash: hashPhone(phone),
            correlation_id: cid
        });
    }

    /**
     * Record RESPONDED - message was successfully processed and response sent
     */
    async recordResponded(messageId: string, phone: string, details?: string, correlationId?: string): Promise<void> {
        const cid = correlationId || getCorrelationId();
        const processingTimeMs = this.getProcessingTime(messageId);

        await messageDecisionService.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.SEND,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.RESPONDED,
            reasonDetail: details ? `Responded: ${details}` : 'Response sent successfully',
            correlationId: cid
        });

        structuredLogger.info('message_telemetry', 'RESPONDED', {
            message_id: messageId.substring(0, 20),
            phone_hash: hashPhone(phone),
            processing_time_ms: processingTimeMs,
            correlation_id: cid
        });

        // Cleanup start time
        this.processingStartTimes.delete(messageId);
    }

    /**
     * Record SKIPPED - message was skipped (not responded to)
     */
    async recordSkipped(
        messageId: string, 
        phone: string, 
        reason: string, 
        reasonCode?: DecisionReasonCode,
        correlationId?: string
    ): Promise<void> {
        const cid = correlationId || getCorrelationId();
        const processingTimeMs = this.getProcessingTime(messageId);

        await messageDecisionService.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.FLOW,
            decision: Decision.SKIP,
            reasonCode: reasonCode || DecisionReasonCode.SKIPPED,
            reasonDetail: `Skipped: ${reason}`,
            correlationId: cid
        });

        structuredLogger.info('message_telemetry', 'SKIPPED', {
            message_id: messageId.substring(0, 20),
            phone_hash: hashPhone(phone),
            reason,
            processing_time_ms: processingTimeMs,
            correlation_id: cid
        });

        // Cleanup start time
        this.processingStartTimes.delete(messageId);
    }

    /**
     * Record ERROR - message processing failed
     */
    async recordError(
        messageId: string, 
        phone: string, 
        errorDetail: string,
        correlationId?: string
    ): Promise<void> {
        const cid = correlationId || getCorrelationId();
        const processingTimeMs = this.getProcessingTime(messageId);

        await messageDecisionService.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.FLOW,
            decision: Decision.ERROR,
            reasonCode: DecisionReasonCode.AI_ERROR,
            reasonDetail: `Error: ${errorDetail}`,
            correlationId: cid
        });

        structuredLogger.error('message_telemetry', 'ERROR', {
            message_id: messageId.substring(0, 20),
            phone_hash: hashPhone(phone),
            error_detail: errorDetail,
            processing_time_ms: processingTimeMs,
            correlation_id: cid
        });

        // Cleanup start time
        this.processingStartTimes.delete(messageId);
    }

    /**
     * Get telemetry funnel for a time window
     * Returns counts of messages at each stage
     */
    async getFunnel(windowMinutes: number = 5): Promise<TelemetryFunnel> {
        const dateFrom = new Date(Date.now() - windowMinutes * 60 * 1000);
        const dateTo = new Date();

        try {
            // Get all decisions in the time window
            const decisions = await messageDecisionRepository.findByFilter({
                dateFrom,
                dateTo
            }, 5000);

            // Group by message ID to get final state
            const messageStates = new Map<string, { stage: string; decision: string; reasonCode: string }>();
            
            for (const d of decisions) {
                const current = messageStates.get(d.messageId);
                // Keep the latest stage for each message
                if (!current || new Date(d.timestamp) > new Date((current as any).timestamp)) {
                    messageStates.set(d.messageId, {
                        stage: d.stage,
                        decision: d.decision,
                        reasonCode: d.reasonCode
                    });
                }
            }

            // Count by reason code
            const skipReasons: { [reason: string]: number } = {};
            let received = 0;
            let queued = 0;
            let processing = 0;
            let responded = 0;
            let skipped = 0;
            let errors = 0;

            for (const d of decisions) {
                if (d.reasonCode === DecisionReasonCode.RECEIVED) received++;
                if (d.reasonCode === DecisionReasonCode.QUEUED) queued++;
                if (d.reasonCode === DecisionReasonCode.PROCESSING) processing++;
                if (d.reasonCode === DecisionReasonCode.RESPONDED || d.reasonCode === DecisionReasonCode.SUCCESS) responded++;
                
                if (d.decision === Decision.SKIP) {
                    skipped++;
                    skipReasons[d.reasonCode] = (skipReasons[d.reasonCode] || 0) + 1;
                }
                if (d.decision === Decision.ERROR) errors++;
            }

            return {
                windowMinutes,
                received,
                queued,
                processing,
                responded,
                skipped,
                errors,
                skipReasons
            };
        } catch (error) {
            structuredLogger.error('message_telemetry', 'Error getting funnel', { error });
            return {
                windowMinutes,
                received: 0,
                queued: 0,
                processing: 0,
                responded: 0,
                skipped: 0,
                errors: 0,
                skipReasons: {}
            };
        }
    }

    /**
     * Get recent messages for a phone number
     */
    async getMessagesByPhone(phone: string, limit: number = 20): Promise<PhoneMessageHistory> {
        const phoneHash = hashPhone(phone);
        
        try {
            const decisions = await messageDecisionRepository.getByPhoneHash(phoneHash, limit);
            
            return {
                phoneHash,
                messages: decisions.map(d => ({
                    messageId: d.messageId,
                    timestamp: d.timestamp,
                    stage: d.stage as DecisionStage,
                    decision: d.decision as Decision,
                    reasonCode: d.reasonCode,
                    reasonDetail: d.reasonDetail
                }))
            };
        } catch (error) {
            structuredLogger.error('message_telemetry', 'Error getting messages by phone', { 
                error,
                phone_hash: phoneHash
            });
            return { phoneHash, messages: [] };
        }
    }

    /**
     * Get recent messages by phone hash (for admin API)
     */
    async getMessagesByPhoneHash(phoneHash: string, limit: number = 20): Promise<PhoneMessageHistory> {
        try {
            const decisions = await messageDecisionRepository.getByPhoneHash(phoneHash, limit);
            
            return {
                phoneHash,
                messages: decisions.map(d => ({
                    messageId: d.messageId,
                    timestamp: d.timestamp,
                    stage: d.stage as DecisionStage,
                    decision: d.decision as Decision,
                    reasonCode: d.reasonCode,
                    reasonDetail: d.reasonDetail
                }))
            };
        } catch (error) {
            structuredLogger.error('message_telemetry', 'Error getting messages by phone hash', { 
                error,
                phone_hash: phoneHash
            });
            return { phoneHash, messages: [] };
        }
    }

    /**
     * Get 5-minute summary for dashboard
     */
    async get5MinuteSummary(): Promise<{
        processed: number;
        skipped: number;
        errors: number;
        avgProcessingTimeMs: number;
    }> {
        const funnel = await this.getFunnel(5);
        
        return {
            processed: funnel.responded,
            skipped: funnel.skipped,
            errors: funnel.errors,
            avgProcessingTimeMs: 0 // TODO: Calculate from stored processing times
        };
    }

    /**
     * Get processing time for a message
     */
    private getProcessingTime(messageId: string): number | undefined {
        const startTime = this.processingStartTimes.get(messageId);
        if (startTime) {
            return Date.now() - startTime;
        }
        return undefined;
    }

    /**
     * Cleanup old start times (older than 5 minutes)
     */
    private cleanupOldStartTimes(): void {
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        let cleaned = 0;
        
        for (const [messageId, startTime] of this.processingStartTimes) {
            if (startTime < fiveMinutesAgo) {
                this.processingStartTimes.delete(messageId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            structuredLogger.debug('message_telemetry', `Cleaned ${cleaned} old processing start times`);
        }
    }
}

// Export singleton instance
export const messageTelemetryService = MessageTelemetryService.getInstance();
