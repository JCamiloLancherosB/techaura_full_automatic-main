/**
 * Repository for message_decisions table
 * Handles CRUD operations for decision traces with proper typing
 */

import { pool } from '../mysql-database';
import type { 
    DecisionTrace, 
    DecisionTraceRecord, 
    DecisionTraceFilter,
    DecisionTracePaginatedResult,
    DecisionStage,
    Decision,
    DecisionReasonCode
} from '../types/DecisionTrace';

export class MessageDecisionRepository {
    /**
     * Insert a new decision trace
     */
    async create(record: DecisionTraceRecord): Promise<number> {
        const sql = `
            INSERT INTO message_decisions 
            (trace_id, message_id, phone_hash, timestamp, stage, decision, reason_code, reason_detail, next_eligible_at, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            record.trace_id,
            record.message_id,
            record.phone_hash,
            record.timestamp,
            record.stage,
            record.decision,
            record.reason_code,
            record.reason_detail || null,
            record.next_eligible_at || null,
            record.correlation_id || null
        ]) as any;
        
        return result.insertId;
    }

    /**
     * Bulk insert multiple decision traces (efficient for batch operations)
     */
    async createBatch(records: DecisionTraceRecord[]): Promise<void> {
        if (records.length === 0) return;
        
        const sql = `
            INSERT INTO message_decisions 
            (trace_id, message_id, phone_hash, timestamp, stage, decision, reason_code, reason_detail, next_eligible_at, correlation_id)
            VALUES ?
        `;
        
        const values = records.map(record => [
            record.trace_id,
            record.message_id,
            record.phone_hash,
            record.timestamp,
            record.stage,
            record.decision,
            record.reason_code,
            record.reason_detail || null,
            record.next_eligible_at || null,
            record.correlation_id || null
        ]);
        
        await pool.query(sql, [values]);
    }

    /**
     * Get decision trace by trace ID
     */
    async getByTraceId(traceId: string): Promise<DecisionTrace | null> {
        const sql = `
            SELECT * FROM message_decisions 
            WHERE trace_id = ? 
            LIMIT 1
        `;
        
        const [rows] = await pool.execute(sql, [traceId]) as any;
        if (rows.length === 0) return null;
        
        return this.mapRowToDecisionTrace(rows[0]);
    }

    /**
     * Get decision traces by message ID
     */
    async getByMessageId(messageId: string): Promise<DecisionTrace[]> {
        const sql = `
            SELECT * FROM message_decisions 
            WHERE message_id = ? 
            ORDER BY timestamp ASC
        `;
        
        const [rows] = await pool.execute(sql, [messageId]) as any;
        return this.mapRows(rows);
    }

    /**
     * Get decision traces by phone hash
     */
    async getByPhoneHash(phoneHash: string, limit: number = 50): Promise<DecisionTrace[]> {
        const sql = `
            SELECT * FROM message_decisions 
            WHERE phone_hash = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `;
        
        const [rows] = await pool.execute(sql, [phoneHash, limit]) as any;
        return this.mapRows(rows);
    }

    /**
     * Get decision traces with filters
     */
    async findByFilter(filter: DecisionTraceFilter, limit: number = 50): Promise<DecisionTrace[]> {
        const { conditions, params } = this.buildFilterConditions(filter);
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT * FROM message_decisions 
            ${whereClause}
            ORDER BY timestamp DESC 
            LIMIT ?
        `;
        
        params.push(limit);
        const [rows] = await pool.execute(sql, params) as any;
        return this.mapRows(rows);
    }

    /**
     * Get decision traces with filters and pagination
     */
    async findByFilterPaginated(
        filter: DecisionTraceFilter, 
        page: number = 1, 
        perPage: number = 50
    ): Promise<DecisionTracePaginatedResult> {
        const { conditions, params } = this.buildFilterConditions(filter);
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        // Count total matching records
        const countSql = `SELECT COUNT(*) as total FROM message_decisions ${whereClause}`;
        const [countRows] = await pool.execute(countSql, params) as any;
        const total = countRows[0].total;
        
        // Get paginated results
        const offset = (page - 1) * perPage;
        const dataSql = `
            SELECT * FROM message_decisions 
            ${whereClause}
            ORDER BY timestamp DESC 
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
     * Get decision summary statistics
     */
    async getDecisionSummary(filter?: DecisionTraceFilter): Promise<Array<{ decision: string; count: number }>> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter?.dateFrom) {
            conditions.push('timestamp >= ?');
            params.push(filter.dateFrom);
        }
        
        if (filter?.dateTo) {
            conditions.push('timestamp <= ?');
            params.push(filter.dateTo);
        }
        
        if (filter?.phoneHash) {
            conditions.push('phone_hash = ?');
            params.push(filter.phoneHash);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT decision, COUNT(*) as count 
            FROM message_decisions 
            ${whereClause}
            GROUP BY decision 
            ORDER BY count DESC
        `;
        
        const [rows] = await pool.execute(sql, params) as any;
        return rows;
    }

    /**
     * Get reason code summary statistics
     */
    async getReasonCodeSummary(filter?: DecisionTraceFilter): Promise<Array<{ reason_code: string; count: number }>> {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter?.dateFrom) {
            conditions.push('timestamp >= ?');
            params.push(filter.dateFrom);
        }
        
        if (filter?.dateTo) {
            conditions.push('timestamp <= ?');
            params.push(filter.dateTo);
        }
        
        if (filter?.phoneHash) {
            conditions.push('phone_hash = ?');
            params.push(filter.phoneHash);
        }
        
        if (filter?.decision) {
            conditions.push('decision = ?');
            params.push(filter.decision);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const sql = `
            SELECT reason_code, COUNT(*) as count 
            FROM message_decisions 
            ${whereClause}
            GROUP BY reason_code 
            ORDER BY count DESC
        `;
        
        const [rows] = await pool.execute(sql, params) as any;
        return rows;
    }

    /**
     * Delete old decision traces (cleanup/retention)
     */
    async deleteOlderThan(days: number): Promise<number> {
        const [result] = await pool.execute(
            'DELETE FROM message_decisions WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        ) as any;
        
        return result.affectedRows;
    }

    /**
     * Build filter conditions for SQL queries
     */
    private buildFilterConditions(filter: DecisionTraceFilter): { conditions: string[]; params: any[] } {
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (filter.phoneHash) {
            conditions.push('phone_hash = ?');
            params.push(filter.phoneHash);
        }
        
        if (filter.messageId) {
            conditions.push('message_id = ?');
            params.push(filter.messageId);
        }
        
        if (filter.stage) {
            conditions.push('stage = ?');
            params.push(filter.stage);
        }
        
        if (filter.decision) {
            conditions.push('decision = ?');
            params.push(filter.decision);
        }
        
        if (filter.reasonCode) {
            conditions.push('reason_code = ?');
            params.push(filter.reasonCode);
        }
        
        if (filter.correlationId) {
            conditions.push('correlation_id = ?');
            params.push(filter.correlationId);
        }
        
        if (filter.dateFrom) {
            conditions.push('timestamp >= ?');
            params.push(filter.dateFrom);
        }
        
        if (filter.dateTo) {
            conditions.push('timestamp <= ?');
            params.push(filter.dateTo);
        }
        
        return { conditions, params };
    }

    /**
     * Map database row to DecisionTrace object
     */
    private mapRowToDecisionTrace(row: any): DecisionTrace {
        return {
            traceId: row.trace_id,
            messageId: row.message_id,
            phoneHash: row.phone_hash,
            timestamp: new Date(row.timestamp),
            stage: row.stage as DecisionStage,
            decision: row.decision as Decision,
            reasonCode: row.reason_code as DecisionReasonCode,
            reasonDetail: row.reason_detail || undefined,
            nextEligibleAt: row.next_eligible_at ? new Date(row.next_eligible_at) : undefined,
            correlationId: row.correlation_id || undefined
        };
    }

    /**
     * Map database rows to DecisionTrace objects
     */
    private mapRows(rows: any[]): DecisionTrace[] {
        return rows.map(row => this.mapRowToDecisionTrace(row));
    }
}

// Export singleton instance
export const messageDecisionRepository = new MessageDecisionRepository();
