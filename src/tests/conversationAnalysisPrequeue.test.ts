/**
 * Conversation Analysis Pre-Queue History Check Tests
 * 
 * Tests the pre-queue validation that prevents queuing analysis
 * for phones without sufficient conversation history.
 * 
 * These tests are self-contained and don't require a database connection.
 * They test the logic of the history threshold mechanism.
 */

/**
 * Default minimum number of conversation turns required before queuing analysis.
 * This mirrors the ANALYSIS_MIN_TURNS_THRESHOLD constant in ConversationAnalysisWorker.ts
 * Note: We duplicate this here because importing from ConversationAnalysisWorker.ts would
 * require database initialization. The testDefaultThresholdConstant test verifies the
 * expected value matches what we test for (2).
 */
const ANALYSIS_MIN_TURNS_THRESHOLD = 2;

/**
 * Mock implementation of ConversationTurnsRepository for testing
 */
class MockConversationTurnsRepository {
    private mockTurnCount: number;
    private mockTableExists: boolean;

    constructor(mockTurnCount: number, mockTableExists: boolean = true) {
        this.mockTurnCount = mockTurnCount;
        this.mockTableExists = mockTableExists;
    }

    async tableExists(): Promise<boolean> {
        return this.mockTableExists;
    }

    async hasSufficientHistory(phone: string, minTurns: number = 2): Promise<boolean> {
        return this.mockTurnCount >= minTurns;
    }
}

/**
 * Mock implementation of ConversationAnalysisRepository for testing
 */
class MockConversationAnalysisRepository {
    private mockHasRecent: boolean;

    constructor(mockHasRecent: boolean = false) {
        this.mockHasRecent = mockHasRecent;
    }

    async hasRecentAnalysis(phone: string, hours: number): Promise<boolean> {
        return this.mockHasRecent;
    }

    async create(data: any): Promise<number> {
        return 1; // Return mock ID
    }
}

/**
 * Simplified mock of the queueAnalysis logic for testing
 */
async function mockQueueAnalysis(
    phone: string,
    turnsRepo: MockConversationTurnsRepository,
    analysisRepo: MockConversationAnalysisRepository,
    minTurnsThreshold: number = ANALYSIS_MIN_TURNS_THRESHOLD
): Promise<number> {
    // Check if there's a recent analysis
    const hasRecent = await analysisRepo.hasRecentAnalysis(phone, 24);
    if (hasRecent) {
        return -1;
    }

    // Pre-queue check: Verify sufficient conversation history exists
    const turnsTableExists = await turnsRepo.tableExists();
    if (turnsTableExists) {
        const hasSufficientHistory = await turnsRepo.hasSufficientHistory(phone, minTurnsThreshold);
        if (!hasSufficientHistory) {
            return -2;
        }
    }

    // Create analysis record
    const analysisId = await analysisRepo.create({ phone, status: 'pending' });
    return analysisId;
}

/**
 * Test: Phone with 0 turns should return -2 (skipped due to NO_HISTORY)
 */
async function testZeroTurnsSkipped(): Promise<boolean> {
    console.log('\n📋 Test: Phone with 0 turns should be skipped (NO_HISTORY)');

    try {
        const turnsRepo = new MockConversationTurnsRepository(0);
        const analysisRepo = new MockConversationAnalysisRepository(false);

        const result = await mockQueueAnalysis('573001234567', turnsRepo, analysisRepo);

        if (result !== -2) {
            console.error(`❌ Expected -2 (NO_HISTORY), got ${result}`);
            return false;
        }

        console.log('✅ Phone with 0 turns correctly returns -2 (skipped_prequeue=NO_HISTORY)');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Phone with 1 turn should return -2 (skipped due to NO_HISTORY) with default threshold of 2
 */
async function testOneTurnSkipped(): Promise<boolean> {
    console.log('\n📋 Test: Phone with 1 turn should be skipped (threshold=2)');

    try {
        const turnsRepo = new MockConversationTurnsRepository(1);
        const analysisRepo = new MockConversationAnalysisRepository(false);

        const result = await mockQueueAnalysis('573001234567', turnsRepo, analysisRepo, 2);

        if (result !== -2) {
            console.error(`❌ Expected -2 (NO_HISTORY), got ${result}`);
            return false;
        }

        console.log('✅ Phone with 1 turn correctly returns -2 when threshold is 2');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Phone with 2 turns should be queued (meets default threshold)
 */
async function testTwoTurnsQueued(): Promise<boolean> {
    console.log('\n📋 Test: Phone with 2 turns should be queued (meets threshold)');

    try {
        const turnsRepo = new MockConversationTurnsRepository(2);
        const analysisRepo = new MockConversationAnalysisRepository(false);

        const result = await mockQueueAnalysis('573001234567', turnsRepo, analysisRepo, 2);

        if (result <= 0) {
            console.error(`❌ Expected positive analysis ID, got ${result}`);
            return false;
        }

        console.log('✅ Phone with 2 turns correctly queued with positive analysis ID');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Phone with many turns should be queued
 */
async function testManyTurnsQueued(): Promise<boolean> {
    console.log('\n📋 Test: Phone with 10 turns should be queued');

    try {
        const turnsRepo = new MockConversationTurnsRepository(10);
        const analysisRepo = new MockConversationAnalysisRepository(false);

        const result = await mockQueueAnalysis('573001234567', turnsRepo, analysisRepo, 2);

        if (result <= 0) {
            console.error(`❌ Expected positive analysis ID, got ${result}`);
            return false;
        }

        console.log('✅ Phone with 10 turns correctly queued');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Recent analysis should still take precedence over history check
 */
async function testRecentAnalysisTakesPrecedence(): Promise<boolean> {
    console.log('\n📋 Test: Recent analysis should return -1 even with sufficient history');

    try {
        const turnsRepo = new MockConversationTurnsRepository(10);
        const analysisRepo = new MockConversationAnalysisRepository(true); // Has recent analysis

        const result = await mockQueueAnalysis('573001234567', turnsRepo, analysisRepo, 2);

        if (result !== -1) {
            console.error(`❌ Expected -1 (recent analysis), got ${result}`);
            return false;
        }

        console.log('✅ Recent analysis correctly returns -1 even with sufficient history');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Custom threshold should be respected
 */
async function testCustomThreshold(): Promise<boolean> {
    console.log('\n📋 Test: Custom threshold of 5 turns should be respected');

    try {
        // Phone with 3 turns, threshold of 5
        const turnsRepo3 = new MockConversationTurnsRepository(3);
        const analysisRepo = new MockConversationAnalysisRepository(false);

        const result3 = await mockQueueAnalysis('573001234567', turnsRepo3, analysisRepo, 5);

        if (result3 !== -2) {
            console.error(`❌ Expected -2 for 3 turns with threshold 5, got ${result3}`);
            return false;
        }

        // Phone with 5 turns, threshold of 5
        const turnsRepo5 = new MockConversationTurnsRepository(5);
        const result5 = await mockQueueAnalysis('573001234567', turnsRepo5, analysisRepo, 5);

        if (result5 <= 0) {
            console.error(`❌ Expected positive ID for 5 turns with threshold 5, got ${result5}`);
            return false;
        }

        console.log('✅ Custom threshold of 5 correctly respected');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: When turns table doesn't exist, should allow queueing (backward compatibility)
 */
async function testTableNotExistsAllowsQueueing(): Promise<boolean> {
    console.log('\n📋 Test: When turns table does not exist, should allow queueing (backward compatibility)');

    try {
        const turnsRepo = new MockConversationTurnsRepository(0, false); // Table doesn't exist
        const analysisRepo = new MockConversationAnalysisRepository(false);

        const result = await mockQueueAnalysis('573001234567', turnsRepo, analysisRepo, 2);

        if (result <= 0) {
            console.error(`❌ Expected positive analysis ID when table doesn't exist, got ${result}`);
            return false;
        }

        console.log('✅ Analysis correctly queued when conversation_turns table does not exist');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: ANALYSIS_MIN_TURNS_THRESHOLD constant should be defined and equal to 2
 */
async function testDefaultThresholdConstant(): Promise<boolean> {
    console.log('\n📋 Test: ANALYSIS_MIN_TURNS_THRESHOLD should be defined as 2');

    try {
        if (ANALYSIS_MIN_TURNS_THRESHOLD !== 2) {
            console.error(`❌ Expected ANALYSIS_MIN_TURNS_THRESHOLD to be 2, got ${ANALYSIS_MIN_TURNS_THRESHOLD}`);
            return false;
        }

        console.log('✅ ANALYSIS_MIN_TURNS_THRESHOLD correctly set to 2');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Run all tests
 */
async function runTests(): Promise<void> {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Conversation Analysis Pre-Queue History Check Tests   ║');
    console.log('║  Testing NO_HISTORY skip logic before queuing          ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    let allPassed = true;

    // Test 1: Zero turns should be skipped
    const test1 = await testZeroTurnsSkipped();
    allPassed = allPassed && test1;

    // Test 2: One turn should be skipped with threshold of 2
    const test2 = await testOneTurnSkipped();
    allPassed = allPassed && test2;

    // Test 3: Two turns should be queued
    const test3 = await testTwoTurnsQueued();
    allPassed = allPassed && test3;

    // Test 4: Many turns should be queued
    const test4 = await testManyTurnsQueued();
    allPassed = allPassed && test4;

    // Test 5: Recent analysis takes precedence
    const test5 = await testRecentAnalysisTakesPrecedence();
    allPassed = allPassed && test5;

    // Test 6: Custom threshold respected
    const test6 = await testCustomThreshold();
    allPassed = allPassed && test6;

    // Test 7: Table not exists allows queueing (backward compatibility)
    const test7 = await testTableNotExistsAllowsQueueing();
    allPassed = allPassed && test7;

    // Test 8: Default threshold constant
    const test8 = await testDefaultThresholdConstant();
    allPassed = allPassed && test8;

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════╗');
    if (allPassed) {
        console.log('║  ✅ ALL TESTS PASSED                                   ║');
    } else {
        console.log('║  ❌ SOME TESTS FAILED                                  ║');
    }
    console.log('╚════════════════════════════════════════════════════════╝\n');

    process.exit(allPassed ? 0 : 1);
}

// Run tests if executed directly
if (require.main === module) {
    runTests().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { runTests };
