/**
 * Repository for message_telemetry_events table
 * Handles CRUD operations for telemetry events with proper typing
 */

import { pool } from '../mysql-database';
import type {
    TelemetryEvent,
    TelemetryEventRecord,
    TelemetryEventFilter,
    TelemetryEventPaginatedResult,
    TelemetryFunnelStats,
    MessageJourney
} from '../types/MessageTelemetry';
import { TelemetryState } from '../types/MessageTelemetry';

export class MessageTelemetryRepository {
    /**
     * Insert a new telemetry event
     */
    async create(record: TelemetryEventRecord): Promise<number> {
        const sql = `
            INSERT INTO message_telemetry_events 
            (event_id, message_id, phone_hash, timestamp, state, previous_state, skip_reason, error_type, detail, processing_time_ms, stage, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await pool.execute(sql, [
            record.event_id,
            record.message_id,
            record.phone_hash,
            record.timestamp,
            record.state,
            record.previous_state || null,
            record.skip_reason || null,
            record.error_type || null,
            record.detail || null,
            record.processing_time_ms || null,
            record.stage || null,
            record.correlation_id || null
        ]) as any;

        return result.insertId;
    }

    /**
     * Bulk insert multiple telemetry events (efficient for batch operations)
     */
    async createBatch(records: TelemetryEventRecord[]): Promise<void> {
        if (records.length === 0) return;

        const sql = `
            INSERT INTO message_telemetry_events 
            (event_id, message_id, phone_hash, timestamp, state, previous_state, skip_reason, error_type, detail, processing_time_ms, stage, correlation_id)
            VALUES ?
        `;

        const values = records.map(record => [
            record.event_id,
            record.message_id,
            record.phone_hash,
            record.timestamp,
            record.state,
            record.previous_state || null,
            record.skip_reason || null,
            record.error_type || null,
            record.detail || null,
            record.processing_time_ms || null,
            record.stage || null,
            record.correlation_id || null
        ]);

        await pool.query(sql, [values]);
    }

    /**
     * Get telemetry events by message ID
     */
    async getByMessageId(messageId: string): Promise<TelemetryEvent[]> {
        const sql = `
            SELECT * FROM message_telemetry_events 
            WHERE message_id = ? 
            ORDER BY timestamp ASC
        `;

        const [rows] = await pool.execute(sql, [messageId]) as any;
        return this.mapRows(rows);
    }

    /**
     * Get telemetry events by phone hash
     */
    async getByPhoneHash(phoneHash: string, limit: number = 50): Promise<TelemetryEvent[]> {
        const sql = `
            SELECT * FROM message_telemetry_events 
            WHERE phone_hash = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `;

        const [rows] = await pool.execute(sql, [phoneHash, limit]) as any;
        return this.mapRows(rows);
    }

    /**
     * Get recent telemetry events with filters
     */
    async findByFilter(filter: TelemetryEventFilter, limit: number = 100): Promise<TelemetryEvent[]> {
        const { conditions, params } = this.buildFilterConditions(filter);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `
            SELECT * FROM message_telemetry_events 
            ${whereClause}
            ORDER BY timestamp DESC 
            LIMIT ?
        `;

        params.push(limit);
        const [rows] = await pool.execute(sql, params) as any;
        return this.mapRows(rows);
    }

    /**
     * Get telemetry events with filters and pagination
     */
    async findByFilterPaginated(
        filter: TelemetryEventFilter,
        page: number = 1,
        perPage: number = 50
    ): Promise<TelemetryEventPaginatedResult> {
        const { conditions, params } = this.buildFilterConditions(filter);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total matching records
        const countSql = `SELECT COUNT(*) as total FROM message_telemetry_events ${whereClause}`;
        const [countRows] = await pool.execute(countSql, params) as any;
        const total = countRows[0].total;

        // Get paginated results
        const offset = (page - 1) * perPage;
        const dataSql = `
            SELECT * FROM message_telemetry_events 
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
     * Get funnel statistics for a time window
     */
    async getFunnelStats(windowMinutes: number = 5): Promise<TelemetryFunnelStats> {
        const stateSql = `
            SELECT state, COUNT(*) as count 
            FROM message_telemetry_events 
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            GROUP BY state
        `;

        const skipReasonSql = `
            SELECT skip_reason, COUNT(*) as count 
            FROM message_telemetry_events 
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            AND state = 'SKIPPED' AND skip_reason IS NOT NULL
            GROUP BY skip_reason
        `;

        const errorTypeSql = `
            SELECT error_type, COUNT(*) as count 
            FROM message_telemetry_events 
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            AND state = 'ERROR' AND error_type IS NOT NULL
            GROUP BY error_type
        `;

        const avgTimeSql = `
            SELECT AVG(processing_time_ms) as avg_time 
            FROM message_telemetry_events 
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            AND state IN ('RESPONDED', 'SKIPPED', 'ERROR')
            AND processing_time_ms IS NOT NULL
        `;

        const [stateRows] = await pool.execute(stateSql, [windowMinutes]) as any;
        const [skipRows] = await pool.execute(skipReasonSql, [windowMinutes]) as any;
        const [errorRows] = await pool.execute(errorTypeSql, [windowMinutes]) as any;
        const [avgTimeRows] = await pool.execute(avgTimeSql, [windowMinutes]) as any;

        // Build state counts
        const stateCounts: Record<string, number> = {};
        for (const row of stateRows) {
            stateCounts[row.state] = row.count;
        }

        // Build skip reasons
        const skipReasons: Record<string, number> = {};
        for (const row of skipRows) {
            skipReasons[row.skip_reason] = row.count;
        }

        // Build error types
        const errorTypes: Record<string, number> = {};
        for (const row of errorRows) {
            errorTypes[row.error_type] = row.count;
        }

        // Determine avgProcessingTimeMs: null when no RESPONDED events, otherwise use actual avg
        // This distinguishes "no data" (null) from "instant responses" (0)
        const respondedCount = stateCounts[TelemetryState.RESPONDED] || 0;
        const avgTime = avgTimeRows[0]?.avg_time;
        let avgProcessingTimeMs: number | null = null;
        
        if (respondedCount > 0 && avgTime !== null && avgTime !== undefined) {
            const roundedAvg = Math.round(Number(avgTime));
            // Validate: if avg is 0 but we have RESPONDED events, this likely indicates
            // missing processing_time_ms values rather than instant responses
            if (roundedAvg === 0 && respondedCount > 0) {
                console.warn(
                    `[MessageTelemetry] avgProcessingTimeMs is 0 but ${respondedCount} RESPONDED events exist. ` +
                    `This may indicate missing processing_time_ms values. Returning null to indicate data quality issue.`
                );
                // Return null to indicate data quality issue rather than misleading 0ms
                avgProcessingTimeMs = null;
            } else {
                avgProcessingTimeMs = roundedAvg;
            }
        } else if (respondedCount > 0 && (avgTime === null || avgTime === undefined)) {
            // RESPONDED events exist but no processing time data - this is unexpected
            console.warn(
                `[MessageTelemetry] ${respondedCount} RESPONDED events but no processing time data available.`
            );
        }

        return {
            received: stateCounts[TelemetryState.RECEIVED] || 0,
            queued: stateCounts[TelemetryState.QUEUED] || 0,
            processing: stateCounts[TelemetryState.PROCESSING] || 0,
            responded: respondedCount,
            skipped: stateCounts[TelemetryState.SKIPPED] || 0,
            errors: stateCounts[TelemetryState.ERROR] || 0,
            skipReasons,
            errorTypes,
            avgProcessingTimeMs,
            windowMinutes
        };
    }

    /**
     * Get recent messages per phone (last N messages)
     */
    async getRecentMessagesByPhone(phoneHash: string, limit: number = 10): Promise<MessageJourney[]> {
        // Get distinct message IDs for this phone
        const messagesSql = `
            SELECT DISTINCT message_id, MIN(timestamp) as first_timestamp
            FROM message_telemetry_events 
            WHERE phone_hash = ?
            GROUP BY message_id
            ORDER BY first_timestamp DESC
            LIMIT ?
        `;

        const [messageRows] = await pool.execute(messagesSql, [phoneHash, limit]) as any;

        const journeys: MessageJourney[] = [];

        for (const row of messageRows) {
            const events = await this.getByMessageId(row.message_id);
            if (events.length > 0) {
                const finalEvent = events[events.length - 1];
                const firstEvent = events[0];

                journeys.push({
                    messageId: row.message_id,
                    phoneHash,
                    events,
                    finalState: finalEvent.state,
                    totalDurationMs: finalEvent.processingTimeMs || 
                        (finalEvent.timestamp.getTime() - firstEvent.timestamp.getTime()),
                    startedAt: firstEvent.timestamp,
                    completedAt: [TelemetryState.RESPONDED, TelemetryState.SKIPPED, TelemetryState.ERROR]
                        .includes(finalEvent.state) ? finalEvent.timestamp : undefined
                });
            }
        }

        return journeys;
    }

    /**
     * Delete old telemetry events (cleanup/retention)
     */
    async deleteOlderThan(days: number): Promise<number> {
        const [result] = await pool.execute(
            'DELETE FROM message_telemetry_events WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        ) as any;

        return result.affectedRows;
    }

    /**
     * Build filter conditions for SQL queries
     */
    private buildFilterConditions(filter: TelemetryEventFilter): { conditions: string[]; params: any[] } {
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

        if (filter.state) {
            conditions.push('state = ?');
            params.push(filter.state);
        }

        if (filter.skipReason) {
            conditions.push('skip_reason = ?');
            params.push(filter.skipReason);
        }

        if (filter.errorType) {
            conditions.push('error_type = ?');
            params.push(filter.errorType);
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
     * Map database row to TelemetryEvent object
     */
    private mapRowToTelemetryEvent(row: any): TelemetryEvent {
        return {
            eventId: row.event_id,
            messageId: row.message_id,
            phoneHash: row.phone_hash,
            timestamp: new Date(row.timestamp),
            state: row.state as TelemetryState,
            previousState: row.previous_state || undefined,
            skipReason: row.skip_reason || undefined,
            errorType: row.error_type || undefined,
            detail: row.detail || undefined,
            processingTimeMs: row.processing_time_ms || undefined,
            stage: row.stage || undefined,
            correlationId: row.correlation_id || undefined
        };
    }

    /**
     * Map database rows to TelemetryEvent objects
     */
    private mapRows(rows: any[]): TelemetryEvent[] {
        return rows.map(row => this.mapRowToTelemetryEvent(row));
    }
}

// Export singleton instance
export const messageTelemetryRepository = new MessageTelemetryRepository();
