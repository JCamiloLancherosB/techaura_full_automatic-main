/**
 * Conversation Turns Repository
 * 
 * Manages storage and retrieval of conversation turns
 * for analytics and conversation context
 */

import { db } from '../database/knex';

export interface ConversationTurn {
    id?: number;
    phone: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, any>;
    timestamp: Date;
    created_at?: Date;
    intent_confidence?: number;
    intent_source?: 'rule' | 'ai' | 'menu' | 'context';
    ai_used?: string;
    model?: string;
    latency_ms?: number;
    tokens_est?: number;
    policy_decision?: string;
}

export interface ConversationWindow {
    phone: string;
    turns: ConversationTurn[];
    window_start: Date;
    window_end: Date;
    turn_count: number;
    avg_latency_ms?: number;
}

/**
 * Helper function to safely parse a count value to number
 */
function parseCount(value: any): number {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

export class ConversationTurnsRepository {
    private tableName = 'conversation_turns';

    /**
     * Check if conversation_turns table exists
     */
    async tableExists(): Promise<boolean> {
        try {
            return await db.schema.hasTable(this.tableName);
        } catch (error) {
            console.error('Error checking conversation_turns table existence:', error);
            return false;
        }
    }

    /**
     * Insert a conversation turn
     */
    async create(turn: Omit<ConversationTurn, 'id' | 'created_at'>): Promise<number> {
        try {
            const dataToInsert: any = {
                phone: turn.phone,
                role: turn.role,
                content: turn.content,
                metadata: turn.metadata ? JSON.stringify(turn.metadata) : null,
                timestamp: turn.timestamp,
                intent_confidence: turn.intent_confidence || null,
                intent_source: turn.intent_source || null,
                ai_used: turn.ai_used || null,
                model: turn.model || null,
                latency_ms: turn.latency_ms || null,
                tokens_est: turn.tokens_est || null,
                policy_decision: turn.policy_decision || null
            };

            const [id] = await db(this.tableName).insert(dataToInsert);
            return id;
        } catch (error) {
            console.error('Error creating conversation turn:', error);
            throw error;
        }
    }

    /**
     * Insert multiple conversation turns at once (for backfill)
     */
    async bulkCreate(turns: Omit<ConversationTurn, 'id' | 'created_at'>[]): Promise<number> {
        if (turns.length === 0) {
            return 0;
        }

        try {
            const dataToInsert = turns.map(turn => ({
                phone: turn.phone,
                role: turn.role,
                content: turn.content,
                metadata: turn.metadata ? JSON.stringify(turn.metadata) : null,
                timestamp: turn.timestamp,
                intent_confidence: turn.intent_confidence || null,
                intent_source: turn.intent_source || null,
                ai_used: turn.ai_used || null,
                model: turn.model || null,
                latency_ms: turn.latency_ms || null,
                tokens_est: turn.tokens_est || null,
                policy_decision: turn.policy_decision || null
            }));

            // Insert in batches of 100 to avoid query size limits
            const batchSize = 100;
            let insertedCount = 0;

            for (let i = 0; i < dataToInsert.length; i += batchSize) {
                const batch = dataToInsert.slice(i, i + batchSize);
                await db(this.tableName).insert(batch);
                insertedCount += batch.length;
            }

            return insertedCount;
        } catch (error) {
            console.error('Error bulk creating conversation turns:', error);
            throw error;
        }
    }

    /**
     * Get conversation turns for a phone number
     */
    async getByPhone(phone: string, limit: number = 50): Promise<ConversationTurn[]> {
        try {
            const results = await db(this.tableName)
                .where({ phone })
                .orderBy('timestamp', 'desc')
                .limit(limit);

            return results.map(r => this.deserializeTurn(r));
        } catch (error) {
            console.error('Error getting conversation turns by phone:', error);
            throw error;
        }
    }

    /**
     * Get conversation turns within a time window
     */
    async getByPhoneInWindow(
        phone: string,
        startTime: Date,
        endTime: Date
    ): Promise<ConversationTurn[]> {
        try {
            const results = await db(this.tableName)
                .where({ phone })
                .where('timestamp', '>=', startTime)
                .where('timestamp', '<=', endTime)
                .orderBy('timestamp', 'asc');

            return results.map(r => this.deserializeTurn(r));
        } catch (error) {
            console.error('Error getting conversation turns by phone in window:', error);
            throw error;
        }
    }

    /**
     * Get turn count for a phone number
     */
    async getTurnCount(phone: string): Promise<number> {
        try {
            const result = await db(this.tableName)
                .where({ phone })
                .count('* as count')
                .first();

            return parseCount(result?.count);
        } catch (error) {
            console.error('Error getting turn count:', error);
            return 0;
        }
    }

    /**
     * Get all unique phones that have conversation turns
     */
    async getDistinctPhones(): Promise<string[]> {
        try {
            const results = await db(this.tableName)
                .distinct('phone')
                .orderBy('phone');

            return results.map(r => r.phone);
        } catch (error) {
            console.error('Error getting distinct phones:', error);
            return [];
        }
    }

    /**
     * Check if a phone has existing turns
     */
    async hasExistingTurns(phone: string): Promise<boolean> {
        try {
            const result = await db(this.tableName)
                .where({ phone })
                .limit(1)
                .first();

            return !!result;
        } catch (error) {
            console.error('Error checking existing turns:', error);
            return false;
        }
    }

    /**
     * Get conversation statistics for analytics
     */
    async getConversationStats(phone: string): Promise<{
        turn_count: number;
        user_turn_count: number;
        assistant_turn_count: number;
        first_turn_at: Date | null;
        last_turn_at: Date | null;
        avg_latency_ms: number | null;
    }> {
        try {
            const stats = await db(this.tableName)
                .where({ phone })
                .select(
                    db.raw('COUNT(*) as turn_count'),
                    db.raw("SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_turn_count"),
                    db.raw("SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_turn_count"),
                    db.raw('MIN(timestamp) as first_turn_at'),
                    db.raw('MAX(timestamp) as last_turn_at'),
                    db.raw('AVG(latency_ms) as avg_latency_ms')
                )
                .first();

            return {
                turn_count: parseCount(stats?.turn_count),
                user_turn_count: parseCount(stats?.user_turn_count),
                assistant_turn_count: parseCount(stats?.assistant_turn_count),
                first_turn_at: stats?.first_turn_at || null,
                last_turn_at: stats?.last_turn_at || null,
                avg_latency_ms: stats?.avg_latency_ms ? parseFloat(stats.avg_latency_ms) : null
            };
        } catch (error) {
            console.error('Error getting conversation stats:', error);
            return {
                turn_count: 0,
                user_turn_count: 0,
                assistant_turn_count: 0,
                first_turn_at: null,
                last_turn_at: null,
                avg_latency_ms: null
            };
        }
    }

    /**
     * Get latency metrics for a phone
     */
    async getLatencyMetrics(phone: string): Promise<{
        avg_latency_ms: number | null;
        min_latency_ms: number | null;
        max_latency_ms: number | null;
        p95_latency_ms: number | null;
    }> {
        try {
            const basicStats = await db(this.tableName)
                .where({ phone })
                .whereNotNull('latency_ms')
                .select(
                    db.raw('AVG(latency_ms) as avg_latency'),
                    db.raw('MIN(latency_ms) as min_latency'),
                    db.raw('MAX(latency_ms) as max_latency')
                )
                .first();

            // Get p95 using a subquery approach
            const latencies = await db(this.tableName)
                .where({ phone })
                .whereNotNull('latency_ms')
                .select('latency_ms')
                .orderBy('latency_ms', 'asc');

            let p95Latency = null;
            if (latencies.length > 0) {
                const p95Index = Math.floor(latencies.length * 0.95);
                p95Latency = latencies[p95Index]?.latency_ms || null;
            }

            return {
                avg_latency_ms: basicStats?.avg_latency ? parseFloat(basicStats.avg_latency) : null,
                min_latency_ms: basicStats?.min_latency || null,
                max_latency_ms: basicStats?.max_latency || null,
                p95_latency_ms: p95Latency
            };
        } catch (error) {
            console.error('Error getting latency metrics:', error);
            return {
                avg_latency_ms: null,
                min_latency_ms: null,
                max_latency_ms: null,
                p95_latency_ms: null
            };
        }
    }

    /**
     * Safely parse JSON or return null
     */
    private safeJsonParse(jsonString: any): Record<string, any> | null {
        if (!jsonString) return null;
        try {
            return JSON.parse(jsonString);
        } catch {
            console.warn('Failed to parse metadata JSON, returning null');
            return null;
        }
    }

    /**
     * Deserialize a turn row from the database
     */
    private deserializeTurn(row: any): ConversationTurn {
        return {
            ...row,
            metadata: this.safeJsonParse(row.metadata),
            timestamp: new Date(row.timestamp)
        };
    }
}

// Export singleton instance
export const conversationTurnsRepository = new ConversationTurnsRepository();
