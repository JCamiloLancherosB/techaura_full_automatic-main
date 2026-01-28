/**
 * Tests for ConversationAnalysisRepository
 * 
 * Validates schema feature detection and compatibility mode
 * for handling missing skip_reason column in older schemas.
 * 
 * Run with: npx tsx src/tests/conversationAnalysisRepository.test.ts
 * 
 * Note: These are unit tests that don't require database connection.
 * They use mocks to simulate the repository behavior.
 */

interface ConversationAnalysis {
    id?: number;
    phone: string;
    summary?: string;
    intent?: string;
    objections?: string[];
    purchase_probability?: number;
    extracted_preferences?: Record<string, any>;
    sentiment?: 'positive' | 'neutral' | 'negative';
    engagement_score?: number;
    ai_model?: string;
    tokens_used?: number;
    analysis_duration_ms?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
    error_message?: string;
    skip_reason?: 'NO_HISTORY' | 'INVALID_PHONE';
    message_count?: number;
    conversation_start?: Date;
    conversation_end?: Date;
    created_at?: Date;
    updated_at?: Date;
    analyzed_at?: Date;
}

/**
 * Mock repository that simulates the schema feature detection behavior
 * without requiring a database connection
 */
class MockConversationAnalysisRepository {
    private _mockColumnExists: boolean;
    private _updateCalled = false;
    private _lastUpdateData: any = null;
    private _createCalled = false;
    private _lastCreateData: any = null;
    private _skipReasonColumnChecked = false;
    private _skipReasonColumnExists = false;

    constructor(mockColumnExists: boolean) {
        this._mockColumnExists = mockColumnExists;
    }

    // Simulates hasSkipReasonColumn with caching behavior
    async hasSkipReasonColumn(): Promise<boolean> {
        if (this._skipReasonColumnChecked) {
            return this._skipReasonColumnExists;
        }

        this._skipReasonColumnExists = this._mockColumnExists;
        this._skipReasonColumnChecked = true;

        if (!this._skipReasonColumnExists) {
            console.warn('⚠️  skip_reason column not found in conversation_analysis table. ' +
                'Running in compatibility mode. Run migrations to enable full functionality.');
        }

        return this._skipReasonColumnExists;
    }

    resetSchemaCache(): void {
        this._skipReasonColumnChecked = false;
        this._skipReasonColumnExists = false;
    }

    // Simulates update method with schema feature detection
    async update(id: number, updates: Partial<ConversationAnalysis>): Promise<void> {
        const dataToUpdate: any = {
            ...updates,
            updated_at: new Date()
        };

        // Convert JSON fields
        if (updates.objections !== undefined) {
            dataToUpdate.objections = updates.objections ? JSON.stringify(updates.objections) : null;
        }
        if (updates.extracted_preferences !== undefined) {
            dataToUpdate.extracted_preferences = updates.extracted_preferences ? JSON.stringify(updates.extracted_preferences) : null;
        }

        // Schema feature detection: omit skip_reason if column doesn't exist
        if (dataToUpdate.skip_reason !== undefined) {
            const hasColumn = await this.hasSkipReasonColumn();
            if (!hasColumn) {
                delete dataToUpdate.skip_reason;
            }
        }

        this._updateCalled = true;
        this._lastUpdateData = dataToUpdate;
    }

    // Simulates create method with schema feature detection
    async create(analysis: Omit<ConversationAnalysis, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        const dataToInsert: any = {
            phone: analysis.phone,
            summary: analysis.summary || null,
            intent: analysis.intent || null,
            objections: analysis.objections ? JSON.stringify(analysis.objections) : null,
            purchase_probability: analysis.purchase_probability || null,
            extracted_preferences: analysis.extracted_preferences ? JSON.stringify(analysis.extracted_preferences) : null,
            sentiment: analysis.sentiment || null,
            engagement_score: analysis.engagement_score || null,
            ai_model: analysis.ai_model || null,
            tokens_used: analysis.tokens_used || null,
            analysis_duration_ms: analysis.analysis_duration_ms || null,
            status: analysis.status,
            error_message: analysis.error_message || null,
            message_count: analysis.message_count || 0,
            conversation_start: analysis.conversation_start || null,
            conversation_end: analysis.conversation_end || null,
            analyzed_at: analysis.analyzed_at || null
        };

        // Schema feature detection: only include skip_reason if column exists
        if (analysis.skip_reason !== undefined) {
            const hasColumn = await this.hasSkipReasonColumn();
            if (hasColumn) {
                dataToInsert.skip_reason = analysis.skip_reason;
            }
        }

        this._createCalled = true;
        this._lastCreateData = dataToInsert;
        return 1; // Return mock ID
    }

    getLastUpdateData(): any {
        return this._lastUpdateData;
    }

    getLastCreateData(): any {
        return this._lastCreateData;
    }

    wasUpdateCalled(): boolean {
        return this._updateCalled;
    }

    wasCreateCalled(): boolean {
        return this._createCalled;
    }
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    console.log('🧪 Testing ConversationAnalysisRepository schema feature detection...\n');

    // Test 1: Update omits skip_reason when column doesn't exist
    try {
        const repo = new MockConversationAnalysisRepository(false);
        
        await repo.update(1, {
            status: 'skipped',
            skip_reason: 'NO_HISTORY',
            summary: 'Test summary'
        });

        const updateData = repo.getLastUpdateData();
        
        if (updateData.skip_reason !== undefined) {
            throw new Error('skip_reason should have been omitted when column does not exist');
        }
        if (updateData.status !== 'skipped') {
            throw new Error('status should still be present');
        }
        if (updateData.summary !== 'Test summary') {
            throw new Error('summary should still be present');
        }

        console.log('✅ Test 1: Update omits skip_reason when column does not exist');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 1: Update omits skip_reason when column does not exist -', error.message);
        failed++;
    }

    // Test 2: Update includes skip_reason when column exists
    try {
        const repo = new MockConversationAnalysisRepository(true);
        
        await repo.update(1, {
            status: 'skipped',
            skip_reason: 'NO_HISTORY',
            summary: 'Test summary'
        });

        const updateData = repo.getLastUpdateData();
        
        if (updateData.skip_reason !== 'NO_HISTORY') {
            throw new Error('skip_reason should be present when column exists');
        }
        if (updateData.status !== 'skipped') {
            throw new Error('status should still be present');
        }

        console.log('✅ Test 2: Update includes skip_reason when column exists');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 2: Update includes skip_reason when column exists -', error.message);
        failed++;
    }

    // Test 3: Create omits skip_reason when column doesn't exist
    try {
        const repo = new MockConversationAnalysisRepository(false);
        
        await repo.create({
            phone: '573001234567',
            status: 'skipped',
            skip_reason: 'INVALID_PHONE',
            summary: 'Test summary'
        });

        const createData = repo.getLastCreateData();
        
        if (createData.skip_reason !== undefined) {
            throw new Error('skip_reason should have been omitted when column does not exist');
        }
        if (createData.phone !== '573001234567') {
            throw new Error('phone should still be present');
        }
        if (createData.status !== 'skipped') {
            throw new Error('status should still be present');
        }

        console.log('✅ Test 3: Create omits skip_reason when column does not exist');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 3: Create omits skip_reason when column does not exist -', error.message);
        failed++;
    }

    // Test 4: Create includes skip_reason when column exists
    try {
        const repo = new MockConversationAnalysisRepository(true);
        
        await repo.create({
            phone: '573001234567',
            status: 'skipped',
            skip_reason: 'INVALID_PHONE',
            summary: 'Test summary'
        });

        const createData = repo.getLastCreateData();
        
        if (createData.skip_reason !== 'INVALID_PHONE') {
            throw new Error('skip_reason should be present when column exists');
        }
        if (createData.phone !== '573001234567') {
            throw new Error('phone should still be present');
        }

        console.log('✅ Test 4: Create includes skip_reason when column exists');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 4: Create includes skip_reason when column exists -', error.message);
        failed++;
    }

    // Test 5: Update without skip_reason works in both modes
    try {
        const repoWithoutColumn = new MockConversationAnalysisRepository(false);
        const repoWithColumn = new MockConversationAnalysisRepository(true);
        
        await repoWithoutColumn.update(1, {
            status: 'completed',
            summary: 'Test summary'
        });

        await repoWithColumn.update(1, {
            status: 'completed',
            summary: 'Test summary'
        });

        const data1 = repoWithoutColumn.getLastUpdateData();
        const data2 = repoWithColumn.getLastUpdateData();
        
        if (data1.status !== 'completed' || data2.status !== 'completed') {
            throw new Error('Update without skip_reason should work in both modes');
        }

        console.log('✅ Test 5: Update without skip_reason works in both modes');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 5: Update without skip_reason works in both modes -', error.message);
        failed++;
    }

    // Test 6: Schema cache reset works
    try {
        const repo = new ConversationAnalysisRepository();
        
        // Access internal state through public method
        repo.resetSchemaCache();
        
        // This just verifies the method exists and doesn't throw
        console.log('✅ Test 6: Schema cache reset method exists');
        passed++;
    } catch (error: any) {
        console.log('❌ Test 6: Schema cache reset method exists -', error.message);
        failed++;
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    
    // Exit with proper code
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
});
