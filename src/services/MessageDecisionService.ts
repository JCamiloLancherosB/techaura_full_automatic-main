/**
 * Message Decision Service
 * Business logic for recording and querying decision traces
 * Ensures PII is hashed and details are redacted before persistence
 */

import { randomBytes } from 'crypto';
import { messageDecisionRepository } from '../repositories/MessageDecisionRepository';
import { hashPhone } from '../utils/phoneHasher';
import { redactPII } from '../utils/piiRedactor';
import { structuredLogger } from '../utils/structuredLogger';
import { getCorrelationId } from '../services/CorrelationIdManager';
import { 
    DecisionStage,
    Decision,
    DecisionReasonCode
} from '../types/DecisionTrace';
import type { 
    DecisionTrace,
    DecisionTraceRecord,
    DecisionTraceFilter,
    DecisionTracePaginatedResult,
    CreateDecisionTraceInput
} from '../types/DecisionTrace';

// Re-export enums for convenience
export { DecisionStage, Decision, DecisionReasonCode } from '../types/DecisionTrace';

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `trace_${timestamp}_${random}`;
}

/**
 * Message Decision Service
 * Records decision traces for the message processing pipeline
 */
export class MessageDecisionService {
    private static instance: MessageDecisionService;

    static getInstance(): MessageDecisionService {
        if (!MessageDecisionService.instance) {
            MessageDecisionService.instance = new MessageDecisionService();
        }
        return MessageDecisionService.instance;
    }

    /**
     * Record a decision trace
     * This is the main method for recording pipeline decisions
     */
    async recordDecision(input: CreateDecisionTraceInput): Promise<DecisionTrace> {
        const traceId = generateTraceId();
        const phoneHash = hashPhone(input.phone);
        const correlationId = input.correlationId || getCorrelationId();
        const timestamp = new Date();

        // Redact PII from reason detail
        const redactedReasonDetail = input.reasonDetail 
            ? redactPII(input.reasonDetail).substring(0, 500) // Limit to 500 chars
            : undefined;

        const trace: DecisionTrace = {
            traceId,
            messageId: input.messageId,
            phoneHash,
            timestamp,
            stage: input.stage,
            decision: input.decision,
            reasonCode: input.reasonCode,
            reasonDetail: redactedReasonDetail,
            nextEligibleAt: input.nextEligibleAt,
            correlationId
        };

        // Log the decision with structured logger
        this.logDecision(trace);

        // Persist to database
        try {
            const record: DecisionTraceRecord = {
                trace_id: trace.traceId,
                message_id: trace.messageId,
                phone_hash: trace.phoneHash,
                timestamp: trace.timestamp,
                stage: trace.stage,
                decision: trace.decision,
                reason_code: trace.reasonCode,
                reason_detail: trace.reasonDetail || null,
                next_eligible_at: trace.nextEligibleAt || null,
                correlation_id: trace.correlationId || null
            };

            await messageDecisionRepository.create(record);
        } catch (error) {
            // Log but don't fail the request if persistence fails
            structuredLogger.error('flow', 'Failed to persist decision trace', {
                error,
                trace_id: trace.traceId,
                phone_hash: phoneHash,
                correlation_id: correlationId
            });
        }

        return trace;
    }

    /**
     * Record RECEIVED stage - message was received at inbound handler
     */
    async recordReceived(
        messageId: string, 
        phone: string, 
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.INBOUND_RECEIVED,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.RECEIVED,
            reasonDetail: 'Message received at inbound handler',
            correlationId
        });
    }

    /**
     * Record DEDUPE stage - message was deduplicated
     */
    async recordDeduped(
        messageId: string, 
        phone: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.DEDUPE,
            decision: Decision.SKIP,
            reasonCode: DecisionReasonCode.DEDUPED,
            reasonDetail: 'Duplicate message detected',
            correlationId
        });
    }

    /**
     * Record POLICY stage - message blocked by policy
     */
    async recordPolicyBlocked(
        messageId: string,
        phone: string,
        reasonCode: DecisionReasonCode,
        reasonDetail: string,
        nextEligibleAt?: Date,
        correlationId?: string
    ): Promise<DecisionTrace> {
        const decision = nextEligibleAt ? Decision.DEFER : Decision.SKIP;
        
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.POLICY,
            decision,
            reasonCode,
            reasonDetail,
            nextEligibleAt,
            correlationId
        });
    }

    /**
     * Record ROUTER stage - no route found
     */
    async recordNoRoute(
        messageId: string,
        phone: string,
        reasonDetail: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.ROUTER,
            decision: Decision.SKIP,
            reasonCode: DecisionReasonCode.NO_ROUTE,
            reasonDetail,
            correlationId
        });
    }

    /**
     * Record ROUTER stage - context blocked
     */
    async recordContextBlocked(
        messageId: string,
        phone: string,
        reasonDetail: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.ROUTER,
            decision: Decision.SKIP,
            reasonCode: DecisionReasonCode.CONTEXT_BLOCKED,
            reasonDetail,
            correlationId
        });
    }

    /**
     * Record AI stage - AI processing error
     */
    async recordAIError(
        messageId: string,
        phone: string,
        reasonDetail: string,
        hasFallback: boolean = false,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.AI,
            decision: hasFallback ? Decision.RESPOND : Decision.ERROR,
            reasonCode: hasFallback ? DecisionReasonCode.AI_FALLBACK : DecisionReasonCode.AI_ERROR,
            reasonDetail: hasFallback 
                ? `AI error with fallback: ${reasonDetail}` 
                : `AI error: ${reasonDetail}`,
            correlationId
        });
    }

    /**
     * Record SEND stage - WhatsApp send failed
     */
    async recordSendFailed(
        messageId: string,
        phone: string,
        reasonDetail: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.SEND,
            decision: Decision.ERROR,
            reasonCode: DecisionReasonCode.PROVIDER_SEND_FAIL,
            reasonDetail,
            correlationId
        });
    }

    /**
     * Record successful response
     */
    async recordSuccess(
        messageId: string,
        phone: string,
        stage: DecisionStage,
        reasonDetail?: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.SUCCESS,
            reasonDetail: reasonDetail || 'Response sent successfully',
            correlationId
        });
    }

    /**
     * Record QUEUED stage - message was queued for processing
     */
    async recordQueued(
        messageId: string,
        phone: string,
        reasonDetail?: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.QUEUED,
            decision: Decision.DEFER,
            reasonCode: DecisionReasonCode.QUEUED,
            reasonDetail: reasonDetail || 'Message queued for processing',
            correlationId
        });
    }

    /**
     * Record PROCESSING stage - message processing has started
     */
    async recordProcessingStarted(
        messageId: string,
        phone: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.PROCESSING,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.PROCESSING_STARTED,
            reasonDetail: 'Message processing started',
            correlationId
        });
    }

    /**
     * Record RESPONDED outcome - message was successfully responded to
     */
    async recordResponded(
        messageId: string,
        phone: string,
        reasonDetail?: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.SEND,
            decision: Decision.RESPOND,
            reasonCode: DecisionReasonCode.RESPONDED,
            reasonDetail: reasonDetail || 'Response sent successfully',
            correlationId
        });
    }

    /**
     * Record SKIPPED outcome - message was skipped (with reason)
     */
    async recordSkipped(
        messageId: string,
        phone: string,
        skipReason: string,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage: DecisionStage.SEND,
            decision: Decision.SKIP,
            reasonCode: DecisionReasonCode.SKIPPED,
            reasonDetail: `Skipped: ${skipReason}`,
            correlationId
        });
    }

    /**
     * Record ERROR outcome - message processing encountered an error
     */
    async recordError(
        messageId: string,
        phone: string,
        errorDetail: string,
        stage: DecisionStage = DecisionStage.PROCESSING,
        correlationId?: string
    ): Promise<DecisionTrace> {
        return this.recordDecision({
            messageId,
            phone,
            stage,
            decision: Decision.ERROR,
            reasonCode: DecisionReasonCode.AI_ERROR,
            reasonDetail: `Error: ${errorDetail}`,
            correlationId
        });
    }

    /**
     * Log decision to structured logger
     */
    private logDecision(trace: DecisionTrace): void {
        const level = trace.decision === Decision.ERROR ? 'error' 
            : trace.decision === Decision.SKIP || trace.decision === Decision.DEFER ? 'warn' 
            : 'info';

        structuredLogger[level]('flow', `Decision: ${trace.decision} at ${trace.stage}`, {
            trace_id: trace.traceId,
            message_id: trace.messageId.substring(0, 20),
            phone_hash: trace.phoneHash,
            stage: trace.stage,
            decision: trace.decision,
            reason_code: trace.reasonCode,
            reason_detail: trace.reasonDetail,
            next_eligible_at: trace.nextEligibleAt?.toISOString(),
            correlation_id: trace.correlationId
        });
    }

    /**
     * Query decision traces by phone (using hash)
     */
    async getDecisionsByPhone(phone: string, limit: number = 50): Promise<DecisionTrace[]> {
        const phoneHash = hashPhone(phone);
        return messageDecisionRepository.getByPhoneHash(phoneHash, limit);
    }

    /**
     * Query decision traces by phone hash (for admin API)
     */
    async getDecisionsByPhoneHash(phoneHash: string, limit: number = 50): Promise<DecisionTrace[]> {
        return messageDecisionRepository.getByPhoneHash(phoneHash, limit);
    }

    /**
     * Query decision traces by message ID
     */
    async getDecisionsByMessageId(messageId: string): Promise<DecisionTrace[]> {
        return messageDecisionRepository.getByMessageId(messageId);
    }

    /**
     * Query decision traces with filters and pagination
     */
    async queryDecisions(
        filter: DecisionTraceFilter,
        page: number = 1,
        perPage: number = 50
    ): Promise<DecisionTracePaginatedResult> {
        return messageDecisionRepository.findByFilterPaginated(filter, page, perPage);
    }

    /**
     * Get decision summary statistics
     */
    async getDecisionSummary(filter?: DecisionTraceFilter): Promise<Array<{ decision: string; count: number }>> {
        return messageDecisionRepository.getDecisionSummary(filter);
    }

    /**
     * Get reason code summary statistics
     */
    async getReasonCodeSummary(filter?: DecisionTraceFilter): Promise<Array<{ reason_code: string; count: number }>> {
        return messageDecisionRepository.getReasonCodeSummary(filter);
    }

    /**
     * Cleanup old decision traces
     */
    async cleanup(retentionDays: number = 30): Promise<number> {
        return messageDecisionRepository.deleteOlderThan(retentionDays);
    }
}

// Export singleton instance
export const messageDecisionService = MessageDecisionService.getInstance();
