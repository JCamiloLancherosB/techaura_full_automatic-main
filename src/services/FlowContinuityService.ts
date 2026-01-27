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

export class FlowContinuityService {
    private static instance: FlowContinuityService;
    
    /** In-memory cache for fast lookups */
    private stateCache = new Map<string, FlowStateContract>();
    
    /** Default step timeout in hours */
    private readonly DEFAULT_TIMEOUT_HOURS = 2;
    
    /** Maximum cache size */
    private readonly MAX_CACHE_SIZE = 5000;
    
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
        try {
            const state = await this.getFlowState(phone);
            
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
     */
    async setFlowState(phone: string, options: SetFlowStateOptions): Promise<void> {
        try {
            const now = new Date();
            const state: FlowStateContract = {
                phone,
                activeFlowId: options.flowId,
                activeStep: options.step,
                expectedInput: options.expectedInput || 'ANY',
                lastQuestionId: options.questionId || null,
                lastQuestionText: options.questionText || null,
                stepTimeoutHours: options.timeoutHours || this.DEFAULT_TIMEOUT_HOURS,
                flowContext: options.context || null,
                updatedAt: now,
                createdAt: now
            };
            
            // Update cache
            this.stateCache.set(phone, state);
            this.cleanupCacheIfNeeded();
            
            // Persist to database
            await this.persistFlowState(state);
            
            console.log(`📍 FlowContinuity: Set state for ${phone}: ${options.flowId}/${options.step} (expecting: ${state.expectedInput})`);
        } catch (error) {
            console.error('❌ FlowContinuity: Error setting flow state:', error);
            // Continue without throwing - don't block the flow
        }
    }

    /**
     * Clear the active flow state when a flow completes or is interrupted
     */
    async clearFlowState(phone: string): Promise<void> {
        try {
            // Remove from cache
            this.stateCache.delete(phone);
            
            // Remove from database
            await this.deleteFlowState(phone);
            
            console.log(`🧹 FlowContinuity: Cleared state for ${phone}`);
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
        try {
            const state = await this.getFlowState(phone);
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
     */
    async getFlowState(phone: string): Promise<FlowStateContract | null> {
        // Check cache first
        if (this.stateCache.has(phone)) {
            return this.stateCache.get(phone)!;
        }
        
        // Load from database
        try {
            const state = await this.loadFlowState(phone);
            if (state) {
                this.stateCache.set(phone, state);
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
    getStats(): { cachedStates: number; } {
        return {
            cachedStates: this.stateCache.size
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

    private async upsertStateDirectly(row: Partial<ConversationStateRow>): Promise<void> {
        try {
            const pool = (businessDB as any).pool || (businessDB as any).connection;
            if (!pool) return;
            
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
            console.error('❌ FlowContinuity: Error in direct upsert:', error);
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
}

// Export singleton instance
export const flowContinuityService = FlowContinuityService.getInstance();
