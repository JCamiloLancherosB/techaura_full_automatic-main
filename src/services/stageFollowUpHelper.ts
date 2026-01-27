/**
 * Flow Integration Helper for Stage-Based Follow-Up System
 * 
 * Provides a simple interface for flows to register blocking questions
 * and manage stage-based follow-ups.
 * 
 * Usage in flows:
 * ```typescript
 * import { registerBlockingQuestion, onUserResponse, markConversationComplete } from '../services/stageFollowUpHelper';
 * 
 * // When asking a blocking question
 * await registerBlockingQuestion(ctx.from, ConversationStage.ASK_GENRE, 'genre_selection_question', 'genre_selection', 'musicUsb');
 * 
 * // When user responds
 * await onUserResponse(ctx.from);
 * 
 * // When order is complete
 * await markConversationComplete(ctx.from);
 * ```
 */

import { stageBasedFollowUpService } from './StageBasedFollowUpService';
import { chatbotEventService } from './ChatbotEventService';
import { hashPhone } from '../utils/phoneHasher';
import { structuredLogger } from '../utils/structuredLogger';
import { 
    ConversationStage, 
    ExpectedAnswerType,
    ScheduleFollowUpResult 
} from '../types/ConversationStage';

/**
 * Register a blocking question in a flow
 * This schedules a stage-based follow-up if the user doesn't respond
 * 
 * @param phone - User's phone number
 * @param stage - Conversation stage (e.g., ASK_GENRE, ASK_CAPACITY_OK)
 * @param questionId - Unique identifier for this question
 * @param expectedAnswerType - Type of answer expected
 * @param flowName - Name of the flow asking the question
 * @param context - Additional context for follow-up message generation
 * @returns Result of scheduling the follow-up
 */
export async function registerBlockingQuestion(
    phone: string,
    stage: ConversationStage,
    questionId: string,
    expectedAnswerType: ExpectedAnswerType,
    flowName: string,
    context?: Record<string, any>
): Promise<ScheduleFollowUpResult> {
    try {
        structuredLogger.info('followup', `Registering blocking question`, {
            phone: hashPhone(phone),
            stage,
            questionId,
            flowName
        });
        
        // Track the event
        const conversationId = `conv_${hashPhone(phone)}_${Date.now()}`;
        await chatbotEventService.trackEvent(
            conversationId,
            phone,
            'BLOCKING_QUESTION_ASKED',
            {
                stage,
                questionId,
                expectedAnswerType,
                flowName,
                context
            }
        );
        
        // Register with the stage-based follow-up service
        return await stageBasedFollowUpService.registerBlockingQuestion(
            phone,
            stage,
            questionId,
            expectedAnswerType,
            flowName,
            context
        );
    } catch (error) {
        structuredLogger.error('followup', 'Error registering blocking question', {
            phone: hashPhone(phone),
            error: error instanceof Error ? error.message : String(error)
        });
        return {
            success: false,
            reason: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Call when user responds to cancel any pending follow-ups
 * 
 * @param phone - User's phone number
 */
export async function onUserResponse(phone: string): Promise<void> {
    try {
        await stageBasedFollowUpService.onUserResponse(phone);
        
        structuredLogger.info('followup', `User response processed`, {
            phone: hashPhone(phone)
        });
    } catch (error) {
        structuredLogger.error('followup', 'Error processing user response', {
            phone: hashPhone(phone),
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Mark conversation as complete (e.g., order confirmed)
 * This cancels all pending follow-ups
 * 
 * @param phone - User's phone number
 */
export async function markConversationComplete(phone: string): Promise<void> {
    try {
        await stageBasedFollowUpService.markComplete(phone);
        
        // Track the event
        const conversationId = `conv_${hashPhone(phone)}_${Date.now()}`;
        await chatbotEventService.trackEvent(
            conversationId,
            phone,
            'STAGE_ENTERED',
            {
                stage: ConversationStage.DONE,
                reason: 'Conversation marked complete'
            }
        );
        
        structuredLogger.info('followup', `Conversation marked complete`, {
            phone: hashPhone(phone)
        });
    } catch (error) {
        structuredLogger.error('followup', 'Error marking conversation complete', {
            phone: hashPhone(phone),
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Get current stage info for a user
 * 
 * @param phone - User's phone number
 * @returns Current stage info or undefined
 */
export function getCurrentStageInfo(phone: string) {
    return stageBasedFollowUpService.getStageInfo(phone);
}

/**
 * Get follow-up explanation for a user
 * 
 * @param phone - User's phone number
 * @returns Follow-up explanation including stage, nextFollowUpAt, reason
 */
export async function getFollowUpExplanation(phone: string) {
    return stageBasedFollowUpService.getFollowUpExplanation(phone);
}

// Re-export ConversationStage enum for convenience
export { ConversationStage, ExpectedAnswerType };

console.log('✅ Stage follow-up helper loaded');
