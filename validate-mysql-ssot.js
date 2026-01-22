#!/usr/bin/env node
/**
 * MySQL SSOT Enforcement Validation Script
 * 
 * This script validates that all MySQL SSOT enforcement measures are in place:
 * 1. Configuration validation
 * 2. SQLite detection
 * 3. Log enforcement
 * 4. File checks
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('🔍 MySQL SSOT Enforcement - Validation Script');
console.log('='.repeat(70) + '\n');

let passCount = 0;
let failCount = 0;

function testPass(message) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
}

function testFail(message) {
    console.log(`❌ FAIL: ${message}`);
    failCount++;
}

function testInfo(message) {
    console.log(`ℹ️  INFO: ${message}`);
}

// Test 1: Check .gitignore
console.log('\n📋 Test 1: Verificar .gitignore contiene patrones SQLite');
try {
    const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
    
    if (gitignoreContent.includes('*.db')) {
        testPass('.gitignore contiene patrón *.db');
    } else {
        testFail('.gitignore NO contiene patrón *.db');
    }
    
    if (gitignoreContent.includes('*.sqlite') || gitignoreContent.includes('*.sqlite3')) {
        testPass('.gitignore contiene patrones *.sqlite o *.sqlite3');
    } else {
        testFail('.gitignore NO contiene patrones *.sqlite o *.sqlite3');
    }
} catch (error) {
    testFail(`Error leyendo .gitignore: ${error.message}`);
}

// Test 2: Check orders.db no existe en tracked files
console.log('\n📋 Test 2: Verificar que orders.db no está en el repositorio');
try {
    const { execSync } = require('child_process');
    try {
        const result = execSync('git ls-files | grep orders.db', { encoding: 'utf8', stdio: 'pipe' });
        if (result.trim()) {
            testFail('orders.db todavía está en git tracking');
        } else {
            testPass('orders.db no está en git tracking');
        }
    } catch (e) {
        // grep returns exit code 1 when no match found - this is good
        testPass('orders.db no está en git tracking');
    }
} catch (error) {
    testInfo(`No se pudo verificar git tracking: ${error.message}`);
}

// Test 3: Check dbConfig.ts exports
console.log('\n📋 Test 3: Verificar funciones exportadas en dbConfig.ts');
try {
    const dbConfigContent = fs.readFileSync('src/utils/dbConfig.ts', 'utf8');
    
    const requiredFunctions = [
        'validateDBProvider',
        'detectSQLiteUsage',
        'logDBProviderSelection',
        'checkForSQLiteFiles',
        'getDBConfig'
    ];
    
    for (const funcName of requiredFunctions) {
        const regex = new RegExp(`export function ${funcName}\\s*\\(`);
        if (regex.test(dbConfigContent)) {
            testPass(`Función ${funcName} está exportada`);
        } else {
            testFail(`Función ${funcName} NO está exportada`);
        }
    }
} catch (error) {
    testFail(`Error leyendo dbConfig.ts: ${error.message}`);
}

// Test 4: Check app.ts imports and calls
console.log('\n📋 Test 4: Verificar app.ts importa y llama funciones de enforcement');
try {
    const appContent = fs.readFileSync('src/app.ts', 'utf8');
    
    const requiredImports = [
        'validateDBProvider',
        'detectSQLiteUsage',
        'logDBProviderSelection',
        'checkForSQLiteFiles'
    ];
    
    for (const funcName of requiredImports) {
        if (appContent.includes(funcName)) {
            testPass(`app.ts importa ${funcName}`);
        } else {
            testFail(`app.ts NO importa ${funcName}`);
        }
    }
    
    const requiredCalls = [
        'validateDBProvider()',
        'logDBProviderSelection()',
        'detectSQLiteUsage()',
        'checkForSQLiteFiles()'
    ];
    
    for (const callName of requiredCalls) {
        if (appContent.includes(callName)) {
            testPass(`app.ts llama ${callName}`);
        } else {
            testFail(`app.ts NO llama ${callName}`);
        }
    }
} catch (error) {
    testFail(`Error leyendo app.ts: ${error.message}`);
}

// Test 5: Check DatabaseService is blocked
console.log('\n📋 Test 5: Verificar DatabaseService está bloqueado');
try {
    const dbServiceContent = fs.readFileSync('src/services/DatabaseService.ts', 'utf8');
    
    if (dbServiceContent.includes('MySQL SSOT enforcement') || 
        dbServiceContent.includes('BLOQUEADO') ||
        dbServiceContent.includes('BLOCKED')) {
        testPass('DatabaseService contiene bloqueo de MySQL SSOT');
    } else {
        testFail('DatabaseService NO contiene bloqueo de MySQL SSOT');
    }
    
    if (dbServiceContent.includes('throw new Error')) {
        testPass('DatabaseService lanza error en constructor');
    } else {
        testFail('DatabaseService NO lanza error en constructor');
    }
} catch (error) {
    testFail(`Error leyendo DatabaseService.ts: ${error.message}`);
}

// Test 6: Check for SQLite files in project root
console.log('\n📋 Test 6: Verificar que no hay archivos SQLite en el directorio raíz');
try {
    const rootFiles = fs.readdirSync('.');
    const sqliteFiles = rootFiles.filter(file => 
        file.endsWith('.db') || 
        file.endsWith('.sqlite') || 
        file.endsWith('.sqlite3')
    );
    
    if (sqliteFiles.length === 0) {
        testPass('No hay archivos SQLite en el directorio raíz');
    } else {
        testFail(`Archivos SQLite encontrados: ${sqliteFiles.join(', ')}`);
        testInfo('Estos archivos deben ser eliminados o estar en .gitignore');
    }
} catch (error) {
    testFail(`Error verificando archivos: ${error.message}`);
}

// Test 7: Check detectSQLiteUsage implementation
console.log('\n📋 Test 7: Verificar implementación de detectSQLiteUsage');
try {
    const dbConfigContent = fs.readFileSync('src/utils/dbConfig.ts', 'utf8');
    
    if (dbConfigContent.includes('better-sqlite3') && 
        dbConfigContent.includes('sqlite3') &&
        dbConfigContent.includes('sqlite')) {
        testPass('detectSQLiteUsage verifica módulos: better-sqlite3, sqlite3, sqlite');
    } else {
        testFail('detectSQLiteUsage NO verifica todos los módulos SQLite necesarios');
    }
    
    if (dbConfigContent.includes('NODE_ENV') && dbConfigContent.includes('production')) {
        testPass('detectSQLiteUsage diferencia entre producción y desarrollo');
    } else {
        testFail('detectSQLiteUsage NO diferencia entre producción y desarrollo');
    }
    
    if (dbConfigContent.includes('require.resolve') && dbConfigContent.includes('require.cache')) {
        testPass('detectSQLiteUsage verifica imports y módulos instalados');
    } else {
        testFail('detectSQLiteUsage NO verifica adecuadamente imports');
    }
} catch (error) {
    testFail(`Error verificando detectSQLiteUsage: ${error.message}`);
}

// Test 8: Check logDBProviderSelection implementation
console.log('\n📋 Test 8: Verificar logs de enforcement');
try {
    const dbConfigContent = fs.readFileSync('src/utils/dbConfig.ts', 'utf8');
    
    const requiredLogMessages = [
        'DB provider selected: mysql',
        'MySQL SSOT enforcement: ACTIVE',
        'SQLite usage: BLOCKED'
    ];
    
    for (const message of requiredLogMessages) {
        if (dbConfigContent.includes(message)) {
            testPass(`Log incluye mensaje: "${message}"`);
        } else {
            testFail(`Log NO incluye mensaje: "${message}"`);
        }
    }
} catch (error) {
    testFail(`Error verificando logs: ${error.message}`);
}

// Test 9: Check .env.example
console.log('\n📋 Test 9: Verificar .env.example tiene configuración MySQL');
try {
    const envExampleContent = fs.readFileSync('.env.example', 'utf8');
    
    const requiredVars = [
        'MYSQL_DB_HOST',
        'MYSQL_DB_USER',
        'MYSQL_DB_PASSWORD',
        'MYSQL_DB_NAME',
        'DB_PROVIDER'
    ];
    
    for (const varName of requiredVars) {
        if (envExampleContent.includes(varName)) {
            testPass(`.env.example incluye ${varName}`);
        } else {
            testFail(`.env.example NO incluye ${varName}`);
        }
    }
} catch (error) {
    testFail(`Error leyendo .env.example: ${error.message}`);
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('📊 Resumen de Validación');
console.log('='.repeat(70));
console.log(`✅ Tests pasados: ${passCount}`);
console.log(`❌ Tests fallados: ${failCount}`);
console.log(`📈 Total: ${passCount + failCount}`);
console.log(`🎯 Tasa de éxito: ${Math.round((passCount / (passCount + failCount)) * 100)}%`);
console.log('='.repeat(70) + '\n');

if (failCount === 0) {
    console.log('🎉 ¡Todos los tests pasaron! MySQL SSOT enforcement está correctamente implementado.\n');
    process.exit(0);
} else {
    console.log('⚠️  Algunos tests fallaron. Revisa los errores anteriores.\n');
    process.exit(1);
}
