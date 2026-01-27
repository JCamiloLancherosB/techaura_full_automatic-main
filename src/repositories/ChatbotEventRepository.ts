/**
 * Repository for chatbot_events table
 * Handles CRUD operations for chatbot events with proper typing for audit and analytics
 */

import { pool } from '../mysql-database';
import { cacheService } from '../services/CacheService';

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
}

// Export singleton instance
export const chatbotEventRepository = new ChatbotEventRepository();
