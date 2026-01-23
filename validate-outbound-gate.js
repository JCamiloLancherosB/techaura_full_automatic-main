#!/usr/bin/env node
/**
 * OutboundGate Integration Validation Script
 * Verifies that OutboundGate is properly integrated and no bypasses exist
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 OutboundGate Integration Validation\n');

const srcDir = path.join(__dirname, 'src');
let passed = 0;
let failed = 0;
let warnings = 0;

// Patterns to detect message sending
const sendPatterns = [
  {
    pattern: /botInstance\.sendMessage\(/g,
    name: 'botInstance.sendMessage()',
    severity: 'warning',
    message: 'Direct bot usage detected. Should use OutboundGate unless in core bot file.'
  },
  {
    pattern: /whatsappAPI\.sendMessage\(/g,
    name: 'whatsappAPI.sendMessage()',
    severity: 'warning',
    message: 'Direct WhatsApp API usage. Should use OutboundGate for consistency.'
  },
  {
    pattern: /client\.sendMessage\(/g,
    name: 'client.sendMessage()',
    severity: 'warning',
    message: 'Direct client usage. Should use OutboundGate.'
  }
];

// Files that are allowed to use direct sending (core infrastructure)
const allowedFiles = [
  'src/app.ts',  // Main bot file
  'src/services/OutboundGate.ts',  // The gate itself
  'src/integrations/WhatsAppAPI.ts',  // Low-level API
  'src/flows/userTrackingSystem.ts'  // Core system (complex refactoring)
];

// Files that should definitely use OutboundGate
const mustUseGate = [
  'src/services/followUpService.ts',
  'src/services/NotificationService.ts',
  'src/services/whatsappNotifications.ts'
];

// Patterns to detect OutboundGate usage
const gateUsagePatterns = [
  /outboundGate\.sendMessage\(/g,
  /createGatedFlowDynamic\(/g,
  /sendGatedMessage\(/g,
  /sendGatedCatalog\(/g,
  /sendGatedOrderMessage\(/g,
  /from\s+['"]\.\/OutboundGate['"]/g,  // Import statement
  /from\s+['"]\.\.\/services\/OutboundGate['"]/g  // Import statement
];

function isAllowedFile(filePath) {
  return allowedFiles.some(allowed => filePath.endsWith(allowed.replace(/\//g, path.sep)));
}

function shouldUseGate(filePath) {
  return mustUseGate.some(required => filePath.endsWith(required.replace(/\//g, path.sep)));
}

function hasGateUsage(content) {
  return gateUsagePatterns.some(pattern => pattern.test(content));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(process.cwd(), filePath);
  const results = [];
  
  // Check for direct sending patterns
  for (const { pattern, name, severity, message } of sendPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      const isAllowed = isAllowedFile(filePath);
      const mustUse = shouldUseGate(filePath);
      
      results.push({
        file: relativePath,
        pattern: name,
        count: matches.length,
        severity: isAllowed ? 'info' : mustUse ? 'error' : severity,
        message: isAllowed 
          ? `${name} used (allowed in core file)` 
          : mustUse 
            ? `${name} used but must use OutboundGate!`
            : message
      });
    }
  }
  
  return results;
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  const results = [];
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, dist, etc.
      if (!['node_modules', 'dist', '.git', 'assets', 'public'].includes(file)) {
        results.push(...scanDirectory(filePath));
      }
    } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js'))) {
      results.push(...scanFile(filePath));
    }
  }
  
  return results;
}

// Validate critical files use OutboundGate
console.log('📋 Checking critical files use OutboundGate...\n');

for (const requiredFile of mustUseGate) {
  const filePath = path.join(process.cwd(), requiredFile);
  
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const usesGate = hasGateUsage(content);
    
    if (usesGate) {
      console.log(`✅ ${requiredFile} uses OutboundGate`);
      passed++;
    } else {
      console.log(`❌ ${requiredFile} does NOT use OutboundGate`);
      failed++;
    }
  } else {
    console.log(`⚠️  ${requiredFile} not found`);
    warnings++;
  }
}

// Scan for direct message sending
console.log('\n🔍 Scanning for direct message sending...\n');

const scanResults = scanDirectory(srcDir);

// Group by severity
const errors = scanResults.filter(r => r.severity === 'error');
const warns = scanResults.filter(r => r.severity === 'warning');
const infos = scanResults.filter(r => r.severity === 'info');

if (errors.length > 0) {
  console.log('❌ ERRORS (Must be fixed):');
  errors.forEach(r => {
    console.log(`   ${r.file}: ${r.pattern} (${r.count}x) - ${r.message}`);
    failed++;
  });
  console.log();
}

if (warns.length > 0) {
  console.log('⚠️  WARNINGS (Should be reviewed):');
  warns.forEach(r => {
    console.log(`   ${r.file}: ${r.pattern} (${r.count}x) - ${r.message}`);
    warnings++;
  });
  console.log();
}

if (infos.length > 0) {
  console.log('ℹ️  INFO (Allowed usage):');
  infos.forEach(r => {
    console.log(`   ${r.file}: ${r.pattern} (${r.count}x) - ${r.message}`);
  });
  console.log();
}

// Summary
console.log('📊 Summary:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   ⚠️  Warnings: ${warnings}`);
console.log();

// Check if OutboundGate service exists
const gateFile = path.join(srcDir, 'services', 'OutboundGate.ts');
if (fs.existsSync(gateFile)) {
  console.log('✅ OutboundGate service exists');
  passed++;
} else {
  console.log('❌ OutboundGate service NOT found');
  failed++;
}

// Check if integration helpers exist
const helpersFile = path.join(srcDir, 'utils', 'outboundGateHelpers.ts');
if (fs.existsSync(helpersFile)) {
  console.log('✅ OutboundGate helpers exist');
  passed++;
} else {
  console.log('⚠️  OutboundGate helpers NOT found');
  warnings++;
}

// Check if integration guide exists
const guideFile = path.join(process.cwd(), 'OUTBOUND_GATE_INTEGRATION.md');
if (fs.existsSync(guideFile)) {
  console.log('✅ Integration guide exists');
  passed++;
} else {
  console.log('⚠️  Integration guide NOT found');
  warnings++;
}

console.log();

// Final verdict
if (failed === 0) {
  console.log('✅ OutboundGate integration is COMPLETE');
  console.log('   All critical services use OutboundGate.');
  if (warnings > 0) {
    console.log(`   ${warnings} file(s) could benefit from using OutboundGate.`);
    console.log('   Consider refactoring them for consistency.');
  }
  process.exit(0);
} else {
  console.log('❌ OutboundGate integration is INCOMPLETE');
  console.log(`   ${failed} critical issue(s) need to be addressed.`);
  process.exit(1);
}
