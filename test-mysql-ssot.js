#!/usr/bin/env node

/**
 * Test MySQL SSOT Enforcement
 * This script validates that MySQL SSOT enforcement is working correctly
 */

// Set environment to development for testing
process.env.NODE_ENV = 'development';

console.log('🧪 Testing MySQL SSOT Enforcement...\n');

// Test 1: Import and call validation functions
console.log('Test 1: Importing dbConfig functions...');
try {
    const dbConfig = require('./src/utils/dbConfig.ts');
    console.log('✅ dbConfig imported successfully');
    
    // Check exports
    const expectedFunctions = [
        'validateDBProvider',
        'detectSQLiteUsage',
        'logDBProviderSelection',
        'checkForSQLiteFiles',
        'getDBConfig'
    ];
    
    for (const funcName of expectedFunctions) {
        if (typeof dbConfig[funcName] === 'function') {
            console.log(`   ✅ ${funcName} is exported`);
        } else {
            console.log(`   ❌ ${funcName} is NOT exported or not a function`);
        }
    }
} catch (error) {
    console.log('❌ Failed to import dbConfig:', error.message);
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
