/**
 * StartupReconciler Service
 * 
 * Ensures the bot is "up-to-date" when restarting after being down.
 * Executes reconciliation tasks in order:
 * 1. Repair leases/jobs (free expired leases, requeue orphaned jobs)
 * 2. Rehydrate derived queues (follow-up queue, pending orders)
 * 3. Update metrics/statistics (verify fresh data from MySQL)
 */

import { processingJobRepository } from '../repositories/ProcessingJobRepository';
import { orderRepository } from '../repositories/OrderRepository';
import { pool } from '../mysql-database';
import { logger } from '../utils/logger';
import { unifiedLogger } from '../utils/unifiedLogger';

interface ReconciliationResult {
    success: boolean;
    timestamp: Date;
    leasesRepaired: number;
    jobsRequeued: number;
    followUpCandidates: number;
    pendingOrders: number;
    errors: string[];
}

export class StartupReconciler {
    private static instance: StartupReconciler;
    private static readonly REQUIRED_COLUMNS = [
        { table: 'processing_jobs', column: 'locked_until' },
        { table: 'user_sessions', column: 'contact_status' }
    ] as const;
    private lastReconciliation: ReconciliationResult | null = null;
    private schemaChecked: boolean = false;
    private schemaAvailable: boolean = true;
    private schemaWarningLogged: boolean = false;

    private constructor() {}

    public static getInstance(): StartupReconciler {
        if (!StartupReconciler.instance) {
            StartupReconciler.instance = new StartupReconciler();
        }
        return StartupReconciler.instance;
    }

    /**
     * Main reconciliation function - runs all reconciliation tasks
     */
    public async reconcile(): Promise<ReconciliationResult> {
        const startTime = Date.now();
        console.log('🔄 Starting startup reconciliation...');

        if (!(await this.ensureSchemaAvailable())) {
            const disabledResult: ReconciliationResult = {
                success: false,
                timestamp: new Date(),
                leasesRepaired: 0,
                jobsRequeued: 0,
                followUpCandidates: 0,
                pendingOrders: 0,
                errors: ['StartupReconciler disabled until migrations applied']
            };
            this.lastReconciliation = disabledResult;
            return disabledResult;
        }
        
        const result: ReconciliationResult = {
            success: true,
            timestamp: new Date(),
            leasesRepaired: 0,
            jobsRequeued: 0,
            followUpCandidates: 0,
            pendingOrders: 0,
            errors: []
        };

        try {
            // Step 1: Repair leases and jobs
            console.log('📦 Step 1: Repairing leases and jobs...');
            const leaseResult = await this.repairLeasesAndJobs();
            result.leasesRepaired = leaseResult.leasesRepaired;
            result.jobsRequeued = leaseResult.jobsRequeued;
            if (leaseResult.error) {
                result.errors.push(leaseResult.error);
            }

            // Step 2: Rehydrate derived queues
            console.log('📋 Step 2: Rehydrating derived queues...');
            const queueResult = await this.rehydrateQueues();
            result.followUpCandidates = queueResult.followUpCandidates;
            result.pendingOrders = queueResult.pendingOrders;
            if (queueResult.error) {
                result.errors.push(queueResult.error);
            }

            // Step 3: Update metrics (verify fresh data)
            console.log('📊 Step 3: Verifying metrics...');
            const metricsResult = await this.verifyMetrics();
            if (metricsResult.error) {
                result.errors.push(metricsResult.error);
            }

            const duration = Date.now() - startTime;
            console.log(`✅ Startup reconciliation completed in ${duration}ms`);
            console.log(`   - Leases repaired: ${result.leasesRepaired}`);
            console.log(`   - Jobs requeued: ${result.jobsRequeued}`);
            console.log(`   - Follow-up candidates: ${result.followUpCandidates}`);
            console.log(`   - Pending orders: ${result.pendingOrders}`);
            
            if (result.errors.length > 0) {
                console.warn(`⚠️  Reconciliation completed with ${result.errors.length} errors`);
                result.success = false;
            }

            this.lastReconciliation = result;
            
            // Log to database
            await this.logReconciliation(result, duration);

        } catch (error) {
            result.success = false;
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Critical error: ${errorMsg}`);
            console.error('❌ Critical error during startup reconciliation:', error);
            
            this.lastReconciliation = result;
        }

        return result;
    }

    private async ensureSchemaAvailable(): Promise<boolean> {
        if (this.schemaChecked) {
            return this.schemaAvailable;
        }

        this.schemaChecked = true;

        try {
            const [columns] = await pool.execute<any[]>(
                `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() 
                   AND TABLE_NAME IN (?, ?)
                   AND COLUMN_NAME IN (?, ?)`,
                [
                    StartupReconciler.REQUIRED_COLUMNS[0].table,
                    StartupReconciler.REQUIRED_COLUMNS[1].table,
                    StartupReconciler.REQUIRED_COLUMNS[0].column,
                    StartupReconciler.REQUIRED_COLUMNS[1].column
                ]
            );
            const found = new Set((columns || []).map((row: any) => `${row.TABLE_NAME}:${row.COLUMN_NAME}`));
            this.schemaAvailable = StartupReconciler.REQUIRED_COLUMNS.every(
                (required) => found.has(`${required.table}:${required.column}`)
            );
        } catch (error) {
            this.schemaAvailable = false;
        }

        if (!this.schemaAvailable && !this.schemaWarningLogged) {
            unifiedLogger.warn('system', 'StartupReconciler disabled until migrations applied', {
                missingColumns: StartupReconciler.REQUIRED_COLUMNS.map((entry) => entry.column)
            });
            this.schemaWarningLogged = true;
        }

        return this.schemaAvailable;
    }

    /**
     * Step 1: Repair leases and jobs
     * - Free expired leases
     * - Requeue orphaned RUNNING jobs
     */
    private async repairLeasesAndJobs(): Promise<{
        leasesRepaired: number;
        jobsRequeued: number;
        error?: string;
    }> {
        try {
            // Use the existing resetExpiredLeases method from ProcessingJobRepository
            const leasesRepaired = await processingJobRepository.resetExpiredLeases();
            
            // Requeue orphaned jobs - jobs that are in 'processing' status but have no lease
            // These are jobs that may have been interrupted without proper lease cleanup
            const [orphanedJobs] = await pool.execute(
                `SELECT id, order_id FROM processing_jobs 
                 WHERE status = 'processing' 
                 AND locked_by IS NULL 
                 AND locked_until IS NULL`
            ) as any;
            
            let jobsRequeued = 0;
            for (const job of orphanedJobs) {
                // Check if we should retry or mark as failed based on attempts
                const [jobDetails] = await pool.execute(
                    'SELECT attempts FROM processing_jobs WHERE id = ?',
                    [job.id]
                ) as any;
                
                const attempts = jobDetails[0]?.attempts || 0;
                const newStatus = attempts >= 3 ? 'failed' : 'retry';
                const mappedStatus = newStatus === 'retry' ? 'queued' : 'failed';
                
                await pool.execute(
                    `UPDATE processing_jobs 
                     SET status = ?, 
                         last_error = CONCAT(
                             COALESCE(last_error, ''),
                             IF(last_error IS NOT NULL, '; ', ''),
                             'Orphaned job recovered on startup'
                         ),
                         finished_at = IF(? = 'failed', NOW(), finished_at),
                         updated_at = NOW()
                     WHERE id = ?`,
                    [mappedStatus, newStatus, job.id]
                );
                
                jobsRequeued++;
                logger.info('reconciliation', `Requeued orphaned job ${job.id} (order: ${job.order_id}) with status ${newStatus}`);
            }
            
            console.log(`   ✓ Repaired ${leasesRepaired} expired leases`);
            console.log(`   ✓ Requeued ${jobsRequeued} orphaned jobs`);
            
            return { leasesRepaired, jobsRequeued };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('❌ Error repairing leases/jobs:', error);
            return { 
                leasesRepaired: 0, 
                jobsRequeued: 0, 
                error: `Lease repair failed: ${errorMsg}` 
            };
        }
    }

    /**
     * Step 2: Rehydrate derived queues
     * - Rebuild follow-up queue from user_sessions
     * - Rebuild pending orders queue from orders.status
     */
    private async rehydrateQueues(): Promise<{
        followUpCandidates: number;
        pendingOrders: number;
        error?: string;
    }> {
        try {
            // Rebuild follow-up queue: Find users eligible for follow-ups
            // Criteria:
            // - contact_status = 'ACTIVE'
            // - cooldown_until IS NULL OR cooldown_until < NOW()
            // - follow_up_attempts < 3
            // - last_activity within reasonable time (not stale)
            const [followUpCandidates] = await pool.execute(
                `SELECT COUNT(*) as count 
                 FROM user_sessions 
                 WHERE contact_status = 'ACTIVE'
                 AND (cooldown_until IS NULL OR cooldown_until < NOW())
                 AND follow_up_attempts < 3
                 AND last_activity >= DATE_SUB(NOW(), INTERVAL 365 DAY)`
            ) as any;
            
            const followUpCount = followUpCandidates[0]?.count || 0;
            console.log(`   ✓ Found ${followUpCount} follow-up candidates`);
            
            // Rebuild pending orders queue: Count orders awaiting processing
            // Use processing_status field which exists in schema
            const ordersStats = await orderRepository.getStats();
            const pendingCount = ordersStats.pending + ordersStats.processing;
            
            console.log(`   ✓ Found ${pendingCount} pending orders (${ordersStats.pending} pending, ${ordersStats.processing} processing)`);
            
            // Clear any stale cooldowns (cooldowns that expired while bot was down)
            const [clearedCooldowns] = await pool.execute(
                `UPDATE user_sessions 
                 SET cooldown_until = NULL,
                     follow_up_attempts = 0
                 WHERE cooldown_until < NOW() 
                 AND cooldown_until IS NOT NULL`
            ) as any;
            
            if (clearedCooldowns.affectedRows > 0) {
                console.log(`   ✓ Cleared ${clearedCooldowns.affectedRows} expired cooldowns`);
            }
            
            return { 
                followUpCandidates: followUpCount, 
                pendingOrders: pendingCount 
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('❌ Error rehydrating queues:', error);
            return { 
                followUpCandidates: 0, 
                pendingOrders: 0, 
                error: `Queue rehydration failed: ${errorMsg}` 
            };
        }
    }

    /**
     * Step 3: Verify metrics
     * Ensure metrics endpoints query fresh data from MySQL (not stale cache)
     */
    private async verifyMetrics(): Promise<{ error?: string }> {
        try {
            // Verify processing jobs statistics
            const jobStats = await processingJobRepository.getStatistics();
            console.log(`   ✓ Job statistics: ${jobStats.total} total, ${JSON.stringify(jobStats.by_status)}`);
            
            // Verify orders statistics
            const orderStats = await orderRepository.getStats();
            console.log(`   ✓ Order statistics: ${orderStats.total} total, ${orderStats.completed} completed, revenue: ${orderStats.totalRevenue}`);
            
            // Verify database connection
            const [healthCheck] = await pool.execute('SELECT 1 as health') as any;
            if (healthCheck[0]?.health !== 1) {
                throw new Error('Database health check failed');
            }
            console.log('   ✓ Database connection healthy');
            
            return {};
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('❌ Error verifying metrics:', error);
            return { error: `Metrics verification failed: ${errorMsg}` };
        }
    }

    /**
     * Log reconciliation results to database for audit trail
     */
    private async logReconciliation(result: ReconciliationResult, durationMs: number): Promise<void> {
        try {
            // Log to processing_job_logs table (job_id=0 for system-level logs)
            await pool.execute(
                `INSERT INTO processing_job_logs 
                 (job_id, level, category, message, details, created_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [
                    0, // job_id 0 indicates system-level log
                    result.success ? 'info' : 'warning',
                    'startup_reconciliation',
                    `Startup reconciliation ${result.success ? 'completed' : 'completed with errors'}`,
                    JSON.stringify({
                        duration_ms: durationMs,
                        leases_repaired: result.leasesRepaired,
                        jobs_requeued: result.jobsRequeued,
                        followup_candidates: result.followUpCandidates,
                        pending_orders: result.pendingOrders,
                        errors: result.errors
                    })
                ]
            );
        } catch (error) {
            // Don't fail reconciliation if logging fails
            console.warn('⚠️  Failed to log reconciliation to database:', error);
        }
    }

    /**
     * Get last reconciliation result
     */
    public getLastReconciliation(): ReconciliationResult | null {
        return this.lastReconciliation;
    }
}

// Export singleton instance
export const startupReconciler = StartupReconciler.getInstance();
