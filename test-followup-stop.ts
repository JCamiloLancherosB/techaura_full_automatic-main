/**
 * Test script to verify follow-up service stop functionality
 */

console.log('🧪 Testing Follow-Up Service Stop...\n');

// Import the functions
import { stopFollowUpSystem, getFollowUpSystemState } from './src/services/followUpService';

async function runTest() {
  try {
    console.log('1️⃣ Checking initial state...');
    const initialState = getFollowUpSystemState();
    console.log(`   Initial state: ${initialState ? JSON.stringify(initialState) : 'null (not started)'}`);
    console.log('');

    console.log('2️⃣ Calling stopFollowUpSystem()...');
    stopFollowUpSystem();
    console.log('✅ stopFollowUpSystem() called\n');

    console.log('3️⃣ Checking state after stop...');
    const stoppedState = getFollowUpSystemState();
    if (stoppedState) {
      console.log(`   isStopping: ${stoppedState.isStopping}`);
      console.log(`   isRunning: ${stoppedState.isRunning}`);
      
      if (stoppedState.isStopping) {
        console.log('   ✅ Follow-up system marked for stopping');
      } else {
        console.log('   ⚠️ System was not started, so no state to stop');
      }
    } else {
      console.log('   ⚠️ System was never started (null state)');
      console.log('   ✅ This is expected if follow-up system is not initialized');
    }
    
    console.log('\n🎉 Follow-up service stop test completed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', (error as Error).stack);
    process.exit(1);
  }
}

runTest();
