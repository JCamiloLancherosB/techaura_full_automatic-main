/**
 * Unified Gate Reason Codes
 * Used for both inbound and outbound gating decisions
 * These codes provide consistent categorization for Decision Trace instrumentation
 */

/**
 * Reason codes for gate evaluation results
 * Organized by gate type for clarity
 */
export enum GateReasonCode {
    // === SUCCESS / ALLOW ===
    /** Gate passed, message can proceed */
    ALLOWED = 'ALLOWED',

    // === INBOUND GATES (affect incoming user messages) ===
    /** User has opted out - should not process messages */
    INBOUND_OPT_OUT = 'INBOUND_OPT_OUT',
    /** User is blacklisted */
    INBOUND_BLACKLISTED = 'INBOUND_BLACKLISTED',
    /** Duplicate message detected */
    INBOUND_DEDUPE = 'INBOUND_DEDUPE',

    // === OUTBOUND GATES (affect bot-initiated messages like follow-ups) ===
    /** User has opted out - do not send outbound */
    OUTBOUND_OPT_OUT = 'OUTBOUND_OPT_OUT',
    /** User is blacklisted - do not send outbound */
    OUTBOUND_BLACKLISTED = 'OUTBOUND_BLACKLISTED',
    /** User status is CLOSED with decision_made tag */
    OUTBOUND_USER_CLOSED = 'OUTBOUND_USER_CLOSED',
    /** User has a confirmed or active order */
    OUTBOUND_HAS_ACTIVE_ORDER = 'OUTBOUND_HAS_ACTIVE_ORDER',
    /** User is in cooldown period after 3 follow-up attempts */
    OUTBOUND_COOLDOWN = 'OUTBOUND_COOLDOWN',
    /** Max follow-up attempts (3) reached without response */
    OUTBOUND_MAX_FOLLOWUPS_REACHED = 'OUTBOUND_MAX_FOLLOWUPS_REACHED',
    /** User interacted too recently */
    OUTBOUND_RECENCY_INTERACTION = 'OUTBOUND_RECENCY_INTERACTION',
    /** Follow-up sent too recently (24h minimum) */
    OUTBOUND_RECENCY_FOLLOWUP = 'OUTBOUND_RECENCY_FOLLOWUP',
    /** Outside business hours (9 AM - 9 PM) */
    OUTBOUND_TIME_WINDOW = 'OUTBOUND_TIME_WINDOW',
    /** Per-chat hourly/daily rate limit exceeded */
    OUTBOUND_RATE_LIMIT_CHAT = 'OUTBOUND_RATE_LIMIT_CHAT',
    /** Global hourly/daily rate limit exceeded */
    OUTBOUND_RATE_LIMIT_GLOBAL = 'OUTBOUND_RATE_LIMIT_GLOBAL',
    /** Message interval too short */
    OUTBOUND_RATE_LIMIT_INTERVAL = 'OUTBOUND_RATE_LIMIT_INTERVAL',
    /** Content policy violation */
    OUTBOUND_CONTENT_POLICY = 'OUTBOUND_CONTENT_POLICY',
    /** User has do_not_disturb tag */
    OUTBOUND_DO_NOT_DISTURB = 'OUTBOUND_DO_NOT_DISTURB',

    // === ERROR CASES ===
    /** Error during gate evaluation, fail-open */
    ERROR_FAIL_OPEN = 'ERROR_FAIL_OPEN',
    /** Error during gate evaluation, fail-closed */
    ERROR_FAIL_CLOSED = 'ERROR_FAIL_CLOSED'
}

/**
 * Gate evaluation result
 */
export interface GateResult {
    /** Whether the message can proceed */
    allowed: boolean;
    /** Reason code for the decision */
    reasonCode: GateReasonCode;
    /** Human-readable reason detail */
    reason?: string;
    /** When the message can be retried (for deferred cases) */
    nextEligibleAt?: Date;
    /** List of all blocking reasons (if multiple gates failed) */
    blockedBy?: GateReasonCode[];
}

/**
 * Context for gate evaluation
 */
export interface GateContext {
    phone: string;
    messageId?: string;
    messageType?: 'catalog' | 'persuasive' | 'order' | 'general' | 'followup' | 'notification';
    stage?: string;
    status?: string;
    flowName?: string;
    priority?: 'low' | 'normal' | 'high';
    bypassTimeWindow?: boolean;
    bypassRateLimit?: boolean;
}

/**
 * Check if a reason code is an outbound-only gate
 * These gates should NEVER block inbound messages
 */
export function isOutboundOnlyGate(reasonCode: GateReasonCode): boolean {
    const outboundOnlyGates: GateReasonCode[] = [
        GateReasonCode.OUTBOUND_HAS_ACTIVE_ORDER,
        GateReasonCode.OUTBOUND_COOLDOWN,
        GateReasonCode.OUTBOUND_MAX_FOLLOWUPS_REACHED,
        GateReasonCode.OUTBOUND_RECENCY_INTERACTION,
        GateReasonCode.OUTBOUND_RECENCY_FOLLOWUP,
        GateReasonCode.OUTBOUND_TIME_WINDOW,
        GateReasonCode.OUTBOUND_RATE_LIMIT_CHAT,
        GateReasonCode.OUTBOUND_RATE_LIMIT_GLOBAL,
        GateReasonCode.OUTBOUND_RATE_LIMIT_INTERVAL,
        GateReasonCode.OUTBOUND_CONTENT_POLICY,
        GateReasonCode.OUTBOUND_USER_CLOSED,
        GateReasonCode.OUTBOUND_DO_NOT_DISTURB
    ];
    return outboundOnlyGates.includes(reasonCode);
}

/**
 * Check if a reason code indicates user should not receive ANY messages
 * These apply to both inbound and outbound
 */
export function isUniversalBlock(reasonCode: GateReasonCode): boolean {
    const universalBlocks: GateReasonCode[] = [
        GateReasonCode.INBOUND_OPT_OUT,
        GateReasonCode.INBOUND_BLACKLISTED,
        GateReasonCode.OUTBOUND_OPT_OUT,
        GateReasonCode.OUTBOUND_BLACKLISTED
    ];
    return universalBlocks.includes(reasonCode);
}

console.log('✅ GateReasonCode enum loaded');
