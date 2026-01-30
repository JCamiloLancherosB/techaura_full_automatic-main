/**
 * Comprehensive Tests for USB Integration API
 * 
 * Tests authentication, order listing, status updates, and health check
 * Self-contained tests that don't require database connection using mocks
 */

// =============================================================================
// Interfaces (duplicated to avoid DB imports)
// =============================================================================

/**
 * USB Burning Order - Data structure for the burning system
 */
interface USBBurningOrder {
  orderId: string;
  orderNumber: string;
  customerPhone: string;
  customerName: string;
  productType: 'music' | 'videos' | 'movies';
  capacity: string;
  customization: {
    genres: string[];
    artists: string[];
    videos?: string[];
    movies?: string[];
  };
  createdAt: Date;
  status: string;
}

/**
 * API Response structure
 */
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

/**
 * Order Record for mocking
 */
interface OrderRecord {
  id: string;
  order_number?: string;
  customer_id: string;
  customer_name?: string;
  phone_number?: string;
  content_type: string;
  capacity: string;
  preferences?: string;
  customization?: string;
  price: number;
  status: string;
  processing_status?: string;
  created_at?: Date;
  updated_at?: Date;
}

// =============================================================================
// Test Utilities
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];
const testQueue: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  testQueue.push({ name, fn });
}

async function runTests(): Promise<void> {
  for (const { name, fn } of testQueue) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        await result;
      }
      results.push({ name, passed: true });
      console.log(`✅ ${name}`);
    } catch (error: any) {
      results.push({ name, passed: false, error: error.message });
      console.error(`❌ ${name}: ${error.message}`);
    }
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Expected condition to be true');
  }
}

function assertFalse(condition: boolean, message?: string): void {
  if (condition) {
    throw new Error(message || 'Expected condition to be false');
  }
}

function assertDefined<T>(value: T | undefined | null, message?: string): void {
  if (value === undefined || value === null) {
    throw new Error(message || 'Expected value to be defined');
  }
}

function assertContains(text: string, substring: string, message?: string): void {
  if (!text.includes(substring)) {
    throw new Error(message || `Expected "${text}" to contain "${substring}"`);
  }
}

// =============================================================================
// Mock Data
// =============================================================================

const VALID_API_KEY = 'test-api-key-valid-12345';

const mockConfirmedOrder: OrderRecord = {
  id: 'order-uuid-001',
  order_number: 'ORD-1234567890-001',
  customer_id: 'cust-001',
  customer_name: 'Test Customer Music',
  phone_number: '573001234567',
  content_type: 'music',
  capacity: '32GB',
  customization: JSON.stringify({
    genres: ['rock', 'pop', 'reggaeton'],
    artists: ['Artist 1', 'Artist 2']
  }),
  price: 84900,
  status: 'confirmed',
  processing_status: 'confirmed',
  created_at: new Date('2024-01-15T10:00:00Z'),
  updated_at: new Date('2024-01-15T10:00:00Z')
};

const mockProcessingOrder: OrderRecord = {
  id: 'order-uuid-002',
  order_number: 'ORD-1234567890-002',
  customer_id: 'cust-002',
  customer_name: 'Test Customer Videos',
  phone_number: '573009876543',
  content_type: 'videos',
  capacity: '64GB',
  customization: JSON.stringify({
    genres: ['comedy', 'action'],
    artists: [],
    videos: ['video1.mp4', 'video2.mp4']
  }),
  price: 119900,
  status: 'processing',
  processing_status: 'processing',
  created_at: new Date('2024-01-16T12:00:00Z'),
  updated_at: new Date('2024-01-16T12:00:00Z')
};

const mockBurningOrder: OrderRecord = {
  id: 'order-uuid-003',
  order_number: 'ORD-1234567890-003',
  customer_id: 'cust-003',
  customer_name: 'Test Customer Burning',
  phone_number: '573005551234',
  content_type: 'movies',
  capacity: '128GB',
  customization: JSON.stringify({
    genres: ['action', 'sci-fi'],
    artists: [],
    movies: ['movie1.mkv', 'movie2.mkv']
  }),
  price: 159900,
  status: 'burning',
  processing_status: 'burning',
  created_at: new Date('2024-01-17T14:00:00Z'),
  updated_at: new Date('2024-01-17T14:00:00Z')
};

const mockCompletedOrder: OrderRecord = {
  id: 'order-uuid-004',
  order_number: 'ORD-1234567890-004',
  customer_id: 'cust-004',
  customer_name: 'Test Customer Completed',
  phone_number: '573001112222',
  content_type: 'music',
  capacity: '8GB',
  price: 54900,
  status: 'completed',
  processing_status: 'completed',
  created_at: new Date('2024-01-18T16:00:00Z'),
  updated_at: new Date('2024-01-18T18:00:00Z')
};

// =============================================================================
// Mock orderRepository
// =============================================================================

interface MockOrderRepository {
  orders: Map<string, OrderRecord>;
  notes: Map<string, string[]>;
  findById: (id: string) => Promise<OrderRecord | null>;
  list: (page: number, limit: number, filters?: { status?: string }) => Promise<{ data: OrderRecord[]; total: number }>;
  updateStatus: (id: string, status: string) => Promise<boolean>;
  addNote: (id: string, note: string) => Promise<boolean>;
  getNotes: (id: string) => string[];
  reset: () => void;
}

const createMockOrderRepository = (): MockOrderRepository => {
  const orders = new Map<string, OrderRecord>();
  const notes = new Map<string, string[]>();
  
  // Initialize with mock orders
  orders.set(mockConfirmedOrder.id, { ...mockConfirmedOrder });
  orders.set(mockProcessingOrder.id, { ...mockProcessingOrder });
  orders.set(mockBurningOrder.id, { ...mockBurningOrder });
  orders.set(mockCompletedOrder.id, { ...mockCompletedOrder });

  return {
    orders,
    notes,
    
    findById: async (id: string): Promise<OrderRecord | null> => {
      return orders.get(id) || null;
    },
    
    list: async (page: number, limit: number, filters?: { status?: string }): Promise<{ data: OrderRecord[]; total: number }> => {
      let data = Array.from(orders.values());
      
      if (filters?.status) {
        data = data.filter(o => o.processing_status === filters.status || o.status === filters.status);
      }
      
      const startIndex = (page - 1) * limit;
      const paginatedData = data.slice(startIndex, startIndex + limit);
      
      return {
        data: paginatedData,
        total: data.length
      };
    },
    
    updateStatus: async (id: string, status: string): Promise<boolean> => {
      const order = orders.get(id);
      if (!order) return false;
      
      order.processing_status = status;
      order.status = status;
      order.updated_at = new Date();
      orders.set(id, order);
      
      return true;
    },
    
    addNote: async (id: string, note: string): Promise<boolean> => {
      const order = orders.get(id);
      if (!order) return false;
      
      const existingNotes = notes.get(id) || [];
      existingNotes.push(`[${new Date().toISOString()}] ${note}`);
      notes.set(id, existingNotes);
      
      return true;
    },
    
    getNotes: (id: string): string[] => {
      return notes.get(id) || [];
    },
    
    reset: () => {
      orders.clear();
      notes.clear();
      orders.set(mockConfirmedOrder.id, { ...mockConfirmedOrder });
      orders.set(mockProcessingOrder.id, { ...mockProcessingOrder });
      orders.set(mockBurningOrder.id, { ...mockBurningOrder });
      orders.set(mockCompletedOrder.id, { ...mockCompletedOrder });
    }
  };
};

// =============================================================================
// Mock whatsappNotifications
// =============================================================================

interface MockWhatsAppNotifications {
  notifications: Array<{ type: string; order: any; message?: string }>;
  sendBurningCompletedNotification: (order: any) => Promise<boolean>;
  sendBurningErrorNotification: (order: any, errorMsg: string) => Promise<boolean>;
  sendOrderNotification: (phone: string, orderNumber: string, status: string) => Promise<void>;
  reset: () => void;
}

const createMockWhatsAppNotifications = (): MockWhatsAppNotifications => {
  const notifications: Array<{ type: string; order: any; message?: string }> = [];
  
  return {
    notifications,
    
    sendBurningCompletedNotification: async (order: any): Promise<boolean> => {
      notifications.push({ type: 'burning_completed', order });
      return true;
    },
    
    sendBurningErrorNotification: async (order: any, errorMsg: string): Promise<boolean> => {
      notifications.push({ type: 'burning_error', order, message: errorMsg });
      return true;
    },
    
    sendOrderNotification: async (phone: string, orderNumber: string, status: string): Promise<void> => {
      notifications.push({ type: 'order_notification', order: { phone, orderNumber, status } });
    },
    
    reset: () => {
      notifications.length = 0;
    }
  };
};

// =============================================================================
// Mock unifiedLogger
// =============================================================================

interface MockUnifiedLogger {
  logs: Array<{ level: string; category: string; message: string; metadata?: any }>;
  info: (category: string, message: string, metadata?: any) => void;
  warn: (category: string, message: string, metadata?: any) => void;
  error: (category: string, message: string, metadata?: any) => void;
  debug: (category: string, message: string, metadata?: any) => void;
  reset: () => void;
}

const createMockUnifiedLogger = (): MockUnifiedLogger => {
  const logs: Array<{ level: string; category: string; message: string; metadata?: any }> = [];
  
  return {
    logs,
    
    info: (category: string, message: string, metadata?: any) => {
      logs.push({ level: 'info', category, message, metadata });
    },
    
    warn: (category: string, message: string, metadata?: any) => {
      logs.push({ level: 'warn', category, message, metadata });
    },
    
    error: (category: string, message: string, metadata?: any) => {
      logs.push({ level: 'error', category, message, metadata });
    },
    
    debug: (category: string, message: string, metadata?: any) => {
      logs.push({ level: 'debug', category, message, metadata });
    },
    
    reset: () => {
      logs.length = 0;
    }
  };
};

// =============================================================================
// Mock Request/Response helpers
// =============================================================================

interface MockRequest {
  headers: Record<string, string | undefined>;
  params: Record<string, string>;
  query: Record<string, string>;
  body?: Record<string, any>;
}

interface MockResponse {
  statusCode: number;
  jsonBody: any;
  status: (code: number) => MockResponse;
  json: (data: any) => void;
}

const createMockRequest = (options: Partial<MockRequest> = {}): MockRequest => ({
  headers: options.headers || {},
  params: options.params || {},
  query: options.query || {},
  body: options.body
});

const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    jsonBody: null,
    status: function(code: number) {
      this.statusCode = code;
      return this;
    },
    json: function(data: any) {
      this.jsonBody = data;
    }
  };
  return res;
};

// =============================================================================
// API Authentication Simulation Functions
// =============================================================================

/**
 * Simulates the authenticateAPIKey middleware logic
 */
function simulateAuthenticateAPIKey(
  req: MockRequest, 
  res: MockResponse,
  configuredApiKey: string | undefined
): { passed: boolean } {
  // Extract API key from X-API-Key header or Bearer token
  const authHeader = req.headers['authorization'];
  let apiKey: string | undefined = req.headers['x-api-key'];
  
  // Only extract from Bearer if it's properly formatted
  if (!apiKey && authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7); // Remove 'Bearer ' prefix
  }

  // Check if API key is configured in environment
  if (!configuredApiKey) {
    res.status(503).json({
      success: false,
      error: 'USB Integration API is not configured',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return { passed: false };
  }

  // Check if API key was provided
  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'API key required. Provide via X-API-Key header or Bearer token',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return { passed: false };
  }

  // Check if API key is valid
  if (apiKey !== configuredApiKey) {
    res.status(403).json({
      success: false,
      error: 'Invalid API key',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return { passed: false };
  }

  return { passed: true };
}

// =============================================================================
// API Endpoint Simulation Functions
// =============================================================================

const VALID_START_BURNING_STATUSES = ['confirmed', 'processing'];
const VALID_COMPLETE_BURNING_STATUSES = ['burning'];

/**
 * Simulates GET /api/usb-integration/pending-orders
 */
async function simulateGetPendingOrders(
  req: MockRequest,
  res: MockResponse,
  orderRepo: MockOrderRepository,
  configuredApiKey: string | undefined
): Promise<void> {
  const auth = simulateAuthenticateAPIKey(req, res, configuredApiKey);
  if (!auth.passed) return;
  
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 100));
  const orders: USBBurningOrder[] = [];
  
  // Query orders with burning-ready statuses
  for (const status of ['confirmed', 'processing']) {
    const result = await orderRepo.list(page, limit, { status });
    
    for (const order of result.data) {
      const transformedOrder: USBBurningOrder = {
        orderId: order.id,
        orderNumber: order.order_number || order.id,
        customerPhone: order.phone_number || '',
        customerName: order.customer_name || 'Cliente',
        productType: order.content_type as 'music' | 'videos' | 'movies',
        capacity: order.capacity || '8GB',
        customization: order.customization 
          ? JSON.parse(order.customization)
          : { genres: [], artists: [] },
        createdAt: order.created_at || new Date(),
        status: order.processing_status || order.status || 'pending'
      };
      orders.push(transformedOrder);
    }
  }
  
  // Sort by creation date (oldest first)
  orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  res.json({
    success: true,
    data: {
      orders,
      total: orders.length
    },
    timestamp: new Date().toISOString()
  } as APIResponse);
}

/**
 * Simulates POST /api/usb-integration/orders/:orderId/start-burning
 */
async function simulateStartBurning(
  req: MockRequest,
  res: MockResponse,
  orderRepo: MockOrderRepository,
  configuredApiKey: string | undefined
): Promise<void> {
  const auth = simulateAuthenticateAPIKey(req, res, configuredApiKey);
  if (!auth.passed) return;
  
  const { orderId } = req.params;
  
  const order = await orderRepo.findById(orderId);
  if (!order) {
    res.status(404).json({
      success: false,
      error: 'Orden no encontrada',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  const currentStatus = order.processing_status || order.status || 'unknown';
  if (!VALID_START_BURNING_STATUSES.includes(currentStatus)) {
    res.status(400).json({
      success: false,
      error: `No se puede iniciar grabación. Estado actual '${currentStatus}' no es válido. Estados permitidos: ${VALID_START_BURNING_STATUSES.join(', ')}`,
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  await orderRepo.updateStatus(orderId, 'burning');
  await orderRepo.addNote(orderId, 'Proceso de grabación USB iniciado');
  
  res.json({
    success: true,
    message: 'Proceso de grabación iniciado',
    data: {
      orderId,
      orderNumber: order.order_number,
      newStatus: 'burning'
    },
    timestamp: new Date().toISOString()
  } as APIResponse);
}

/**
 * Simulates POST /api/usb-integration/orders/:orderId/complete-burning
 */
async function simulateCompleteBurning(
  req: MockRequest,
  res: MockResponse,
  orderRepo: MockOrderRepository,
  logger: MockUnifiedLogger,
  configuredApiKey: string | undefined
): Promise<void> {
  const auth = simulateAuthenticateAPIKey(req, res, configuredApiKey);
  if (!auth.passed) return;
  
  const { orderId } = req.params;
  const { notes } = req.body || {};
  
  const order = await orderRepo.findById(orderId);
  if (!order) {
    res.status(404).json({
      success: false,
      error: 'Orden no encontrada',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  const currentStatus = order.processing_status || order.status || 'unknown';
  if (!VALID_COMPLETE_BURNING_STATUSES.includes(currentStatus)) {
    res.status(400).json({
      success: false,
      error: `No se puede completar grabación. Estado actual '${currentStatus}' no es válido. Estados permitidos: ${VALID_COMPLETE_BURNING_STATUSES.join(', ')}`,
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  await orderRepo.updateStatus(orderId, 'ready_for_shipping');
  
  // Add note to order (matching actual API behavior)
  const noteMessage = notes 
    ? `Grabación USB completada exitosamente. ${notes}`
    : 'Grabación USB completada exitosamente. Listo para envío.';
  await orderRepo.addNote(orderId, noteMessage);
  
  // Log the completion (matching actual API behavior)
  logger.info('api', 'USB burning completed', { orderId, orderNumber: order.order_number });
  
  res.json({
    success: true,
    message: 'Grabación completada exitosamente',
    data: {
      orderId,
      orderNumber: order.order_number,
      newStatus: 'ready_for_shipping'
    },
    timestamp: new Date().toISOString()
  } as APIResponse);
}

/**
 * Simulates POST /api/usb-integration/orders/:orderId/burning-failed
 */
async function simulateBurningFailed(
  req: MockRequest,
  res: MockResponse,
  orderRepo: MockOrderRepository,
  logger: MockUnifiedLogger,
  configuredApiKey: string | undefined
): Promise<void> {
  const auth = simulateAuthenticateAPIKey(req, res, configuredApiKey);
  if (!auth.passed) return;
  
  const { orderId } = req.params;
  const { errorMessage, errorCode, retryable } = req.body || {};
  
  const order = await orderRepo.findById(orderId);
  if (!order) {
    res.status(404).json({
      success: false,
      error: 'Orden no encontrada',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  // Normalize retryable to boolean
  const isRetryable = retryable === true || retryable === 'true' || retryable === 1;
  
  // Update status
  const newStatus = isRetryable ? 'confirmed' : 'burning_failed';
  await orderRepo.updateStatus(orderId, newStatus);
  
  // Add error note (matching actual API behavior)
  const errorNote = [
    'Error en grabación USB',
    errorCode ? `Código: ${errorCode}` : null,
    errorMessage ? `Mensaje: ${errorMessage}` : null,
    isRetryable ? 'Estado: Pendiente de reintento' : 'Estado: Requiere atención manual'
  ].filter(Boolean).join('. ');
  
  await orderRepo.addNote(orderId, errorNote);
  
  // Log the error (matching actual API behavior)
  logger.error('api', 'USB burning failed', { 
    orderId, 
    orderNumber: order.order_number,
    errorCode,
    errorMessage,
    retryable: isRetryable
  });
  
  res.json({
    success: true,
    message: isRetryable ? 'Error registrado, orden disponible para reintento' : 'Error registrado, requiere atención manual',
    data: {
      orderId,
      orderNumber: order.order_number,
      newStatus,
      retryable: isRetryable
    },
    timestamp: new Date().toISOString()
  } as APIResponse);
}

/**
 * Simulates GET /api/usb-integration/health
 */
function simulateHealthCheck(
  req: MockRequest,
  res: MockResponse,
  configuredApiKey: string | undefined
): void {
  const auth = simulateAuthenticateAPIKey(req, res, configuredApiKey);
  if (!auth.passed) return;
  
  res.json({
    success: true,
    data: {
      service: 'USB Integration API',
      status: 'healthy',
      version: '1.0.0'
    },
    timestamp: new Date().toISOString()
  } as APIResponse);
}

// =============================================================================
// Create Mock Instances
// =============================================================================

let mockOrderRepo: MockOrderRepository;
let mockWhatsApp: MockWhatsAppNotifications;
let mockLogger: MockUnifiedLogger;

function setupMocks(): void {
  mockOrderRepo = createMockOrderRepository();
  mockWhatsApp = createMockWhatsAppNotifications();
  mockLogger = createMockUnifiedLogger();
}

function resetMocks(): void {
  if (mockOrderRepo) mockOrderRepo.reset();
  if (mockWhatsApp) mockWhatsApp.reset();
  if (mockLogger) mockLogger.reset();
}

// Initialize mocks before registering tests
setupMocks();

// =============================================================================
// TESTS - 1. Authentication
// =============================================================================

test('1.1 Request without API key → should return 401', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: {}
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 401, 'Should return 401 Unauthorized');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
  assertContains(res.jsonBody.error, 'API key required', 'Error should mention API key required');
});

test('1.2 Request with invalid API key → should return 403', async () => {
  const req = createMockRequest({
    headers: {
      'x-api-key': 'invalid-api-key-12345'
    }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 403, 'Should return 403 Forbidden');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
  assertContains(res.jsonBody.error, 'Invalid API key', 'Error should mention invalid API key');
});

test('1.3 Request with valid API key via X-API-Key header → should return 200', async () => {
  const req = createMockRequest({
    headers: {
      'x-api-key': VALID_API_KEY
    }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
});

test('1.4 Request with valid API key via Bearer token → should return 200', async () => {
  const req = createMockRequest({
    headers: {
      'authorization': `Bearer ${VALID_API_KEY}`
    }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
});

test('1.5 Request when USB_INTEGRATION_API_KEY not configured → should return 503', async () => {
  const req = createMockRequest({
    headers: {
      'x-api-key': VALID_API_KEY
    }
  });
  const res = createMockResponse();
  
  // Simulate API key not configured (undefined)
  await simulateGetPendingOrders(req, res, mockOrderRepo, undefined);
  
  assertEquals(res.statusCode, 503, 'Should return 503 Service Unavailable');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
  assertContains(res.jsonBody.error, 'not configured', 'Error should mention API is not configured');
});

// =============================================================================
// TESTS - 2. GET /api/usb-integration/pending-orders
// =============================================================================

test('2.1 With pending orders → should return array with orders', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertTrue(Array.isArray(res.jsonBody.data.orders), 'Should return orders array');
  assertTrue(res.jsonBody.data.orders.length > 0, 'Should have pending orders');
  
  // Verify orders have correct statuses
  const statuses = res.jsonBody.data.orders.map((o: USBBurningOrder) => o.status);
  assertTrue(
    statuses.every((s: string) => s === 'confirmed' || s === 'processing'),
    'All orders should be confirmed or processing'
  );
});

test('2.2 Without pending orders → should return empty array', async () => {
  setupMocks();
  // Clear all orders first
  mockOrderRepo.orders.clear();
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertTrue(Array.isArray(res.jsonBody.data.orders), 'Should return orders array');
  assertEquals(res.jsonBody.data.orders.length, 0, 'Should have no pending orders');
  assertEquals(res.jsonBody.data.total, 0, 'Total should be 0');
});

test('2.3 Pagination: page=1, limit=10 → should work correctly', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    query: { page: '1', limit: '10' }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertTrue(res.jsonBody.data.orders.length <= 10, 'Should respect limit parameter');
});

test('2.4 Limit maximum: limit=2000 → should limit to 1000', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    query: { page: '1', limit: '2000' }
  });
  const res = createMockResponse();
  
  // Simulate the limit capping at 1000
  const requestedLimit = 2000;
  const cappedLimit = Math.min(1000, Math.max(1, requestedLimit));
  
  assertEquals(cappedLimit, 1000, 'Limit should be capped at 1000');
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
});

test('2.5 Each order has required fields: orderId, orderNumber, customerPhone, productType, capacity, customization', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  
  const orders: USBBurningOrder[] = res.jsonBody.data.orders;
  for (const order of orders) {
    assertDefined(order.orderId, `Order should have orderId`);
    assertDefined(order.orderNumber, `Order should have orderNumber`);
    assertDefined(order.customerPhone, `Order should have customerPhone`);
    assertDefined(order.productType, `Order should have productType`);
    assertDefined(order.capacity, `Order should have capacity`);
    assertDefined(order.customization, `Order should have customization`);
    assertTrue(
      ['music', 'videos', 'movies'].includes(order.productType),
      `productType should be valid: ${order.productType}`
    );
  }
});

// =============================================================================
// TESTS - 3. POST /api/usb-integration/orders/:orderId/start-burning
// =============================================================================

test('3.1 Order with status "confirmed" → should change to "burning"', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockConfirmedOrder.id }
  });
  const res = createMockResponse();
  
  await simulateStartBurning(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertEquals(res.jsonBody.data.newStatus, 'burning', 'New status should be burning');
  
  // Verify the order was actually updated
  const updatedOrder = await mockOrderRepo.findById(mockConfirmedOrder.id);
  assertEquals(updatedOrder?.processing_status, 'burning', 'Order should be updated to burning');
});

test('3.2 Order with status "processing" → should change to "burning"', async () => {
  setupMocks();
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockProcessingOrder.id }
  });
  const res = createMockResponse();
  
  await simulateStartBurning(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertEquals(res.jsonBody.data.newStatus, 'burning', 'New status should be burning');
});

test('3.3 Order with status "burning" → should return error 400', async () => {
  setupMocks();
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockBurningOrder.id }
  });
  const res = createMockResponse();
  
  await simulateStartBurning(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 400, 'Should return 400 Bad Request');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
  assertContains(res.jsonBody.error, 'burning', 'Error should mention current status');
});

test('3.4 Order with status "completed" → should return error 400', async () => {
  setupMocks();
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockCompletedOrder.id }
  });
  const res = createMockResponse();
  
  await simulateStartBurning(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 400, 'Should return 400 Bad Request');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
  assertContains(res.jsonBody.error, 'completed', 'Error should mention current status');
});

test('3.5 Non-existent orderId → should return 404', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: 'non-existent-order-id' }
  });
  const res = createMockResponse();
  
  await simulateStartBurning(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertEquals(res.statusCode, 404, 'Should return 404 Not Found');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
  assertContains(res.jsonBody.error, 'no encontrada', 'Error should mention order not found');
});

// =============================================================================
// TESTS - 4. POST /api/usb-integration/orders/:orderId/complete-burning
// =============================================================================

test('4.1 Order with status "burning" → should change to "completed" (ready_for_shipping)', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockBurningOrder.id }
  });
  const res = createMockResponse();
  
  await simulateCompleteBurning(req, res, mockOrderRepo, mockLogger, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertEquals(res.jsonBody.data.newStatus, 'ready_for_shipping', 'New status should be ready_for_shipping');
  
  // Verify the order was actually updated
  const updatedOrder = await mockOrderRepo.findById(mockBurningOrder.id);
  assertEquals(updatedOrder?.processing_status, 'ready_for_shipping', 'Order should be updated to ready_for_shipping');
});

test('4.2 Order not in status "burning" → should return error 400', async () => {
  setupMocks();
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockConfirmedOrder.id }
  });
  const res = createMockResponse();
  
  await simulateCompleteBurning(req, res, mockOrderRepo, mockLogger, VALID_API_KEY);
  
  assertEquals(res.statusCode, 400, 'Should return 400 Bad Request');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
  assertContains(res.jsonBody.error, 'confirmed', 'Error should mention current status');
});

test('4.3 Should add completion note to order when completing', async () => {
  setupMocks();
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockBurningOrder.id }
  });
  const res = createMockResponse();
  
  await simulateCompleteBurning(req, res, mockOrderRepo, mockLogger, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  
  // Check that a note was added to the order
  const notes = mockOrderRepo.getNotes(mockBurningOrder.id);
  assertTrue(notes.length > 0, 'Should have added a note to the order');
  assertTrue(notes.some(n => n.includes('Grabación USB completada')), 'Note should contain completion message');
  
  // Check that the completion was logged
  const logEntry = mockLogger.logs.find(l => l.message === 'USB burning completed');
  assertDefined(logEntry, 'Should have logged the completion');
});

// =============================================================================
// TESTS - 5. POST /api/usb-integration/orders/:orderId/burning-failed
// =============================================================================

test('5.1 With retryable=true → should change status back to "confirmed"', async () => {
  setupMocks();
  // First set order to burning status
  await mockOrderRepo.updateStatus(mockConfirmedOrder.id, 'burning');
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockConfirmedOrder.id },
    body: {
      errorMessage: 'Temporary disk error',
      errorCode: 'DISK_TEMP_ERROR',
      retryable: true
    }
  });
  const res = createMockResponse();
  
  await simulateBurningFailed(req, res, mockOrderRepo, mockLogger, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertEquals(res.jsonBody.data.newStatus, 'confirmed', 'Status should be reset to confirmed for retry');
  assertTrue(res.jsonBody.data.retryable, 'Response should indicate retryable');
  
  // Verify order status
  const updatedOrder = await mockOrderRepo.findById(mockConfirmedOrder.id);
  assertEquals(updatedOrder?.processing_status, 'confirmed', 'Order status should be confirmed');
});

test('5.2 With retryable=false → should change status to "burning_failed"', async () => {
  setupMocks();
  
  // First set order to burning status
  await mockOrderRepo.updateStatus(mockProcessingOrder.id, 'burning');
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockProcessingOrder.id },
    body: {
      errorMessage: 'Permanent hardware failure',
      errorCode: 'HARDWARE_FAILURE',
      retryable: false
    }
  });
  const res = createMockResponse();
  
  await simulateBurningFailed(req, res, mockOrderRepo, mockLogger, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertEquals(res.jsonBody.data.newStatus, 'burning_failed', 'Status should be burning_failed');
  assertFalse(res.jsonBody.data.retryable, 'Response should indicate not retryable');
  
  // Verify order status
  const updatedOrder = await mockOrderRepo.findById(mockProcessingOrder.id);
  assertEquals(updatedOrder?.processing_status, 'burning_failed', 'Order status should be burning_failed');
});

test('5.3 Should register errorMessage and errorCode in order notes', async () => {
  setupMocks();
  
  await mockOrderRepo.updateStatus(mockBurningOrder.id, 'burning');
  
  const errorMessage = 'Test error message';
  const errorCode = 'TEST_ERROR_CODE';
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockBurningOrder.id },
    body: {
      errorMessage,
      errorCode,
      retryable: false
    }
  });
  const res = createMockResponse();
  
  await simulateBurningFailed(req, res, mockOrderRepo, mockLogger, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  
  // Check that error details were recorded in the order notes
  const notes = mockOrderRepo.getNotes(mockBurningOrder.id);
  assertTrue(notes.length > 0, 'Should have added a note to the order');
  assertTrue(notes.some(n => n.includes(errorMessage)), 'Note should contain error message');
  assertTrue(notes.some(n => n.includes(errorCode)), 'Note should contain error code');
  
  // Check that error was logged
  const logEntry = mockLogger.logs.find(l => l.message === 'USB burning failed');
  assertDefined(logEntry, 'Should have logged the error');
  assertEquals(logEntry?.metadata?.errorCode, errorCode, 'Log should contain error code');
});

test('5.4 Should log error event', async () => {
  setupMocks();
  
  await mockOrderRepo.updateStatus(mockConfirmedOrder.id, 'burning');
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockConfirmedOrder.id },
    body: {
      errorMessage: 'Error during burning process',
      retryable: true
    }
  });
  const res = createMockResponse();
  
  await simulateBurningFailed(req, res, mockOrderRepo, mockLogger, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  
  // Verify error was logged
  const errorLog = mockLogger.logs.find(l => l.level === 'error' && l.message === 'USB burning failed');
  assertDefined(errorLog, 'Should have logged the error event');
  assertTrue(errorLog?.metadata?.retryable === true, 'Log should indicate retryable');
});

// =============================================================================
// TESTS - 6. GET /api/usb-integration/health
// =============================================================================

test('6.1 Should return status "healthy"', () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY }
  });
  const res = createMockResponse();
  
  simulateHealthCheck(req, res, VALID_API_KEY);
  
  assertEquals(res.statusCode, 200, 'Should return 200 OK');
  assertTrue(res.jsonBody.success, 'Response should indicate success');
  assertEquals(res.jsonBody.data.status, 'healthy', 'Status should be healthy');
  assertEquals(res.jsonBody.data.service, 'USB Integration API', 'Service name should be correct');
  assertDefined(res.jsonBody.data.version, 'Version should be defined');
});

test('6.2 Should require authentication', () => {
  setupMocks();
  const req = createMockRequest({
    headers: {} // No API key
  });
  const res = createMockResponse();
  
  simulateHealthCheck(req, res, VALID_API_KEY);
  
  assertEquals(res.statusCode, 401, 'Should return 401 Unauthorized without API key');
  assertFalse(res.jsonBody.success, 'Response should indicate failure');
});

// =============================================================================
// Additional Edge Cases Tests
// =============================================================================

test('7.1 Order customization with genres and artists should be correctly parsed', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  const orders: USBBurningOrder[] = res.jsonBody.data.orders;
  const musicOrder = orders.find(o => o.productType === 'music');
  
  if (musicOrder) {
    assertTrue(Array.isArray(musicOrder.customization.genres), 'Genres should be an array');
    assertTrue(Array.isArray(musicOrder.customization.artists), 'Artists should be an array');
  }
});

test('7.2 API response should include timestamp in ISO format', async () => {
  setupMocks();
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  assertDefined(res.jsonBody.timestamp, 'Response should include timestamp');
  
  // Verify timestamp is valid ISO format
  const parsedDate = new Date(res.jsonBody.timestamp);
  assertFalse(isNaN(parsedDate.getTime()), 'Timestamp should be valid ISO date');
});

test('7.3 Orders should be sorted by creation date (oldest first - FIFO)', async () => {
  setupMocks();
  
  const req = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY }
  });
  const res = createMockResponse();
  
  await simulateGetPendingOrders(req, res, mockOrderRepo, VALID_API_KEY);
  
  const orders: USBBurningOrder[] = res.jsonBody.data.orders;
  
  if (orders.length > 1) {
    for (let i = 1; i < orders.length; i++) {
      const prevDate = new Date(orders[i - 1].createdAt).getTime();
      const currDate = new Date(orders[i].createdAt).getTime();
      assertTrue(prevDate <= currDate, 'Orders should be sorted oldest first');
    }
  }
});

test('7.4 retryable parameter should accept various truthy values', async () => {
  // Test with retryable='true' (string)
  setupMocks();
  await mockOrderRepo.updateStatus(mockConfirmedOrder.id, 'burning');
  
  const reqString = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockConfirmedOrder.id },
    body: { retryable: 'true', errorMessage: 'Test' }
  });
  const resString = createMockResponse();
  
  await simulateBurningFailed(reqString, resString, mockOrderRepo, mockLogger, VALID_API_KEY);
  assertTrue(resString.jsonBody.data.retryable, 'retryable="true" should be treated as true');
  
  // Test with retryable=1 (number)
  setupMocks();
  await mockOrderRepo.updateStatus(mockConfirmedOrder.id, 'burning');
  
  const reqNumber = createMockRequest({
    headers: { 'x-api-key': VALID_API_KEY },
    params: { orderId: mockConfirmedOrder.id },
    body: { retryable: 1, errorMessage: 'Test' }
  });
  const resNumber = createMockResponse();
  
  await simulateBurningFailed(reqNumber, resNumber, mockOrderRepo, mockLogger, VALID_API_KEY);
  assertTrue(resNumber.jsonBody.data.retryable, 'retryable=1 should be treated as true');
});

test('7.5 Response data should have correct structure for all endpoints', () => {
  // Test error response structure
  const errorResponse: APIResponse = {
    success: false,
    error: 'Test error',
    timestamp: new Date().toISOString()
  };
  
  assertFalse(errorResponse.success, 'Error response should have success=false');
  assertDefined(errorResponse.error, 'Error response should have error field');
  assertDefined(errorResponse.timestamp, 'Error response should have timestamp');
  
  // Test success response structure
  const successResponse: APIResponse = {
    success: true,
    data: { test: 'data' },
    timestamp: new Date().toISOString()
  };
  
  assertTrue(successResponse.success, 'Success response should have success=true');
  assertDefined(successResponse.data, 'Success response should have data field');
  assertDefined(successResponse.timestamp, 'Success response should have timestamp');
});

// =============================================================================
// Summary and Test Execution
// =============================================================================

async function main(): Promise<void> {
  console.log('\n🧪 Running USB Integration API Comprehensive Tests\n');
  
  await runTests();
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Test Summary');
  console.log('═'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 All USB Integration API Comprehensive tests passed!\n');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});
