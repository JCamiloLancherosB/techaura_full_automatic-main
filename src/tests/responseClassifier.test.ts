/**
 * Tests for Response Classifier
 * Run with: npx tsx src/tests/responseClassifier.test.ts
 */

import { 
  classifyResponse, 
  shouldOptOut, 
  shouldMarkClosed, 
  isSimpleConfirmation, 
  showsInterest,
  type ResponseCategory
} from '../services/responseClassifier';

interface TestCase {
  message: string;
  expectedCategory: ResponseCategory;
  description: string;
}

const testCases: TestCase[] = [
  // NEGATIVE (opt-out) tests
  {
    message: 'no me interesa',
    expectedCategory: 'NEGATIVE',
    description: 'Spanish "not interested"'
  },
  {
    message: 'STOP',
    expectedCategory: 'NEGATIVE',
    description: 'English STOP command'
  },
  {
    message: 'Ya no quiero recibir mensajes',
    expectedCategory: 'NEGATIVE',
    description: 'Spanish "don\'t want messages"'
  },
  {
    message: 'cancelar',
    expectedCategory: 'NEGATIVE',
    description: 'Spanish "cancel"'
  },
  {
    message: 'Parar de enviarme cosas',
    expectedCategory: 'NEGATIVE',
    description: 'Spanish "stop sending"'
  },
  
  // COMPLETED tests
  {
    message: 'ya lo compré ayer',
    expectedCategory: 'COMPLETED',
    description: 'Already purchased'
  },
  {
    message: 'Ya decidí por otro producto',
    expectedCategory: 'COMPLETED',
    description: 'Already decided'
  },
  {
    message: 'Ya está, todo listo',
    expectedCategory: 'COMPLETED',
    description: 'All done'
  },
  {
    message: 'Ya lo tengo',
    expectedCategory: 'COMPLETED',
    description: 'Already have it'
  },
  
  // CONFIRMATION tests
  {
    message: 'ok',
    expectedCategory: 'CONFIRMATION',
    description: 'Simple OK'
  },
  {
    message: 'Recibido, gracias',
    expectedCategory: 'CONFIRMATION',
    description: 'Received thanks'
  },
  {
    message: 'Entendido',
    expectedCategory: 'CONFIRMATION',
    description: 'Understood'
  },
  {
    message: 'Vale',
    expectedCategory: 'CONFIRMATION',
    description: 'Spanish "okay"'
  },
  
  // POSITIVE tests
  {
    message: 'Cuánto cuesta el USB de 32GB?',
    expectedCategory: 'POSITIVE',
    description: 'Price inquiry'
  },
  {
    message: 'Me interesa, dime más',
    expectedCategory: 'POSITIVE',
    description: 'Show interest'
  },
  {
    message: 'Quiero saber más información',
    expectedCategory: 'POSITIVE',
    description: 'Want more info'
  },
  {
    message: 'Necesito uno de música',
    expectedCategory: 'POSITIVE',
    description: 'Express need'
  },
  
  // NEUTRAL tests
  {
    message: 'Hola, cómo estás?',
    expectedCategory: 'NEUTRAL',
    description: 'Generic greeting'
  },
  {
    message: 'Tienes algo en azul?',
    expectedCategory: 'NEUTRAL',
    description: 'Specific question (not interest keyword)'
  }
];

function runTests() {
  console.log('🧪 Running Response Classifier Tests\n');
  console.log('='.repeat(70));
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    const result = classifyResponse(testCase.message);
    const success = result.category === testCase.expectedCategory;
    
    if (success) {
      passed++;
      console.log(`✅ Test ${index + 1}: ${testCase.description}`);
      console.log(`   Message: "${testCase.message}"`);
      console.log(`   Category: ${result.category} (confidence: ${result.confidence})`);
      if (result.matchedKeywords.length > 0) {
        console.log(`   Matched: [${result.matchedKeywords.join(', ')}]`);
      }
    } else {
      failed++;
      console.log(`❌ Test ${index + 1}: ${testCase.description}`);
      console.log(`   Message: "${testCase.message}"`);
      console.log(`   Expected: ${testCase.expectedCategory}, Got: ${result.category}`);
      if (result.matchedKeywords.length > 0) {
        console.log(`   Matched: [${result.matchedKeywords.join(', ')}]`);
      }
    }
    console.log('');
  });
  
  console.log('='.repeat(70));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed out of ${testCases.length} total`);
  
  // Test helper functions
  console.log('\n🔍 Testing Helper Functions\n');
  console.log('='.repeat(70));
  
  console.log('\nshouldOptOut():');
  console.log(`  "no me interesa" -> ${shouldOptOut('no me interesa')}`);
  console.log(`  "STOP" -> ${shouldOptOut('STOP')}`);
  console.log(`  "cuánto cuesta" -> ${shouldOptOut('cuánto cuesta')}`);
  
  console.log('\nshouldMarkClosed():');
  console.log(`  "ya lo compré" -> ${shouldMarkClosed('ya lo compré')}`);
  console.log(`  "ya decidí" -> ${shouldMarkClosed('ya decidí')}`);
  console.log(`  "me interesa" -> ${shouldMarkClosed('me interesa')}`);
  
  console.log('\nisSimpleConfirmation():');
  console.log(`  "ok" -> ${isSimpleConfirmation('ok')}`);
  console.log(`  "recibido" -> ${isSimpleConfirmation('recibido')}`);
  console.log(`  "quiero más info" -> ${isSimpleConfirmation('quiero más info')}`);
  
  console.log('\nshowsInterest():');
  console.log(`  "me interesa" -> ${showsInterest('me interesa')}`);
  console.log(`  "cuánto cuesta" -> ${showsInterest('cuánto cuesta')}`);
  console.log(`  "no gracias" -> ${showsInterest('no gracias')}`);
  
  console.log('\n' + '='.repeat(70));
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runTests();
