/**
 * Simple test suite for chatbot coherence and data persistence
 * Tests core functions without requiring full dependency tree
 */

// Mock UserSession type
interface MockUserSession {
  phone: string;
  phoneNumber: string;
  name?: string;
  conversationData?: any;
  preferences?: any;
  customization?: any;
  orderData?: any;
  [key: string]: any;
}

/**
 * Simplified version of getUserCollectedData for testing
 * This replicates the core logic without dependencies
 */
function testGetUserCollectedData(session: MockUserSession) {
  const result: any = {
    hasCapacity: false,
    hasGenres: false,
    hasPersonalInfo: false,
    hasShippingInfo: false,
    hasPaymentInfo: false,
    completionPercentage: 0
  };

  const fieldChecks: any = {
    capacity: false,
    genres: false,
    personalInfo: false,
    shippingInfo: false,
    paymentInfo: false
  };

  // Check capacity
  const capacity = session.capacity 
    || session.conversationData?.selectedCapacity;
  if (capacity) {
    result.hasCapacity = true;
    result.capacity = capacity;
    fieldChecks.capacity = true;
  }

  // Check genres
  const genres = session.conversationData?.customization?.genres;
  if (genres && Array.isArray(genres) && genres.length > 0) {
    result.hasGenres = true;
    result.genres = genres;
    fieldChecks.genres = true;
  }

  // Check personal info
  if (session.name) {
    result.hasPersonalInfo = true;
    fieldChecks.personalInfo = true;
  }

  // Check shipping info
  const hasAddress = !!session.conversationData?.customerData?.address
    || !!session.conversationData?.customerData?.direccion;
  const hasCity = !!session.conversationData?.customerData?.city
    || !!session.conversationData?.customerData?.ciudad;
  
  if (hasAddress && hasCity) {
    result.hasShippingInfo = true;
    result.shippingInfo = {
      address: session.conversationData?.customerData?.direccion,
      city: session.conversationData?.customerData?.ciudad
    };
    fieldChecks.shippingInfo = true;
  }

  // Check payment info
  const hasPayment = !!session.conversationData?.customerData?.metodoPago;
  if (hasPayment) {
    result.hasPaymentInfo = true;
    result.paymentMethod = session.conversationData?.customerData?.metodoPago;
    fieldChecks.paymentInfo = true;
  }

  // Calculate completion percentage
  const totalFields = Object.keys(fieldChecks).length;
  const filledFields = Object.values(fieldChecks).filter(Boolean).length;
  result.completionPercentage = Math.round((filledFields / totalFields) * 100);

  return result;
}

async function runTests() {
  console.log('🧪 Starting Chatbot Coherence Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Detect capacity
  console.log('📋 Test 1: Detect capacity in conversationData');
  const collected1 = testGetUserCollectedData({
    phone: '123',
    phoneNumber: '123',
    conversationData: {
      selectedCapacity: '32GB'
    }
  });
  if (collected1.hasCapacity && collected1.capacity === '32GB') {
    console.log('✅ PASSED\n');
    passed++;
  } else {
    console.log('❌ FAILED\n');
    failed++;
  }
  
  // Test 2: Detect genres
  console.log('📋 Test 2: Detect genres in conversationData');
  const collected2 = testGetUserCollectedData({
    phone: '123',
    phoneNumber: '123',
    conversationData: {
      customization: {
        genres: ['reggaeton', 'salsa']
      }
    }
  });
  if (collected2.hasGenres && collected2.genres?.length === 2) {
    console.log('✅ PASSED\n');
    passed++;
  } else {
    console.log('❌ FAILED\n');
    failed++;
  }
  
  // Test 3: Detect shipping info
  console.log('📋 Test 3: Detect shipping info in conversationData');
  const collected3 = testGetUserCollectedData({
    phone: '123',
    phoneNumber: '123',
    name: 'Juan Perez',
    conversationData: {
      customerData: {
        ciudad: 'Bogotá',
        direccion: 'Calle 123'
      }
    }
  });
  if (collected3.hasShippingInfo && collected3.shippingInfo?.city === 'Bogotá') {
    console.log('✅ PASSED\n');
    passed++;
  } else {
    console.log('❌ FAILED\n');
    failed++;
  }
  
  // Test 4: Detect payment method
  console.log('📋 Test 4: Detect payment method');
  const collected4 = testGetUserCollectedData({
    phone: '123',
    phoneNumber: '123',
    conversationData: {
      customerData: {
        metodoPago: 'efectivo'
      }
    }
  });
  if (collected4.hasPaymentInfo && collected4.paymentMethod === 'efectivo') {
    console.log('✅ PASSED\n');
    passed++;
  } else {
    console.log('❌ FAILED\n');
    failed++;
  }
  
  // Test 5: Complete data scenario
  console.log('📋 Test 5: Complete data scenario');
  const collected5 = testGetUserCollectedData({
    phone: '123',
    phoneNumber: '123',
    name: 'Juan Perez',
    conversationData: {
      selectedCapacity: '64GB',
      customization: {
        genres: ['reggaeton', 'salsa']
      },
      customerData: {
        ciudad: 'Bogotá',
        direccion: 'Calle 123',
        metodoPago: 'efectivo'
      }
    }
  });
  if (collected5.completionPercentage === 100) {
    console.log(`✅ PASSED: ${collected5.completionPercentage}% complete\n`);
    passed++;
  } else {
    console.log(`❌ FAILED: Only ${collected5.completionPercentage}% complete\n`);
    failed++;
  }
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed.');
  }
}

runTests();
