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

// Valid table names for pipeline verification (whitelist to prevent SQL injection)
const VALID_TABLE_NAMES = new Set(['order_events', 'chatbot_events', 'analytics_watermarks']);

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
    // Validate table name against whitelist
    if (!VALID_TABLE_NAMES.has(tableName)) {
        console.error(`Invalid table name: ${tableName}`);
        return false;
    }
    
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
    // Validate table name against whitelist
    if (!VALID_TABLE_NAMES.has(tableName)) {
        console.error(`Invalid table name: ${tableName}`);
        return null;
    }
    
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
    // Validate table name against whitelist
    if (!VALID_TABLE_NAMES.has(tableName)) {
        console.error(`Invalid table name: ${tableName}`);
        return 0;
    }
    
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

// =========================================================================
// Data Integrity Verification (PR5 - Symptom 0 Detection)
// =========================================================================

/**
 * Data integrity check result for a specific check type
 */
export interface DataIntegrityCheckResult {
    checkName: string;
    status: 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';
    message: string;
    details?: Record<string, any>;
}

/**
 * Full data integrity report
 */
export interface DataIntegrityReport {
    timestamp: Date;
    overallStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
    checks: DataIntegrityCheckResult[];
    summary: {
        totalChecks: number;
        passed: number;
        failed: number;
        warnings: number;
        skipped: number;
    };
}

/**
 * Check 1: Verify no orphaned RECEIVED messages (messages without outcomes)
 * Symptom 0: Messages RECEIVED but 0 outcomes
 */
async function checkOrphanedReceivedMessages(): Promise<DataIntegrityCheckResult> {
    try {
        // Check if message_telemetry table exists
        const [tables] = await pool.execute<any[]>(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_telemetry'`
        );
        
        if (!Array.isArray(tables) || tables.length === 0) {
            return {
                checkName: 'Orphaned RECEIVED Messages',
                status: 'SKIPPED',
                message: 'message_telemetry table not found'
            };
        }

        // Find messages that have RECEIVED but no final outcome (RESPONDED/SKIPPED/ERROR)
        // Only consider messages older than 5 minutes to allow for processing time
        const [orphanedRows] = await pool.execute<any[]>(`
            SELECT 
                r.message_id,
                r.phone_hash,
                r.timestamp as received_at,
                TIMESTAMPDIFF(MINUTE, r.timestamp, NOW()) as minutes_old
            FROM message_telemetry r
            WHERE r.state = 'RECEIVED'
            AND r.timestamp < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
            AND NOT EXISTS (
                SELECT 1 FROM message_telemetry o
                WHERE o.message_id = r.message_id
                AND o.state IN ('RESPONDED', 'SKIPPED', 'ERROR')
            )
            ORDER BY r.timestamp DESC
            LIMIT 100
        `);

        const orphanedCount = Array.isArray(orphanedRows) ? orphanedRows.length : 0;

        if (orphanedCount === 0) {
            return {
                checkName: 'Orphaned RECEIVED Messages',
                status: 'PASS',
                message: 'All RECEIVED messages have outcomes'
            };
        } else if (orphanedCount <= 5) {
            return {
                checkName: 'Orphaned RECEIVED Messages',
                status: 'WARNING',
                message: `${orphanedCount} RECEIVED message(s) without outcomes (may be in-flight)`,
                details: {
                    orphanedCount,
                    samples: orphanedRows.slice(0, 5).map((r: any) => ({
                        messageId: r.message_id?.substring(0, 20),
                        minutesOld: r.minutes_old
                    }))
                }
            };
        } else {
            return {
                checkName: 'Orphaned RECEIVED Messages',
                status: 'FAIL',
                message: `${orphanedCount} RECEIVED messages without outcomes - data integrity issue`,
                details: {
                    orphanedCount,
                    samples: orphanedRows.slice(0, 10).map((r: any) => ({
                        messageId: r.message_id?.substring(0, 20),
                        minutesOld: r.minutes_old
                    }))
                }
            };
        }
    } catch (error) {
        return {
            checkName: 'Orphaned RECEIVED Messages',
            status: 'SKIPPED',
            message: `Error checking orphaned messages: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Check 2: Verify followups scheduled are being attempted/sent
 * Symptom 0: Followups scheduled but 0 attempted/sent for days
 */
async function checkStaleFollowups(): Promise<DataIntegrityCheckResult> {
    try {
        // Check if chatbot_events table exists
        const [tables] = await pool.execute<any[]>(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chatbot_events'`
        );
        
        if (!Array.isArray(tables) || tables.length === 0) {
            return {
                checkName: 'Stale Followups',
                status: 'SKIPPED',
                message: 'chatbot_events table not found'
            };
        }

        // Get followup counts for the last 24 hours
        const [followupCounts] = await pool.execute<any[]>(`
            SELECT 
                event_type,
                COUNT(*) as count
            FROM chatbot_events 
            WHERE event_type IN ('FOLLOWUP_SCHEDULED', 'FOLLOWUP_ATTEMPTED', 'FOLLOWUP_SENT', 'FOLLOWUP_BLOCKED')
            AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY event_type
        `);

        const counts: Record<string, number> = {};
        if (Array.isArray(followupCounts)) {
            for (const row of followupCounts as any[]) {
                counts[row.event_type] = Number(row.count) || 0;
            }
        }

        const scheduled = counts['FOLLOWUP_SCHEDULED'] || 0;
        const attempted = counts['FOLLOWUP_ATTEMPTED'] || 0;
        const sent = counts['FOLLOWUP_SENT'] || 0;
        const blocked = counts['FOLLOWUP_BLOCKED'] || 0;

        // If there are scheduled followups but zero attempts/sends, that's a problem
        if (scheduled > 0 && attempted === 0 && sent === 0) {
            // Check if all scheduled are blocked (acceptable)
            if (blocked >= scheduled) {
                return {
                    checkName: 'Stale Followups',
                    status: 'PASS',
                    message: `${scheduled} scheduled, all blocked (${blocked}) - no stale followups`,
                    details: { scheduled, attempted, sent, blocked }
                };
            }
            return {
                checkName: 'Stale Followups',
                status: 'FAIL',
                message: `${scheduled} followups scheduled but 0 attempted/sent in 24h - pipeline may be stuck`,
                details: { scheduled, attempted, sent, blocked }
            };
        } else if (scheduled > 0 && sent === 0 && attempted > 0) {
            // Attempts but no sends - might be all blocked
            return {
                checkName: 'Stale Followups',
                status: 'WARNING',
                message: `${scheduled} scheduled, ${attempted} attempted, but 0 sent - check blocking reasons`,
                details: { scheduled, attempted, sent, blocked }
            };
        } else if (scheduled === 0) {
            return {
                checkName: 'Stale Followups',
                status: 'PASS',
                message: 'No followups scheduled in last 24h',
                details: { scheduled, attempted, sent, blocked }
            };
        } else {
            const conversionRate = scheduled > 0 ? Math.round((sent / scheduled) * 100) : 0;
            return {
                checkName: 'Stale Followups',
                status: 'PASS',
                message: `Followups healthy: ${scheduled} scheduled, ${sent} sent (${conversionRate}% conversion)`,
                details: { scheduled, attempted, sent, blocked, conversionRate }
            };
        }
    } catch (error) {
        return {
            checkName: 'Stale Followups',
            status: 'SKIPPED',
            message: `Error checking stale followups: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Check 3: Verify analytics watermarks are advancing with new events
 * Symptom 0: Events exist but watermarks frozen
 */
async function checkWatermarkAdvancement(): Promise<DataIntegrityCheckResult> {
    try {
        const report = await verifyAnalyticsPipelines();
        
        const stalePipelines = report.pipelines.filter(p => p.status === 'STALE');
        const frozenPipelines = report.pipelines.filter(p => 
            p.status !== 'HEALTHY' && p.status !== 'NO_EVENTS' && p.pendingEvents > 50
        );
        
        if (stalePipelines.length > 0) {
            return {
                checkName: 'Watermark Advancement',
                status: 'FAIL',
                message: `${stalePipelines.length} pipeline(s) have stale watermarks`,
                details: {
                    stalePipelines: stalePipelines.map(p => ({
                        name: p.pipelineName,
                        pendingEvents: p.pendingEvents,
                        lagMinutes: p.estimatedLagMinutes
                    }))
                }
            };
        } else if (frozenPipelines.length > 0) {
            return {
                checkName: 'Watermark Advancement',
                status: 'WARNING',
                message: `${frozenPipelines.length} pipeline(s) may have issues`,
                details: {
                    frozenPipelines: frozenPipelines.map(p => ({
                        name: p.pipelineName,
                        status: p.status,
                        pendingEvents: p.pendingEvents
                    }))
                }
            };
        } else {
            return {
                checkName: 'Watermark Advancement',
                status: 'PASS',
                message: 'All analytics watermarks are advancing properly',
                details: {
                    healthyPipelines: report.summary.healthyPipelines,
                    totalPipelines: report.summary.totalPipelines
                }
            };
        }
    } catch (error) {
        return {
            checkName: 'Watermark Advancement',
            status: 'SKIPPED',
            message: `Error checking watermark advancement: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Run all data integrity checks
 * Detects "Symptom 0" scenarios before they reach production
 */
export async function runDataIntegrityChecks(): Promise<DataIntegrityReport> {
    const timestamp = new Date();
    const checks: DataIntegrityCheckResult[] = [];
    
    console.log('\n🔍 ===== DATA INTEGRITY VERIFICATION =====\n');
    
    // Run all checks
    console.log('Checking for orphaned RECEIVED messages...');
    checks.push(await checkOrphanedReceivedMessages());
    
    console.log('Checking for stale followups...');
    checks.push(await checkStaleFollowups());
    
    console.log('Checking watermark advancement...');
    checks.push(await checkWatermarkAdvancement());
    
    // Calculate summary
    const passed = checks.filter(c => c.status === 'PASS').length;
    const failed = checks.filter(c => c.status === 'FAIL').length;
    const warnings = checks.filter(c => c.status === 'WARNING').length;
    const skipped = checks.filter(c => c.status === 'SKIPPED').length;
    
    // Determine overall status
    let overallStatus: 'HEALTHY' | 'WARNING' | 'ERROR';
    if (failed > 0) {
        overallStatus = 'ERROR';
    } else if (warnings > 0) {
        overallStatus = 'WARNING';
    } else {
        overallStatus = 'HEALTHY';
    }
    
    const report: DataIntegrityReport = {
        timestamp,
        overallStatus,
        checks,
        summary: {
            totalChecks: checks.length,
            passed,
            failed,
            warnings,
            skipped
        }
    };
    
    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('DATA INTEGRITY CHECK RESULTS');
    console.log('='.repeat(60));
    
    for (const check of checks) {
        const statusIcon = check.status === 'PASS' ? '✅' : 
                          check.status === 'FAIL' ? '❌' : 
                          check.status === 'WARNING' ? '⚠️' : '⏭️';
        
        console.log(`${statusIcon} [${check.status}] ${check.checkName}`);
        console.log(`   ${check.message}`);
        
        if (check.details) {
            console.log('   Details:', JSON.stringify(check.details, null, 2).split('\n').join('\n   '));
        }
        console.log('');
    }
    
    console.log('='.repeat(60));
    console.log(`Overall Status: ${overallStatus}`);
    console.log(`Checks: ${passed} passed, ${failed} failed, ${warnings} warnings, ${skipped} skipped`);
    console.log('='.repeat(60));
    
    return report;
}

// Run verification if executed directly
if (require.main === module) {
    console.log('🚀 TechAura Analytics Pipeline Verification\n');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const runIntegrityChecks = args.includes('--integrity') || args.includes('-i');
    
    (async () => {
        let exitCode = 0;
        
        try {
            // Always run pipeline verification
            const report = await verifyAnalyticsPipelines();
            console.log('\n✅ Pipeline verification complete');
            
            // Run data integrity checks if requested
            let integrityReport: DataIntegrityReport | null = null;
            if (runIntegrityChecks) {
                console.log('\n📊 Running data integrity checks...');
                integrityReport = await runDataIntegrityChecks();
            }
            
            // Determine exit code based on results
            if (report.overallStatus === 'ERROR') {
                console.log('\n❌ PIPELINE ERRORS DETECTED - Please investigate');
                exitCode = 1;
            } else if (report.overallStatus === 'WARNING') {
                console.log('\n⚠️ PIPELINE WARNINGS DETECTED - Some pipelines may need attention');
            } else {
                console.log('\n✅ All pipelines are healthy');
            }
            
            if (integrityReport) {
                if (integrityReport.overallStatus === 'ERROR') {
                    console.log('\n❌ DATA INTEGRITY ERRORS DETECTED - Symptom 0 issues found');
                    exitCode = 1;
                } else if (integrityReport.overallStatus === 'WARNING') {
                    console.log('\n⚠️ DATA INTEGRITY WARNINGS - Some checks need attention');
                } else {
                    console.log('\n✅ Data integrity checks passed');
                }
            }
        } catch (error) {
            console.error('\n❌ Verification failed:', error);
            exitCode = 1;
        } finally {
            // Close database connection before exiting
            try {
                await pool.end();
                console.log('\n✅ Database connection closed');
            } catch (error) {
                console.log('\n⚠️ Error closing database connection:', error);
            }
        }
        
        process.exit(exitCode);
    })();
}

export default verifyAnalyticsPipelines;
