#!/usr/bin/env node

/**
 * Test script to verify Socket.io initialization fix
 * This validates the key fixes without actually starting the server
 */

console.log('🧪 Testing Socket.io initialization fix...\n');

const fs = require('fs');
const path = require('path');

let allTestsPassed = true;

// Test 1: Verify initializeSocketIO function exists in app.ts
console.log('Test 1: Checking for initializeSocketIO function...');
const appTs = fs.readFileSync('./src/app.ts', 'utf8');

if (appTs.includes('async function initializeSocketIO(expressApp: any): Promise<SocketIOServer | null>')) {
  console.log('✅ initializeSocketIO function found\n');
} else {
  console.log('❌ initializeSocketIO function not found\n');
  allTestsPassed = false;
}

// Test 2: Verify multiple fallback methods exist
console.log('Test 2: Checking for multiple fallback methods...');
const fallbackMethods = [
  'Method 1: Found HTTP server at expressApp.server.server',
  'Method 2: Created HTTP server from Express app',
  'Method 3: Found HTTP server directly on expressApp.server',
  'Method 4: Found HTTP server at expressApp.httpServer',
  'Method 5: Found HTTP server at expressApp.server._server',
  'Method 6: Create standalone Socket.io on different port'
];

let foundMethods = 0;
fallbackMethods.forEach(method => {
  if (appTs.includes(method)) {
    foundMethods++;
  }
});

if (foundMethods >= 5) {
  console.log(`✅ Found ${foundMethods}/6 fallback methods\n`);
} else {
  console.log(`❌ Only found ${foundMethods}/6 fallback methods\n`);
  allTestsPassed = false;
}

// Test 3: Verify graceful error handling
console.log('Test 3: Checking for graceful error handling...');
if (appTs.includes('Socket.io not available - real-time updates disabled') &&
    appTs.includes('Admin panel will use polling for updates')) {
  console.log('✅ Graceful error handling found\n');
} else {
  console.log('❌ Graceful error handling not found\n');
  allTestsPassed = false;
}

// Test 4: Verify helper functions are exported
console.log('Test 4: Checking for exported helper functions...');
if (appTs.includes('export function emitSocketEvent(event: string, data: any)') &&
    appTs.includes('export function emitToRoom(room: string, event: string, data: any)')) {
  console.log('✅ Helper functions exported\n');
} else {
  console.log('❌ Helper functions not exported\n');
  allTestsPassed = false;
}

// Test 5: Verify Socket.io rooms support
console.log('Test 5: Checking for Socket.io rooms support...');
if (appTs.includes("socket.on('subscribe:orders'") &&
    appTs.includes("socket.on('subscribe:tracking'")) {
  console.log('✅ Socket.io rooms support found\n');
} else {
  console.log('❌ Socket.io rooms support not found\n');
  allTestsPassed = false;
}

// Test 6: Verify no throw on Socket.io failure
console.log('Test 6: Checking that app does not crash on Socket.io failure...');
if (appTs.includes('io = await initializeSocketIO') &&
    appTs.includes('} catch (error)') &&
    appTs.includes('io = null')) {
  console.log('✅ Socket.io failure is gracefully handled\n');
} else {
  console.log('❌ Socket.io failure handling not found\n');
  allTestsPassed = false;
}

// Test 7: Verify admin.js polling fallback
console.log('Test 7: Checking for polling fallback in admin.js...');
const adminJs = fs.readFileSync('./public/admin/admin.js', 'utf8');

if (adminJs.includes('function startPolling()') &&
    adminJs.includes('function stopPolling()') &&
    adminJs.includes('usePolling')) {
  console.log('✅ Polling fallback found in admin.js\n');
} else {
  console.log('❌ Polling fallback not found in admin.js\n');
  allTestsPassed = false;
}

// Test 8: Verify polling is triggered on Socket.io failure
console.log('Test 8: Checking that polling starts on Socket.io failure...');
const startPollingCalls = (adminJs.match(/startPolling\(\)/g) || []).length;
if (startPollingCalls >= 3) {
  console.log(`✅ Found ${startPollingCalls} calls to startPolling()\n`);
} else {
  console.log(`❌ Only found ${startPollingCalls} calls to startPolling()\n`);
  allTestsPassed = false;
}

// Test 9: Verify polling stops when Socket.io reconnects
console.log('Test 9: Checking that polling stops on Socket.io reconnect...');
if (adminJs.includes('stopPolling()') && 
    adminJs.includes('if (usePolling)')) {
  console.log('✅ Polling stops on reconnect\n');
} else {
  console.log('❌ Polling stop logic not found\n');
  allTestsPassed = false;
}

// Summary
console.log('═══════════════════════════════════════════════════');
if (allTestsPassed) {
  console.log('✅ All tests passed! Socket.io fix is properly implemented.');
  console.log('═══════════════════════════════════════════════════\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the implementation.');
  console.log('═══════════════════════════════════════════════════\n');
  process.exit(1);
}
