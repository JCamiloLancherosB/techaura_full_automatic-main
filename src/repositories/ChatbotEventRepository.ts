/**
 * Repository for chatbot_events table
 * Handles CRUD operations for chatbot events with proper typing for audit and analytics
 */

import { pool } from '../mysql-database';
import { cacheService } from '../services/CacheService';
import { toSafeInt } from '../utils/numberUtils';

/**
 * Supported chatbot event types
 */
export enum ChatbotEventType {
    // Message events
    MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
    MESSAGE_SENT = 'MESSAGE_SENT',
    
    // Intent events
    INTENT_DETECTED = 'INTENT_DETECTED',
    INTENT_ROUTING = 'INTENT_ROUTING',
    
    // State change events
    STATE_CHANGED = 'STATE_CHANGED',
    FLOW_STARTED = 'FLOW_STARTED',
    FLOW_COMPLETED = 'FLOW_COMPLETED',
    
    // Order events
    ORDER_INITIATED = 'ORDER_INITIATED',
    ORDER_CONFIRMED = 'ORDER_CONFIRMED',
    ORDER_CANCELLED = 'ORDER_CANCELLED',
    ORDER_COMPLETED = 'ORDER_COMPLETED',
    
    // Status events
    STATUS_CHANGED = 'STATUS_CHANGED',
    PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
    SHIPPING_CAPTURED = 'SHIPPING_CAPTURED',
    
    // Follow-up events
    FOLLOWUP_SENT = 'FOLLOWUP_SENT',
    FOLLOWUP_RESPONDED = 'FOLLOWUP_RESPONDED',
    FOLLOWUP_SCHEDULED = 'FOLLOWUP_SCHEDULED',
    FOLLOWUP_BLOCKED = 'FOLLOWUP_BLOCKED',
    FOLLOWUP_CANCELLED = 'FOLLOWUP_CANCELLED',
    
    // Stage-based events
    STAGE_ENTERED = 'STAGE_ENTERED',
    BLOCKING_QUESTION_ASKED = 'BLOCKING_QUESTION_ASKED',
    STAGE_SET = 'STAGE_SET',         // When a flow asks a key blocking question
    STAGE_RESOLVED = 'STAGE_RESOLVED', // When user responds and advances
    
    // Session events
    SESSION_STARTED = 'SESSION_STARTED',
    SESSION_ENDED = 'SESSION_ENDED',
    
    // Error events
    ERROR_OCCURRED = 'ERROR_OCCURRED',
    VALIDATION_FAILED = 'VALIDATION_FAILED'
}

export interface ChatbotEvent {
    id?: number;
    conversation_id: string;
    order_id?: string | null;
    phone: string;
    event_type: string;
    payload_json?: any;
    created_at?: Date;
}

export interface ChatbotEventFilter {
    conversation_id?: string;
    order_id?: string;
    phone?: string;
    event_type?: string;
    event_types?: string[]; // Support multiple event types
    date_from?: Date;
    date_to?: Date;
}

export interface ChatbotEventPaginatedResult {
    data: ChatbotEvent[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
}

export class ChatbotEventRepository {
    /**
     * Insert a new chatbot event
     */
    async create(event: ChatbotEvent): Promise<number> {
        const sql = `
            INSERT INTO chatbot_events 
            (conversation_id, order_id, phone, event_type, payload_json)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            event.conversation_id,
            event.order_id || null,
            event.phone,
            event.event_type,
            event.payload_json ? JSON.stringify(event.payload_json) : null
        ]) as any;
        
        return result.insertId;
    }
    
    /**
     * Bulk insert multiple chatbot events (efficient for batch operations)
     */
    async createBatch(events: ChatbotEvent[]): Promise<void> {
        if (events.length === 0) return;
        
        const sql = `
            INSERT INTO chatbot_events 
            (conversation_id, order_id, phone, event_type, payload_json)
            VALUES ?
        `;
        
        const values = events.map(event => [
            event.conversation_id,
            event.order_id || null,
            event.phone,
            event.event_type,
            event.payload_json ? JSON.stringify(event.payload_json) : null
        ]);
        
        await pool.query(sql, [values]);
    }
    
    /**
     * Get events by conversation ID
     */
    async getByConversationId(conversationId: string, limit: number = 100): Promise<ChatbotEvent[]> {
        const sql = `
            SELECT * FROM chatbot_events 
            WHERE conversation_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [conversationId, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get events by phone number
     */
    async getByPhone(phone: string, limit: number = 100): Promise<ChatbotEvent[]> {
        const sql = `
            SELECT * FROM chatbot_events 
            WHERE phone = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [phone, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get events by order ID
     */
    async getByOrderId(orderId: string, limit: number = 100): Promise<ChatbotEvent[]> {
        const sql = `
            SELECT * FROM chatbot_events 
            WHERE order_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [orderId, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get events with filters
     */
    async findByFilter(filter: ChatbotEventFilter, limit: number = 100): Promise<ChatbotEvent[]> {
        const { conditions, params } = this.buildFilterConditions(filter);
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT * FROM chatbot_events 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        params.push(limit);
        const [rows] = await pool.execute(sql, params) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get events with filters and pagination (for admin endpoint)
     */
    async findByFilterPaginated(
        filter: ChatbotEventFilter, 
        page: number = 1, 
        perPage: number = 50
    ): Promise<ChatbotEventPaginatedResult> {
        const { conditions, params } = this.buildFilterConditions(filter);
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        // Count total matching records
        const countSql = `SELECT COUNT(*) as total FROM chatbot_events ${whereClause}`;
        const [countRows] = await pool.execute(countSql, params) as any;
        const total = countRows[0].total;
        
        // Get paginated results
        const offset = (page - 1) * perPage;
        const dataSql = `
            SELECT * FROM chatbot_events 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `;
        
        const dataParams = [...params, perPage, offset];
        const [dataRows] = await pool.execute(dataSql, dataParams) as any;
        
        return {
            data: this.mapRows(dataRows),
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage)
        };
    }
    
    /**
     * Get event type summary for a date range
     */
    async getEventTypeSummary(filter?: ChatbotEventFilter): Promise<Array<{ event_type: string; count: number }>> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter?.date_from) {
            conditions.push('created_at >= ?');
            params.push(filter.date_from);
        }
        
        if (filter?.date_to) {
            conditions.push('created_at <= ?');
            params.push(filter.date_to);
        }
        
        if (filter?.phone) {
            conditions.push('phone = ?');
            params.push(filter.phone);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT event_type, COUNT(*) as count 
            FROM chatbot_events 
            ${whereClause}
            GROUP BY event_type 
            ORDER BY count DESC
        `;
        
        const [rows] = await pool.execute(sql, params) as any;
        return rows;
    }
    
    /**
     * Get distinct event types in the database
     */
    async getDistinctEventTypes(): Promise<string[]> {
        const sql = `SELECT DISTINCT event_type FROM chatbot_events ORDER BY event_type ASC`;
        const [rows] = await pool.execute(sql) as any;
        return rows.map((row: any) => row.event_type);
    }
    
    /**
     * Delete old events (cleanup/retention)
     */
    async deleteOlderThan(days: number): Promise<number> {
        const [result] = await pool.execute(
            'DELETE FROM chatbot_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        ) as any;
        
        return result.affectedRows;
    }
    
    /**
     * Build filter conditions for SQL queries
     */
    private buildFilterConditions(filter: ChatbotEventFilter): { conditions: string[]; params: any[] } {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter.conversation_id) {
            conditions.push('conversation_id = ?');
            params.push(filter.conversation_id);
        }
        
        if (filter.order_id) {
            conditions.push('order_id = ?');
            params.push(filter.order_id);
        }
        
        if (filter.phone) {
            conditions.push('phone = ?');
            params.push(filter.phone);
        }
        
        if (filter.event_type) {
            conditions.push('event_type = ?');
            params.push(filter.event_type);
        }
        
        if (filter.event_types && filter.event_types.length > 0) {
            const placeholders = filter.event_types.map(() => '?').join(', ');
            conditions.push(`event_type IN (${placeholders})`);
            params.push(...filter.event_types);
        }
        
        if (filter.date_from) {
            conditions.push('created_at >= ?');
            params.push(filter.date_from);
        }
        
        if (filter.date_to) {
            conditions.push('created_at <= ?');
            params.push(filter.date_to);
        }
        
        return { conditions, params };
    }
    
    /**
     * Map database rows to ChatbotEvent objects
     */
    private mapRows(rows: any[]): ChatbotEvent[] {
        return rows.map(row => ({
            id: row.id,
            conversation_id: row.conversation_id,
            order_id: row.order_id,
            phone: row.phone,
            event_type: row.event_type,
            payload_json: row.payload_json ? JSON.parse(row.payload_json) : null,
            created_at: new Date(row.created_at)
        }));
    }

    /**
     * Get stage funnel data for analytics aggregation
     * Returns STAGE_SET and STAGE_RESOLVED events grouped by date and stage
     */
    async getStageFunnelEvents(fromId: number, limit: number = 1000): Promise<Array<{
        id: number;
        event_type: string;
        stage: string;
        phone: string;
        created_at: Date;
        payload_json: any;
    }>> {
        const sql = `
            SELECT id, event_type, phone, payload_json, created_at
            FROM chatbot_events 
            WHERE id > ? 
            AND event_type IN ('STAGE_SET', 'STAGE_RESOLVED', 'BLOCKING_QUESTION_ASKED', 'ORDER_CONFIRMED')
            ORDER BY id ASC
            LIMIT ?
        `;
        
        try {
            // Ensure parameters are valid numbers (handle BigInt, undefined, null, etc.)
            // Use Number() to handle BigInt values that may come from MySQL
            const safeFromId = Number(toSafeInt(fromId, { min: 0, fallback: 0 }));
            const safeLimit = Number(toSafeInt(limit, { min: 1, max: 10000, fallback: 1000 }));
            
            const [rows] = await pool.execute(sql, [safeFromId, safeLimit]) as any;
            return (rows || []).map((row: any) => {
                let payload = {};
                try {
                    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
                } catch {
                    // Ignore JSON parse errors, use empty object
                }
                return {
                    id: row.id,
                    event_type: row.event_type,
                    stage: (payload as any).stage || 'unknown',
                    phone: row.phone,
                    created_at: new Date(row.created_at),
                    payload_json: payload
                };
            });
        } catch (error) {
            // Log error with context for debugging, but allow analytics to continue
            console.error('[ChatbotEventRepository] Error in getStageFunnelEvents:', {
                error,
                fromId,
                limit,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
            return [];
        }
    }

    /**
     * Get blocked followup events for analytics aggregation
     * Returns FOLLOWUP_BLOCKED events grouped by date and reason
     */
    async getBlockedFollowupEvents(fromId: number, limit: number = 1000): Promise<Array<{
        id: number;
        phone: string;
        block_reason: string;
        created_at: Date;
        payload_json: any;
    }>> {
        const sql = `
            SELECT id, phone, payload_json, created_at
            FROM chatbot_events 
            WHERE id > ? 
            AND event_type = 'FOLLOWUP_BLOCKED'
            ORDER BY id ASC
            LIMIT ?
        `;
        
        try {
            // Ensure parameters are valid numbers (handle BigInt, undefined, null, etc.)
            // Use Number() to handle BigInt values that may come from MySQL
            const safeFromId = Number(toSafeInt(fromId, { min: 0, fallback: 0 }));
            const safeLimit = Number(toSafeInt(limit, { min: 1, max: 10000, fallback: 1000 }));
            
            const [rows] = await pool.execute(sql, [safeFromId, safeLimit]) as any;
            return (rows || []).map((row: any) => {
                let payload: any = {};
                try {
                    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
                } catch {
                    // Ignore JSON parse errors, use empty object
                }
                // Extract block reason from payload - support multiple formats
                const blockReason = payload.reason || 
                                   payload.blockedBy?.join(',') || 
                                   payload.block_reason ||
                                   'unknown';
                return {
                    id: row.id,
                    phone: row.phone,
                    block_reason: blockReason,
                    created_at: new Date(row.created_at),
                    payload_json: payload
                };
            });
        } catch (error) {
            // Log error with context for debugging, but allow analytics to continue
            console.error('[ChatbotEventRepository] Error in getBlockedFollowupEvents:', {
                error,
                fromId,
                limit,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
            return [];
        }
    }

    /**
     * Get stage funnel summary for date range (for analytics endpoint)
     */
    async getStageFunnelSummary(dateFrom: Date, dateTo: Date): Promise<Array<{
        stage: string;
        questions_asked: number;
        responses_received: number;
        abandonment_rate: number;
        unique_users: number;
    }>> {
        const sql = `
            SELECT 
                JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.stage')) as stage,
                SUM(CASE WHEN event_type = 'STAGE_SET' THEN 1 ELSE 0 END) as questions_asked,
                SUM(CASE WHEN event_type = 'STAGE_RESOLVED' THEN 1 ELSE 0 END) as responses_received,
                COUNT(DISTINCT phone) as unique_users
            FROM chatbot_events 
            WHERE event_type IN ('STAGE_SET', 'STAGE_RESOLVED')
            AND created_at BETWEEN ? AND ?
            AND JSON_EXTRACT(payload_json, '$.stage') IS NOT NULL
            GROUP BY JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.stage'))
            ORDER BY questions_asked DESC
        `;
        
        const [rows] = await pool.execute(sql, [dateFrom, dateTo]) as any;
        return rows.map((row: any) => {
            const questionsAsked = Number(row.questions_asked) || 0;
            const responsesReceived = Number(row.responses_received) || 0;
            const abandonmentRate = questionsAsked > 0 
                ? ((questionsAsked - responsesReceived) / questionsAsked) * 100 
                : 0;
            return {
                stage: row.stage || 'unknown',
                questions_asked: questionsAsked,
                responses_received: responsesReceived,
                abandonment_rate: Math.round(abandonmentRate * 100) / 100,
                unique_users: Number(row.unique_users) || 0
            };
        });
    }

    /**
     * Get blocked followups summary by reason for date range (for analytics endpoint)
     */
    async getBlockedFollowupsSummary(dateFrom: Date, dateTo: Date): Promise<Array<{
        block_reason: string;
        blocked_count: number;
        unique_phones: number;
    }>> {
        // Use COALESCE to handle different JSON field names for block reason
        const sql = `
            SELECT 
                COALESCE(
                    JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.reason')),
                    JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.block_reason')),
                    'unknown'
                ) as block_reason,
                COUNT(*) as blocked_count,
                COUNT(DISTINCT phone) as unique_phones
            FROM chatbot_events 
            WHERE event_type = 'FOLLOWUP_BLOCKED'
            AND created_at BETWEEN ? AND ?
            GROUP BY COALESCE(
                JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.reason')),
                JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.block_reason')),
                'unknown'
            )
            ORDER BY blocked_count DESC
        `;
        
        const [rows] = await pool.execute(sql, [dateFrom, dateTo]) as any;
        return rows.map((row: any) => ({
            block_reason: row.block_reason || 'unknown',
            blocked_count: Number(row.blocked_count) || 0,
            unique_phones: Number(row.unique_phones) || 0
        }));
    }
}

// Export singleton instance
export const chatbotEventRepository = new ChatbotEventRepository();
