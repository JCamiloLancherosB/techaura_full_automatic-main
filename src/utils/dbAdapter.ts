/**
 * Database Adapter
 * Safe wrapper for database operations with existence checks and error handling
 */

import { unifiedLogger } from './unifiedLogger';

/**
 * Safe database adapter that checks method existence before calling
 */
export class DatabaseAdapter {
    constructor(private db: any) {}

    /**
     * Safely call a database method with error handling
     */
    private async safeCall<T>(
        methodName: string,
        fallback: T,
        ...args: any[]
    ): Promise<T> {
        try {
            // Check if method exists
            if (!this.db || typeof this.db[methodName] !== 'function') {
                unifiedLogger.warn('database', `Method ${methodName} does not exist on database`, {
                    available: this.db ? Object.keys(this.db).filter(k => typeof this.db[k] === 'function') : []
                });
                return fallback;
            }

            // Call the method
            const result = await this.db[methodName](...args);
            return result !== undefined ? result : fallback;
        } catch (error) {
            unifiedLogger.error('database', `Error calling ${methodName}`, {
                error: error instanceof Error ? error.message : String(error),
                args: args.length > 0 ? args[0] : undefined
            });
            return fallback;
        }
    }

    /**
     * Check database connection
     */
    async checkConnection(): Promise<boolean> {
        return this.safeCall('checkConnection', false);
    }

    /**
     * Get user session
     */
    async getUserSession(phone: string): Promise<any | null> {
        return this.safeCall('getUserSession', null, phone);
    }

    /**
     * Update user session
     */
    async updateUserSession(phone: string, data: any): Promise<boolean> {
        return this.safeCall('updateUserSession', false, phone, data);
    }

    /**
     * Get user analytics
     */
    async getUserAnalytics(phone: string): Promise<any | null> {
        return this.safeCall('getUserAnalytics', null, phone);
    }

    /**
     * Get user orders
     */
    async getUserOrders(phone: string): Promise<any[]> {
        return this.safeCall('getUserOrders', [], phone);
    }

    /**
     * Log message
     */
    async logMessage(data: any): Promise<boolean> {
        return this.safeCall('logMessage', false, data);
    }

    /**
     * Log error
     */
    async logError(data: any): Promise<boolean> {
        return this.safeCall('logError', false, data);
    }

    /**
     * Log flow transition
     */
    async logFlowTransition(data: any): Promise<boolean> {
        return this.safeCall('logFlowTransition', false, data);
    }

    /**
     * Get all users with pagination
     */
    async getAllUsers(limit = 100, offset = 0): Promise<any[]> {
        return this.safeCall('getAllUsers', [], limit, offset);
    }

    /**
     * Save order
     */
    async saveOrder(order: any): Promise<boolean> {
        return this.safeCall('saveOrder', false, order);
    }

    /**
     * Get order by ID
     */
    async getOrder(orderId: string): Promise<any | null> {
        return this.safeCall('getOrder', null, orderId);
    }

    /**
     * Update order status
     */
    async updateOrderStatus(orderId: string, status: string): Promise<boolean> {
        return this.safeCall('updateOrderStatus', false, orderId, status);
    }

    /**
     * Get statistics
     */
    async getStats(): Promise<any> {
        return this.safeCall('getStats', {
            totalUsers: 0,
            totalOrders: 0,
            totalRevenue: 0,
            activeUsers: 0
        });
    }

    /**
     * Execute raw query (if supported)
     */
    async query(sql: string, params?: any[]): Promise<any[]> {
        return this.safeCall('query', [], sql, params);
    }

    /**
     * Check if a method exists on the database
     */
    hasMethod(methodName: string): boolean {
        return this.db && typeof this.db[methodName] === 'function';
    }

    /**
     * Get list of available methods
     */
    getAvailableMethods(): string[] {
        if (!this.db) return [];
        return Object.keys(this.db).filter(key => typeof this.db[key] === 'function');
    }

    /**
     * Get the underlying database instance (use with caution)
     */
    getUnsafeDb(): any {
        return this.db;
    }
}

/**
 * Create a safe database adapter
 */
export function createDatabaseAdapter(db: any): DatabaseAdapter {
    return new DatabaseAdapter(db);
}
