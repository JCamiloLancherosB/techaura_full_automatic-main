/**
 * Tests for Message Policy Engine
 * Tests policy enforcement for tone/length/CTA rules per stage and category
 */

import { messagePolicyEngine, type MessagePolicyContext } from '../services/MessagePolicyEngine';
import { PersuasionContext } from '../services/persuasionEngine';
import type { UserSession } from '../../types/global';

// Mock user session for testing
const createMockSession = (overrides?: Partial<UserSession>): UserSession => ({
    phone: '573001234567',
    phoneNumber: '573001234567',
    name: 'Test User',
    stage: 'awareness',
    currentFlow: 'musicUsb',
    isActive: true,
    isFirstMessage: false,
    lastInteraction: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    interactions: [],
    buyingIntent: 50,
    interests: [],
    ...overrides
});

const createMockPersuasionContext = (overrides?: Partial<PersuasionContext>): PersuasionContext => ({
    stage: 'awareness',
    hasDiscussedPrice: false,
    hasSelectedProduct: false,
    hasCustomized: false,
    buyingIntent: 50,
    interactionCount: 1,
    productInterests: [],
    ...overrides
});

const createMockPolicyContext = (
    sessionOverrides?: Partial<UserSession>,
    persuasionOverrides?: Partial<PersuasionContext>
): MessagePolicyContext => {
    const userSession = createMockSession(sessionOverrides);
    const persuasionContext = createMockPersuasionContext(persuasionOverrides);
    
    return {
        userSession,
        persuasionContext,
        messageType: 'persuasive',
        stage: persuasionContext.stage,
        status: userSession.stage
    };
};

describe('Message Policy Engine', () => {
    
    describe('No Urgency When Confirmed Rule', () => {
        
        it('should detect urgency language in confirmed orders', () => {
            const message = '⏰ ¡Última llamada! ¿Confirmas tu pedido?';
            const context = createMockPolicyContext(
                { stage: 'order_confirmed' },
                { stage: 'closing' }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.isValid).toBe(false);
            expect(result.violations.some(v => v.rule === 'no_urgency_when_confirmed')).toBe(true);
        });
        
        it('should allow urgency language in pricing stage', () => {
            const message = '⏰ Tenemos promoción del 20% OFF hoy. ¿Te interesa?';
            const context = createMockPolicyContext(
                { stage: 'pricing' },
                { stage: 'pricing', hasDiscussedPrice: true }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            // Should not have no_urgency_when_confirmed violation
            const hasUrgencyViolation = result.violations.some(v => v.rule === 'no_urgency_when_confirmed');
            expect(hasUrgencyViolation).toBe(false);
        });

        it('should remove urgency language when transforming message for confirmed orders', () => {
            const message = '⏰ ¡Última llamada!\n\n¿Confirmas tu dirección?';
            const context = createMockPolicyContext(
                { stage: 'order_confirmed' },
                { stage: 'closing' }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.transformedMessage).toBeDefined();
            expect(result.transformedMessage).not.toContain('Última llamada');
            expect(result.transformedMessage).toContain('¿Confirmas tu dirección?');
        });

        it('should detect various urgency patterns', () => {
            const urgencyMessages = [
                '⏰ Última oportunidad',
                '🔥 Urgente: quedan pocas unidades',
                'Termina hoy',
                'Solo 24 horas',
                'Antes de que se agote'
            ];
            
            const context = createMockPolicyContext(
                { stage: 'payment_confirmed' }
            );
            
            urgencyMessages.forEach(message => {
                const result = messagePolicyEngine.validateMessage(message, context);
                expect(result.isValid).toBe(false);
                expect(result.violations.some(v => v.rule === 'no_urgency_when_confirmed')).toBe(true);
            });
        });
    });
    
    describe('Message Length Rule', () => {
        
        it('should enforce standard length limit (200 chars)', () => {
            const longMessage = 'A'.repeat(250) + '\n\n¿Te interesa?';
            const context = createMockPolicyContext();
            
            const result = messagePolicyEngine.validateMessage(longMessage, context);
            
            expect(result.isValid).toBe(false);
            expect(result.violations.some(v => v.rule === 'message_length')).toBe(true);
        });
        
        it('should allow longer messages for catalog with price tables', () => {
            const catalogMessage = `📊 Nuestros precios:
32GB - $45,000
64GB - $75,000
128GB - $125,000
256GB - $200,000
¿Cuál te conviene más?`;
            
            const context = createMockPolicyContext();
            context.messageType = 'catalog';
            
            const result = messagePolicyEngine.validateMessage(catalogMessage, context);
            
            // Should not have message_length error (warnings are ok)
            const hasLengthError = result.violations.some(v => 
                v.rule === 'message_length' && v.severity === 'error'
            );
            expect(hasLengthError).toBe(false);
        });

        it('should trim long messages while preserving CTA', () => {
            const longMessage = 'Hola! ' + 'B'.repeat(180) + '\n\n¿Qué prefieres?';
            const context = createMockPolicyContext();
            
            const result = messagePolicyEngine.validateMessage(longMessage, context);
            
            expect(result.transformedMessage).toBeDefined();
            expect(result.transformedMessage!.length).toBeLessThanOrEqual(200);
            expect(result.transformedMessage).toContain('?'); // CTA preserved
        });

        it('should warn for catalog messages exceeding 300 chars even with price table', () => {
            const veryLongCatalog = 'A'.repeat(350) + '\n32GB - $45,000\n64GB - $75,000';
            const context = createMockPolicyContext();
            context.messageType = 'catalog';
            
            const result = messagePolicyEngine.validateMessage(veryLongCatalog, context);
            
            const hasWarning = result.violations.some(v => 
                v.rule === 'message_length' && v.severity === 'warning'
            );
            expect(hasWarning).toBe(true);
        });
    });
    
    describe('Price Repetition Rule', () => {
        
        it('should detect price mentioned more than 3 times', () => {
            const message = '$45,000 por 32GB, $75,000 por 64GB, $125,000 por 128GB, $200,000 por 256GB';
            const context = createMockPolicyContext();
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.violations.some(v => v.rule === 'no_price_repetition')).toBe(true);
        });
        
        it('should allow up to 3 price mentions', () => {
            const message = '32GB: $45,000, 64GB: $75,000, 128GB: $125,000';
            const context = createMockPolicyContext();
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            const hasPriceViolation = result.violations.some(v => v.rule === 'no_price_repetition');
            expect(hasPriceViolation).toBe(false);
        });
    });
    
    describe('CTA Appropriateness Rule', () => {
        
        it('should detect inappropriate CTA for awareness stage', () => {
            const message = 'Confirma tu dirección de envío';
            const context = createMockPolicyContext(
                { stage: 'awareness' },
                { stage: 'awareness', interactionCount: 1 }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.isValid).toBe(false);
            expect(result.violations.some(v => v.rule === 'cta_appropriateness')).toBe(true);
        });
        
        it('should allow appropriate CTAs for each stage', () => {
            const stageCTAs = [
                { stage: 'awareness', message: '¿Te interesa música o películas?' },
                { stage: 'interest', message: '¿Qué géneros prefieres?' },
                { stage: 'customization', message: '¿Prefieres 32GB o 64GB?' },
                { stage: 'pricing', message: '¿Te gustaría confirmar tu pedido?' },
                { stage: 'closing', message: '¿Confirmas tu dirección de envío?' }
            ];
            
            stageCTAs.forEach(({ stage, message }) => {
                const context = createMockPolicyContext(
                    { stage },
                    { stage } as any
                );
                
                const result = messagePolicyEngine.validateMessage(message, context);
                
                // Should not have CTA appropriateness errors
                const hasCTAError = result.violations.some(v => 
                    v.rule === 'cta_appropriateness' && v.severity === 'error'
                );
                expect(hasCTAError).toBe(false);
            });
        });

        it('should transform message to remove prohibited CTAs', () => {
            const message = 'Hola, bienvenido\n\nConfirma tu dirección';
            const context = createMockPolicyContext(
                { stage: 'awareness' },
                { stage: 'awareness' }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            if (result.transformedMessage) {
                expect(result.transformedMessage).not.toContain('Confirma tu dirección');
            }
        });
    });
    
    describe('Prohibited Patterns Rule', () => {
        
        it('should detect "bienvenido" for returning users', () => {
            const message = '¡Bienvenido! ¿En qué te ayudo?';
            const context = createMockPolicyContext(
                {},
                { interactionCount: 5, stage: 'interest' }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.violations.some(v => v.rule === 'prohibited_patterns')).toBe(true);
        });
        
        it('should detect asking about product type when already selected', () => {
            const message = '¿Te interesa música, películas o videos?';
            const context = createMockPolicyContext(
                {},
                { 
                    hasSelectedProduct: true,
                    productInterests: ['music'],
                    stage: 'interest'
                }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.violations.some(v => v.rule === 'prohibited_patterns')).toBe(true);
        });

        it('should allow "algo más" variation when asking about product type', () => {
            const message = '¿Te interesa algo más? ¿Música, películas o videos?';
            const context = createMockPolicyContext(
                {},
                { 
                    hasSelectedProduct: true,
                    productInterests: ['music'],
                    stage: 'interest'
                }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            const hasProhibitedViolation = result.violations.some(v => v.rule === 'prohibited_patterns');
            expect(hasProhibitedViolation).toBe(false);
        });
    });

    describe('Integration and Edge Cases', () => {

        it('should handle messages with no violations', () => {
            const message = '🎵 ¡Perfecto! ¿Qué géneros prefieres?';
            const context = createMockPolicyContext(
                { stage: 'interest' },
                { stage: 'interest', hasSelectedProduct: true }
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.isValid).toBe(true);
            expect(result.violations.length).toBe(0);
            expect(result.transformedMessage).toBeUndefined();
        });

        it('should handle multiple violations', () => {
            const message = '⏰ ¡Última llamada! ' + 'A'.repeat(250) + ' Confirma tu dirección';
            const context = createMockPolicyContext(
                { stage: 'order_confirmed' },
                { stage: 'awareness' } // Wrong stage for this CTA
            );
            
            const result = messagePolicyEngine.validateMessage(message, context);
            
            expect(result.isValid).toBe(false);
            expect(result.violations.length).toBeGreaterThan(1);
        });

        it('should provide CTA suggestions for stages', () => {
            const suggestions = messagePolicyEngine.getCTASuggestionsForStage('interest');
            
            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions.some(s => s.includes('género') || s.includes('artista'))).toBe(true);
        });

        it('should provide violation summary', () => {
            const message = '⏰ Última llamada! ' + 'A'.repeat(250);
            const context = createMockPolicyContext({ stage: 'order_confirmed' });
            
            const result = messagePolicyEngine.validateMessage(message, context);
            const summary = messagePolicyEngine.getViolationSummary(result.violations);
            
            expect(summary.length).toBeGreaterThan(0);
            expect(summary).toContain('error');
        });

        it('should check for error violations quickly', () => {
            const message = 'Confirma tu dirección';
            const context = createMockPolicyContext(
                { stage: 'awareness' },
                { stage: 'awareness' }
            );
            
            const hasErrors = messagePolicyEngine.hasErrorViolations(message, context);
            
            expect(hasErrors).toBe(true);
        });
    });

    describe('Price Table Detection', () => {

        it('should detect price table format', () => {
            const priceTable = `📊 Opciones disponibles:
32GB - $45,000
64GB - $75,000
128GB - $125,000`;
            
            const context = createMockPolicyContext();
            context.messageType = 'catalog';
            
            // Test through the private method via validation
            const result = messagePolicyEngine.validateMessage(priceTable, context);
            
            // Price table should not have strict length errors
            const hasLengthError = result.violations.some(v => 
                v.rule === 'message_length' && v.severity === 'error'
            );
            expect(hasLengthError).toBe(false);
        });

        it('should not consider single price as price table', () => {
            const singlePrice = 'El precio es $45,000. ¿Te interesa?';
            const context = createMockPolicyContext();
            context.messageType = 'catalog';
            
            // If message is too long, should still enforce length
            const longMessage = singlePrice + ' Extra text. ' + 'A'.repeat(200);
            const result = messagePolicyEngine.validateMessage(longMessage, context);
            
            expect(result.violations.some(v => v.rule === 'message_length')).toBe(true);
        });
    });
});
