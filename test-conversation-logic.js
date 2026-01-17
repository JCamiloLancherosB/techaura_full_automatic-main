/**
 * Minimal test to verify conversation context logic
 * Tests the core logic without requiring database connections
 */

console.log('🧪 Testing Conversation Context Logic (Minimal Test)\n');
console.log('='.repeat(80));

// Test 1: Verify conversation analyzer patterns
console.log('\n📋 Test 1: Message Analysis Patterns');
console.log('-'.repeat(80));

// Simulate message analysis
const testMessages = [
  { msg: '¿Cuánto cuesta?', expectedIntent: 'pricing' },
  { msg: 'Me gusta el reggaeton', expectedIntent: 'customization' },
  { msg: 'Quiero comprar', expectedIntent: 'purchase' },
  { msg: '¿Qué es esto?', expectedIntent: 'question' },
  { msg: 'Sí, perfecto', expectedIntent: 'confirmation' },
  { msg: 'No, gracias', expectedIntent: 'rejection' }
];

// Price intent patterns
const pricePatterns = /precio|costo|cuanto|cuánto|vale|cotizar|presupuesto/i;
const customizationPatterns = /personalizar|custom|a medida|mi gusto|elegir|género|genero|artista|reggaeton|salsa|rock|pop|bachata/i;
const purchasePatterns = /comprar|pedir|ordenar|quiero|necesito|llevar|adquirir/i;
const questionPatterns = /qué|que|como|cómo|cuando|cuándo|donde|dónde|por que|por qué/i;
const confirmationPatterns = /si|sí|ok|vale|perfecto|excelente|genial|bueno|dale|listo|confirmo/i;
const rejectionPatterns = /no|nunca|cancelar|despues|después|luego|mas tarde|más tarde|no quiero|no me interesa/i;

let passedTests = 0;
let totalTests = testMessages.length;

testMessages.forEach(test => {
  let detectedIntent = 'unknown';
  
  if (pricePatterns.test(test.msg)) {
    detectedIntent = 'pricing';
  } else if (purchasePatterns.test(test.msg)) {
    detectedIntent = 'purchase';
  } else if (customizationPatterns.test(test.msg)) {
    detectedIntent = 'customization';
  } else if (confirmationPatterns.test(test.msg)) {
    detectedIntent = 'confirmation';
  } else if (rejectionPatterns.test(test.msg)) {
    detectedIntent = 'rejection';
  } else if (questionPatterns.test(test.msg)) {
    detectedIntent = 'question';
  }
  
  const passed = detectedIntent === test.expectedIntent;
  passedTests += passed ? 1 : 0;
  
  console.log(`${passed ? '✅' : '❌'} "${test.msg}"`);
  console.log(`   Expected: ${test.expectedIntent}, Got: ${detectedIntent}`);
});

console.log(`\n📊 Results: ${passedTests}/${totalTests} tests passed`);

// Test 2: Coherence validation logic
console.log('\n📋 Test 2: Response Coherence Logic');
console.log('-'.repeat(80));

const coherenceTests = [
  {
    userMsg: 'Me interesa USB de música',
    botResponse: '¡Perfecto! Tenemos USBs de música personalizadas.',
    shouldBeCoherent: true,
    reason: 'Response matches user interest'
  },
  {
    userMsg: 'Me interesa USB de música',
    botResponse: '¡Genial! Tenemos películas en 4K disponibles.',
    shouldBeCoherent: false,
    reason: 'Response talks about movies when user asked for music'
  },
  {
    userMsg: '¿Cuánto cuesta?',
    botResponse: 'Los precios son: 8GB $59.900, 32GB $89.900',
    shouldBeCoherent: true,
    reason: 'Response answers price question'
  },
  {
    userMsg: '¿Cuánto cuesta?',
    botResponse: '¿Qué géneros musicales te gustan?',
    shouldBeCoherent: false,
    reason: 'Response ignores price question'
  }
];

let coherencePassedTests = 0;
let coherenceTotalTests = coherenceTests.length;

coherenceTests.forEach((test, index) => {
  const userLower = test.userMsg.toLowerCase();
  const botLower = test.botResponse.toLowerCase();
  
  let isCoherent = true;
  const issues = [];
  
  // Check 1: If user asked about music, bot shouldn't mention movies/videos
  if (/(música|musica|canción|cancion)/.test(userLower) && 
      /(video|película|pelicula|movie)/.test(botLower) &&
      !/(también|combo|además)/.test(botLower)) {
    issues.push('product_type_mismatch');
    isCoherent = false;
  }
  
  // Check 2: If user asked about price, bot should mention prices
  if (/(precio|costo|cuanto|cuánto)/.test(userLower) && 
      !/(precio|costo|\$|pagar|vale)/.test(botLower)) {
    issues.push('price_question_not_answered');
    isCoherent = false;
  }
  
  const passed = isCoherent === test.shouldBeCoherent;
  coherencePassedTests += passed ? 1 : 0;
  
  console.log(`${passed ? '✅' : '❌'} Test ${index + 1}: ${test.reason}`);
  console.log(`   User: "${test.userMsg}"`);
  console.log(`   Bot: "${test.botResponse}"`);
  console.log(`   Expected coherent: ${test.shouldBeCoherent}, Got: ${isCoherent}`);
  if (issues.length > 0) {
    console.log(`   Issues: ${issues.join(', ')}`);
  }
});

console.log(`\n📊 Results: ${coherencePassedTests}/${coherenceTotalTests} tests passed`);

// Test 3: Context quality assessment
console.log('\n📋 Test 3: Context Quality Assessment');
console.log('-'.repeat(80));

const contextQualityTests = [
  {
    collected: { hasContentType: true, hasCapacity: true, hasGenres: true },
    expectedQuality: 'complete'
  },
  {
    collected: { hasContentType: true, hasCapacity: true, hasGenres: false },
    expectedQuality: 'partial'
  },
  {
    collected: { hasContentType: false, hasCapacity: false, hasGenres: false },
    expectedQuality: 'insufficient'
  }
];

let qualityPassedTests = 0;
let qualityTotalTests = contextQualityTests.length;

contextQualityTests.forEach((test, index) => {
  const missing = [];
  
  if (!test.collected.hasContentType) missing.push('contentType');
  if (!test.collected.hasCapacity) missing.push('capacity');
  if (test.collected.hasContentType && !test.collected.hasGenres) missing.push('genres');
  
  let quality;
  if (missing.length === 0) {
    quality = 'complete';
  } else if (missing.length <= 1) {
    quality = 'partial';
  } else {
    quality = 'insufficient';
  }
  
  const passed = quality === test.expectedQuality;
  qualityPassedTests += passed ? 1 : 0;
  
  console.log(`${passed ? '✅' : '❌'} Test ${index + 1}`);
  console.log(`   Collected: contentType=${test.collected.hasContentType}, capacity=${test.collected.hasCapacity}, genres=${test.collected.hasGenres}`);
  console.log(`   Missing: ${missing.join(', ') || 'none'}`);
  console.log(`   Expected: ${test.expectedQuality}, Got: ${quality}`);
});

console.log(`\n📊 Results: ${qualityPassedTests}/${qualityTotalTests} tests passed`);

// Final Summary
console.log('\n' + '='.repeat(80));
console.log('📊 FINAL SUMMARY');
console.log('='.repeat(80));
console.log(`Intent Detection: ${passedTests}/${totalTests} passed`);
console.log(`Response Coherence: ${coherencePassedTests}/${coherenceTotalTests} passed`);
console.log(`Context Quality: ${qualityPassedTests}/${qualityTotalTests} passed`);

const totalPassed = passedTests + coherencePassedTests + qualityPassedTests;
const totalTotal = totalTests + coherenceTotalTests + qualityTotalTests;

console.log(`\n🎯 OVERALL: ${totalPassed}/${totalTotal} tests passed (${Math.round((totalPassed/totalTotal)*100)}%)`);

if (totalPassed === totalTotal) {
  console.log('✅ All tests passed! Conversation context logic is working correctly.');
  process.exit(0);
} else {
  console.log(`⚠️  Some tests failed. Please review the logic.`);
  process.exit(1);
}
