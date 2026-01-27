/**
 * Unit tests for MessageDeduper service
 * 
 * Tests the core deduplication logic without requiring a database connection
 */

import { MessageDeduper, DedupeKeyInput } from '../services/MessageDeduper';

describe('MessageDeduper', () => {
  let deduper: MessageDeduper;

  beforeEach(() => {
    // Create a new deduper instance for each test
    // Use 1-minute TTL and 10-second cleanup for faster testing
    deduper = new MessageDeduper(1, 0.166667); // 1 min TTL, 10 sec cleanup
  });

  afterEach(() => {
    if (deduper) {
      deduper.shutdown();
    }
  });

  describe('isProcessed()', () => {
    it('should return false for a new message', async () => {
      const messageId = 'msg_001';
      const remoteJid = '1234567890@s.whatsapp.net';

      const result = await deduper.isProcessed(messageId, remoteJid);
      expect(result).toBe(false);
    });

    it('should return true for a previously processed message', async () => {
      const messageId = 'msg_002';
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.markAsProcessed(messageId, remoteJid);
      const result = await deduper.isProcessed(messageId, remoteJid);

      expect(result).toBe(true);
    });

    it('should treat different message IDs as different messages', async () => {
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.markAsProcessed('msg_003', remoteJid);
      const result = await deduper.isProcessed('msg_004', remoteJid);

      expect(result).toBe(false);
    });

    it('should treat different remote JIDs as different messages', async () => {
      const messageId = 'msg_005';

      await deduper.markAsProcessed(messageId, '1111111111@s.whatsapp.net');
      const result = await deduper.isProcessed(messageId, '2222222222@s.whatsapp.net');

      expect(result).toBe(false);
    });
  });

  describe('markAsProcessed()', () => {
    it('should mark a message as processed', async () => {
      const messageId = 'msg_006';
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.markAsProcessed(messageId, remoteJid);
      const result = await deduper.isProcessed(messageId, remoteJid);

      expect(result).toBe(true);
    });

    it('should update metrics when marking messages', async () => {
      const messageId = 'msg_007';
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.markAsProcessed(messageId, remoteJid);
      const metrics = deduper.getMetrics();

      expect(metrics.messagesProcessed).toBeGreaterThan(0);
      expect(metrics.cacheSize).toBeGreaterThan(0);
    });
  });

  describe('getMetrics()', () => {
    it('should return correct metrics', async () => {
      const metrics = deduper.getMetrics();

      expect(metrics).toHaveProperty('totalChecked');
      expect(metrics).toHaveProperty('duplicatesFound');
      expect(metrics).toHaveProperty('messagesProcessed');
      expect(metrics).toHaveProperty('cacheSize');
    });

    it('should track duplicate detection', async () => {
      const messageId = 'msg_008';
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.markAsProcessed(messageId, remoteJid);
      await deduper.isProcessed(messageId, remoteJid); // Should detect as duplicate

      const metrics = deduper.getMetrics();
      expect(metrics.duplicatesFound).toBeGreaterThan(0);
    });

    it('should track total checks', async () => {
      const messageId = 'msg_009';
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.isProcessed(messageId, remoteJid);
      await deduper.isProcessed(messageId, remoteJid);
      await deduper.isProcessed(messageId, remoteJid);

      const metrics = deduper.getMetrics();
      expect(metrics.totalChecked).toBe(3);
    });

    it('should track cache hits and misses', async () => {
      const messageId = 'msg_cache_test';
      const remoteJid = '1234567890@s.whatsapp.net';

      // First check - should be a cache miss (new message)
      await deduper.isProcessed(messageId, remoteJid);
      let metrics = deduper.getMetrics();
      expect(metrics.cacheMisses).toBe(1);

      // Mark as processed
      await deduper.markAsProcessed(messageId, remoteJid);

      // Second check - should be a cache hit (duplicate)
      await deduper.isProcessed(messageId, remoteJid);
      metrics = deduper.getMetrics();
      expect(metrics.cacheHits).toBe(1);
    });
  });

  describe('clear()', () => {
    it('should clear all cached entries', async () => {
      const messageId = 'msg_010';
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.markAsProcessed(messageId, remoteJid);
      deduper.clear();

      const result = await deduper.isProcessed(messageId, remoteJid);
      expect(result).toBe(false);
    });

    it('should reset cache size metric', async () => {
      await deduper.markAsProcessed('msg_011', '1111111111@s.whatsapp.net');
      await deduper.markAsProcessed('msg_012', '2222222222@s.whatsapp.net');

      deduper.clear();
      const metrics = deduper.getMetrics();

      expect(metrics.cacheSize).toBe(0);
    });
  });

  describe('TTL and expiration', () => {
    it('should expire messages after TTL', async () => {
      // Create deduper with very short TTL for testing
      const shortTtlDeduper = new MessageDeduper(0.01, 0.005); // 0.6 second TTL, 0.3 sec cleanup
      const messageId = 'msg_013';
      const remoteJid = '1234567890@s.whatsapp.net';

      await shortTtlDeduper.markAsProcessed(messageId, remoteJid);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await shortTtlDeduper.isProcessed(messageId, remoteJid);
      expect(result).toBe(false);

      shortTtlDeduper.shutdown();
    });
  });

  describe('resetMetrics()', () => {
    it('should reset all metrics to zero except cache size', async () => {
      const messageId = 'msg_014';
      const remoteJid = '1234567890@s.whatsapp.net';

      await deduper.markAsProcessed(messageId, remoteJid);
      await deduper.isProcessed(messageId, remoteJid);

      deduper.resetMetrics();
      const metrics = deduper.getMetrics();

      expect(metrics.totalChecked).toBe(0);
      expect(metrics.duplicatesFound).toBe(0);
      expect(metrics.messagesProcessed).toBe(0);
      // Cache size should still reflect actual cache contents
      expect(metrics.cacheSize).toBeGreaterThan(0);
    });
  });

  describe('Concurrent processing', () => {
    it('should handle concurrent checks without race conditions', async () => {
      const messageId = 'msg_015';
      const remoteJid = '1234567890@s.whatsapp.net';

      // Mark as processed
      await deduper.markAsProcessed(messageId, remoteJid);

      // Multiple concurrent checks
      const results = await Promise.all([
        deduper.isProcessed(messageId, remoteJid),
        deduper.isProcessed(messageId, remoteJid),
        deduper.isProcessed(messageId, remoteJid),
      ]);

      // All should detect as duplicate
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('Duplicate prevention scenario', () => {
    it('should prevent duplicate order processing', async () => {
      // Simulate reconnection scenario
      const messageId = 'ORDER_MSG_001';
      const remoteJid = '5551234567890@s.whatsapp.net';

      // First delivery - should process
      const firstCheck = await deduper.isProcessed(messageId, remoteJid);
      expect(firstCheck).toBe(false);
      await deduper.markAsProcessed(messageId, remoteJid);

      // Second delivery (duplicate due to reconnection) - should skip
      const secondCheck = await deduper.isProcessed(messageId, remoteJid);
      expect(secondCheck).toBe(true);

      // Third delivery - should still skip
      const thirdCheck = await deduper.isProcessed(messageId, remoteJid);
      expect(thirdCheck).toBe(true);

      const metrics = deduper.getMetrics();
      expect(metrics.duplicatesFound).toBe(2);
      expect(metrics.messagesProcessed).toBe(1);
    });
  });

  // ========== NEW TESTS for robust dedupe key ==========

  describe('computeDedupeKey()', () => {
    it('should prefer native provider ID when available', () => {
      const input: DedupeKeyInput = {
        providerMessageId: 'wa_msg_12345',
        remoteJid: '1234567890@s.whatsapp.net',
        textContent: 'Hello world'
      };

      const result = deduper.computeDedupeKey(input);
      
      expect(result.keyType).toBe('native');
      expect(result.key).toBe('wa_msg_12345:1234567890@s.whatsapp.net');
    });

    it('should use fallback when provider ID is missing', () => {
      const input: DedupeKeyInput = {
        remoteJid: '1234567890@s.whatsapp.net',
        providerTimestamp: Date.now(),
        textContent: 'Hello world'
      };

      const result = deduper.computeDedupeKey(input);
      
      expect(result.keyType).toBe('fallback');
      expect(result.key.startsWith('fb_')).toBe(true);
    });

    it('should use fallback when provider ID is empty string', () => {
      const input: DedupeKeyInput = {
        providerMessageId: '',
        remoteJid: '1234567890@s.whatsapp.net',
        textContent: 'Hello world'
      };

      const result = deduper.computeDedupeKey(input);
      
      expect(result.keyType).toBe('fallback');
    });

    it('should generate different keys for different text content', () => {
      const input1: DedupeKeyInput = {
        remoteJid: '1234567890@s.whatsapp.net',
        providerTimestamp: 1700000000000,
        textContent: 'Hello world'
      };

      const input2: DedupeKeyInput = {
        remoteJid: '1234567890@s.whatsapp.net',
        providerTimestamp: 1700000000000,
        textContent: 'Goodbye world'
      };

      const result1 = deduper.computeDedupeKey(input1);
      const result2 = deduper.computeDedupeKey(input2);

      expect(result1.key).not.toBe(result2.key);
    });

    it('should generate same key for identical messages (retries)', () => {
      const input1: DedupeKeyInput = {
        providerMessageId: 'wa_msg_retry_001',
        remoteJid: '1234567890@s.whatsapp.net',
        textContent: 'Order USB 64GB'
      };

      const input2: DedupeKeyInput = {
        providerMessageId: 'wa_msg_retry_001',
        remoteJid: '1234567890@s.whatsapp.net',
        textContent: 'Order USB 64GB'
      };

      const result1 = deduper.computeDedupeKey(input1);
      const result2 = deduper.computeDedupeKey(input2);

      expect(result1.key).toBe(result2.key);
    });

    it('should normalize text content for fallback keys', () => {
      const input1: DedupeKeyInput = {
        remoteJid: '1234567890@s.whatsapp.net',
        providerTimestamp: 1700000000000,
        textContent: '  Hello   World  '
      };

      const input2: DedupeKeyInput = {
        remoteJid: '1234567890@s.whatsapp.net',
        providerTimestamp: 1700000000000,
        textContent: 'hello world'
      };

      const result1 = deduper.computeDedupeKey(input1);
      const result2 = deduper.computeDedupeKey(input2);

      // Normalized text should produce same hash
      expect(result1.key).toBe(result2.key);
    });

    it('should track native vs fallback key metrics', () => {
      deduper.resetMetrics();

      // Generate native key
      deduper.computeDedupeKey({
        providerMessageId: 'wa_001',
        remoteJid: '1234567890@s.whatsapp.net'
      });

      // Generate fallback key
      deduper.computeDedupeKey({
        remoteJid: '1234567890@s.whatsapp.net',
        textContent: 'Test'
      });

      const metrics = deduper.getMetrics();
      expect(metrics.nativeKeyCount).toBe(1);
      expect(metrics.fallbackKeyCount).toBe(1);
    });
  });

  describe('isProcessedWithContext()', () => {
    it('should correctly dedupe using native provider ID', async () => {
      const input: DedupeKeyInput = {
        providerMessageId: 'wa_context_001',
        remoteJid: '1234567890@s.whatsapp.net',
        textContent: 'Order request'
      };

      // First check - should not be duplicate
      const firstResult = await deduper.isProcessedWithContext(input);
      expect(firstResult.isDuplicate).toBe(false);
      expect(firstResult.keyType).toBe('native');

      // Mark as processed
      await deduper.markAsProcessedWithContext(input);

      // Second check - should be duplicate
      const secondResult = await deduper.isProcessedWithContext(input);
      expect(secondResult.isDuplicate).toBe(true);
    });

    it('should not dedupe different messages from same phone', async () => {
      const remoteJid = '1234567890@s.whatsapp.net';
      const timestamp = Date.now();

      const input1: DedupeKeyInput = {
        providerMessageId: 'wa_msg_unique_001',
        remoteJid,
        textContent: 'First message'
      };

      const input2: DedupeKeyInput = {
        providerMessageId: 'wa_msg_unique_002',
        remoteJid,
        textContent: 'Second message'
      };

      // Process first message
      await deduper.markAsProcessedWithContext(input1);

      // Check second message - should NOT be deduplicated
      const result = await deduper.isProcessedWithContext(input2);
      expect(result.isDuplicate).toBe(false);
    });

    it('should dedupe retry messages with same provider ID', async () => {
      const input: DedupeKeyInput = {
        providerMessageId: 'wa_retry_msg_001',
        remoteJid: '1234567890@s.whatsapp.net',
        textContent: 'Order USB 128GB'
      };

      // First delivery
      const first = await deduper.isProcessedWithContext(input);
      expect(first.isDuplicate).toBe(false);
      await deduper.markAsProcessedWithContext(input);

      // Retry (same message ID due to reconnection)
      const retry = await deduper.isProcessedWithContext(input);
      expect(retry.isDuplicate).toBe(true);
    });
  });

  describe('False positive prevention', () => {
    it('should NOT dedupe messages with same content but different IDs', async () => {
      // This tests that two legitimately different messages with same text
      // are NOT incorrectly marked as duplicates when they have different provider IDs
      
      const remoteJid = '1234567890@s.whatsapp.net';
      const sameContent = 'Quiero ordenar USB';

      const firstMessage: DedupeKeyInput = {
        providerMessageId: 'wa_user_msg_001',
        remoteJid,
        textContent: sameContent
      };

      const secondMessage: DedupeKeyInput = {
        providerMessageId: 'wa_user_msg_002', // Different ID = different message
        remoteJid,
        textContent: sameContent
      };

      // Process first message
      await deduper.markAsProcessedWithContext(firstMessage);

      // Second message should NOT be deduplicated (different provider ID)
      const result = await deduper.isProcessedWithContext(secondMessage);
      expect(result.isDuplicate).toBe(false);
    });

    it('should NOT dedupe messages from different users with same content', async () => {
      const sameContent = 'Hola, quiero información';

      const user1Message: DedupeKeyInput = {
        providerMessageId: 'wa_unique_001',
        remoteJid: '1111111111@s.whatsapp.net',
        textContent: sameContent
      };

      const user2Message: DedupeKeyInput = {
        providerMessageId: 'wa_unique_002',
        remoteJid: '2222222222@s.whatsapp.net',
        textContent: sameContent
      };

      // Process first user's message
      await deduper.markAsProcessedWithContext(user1Message);

      // Second user's message should NOT be deduplicated
      const result = await deduper.isProcessedWithContext(user2Message);
      expect(result.isDuplicate).toBe(false);
    });
  });
});

// Mock expect functions for simple testing without a test framework
function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${value} to be ${expected}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toHaveProperty(prop: string) {
      if (!(prop in value)) {
        throw new Error(`Expected object to have property ${prop}`);
      }
    },
    not: {
      toBe(expected: any) {
        if (value === expected) {
          throw new Error(`Expected ${value} to NOT be ${expected}`);
        }
      }
    }
  };
}

function describe(name: string, fn: () => void) {
  console.log(`\n📋 ${name}`);
  fn();
}

function it(description: string, fn: () => Promise<void> | void) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅ ${description}`);
    } catch (error) {
      console.error(`  ❌ ${description}`);
      console.error(`     ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

let beforeEachFn: (() => void) | null = null;
let afterEachFn: (() => void) | null = null;

function beforeEach(fn: () => void) {
  beforeEachFn = fn;
}

function afterEach(fn: () => void) {
  afterEachFn = fn;
}

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('🧪 Running MessageDeduper tests...\n');
  // Execute test suite
  // Note: In a real test environment, use Jest, Mocha, or another test runner
}
