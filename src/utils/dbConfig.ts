/**
 * Database Configuration Utility
 * Centralized configuration handling with validation and clear error messages
 */

export interface DBConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
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
 * Gets the database configuration from environment variables
 * Supports both MYSQL_DB_* and DB_* prefix for backward compatibility
 * @param options - Configuration options
 * @returns Validated database configuration
 * @throws Error if required configuration is missing
 */
export function getDBConfig(options: DBConfigOptions = {}): DBConfig {
    const {
        requirePassword = true
    } = options;

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
        database: validatedDatabase
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
