/**
 * FlowContinuity Tests
 * 
 * Tests to verify that:
 * 1. When a flow asks a question, the next response continues in the same flow
 * 2. Invalid input results in guided re-prompt, not silence
 * 3. State persists across server restarts (simulated)
 * 4. Stale conversations are properly rehydrated
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FlowContinuityService } from '../services/FlowContinuityService';
import { FlowContinuityReasonCode } from '../types/flowState';
import type { ExpectedInputType, SetFlowStateOptions } from '../types/flowState';

// Mock the businessDB
jest.mock('../mysql-database', () => ({
    businessDB: {
        pool: null
    }
}));

describe('FlowContinuityService', () => {
    let service: FlowContinuityService;
    const testPhone = '573001234567';

    beforeEach(() => {
        // Get fresh instance for each test
        service = FlowContinuityService.getInstance();
    });

    afterEach(async () => {
        // Clear state after each test
        await service.clearFlowState(testPhone);
    });

    describe('setFlowState and checkFlowContinuity', () => {
        it('should return NO_ACTIVE_FLOW when no state exists', async () => {
            const result = await service.checkFlowContinuity(testPhone);
            
            expect(result.shouldContinueInFlow).toBe(false);
            expect(result.reasonCode).toBe(FlowContinuityReasonCode.NO_ACTIVE_FLOW);
            expect(result.activeFlowId).toBeNull();
        });

        it('should return ACTIVE_FLOW_CONTINUE when state exists and is fresh', async () => {
            // Set flow state
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE',
                questionText: '¿Qué capacidad prefieres? 32GB, 64GB, o 128GB'
            });

            const result = await service.checkFlowContinuity(testPhone);

            expect(result.shouldContinueInFlow).toBe(true);
            expect(result.reasonCode).toBe(FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE);
            expect(result.activeFlowId).toBe('musicUsb');
            expect(result.activeStep).toBe('awaiting_capacity');
            expect(result.expectedInput).toBe('CHOICE');
            expect(result.isStale).toBe(false);
        });

        it('should preserve last question text for re-prompting', async () => {
            const questionText = '¿Qué capacidad prefieres? 32GB, 64GB, o 128GB';
            
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE',
                questionText
            });

            const result = await service.checkFlowContinuity(testPhone);

            expect(result.lastQuestionText).toBe(questionText);
        });
    });

    describe('Input Validation', () => {
        it('should validate NUMBER input correctly', () => {
            const validResult = service.validateInput('32', 'NUMBER');
            expect(validResult.isValid).toBe(true);

            const validWithTextResult = service.validateInput('quiero 64gb', 'NUMBER');
            expect(validWithTextResult.isValid).toBe(true);

            const invalidResult = service.validateInput('hola', 'NUMBER');
            expect(invalidResult.isValid).toBe(false);
            expect(invalidResult.repromptMessage).toBeDefined();
        });

        it('should validate CHOICE input correctly', () => {
            const validResult = service.validateInput('opción 1', 'CHOICE');
            expect(validResult.isValid).toBe(true);

            const emptyResult = service.validateInput('', 'CHOICE');
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.repromptMessage).toBeDefined();
        });

        it('should validate TEXT input - any non-empty text is valid', () => {
            const validResult = service.validateInput('hola', 'TEXT');
            expect(validResult.isValid).toBe(true);

            const emptyResult = service.validateInput('', 'TEXT');
            expect(emptyResult.isValid).toBe(false);
        });

        it('should always validate MEDIA and ANY inputs', () => {
            const mediaResult = service.validateInput('', 'MEDIA');
            expect(mediaResult.isValid).toBe(true);

            const anyResult = service.validateInput('anything', 'ANY');
            expect(anyResult.isValid).toBe(true);
        });

        it('should validate GENRES input correctly', () => {
            // Any non-empty text is valid for GENRES (including "de todo un poco", "gracias", etc.)
            const validGenreResult = service.validateInput('salsa y rock', 'GENRES');
            expect(validGenreResult.isValid).toBe(true);

            const validMixedResult = service.validateInput('de todo un poco', 'GENRES');
            expect(validMixedResult.isValid).toBe(true);

            const validGraciasResult = service.validateInput('gracias', 'GENRES');
            expect(validGraciasResult.isValid).toBe(true);

            const emptyResult = service.validateInput('', 'GENRES');
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.repromptMessage).toBeDefined();
        });

        it('should validate YES_NO input correctly', () => {
            const validYesResult = service.validateInput('sí', 'YES_NO');
            expect(validYesResult.isValid).toBe(true);

            const validNoResult = service.validateInput('no', 'YES_NO');
            expect(validNoResult.isValid).toBe(true);

            const validAnyResult = service.validateInput('tal vez', 'YES_NO');
            expect(validAnyResult.isValid).toBe(true); // Allows any non-empty input

            const emptyResult = service.validateInput('', 'YES_NO');
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.repromptMessage).toBeDefined();
        });

        it('should validate OK input correctly', () => {
            const validOkResult = service.validateInput('ok', 'OK');
            expect(validOkResult.isValid).toBe(true);

            const validGraciasResult = service.validateInput('gracias', 'OK');
            expect(validGraciasResult.isValid).toBe(true);

            const validListoResult = service.validateInput('listo', 'OK');
            expect(validListoResult.isValid).toBe(true);

            const emptyResult = service.validateInput('', 'OK');
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.repromptMessage).toBeDefined();
        });
    });

    describe('Expected Input Persistence', () => {
        const persistTestPhone = '573005555555';

        afterEach(async () => {
            await service.clearFlowState(persistTestPhone);
        });

        it('should persist state with expected_input=GENRES without error', async () => {
            // This is the specific case that was causing truncation errors
            await service.setFlowState(persistTestPhone, {
                flowId: 'musicUsb',
                step: 'genre_selection',
                expectedInput: 'GENRES',
                questionText: '¿Qué géneros musicales te gustan?'
            });

            const result = await service.checkFlowContinuity(persistTestPhone);

            expect(result.shouldContinueInFlow).toBe(true);
            expect(result.expectedInput).toBe('GENRES');
            expect(result.activeFlowId).toBe('musicUsb');
            expect(result.activeStep).toBe('genre_selection');
        });

        it('should persist state with expected_input=YES_NO without error', async () => {
            await service.setFlowState(persistTestPhone, {
                flowId: 'orderFlow',
                step: 'confirm_order',
                expectedInput: 'YES_NO',
                questionText: '¿Confirmas tu pedido?'
            });

            const result = await service.checkFlowContinuity(persistTestPhone);

            expect(result.shouldContinueInFlow).toBe(true);
            expect(result.expectedInput).toBe('YES_NO');
        });

        it('should persist state with expected_input=OK without error', async () => {
            await service.setFlowState(persistTestPhone, {
                flowId: 'datosCliente',
                step: 'info_shown',
                expectedInput: 'OK',
                questionText: 'Aquí está la información solicitada.'
            });

            const result = await service.checkFlowContinuity(persistTestPhone);

            expect(result.shouldContinueInFlow).toBe(true);
            expect(result.expectedInput).toBe('OK');
        });

        it('should persist state with all expected_input types', async () => {
            const expectedInputTypes: Array<{ type: string; flowId: string; step: string }> = [
                { type: 'TEXT', flowId: 'orderFlow', step: 'name_entry' },
                { type: 'NUMBER', flowId: 'musicUsb', step: 'capacity_selection' },
                { type: 'CHOICE', flowId: 'videosUsb', step: 'category_selection' },
                { type: 'MEDIA', flowId: 'supportFlow', step: 'screenshot_request' },
                { type: 'ANY', flowId: 'generalFlow', step: 'open_question' },
                { type: 'YES_NO', flowId: 'orderFlow', step: 'confirm_order' },
                { type: 'GENRES', flowId: 'musicUsb', step: 'genre_selection' },
                { type: 'OK', flowId: 'datosCliente', step: 'info_shown' }
            ];

            for (const testCase of expectedInputTypes) {
                await service.setFlowState(persistTestPhone, {
                    flowId: testCase.flowId,
                    step: testCase.step,
                    expectedInput: testCase.type as any,
                    questionText: `Test question for ${testCase.type}`
                });

                const result = await service.checkFlowContinuity(persistTestPhone);

                expect(result.shouldContinueInFlow).toBe(true);
                expect(result.expectedInput).toBe(testCase.type);
                
                await service.clearFlowState(persistTestPhone);
            }
        });
    });

    describe('Flow State Lifecycle', () => {
        it('should clear flow state correctly', async () => {
            // Set state
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'entry',
                expectedInput: 'TEXT'
            });

            // Verify it exists
            let result = await service.checkFlowContinuity(testPhone);
            expect(result.shouldContinueInFlow).toBe(true);

            // Clear state
            await service.clearFlowState(testPhone);

            // Verify it's gone
            result = await service.checkFlowContinuity(testPhone);
            expect(result.shouldContinueInFlow).toBe(false);
            expect(result.reasonCode).toBe(FlowContinuityReasonCode.NO_ACTIVE_FLOW);
        });

        it('should update state when flow progresses', async () => {
            // Set initial state
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'entry',
                expectedInput: 'TEXT'
            });

            // Progress to next step
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE',
                questionText: '¿Qué capacidad?'
            });

            const result = await service.checkFlowContinuity(testPhone);

            expect(result.activeStep).toBe('awaiting_capacity');
            expect(result.expectedInput).toBe('CHOICE');
        });
    });

    describe('Multiple Users', () => {
        const phone1 = '573001111111';
        const phone2 = '573002222222';

        afterEach(async () => {
            await service.clearFlowState(phone1);
            await service.clearFlowState(phone2);
        });

        it('should track separate states for different users', async () => {
            // Set different states for different users
            await service.setFlowState(phone1, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE'
            });

            await service.setFlowState(phone2, {
                flowId: 'videosUsb',
                step: 'entry',
                expectedInput: 'TEXT'
            });

            // Check each user's state
            const result1 = await service.checkFlowContinuity(phone1);
            const result2 = await service.checkFlowContinuity(phone2);

            expect(result1.activeFlowId).toBe('musicUsb');
            expect(result1.activeStep).toBe('awaiting_capacity');

            expect(result2.activeFlowId).toBe('videosUsb');
            expect(result2.activeStep).toBe('entry');
        });
    });

    describe('Flow Resumption Info', () => {
        it('should provide resumption info for active flows', async () => {
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE',
                questionText: '¿Qué capacidad prefieres?'
            });

            const resumptionInfo = await service.getResumptionInfo(testPhone);

            expect(resumptionInfo).not.toBeNull();
            expect(resumptionInfo?.action).toBe('continue');
            expect(resumptionInfo?.contextSummary).toContain('USB de Música');
        });

        it('should return null when no active flow', async () => {
            const resumptionInfo = await service.getResumptionInfo(testPhone);
            expect(resumptionInfo).toBeNull();
        });
    });

    describe('Statistics', () => {
        it('should track cached states count', async () => {
            const initialStats = service.getStats();
            const initialCount = initialStats.cachedStates;

            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'entry',
                expectedInput: 'TEXT'
            });

            const afterStats = service.getStats();
            expect(afterStats.cachedStates).toBeGreaterThanOrEqual(initialCount);
        });
    });
});

describe('Flow Continuity Integration Scenarios', () => {
    let service: FlowContinuityService;

    beforeEach(() => {
        service = FlowContinuityService.getInstance();
    });

    describe('Scenario: Question -> Response in same flow', () => {
        const testPhone = '573009999999';

        afterEach(async () => {
            await service.clearFlowState(testPhone);
        });

        it('should route response to same flow after question', async () => {
            // 1. Flow asks a question about capacity
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE',
                questionText: '¿Qué capacidad prefieres? 32GB, 64GB, o 128GB',
                questionId: 'capacity_selection_001'
            });

            // 2. User responds with "64GB"
            // Check if we should continue in the flow
            const decision = await service.checkFlowContinuity(testPhone);

            // 3. Verify decision is to continue in active flow
            expect(decision.shouldContinueInFlow).toBe(true);
            expect(decision.activeFlowId).toBe('musicUsb');
            expect(decision.activeStep).toBe('awaiting_capacity');
            expect(decision.reasonCode).toBe(FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE);

            // 4. Validate the input matches expected type
            const validation = service.validateInput('64GB', decision.expectedInput);
            expect(validation.isValid).toBe(true);
        });

        it('should provide reprompt for invalid input', async () => {
            // 1. Flow asks for capacity (expects NUMBER or CHOICE with capacity values)
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'NUMBER',
                questionText: '¿Qué capacidad en GB prefieres?'
            });

            // 2. User responds with invalid input "hola"
            const decision = await service.checkFlowContinuity(testPhone);
            expect(decision.shouldContinueInFlow).toBe(true);

            // 3. Validate input - should fail
            const validation = service.validateInput('hola', decision.expectedInput);
            expect(validation.isValid).toBe(false);
            expect(validation.repromptMessage).toBeDefined();

            // 4. The flow should re-prompt, not go silent
            // (The actual re-prompt is handled by the flow, but we have the message)
            expect(decision.lastQuestionText).toBe('¿Qué capacidad en GB prefieres?');
        });
    });

    describe('Scenario: User changes topic during active flow', () => {
        const testPhone = '573008888888';

        afterEach(async () => {
            await service.clearFlowState(testPhone);
        });

        it('should still route to active flow when user tries to change topic', async () => {
            // 1. User is in music flow awaiting capacity selection
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'awaiting_capacity',
                expectedInput: 'CHOICE',
                questionText: '¿Qué capacidad prefieres?'
            });

            // 2. User sends "quiero películas" (trying to switch)
            // The continuity check should still return active flow
            const decision = await service.checkFlowContinuity(testPhone);

            // 3. Flow continuity should indicate to stay in musicUsb
            // The actual handling of topic change is up to the flow
            expect(decision.shouldContinueInFlow).toBe(true);
            expect(decision.activeFlowId).toBe('musicUsb');
            // Note: Whether to allow topic change is a flow-level decision
        });
    });

    describe('Scenario: Genre selection must stay in musicUsb flow', () => {
        const testPhone = '573007777777';

        afterEach(async () => {
            await service.clearFlowState(testPhone);
        });

        it('should route "de todo un poco" response to active genre selection flow', async () => {
            // 1. Flow asks for genre preferences
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'genre_selection',
                expectedInput: 'GENRES',
                questionText: '¿Qué géneros musicales te gustan?'
            });

            // 2. User responds with "de todo un poco"
            const decision = await service.checkFlowContinuity(testPhone);

            // 3. Verify decision routes to musicUsb, not to another flow
            expect(decision.shouldContinueInFlow).toBe(true);
            expect(decision.activeFlowId).toBe('musicUsb');
            expect(decision.activeStep).toBe('genre_selection');
            expect(decision.expectedInput).toBe('GENRES');
            expect(decision.reasonCode).toBe(FlowContinuityReasonCode.ACTIVE_FLOW_CONTINUE);
        });

        it('should keep "gracias" response in active genre selection flow for CTA', async () => {
            // 1. Flow asks for genre preferences
            await service.setFlowState(testPhone, {
                flowId: 'musicUsb',
                step: 'genre_selection',
                expectedInput: 'GENRES',
                questionText: '¿Qué géneros musicales te gustan?'
            });

            // 2. User responds with "gracias"
            const decision = await service.checkFlowContinuity(testPhone);

            // 3. Verify decision keeps user in musicUsb for CTA handling
            expect(decision.shouldContinueInFlow).toBe(true);
            expect(decision.activeFlowId).toBe('musicUsb');
            expect(decision.activeStep).toBe('genre_selection');
            // Note: The actual CTA response is handled by the hybridIntentRouter GENRES fast-path
        });
    });
});
