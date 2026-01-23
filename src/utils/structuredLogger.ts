/**
 * Structured Logger using Pino
 * Provides structured logging with correlation IDs, child loggers, and standardized fields
 */

const pino = require('pino');
import { hashPhone } from './phoneHasher';
import { redactPIIFromObject } from './piiRedactor';

// Define log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Define log categories
export type LogCategory = 
    | 'system' 
    | 'chatbot' 
    | 'database' 
    | 'ai' 
    | 'whatsapp' 
    | 'api' 
    | 'flow' 
    | 'notificador' 
    | 'order-events'
    | 'processing-jobs'
    | 'message_telemetry'
    | 'processing_timeout'
    | 'processing_timeout_recovery'
    | 'processing_state'
    | 'processing_cleanup'
    | 'message_outside_hours'
    | 'stuck_processing_detected'
    | 'already_processing'
    | 'deduplication'
    | 'dedup_skipped';

// Structured log fields interface
export interface StructuredLogFields {
    level: LogLevel;
    category: LogCategory;
    phone_hash?: string;
    order_id?: string;
    flow?: string;
    event?: string;
    correlation_id?: string;
    [key: string]: any; // Allow additional fields
}

/**
 * Structured Logger Class
 * Wraps pino logger with domain-specific functionality
 */
export class StructuredLogger {
    private logger: pino.Logger;
    private correlationId?: string;

    constructor(options?: pino.LoggerOptions) {
        // Configure pino with pretty printing in development
        const isDevelopment = process.env.NODE_ENV !== 'production';
        
        this.logger = pino({
            level: process.env.LOG_LEVEL || 'info',
            formatters: {
                level: (label) => {
                    return { level: label };
                },
                bindings: (bindings) => {
                    return {
                        pid: bindings.pid,
                        hostname: bindings.hostname,
                    };
                },
            },
            timestamp: pino.stdTimeFunctions.isoTime,
            ...(isDevelopment && {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                    },
                },
            }),
            ...options,
        });
    }

    /**
     * Set correlation ID for this logger instance
     */
    setCorrelationId(correlationId: string): void {
        this.correlationId = correlationId;
    }

    /**
     * Clear correlation ID
     */
    clearCorrelationId(): void {
        this.correlationId = undefined;
    }

    /**
     * Get current correlation ID
     */
    getCorrelationId(): string | undefined {
        return this.correlationId;
    }

    /**
     * Create a child logger with additional context
     */
    child(bindings: pino.Bindings): StructuredLogger {
        const childLogger = new StructuredLogger();
        childLogger.logger = this.logger.child(bindings);
        childLogger.correlationId = this.correlationId;
        return childLogger;
    }

    /**
     * Create a child logger with correlation ID and structured fields
     */
    childWithContext(fields: Partial<StructuredLogFields>): StructuredLogger {
        const bindings: pino.Bindings = {
            ...fields,
            correlation_id: fields.correlation_id || this.correlationId,
            // Note: phone_hash should already be hashed by caller if provided
            // If raw phone is provided, it should be hashed before calling this method
        };
        
        return this.child(bindings);
    }

    /**
     * Build log fields with defaults and PII redaction
     */
    private buildFields(
        category: LogCategory,
        message: string,
        fields?: Partial<StructuredLogFields>
    ): any {
        const baseFields = {
            category,
            message,
            correlation_id: fields?.correlation_id || this.correlationId,
            phone_hash: fields?.phone_hash,
            order_id: fields?.order_id,
            flow: fields?.flow,
            event: fields?.event,
            ...fields,
        };
        
        // Automatically redact PII from all log fields
        return redactPIIFromObject(baseFields);
    }

    /**
     * Log at debug level
     */
    debug(category: LogCategory, message: string, fields?: Partial<StructuredLogFields>): void {
        this.logger.debug(this.buildFields(category, message, fields));
    }

    /**
     * Log at info level
     */
    info(category: LogCategory, message: string, fields?: Partial<StructuredLogFields>): void {
        this.logger.info(this.buildFields(category, message, fields));
    }

    /**
     * Log at warn level
     */
    warn(category: LogCategory, message: string, fields?: Partial<StructuredLogFields>): void {
        this.logger.warn(this.buildFields(category, message, fields));
    }

    /**
     * Log at error level
     */
    error(category: LogCategory, message: string, fields?: Partial<StructuredLogFields>): void {
        const errorFields = { ...fields };
        
        // Extract error details if present
        if (fields?.error && typeof fields.error === 'object') {
            errorFields.error_message = (fields.error as any).message;
            errorFields.error_stack = (fields.error as any).stack;
            errorFields.error_name = (fields.error as any).name;
        }
        
        this.logger.error(this.buildFields(category, message, errorFields));
    }

    /**
     * Log at fatal level
     */
    fatal(category: LogCategory, message: string, fields?: Partial<StructuredLogFields>): void {
        this.logger.fatal(this.buildFields(category, message, fields));
    }

    /**
     * Log with phone number (automatically hashed)
     */
    logWithPhone(
        level: LogLevel,
        category: LogCategory,
        message: string,
        phone: string,
        fields?: Partial<StructuredLogFields>
    ): void {
        const logFields = {
            ...fields,
            phone_hash: hashPhone(phone),
        };
        
        this[level](category, message, logFields);
    }

    /**
     * Log order event
     */
    logOrderEvent(
        level: LogLevel,
        event: string,
        orderId: string,
        phone: string,
        fields?: Partial<StructuredLogFields>
    ): void {
        const logFields = {
            ...fields,
            event,
            order_id: orderId,
            phone_hash: hashPhone(phone),
        };
        
        this[level]('order-events', event, logFields);
    }

    /**
     * Log processing job event
     */
    logJobEvent(
        level: LogLevel,
        event: string,
        jobId: number,
        fields?: Partial<StructuredLogFields>
    ): void {
        const logFields = {
            ...fields,
            event,
            job_id: jobId,
        };
        
        this[level]('processing-jobs', event, logFields);
    }

    /**
     * Log flow event
     */
    logFlowEvent(
        level: LogLevel,
        flowName: string,
        event: string,
        phone: string,
        fields?: Partial<StructuredLogFields>
    ): void {
        const logFields = {
            ...fields,
            flow: flowName,
            event,
            phone_hash: hashPhone(phone),
        };
        
        this[level]('flow', event, logFields);
    }

    /**
     * Get the underlying pino logger (for advanced use cases)
     */
    getUnderlyingLogger(): pino.Logger {
        return this.logger;
    }
}

// Export singleton instance
export const structuredLogger = new StructuredLogger();

// Export factory function for creating new instances
export function createLogger(options?: pino.LoggerOptions): StructuredLogger {
    return new StructuredLogger(options);
}
