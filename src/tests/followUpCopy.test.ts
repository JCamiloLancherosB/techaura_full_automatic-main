/**
 * Tests for Follow-Up Copy System
 * Tests stage-based templates, rotation logic, and CTA validation
 * 
 * Acceptance Criteria:
 * - Follow-ups have clear CTAs (Sí/No/OK/options)
 * - Templates don't repeat textually in consecutive attempts
 * - Stage-specific templates work correctly
 * 
 * Run with: npx tsx src/tests/followUpCopy.test.ts
 */

import { ConversationStage } from '../types/ConversationStage';
import type { UserSession } from '../../types/global';
import {
    selectStageTemplate,
    buildStageFollowUpMessage,
    getStageTemplates,
    getUserTemplateHistory,
    clearUserTemplateHistory,
    hasStrongCTA,
    STAGE_TEMPLATES,
    markTemplateAsUsed
} from '../services/persuasionTemplates';

// Simple test framework
let passedTests = 0;
let failedTests = 0;
const errors: string[] = [];

function expect(actual: any) {
    return {
        toBe(expected: any) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        not: {
            toBe(expected: any) {
                if (actual === expected) {
                    throw new Error(`Expected NOT ${expected}, but got ${actual}`);
                }
            },
            toBeNull() {
                if (actual === null) {
                    throw new Error(`Expected NOT null, but got null`);
                }
            }
        },
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy value, got ${actual}`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null, got ${actual}`);
            }
        },
        toContain(expected: string) {
            if (typeof actual === 'string' && !actual.includes(expected)) {
                throw new Error(`Expected "${actual.substring(0, 50)}..." to contain "${expected}"`);
            }
            if (Array.isArray(actual) && !actual.includes(expected)) {
                throw new Error(`Expected array to contain ${expected}`);
            }
        },
        toBeGreaterThan(expected: number) {
            if (actual <= expected) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeGreaterThanOrEqual(expected: number) {
            if (actual < expected) {
                throw new Error(`Expected ${actual} to be >= ${expected}`);
            }
        },
        toBeLessThan(expected: number) {
            if (actual >= expected) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        toBeLessThanOrEqual(expected: number) {
            if (actual > expected) {
                throw new Error(`Expected ${actual} to be <= ${expected}`);
            }
        }
    };
}

function test(name: string, fn: () => void) {
    try {
        fn();
        passedTests++;
        console.log(`  ✅ ${name}`);
    } catch (error) {
        failedTests++;
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${msg}`);
        console.log(`  ❌ ${name}: ${msg}`);
    }
}

function describe(name: string, fn: () => void) {
    console.log(`\n📝 ${name}\n`);
    fn();
}

// Mock user session for testing
function createMockSession(overrides?: Partial<UserSession>): UserSession {
    return {
        phone: '573001234567',
        phoneNumber: '573001234567',
        name: 'Test User',
        stage: 'interested',
        currentFlow: 'musicUsb',
        isActive: true,
        isFirstMessage: false,
        lastInteraction: new Date(),
        interactions: [],
        buyingIntent: 50,
        interests: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        conversationData: {},
        ...overrides
    } as UserSession;
}

// ============= Run Tests =============

async function runTests() {
    console.log('🧪 Running Follow-Up Copy Tests\n');
    console.log('='.repeat(70));

    // Reset test counters
    passedTests = 0;
    failedTests = 0;
    errors.length = 0;

    // Clear template history before tests
    clearUserTemplateHistory('573001234567');
    clearUserTemplateHistory('573009999999');

    describe('Template Catalog Structure', () => {
        
        test('should have 3+ templates for ASK_GENRE stage', () => {
            const askGenreTemplates = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.ASK_GENRE
            );
            expect(askGenreTemplates.length).toBeGreaterThanOrEqual(3);
        });
        
        test('should have music variants for ASK_GENRE', () => {
            const musicVariants = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.ASK_GENRE && t.contentVariant === 'music'
            );
            expect(musicVariants.length).toBeGreaterThanOrEqual(3);
        });
        
        test('should have video variants for ASK_GENRE', () => {
            const videoVariants = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.ASK_GENRE && t.contentVariant === 'videos'
            );
            expect(videoVariants.length).toBeGreaterThanOrEqual(2);
        });
        
        test('should have 3+ templates for ASK_CAPACITY_OK stage', () => {
            const capacityTemplates = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.ASK_CAPACITY_OK
            );
            expect(capacityTemplates.length).toBeGreaterThanOrEqual(3);
        });
        
        test('should have 3+ templates for CONFIRM_SUMMARY stage', () => {
            const summaryTemplates = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.CONFIRM_SUMMARY
            );
            expect(summaryTemplates.length).toBeGreaterThanOrEqual(3);
        });
        
        test('all templates should have non-empty CTA', () => {
            STAGE_TEMPLATES.forEach(template => {
                if (!template.cta || template.cta.length <= 10) {
                    throw new Error(`Template ${template.id} has invalid CTA`);
                }
            });
        });
        
        test('all templates should have unique IDs', () => {
            const ids = STAGE_TEMPLATES.map(t => t.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });
    });

    describe('Clear Call-to-Action Validation', () => {
        
        test('ASK_GENRE templates should include option format (1,2,3 or "otro")', () => {
            const askGenreTemplates = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.ASK_GENRE
            );
            
            askGenreTemplates.forEach(template => {
                const fullMessage = `${template.message}\n\n${template.cta}`;
                const hasNumberedOptions = /[1-5️⃣]/u.test(fullMessage);
                const hasOtroOption = /otro/i.test(fullMessage);
                
                if (!hasNumberedOptions && !hasOtroOption) {
                    throw new Error(`Template ${template.id} missing options format`);
                }
            });
        });
        
        test('ASK_CAPACITY_OK templates should request "OK" confirmation', () => {
            const capacityTemplates = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.ASK_CAPACITY_OK
            );
            
            capacityTemplates.forEach(template => {
                const fullMessage = `${template.message}\n\n${template.cta}`;
                const hasOK = /ok/i.test(fullMessage);
                const hasConfirm = /confirm/i.test(fullMessage);
                const hasChange = /cambiar/i.test(fullMessage);
                
                if (!hasOK && !hasConfirm && !hasChange) {
                    throw new Error(`Template ${template.id} missing OK/confirm/change format`);
                }
            });
        });
        
        test('CONFIRM_SUMMARY templates should ask for Sí/No', () => {
            const summaryTemplates = STAGE_TEMPLATES.filter(
                t => t.stage === ConversationStage.CONFIRM_SUMMARY
            );
            
            summaryTemplates.forEach(template => {
                const fullMessage = `${template.message}\n\n${template.cta}`;
                const hasYesNo = /sí|si|no/i.test(fullMessage);
                const hasAdjust = /ajust|cambi|modific/i.test(fullMessage);
                
                if (!hasYesNo && !hasAdjust) {
                    throw new Error(`Template ${template.id} missing Sí/No format`);
                }
            });
        });
        
        test('hasStrongCTA should correctly identify valid CTAs', () => {
            const validCTAs = [
                'Responde "Sí" para confirmar',
                'Escribe: 1, 2, 3 o "otro"',
                '¿Te parece bien?',
                'Dime si quieres continuar',
                'Confirma con OK'
            ];
            
            validCTAs.forEach(cta => {
                if (!hasStrongCTA(cta)) {
                    throw new Error(`Expected "${cta}" to be a strong CTA`);
                }
            });
        });
        
        test('hasStrongCTA should reject weak CTAs', () => {
            const weakCTAs = [
                'Gracias por tu preferencia',
                'Estamos aquí para ayudarte',
                'TechAura - Calidad garantizada'
            ];
            
            weakCTAs.forEach(cta => {
                if (hasStrongCTA(cta)) {
                    throw new Error(`Expected "${cta}" NOT to be a strong CTA`);
                }
            });
        });
    });

    describe('Template Rotation Logic', () => {
        
        test('should not repeat the same template consecutively', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession();
            
            const firstResult = selectStageTemplate(session, ConversationStage.ASK_GENRE);
            const secondResult = selectStageTemplate(session, ConversationStage.ASK_GENRE);
            
            expect(secondResult.templateId).not.toBe(firstResult.templateId);
        });
        
        test('should track template history per user', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession();
            
            // Initially no history
            let history = getUserTemplateHistory(session.phone);
            expect(history).toBeNull();
            
            // After selecting a template, history should be created
            selectStageTemplate(session, ConversationStage.ASK_GENRE);
            
            history = getUserTemplateHistory(session.phone);
            expect(history).not.toBeNull();
            expect(history?.lastTemplateId).toBeTruthy();
        });
        
        test('should allow resetting template history', () => {
            const session = createMockSession();
            
            // Generate some history
            selectStageTemplate(session, ConversationStage.ASK_GENRE);
            selectStageTemplate(session, ConversationStage.ASK_CAPACITY_OK);
            
            // Clear history
            clearUserTemplateHistory(session.phone);
            
            const history = getUserTemplateHistory(session.phone);
            expect(history).toBeNull();
        });
        
        test('should maintain separate history per user', () => {
            clearUserTemplateHistory('573001111111');
            clearUserTemplateHistory('573002222222');
            
            const session1 = createMockSession({ phone: '573001111111' });
            const session2 = createMockSession({ phone: '573002222222' });
            
            // Select templates for user 1
            const result1 = selectStageTemplate(session1, ConversationStage.ASK_GENRE);
            
            // Select templates for user 2
            const result2 = selectStageTemplate(session2, ConversationStage.ASK_GENRE);
            
            // Histories should be separate
            const history1 = getUserTemplateHistory(session1.phone);
            const history2 = getUserTemplateHistory(session2.phone);
            
            expect(history1?.lastTemplateId).toBe(result1.templateId);
            expect(history2?.lastTemplateId).toBe(result2.templateId);
        });
    });

    describe('Content Type Personalization', () => {
        
        test('should select music-specific templates for music content', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession({
                conversationData: { selectedType: 'musica' }
            });
            (session as any).contentType = 'music';
            
            const result = selectStageTemplate(session, ConversationStage.ASK_GENRE);
            
            // Should be a music or general variant
            const template = STAGE_TEMPLATES.find(t => t.id === result.templateId);
            if (!['music', 'general'].includes(template?.contentVariant || '')) {
                throw new Error(`Expected music or general variant, got ${template?.contentVariant}`);
            }
        });
        
        test('should select video-specific templates for video content', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession({
                conversationData: { selectedType: 'videos' }
            });
            (session as any).contentType = 'videos';
            
            const result = selectStageTemplate(session, ConversationStage.ASK_GENRE);
            
            const template = STAGE_TEMPLATES.find(t => t.id === result.templateId);
            if (!['videos', 'general'].includes(template?.contentVariant || '')) {
                throw new Error(`Expected videos or general variant, got ${template?.contentVariant}`);
            }
        });
        
        test('should fallback to general templates when content type unknown', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession();
            
            const result = selectStageTemplate(session, ConversationStage.ASK_GENRE);
            
            expect(result.templateId).toBeTruthy();
            expect(result.fullMessage).toBeTruthy();
        });
    });

    describe('Message Building', () => {
        
        test('should build complete message with context for ASK_CAPACITY_OK', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession();
            
            const result = buildStageFollowUpMessage(
                session,
                ConversationStage.ASK_CAPACITY_OK,
                { capacity: '128GB' }
            );
            
            expect(result.message).toBeTruthy();
            expect(result.templateId).toBeTruthy();
            expect(result.hasClearCTA).toBe(true);
        });
        
        test('should build complete message with price for CONFIRM_SUMMARY', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession();
            
            const result = buildStageFollowUpMessage(
                session,
                ConversationStage.CONFIRM_SUMMARY,
                { price: 89900 }
            );
            
            expect(result.message).toBeTruthy();
            expect(result.templateId).toBeTruthy();
            expect(result.hasClearCTA).toBe(true);
            expect(result.message).toContain('89.900');
        });
        
        test('should personalize with user name when available', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession({ name: 'Carlos' });
            
            const result = selectStageTemplate(session, ConversationStage.ASK_GENRE);
            
            expect(result.fullMessage).toContain('Carlos');
        });
        
        test('should work without user name', () => {
            clearUserTemplateHistory('573001234567');
            const session = createMockSession({ name: undefined });
            
            const result = selectStageTemplate(session, ConversationStage.ASK_GENRE);
            
            expect(result.fullMessage).toBeTruthy();
            expect(result.fullMessage.length).toBeGreaterThan(50);
        });
    });

    describe('Template Quality Checks', () => {
        
        test('all templates should have reasonable message length', () => {
            STAGE_TEMPLATES.forEach(template => {
                const fullMessage = `${template.message}\n\n${template.cta}`;
                
                if (fullMessage.length <= 50) {
                    throw new Error(`Template ${template.id} is too short (${fullMessage.length} chars)`);
                }
                if (fullMessage.length >= 500) {
                    throw new Error(`Template ${template.id} is too long (${fullMessage.length} chars)`);
                }
            });
        });
        
        test('all templates should have friendly emoji', () => {
            STAGE_TEMPLATES.forEach(template => {
                const fullMessage = `${template.message}\n\n${template.cta}`;
                // Extended emoji range: emoticons, symbols, dingbats, misc symbols
                const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F0FF}]/u.test(fullMessage);
                
                if (!hasEmoji) {
                    throw new Error(`Template ${template.id} has no emoji`);
                }
            });
        });
        
        test('all templates should have greeting', () => {
            STAGE_TEMPLATES.forEach(template => {
                const hasGreeting = /hola|hey|buenas/i.test(template.message);
                
                if (!hasGreeting) {
                    throw new Error(`Template ${template.id} has no greeting`);
                }
            });
        });
        
        test('all CTAs should have clear action instruction', () => {
            STAGE_TEMPLATES.forEach(template => {
                const hasAction = /(escribe|responde|dime|elige|confirma|cuéntame)/i.test(template.cta);
                
                if (!hasAction) {
                    throw new Error(`Template ${template.id} CTA has no clear action instruction`);
                }
            });
        });
    });

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log(`\n📊 Test Results: ${passedTests} passed, ${failedTests} failed`);
    console.log(`📋 Template Count: ${STAGE_TEMPLATES.length} total templates`);
    console.log(`   - ASK_GENRE: ${STAGE_TEMPLATES.filter(t => t.stage === ConversationStage.ASK_GENRE).length}`);
    console.log(`   - ASK_CAPACITY_OK: ${STAGE_TEMPLATES.filter(t => t.stage === ConversationStage.ASK_CAPACITY_OK).length}`);
    console.log(`   - CONFIRM_SUMMARY: ${STAGE_TEMPLATES.filter(t => t.stage === ConversationStage.CONFIRM_SUMMARY).length}`);
    
    if (failedTests > 0) {
        console.log('\n❌ Failed tests:');
        errors.forEach(err => console.log(`   - ${err}`));
        return false;
    } else {
        console.log('\n🎉 All tests passed!');
        return true;
    }
}

// Run tests
runTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
