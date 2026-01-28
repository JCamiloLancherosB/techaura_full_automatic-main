/**
 * ConversationStage - Enum and types for stage-based follow-up system
 * 
 * Defines the conversation stages used to determine when and how to send
 * follow-up messages based on where the user is in their purchase journey.
 */

/**
 * Conversation stages representing key blocking questions in flows
 */
export enum ConversationStage {
    /** Initial welcome/start interaction */
    START = 'START',
    
    /** Asked user about genre preferences (music, movies, videos) */
    ASK_GENRE = 'ASK_GENRE',
    
    /** Asked user to confirm capacity selection is OK */
    ASK_CAPACITY_OK = 'ASK_CAPACITY_OK',
    
    /** Asked user to confirm order summary before payment */
    CONFIRM_SUMMARY = 'CONFIRM_SUMMARY',
    
    /** Awaiting payment confirmation */
    PAYMENT = 'PAYMENT',
    
    /** Order completed, no follow-up needed */
    DONE = 'DONE'
}

/**
 * Stage-specific delay configuration for follow-ups (in minutes)
 * Each stage has a range [minDelay, maxDelay] for randomization
 */
export interface StageDelayConfig {
    minDelayMinutes: number;
    maxDelayMinutes: number;
}

/**
 * Default delay configurations per stage
 */
export const STAGE_DELAY_CONFIG: Record<ConversationStage, StageDelayConfig> = {
    [ConversationStage.START]: { minDelayMinutes: 30, maxDelayMinutes: 60 },
    [ConversationStage.ASK_GENRE]: { minDelayMinutes: 20, maxDelayMinutes: 30 },
    [ConversationStage.ASK_CAPACITY_OK]: { minDelayMinutes: 30, maxDelayMinutes: 45 },
    [ConversationStage.CONFIRM_SUMMARY]: { minDelayMinutes: 10, maxDelayMinutes: 20 },
    [ConversationStage.PAYMENT]: { minDelayMinutes: 15, maxDelayMinutes: 30 },
    [ConversationStage.DONE]: { minDelayMinutes: 0, maxDelayMinutes: 0 } // No follow-up
};

/**
 * Expected answer types for each stage
 */
export type ExpectedAnswerType = 
    | 'genre_selection'    // User should select genres
    | 'capacity_confirmation' // User should confirm capacity
    | 'order_confirmation'   // User should confirm order summary
    | 'payment_confirmation' // User should confirm payment
    | 'free_text'           // Any text response
    | 'yes_no';             // Yes/No type response

/**
 * Stage information stored with user session
 */
export interface StageInfo {
    /** Current conversation stage */
    stage: ConversationStage;
    
    /** ID of the last blocking question asked */
    lastQuestionId: string;
    
    /** Type of answer expected */
    expectedAnswerType: ExpectedAnswerType;
    
    /** Timestamp when the stage was entered */
    enteredAt: Date;
    
    /** The flow that set this stage */
    flowName: string;
    
    /** Additional context for follow-up message generation */
    context?: Record<string, any>;
}

/**
 * Scheduled follow-up entry
 */
export interface ScheduledFollowUp {
    /** Unique ID for this scheduled follow-up */
    id: string;
    
    /** Phone hash (for privacy) */
    phoneHash: string;
    
    /** Stage when the follow-up was scheduled */
    stage: ConversationStage;
    
    /** Question ID that triggered this follow-up */
    questionId: string;
    
    /** When this follow-up should be sent */
    scheduledAt: Date;
    
    /** Reason/context for this follow-up */
    reason: string;
    
    /** Number of follow-up attempts for this stage */
    attemptNumber: number;
    
    /** Status of the follow-up */
    status: 'pending' | 'sent' | 'cancelled' | 'blocked' | 'rescheduled';
    
    /** If blocked or cancelled, the reason */
    statusReason?: string;
    
    /** Timestamp when status was last updated */
    statusUpdatedAt?: Date;
    
    /** Timestamp when the follow-up was created */
    createdAt: Date;
    
    /** Last block reason category (for debugging) */
    lastBlockReason?: string;
    
    /** Timestamp of last block event */
    lastBlockAt?: Date;
    
    /** Next attempt timestamp when rescheduled */
    nextAttemptAt?: Date;
    
    /** Total number of reschedule attempts */
    rescheduleCount?: number;
}

/**
 * Result of scheduling a stage-based follow-up
 */
export interface ScheduleFollowUpResult {
    success: boolean;
    followUpId?: string;
    scheduledAt?: Date;
    reason: string;
}

/**
 * Follow-up explanation for admin endpoint
 */
export interface FollowUpExplanation {
    phone: string;
    currentStage: ConversationStage | null;
    stageInfo: StageInfo | null;
    nextFollowUpAt: Date | null;
    pendingFollowUps: Array<{
        id: string;
        stage: ConversationStage;
        scheduledAt: Date;
        reason: string;
        status: string;
    }>;
    canReceiveFollowUp: boolean;
    blockingReasons: string[];
    counters: {
        followUpAttempts: number;
        stageAttempts: number;
    };
}

/**
 * Helper to get a random delay within stage config range
 */
export function getStageDelay(stage: ConversationStage): number {
    const config = STAGE_DELAY_CONFIG[stage];
    if (!config || config.maxDelayMinutes === 0) {
        return 0;
    }
    
    const range = config.maxDelayMinutes - config.minDelayMinutes;
    const randomOffset = Math.random() * range;
    return Math.round(config.minDelayMinutes + randomOffset);
}

/**
 * Calculate scheduled time based on stage delay
 */
export function calculateScheduledTime(stage: ConversationStage): Date {
    const delayMinutes = getStageDelay(stage);
    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + delayMinutes);
    return scheduledAt;
}

/**
 * Check if a stage requires follow-up
 */
export function stageRequiresFollowUp(stage: ConversationStage): boolean {
    return stage !== ConversationStage.DONE;
}

console.log('✅ ConversationStage types loaded');
