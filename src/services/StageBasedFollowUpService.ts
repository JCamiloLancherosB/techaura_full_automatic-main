/**
 * StageBasedFollowUpService
 * 
 * Manages stage-based follow-up scheduling:
 * - Schedules follow-ups when blocking questions are asked
 * - Cancels pending follow-ups when user responds
 * - Integrates with OutboundGate for sending
 * - Records blocking reasons using ChatbotEventService
 * - Checks suppression status before rescheduling to prevent infinite loops
 */

import { 
    ConversationStage, 
    StageInfo, 
    ScheduledFollowUp,
    ScheduleFollowUpResult,
    FollowUpExplanation,
    calculateScheduledTime,
    stageRequiresFollowUp,
    STAGE_DELAY_CONFIG,
    ExpectedAnswerType
} from '../types/ConversationStage';
import { outboundGate } from './OutboundGate';
import { chatbotEventService } from './ChatbotEventService';
import { evaluateOutboundGates, explainOutboundGateStatus } from './gating';
import { getUserSession } from '../flows/userTrackingSystem';
import { hashPhone } from '../utils/phoneHasher';
import { structuredLogger } from '../utils/structuredLogger';
import type { UserSession } from '../../types/global';
import { v4 as uuidv4 } from 'uuid';
import { buildStageFollowUpMessage } from './persuasionTemplates';

// In-memory store for scheduled follow-ups (could be moved to Redis/DB for persistence)
const scheduledFollowUps = new Map<string, ScheduledFollowUp>();

// In-memory store for stage info per phone
const stageInfoStore = new Map<string, StageInfo>();

// Timer references for scheduled follow-ups
const followUpTimers = new Map<string, NodeJS.Timeout>();

/**
 * Service for managing stage-based follow-ups
 */
export class StageBasedFollowUpService {
    private static instance: StageBasedFollowUpService;
    
    private constructor() {
        structuredLogger.info('followup', 'StageBasedFollowUpService initialized');
    }
    
    static getInstance(): StageBasedFollowUpService {
        if (!StageBasedFollowUpService.instance) {
            StageBasedFollowUpService.instance = new StageBasedFollowUpService();
        }
        return StageBasedFollowUpService.instance;
    }
    
    /**
     * Register a blocking question and schedule a stage-based follow-up
     * 
     * @param phone - User's phone number
     * @param stage - Current conversation stage
     * @param questionId - Identifier for the question asked
     * @param expectedAnswerType - Type of answer expected
     * @param flowName - Name of the flow asking the question
     * @param context - Additional context for follow-up generation
     */
    async registerBlockingQuestion(
        phone: string,
        stage: ConversationStage,
        questionId: string,
        expectedAnswerType: ExpectedAnswerType,
        flowName: string,
        context?: Record<string, any>
    ): Promise<ScheduleFollowUpResult> {
        const phoneHash = hashPhone(phone);
        
        structuredLogger.info('followup', `Registering blocking question`, {
            phone: phoneHash,
            stage,
            questionId,
            expectedAnswerType,
            flowName
        });
        
        // Store stage info
        const stageInfo: StageInfo = {
            stage,
            lastQuestionId: questionId,
            expectedAnswerType,
            enteredAt: new Date(),
            flowName,
            context
        };
        stageInfoStore.set(phone, stageInfo);

        // Track STAGE_SET event for funnel analytics
        try {
            const conversationId = `conv_${phoneHash}_${Date.now()}`;
            await chatbotEventService.trackStageSet(
                conversationId,
                phone,
                stage,
                questionId,
                flowName,
                {
                    expectedAnswerType,
                    ...context
                }
            );
        } catch (error) {
            structuredLogger.warn('followup', 'Failed to track STAGE_SET event', { error });
        }
        
        // Check if stage requires follow-up
        if (!stageRequiresFollowUp(stage)) {
            return {
                success: false,
                reason: `Stage ${stage} does not require follow-up`
            };
        }
        
        // Cancel any existing pending follow-ups for this phone + stage
        await this.cancelPendingFollowUps(phone, stage);
        
        // Schedule new follow-up
        return this.scheduleFollowUp(phone, stage, questionId, flowName, context);
    }
    
    /**
     * Schedule a follow-up for a specific stage
     */
    private async scheduleFollowUp(
        phone: string,
        stage: ConversationStage,
        questionId: string,
        flowName: string,
        context?: Record<string, any>
    ): Promise<ScheduleFollowUpResult> {
        const phoneHash = hashPhone(phone);
        const followUpId = uuidv4();
        const scheduledAt = calculateScheduledTime(stage);
        
        // Get existing attempts for this stage
        const existingAttempts = this.getStageAttempts(phone, stage);
        
        const followUp: ScheduledFollowUp = {
            id: followUpId,
            phoneHash,
            stage,
            questionId,
            scheduledAt,
            reason: `No response to ${questionId} in flow ${flowName}`,
            attemptNumber: existingAttempts + 1,
            status: 'pending',
            createdAt: new Date()
        };
        
        // Store the scheduled follow-up
        const key = `${phone}:${stage}`;
        scheduledFollowUps.set(key, followUp);
        
        // Calculate delay in milliseconds
        const delayMs = scheduledAt.getTime() - Date.now();
        
        // Set timer for the follow-up
        const timer = setTimeout(async () => {
            await this.executeFollowUp(phone, followUp);
        }, delayMs);
        
        followUpTimers.set(followUpId, timer);
        
        // Log event for tracking
        try {
            const conversationId = `conv_${phoneHash}_${Date.now()}`;
            await chatbotEventService.trackEvent(
                conversationId,
                phone,
                'FOLLOWUP_SCHEDULED',
                {
                    followUpId,
                    stage,
                    questionId,
                    scheduledAt: scheduledAt.toISOString(),
                    delayMinutes: Math.round(delayMs / 60000),
                    attemptNumber: followUp.attemptNumber,
                    flowName
                }
            );
        } catch (error) {
            structuredLogger.warn('followup', 'Failed to track follow-up scheduled event', { error });
        }
        
        const delayConfig = STAGE_DELAY_CONFIG[stage];
        structuredLogger.info('followup', `Follow-up scheduled`, {
            phone: phoneHash,
            followUpId,
            stage,
            scheduledAt: scheduledAt.toISOString(),
            delayMinutes: Math.round(delayMs / 60000),
            delayConfig: `${delayConfig.minDelayMinutes}-${delayConfig.maxDelayMinutes}min`
        });
        
        return {
            success: true,
            followUpId,
            scheduledAt,
            reason: `Follow-up scheduled for stage ${stage}`
        };
    }
    
    /**
     * Execute a scheduled follow-up
     */
    private async executeFollowUp(phone: string, followUp: ScheduledFollowUp): Promise<void> {
        const phoneHash = hashPhone(phone);
        const key = `${phone}:${followUp.stage}`;
        
        structuredLogger.info('followup', `Executing follow-up`, {
            phone: phoneHash,
            followUpId: followUp.id,
            stage: followUp.stage
        });
        
        try {
            // Get current session
            const session = await getUserSession(phone);
            if (!session) {
                await this.updateFollowUpStatus(key, 'cancelled', 'Session not found');
                return;
            }
            
            // Check if user already responded (stage info should be cleared or changed)
            const currentStageInfo = stageInfoStore.get(phone);
            if (!currentStageInfo || currentStageInfo.stage !== followUp.stage) {
                await this.updateFollowUpStatus(key, 'cancelled', 'User responded or stage changed');
                structuredLogger.info('followup', `Follow-up cancelled - user responded or stage changed`, {
                    phone: phoneHash,
                    originalStage: followUp.stage,
                    currentStage: currentStageInfo?.stage || 'none'
                });
                return;
            }
            
            // Evaluate outbound gates
            const gateResult = await evaluateOutboundGates(
                { phone, messageType: 'followup', stage: followUp.stage },
                session
            );
            
            if (!gateResult.allowed) {
                // Record blocking event with detailed reason for analytics
                const conversationId = `conv_${phoneHash}_${Date.now()}`;
                const blockReason = this.categorizeBlockReason(gateResult.blockedBy);
                
                // If we have a nextEligibleAt, reschedule instead of just marking blocked
                if (gateResult.nextEligibleAt) {
                    const rescheduleResult = await this.rescheduleBlockedFollowUp(
                        phone,
                        followUp,
                        gateResult.nextEligibleAt,
                        blockReason,
                        gateResult.blockedBy
                    );
                    
                    if (rescheduleResult) {
                        await chatbotEventService.trackFollowupBlocked(
                            conversationId,
                            phone,
                            blockReason,
                            gateResult.blockedBy?.map(code => String(code)),
                            {
                                followUpId: followUp.id,
                                stage: followUp.stage,
                                nextEligibleAt: gateResult.nextEligibleAt.toISOString(),
                                rescheduled: true,
                                newFollowUpId: rescheduleResult.newFollowUpId
                            }
                        );
                        
                        structuredLogger.info('followup', `Follow-up rescheduled due to gate block`, {
                            phone: phoneHash,
                            reason: gateResult.reason,
                            blockedBy: gateResult.blockedBy,
                            nextEligibleAt: gateResult.nextEligibleAt.toISOString(),
                            newFollowUpId: rescheduleResult.newFollowUpId
                        });
                        return;
                    }
                }
                
                // No nextEligibleAt or rescheduling failed - mark as blocked
                await this.updateFollowUpStatus(key, 'blocked', gateResult.reason || 'Gate blocked', {
                    lastBlockReason: blockReason,
                    lastBlockAt: new Date(),
                    attemptCount: followUp.attemptNumber
                });
                
                await chatbotEventService.trackFollowupBlocked(
                    conversationId,
                    phone,
                    blockReason,
                    gateResult.blockedBy?.map(code => String(code)),
                    {
                        followUpId: followUp.id,
                        stage: followUp.stage,
                        nextEligibleAt: gateResult.nextEligibleAt?.toISOString()
                    }
                );
                
                structuredLogger.info('followup', `Follow-up blocked by OutboundGate (no reschedule possible)`, {
                    phone: phoneHash,
                    reason: gateResult.reason,
                    blockedBy: gateResult.blockedBy
                });
                return;
            }
            
            // Generate stage-specific follow-up message
            const message = this.generateStageFollowUpMessage(followUp.stage, session, currentStageInfo);
            
            // Send through OutboundGate
            const sendResult = await outboundGate.sendMessage(
                phone,
                message,
                {
                    phone,
                    messageType: 'followup',
                    stage: followUp.stage,
                    priority: 'normal'
                }
            );
            
            if (sendResult.sent) {
                await this.updateFollowUpStatus(key, 'sent', 'Message sent successfully');
                
                // Track sent event
                const conversationId = `conv_${phoneHash}_${Date.now()}`;
                await chatbotEventService.trackFollowupSent(
                    conversationId,
                    phone,
                    `stage_${followUp.stage}`,
                    {
                        followUpId: followUp.id,
                        stage: followUp.stage,
                        attemptNumber: followUp.attemptNumber,
                        questionId: followUp.questionId
                    }
                );
                
                structuredLogger.info('followup', `Stage follow-up sent`, {
                    phone: phoneHash,
                    stage: followUp.stage,
                    attemptNumber: followUp.attemptNumber
                });
            } else {
                await this.updateFollowUpStatus(key, 'blocked', sendResult.reason || 'Send failed');
                
                // Record blocking event with detailed reason for analytics
                const conversationId = `conv_${phoneHash}_${Date.now()}`;
                const blockReason = this.categorizeBlockReason(sendResult.blockedBy);
                await chatbotEventService.trackFollowupBlocked(
                    conversationId,
                    phone,
                    blockReason,
                    sendResult.blockedBy,
                    {
                        followUpId: followUp.id,
                        stage: followUp.stage
                    }
                );
            }
        } catch (error) {
            structuredLogger.error('followup', `Error executing follow-up`, {
                phone: phoneHash,
                followUpId: followUp.id,
                error: error instanceof Error ? error.message : String(error)
            });
            await this.updateFollowUpStatus(key, 'blocked', 'Error during execution');
        }
    }
    
    /**
     * Generate a stage-specific follow-up message using template rotation
     * Uses the new stage-based templates with rotation to avoid repetition
     * and ensure clear CTAs in every message
     */
    private generateStageFollowUpMessage(
        stage: ConversationStage,
        session: UserSession,
        stageInfo: StageInfo
    ): string {
        const context = stageInfo.context || {};
        const sessionAny = session as any;
        
        // Use statically imported buildStageFollowUpMessage
        try {
            // Build context for template personalization
            const templateContext = {
                capacity: context.capacity || sessionAny.capacity || undefined,
                contentType: context.contentType || sessionAny.contentType || undefined,
                price: context.price || (session.orderData ? session.orderData.totalPrice : undefined)
            };
            
            const result = buildStageFollowUpMessage(session, stage, templateContext);
            
            structuredLogger.info('followup', `Generated stage follow-up with template ${result.templateId}`, {
                stage,
                templateId: result.templateId,
                hasClearCTA: result.hasClearCTA
            });
            
            return result.message;
        } catch (templateError) {
            // Fallback to legacy messages if template system fails
            structuredLogger.warn('followup', 'Template system unavailable, using legacy messages', { 
                error: templateError instanceof Error ? templateError.message : String(templateError)
            });
            
            return this.generateLegacyFollowUpMessage(stage, session, stageInfo);
        }
    }
    
    /**
     * Legacy fallback method for generating follow-up messages
     * Used when the template system is unavailable
     */
    private generateLegacyFollowUpMessage(
        stage: ConversationStage,
        session: UserSession,
        stageInfo: StageInfo
    ): string {
        const name = session.name || 'amigo';
        const context = stageInfo.context || {};
        const sessionAny = session as any;
        
        switch (stage) {
            case ConversationStage.ASK_GENRE:
                return `Hola ${name} 👋 Vi que estabas eligiendo géneros para tu USB.

¿Qué tipo de contenido prefieres?
1️⃣ Música 🎵
2️⃣ Videos 📺
3️⃣ Películas 🎬

Escribe: 1, 2, 3 o "otro" si prefieres algo diferente`;
            
            case ConversationStage.ASK_CAPACITY_OK:
                const capacity = context.capacity || sessionAny.capacity || '64GB';
                return `Hola ${name}! 📦 La capacidad de ${capacity} te dará espacio de sobra para todo tu contenido.

¿Confirmamos esta opción? Escribe "OK" o "cambiar" si prefieres otra capacidad`;
            
            case ConversationStage.CONFIRM_SUMMARY:
                return `Hola ${name}! 📋 Tu pedido está casi listo.

Solo necesito tu confirmación para procesarlo.

¿Todo bien? Responde "Sí" para confirmar o "No" si quieres ajustar algo`;
            
            case ConversationStage.PAYMENT:
                return `Hola ${name}! 💳 Tu USB personalizada está reservada y lista.

¿Necesitas ayuda con el pago? Responde SÍ o cuéntame si tienes alguna duda`;
            
            case ConversationStage.START:
                return `Hola ${name}! 👋 Vi que comenzaste a explorar nuestros productos.

¿Te gustaría que te ayude? Responde SÍ para continuar o cuéntame qué te interesa`;
            
            default:
                return `Hola ${name}! 👋 ¿Puedo ayudarte con tu USB personalizada?

Responde SÍ para continuar o cuéntame qué necesitas`;
        }
    }
    
    /**
     * Cancel pending follow-ups when user responds
     */
    async cancelPendingFollowUps(phone: string, stage?: ConversationStage): Promise<number> {
        const phoneHash = hashPhone(phone);
        let cancelledCount = 0;
        
        for (const [key, followUp] of scheduledFollowUps.entries()) {
            if (key.startsWith(`${phone}:`)) {
                // If stage is specified, only cancel that stage
                if (stage && followUp.stage !== stage) {
                    continue;
                }
                
                // Cancel the timer
                const timer = followUpTimers.get(followUp.id);
                if (timer) {
                    clearTimeout(timer);
                    followUpTimers.delete(followUp.id);
                }
                
                // Update status
                followUp.status = 'cancelled';
                followUp.statusReason = 'User responded';
                followUp.statusUpdatedAt = new Date();
                
                cancelledCount++;
                
                structuredLogger.info('followup', `Follow-up cancelled - user responded`, {
                    phone: phoneHash,
                    followUpId: followUp.id,
                    stage: followUp.stage
                });
            }
        }
        
        return cancelledCount;
    }
    
    /**
     * Handle user response - clear stage info and cancel pending follow-ups
     */
    async onUserResponse(phone: string): Promise<void> {
        const phoneHash = hashPhone(phone);
        
        // Get current stage info
        const stageInfo = stageInfoStore.get(phone);
        
        if (stageInfo) {
            structuredLogger.info('followup', `User responded during stage ${stageInfo.stage}`, {
                phone: phoneHash,
                stage: stageInfo.stage,
                questionId: stageInfo.lastQuestionId
            });

            // Calculate time in stage
            const timeInStageMs = Date.now() - stageInfo.enteredAt.getTime();

            // Track STAGE_RESOLVED event for funnel analytics
            try {
                const conversationId = `conv_${phoneHash}_${Date.now()}`;
                await chatbotEventService.trackStageResolved(
                    conversationId,
                    phone,
                    stageInfo.stage,
                    stageInfo.expectedAnswerType,
                    timeInStageMs,
                    {
                        questionId: stageInfo.lastQuestionId,
                        flowName: stageInfo.flowName
                    }
                );
            } catch (error) {
                structuredLogger.warn('followup', 'Failed to track STAGE_RESOLVED event', { error });
            }
            
            // Cancel pending follow-ups for this stage
            await this.cancelPendingFollowUps(phone, stageInfo.stage);
            
            // Clear the stage info (will be set again if another blocking question is asked)
            stageInfoStore.delete(phone);
        }
    }
    
    /**
     * Mark a conversation as complete (DONE stage)
     */
    async markComplete(phone: string): Promise<void> {
        // Cancel all pending follow-ups
        await this.cancelPendingFollowUps(phone);
        
        // Clear stage info
        stageInfoStore.delete(phone);
        
        structuredLogger.info('followup', `Conversation marked complete`, {
            phone: hashPhone(phone)
        });
    }
    
    /**
     * Get follow-up explanation for admin endpoint
     */
    async getFollowUpExplanation(phone: string): Promise<FollowUpExplanation> {
        const session = await getUserSession(phone);
        const stageInfo = stageInfoStore.get(phone);
        
        // Get pending follow-ups
        const pendingFollowUps: FollowUpExplanation['pendingFollowUps'] = [];
        let nextFollowUpAt: Date | null = null;
        
        for (const [key, followUp] of scheduledFollowUps.entries()) {
            if (key.startsWith(`${phone}:`)) {
                pendingFollowUps.push({
                    id: followUp.id,
                    stage: followUp.stage,
                    scheduledAt: followUp.scheduledAt,
                    reason: followUp.reason,
                    status: followUp.status
                });
                
                if (followUp.status === 'pending') {
                    if (!nextFollowUpAt || followUp.scheduledAt < nextFollowUpAt) {
                        nextFollowUpAt = followUp.scheduledAt;
                    }
                }
            }
        }
        
        // Get blocking reasons from outbound gates
        let blockingReasons: string[] = [];
        let canReceiveFollowUp = true;
        
        if (session) {
            const gateResult = await evaluateOutboundGates(
                { phone, messageType: 'followup' },
                session
            );
            canReceiveFollowUp = gateResult.allowed;
            if (!gateResult.allowed && gateResult.blockedBy) {
                blockingReasons = gateResult.blockedBy.map(code => String(code));
            }
        } else {
            canReceiveFollowUp = false;
            blockingReasons = ['Session not found'];
        }
        
        return {
            phone,
            currentStage: stageInfo?.stage || null,
            stageInfo: stageInfo || null,
            nextFollowUpAt,
            pendingFollowUps,
            canReceiveFollowUp,
            blockingReasons,
            counters: {
                followUpAttempts: session?.followUpAttempts || 0,
                stageAttempts: stageInfo ? this.getStageAttempts(phone, stageInfo.stage) : 0
            }
        };
    }
    
    /**
     * Get the queue of pending follow-ups (for admin endpoint)
     */
    getFollowUpQueue(): ScheduledFollowUp[] {
        const queue: ScheduledFollowUp[] = [];
        
        for (const followUp of scheduledFollowUps.values()) {
            if (followUp.status === 'pending') {
                queue.push(followUp);
            }
        }
        
        // Sort by scheduledAt
        return queue.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    }
    
    /**
     * Update follow-up status with optional metadata
     */
    private async updateFollowUpStatus(
        key: string,
        status: ScheduledFollowUp['status'],
        reason: string,
        metadata?: {
            lastBlockReason?: string;
            lastBlockAt?: Date;
            attemptCount?: number;
            nextAttemptAt?: Date;
            rescheduleCount?: number;
        }
    ): Promise<void> {
        const followUp = scheduledFollowUps.get(key);
        if (followUp) {
            followUp.status = status;
            followUp.statusReason = reason;
            followUp.statusUpdatedAt = new Date();
            
            // Apply optional metadata
            if (metadata) {
                if (metadata.lastBlockReason !== undefined) {
                    followUp.lastBlockReason = metadata.lastBlockReason;
                }
                if (metadata.lastBlockAt !== undefined) {
                    followUp.lastBlockAt = metadata.lastBlockAt;
                }
                if (metadata.attemptCount !== undefined) {
                    followUp.attemptNumber = metadata.attemptCount;
                }
                if (metadata.nextAttemptAt !== undefined) {
                    followUp.nextAttemptAt = metadata.nextAttemptAt;
                }
                if (metadata.rescheduleCount !== undefined) {
                    followUp.rescheduleCount = metadata.rescheduleCount;
                }
            }
        }
    }
    
    /**
     * Reschedule a blocked follow-up to the next eligible time
     * This prevents fixed-delay rescheduling when we know exactly when the gate will open
     * 
     * @param phone - User's phone number
     * @param originalFollowUp - The original follow-up that was blocked
     * @param nextEligibleAt - The next eligible time from gate evaluation
     * @param blockReason - The categorized block reason
     * @param blockedBy - List of blocking gate codes
     * @returns Object with new follow-up ID if rescheduled, or null if failed
     */
    private async rescheduleBlockedFollowUp(
        phone: string,
        originalFollowUp: ScheduledFollowUp,
        nextEligibleAt: Date,
        blockReason: string,
        blockedBy?: any[]
    ): Promise<{ newFollowUpId: string } | null> {
        const phoneHash = hashPhone(phone);
        const key = `${phone}:${originalFollowUp.stage}`;
        
        // Check if we're already past the max reschedule attempts to avoid infinite loops
        const MAX_RESCHEDULE_ATTEMPTS = 10;
        const currentRescheduleCount = originalFollowUp.rescheduleCount || 0;
        
        if (currentRescheduleCount >= MAX_RESCHEDULE_ATTEMPTS) {
            structuredLogger.warn('followup', `Max reschedule attempts reached for follow-up`, {
                phone: phoneHash,
                followUpId: originalFollowUp.id,
                rescheduleCount: currentRescheduleCount
            });
            return null;
        }
        
        // ✅ CRITICAL: Check if user is suppressed before rescheduling
        // This prevents infinite reprogramming for users who have confirmed shipping
        try {
            const { isFollowUpSuppressed, SuppressionReason } = await import('./followupSuppression');
            const suppressionResult = await isFollowUpSuppressed(phone);
            
            if (suppressionResult.suppressed) {
                structuredLogger.info('followup', `Cancelling reschedule - user is suppressed`, {
                    phone: phoneHash,
                    followUpId: originalFollowUp.id,
                    suppressionReason: suppressionResult.reason
                });
                
                // Mark as cancelled due to suppression
                await this.updateFollowUpStatus(key, 'cancelled', `Suppressed: ${suppressionResult.reason}`, {
                    lastBlockReason: suppressionResult.reason
                });
                
                return null;
            }
        } catch (suppressionError) {
            structuredLogger.warn('followup', 'Error checking suppression in reschedule', {
                phone: phoneHash,
                error: suppressionError instanceof Error ? suppressionError.message : String(suppressionError)
            });
            // Continue with reschedule if suppression check fails (fail-open)
        }
        
        // Validate nextEligibleAt is in the future
        const now = new Date();
        if (nextEligibleAt <= now) {
            structuredLogger.warn('followup', `nextEligibleAt is in the past, cannot reschedule`, {
                phone: phoneHash,
                nextEligibleAt: nextEligibleAt.toISOString(),
                now: now.toISOString()
            });
            return null;
        }
        
        // Mark original as rescheduled
        await this.updateFollowUpStatus(key, 'rescheduled', `Rescheduled due to: ${blockReason}`, {
            lastBlockReason: blockReason,
            lastBlockAt: new Date(),
            nextAttemptAt: nextEligibleAt,
            rescheduleCount: currentRescheduleCount + 1
        });
        
        // Cancel old timer if exists
        const oldTimer = followUpTimers.get(originalFollowUp.id);
        if (oldTimer) {
            clearTimeout(oldTimer);
            followUpTimers.delete(originalFollowUp.id);
        }
        
        // Create new follow-up with the exact nextEligibleAt time
        // Note: attemptNumber stays the same since the message was never actually sent
        // (it was blocked before sending). rescheduleCount tracks gate-related reschedules.
        const newFollowUpId = uuidv4();
        const newFollowUp: ScheduledFollowUp = {
            id: newFollowUpId,
            phoneHash,
            stage: originalFollowUp.stage,
            questionId: originalFollowUp.questionId,
            scheduledAt: nextEligibleAt,
            reason: `Rescheduled from ${originalFollowUp.id} due to ${blockReason}`,
            attemptNumber: originalFollowUp.attemptNumber, // Keep same - message wasn't sent
            status: 'pending',
            createdAt: new Date(),
            lastBlockReason: blockReason,
            lastBlockAt: new Date(),
            rescheduleCount: currentRescheduleCount + 1
        };
        
        // Store the new follow-up
        scheduledFollowUps.set(key, newFollowUp);
        
        // Calculate delay for the new timer
        const delayMs = nextEligibleAt.getTime() - now.getTime();
        
        // Set timer for the rescheduled follow-up
        const timer = setTimeout(async () => {
            await this.executeFollowUp(phone, newFollowUp);
        }, delayMs);
        
        followUpTimers.set(newFollowUpId, timer);
        
        // Log the reschedule event
        try {
            const conversationId = `conv_${phoneHash}_${Date.now()}`;
            await chatbotEventService.trackEvent(
                conversationId,
                phone,
                'FOLLOWUP_RESCHEDULED',
                {
                    originalFollowUpId: originalFollowUp.id,
                    newFollowUpId,
                    stage: originalFollowUp.stage,
                    blockReason,
                    blockedBy: blockedBy?.map(code => String(code)),
                    scheduledAt: nextEligibleAt.toISOString(),
                    delayMinutes: Math.round(delayMs / 60000),
                    attemptNumber: newFollowUp.attemptNumber,
                    rescheduleCount: newFollowUp.rescheduleCount
                }
            );
        } catch (error) {
            structuredLogger.warn('followup', 'Failed to track follow-up reschedule event', { error });
        }
        
        structuredLogger.info('followup', `Follow-up rescheduled successfully`, {
            phone: phoneHash,
            originalFollowUpId: originalFollowUp.id,
            newFollowUpId,
            stage: originalFollowUp.stage,
            scheduledAt: nextEligibleAt.toISOString(),
            delayMinutes: Math.round(delayMs / 60000),
            blockReason,
            rescheduleCount: newFollowUp.rescheduleCount
        });
        
        return { newFollowUpId };
    }
    
    /**
     * Get number of follow-up attempts for a specific stage
     */
    private getStageAttempts(phone: string, stage: ConversationStage): number {
        const key = `${phone}:${stage}`;
        const followUp = scheduledFollowUps.get(key);
        return followUp?.attemptNumber || 0;
    }
    
    /**
     * Get current stage info for a phone
     */
    getStageInfo(phone: string): StageInfo | undefined {
        return stageInfoStore.get(phone);
    }

    /**
     * Categorize block reasons for analytics aggregation
     * Maps OutboundGate reason codes to human-readable categories
     */
    private categorizeBlockReason(blockedBy?: (string | any)[]): string {
        if (!blockedBy || blockedBy.length === 0) {
            return 'unknown';
        }

        // Get the first/primary block reason
        const primaryReason = String(blockedBy[0]);

        // Categorize into main bucket categories per the requirements
        if (primaryReason.includes('TOO_SOON') || 
            primaryReason.includes('RECENCY') || 
            primaryReason.includes('recency')) {
            return 'too_soon';
        }
        if (primaryReason.includes('MAX_FOLLOWUP') || 
            primaryReason.includes('max_attempts') || 
            primaryReason.includes('COOLDOWN')) {
            return 'max_followups';
        }
        if (primaryReason.includes('INSUFFICIENT_SILENCE') || 
            primaryReason.includes('recently_active') ||
            primaryReason.includes('INTERACTION')) {
            return 'insufficient_silence';
        }
        if (primaryReason.includes('TIME_WINDOW') || 
            primaryReason.includes('outside_hours') ||
            primaryReason.includes('business_hours')) {
            return 'outside_hours';
        }
        if (primaryReason.includes('OPT_OUT') || 
            primaryReason.includes('BLACKLIST')) {
            return 'user_blocked';
        }
        if (primaryReason.includes('RATE_LIMIT')) {
            return 'rate_limited';
        }
        if (primaryReason.includes('ACTIVE_ORDER') || 
            primaryReason.includes('has_order')) {
            return 'has_active_order';
        }

        // Return the raw reason if no category matches
        return primaryReason.toLowerCase().replace(/_/g, ' ').substring(0, 50);
    }
    
    /**
     * Clean up old entries (call periodically)
     */
    cleanup(): void {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [key, followUp] of scheduledFollowUps.entries()) {
            if (followUp.status !== 'pending' && 
                followUp.statusUpdatedAt &&
                now - followUp.statusUpdatedAt.getTime() > maxAge) {
                scheduledFollowUps.delete(key);
            }
        }
        
        structuredLogger.info('followup', 'StageBasedFollowUp cleanup completed');
    }
}

// Export singleton instance
export const stageBasedFollowUpService = StageBasedFollowUpService.getInstance();

// Start periodic cleanup
setInterval(() => {
    stageBasedFollowUpService.cleanup();
}, 60 * 60 * 1000); // Every hour

console.log('✅ StageBasedFollowUpService loaded');
