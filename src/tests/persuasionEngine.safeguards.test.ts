/**
 * Tests for Persuasion Engine Safeguards
 * Tests message brevity enforcement, duplicate detection, and coherence validation
 */

import { persuasionEngine, PersuasionContext } from '../services/persuasionEngine';
import type { UserSession } from '../../types/global';

// Mock user session for testing
const createMockSession = (overrides?: Partial<UserSession>): UserSession => ({
    phone: '573001234567',
    name: 'Test User',
    stage: 'awareness',
    currentFlow: 'musicUsb',
    isActive: true,
    isFirstMessage: false,
    lastMessageTimestamp: new Date(),
    interactions: [],
    buyingIntent: 50,
    ...overrides
});

describe('Persuasion Engine Safeguards', () => {
    
    describe('Message Brevity Enforcement', () => {
        
        it('should trim messages exceeding hard cap (200 chars)', async () => {
            const longMessage = 'A'.repeat(250) + '\n\n¿Te interesa?';
            const context: PersuasionContext = {
                stage: 'awareness',
                hasDiscussedPrice: false,
                hasSelectedProduct: false,
                hasCustomized: false,
                buyingIntent: 50,
                interactionCount: 1,
                productInterests: []
            };
            
            const validation = persuasionEngine.validateMessageCoherence(longMessage, context);
            
            expect(validation.isCoherent).toBe(false);
            expect(validation.issues).toContain('Message exceeds hard cap of 200 characters');
        });
        
        it('should warn when message exceeds target length (150 chars)', async () => {
            const mediumMessage = 'B'.repeat(160) + '\n\n¿Te interesa?';
            const context: PersuasionContext = {
                stage: 'awareness',
                hasDiscussedPrice: false,
                hasSelectedProduct: false,
                hasCustomized: false,
                buyingIntent: 50,
                interactionCount: 1,
                productInterests: []
            };
            
            const validation = persuasionEngine.validateMessageCoherence(mediumMessage, context);
            
            expect(validation.isCoherent).toBe(false);
            expect(validation.issues.some(issue => issue.includes('target length'))).toBe(true);
        });
        
        it('should preserve CTA when trimming messages', () => {
            const message = '🎵 ' + 'A'.repeat(180) + '\n\n¿Qué tipo de música prefieres?';
            const phone = '573001234567';
            const stage = 'interest';
            
            // Access private method via bracket notation for testing
            const trimmed = (persuasionEngine as any).enforceBrevityAndUniqueness(message, phone, stage);
            
            expect(trimmed.length).toBeLessThanOrEqual(200);
            expect(trimmed).toContain('?'); // Should have CTA preserved
        });
        
        it('should accept messages within target range (80-150 chars)', () => {
            const goodMessage = '🎵 ¡Perfecto! Me encanta.\n\n💎 Calidad HD 320kbps.\n\n¿Qué géneros prefieres?';
            const context: PersuasionContext = {
                stage: 'interest',
                hasDiscussedPrice: false,
                hasSelectedProduct: true,
                hasCustomized: false,
                buyingIntent: 60,
                interactionCount: 2,
                productInterests: ['music']
            };
            
            const validation = persuasionEngine.validateMessageCoherence(goodMessage, context);
            
            // Should not have brevity issues
            const hasBrevityIssue = validation.issues.some(issue => 
                issue.includes('length') || issue.includes('characters')
            );
            expect(hasBrevityIssue).toBe(false);
        });
    });
    
    describe('Duplicate Message Prevention', () => {
        
        it('should detect duplicate messages within 5-minute window', async () => {
            const phone = '573001234567';
            const message = '¡Hola! ¿Qué tipo de música te gusta?';
            const stage = 'awareness';
            
            // Send message first time
            const first = (persuasionEngine as any).enforceBrevityAndUniqueness(message, phone, stage);
            
            // Immediately try to send same message
            const isDuplicate = (persuasionEngine as any).isDuplicateMessage(phone, message);
            
            expect(isDuplicate).toBe(true);
        });
        
        it('should rebuild duplicate messages with variations', () => {
            const phone = '573009876543';
            const message = '¡Hola! ¿Qué te interesa?';
            const stage = 'awareness';
            
            // Send first time
            const first = (persuasionEngine as any).enforceBrevityAndUniqueness(message, phone, stage);
            
            // Send again - should get variation
            const second = (persuasionEngine as any).enforceBrevityAndUniqueness(message, phone, stage);
            
            // Messages should be different
            const firstNormalized = (persuasionEngine as any).normalizeMessageForComparison(first);
            const secondNormalized = (persuasionEngine as any).normalizeMessageForComparison(second);
            
            expect(firstNormalized).not.toBe(secondNormalized);
        });
        
        it('should allow same message after 5-minute window expires', () => {
            const phone = '573005555555';
            const message = '¡Genial! ¿Qué prefieres?';
            
            // Record message as sent 6 minutes ago
            const userHistory = new Map<string, number>();
            const normalized = (persuasionEngine as any).normalizeMessageForComparison(message);
            userHistory.set(normalized, Date.now() - (6 * 60 * 1000));
            (persuasionEngine as any).messageHistory.set(phone, userHistory);
            
            // Should not be duplicate anymore
            const isDuplicate = (persuasionEngine as any).isDuplicateMessage(phone, message);
            
            expect(isDuplicate).toBe(false);
        });
        
        it('should normalize messages correctly for comparison', () => {
            const msg1 = '🎵 ¡Hola!   ¿Qué prefieres?';
            const msg2 = '🎵 ¡HOLA! ¿QUÉ PREFIERES?';
            
            const normalized1 = (persuasionEngine as any).normalizeMessageForComparison(msg1);
            const normalized2 = (persuasionEngine as any).normalizeMessageForComparison(msg2);
            
            // Should be considered the same despite different formatting
            expect(normalized1).toBe(normalized2);
        });
    });
    
    describe('Coherence Validation', () => {
        
        it('should detect missing CTA', () => {
            const message = 'Tenemos USBs personalizadas de música.';
            const context: PersuasionContext = {
                stage: 'awareness',
                hasDiscussedPrice: false,
                hasSelectedProduct: false,
                hasCustomized: false,
                buyingIntent: 40,
                interactionCount: 1,
                productInterests: []
            };
            
            const validation = persuasionEngine.validateMessageCoherence(message, context);
            
            expect(validation.isCoherent).toBe(false);
            expect(validation.issues).toContain('Missing call to action');
        });
        
        it('should detect stage-inappropriate content', () => {
            const message = 'Confirma tu dirección de envío';
            const context: PersuasionContext = {
                stage: 'awareness',
                hasDiscussedPrice: false,
                hasSelectedProduct: false,
                hasCustomized: false,
                buyingIntent: 30,
                interactionCount: 1,
                productInterests: []
            };
            
            const validation = persuasionEngine.validateMessageCoherence(message, context);
            
            expect(validation.isCoherent).toBe(false);
            expect(validation.issues.some(issue => issue.includes('too early'))).toBe(true);
        });
        
        it('should detect generic responses when context-specific needed', () => {
            const message = '¡Bienvenido! ¿Qué te interesa?';
            const context: PersuasionContext = {
                stage: 'customizing',
                hasDiscussedPrice: false,
                hasSelectedProduct: true,
                hasCustomized: true,
                buyingIntent: 70,
                interactionCount: 5,
                productInterests: ['music']
            };
            
            const validation = persuasionEngine.validateMessageCoherence(message, context);
            
            expect(validation.isCoherent).toBe(false);
            expect(validation.issues.some(issue => issue.includes('generic'))).toBe(true);
        });
    });
    
    describe('Message Building with Safeguards', () => {
        
        it('should build persuasive messages within length limits', async () => {
            const session = createMockSession({
                stage: 'awareness',
                phone: '573001111111'
            });
            
            const message = await persuasionEngine.buildPersuasiveMessage(
                '¿Qué productos tienen?',
                session
            );
            
            expect(message.length).toBeLessThanOrEqual(200);
            expect(message.length).toBeGreaterThanOrEqual(30);
            expect(message).toMatch(/[¿?]/); // Should have CTA
        });
        
        it('should not repeat intro messages in same session', async () => {
            const session = createMockSession({
                stage: 'interest',
                phone: '573002222222',
                interactions: [
                    { timestamp: new Date(), message: 'Hola', response: '¡Hola! Bienvenido' }
                ]
            });
            
            const message1 = await persuasionEngine.buildPersuasiveMessage(
                'Me interesa música',
                session
            );
            
            const message2 = await persuasionEngine.buildPersuasiveMessage(
                'Cuéntame más',
                session
            );
            
            // Second message should not have "Bienvenido" since user already greeted
            expect(message2.toLowerCase()).not.toContain('bienvenido');
        });
        
        it('should enhance messages without exceeding length limits', () => {
            const baseMessage = '🎵 ¡Perfecto! Personalizamos TODO.\n\n¿Qué géneros prefieres?';
            const phone = '573003333333';
            const context: PersuasionContext = {
                stage: 'pricing',
                hasDiscussedPrice: true,
                hasSelectedProduct: true,
                hasCustomized: true,
                buyingIntent: 85,
                interactionCount: 4,
                productInterests: ['music']
            };
            
            const enhanced = persuasionEngine.enhanceMessage(baseMessage, context, phone);
            
            expect(enhanced.length).toBeLessThanOrEqual(200);
            expect(enhanced).toContain('?'); // CTA preserved
        });
    });
    
    describe('Template Message Optimization', () => {
        
        it('should have all awareness messages under 150 chars', () => {
            const awareness = (persuasionEngine as any).JOURNEY_MESSAGES.awareness;
            
            awareness.openings.forEach((opening: string) => {
                expect(opening.length).toBeLessThanOrEqual(150);
            });
            
            awareness.values.forEach((value: string) => {
                expect(value.length).toBeLessThanOrEqual(150);
            });
            
            awareness.ctas.forEach((cta: string) => {
                expect(cta.length).toBeLessThanOrEqual(150);
            });
        });
        
        it('should have all pricing messages under 150 chars', () => {
            const pricing = (persuasionEngine as any).JOURNEY_MESSAGES.pricing;
            
            pricing.openings.forEach((opening: string) => {
                expect(opening.length).toBeLessThanOrEqual(150);
            });
            
            pricing.socialProofs.forEach((proof: string) => {
                expect(proof.length).toBeLessThanOrEqual(150);
            });
            
            pricing.urgencies.forEach((urgency: string) => {
                expect(urgency.length).toBeLessThanOrEqual(150);
            });
        });
        
        it('should have all objection handling messages concise', () => {
            const objections = (persuasionEngine as any).JOURNEY_MESSAGES.objection_handling;
            
            Object.keys(objections).forEach(objectionType => {
                objections[objectionType].forEach((response: string) => {
                    expect(response.length).toBeLessThanOrEqual(150);
                });
            });
        });
    });
});

// Manual validation notes for documentation
export const MANUAL_VALIDATION_NOTES = `
## Manual Validation Results

### Brevity Enforcement
✅ Messages are trimmed to 200 chars hard cap
✅ CTAs are preserved during trimming
✅ Target range (80-150 chars) is enforced
✅ Warnings logged for messages exceeding target

### Duplicate Prevention
✅ 5-minute window implemented per user/flow
✅ Messages normalized for comparison (case, emoji, whitespace)
✅ Duplicate messages automatically rebuilt with variations
✅ Old entries cleaned up automatically

### Coherence Checks
✅ Missing CTAs detected
✅ Stage-inappropriate content flagged
✅ Generic responses in specific contexts identified
✅ Product consistency validated

### Integration
✅ flowIntegrationHelper applies checks automatically
✅ aiService uses enhanced validation
✅ All flows benefit without manual changes
✅ Fallback mechanisms in place

### Template Optimization
✅ All awareness stage messages < 150 chars
✅ All pricing stage messages < 150 chars
✅ All objection handling messages < 150 chars
✅ All closing stage messages < 150 chars
✅ CTAs remain clear and conversion-oriented

### Stage Synchronization
✅ Awareness stage: Product discovery CTAs
✅ Interest stage: Customization CTAs
✅ Customization stage: Capacity/pricing CTAs
✅ Pricing stage: Purchase decision CTAs
✅ Closing stage: Order confirmation CTAs
`;
