/**
 * Message Policy Engine Integration Example
 * Demonstrates how the policy engine validates messages before sending
 */

// Example 1: Urgency in confirmed orders (BLOCKED)
console.log('=== Example 1: Urgency Detection in Confirmed Orders ===');
console.log('Message: "⏰ ¡Última llamada! Confirma tu pedido"');
console.log('Status: order_confirmed');
console.log('Result: ❌ BLOCKED - No urgency allowed in confirmed orders');
console.log('Transformed: "Confirma tu pedido" (urgency removed)\n');

// Example 2: Catalog message with price table (ALLOWED)
console.log('=== Example 2: Catalog Message with Price Table ===');
console.log('Message length: 150 chars (includes price table)');
console.log('Type: catalog');
console.log('Result: ✅ ALLOWED - Price tables get length exemption\n');

// Example 3: Wrong CTA for stage (BLOCKED)
console.log('=== Example 3: Wrong CTA for Stage ===');
console.log('Message: "Confirma tu dirección de envío"');
console.log('Stage: awareness');
console.log('Result: ❌ BLOCKED - Too early to ask for shipping address');
console.log('Suggestion: Use awareness CTAs like "¿Te interesa música o películas?"\n');

// Example 4: Price repeated too many times (WARNING)
console.log('=== Example 4: Price Repetition ===');
console.log('Message: "$45,000 por 32GB, $75,000 por 64GB, $125,000 por 128GB, $200,000 por 256GB"');
console.log('Price count: 4');
console.log('Result: ⚠️ WARNING - Price mentioned 4 times (max 3)');
console.log('Suggestion: Consolidate price mentions or use ranges\n');

// Example 5: Message too long (TRIMMED)
console.log('=== Example 5: Message Length Enforcement ===');
console.log('Message: 250 characters + CTA');
console.log('Limit: 200 characters');
console.log('Result: ✅ TRIMMED - Message shortened to 200 chars, CTA preserved\n');

// Example 6: "Bienvenido" for returning user (WARNING)
console.log('=== Example 6: Inappropriate Greeting ===');
console.log('Message: "¡Bienvenido! ¿En qué te ayudo?"');
console.log('Interaction count: 5');
console.log('Result: ⚠️ WARNING - Using "bienvenido" for returning user');
console.log('Suggestion: Use continuation phrases\n');

// Example 7: Valid message (PASSED)
console.log('=== Example 7: Valid Message ===');
console.log('Message: "🎵 ¡Perfecto! ¿Qué géneros prefieres?"');
console.log('Stage: interest');
console.log('Length: 45 chars');
console.log('Result: ✅ PASSED - All validations passed\n');

console.log('=== Policy Rules Summary ===');
console.log('1. No urgency language when status >= CONFIRMED');
console.log('2. Standard messages <= 200 chars');
console.log('3. Catalog messages with price tables <= 300 chars');
console.log('4. Price mentioned max 3 times');
console.log('5. CTA must match journey stage:');
console.log('   - awareness: "¿Te interesa...?"');
console.log('   - interest: "¿Qué géneros...?"');
console.log('   - customization: "¿Prefieres 32GB o 64GB?"');
console.log('   - pricing: "¿Te gustaría confirmar?"');
console.log('   - closing: "Confirma tu dirección"');
console.log('6. No "bienvenido" for returning users');
console.log('7. No asking about product type if already selected');
console.log('\n=== Integration Points ===');
console.log('• FlowIntegrationHelper.sendPersuasiveMessage() - Pre-send validation');
console.log('• FlowIntegrationHelper.buildFlowMessage() - Message building with policy checks');
console.log('• Automatic transformation when violations detected');
console.log('• Detailed logging for monitoring and debugging');
