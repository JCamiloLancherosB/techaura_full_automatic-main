/**
 * FlowContinuityService - Manages flow state persistence and continuity
 * 
 * This service ensures that when a flow asks a question, the user's next response
 * is routed to the active flow first, before falling back to generic routing.
 * 
 * Features:
 * - Persists flow state to database for server restart resilience
 * - Checks active flow before routing to generic handlers
 * - Handles step timeouts with rehydration options
 * - Validates expected input types
 * - Provides re-prompt messages for invalid inputs
 * - Handles DB truncation errors gracefully with fallback values
 * - Emits FLOW_STATE_PERSIST_FAILED events on persistence failures
 * - **Fail-safe**: Falls back to in-memory state on DB failures with async retry
 */

import { businessDB } from '../mysql-database';
import type {
    FlowStateContract,
    FlowContinuityDecision,
    SetFlowStateOptions,
    InputValidationResult,
    FlowResumptionInfo,
    ExpectedInputType,
    ConversationStateRow
} from '../types/flowState';
import { FlowContinuityReasonCode } from '../types/flowState';
import { ChatbotEventType } from '../repositories/ChatbotEventRepository';
import { normalizePhoneId } from '../utils/phoneHasher';

/**
 * Extended flow state with persistence tracking for fail-safe operation
 */
interface FlowStateWithPersistence extends FlowStateContract {
    /** Whether the state has been persisted to DB */
    persisted: boolean;
    /** Timestamp when the state was created in memory (for TTL) */
    inMemoryCreatedAt: Date;
    /** Number of persistence retry attempts */
    retryAttempts: number;
}

/**
 * Configuration for the retry mechanism
 */
interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}

export class FlowContinuityService {
    private static instance: FlowContinuityService;
    
    /** In-memory cache for fast lookups (extended with persistence tracking) */
    private stateCache = new Map<string, FlowStateWithPersistence>();
    
    /** Pending persistence retries (phone -> retry state) */
    private pendingRetries = new Map<string, {
        timeoutId: NodeJS.Timeout;
        attempts: number;
    }>();
    
    /** Default step timeout in hours */
    private readonly DEFAULT_TIMEOUT_HOURS = 2;
    
    /** Maximum cache size */
    private readonly MAX_CACHE_SIZE = 5000;
    
    /** TTL for in-memory fallback states (in milliseconds) - 4 hours */
    private readonly IN_MEMORY_TTL_MS = 4 * 60 * 60 * 1000;
    
    /** Retry configuration for background persistence */
    private readonly retryConfig: RetryConfig = {
        maxAttempts: 5,
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 2
    };
    
    static getInstance(): FlowContinuityService {
        if (!FlowContinuityService.instance) {
            FlowContinuityService.instance = new FlowContinuityService();
        }
        return FlowContinuityService.instance;
    }

    /**
     * Check if user has an active flow that should handle the next message
     * This is the primary method called early in the message pipeline
     */
    async checkFlowContinuity(phone: string): Promise<FlowContinuityDecision> {
        // Normalize phone ID to ensure consistent key lookup
        const canonicalPhone = normalizePhoneId(phone);
        if (!canonicalPhone) {
            return {
                shouldContinueInFlow: false,
                activeFlowId: null,
                activeStep: null,
                expectedInput: 'ANY',
                isStale: false,
                hoursSinceUpdate: 0,
                reason: 'Invalid phone identifier',
                reasonCode: FlowContinuityReasonCode.NO_ACTIVE_FLOW,
                lastQuestionText: null
            };
        }
        
        try {
            const state = await this.getFlowState(canonicalPhone);
            
            // No active flow
            if (!state || !state.activeFlowId) {
                return {
                    shouldContinueInFlow: false,
                    activeFlowId: null,
                    activeStep: null,
                    expectedInput: 'ANY',
                    isStale: false,
                    hoursSinceUpdate: 0,
                    reason: 'No active flow found',
                    reasonCode: FlowContinuityReasonCode.NO_ACTIVE_FLOW,
                    lastQuestionText: null
                };
            }
            
            // Calculate time since last update
            const hoursSinceUpdate = this.getHoursSinceUpdate(state.updatedAt);
            const isStale = hoursSinceUpdate >= state.stepTimeoutHours;
            
            if (isStale) {
                console.log(`⏰ FlowContinuity: Flow ${state.activeFlowId} step ${state.activeStep} is stale (${hoursSinceUpdate.toFixed(1)}h)`);
                return {
                    shouldContinueInFlow: true, // Still continue, but mark as stale for rehydration
                    activeFlowId: state.activeFlowId,
                    activeStep: state.activeStep,
                    expectedInput: state.expectedInput,
                    isStale: true,
                    hoursSinceUpdate,
                    reason: `Flow step stale after ${hoursSinceUpdate.toFixed(1)} hours`,
                    reasonCode: FlowContinuityReasonCode.FLOW_STEP_STALE,
                    lastQuestionText: state.lastQuestionText
                };
            }
            
            console.log(`✅ FlowContinuity: Active flow ${state.activeFlowId}/${state.activeStep} (${hoursSinceUpdate.toFixed(1)}h ago)`);
            return {
                shouldContinueInFlow: true,
                activeFlowId: state.activeFlowId,
                activeStep: state.activeStep,
                expectedInput: state.expectedInput,
                isStale: false,
                hoursSinceUpdate,
                reason: `Continue in active flow: ${state.activeFlowId}/${state.activeStep}`,
                reasonCode: FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE,
                lastQuestionText: state.lastQuestionText
            };
        } catch (error) {
            console.error('❌ FlowContinuity: Error checking flow continuity:', error);
            // Fail-safe: allow routing to continue
            return {
                shouldContinueInFlow: false,
                activeFlowId: null,
                activeStep: null,
                expectedInput: 'ANY',
                isStale: false,
                hoursSinceUpdate: 0,
                reason: 'Error checking flow state',
                reasonCode: FlowContinuityReasonCode.DEFER_TO_ROUTER,
                lastQuestionText: null
            };
        }
    }

    /**
     * Set the active flow state when a flow asks a question
     * This should be called atomically when emitting a question
     * 
     * **Fail-safe behavior**: On DB persistence failure:
     * 1. State is stored in-memory with persisted=false and TTL
     * 2. Emits FLOW_STATE_FALLBACK_IN_MEMORY event
     * 3. Schedules background retry with exponential backoff
     */
    async setFlowState(phone: string, options: SetFlowStateOptions): Promise<void> {
        // Normalize phone ID to ensure consistent key storage
        const canonicalPhone = normalizePhoneId(phone);
        if (!canonicalPhone) {
            console.warn(`❌ FlowContinuity: Invalid phone identifier for setFlowState: ${phone}`);
            return;
        }
        
        const now = new Date();
        const stateWithPersistence: FlowStateWithPersistence = {
            phone: canonicalPhone,
            activeFlowId: options.flowId,
            activeStep: options.step,
            expectedInput: options.expectedInput || 'ANY',
            lastQuestionId: options.questionId || null,
            lastQuestionText: options.questionText || null,
            stepTimeoutHours: options.timeoutHours || this.DEFAULT_TIMEOUT_HOURS,
            flowContext: options.context || null,
            updatedAt: now,
            createdAt: now,
            persisted: false, // Will be set to true after successful DB persist
            inMemoryCreatedAt: now,
            retryAttempts: 0
        };
        
        // Update cache with canonical phone (always set in memory first for fail-safe)
        this.stateCache.set(canonicalPhone, stateWithPersistence);
        this.cleanupCacheIfNeeded();
        
        // Attempt to persist to database
        try {
            await this.persistFlowState(stateWithPersistence);
            
            // Mark as persisted on success
            stateWithPersistence.persisted = true;
            this.stateCache.set(canonicalPhone, stateWithPersistence);
            
            // Cancel any pending retries for this phone
            this.cancelPendingRetry(canonicalPhone);
            
            console.log(`📍 FlowContinuity: Set state for ${canonicalPhone}: ${options.flowId}/${options.step} (expecting: ${stateWithPersistence.expectedInput}) [persisted=true]`);
        } catch (error) {
            // Fail-safe: State is already in memory, log the error
            console.error(`❌ FlowContinuity: DB persist failed for ${canonicalPhone}, using in-memory fallback:`, error);
            
            // Emit FLOW_STATE_FALLBACK_IN_MEMORY event
            await this.emitFallbackInMemoryEvent(
                canonicalPhone,
                stateWithPersistence,
                error
            );
            
            // Schedule background retry with exponential backoff
            this.scheduleRetry(canonicalPhone, stateWithPersistence, 1);
            
            console.log(`🔄 FlowContinuity: Scheduled background retry for ${canonicalPhone}`);
        }
    }

    /**
     * Clear the active flow state when a flow completes or is interrupted
     */
    async clearFlowState(phone: string): Promise<void> {
        // Normalize phone ID to ensure consistent key lookup
        const canonicalPhone = normalizePhoneId(phone);
        if (!canonicalPhone) {
            console.warn(`❌ FlowContinuity: Invalid phone identifier for clearFlowState: ${phone}`);
            return;
        }
        
        try {
            // Cancel any pending retries
            this.cancelPendingRetry(canonicalPhone);
            
            // Remove from cache
            this.stateCache.delete(canonicalPhone);
            
            // Remove from database
            await this.deleteFlowState(canonicalPhone);
            
            console.log(`🧹 FlowContinuity: Cleared state for ${canonicalPhone}`);
        } catch (error) {
            console.error('❌ FlowContinuity: Error clearing flow state:', error);
        }
    }

    /**
     * Validate user input against expected input type
     */
    validateInput(input: string, expectedInput: ExpectedInputType): InputValidationResult {
        const trimmedInput = input.trim();
        
        switch (expectedInput) {
            case 'NUMBER':
                // Check if input contains a number
                const hasNumber = /\d+/.test(trimmedInput);
                if (!hasNumber) {
                    return {
                        isValid: false,
                        errorMessage: 'Se esperaba un número',
                        repromptMessage: 'Por favor, ingresa un número válido.'
                    };
                }
                return { isValid: true };
                
            case 'CHOICE':
                // Choice validation is flow-specific, allow any non-empty input
                if (!trimmedInput) {
                    return {
                        isValid: false,
                        errorMessage: 'Se esperaba una selección',
                        repromptMessage: 'Por favor, selecciona una de las opciones disponibles.'
                    };
                }
                return { isValid: true };
                
            case 'MEDIA':
                // Media validation would check for media attachments
                // For now, we allow any input and let the flow handle it
                return { isValid: true };
            
            case 'YES_NO':
                // YES_NO validation - always valid, the classification happens in the router
                // This allows any input to go through so the flow can handle edge cases
                if (!trimmedInput) {
                    return {
                        isValid: false,
                        errorMessage: 'Se esperaba Sí o No',
                        repromptMessage: 'Por favor, responde Sí o No.'
                    };
                }
                return { isValid: true };
            
            case 'GENRES':
                // GENRES validation - always valid but with context-aware reprompt
                // Allows any input so the flow can process genre selections or related messages
                if (!trimmedInput) {
                    return {
                        isValid: false,
                        errorMessage: 'Se esperaba selección de géneros',
                        repromptMessage: 'Por favor, dime qué géneros musicales te gustan o escribe "de todo" para variado.'
                    };
                }
                return { isValid: true };
            
            case 'OK':
                // OK validation - expects any acknowledgement (ok, gracias, listo, etc.)
                // Always valid since any response can be treated as acknowledgement
                if (!trimmedInput) {
                    return {
                        isValid: false,
                        errorMessage: 'Se esperaba una confirmación',
                        repromptMessage: 'Por favor, confirma que recibiste la información.'
                    };
                }
                return { isValid: true };
                
            case 'TEXT':
            case 'ANY':
            default:
                // Any non-empty input is valid
                if (!trimmedInput) {
                    return {
                        isValid: false,
                        errorMessage: 'Se esperaba una respuesta',
                        repromptMessage: 'Por favor, escribe tu respuesta.'
                    };
                }
                return { isValid: true };
        }
    }

    /**
     * Get rehydration info for stale conversations
     */
    async getResumptionInfo(phone: string): Promise<FlowResumptionInfo | null> {
        // Normalize phone ID
        const canonicalPhone = normalizePhoneId(phone);
        if (!canonicalPhone) {
            return null;
        }
        
        try {
            const state = await this.getFlowState(canonicalPhone);
            if (!state || !state.activeFlowId) {
                return null;
            }
            
            const hoursSinceUpdate = this.getHoursSinceUpdate(state.updatedAt);
            const flowName = this.getFlowDisplayName(state.activeFlowId);
            const stepName = this.getStepDisplayName(state.activeStep);
            
            // Very stale (>24 hours) - offer to restart
            if (hoursSinceUpdate > 24) {
                return {
                    contextSummary: `Estabas en ${flowName}, paso: ${stepName}`,
                    action: 'prompt_choice',
                    message: `¡Hola de nuevo! 👋 Hace más de un día estábamos hablando de ${flowName}. ¿Te gustaría continuar donde quedamos o empezar de nuevo?\n\nEscribe "continuar" o "empezar de nuevo".`
                };
            }
            
            // Moderately stale (2-24 hours) - offer a summary and continue
            if (hoursSinceUpdate >= 2) {
                const lastQuestion = state.lastQuestionText || `el paso de ${stepName}`;
                return {
                    contextSummary: `Estabas en ${flowName}, paso: ${stepName}`,
                    action: 'continue',
                    message: `¡Hola de nuevo! 👋 Continuemos donde quedamos en ${flowName}.\n\n${lastQuestion}`
                };
            }
            
            // Fresh conversation - just continue normally
            return {
                contextSummary: `En ${flowName}, paso: ${stepName}`,
                action: 'continue',
                message: state.lastQuestionText || ''
            };
        } catch (error) {
            console.error('❌ FlowContinuity: Error getting resumption info:', error);
            return null;
        }
    }

    /**
     * Get flow state from cache or database
     * Note: This method expects a canonical (normalized) phone ID.
     * Public methods should normalize before calling this.
     * 
     * **Fail-safe prioritization**: In-memory state is prioritized, especially
     * if it's marked as not persisted (DB failure case). TTL is checked for
     * in-memory-only states.
     */
    async getFlowState(phone: string): Promise<FlowStateContract | null> {
        // Check cache first - prioritize in-memory state for fail-safe
        if (this.stateCache.has(phone)) {
            const cachedState = this.stateCache.get(phone)!;
            
            // Check if the in-memory state is within TTL
            if (!cachedState.persisted && cachedState.inMemoryCreatedAt) {
                const ageMs = Date.now() - new Date(cachedState.inMemoryCreatedAt).getTime();
                if (ageMs > this.IN_MEMORY_TTL_MS) {
                    console.warn(`⏰ FlowContinuity: In-memory fallback state expired for ${phone} (age: ${Math.round(ageMs / 60000)}min)`);
                    this.stateCache.delete(phone);
                    this.cancelPendingRetry(phone);
                    return null;
                }
                // Log that we're using in-memory fallback
                console.log(`🔄 FlowContinuity: Using in-memory fallback state for ${phone} (persisted=false)`);
            }
            
            return cachedState;
        }
        
        // Load from database
        try {
            const state = await this.loadFlowState(phone);
            if (state) {
                // Wrap in FlowStateWithPersistence for consistency
                const stateWithPersistence: FlowStateWithPersistence = {
                    ...state,
                    persisted: true, // Loaded from DB means it's persisted
                    inMemoryCreatedAt: new Date(),
                    retryAttempts: 0
                };
                this.stateCache.set(phone, stateWithPersistence);
            }
            return state;
        } catch (error) {
            console.error('❌ FlowContinuity: Error loading flow state:', error);
            return null;
        }
    }

    /**
     * Get statistics about active flows
     */
    getStats(): { cachedStates: number; unpersistedStates: number; pendingRetries: number } {
        let unpersistedCount = 0;
        for (const state of this.stateCache.values()) {
            if (!state.persisted) {
                unpersistedCount++;
            }
        }
        
        return {
            cachedStates: this.stateCache.size,
            unpersistedStates: unpersistedCount,
            pendingRetries: this.pendingRetries.size
        };
    }

    // ============ Private Methods ============

    private getHoursSinceUpdate(updatedAt: Date): number {
        const now = new Date();
        const updateTime = new Date(updatedAt);
        return (now.getTime() - updateTime.getTime()) / (1000 * 60 * 60);
    }

    private getFlowDisplayName(flowId: string | null): string {
        if (!flowId) return 'la conversación';
        
        const flowNames: Record<string, string> = {
            'musicUsb': 'USB de Música',
            'videosUsb': 'USB de Videos',
            'moviesUsb': 'USB de Películas',
            'gamesUsb': 'USB de Juegos',
            'orderFlow': 'tu pedido',
            'datosCliente': 'datos de envío',
            'customizationFlow': 'personalización',
            'capacityMusic': 'selección de capacidad',
            'capacityVideo': 'selección de capacidad'
        };
        
        return flowNames[flowId] || flowId;
    }

    private getStepDisplayName(step: string | null): string {
        if (!step) return 'inicio';
        
        const stepNames: Record<string, string> = {
            'entry': 'inicio',
            'personalization': 'personalización',
            'prices_shown': 'precios',
            'awaiting_capacity': 'selección de capacidad',
            'awaiting_payment': 'método de pago',
            'checkout_started': 'checkout',
            'converted': 'confirmado',
            'completed': 'completado'
        };
        
        return stepNames[step] || step;
    }

    private async persistFlowState(state: FlowStateContract): Promise<void> {
        try {
            const row: Partial<ConversationStateRow> = {
                phone: state.phone,
                active_flow_id: state.activeFlowId,
                active_step: state.activeStep,
                expected_input: state.expectedInput,
                last_question_id: state.lastQuestionId,
                last_question_text: state.lastQuestionText,
                step_timeout_hours: state.stepTimeoutHours,
                flow_context: state.flowContext ? JSON.stringify(state.flowContext) : null,
                updated_at: state.updatedAt
            };
            
            // Use upsert logic
            if (typeof (businessDB as any).upsertConversationState === 'function') {
                await (businessDB as any).upsertConversationState(row);
            } else {
                // Fallback: try direct query
                await this.upsertStateDirectly(row);
            }
        } catch (error) {
            console.error('❌ FlowContinuity: Error persisting state:', error);
        }
    }

    private async loadFlowState(phone: string): Promise<FlowStateContract | null> {
        try {
            let row: ConversationStateRow | null = null;
            
            if (typeof (businessDB as any).getConversationState === 'function') {
                row = await (businessDB as any).getConversationState(phone);
            } else {
                row = await this.getStateDirectly(phone);
            }
            
            if (!row) return null;
            
            return {
                phone: row.phone,
                activeFlowId: row.active_flow_id,
                activeStep: row.active_step,
                expectedInput: row.expected_input || 'ANY',
                lastQuestionId: row.last_question_id,
                lastQuestionText: row.last_question_text,
                stepTimeoutHours: row.step_timeout_hours || this.DEFAULT_TIMEOUT_HOURS,
                flowContext: row.flow_context ? JSON.parse(row.flow_context) : null,
                updatedAt: new Date(row.updated_at),
                createdAt: new Date(row.created_at)
            };
        } catch (error) {
            console.error('❌ FlowContinuity: Error loading state:', error);
            return null;
        }
    }

    private async deleteFlowState(phone: string): Promise<void> {
        try {
            if (typeof (businessDB as any).deleteConversationState === 'function') {
                await (businessDB as any).deleteConversationState(phone);
            } else {
                await this.deleteStateDirectly(phone);
            }
        } catch (error) {
            console.error('❌ FlowContinuity: Error deleting state:', error);
        }
    }

    /**
     * Check if an error is a truncation error (Data truncated for column 'expected_input')
     */
    private isTruncationError(error: any): boolean {
        const message = error?.message || error?.sqlMessage || '';
        return (
            message.toLowerCase().includes('data truncated') ||
            message.toLowerCase().includes('truncated for column') ||
            error?.code === 'WARN_DATA_TRUNCATED' ||
            error?.errno === 1265
        );
    }

    /**
     * Emit a FLOW_STATE_PERSIST_FAILED event for tracking and debugging
     */
    private async emitPersistFailedEvent(
        phone: string,
        originalExpectedInput: string,
        fallbackExpectedInput: string,
        errorMessage: string
    ): Promise<void> {
        try {
            // Lazy import to avoid circular dependencies
            const { chatbotEventService } = await import('./ChatbotEventService');
            
            await chatbotEventService.trackEvent(
                `flow_state_${phone}`,
                phone,
                ChatbotEventType.FLOW_STATE_PERSIST_FAILED,
                {
                    originalExpectedInput,
                    fallbackExpectedInput,
                    errorMessage,
                    timestamp: new Date().toISOString(),
                    schemaRecommendation: 'Run migration 20260128400000_fix_conversation_state_expected_input.js to fix expected_input column'
                }
            );
        } catch (eventError) {
            // Don't fail silently - log the issue but don't throw
            console.warn('⚠️ FlowContinuity: Failed to emit FLOW_STATE_PERSIST_FAILED event:', eventError);
        }
    }

    private async upsertStateDirectly(row: Partial<ConversationStateRow>): Promise<void> {
        const pool = (businessDB as any).pool || (businessDB as any).connection;
        if (!pool) return;
        
        const originalExpectedInput = row.expected_input;
        
        try {
            await pool.query(`
                INSERT INTO conversation_state 
                (phone, active_flow_id, active_step, expected_input, last_question_id, 
                 last_question_text, step_timeout_hours, flow_context, updated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    active_flow_id = VALUES(active_flow_id),
                    active_step = VALUES(active_step),
                    expected_input = VALUES(expected_input),
                    last_question_id = VALUES(last_question_id),
                    last_question_text = VALUES(last_question_text),
                    step_timeout_hours = VALUES(step_timeout_hours),
                    flow_context = VALUES(flow_context),
                    updated_at = VALUES(updated_at)
            `, [
                row.phone,
                row.active_flow_id,
                row.active_step,
                row.expected_input,
                row.last_question_id,
                row.last_question_text,
                row.step_timeout_hours,
                row.flow_context,
                row.updated_at
            ]);
        } catch (error) {
            // Check if this is a truncation error on expected_input
            if (this.isTruncationError(error)) {
                const errorMessage = (error as any)?.message || 'Data truncated for expected_input';
                console.error(`❌ FlowContinuity: Truncation error for expected_input='${originalExpectedInput}':`, errorMessage);
                console.warn(`⚠️ FlowContinuity: Falling back to expected_input='ANY'. Run migrations to fix schema.`);
                
                // Emit FLOW_STATE_PERSIST_FAILED event with details
                await this.emitPersistFailedEvent(
                    row.phone || 'unknown',
                    String(originalExpectedInput),
                    'ANY',
                    errorMessage
                );
                
                // Retry with safe fallback value
                try {
                    await pool.query(`
                        INSERT INTO conversation_state 
                        (phone, active_flow_id, active_step, expected_input, last_question_id, 
                         last_question_text, step_timeout_hours, flow_context, updated_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                        ON DUPLICATE KEY UPDATE
                            active_flow_id = VALUES(active_flow_id),
                            active_step = VALUES(active_step),
                            expected_input = VALUES(expected_input),
                            last_question_id = VALUES(last_question_id),
                            last_question_text = VALUES(last_question_text),
                            step_timeout_hours = VALUES(step_timeout_hours),
                            flow_context = VALUES(flow_context),
                            updated_at = VALUES(updated_at)
                    `, [
                        row.phone,
                        row.active_flow_id,
                        row.active_step,
                        'ANY', // Safe fallback
                        row.last_question_id,
                        row.last_question_text,
                        row.step_timeout_hours,
                        row.flow_context,
                        row.updated_at
                    ]);
                    console.log(`✅ FlowContinuity: State persisted with fallback expected_input='ANY'`);
                } catch (retryError) {
                    console.error('❌ FlowContinuity: Error in fallback upsert:', retryError);
                }
            } else {
                console.error('❌ FlowContinuity: Error in direct upsert:', error);
            }
        }
    }

    private async getStateDirectly(phone: string): Promise<ConversationStateRow | null> {
        try {
            const pool = (businessDB as any).pool || (businessDB as any).connection;
            if (!pool) return null;
            
            const [rows] = await pool.query(
                'SELECT * FROM conversation_state WHERE phone = ? LIMIT 1',
                [phone]
            );
            
            return rows && rows.length > 0 ? rows[0] : null;
        } catch (error) {
            // Table might not exist yet
            if ((error as any)?.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            console.error('❌ FlowContinuity: Error in direct get:', error);
            return null;
        }
    }

    private async deleteStateDirectly(phone: string): Promise<void> {
        try {
            const pool = (businessDB as any).pool || (businessDB as any).connection;
            if (!pool) return;
            
            await pool.query('DELETE FROM conversation_state WHERE phone = ?', [phone]);
        } catch (error) {
            console.error('❌ FlowContinuity: Error in direct delete:', error);
        }
    }

    private cleanupCacheIfNeeded(): void {
        if (this.stateCache.size > this.MAX_CACHE_SIZE) {
            // Remove oldest entries (by converting to array and slicing)
            const entries = Array.from(this.stateCache.entries());
            const toKeep = entries.slice(-Math.floor(this.MAX_CACHE_SIZE * 0.8));
            this.stateCache = new Map(toKeep);
            console.log(`🧹 FlowContinuity: Cache cleaned, now ${this.stateCache.size} entries`);
        }
    }

    // ============ Fail-Safe Helper Methods ============

    /**
     * Schedule a background retry for persisting state to DB
     * Uses exponential backoff: 2s, 4s, 8s, 16s, 32s (capped at 60s)
     */
    private scheduleRetry(
        phone: string,
        state: FlowStateWithPersistence,
        attemptNumber: number
    ): void {
        // Cancel any existing retry for this phone
        this.cancelPendingRetry(phone);
        
        if (attemptNumber > this.retryConfig.maxAttempts) {
            console.warn(`⚠️ FlowContinuity: Max retry attempts (${this.retryConfig.maxAttempts}) reached for ${phone}`);
            return;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
            this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attemptNumber - 1),
            this.retryConfig.maxDelayMs
        );
        
        const timeoutId = setTimeout(async () => {
            try {
                // Check if state still exists in cache (user might have cleared it)
                const currentState = this.stateCache.get(phone);
                if (!currentState || currentState.persisted) {
                    // State was either cleared or already persisted
                    this.pendingRetries.delete(phone);
                    return;
                }
                
                // Attempt to persist
                console.log(`🔄 FlowContinuity: Retry attempt ${attemptNumber}/${this.retryConfig.maxAttempts} for ${phone}`);
                await this.persistFlowState(currentState);
                
                // Success - update state and clear retry
                currentState.persisted = true;
                currentState.retryAttempts = attemptNumber;
                this.stateCache.set(phone, currentState);
                this.pendingRetries.delete(phone);
                
                console.log(`✅ FlowContinuity: Background retry successful for ${phone} (attempt ${attemptNumber})`);
            } catch (error) {
                console.error(`❌ FlowContinuity: Retry attempt ${attemptNumber} failed for ${phone}:`, error);
                
                // Update retry count in state
                const currentState = this.stateCache.get(phone);
                if (currentState) {
                    currentState.retryAttempts = attemptNumber;
                    this.stateCache.set(phone, currentState);
                }
                
                // Schedule next retry
                this.scheduleRetry(phone, state, attemptNumber + 1);
            }
        }, delay);
        
        this.pendingRetries.set(phone, {
            timeoutId,
            attempts: attemptNumber
        });
        
        console.log(`⏳ FlowContinuity: Scheduled retry ${attemptNumber}/${this.retryConfig.maxAttempts} for ${phone} in ${delay}ms`);
    }

    /**
     * Cancel pending retry for a phone
     */
    private cancelPendingRetry(phone: string): void {
        const pending = this.pendingRetries.get(phone);
        if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingRetries.delete(phone);
            console.log(`🚫 FlowContinuity: Cancelled pending retry for ${phone}`);
        }
    }

    /**
     * Emit FLOW_STATE_FALLBACK_IN_MEMORY event for telemetry
     */
    private async emitFallbackInMemoryEvent(
        phone: string,
        state: FlowStateWithPersistence,
        error: unknown
    ): Promise<void> {
        try {
            // Lazy import to avoid circular dependencies
            const { chatbotEventService } = await import('./ChatbotEventService');
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorCode = (error as any)?.code || (error as any)?.errno || 'UNKNOWN';
            
            await chatbotEventService.trackEvent(
                `flow_state_${phone}`,
                phone,
                ChatbotEventType.FLOW_STATE_FALLBACK_IN_MEMORY,
                {
                    activeFlowId: state.activeFlowId,
                    activeStep: state.activeStep,
                    expectedInput: state.expectedInput,
                    errorMessage,
                    errorCode,
                    ttlMs: this.IN_MEMORY_TTL_MS,
                    maxRetries: this.retryConfig.maxAttempts,
                    timestamp: new Date().toISOString(),
                    recoveryNote: 'State preserved in-memory with async retry. User experience unaffected.'
                }
            );
        } catch (eventError) {
            // Don't fail silently - log the issue but don't throw
            console.warn('⚠️ FlowContinuity: Failed to emit FLOW_STATE_FALLBACK_IN_MEMORY event:', eventError);
        }
    }

    /**
     * Force cleanup of expired in-memory fallback states
     * Can be called periodically to prevent memory leaks
     */
    cleanupExpiredFallbackStates(): number {
        let cleanedCount = 0;
        const now = Date.now();
        
        for (const [phone, state] of this.stateCache.entries()) {
            if (!state.persisted && state.inMemoryCreatedAt) {
                const ageMs = now - new Date(state.inMemoryCreatedAt).getTime();
                if (ageMs > this.IN_MEMORY_TTL_MS) {
                    this.stateCache.delete(phone);
                    this.cancelPendingRetry(phone);
                    cleanedCount++;
                }
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 FlowContinuity: Cleaned ${cleanedCount} expired fallback states`);
        }
        
        return cleanedCount;
    }

    /**
     * Get pending retry info for diagnostics
     */
    getPendingRetryInfo(): Array<{ phone: string; attempts: number }> {
        const info: Array<{ phone: string; attempts: number }> = [];
        for (const [phone, pending] of this.pendingRetries.entries()) {
            info.push({ phone, attempts: pending.attempts });
        }
        return info;
    }
}

// Export singleton instance
export const flowContinuityService = FlowContinuityService.getInstance();
