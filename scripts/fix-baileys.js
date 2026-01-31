#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Baileys version compatibility...\n');

// 1. Remove node_modules and lock files
const toRemove = [
    'node_modules',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock'
];

for (const item of toRemove) {
    if (fs.existsSync(item)) {
        console.log(`🗑️  Removing ${item}...`);
        fs.rmSync(item, { recursive: true, force: true });
    }
}

// 2. Update package.json with correct overrides
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

// Ensure correct Baileys version
const baileysVersion = '6.7.8';

// Add/update pnpm overrides
if (!packageJson.pnpm) packageJson.pnpm = {};
if (!packageJson.pnpm.overrides) packageJson.pnpm.overrides = {};
packageJson.pnpm.overrides['baileys'] = baileysVersion;
packageJson.pnpm.overrides['@whiskeysockets/baileys'] = baileysVersion;

// Add/update npm overrides
if (!packageJson.overrides) packageJson.overrides = {};
packageJson.overrides['baileys'] = baileysVersion;
packageJson.overrides['@whiskeysockets/baileys'] = baileysVersion;

// Add/update yarn resolutions
if (!packageJson.resolutions) packageJson.resolutions = {};
packageJson.resolutions['baileys'] = baileysVersion;
packageJson.resolutions['@whiskeysockets/baileys'] = baileysVersion;

// Write updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log(`✅ Updated package.json with Baileys version ${baileysVersion}`);

// 3. Reinstall dependencies
console.log('\n📦 Reinstalling dependencies...');
try {
    // Detect package manager from environment or default to npm
    const userAgent = process.env.npm_config_user_agent || '';
    let packageManager = 'npm';
    
    if (userAgent.includes('pnpm')) {
        packageManager = 'pnpm';
    } else if (userAgent.includes('yarn')) {
        packageManager = 'yarn';
    }
    
    console.log(`   Using package manager: ${packageManager}`);
    
    if (packageManager === 'pnpm') {
        execSync('pnpm install --no-frozen-lockfile', { stdio: 'inherit' });
    } else if (packageManager === 'yarn') {
        execSync('yarn install', { stdio: 'inherit' });
    } else {
        execSync('npm install', { stdio: 'inherit' });
    }
    console.log('\n✅ Dependencies installed successfully!');
} catch (error) {
    console.error('\n❌ Error installing dependencies:', error.message);
    process.exit(1);
}

// 4. Verify Baileys version
console.log('\n🔍 Verifying Baileys installation...');
try {
    const baileysPath = path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys', 'package.json');
    if (fs.existsSync(baileysPath)) {
        const baileysPkg = JSON.parse(fs.readFileSync(baileysPath, 'utf-8'));
        console.log(`   @whiskeysockets/baileys version: ${baileysPkg.version}`);
        
        if (baileysPkg.version === baileysVersion) {
            console.log('   ✅ Correct version installed!');
        } else {
            console.log(`   ⚠️  Warning: Expected ${baileysVersion}, got ${baileysPkg.version}`);
        }
    }
    
    // Also check for old baileys package
    const oldBaileysPath = path.join(process.cwd(), 'node_modules', 'baileys', 'package.json');
    if (fs.existsSync(oldBaileysPath)) {
        const oldBaileysPkg = JSON.parse(fs.readFileSync(oldBaileysPath, 'utf-8'));
        console.log(`   baileys version: ${oldBaileysPkg.version}`);
    }
} catch (error) {
    console.error('   Error checking Baileys version:', error.message);
}

// 5. Clean WhatsApp sessions
console.log('\n🧹 Cleaning WhatsApp sessions...');
const sessionDirs = fs.readdirSync('.').filter(f => 
    f.startsWith('baileys_store_') || 
    f === 'bot_sessions' ||
    f === 'baileys.log'
);

for (const dir of sessionDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`   Removed: ${dir}`);
}

console.log('\n✅ Fix complete!\n');
console.log('📋 Next steps:');
console.log('   1. Run: npm run dev (or pnpm dev)');
console.log('   2. Open: http://localhost:3009/auth');
console.log('   3. Scan the QR code with WhatsApp\n');
