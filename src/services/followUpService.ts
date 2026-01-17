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

interface FollowUpSystemState {
    isRunning: boolean;
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
        lastExecution: 0,
        errorCount: 0,
        successCount: 0,
        skipCount: 0,
        lastError: null
    };

    /**
     * Main follow-up execution cycle
     * Runs every 10 minutes to identify and process follow-up candidates
     */
    const executeFollowUpCycle = async () => {
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
                    if (sent >= 10) {
                        logger.info('followup', '⚠️ Límite de 10 mensajes por ciclo alcanzado');
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
 */
async function getAllActiveSessions(): Promise<UserSession[]> {
    try {
        // Try to get from global cache first
        if (global.userSessions && global.userSessions.size > 0) {
            return Array.from(global.userSessions.values());
        }
        
        // Fall back to database
        if (businessDB && typeof (businessDB as any).getAllSessions === 'function') {
            return await (businessDB as any).getAllSessions();
        }
        
        // If getAllSessions doesn't exist, return empty array
        // In production, this would be implemented in businessDB
        console.warn('⚠️ getAllSessions not implemented in businessDB');
        return [];
    } catch (error) {
        logger.error('followup', 'Error obteniendo sesiones activas', { error });
        return [];
    }
}

/**
 * Identify which users should receive follow-ups
 */
async function identifyFollowUpCandidates(sessions: UserSession[]): Promise<FollowUpCandidate[]> {
    const candidates: FollowUpCandidate[] = [];
    const now = Date.now();
    
    for (const session of sessions) {
        // Skip if no phone
        if (!session.phone) continue;
        
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
        
        // Only add if priority is significant
        if (priority > 30) {
            candidates.push({
                phone: session.phone,
                session,
                priority,
                reason: `Stage: ${session.stage}, BuyingIntent: ${session.buyingIntent || 0}%, Hours: ${hoursSinceLastInteraction.toFixed(1)}`
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
        
        // Get contextual message
        let message = getContextualFollowUpMessage(session);
        let templateId: string | undefined;
        
        // If no contextual message, build personalized one
        if (!message) {
            const currentAttempt = (session.followUpAttempts || 0) + 1;
            const result = buildPersonalizedFollowUp(
                session,
                currentAttempt as 1 | 2 | 3,
                session.interests || [],
                { recommendedMessageAngle: 'value' } as any
            );
            message = result.message;
            templateId = result.templateId;
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
 * Send follow-up message through the bot instance
 */
async function sendFollowUpMessageThroughBot(phone: string, message: string): Promise<boolean> {
    try {
        // Check if bot instance is available
        if (!global.botInstance || typeof global.botInstance.sendMessage !== 'function') {
            logger.warn('followup', 'Bot instance not available');
            return false;
        }
        
        // Ensure phone has proper JID format
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        
        // Send message with timeout
        const sendPromise = global.botInstance.sendMessage(jid, { text: message });
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        await Promise.race([sendPromise, timeoutPromise]);
        return true;
    } catch (error) {
        logger.error('followup', `Error enviando mensaje a ${phone}`, { error });
        return false;
    }
}

/**
 * Utility delay function
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
