#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔄 Resetting WhatsApp session...\n');

// Find and remove all session directories
const rootDir = process.cwd();
const items = fs.readdirSync(rootDir);

const sessionPatterns = [
    /^baileys_store_/,
    /^bot_sessions$/,
    /^baileys\.log$/,
    /^auth_info/
];

let removed = 0;

for (const item of items) {
    for (const pattern of sessionPatterns) {
        if (pattern.test(item)) {
            const fullPath = path.join(rootDir, item);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(fullPath);
                }
                console.log(`✅ Removed: ${item}`);
                removed++;
            } catch (error) {
                console.error(`❌ Failed to remove ${item}:`, error.message);
            }
            break;
        }
    }
}

if (removed === 0) {
    console.log('ℹ️ No session files found to remove.');
} else {
    console.log(`\n✅ Removed ${removed} session file(s)/folder(s).`);
}

console.log('\n📋 Next steps:');
console.log('   1. Run: npm run dev');
console.log('   2. Open: http://localhost:3009/auth');
console.log('   3. Scan the QR code with WhatsApp\n');
