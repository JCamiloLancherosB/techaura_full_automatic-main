import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/temp/' });

// Middleware for API key authentication
const authenticateApiKey = (req: Request, res: Response, next: Function) => {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '') || 
                   req.headers['x-api-key'];
    
    const validKey = process.env.WHATSAPP_API_KEY;
    
    if (!validKey) {
        console.error('WHATSAPP_API_KEY environment variable is not set');
        return res.status(503).json({
            success: false,
            error: 'Service configuration error'
        });
    }
    
    if (!apiKey || apiKey !== validKey) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or missing API key'
        });
    }
    
    next();
};

// Send text message
router.post('/api/send-message', authenticateApiKey, async (req: Request, res: Response) => {
    try {
        const { phone, message } = req.body;
        
        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone and message are required'
            });
        }
        
        const whatsapp = (global as any).adapterProvider;
        if (!whatsapp) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp service not available'
            });
        }
        
        // Format phone number
        const formattedPhone = formatPhoneNumber(phone);
        
        // Send message
        await whatsapp.sendMessage(`${formattedPhone}@s.whatsapp.net`, message);
        
        console.log(`📤 API: Message sent to ${formattedPhone}`);
        
        return res.status(200).json({
            success: true,
            message: 'Message sent successfully',
            sentTo: formattedPhone
        });
    } catch (error) {
        console.error('Error sending message via API:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send message'
        });
    }
});

// Send media (image, PDF, document)
router.post('/api/send-media', authenticateApiKey, upload.single('file'), async (req: Request, res: Response) => {
    try {
        const { phone, caption } = req.body;
        const file = req.file;
        
        if (!phone || !file) {
            return res.status(400).json({
                success: false,
                error: 'Phone and file are required'
            });
        }
        
        const whatsapp = (global as any).adapterProvider;
        if (!whatsapp) {
            // Cleanup uploaded file
            if (file) fs.unlinkSync(file.path);
            return res.status(503).json({
                success: false,
                error: 'WhatsApp service not available'
            });
        }
        
        const formattedPhone = formatPhoneNumber(phone);
        const jid = `${formattedPhone}@s.whatsapp.net`;
        
        // Determine media type
        const ext = path.extname(file.originalname).toLowerCase();
        const mimeType = getMimeType(ext);
        
        // Send based on type
        if (mimeType.startsWith('image/')) {
            await whatsapp.sendImage(jid, file.path, caption || '');
        } else if (mimeType === 'application/pdf') {
            await whatsapp.sendDocument(jid, file.path, caption || file.originalname);
        } else {
            await whatsapp.sendDocument(jid, file.path, caption || file.originalname);
        }
        
        // Cleanup
        fs.unlinkSync(file.path);
        
        console.log(`📤 API: Media sent to ${formattedPhone} (${file.originalname})`);
        
        return res.status(200).json({
            success: true,
            message: 'Media sent successfully',
            sentTo: formattedPhone,
            fileName: file.originalname
        });
    } catch (error) {
        console.error('Error sending media via API:', error);
        // Cleanup on error
        if (req.file) {
            try { 
                fs.unlinkSync(req.file.path); 
            } catch (cleanupError) {
                console.error('Error cleaning up file:', cleanupError);
            }
        }
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send media'
        });
    }
});

// Send shipping guide with tracking info
router.post('/api/send-shipping-guide', authenticateApiKey, upload.single('guide'), async (req: Request, res: Response) => {
    try {
        const { phone, trackingNumber, carrier, customerName, city } = req.body;
        const file = req.file;
        
        if (!phone || !trackingNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone and trackingNumber are required'
            });
        }
        
        const whatsapp = (global as any).adapterProvider;
        if (!whatsapp) {
            if (file) fs.unlinkSync(file.path);
            return res.status(503).json({
                success: false,
                error: 'WhatsApp service not available'
            });
        }
        
        const formattedPhone = formatPhoneNumber(phone);
        const jid = `${formattedPhone}@s.whatsapp.net`;
        
        // Send formatted message
        const message = `🚚 *¡Tu pedido ha sido enviado!*

📦 *Número de guía:* ${trackingNumber}
🏢 *Transportadora:* ${carrier || 'Ver guía adjunta'}
${customerName ? `👤 *Cliente:* ${customerName}` : ''}
${city ? `📍 *Destino:* ${city}` : ''}

Puedes rastrear tu envío en la página de la transportadora.

¡Gracias por tu compra en TechAura! 🎉

_Escribe "rastrear" para ver el estado de tu envío._`;
        
        await whatsapp.sendMessage(jid, message);
        
        // Send guide file if provided
        if (file) {
            await whatsapp.sendDocument(jid, file.path, 'Guía de envío');
            fs.unlinkSync(file.path);
        }
        
        console.log(`📤 API: Shipping guide sent to ${formattedPhone} (${trackingNumber})`);
        
        return res.status(200).json({
            success: true,
            message: 'Shipping guide sent successfully',
            sentTo: formattedPhone,
            trackingNumber
        });
    } catch (error) {
        console.error('Error sending shipping guide:', error);
        if (req.file) {
            try { 
                fs.unlinkSync(req.file.path); 
            } catch (cleanupError) {
                console.error('Error cleaning up file:', cleanupError);
            }
        }
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send guide'
        });
    }
});

// Check WhatsApp connection status
router.get('/api/whatsapp/status', authenticateApiKey, (req: Request, res: Response) => {
    const isConnected = (global as any).isWhatsAppConnected || false;
    
    return res.status(200).json({
        success: true,
        connected: isConnected,
        status: isConnected ? 'connected' : 'disconnected'
    });
});

// Get order by phone for matching
router.get('/api/orders/by-phone/:phone', authenticateApiKey, async (req: Request, res: Response) => {
    try {
        const { phone } = req.params;
        const { businessDB } = await import('../mysql-database');
        
        // Sanitize phone for search (different from formatPhoneNumber - this is for LIKE queries)
        const sanitizedPhone = phone.replace(/\D/g, '').slice(-10);
        
        const orders = await businessDB.pool.execute(`
            SELECT 
                id, order_number, phone_number, customer_name,
                shipping_address, city, processing_status,
                tracking_number, carrier
            FROM orders
            WHERE phone_number LIKE ?
            ORDER BY created_at DESC
            LIMIT 5
        `, [`%${sanitizedPhone}%`]) as any;
        
        return res.status(200).json({
            success: true,
            data: orders[0]
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Error fetching orders'
        });
    }
});

// Update order with tracking info
router.put('/api/orders/:orderNumber/tracking', authenticateApiKey, async (req: Request, res: Response) => {
    try {
        const { orderNumber } = req.params;
        const { trackingNumber, carrier } = req.body;
        
        if (!trackingNumber) {
            return res.status(400).json({
                success: false,
                error: 'Tracking number is required'
            });
        }
        
        const { businessDB } = await import('../mysql-database');
        
        const [result] = await businessDB.pool.execute(`
            UPDATE orders SET
                tracking_number = ?,
                carrier = ?,
                shipping_status = 'shipped',
                shipped_at = NOW(),
                updated_at = NOW()
            WHERE order_number = ?
        `, [trackingNumber, carrier || null, orderNumber]) as any;
        
        if (result.affectedRows > 0) {
            return res.status(200).json({
                success: true,
                message: 'Order tracking updated'
            });
        } else {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Error updating order'
        });
    }
});

// Helper functions
function formatPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('57') && digits.length === 12) return digits;
    if (digits.length === 10 && digits.startsWith('3')) return '57' + digits;
    return digits;
}

function getMimeType(ext: string): string {
    const types: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return types[ext] || 'application/octet-stream';
}

export default router;
