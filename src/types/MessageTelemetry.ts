/**
 * Message Telemetry Types
 * Types for tracking inbound message state transitions:
 * RECEIVED → QUEUED → PROCESSING → RESPONDED/SKIPPED/ERROR
 */

/**
 * Telemetry state for inbound messages
 */
export enum TelemetryState {
    /** Message received at inbound handler */
    RECEIVED = 'RECEIVED',
    /** Message queued for processing */
    QUEUED = 'QUEUED',
    /** Message currently being processed */
    PROCESSING = 'PROCESSING',
    /** Message successfully processed and response sent */
    RESPONDED = 'RESPONDED',
    /** Message skipped (with reason) */
    SKIPPED = 'SKIPPED',
    /** Error occurred during processing */
    ERROR = 'ERROR'
}

/**
 * Skip reasons for telemetry
 */
export enum TelemetrySkipReason {
    EMPTY_MESSAGE = 'EMPTY_MESSAGE',
    BLOCKED_USER = 'BLOCKED_USER',
    DEDUPED = 'DEDUPED',
    POLICY_OPT_OUT = 'POLICY_OPT_OUT',
    POLICY_COOLDOWN = 'POLICY_COOLDOWN',
    POLICY_BLACKLISTED = 'POLICY_BLACKLISTED',
    NO_ROUTE = 'NO_ROUTE',
    CONTEXT_BLOCKED = 'CONTEXT_BLOCKED',
    QUEUE_EXPIRED = 'QUEUE_EXPIRED',
    QUEUE_DROPPED = 'QUEUE_DROPPED',
    OUTSIDE_HOURS = 'OUTSIDE_HOURS',
    MAX_ATTEMPTS = 'MAX_ATTEMPTS'
}

/**
 * Error types for telemetry
 */
export enum TelemetryErrorType {
    AI_ERROR = 'AI_ERROR',
    AI_TIMEOUT = 'AI_TIMEOUT',
    SEND_FAILED = 'SEND_FAILED',
    PROVIDER_ERROR = 'PROVIDER_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    FLOW_ERROR = 'FLOW_ERROR',
    CRITICAL_ERROR = 'CRITICAL_ERROR'
}

/**
 * Telemetry event record
 */
export interface TelemetryEvent {
    /** Unique event ID */
    eventId: string;
    /** WhatsApp message ID */
    messageId: string;
    /** SHA-256 hash of phone number (NOT raw phone) */
    phoneHash: string;
    /** Event timestamp */
    timestamp: Date;
    /** Current state */
    state: TelemetryState;
    /** Previous state (for transitions) */
    previousState?: TelemetryState;
    /** Skip reason (when state is SKIPPED) */
    skipReason?: TelemetrySkipReason;
    /** Error type (when state is ERROR) */
    errorType?: TelemetryErrorType;
    /** Additional detail/description */
    detail?: string;
    /** Processing time in milliseconds (for RESPONDED/SKIPPED/ERROR) */
    processingTimeMs?: number;
    /** Stage in the processing pipeline */
    stage?: string;
    /** Correlation ID for request tracing */
    correlationId?: string;
}

/**
 * Database representation of TelemetryEvent
 */
export interface TelemetryEventRecord {
    id?: number;
    event_id: string;
    message_id: string;
    phone_hash: string;
    timestamp: Date;
    state: string;
    previous_state?: string | null;
    skip_reason?: string | null;
    error_type?: string | null;
    detail?: string | null;
    processing_time_ms?: number | null;
    stage?: string | null;
    correlation_id?: string | null;
    created_at?: Date;
}

/**
 * Filter options for querying telemetry events
 */
export interface TelemetryEventFilter {
    phoneHash?: string;
    messageId?: string;
    state?: TelemetryState;
    skipReason?: TelemetrySkipReason;
    errorType?: TelemetryErrorType;
    correlationId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

/**
 * Paginated result for telemetry events
 */
export interface TelemetryEventPaginatedResult {
    data: TelemetryEvent[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
}

/**
 * Input for creating a telemetry event
 */
export interface CreateTelemetryEventInput {
    messageId: string;
    /** Raw phone number (will be hashed internally) */
    phone: string;
    state: TelemetryState;
    previousState?: TelemetryState;
    skipReason?: TelemetrySkipReason;
    errorType?: TelemetryErrorType;
    detail?: string;
    processingTimeMs?: number;
    stage?: string;
    correlationId?: string;
}

/**
 * Funnel summary statistics
 */
export interface TelemetryFunnelStats {
    received: number;
    queued: number;
    processing: number;
    responded: number;
    skipped: number;
    errors: number;
    /** Breakdown of skip reasons */
    skipReasons: Record<string, number>;
    /** Breakdown of error types */
    errorTypes: Record<string, number>;
    /** Average processing time in ms */
    avgProcessingTimeMs: number;
    /** Time window for these stats */
    windowMinutes: number;
}

/**
 * Message journey (all events for a single message)
 */
export interface MessageJourney {
    messageId: string;
    phoneHash: string;
    events: TelemetryEvent[];
    finalState: TelemetryState;
    totalDurationMs?: number;
    startedAt: Date;
    completedAt?: Date;
}
