// ✅ SISTEMA DE LOGGING AVANZADO CON MÚLTIPLES NIVELES
export class AdvancedLogger {
    private static instance: AdvancedLogger;
    private logs: Map<string, any[]> = new Map();
    private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
    private maxLogsPerCategory = 1000;

    static getInstance(): AdvancedLogger {
        if (!AdvancedLogger.instance) {
            AdvancedLogger.instance = new AdvancedLogger();
        }
        return AdvancedLogger.instance;
    }

    // ✅ LOGGING CON CONTEXTO Y METADATOS [[0]](#__0)
    log(level: 'debug' | 'info' | 'warn' | 'error', category: string, message: string, metadata?: any): void {
        const logEntry = {
            timestamp: new Date(),
            level,
            category,
            message,
            metadata: metadata || {},
            sessionId: this.getCurrentSessionId()
        };

        // ✅ ALMACENAR LOG
        if (!this.logs.has(category)) {
            this.logs.set(category, []);
        }

        const categoryLogs = this.logs.get(category)!;
        categoryLogs.push(logEntry);

        // ✅ MANTENER LÍMITE DE LOGS
        if (categoryLogs.length > this.maxLogsPerCategory) {
            categoryLogs.splice(0, categoryLogs.length - this.maxLogsPerCategory);
        }

        // ✅ OUTPUT A CONSOLA CON FORMATO
        this.outputToConsole(logEntry);

        // ✅ ALERTAS PARA ERRORES CRÍTICOS
        if (level === 'error') {
            this.handleCriticalError(logEntry);
        }
    }

    // ✅ MÉTODOS DE CONVENIENCIA
    debug(category: string, message: string, metadata?: any): void {
        this.log('debug', category, message, metadata);
    }

    info(category: string, message: string, metadata?: any): void {
        this.log('info', category, message, metadata);
    }

    warn(category: string, message: string, metadata?: any): void {
        this.log('warn', category, message, metadata);
    }

    error(category: string, message: string, metadata?: any): void {
        this.log('error', category, message, metadata);
    }

    // ✅ LOGGING DE PERFORMANCE [[1]](#__1)
    async logPerformance<T>(
        category: string, 
        operation: string, 
        func: () => Promise<T>
    ): Promise<T> {
        const startTime = Date.now();
        
        try {
            const result = await func();
            const duration = Date.now() - startTime;
            
            this.info('performance', `${operation} completado`, {
                category,
                duration: `${duration}ms`,
                success: true
            });
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            this.error('performance', `${operation} falló`, {
                category,
                duration: `${duration}ms`,
                error: error instanceof Error ? error.message : String(error),
                success: false
            });
            
            throw error;
        }
    }

    // ✅ ANÁLISIS DE PATRONES DE ERROR [[2]](#__2)
    analyzeErrorPatterns(): {
        topErrors: Array<{ error: string; count: number; category: string }>;
        errorTrends: Array<{ hour: number; count: number }>;
        criticalCategories: string[];
    } {
        const errorCounts = new Map<string, { count: number; category: string }>();
        const hourlyErrors = new Array(24).fill(0);
        const categoryErrorCounts = new Map<string, number>();

        // ✅ PROCESAR TODOS LOS LOGS DE ERROR
        for (const [category, logs] of this.logs.entries()) {
            const errorLogs = logs.filter(log => log.level === 'error');
            
            for (const log of errorLogs) {
                // ✅ CONTAR ERRORES POR MENSAJE
                const errorKey = `${log.message}`;
                if (!errorCounts.has(errorKey)) {
                    errorCounts.set(errorKey, { count: 0, category });
                }
                errorCounts.get(errorKey)!.count++;

                // ✅ CONTAR ERRORES POR HORA
                const hour = log.timestamp.getHours();
                hourlyErrors[hour]++;

                // ✅ CONTAR ERRORES POR CATEGORÍA
                const currentCount = categoryErrorCounts.get(category) || 0;
                categoryErrorCounts.set(category, currentCount + 1);
            }
        }

        // ✅ GENERAR ANÁLISIS
        const topErrors = Array.from(errorCounts.entries())
            .map(([error, data]) => ({ error, count: data.count, category: data.category }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const errorTrends = hourlyErrors.map((count, hour) => ({ hour, count }));

        const criticalCategories = Array.from(categoryErrorCounts.entries())
            .filter(([_, count]) => count > 10)
            .map(([category, _]) => category);

        return { topErrors, errorTrends, criticalCategories };
    }

    // ✅ MÉTODOS PRIVADOS
    private getCurrentSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private outputToConsole(logEntry: any): void {
        const timestamp = logEntry.timestamp.toISOString();
        const level = logEntry.level.toUpperCase().padEnd(5);
        const category = logEntry.category.padEnd(15);
        
        const colors = {
            debug: '\x1b[36m', // Cyan
            info: '\x1b[32m',  // Green
            warn: '\x1b[33m',  // Yellow
            error: '\x1b[31m'  // Red
        };
        
        const resetColor = '\x1b[0m';
        const color = colors[logEntry.level] || '';
        
        console.log(`${color}[${timestamp}] ${level} [${category}] ${logEntry.message}${resetColor}`);
        
        if (logEntry.metadata && Object.keys(logEntry.metadata).length > 0) {
            console.log(`${color}  └─ Metadata:`, logEntry.metadata, resetColor);
        }
    }

    private handleCriticalError(logEntry: any): void {
        // ✅ IMPLEMENTAR ALERTAS CRÍTICAS
        if (logEntry.category === 'system' || logEntry.category === 'database') {
            console.error('🚨 ERROR CRÍTICO DETECTADO:', logEntry);
            
            // ✅ AQUÍ SE PUEDEN AGREGAR NOTIFICACIONES
            // - Email alerts
            // - Slack notifications
            // - SMS alerts
        }
    }

    // ✅ EXPORTAR LOGS PARA ANÁLISIS [[3]](#__3)
    exportLogs(category?: string, level?: string): any[] {
        let allLogs: any[] = [];
        
        for (const [cat, logs] of this.logs.entries()) {
            if (!category || cat === category) {
                const filteredLogs = level 
                    ? logs.filter(log => log.level === level)
                    : logs;
                allLogs = allLogs.concat(filteredLogs);
            }
        }
        
        return allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    // ✅ ESTADÍSTICAS DEL SISTEMA
    getSystemStats(): {
        totalLogs: number;
        logsByLevel: Record<string, number>;
        logsByCategory: Record<string, number>;
        oldestLog: Date | null;
        newestLog: Date | null;
    } {
        let totalLogs = 0;
        const logsByLevel: Record<string, number> = {};
        const logsByCategory: Record<string, number> = {};
        let oldestLog: Date | null = null;
        let newestLog: Date | null = null;

        for (const [category, logs] of this.logs.entries()) {
            totalLogs += logs.length;
            logsByCategory[category] = logs.length;

            for (const log of logs) {
                // ✅ CONTAR POR NIVEL
                logsByLevel[log.level] = (logsByLevel[log.level] || 0) + 1;

                // ✅ ENCONTRAR FECHAS EXTREMAS
                if (!oldestLog || log.timestamp < oldestLog) {
                    oldestLog = log.timestamp;
                }
                if (!newestLog || log.timestamp > newestLog) {
                    newestLog = log.timestamp;
                }
            }
        }

        return {
            totalLogs,
            logsByLevel,
            logsByCategory,
            oldestLog,
            newestLog
        };
    }
}

// ✅ INSTANCIA GLOBAL DEL LOGGER
export const logger = AdvancedLogger.getInstance();
