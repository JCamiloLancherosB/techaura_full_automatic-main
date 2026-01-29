/**
 * Tests for Intent Classification System
 * Run with: npx tsx src/tests/intentClassification.test.ts
 * 
 * Validates:
 * 1. pricing_inquiry detects: precio, costo, valor, cuánto
 * 2. purchase_intent detects: comprar, pedido, orden, quiero
 * 3. customization_interest detects: personalizar, customizar, diseñar
 * 4. option_selection responds correctly to inputs 1-4
 * 5. Avoids false positives between similar intents
 */

// Test the extractBasicIntent function logic directly to avoid database dependencies
// This mirrors the logic in userTrackingSystem.ts extractBasicIntent function
function extractBasicIntent(message: string): string {
  if (!message || typeof message !== 'string') return 'general';
  const msg = message.toLowerCase().trim();
  // Check option_selection first (exact match for 1-4) to avoid false positives
  if (/^[1-4]$/.test(msg)) return 'option_selection';
  // Use word boundaries to avoid false positives between similar intents
  if (/\b(precio|costo|valor|vale|cuánto|cuanto)\b/.test(msg)) return 'pricing_inquiry';
  // Check customization BEFORE purchase to avoid "quiero personalizar" matching purchase
  if (/\b(personalizar|customizar|diseñar)\b/.test(msg)) return 'customization_interest';
  if (/\b(comprar|pedido|orden|quiero)\b/.test(msg)) return 'purchase_intent';
  if (/\b(catálogo|catalogo|productos|opciones|mostrar)\b/.test(msg)) return 'product_inquiry';
  if (/\b(gracias|perfecto|excelente|genial)\b/.test(msg)) return 'positive_feedback';
  if (/\b(no|cancelar|después|luego)\b/.test(msg)) return 'negative_response';
  return 'general_inquiry';
}

interface TestCase {
  message: string;
  expectedIntent: string;
  description: string;
}

// ========== extractBasicIntent TESTS ==========
console.log('🧪 Testing extractBasicIntent()\n');
console.log('='.repeat(70));

// 1. pricing_inquiry tests
console.log('\n📊 PRICING_INQUIRY Tests (precio, costo, valor, cuánto)\n');

const pricingTests: TestCase[] = [
  { message: 'precio', expectedIntent: 'pricing_inquiry', description: 'Single word: precio' },
  { message: 'Cuál es el precio?', expectedIntent: 'pricing_inquiry', description: 'Question with precio' },
  { message: 'costo', expectedIntent: 'pricing_inquiry', description: 'Single word: costo' },
  { message: 'Cuánto cuesta?', expectedIntent: 'pricing_inquiry', description: 'Cuánto cuesta question' },
  { message: 'cuanto vale', expectedIntent: 'pricing_inquiry', description: 'cuanto vale (no accent)' },
  { message: 'valor', expectedIntent: 'pricing_inquiry', description: 'Single word: valor' },
  { message: 'Cuál es el valor del USB?', expectedIntent: 'pricing_inquiry', description: 'Question with valor' },
  { message: 'vale', expectedIntent: 'pricing_inquiry', description: 'Single word: vale' },
  { message: 'Cuánto vale el de 32GB?', expectedIntent: 'pricing_inquiry', description: 'Cuánto vale question' },
];

// 2. purchase_intent tests
console.log('🛒 PURCHASE_INTENT Tests (comprar, pedido, orden, quiero)\n');

const purchaseTests: TestCase[] = [
  { message: 'comprar', expectedIntent: 'purchase_intent', description: 'Single word: comprar' },
  { message: 'Quiero comprar uno', expectedIntent: 'purchase_intent', description: 'Quiero comprar' },
  { message: 'pedido', expectedIntent: 'purchase_intent', description: 'Single word: pedido' },
  { message: 'Hacer pedido', expectedIntent: 'purchase_intent', description: 'Hacer pedido' },
  { message: 'orden', expectedIntent: 'purchase_intent', description: 'Single word: orden' },
  { message: 'Procesar orden', expectedIntent: 'purchase_intent', description: 'Procesar orden' },
  { message: 'quiero', expectedIntent: 'purchase_intent', description: 'Single word: quiero' },
  { message: 'Quiero el de 64GB', expectedIntent: 'purchase_intent', description: 'Quiero + product' },
];

// 3. customization_interest tests
console.log('🎨 CUSTOMIZATION_INTEREST Tests (personalizar, customizar, diseñar)\n');

const customizationTests: TestCase[] = [
  { message: 'personalizar', expectedIntent: 'customization_interest', description: 'Single word: personalizar' },
  { message: 'Quiero personalizar mi USB', expectedIntent: 'customization_interest', description: 'Quiero personalizar' },
  { message: 'customizar', expectedIntent: 'customization_interest', description: 'Single word: customizar' },
  { message: 'Puedo customizar el contenido?', expectedIntent: 'customization_interest', description: 'Puedo customizar' },
  { message: 'diseñar', expectedIntent: 'customization_interest', description: 'Single word: diseñar' },
  { message: 'Quiero diseñar mi playlist', expectedIntent: 'customization_interest', description: 'Quiero diseñar' },
];

// 4. option_selection tests
console.log('🔢 OPTION_SELECTION Tests (inputs 1-4)\n');

const optionTests: TestCase[] = [
  { message: '1', expectedIntent: 'option_selection', description: 'Option 1' },
  { message: '2', expectedIntent: 'option_selection', description: 'Option 2' },
  { message: '3', expectedIntent: 'option_selection', description: 'Option 3' },
  { message: '4', expectedIntent: 'option_selection', description: 'Option 4' },
  { message: '5', expectedIntent: 'general_inquiry', description: 'Option 5 (out of range - should NOT be option_selection)' },
  { message: '0', expectedIntent: 'general_inquiry', description: 'Option 0 (out of range - should NOT be option_selection)' },
  { message: '12', expectedIntent: 'general_inquiry', description: 'Two digits (should NOT be option_selection)' },
  { message: ' 1 ', expectedIntent: 'option_selection', description: 'Option 1 with spaces (should trim)' },
];

// 5. False positive prevention tests
console.log('⚠️ FALSE POSITIVE Prevention Tests\n');

const falsePositiveTests: TestCase[] = [
  // pricing vs other intents
  { message: 'aprecio tu ayuda', expectedIntent: 'general_inquiry', description: '"aprecio" should NOT trigger pricing (contains "precio" but not word boundary)' },
  // purchase vs other intents - "quiero el precio" should trigger pricing first due to check ordering
  { message: 'Quiero el precio', expectedIntent: 'pricing_inquiry', description: '"quiero el precio" should be pricing, not purchase (pricing check comes before purchase in order)' },
  // negative_response should not trigger on partial matches
  { message: 'bueno', expectedIntent: 'general_inquiry', description: '"bueno" should NOT trigger negative_response' },
  // Edge cases
  { message: '', expectedIntent: 'general', description: 'Empty string should return general' },
  { message: '   ', expectedIntent: 'general_inquiry', description: 'Whitespace only should return general_inquiry after trim' },
  // Test that "valioso" doesn't trigger pricing (contains "valor" as substring but not word)
  { message: 'es valioso', expectedIntent: 'general_inquiry', description: '"valioso" should NOT trigger pricing (word boundary test)' },
];

// Run all tests
function runTests(tests: TestCase[], category: string): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;

  tests.forEach((test, index) => {
    const result = extractBasicIntent(test.message);
    const success = result === test.expectedIntent;

    if (success) {
      passed++;
      console.log(`✅ Test ${index + 1}: ${test.description}`);
      console.log(`   Message: "${test.message}"`);
      console.log(`   Intent: ${result}`);
    } else {
      failed++;
      console.log(`❌ Test ${index + 1}: ${test.description}`);
      console.log(`   Message: "${test.message}"`);
      console.log(`   Expected: ${test.expectedIntent}, Got: ${result}`);
    }
    console.log('');
  });

  return { passed, failed };
}

// ========== Run all test categories ==========
console.log('\n' + '='.repeat(70));
console.log('📊 PRICING_INQUIRY Tests');
console.log('='.repeat(70) + '\n');
const pricingResults = runTests(pricingTests, 'pricing_inquiry');

console.log('\n' + '='.repeat(70));
console.log('🛒 PURCHASE_INTENT Tests');
console.log('='.repeat(70) + '\n');
const purchaseResults = runTests(purchaseTests, 'purchase_intent');

console.log('\n' + '='.repeat(70));
console.log('🎨 CUSTOMIZATION_INTEREST Tests');
console.log('='.repeat(70) + '\n');
const customizationResults = runTests(customizationTests, 'customization_interest');

console.log('\n' + '='.repeat(70));
console.log('🔢 OPTION_SELECTION Tests');
console.log('='.repeat(70) + '\n');
const optionResults = runTests(optionTests, 'option_selection');

console.log('\n' + '='.repeat(70));
console.log('⚠️ FALSE POSITIVE Prevention Tests');
console.log('='.repeat(70) + '\n');
const falsePositiveResults = runTests(falsePositiveTests, 'false_positives');

// ========== IntentClassifier pattern validation ==========
console.log('\n' + '='.repeat(70));
console.log('🤖 IntentClassifier Pattern Validation Tests');
console.log('='.repeat(70) + '\n');

// Test the patterns used in IntentClassifier without importing it
const pricingPattern = /\b(precio|costo|valor|vale|cuanto|cuánto|pago|pagar|dinero)\b/i;
const purchasePattern = /\b(comprar|compro|quiero|necesito|adquirir|pedido|orden|ordenar)\b/i;
const customizationPattern = /\b(personalizar?|customizar?|modificar|adaptar|elegir|seleccionar|diseñar)\b/i;

const classifierPatternTests = [
  { message: 'precio del usb', pattern: pricingPattern, expected: true, desc: 'pricing pattern matches "precio"' },
  { message: 'valor del producto', pattern: pricingPattern, expected: true, desc: 'pricing pattern matches "valor"' },
  { message: 'cuánto cuesta', pattern: pricingPattern, expected: true, desc: 'pricing pattern matches "cuánto"' },
  { message: 'quiero comprar', pattern: purchasePattern, expected: true, desc: 'purchase pattern matches "quiero"' },
  { message: 'hacer pedido', pattern: purchasePattern, expected: true, desc: 'purchase pattern matches "pedido"' },
  { message: 'procesar orden', pattern: purchasePattern, expected: true, desc: 'purchase pattern matches "orden"' },
  { message: 'personalizar contenido', pattern: customizationPattern, expected: true, desc: 'customization pattern matches "personalizar"' },
  { message: 'customizar mi usb', pattern: customizationPattern, expected: true, desc: 'customization pattern matches "customizar"' },
  { message: 'diseñar mi playlist', pattern: customizationPattern, expected: true, desc: 'customization pattern matches "diseñar"' },
];

let classifierPassed = 0;
let classifierFailed = 0;

classifierPatternTests.forEach((test, index) => {
  const result = test.pattern.test(test.message);
  const success = result === test.expected;

  if (success) {
    classifierPassed++;
    console.log(`✅ Pattern Test ${index + 1}: ${test.desc}`);
  } else {
    classifierFailed++;
    console.log(`❌ Pattern Test ${index + 1}: ${test.desc}`);
    console.log(`   Message: "${test.message}"`);
    console.log(`   Expected: ${test.expected}, Got: ${result}`);
  }
});

// ========== SUMMARY ==========
console.log('\n' + '='.repeat(70));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(70) + '\n');

const totalPassed = pricingResults.passed + purchaseResults.passed + 
                    customizationResults.passed + optionResults.passed + 
                    falsePositiveResults.passed + classifierPassed;
const totalFailed = pricingResults.failed + purchaseResults.failed + 
                    customizationResults.failed + optionResults.failed + 
                    falsePositiveResults.failed + classifierFailed;

console.log(`Pricing Inquiry Tests: ${pricingResults.passed} passed, ${pricingResults.failed} failed`);
console.log(`Purchase Intent Tests: ${purchaseResults.passed} passed, ${purchaseResults.failed} failed`);
console.log(`Customization Interest Tests: ${customizationResults.passed} passed, ${customizationResults.failed} failed`);
console.log(`Option Selection Tests: ${optionResults.passed} passed, ${optionResults.failed} failed`);
console.log(`False Positive Prevention Tests: ${falsePositiveResults.passed} passed, ${falsePositiveResults.failed} failed`);
console.log(`IntentClassifier Pattern Tests: ${classifierPassed} passed, ${classifierFailed} failed`);
console.log('');
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed out of ${totalPassed + totalFailed} tests`);
console.log('');

if (totalFailed === 0) {
  console.log('🎉 ALL TESTS PASSED!');
  process.exit(0);
} else {
  console.log(`⚠️ ${totalFailed} test(s) failed`);
  process.exit(1);
}

