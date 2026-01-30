/**
 * USB Integration API - REST endpoints for USB burning system integration
 * 
 * This API exposes confirmed orders to an external USB burning system,
 * allowing it to fetch pending orders and update their burning status.
 * 
 * Features:
 * - Input validation and sanitization
 * - Rate limiting (100 requests/minute per IP)
 * - Database query timeouts
 * - Detailed error logging
 */

import type { Request, Response, NextFunction } from 'express';
import { orderRepository } from '../repositories/OrderRepository';
import { customerRepository } from '../repositories/CustomerRepository';
import { unifiedLogger } from '../utils/unifiedLogger';
import { 
  USB_INTEGRATION, 
  isValidUUID, 
  isValidOrderNumber, 
  sanitizeInput 
} from '../constants/usbIntegration';

// =============================================================================
// Rate Limiting
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Get client IP address from request
 */
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Clean up expired rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitMap.forEach((entry, ip) => {
    if (now > entry.resetTime) {
      keysToDelete.push(ip);
    }
  });
  keysToDelete.forEach(ip => rateLimitMap.delete(ip));
}, 60000); // Clean up every minute

// =============================================================================
// Interfaces
// =============================================================================

/**
 * USB Burning Order - Data structure for the burning system
 */
export interface USBBurningOrder {
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

// =============================================================================
// Constants
// =============================================================================

const USB_INTEGRATION_API_KEY = process.env.USB_INTEGRATION_API_KEY;
const BURNING_STATUSES = ['confirmed', 'processing'] as const;

// Valid status transitions for the burning workflow
const VALID_START_BURNING_STATUSES = ['confirmed', 'processing'];
const VALID_COMPLETE_BURNING_STATUSES = ['burning'];

// Log warning at startup if API key is not configured
if (!USB_INTEGRATION_API_KEY) {
  unifiedLogger.warn('api', 'USB_INTEGRATION_API_KEY not configured - USB Integration API will be disabled');
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Rate limiting middleware - limits to MAX_REQUESTS_PER_MINUTE per IP
 */
function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIP = getClientIP(req);
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  
  let entry = rateLimitMap.get(clientIP);
  
  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired one
    entry = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(clientIP, entry);
  } else {
    entry.count++;
  }
  
  const remaining = USB_INTEGRATION.MAX_REQUESTS_PER_MINUTE - entry.count;
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', USB_INTEGRATION.MAX_REQUESTS_PER_MINUTE.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
  
  if (entry.count > USB_INTEGRATION.MAX_REQUESTS_PER_MINUTE) {
    unifiedLogger.warn('api', 'Rate limit exceeded', {
      ip: clientIP,
      count: entry.count,
      limit: USB_INTEGRATION.MAX_REQUESTS_PER_MINUTE
    });
    
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Please try again later.',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  next();
}

/**
 * Order ID validation middleware
 */
function validateOrderIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { orderId } = req.params;
  
  if (!orderId) {
    unifiedLogger.warn('api', 'Missing orderId in request', { path: req.path });
    res.status(400).json({
      success: false,
      error: 'Order ID is required',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  // Sanitize the orderId
  const sanitizedOrderId = sanitizeInput(orderId);
  
  // Validate format (UUID or alphanumeric order number)
  if (!isValidUUID(sanitizedOrderId) && !isValidOrderNumber(sanitizedOrderId)) {
    unifiedLogger.warn('api', 'Invalid orderId format', { 
      orderId: sanitizedOrderId,
      path: req.path 
    });
    res.status(400).json({
      success: false,
      error: 'Invalid order ID format. Must be a valid UUID or alphanumeric order number.',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }
  
  // Replace with sanitized version
  req.params.orderId = sanitizedOrderId;
  next();
}

/**
 * API Key authentication middleware
 */
function authenticateAPIKey(req: Request, res: Response, next: NextFunction): void {
  // Extract API key from X-API-Key header or Bearer token
  const authHeader = req.headers['authorization'];
  let apiKey: string | undefined = req.headers['x-api-key'] as string | undefined;
  
  // Only extract from Bearer if it's properly formatted
  if (!apiKey && authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7); // Remove 'Bearer ' prefix
  }

  if (!USB_INTEGRATION_API_KEY) {
    unifiedLogger.error('api', 'USB Integration API key not configured in environment');
    res.status(503).json({
      success: false,
      error: 'USB Integration API is not configured',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }

  if (!apiKey) {
    unifiedLogger.warn('api', 'USB Integration API called without authentication');
    res.status(401).json({
      success: false,
      error: 'API key required. Provide via X-API-Key header or Bearer token',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }

  if (apiKey !== USB_INTEGRATION_API_KEY) {
    unifiedLogger.warn('api', 'USB Integration API called with invalid API key');
    res.status(403).json({
      success: false,
      error: 'Invalid API key',
      timestamp: new Date().toISOString()
    } as APIResponse);
    return;
  }

  next();
}

/**
 * Request logging middleware for USB Integration API
 */
function logUSBIntegrationRequest(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  unifiedLogger.info('api', 'USB Integration API request', {
    method: req.method,
    path: req.path,
    params: req.params,
    query: req.query
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    unifiedLogger.info('api', 'USB Integration API response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Execute a database query with timeout
 * @param queryFn - The async function to execute
 * @param timeoutMs - Timeout in milliseconds (default: DB_QUERY_TIMEOUT_MS)
 * @returns The query result or throws on timeout
 */
async function withTimeout<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    queryFn(),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(`Database query timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Map content type to product type
 */
function mapContentTypeToProductType(contentType: string): 'music' | 'videos' | 'movies' {
  const type = contentType?.toLowerCase();
  if (type === 'music' || type === 'música') return 'music';
  if (type === 'videos' || type === 'video') return 'videos';
  if (type === 'movies' || type === 'películas' || type === 'peliculas') return 'movies';
  return 'music'; // Default
}

/**
 * Parse customization data from order
 */
function parseCustomization(order: any): USBBurningOrder['customization'] {
  const customization: USBBurningOrder['customization'] = {
    genres: [],
    artists: []
  };

  try {
    // Handle customization field
    if (order.customization) {
      const custom = typeof order.customization === 'string' 
        ? JSON.parse(order.customization) 
        : order.customization;
      
      customization.genres = custom.genres || custom.generos || [];
      customization.artists = custom.artists || custom.artistas || [];
      customization.videos = custom.videos;
      customization.movies = custom.movies || custom.peliculas;
    }

    // Handle preferences field as fallback
    if (order.preferences) {
      const prefs = typeof order.preferences === 'string'
        ? JSON.parse(order.preferences)
        : order.preferences;
      
      if (Array.isArray(prefs)) {
        // If preferences is an array of genres
        if (customization.genres.length === 0) {
          customization.genres = prefs;
        }
      } else if (typeof prefs === 'object') {
        if (!customization.genres.length && prefs.genres) {
          customization.genres = prefs.genres;
        }
        if (!customization.artists.length && prefs.artists) {
          customization.artists = prefs.artists;
        }
      }
    }
  } catch (error) {
    unifiedLogger.warn('api', 'Error parsing customization data', { 
      orderId: order.id, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }

  return customization;
}

/**
 * Transform order record to USB burning format
 */
async function transformToUSBBurningOrder(order: any): Promise<USBBurningOrder> {
  // Get customer name
  let customerName = order.customer_name || '';
  if (!customerName && order.customer_id) {
    try {
      const customer = await customerRepository.findById(order.customer_id);
      customerName = customer?.name || 'Cliente';
    } catch {
      customerName = 'Cliente';
    }
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number || order.id,
    customerPhone: order.phone_number || '',
    customerName,
    productType: mapContentTypeToProductType(order.content_type),
    capacity: order.capacity || '8GB',
    customization: parseCustomization(order),
    createdAt: order.created_at || new Date(),
    status: order.processing_status || order.status || 'pending'
  };
}

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Register USB Integration API routes on server
 */
export function registerUSBIntegrationRoutes(server: any): void {
  // Apply logging and rate limiting middleware to all USB integration routes
  server.use('/api/usb-integration', logUSBIntegrationRequest);
  server.use('/api/usb-integration', rateLimitMiddleware);

  /**
   * GET /api/usb-integration/pending-orders
   * Get all orders with status 'confirmed' or 'processing' ready for USB burning
   * Supports pagination via query params: page (default 1), limit (default 100, max 1000)
   */
  server.get('/api/usb-integration/pending-orders', authenticateAPIKey, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 100));
      const orders: USBBurningOrder[] = [];

      unifiedLogger.info('api', 'Fetching pending orders for USB burning', { page, limit });

      // Query orders with burning-ready statuses with timeout
      for (const status of BURNING_STATUSES) {
        const result = await withTimeout(
          () => orderRepository.list(page, limit, { status }),
          USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
        );
        
        for (const order of result.data) {
          const transformedOrder = await transformToUSBBurningOrder(order);
          orders.push(transformedOrder);
        }
      }

      // Sort by creation date (oldest first for FIFO processing)
      orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      unifiedLogger.info('api', 'Pending orders fetched successfully', { count: orders.length });

      res.json({
        success: true,
        data: {
          orders,
          total: orders.length
        },
        timestamp: new Date().toISOString()
      } as APIResponse);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
      const isTimeout = errorMessage.includes('timeout');
      
      unifiedLogger.error('api', 'Error fetching pending orders for USB burning', {
        error: errorMessage,
        isTimeout,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout ? 'Database query timeout' : errorMessage,
        timestamp: new Date().toISOString()
      } as APIResponse);
    }
  });

  /**
   * POST /api/usb-integration/orders/:orderId/start-burning
   * Mark an order as "burning in progress"
   */
  server.post('/api/usb-integration/orders/:orderId/start-burning', authenticateAPIKey, validateOrderIdMiddleware, async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;

      unifiedLogger.info('api', 'Starting USB burning process', { orderId });

      // Find the order with timeout
      const order = await withTimeout(
        () => orderRepository.findById(orderId),
        USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
      );
      
      if (!order) {
        unifiedLogger.warn('api', 'Order not found for burning', { orderId });
        res.status(404).json({
          success: false,
          error: 'Orden no encontrada',
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Validate current status allows starting burning
      const currentStatus = order.processing_status || order.status || 'unknown';
      if (!VALID_START_BURNING_STATUSES.includes(currentStatus)) {
        unifiedLogger.warn('api', 'Invalid status for burning start', { 
          orderId, 
          currentStatus, 
          allowedStatuses: VALID_START_BURNING_STATUSES 
        });
        res.status(400).json({
          success: false,
          error: `No se puede iniciar grabación. Estado actual '${currentStatus}' no es válido. Estados permitidos: ${VALID_START_BURNING_STATUSES.join(', ')}`,
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Update status to 'burning' with timeout
      const success = await withTimeout(
        () => orderRepository.updateStatus(orderId, 'burning'),
        USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
      );
      
      if (!success) {
        unifiedLogger.error('api', 'Failed to update order status to burning', { orderId });
        res.status(500).json({
          success: false,
          error: 'No se pudo actualizar el estado de la orden',
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Add note to order
      await orderRepository.addNote(orderId, 'Proceso de grabación USB iniciado');

      unifiedLogger.info('api', 'USB burning started successfully', { orderId, orderNumber: order.order_number });

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

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
      const isTimeout = errorMessage.includes('timeout');
      
      unifiedLogger.error('api', 'Error starting USB burning process', {
        orderId: req.params.orderId,
        error: errorMessage,
        isTimeout,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout ? 'Database query timeout' : errorMessage,
        timestamp: new Date().toISOString()
      } as APIResponse);
    }
  });

  /**
   * POST /api/usb-integration/orders/:orderId/complete-burning
   * Mark an order as burning completed
   */
  server.post('/api/usb-integration/orders/:orderId/complete-burning', authenticateAPIKey, validateOrderIdMiddleware, async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { notes } = req.body || {};
      
      // Sanitize notes input
      const sanitizedNotes = notes ? sanitizeInput(String(notes)) : '';

      unifiedLogger.info('api', 'Completing USB burning process', { orderId });

      // Find the order with timeout
      const order = await withTimeout(
        () => orderRepository.findById(orderId),
        USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
      );
      
      if (!order) {
        unifiedLogger.warn('api', 'Order not found for burning completion', { orderId });
        res.status(404).json({
          success: false,
          error: 'Orden no encontrada',
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Validate current status allows completing burning
      const currentStatus = order.processing_status || order.status || 'unknown';
      if (!VALID_COMPLETE_BURNING_STATUSES.includes(currentStatus)) {
        unifiedLogger.warn('api', 'Invalid status for burning completion', { 
          orderId, 
          currentStatus, 
          allowedStatuses: VALID_COMPLETE_BURNING_STATUSES 
        });
        res.status(400).json({
          success: false,
          error: `No se puede completar grabación. Estado actual '${currentStatus}' no es válido. Estados permitidos: ${VALID_COMPLETE_BURNING_STATUSES.join(', ')}`,
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Update status to 'ready_for_shipping' with timeout
      const success = await withTimeout(
        () => orderRepository.updateStatus(orderId, 'ready_for_shipping'),
        USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
      );
      
      if (!success) {
        unifiedLogger.error('api', 'Failed to update order status to ready_for_shipping', { orderId });
        res.status(500).json({
          success: false,
          error: 'No se pudo actualizar el estado de la orden',
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Add note to order
      const noteMessage = sanitizedNotes 
        ? `Grabación USB completada exitosamente. ${sanitizedNotes}`
        : 'Grabación USB completada exitosamente. Listo para envío.';
      await orderRepository.addNote(orderId, noteMessage);

      unifiedLogger.info('api', 'USB burning completed successfully', { orderId, orderNumber: order.order_number });

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

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
      const isTimeout = errorMessage.includes('timeout');
      
      unifiedLogger.error('api', 'Error completing USB burning process', {
        orderId: req.params.orderId,
        error: errorMessage,
        isTimeout,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout ? 'Database query timeout' : errorMessage,
        timestamp: new Date().toISOString()
      } as APIResponse);
    }
  });

  /**
   * POST /api/usb-integration/orders/:orderId/burning-failed
   * Mark an order as having a burning failure
   */
  server.post('/api/usb-integration/orders/:orderId/burning-failed', authenticateAPIKey, validateOrderIdMiddleware, async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { errorMessage, errorCode, retryable } = req.body || {};
      
      // Sanitize inputs
      const sanitizedErrorMessage = errorMessage ? sanitizeInput(String(errorMessage)) : '';
      const sanitizedErrorCode = errorCode ? sanitizeInput(String(errorCode)) : '';

      unifiedLogger.info('api', 'Recording burning failure', { orderId, errorCode: sanitizedErrorCode });

      // Find the order with timeout
      const order = await withTimeout(
        () => orderRepository.findById(orderId),
        USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
      );
      
      if (!order) {
        unifiedLogger.warn('api', 'Order not found for burning failure', { orderId });
        res.status(404).json({
          success: false,
          error: 'Orden no encontrada',
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Normalize retryable to boolean (accepts true, 'true', 1)
      const isRetryable = retryable === true || retryable === 'true' || retryable === 1;

      // Update status to 'burning_failed' or back to 'confirmed' if retryable
      const newStatus = isRetryable ? 'confirmed' : 'burning_failed';
      const success = await withTimeout(
        () => orderRepository.updateStatus(orderId, newStatus),
        USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
      );
      
      if (!success) {
        unifiedLogger.error('api', 'Failed to update order status for burning failure', { orderId, newStatus });
        res.status(500).json({
          success: false,
          error: 'No se pudo actualizar el estado de la orden',
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      // Add error note to order
      const errorNote = [
        'Error en grabación USB',
        sanitizedErrorCode ? `Código: ${sanitizedErrorCode}` : null,
        sanitizedErrorMessage ? `Mensaje: ${sanitizedErrorMessage}` : null,
        isRetryable ? 'Estado: Pendiente de reintento' : 'Estado: Requiere atención manual'
      ].filter(Boolean).join('. ');
      
      await orderRepository.addNote(orderId, errorNote);

      unifiedLogger.error('api', 'USB burning failed', { 
        orderId, 
        orderNumber: order.order_number,
        errorCode: sanitizedErrorCode,
        errorMessage: sanitizedErrorMessage,
        retryable: isRetryable,
        newStatus
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

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error interno del servidor';
      const isTimeout = errorMsg.includes('timeout');
      
      unifiedLogger.error('api', 'Error recording burning failure', {
        orderId: req.params.orderId,
        error: errorMsg,
        isTimeout,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout ? 'Database query timeout' : errorMsg,
        timestamp: new Date().toISOString()
      } as APIResponse);
    }
  });

  /**
   * GET /api/usb-integration/orders/:orderId
   * Get a specific order details for burning
   */
  server.get('/api/usb-integration/orders/:orderId', authenticateAPIKey, validateOrderIdMiddleware, async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;

      unifiedLogger.info('api', 'Fetching order for USB burning', { orderId });

      const order = await withTimeout(
        () => orderRepository.findById(orderId),
        USB_INTEGRATION.DB_QUERY_TIMEOUT_MS
      );
      
      if (!order) {
        unifiedLogger.warn('api', 'Order not found', { orderId });
        res.status(404).json({
          success: false,
          error: 'Orden no encontrada',
          timestamp: new Date().toISOString()
        } as APIResponse);
        return;
      }

      const transformedOrder = await transformToUSBBurningOrder(order);

      unifiedLogger.info('api', 'Order fetched successfully', { orderId, orderNumber: transformedOrder.orderNumber });

      res.json({
        success: true,
        data: transformedOrder,
        timestamp: new Date().toISOString()
      } as APIResponse);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
      const isTimeout = errorMessage.includes('timeout');
      
      unifiedLogger.error('api', 'Error fetching order for USB burning', {
        orderId: req.params.orderId,
        error: errorMessage,
        isTimeout,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout ? 'Database query timeout' : errorMessage,
        timestamp: new Date().toISOString()
      } as APIResponse);
    }
  });

  /**
   * GET /api/usb-integration/health
   * Health check endpoint for USB Integration API
   * Note: Requires authentication to prevent information disclosure
   */
  server.get('/api/usb-integration/health', authenticateAPIKey, (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        service: 'USB Integration API',
        status: 'healthy',
        version: '1.0.0'
      },
      timestamp: new Date().toISOString()
    } as APIResponse);
  });
}
