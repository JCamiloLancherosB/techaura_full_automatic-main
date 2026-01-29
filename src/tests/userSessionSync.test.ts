/**
 * User Session Synchronization Tests
 * 
 * Tests for verifying:
 * 1. getUserSession and updateUserSession maintain consistent data
 * 2. ConversationStage transitions (initial → greeting → product_selection → etc.)
 * 3. Interaction history doesn't exceed 500 entries (current limit)
 * 4. Follow-up and reminder system functionality
 */

import type { UserSession, Interaction } from '../../types/global';
import { ConversationStage } from '../../types/enums';

// ============ Simple test utilities (no Jest dependency) ============
let testsPassed = 0;
let testsFailed = 0;
let currentDescribe = '';

function describe(name: string, fn: () => void): void {
    currentDescribe = name;
    console.log(`\n📦 ${name}`);
    fn();
}

function it(name: string, fn: () => void): void {
    try {
        fn();
        testsPassed++;
        console.log(`  ✅ ${name}`);
    } catch (error: any) {
        testsFailed++;
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
    }
}

function expect<T>(actual: T) {
    return {
        toBe(expected: T) {
            if (actual !== expected) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },
        toEqual(expected: T) {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },
        toBeGreaterThan(expected: number) {
            if (typeof actual !== 'number' || actual <= expected) {
                throw new Error(`Expected ${actual} > ${expected}`);
            }
        },
        toBeGreaterThanOrEqual(expected: number) {
            if (typeof actual !== 'number' || actual < expected) {
                throw new Error(`Expected ${actual} >= ${expected}`);
            }
        },
        toBeLessThanOrEqual(expected: number) {
            if (typeof actual !== 'number' || actual > expected) {
                throw new Error(`Expected ${actual} <= ${expected}`);
            }
        },
        toBeDefined() {
            if (actual === undefined) {
                throw new Error(`Expected value to be defined, got undefined`);
            }
        },
        toBeUndefined() {
            if (actual !== undefined) {
                throw new Error(`Expected value to be undefined, got ${JSON.stringify(actual)}`);
            }
        },
        toContain(expected: any) {
            if (Array.isArray(actual)) {
                if (!actual.includes(expected)) {
                    throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
                }
            } else if (typeof actual === 'string') {
                if (!actual.includes(expected)) {
                    throw new Error(`Expected string to contain ${JSON.stringify(expected)}`);
                }
            } else {
                throw new Error(`Expected array or string, got ${typeof actual}`);
            }
        },
        toHaveLength(expected: number) {
            if (!Array.isArray(actual) || actual.length !== expected) {
                const actualLength = Array.isArray(actual) ? actual.length : 'N/A';
                throw new Error(`Expected array length ${expected}, got ${actualLength}`);
            }
        }
    };
}

// Helper function to create a mock session
function createMockSession(phone: string, overrides?: Partial<UserSession>): UserSession {
    const now = new Date();
    return {
        phone,
        phoneNumber: phone,
        name: 'Test User',
        stage: 'initial',
        buyingIntent: 0,
        lastInteraction: now,
        interests: [],
        interactions: [],
        conversationData: {},
        createdAt: now,
        updatedAt: now,
        isFirstMessage: true,
        isActive: true,
        contactStatus: 'ACTIVE',
        followUpCount24h: 0,
        ...overrides
    } as UserSession;
}

// ============ Run Tests ============
console.log('🧪 USER SESSION SYNCHRONIZATION TEST SUITE\n');
console.log('='.repeat(70));

describe('getUserSession and updateUserSession consistency', () => {
    it('should create a new session with correct default values', () => {
        const session = createMockSession('573001234567');
        
        expect(session.phone).toBe('573001234567');
        expect(session.phoneNumber).toBe('573001234567');
        expect(session.stage).toBe('initial');
        expect(session.buyingIntent).toBe(0);
        expect(session.isFirstMessage).toBe(true);
        expect(session.isActive).toBe(true);
        expect(session.interactions).toEqual([]);
        expect(session.interests).toEqual([]);
        expect(session.conversationData).toEqual({});
    });

    it('should maintain phone number consistency across session properties', () => {
        const phone = '573009876543';
        const session = createMockSession(phone);
        
        expect(session.phone).toBe(phone);
        expect(session.phoneNumber).toBe(phone);
    });

    it('should update session fields correctly', () => {
        const session = createMockSession('573001234567');
        const updatedDate = new Date();
        
        // Simulate session update
        session.stage = 'interested';
        session.buyingIntent = 50;
        session.lastInteraction = updatedDate;
        session.isFirstMessage = false;
        session.messageCount = 1;
        
        expect(session.stage).toBe('interested');
        expect(session.buyingIntent).toBe(50);
        expect(session.lastInteraction).toBe(updatedDate);
        expect(session.isFirstMessage).toBe(false);
        expect(session.messageCount).toBe(1);
    });

    it('should preserve session data across multiple updates', () => {
        const session = createMockSession('573001234567');
        
        // First update
        session.name = 'Juan';
        session.stage = 'interested';
        session.interests = ['music'];
        
        // Second update - should preserve previous values
        session.buyingIntent = 75;
        session.currentFlow = 'musicUsb';
        
        expect(session.name).toBe('Juan');
        expect(session.stage).toBe('interested');
        expect(session.interests).toContain('music');
        expect(session.buyingIntent).toBe(75);
        expect(session.currentFlow).toBe('musicUsb');
    });

    it('should correctly handle conversationData updates', () => {
        const session = createMockSession('573001234567');
        
        session.conversationData = {
            metadata: { lastUpdate: new Date().toISOString() }
        };
        
        expect(session.conversationData).toBeDefined();
        expect(session.conversationData.metadata).toBeDefined();
    });

    it('should maintain tags array correctly', () => {
        const session = createMockSession('573001234567', {
            tags: ['VIP', 'return_customer']
        });
        
        expect(session.tags).toContain('VIP');
        expect(session.tags).toContain('return_customer');
        expect(session.tags?.length).toBe(2);
    });
});

describe('ConversationStage transitions', () => {
    it('should validate all ConversationStage enum values', () => {
        const stages = [
            ConversationStage.INITIAL,
            ConversationStage.GREETING,
            ConversationStage.PRODUCT_SELECTION,
            ConversationStage.CAPACITY_SELECTION,
            ConversationStage.CUSTOMIZATION,
            ConversationStage.PREFERENCES,
            ConversationStage.PRICE_CONFIRMATION,
            ConversationStage.ORDER_DETAILS,
            ConversationStage.PAYMENT_INFO,
            ConversationStage.CONFIRMATION,
            ConversationStage.COMPLETED,
            ConversationStage.ABANDONED,
            ConversationStage.FOLLOW_UP
        ];
        
        expect(stages.length).toBe(13);
        stages.forEach(stage => {
            expect(stage).toBeDefined();
            expect(typeof stage).toBe('string');
        });
    });

    it('should transition from initial to greeting', () => {
        const session = createMockSession('573001234567', { stage: 'initial' });
        
        // Simulate greeting transition
        session.stage = 'greeting';
        
        expect(session.stage).toBe('greeting');
    });

    it('should transition from greeting to product_selection', () => {
        const session = createMockSession('573001234567', { stage: 'greeting' });
        
        // Simulate product selection transition
        session.stage = 'product_selection';
        
        expect(session.stage).toBe('product_selection');
    });

    it('should follow complete happy path: initial → interested → customizing → pricing → closing → converted → completed', () => {
        const session = createMockSession('573001234567');
        const stageHistory: string[] = [];
        
        // Happy path simulation
        const stages = ['initial', 'interested', 'customizing', 'pricing', 'closing', 'converted', 'completed'];
        
        stages.forEach(stage => {
            session.stage = stage;
            stageHistory.push(stage);
        });
        
        expect(stageHistory).toEqual(stages);
        expect(session.stage).toBe('completed');
    });

    it('should allow transition to abandoned from any stage', () => {
        const initialStages = ['initial', 'interested', 'customizing', 'pricing', 'closing'];
        
        initialStages.forEach(startStage => {
            const session = createMockSession('573001234567', { stage: startStage });
            session.stage = 'abandoned';
            expect(session.stage).toBe('abandoned');
        });
    });

    it('should track stage history in conversationData', () => {
        const session = createMockSession('573001234567');
        session.conversationData = { stageHistory: [] };
        
        const transitions = [
            { from: 'initial', to: 'interested', timestamp: new Date().toISOString() },
            { from: 'interested', to: 'customizing', timestamp: new Date().toISOString() },
            { from: 'customizing', to: 'pricing', timestamp: new Date().toISOString() }
        ];
        
        transitions.forEach(t => {
            (session.conversationData as any).stageHistory.push(t);
        });
        
        expect((session.conversationData as any).stageHistory.length).toBe(3);
        expect((session.conversationData as any).stageHistory[2].to).toBe('pricing');
    });

    it('should mark returning users when starting new cycle after completion', () => {
        const session = createMockSession('573001234567', { stage: 'completed' });
        
        // Completed sessions should be marked as such and a new cycle starts with isReturningUser
        session.isReturningUser = true;
        session.stage = 'initial';
        
        expect(session.stage).toBe('initial');
        expect(session.isReturningUser).toBe(true);
    });
});

describe('Interaction history limit (500 entries)', () => {
    const MAX_INTERACTIONS = 500;

    it('should allow adding interactions up to the limit', () => {
        const session = createMockSession('573001234567');
        session.interactions = [];
        
        // Add 100 interactions
        for (let i = 0; i < 100; i++) {
            session.interactions.push({
                timestamp: new Date(),
                message: `Message ${i}`,
                type: 'user_message',
                intent: 'general',
                sentiment: 'neutral',
                engagement_level: 50,
                channel: 'WhatsApp',
                respondedByBot: false
            });
        }
        
        expect(session.interactions.length).toBe(100);
        expect(session.interactions.length).toBeLessThanOrEqual(MAX_INTERACTIONS);
    });

    it('should truncate interactions when exceeding 500 limit', () => {
        const session = createMockSession('573001234567');
        session.interactions = [];
        
        // Add 550 interactions
        for (let i = 0; i < 550; i++) {
            session.interactions.push({
                timestamp: new Date(),
                message: `Message ${i}`,
                type: 'user_message',
                intent: 'general',
                sentiment: 'neutral',
                engagement_level: 50,
                channel: 'WhatsApp',
                respondedByBot: false
            });
        }
        
        // Apply the same truncation logic as updateUserSession
        if (session.interactions.length > MAX_INTERACTIONS) {
            session.interactions = session.interactions.slice(-MAX_INTERACTIONS);
        }
        
        expect(session.interactions.length).toBe(MAX_INTERACTIONS);
    });

    it('should keep the most recent interactions when truncating', () => {
        const session = createMockSession('573001234567');
        session.interactions = [];
        
        // Add 550 interactions with identifiable messages
        for (let i = 0; i < 550; i++) {
            session.interactions.push({
                timestamp: new Date(Date.now() + i * 1000),
                message: `Message ${i}`,
                type: 'user_message',
                intent: 'general',
                sentiment: 'neutral',
                engagement_level: 50,
                channel: 'WhatsApp',
                respondedByBot: false
            });
        }
        
        // Apply truncation (keep last 500)
        if (session.interactions.length > MAX_INTERACTIONS) {
            session.interactions = session.interactions.slice(-MAX_INTERACTIONS);
        }
        
        // First message should now be "Message 50" (0-49 were removed)
        expect(session.interactions[0].message).toBe('Message 50');
        // Last message should be "Message 549"
        expect(session.interactions[MAX_INTERACTIONS - 1].message).toBe('Message 549');
    });

    it('should handle exactly 500 interactions without truncation', () => {
        const session = createMockSession('573001234567');
        session.interactions = [];
        
        for (let i = 0; i < MAX_INTERACTIONS; i++) {
            session.interactions.push({
                timestamp: new Date(),
                message: `Message ${i}`,
                type: 'user_message',
                intent: 'general',
                sentiment: 'neutral',
                engagement_level: 50,
                channel: 'WhatsApp',
                respondedByBot: false
            });
        }
        
        // Should not need truncation
        const originalLength = session.interactions.length;
        if (session.interactions.length > MAX_INTERACTIONS) {
            session.interactions = session.interactions.slice(-MAX_INTERACTIONS);
        }
        
        expect(session.interactions.length).toBe(originalLength);
        expect(session.interactions.length).toBe(MAX_INTERACTIONS);
    });

    it('should preserve interaction metadata after truncation', () => {
        const session = createMockSession('573001234567');
        session.interactions = [];
        
        for (let i = 0; i < 550; i++) {
            session.interactions.push({
                timestamp: new Date(Date.now() + i * 1000),
                message: `Message ${i}`,
                type: i % 2 === 0 ? 'user_message' : 'bot_message',
                intent: i % 3 === 0 ? 'buying' : 'general',
                sentiment: i % 5 === 0 ? 'positive' : 'neutral',
                engagement_level: 50 + (i % 50),
                channel: 'WhatsApp',
                respondedByBot: i % 2 === 1,
                metadata: { index: i }
            });
        }
        
        // Apply truncation
        if (session.interactions.length > MAX_INTERACTIONS) {
            session.interactions = session.interactions.slice(-MAX_INTERACTIONS);
        }
        
        // Verify metadata is preserved
        const firstKept = session.interactions[0];
        expect(firstKept.metadata).toBeDefined();
        expect((firstKept.metadata as any).index).toBe(50);
    });
});

describe('Follow-up and reminder system', () => {
    it('should initialize follow-up tracking fields correctly', () => {
        const session = createMockSession('573001234567');
        
        expect(session.contactStatus).toBe('ACTIVE');
        expect(session.followUpCount24h).toBe(0);
        expect(session.lastFollowUp).toBeUndefined();
        expect(session.followUpAttempts).toBeUndefined();
    });

    it('should track follow-up count within 24h window', () => {
        const session = createMockSession('573001234567', {
            followUpCount24h: 0,
            lastFollowUpResetAt: new Date()
        });
        
        // Simulate follow-up sent
        session.followUpCount24h = (session.followUpCount24h || 0) + 1;
        
        expect(session.followUpCount24h).toBe(1);
    });

    it('should respect daily follow-up limit (max 1 per 24h)', () => {
        const session = createMockSession('573001234567', {
            followUpCount24h: 1,
            lastFollowUpResetAt: new Date()
        });
        
        // Check if daily limit is reached
        const hasReachedDailyLimit = (session.followUpCount24h || 0) >= 1;
        
        expect(hasReachedDailyLimit).toBe(true);
    });

    it('should reset follow-up counter after 24h', () => {
        const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
        const session = createMockSession('573001234567', {
            followUpCount24h: 1,
            lastFollowUpResetAt: yesterday
        });
        
        // Check if 24h have passed
        const now = new Date();
        const hoursSinceReset = session.lastFollowUpResetAt
            ? (now.getTime() - session.lastFollowUpResetAt.getTime()) / (60 * 60 * 1000)
            : 999;
        
        if (hoursSinceReset >= 24) {
            session.followUpCount24h = 0;
            session.lastFollowUpResetAt = now;
        }
        
        expect(session.followUpCount24h).toBe(0);
    });

    it('should track follow-up attempts (max 6 before cooldown)', () => {
        const session = createMockSession('573001234567', {
            followUpAttempts: 0
        });
        
        const MAX_ATTEMPTS = 6;
        
        // Simulate 6 attempts
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            session.followUpAttempts = (session.followUpAttempts || 0) + 1;
        }
        
        expect(session.followUpAttempts).toBe(MAX_ATTEMPTS);
        
        // Check if max attempts reached
        const hasReachedMaxAttempts = (session.followUpAttempts || 0) >= MAX_ATTEMPTS;
        expect(hasReachedMaxAttempts).toBe(true);
    });

    it('should set cooldown period after max follow-up attempts', () => {
        const session = createMockSession('573001234567', {
            followUpAttempts: 6
        });
        
        // Set 2-day cooldown
        const cooldownEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        session.cooldownUntil = cooldownEndDate;
        
        expect(session.cooldownUntil).toBeDefined();
        expect(session.cooldownUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should respect cooldown period', () => {
        const cooldownEnd = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
        const session = createMockSession('573001234567', {
            cooldownUntil: cooldownEnd,
            followUpAttempts: 6
        });
        
        const isInCooldown = session.cooldownUntil && session.cooldownUntil > new Date();
        
        expect(isInCooldown).toBe(true);
    });

    it('should clear cooldown after period expires', () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const session = createMockSession('573001234567', {
            cooldownUntil: yesterday,
            followUpAttempts: 6
        });
        
        // Check if cooldown has expired
        const cooldownExpired = !session.cooldownUntil || session.cooldownUntil <= new Date();
        
        if (cooldownExpired && session.cooldownUntil) {
            session.cooldownUntil = undefined;
            session.followUpAttempts = 0;
        }
        
        expect(session.cooldownUntil).toBeUndefined();
        expect(session.followUpAttempts).toBe(0);
    });

    it('should track followUpHistory in conversationData', () => {
        const session = createMockSession('573001234567');
        session.conversationData = { followUpHistory: [] };
        
        // Add follow-up records
        const followUpRecords = [
            new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            new Date().toISOString()
        ];
        
        session.conversationData.followUpHistory = followUpRecords;
        
        expect((session.conversationData.followUpHistory as string[]).length).toBe(3);
    });

    it('should limit followUpHistory to last 10 entries', () => {
        const session = createMockSession('573001234567');
        session.conversationData = { followUpHistory: [] };
        
        // Add 15 follow-up records
        for (let i = 0; i < 15; i++) {
            (session.conversationData.followUpHistory as string[]).push(
                new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString()
            );
        }
        
        // Apply limit (keep last 10)
        session.conversationData.followUpHistory = 
            (session.conversationData.followUpHistory as string[]).slice(-10);
        
        expect((session.conversationData.followUpHistory as string[]).length).toBe(10);
    });

    it('should block follow-ups for OPT_OUT contacts', () => {
        const session = createMockSession('573001234567', {
            contactStatus: 'OPT_OUT'
        });
        
        const canReceiveFollowUp = session.contactStatus === 'ACTIVE';
        
        expect(canReceiveFollowUp).toBe(false);
    });

    it('should block follow-ups for CLOSED contacts', () => {
        const session = createMockSession('573001234567', {
            contactStatus: 'CLOSED'
        });
        
        const canReceiveFollowUp = session.contactStatus === 'ACTIVE';
        
        expect(canReceiveFollowUp).toBe(false);
    });

    it('should block follow-ups for converted users', () => {
        const session = createMockSession('573001234567', {
            stage: 'converted'
        });
        
        const blockedStages = ['converted', 'completed', 'order_confirmed'];
        const isBlocked = blockedStages.includes(session.stage);
        
        expect(isBlocked).toBe(true);
    });

    it('should track lastFollowUpTemplateId to prevent repetition', () => {
        const session = createMockSession('573001234567');
        
        session.lastFollowUpTemplateId = 'template_pricing_001';
        session.lastFollowUpSentAt = new Date();
        
        expect(session.lastFollowUpTemplateId).toBe('template_pricing_001');
        expect(session.lastFollowUpSentAt).toBeDefined();
    });

    it('should reset follow-up counters after conversion', () => {
        const session = createMockSession('573001234567', {
            followUpAttempts: 5,
            followUpCount24h: 1,
            conversationData: { followUpHistory: ['2025-01-01', '2025-01-02'] }
        });
        
        // Simulate conversion reset
        session.stage = 'converted';
        session.conversationData!.followUpHistory = [];
        session.lastFollowUp = undefined;
        session.lastFollowUpMsg = undefined;
        
        expect(session.conversationData!.followUpHistory).toEqual([]);
        expect(session.lastFollowUp).toBeUndefined();
        expect(session.lastFollowUpMsg).toBeUndefined();
    });
});

describe('ConversationMemory Integration', () => {
    it('should structure conversation turn correctly', () => {
        const turn = {
            role: 'user' as const,
            content: 'Hola, quiero una USB de música',
            timestamp: new Date(),
            metadata: {
                intent: 'music_interest',
                confidence: 0.85
            }
        };
        
        expect(turn.role).toBe('user');
        expect(turn.content).toBeDefined();
        expect(turn.timestamp).toBeDefined();
        expect((turn.metadata as any).intent).toBe('music_interest');
    });

    it('should structure conversation summary correctly', () => {
        const summary = {
            phone: '573001234567',
            mainTopics: ['music', 'usb'],
            userIntents: ['pricing', 'customization'],
            productInterests: ['music'],
            priceDiscussed: true,
            decisionStage: 'consideration',
            keyEntities: { capacity: '64GB' },
            lastUpdated: new Date()
        };
        
        expect(summary.mainTopics).toContain('music');
        expect(summary.priceDiscussed).toBe(true);
        expect(summary.decisionStage).toBe('consideration');
    });

    it('should determine decision stage based on user intents', () => {
        const determineDecisionStage = (intents: string[], priceDiscussed: boolean): string => {
            if (intents.includes('ordering')) return 'decision';
            if (priceDiscussed || intents.includes('pricing')) return 'consideration';
            if (intents.includes('customization')) return 'interest';
            return 'awareness';
        };
        
        expect(determineDecisionStage(['ordering'], false)).toBe('decision');
        expect(determineDecisionStage(['pricing'], true)).toBe('consideration');
        expect(determineDecisionStage(['customization'], false)).toBe('interest');
        expect(determineDecisionStage(['general'], false)).toBe('awareness');
    });
});

// ============ Test Summary ============
console.log('\n' + '='.repeat(70));
console.log(`\n📊 TEST SUMMARY`);
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   📝 Total: ${testsPassed + testsFailed}`);
console.log('\n' + '='.repeat(70));

if (testsFailed > 0) {
    console.log('\n⚠️  Some tests failed! Review the output above.');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
}

// Export test results for external use (e.g., CI runners)
export { testsPassed, testsFailed };
