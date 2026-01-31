// src/routes/shippingRoutes.ts
// API routes for shipping guide automation

import type { Request, Response } from 'express';
import multer from 'multer';
import { ShippingGuideSender } from '../services/ShippingGuideSender';
import { unifiedLogger } from '../utils/unifiedLogger';
import fs from 'fs';
import path from 'path';

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads', 'guides');
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only PDF and image files
        const allowedMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF and images are allowed.'));
        }
    }
});

const guideSender = new ShippingGuideSender();

/**
 * Register shipping guide API routes on server
 */
export function registerShippingRoutes(server: any) {

    /**
     * POST /api/shipping/guide
     * Upload and process single shipping guide
     */
    server.post('/api/shipping/guide', upload.single('guide'), async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No file uploaded' 
                });
            }

            unifiedLogger.info('shipping', `Processing guide: ${req.file.originalname}`);
            
            const result = await guideSender.processAndSend(req.file.path);
            
            // Cleanup uploaded file
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupError) {
                unifiedLogger.warn('shipping', `Failed to cleanup file: ${req.file.path}`);
            }
            
            if (result.success) {
                unifiedLogger.info('shipping', `Guide sent successfully: ${result.trackingNumber}`);
                return res.json(result);
            } else {
                unifiedLogger.warn('shipping', `Guide processing failed: ${result.message}`);
                return res.status(400).json(result);
            }
        } catch (error) {
            unifiedLogger.error('shipping', 'Error processing shipping guide', error);
            
            // Cleanup file if it exists
            if (req.file) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (cleanupError) {
                    // Ignore cleanup errors
                }
            }
            
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * POST /api/shipping/guides/batch
     * Upload and process multiple shipping guides
     */
    server.post('/api/shipping/guides/batch', upload.array('guides', 50), async (req: Request, res: Response) => {
        try {
            const files = req.files as Express.Multer.File[];
            
            if (!files || files.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No files uploaded' 
                });
            }

            unifiedLogger.info('shipping', `Processing ${files.length} guides in batch`);
            
            const results = [];
            
            for (const file of files) {
                try {
                    const result = await guideSender.processAndSend(file.path);
                    results.push({ 
                        file: file.originalname, 
                        ...result 
                    });
                } catch (error) {
                    results.push({
                        file: file.originalname,
                        success: false,
                        message: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
                
                // Cleanup file
                try {
                    fs.unlinkSync(file.path);
                } catch (cleanupError) {
                    // Ignore cleanup errors
                }
            }
            
            const successCount = results.filter(r => r.success).length;
            unifiedLogger.info('shipping', `Batch processing complete: ${successCount}/${files.length} successful`);
            
            return res.json({
                success: true,
                processed: results.length,
                successful: successCount,
                failed: results.length - successCount,
                results
            });
        } catch (error) {
            unifiedLogger.error('shipping', 'Error processing batch shipping guides', error);
            
            // Cleanup files if they exist
            const files = req.files as Express.Multer.File[];
            if (files) {
                for (const file of files) {
                    try {
                        fs.unlinkSync(file.path);
                    } catch (cleanupError) {
                        // Ignore cleanup errors
                    }
                }
            }
            
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    /**
     * GET /api/shipping/health
     * Check shipping guide service health
     */
    server.get('/api/shipping/health', (req: Request, res: Response) => {
        try {
            res.json({
                success: true,
                data: {
                    healthy: true,
                    service: 'shipping-guide-automation',
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            unifiedLogger.error('shipping', 'Health check failed', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
