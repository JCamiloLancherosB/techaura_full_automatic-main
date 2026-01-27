/**
 * Enhanced Control Panel API Endpoints
 * Provides real-time monitoring and management capabilities
 */

import type { Request, Response } from 'express';
import { conversationMemory } from './conversationMemory';
import { enhancedAIService } from './enhancedAIService';
import { intentClassifier } from './intentClassifier';
import { enhancedAutoProcessor } from './enhancedAutoProcessor';
import { aiService } from './aiService';
import AIMonitoring from './aiMonitoring';

// Read version from package.json
let APP_VERSION = '2.0.0';
try {
    const packageJson = require('../../package.json');
    APP_VERSION = packageJson.version || '2.0.0';
} catch (e) {
    console.warn('⚠️ Could not read version from package.json, using default');
}

export class ControlPanelAPI {
    /**
     * Get comprehensive dashboard data
     * Works independently of WhatsApp session status
     */
    static async getDashboard(req: Request, res: Response): Promise<void> {
        try {
            // Collect stats with graceful fallbacks
            let aiStats, enhancedStats, monitoringStats, memoryStats, processorStats;

            try {
                aiStats = aiService.getStats();
            } catch (e) {
                console.warn('AI service stats unavailable:', e);
                aiStats = { available: false, error: 'Service unavailable' };
            }

            try {
                enhancedStats = enhancedAIService.getStats();
            } catch (e) {
                console.warn('Enhanced AI service stats unavailable:', e);
                enhancedStats = { available: false, error: 'Service unavailable' };
            }

            try {
                monitoringStats = AIMonitoring.getStats();
            } catch (e) {
                console.warn('AI monitoring stats unavailable:', e);
                monitoringStats = { available: false, error: 'Service unavailable' };
            }

            try {
                memoryStats = conversationMemory.getStats();
            } catch (e) {
                console.warn('Memory stats unavailable:', e);
                memoryStats = { available: false, error: 'Service unavailable' };
            }

            try {
                processorStats = enhancedAutoProcessor.getQueueStatus();
            } catch (e) {
                console.warn('Processor stats unavailable:', e);
                processorStats = { available: false, error: 'Service unavailable' };
            }

            // Check WhatsApp session status
            let whatsappStatus = {
                connected: false,
                ready: false,
                message: 'WhatsApp session status unknown',
                requiresQR: false,
                reauthUrl: '/qr' // URL for QR code authentication
            };

            try {
                // Check if bot instance exists and is connected
                // Using type-safe access to global bot instance
                const botInstance = typeof globalThis !== 'undefined' && (globalThis as any).botInstance
                    ? (globalThis as any).botInstance
                    : undefined;

                if (botInstance && botInstance.provider) {
                    const provider = botInstance.provider;
                    // Different providers have different ways to check connection
                    // Baileys provider typically has a 'sock' property
                    if (provider.vendor && provider.vendor.user) {
                        whatsappStatus.connected = true;
                        whatsappStatus.ready = true;
                        whatsappStatus.message = `Connected as ${provider.vendor.user.name || 'WhatsApp Bot'}`;
                    } else if (provider.sock) {
                        whatsappStatus.connected = true;
                        whatsappStatus.ready = true;
                        whatsappStatus.message = 'WhatsApp session connected';
                    } else {
                        whatsappStatus.connected = false;
                        whatsappStatus.requiresQR = true;
                        whatsappStatus.message = 'WhatsApp not connected. Please scan QR code to connect.';
                    }
                } else {
                    whatsappStatus.connected = false;
                    whatsappStatus.requiresQR = true;
                    whatsappStatus.message = 'WhatsApp bot not initialized. Please restart the application and scan QR code.';
                }
            } catch (e) {
                console.warn('Could not determine WhatsApp session status:', e);
                whatsappStatus.message = 'WhatsApp session status check failed. Bot may not be initialized.';
            }

            // If WhatsApp is not connected, return 401 with reauth URL
            if (!whatsappStatus.connected || !whatsappStatus.ready) {
                (res as any).writeHead(401, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({
                    success: false,
                    error: 'WhatsApp session not active',
                    message: whatsappStatus.message,
                    requiresAuth: true,
                    reauthUrl: whatsappStatus.reauthUrl,
                    whatsappStatus
                }));
                return;
            }

            const dashboard = {
                timestamp: new Date().toISOString(),
                sessionIndependent: true, // Flag indicating this works without WhatsApp session
                whatsapp: whatsappStatus, // WhatsApp session information
                ai: {
                    service: aiStats,
                    enhanced: enhancedStats,
                    monitoring: monitoringStats
                },
                memory: memoryStats,
                processor: processorStats,
                system: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    version: APP_VERSION
                }
            };

            // Use writeHead/end for Polka compatibility (BuilderBot's server)
            (res as any).writeHead(200, { 'Content-Type': 'application/json' });
            (res as any).end(JSON.stringify({
                success: true,
                data: dashboard,
                message: 'Dashboard data loaded successfully (WhatsApp connected)',
                whatsappStatus: whatsappStatus.message
            }));
        } catch (error: any) {
            console.error('Error in getDashboard:', error);
            (res as any).writeHead(500, { 'Content-Type': 'application/json' });
            (res as any).end(JSON.stringify({
                success: false,
                error: error.message || 'Error loading dashboard',
                message: 'Dashboard service encountered an error. Please check service logs.'
            }));
        }
    }

    /**
     * Get conversation memory stats for a user
     */
    static async getUserMemory(req: Request, res: Response): Promise<void> {
        try {
            const { phone } = req.params;

            if (!phone) {
                res.status(400).json({
                    success: false,
                    error: 'Phone number required'
                });
                return;
            }

            const context = await conversationMemory.getContext(phone);

            res.json({
                success: true,
                data: {
                    phone,
                    summary: context.summary,
                    recentTurns: context.recentTurns.length,
                    lastTurns: context.recentTurns.slice(-5).map(turn => ({
                        role: turn.role,
                        content: turn.content.substring(0, 100),
                        timestamp: turn.timestamp
                    }))
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Clear conversation memory for a user
     */
    static async clearUserMemory(req: Request, res: Response): Promise<void> {
        try {
            const { phone } = req.params;

            if (!phone) {
                res.status(400).json({
                    success: false,
                    error: 'Phone number required'
                });
                return;
            }

            await conversationMemory.clearUserMemory(phone);

            res.json({
                success: true,
                message: `Memory cleared for ${phone}`
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Test intent classification
     */
    static async testIntent(req: Request, res: Response): Promise<void> {
        try {
            const { message } = req.body;

            if (!message) {
                res.status(400).json({
                    success: false,
                    error: 'Message required'
                });
                return;
            }

            const classification = await intentClassifier.classify(message);
            const explanation = intentClassifier.explainClassification(classification);

            res.json({
                success: true,
                data: {
                    message,
                    classification,
                    explanation
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get processing queue status
     */
    static async getProcessingQueue(req: Request, res: Response): Promise<void> {
        try {
            const status = await enhancedAutoProcessor.getQueueStatus();

            res.json({
                success: true,
                data: status
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get specific processing job
     */
    static async getProcessingJob(req: Request, res: Response): Promise<void> {
        try {
            const jobId = parseInt(req.params.jobId);

            if (isNaN(jobId)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid job ID'
                });
                return;
            }

            const job = enhancedAutoProcessor.getJob(jobId);

            if (!job) {
                res.status(404).json({
                    success: false,
                    error: 'Job not found'
                });
                return;
            }

            res.json({
                success: true,
                data: job
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Retry a failed processing job
     */
    static async retryProcessingJob(req: Request, res: Response): Promise<void> {
        try {
            const jobId = parseInt(req.params.jobId);

            if (isNaN(jobId)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid job ID'
                });
                return;
            }

            const success = await enhancedAutoProcessor.retryJob(jobId);

            res.json({
                success,
                message: success ? 'Job queued for retry' : 'Could not retry job'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Cancel a processing job
     */
    static async cancelProcessingJob(req: Request, res: Response): Promise<void> {
        try {
            const jobId = parseInt(req.params.jobId);

            if (isNaN(jobId)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid job ID'
                });
                return;
            }

            const success = await enhancedAutoProcessor.cancelJob(jobId);

            res.json({
                success,
                message: success ? 'Job cancelled' : 'Could not cancel job'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get AI performance metrics
     */
    static async getAIMetrics(req: Request, res: Response): Promise<void> {
        try {
            const stats = aiService.getStats();
            const monitoring = AIMonitoring.getStats();

            res.json({
                success: true,
                data: {
                    stats,
                    monitoring,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Test AI response generation
     */
    static async testAIResponse(req: Request, res: Response): Promise<void> {
        try {
            const { message, phone } = req.body;

            if (!message) {
                res.status(400).json({
                    success: false,
                    error: 'Message required'
                });
                return;
            }

            const userSession = {
                phone: phone || 'test_user',
                name: 'Test User',
                stage: 'testing',
                currentFlow: 'test',
                buyingIntent: 50,
                lastInteraction: new Date(),
                interactions: []
            };

            const startTime = Date.now();
            const response = await aiService.generateResponse(message, userSession as any);
            const responseTime = Date.now() - startTime;

            res.json({
                success: true,
                data: {
                    message,
                    response,
                    responseTime,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get system health
     */
    static async getSystemHealth(req: Request, res: Response): Promise<void> {
        try {
            const memStats = conversationMemory.getStats();
            const queueStats = await enhancedAutoProcessor.getQueueStatus();
            const aiStats = aiService.getStats();

            const health = {
                status: 'healthy',
                services: {
                    ai: aiStats.isAvailable,
                    memory: memStats.cachedConversations < memStats.maxCacheSize,
                    processor: queueStats.processing < queueStats.maxConcurrent
                },
                memory: {
                    ...memStats,
                    healthStatus: memStats.utilizationPercent < 80 ? 'healthy' :
                        memStats.utilizationPercent < 95 ? 'warning' : 'critical'
                },
                processor: {
                    ...queueStats,
                    healthStatus: queueStats.processing < queueStats.maxConcurrent ? 'healthy' : 'warning'
                },
                system: {
                    uptime: process.uptime(),
                    memory: {
                        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
                        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                    }
                },
                timestamp: new Date().toISOString()
            };

            const allServicesHealthy = Object.values(health.services).every(s => s === true);
            health.status = allServicesHealthy ? 'healthy' : 'degraded';

            res.json({
                success: true,
                data: health
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}
