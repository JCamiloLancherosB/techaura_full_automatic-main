#!/usr/bin/env node
/**
 * Test script to validate MySQL connection configuration
 * Usage: node test-mysql-config.js
 */

const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

// Load environment variables
dotenv.config();

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testMySQLConnection() {
    log('\n🧪 Testing MySQL Connection Configuration\n', 'blue');

    // Step 1: Check environment variables
    log('Step 1: Checking environment variables...', 'cyan');
    
    const config = {
        host: process.env.MYSQL_DB_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_DB_PORT || process.env.DB_PORT || '3306', 10),
        user: process.env.MYSQL_DB_USER || process.env.DB_USER,
        password: process.env.MYSQL_DB_PASSWORD || process.env.DB_PASS || process.env.DB_PASSWORD,
        database: process.env.MYSQL_DB_NAME || process.env.DB_NAME
    };

    const issues = [];

    if (!config.user) {
        issues.push('❌ MYSQL_DB_USER or DB_USER not set');
    } else {
        log(`  ✅ User: ${config.user}`, 'green');
    }

    if (!config.password) {
        issues.push('❌ MYSQL_DB_PASSWORD or DB_PASS not set');
    } else {
        log(`  ✅ Password: ${'*'.repeat(config.password.length)}`, 'green');
    }

    if (!config.database) {
        issues.push('❌ MYSQL_DB_NAME or DB_NAME not set');
    } else {
        log(`  ✅ Database: ${config.database}`, 'green');
    }

    log(`  ✅ Host: ${config.host}:${config.port}`, 'green');

    if (issues.length > 0) {
        log('\n❌ Configuration Issues Found:', 'red');
        issues.forEach(issue => log(`  ${issue}`, 'red'));
        log('\n💡 Fix by setting these variables in your .env file\n', 'yellow');
        process.exit(1);
    }

    // Step 2: Test connection
    log('\nStep 2: Testing database connection...', 'cyan');
    
    let connection;
    try {
        connection = await mysql.createConnection(config);
        log('  ✅ Connection successful!', 'green');

        // Step 3: Verify database access
        log('\nStep 3: Verifying database access...', 'cyan');
        await connection.query('SELECT 1 as result');
        log('  ✅ Can execute queries', 'green');

        // Step 4: Check database exists
        log('\nStep 4: Checking database exists...', 'cyan');
        const [databases] = await connection.query('SHOW DATABASES LIKE ?', [config.database]);
        if (databases.length > 0) {
            log(`  ✅ Database '${config.database}' exists`, 'green');
        } else {
            log(`  ❌ Database '${config.database}' does not exist`, 'red');
            log(`\n  Create it with:`, 'yellow');
            log(`  CREATE DATABASE ${config.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, 'yellow');
        }

        // Step 5: Check user privileges
        log('\nStep 5: Checking user privileges...', 'cyan');
        const [grants] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');
        log('  ✅ User has the following grants:', 'green');
        grants.forEach((grant, i) => {
            const grantStr = Object.values(grant)[0];
            log(`    ${i + 1}. ${grantStr}`, 'reset');
        });

        log('\n✅ All checks passed! MySQL connection is properly configured.\n', 'green');
        
    } catch (error) {
        log(`\n❌ Connection failed: ${error.message}`, 'red');
        log(`  Error code: ${error.code || 'UNKNOWN'}`, 'red');
        
        // Provide specific troubleshooting steps
        log('\n💡 Troubleshooting Steps:', 'yellow');
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            log('  This is an authentication error. Try:', 'yellow');
            log(`  1. Verify the password is correct`, 'yellow');
            log(`  2. Check if user '${config.user}' exists:`, 'yellow');
            log(`     mysql -u root -p -e "SELECT User, Host FROM mysql.user WHERE User='${config.user}';"`, 'cyan');
            log(`  3. If user doesn't exist, create it:`, 'yellow');
            log(`     mysql -u root -p`, 'cyan');
            log(`     CREATE USER '${config.user}'@'localhost' IDENTIFIED BY 'your_password';`, 'cyan');
            log(`     GRANT ALL PRIVILEGES ON ${config.database}.* TO '${config.user}'@'localhost';`, 'cyan');
            log(`     FLUSH PRIVILEGES;`, 'cyan');
            log(`     EXIT;`, 'cyan');
        } else if (error.code === 'ECONNREFUSED') {
            log('  MySQL server is not running. Try:', 'yellow');
            log(`  1. Start MySQL:`, 'yellow');
            log(`     sudo systemctl start mysql   # Linux`, 'cyan');
            log(`     brew services start mysql    # macOS`, 'cyan');
            log(`  2. Check MySQL is listening on port ${config.port}:`, 'yellow');
            log(`     sudo netstat -tlnp | grep ${config.port}   # Linux`, 'cyan');
            log(`     lsof -i :${config.port}                     # macOS`, 'cyan');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            log(`  Database '${config.database}' doesn't exist. Create it:`, 'yellow');
            log(`  mysql -u root -p`, 'cyan');
            log(`  CREATE DATABASE ${config.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, 'cyan');
            log(`  GRANT ALL PRIVILEGES ON ${config.database}.* TO '${config.user}'@'localhost';`, 'cyan');
            log(`  FLUSH PRIVILEGES;`, 'cyan');
            log(`  EXIT;`, 'cyan');
        } else {
            log(`  1. Check MySQL is running`, 'yellow');
            log(`  2. Verify credentials in .env file`, 'yellow');
            log(`  3. Check MySQL error logs for more details`, 'yellow');
        }
        
        log('', 'reset');
        process.exit(1);
        
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the test
testMySQLConnection().catch((error) => {
    log(`\n❌ Unexpected error: ${error.message}`, 'red');
    process.exit(1);
});
