/**
 * Correlation ID Manager
 * Manages correlation IDs for tracking requests/flows through the system
 * Uses AsyncLocalStorage to maintain context across async operations
 */

import { AsyncLocalStorage } from 'async_hooks';
import { generateCorrelationId } from '../utils/correlationId';
import { structuredLogger } from '../utils/structuredLogger';

interface CorrelationContext {
    correlationId: string;
    sessionId: string;
    phone?: string;
    orderId?: string;
    jobId?: number;
    flow?: string;
}

/**
 * Correlation ID Manager using AsyncLocalStorage
 * Maintains correlation context across async operations
 */
class CorrelationIdManager {
    private asyncLocalStorage: AsyncLocalStorage<CorrelationContext>;

    constructor() {
        this.asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();
    }

    /**
     * Run a function with a new correlation context
     */
    run<T>(
        sessionId: string,
        callback: () => T,
        initialContext?: Partial<CorrelationContext>
    ): T {
        const correlationId = generateCorrelationId(sessionId);
        const context: CorrelationContext = {
            correlationId,
            sessionId,
            ...initialContext,
        };

        return this.asyncLocalStorage.run(context, callback);
    }

    /**
     * Get the current correlation context
     */
    getContext(): CorrelationContext | undefined {
        return this.asyncLocalStorage.getStore();
    }

    /**
     * Get the current correlation ID
     */
    getCorrelationId(): string | undefined {
        const context = this.getContext();
        return context?.correlationId;
    }

    /**
     * Get the current session ID
     */
    getSessionId(): string | undefined {
        const context = this.getContext();
        return context?.sessionId;
    }

    /**
     * Update the current context
     */
    updateContext(update: Partial<CorrelationContext>): void {
        const context = this.getContext();
        if (context) {
            Object.assign(context, update);
        }
    }

    /**
     * Create a child logger with the current correlation context
     */
    getLogger() {
        const context = this.getContext();
        if (!context) {
            return structuredLogger;
        }

        return structuredLogger.childWithContext({
            correlation_id: context.correlationId,
            phone_hash: context.phone,
            order_id: context.orderId,
            flow: context.flow,
        });
    }

    /**
     * Execute a function with correlation tracking
     * Logs entry/exit and errors automatically
     */
    async withCorrelation<T>(
        sessionId: string,
        operation: string,
        callback: () => Promise<T>,
        context?: Partial<CorrelationContext>
    ): Promise<T> {
        return this.run(sessionId, async () => {
            const correlationId = this.getCorrelationId();
            const logger = this.getLogger();

            logger.info('flow', `Starting operation: ${operation}`, {
                correlation_id: correlationId,
                operation,
            });

            try {
                const result = await callback();
                
                logger.info('flow', `Completed operation: ${operation}`, {
                    correlation_id: correlationId,
                    operation,
                });

                return result;
            } catch (error) {
                logger.error('flow', `Error in operation: ${operation}`, {
                    correlation_id: correlationId,
                    operation,
                    error,
                });
                throw error;
            }
        });
    }
}

// Export singleton instance
export const correlationIdManager = new CorrelationIdManager();

// Export convenience functions
export function getCorrelationId(): string | undefined {
    return correlationIdManager.getCorrelationId();
}

export function getCorrelationContext(): CorrelationContext | undefined {
    return correlationIdManager.getContext();
}

export function updateCorrelationContext(update: Partial<CorrelationContext>): void {
    correlationIdManager.updateContext(update);
}

export function getContextualLogger() {
    return correlationIdManager.getLogger();
}
