/**
 * Error Handler Middleware
 * Global error handling for Express routes
 */

import { unifiedLogger } from '../utils/unifiedLogger';

/**
 * Global error handler middleware
 * Should be added as the last middleware in the Express app
 */
export function globalErrorHandler(err: any, req: any, res: any, next: any): void {
    // Log the error
    unifiedLogger.error('api', 'Unhandled error in route', {
        method: req.method,
        path: req.path,
        error: err.message,
        stack: err.stack,
        body: req.body,
        query: req.query,
        params: req.params
    });

    // Determine status code
    const statusCode = err.statusCode || err.status || 500;

    // Send error response
    res.status(statusCode).json({
        success: false,
        error: {
            message: err.message || 'Internal server error',
            code: err.code || 'INTERNAL_ERROR',
            ...(process.env.NODE_ENV === 'development' && {
                stack: err.stack,
                details: err.details
            })
        }
    });
}

/**
 * 404 Not Found handler
 * Should be added before the global error handler
 */
export function notFoundHandler(req: any, res: any, next: any): void {
    unifiedLogger.warn('api', 'Route not found', {
        method: req.method,
        path: req.path,
        query: req.query
    });

    res.status(404).json({
        success: false,
        error: {
            message: `Route not found: ${req.method} ${req.path}`,
            code: 'NOT_FOUND'
        }
    });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
export function asyncHandler(fn: Function) {
    return (req: any, res: any, next: any) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Request logger middleware
 * Logs all incoming requests
 */
export function requestLogger(req: any, res: any, next: any): void {
    const start = Date.now();

    // Log request
    unifiedLogger.debug('api', `${req.method} ${req.path}`, {
        query: req.query,
        ip: req.ip || req.connection.remoteAddress
    });

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'debug';
        
        unifiedLogger[level]('api', `${req.method} ${req.path} - ${res.statusCode}`, {
            duration: `${duration}ms`,
            statusCode: res.statusCode
        });
    });

    next();
}

/**
 * Error class for application errors
 */
export class AppError extends Error {
    public statusCode: number;
    public code: string;
    public details?: any;

    constructor(message: string, statusCode = 500, code = 'APP_ERROR', details?: any) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}
