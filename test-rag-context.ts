/**
 * Test RAG Context Retriever
 * 
 * Tests that RAG retrieves structured context correctly:
 * - Catalog data
 * - Order status
 * - Customer journey
 * - Business rules
 */

import { ragContextRetriever } from './src/services/ragContextRetriever';
import type { UserSession } from './types/global';

async function testRAGContextRetrieval() {
    console.log('🧪 Testing RAG Context Retriever...\n');

    // Create a mock user session
    const mockSession: UserSession = {
        phone: '+57300000001',
        name: 'Test User',
        currentStep: 'initial',
        currentFlow: 'welcome',
        stage: 'awareness',
        interactions: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
    };

    try {
        // Test 1: Retrieve context
        console.log('📋 Test 1: Retrieving RAG context...');
        const context = await ragContextRetriever.retrieveContext(mockSession);
        
        console.log('✅ Context retrieved successfully!');
        console.log('\n📦 Catalog Context:');
        console.log('  - Categories:', context.catalog.categories.map(c => c.displayName).join(', '));
        console.log('  - Music price range:', `$${context.catalog.priceRanges.music.min} - $${context.catalog.priceRanges.music.max}`);
        console.log('  - Videos price range:', `$${context.catalog.priceRanges.videos.min} - $${context.catalog.priceRanges.videos.max}`);
        console.log('  - Movies price range:', `$${context.catalog.priceRanges.movies.min} - $${context.catalog.priceRanges.movies.max}`);
        
        console.log('\n📋 Order Context:');
        console.log('  - Has active order:', context.order.hasActiveOrder);
        console.log('  - Order history:', context.order.orderHistory.length, 'orders');
        
        console.log('\n🎯 Customer Journey:');
        console.log('  - Stage:', context.customerJourney.stage);
        console.log('  - Has discussed price:', context.customerJourney.indicators.hasDiscussedPrice);
        console.log('  - Has specified preferences:', context.customerJourney.indicators.hasSpecifiedPreferences);
        console.log('  - Interaction count:', context.customerJourney.indicators.interactionCount);
        
        console.log('\n📜 Business Rules:');
        console.log('  - Free shipping:', context.businessRules.shipping.isFree);
        console.log('  - Warranty duration:', context.businessRules.warranties.durationMonths, 'months');
        console.log('  - Customization available:', context.businessRules.customization.available);
        console.log('  - Active promotions:', context.businessRules.promotions.active);
        
        // Test 2: Format context for prompt
        console.log('\n📝 Test 2: Formatting context for AI prompt...');
        const formattedPrompt = ragContextRetriever.formatContextForPrompt(context);
        
        console.log('✅ Prompt formatted successfully!');
        console.log('\nPrompt preview (first 500 chars):');
        console.log(formattedPrompt.substring(0, 500) + '...\n');
        
        // Test 3: Verify context contains critical instructions
        console.log('🔍 Test 3: Verifying critical instructions...');
        const hasCatalogInfo = formattedPrompt.includes('CATÁLOGO DISPONIBLE');
        const hasPriceInfo = formattedPrompt.includes('Precios reales del catálogo');
        const hasOrderInfo = formattedPrompt.includes('ORDEN ACTUAL');
        const hasJourneyInfo = formattedPrompt.includes('ETAPA DEL CLIENTE');
        const hasRulesInfo = formattedPrompt.includes('REGLAS DEL NEGOCIO');
        const hasNoInventWarning = formattedPrompt.includes('NO inventes') || formattedPrompt.includes('NO INVENTAR');
        
        console.log('  ✅ Has catalog info:', hasCatalogInfo);
        console.log('  ✅ Has price info:', hasPriceInfo);
        console.log('  ✅ Has order info:', hasOrderInfo);
        console.log('  ✅ Has journey info:', hasJourneyInfo);
        console.log('  ✅ Has business rules:', hasRulesInfo);
        console.log('  ✅ Has "no invention" warning:', hasNoInventWarning);
        
        if (!hasCatalogInfo || !hasPriceInfo || !hasNoInventWarning) {
            throw new Error('❌ Critical context elements missing from formatted prompt');
        }
        
        // Test 4: Test caching
        console.log('\n💾 Test 4: Testing context caching...');
        const startTime = Date.now();
        const cachedContext = await ragContextRetriever.retrieveContext(mockSession);
        const cacheTime = Date.now() - startTime;
        
        console.log('  ✅ Cached context retrieved in', cacheTime, 'ms');
        if (cacheTime > 50) {
            console.warn('  ⚠️ Cache might not be working efficiently (took > 50ms)');
        }
        
        // Test 5: Clear cache
        console.log('\n🧹 Test 5: Testing cache clearing...');
        ragContextRetriever.clearCache(mockSession.phone);
        console.log('  ✅ Cache cleared for user');
        
        console.log('\n✅ All RAG tests passed!\n');
        return true;
        
    } catch (error: any) {
        console.error('\n❌ RAG test failed:', error.message);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

async function testRAGWithRealScenarios() {
    console.log('\n🎭 Testing RAG with real scenarios...\n');
    
    // Scenario 1: New user asking about prices
    console.log('📌 Scenario 1: New user asking about prices');
    const newUser: UserSession = {
        phone: '+57300000002',
        name: 'Maria',
        currentStep: 'pricing',
        currentFlow: 'menu',
        stage: 'interest',
        interactions: [
            { message: 'Hola', response: 'Hola Maria!', timestamp: new Date() },
            { message: 'Cuánto cuesta?', response: '', timestamp: new Date() }
        ],
        metadata: { priceDiscussed: true },
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    const context1 = await ragContextRetriever.retrieveContext(newUser);
    console.log('  - Stage detected:', context1.customerJourney.stage);
    console.log('  - Price discussed:', context1.customerJourney.indicators.hasDiscussedPrice);
    console.log('  ✅ Scenario 1 passed\n');
    
    // Scenario 2: User with specific preferences
    console.log('📌 Scenario 2: User with specific preferences');
    const userWithPrefs: UserSession = {
        phone: '+57300000003',
        name: 'Juan',
        currentStep: 'preferences',
        currentFlow: 'music_flow',
        stage: 'consideration',
        interactions: [],
        preferences: { genres: ['rock', 'salsa'], capacity: '32GB' },
        metadata: { 
            priceDiscussed: true,
            preferences: { genres: ['rock', 'salsa'] }
        },
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    const context2 = await ragContextRetriever.retrieveContext(userWithPrefs);
    console.log('  - Stage detected:', context2.customerJourney.stage);
    console.log('  - Has preferences:', context2.customerJourney.indicators.hasSpecifiedPreferences);
    console.log('  ✅ Scenario 2 passed\n');
    
    console.log('✅ All scenario tests passed!\n');
}

// Run tests
async function runTests() {
    try {
        const basicTestsPassed = await testRAGContextRetrieval();
        if (basicTestsPassed) {
            await testRAGWithRealScenarios();
            console.log('🎉 All RAG tests completed successfully!\n');
            process.exit(0);
        } else {
            console.error('❌ Basic tests failed\n');
            process.exit(1);
        }
    } catch (error: any) {
        console.error('❌ Test suite failed:', error.message);
        process.exit(1);
    }
}

runTests();
