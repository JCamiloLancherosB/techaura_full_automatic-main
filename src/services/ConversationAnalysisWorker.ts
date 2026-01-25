/**
 * Conversation Analysis Worker
 * 
 * Asynchronously processes conversation analysis jobs.
 * Runs in the background without blocking chat functionality.
 */

import { EventEmitter } from 'events';
import { conversationAnalysisRepository, ConversationAnalysis } from '../repositories/ConversationAnalysisRepository';
import { conversationAnalysisService } from './ConversationAnalysisService';
import { userSessions } from '../flows/userTrackingSystem';

export interface AnalysisWorkerConfig {
    pollIntervalMs?: number;
    batchSize?: number;
    enabled?: boolean;
}

export class ConversationAnalysisWorker extends EventEmitter {
    private pollIntervalMs: number;
    private batchSize: number;
    private enabled: boolean;
    private isRunning: boolean = false;
    private pollTimer: NodeJS.Timeout | null = null;
    private processingCount: number = 0;

    constructor(config: AnalysisWorkerConfig = {}) {
        super();
        
        this.pollIntervalMs = config.pollIntervalMs || 60000; // 1 minute default
        this.batchSize = config.batchSize || 5; // Process 5 at a time
        this.enabled = config.enabled !== undefined ? config.enabled : true;
    }

    /**
     * Start the worker
     */
    async start(): Promise<void> {
        if (!this.enabled) {
            console.log('⚠️  Conversation Analysis Worker is disabled');
            return;
        }

        if (this.isRunning) {
            console.log('⚠️  Conversation Analysis Worker is already running');
            return;
        }

        console.log('🚀 Starting Conversation Analysis Worker...');
        console.log(`   Poll interval: ${this.pollIntervalMs}ms`);
        console.log(`   Batch size: ${this.batchSize}`);

        this.isRunning = true;
        this.emit('worker:started');

        // Start polling for pending analyses
        this.startPolling();

        console.log('✅ Conversation Analysis Worker started successfully');
    }

    /**
     * Stop the worker
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        console.log('🛑 Stopping Conversation Analysis Worker...');

        this.isRunning = false;

        // Stop polling
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }

        // Wait for any processing to complete
        let waitCount = 0;
        while (this.processingCount > 0 && waitCount < 30) {
            console.log(`⏳ Waiting for ${this.processingCount} analyses to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitCount++;
        }

        this.emit('worker:stopped');
        console.log('✅ Conversation Analysis Worker stopped');
    }

    /**
     * Start polling for pending analyses
     */
    private startPolling(): void {
        const poll = async () => {
            if (!this.isRunning) {
                return;
            }

            try {
                await this.processPendingAnalyses();
            } catch (error) {
                console.error('Error in analysis worker poll cycle:', error);
                this.emit('worker:error', error);
            }

            // Schedule next poll
            if (this.isRunning) {
                this.pollTimer = setTimeout(poll, this.pollIntervalMs);
            }
        };

        // Start first poll
        poll();
    }

    /**
     * Process pending analyses
     */
    private async processPendingAnalyses(): Promise<void> {
        try {
            // Get pending analyses
            const pendingAnalyses = await conversationAnalysisRepository.getPendingAnalyses(this.batchSize);

            if (pendingAnalyses.length === 0) {
                return; // Nothing to process
            }

            console.log(`📊 Processing ${pendingAnalyses.length} pending conversation analyses`);

            // Process each analysis
            for (const analysis of pendingAnalyses) {
                if (!this.isRunning) {
                    break; // Stop processing if worker is stopped
                }

                await this.processAnalysis(analysis);
            }

        } catch (error) {
            console.error('Error processing pending analyses:', error);
            throw error;
        }
    }

    /**
     * Process a single analysis
     */
    private async processAnalysis(analysis: ConversationAnalysis): Promise<void> {
        this.processingCount++;
        const analysisId = analysis.id!;

        try {
            console.log(`🔍 Analyzing conversation for phone: ${analysis.phone}`);

            // Update status to processing
            await conversationAnalysisRepository.update(analysisId, {
                status: 'processing'
            });

            // Perform the analysis
            const result = await conversationAnalysisService.analyzeConversation(analysis.phone);

            // Get conversation stats
            const stats = await conversationAnalysisService.getConversationStats(analysis.phone);

            // Update with results
            await conversationAnalysisRepository.update(analysisId, {
                status: 'completed',
                summary: result.summary,
                intent: result.intent,
                objections: result.objections,
                purchase_probability: result.purchase_probability,
                extracted_preferences: result.extracted_preferences,
                sentiment: result.sentiment,
                engagement_score: result.engagement_score,
                ai_model: result.ai_model,
                tokens_used: result.tokens_used,
                analysis_duration_ms: result.analysis_duration_ms,
                message_count: stats.message_count,
                conversation_start: stats.conversation_start,
                conversation_end: stats.conversation_end,
                analyzed_at: new Date()
            });

            console.log(`✅ Analysis completed for phone: ${analysis.phone}`);
            console.log(`   Intent: ${result.intent}, Purchase Probability: ${result.purchase_probability}%`);

            this.emit('analysis:completed', {
                analysisId,
                phone: analysis.phone,
                result
            });

        } catch (error) {
            console.error(`❌ Error analyzing conversation for phone ${analysis.phone}:`, error);

            // Update status to failed
            await conversationAnalysisRepository.update(analysisId, {
                status: 'failed',
                error_message: error instanceof Error ? error.message : 'Unknown error'
            });

            this.emit('analysis:failed', {
                analysisId,
                phone: analysis.phone,
                error
            });

        } finally {
            this.processingCount--;
        }
    }

    /**
     * Queue a new analysis for a phone number
     */
    async queueAnalysis(phone: string): Promise<number> {
        try {
            // Check if there's a recent analysis (within last 24 hours)
            const hasRecent = await conversationAnalysisRepository.hasRecentAnalysis(phone, 24);
            
            if (hasRecent) {
                console.log(`⏭️  Skipping analysis for ${phone} - recent analysis exists`);
                return -1;
            }

            // Create pending analysis record
            const analysisId = await conversationAnalysisRepository.create({
                phone,
                status: 'pending'
            });

            console.log(`📝 Queued analysis for phone: ${phone} (ID: ${analysisId})`);
            this.emit('analysis:queued', { analysisId, phone });

            return analysisId;

        } catch (error) {
            console.error('Error queuing analysis:', error);
            throw error;
        }
    }

    /**
     * Trigger immediate processing (for testing or manual trigger)
     */
    async processNow(): Promise<void> {
        console.log('🚀 Triggering immediate analysis processing...');
        await this.processPendingAnalyses();
    }

    /**
     * Get worker status
     */
    getStatus(): {
        isRunning: boolean;
        processingCount: number;
        pollIntervalMs: number;
        batchSize: number;
        enabled: boolean;
    } {
        return {
            isRunning: this.isRunning,
            processingCount: this.processingCount,
            pollIntervalMs: this.pollIntervalMs,
            batchSize: this.batchSize,
            enabled: this.enabled
        };
    }
}

// Export singleton instance
export const conversationAnalysisWorker = new ConversationAnalysisWorker({
    pollIntervalMs: 5 * 60 * 1000, // 5 minutes
    batchSize: 10,
    enabled: true
});
