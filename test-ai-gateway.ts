/**
 * Test AI Gateway Service
 * Tests timeout, retry, fallback, and policy enforcement
 */

import { aiGateway, AIGateway, KNOWN_CATALOG_PRICES } from './src/services/aiGateway';
import { conversationMemory } from './src/services/conversationMemory';

async function testAIGateway() {
    console.log('🧪 Testing AI Gateway Service\n');
    console.log('=' .repeat(60));

    // Test 1: Check gateway availability
    console.log('\n📋 Test 1: Gateway Availability');
    console.log('-'.repeat(60));
    const isAvailable = aiGateway.isAvailable();
    console.log(`Gateway available: ${isAvailable ? '✅ YES' : '❌ NO'}`);
    
    const stats = aiGateway.getStats();
    console.log('Available providers:', stats.availableProviders);
    console.log('Configuration:', stats.config);

    // Test 2: Basic AI request
    console.log('\n📋 Test 2: Basic AI Request');
    console.log('-'.repeat(60));
    try {
        const prompt = 'Hola, ¿qué productos ofrecen?';
        console.log(`Prompt: "${prompt}"`);
        
        const startTime = Date.now();
        const result = await aiGateway.generateResponse(prompt);
        const duration = Date.now() - startTime;
        
        console.log('\n✅ Response received:');
        console.log(`   AI Used: ${result.metadata.ai_used}`);
        console.log(`   Model: ${result.metadata.model}`);
        console.log(`   Latency: ${result.metadata.latency_ms}ms (total: ${duration}ms)`);
        console.log(`   Tokens: ${result.metadata.tokens_est || 'N/A'}`);
        console.log(`   Policy: ${result.metadata.policy_decision}`);
        console.log(`\n   Response: ${result.response.substring(0, 150)}...`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }

    // Test 3: Policy enforcement - price inquiry
    console.log('\n📋 Test 3: Policy Enforcement - Price Inquiry');
    console.log('-'.repeat(60));
    try {
        const prompt = '¿Cuánto cuesta la USB de música?';
        console.log(`Prompt: "${prompt}"`);
        
        const result = await aiGateway.generateResponse(prompt);
        
        console.log('\n✅ Response received:');
        console.log(`   AI Used: ${result.metadata.ai_used}`);
        console.log(`   Model: ${result.metadata.model}`);
        console.log(`   Policy: ${result.metadata.policy_decision}`);
        console.log(`\n   Response: ${result.response}`);
        
        // Check if response contains valid prices (using shared constants)
        const priceRegex = new RegExp(KNOWN_CATALOG_PRICES.map(p => 
            `\\$?\\s*${p.toString().replace(/(\d)(\d{3})$/, '$1[,.]?$2')}`
        ).join('|'), 'i');
        const hasValidPrices = priceRegex.test(result.response);
        console.log(`\n   Contains valid prices: ${hasValidPrices ? '✅ YES' : '⚠️ NO'}`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }

    // Test 4: Fallback response
    console.log('\n📋 Test 4: Deterministic Fallback');
    console.log('-'.repeat(60));
    
    // Create a test gateway with short timeout to force fallback
    const fallbackGateway = new AIGateway({ timeoutMs: 1, maxRetries: 1 });
    
    try {
        const prompt = 'Hola';
        console.log(`Prompt: "${prompt}" (with 1ms timeout to force fallback)`);
        
        const result = await fallbackGateway.generateResponse(prompt);
        
        console.log('\n✅ Fallback response received:');
        console.log(`   AI Used: ${result.metadata.ai_used}`);
        console.log(`   Model: ${result.metadata.model}`);
        console.log(`   Policy: ${result.metadata.policy_decision}`);
        console.log(`\n   Response: ${result.response}`);
        
        const isFallback = result.metadata.ai_used === 'fallback';
        console.log(`\n   Is fallback: ${isFallback ? '✅ YES' : '❌ NO'}`);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }

    // Test 5: Conversation persistence with AI metadata
    console.log('\n📋 Test 5: Conversation Persistence');
    console.log('-'.repeat(60));
    try {
        const testPhone = '573001234567';
        const prompt = '¿Qué tipos de USB tienen?';
        console.log(`Testing persistence for phone: ${testPhone}`);
        console.log(`Prompt: "${prompt}"`);
        
        // Generate response
        const result = await aiGateway.generateResponse(prompt);
        
        // Add to conversation memory with AI metadata
        await conversationMemory.addTurn(
            testPhone,
            'assistant',
            result.response,
            {
                ai_used: result.metadata.ai_used,
                model: result.metadata.model,
                latency_ms: result.metadata.latency_ms,
                tokens_est: result.metadata.tokens_est,
                policy_decision: result.metadata.policy_decision
            }
        );
        
        console.log('✅ Successfully persisted turn with AI metadata');
        console.log(`   AI Used: ${result.metadata.ai_used}`);
        console.log(`   Model: ${result.metadata.model}`);
        console.log(`   Latency: ${result.metadata.latency_ms}ms`);
        console.log(`   Policy: ${result.metadata.policy_decision}`);
        
        // Retrieve context to verify
        const context = await conversationMemory.getContext(testPhone, 5);
        const lastTurn = context.recentTurns[context.recentTurns.length - 1];
        
        if (lastTurn && lastTurn.metadata) {
            console.log('\n✅ Verified metadata in retrieved context:');
            console.log(`   AI Used: ${lastTurn.metadata.ai_used || 'not saved'}`);
            console.log(`   Model: ${lastTurn.metadata.model || 'not saved'}`);
            console.log(`   Latency: ${lastTurn.metadata.latency_ms || 'not saved'}ms`);
        }
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }

    // Test 6: Multiple requests (retry logic)
    console.log('\n📋 Test 6: Multiple Requests (Performance Test)');
    console.log('-'.repeat(60));
    const prompts = [
        '¿Qué géneros musicales tienen?',
        '¿Tienen envío gratis?',
        '¿Cuál es su garantía?'
    ];
    
    const results = [];
    for (const prompt of prompts) {
        try {
            console.log(`\nPrompt: "${prompt}"`);
            const result = await aiGateway.generateResponse(prompt);
            results.push({
                prompt,
                success: true,
                aiUsed: result.metadata.ai_used,
                latency: result.metadata.latency_ms,
                policy: result.metadata.policy_decision
            });
            console.log(`   ✅ ${result.metadata.ai_used} (${result.metadata.latency_ms}ms) - ${result.metadata.policy_decision}`);
        } catch (error: any) {
            results.push({
                prompt,
                success: false,
                error: error.message
            });
            console.log(`   ❌ Failed: ${error.message}`);
        }
    }
    
    console.log('\n📊 Summary:');
    const successful = results.filter(r => r.success).length;
    const avgLatency = results
        .filter(r => r.success && r.latency)
        .reduce((sum, r) => sum + (r.latency || 0), 0) / Math.max(1, successful);
    
    console.log(`   Total requests: ${results.length}`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${results.length - successful}`);
    console.log(`   Average latency: ${avgLatency.toFixed(0)}ms`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ AI Gateway tests completed!\n');
}

// Run tests
testAIGateway().catch(error => {
    console.error('🚨 Test suite failed:', error);
    process.exit(1);
});
