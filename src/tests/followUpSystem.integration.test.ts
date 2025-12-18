/**
 * Integration Test for Follow-Up System
 * Tests the complete flow from message classification to database updates
 * UPDATED: Added tests for data collection and confirmation message generation
 */

import { processIncomingMessage, canReceiveFollowUps, hasReachedDailyLimit } from '../services/incomingMessageHandler';
import { classifyResponse } from '../services/responseClassifier';
import { getUserCollectedData, buildConfirmationMessage } from '../flows/userTrackingSystem';
import type { UserSession } from '../../types/global';

// Mock user session
function createMockSession(phone: string): UserSession {
  return {
    phone,
    phoneNumber: phone,
    name: 'Test User',
    stage: 'interested',
    buyingIntent: 50,
    lastInteraction: new Date(),
    interests: [],
    interactions: [],
    conversationData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    isFirstMessage: false,
    isActive: true,
    contactStatus: 'ACTIVE',
    followUpCount24h: 0
  };
}

// Mock user session with collected data
function createMockSessionWithData(phone: string): UserSession {
  const session = createMockSession(phone);
  
  // Use safer property assignment
  const sessionExt: UserSession & {
    capacity?: string;
    selectedGenres?: string[];
    mentionedArtists?: string[];
    contentType?: string;
    customerData?: any;
  } = session;
  
  sessionExt.capacity = '64GB';
  sessionExt.selectedGenres = ['rock', 'pop', 'reggaeton'];
  sessionExt.mentionedArtists = ['The Beatles', 'Queen'];
  sessionExt.contentType = 'musica';
  sessionExt.name = 'Juan Perez';
  sessionExt.customerData = {
    nombre: 'Juan Perez',
    celular: phone,
    direccion: 'Calle 123',
    ciudad: 'Bogotá'
  };
  
  return sessionExt;
}

async function runIntegrationTests() {
  console.log('🧪 Running Follow-Up System Integration Tests\n');
  console.log('='.repeat(70));
  
  // Test 1: Classification accuracy
  console.log('\n📝 Test 1: Response Classification\n');
  
  const testMessages = [
    { msg: 'no me interesa', expected: 'NEGATIVE' },
    { msg: 'ya lo compré', expected: 'COMPLETED' },
    { msg: 'ok gracias', expected: 'CONFIRMATION' },
    { msg: 'cuánto cuesta?', expected: 'POSITIVE' }
  ];
  
  let classificationPassed = 0;
  testMessages.forEach(({ msg, expected }) => {
    const result = classifyResponse(msg);
    const pass = result.category === expected;
    console.log(`  ${pass ? '✅' : '❌'} "${msg}" -> ${result.category} (expected: ${expected})`);
    if (pass) classificationPassed++;
  });
  
  console.log(`\n  Result: ${classificationPassed}/${testMessages.length} passed`);
  
  // Test 2: Follow-up eligibility checks
  console.log('\n📝 Test 2: Follow-Up Eligibility\n');
  
  const activeSession = createMockSession('573001234567');
  const optOutSession = { ...createMockSession('573009999999'), contactStatus: 'OPT_OUT' as const };
  const closedSession = { ...createMockSession('573008888888'), contactStatus: 'CLOSED' as const };
  const limitReachedSession = {
    ...createMockSession('573007777777'),
    followUpCount24h: 1,
    lastFollowUpResetAt: new Date()
  };
  
  const tests = [
    { name: 'ACTIVE user', session: activeSession, shouldReceive: true },
    { name: 'OPT_OUT user', session: optOutSession, shouldReceive: false },
    { name: 'CLOSED user', session: closedSession, shouldReceive: false },
    { name: 'Daily limit reached', session: limitReachedSession, shouldReceive: false }
  ];
  
  let eligibilityPassed = 0;
  tests.forEach(({ name, session, shouldReceive }) => {
    const { can, reason } = canReceiveFollowUps(session);
    const limitReached = hasReachedDailyLimit(session);
    const actualCanReceive = can && !limitReached;
    const pass = actualCanReceive === shouldReceive;
    
    console.log(`  ${pass ? '✅' : '❌'} ${name}: ${actualCanReceive ? 'Can receive' : 'Cannot receive'}`);
    if (!can) console.log(`      Reason: ${reason}`);
    if (limitReached) console.log(`      Reason: Daily limit reached`);
    
    if (pass) eligibilityPassed++;
  });
  
  console.log(`\n  Result: ${eligibilityPassed}/${tests.length} passed`);
  
  // Test 3: Status transitions
  console.log('\n📝 Test 3: Status Transitions (Simulated)\n');
  
  const statusTests = [
    {
      name: 'ACTIVE -> OPT_OUT on "no me interesa"',
      initial: 'ACTIVE' as const,
      message: 'no me interesa',
      expectedNew: 'OPT_OUT' as const
    },
    {
      name: 'ACTIVE -> CLOSED on "ya lo compré"',
      initial: 'ACTIVE' as const,
      message: 'ya lo compré',
      expectedNew: 'CLOSED' as const
    },
    {
      name: 'ACTIVE remains ACTIVE on "ok"',
      initial: 'ACTIVE' as const,
      message: 'ok',
      expectedNew: 'ACTIVE' as const
    }
  ];
  
  let statusPassed = 0;
  statusTests.forEach(({ name, message, expectedNew }) => {
    const classification = classifyResponse(message);
    let predictedStatus: 'ACTIVE' | 'OPT_OUT' | 'CLOSED' = 'ACTIVE';
    
    if (classification.category === 'NEGATIVE' && classification.confidence >= 0.8) {
      predictedStatus = 'OPT_OUT';
    } else if (classification.category === 'COMPLETED' && classification.confidence >= 0.8) {
      predictedStatus = 'CLOSED';
    }
    
    const pass = predictedStatus === expectedNew;
    console.log(`  ${pass ? '✅' : '❌'} ${name}`);
    console.log(`      Message: "${message}"`);
    console.log(`      Classification: ${classification.category} (${classification.confidence})`);
    console.log(`      Predicted status: ${predictedStatus} (expected: ${expectedNew})`);
    
    if (pass) statusPassed++;
  });
  
  console.log(`\n  Result: ${statusPassed}/${statusTests.length} passed`);
  
  // Test 4: User data collection tracking
  console.log('\n📝 Test 4: User Data Collection Tracking\n');
  
  const sessionWithData = createMockSessionWithData('573001111111');
  const collectedData = getUserCollectedData(sessionWithData);
  
  let dataCollectionPassed = 0;
  const dataTests = [
    { name: 'Has capacity', actual: collectedData.hasCapacity, expected: true },
    { name: 'Capacity is 64GB', actual: collectedData.capacity, expected: '64GB' },
    { name: 'Has genres', actual: collectedData.hasGenres, expected: true },
    { name: 'Has 3 genres', actual: collectedData.genres?.length, expected: 3 },
    { name: 'Has artists', actual: collectedData.hasArtists, expected: true },
    { name: 'Has content type', actual: collectedData.hasContentType, expected: true },
    { name: 'Has personal info', actual: collectedData.hasPersonalInfo, expected: true },
    { name: 'Has shipping info', actual: collectedData.hasShippingInfo, expected: true },
    { name: 'Completion > 50%', actual: collectedData.completionPercentage > 50, expected: true }
  ];
  
  dataTests.forEach(({ name, actual, expected }) => {
    const pass = actual === expected;
    console.log(`  ${pass ? '✅' : '❌'} ${name}: ${actual} (expected: ${expected})`);
    if (pass) dataCollectionPassed++;
  });
  
  console.log(`\n  Result: ${dataCollectionPassed}/${dataTests.length} passed`);
  
  // Test 5: Confirmation message generation
  console.log('\n📝 Test 5: Confirmation Message Generation\n');
  
  const confirmationMsg = buildConfirmationMessage(sessionWithData, true);
  
  let confirmationPassed = 0;
  const confirmationChecks = [
    { name: 'Includes capacity', check: confirmationMsg.includes('64GB') },
    { name: 'Includes name', check: confirmationMsg.includes('Juan Perez') },
    { name: 'Includes progress', check: confirmationMsg.includes('Progreso') },
    { name: 'Includes completion %', check: /\d+%/.test(confirmationMsg) },
    { name: 'Includes next steps', check: confirmationMsg.includes('Siguiente paso') }
  ];
  
  confirmationChecks.forEach(({ name, check }) => {
    console.log(`  ${check ? '✅' : '❌'} ${name}`);
    if (check) confirmationPassed++;
  });
  
  console.log(`\n  Result: ${confirmationPassed}/${confirmationChecks.length} passed`);
  console.log(`\n  Sample confirmation message:\n${confirmationMsg}\n`);

  // Summary
  console.log('\n' + '='.repeat(70));
  const totalTests = testMessages.length + tests.length + statusTests.length + dataTests.length + confirmationChecks.length;
  const totalPassed = classificationPassed + eligibilityPassed + statusPassed + dataCollectionPassed + confirmationPassed;
  
  console.log(`\n📊 Overall Results: ${totalPassed}/${totalTests} tests passed`);
  
  if (totalPassed === totalTests) {
    console.log('\n🎉 All integration tests passed!');
    return true;
  } else {
    console.log(`\n⚠️  ${totalTests - totalPassed} test(s) failed`);
    return false;
  }
}

// Run tests
runIntegrationTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
