/**
 * Repository for order_events table
 * Handles CRUD operations for order events with proper typing and observability support
 */

import { pool } from '../mysql-database';
import { hashPhone } from '../utils/phoneHasher';

export interface OrderEvent {
    id?: number;
    order_number?: string;
    phone: string;
    phone_hash?: string;
    session_id?: string;
    event_type: string;
    event_source: string;
    event_description?: string;
    event_data?: any;
    flow_name?: string;
    flow_stage?: string;
    user_input?: string;
    bot_response?: string;
    ip_address?: string;
    user_agent?: string;
    correlation_id?: string;
    created_at?: Date;
}

export interface OrderEventFilter {
    order_number?: string;
    phone?: string;
    phone_hash?: string;
    event_type?: string;
    event_source?: string;
    flow_name?: string;
    correlation_id?: string;
    date_from?: Date;
    date_to?: Date;
}

export class OrderEventRepository {
    /**
     * Insert a new order event
     */
    async create(event: OrderEvent): Promise<number> {
        // Automatically hash phone if not already provided
        const phoneHash = event.phone_hash || hashPhone(event.phone);
        
        const sql = `
            INSERT INTO order_events 
            (order_number, phone, phone_hash, session_id, event_type, event_source, 
             event_description, event_data, flow_name, flow_stage, user_input, 
             bot_response, ip_address, user_agent, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            event.order_number || null,
            event.phone,
            phoneHash,
            event.session_id || null,
            event.event_type,
            event.event_source,
            event.event_description || null,
            event.event_data ? JSON.stringify(event.event_data) : null,
            event.flow_name || null,
            event.flow_stage || null,
            event.user_input || null,
            event.bot_response || null,
            event.ip_address || null,
            event.user_agent || null,
            event.correlation_id || null
        ]) as any;
        
        return result.insertId;
    }
    
    /**
     * Bulk insert multiple order events (more efficient for batch operations)
     */
    async createBatch(events: OrderEvent[]): Promise<void> {
        if (events.length === 0) return;
        
        const sql = `
            INSERT INTO order_events 
            (order_number, phone, phone_hash, session_id, event_type, event_source, 
             event_description, event_data, flow_name, flow_stage, user_input, 
             bot_response, ip_address, user_agent, correlation_id)
            VALUES ?
        `;
        
        const values = events.map(event => {
            const phoneHash = event.phone_hash || hashPhone(event.phone);
            return [
                event.order_number || null,
                event.phone,
                phoneHash,
                event.session_id || null,
                event.event_type,
                event.event_source,
                event.event_description || null,
                event.event_data ? JSON.stringify(event.event_data) : null,
                event.flow_name || null,
                event.flow_stage || null,
                event.user_input || null,
                event.bot_response || null,
                event.ip_address || null,
                event.user_agent || null,
                event.correlation_id || null
            ];
        });
        
        await pool.query(sql, [values]);
    }
    
    /**
     * Get events for a specific order
     */
    async getByOrderNumber(orderNumber: string, limit: number = 100): Promise<OrderEvent[]> {
        const sql = `
            SELECT * FROM order_events 
            WHERE order_number = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [orderNumber, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get events for a specific phone number
     */
    async getByPhone(phone: string, limit: number = 100): Promise<OrderEvent[]> {
        const sql = `
            SELECT * FROM order_events 
            WHERE phone = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [phone, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get events by correlation ID (for end-to-end tracing)
     */
    async getByCorrelationId(correlationId: string, limit: number = 1000): Promise<OrderEvent[]> {
        const sql = `
            SELECT * FROM order_events 
            WHERE correlation_id = ? 
            ORDER BY created_at ASC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [correlationId, limit]) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get events with filters
     */
    async findByFilter(filter: OrderEventFilter, limit: number = 100): Promise<OrderEvent[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter.order_number) {
            conditions.push('order_number = ?');
            params.push(filter.order_number);
        }
        
        if (filter.phone) {
            conditions.push('phone = ?');
            params.push(filter.phone);
        }
        
        if (filter.phone_hash) {
            conditions.push('phone_hash = ?');
            params.push(filter.phone_hash);
        }
        
        if (filter.event_type) {
            conditions.push('event_type = ?');
            params.push(filter.event_type);
        }
        
        if (filter.event_source) {
            conditions.push('event_source = ?');
            params.push(filter.event_source);
        }
        
        if (filter.flow_name) {
            conditions.push('flow_name = ?');
            params.push(filter.flow_name);
        }
        
        if (filter.correlation_id) {
            conditions.push('correlation_id = ?');
            params.push(filter.correlation_id);
        }
        
        if (filter.date_from) {
            conditions.push('created_at >= ?');
            params.push(filter.date_from);
        }
        
        if (filter.date_to) {
            conditions.push('created_at <= ?');
            params.push(filter.date_to);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT * FROM order_events 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        
        params.push(limit);
        const [rows] = await pool.execute(sql, params) as any;
        return this.mapRows(rows);
    }
    
    /**
     * Get event summary by type
     */
    async getEventSummary(filter?: OrderEventFilter): Promise<Array<{ event_type: string; count: number }>> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter?.order_number) {
            conditions.push('order_number = ?');
            params.push(filter.order_number);
        }
        
        if (filter?.phone) {
            conditions.push('phone = ?');
            params.push(filter.phone);
        }
        
        if (filter?.correlation_id) {
            conditions.push('correlation_id = ?');
            params.push(filter.correlation_id);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT event_type, COUNT(*) as count 
            FROM order_events 
            ${whereClause}
            GROUP BY event_type 
            ORDER BY count DESC
        `;
        
        const [rows] = await pool.execute(sql, params) as any;
        return rows;
    }
    
    /**
     * Delete old events (cleanup)
     */
    async deleteOlderThan(days: number): Promise<number> {
        const [result] = await pool.execute(
            'DELETE FROM order_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        ) as any;
        
        return result.affectedRows;
    }
    
    /**
     * Map database rows to OrderEvent objects
     */
    private mapRows(rows: any[]): OrderEvent[] {
        return rows.map(row => ({
            id: row.id,
            order_number: row.order_number,
            phone: row.phone,
            phone_hash: row.phone_hash,
            session_id: row.session_id,
            event_type: row.event_type,
            event_source: row.event_source,
            event_description: row.event_description,
            event_data: row.event_data ? JSON.parse(row.event_data) : null,
            flow_name: row.flow_name,
            flow_stage: row.flow_stage,
            user_input: row.user_input,
            bot_response: row.bot_response,
            ip_address: row.ip_address,
            user_agent: row.user_agent,
            correlation_id: row.correlation_id,
            created_at: new Date(row.created_at)
        }));
    }
}

// Export singleton instance
export const orderEventRepository = new OrderEventRepository();
