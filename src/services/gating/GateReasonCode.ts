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

    // === INBOUND GATES (defined for completeness but NOT used) ===
    // NOTE: These codes are defined for API completeness but are NOT used in the
    // current implementation. By design, inbound messages are NEVER blocked.
    // Users must always be able to send messages to us (opt-back-in, re-engagement).
    /** User has opted out - defined for reference, not used for inbound blocking */
    INBOUND_OPT_OUT = 'INBOUND_OPT_OUT',
    /** User is blacklisted - defined for reference, not used for inbound blocking */
    INBOUND_BLACKLISTED = 'INBOUND_BLACKLISTED',
    /** Duplicate message detected - may be used for deduplication at higher level */
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
    /** User is in cooldown period after 6 follow-up attempts */
    OUTBOUND_COOLDOWN = 'OUTBOUND_COOLDOWN',
    /** Max follow-up attempts (6) reached without response */
    OUTBOUND_MAX_FOLLOWUPS_REACHED = 'OUTBOUND_MAX_FOLLOWUPS_REACHED',
    /** User interacted too recently */
    OUTBOUND_RECENCY_INTERACTION = 'OUTBOUND_RECENCY_INTERACTION',
    /** Follow-up sent too recently (6h minimum) */
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
    /** User has already provided shipping data (address, city, full name) */
    OUTBOUND_HAS_SHIPPING_DATA = 'OUTBOUND_HAS_SHIPPING_DATA',
    /** Message category blocked due to suppression reason (e.g., PERSUASION/FOLLOWUP blocked when SHIPPING_CONFIRMED) */
    OUTBOUND_CATEGORY_BLOCKED = 'OUTBOUND_CATEGORY_BLOCKED',

    // === ERROR CASES ===
    /** Error during gate evaluation, fail-open */
    ERROR_FAIL_OPEN = 'ERROR_FAIL_OPEN',
    /** Error during gate evaluation, fail-closed */
    ERROR_FAIL_CLOSED = 'ERROR_FAIL_CLOSED'
}

/**
 * Message categories for category-based gating
 * Used to control which types of messages can be sent based on suppression reasons
 */
export enum MessageCategory {
    /** Order status updates - always allowed */
    ORDER_STATUS = 'ORDER_STATUS',
    /** Follow-up messages - may be blocked based on suppression reason */
    FOLLOWUP = 'FOLLOWUP',
    /** Persuasion/promotional messages - may be blocked based on suppression reason */
    PERSUASION = 'PERSUASION',
    /** General messages - may have category-specific rules */
    GENERAL = 'GENERAL'
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
    /** Message category for category-based gating. If not provided, will be inferred from messageType */
    messageCategory?: MessageCategory;
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
        GateReasonCode.OUTBOUND_DO_NOT_DISTURB,
        GateReasonCode.OUTBOUND_HAS_SHIPPING_DATA,
        GateReasonCode.OUTBOUND_CATEGORY_BLOCKED
    ];
    return outboundOnlyGates.includes(reasonCode);
}

/**
 * Check if a reason code indicates user should not receive ANY messages
 * 
 * NOTE: This function is provided for reference but is NOT used for inbound gating.
 * According to the design principle, inbound messages should NEVER be blocked.
 * Users who opted out or are blacklisted should still be able to send messages
 * (they might want to opt back in or have a legitimate question).
 * 
 * These codes are only relevant for OUTBOUND messages (follow-ups, promos, etc.)
 */
export function isUniversalBlock(reasonCode: GateReasonCode): boolean {
    const universalBlocks: GateReasonCode[] = [
        GateReasonCode.OUTBOUND_OPT_OUT,
        GateReasonCode.OUTBOUND_BLACKLISTED
    ];
    return universalBlocks.includes(reasonCode);
}

console.log('✅ GateReasonCode enum loaded');
