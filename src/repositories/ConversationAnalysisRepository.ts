/**
 * Conversation Analysis Repository
 * 
 * Manages storage and retrieval of AI-generated conversation analysis
 */

import { db } from '../database/knex';

export interface ConversationAnalysis {
    id?: number;
    phone: string;
    summary?: string;
    intent?: string;
    objections?: string[];
    purchase_probability?: number;
    extracted_preferences?: Record<string, any>;
    sentiment?: 'positive' | 'neutral' | 'negative';
    engagement_score?: number;
    ai_model?: string;
    tokens_used?: number;
    analysis_duration_ms?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
    error_message?: string;
    skip_reason?: 'NO_HISTORY' | 'INVALID_PHONE';
    message_count?: number;
    conversation_start?: Date;
    conversation_end?: Date;
    created_at?: Date;
    updated_at?: Date;
    analyzed_at?: Date;
}

/**
 * Schema feature detection cache
 * Checks column existence once and caches the result in memory
 */
interface SchemaFeatureCache {
    hasSkipReasonColumn?: boolean;
    checkedAt?: Date;
}

export class ConversationAnalysisRepository {
    private tableName = 'conversation_analysis';
    private schemaCache: SchemaFeatureCache = {};

    /**
     * Check if skip_reason column exists (cached check)
     * Schema feature detection to maintain backward compatibility
     */
    async hasSkipReasonColumn(): Promise<boolean> {
        // Return cached result if available
        if (this.schemaCache.hasSkipReasonColumn !== undefined) {
            return this.schemaCache.hasSkipReasonColumn;
        }

        try {
            const result = await db.schema.hasColumn(this.tableName, 'skip_reason');
            this.schemaCache.hasSkipReasonColumn = result;
            this.schemaCache.checkedAt = new Date();
            
            if (!result) {
                console.warn('⚠️  ConversationAnalysisRepository: skip_reason column not found. Running in compatibility mode.');
            }
            
            return result;
        } catch (error) {
            console.error('Error checking skip_reason column:', error);
            // Default to false to avoid crashes
            this.schemaCache.hasSkipReasonColumn = false;
            return false;
        }
    }

    /**
     * Reset schema cache (useful for testing or after migrations)
     */
    resetSchemaCache(): void {
        this.schemaCache = {};
    }

    /**
     * Create a new conversation analysis record
     */
    async create(analysis: Omit<ConversationAnalysis, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
        try {
            const dataToInsert: any = {
                phone: analysis.phone,
                summary: analysis.summary || null,
                intent: analysis.intent || null,
                objections: analysis.objections ? JSON.stringify(analysis.objections) : null,
                purchase_probability: analysis.purchase_probability || null,
                extracted_preferences: analysis.extracted_preferences ? JSON.stringify(analysis.extracted_preferences) : null,
                sentiment: analysis.sentiment || null,
                engagement_score: analysis.engagement_score || null,
                ai_model: analysis.ai_model || null,
                tokens_used: analysis.tokens_used || null,
                analysis_duration_ms: analysis.analysis_duration_ms || null,
                status: analysis.status,
                error_message: analysis.error_message || null,
                message_count: analysis.message_count || 0,
                conversation_start: analysis.conversation_start || null,
                conversation_end: analysis.conversation_end || null,
                analyzed_at: analysis.analyzed_at || null
            };

            const [id] = await db(this.tableName).insert(dataToInsert);
            return id;
        } catch (error) {
            console.error('Error creating conversation analysis:', error);
            throw error;
        }
    }

    /**
     * Check if conversation_analysis table exists
     */
    async tableExists(): Promise<boolean> {
        const result = await db
            .select('TABLE_NAME')
            .from('INFORMATION_SCHEMA.TABLES')
            .whereRaw('TABLE_SCHEMA = DATABASE()')
            .where('TABLE_NAME', this.tableName)
            .limit(1);

        return result.length > 0;
    }

    /**
     * Update an existing conversation analysis
     * Implements schema feature detection to avoid crashes if skip_reason column doesn't exist
     */
    async update(id: number, updates: Partial<ConversationAnalysis>): Promise<void> {
        try {
            const dataToUpdate: any = {
                ...updates,
                updated_at: new Date()
            };

            // Convert JSON fields
            if (updates.objections !== undefined) {
                dataToUpdate.objections = updates.objections ? JSON.stringify(updates.objections) : null;
            }
            if (updates.extracted_preferences !== undefined) {
                dataToUpdate.extracted_preferences = updates.extracted_preferences ? JSON.stringify(updates.extracted_preferences) : null;
            }

            // Schema feature detection: check if skip_reason column exists
            // If it doesn't, omit it from the update to prevent "Unknown column" errors
            if (updates.skip_reason !== undefined) {
                const hasColumn = await this.hasSkipReasonColumn();
                if (!hasColumn) {
                    // Remove skip_reason from update data to prevent crash
                    delete dataToUpdate.skip_reason;
                    console.warn(`⚠️  Omitting skip_reason from update (column not in schema). Value was: ${updates.skip_reason}`);
                }
            }

            await db(this.tableName)
                .where({ id })
                .update(dataToUpdate);
        } catch (error) {
            console.error('Error updating conversation analysis:', error);
            throw error;
        }
    }

    /**
     * Get analysis by ID
     */
    async getById(id: number): Promise<ConversationAnalysis | null> {
        try {
            const result = await db(this.tableName)
                .where({ id })
                .first();

            return result ? this.deserializeAnalysis(result) : null;
        } catch (error) {
            console.error('Error getting conversation analysis by ID:', error);
            throw error;
        }
    }

    /**
     * Get latest analysis for a phone number
     */
    async getLatestByPhone(phone: string): Promise<ConversationAnalysis | null> {
        try {
            const result = await db(this.tableName)
                .where({ phone })
                .orderBy('created_at', 'desc')
                .first();

            return result ? this.deserializeAnalysis(result) : null;
        } catch (error) {
            console.error('Error getting latest analysis by phone:', error);
            throw error;
        }
    }

    /**
     * Get all analyses for a phone number
     */
    async getByPhone(phone: string, limit: number = 10): Promise<ConversationAnalysis[]> {
        try {
            const results = await db(this.tableName)
                .where({ phone })
                .orderBy('created_at', 'desc')
                .limit(limit);

            return results.map(r => this.deserializeAnalysis(r));
        } catch (error) {
            console.error('Error getting analyses by phone:', error);
            throw error;
        }
    }

    /**
     * Get pending analyses (for processing)
     */
    async getPendingAnalyses(limit: number = 10): Promise<ConversationAnalysis[]> {
        try {
            const results = await db(this.tableName)
                .where({ status: 'pending' })
                .orderBy('created_at', 'asc')
                .limit(limit);

            return results.map(r => this.deserializeAnalysis(r));
        } catch (error) {
            console.error('Error getting pending analyses:', error);
            throw error;
        }
    }

    /**
     * Get recent analyses with filters
     */
    async getRecentAnalyses(options: {
        status?: string;
        intent?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<ConversationAnalysis[]> {
        try {
            let query = db(this.tableName);

            if (options.status) {
                query = query.where({ status: options.status });
            }
            if (options.intent) {
                query = query.where({ intent: options.intent });
            }

            const results = await query
                .orderBy('created_at', 'desc')
                .limit(options.limit || 50)
                .offset(options.offset || 0);

            return results.map(r => this.deserializeAnalysis(r));
        } catch (error) {
            console.error('Error getting recent analyses:', error);
            throw error;
        }
    }

    /**
     * Get analytics summary
     */
    async getAnalyticsSummary(startDate?: Date, endDate?: Date): Promise<{
        total: number;
        byIntent: Record<string, number>;
        byStatus: Record<string, number>;
        avgPurchaseProbability: number;
        avgEngagementScore: number;
    }> {
        try {
            let query = db(this.tableName);

            if (startDate) {
                query = query.where('created_at', '>=', startDate);
            }
            if (endDate) {
                query = query.where('created_at', '<=', endDate);
            }

            const [totals, intentStats, statusStats] = await Promise.all([
                query.clone().count('* as total')
                    .avg('purchase_probability as avgPurchaseProbability')
                    .avg('engagement_score as avgEngagementScore')
                    .first(),
                query.clone().select('intent')
                    .count('* as count')
                    .whereNotNull('intent')
                    .groupBy('intent'),
                query.clone().select('status')
                    .count('* as count')
                    .groupBy('status')
            ]);

            const byIntent: Record<string, number> = {};
            intentStats.forEach((row: any) => {
                byIntent[row.intent] = parseInt(row.count);
            });

            const byStatus: Record<string, number> = {};
            statusStats.forEach((row: any) => {
                byStatus[row.status] = parseInt(row.count);
            });

            return {
                total: parseInt(totals?.total || 0),
                byIntent,
                byStatus,
                avgPurchaseProbability: parseFloat(totals?.avgPurchaseProbability || 0),
                avgEngagementScore: parseFloat(totals?.avgEngagementScore || 0)
            };
        } catch (error) {
            console.error('Error getting analytics summary:', error);
            throw error;
        }
    }

    /**
     * Check if a phone has recent analysis (within last N hours)
     */
    async hasRecentAnalysis(phone: string, hoursAgo: number = 24): Promise<boolean> {
        try {
            const cutoffTime = new Date();
            cutoffTime.setHours(cutoffTime.getHours() - hoursAgo);

            const result = await db(this.tableName)
                .where({ phone, status: 'completed' })
                .where('analyzed_at', '>=', cutoffTime)
                .first();

            return !!result;
        } catch (error) {
            console.error('Error checking for recent analysis:', error);
            return false;
        }
    }

    /**
     * Deserialize JSON fields
     */
    private deserializeAnalysis(row: any): ConversationAnalysis {
        return {
            ...row,
            objections: row.objections ? JSON.parse(row.objections) : null,
            extracted_preferences: row.extracted_preferences ? JSON.parse(row.extracted_preferences) : null
        };
    }
}

// Export singleton instance
export const conversationAnalysisRepository = new ConversationAnalysisRepository();
