// src/routes/notificationRoutes.ts
// API routes for Notificador service integration

import type { Request, Response } from 'express';
import { notificadorService } from '../services/NotificadorService';
import { NotificationChannel } from '../../types/notificador';
import { unifiedLogger } from '../utils/unifiedLogger';

/**
 * Register notification API routes on server
 */
export function registerNotificationRoutes(server: any) {

  /**
   * GET /api/notifications/config
   * Get Notificador service configuration status
   */
  server.get('/api/notifications/config', (req: Request, res: Response) => {
  try {
    const status = notificadorService.getConfigStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    unifiedLogger.error('api', 'Error getting notification config', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  /**
   * GET /api/notifications/health
   * Check Notificador service health
   */
  server.get('/api/notifications/health', async (req: Request, res: Response) => {
  try {
    const isHealthy = await notificadorService.checkHealth();
    res.json({
      success: true,
      data: {
        healthy: isHealthy,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    unifiedLogger.error('api', 'Error checking notification health', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  /**
   * GET /api/notifications/history
   * Get notification history from Notificador service
   */
  server.get('/api/notifications/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await notificadorService.getHistory(limit, offset);
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    unifiedLogger.error('api', 'Error fetching notification history', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  /**
   * GET /api/notifications/templates
   * Get available notification templates
   */
  server.get('/api/notifications/templates', async (req: Request, res: Response) => {
  try {
    const channel = req.query.channel as NotificationChannel | undefined;
    const templates = await notificadorService.getTemplates(channel);
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    unifiedLogger.error('api', 'Error fetching notification templates', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  /**
   * POST /api/notifications/test
   * Send a test notification
   */
  server.post('/api/notifications/test', async (req: Request, res: Response) => {
  try {
    const { channel, phone, email, name } = req.body;

    if (!channel) {
      return res.status(400).json({
        success: false,
        error: 'Channel is required (whatsapp, sms, or email)'
      });
    }

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        error: 'Either phone or email is required'
      });
    }

    const result = await notificadorService.sendTestNotification(
      channel as NotificationChannel,
      { phone, email, name }
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    unifiedLogger.error('api', 'Error sending test notification', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  /**
   * POST /api/notifications/send
   * Manually send a notification (admin only)
   */
  server.post('/api/notifications/send', async (req: Request, res: Response) => {
  try {
    const { channel, recipient, template, message, subject, variables } = req.body;

    if (!channel || !recipient) {
      return res.status(400).json({
        success: false,
        error: 'Channel and recipient are required'
      });
    }

    if (!template && !message) {
      return res.status(400).json({
        success: false,
        error: 'Either template or message is required'
      });
    }

    // Use the underlying client for manual sends
    if (!notificadorService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Notificador service is not configured'
      });
    }

    // This would require exposing the client or creating a manual send method
    res.status(501).json({
      success: false,
      error: 'Manual send not yet implemented. Use /test endpoint for testing.'
    });
  } catch (error) {
    unifiedLogger.error('api', 'Error sending notification', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  });
}
