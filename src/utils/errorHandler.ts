import type { UserSession } from '../../types/global';

// ✅ SISTEMA COMPLETO DE VALIDACIÓN Y CONTROL DE ERRORES
export class ErrorHandler {
    private static instance: ErrorHandler;
    private errorLog: Map<string, any[]> = new Map();
    private criticalErrors: Set<string> = new Set();
    private systemHealth: {
        status: 'healthy' | 'degraded' | 'critical';
        lastCheck: Date;
        errorRate: number;
        uptime: number;
    } = {
        status: 'healthy',
        lastCheck: new Date(),
        errorRate: 0,
        uptime: Date.now()
    };

    static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    // ✅ MANEJO SEGURO DE ERRORES ASYNC/AWAIT [[0]](#__0)
    async safeAsyncOperation<T>(
        operation: () => Promise<T>,
        fallback: T,
        context: string
    ): Promise<T> {
        try {
            const result = await operation();
            this.recordSuccess(context);
            return result;
        } catch (error) {
            this.recordError(context, error);
            console.error(`❌ Error en ${context}:`, error);
            return fallback;
        }
    }

    // ✅ WRAPPER PARA OPERACIONES CRÍTICAS [[1]](#__1)
    async withRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        delay: number = 1000,
        context: string = 'unknown'
    ): Promise<T | null> {
        let lastError: any;
        const errors: any[] = [];
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 [${context}] Attempt ${attempt}/${maxRetries}`);
                const startTime = Date.now();
                
                const result = await operation();
                
                const duration = Date.now() - startTime;
                if (attempt > 1) {
                    console.log(`✅ [${context}] Operation succeeded on attempt ${attempt} (took ${duration}ms)`);
                } else {
                    console.log(`✅ [${context}] Operation succeeded on first attempt (took ${duration}ms)`);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                errors.push({
                    attempt,
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date()
                });
                
                // Categorize error
                const errorType = this.categorizeError(error);
                console.warn(`⚠️ [${context}] Attempt ${attempt}/${maxRetries} failed (${errorType}):`, 
                    error instanceof Error ? error.message : String(error)
                );
                
                if (attempt < maxRetries) {
                    const waitTime = delay * attempt; // Exponential backoff
                    console.log(`⏳ [${context}] Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }
        
        // All attempts failed - detailed logging
        this.recordCriticalError(context, lastError);
        console.error(`❌ [${context}] Operation failed after ${maxRetries} attempts`);
        console.error(`   Error history:`, errors);
        console.error(`   Final error:`, lastError);
        
        return null;
    }

    /**
     * Categorize error type for better diagnostics
     */
    private categorizeError(error: any): string {
        if (!error) return 'unknown';
        
        const errorMsg = error.message || String(error);
        
        if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
            return 'timeout';
        }
        if (errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
            return 'network';
        }
        if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
            return 'validation';
        }
        if (errorMsg.includes('permission') || errorMsg.includes('unauthorized')) {
            return 'permission';
        }
        if (error instanceof TypeError) {
            return 'type_error';
        }
        if (error instanceof RangeError) {
            return 'range_error';
        }
        
        return 'unknown';
    }

    // ✅ VALIDACIÓN DE TIPOS Y DATOS [[2]](#__2)
    validateUserSession(session: any): session is UserSession {
    if (!session || typeof session !== 'object') return false;
    if (!session.phone || typeof session.phone !== 'string') return false;
    if (!session.createdAt) return false; // ✅ SIMPLIFICAR VALIDACIÓN
    
    // ✅ VALIDACIONES ADICIONALES OPCIONALES
    if (session.interactions && !Array.isArray(session.interactions)) return false;
    if (session.interests && !Array.isArray(session.interests)) return false;
    if (session.buyingIntent && (typeof session.buyingIntent !== 'number' || session.buyingIntent < 0 || session.buyingIntent > 100)) return false;
    
    return true;
}

    // ✅ MANEJO DE ERRORES DE TYPESCRIPT [[3]](#__3)
    handleTypeScriptError(error: unknown, context: string): string {
        if (error instanceof Error) {
            return `${context}: ${error.message}`;
        }
        
        if (typeof error === 'string') {
            return `${context}: ${error}`;
        }
        
        if (error && typeof error === 'object' && 'message' in error) {
            return `${context}: ${String(error.message)}`;
        }
        
        return `${context}: Error desconocido`;
    }

    // ✅ REGISTRO Y MONITOREO DE ERRORES
    private recordError(context: string, error: any): void {
        const errorEntry = {
            timestamp: new Date(),
            context,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        };
        
        if (!this.errorLog.has(context)) {
            this.errorLog.set(context, []);
        }
        
        const contextErrors = this.errorLog.get(context)!;
        contextErrors.push(errorEntry);
        
        // ✅ MANTENER SOLO LOS ÚLTIMOS 100 ERRORES POR CONTEXTO
        if (contextErrors.length > 100) {
            contextErrors.splice(0, contextErrors.length - 100);
        }
        
        this.updateSystemHealth();
    }

    private recordSuccess(context: string): void {
        // ✅ LIMPIAR ERRORES ANTIGUOS EN CONTEXTOS EXITOSOS
        const contextErrors = this.errorLog.get(context);
        if (contextErrors && contextErrors.length > 0) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentErrors = contextErrors.filter(e => e.timestamp > oneHourAgo);
            this.errorLog.set(context, recentErrors);
        }
    }

    private recordCriticalError(context: string, error: any): void {
        this.criticalErrors.add(`${context}: ${error instanceof Error ? error.message : String(error)}`);
        this.recordError(context, error);
    }

    private updateSystemHealth(): void {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        
        let totalErrors = 0;
        let recentErrors = 0;
        
        for (const [context, errors] of this.errorLog.entries()) {
            totalErrors += errors.length;
            recentErrors += errors.filter(e => e.timestamp > oneHourAgo).length;
        }
        
        const errorRate = recentErrors / 60; // Errores por minuto
        
        this.systemHealth = {
            status: errorRate > 10 ? 'critical' : errorRate > 5 ? 'degraded' : 'healthy',
            lastCheck: now,
            errorRate,
            uptime: now.getTime() - this.systemHealth.uptime
        };
    }

    // ✅ MÉTODOS PÚBLICOS PARA MONITOREO
    getSystemHealth() {
        return { ...this.systemHealth };
    }

    getErrorSummary() {
        const summary: Record<string, number> = {};
        for (const [context, errors] of this.errorLog.entries()) {
            summary[context] = errors.length;
        }
        return summary;
    }

    getCriticalErrors() {
        return Array.from(this.criticalErrors);
    }

    // ✅ LIMPIEZA AUTOMÁTICA
    startCleanupInterval() {
        setInterval(() => {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            for (const [context, errors] of this.errorLog.entries()) {
                const recentErrors = errors.filter(e => e.timestamp > oneDayAgo);
                this.errorLog.set(context, recentErrors);
            }
            
            // ✅ LIMPIAR ERRORES CRÍTICOS ANTIGUOS
            if (this.criticalErrors.size > 50) {
                this.criticalErrors.clear();
            }
            
        }, 60 * 60 * 1000); // Cada hora
    }
}

// ✅ INSTANCIA GLOBAL DEL MANEJADOR DE ERRORES
export const errorHandler = ErrorHandler.getInstance();
