/**
 * Unit tests for MessageDeduper service
 * 
 * Tests the core deduplication logic without requiring a database connection
 */

import { MessageDeduper } from '../services/MessageDeduper';

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
