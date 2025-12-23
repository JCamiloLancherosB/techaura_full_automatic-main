/**
 * Unified Logger System
 * Centralized logging with levels, categories, and correlation IDs
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'system' | 'chatbot' | 'database' | 'ai' | 'whatsapp' | 'api' | 'flow';

interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    category: LogCategory;
    message: string;
    correlationId?: string;
    metadata?: any;
}

class UnifiedLogger {
    private static instance: UnifiedLogger;
    private correlationId: string | null = null;
    private logHistory: LogEntry[] = [];
    private maxHistorySize = 1000;

    private constructor() {}

    static getInstance(): UnifiedLogger {
        if (!UnifiedLogger.instance) {
            UnifiedLogger.instance = new UnifiedLogger();
        }
        return UnifiedLogger.instance;
    }

    /**
     * Set correlation ID for tracking related logs
     */
    setCorrelationId(id: string): void {
        this.correlationId = id;
    }

    /**
     * Clear correlation ID
     */
    clearCorrelationId(): void {
        this.correlationId = null;
    }

    /**
     * Main logging method
     */
    private log(level: LogLevel, category: LogCategory, message: string, metadata?: any): void {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            category,
            message,
            correlationId: this.correlationId || undefined,
            metadata
        };

        // Store in history
        this.logHistory.push(entry);
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift();
        }

        // Format and output to console
        this.outputToConsole(entry);
    }

    /**
     * Format and output log entry to console with colors
     */
    private outputToConsole(entry: LogEntry): void {
        const timestamp = entry.timestamp.toISOString();
        const levelColors: Record<LogLevel, string> = {
            debug: '\x1b[36m',  // Cyan
            info: '\x1b[32m',   // Green
            warn: '\x1b[33m',   // Yellow
            error: '\x1b[31m'   // Red
        };
        const categoryColors: Record<LogCategory, string> = {
            system: '\x1b[35m',    // Magenta
            chatbot: '\x1b[34m',   // Blue
            database: '\x1b[36m',  // Cyan
            ai: '\x1b[95m',        // Bright Magenta
            whatsapp: '\x1b[92m',  // Bright Green
            api: '\x1b[93m'        // Bright Yellow
        };
        const reset = '\x1b[0m';
        
        const levelColor = levelColors[entry.level] || '';
        const categoryColor = categoryColors[entry.category] || '';
        const levelStr = entry.level.toUpperCase().padEnd(5);
        const categoryStr = entry.category.padEnd(10);
        
        let logLine = `${levelColor}[${timestamp}] ${levelStr}${reset} ${categoryColor}[${categoryStr}]${reset} ${entry.message}`;
        
        if (entry.correlationId) {
            logLine += ` ${'\x1b[90m'}(${entry.correlationId})${reset}`;
        }
        
        console.log(logLine);
        
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            console.log(`  ${'\x1b[90m'}└─ Metadata:${reset}`, entry.metadata);
        }
    }

    /**
     * Convenience methods for each log level
     */
    debug(category: LogCategory, message: string, metadata?: any): void {
        this.log('debug', category, message, metadata);
    }

    info(category: LogCategory, message: string, metadata?: any): void {
        this.log('info', category, message, metadata);
    }

    warn(category: LogCategory, message: string, metadata?: any): void {
        this.log('warn', category, message, metadata);
    }

    error(category: LogCategory, message: string, metadata?: any): void {
        this.log('error', category, message, metadata);
    }

    /**
     * Get log history
     */
    getHistory(filter?: { level?: LogLevel; category?: LogCategory; correlationId?: string }): LogEntry[] {
        if (!filter) {
            return [...this.logHistory];
        }

        return this.logHistory.filter(entry => {
            if (filter.level && entry.level !== filter.level) return false;
            if (filter.category && entry.category !== filter.category) return false;
            if (filter.correlationId && entry.correlationId !== filter.correlationId) return false;
            return true;
        });
    }

    /**
     * Get statistics about logs
     */
    getStats(): {
        total: number;
        byLevel: Record<LogLevel, number>;
        byCategory: Record<LogCategory, number>;
        errorRate: number;
    } {
        const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
        const byCategory: Record<LogCategory, number> = {
            system: 0,
            chatbot: 0,
            database: 0,
            ai: 0,
            whatsapp: 0,
            api: 0
        };

        this.logHistory.forEach(entry => {
            byLevel[entry.level]++;
            byCategory[entry.category]++;
        });

        const errorRate = this.logHistory.length > 0
            ? (byLevel.error / this.logHistory.length) * 100
            : 0;

        return {
            total: this.logHistory.length,
            byLevel,
            byCategory,
            errorRate
        };
    }

    /**
     * Clear log history
     */
    clearHistory(): void {
        this.logHistory = [];
    }
}

// Export singleton instance
export const unifiedLogger = UnifiedLogger.getInstance();
