/**
 * Inbound Gates Evaluator
 * Evaluates gating rules for INCOMING user messages
 * 
 * IMPORTANT: Inbound gates should NEVER include follow-up related restrictions!
 * Users must always be able to send messages regardless of:
 * - max_followups_reached
 * - cooldown periods (for follow-ups)
 * - time windows
 * - rate limits (outbound specific)
 * 
 * Inbound gates only check for:
 * - Severe abuse cases (spam bots, etc.)
 * - Deduplication (prevent duplicate message processing)
 * 
 * Note: Regular OPT_OUT and 'blacklist' tags do NOT block inbound messages.
 * Users who opted out should still be able to message us (they might want to opt back in).
 */

import { GateReasonCode, GateResult, GateContext } from './GateReasonCode';
import type { UserSession } from '../../../types/global';

/**
 * Evaluate all inbound gates for a user message
 * Returns whether the message should be processed
 * 
 * @param ctx - Gate context with phone and optional message info
 * @param session - User session data
 * @returns GateResult with decision and reason
 */
export async function evaluateInboundGates(
    ctx: GateContext,
    session: UserSession
): Promise<GateResult> {
    console.log(`🚪 InboundGates: Evaluating gates for incoming message from ${ctx.phone}`);

    // IMPORTANT: We intentionally do NOT block inbound messages for most reasons.
    // Users should ALWAYS be able to send messages to us.
    
    // The only case we might block is severe abuse (spam bots, etc.)
    // but this should be handled at a higher level (e.g., WhatsApp's own anti-spam)
    // 
    // We explicitly do NOT check:
    // - OPT_OUT status (user might want to opt back in)
    // - Regular blacklist tag (user might have legitimate re-engagement)
    // - Cooldown (only applies to outbound follow-ups)
    // - Max follow-up attempts (only applies to outbound)
    // - Time windows (user can message anytime)
    // - Rate limits (outbound specific)

    // Note on 'blacklist' tag: The blacklist tag is primarily used for opt-out tracking.
    // Even blacklisted users should be able to send messages - they might want to opt back in.
    // True abuse cases should be handled by WhatsApp's anti-spam or at the infrastructure level.

    // All gates passed - always allow inbound messages
    console.log(`✅ InboundGates: All gates passed for ${ctx.phone} - inbound always allowed`);
    return {
        allowed: true,
        reasonCode: GateReasonCode.ALLOWED,
        reason: 'Inbound messages are always allowed'
    };
}

/**
 * Quick check if user can send messages (for inline use)
 * This is a simplified version - inbound messages are always allowed
 */
export function canProcessInboundMessage(session: UserSession): boolean {
    // IMPORTANT: Inbound messages are ALWAYS allowed.
    // Users must always be able to send messages to us regardless of:
    // - contactStatus (OPT_OUT users might want to opt back in)
    // - blacklist tags (used for opt-out, not abuse)
    // - cooldown status (only applies to outbound)
    // - max follow-up attempts (only applies to outbound)
    
    return true;
}

/**
 * Get a human-readable explanation of why an inbound message was blocked
 * Note: In practice, inbound messages should never be blocked.
 */
export function explainInboundBlock(result: GateResult): string {
    if (result.allowed) {
        return 'Message is allowed to be processed';
    }

    // This should rarely if ever be reached
    return result.reason || 'Message blocked for unknown reason';
}

console.log('✅ evaluateInboundGates module loaded');
