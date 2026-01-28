/**
 * Gating Module
 * Unified entry point for inbound and outbound message gating
 * 
 * This module separates gating policies into two distinct categories:
 * 
 * INBOUND GATES (evaluateInboundGates):
 * - Applied to incoming user messages
 * - By design, inbound messages are ALWAYS allowed
 * - Users must be able to message us regardless of their status
 * - Even OPT_OUT users can message (they might want to opt back in)
 * 
 * OUTBOUND GATES (evaluateOutboundGates):
 * - Applied to bot-initiated messages (follow-ups, promos, etc.)
 * - Checks OPT_OUT, blacklist, cooldown, max attempts, recency, time window, rate limits
 * - Provides detailed explanation for admin endpoint
 * - Integrates with DecisionTrace for auditing
 */

// Core types and enums
export { 
    GateReasonCode, 
    MessageCategory,
    isOutboundOnlyGate, 
    isUniversalBlock 
} from './GateReasonCode';
export type { GateResult, GateContext } from './GateReasonCode';

// Inbound gate evaluation (for incoming user messages)
export { 
    evaluateInboundGates, 
    canProcessInboundMessage,
    explainInboundBlock 
} from './evaluateInboundGates';

// Outbound gate evaluation (for bot-initiated messages)
export { 
    evaluateOutboundGates,
    recordOutboundGateDecision,
    explainOutboundGateStatus
} from './evaluateOutboundGates';
export type { OutboundGateResult } from './evaluateOutboundGates';

console.log('✅ Gating module loaded (inbound/outbound separation)');
