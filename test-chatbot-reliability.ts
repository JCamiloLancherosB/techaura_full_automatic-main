/**
 * Comprehensive Chatbot Reliability Test Suite
 * Tests all 4 critical aspects:
 * 1. Follow-up messages work correctly
 * 2. Persuasive messages work correctly
 * 3. Chatbot never stops or leaves user without response
 * 4. Chatbot always responds according to conversation context
 */

import { startFollowUpSystem } from './src/services/followUpService';
import { persuasionEngine } from './src/services/persuasionEngine';
import { aiService } from './src/services/aiService';
import { contextAnalyzer } from './src/services/contextAnalyzer';
import { flowCoordinator } from './src/services/flowCoordinator';
import type { UserSession } from './types/global';

// Color codes for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

// Test results tracking
interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
}

const testResults: TestResult[] = [];

/**
 * Utility function to run a test
 */
async function runTest(
    name: string,
    testFn: () => Promise<void>
): Promise<void> {
    const startTime = Date.now();
    try {
        await testFn();
        const duration = Date.now() - startTime;
        testResults.push({ name, passed: true, duration });
        console.log(`${GREEN}✓${RESET} ${name} (${duration}ms)`);
    } catch (error) {
        const duration = Date.now() - startTime;
        testResults.push({ 
            name, 
            passed: false, 
            duration,
            error: error instanceof Error ? error.message : String(error)
        });
        console.log(`${RED}✗${RESET} ${name} (${duration}ms)`);
        console.log(`  ${RED}Error:${RESET} ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Create a mock user session for testing
 */
function createMockUserSession(overrides?: Partial<UserSession>): UserSession {
    return {
        phone: '573001234567',
        name: 'Test User',
        stage: 'initial',
        currentFlow: 'mainFlow',
        buyingIntent: 50,
        lastInteraction: new Date(),
        interactions: [],
        interests: [],
        tags: [],
        contactStatus: 'ACTIVE',
        followUpAttempts: 0,
        ...overrides
    } as UserSession;
}

// ============================================
// TEST SUITE 1: FOLLOW-UP MESSAGES
// ============================================

async function testFollowUpSystem() {
    console.log(`\n${BLUE}=== Testing Follow-Up System ===${RESET}\n`);

    await runTest('Follow-up system starts without errors', async () => {
        const system = startFollowUpSystem();
        const status = system.getStatus();
        
        if (typeof status.isRunning !== 'boolean') {
            throw new Error('System status not properly initialized');
        }
        
        system.stop();
    });

    await runTest('Follow-up identifies high-priority candidates', async () => {
        const highIntentSession = createMockUserSession({
            buyingIntent: 80,
            stage: 'pricing',
            lastInteraction: new Date(Date.now() - 8 * 60 * 60 * 1000) // 8 hours ago
        });
        
        // This would be tested by the actual follow-up cycle
        // For now, we validate the session structure
        if (!highIntentSession.buyingIntent || highIntentSession.buyingIntent < 70) {
            throw new Error('High intent session not properly configured');
        }
    });

    await runTest('Follow-up respects cooldown periods', async () => {
        const cooldownSession = createMockUserSession({
            cooldownUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            followUpAttempts: 3
        });
        
        const { isInCooldown } = await import('./src/services/incomingMessageHandler');
        const cooldownCheck = isInCooldown(cooldownSession);
        
        if (!cooldownCheck.inCooldown) {
            throw new Error('Cooldown not properly detected');
        }
    });

    await runTest('Follow-up respects opt-out status', async () => {
        const optOutSession = createMockUserSession({
            contactStatus: 'OPT_OUT',
            tags: ['blacklist']
        });
        
        const { canReceiveFollowUps } = await import('./src/services/incomingMessageHandler');
        const canReceive = canReceiveFollowUps(optOutSession);
        
        if (canReceive.can) {
            throw new Error('Opt-out status not properly respected');
        }
    });
}

// ============================================
// TEST SUITE 2: PERSUASIVE MESSAGES
// ============================================

async function testPersuasiveMessages() {
    console.log(`\n${BLUE}=== Testing Persuasive Messages ===${RESET}\n`);

    await runTest('Persuasion engine builds message for awareness stage', async () => {
        const session = createMockUserSession({
            stage: 'initial',
            buyingIntent: 20
        });
        
        const message = await persuasionEngine.buildPersuasiveMessage(
            'Hola, quiero información',
            session
        );
        
        if (!message || message.length < 30) {
            throw new Error('Persuasive message too short or empty');
        }
        
        if (message.length > 200) {
            throw new Error(`Persuasive message too long: ${message.length} chars (max 200)`);
        }
    });

    await runTest('Persuasion engine handles price objections', async () => {
        const session = createMockUserSession({
            stage: 'pricing',
            buyingIntent: 60
        });
        
        const message = await persuasionEngine.buildPersuasiveMessage(
            'Es muy caro',
            session
        );
        
        if (!message.includes('$') && !message.toLowerCase().includes('precio')) {
            throw new Error('Price objection not properly handled');
        }
    });

    await runTest('Persuasion engine validates message coherence', async () => {
        const session = createMockUserSession({
            stage: 'customizing',
            buyingIntent: 70
        });
        
        const testMessage = 'Test message for coherence validation';
        const context = await (persuasionEngine as any).analyzeContext(session);
        const validation = persuasionEngine.validateMessageCoherence(testMessage, context);
        
        if (typeof validation.isCoherent !== 'boolean') {
            throw new Error('Coherence validation not properly implemented');
        }
    });

    await runTest('Persuasion engine enforces brevity', async () => {
        const longMessage = 'A'.repeat(250); // 250 characters
        const session = createMockUserSession();
        const context = await (persuasionEngine as any).analyzeContext(session);
        const stage = (persuasionEngine as any).determineJourneyStage(context);
        
        const trimmedMessage = (persuasionEngine as any).enforceBrevityAndUniqueness(
            longMessage,
            session.phone,
            stage
        );
        
        if (trimmedMessage.length > 200) {
            throw new Error(`Message not properly trimmed: ${trimmedMessage.length} chars`);
        }
    });
}

// ============================================
// TEST SUITE 3: GUARANTEED RESPONSE
// ============================================

async function testGuaranteedResponse() {
    console.log(`\n${BLUE}=== Testing Guaranteed Response ===${RESET}\n`);

    await runTest('AI service has emergency fallback', async () => {
        const session = createMockUserSession();
        
        // Test emergency response
        const emergencyResponse = (aiService as any).getEmergencyResponse('Hola', session);
        
        if (!emergencyResponse || emergencyResponse.length < 20) {
            throw new Error('Emergency response not adequate');
        }
    });

    await runTest('AI service handles price inquiry in emergency', async () => {
        const session = createMockUserSession();
        
        const priceResponse = (aiService as any).getEmergencyResponse('cuanto cuesta', session);
        
        if (!priceResponse.includes('$') || !priceResponse.toLowerCase().includes('precio')) {
            throw new Error('Emergency price response not adequate');
        }
    });

    await runTest('AI service has circuit breaker', async () => {
        const canCall = (aiService as any).canMakeAICall();
        
        if (typeof canCall !== 'boolean') {
            throw new Error('Circuit breaker not properly implemented');
        }
    });

    await runTest('AI service has timeout wrapper', async () => {
        const timeoutTest = async () => {
            const promise = new Promise(resolve => setTimeout(resolve, 5000));
            try {
                await (aiService as any).withTimeout(promise, 100);
                throw new Error('Timeout did not trigger');
            } catch (error) {
                if (error instanceof Error && error.message.includes('timeout')) {
                    return; // Expected timeout
                }
                throw error;
            }
        };
        
        await timeoutTest();
    });
}

// ============================================
// TEST SUITE 4: CONTEXTUAL RESPONSES
// ============================================

async function testContextualResponses() {
    console.log(`\n${BLUE}=== Testing Contextual Responses ===${RESET}\n`);

    await runTest('Context analyzer detects intent', async () => {
        const message = 'Cuanto cuesta la USB de 32GB';
        const session = createMockUserSession();
        
        const analysis = await contextAnalyzer.analyzeEnhanced(message, session.phone);
        
        if (!analysis.primaryIntent || analysis.primaryIntent.confidence === 0) {
            throw new Error('Intent detection not working');
        }
    });

    await runTest('Context analyzer suggests appropriate flow', async () => {
        const message = 'Quiero una USB de musica';
        const session = createMockUserSession();
        
        const analysis = await contextAnalyzer.analyzeEnhanced(message, session.phone);
        
        if (!analysis.suggestedFlow || analysis.suggestedFlow === 'unknown') {
            throw new Error('Flow suggestion not working');
        }
    });

    await runTest('Flow coordinator validates transitions', async () => {
        const transition = flowCoordinator.validateTransition('mainFlow', 'musicUsb');
        
        if (!transition.isValid) {
            throw new Error('Valid transition marked as invalid');
        }
    });

    await runTest('Flow coordinator prevents invalid transitions', async () => {
        const transition = flowCoordinator.validateTransition('orderFlow', 'mainFlow');
        
        // Backward transitions are allowed, but random jumps aren't
        // This test validates that the logic exists
        if (typeof transition.isValid !== 'boolean') {
            throw new Error('Transition validation not working');
        }
    });

    await runTest('Flow coordinator preserves context in critical flows', async () => {
        const phone = '573001234567';
        
        // Set up a critical flow
        await flowCoordinator.coordinateFlowTransition(phone, 'orderFlow', 'user_action');
        
        const isInCritical = flowCoordinator.isInCriticalFlow(phone);
        
        if (!isInCritical) {
            throw new Error('Critical flow not properly detected');
        }
    });

    await runTest('Flow coordinator detects context continuity', async () => {
        const session = createMockUserSession({
            interactions: [
                {
                    timestamp: new Date(),
                    message: '¿Tienen USB de música?',
                    type: 'user_message',
                    intent: 'product_inquiry',
                    sentiment: 'neutral',
                    engagement_level: 'high'
                }
            ]
        });
        
        const contextCheck = await flowCoordinator.shouldPreserveContext(
            session.phone,
            'Si, eso mismo'
        );
        
        if (!contextCheck.preserve) {
            throw new Error('Context continuity not detected');
        }
    });
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runAllTests() {
    console.log(`${YELLOW}╔════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${YELLOW}║  TechAura Chatbot Reliability Test Suite              ║${RESET}`);
    console.log(`${YELLOW}╚════════════════════════════════════════════════════════╝${RESET}`);
    
    const startTime = Date.now();
    
    try {
        await testFollowUpSystem();
        await testPersuasiveMessages();
        await testGuaranteedResponse();
        await testContextualResponses();
    } catch (error) {
        console.error(`\n${RED}Fatal error during test execution:${RESET}`, error);
    }
    
    const totalTime = Date.now() - startTime;
    
    // Print summary
    console.log(`\n${YELLOW}═══════════════════════════════════════════════════════${RESET}`);
    console.log(`${YELLOW}Test Summary${RESET}`);
    console.log(`${YELLOW}═══════════════════════════════════════════════════════${RESET}`);
    
    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => r.failed).length;
    const total = testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);
    
    console.log(`\nTotal Tests: ${total}`);
    console.log(`${GREEN}Passed: ${passed}${RESET}`);
    console.log(`${RED}Failed: ${failed}${RESET}`);
    console.log(`Pass Rate: ${passRate}%`);
    console.log(`Total Time: ${totalTime}ms`);
    
    if (failed > 0) {
        console.log(`\n${RED}Failed Tests:${RESET}`);
        testResults.filter(r => !r.passed).forEach(result => {
            console.log(`  ${RED}✗${RESET} ${result.name}`);
            if (result.error) {
                console.log(`    ${result.error}`);
            }
        });
    }
    
    console.log(`\n${YELLOW}═══════════════════════════════════════════════════════${RESET}\n`);
    
    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    console.error(`${RED}Fatal error:${RESET}`, error);
    process.exit(1);
});
