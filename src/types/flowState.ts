/**
 * FlowState Contract - Type definitions for flow continuity management
 * 
 * Defines the contract for persisting and managing active flow states
 * to ensure conversational continuity.
 */

/**
 * Types of expected input from the user
 */
export type ExpectedInputType = 'TEXT' | 'NUMBER' | 'CHOICE' | 'MEDIA' | 'ANY';

/**
 * FlowState Contract interface
 * Represents the active state of a user's conversation flow
 */
export interface FlowStateContract {
    /** User's phone number (primary key) */
    phone: string;
    
    /** Currently active flow ID (e.g., 'musicUsb', 'videosUsb', 'orderFlow') */
    activeFlowId: string | null;
    
    /** Current step within the active flow */
    activeStep: string | null;
    
    /** Type of input expected from the user */
    expectedInput: ExpectedInputType;
    
    /** Identifier of the last question asked */
    lastQuestionId: string | null;
    
    /** Text of the last question for re-prompting */
    lastQuestionText: string | null;
    
    /** Hours after which to consider the step stale */
    stepTimeoutHours: number;
    
    /** Additional context data for the current flow step */
    flowContext: Record<string, any> | null;
    
    /** Last update timestamp */
    updatedAt: Date;
    
    /** Creation timestamp */
    createdAt: Date;
}

/**
 * Decision result from flow continuity check
 */
export interface FlowContinuityDecision {
    /** Whether to continue in the active flow */
    shouldContinueInFlow: boolean;
    
    /** The active flow to continue in (if any) */
    activeFlowId: string | null;
    
    /** The active step within the flow */
    activeStep: string | null;
    
    /** Type of input expected */
    expectedInput: ExpectedInputType;
    
    /** Whether the step has timed out */
    isStale: boolean;
    
    /** Hours since last update */
    hoursSinceUpdate: number;
    
    /** Reason for the decision */
    reason: string;
    
    /** Reason code for tracing */
    reasonCode: FlowContinuityReasonCode;
    
    /** Last question text for potential re-prompt */
    lastQuestionText: string | null;
}

/**
 * Reason codes for flow continuity decisions
 */
export enum FlowContinuityReasonCode {
    /** No active flow found */
    NO_ACTIVE_FLOW = 'NO_ACTIVE_FLOW',
    
    /** Active flow found, should continue */
    ACTIVE_FLOW_CONTINUE = 'ACTIVE_FLOW_CONTINUE',
    
    /** Flow step is stale (timed out) */
    FLOW_STEP_STALE = 'FLOW_STEP_STALE',
    
    /** Flow guard blocked the continuation */
    FLOW_GUARD_BLOCKED = 'FLOW_GUARD_BLOCKED',
    
    /** User explicitly requested to change flow */
    USER_FLOW_CHANGE = 'USER_FLOW_CHANGE',
    
    /** Input validation failed, should re-prompt */
    INPUT_VALIDATION_FAILED = 'INPUT_VALIDATION_FAILED',
    
    /** Deferred to router for new flow detection */
    DEFER_TO_ROUTER = 'DEFER_TO_ROUTER'
}

/**
 * Options for setting flow state
 */
export interface SetFlowStateOptions {
    /** The flow ID to set */
    flowId: string;
    
    /** The step within the flow */
    step: string;
    
    /** Type of input expected */
    expectedInput?: ExpectedInputType;
    
    /** Question ID for tracking */
    questionId?: string;
    
    /** Question text for re-prompting */
    questionText?: string;
    
    /** Timeout hours for this step */
    timeoutHours?: number;
    
    /** Additional context data */
    context?: Record<string, any>;
}

/**
 * Input validation result
 */
export interface InputValidationResult {
    /** Whether the input is valid */
    isValid: boolean;
    
    /** Validation error message if invalid */
    errorMessage?: string;
    
    /** Suggested re-prompt message */
    repromptMessage?: string;
}

/**
 * Flow resumption info when rehydrating a stale conversation
 */
export interface FlowResumptionInfo {
    /** Summary of where the user was */
    contextSummary: string;
    
    /** Whether to restart or continue */
    action: 'restart' | 'continue' | 'prompt_choice';
    
    /** Message to send to user */
    message: string;
}

/**
 * Database row representation of conversation_state
 */
export interface ConversationStateRow {
    phone: string;
    active_flow_id: string | null;
    active_step: string | null;
    expected_input: ExpectedInputType;
    last_question_id: string | null;
    last_question_text: string | null;
    step_timeout_hours: number;
    flow_context: string | null; // JSON string
    updated_at: Date;
    created_at: Date;
}
