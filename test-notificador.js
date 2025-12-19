// test-notificador.js
// Node.js test script for Notificador integration
// Usage: node test-notificador.js

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3006';
const TEST_PHONE = process.env.TEST_PHONE || '573008602789';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@techaura.com';
const TEST_NAME = process.env.TEST_NAME || 'Test User';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, method, endpoint, data = null) {
  try {
    log(`\n📝 Testing: ${name}`, 'blue');
    
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    if (response.status >= 200 && response.status < 300) {
      log(`✅ Success (HTTP ${response.status})`, 'green');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    }
  } catch (error) {
    log(`❌ Failed: ${error.message}`, 'red');
    if (error.response) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function runTests() {
  log('========================================', 'blue');
  log('  Notificador Integration Test Suite', 'blue');
  log('========================================', 'blue');
  
  log(`\nConfiguration:`, 'yellow');
  log(`  Base URL: ${BASE_URL}`, 'yellow');
  log(`  Test Phone: ${TEST_PHONE}`, 'yellow');
  log(`  Test Email: ${TEST_EMAIL}`, 'yellow');
  
  const results = [];
  
  // Test 1: Configuration Status
  log('\n========================================', 'blue');
  log('Test 1: Configuration Status', 'blue');
  log('========================================', 'blue');
  results.push(await testEndpoint(
    'Get Configuration',
    'GET',
    '/api/notifications/config'
  ));
  
  // Test 2: Health Check
  log('\n========================================', 'blue');
  log('Test 2: Health Check', 'blue');
  log('========================================', 'blue');
  results.push(await testEndpoint(
    'Check Service Health',
    'GET',
    '/api/notifications/health'
  ));
  
  // Test 3: WhatsApp Test Notification
  log('\n========================================', 'blue');
  log('Test 3: WhatsApp Test Notification', 'blue');
  log('========================================', 'blue');
  results.push(await testEndpoint(
    'Send WhatsApp Test',
    'POST',
    '/api/notifications/test',
    {
      channel: 'whatsapp',
      phone: TEST_PHONE,
      name: TEST_NAME
    }
  ));
  
  // Test 4: Email Test Notification
  log('\n========================================', 'blue');
  log('Test 4: Email Test Notification', 'blue');
  log('========================================', 'blue');
  results.push(await testEndpoint(
    'Send Email Test',
    'POST',
    '/api/notifications/test',
    {
      channel: 'email',
      email: TEST_EMAIL,
      name: TEST_NAME
    }
  ));
  
  // Test 5: SMS Test Notification
  log('\n========================================', 'blue');
  log('Test 5: SMS Test Notification', 'blue');
  log('========================================', 'blue');
  results.push(await testEndpoint(
    'Send SMS Test',
    'POST',
    '/api/notifications/test',
    {
      channel: 'sms',
      phone: TEST_PHONE,
      name: TEST_NAME
    }
  ));
  
  // Test 6: Get Templates
  log('\n========================================', 'blue');
  log('Test 6: Get Templates', 'blue');
  log('========================================', 'blue');
  results.push(await testEndpoint(
    'List Templates',
    'GET',
    '/api/notifications/templates'
  ));
  
  // Test 7: Get History
  log('\n========================================', 'blue');
  log('Test 7: Get Notification History', 'blue');
  log('========================================', 'blue');
  results.push(await testEndpoint(
    'Get History',
    'GET',
    '/api/notifications/history?limit=5'
  ));
  
  // Summary
  log('\n========================================', 'blue');
  log('Test Suite Complete', 'blue');
  log('========================================', 'blue');
  
  const passed = results.filter(r => r).length;
  const failed = results.length - passed;
  
  log(`\nResults:`, 'yellow');
  log(`  ✅ Passed: ${passed}`, passed > 0 ? 'green' : 'reset');
  log(`  ❌ Failed: ${failed}`, failed > 0 ? 'red' : 'reset');
  log(`  📊 Total: ${results.length}`, 'blue');
  
  if (failed === 0) {
    log(`\n🎉 All tests passed!`, 'green');
    log(`\nNext steps:`, 'yellow');
    log(`  1. Visit ${BASE_URL}/notifications/ to view the admin panel`, 'yellow');
    log(`  2. Check your phone (${TEST_PHONE}) and email (${TEST_EMAIL}) for test messages`, 'yellow');
    log(`  3. Review the notification history`, 'yellow');
  } else {
    log(`\n⚠️  Some tests failed. Please check the logs above for details.`, 'red');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  log(`\n💥 Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
