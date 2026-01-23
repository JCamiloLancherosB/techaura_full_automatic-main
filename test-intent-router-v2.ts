/**
 * Test Intent Router v2: Deterministic First, AI Second
 * 
 * Tests the hybrid intent routing implementation
 */

import { HybridIntentRouter } from '../src/services/hybridIntentRouter';
import { UserSession } from '../types/global';

// Mock user session helper
function createMockSession(overrides: Partial<UserSession> = {}): UserSession {
    return {
        phone: '573001234567',
        phoneNumber: '573001234567',
        name: 'Test User',
        buyingIntent: 50,
        stage: 'initial',
        interests: [],
        interactions: [],
        conversationData: {},
        lastInteraction: new Date(),
        lastFollowUp: new Date(),
        followUpSpamCount: 0,
        totalOrders: 0,
        location: '',
        email: '',
        pushToken: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        isActive: true,
        isNewUser: true,
        isReturningUser: false,
        isFirstMessage: true,
        ...overrides
    } as UserSession;
}

async function runTests() {
    console.log('🧪 Starting Intent Router v2 Tests\n');

    const router = HybridIntentRouter.getInstance();
    let passedTests = 0;
    let failedTests = 0;

    // Test 1: Strong keyword - "usb"
    console.log('📋 Test 1: Strong keyword "usb"');
    try {
        const session = createMockSession();
        const result = await router.route('quiero una usb de música', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        if (result.intent === 'usb_inquiry' && result.confidence >= 85 && result.source === 'rule') {
            console.log('   ✅ PASS\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Expected usb_inquiry with high confidence from rule\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 2: Strong keyword - "películas"
    console.log('📋 Test 2: Strong keyword "películas"');
    try {
        const session = createMockSession();
        const result = await router.route('quiero ver películas', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        if (result.intent === 'movies' && result.confidence >= 85 && result.source === 'rule') {
            console.log('   ✅ PASS\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Expected movies with high confidence from rule\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 3: Strong keyword - "audífonos"
    console.log('📋 Test 3: Strong keyword "audífonos"');
    try {
        const session = createMockSession();
        const result = await router.route('necesito audífonos bluetooth', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        if (result.intent === 'headphones' && result.confidence >= 85 && result.source === 'rule') {
            console.log('   ✅ PASS\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Expected headphones with high confidence from rule\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 4: Context preservation - "8GB" in USB flow
    console.log('📋 Test 4: Context preservation - "8GB" in USB flow');
    try {
        const session = createMockSession({
            currentFlow: 'musicUsb',
            stage: 'awaiting_capacity',
            lastInteraction: new Date()
        });
        const result = await router.route('8GB', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        console.log(`   Should Route: ${result.shouldRoute}`);
        if (result.source === 'context' && !result.shouldRoute) {
            console.log('   ✅ PASS - Stayed in current flow\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Should have stayed in current flow\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 5: Pricing intent
    console.log('📋 Test 5: Pricing intent');
    try {
        const session = createMockSession();
        const result = await router.route('cuánto cuesta?', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        if (result.intent === 'pricing' && result.confidence >= 85) {
            console.log('   ✅ PASS\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Expected pricing intent\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 6: Catalog intent
    console.log('📋 Test 6: Catalog intent');
    try {
        const session = createMockSession();
        const result = await router.route('muéstrame el catálogo', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        if (result.intent === 'catalog' && result.confidence >= 80) {
            console.log('   ✅ PASS\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Expected catalog intent\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 7: USB with capacity specification
    console.log('📋 Test 7: USB with capacity - "usb 32"');
    try {
        const session = createMockSession();
        const result = await router.route('quiero una usb de 32gb', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        if (result.intent === 'usb_inquiry' && result.confidence >= 85) {
            console.log('   ✅ PASS\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Expected usb_inquiry\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 8: Context preservation with capacity in active stage
    console.log('📋 Test 8: "32GB" in customizing stage should stay in flow');
    try {
        const session = createMockSession({
            currentFlow: 'videosUsb',
            stage: 'customizing',
            lastInteraction: new Date()
        });
        const result = await router.route('32gb', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        console.log(`   Should Route: ${result.shouldRoute}`);
        if (result.source === 'context' && !result.shouldRoute) {
            console.log('   ✅ PASS - Stayed in current flow\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Should have stayed in current flow\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 9: Affirmation in active flow
    console.log('📋 Test 9: Affirmation "sí" should stay in current flow');
    try {
        const session = createMockSession({
            currentFlow: 'musicUsb',
            stage: 'pricing',
            lastInteraction: new Date()
        });
        const result = await router.route('sí', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        console.log(`   Should Route: ${result.shouldRoute}`);
        if (result.source === 'context' && !result.shouldRoute) {
            console.log('   ✅ PASS - Stayed in current flow\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Should have stayed in current flow\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Test 10: Menu fallback for unclear message
    console.log('📋 Test 10: Menu fallback for unclear message');
    try {
        const session = createMockSession();
        const result = await router.route('xyz abc 123', session);
        console.log(`   Intent: ${result.intent}, Confidence: ${result.confidence}%, Source: ${result.source}`);
        if (result.source === 'menu' || result.confidence < 50) {
            console.log('   ✅ PASS - Low confidence triggers menu fallback\n');
            passedTests++;
        } else {
            console.log('   ❌ FAIL - Should have triggered menu fallback\n');
            failedTests++;
        }
    } catch (error) {
        console.log(`   ❌ FAIL - Error: ${error}\n`);
        failedTests++;
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Test Summary');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
    console.log('='.repeat(50) + '\n');

    process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});
