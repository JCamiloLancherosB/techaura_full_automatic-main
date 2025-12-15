/**
 * Conversation Memory System
 * Manages structured conversation history with summarization and context retrieval
 */

import { businessDB } from '../mysql-database';
import type { UserSession } from '../../types/global';

export interface ConversationTurn {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
        intent?: string;
        confidence?: number;
        entities?: Record<string, any>;
        flowState?: string;
    };
}

export interface ConversationSummary {
    phone: string;
    mainTopics: string[];
    userIntents: string[];
    productInterests: string[];
    priceDiscussed: boolean;
    decisionStage: string;
    keyEntities: Record<string, any>;
    lastUpdated: Date;
}

export interface ConversationContext {
    recentTurns: ConversationTurn[];
    summary: ConversationSummary;
    relevantHistory: string[];
}

export class ConversationMemory {
    private static instance: ConversationMemory;
    private memoryCache = new Map<string, ConversationTurn[]>();
    private summaryCache = new Map<string, ConversationSummary>();
    private readonly MAX_CACHE_SIZE = 1000;
    private readonly MAX_TURNS_IN_MEMORY = 50;
    private readonly SUMMARIZE_THRESHOLD = 20;

    static getInstance(): ConversationMemory {
        if (!ConversationMemory.instance) {
            ConversationMemory.instance = new ConversationMemory();
        }
        return ConversationMemory.instance;
    }

    /**
     * Add a conversation turn to memory
     */
    async addTurn(
        phone: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        metadata?: ConversationTurn['metadata']
    ): Promise<void> {
        try {
            const turn: ConversationTurn = {
                role,
                content,
                timestamp: new Date(),
                metadata
            };

            // Add to cache
            let turns = this.memoryCache.get(phone) || [];
            turns.push(turn);

            // Keep only recent turns in memory
            if (turns.length > this.MAX_TURNS_IN_MEMORY) {
                turns = turns.slice(-this.MAX_TURNS_IN_MEMORY);
            }
            this.memoryCache.set(phone, turns);

            // Persist to database
            await this.persistTurn(phone, turn);

            // Trigger summarization if needed
            if (turns.length >= this.SUMMARIZE_THRESHOLD) {
                await this.summarizeConversation(phone);
            }

            // Cleanup cache if too large
            if (this.memoryCache.size > this.MAX_CACHE_SIZE) {
                this.cleanupCache();
            }
        } catch (error) {
            console.error('❌ Error adding conversation turn:', error);
        }
    }

    /**
     * Get conversation context for AI response generation
     */
    async getContext(phone: string, maxTurns: number = 10): Promise<ConversationContext> {
        try {
            // Get recent turns from cache or database
            let recentTurns = this.memoryCache.get(phone);
            if (!recentTurns || recentTurns.length === 0) {
                recentTurns = await this.loadTurnsFromDB(phone, maxTurns);
                this.memoryCache.set(phone, recentTurns);
            }

            // Get or create summary
            let summary = this.summaryCache.get(phone);
            if (!summary) {
                summary = await this.loadOrCreateSummary(phone);
                this.summaryCache.set(phone, summary);
            }

            // Build relevant history for context
            const relevantHistory = this.buildRelevantHistory(recentTurns, maxTurns);

            return {
                recentTurns: recentTurns.slice(-maxTurns),
                summary,
                relevantHistory
            };
        } catch (error) {
            console.error('❌ Error getting conversation context:', error);
            return {
                recentTurns: [],
                summary: this.createDefaultSummary(phone),
                relevantHistory: []
            };
        }
    }

    /**
     * Summarize conversation to maintain context without overwhelming AI
     */
    private async summarizeConversation(phone: string): Promise<void> {
        try {
            const turns = this.memoryCache.get(phone);
            if (!turns || turns.length < this.SUMMARIZE_THRESHOLD) {
                return;
            }

            const summary = this.extractSummaryFromTurns(turns);
            this.summaryCache.set(phone, summary);

            // Persist summary
            await this.persistSummary(phone, summary);

            console.log(`✅ Conversation summarized for ${phone}`);
        } catch (error) {
            console.error('❌ Error summarizing conversation:', error);
        }
    }

    /**
     * Extract summary from conversation turns using pattern matching and analysis
     */
    private extractSummaryFromTurns(turns: ConversationTurn[]): ConversationSummary {
        const mainTopics = new Set<string>();
        const userIntents = new Set<string>();
        const productInterests = new Set<string>();
        let priceDiscussed = false;
        const keyEntities: Record<string, any> = {};

        // Product keywords
        const productKeywords = {
            music: ['música', 'musica', 'canciones', 'playlist', 'género', 'artista'],
            movies: ['películas', 'peliculas', 'films', 'cine'],
            videos: ['videos', 'clips'],
            usb: ['usb', 'memoria', 'capacidad', '16gb', '32gb', '64gb', '128gb']
        };

        // Intent patterns
        const intentPatterns = {
            pricing: /precio|costo|cuanto|cuánto|vale|pago/i,
            customization: /personaliz|custom|preferencias|géneros|artistas/i,
            ordering: /comprar|pedido|orden|quiero|necesito/i,
            inquiry: /qué|que|cuál|cual|como|cómo|cuándo|cuando/i
        };

        turns.forEach(turn => {
            const content = turn.content.toLowerCase();

            // Extract topics
            Object.entries(productKeywords).forEach(([product, keywords]) => {
                if (keywords.some(kw => content.includes(kw))) {
                    productInterests.add(product);
                    mainTopics.add(product);
                }
            });

            // Extract intents
            Object.entries(intentPatterns).forEach(([intent, pattern]) => {
                if (pattern.test(content)) {
                    userIntents.add(intent);
                }
            });

            // Check for price discussion
            if (/precio|costo|cuanto|cuánto|\$|dinero|pago/i.test(content)) {
                priceDiscussed = true;
            }

            // Extract metadata entities
            if (turn.metadata?.entities) {
                Object.assign(keyEntities, turn.metadata.entities);
            }
        });

        // Determine decision stage based on intents and topics
        let decisionStage = 'awareness';
        if (userIntents.has('ordering')) {
            decisionStage = 'decision';
        } else if (priceDiscussed || userIntents.has('pricing')) {
            decisionStage = 'consideration';
        } else if (userIntents.has('customization')) {
            decisionStage = 'interest';
        }

        return {
            phone: turns[0]?.metadata?.flowState || 'unknown',
            mainTopics: Array.from(mainTopics),
            userIntents: Array.from(userIntents),
            productInterests: Array.from(productInterests),
            priceDiscussed,
            decisionStage,
            keyEntities,
            lastUpdated: new Date()
        };
    }

    /**
     * Build relevant history string for AI context
     */
    private buildRelevantHistory(turns: ConversationTurn[], maxTurns: number): string[] {
        return turns
            .slice(-maxTurns)
            .map(turn => `[${turn.role}]: ${turn.content}`)
            .filter(msg => msg.length > 0);
    }

    /**
     * Persist conversation turn to database
     */
    private async persistTurn(phone: string, turn: ConversationTurn): Promise<void> {
        try {
            // Try to use businessDB method if available
            if (typeof (businessDB as any).logConversationTurn === 'function') {
                await (businessDB as any).logConversationTurn({
                    phone,
                    role: turn.role,
                    content: turn.content,
                    metadata: turn.metadata,
                    timestamp: turn.timestamp
                });
            } else if (typeof businessDB.logMessage === 'function') {
                // Fallback to logMessage
                await businessDB.logMessage({
                    phone,
                    message: `[${turn.role}] ${turn.content}`,
                    type: turn.role === 'user' ? 'incoming' : 'outgoing',
                    automated: turn.role !== 'user',
                    timestamp: turn.timestamp
                });
            }
        } catch (error) {
            console.warn('⚠️ Could not persist conversation turn:', error);
        }
    }

    /**
     * Persist conversation summary to database
     */
    private async persistSummary(phone: string, summary: ConversationSummary): Promise<void> {
        try {
            if (typeof (businessDB as any).saveConversationSummary === 'function') {
                await (businessDB as any).saveConversationSummary(phone, summary);
            }
            // If method doesn't exist, silently skip
        } catch (error) {
            console.warn('⚠️ Could not persist conversation summary:', error);
        }
    }

    /**
     * Load conversation turns from database
     */
    private async loadTurnsFromDB(phone: string, limit: number): Promise<ConversationTurn[]> {
        try {
            if (typeof (businessDB as any).getConversationTurns === 'function') {
                return await (businessDB as any).getConversationTurns(phone, limit);
            }
            return [];
        } catch (error) {
            console.warn('⚠️ Could not load conversation turns from DB:', error);
            return [];
        }
    }

    /**
     * Load or create conversation summary
     */
    private async loadOrCreateSummary(phone: string): Promise<ConversationSummary> {
        try {
            if (typeof (businessDB as any).getConversationSummary === 'function') {
                const summary = await (businessDB as any).getConversationSummary(phone);
                if (summary) return summary;
            }
        } catch (error) {
            console.warn('⚠️ Could not load conversation summary:', error);
        }

        return this.createDefaultSummary(phone);
    }

    /**
     * Create default summary
     */
    private createDefaultSummary(phone: string): ConversationSummary {
        return {
            phone,
            mainTopics: [],
            userIntents: [],
            productInterests: [],
            priceDiscussed: false,
            decisionStage: 'awareness',
            keyEntities: {},
            lastUpdated: new Date()
        };
    }

    /**
     * Cleanup cache to prevent memory issues
     */
    private cleanupCache(): void {
        // Remove oldest entries if cache is too large
        const entries = Array.from(this.memoryCache.entries());
        const toKeep = entries.slice(-Math.floor(this.MAX_CACHE_SIZE * 0.8));
        this.memoryCache = new Map(toKeep);

        const summaryEntries = Array.from(this.summaryCache.entries());
        const summariesToKeep = summaryEntries.slice(-Math.floor(this.MAX_CACHE_SIZE * 0.8));
        this.summaryCache = new Map(summariesToKeep);

        console.log('🧹 Conversation memory cache cleaned');
    }

    /**
     * Clear memory for a specific user
     */
    async clearUserMemory(phone: string): Promise<void> {
        this.memoryCache.delete(phone);
        this.summaryCache.delete(phone);
        console.log(`🗑️ Cleared memory for ${phone}`);
    }

    /**
     * Get memory statistics
     */
    getStats() {
        return {
            cachedConversations: this.memoryCache.size,
            cachedSummaries: this.summaryCache.size,
            maxCacheSize: this.MAX_CACHE_SIZE,
            utilizationPercent: Math.round((this.memoryCache.size / this.MAX_CACHE_SIZE) * 100)
        };
    }
}

export const conversationMemory = ConversationMemory.getInstance();
