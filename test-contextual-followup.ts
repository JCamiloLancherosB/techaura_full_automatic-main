/**
 * Test script to verify contextual follow-up improvements
 * Run with: npx tsx test-contextual-followup.ts
 */

import type { UserSession } from './types/global';
import { needsFollowUp, getFollowUpMessage } from './src/utils/sessionHelpers';
import { getContextualFollowUpMessage } from './src/services/persuasionTemplates';

console.log('🧪 Testing Contextual Follow-up Improvements\n');
console.log('='.repeat(60));

// Helper to create test sessions
function createTestSession(overrides: Partial<UserSession>): UserSession {
  const now = new Date();
  const defaultSession: UserSession = {
    phone: '573001234567',
    phoneNumber: '573001234567',
    name: 'Carlos',
    stage: 'initial',
    buyingIntent: 50,
    interests: [],
    interactions: [],
    conversationData: {},
    lastInteraction: now,
    createdAt: now,
    updatedAt: now,
    messageCount: 5,
    isActive: true,
    isFirstMessage: false,
    followUpSpamCount: 0,
    totalOrders: 0,
  };
  
  return { ...defaultSession, ...overrides };
}

// Test 1: User just confirmed in personalization stage (should NOT get follow-up)
console.log('\n📋 Test 1: User in active personalization stage (< 24h)');
console.log('-'.repeat(60));
const user1 = createTestSession({
  stage: 'personalization',
  lastInteraction: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  buyingIntent: 75,
});
console.log('Stage:', user1.stage);
console.log('Last interaction:', '2 hours ago');
console.log('Needs follow-up:', needsFollowUp(user1));
console.log('Expected: false (user is in active stage, < 24h)');

// Test 2: User in awaiting_capacity stage (contextual message)
console.log('\n📋 Test 2: User awaiting capacity selection');
console.log('-'.repeat(60));
const user2 = createTestSession({
  stage: 'awaiting_capacity',
  lastInteraction: new Date(Date.now() - 30 * 60 * 60 * 1000), // 30 hours ago
  contentType: 'music' as any,
});
const contextMsg2 = getContextualFollowUpMessage(user2);
const helperMsg2 = getFollowUpMessage(user2);
console.log('Stage:', user2.stage);
console.log('Content type:', (user2 as any).contentType);
console.log('Contextual message preview:', contextMsg2?.substring(0, 100) + '...');
console.log('Helper message preview:', helperMsg2.substring(0, 100) + '...');
console.log('Expected: Should mention capacity options and CTA');

// Test 3: User in personalization with genres selected
console.log('\n📋 Test 3: User in personalization with genres');
console.log('-'.repeat(60));
const user3 = createTestSession({
  stage: 'personalization',
  lastInteraction: new Date(Date.now() - 30 * 60 * 60 * 1000), // 30 hours ago
  selectedGenres: ['rock', 'pop', 'reggaeton'],
});
const contextMsg3 = getContextualFollowUpMessage(user3);
console.log('Stage:', user3.stage);
console.log('Selected genres:', user3.selectedGenres);
console.log('Contextual message preview:', contextMsg3?.substring(0, 100) + '...');
console.log('Expected: Should acknowledge genres and suggest next step');

// Test 4: User with capacity selected (should get payment info message)
console.log('\n📋 Test 4: User awaiting payment with capacity selected');
console.log('-'.repeat(60));
const user4 = createTestSession({
  stage: 'awaiting_payment',
  lastInteraction: new Date(Date.now() - 30 * 60 * 60 * 1000), // 30 hours ago
  capacity: '128GB' as any,
  contentType: 'movies' as any,
});
const helperMsg4 = getFollowUpMessage(user4);
console.log('Stage:', user4.stage);
console.log('Capacity:', (user4 as any).capacity);
console.log('Helper message preview:', helperMsg4.substring(0, 120) + '...');
console.log('Expected: Should ask for shipping data');

// Test 5: User saw prices but didn't decide
console.log('\n📋 Test 5: User saw prices but didn\'t decide');
console.log('-'.repeat(60));
const user5 = createTestSession({
  stage: 'prices_shown',
  lastInteraction: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
  buyingIntent: 80,
});
const contextMsg5 = getContextualFollowUpMessage(user5);
const helperMsg5 = getFollowUpMessage(user5);
console.log('Stage:', user5.stage);
console.log('Buying intent:', user5.buyingIntent);
console.log('Contextual message preview:', contextMsg5?.substring(0, 100) + '...');
console.log('Helper message preview:', helperMsg5.substring(0, 100) + '...');
console.log('Expected: Should encourage capacity selection with benefits');

// Test 6: User in checkout stage (should NOT get follow-up soon)
console.log('\n📋 Test 6: User in checkout_started stage (< 24h)');
console.log('-'.repeat(60));
const user6 = createTestSession({
  stage: 'checkout_started',
  lastInteraction: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
});
console.log('Stage:', user6.stage);
console.log('Last interaction:', '5 hours ago');
console.log('Needs follow-up:', needsFollowUp(user6));
console.log('Expected: false (user is in active checkout stage)');

// Test 7: High intent user with content type but no capacity
console.log('\n📋 Test 7: High intent user with content type, no capacity');
console.log('-'.repeat(60));
const user7 = createTestSession({
  stage: 'interested',
  lastInteraction: new Date(Date.now() - 30 * 60 * 60 * 1000), // 30 hours ago
  contentType: 'music' as any,
  buyingIntent: 85,
});
const helperMsg7 = getFollowUpMessage(user7);
console.log('Stage:', user7.stage);
console.log('Content type:', (user7 as any).contentType);
console.log('Buying intent:', user7.buyingIntent);
console.log('Helper message preview:', helperMsg7.substring(0, 120) + '...');
console.log('Expected: Should suggest capacity selection for music USB');

console.log('\n' + '='.repeat(60));
console.log('✅ All tests completed');
console.log('\n💡 Key Improvements Tested:');
console.log('  1. Active stage detection (personalization, awaiting_capacity, etc.)');
console.log('  2. Contextual messages based on user progress');
console.log('  3. Genre detection and acknowledgment');
console.log('  4. CTAs that guide to next step');
console.log('  5. Respecting active conversation flows (24h wait for active stages)');
