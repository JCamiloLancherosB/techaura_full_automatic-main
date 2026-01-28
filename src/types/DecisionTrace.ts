/**
 * Decision Trace Types
 * Types for tracking message processing decisions through the pipeline
 * Used for debugging and auditing when the bot doesn't respond
 */

/**
 * Pipeline stages where decisions can be made
 */
export enum DecisionStage {
    /** Message received at inbound handler */
    INBOUND_RECEIVED = 'INBOUND_RECEIVED',
    /** Message queued for processing */
    QUEUED = 'QUEUED',
    /** Message is being processed */
    PROCESSING = 'PROCESSING',
    /** Deduplication check */
    DEDUPE = 'DEDUPE',
    /** Policy engine evaluation */
    POLICY = 'POLICY',
    /** Router/flow decision */
    ROUTER = 'ROUTER',
    /** Flow execution */
    FLOW = 'FLOW',
    /** AI processing */
    AI = 'AI',
    /** WhatsApp message send */
    SEND = 'SEND'
}

/**
 * Decision outcomes
 */
export enum Decision {
    /** Message will be responded to */
    RESPOND = 'RESPOND',
    /** Message was skipped (no response) */
    SKIP = 'SKIP',
    /** Response was deferred for later */
    DEFER = 'DEFER',
    /** An error occurred */
    ERROR = 'ERROR'
}

/**
 * Reason codes for decisions
 */
export enum DecisionReasonCode {
    // Dedupe reasons
    DEDUPED = 'DEDUPED',
    
    // Queue reasons (for inbound message queue)
    QUEUED = 'QUEUED',
    QUEUE_CAPACITY_EXCEEDED = 'QUEUE_CAPACITY_EXCEEDED',
    QUEUE_MESSAGE_EXPIRED = 'QUEUE_MESSAGE_EXPIRED',
    
    // Processing reasons
    PROCESSING_STARTED = 'PROCESSING_STARTED',
    
    // Policy reasons  
    POLICY_BLOCKED = 'POLICY_BLOCKED',
    POLICY_OPT_OUT = 'POLICY_OPT_OUT',
    POLICY_COOLDOWN = 'POLICY_COOLDOWN',
    POLICY_OUTSIDE_HOURS = 'POLICY_OUTSIDE_HOURS',
    POLICY_RATE_LIMITED = 'POLICY_RATE_LIMITED',
    POLICY_USER_CLOSED = 'POLICY_USER_CLOSED',
    POLICY_BLACKLISTED = 'POLICY_BLACKLISTED',
    
    // Router reasons
    NO_ROUTE = 'NO_ROUTE',
    ROUTE_BLOCKED = 'ROUTE_BLOCKED',
    CONTEXT_BLOCKED = 'CONTEXT_BLOCKED',
    
    // Flow reasons
    FLOW_ENDED = 'FLOW_ENDED',
    FLOW_NO_RESPONSE = 'FLOW_NO_RESPONSE',
    
    // AI reasons
    AI_ERROR = 'AI_ERROR',
    AI_TIMEOUT = 'AI_TIMEOUT',
    AI_FALLBACK = 'AI_FALLBACK',
    AI_NO_RESPONSE = 'AI_NO_RESPONSE',
    
    // Send reasons
    PROVIDER_SEND_FAIL = 'PROVIDER_SEND_FAIL',
    PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
    
    // Provider state reasons (for reconnection handling)
    PROVIDER_NOT_CONNECTED = 'PROVIDER_NOT_CONNECTED',
    PROVIDER_RECONNECTING = 'PROVIDER_RECONNECTING',
    
    // Success reasons
    SUCCESS = 'SUCCESS',
    RECEIVED = 'RECEIVED',
    PROCESSING = 'PROCESSING',
    
    // Final outcome reasons
    RESPONDED = 'RESPONDED',
    SKIPPED = 'SKIPPED'
}

/**
 * Decision Trace record
 */
export interface DecisionTrace {
    /** Unique trace ID */
    traceId: string;
    /** WhatsApp message ID */
    messageId: string;
    /** SHA-256 hash of phone number (NOT raw phone) */
    phoneHash: string;
    /** Timestamp of the decision */
    timestamp: Date;
    /** Pipeline stage where decision was made */
    stage: DecisionStage;
    /** Decision outcome */
    decision: Decision;
    /** Reason code for the decision */
    reasonCode: DecisionReasonCode;
    /** Short, redacted reason detail */
    reasonDetail?: string;
    /** When the message can be processed next (for DEFER) */
    nextEligibleAt?: Date;
    /** Correlation ID for request tracing */
    correlationId?: string;
}

/**
 * Database representation of DecisionTrace
 */
export interface DecisionTraceRecord {
    id?: number;
    trace_id: string;
    message_id: string;
    phone_hash: string;
    timestamp: Date;
    stage: string;
    decision: string;
    reason_code: string;
    reason_detail?: string | null;
    next_eligible_at?: Date | null;
    correlation_id?: string | null;
    created_at?: Date;
}

/**
 * Filter options for querying decision traces
 */
export interface DecisionTraceFilter {
    phoneHash?: string;
    messageId?: string;
    stage?: DecisionStage;
    decision?: Decision;
    reasonCode?: DecisionReasonCode;
    correlationId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

/**
 * Paginated result for decision traces
 */
export interface DecisionTracePaginatedResult {
    data: DecisionTrace[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
}

/**
 * Input for creating a decision trace
 */
export interface CreateDecisionTraceInput {
    messageId: string;
    /** Raw phone number (will be hashed internally) */
    phone: string;
    stage: DecisionStage;
    decision: Decision;
    reasonCode: DecisionReasonCode;
    reasonDetail?: string;
    nextEligibleAt?: Date;
    correlationId?: string;
}
