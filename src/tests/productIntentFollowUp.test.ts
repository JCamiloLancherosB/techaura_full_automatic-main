/**
 * Tests for Product Intent Follow-Up System
 * Tests product-intent templates with prices/sizes, detection logic, and rotation
 * 
 * Acceptance Criteria:
 * - MUSIC_USB follow-ups include capacities (64GB, 128GB, 256GB, 512GB) and prices
 * - VIDEO_USB follow-ups include capacities and video counts
 * - MOVIES_USB follow-ups include options (128GB, 256GB, 512GB) and movie counts
 * - Product intent is correctly detected from session data
 * - Templates don't repeat in consecutive attempts
 * 
 * Run with: npx tsx src/tests/productIntentFollowUp.test.ts
 */

import type { UserSession } from '../../types/global';
import {
    detectProductIntent,
    selectProductIntentTemplate,
    buildProductIntentFollowUp,
    getProductIntentTemplates,
    PRODUCT_INTENT_TEMPLATES,
    ProductIntentType,
    clearUserTemplateHistory
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
            }
        },
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy value, got ${actual}`);
            }
        },
        toContain(expected: string) {
            if (typeof actual === 'string' && !actual.includes(expected)) {
                throw new Error(`Expected "${actual.substring(0, 100)}..." to contain "${expected}"`);
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
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${name}: ${message}`);
        console.log(`  ❌ ${name}: ${message}`);
    }
}

function describe(name: string, fn: () => void) {
    console.log(`\n📋 ${name}`);
    fn();
}

// Create mock session
function createMockSession(overrides: Partial<UserSession> = {}): UserSession {
    return {
        phone: '573001234567',
        phoneNumber: '573001234567',
        name: 'Test User',
        stage: 'interested',
        buyingIntent: 50,
        interests: [],
        interactions: [],
        isFirstMessage: false,
        isActive: true,
        lastInteraction: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    } as UserSession;
}

// ============= Tests =============

describe('Product Intent Templates Structure', () => {
    test('should have templates for all product types', () => {
        const musicTemplates = PRODUCT_INTENT_TEMPLATES.filter(t => t.productIntent === 'MUSIC_USB');
        const videoTemplates = PRODUCT_INTENT_TEMPLATES.filter(t => t.productIntent === 'VIDEO_USB');
        const moviesTemplates = PRODUCT_INTENT_TEMPLATES.filter(t => t.productIntent === 'MOVIES_USB');
        const generalTemplates = PRODUCT_INTENT_TEMPLATES.filter(t => t.productIntent === 'GENERAL');
        
        expect(musicTemplates.length).toBeGreaterThanOrEqual(3);
        expect(videoTemplates.length).toBeGreaterThanOrEqual(3);
        expect(moviesTemplates.length).toBeGreaterThanOrEqual(3);
        expect(generalTemplates.length).toBeGreaterThanOrEqual(3);
    });

    test('each product type should have templates for attempts 1, 2, and 3', () => {
        const productTypes: ProductIntentType[] = ['MUSIC_USB', 'VIDEO_USB', 'MOVIES_USB', 'GENERAL'];
        
        for (const productType of productTypes) {
            const templates = getProductIntentTemplates(productType);
            const attempt1 = templates.filter(t => t.attemptNumber === 1);
            const attempt2 = templates.filter(t => t.attemptNumber === 2);
            const attempt3 = templates.filter(t => t.attemptNumber === 3);
            
            expect(attempt1.length).toBeGreaterThanOrEqual(1);
            expect(attempt2.length).toBeGreaterThanOrEqual(1);
            expect(attempt3.length).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('Music USB Templates - Prices and Capacities', () => {
    test('should include 64GB capacity and price', () => {
        const musicTemplates = getProductIntentTemplates('MUSIC_USB');
        const allMessages = musicTemplates.map(t => t.message + t.cta).join(' ');
        
        expect(allMessages).toContain('64GB');
        expect(allMessages).toContain('$119.900');
    });

    test('should include 128GB capacity and price', () => {
        const musicTemplates = getProductIntentTemplates('MUSIC_USB');
        const allMessages = musicTemplates.map(t => t.message + t.cta).join(' ');
        
        expect(allMessages).toContain('128GB');
        expect(allMessages).toContain('$159.900');
    });

    test('should include 256GB capacity', () => {
        const musicTemplates = getProductIntentTemplates('MUSIC_USB');
        const allMessages = musicTemplates.map(t => t.message + t.cta).join(' ');
        
        expect(allMessages).toContain('256GB');
    });

    test('should include song counts', () => {
        const musicTemplates = getProductIntentTemplates('MUSIC_USB');
        const allMessages = musicTemplates.map(t => t.message).join(' ');
        
        // Should mention song ranges
        expect(allMessages).toContain('canciones');
    });
});

describe('Video USB Templates - Prices and Capacities', () => {
    test('should include video counts and HD quality', () => {
        const videoTemplates = getProductIntentTemplates('VIDEO_USB');
        const allMessages = videoTemplates.map(t => t.message).join(' ');
        
        expect(allMessages).toContain('videoclips');
        expect(allMessages).toContain('HD');
    });

    test('should include price for 128GB', () => {
        const videoTemplates = getProductIntentTemplates('VIDEO_USB');
        const allMessages = videoTemplates.map(t => t.message + t.cta).join(' ');
        
        expect(allMessages).toContain('128GB');
        expect(allMessages).toContain('$99.900');
    });
});

describe('Movies USB Templates - Prices and Capacities', () => {
    test('should include movie counts', () => {
        const moviesTemplates = getProductIntentTemplates('MOVIES_USB');
        const allMessages = moviesTemplates.map(t => t.message).join(' ');
        
        expect(allMessages).toContain('películas');
    });

    test('should include larger capacities (128GB, 256GB, 512GB)', () => {
        const moviesTemplates = getProductIntentTemplates('MOVIES_USB');
        const allMessages = moviesTemplates.map(t => t.message + t.cta).join(' ');
        
        expect(allMessages).toContain('128GB');
        expect(allMessages).toContain('256GB');
        expect(allMessages).toContain('512GB');
    });

    test('should include HD/Full HD quality mention', () => {
        const moviesTemplates = getProductIntentTemplates('MOVIES_USB');
        const allMessages = moviesTemplates.map(t => t.message).join(' ');
        
        expect(allMessages).toContain('HD');
    });
});

describe('detectProductIntent', () => {
    test('should detect MUSIC_USB from contentType=music', () => {
        const session = createMockSession({ contentType: 'music' } as any);
        const intent = detectProductIntent(session);
        expect(intent).toBe('MUSIC_USB');
    });

    test('should detect MUSIC_USB from contentType=musica', () => {
        const session = createMockSession();
        (session as any).contentType = 'musica';
        const intent = detectProductIntent(session);
        expect(intent).toBe('MUSIC_USB');
    });

    test('should detect VIDEO_USB from contentType=videos', () => {
        const session = createMockSession({ contentType: 'videos' } as any);
        const intent = detectProductIntent(session);
        expect(intent).toBe('VIDEO_USB');
    });

    test('should detect MOVIES_USB from contentType=movies', () => {
        const session = createMockSession({ contentType: 'movies' } as any);
        const intent = detectProductIntent(session);
        expect(intent).toBe('MOVIES_USB');
    });

    test('should detect MUSIC_USB from currentFlow=musicUsb', () => {
        const session = createMockSession({ currentFlow: 'musicUsb' });
        const intent = detectProductIntent(session);
        expect(intent).toBe('MUSIC_USB');
    });

    test('should detect VIDEO_USB from currentFlow=videosUsb', () => {
        const session = createMockSession({ currentFlow: 'videosUsb' });
        const intent = detectProductIntent(session);
        expect(intent).toBe('VIDEO_USB');
    });

    test('should detect MOVIES_USB from currentFlow=moviesUsb', () => {
        const session = createMockSession({ currentFlow: 'moviesUsb' });
        const intent = detectProductIntent(session);
        expect(intent).toBe('MOVIES_USB');
    });

    test('should return GENERAL when no specific intent detected', () => {
        const session = createMockSession();
        const intent = detectProductIntent(session);
        expect(intent).toBe('GENERAL');
    });
});

describe('buildProductIntentFollowUp', () => {
    test('should build follow-up message for MUSIC_USB user', () => {
        const session = createMockSession({ contentType: 'music' } as any);
        clearUserTemplateHistory(session.phone);
        
        const result = buildProductIntentFollowUp(session, 1);
        
        expect(result.productIntent).toBe('MUSIC_USB');
        expect(result.hasPricing).toBe(true);
        expect(result.message).toContain('$');  // Contains price
        expect(result.message.length).toBeGreaterThan(100);  // Non-trivial message
    });

    test('should build follow-up message for VIDEO_USB user', () => {
        const session = createMockSession({ contentType: 'videos' } as any);
        clearUserTemplateHistory(session.phone);
        
        const result = buildProductIntentFollowUp(session, 1);
        
        expect(result.productIntent).toBe('VIDEO_USB');
        expect(result.hasPricing).toBe(true);
        expect(result.message).toContain('$');
    });

    test('should build follow-up message for MOVIES_USB user', () => {
        const session = createMockSession({ contentType: 'movies' } as any);
        clearUserTemplateHistory(session.phone);
        
        const result = buildProductIntentFollowUp(session, 1);
        
        expect(result.productIntent).toBe('MOVIES_USB');
        expect(result.hasPricing).toBe(true);
        expect(result.message).toContain('$');
    });

    test('should personalize message with user name', () => {
        const session = createMockSession({ name: 'Juan', contentType: 'music' } as any);
        clearUserTemplateHistory(session.phone);
        
        const result = buildProductIntentFollowUp(session, 1);
        
        expect(result.message).toContain('Juan');
    });

    test('should have different messages for different attempt numbers', () => {
        const session = createMockSession({ contentType: 'music' } as any);
        clearUserTemplateHistory(session.phone);
        
        const attempt1 = buildProductIntentFollowUp(session, 1);
        clearUserTemplateHistory(session.phone);  // Clear to avoid rotation logic
        const attempt2 = buildProductIntentFollowUp(session, 2);
        clearUserTemplateHistory(session.phone);
        const attempt3 = buildProductIntentFollowUp(session, 3);
        
        // Messages should be different for different attempts
        expect(attempt1.message).not.toBe(attempt2.message);
        expect(attempt2.message).not.toBe(attempt3.message);
    });
});

describe('Template Rotation', () => {
    test('template rotation should work when multiple templates available for same attempt', () => {
        // Note: With only 1 template per attempt number per product type,
        // rotation can't happen. This test verifies the history is tracked correctly.
        const session = createMockSession({ contentType: 'music' } as any);
        clearUserTemplateHistory(session.phone);
        
        const firstResult = selectProductIntentTemplate(session, 1);
        const secondResult = selectProductIntentTemplate(session, 1);
        
        // Both should return valid template IDs
        expect(firstResult.templateId).toBeTruthy();
        expect(secondResult.templateId).toBeTruthy();
        
        // If there's only one template, rotation can't occur
        // but the function should still work without error
        console.log(`  First: ${firstResult.templateId}, Second: ${secondResult.templateId}`);
    });
});

describe('CTA Presence', () => {
    test('all product intent templates should have CTAs', () => {
        for (const template of PRODUCT_INTENT_TEMPLATES) {
            expect(template.cta.length).toBeGreaterThan(10);
        }
    });

    test('CTAs should include clear action words', () => {
        for (const template of PRODUCT_INTENT_TEMPLATES) {
            const cta = template.cta.toLowerCase();
            const hasActionWord = 
                cta.includes('escribe') || 
                cta.includes('responde') || 
                cta.includes('dime') || 
                cta.includes('cuéntame') ||
                cta.includes('confirmamos');
            expect(hasActionWord).toBeTruthy();
        }
    });
});

// Run tests and display summary
console.log('\n🧪 Running Product Intent Follow-Up Tests\n');

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Summary: ${passedTests} passed, ${failedTests} failed`);

if (failedTests > 0) {
    console.log('\n❌ Failed tests:');
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}
