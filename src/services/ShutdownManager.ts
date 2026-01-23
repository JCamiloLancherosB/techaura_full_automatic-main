/**
 * ShutdownManager Service
 * 
 * Coordinates graceful shutdown of the application to:
 * - Prevent jobs from being stuck in RUNNING state
 * - Ensure data is flushed to MySQL before exit
 * - Stop all background services and intervals
 * - Close database connections cleanly
 * 
 * Usage:
 *   const shutdownManager = new ShutdownManager(businessDB, pool);
 *   shutdownManager.registerService('followUp', { stop: () => clearInterval(interval) });
 *   shutdownManager.registerInterval(intervalId);
 *   await shutdownManager.initiateShutdown('SIGINT');
 */

import { unifiedLogger } from '../utils/unifiedLogger';

export type SystemStatus = 'RUNNING' | 'SHUTTING_DOWN' | 'SHUTDOWN_COMPLETE';

interface ShutdownService {
  stop: () => void | Promise<void>;
}

interface ShutdownState {
  status: SystemStatus;
  shutdownStartTime: number | null;
  services: Map<string, ShutdownService>;
  intervals: Set<NodeJS.Timeout>;
  stopToken: { stopped: boolean };
}

export class ShutdownManager {
  private state: ShutdownState;
  private businessDB: any;
  private pool: any;
  private shutdownTimeout: number;
  private isShuttingDown: boolean = false;

  constructor(
    businessDB: any,
    pool: any,
    shutdownTimeoutSeconds: number = 25
  ) {
    this.businessDB = businessDB;
    this.pool = pool;
    this.shutdownTimeout = shutdownTimeoutSeconds * 1000;
    
    this.state = {
      status: 'RUNNING',
      shutdownStartTime: null,
      services: new Map(),
      intervals: new Set(),
      stopToken: { stopped: false }
    };

    unifiedLogger.info('shutdown', 'ShutdownManager initialized', {
      timeoutSeconds: shutdownTimeoutSeconds
    });
  }

  /**
   * Get current system status
   */
  getStatus(): SystemStatus {
    return this.state.status;
  }

  /**
   * Get stop token for workers to check
   */
  getStopToken(): { stopped: boolean } {
    return this.state.stopToken;
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Register a service that needs cleanup on shutdown
   * @param name - Service name for logging
   * @param service - Object with stop() method
   */
  registerService(name: string, service: ShutdownService): void {
    this.state.services.set(name, service);
    unifiedLogger.debug('shutdown', `Registered service: ${name}`);
  }

  /**
   * Register an interval that needs to be cleared on shutdown
   * @param interval - NodeJS.Timeout from setInterval
   */
  registerInterval(interval: NodeJS.Timeout): void {
    this.state.intervals.add(interval);
  }

  /**
   * Initiate graceful shutdown sequence
   * @param signal - Signal that triggered shutdown (e.g., 'SIGINT', 'SIGTERM')
   */
  async initiateShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      unifiedLogger.warn('shutdown', 'Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    this.isShuttingDown = true;
    this.state.status = 'SHUTTING_DOWN';
    this.state.shutdownStartTime = Date.now();
    this.state.stopToken.stopped = true;

    console.log(`\n🛑 Recibida señal ${signal}, iniciando shutdown graceful...`);
    unifiedLogger.info('shutdown', 'Graceful shutdown initiated', { signal });

    try {
      // Set up timeout to force exit if shutdown takes too long
      const forceExitTimeout = setTimeout(() => {
        console.error('⚠️ Shutdown timeout reached, forcing exit');
        unifiedLogger.error('shutdown', 'Shutdown timeout, forcing exit');
        process.exit(1);
      }, this.shutdownTimeout);

      // 1. Mark any running jobs as failed/interrupted
      await this.markRunningJobsAsInterrupted();

      // 2. Stop all registered services
      await this.stopAllServices();

      // 3. Clear all registered intervals
      this.clearAllIntervals();

      // 4. Wait for in-flight tasks (with timeout)
      await this.waitForInFlightTasks();

      // 5. Close database connections
      await this.closeDatabaseConnections();

      // 6. Mark shutdown as complete
      this.state.status = 'SHUTDOWN_COMPLETE';
      clearTimeout(forceExitTimeout);

      const shutdownDuration = Date.now() - (this.state.shutdownStartTime || 0);
      console.log(`✅ Aplicación cerrada correctamente en ${shutdownDuration}ms`);
      unifiedLogger.info('shutdown', 'Graceful shutdown completed', {
        durationMs: shutdownDuration
      });

      // Give logs time to flush
      setTimeout(() => {
        process.exit(0);
      }, 500);

    } catch (error) {
      console.error('❌ Error durante shutdown graceful:', error);
      unifiedLogger.error('shutdown', 'Shutdown error', { error });
      process.exit(1);
    }
  }

  /**
   * Mark any jobs in RUNNING state as interrupted
   */
  private async markRunningJobsAsInterrupted(): Promise<void> {
    try {
      if (!this.pool) {
        return;
      }

      unifiedLogger.info('shutdown', 'Marking running jobs as interrupted');

      // Find all jobs in processing states
      const [runningJobs] = await this.pool.execute(
        `SELECT id, job_id, order_id, status 
         FROM processing_jobs 
         WHERE status IN ('processing', 'writing', 'verifying')
         LIMIT 100`
      ) as any;

      if (Array.isArray(runningJobs) && runningJobs.length > 0) {
        console.log(`⚠️ Encontrados ${runningJobs.length} jobs en ejecución, marcándolos como interrumpidos`);
        
        // Update status to failed with reason
        await this.pool.execute(
          `UPDATE processing_jobs 
           SET status = 'failed', 
               fail_reason = 'Interrupted by shutdown', 
               finished_at = NOW() 
           WHERE status IN ('processing', 'writing', 'verifying')`
        );

        unifiedLogger.info('shutdown', 'Marked running jobs as interrupted', {
          count: runningJobs.length,
          jobIds: runningJobs.map((j: any) => j.job_id)
        });
      } else {
        console.log('✅ No hay jobs en ejecución');
      }
    } catch (error) {
      console.error('❌ Error marcando jobs como interrumpidos:', error);
      unifiedLogger.error('shutdown', 'Failed to mark running jobs', { error });
    }
  }

  /**
   * Stop all registered services
   */
  private async stopAllServices(): Promise<void> {
    unifiedLogger.info('shutdown', 'Stopping all registered services', {
      count: this.state.services.size
    });

    for (const [name, service] of this.state.services.entries()) {
      try {
        console.log(`🛑 Deteniendo servicio: ${name}`);
        const result = service.stop();
        if (result instanceof Promise) {
          await result;
        }
        console.log(`✅ Servicio detenido: ${name}`);
      } catch (error) {
        console.error(`❌ Error deteniendo servicio ${name}:`, error);
        unifiedLogger.error('shutdown', `Failed to stop service: ${name}`, { error });
      }
    }
  }

  /**
   * Clear all registered intervals
   */
  private clearAllIntervals(): void {
    unifiedLogger.info('shutdown', 'Clearing all registered intervals', {
      count: this.state.intervals.size
    });

    for (const interval of this.state.intervals) {
      try {
        clearInterval(interval);
      } catch (error) {
        console.error('❌ Error clearing interval:', error);
      }
    }

    console.log(`✅ ${this.state.intervals.size} intervalos detenidos`);
    this.state.intervals.clear();
  }

  /**
   * Wait for in-flight tasks to complete (with timeout)
   */
  private async waitForInFlightTasks(): Promise<void> {
    const maxWaitTime = 5000; // 5 seconds
    const checkInterval = 500; // Check every 500ms
    const startTime = Date.now();

    console.log('⏳ Esperando que las tareas en curso terminen...');

    while (Date.now() - startTime < maxWaitTime) {
      try {
        if (!this.pool) {
          break;
        }

        const [activeJobs] = await this.pool.execute(
          `SELECT COUNT(*) as count 
           FROM processing_jobs 
           WHERE status IN ('processing', 'writing', 'verifying')`
        ) as any;

        const count = activeJobs?.[0]?.count || 0;
        
        if (count === 0) {
          console.log('✅ Todas las tareas en curso han terminado');
          break;
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      } catch (error) {
        console.error('❌ Error verificando tareas en curso:', error);
        break;
      }
    }

    const elapsed = Date.now() - startTime;
    unifiedLogger.info('shutdown', 'In-flight tasks wait completed', {
      elapsedMs: elapsed
    });
  }

  /**
   * Close all database connections
   */
  private async closeDatabaseConnections(): Promise<void> {
    console.log('🔌 Cerrando conexiones de base de datos...');
    
    try {
      // Close businessDB (MysqlAdapter)
      if (this.businessDB && typeof this.businessDB.close === 'function') {
        await this.businessDB.close();
        console.log('✅ BusinessDB cerrado');
      }

      // Close raw connection pool
      if (this.pool && typeof this.pool.end === 'function') {
        await this.pool.end();
        console.log('✅ Connection pool cerrado');
      }

      unifiedLogger.info('shutdown', 'Database connections closed');
    } catch (error) {
      console.error('❌ Error cerrando conexiones:', error);
      unifiedLogger.error('shutdown', 'Failed to close database connections', { error });
      throw error;
    }
  }

  /**
   * Get shutdown statistics
   */
  getStats(): any {
    return {
      status: this.state.status,
      shutdownStartTime: this.state.shutdownStartTime,
      registeredServices: Array.from(this.state.services.keys()),
      registeredIntervals: this.state.intervals.size,
      stopTokenStopped: this.state.stopToken.stopped
    };
  }
}

// Export singleton for easy access
let shutdownManagerInstance: ShutdownManager | null = null;

export function initShutdownManager(
  businessDB: any,
  pool: any,
  timeoutSeconds?: number
): ShutdownManager {
  if (shutdownManagerInstance) {
    unifiedLogger.warn('shutdown', 'ShutdownManager already initialized, returning existing instance');
    return shutdownManagerInstance;
  }

  shutdownManagerInstance = new ShutdownManager(businessDB, pool, timeoutSeconds);
  return shutdownManagerInstance;
}

export function getShutdownManager(): ShutdownManager {
  if (!shutdownManagerInstance) {
    throw new Error('ShutdownManager not initialized. Call initShutdownManager() first.');
  }
  return shutdownManagerInstance;
}
