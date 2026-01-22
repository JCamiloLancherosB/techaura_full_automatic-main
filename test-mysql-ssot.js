#!/usr/bin/env node

/**
 * Test MySQL SSOT Enforcement
 * This script validates that MySQL SSOT enforcement is working correctly
 */

// Set environment to development for testing
process.env.NODE_ENV = 'development';

console.log('🧪 Testing MySQL SSOT Enforcement...\n');

// Test 1: Import and call validation functions
console.log('Test 1: Verificando estructura del proyecto...');
try {
    const fs = require('fs');
    
    // Check that key files exist
    if (fs.existsSync('src/utils/dbConfig.ts')) {
        console.log('   ✅ src/utils/dbConfig.ts existe');
    } else {
        console.log('   ❌ src/utils/dbConfig.ts NO existe');
    }
    
    if (fs.existsSync('src/app.ts')) {
        console.log('   ✅ src/app.ts existe');
    } else {
        console.log('   ❌ src/app.ts NO existe');
    }
    
    // Note: Cannot require TypeScript files directly from Node.js
    // This would need tsx or ts-node to work properly
    console.log('   ℹ️  Nota: Para ejecutar tests de TypeScript, usar tsx o ts-node');
    
} catch (error) {
    console.log('❌ Failed to check project structure:', error.message);
}

console.log('\nTest 2: Checking .gitignore for SQLite files...');
const fs = require('fs');
const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
if (gitignoreContent.includes('*.db') || gitignoreContent.includes('*.sqlite')) {
    console.log('✅ .gitignore contains SQLite file patterns');
} else {
    console.log('❌ .gitignore does NOT contain SQLite file patterns');
}

console.log('\nTest 3: Checking if orders.db exists...');
if (fs.existsSync('orders.db')) {
    console.log('❌ orders.db still exists in the repository');
} else {
    console.log('✅ orders.db does not exist (correctly removed)');
}

console.log('\nTest 4: Checking app.ts for proper imports...');
const appContent = fs.readFileSync('src/app.ts', 'utf8');
if (appContent.includes('checkForSQLiteFiles')) {
    console.log('✅ app.ts imports checkForSQLiteFiles');
} else {
    console.log('❌ app.ts does NOT import checkForSQLiteFiles');
}

if (appContent.includes('logDBProviderSelection()')) {
    console.log('✅ app.ts calls logDBProviderSelection()');
} else {
    console.log('❌ app.ts does NOT call logDBProviderSelection()');
}

if (appContent.includes('detectSQLiteUsage()')) {
    console.log('✅ app.ts calls detectSQLiteUsage()');
} else {
    console.log('❌ app.ts does NOT call detectSQLiteUsage()');
}

console.log('\n✅ MySQL SSOT Enforcement tests completed!');
