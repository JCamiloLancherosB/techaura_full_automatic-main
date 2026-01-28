/**
 * Conversation Analysis Repository Tests
 * 
 * Tests schema feature detection and backward compatibility
 * when skip_reason column is missing from the database
 * 
 * These tests are self-contained and don't require a database connection.
 * They test the logic of the schema feature detection mechanism.
 */

/**
 * Mock implementation of ConversationAnalysisRepository for testing
 * This avoids importing the actual repository which requires database connection
 */
class MockConversationAnalysisRepository {
    private tableName = 'conversation_analysis';
    private schemaCache: { hasSkipReasonColumn?: boolean; checkedAt?: Date } = {};
    private mockColumnExists: boolean;

    constructor(mockColumnExists: boolean) {
        this.mockColumnExists = mockColumnExists;
    }

    /**
     * Check if skip_reason column exists (cached check)
     * Schema feature detection to maintain backward compatibility
     */
    async hasSkipReasonColumn(): Promise<boolean> {
        // Return cached result if available
        if (this.schemaCache.hasSkipReasonColumn !== undefined) {
            return this.schemaCache.hasSkipReasonColumn;
        }

        // Simulate checking the database schema
        this.schemaCache.hasSkipReasonColumn = this.mockColumnExists;
        this.schemaCache.checkedAt = new Date();
        
        if (!this.mockColumnExists) {
            console.warn('⚠️  ConversationAnalysisRepository: skip_reason column not found. Running in compatibility mode.');
        }
        
        return this.mockColumnExists;
    }

    /**
     * Reset schema cache (useful for testing or after migrations)
     */
    resetSchemaCache(): void {
        this.schemaCache = {};
    }

    /**
     * Simulates the update method with schema feature detection
     * Returns the data that would be sent to the database
     */
    async simulateUpdate(id: number, updates: Record<string, any>): Promise<Record<string, any>> {
        const dataToUpdate: any = {
            ...updates,
            updated_at: new Date()
        };

        // Schema feature detection: check if skip_reason column exists
        // If it doesn't, omit it from the update to prevent "Unknown column" errors
        if (updates.skip_reason !== undefined) {
            const hasColumn = await this.hasSkipReasonColumn();
            if (!hasColumn) {
                // Remove skip_reason from update data to prevent crash
                delete dataToUpdate.skip_reason;
                console.warn(`⚠️  Omitting skip_reason from update (column not in schema). Value was: ${updates.skip_reason}`);
            }
        }

        return dataToUpdate;
    }

    getSchemaCache(): { hasSkipReasonColumn?: boolean; checkedAt?: Date } {
        return this.schemaCache;
    }
}

/**
 * Test: Repository should omit skip_reason when column doesn't exist
 */
async function testSkipReasonOmittedWhenColumnMissing(): Promise<boolean> {
    console.log('\n📋 Test: skip_reason omitted when column is missing');

    try {
        // Create mock repo without skip_reason column
        const repo = new MockConversationAnalysisRepository(false);

        const updates = {
            status: 'skipped',
            summary: 'Test summary',
            skip_reason: 'NO_HISTORY'
        };

        const result = await repo.simulateUpdate(1, updates);

        // Verify skip_reason was removed
        if (result.skip_reason !== undefined) {
            console.error('❌ skip_reason should have been removed but was not');
            return false;
        }

        if (result.status !== 'skipped') {
            console.error('❌ status should still be present');
            return false;
        }

        if (result.summary !== 'Test summary') {
            console.error('❌ summary should still be present');
            return false;
        }

        console.log('✅ skip_reason correctly omitted when column is missing');
        console.log('   - status: preserved');
        console.log('   - summary: preserved');
        console.log('   - skip_reason: omitted');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Repository should include skip_reason when column exists
 */
async function testSkipReasonIncludedWhenColumnExists(): Promise<boolean> {
    console.log('\n📋 Test: skip_reason included when column exists');

    try {
        // Create mock repo with skip_reason column
        const repo = new MockConversationAnalysisRepository(true);

        const updates = {
            status: 'skipped',
            summary: 'Test summary',
            skip_reason: 'NO_HISTORY'
        };

        const result = await repo.simulateUpdate(1, updates);

        // Verify skip_reason was preserved
        if (result.skip_reason !== 'NO_HISTORY') {
            console.error('❌ skip_reason should have been preserved');
            return false;
        }

        console.log('✅ skip_reason correctly included when column exists');
        console.log('   - status: skipped');
        console.log('   - summary: Test summary');
        console.log('   - skip_reason: NO_HISTORY');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Schema cache should be used after first check
 */
async function testSchemaCacheUsed(): Promise<boolean> {
    console.log('\n📋 Test: Schema cache is used after first check');

    try {
        const repo = new MockConversationAnalysisRepository(true);

        // First call should populate cache
        const result1 = await repo.hasSkipReasonColumn();
        const cacheAfterFirst = { ...repo.getSchemaCache() };

        // Subsequent calls should use cache
        const result2 = await repo.hasSkipReasonColumn();
        const result3 = await repo.hasSkipReasonColumn();

        // All should return the same value
        if (result1 !== result2 || result2 !== result3) {
            console.error('❌ Cache should return consistent values');
            return false;
        }

        // Cache should have been populated after first call
        if (cacheAfterFirst.hasSkipReasonColumn !== true) {
            console.error('❌ Cache should be populated after first check');
            return false;
        }

        console.log('✅ Schema cache is correctly used');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: resetSchemaCache should clear the cache
 */
async function testResetSchemaCache(): Promise<boolean> {
    console.log('\n📋 Test: resetSchemaCache clears the cache');

    try {
        const repo = new MockConversationAnalysisRepository(true);

        // Populate cache
        await repo.hasSkipReasonColumn();

        // Verify cache is populated
        let cache = repo.getSchemaCache();
        if (cache.hasSkipReasonColumn !== true) {
            console.error('❌ Cache should be populated before reset');
            return false;
        }

        // Reset cache
        repo.resetSchemaCache();

        // Check cache is empty
        cache = repo.getSchemaCache();
        if (cache.hasSkipReasonColumn !== undefined || cache.checkedAt !== undefined) {
            console.error('❌ Cache should be empty after reset');
            return false;
        }

        console.log('✅ Cache correctly cleared after resetSchemaCache()');
        return true;

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

/**
 * Test: Update without skip_reason should work regardless of column existence
 */
async function testUpdateWithoutSkipReason(): Promise<boolean> {
    console.log('\n📋 Test: Update without skip_reason works without schema check');

    try {
        // Test with column missing
        const repoNoColumn = new MockConversationAnalysisRepository(false);
        const updates1 = {
            status: 'completed',
            summary: 'Test summary',
            intent: 'purchase'
        };

        const result1 = await repoNoColumn.simulateUpdate(1, updates1);

        // All fields should be present
        if (result1.status !== 'completed' || result1.summary !== 'Test summary' || result1.intent !== 'purchase') {
            console.error('❌ Regular fields should be preserved (no column case)');
            return false;
        }

        // Test with column present
        const repoWithColumn = new MockConversationAnalysisRepository(true);
        const result2 = await repoWithColumn.simulateUpdate(1, updates1);

        // All fields should be present
        if (result2.status !== 'completed' || result2.summary !== 'Test summary' || result2.intent !== 'purchase') {
            console.error('❌ Regular fields should be preserved (with column case)');
            return false;
        }

        console.log('✅ Update without skip_reason works correctly');
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
    console.log('║  Conversation Analysis Repository Test Suite          ║');
    console.log('║  Testing schema feature detection and compatibility   ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    let allPassed = true;

    // Test 1: skip_reason omitted when column missing
    const test1 = await testSkipReasonOmittedWhenColumnMissing();
    allPassed = allPassed && test1;

    // Test 2: skip_reason included when column exists
    const test2 = await testSkipReasonIncludedWhenColumnExists();
    allPassed = allPassed && test2;

    // Test 3: Schema cache is used
    const test3 = await testSchemaCacheUsed();
    allPassed = allPassed && test3;

    // Test 4: resetSchemaCache works
    const test4 = await testResetSchemaCache();
    allPassed = allPassed && test4;

    // Test 5: Update without skip_reason works
    const test5 = await testUpdateWithoutSkipReason();
    allPassed = allPassed && test5;

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
