/**
 * Test script to verify follow-up counter and cooldown logic
 * Run with: npx tsx test-followup-logic.ts
 */

import type { UserSession } from './types/global';
import { hasReachedMaxAttempts, isInCooldown } from './src/services/incomingMessageHandler';

// Test scenarios
console.log('🧪 Testing Follow-up Logic\n');

// Test 1: User with 0 attempts
const user1: Partial<UserSession> = {
  phone: '573001234567',
  followUpAttempts: 0,
  interactions: [],
};
console.log('Test 1: User with 0 attempts');
console.log('  hasReachedMaxAttempts:', hasReachedMaxAttempts(user1 as UserSession));
console.log('  Expected: false\n');

// Test 2: User with 2 attempts
const user2: Partial<UserSession> = {
  phone: '573001234567',
  followUpAttempts: 2,
  interactions: [],
};
console.log('Test 2: User with 2 attempts');
console.log('  hasReachedMaxAttempts:', hasReachedMaxAttempts(user2 as UserSession));
console.log('  Expected: false\n');

// Test 3: User with 3 attempts (should be blocked)
const user3: Partial<UserSession> = {
  phone: '573001234567',
  followUpAttempts: 3,
  interactions: [],
};
console.log('Test 3: User with 3 attempts');
console.log('  hasReachedMaxAttempts:', hasReachedMaxAttempts(user3 as UserSession));
console.log('  Expected: true\n');

// Test 4: User in active cooldown (48 hours)
const now = new Date();
const cooldownEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now
const user4: Partial<UserSession> = {
  phone: '573001234567',
  followUpAttempts: 3,
  cooldownUntil: cooldownEnd,
  interactions: [],
};
console.log('Test 4: User in active cooldown (48h)');
const cooldown4 = isInCooldown(user4 as UserSession);
console.log('  isInCooldown:', cooldown4.inCooldown);
console.log('  remainingHours:', cooldown4.remainingHours?.toFixed(1));
console.log('  Expected: true, ~48.0 hours\n');

// Test 5: User with expired cooldown
const expiredCooldown = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
const user5: Partial<UserSession> = {
  phone: '573001234567',
  followUpAttempts: 3,
  cooldownUntil: expiredCooldown,
  interactions: [],
};
console.log('Test 5: User with expired cooldown');
const cooldown5 = isInCooldown(user5 as UserSession);
console.log('  isInCooldown:', cooldown5.inCooldown);
console.log('  Expected: false\n');

// Test 6: User with 12 hours remaining in cooldown
const partialCooldown = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours from now
const user6: Partial<UserSession> = {
  phone: '573001234567',
  followUpAttempts: 3,
  cooldownUntil: partialCooldown,
  interactions: [],
};
console.log('Test 6: User with 12h remaining in cooldown');
const cooldown6 = isInCooldown(user6 as UserSession);
console.log('  isInCooldown:', cooldown6.inCooldown);
console.log('  remainingHours:', cooldown6.remainingHours?.toFixed(1));
console.log('  Expected: true, ~12.0 hours\n');

console.log('✅ All tests completed');
