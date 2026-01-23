import { logger } from '../utils/logger';
import { errorHandler } from '../utils/errorHandler';
import { businessDB } from '../mysql-database';
import type { UserSession } from '../../types/global';
import { 
    canReceiveFollowUps, 
    hasReachedMaxAttempts,
    isInCooldown,
    incrementFollowUpAttempts
} from './incomingMessageHandler';
import { 
    getContextualFollowUpMessage,
    buildPersonalizedFollowUp 
} from './persuasionTemplates';
import {
    hasConfirmedOrActiveOrder,
    hasIntentionChanged,
    isWhatsAppChatActive
} from '../flows/userTrackingSystem';
import { flowGuard } from './flowGuard';
import { outboundGate } from './OutboundGate';

interface FollowUpSystemState {
    isRunning: boolean;
    isStopping: boolean;  // NEW: Flag to indicate shutdown in progress
    lastExecution: number;
    errorCount: number;
    successCount: number;
    skipCount: number;
    lastError: string | null;
}

interface FollowUpCandidate {
    phone: string;
    session: UserSession;
    priority: number;
    reason: string;
}

/**
 * Comprehensive Follow-Up System
 * Ensures users are followed up contextually without spamming
 */
export const startFollowUpSystem = () => {
    logger.info('followup', '✅ Sistema de seguimiento iniciado con lógica completa');
    
    const systemState: FollowUpSystemState = {
        isRunning: false,
        isStopping: false,  // NEW: Initialize stop flag
        lastExecution: 0,
        errorCount: 0,
        successCount: 0,
        skipCount: 0,
        lastError: null
    };

    // NEW: Store reference globally for stop function
    globalSystemState = systemState;

    /**
     * Main follow-up execution cycle
     * Runs every 10 minutes to identify and process follow-up candidates
     */
    const executeFollowUpCycle = async () => {
        // NEW: Check if system is stopping
        if (systemState.isStopping) {
            logger.info('followup', '🛑 Sistema de seguimiento detenido, no ejecutando ciclo');
            return;
        }
        
        if (systemState.isRunning) {
            logger.info('followup', '⏸️ Ciclo anterior aún en ejecución, esperando...');
            return;
        }
        
        systemState.isRunning = true;
        systemState.lastExecution = Date.now();
        
        try {
            logger.info('followup', '🔄 Ejecutando ciclo de seguimiento');
            
            // Get all active sessions
            const allSessions = await getAllActiveSessions();
            logger.info('followup', `📊 Analizando ${allSessions.length} sesiones activas`);
            
            // Find follow-up candidates
            const candidates = await identifyFollowUpCandidates(allSessions);
            logger.info('followup', `🎯 Encontrados ${candidates.length} candidatos para seguimiento`);
            
            // Process candidates (with rate limiting)
            let processed = 0;
            let sent = 0;
            let skipped = 0;
            
            for (const candidate of candidates) {
                try {
                    const result = await processFollowUpCandidate(candidate);
                    processed++;
                    
                    if (result.sent) {
                        sent++;
                        systemState.successCount++;
                    } else {
                        skipped++;
                        systemState.skipCount++;
                    }
                    
                    // Rate limiting: wait between messages
                    if (result.sent) {
                        await delay(2000 + Math.random() * 3000); // 2-5s delay
                    }
                    
                    // Stop if we've sent too many in this cycle
                    if (sent >= 5) {
                        logger.info('followup', '⚠️ Límite de 5 mensajes por ciclo alcanzado (reducido de 10 para evitar spam)');
                        break;
                    }
                } catch (error) {
                    logger.error('followup', `Error procesando candidato ${candidate.phone}`, { error });
                    systemState.errorCount++;
                }
            }
            
            logger.info('followup', `✅ Ciclo completado: ${sent} enviados, ${skipped} omitidos de ${processed} procesados`);
        } catch (error) {
            logger.error('followup', 'Error en ciclo de seguimiento', { error });
            systemState.errorCount++;
            systemState.lastError = error instanceof Error ? error.message : String(error);
        } finally {
            systemState.isRunning = false;
        }
    };

    // Start interval (every 10 minutes)
    const interval = setInterval(executeFollowUpCycle, 10 * 60 * 1000);
    
    // Execute first cycle after 1 minute (to allow system startup)
    setTimeout(executeFollowUpCycle, 60 * 1000);

    return {
        stop: () => {
            clearInterval(interval);
            logger.info('followup', '🛑 Sistema de seguimiento detenido');
        },
        getStatus: () => ({ ...systemState }),
        forceExecute: executeFollowUpCycle
    };
};

/**
 * Get all active user sessions from database
 * ENHANCED: Robust fallback strategy to maximize session recovery
 */
async function getAllActiveSessions(): Promise<UserSession[]> {
    try {
        // Strategy 1: Try global cache first (fastest)
        if (global.userSessions && global.userSessions.size > 0) {
            logger.info('followup', `✅ Recovered ${global.userSessions.size} sessions from global cache`);
            return Array.from(global.userSessions.values());
        }
        
        // Strategy 2: Try database getAllSessions method
        if (businessDB && typeof (businessDB as any).getAllSessions === 'function') {
            try {
                const sessions = await (businessDB as any).getAllSessions();
                if (sessions && sessions.length > 0) {
                    logger.info('followup', `✅ Recovered ${sessions.length} sessions from database`);
                    
                    // Sync to global cache for future use
                    if (!global.userSessions) {
                        global.userSessions = new Map();
                    }
                    sessions.forEach((s: UserSession) => {
                        if (s.phone) {
                            global.userSessions!.set(s.phone, s);
                        }
                    });
                    
                    return sessions;
                }
            } catch (dbError) {
                logger.warn('followup', 'Error calling businessDB.getAllSessions, trying fallback', { error: dbError });
            }
        }
        
        // Strategy 3: Try to query database directly if connection is available
        if (businessDB && (businessDB as any).connection) {
            try {
                const connection = (businessDB as any).connection;
                // Select only required columns for performance and security
                const [rows] = await connection.query(
                    `SELECT phone, name, stage, buyingIntent, buying_intent, lastInteraction, 
                     lastFollowUp, lastUserReplyAt, followUpAttempts, followUpCount24h, 
                     contactStatus, createdAt, updatedAt 
                     FROM users 
                     WHERE isActive = ? AND contactStatus != ? 
                     ORDER BY lastInteraction DESC LIMIT 500`,
                    [true, 'OPT_OUT']
                );
                
                if (rows && Array.isArray(rows) && rows.length > 0) {
                    logger.info('followup', `✅ Recovered ${rows.length} sessions from direct database query`);
                    
                    // Map rows to UserSession format (simplified)
                    // Note: Both 'phone' and 'phoneNumber' are set for compatibility
                    // with different parts of the codebase that may use either property
                    const sessions = rows.map((row: any) => ({
                        phone: row.phone,
                        phoneNumber: row.phone, // Duplicate for backward compatibility
                        name: row.name || '',
                        stage: row.stage || 'initial',
                        buyingIntent: row.buyingIntent || row.buying_intent || 0,
                        lastInteraction: row.lastInteraction ? new Date(row.lastInteraction) : new Date(),
                        lastFollowUp: row.lastFollowUp ? new Date(row.lastFollowUp) : undefined,
                        lastUserReplyAt: row.lastUserReplyAt ? new Date(row.lastUserReplyAt) : undefined,
                        followUpAttempts: row.followUpAttempts || 0,
                        followUpCount24h: row.followUpCount24h || 0,
                        contactStatus: row.contactStatus || 'ACTIVE',
                        interests: [],
                        interactions: [],
                        conversationData: {},
                        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
                        updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
                        isActive: true,
                        isFirstMessage: false
                    } as UserSession));
                    
                    // Sync to global cache
                    if (!global.userSessions) {
                        global.userSessions = new Map();
                    }
                    sessions.forEach((s: UserSession) => {
                        if (s.phone) {
                            global.userSessions!.set(s.phone, s);
                        }
                    });
                    
                    return sessions;
                }
            } catch (queryError) {
                logger.warn('followup', 'Error in direct database query, no sessions available', { error: queryError });
            }
        }
        
        // Strategy 4: Last resort - return empty array with warning
        logger.warn('followup', '⚠️ No session recovery strategy succeeded - no sessions available for follow-up');
        return [];
    } catch (error) {
        logger.error('followup', 'Error obteniendo sesiones activas', { error });
        return [];
    }
}

/**
 * Priority boost for draft orders (high-value candidates)
 */
const DRAFT_ORDER_PRIORITY_BOOST = 10;

/**
 * Priority thresholds for follow-up candidates
 */
const PRIORITY_THRESHOLD_DEFAULT = 30;
const PRIORITY_THRESHOLD_DRAFT = 20;

/**
 * Identify which users should receive follow-ups
 * ENHANCED: Additional validations for purchase confirmation and intention changes
 * Uses FlowGuard for consistent blocking logic
 */
async function identifyFollowUpCandidates(sessions: UserSession[]): Promise<FollowUpCandidate[]> {
    const candidates: FollowUpCandidate[] = [];
    const now = Date.now();
    
    for (const session of sessions) {
        // Skip if no phone
        if (!session.phone) continue;
        
        // NEW: Use FlowGuard to check if follow-up should be blocked
        const blockCheck = await flowGuard.shouldBlockFollowUp(session.phone);
        if (blockCheck.blocked) {
            logger.debug('followup', `Skipping ${session.phone}: ${blockCheck.reason}`);
            continue;
        }
        
        // LEGACY CHECKS: Keep for additional validation and backward compatibility
        // NEW: Skip if user has active WhatsApp chat with agent
        if (isWhatsAppChatActive(session)) {
            logger.debug('followup', `Skipping ${session.phone}: active WhatsApp chat`);
            continue;
        }
        
        // NEW: Skip if user's intention changed recently (asked different question)
        const intentionCheck = hasIntentionChanged(session);
        if (intentionCheck.changed) {
            logger.debug('followup', `Skipping ${session.phone}: ${intentionCheck.reason}`);
            continue;
        }
        
        // Check if can receive follow-ups (respects opt-out, cooldown, etc.)
        const canReceive = canReceiveFollowUps(session);
        if (!canReceive.can) {
            continue;
        }
        
        // Check if already reached max attempts (3)
        if (hasReachedMaxAttempts(session)) {
            continue;
        }
        
        // Check cooldown status
        const cooldown = isInCooldown(session);
        if (cooldown.inCooldown) {
            continue;
        }
        
        // Calculate time since last interaction
        const lastInteraction = session.lastInteraction || session.createdAt;
        if (!lastInteraction) continue;
        
        const hoursSinceLastInteraction = (now - new Date(lastInteraction).getTime()) / (1000 * 60 * 60);
        
        // Only follow up if enough time has passed (based on stage)
        const minHours = getMinHoursForFollowUp(session);
        if (hoursSinceLastInteraction < minHours) {
            continue;
        }
        
        // Calculate priority score
        const priority = calculateFollowUpPriority(session, hoursSinceLastInteraction);
        
        // ENHANCED: Lower threshold for draft orders (high-value candidates)
        // Draft orders are prioritized to recover abandoned purchases
        const hasDraftOrder = session.orderData && session.orderData.status === 'draft';
        const priorityThreshold = hasDraftOrder ? PRIORITY_THRESHOLD_DRAFT : PRIORITY_THRESHOLD_DEFAULT;
        
        if (priority > priorityThreshold) {
            const reason = hasDraftOrder
                ? `Draft Order - Stage: ${session.stage}, BuyingIntent: ${session.buyingIntent || 0}%, Hours: ${hoursSinceLastInteraction.toFixed(1)}`
                : `Stage: ${session.stage}, BuyingIntent: ${session.buyingIntent || 0}%, Hours: ${hoursSinceLastInteraction.toFixed(1)}`;
            
            candidates.push({
                phone: session.phone,
                session,
                priority: hasDraftOrder ? priority + DRAFT_ORDER_PRIORITY_BOOST : priority,
                reason
            });
        }
    }
    
    // Sort by priority (highest first)
    return candidates.sort((a, b) => b.priority - a.priority);
}

/**
 * Get minimum hours before follow-up based on session stage
 */
function getMinHoursForFollowUp(session: UserSession): number {
    const stage = session.stage;
    const buyingIntent = session.buyingIntent || 0;
    
    // High buying intent - faster follow-up
    if (buyingIntent > 70) return 4;
    if (buyingIntent > 50) return 8;
    
    // Stage-based timing
    switch (stage) {
        case 'pricing':
        case 'awaiting_payment':
        case 'customizing':
            return 6; // 6 hours
        case 'exploring':
        case 'interest':
            return 12; // 12 hours
        default:
            return 24; // 24 hours
    }
}

/**
 * Calculate follow-up priority (0-100)
 */
function calculateFollowUpPriority(session: UserSession, hoursSinceLastInteraction: number): number {
    let priority = 0;
    
    // Buying intent (0-40 points)
    priority += (session.buyingIntent || 0) * 0.4;
    
    // Stage importance (0-30 points)
    const stageScores: Record<string, number> = {
        'pricing': 30,
        'awaiting_payment': 30,
        'customizing': 25,
        'exploring': 15,
        'interest': 20,
        'initial': 10
    };
    priority += stageScores[session.stage || 'initial'] || 10;
    
    // Time decay (0-30 points) - more time = higher priority, but caps at 72h
    const timeScore = Math.min(30, (hoursSinceLastInteraction / 72) * 30);
    priority += timeScore;
    
    return Math.min(100, priority);
}

/**
 * Process a single follow-up candidate
 */
async function processFollowUpCandidate(candidate: FollowUpCandidate): Promise<{ sent: boolean; reason: string }> {
    const { phone, session } = candidate;
    
    try {
        logger.info('followup', `📤 Procesando seguimiento para ${phone}: ${candidate.reason}`);
        
        // PRIORITY 1: Get stage-specific contextual message (more personalized)
        let message = getContextualFollowUpMessage(session);
        let templateId: string | undefined;
        
        // PRIORITY 2: If no stage-specific message, build personalized follow-up using user data
        if (!message) {
            const currentAttempt = (session.followUpAttempts || 0) + 1;
            
            // Extract user interests for personalization
            const userInterests = {
                contentType: (session as any).contentType || session.conversationData?.selectedType,
                preferredCapacity: (session as any).capacity || session.conversationData?.selectedCapacity,
                priceSensitive: session.buyingIntent < 50,
                urgencyLevel: session.buyingIntent > 70 ? 'high' : 'medium',
                mainObjection: undefined as string | undefined
            };
            
            // Detect main objection from last interactions
            const lastMessages = (session.interactions || [])
                .slice(-5)
                .filter(i => i && i.message) // Filter out invalid interactions
                .map(i => i.message.toLowerCase());
            if (lastMessages.some(m => m.includes('precio') || m.includes('costo') || m.includes('caro'))) {
                userInterests.mainObjection = 'price';
            } else if (lastMessages.some(m => m.includes('envío') || m.includes('entrega') || m.includes('demora'))) {
                userInterests.mainObjection = 'shipping';
            }
            
            const recommendations = {
                shouldMentionPaymentPlan: userInterests.priceSensitive,
                shouldMentionDiscount: session.buyingIntent > 60 && session.buyingIntent < 80,
                recommendedMessageAngle: userInterests.mainObjection === 'price' ? 'value' : 'benefit'
            };
            
            const result = buildPersonalizedFollowUp(
                session,
                currentAttempt as 1 | 2 | 3,
                userInterests,
                recommendations as any
            );
            message = result.message;
            templateId = result.templateId;
            
            logger.info('followup', `✨ Mensaje personalizado generado para ${phone} (intento ${currentAttempt})`);
        } else {
            logger.info('followup', `🎯 Mensaje contextual generado para ${phone} (stage: ${session.stage})`);
        }
        
        // Import and use message history to check for repetition
        try {
            const { wasSimilarMessageRecentlySent, addMessageToHistory } = await import('./messageHistoryAnalyzer');
            
            // Check if similar message was sent recently
            if (wasSimilarMessageRecentlySent(session, message, 24)) {
                logger.warn('followup', `⚠️ Similar message recently sent to ${phone}, skipping`);
                return { sent: false, reason: 'Similar message recently sent' };
            }
        } catch (importError) {
            logger.warn('followup', 'Message history analyzer not available', { error: importError });
        }
        
        // Send message through bot (if available)
        const sent = await sendFollowUpMessageThroughBot(phone, message);
        
        if (sent) {
            // Track message in history
            try {
                const { addMessageToHistory } = await import('./messageHistoryAnalyzer');
                const { markTemplateAsUsed } = await import('./persuasionTemplates');
                
                // Add to message history
                addMessageToHistory(session, message, 'follow_up', {
                    templateId: templateId,
                    category: 'follow_up'
                });
                
                // Mark template as used if available
                if (templateId) {
                    markTemplateAsUsed(session, templateId);
                }
            } catch (importError) {
                logger.warn('followup', 'Could not track message history', { error: importError });
            }
            
            // Increment follow-up attempts
            await incrementFollowUpAttempts(session);
            logger.info('followup', `✅ Seguimiento enviado a ${phone}`);
            return { sent: true, reason: 'Message sent successfully' };
        } else {
            logger.warn('followup', `⚠️ No se pudo enviar seguimiento a ${phone}`);
            return { sent: false, reason: 'Bot not available or message failed' };
        }
    } catch (error) {
        logger.error('followup', `Error procesando seguimiento para ${phone}`, { error });
        return { sent: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Send follow-up message through the OutboundGate
 * All messages now go through centralized gating logic
 */
async function sendFollowUpMessageThroughBot(phone: string, message: string): Promise<boolean> {
    try {
        logger.info('followup', `📤 Sending follow-up to ${phone} via OutboundGate`);
        
        // Validate phone number
        if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
            logger.error('followup', `Invalid phone number: ${phone}`);
            return false;
        }
        
        // Send through OutboundGate with proper context
        const result = await outboundGate.sendMessage(
            phone,
            message,
            {
                phone,
                messageType: 'followup',
                priority: 'normal'
            }
            // No flowDynamic - OutboundGate will use global.botInstance
        );
        
        if (result.sent) {
            logger.info('followup', `✅ Follow-up sent successfully to ${phone}`);
            return true;
        } else {
            logger.warn('followup', `⚠️ Follow-up blocked by OutboundGate for ${phone}: ${result.reason}`, {
                blockedBy: result.blockedBy
            });
            return false;
        }
    } catch (error) {
        // Enhanced error logging
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error('followup', `❌ Error sending follow-up to ${phone}`, {
            phone,
            error: errorMessage,
            stack: errorStack
        });
        
        return false;
    }
}

/**
 * Utility delay function
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stop the follow-up system
 * Called during graceful shutdown to prevent new cycles from starting
 */
let globalSystemState: FollowUpSystemState | null = null;

export const stopFollowUpSystem = () => {
    logger.info('followup', '🛑 Deteniendo sistema de seguimiento');
    
    if (globalSystemState) {
        globalSystemState.isStopping = true;
        logger.info('followup', '✅ Sistema de seguimiento marcado para detención');
    }
};

/**
 * Get the current follow-up system state
 * Returns null if system hasn't been started yet
 */
export const getFollowUpSystemState = (): FollowUpSystemState | null => {
    return globalSystemState;
};
