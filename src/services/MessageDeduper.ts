/**
 * MessageDeduper - Idempotent message processing to prevent duplicate orders under Baileys reconnection
 * 
 * Scope:
 * - Deduplicate by (messageId + remoteJid + time window)
 * - Track processed message IDs in memory with optional MySQL persistence
 * - If already processed, skip and log 'dedup_skipped'
 * - Track duplicate count metrics
 * - Record Decision Trace for deduplication events
 * 
 * Design:
 * - In-memory cache with TTL for fast lookups
 * - Optional MySQL persistence for crash recovery
 * - Automatic cleanup of old entries
 * 
 * Dedupe Key Strategy (priority order):
 * 1. Native provider message ID (ctx.key.id or wa message id) - most reliable
 * 2. Fallback: phoneHash + providerTimestamp + normalizedTextHash - for edge cases
 */

import { createHash } from 'crypto';
import { unifiedLogger } from '../utils/unifiedLogger';
import { messageDecisionService, DecisionStage, Decision, DecisionReasonCode } from './MessageDecisionService';
import { getCorrelationId } from './CorrelationIdManager';
import { hashPhone } from '../utils/phoneHasher';

interface ProcessedMessage {
  messageId: string;
  remoteJid: string;
  processedAt: number;
  expiresAt: number;
  dedupeKeyType?: 'native' | 'fallback';
}

interface DedupMetrics {
  totalChecked: number;
  duplicatesFound: number;
  messagesProcessed: number;
  cacheSize: number;
  /** Number of dedupe keys generated using native provider ID */
  nativeKeyCount: number;
  /** Number of dedupe keys generated using fallback hash */
  fallbackKeyCount: number;
  /** Hits from memory cache */
  cacheHits: number;
  /** Hits from database lookup */
  dbHits: number;
  /** Cache misses (new messages) */
  cacheMisses: number;
}

/**
 * Input for computing a robust dedupe key
 */
export interface DedupeKeyInput {
  /** Native provider message ID (preferred) */
  providerMessageId?: string;
  /** Remote JID (phone with @s.whatsapp.net) */
  remoteJid: string;
  /** Message timestamp from provider (epoch ms or ISO string) */
  providerTimestamp?: number | string;
  /** Raw message text content */
  textContent?: string;
}

export class MessageDeduper {
  private cache: Map<string, ProcessedMessage>;
  private metrics: DedupMetrics;
  private readonly TTL_MS: number;
  private readonly CLEANUP_INTERVAL_MS: number;
  private cleanupTimer?: NodeJS.Timeout;
  private db?: any; // Optional MySQL connection

  constructor(
    ttlMinutes: number = 5,
    cleanupIntervalMinutes: number = 1,
    database?: any
  ) {
    this.cache = new Map();
    this.metrics = {
      totalChecked: 0,
      duplicatesFound: 0,
      messagesProcessed: 0,
      cacheSize: 0,
      nativeKeyCount: 0,
      fallbackKeyCount: 0,
      cacheHits: 0,
      dbHits: 0,
      cacheMisses: 0,
    };
    this.TTL_MS = ttlMinutes * 60 * 1000;
    this.CLEANUP_INTERVAL_MS = cleanupIntervalMinutes * 60 * 1000;
    this.db = database;

    // Start automatic cleanup
    this.startCleanup();

    unifiedLogger.info('deduplication', 'MessageDeduper initialized', {
      ttlMinutes,
      cleanupIntervalMinutes,
      hasDatabasePersistence: !!database,
    });
  }

  /**
   * Compute a robust dedupe key using the recommended strategy:
   * 1. Prefer native provider message ID (most reliable, unique per message)
   * 2. Fallback: phoneHash + providerTimestamp + normalizedTextHash
   * 
   * This reduces false positives by using more specific identifiers.
   * 
   * @param input - DedupeKeyInput with message context
   * @returns Object with the computed key and key type
   */
  computeDedupeKey(input: DedupeKeyInput): { key: string; keyType: 'native' | 'fallback' } {
    const { providerMessageId, remoteJid, providerTimestamp, textContent } = input;

    // Strategy 1: Use native provider ID if available (preferred)
    // Native provider IDs are globally unique per message, making this the most reliable strategy
    if (providerMessageId && providerMessageId.trim().length > 0) {
      // Native provider IDs are globally unique, combine with remoteJid for extra safety
      const key = `${providerMessageId}:${remoteJid}`;
      this.metrics.nativeKeyCount++;
      return { key, keyType: 'native' };
    }

    // Strategy 2: Fallback - robust combination of phoneHash + timestamp + textHash
    // This handles edge cases where provider ID is missing
    // NOTE: This is less reliable than native ID and may have edge cases
    const phoneHash = hashPhone(remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', ''));
    
    // Use actual timestamp when available, current time as fallback
    // Using current time ensures unique keys for messages without timestamps
    let timestampStr: string;
    if (providerTimestamp) {
      const ts = typeof providerTimestamp === 'string' 
        ? new Date(providerTimestamp).getTime() 
        : providerTimestamp;
      // Use 1-second precision (round down to nearest second) to balance uniqueness vs retry detection
      // This provides better precision than 5-second rounding while still handling minor timing drift
      timestampStr = Math.floor(ts / 1000).toString();
    } else {
      // No timestamp provided - use current time to ensure uniqueness
      // This prevents messages without timestamps from colliding
      timestampStr = Math.floor(Date.now() / 1000).toString();
    }

    // Use text content hash - preserve original case to avoid false positives
    // Different messages like "Yes" and "yes" from same user should not be deduped
    const normalizedText = (textContent || '')
      .trim() // Only trim whitespace, preserve case
      .substring(0, 200); // Limit to first 200 chars for consistent hashing

    const textHash = createHash('sha256')
      .update(normalizedText)
      .digest('hex')
      .substring(0, 16);

    const fallbackKey = `fb_${phoneHash}_${timestampStr}_${textHash}`;
    this.metrics.fallbackKeyCount++;
    
    unifiedLogger.debug('deduplication', 'Using fallback dedupe key', {
      phoneHash,
      hasTimestamp: !!providerTimestamp,
      textLength: normalizedText.length,
    });

    return { key: fallbackKey, keyType: 'fallback' };
  }

  /**
   * Check if a message has already been processed
   * @param messageId - WhatsApp message ID from Baileys
   * @param remoteJid - Remote JID (phone number with @s.whatsapp.net)
   * @returns true if message was already processed
   */
  async isProcessed(messageId: string, remoteJid: string): Promise<boolean> {
    this.metrics.totalChecked++;

    const cacheKey = this.getCacheKey(messageId, remoteJid);
    const now = Date.now();

    // Check in-memory cache first (fast path)
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.metrics.duplicatesFound++;
      this.metrics.cacheHits++;
      
      // Structured log for dedupe hit
      unifiedLogger.info('deduplication', 'DEDUPED: Duplicate message blocked', {
        messageId: messageId.substring(0, 20),
        remoteJid: remoteJid.substring(0, 15),
        ageSeconds: Math.round((now - cached.processedAt) / 1000),
        source: 'memory',
        keyType: cached.dedupeKeyType || 'legacy',
        reasonCode: 'DEDUPED',
      });
      return true;
    }

    // If cache entry expired, remove it
    if (cached && cached.expiresAt <= now) {
      this.cache.delete(cacheKey);
    }

    // Check database if persistence is enabled (slow path)
    if (this.db) {
      try {
        const dbResult = await this.checkDatabase(messageId, remoteJid);
        if (dbResult) {
          this.metrics.duplicatesFound++;
          this.metrics.dbHits++;
          
          // Restore to cache for faster subsequent lookups
          this.cache.set(cacheKey, {
            messageId,
            remoteJid,
            processedAt: now,
            expiresAt: now + this.TTL_MS,
          });
          
          // Structured log for dedupe hit from DB
          unifiedLogger.info('deduplication', 'DEDUPED: Duplicate message blocked', {
            messageId: messageId.substring(0, 20),
            remoteJid: remoteJid.substring(0, 15),
            source: 'database',
            reasonCode: 'DEDUPED',
          });
          return true;
        }
      } catch (error) {
        unifiedLogger.error('deduplication', 'Database check failed', { error });
        // Continue with memory-only on DB error
      }
    }

    // Cache miss - this is a new message
    this.metrics.cacheMisses++;
    unifiedLogger.debug('deduplication', 'Dedupe cache miss (new message)', {
      messageId: messageId.substring(0, 20),
      remoteJid: remoteJid.substring(0, 15),
    });

    return false;
  }

  /**
   * Enhanced check using DedupeKeyInput for more robust deduplication
   * This method computes the dedupe key using the recommended strategy
   * 
   * @param input - DedupeKeyInput with message context
   * @returns true if message was already processed
   */
  async isProcessedWithContext(input: DedupeKeyInput): Promise<{ isDuplicate: boolean; keyType: 'native' | 'fallback' }> {
    const { key, keyType } = this.computeDedupeKey(input);
    const isDuplicate = await this.isProcessed(key, input.remoteJid);
    return { isDuplicate, keyType };
  }

  /**
   * Mark a message as processed
   * @param messageId - WhatsApp message ID from Baileys
   * @param remoteJid - Remote JID (phone number with @s.whatsapp.net)
   * @param keyType - Optional key type indicator for metrics
   */
  async markAsProcessed(messageId: string, remoteJid: string, keyType?: 'native' | 'fallback'): Promise<void> {
    const now = Date.now();
    const cacheKey = this.getCacheKey(messageId, remoteJid);

    const entry: ProcessedMessage = {
      messageId,
      remoteJid,
      processedAt: now,
      expiresAt: now + this.TTL_MS,
      dedupeKeyType: keyType,
    };

    // Store in memory cache
    this.cache.set(cacheKey, entry);
    this.metrics.messagesProcessed++;
    this.metrics.cacheSize = this.cache.size;

    // Persist to database if enabled
    if (this.db) {
      try {
        await this.persistToDatabase(messageId, remoteJid, now);
      } catch (error) {
        unifiedLogger.error('deduplication', 'Failed to persist to database', {
          error,
          messageId: messageId.substring(0, 20),
        });
        // Continue anyway - memory cache is primary
      }
    }

    unifiedLogger.debug('deduplication', 'Message marked as processed', {
      messageId: messageId.substring(0, 20),
      remoteJid: remoteJid.substring(0, 15),
      cacheSize: this.cache.size,
      keyType: keyType || 'legacy',
    });
  }

  /**
   * Enhanced mark as processed using DedupeKeyInput
   * @param input - DedupeKeyInput with message context
   */
  async markAsProcessedWithContext(input: DedupeKeyInput): Promise<{ key: string; keyType: 'native' | 'fallback' }> {
    const { key, keyType } = this.computeDedupeKey(input);
    await this.markAsProcessed(key, input.remoteJid, keyType);
    return { key, keyType };
  }

  /**
   * Check if a message is a duplicate and record decision trace if so
   * Use this method in the message pipeline to combine dedupe check with decision tracing
   * @param messageId - WhatsApp message ID from Baileys
   * @param remoteJid - Remote JID (phone number with @s.whatsapp.net)
   * @returns true if message was already processed (duplicate)
   */
  async checkAndRecordDedupe(messageId: string, remoteJid: string): Promise<boolean> {
    const isDuplicate = await this.isProcessed(messageId, remoteJid);
    
    if (isDuplicate) {
      // Extract phone from remoteJid (remove @s.whatsapp.net suffix)
      const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const correlationId = getCorrelationId();
      
      // Record dedupe decision trace with reasonCode=DEDUPED
      try {
        await messageDecisionService.recordDeduped(messageId, phone, correlationId);
        
        // Additional structured log for traceability
        unifiedLogger.info('deduplication', 'Decision trace recorded for dedupe', {
          messageId: messageId.substring(0, 20),
          phoneHash: hashPhone(phone),
          correlationId,
          reasonCode: 'DEDUPED',
          decision: 'SKIP',
          stage: 'DEDUPE',
        });
      } catch (error) {
        // Log but don't fail - deduplication is more important than tracing
        unifiedLogger.error('deduplication', 'Failed to record dedupe decision trace', {
          error,
          messageId: messageId.substring(0, 20),
        });
      }
    }
    
    return isDuplicate;
  }

  /**
   * Enhanced check and record using DedupeKeyInput for more robust deduplication
   * This method computes the dedupe key using the recommended strategy
   * and records decision trace with full context
   * 
   * @param input - DedupeKeyInput with message context
   * @returns Object with isDuplicate flag and keyType used
   */
  async checkAndRecordDedupeWithContext(input: DedupeKeyInput): Promise<{ isDuplicate: boolean; keyType: 'native' | 'fallback' }> {
    const { key, keyType } = this.computeDedupeKey(input);
    const isDuplicate = await this.checkAndRecordDedupe(key, input.remoteJid);
    return { isDuplicate, keyType };
  }

  /**
   * Get deduplication metrics
   */
  getMetrics(): DedupMetrics {
    this.metrics.cacheSize = this.cache.size;
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalChecked: 0,
      duplicatesFound: 0,
      messagesProcessed: 0,
      cacheSize: this.cache.size,
      nativeKeyCount: 0,
      fallbackKeyCount: 0,
      cacheHits: 0,
      dbHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * Clear all cached entries (for testing)
   */
  clear(): void {
    this.cache.clear();
    this.metrics.cacheSize = 0;
    unifiedLogger.info('deduplication', 'Cache cleared');
  }

  /**
   * Shutdown the deduper and cleanup resources
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
    unifiedLogger.info('deduplication', 'MessageDeduper shutdown');
  }

  // ========== Private Methods ==========

  private getCacheKey(messageId: string, remoteJid: string): string {
    return `${messageId}:${remoteJid}`;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.CLEANUP_INTERVAL_MS);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removed = 0;

    // Direct iteration is safe with ES2020 target
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.metrics.cacheSize = this.cache.size;
      unifiedLogger.debug('deduplication', 'Cleanup completed', {
        removed,
        remaining: this.cache.size,
      });
    }
  }

  private async checkDatabase(messageId: string, remoteJid: string): Promise<boolean> {
    if (!this.db || !this.db.pool) {
      return false;
    }

    try {
      const query = `
        SELECT message_id 
        FROM processed_messages 
        WHERE message_id = ? AND remote_jid = ? AND expires_at > NOW()
        LIMIT 1
      `;

      const [rows] = await this.db.pool.execute(query, [messageId, remoteJid]);
      return Array.isArray(rows) && rows.length > 0;
    } catch (error) {
      // Table might not exist yet - return false
      return false;
    }
  }

  private async persistToDatabase(
    messageId: string,
    remoteJid: string,
    processedAt: number
  ): Promise<void> {
    if (!this.db || !this.db.pool) {
      return;
    }

    try {
      const query = `
        INSERT INTO processed_messages (message_id, remote_jid, processed_at, expires_at)
        VALUES (?, ?, FROM_UNIXTIME(?), DATE_ADD(FROM_UNIXTIME(?), INTERVAL ? MINUTE))
        ON DUPLICATE KEY UPDATE processed_at = FROM_UNIXTIME(?)
      `;

      const processedAtSeconds = Math.floor(processedAt / 1000);
      const ttlMinutes = Math.floor(this.TTL_MS / 60000);

      await this.db.pool.execute(query, [
        messageId,
        remoteJid,
        processedAtSeconds,
        processedAtSeconds,
        ttlMinutes,
        processedAtSeconds,
      ]);
    } catch (error) {
      // Fail silently - table might not exist yet, memory cache is primary
      // Don't propagate the error to avoid blocking message processing
    }
  }
}

// Singleton instance
let deduperInstance: MessageDeduper | null = null;

/**
 * Initialize the global message deduper instance
 */
export function initMessageDeduper(
  ttlMinutes: number = 5,
  cleanupIntervalMinutes: number = 1,
  database?: any
): MessageDeduper {
  if (deduperInstance) {
    deduperInstance.shutdown();
  }

  deduperInstance = new MessageDeduper(ttlMinutes, cleanupIntervalMinutes, database);
  return deduperInstance;
}

/**
 * Get the global message deduper instance
 */
export function getMessageDeduper(): MessageDeduper {
  if (!deduperInstance) {
    throw new Error('MessageDeduper not initialized. Call initMessageDeduper() first.');
  }
  return deduperInstance;
}

export default MessageDeduper;
