/**
 * Message Telemetry Service
 * Business logic for recording and querying inbound message telemetry
 * Tracks state transitions: RECEIVED → QUEUED → PROCESSING → RESPONDED/SKIPPED/ERROR
 */

import { randomBytes } from 'crypto';
import { messageTelemetryRepository } from '../repositories/MessageTelemetryRepository';
import { hashPhone } from '../utils/phoneHasher';
import { redactPII } from '../utils/piiRedactor';
import { structuredLogger } from '../utils/structuredLogger';
import { getCorrelationId } from './CorrelationIdManager';
import {
    TelemetryState,
    TelemetrySkipReason,
    TelemetryErrorType
} from '../types/MessageTelemetry';
import type {
    TelemetryEvent,
    TelemetryEventRecord,
    TelemetryEventFilter,
    TelemetryEventPaginatedResult,
    TelemetryFunnelStats,
    MessageJourney,
    CreateTelemetryEventInput
} from '../types/MessageTelemetry';

// Re-export enums for convenience
export { TelemetryState, TelemetrySkipReason, TelemetryErrorType } from '../types/MessageTelemetry';

// In-memory cache for fast lookups of message start times
const messageStartTimes = new Map<string, number>();
const MAX_CACHE_SIZE = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(6).toString('hex');
    return `telem_${timestamp}_${random}`;
}

/**
 * Message Telemetry Service
 * Records telemetry events for the inbound message processing pipeline
 */
export class MessageTelemetryService {
    private static instance: MessageTelemetryService;

    static getInstance(): MessageTelemetryService {
        if (!MessageTelemetryService.instance) {
            MessageTelemetryService.instance = new MessageTelemetryService();
        }
        return MessageTelemetryService.instance;
    }

    /**
     * Record a telemetry event
     * This is the main method for recording pipeline state transitions
     */
    async recordEvent(input: CreateTelemetryEventInput): Promise<TelemetryEvent> {
        const eventId = generateEventId();
        const phoneHash = hashPhone(input.phone);
        const correlationId = input.correlationId || getCorrelationId();
        const timestamp = new Date();

        // Redact PII from detail
        const redactedDetail = input.detail
            ? redactPII(input.detail).substring(0, 500)
            : undefined;

        const event: TelemetryEvent = {
            eventId,
            messageId: input.messageId,
            phoneHash,
            timestamp,
            state: input.state,
            previousState: input.previousState,
            skipReason: input.skipReason,
            errorType: input.errorType,
            detail: redactedDetail,
            processingTimeMs: input.processingTimeMs,
            stage: input.stage,
            correlationId
        };

        // Log the event
        this.logEvent(event);

        // Persist to database (async, don't block)
        this.persistEvent(event).catch(error => {
            structuredLogger.error('message_telemetry', 'Failed to persist telemetry event', {
                error,
                event_id: event.eventId,
                phone_hash: phoneHash,
                correlation_id: correlationId
            });
        });

        return event;
    }

    /**
     * Record RECEIVED state - message was received at inbound handler
     */
    async recordReceived(
        messageId: string,
        phone: string,
        correlationId?: string
    ): Promise<TelemetryEvent> {
        // Cache the start time for processing time calculation
        messageStartTimes.set(messageId, Date.now());
        this.cleanupCache();

        return this.recordEvent({
            messageId,
            phone,
            state: TelemetryState.RECEIVED,
            detail: 'Message received at inbound handler',
            correlationId
        });
    }

    /**
     * Record QUEUED state - message was queued for processing
     */
    async recordQueued(
        messageId: string,
        phone: string,
        detail?: string,
        correlationId?: string
    ): Promise<TelemetryEvent> {
        return this.recordEvent({
            messageId,
            phone,
            state: TelemetryState.QUEUED,
            previousState: TelemetryState.RECEIVED,
            detail: detail || 'Message queued for processing',
            correlationId
        });
    }

    /**
     * Record PROCESSING state - message processing has started
     */
    async recordProcessing(
        messageId: string,
        phone: string,
        stage?: string,
        correlationId?: string
    ): Promise<TelemetryEvent> {
        return this.recordEvent({
            messageId,
            phone,
            state: TelemetryState.PROCESSING,
            previousState: TelemetryState.QUEUED,
            detail: `Processing started${stage ? ` at ${stage}` : ''}`,
            stage,
            correlationId
        });
    }

    /**
     * Record RESPONDED state - message was successfully processed
     */
    async recordResponded(
        messageId: string,
        phone: string,
        stage?: string,
        detail?: string,
        correlationId?: string
    ): Promise<TelemetryEvent> {
        const processingTimeMs = this.getProcessingTime(messageId);

        return this.recordEvent({
            messageId,
            phone,
            state: TelemetryState.RESPONDED,
            previousState: TelemetryState.PROCESSING,
            detail: detail || 'Response sent successfully',
            processingTimeMs,
            stage,
            correlationId
        });
    }

    /**
     * Record SKIPPED state - message was skipped with reason
     */
    async recordSkipped(
        messageId: string,
        phone: string,
        skipReason: TelemetrySkipReason,
        detail?: string,
        stage?: string,
        correlationId?: string
    ): Promise<TelemetryEvent> {
        const processingTimeMs = this.getProcessingTime(messageId);

        return this.recordEvent({
            messageId,
            phone,
            state: TelemetryState.SKIPPED,
            previousState: TelemetryState.PROCESSING,
            skipReason,
            detail: detail || `Message skipped: ${skipReason}`,
            processingTimeMs,
            stage,
            correlationId
        });
    }

    /**
     * Record ERROR state - error occurred during processing
     */
    async recordError(
        messageId: string,
        phone: string,
        errorType: TelemetryErrorType,
        detail?: string,
        stage?: string,
        correlationId?: string
    ): Promise<TelemetryEvent> {
        const processingTimeMs = this.getProcessingTime(messageId);

        return this.recordEvent({
            messageId,
            phone,
            state: TelemetryState.ERROR,
            previousState: TelemetryState.PROCESSING,
            errorType,
            detail: detail || `Error: ${errorType}`,
            processingTimeMs,
            stage,
            correlationId
        });
    }

    /**
     * Get processing time for a message
     */
    private getProcessingTime(messageId: string): number | undefined {
        const startTime = messageStartTimes.get(messageId);
        if (startTime) {
            messageStartTimes.delete(messageId);
            return Date.now() - startTime;
        }
        return undefined;
    }

    /**
     * Cleanup old cache entries
     */
    private cleanupCache(): void {
        if (messageStartTimes.size > MAX_CACHE_SIZE) {
            const now = Date.now();
            const keysToDelete: string[] = [];

            for (const [key, startTime] of messageStartTimes.entries()) {
                if (now - startTime > CACHE_TTL_MS) {
                    keysToDelete.push(key);
                }
            }

            for (const key of keysToDelete) {
                messageStartTimes.delete(key);
            }

            // If still too large, remove oldest entries
            if (messageStartTimes.size > MAX_CACHE_SIZE * 0.9) {
                const entries = Array.from(messageStartTimes.entries())
                    .sort((a, b) => a[1] - b[1])
                    .slice(0, Math.floor(MAX_CACHE_SIZE * 0.5));
                
                messageStartTimes.clear();
                for (const [key, value] of entries) {
                    messageStartTimes.set(key, value);
                }
            }
        }
    }

    /**
     * Persist event to database
     */
    private async persistEvent(event: TelemetryEvent): Promise<void> {
        const record: TelemetryEventRecord = {
            event_id: event.eventId,
            message_id: event.messageId,
            phone_hash: event.phoneHash,
            timestamp: event.timestamp,
            state: event.state,
            previous_state: event.previousState || null,
            skip_reason: event.skipReason || null,
            error_type: event.errorType || null,
            detail: event.detail || null,
            processing_time_ms: event.processingTimeMs || null,
            stage: event.stage || null,
            correlation_id: event.correlationId || null
        };

        await messageTelemetryRepository.create(record);
    }

    /**
     * Log event to structured logger
     */
    private logEvent(event: TelemetryEvent): void {
        const level = event.state === TelemetryState.ERROR ? 'error'
            : event.state === TelemetryState.SKIPPED ? 'warn'
            : 'info';

        structuredLogger[level]('message_telemetry', `[${event.state}] ${event.detail || 'Telemetry event'}`, {
            event_id: event.eventId,
            message_id: event.messageId.substring(0, 20),
            phone_hash: event.phoneHash,
            state: event.state,
            previous_state: event.previousState,
            skip_reason: event.skipReason,
            error_type: event.errorType,
            processing_time_ms: event.processingTimeMs,
            stage: event.stage,
            correlation_id: event.correlationId
        });
    }

    // ========== Query Methods ==========

    /**
     * Get funnel statistics for a time window
     */
    async getFunnelStats(windowMinutes: number = 5): Promise<TelemetryFunnelStats> {
        return messageTelemetryRepository.getFunnelStats(windowMinutes);
    }

    /**
     * Get telemetry events by phone (using hash)
     */
    async getEventsByPhone(phone: string, limit: number = 50): Promise<TelemetryEvent[]> {
        const phoneHash = hashPhone(phone);
        return messageTelemetryRepository.getByPhoneHash(phoneHash, limit);
    }

    /**
     * Get telemetry events by phone hash (for admin API)
     */
    async getEventsByPhoneHash(phoneHash: string, limit: number = 50): Promise<TelemetryEvent[]> {
        return messageTelemetryRepository.getByPhoneHash(phoneHash, limit);
    }

    /**
     * Get telemetry events by message ID
     */
    async getEventsByMessageId(messageId: string): Promise<TelemetryEvent[]> {
        return messageTelemetryRepository.getByMessageId(messageId);
    }

    /**
     * Get recent message journeys for a phone
     */
    async getRecentMessagesByPhone(phone: string, limit: number = 10): Promise<MessageJourney[]> {
        const phoneHash = hashPhone(phone);
        return messageTelemetryRepository.getRecentMessagesByPhone(phoneHash, limit);
    }

    /**
     * Get recent message journeys by phone hash (for admin API)
     */
    async getRecentMessagesByPhoneHash(phoneHash: string, limit: number = 10): Promise<MessageJourney[]> {
        return messageTelemetryRepository.getRecentMessagesByPhone(phoneHash, limit);
    }

    /**
     * Query telemetry events with filters and pagination
     */
    async queryEvents(
        filter: TelemetryEventFilter,
        page: number = 1,
        perPage: number = 50
    ): Promise<TelemetryEventPaginatedResult> {
        return messageTelemetryRepository.findByFilterPaginated(filter, page, perPage);
    }

    /**
     * Cleanup old telemetry events
     */
    async cleanup(retentionDays: number = 7): Promise<number> {
        return messageTelemetryRepository.deleteOlderThan(retentionDays);
    }
}

// Export singleton instance
export const messageTelemetryService = MessageTelemetryService.getInstance();
