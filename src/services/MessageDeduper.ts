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
 */

import { unifiedLogger } from '../utils/unifiedLogger';
import { messageDecisionService, DecisionStage, Decision, DecisionReasonCode } from './MessageDecisionService';
import { getCorrelationId } from './CorrelationIdManager';

interface ProcessedMessage {
  messageId: string;
  remoteJid: string;
  processedAt: number;
  expiresAt: number;
}

interface DedupMetrics {
  totalChecked: number;
  duplicatesFound: number;
  messagesProcessed: number;
  cacheSize: number;
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
      unifiedLogger.debug('deduplication', 'Duplicate message detected (memory)', {
        messageId: messageId.substring(0, 20),
        remoteJid: remoteJid.substring(0, 15),
        ageSeconds: Math.round((now - cached.processedAt) / 1000),
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
          // Restore to cache for faster subsequent lookups
          this.cache.set(cacheKey, {
            messageId,
            remoteJid,
            processedAt: now,
            expiresAt: now + this.TTL_MS,
          });
          unifiedLogger.debug('deduplication', 'Duplicate message detected (database)', {
            messageId: messageId.substring(0, 20),
            remoteJid: remoteJid.substring(0, 15),
          });
          return true;
        }
      } catch (error) {
        unifiedLogger.error('deduplication', 'Database check failed', { error });
        // Continue with memory-only on DB error
      }
    }

    return false;
  }

  /**
   * Mark a message as processed
   * @param messageId - WhatsApp message ID from Baileys
   * @param remoteJid - Remote JID (phone number with @s.whatsapp.net)
   */
  async markAsProcessed(messageId: string, remoteJid: string): Promise<void> {
    const now = Date.now();
    const cacheKey = this.getCacheKey(messageId, remoteJid);

    const entry: ProcessedMessage = {
      messageId,
      remoteJid,
      processedAt: now,
      expiresAt: now + this.TTL_MS,
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
    });
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
      
      // Record dedupe decision trace
      try {
        await messageDecisionService.recordDeduped(messageId, phone, correlationId);
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
