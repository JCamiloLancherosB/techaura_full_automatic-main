/**
 * API Routes for data validation and persistence
 * Provides endpoints for customer and order management
 */

import type { Request, Response } from 'express';
import { customerRepository } from '../repositories/CustomerRepository';
import { orderRepository } from '../repositories/OrderRepository';
import { fileUploadService, uploadMiddleware } from '../services/fileProcessing/FileUploadService';
import { validate, normalizeCustomerData, normalizeOrderData, createErrorResponse, createSuccessResponse } from '../validation/validator';
import { customerSchema, orderSchema } from '../validation/schemas';

/**
 * Register API routes on Express server
 */
export function registerValidationRoutes(server: any) {
    
    // ==================== CUSTOMERS ====================
    
    /**
     * Create new customer
     * POST /api/customers
     */
    server.post('/api/customers', async (req: Request, res: Response) => {
        try {
            const normalized = normalizeCustomerData(req.body);
            const validationResult = validate(customerSchema, normalized);

            if (!validationResult.success) {
                return res.status(400).json(createErrorResponse(validationResult.errors!));
            }

            // Check if customer already exists
            const existing = await customerRepository.findByPhone(validationResult.data!.phone);
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: 'Cliente ya existe con este teléfono',
                    data: existing
                });
            }

            const customer = await customerRepository.create(validationResult.data!);
            return res.status(201).json(createSuccessResponse(customer));
        } catch (error: any) {
            console.error('Error creating customer:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * Get customer by ID
     * GET /api/customers/:id
     */
    server.get('/api/customers/:id', async (req: Request, res: Response) => {
        try {
            const customer = await customerRepository.findById(req.params.id);
            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }
            return res.json(createSuccessResponse(customer));
        } catch (error: any) {
            console.error('Error fetching customer:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * Get customer by phone
     * GET /api/customers/phone/:phone
     */
    server.get('/api/customers/phone/:phone', async (req: Request, res: Response) => {
        try {
            const customer = await customerRepository.findByPhone(req.params.phone);
            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }
            return res.json(createSuccessResponse(customer));
        } catch (error: any) {
            console.error('Error fetching customer:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * List customers with pagination
     * GET /api/customers
     */
    server.get('/api/customers', async (req: Request, res: Response) => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            const search = req.query.search as string;
            const vipOnly = req.query.vipOnly === 'true';

            const result = await customerRepository.list(page, limit, {
                search,
                vipOnly
            });

            return res.json({
                success: true,
                data: result.data,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    totalPages: Math.ceil(result.total / limit)
                }
            });
        } catch (error: any) {
            console.error('Error listing customers:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * Update customer
     * PUT /api/customers/:id
     */
    server.put('/api/customers/:id', async (req: Request, res: Response) => {
        try {
            const normalized = normalizeCustomerData(req.body);
            const success = await customerRepository.update(req.params.id, normalized);
            
            if (!success) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            const updated = await customerRepository.findById(req.params.id);
            return res.json(createSuccessResponse(updated));
        } catch (error: any) {
            console.error('Error updating customer:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== ORDERS ====================

    /**
     * Create new order
     * POST /api/orders
     */
    server.post('/api/orders', async (req: Request, res: Response) => {
        try {
            const normalized = normalizeOrderData(req.body);
            
            // Validate customer exists
            if (normalized.customer_id) {
                const customer = await customerRepository.findById(normalized.customer_id);
                if (!customer) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cliente no encontrado'
                    });
                }
            }

            const order = await orderRepository.create(normalized);
            
            // Update customer stats
            if (normalized.customer_id) {
                await customerRepository.incrementOrders(normalized.customer_id, normalized.price);
            }

            return res.status(201).json(createSuccessResponse(order));
        } catch (error: any) {
            console.error('Error creating order:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * Get order by ID
     * GET /api/orders/:id
     */
    server.get('/api/orders/:id', async (req: Request, res: Response) => {
        try {
            const order = await orderRepository.findById(req.params.id);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Orden no encontrada'
                });
            }
            return res.json(createSuccessResponse(order));
        } catch (error: any) {
            console.error('Error fetching order:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * List orders with pagination and filters
     * GET /api/orders
     */
    server.get('/api/orders', async (req: Request, res: Response) => {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 50;
            
            const filters: any = {};
            if (req.query.status) filters.status = req.query.status;
            if (req.query.contentType) filters.contentType = req.query.contentType;
            if (req.query.customerPhone) filters.customerPhone = req.query.customerPhone;
            if (req.query.searchTerm) filters.searchTerm = req.query.searchTerm;
            if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
            if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);

            const result = await orderRepository.list(page, limit, filters);

            return res.json({
                success: true,
                data: result.data,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    totalPages: Math.ceil(result.total / limit)
                }
            });
        } catch (error: any) {
            console.error('Error listing orders:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * Update order status
     * PATCH /api/orders/:id/status
     */
    server.patch('/api/orders/:id/status', async (req: Request, res: Response) => {
        try {
            const { status } = req.body;
            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Estado es requerido'
                });
            }

            const success = await orderRepository.updateStatus(req.params.id, status);
            if (!success) {
                return res.status(404).json({
                    success: false,
                    message: 'Orden no encontrada'
                });
            }

            const updated = await orderRepository.findById(req.params.id);
            return res.json(createSuccessResponse(updated));
        } catch (error: any) {
            console.error('Error updating order status:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    /**
     * Get order statistics
     * GET /api/orders/stats
     */
    server.get('/api/orders/stats', async (req: Request, res: Response) => {
        try {
            const stats = await orderRepository.getStats();
            return res.json(createSuccessResponse(stats));
        } catch (error: any) {
            console.error('Error fetching order stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    });

    // ==================== FILE UPLOAD ====================

    /**
     * Upload and process file
     * POST /api/upload/orders
     */
    server.post('/api/upload/orders', uploadMiddleware.single('file'), async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No se ha proporcionado ningún archivo'
                });
            }

            // Process file
            const result = await fileUploadService.processFile(req.file);

            // Clean up file
            await fileUploadService.cleanupFile(req.file.path);

            if (!result.success) {
                return res.status(400).json(result);
            }

            return res.json(result);
        } catch (error: any) {
            console.error('Error processing file upload:', error);
            return res.status(500).json({
                success: false,
                message: 'Error procesando archivo',
                error: error.message
            });
        }
    });

    /**
     * Batch create orders from uploaded file
     * POST /api/upload/orders/process
     */
    server.post('/api/upload/orders/process', uploadMiddleware.single('file'), async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No se ha proporcionado ningún archivo'
                });
            }

            // Process file
            const result = await fileUploadService.processFile(req.file);

            if (!result.success || !result.records) {
                await fileUploadService.cleanupFile(req.file.path);
                return res.status(400).json(result);
            }

            // Process valid records
            const processed = {
                successful: 0,
                failed: 0,
                errors: [] as string[]
            };

            for (const record of result.records) {
                try {
                    // Find or create customer
                    const customer = await customerRepository.findOrCreate({
                        name: record.customer_name,
                        phone: record.customer_phone,
                        email: record.customer_email
                    });

                    // Create order
                    await orderRepository.create({
                        customer_id: customer.id,
                        customer_name: record.customer_name,
                        phone_number: record.customer_phone,
                        content_type: record.content_type,
                        capacity: record.capacity,
                        price: parseFloat(record.price),
                        status: 'pending',
                        notes: record.notes
                    });

                    processed.successful++;
                } catch (error: any) {
                    processed.failed++;
                    processed.errors.push(`Error procesando registro: ${error.message}`);
                }
            }

            // Clean up file
            await fileUploadService.cleanupFile(req.file.path);

            return res.json({
                success: true,
                message: `Procesados ${processed.successful} registros exitosamente`,
                data: {
                    totalRecords: result.totalRecords,
                    validRecords: result.validRecords,
                    invalidRecords: result.invalidRecords,
                    processed: processed.successful,
                    failed: processed.failed,
                    errors: [...(result.errors || []), ...processed.errors]
                }
            });
        } catch (error: any) {
            console.error('Error processing batch orders:', error);
            if (req.file) {
                await fileUploadService.cleanupFile(req.file.path);
            }
            return res.status(500).json({
                success: false,
                message: 'Error procesando lote de órdenes',
                error: error.message
            });
        }
    });
}
