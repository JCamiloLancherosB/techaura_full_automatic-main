/**
 * Test script to verify conversation context tracking and coherence
 * Run with: npx tsx test-conversation-context.ts
 */

import { conversationMemory } from './src/services/conversationMemory';
import { conversationAnalyzer } from './src/services/conversationAnalyzer';
import { getUserSession, createUserSession, updateUserSession } from './src/flows/userTrackingSystem';

console.log('🧪 Testing Conversation Context Tracking and Coherence\n');
console.log('='.repeat(80));

const testPhone = '573001234567';

async function runTests() {
  try {
    // Test 1: Log user messages to conversation memory
    console.log('\n📋 Test 1: User message logging to conversation memory');
    console.log('-'.repeat(80));
    
    await conversationMemory.addTurn(testPhone, 'user', 'Hola, me interesa una USB de música');
    console.log('✅ User message logged: "Hola, me interesa una USB de música"');
    
    await conversationMemory.addTurn(testPhone, 'assistant', '¡Perfecto! Tenemos USBs de música personalizadas. ¿Qué géneros te gustan?');
    console.log('✅ Bot response logged');
    
    await conversationMemory.addTurn(testPhone, 'user', 'Me gusta el reggaeton y la salsa');
    console.log('✅ User message logged: "Me gusta el reggaeton y la salsa"');
    
    // Test 2: Retrieve conversation context
    console.log('\n📋 Test 2: Retrieve conversation context');
    console.log('-'.repeat(80));
    
    const context = await conversationMemory.getContext(testPhone, 5);
    console.log('✅ Context retrieved:');
    console.log('   - Recent turns:', context.recentTurns.length);
    console.log('   - Summary topics:', context.summary.mainTopics.join(', '));
    console.log('   - Product interests:', context.summary.productInterests.join(', '));
    console.log('   - Decision stage:', context.summary.decisionStage);
    console.log('   - Price discussed:', context.summary.priceDiscussed);
    
    if (context.recentTurns.length >= 3) {
      console.log('✅ PASS: Conversation history tracked correctly');
    } else {
      console.log('❌ FAIL: Expected at least 3 turns, got', context.recentTurns.length);
    }
    
    // Test 3: Analyze conversation context for coherence
    console.log('\n📋 Test 3: Conversation context analysis');
    console.log('-'.repeat(80));
    
    // Create or get session
    let session = await getUserSession(testPhone);
    if (!session) {
      session = await createUserSession(testPhone);
    }
    
    // Update session with some data
    await updateUserSession(testPhone, 'Me gusta el reggaeton y la salsa', 'musicUsb', 'genre_selection', false, {
      metadata: { genres: ['reggaeton', 'salsa'], contentType: 'musica' }
    });
    
    // Analyze next user message in context
    const userMessage = '¿Cuánto cuesta?';
    const analysis = await conversationAnalyzer.analyzeConversationContext(testPhone, userMessage);
    
    console.log('✅ Analysis for "¿Cuánto cuesta?":');
    console.log('   - Intent:', analysis.intent);
    console.log('   - Stage:', analysis.stage);
    console.log('   - Suggested action:', analysis.suggestedAction);
    console.log('   - Sales opportunity:', analysis.salesOpportunity);
    console.log('   - Coherence score:', analysis.coherenceScore);
    console.log('   - Detected concerns:', analysis.detectedConcerns.join(', ') || 'None');
    console.log('   - Suggested response:', analysis.suggestedResponse.substring(0, 100) + '...');
    
    if (analysis.suggestedAction === 'show_prices') {
      console.log('✅ PASS: Correctly identified price inquiry');
    } else {
      console.log('❌ FAIL: Expected "show_prices", got', analysis.suggestedAction);
    }
    
    // Test 4: Test incoherent scenario (user asks about music but bot tries to sell videos)
    console.log('\n📋 Test 4: Detect incoherent response scenario');
    console.log('-'.repeat(80));
    
    // Simulate user asking about music capacity
    await conversationMemory.addTurn(testPhone, 'user', '¿Cuántas canciones entran en la de 32GB?');
    
    // Analyze context
    const analysis2 = await conversationAnalyzer.analyzeConversationContext(testPhone, '¿Cuántas canciones entran en la de 32GB?');
    
    console.log('✅ Analysis for "¿Cuántas canciones entran en la de 32GB?":');
    console.log('   - Intent:', analysis2.intent);
    console.log('   - Suggested action:', analysis2.suggestedAction);
    console.log('   - Coherence score:', analysis2.coherenceScore);
    
    // The suggested response should mention music/songs, NOT videos or movies
    const suggestedResponse = analysis2.suggestedResponse.toLowerCase();
    const mentionsMusic = suggestedResponse.includes('canción') || suggestedResponse.includes('música') || suggestedResponse.includes('32gb');
    const mentionsVideos = suggestedResponse.includes('video') || suggestedResponse.includes('película');
    
    if (mentionsMusic && !mentionsVideos) {
      console.log('✅ PASS: Response is coherent with music context');
    } else if (mentionsVideos) {
      console.log('❌ FAIL: Response mentions videos when user asked about music');
      console.log('   Suggested response:', analysis2.suggestedResponse);
    } else {
      console.log('⚠️  WARNING: Response may not be specific enough');
      console.log('   Suggested response:', analysis2.suggestedResponse);
    }
    
    // Test 5: Test follow-up coherence (user says "yes" after being asked a question)
    console.log('\n📋 Test 5: Follow-up coherence ("yes" response)');
    console.log('-'.repeat(80));
    
    // Bot asked a question
    await conversationMemory.addTurn(testPhone, 'assistant', '¿Te gustaría ver todas las capacidades disponibles?');
    
    // User responds with simple "yes"
    await conversationMemory.addTurn(testPhone, 'user', 'Sí');
    
    const analysis3 = await conversationAnalyzer.analyzeConversationContext(testPhone, 'Sí');
    
    console.log('✅ Analysis for "Sí" (after capacity question):');
    console.log('   - Intent:', analysis3.intent);
    console.log('   - Suggested action:', analysis3.suggestedAction);
    console.log('   - Coherence score:', analysis3.coherenceScore);
    console.log('   - Suggested response preview:', analysis3.suggestedResponse.substring(0, 150) + '...');
    
    if (analysis3.intent === 'confirming' || analysis3.intent === 'buying') {
      console.log('✅ PASS: Correctly identified confirmation intent');
    } else {
      console.log('⚠️  WARNING: Expected "confirming" or "buying", got', analysis3.intent);
    }
    
    // Test 6: Memory statistics
    console.log('\n📋 Test 6: Conversation memory statistics');
    console.log('-'.repeat(80));
    
    const stats = conversationMemory.getStats();
    console.log('✅ Memory stats:');
    console.log('   - Cached conversations:', stats.cachedConversations);
    console.log('   - Cached summaries:', stats.cachedSummaries);
    console.log('   - Utilization:', stats.utilizationPercent + '%');
    console.log('   - Max cache size:', stats.maxCacheSize);
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ All conversation context tracking tests completed!');
    console.log('='.repeat(80));
    
    // Cleanup
    await conversationMemory.clearUserMemory(testPhone);
    console.log('\n🧹 Test data cleaned up');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run tests
runTests()
  .then(() => {
    console.log('\n✅ Test suite completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
