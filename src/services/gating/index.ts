/**
 * Gating Module
 * Unified entry point for inbound and outbound message gating
 * 
 * This module separates gating policies into two distinct categories:
 * 
 * INBOUND GATES (evaluateInboundGates):
 * - Applied to incoming user messages
 * - Only checks for abuse/blacklist
 * - NEVER blocks based on follow-up related policies
 * - Users can ALWAYS send messages regardless of outbound restrictions
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
