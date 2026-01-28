/**
 * Analytics Pipeline Verification Script
 * 
 * This script verifies that events are being properly inserted and
 * that watermarks are advancing correctly for all analytics pipelines.
 * 
 * Usage: npx ts-node src/scripts/verifyAnalyticsPipelines.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../mysql-database';
import { analyticsWatermarkRepository, AnalyticsWatermark } from '../repositories/AnalyticsWatermarkRepository';
import { unifiedLogger } from '../utils/unifiedLogger';

// Pipeline definitions with their associated event tables
interface PipelineDefinition {
    name: string;
    watermarkName: string;
    eventTable: string;
    eventTypesFilter?: string[];
    description: string;
}

const PIPELINE_DEFINITIONS: PipelineDefinition[] = [
    {
        name: 'Order Stats',
        watermarkName: 'orders_stats_v1',
        eventTable: 'order_events',
        eventTypesFilter: ['order_initiated', 'order_confirmed', 'order_cancelled'],
        description: 'Daily order statistics aggregation'
    },
    {
        name: 'Intent Conversion',
        watermarkName: 'intent_conversion_v1',
        eventTable: 'order_events',
        description: 'Intent conversion rate tracking'
    },
    {
        name: 'Followup Performance',
        watermarkName: 'followup_performance_v1',
        eventTable: 'order_events',
        eventTypesFilter: ['followup_scheduled', 'followup_attempted', 'followup_sent', 'followup_blocked', 'followup_cancelled', 'followup_responded'],
        description: 'Follow-up message performance tracking'
    },
    {
        name: 'Stage Funnel',
        watermarkName: 'stage_funnel_v1',
        eventTable: 'chatbot_events',
        eventTypesFilter: ['STAGE_SET', 'STAGE_RESOLVED', 'BLOCKING_QUESTION_ASKED', 'ORDER_CONFIRMED'],
        description: 'Conversation stage funnel analytics'
    },
    {
        name: 'Followup Blocked',
        watermarkName: 'followup_blocked_v1',
        eventTable: 'chatbot_events',
        eventTypesFilter: ['FOLLOWUP_BLOCKED'],
        description: 'Blocked follow-up tracking by reason'
    }
];

interface PipelineStatus {
    pipelineName: string;
    watermarkName: string;
    watermarkEventId: number;
    watermarkLastProcessed: Date | null;
    watermarkTotalProcessed: number;
    latestEventId: number | null;
    latestEventCreatedAt: Date | null;
    pendingEvents: number;
    status: 'HEALTHY' | 'STALE' | 'AHEAD_OF_DATA' | 'NO_WATERMARK' | 'NO_EVENTS' | 'TABLE_MISSING';
    discrepancy: string | null;
    estimatedLagMinutes: number | null;
    lastChecked: Date;
}

interface VerificationReport {
    timestamp: Date;
    overallStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
    pipelines: PipelineStatus[];
    summary: {
        totalPipelines: number;
        healthyPipelines: number;
        stalePipelines: number;
        errorPipelines: number;
    };
}

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
    try {
        const [tables] = await pool.execute<any[]>(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
            [tableName]
        );
        return Array.isArray(tables) && tables.length > 0;
    } catch (error) {
        return false;
    }
}

/**
 * Get the latest event ID and timestamp from an event table
 */
async function getLatestEvent(
    tableName: string,
    eventTypesFilter?: string[]
): Promise<{ id: number; createdAt: Date } | null> {
    try {
        let sql = `SELECT id, created_at FROM ${tableName}`;
        const params: any[] = [];
        
        if (eventTypesFilter && eventTypesFilter.length > 0) {
            const placeholders = eventTypesFilter.map(() => '?').join(', ');
            sql += ` WHERE event_type IN (${placeholders})`;
            params.push(...eventTypesFilter);
        }
        
        sql += ' ORDER BY id DESC LIMIT 1';
        
        const [rows] = await pool.execute(sql, params) as any;
        
        if (rows && rows.length > 0) {
            return {
                id: rows[0].id,
                createdAt: new Date(rows[0].created_at)
            };
        }
        return null;
    } catch (error) {
        console.error(`Error getting latest event from ${tableName}:`, error);
        return null;
    }
}

/**
 * Count pending events since watermark
 */
async function countPendingEvents(
    tableName: string,
    sinceEventId: number,
    eventTypesFilter?: string[]
): Promise<number> {
    try {
        let sql = `SELECT COUNT(*) as count FROM ${tableName} WHERE id > ?`;
        const params: any[] = [sinceEventId];
        
        if (eventTypesFilter && eventTypesFilter.length > 0) {
            const placeholders = eventTypesFilter.map(() => '?').join(', ');
            sql += ` AND event_type IN (${placeholders})`;
            params.push(...eventTypesFilter);
        }
        
        const [rows] = await pool.execute(sql, params) as any;
        return Number(rows[0]?.count || 0);
    } catch (error) {
        console.error(`Error counting pending events in ${tableName}:`, error);
        return 0;
    }
}

/**
 * Calculate estimated lag in minutes
 */
function calculateEstimatedLag(
    watermarkLastProcessed: Date | null,
    latestEventCreatedAt: Date | null
): number | null {
    if (!watermarkLastProcessed || !latestEventCreatedAt) {
        return null;
    }
    
    const lagMs = latestEventCreatedAt.getTime() - watermarkLastProcessed.getTime();
    return Math.max(0, Math.round(lagMs / (60 * 1000)));
}

/**
 * Verify a single pipeline's status
 */
async function verifyPipeline(definition: PipelineDefinition): Promise<PipelineStatus> {
    const now = new Date();
    
    // Check if event table exists
    const tableExistsResult = await tableExists(definition.eventTable);
    if (!tableExistsResult) {
        return {
            pipelineName: definition.name,
            watermarkName: definition.watermarkName,
            watermarkEventId: 0,
            watermarkLastProcessed: null,
            watermarkTotalProcessed: 0,
            latestEventId: null,
            latestEventCreatedAt: null,
            pendingEvents: 0,
            status: 'TABLE_MISSING',
            discrepancy: `Event table '${definition.eventTable}' does not exist`,
            estimatedLagMinutes: null,
            lastChecked: now
        };
    }
    
    // Get watermark
    const watermark = await analyticsWatermarkRepository.getByName(definition.watermarkName);
    
    if (!watermark) {
        const latestEvent = await getLatestEvent(definition.eventTable, definition.eventTypesFilter);
        return {
            pipelineName: definition.name,
            watermarkName: definition.watermarkName,
            watermarkEventId: 0,
            watermarkLastProcessed: null,
            watermarkTotalProcessed: 0,
            latestEventId: latestEvent?.id || null,
            latestEventCreatedAt: latestEvent?.createdAt || null,
            pendingEvents: latestEvent ? latestEvent.id : 0,
            status: 'NO_WATERMARK',
            discrepancy: `Watermark '${definition.watermarkName}' not found - pipeline may not be initialized`,
            estimatedLagMinutes: null,
            lastChecked: now
        };
    }
    
    // Get latest event and pending count
    const latestEvent = await getLatestEvent(definition.eventTable, definition.eventTypesFilter);
    const watermarkEventId = Number(watermark.last_event_id || 0);
    const pendingEvents = await countPendingEvents(
        definition.eventTable,
        watermarkEventId,
        definition.eventTypesFilter
    );
    
    // Determine status and discrepancy
    let status: PipelineStatus['status'];
    let discrepancy: string | null = null;
    
    if (!latestEvent) {
        status = 'NO_EVENTS';
        discrepancy = 'No events found in table (empty or filtered out)';
    } else if (watermarkEventId > latestEvent.id) {
        status = 'AHEAD_OF_DATA';
        discrepancy = `Watermark (${watermarkEventId}) is ahead of latest event (${latestEvent.id}) - data may have been deleted`;
    } else if (pendingEvents > 100) {
        status = 'STALE';
        discrepancy = `${pendingEvents} events pending processing - watermark may not be advancing`;
    } else if (pendingEvents > 0) {
        // Some pending events is normal during processing
        status = 'HEALTHY';
        discrepancy = null;
    } else {
        status = 'HEALTHY';
        discrepancy = null;
    }
    
    const estimatedLagMinutes = calculateEstimatedLag(
        watermark.last_processed_at,
        latestEvent?.createdAt || null
    );
    
    return {
        pipelineName: definition.name,
        watermarkName: definition.watermarkName,
        watermarkEventId,
        watermarkLastProcessed: watermark.last_processed_at || null,
        watermarkTotalProcessed: Number(watermark.total_processed || 0),
        latestEventId: latestEvent?.id || null,
        latestEventCreatedAt: latestEvent?.createdAt || null,
        pendingEvents,
        status,
        discrepancy,
        estimatedLagMinutes,
        lastChecked: now
    };
}

/**
 * Run full verification of all analytics pipelines
 */
export async function verifyAnalyticsPipelines(): Promise<VerificationReport> {
    const timestamp = new Date();
    const pipelines: PipelineStatus[] = [];
    
    console.log('\n🔍 ===== ANALYTICS PIPELINE VERIFICATION =====\n');
    
    for (const definition of PIPELINE_DEFINITIONS) {
        console.log(`Checking pipeline: ${definition.name}...`);
        const status = await verifyPipeline(definition);
        pipelines.push(status);
        
        // Log individual pipeline status
        const statusIcon = status.status === 'HEALTHY' ? '✅' : 
                          status.status === 'STALE' ? '⚠️' : 
                          status.status === 'NO_WATERMARK' ? '❓' : '❌';
        
        console.log(`  ${statusIcon} [${status.status}] ${status.pipelineName}`);
        console.log(`     Watermark Event ID: ${status.watermarkEventId}`);
        console.log(`     Latest Event ID: ${status.latestEventId || 'N/A'}`);
        console.log(`     Pending Events: ${status.pendingEvents}`);
        console.log(`     Estimated Lag: ${status.estimatedLagMinutes !== null ? `${status.estimatedLagMinutes} minutes` : 'N/A'}`);
        
        if (status.discrepancy) {
            console.log(`     ⚠️ Discrepancy: ${status.discrepancy}`);
        }
        console.log('');
    }
    
    // Calculate summary
    const healthyPipelines = pipelines.filter(p => p.status === 'HEALTHY').length;
    const stalePipelines = pipelines.filter(p => p.status === 'STALE').length;
    const errorPipelines = pipelines.filter(p => 
        p.status === 'AHEAD_OF_DATA' || 
        p.status === 'NO_WATERMARK' || 
        p.status === 'TABLE_MISSING'
    ).length;
    
    // Determine overall status
    let overallStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
    if (errorPipelines > 0) {
        overallStatus = 'ERROR';
    } else if (stalePipelines > 0) {
        overallStatus = 'WARNING';
    } else {
        overallStatus = 'HEALTHY';
    }
    
    const report: VerificationReport = {
        timestamp,
        overallStatus,
        pipelines,
        summary: {
            totalPipelines: pipelines.length,
            healthyPipelines,
            stalePipelines,
            errorPipelines
        }
    };
    
    // Print summary
    console.log('='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Overall Status: ${overallStatus}`);
    console.log(`Total Pipelines: ${report.summary.totalPipelines}`);
    console.log(`✅ Healthy: ${report.summary.healthyPipelines}`);
    console.log(`⚠️ Stale: ${report.summary.stalePipelines}`);
    console.log(`❌ Error: ${report.summary.errorPipelines}`);
    console.log('='.repeat(60));
    
    // List discrepancies
    const pipelinesWithDiscrepancies = pipelines.filter(p => p.discrepancy);
    if (pipelinesWithDiscrepancies.length > 0) {
        console.log('\n📋 DISCREPANCIES DETECTED:');
        for (const pipeline of pipelinesWithDiscrepancies) {
            console.log(`  - [${pipeline.pipelineName}]: ${pipeline.discrepancy}`);
        }
    }
    
    return report;
}

/**
 * Get pipeline lag information for admin endpoint
 */
export async function getPipelineLagInfo(): Promise<Array<{
    pipelineName: string;
    watermarkName: string;
    pendingEvents: number;
    estimatedLagMinutes: number | null;
    status: string;
    discrepancy: string | null;
}>> {
    const results: Array<{
        pipelineName: string;
        watermarkName: string;
        pendingEvents: number;
        estimatedLagMinutes: number | null;
        status: string;
        discrepancy: string | null;
    }> = [];
    
    for (const definition of PIPELINE_DEFINITIONS) {
        const status = await verifyPipeline(definition);
        results.push({
            pipelineName: status.pipelineName,
            watermarkName: status.watermarkName,
            pendingEvents: status.pendingEvents,
            estimatedLagMinutes: status.estimatedLagMinutes,
            status: status.status,
            discrepancy: status.discrepancy
        });
    }
    
    return results;
}

// Run verification if executed directly
if (require.main === module) {
    console.log('🚀 TechAura Analytics Pipeline Verification\n');
    
    verifyAnalyticsPipelines()
        .then(report => {
            console.log('\n✅ Verification complete');
            
            if (report.overallStatus === 'ERROR') {
                console.log('\n❌ ERRORS DETECTED - Please investigate the pipelines with issues');
                process.exit(1);
            } else if (report.overallStatus === 'WARNING') {
                console.log('\n⚠️ WARNINGS DETECTED - Some pipelines may need attention');
                process.exit(0);
            } else {
                console.log('\n✅ All pipelines are healthy');
                process.exit(0);
            }
        })
        .catch(error => {
            console.error('\n❌ Verification failed:', error);
            process.exit(1);
        })
        .finally(async () => {
            try {
                await pool.end();
                console.log('\n✅ Database connection closed');
            } catch (error) {
                console.log('\n⚠️ Error closing database connection:', error);
            }
        });
}

export default verifyAnalyticsPipelines;
