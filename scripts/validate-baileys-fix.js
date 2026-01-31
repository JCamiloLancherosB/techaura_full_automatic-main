#!/usr/bin/env node

/**
 * Validation script for Baileys version fix
 * This script checks if the correct version of Baileys is installed
 * and verifies package.json configuration
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Baileys version fix...\n');

let hasErrors = false;

// 1. Check package.json configuration
console.log('1️⃣ Checking package.json configuration...');
try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    const expectedVersion = '6.7.8';
    
    // Check dependencies
    if (packageJson.dependencies && packageJson.dependencies['@whiskeysockets/baileys']) {
        const depVersion = packageJson.dependencies['@whiskeysockets/baileys'];
        if (depVersion === expectedVersion) {
            console.log(`   ✅ @whiskeysockets/baileys dependency: ${depVersion}`);
        } else {
            console.log(`   ❌ @whiskeysockets/baileys dependency: ${depVersion} (expected: ${expectedVersion})`);
            hasErrors = true;
        }
    } else {
        console.log('   ⚠️  @whiskeysockets/baileys not found in dependencies');
        hasErrors = true;
    }
    
    // Check pnpm overrides
    if (packageJson.pnpm && packageJson.pnpm.overrides) {
        const pnpmBaileys = packageJson.pnpm.overrides['@whiskeysockets/baileys'];
        if (pnpmBaileys === expectedVersion) {
            console.log(`   ✅ pnpm override for @whiskeysockets/baileys: ${pnpmBaileys}`);
        } else {
            console.log(`   ❌ pnpm override for @whiskeysockets/baileys: ${pnpmBaileys} (expected: ${expectedVersion})`);
            hasErrors = true;
        }
    } else {
        console.log('   ⚠️  pnpm overrides not configured');
    }
    
    // Check npm overrides
    if (packageJson.overrides) {
        const npmBaileys = packageJson.overrides['@whiskeysockets/baileys'];
        if (npmBaileys === expectedVersion) {
            console.log(`   ✅ npm override for @whiskeysockets/baileys: ${npmBaileys}`);
        } else {
            console.log(`   ❌ npm override for @whiskeysockets/baileys: ${npmBaileys} (expected: ${expectedVersion})`);
            hasErrors = true;
        }
    } else {
        console.log('   ⚠️  npm overrides not configured');
    }
    
    // Check yarn resolutions
    if (packageJson.resolutions) {
        const yarnBaileys = packageJson.resolutions['@whiskeysockets/baileys'];
        if (yarnBaileys === expectedVersion) {
            console.log(`   ✅ yarn resolution for @whiskeysockets/baileys: ${yarnBaileys}`);
        } else {
            console.log(`   ❌ yarn resolution for @whiskeysockets/baileys: ${yarnBaileys} (expected: ${expectedVersion})`);
            hasErrors = true;
        }
    } else {
        console.log('   ⚠️  yarn resolutions not configured');
    }
    
    // Check scripts
    if (packageJson.scripts && packageJson.scripts['fix-baileys']) {
        console.log('   ✅ fix-baileys script found');
    } else {
        console.log('   ❌ fix-baileys script not found in package.json');
        hasErrors = true;
    }
    
} catch (error) {
    console.error(`   ❌ Error reading package.json: ${error.message}`);
    hasErrors = true;
}

// 2. Check if fix-baileys.js script exists
console.log('\n2️⃣ Checking fix-baileys.js script...');
const scriptPath = path.join(process.cwd(), 'scripts', 'fix-baileys.js');
if (fs.existsSync(scriptPath)) {
    const stats = fs.statSync(scriptPath);
    console.log(`   ✅ Script exists (${stats.size} bytes)`);
    
    // Check if executable
    try {
        fs.accessSync(scriptPath, fs.constants.X_OK);
        console.log('   ✅ Script is executable');
    } catch (err) {
        console.log('   ⚠️  Script is not executable (may need chmod +x)');
    }
} else {
    console.log('   ❌ fix-baileys.js script not found');
    hasErrors = true;
}

// 3. Check installed Baileys version (if node_modules exists)
console.log('\n3️⃣ Checking installed Baileys version...');
const baileysPath = path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys', 'package.json');
if (fs.existsSync(baileysPath)) {
    try {
        const baileysPkg = JSON.parse(fs.readFileSync(baileysPath, 'utf-8'));
        const installedVersion = baileysPkg.version;
        const expectedVersion = '6.7.8';
        
        if (installedVersion === expectedVersion) {
            console.log(`   ✅ Installed version: ${installedVersion}`);
        } else {
            console.log(`   ❌ Installed version: ${installedVersion} (expected: ${expectedVersion})`);
            console.log('   💡 Run: npm run fix-baileys');
            hasErrors = true;
        }
    } catch (error) {
        console.error(`   ❌ Error reading Baileys package.json: ${error.message}`);
        hasErrors = true;
    }
} else {
    console.log('   ⚠️  Baileys not installed yet (run npm install)');
}

// 4. Summary
console.log('\n' + '═'.repeat(50));
if (hasErrors) {
    console.log('❌ Validation FAILED - Please fix the issues above');
    console.log('\n💡 To fix the issues, run:');
    console.log('   npm run fix-baileys');
    process.exit(1);
} else {
    console.log('✅ Validation PASSED - Baileys configuration is correct');
    console.log('\n📋 Next steps:');
    console.log('   1. If not installed yet, run: npm install');
    console.log('   2. Or run the fix script: npm run fix-baileys');
    console.log('   3. Start the bot: npm run dev');
    process.exit(0);
}
