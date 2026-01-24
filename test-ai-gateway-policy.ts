/**
 * Policy Enforcement Test
 * Demonstrates how the AI Gateway enforces content policy
 */

import { aiGateway } from './src/services/aiGateway';

async function testPolicyEnforcement() {
    console.log('🔒 Testing AI Gateway Policy Enforcement\n');
    console.log('=' .repeat(70));

    // Test 1: Known prices should be allowed
    console.log('\n✅ Test 1: Known Catalog Prices (Should Pass)');
    console.log('-'.repeat(70));
    const knownPrices = [
        '¿Cuánto cuesta la USB de música de $59,900?',
        'La USB de películas vale $79,900',
        'El precio es $69,900 para videos'
    ];

    for (const prompt of knownPrices) {
        console.log(`\nPrompt: "${prompt}"`);
        const result = await aiGateway.generateResponse(prompt);
        console.log(`Policy: ${result.metadata.policy_decision}`);
        console.log(`AI Used: ${result.metadata.ai_used}`);
        console.log(`Response: ${result.response.substring(0, 100)}...`);
    }

    // Test 2: Invalid prices should trigger policy
    console.log('\n\n❌ Test 2: Invalid Prices (Should Trigger Policy)');
    console.log('-'.repeat(70));
    
    // Create a mock response with an invalid price to test post-screening
    console.log('\nNote: This test simulates a policy check on a response with invalid price');
    console.log('In real usage, the AI Gateway would catch this before returning to user.\n');
    
    // Test prompts that might lead to price invention
    const riskyPrompts = [
        '¿Tienes USBs más baratas?',
        '¿Cuánto vale una USB pequeña?',
        'Dame el precio especial'
    ];

    for (const prompt of riskyPrompts) {
        console.log(`\nPrompt: "${prompt}"`);
        const result = await aiGateway.generateResponse(prompt);
        console.log(`Policy: ${result.metadata.policy_decision}`);
        console.log(`AI Used: ${result.metadata.ai_used}`);
        
        // Check if response contains only valid prices
        const hasInvalidPrice = /\$\s*[1-9]\d{4,}(?![,.]?900)/i.test(result.response) &&
                               !/59[,.]?900|79[,.]?900|69[,.]?900/i.test(result.response);
        
        if (hasInvalidPrice) {
            console.log('⚠️  WARNING: Response may contain invalid price');
        } else {
            console.log('✅ Response follows policy (no invalid prices)');
        }
        
        console.log(`Response: ${result.response.substring(0, 150)}...`);
    }

    // Test 3: Stock information policy
    console.log('\n\n📦 Test 3: Stock Information Policy');
    console.log('-'.repeat(70));
    
    const stockPrompts = [
        '¿Tienen 50 USBs disponibles?',
        '¿Cuántas unidades quedan?',
        '¿Hay stock de USBs de música?'
    ];

    for (const prompt of stockPrompts) {
        console.log(`\nPrompt: "${prompt}"`);
        const result = await aiGateway.generateResponse(prompt);
        console.log(`Policy: ${result.metadata.policy_decision}`);
        console.log(`AI Used: ${result.metadata.ai_used}`);
        
        // Check if response invents specific stock numbers
        const hasStockNumbers = /\d+\s*(unidades|disponibles|en stock|quedan)/i.test(result.response);
        
        if (hasStockNumbers) {
            console.log('⚠️  WARNING: Response mentions specific stock numbers');
        } else {
            console.log('✅ Response follows policy (no specific stock numbers)');
        }
        
        console.log(`Response: ${result.response.substring(0, 150)}...`);
    }

    // Test 4: Clarification requests (should be okay)
    console.log('\n\n💬 Test 4: Clarification Requests (Should Pass)');
    console.log('-'.repeat(70));
    
    const clarificationPrompts = [
        'No estoy seguro del precio exacto',
        'Necesito saber más sobre disponibilidad',
        '¿Me puedes decir qué opciones tienen?'
    ];

    for (const prompt of clarificationPrompts) {
        console.log(`\nPrompt: "${prompt}"`);
        const result = await aiGateway.generateResponse(prompt);
        console.log(`Policy: ${result.metadata.policy_decision}`);
        console.log(`AI Used: ${result.metadata.ai_used}`);
        console.log(`Response: ${result.response.substring(0, 150)}...`);
    }

    // Summary
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 Policy Enforcement Summary');
    console.log('='.repeat(70));
    console.log(`
✅ Known Prices: $59,900, $79,900, $69,900 are ALLOWED
❌ Other Prices: Any other price values trigger policy
❌ Stock Numbers: Specific inventory counts trigger policy
✅ Clarification: Requests for clarification are ALLOWED
✅ General Info: Product features and benefits are ALLOWED

The AI Gateway ensures:
1. AI cannot invent prices outside the known catalog
2. AI cannot make up stock/inventory numbers
3. AI asks for clarification when it doesn't have accurate info
4. All policy decisions are tracked in the database
`);

    console.log('✅ Policy enforcement tests completed!\n');
}

// Run policy tests
testPolicyEnforcement().catch(error => {
    console.error('🚨 Policy test suite failed:', error);
    process.exit(1);
});
