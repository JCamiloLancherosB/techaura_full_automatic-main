/**
 * Database Configuration Utility
 * Centralized configuration handling with validation and clear error messages
 * 
 * MySQL SSOT (Single Source of Truth) enforcement:
 * - Only MySQL is allowed as the database provider
 * - SQLite usage is blocked at runtime with clear error messages
 */

export interface DBConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    provider: 'mysql';  // Enforced to be MySQL only
}

export interface DBConfigOptions {
    requirePassword?: boolean;
    connectionLimit?: number;
    connectTimeout?: number;
    waitForConnections?: boolean;
    queueLimit?: number;
    enableKeepAlive?: boolean;
    keepAliveInitialDelay?: number;
}

/**
 * Validates a required environment variable
 * @param value - The value to validate
 * @param varName - The name of the environment variable
 * @throws Error if the value is missing or empty
 */
function validateRequired(value: string | undefined, varName: string): string {
    if (!value || value.trim() === '') {
        throw new Error(
            `❌ ERROR CRÍTICO: La variable de entorno ${varName} es requerida.\n` +
            `   Por favor, configúrala en el archivo .env\n` +
            `   Ejemplo: ${varName}=${varName === 'MYSQL_DB_PASSWORD' ? 'tu_password_seguro' : 
                varName === 'MYSQL_DB_USER' ? 'techaura_bot' :
                varName === 'MYSQL_DB_NAME' ? 'techaura_bot' : 'valor'}`
        );
    }
    return value.trim();
}

/**
 * Validates DB_PROVIDER environment variable
 * Enforces MySQL-only operation (MySQL SSOT)
 * @throws Error if DB_PROVIDER is set to anything other than 'mysql'
 */
export function validateDBProvider(): void {
    const dbProvider = process.env.DB_PROVIDER?.toLowerCase().trim();
    
    // If DB_PROVIDER is explicitly set, it must be 'mysql'
    if (dbProvider && dbProvider !== 'mysql') {
        throw new Error(
            `❌ ERROR CRÍTICO: MySQL SSOT enforcement (Candado MySQL SSOT activado)\n` +
            `   DB_PROVIDER está configurado como '${dbProvider}', pero solo se permite 'mysql'\n` +
            `   Este sistema solo soporta MySQL como base de datos.\n` +
            `   Por favor, configura DB_PROVIDER=mysql en tu archivo .env o elimina esta variable.`
        );
    }
}

/**
 * Gets the database configuration from environment variables
 * Supports both MYSQL_DB_* and DB_* prefix for backward compatibility
 * Enforces MySQL-only operation (MySQL SSOT)
 * @param options - Configuration options
 * @returns Validated database configuration
 * @throws Error if required configuration is missing or DB_PROVIDER is not 'mysql'
 */
export function getDBConfig(options: DBConfigOptions = {}): DBConfig {
    const {
        requirePassword = true
    } = options;

    // Validate DB provider first - enforce MySQL SSOT
    validateDBProvider();

    // Support both MYSQL_DB_* and DB_* prefixes for backward compatibility
    const host = process.env.MYSQL_DB_HOST || process.env.DB_HOST || 'localhost';
    const portStr = process.env.MYSQL_DB_PORT || process.env.DB_PORT || '3306';
    const user = process.env.MYSQL_DB_USER || process.env.DB_USER;
    const password = process.env.MYSQL_DB_PASSWORD || process.env.DB_PASS || process.env.DB_PASSWORD;
    const database = process.env.MYSQL_DB_NAME || process.env.DB_NAME;

    // Validate required fields
    const validatedUser = validateRequired(user, 'MYSQL_DB_USER o DB_USER');
    const validatedDatabase = validateRequired(database, 'MYSQL_DB_NAME o DB_NAME');
    
    if (requirePassword) {
        validateRequired(password, 'MYSQL_DB_PASSWORD o DB_PASS');
    }

    const port = parseInt(portStr, 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
        throw new Error(
            `❌ ERROR: Puerto de base de datos inválido: ${portStr}\n` +
            `   El puerto debe ser un número entre 1 y 65535\n` +
            `   Valor por defecto: 3306`
        );
    }

    return {
        host: host.trim(),
        port,
        user: validatedUser,
        password: (password || '').trim(),
        database: validatedDatabase,
        provider: 'mysql'  // Always MySQL - enforced by validateDBProvider()
    };
}

/**
 * Logs the database configuration (with password redacted)
 * @param config - The database configuration
 * @param prefix - Optional prefix for log messages
 */
export function logDBConfig(config: DBConfig, prefix: string = '🔧 Configuración de MySQL'): void {
    console.log(`${prefix}:`);
    console.log(`   Host: ${config.host}`);
    console.log(`   Puerto: ${config.port}`);
    console.log(`   Usuario: ${config.user}`);
    console.log(`   Base de datos: ${config.database}`);
    console.log(`   Contraseña: ${config.password ? '✅ Configurada (' + '*'.repeat(config.password.length) + ')' : '❌ NO configurada'}`);
}

/**
 * Validates that the database configuration is complete
 * @param config - The database configuration to validate
 * @throws Error if validation fails
 */
export function validateDBConfig(config: DBConfig): void {
    const errors: string[] = [];

    if (!config.host || config.host.trim() === '') {
        errors.push('Host de base de datos es requerido');
    }

    if (!config.user || config.user.trim() === '') {
        errors.push('Usuario de base de datos es requerido');
    }

    if (!config.password) {
        errors.push('Contraseña de base de datos es requerida');
    }

    if (!config.database || config.database.trim() === '') {
        errors.push('Nombre de base de datos es requerido');
    }

    if (!config.port || config.port <= 0 || config.port > 65535) {
        errors.push(`Puerto de base de datos inválido: ${config.port}`);
    }

    if (errors.length > 0) {
        throw new Error(
            '❌ Errores de configuración de base de datos:\n' +
            errors.map(e => `   - ${e}`).join('\n') +
            '\n\n   Por favor, verifica tu archivo .env'
        );
    }
}

/**
 * Creates a full MySQL connection config with all options
 * @param baseConfig - The base database configuration
 * @param options - Additional connection options
 * @returns Complete MySQL connection configuration
 */
export function createMySQLConfig(
    baseConfig: DBConfig,
    options: DBConfigOptions = {}
): any {
    const {
        connectionLimit = 10,
        connectTimeout = 10000,
        waitForConnections = true,
        queueLimit = 0,
        enableKeepAlive = true,
        keepAliveInitialDelay = 0
    } = options;

    return {
        host: baseConfig.host,
        port: baseConfig.port,
        user: baseConfig.user,
        password: baseConfig.password,
        database: baseConfig.database,
        connectionLimit,
        connectTimeout,
        waitForConnections,
        queueLimit,
        enableKeepAlive,
        keepAliveInitialDelay,
        charset: 'utf8mb4'
    };
}

/**
 * Provides troubleshooting steps for database connection errors
 * @param error - The error that occurred
 * @param config - The database configuration being used
 * @returns Formatted troubleshooting message
 */
export function getDBErrorTroubleshooting(error: any, config: DBConfig): string {
    const errorCode = error?.code || '';
    const errorMessage = error?.message || '';

    let troubleshooting = '\n📋 PASOS PARA SOLUCIONAR:\n';

    if (errorCode === 'ER_ACCESS_DENIED_ERROR' || errorMessage.includes('Access denied')) {
        troubleshooting += `
   1. Verifica que el usuario '${config.user}' existe en MySQL:
      mysql -u root -p -e "SELECT User, Host FROM mysql.user WHERE User='${config.user}';"

   2. Si el usuario no existe, créalo:
      mysql -u root -p
      CREATE USER '${config.user}'@'localhost' IDENTIFIED BY 'tu_password_seguro';
      GRANT ALL PRIVILEGES ON ${config.database}.* TO '${config.user}'@'localhost';
      FLUSH PRIVILEGES;
      EXIT;

   3. Si el usuario existe, verifica la contraseña:
      - Asegúrate que MYSQL_DB_PASSWORD en .env coincide con la contraseña del usuario
      - Intenta cambiar la contraseña:
        mysql -u root -p
        ALTER USER '${config.user}'@'localhost' IDENTIFIED BY 'nueva_password_segura';
        FLUSH PRIVILEGES;
        EXIT;

   4. Verifica que el usuario tiene los privilegios necesarios:
      mysql -u root -p -e "SHOW GRANTS FOR '${config.user}'@'localhost';"
`;
    } else if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
        troubleshooting += `
   1. Verifica que MySQL está corriendo:
      sudo systemctl status mysql     # En Linux
      brew services list              # En macOS
      
   2. Si no está corriendo, inícialo:
      sudo systemctl start mysql      # En Linux
      brew services start mysql       # En macOS

   3. Verifica que MySQL está escuchando en el puerto correcto:
      sudo netstat -tlnp | grep ${config.port}     # En Linux
      lsof -i :${config.port}                       # En macOS

   4. Verifica la configuración de MySQL:
      Host: ${config.host}
      Puerto: ${config.port}
`;
    } else if (errorCode === 'ER_BAD_DB_ERROR' || errorMessage.includes('Unknown database')) {
        troubleshooting += `
   1. Verifica que la base de datos '${config.database}' existe:
      mysql -u root -p -e "SHOW DATABASES LIKE '${config.database}';"

   2. Si no existe, créala:
      mysql -u root -p
      CREATE DATABASE ${config.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      EXIT;

   3. Luego otorga permisos al usuario:
      mysql -u root -p
      GRANT ALL PRIVILEGES ON ${config.database}.* TO '${config.user}'@'localhost';
      FLUSH PRIVILEGES;
      EXIT;
`;
    } else if (errorCode === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
        troubleshooting += `
   1. Verifica la conectividad de red a MySQL:
      ping ${config.host}
      telnet ${config.host} ${config.port}

   2. Verifica que no hay firewall bloqueando la conexión

   3. Aumenta el timeout de conexión en .env si la red es lenta

   4. Verifica que MySQL está aceptando conexiones remotas (si no es localhost)
`;
    } else {
        troubleshooting += `
   1. Verifica que MySQL está corriendo:
      sudo systemctl status mysql

   2. Verifica que la base de datos '${config.database}' existe:
      mysql -u root -p -e "SHOW DATABASES LIKE '${config.database}';"

   3. Verifica que el usuario '${config.user}' existe y tiene permisos:
      mysql -u root -p -e "SELECT User, Host FROM mysql.user WHERE User='${config.user}';"
      mysql -u root -p -e "SHOW GRANTS FOR '${config.user}'@'localhost';"

   4. Revisa la configuración en el archivo .env

   5. Consulta los logs de MySQL para más detalles:
      sudo tail -f /var/log/mysql/error.log    # En Linux
      tail -f /usr/local/var/mysql/*.err       # En macOS
`;
    }

    return troubleshooting;
}

/**
 * Detects if SQLite is being used/imported in the runtime
 * This is part of MySQL SSOT enforcement
 * 
 * Detection Strategy:
 * - Checks require.cache to see if SQLite modules have been imported
 * - Checks if SQLite modules are installed (available to require)
 * - In production: Throws error if SQLite is detected
 * - In development: Emits warning if SQLite is detected (allows development but warns)
 * 
 * @throws Error if SQLite imports or usage is detected in production
 */
export function detectSQLiteUsage(): void {
    const sqliteModules = [
        'better-sqlite3',
        'sqlite3',
        'sqlite'
    ];
    
    const detectedModules: string[] = [];
    const installedModules: string[] = [];
    
    for (const moduleName of sqliteModules) {
        try {
            // Try to resolve module path - throws if not installed
            const modulePath = require.resolve(moduleName);
            installedModules.push(moduleName);
            
            // Check if module is in cache (i.e., has been imported/used)
            if (require.cache[modulePath]) {
                detectedModules.push(moduleName);
            }
        } catch (e) {
            // Module not installed or not resolvable - this is good for SSOT
            // No action needed
        }
    }
    
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = !isProduction;
    
    // If SQLite modules are actively imported/used
    if (detectedModules.length > 0) {
        const errorMessage = 
            `❌ ERROR CRÍTICO: MySQL SSOT enforcement - SQLite detectado en uso\n` +
            `   Se detectaron imports/uso activo de SQLite: ${detectedModules.join(', ')}\n` +
            `   Este sistema solo permite MySQL como base de datos.\n` +
            `   Por favor, elimina todos los imports y usos de SQLite en el código.\n` +
            `   Módulos detectados en runtime: ${detectedModules.join(', ')}\n` +
            `\n` +
            `   Archivos comunes a revisar:\n` +
            `   - src/services/DatabaseService.ts\n` +
            `   - src/services/ProcessingOrchestrator.ts\n` +
            `   - Cualquier archivo que use 'better-sqlite3' o 'sqlite3'`;
        
        if (isProduction) {
            throw new Error(errorMessage);
        } else {
            console.warn('\n⚠️  ' + errorMessage + '\n');
        }
    }
    
    // If SQLite modules are installed but not yet used (warning in dev, error in prod)
    if (installedModules.length > 0 && detectedModules.length === 0) {
        const warningMessage = 
            `⚠️  ADVERTENCIA: MySQL SSOT - Módulos SQLite instalados\n` +
            `   Se detectaron módulos SQLite instalados pero no en uso: ${installedModules.join(', ')}\n` +
            `   Estos módulos no deben ser usados en producción.\n` +
            `   Módulos instalados: ${installedModules.join(', ')}`;
        
        if (isDevelopment) {
            console.warn('\n' + warningMessage + '\n');
        } else if (isProduction) {
            // In production, installed SQLite modules are also an error
            throw new Error(
                `❌ ERROR CRÍTICO: MySQL SSOT enforcement\n` +
                `   Módulos SQLite encontrados instalados en producción: ${installedModules.join(', ')}\n` +
                `   Por favor, elimina estos módulos de las dependencias en producción.`
            );
        }
    }
}

/**
 * Logs the DB provider selection and enforcement status
 * This is required for MySQL SSOT compliance
 * Displays clear enforcement status at startup
 */
export function logDBProviderSelection(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const environment = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
    
    console.log('\n' + '='.repeat(70));
    console.log('🔒 MySQL SSOT (Single Source of Truth) Enforcement');
    console.log('='.repeat(70));
    console.log(`   Environment: ${environment}`);
    console.log('   DB provider selected: mysql');
    console.log('   MySQL SSOT enforcement: ACTIVE');
    console.log('   SQLite usage: BLOCKED');
    
    if (isProduction) {
        console.log('   Mode: STRICT - SQLite imports/usage will cause startup failure');
    } else {
        console.log('   Mode: WARNING - SQLite usage will emit warnings for detection');
    }
    
    console.log('='.repeat(70) + '\n');
}

/**
 * Checks for SQLite database files in the project directory
 * Issues warnings if .db files are found (they should be in .gitignore)
 * In production, this prevents accidental SQLite file usage
 */
export function checkForSQLiteFiles(): void {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const projectRoot = process.cwd();
        const dbFiles: string[] = [];
        
        // Check for common SQLite file patterns in root directory only
        // (don't recurse into node_modules or other directories)
        const commonSQLiteFiles = [
            'orders.db',
            'database.db',
            'data.db',
            'app.db',
            'db.sqlite',
            'database.sqlite',
            'data.sqlite3',
            'database.sqlite3'
        ];
        
        for (const filename of commonSQLiteFiles) {
            const filePath = path.join(projectRoot, filename);
            if (fs.existsSync(filePath)) {
                dbFiles.push(filename);
            }
        }
        
        if (dbFiles.length > 0) {
            const isProduction = process.env.NODE_ENV === 'production';
            
            const message = 
                `⚠️  MySQL SSOT: Archivos SQLite encontrados en el directorio del proyecto\n` +
                `   Archivos detectados: ${dbFiles.join(', ')}\n` +
                `   Estos archivos no deben ser usados en producción (MySQL es la única fuente de verdad).\n` +
                `   Verifica que estén en .gitignore para evitar commits accidentales.`;
            
            if (isProduction) {
                console.error('\n❌ ' + message + '\n');
                console.error('   IMPORTANTE: Elimina estos archivos o configura .gitignore correctamente.');
            } else {
                console.warn('\n' + message + '\n');
            }
        }
    } catch (error) {
        // Silently fail - this is a best-effort check
        console.warn('⚠️  No se pudo verificar archivos SQLite en el directorio:', error instanceof Error ? error.message : String(error));
    }
}
