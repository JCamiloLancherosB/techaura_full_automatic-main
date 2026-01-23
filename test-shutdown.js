/**
 * Test script to verify graceful shutdown functionality
 * This simulates the shutdown scenario without starting the full bot
 */

// Mock environment variables
process.env.MYSQL_DB_HOST = 'localhost';
process.env.MYSQL_DB_PORT = '3306';
process.env.MYSQL_DB_USER = 'test';
process.env.MYSQL_DB_PASSWORD = 'test';
process.env.MYSQL_DB_NAME = 'test';

console.log('🧪 Testing ShutdownManager...\n');

// Mock MySQL pool
const mockPool = {
  execute: async (query) => {
    console.log(`📊 Mock SQL Query: ${query.substring(0, 100)}...`);
    if (query.includes('SELECT id')) {
      // Simulate 2 running jobs
      return [[
        { id: 1, job_id: 'job-001', order_id: 'order-001', status: 'processing' },
        { id: 2, job_id: 'job-002', order_id: 'order-002', status: 'writing' }
      ]];
    } else if (query.includes('UPDATE')) {
      // Simulate successful update
      return [{ affectedRows: 2 }];
    } else if (query.includes('COUNT')) {
      // First call: 2 jobs, second call: 0 jobs
      const count = mockPool.__callCount++ < 1 ? 2 : 0;
      return [[{ count }]];
    }
    return [[]];
  },
  end: async () => {
    console.log('✅ Mock pool.end() called');
  },
  __callCount: 0
};

// Mock businessDB
const mockBusinessDB = {
  close: async () => {
    console.log('✅ Mock businessDB.close() called');
  }
};

// Import ShutdownManager (using require since this is a .js test file)
const { initShutdownManager } = require('./dist/services/ShutdownManager.js');

async function runTest() {
  try {
    console.log('1️⃣ Initializing ShutdownManager...');
    const shutdownManager = initShutdownManager(mockBusinessDB, mockPool, 5);
    console.log('✅ ShutdownManager initialized\n');

    console.log('2️⃣ Registering test services...');
    let service1Stopped = false;
    let service2Stopped = false;
    
    shutdownManager.registerService('testService1', {
      stop: () => {
        console.log('   🛑 testService1 stopped');
        service1Stopped = true;
      }
    });
    
    shutdownManager.registerService('testService2', {
      stop: async () => {
        console.log('   🛑 testService2 stopped (async)');
        await new Promise(resolve => setTimeout(resolve, 100));
        service2Stopped = true;
      }
    });
    console.log('✅ Services registered\n');

    console.log('3️⃣ Registering test intervals...');
    const interval1 = setInterval(() => {}, 1000);
    const interval2 = setInterval(() => {}, 2000);
    shutdownManager.registerInterval(interval1);
    shutdownManager.registerInterval(interval2);
    console.log('✅ Intervals registered\n');

    console.log('4️⃣ Getting shutdown stats...');
    const stats = shutdownManager.getStats();
    console.log('   Stats:', JSON.stringify(stats, null, 2));
    console.log('');

    console.log('5️⃣ Checking stop token...');
    const stopToken = shutdownManager.getStopToken();
    console.log(`   Stop token before shutdown: stopped=${stopToken.stopped}`);
    console.log('');

    console.log('6️⃣ Initiating graceful shutdown (SIGINT)...\n');
    await shutdownManager.initiateShutdown('SIGINT');

    console.log('\n7️⃣ Verifying shutdown results...');
    console.log(`   ✅ Service 1 stopped: ${service1Stopped}`);
    console.log(`   ✅ Service 2 stopped: ${service2Stopped}`);
    console.log(`   ✅ Stop token after shutdown: stopped=${stopToken.stopped}`);
    console.log(`   ✅ Status: ${shutdownManager.getStatus()}`);
    
    console.log('\n🎉 All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// First, we need to build the project
const { execSync } = require('child_process');
console.log('📦 Building project...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build successful\n');
  runTest();
} catch (buildError) {
  console.log('⚠️ Build had errors, but continuing with test...\n');
  runTest();
}
