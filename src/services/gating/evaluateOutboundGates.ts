/**
 * Outbound Gates Evaluator
 * Evaluates gating rules for OUTBOUND bot-initiated messages (follow-ups, promos, etc.)
 * 
 * Outbound gates include all restrictions that prevent the bot from proactively
 * reaching out to users. These gates should NEVER affect incoming user messages.
 * 
 * Outbound gates check for:
 * - OPT_OUT status
 * - Blacklist tags
 * - User has active order (no promos)
 * - Cooldown period (after 6 failed follow-ups)
 * - Max follow-up attempts reached
 * - Recency (too soon since last interaction/follow-up)
 * - Business hours (time window)
 * - Rate limits (per-chat and global)
 * - Content policy violations
 */

import { GateReasonCode, GateResult, GateContext } from './GateReasonCode';
import { flowGuard } from '../flowGuard';
import { messagePolicyEngine } from '../MessagePolicyEngine';
import type { MessagePolicyContext } from '../MessagePolicyEngine';
import type { UserSession } from '../../../types/global';
import { 
    DecisionStage, 
    Decision, 
    DecisionReasonCode 
} from '../../types/DecisionTrace';
import { messageDecisionService } from '../MessageDecisionService';
import { getCorrelationId } from '../CorrelationIdManager';

// Configuration constants - RELAXED for better contextual follow-ups
const MIN_FOLLOWUP_GAP_MS = 6 * 60 * 60 * 1000; // 6 hours between follow-ups (reduced from 24h)
const MIN_INTERACTION_GAP_MS = 45 * 60 * 1000; // 45 minutes after user activity (reduced from 1h)
const ALLOWED_START_HOUR = 9; // 9 AM
const ALLOWED_END_HOUR = 21; // 9 PM
const MAX_FOLLOWUP_ATTEMPTS = 6; // Increased from 3 to 6 for more re-engagement opportunities
const JITTER_MIN_MS = 60 * 1000; // 1 minute minimum jitter
const JITTER_MAX_MS = 5 * 60 * 1000; // 5 minutes maximum jitter

/**
 * Add random jitter to avoid thundering herd when rescheduling
 */
function addJitter(date: Date): Date {
    const jitter = JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);
    return new Date(date.getTime() + jitter);
}

/**
 * Update nextEligibleAt to the later of the two dates
 * Ensures we pick the earliest moment that satisfies all blocking conditions
 */
function updateNextEligibleAt(current: Date | undefined, candidate: Date): Date {
    if (!current) return candidate;
    return candidate > current ? candidate : current;
}

/**
 * Outbound gate evaluation result with detailed explanation
 */
export interface OutboundGateResult extends GateResult {
    /** Counter information for explain endpoint */
    counters?: {
        followUpAttempts: number;
        followUpCount24h: number;
        maxAttempts: number;
        maxPer24h: number;
    };
    /** Limit information */
    limits?: {
        minFollowUpGapHours: number;
        minInteractionGapHours: number;
        businessHoursStart: number;
        businessHoursEnd: number;
    };
    /** Last interaction timestamps */
    lastInteraction?: Date;
    lastFollowUp?: Date;
    lastUserReply?: Date;
}

/**
 * Evaluate all outbound gates for a bot-initiated message
 * Returns whether the message should be sent and detailed explanation
 * 
 * @param ctx - Gate context with phone, message type, etc.
 * @param session - User session data
 * @param message - Optional message content for content policy validation
 * @returns OutboundGateResult with decision, reason, and explanation data
 */
export async function evaluateOutboundGates(
    ctx: GateContext,
    session: UserSession,
    message?: string
): Promise<OutboundGateResult> {
    const blockedBy: GateReasonCode[] = [];
    let reason: string | undefined;
    let nextEligibleAt: Date | undefined;
    const now = Date.now();

    console.log(`🚪 OutboundGates: Evaluating gates for outbound message to ${ctx.phone} (type: ${ctx.messageType || 'general'})`);

    // === Gate 1: No-Reach Gating (OPT_OUT, blacklist) ===
    if (session.contactStatus === 'OPT_OUT') {
        blockedBy.push(GateReasonCode.OUTBOUND_OPT_OUT);
        reason = 'User opted out';
        console.log(`🚫 OutboundGates: Blocked by OPT_OUT status`);
    }

    if (session.tags && session.tags.includes('blacklist')) {
        blockedBy.push(GateReasonCode.OUTBOUND_BLACKLISTED);
        reason = reason || 'User is blacklisted';
        console.log(`🚫 OutboundGates: Blocked by blacklist tag`);
    }

    if (session.tags && session.tags.includes('do_not_disturb')) {
        blockedBy.push(GateReasonCode.OUTBOUND_DO_NOT_DISTURB);
        reason = reason || 'User marked as do_not_disturb';
        console.log(`🚫 OutboundGates: Blocked by do_not_disturb tag`);
    }

    // CLOSED status with decision_made tag
    if (session.contactStatus === 'CLOSED' && session.tags?.includes('decision_made')) {
        blockedBy.push(GateReasonCode.OUTBOUND_USER_CLOSED);
        reason = reason || 'User completed interaction (decision_made)';
        console.log(`🚫 OutboundGates: Blocked by CLOSED + decision_made`);
    }

    // === Gate 2: Order Status Guard (for follow-ups and persuasive messages) ===
    if (ctx.messageType === 'followup' || ctx.messageType === 'persuasive') {
        const hasActiveOrder = await flowGuard.hasConfirmedOrActiveOrder(ctx.phone);
        if (hasActiveOrder) {
            blockedBy.push(GateReasonCode.OUTBOUND_HAS_ACTIVE_ORDER);
            reason = reason || 'User has active order';
            console.log(`🚫 OutboundGates: Blocked by active order`);
        }
    }

    // === Gate 3: Cooldown Guard (rest_period_active) ===
    const cooldownCheck = await flowGuard.isInCooldown(ctx.phone);
    if (cooldownCheck.inCooldown && cooldownCheck.until) {
        blockedBy.push(GateReasonCode.OUTBOUND_COOLDOWN);
        // Use updateNextEligibleAt for cooldown resumeAt
        nextEligibleAt = updateNextEligibleAt(nextEligibleAt, cooldownCheck.until);
        const hoursRemaining = Math.ceil((cooldownCheck.until.getTime() - now) / (60 * 60 * 1000));
        reason = reason || `User in cooldown (${hoursRemaining}h remaining)`;
        console.log(`🚫 OutboundGates: Blocked by cooldown until ${cooldownCheck.until.toISOString()}`);
    }

    // === Gate 4: Max Follow-up Attempts ===
    const followUpAttempts = session.followUpAttempts || 0;
    if (followUpAttempts >= MAX_FOLLOWUP_ATTEMPTS) {
        blockedBy.push(GateReasonCode.OUTBOUND_MAX_FOLLOWUPS_REACHED);
        reason = reason || `Max follow-up attempts reached (${followUpAttempts}/${MAX_FOLLOWUP_ATTEMPTS})`;
        console.log(`🚫 OutboundGates: Blocked by max attempts (${followUpAttempts})`);
    }

    // === Gate 5: Recency Gating (for follow-ups) ===
    if (ctx.messageType === 'followup' && ctx.priority !== 'high') {
        // Check last follow-up timing
        if (session.lastFollowUp) {
            const lastFollowUpTime = new Date(session.lastFollowUp).getTime();
            const timeSinceLastFollowUp = now - lastFollowUpTime;
            
            if (timeSinceLastFollowUp < MIN_FOLLOWUP_GAP_MS) {
                blockedBy.push(GateReasonCode.OUTBOUND_RECENCY_FOLLOWUP);
                const hoursRemaining = Math.ceil((MIN_FOLLOWUP_GAP_MS - timeSinceLastFollowUp) / (60 * 60 * 1000));
                // Use exact threshold time for rescheduling
                const candidateTime = new Date(lastFollowUpTime + MIN_FOLLOWUP_GAP_MS);
                nextEligibleAt = updateNextEligibleAt(nextEligibleAt, candidateTime);
                reason = reason || `Too soon since last follow-up (${hoursRemaining}h remaining)`;
                console.log(`🚫 OutboundGates: Blocked by follow-up recency`);
            }
        }

        // Check last interaction timing (user was active recently - insufficient_silence)
        if (session.lastInteraction) {
            const lastInteractionTime = new Date(session.lastInteraction).getTime();
            const timeSinceLastInteraction = now - lastInteractionTime;

            if (timeSinceLastInteraction < MIN_INTERACTION_GAP_MS) {
                blockedBy.push(GateReasonCode.OUTBOUND_RECENCY_INTERACTION);
                const minutesRemaining = Math.ceil((MIN_INTERACTION_GAP_MS - timeSinceLastInteraction) / (60 * 1000));
                // Use exact threshold time for rescheduling
                const candidateTime = new Date(lastInteractionTime + MIN_INTERACTION_GAP_MS);
                nextEligibleAt = updateNextEligibleAt(nextEligibleAt, candidateTime);
                reason = reason || `User recently active (${minutesRemaining}m ago)`;
                console.log(`🚫 OutboundGates: Blocked by interaction recency`);
            }
        }
    }

    // === Gate 6: Time Window (business hours) ===
    if (!ctx.bypassTimeWindow) {
        const currentHour = new Date().getHours();
        if (currentHour < ALLOWED_START_HOUR || currentHour >= ALLOWED_END_HOUR) {
            blockedBy.push(GateReasonCode.OUTBOUND_TIME_WINDOW);
            
            // Calculate next eligible time (next window start)
            const nextEligible = new Date();
            if (currentHour >= ALLOWED_END_HOUR) {
                // After hours - next day at start hour
                nextEligible.setDate(nextEligible.getDate() + 1);
            }
            nextEligible.setHours(ALLOWED_START_HOUR, 0, 0, 0);
            // Use updateNextEligibleAt to pick the later time
            nextEligibleAt = updateNextEligibleAt(nextEligibleAt, nextEligible);
            
            reason = reason || `Outside business hours (${ALLOWED_START_HOUR}:00-${ALLOWED_END_HOUR}:00), current: ${currentHour}:00`;
            console.log(`🚫 OutboundGates: Blocked by time window`);
        }
    }

    // === Gate 7: Content Validation ===
    if (message && blockedBy.length === 0) {
        try {
            // Build PersuasionContext with the correct interface
            // Use safe property access for orderData fields
            const orderData = session.orderData as Record<string, any> | undefined;
            const conversationData = session.conversationData as Record<string, any> | undefined;
            
            const persuasionContext = {
                stage: session.stage || 'awareness',
                hasDiscussedPrice: !!(orderData?.price || orderData?.total),
                hasSelectedProduct: !!(orderData?.product || orderData?.items?.length),
                hasCustomized: !!(conversationData?.customized || conversationData?.customization),
                buyingIntent: session.buyingIntent || 0,
                interactionCount: session.interactions?.length || 0,
                productInterests: session.interests || []
            };

            const policyContext: MessagePolicyContext = {
                userSession: session,
                persuasionContext,
                messageType: ctx.messageType === 'followup' || ctx.messageType === 'notification' 
                    ? 'general' // Map unsupported types to 'general'
                    : ctx.messageType as 'catalog' | 'persuasive' | 'order' | 'general' | undefined,
                stage: ctx.stage || session.stage || 'awareness',
                status: ctx.status || session.orderData?.status || 'initial'
            };

            const validation = messagePolicyEngine.validateMessage(message, policyContext);

            if (!validation.isValid) {
                blockedBy.push(GateReasonCode.OUTBOUND_CONTENT_POLICY);
                const summary = messagePolicyEngine.getViolationSummary(validation.violations);
                reason = reason || `Content policy violation: ${summary}`;
                console.log(`🚫 OutboundGates: Blocked by content policy`);
            }
        } catch (error) {
            console.error('❌ OutboundGates: Error in content validation:', error);
            // Fail-open: don't block if validation fails
        }
    }

    // Build result with explanation data
    // Add jitter to nextEligibleAt to avoid thundering herd effect
    const finalNextEligibleAt = nextEligibleAt ? addJitter(nextEligibleAt) : undefined;
    
    const result: OutboundGateResult = {
        allowed: blockedBy.length === 0,
        reasonCode: blockedBy.length > 0 ? blockedBy[0] : GateReasonCode.ALLOWED,
        reason: blockedBy.length > 0 ? reason || `Blocked by: ${blockedBy.join(', ')}` : 'All outbound gates passed',
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
        nextEligibleAt: finalNextEligibleAt,
        counters: {
            followUpAttempts: session.followUpAttempts || 0,
            followUpCount24h: session.followUpCount24h || 0,
            maxAttempts: MAX_FOLLOWUP_ATTEMPTS,
            maxPer24h: 1
        },
        limits: {
            minFollowUpGapHours: MIN_FOLLOWUP_GAP_MS / (60 * 60 * 1000),
            minInteractionGapHours: MIN_INTERACTION_GAP_MS / (60 * 60 * 1000),
            businessHoursStart: ALLOWED_START_HOUR,
            businessHoursEnd: ALLOWED_END_HOUR
        },
        lastInteraction: session.lastInteraction ? new Date(session.lastInteraction) : undefined,
        lastFollowUp: session.lastFollowUp ? new Date(session.lastFollowUp) : undefined,
        lastUserReply: session.lastUserReplyAt ? new Date(session.lastUserReplyAt) : undefined
    };

    if (result.allowed) {
        console.log(`✅ OutboundGates: All gates passed for ${ctx.phone}`);
    } else {
        console.log(`🚫 OutboundGates: Blocked for ${ctx.phone} - ${result.reason}`);
    }

    return result;
}

/**
 * Record outbound gate decision in DecisionTrace
 * This connects with PR1's Decision Trace system
 */
export async function recordOutboundGateDecision(
    messageId: string,
    ctx: GateContext,
    result: OutboundGateResult
): Promise<void> {
    const correlationId = getCorrelationId();

    try {
        // Map GateReasonCode to DecisionReasonCode
        let decisionReasonCode: DecisionReasonCode;
        switch (result.reasonCode) {
            case GateReasonCode.OUTBOUND_OPT_OUT:
                decisionReasonCode = DecisionReasonCode.POLICY_OPT_OUT;
                break;
            case GateReasonCode.OUTBOUND_BLACKLISTED:
                decisionReasonCode = DecisionReasonCode.POLICY_BLACKLISTED;
                break;
            case GateReasonCode.OUTBOUND_COOLDOWN:
                decisionReasonCode = DecisionReasonCode.POLICY_COOLDOWN;
                break;
            case GateReasonCode.OUTBOUND_TIME_WINDOW:
                decisionReasonCode = DecisionReasonCode.POLICY_OUTSIDE_HOURS;
                break;
            case GateReasonCode.OUTBOUND_RATE_LIMIT_CHAT:
            case GateReasonCode.OUTBOUND_RATE_LIMIT_GLOBAL:
            case GateReasonCode.OUTBOUND_RATE_LIMIT_INTERVAL:
                decisionReasonCode = DecisionReasonCode.POLICY_RATE_LIMITED;
                break;
            case GateReasonCode.OUTBOUND_USER_CLOSED:
                decisionReasonCode = DecisionReasonCode.POLICY_USER_CLOSED;
                break;
            case GateReasonCode.ALLOWED:
                decisionReasonCode = DecisionReasonCode.SUCCESS;
                break;
            default:
                decisionReasonCode = DecisionReasonCode.POLICY_BLOCKED;
        }

        if (result.allowed) {
            // Success - record in trace
            await messageDecisionService.recordSuccess(
                messageId,
                ctx.phone,
                DecisionStage.POLICY,
                'Outbound gates passed',
                correlationId
            );
        } else {
            // Blocked - record with reason
            await messageDecisionService.recordPolicyBlocked(
                messageId,
                ctx.phone,
                decisionReasonCode,
                result.reason || 'Outbound gate blocked',
                result.nextEligibleAt,
                correlationId
            );
        }
    } catch (error) {
        console.error('❌ OutboundGates: Failed to record decision trace:', error);
        // Don't throw - decision trace is observability, not critical path
    }
}

/**
 * Get a detailed explanation of outbound gate status for a user
 * Used by the admin explain endpoint
 */
export async function explainOutboundGateStatus(
    phone: string,
    session: UserSession
): Promise<{
    phone: string;
    canSendFollowUp: boolean;
    blockingReasons: string[];
    counters: {
        followUpAttempts: number;
        followUpCount24h: number;
        maxAttempts: number;
        maxPer24h: number;
    };
    limits: {
        minFollowUpGapHours: number;
        minInteractionGapHours: number;
        businessHoursStart: number;
        businessHoursEnd: number;
    };
    timestamps: {
        lastInteraction: string | null;
        lastFollowUp: string | null;
        lastUserReply: string | null;
        cooldownUntil: string | null;
    };
    nextEligibleAt: string | null;
    contactStatus: string;
    tags: string[];
}> {
    // Evaluate gates
    const result = await evaluateOutboundGates(
        { phone, messageType: 'followup' },
        session
    );

    return {
        phone,
        canSendFollowUp: result.allowed,
        blockingReasons: result.blockedBy?.map(code => {
            switch (code) {
                case GateReasonCode.OUTBOUND_OPT_OUT:
                    return 'User has opted out';
                case GateReasonCode.OUTBOUND_BLACKLISTED:
                    return 'User is blacklisted';
                case GateReasonCode.OUTBOUND_DO_NOT_DISTURB:
                    return 'User marked as do_not_disturb';
                case GateReasonCode.OUTBOUND_USER_CLOSED:
                    return 'User completed interaction (CLOSED with decision_made)';
                case GateReasonCode.OUTBOUND_HAS_ACTIVE_ORDER:
                    return 'User has active order (no promos needed)';
                case GateReasonCode.OUTBOUND_COOLDOWN:
                    return 'User in cooldown period after failed follow-ups';
                case GateReasonCode.OUTBOUND_MAX_FOLLOWUPS_REACHED:
                    return 'Max follow-up attempts (6) reached without response';
                case GateReasonCode.OUTBOUND_RECENCY_FOLLOWUP:
                    return 'Too soon since last follow-up (6h minimum)';
                case GateReasonCode.OUTBOUND_RECENCY_INTERACTION:
                    return 'User interacted too recently (45min minimum)';
                case GateReasonCode.OUTBOUND_TIME_WINDOW:
                    return 'Outside business hours (9 AM - 9 PM)';
                default:
                    return String(code);
            }
        }) || [],
        counters: result.counters!,
        limits: result.limits!,
        timestamps: {
            lastInteraction: result.lastInteraction?.toISOString() || null,
            lastFollowUp: result.lastFollowUp?.toISOString() || null,
            lastUserReply: result.lastUserReply?.toISOString() || null,
            cooldownUntil: session.cooldownUntil ? new Date(session.cooldownUntil).toISOString() : null
        },
        nextEligibleAt: result.nextEligibleAt?.toISOString() || null,
        contactStatus: session.contactStatus || 'ACTIVE',
        tags: session.tags || []
    };
}

console.log('✅ evaluateOutboundGates module loaded');
