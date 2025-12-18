/**
 * Database Logger Utility
 * Provides consistent logging for database operations with sensitive data redaction
 */

import type { DBConfig } from './dbConfig';

export interface DBLogOptions {
    redactPassword?: boolean;
    includeTimestamp?: boolean;
    prefix?: string;
}

/**
 * Logs a successful database connection
 * @param config - The database configuration
 * @param options - Logging options
 */
export function logConnectionSuccess(config: DBConfig, options: DBLogOptions = {}): void {
    const {
        redactPassword = true,
        includeTimestamp = true,
        prefix = '✅'
    } = options;

    const timestamp = includeTimestamp ? new Date().toISOString() : '';
    
    console.log(`${prefix} Conexión a MySQL exitosa${timestamp ? ` [${timestamp}]` : ''}`);
    console.log(`   Host: ${config.host}:${config.port}`);
    console.log(`   Usuario: ${config.user}`);
    console.log(`   Base de datos: ${config.database}`);
    
    if (redactPassword) {
        console.log(`   Contraseña: ${'*'.repeat(config.password?.length || 0)}`);
    }
}

/**
 * Logs a failed database connection with troubleshooting steps
 * @param error - The error that occurred
 * @param config - The database configuration
 * @param attempt - The attempt number (for retries)
 * @param maxAttempts - The maximum number of attempts
 */
export function logConnectionFailure(
    error: any,
    config: DBConfig,
    attempt: number = 1,
    maxAttempts: number = 1
): void {
    const errorCode = error?.code || 'UNKNOWN';
    const errorMessage = error?.message || 'Error desconocido';

    console.error(`\n❌ Error conectando a MySQL (Intento ${attempt}/${maxAttempts})`);
    console.error(`   Código de error: ${errorCode}`);
    console.error(`   Mensaje: ${errorMessage}`);
    console.error(`   Host: ${config.host}:${config.port}`);
    console.error(`   Usuario: ${config.user}`);
    console.error(`   Base de datos: ${config.database}\n`);
}

/**
 * Logs a retry attempt
 * @param attempt - The current attempt number
 * @param maxAttempts - The maximum number of attempts
 * @param delayMs - The delay before retry in milliseconds
 */
export function logRetryAttempt(attempt: number, maxAttempts: number, delayMs: number): void {
    console.log(`🔄 Reintentando conexión... (${attempt}/${maxAttempts}) - Esperando ${delayMs}ms`);
}

/**
 * Logs database initialization start
 */
export function logInitializationStart(): void {
    console.log('\n🚀 Iniciando inicialización de la base de datos MySQL...');
}

/**
 * Logs database initialization success
 */
export function logInitializationSuccess(): void {
    console.log('✅ Inicialización de base de datos MySQL completada exitosamente\n');
}

/**
 * Logs database initialization failure
 * @param error - The error that occurred
 */
export function logInitializationFailure(error: any): void {
    console.error('\n❌ Error crítico en inicialización de base de datos MySQL');
    console.error(`   ${error.message || error}\n`);
}

/**
 * Logs a database query execution
 * @param query - The query being executed (truncated if too long)
 * @param params - The query parameters
 */
export function logQuery(query: string, params?: any[]): void {
    const maxLength = 200;
    const truncatedQuery = query.length > maxLength 
        ? query.substring(0, maxLength) + '...'
        : query;
    
    console.log(`📝 Ejecutando query: ${truncatedQuery}`);
    if (params && params.length > 0) {
        console.log(`   Parámetros: ${JSON.stringify(params).substring(0, 100)}`);
    }
}

/**
 * Logs a database query error
 * @param error - The error that occurred
 * @param query - The query that failed
 */
export function logQueryError(error: any, query: string): void {
    console.error('❌ Error ejecutando query');
    console.error(`   Query: ${query.substring(0, 200)}...`);
    console.error(`   Error: ${error.message || error}`);
}

/**
 * Logs migration start
 * @param migrationName - The name of the migration
 */
export function logMigrationStart(migrationName: string): void {
    console.log(`🔧 Ejecutando migración: ${migrationName}`);
}

/**
 * Logs migration success
 * @param migrationName - The name of the migration
 */
export function logMigrationSuccess(migrationName: string): void {
    console.log(`✅ Migración completada: ${migrationName}`);
}

/**
 * Logs migration failure
 * @param migrationName - The name of the migration
 * @param error - The error that occurred
 */
export function logMigrationFailure(migrationName: string, error: any): void {
    console.error(`❌ Error en migración: ${migrationName}`);
    console.error(`   ${error.message || error}`);
}

/**
 * Logs a warning message
 * @param message - The warning message
 */
export function logWarning(message: string): void {
    console.warn(`⚠️ ${message}`);
}

/**
 * Logs an info message
 * @param message - The info message
 */
export function logInfo(message: string): void {
    console.log(`ℹ️ ${message}`);
}

/**
 * Logs database pool status
 * @param poolInfo - Information about the connection pool
 */
export function logPoolStatus(poolInfo: {
    totalConnections: number;
    idleConnections: number;
    activeConnections: number;
}): void {
    console.log('📊 Estado del pool de conexiones MySQL:');
    console.log(`   Total: ${poolInfo.totalConnections}`);
    console.log(`   Activas: ${poolInfo.activeConnections}`);
    console.log(`   Inactivas: ${poolInfo.idleConnections}`);
}
