/**
 * Conversation Analysis Service
 * 
 * Uses AI to analyze conversations and extract:
 * - Intent (purchase, inquiry, complaint, browsing)
 * - Objections (price, features, trust, timing)
 * - Purchase probability (0-100%)
 * - Summary
 */

import { aiGateway } from './aiGateway';
import { conversationMemory } from './conversationMemory';
import { db } from '../database/knex';

export interface ConversationAnalysisResult {
    summary: string;
    intent: string;
    objections: string[];
    purchase_probability: number;
    extracted_preferences: Record<string, any>;
    sentiment: 'positive' | 'neutral' | 'negative';
    engagement_score: number;
    ai_model?: string;
    tokens_used?: number;
    analysis_duration_ms?: number;
    skipped?: boolean;
    skip_reason?: 'NO_HISTORY' | 'INVALID_PHONE';
}

export class ConversationAnalysisService {
    /**
     * Validate phone number format
     * Returns false for absurdly long or invalid phone numbers
     */
    private isValidPhone(phone: string): boolean {
        if (!phone || typeof phone !== 'string') {
            return false;
        }
        // Phone numbers should be 7-20 digits after cleaning
        // Reject extremely long numbers (> 20 chars) which are likely invalid
        const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
        return cleaned.length >= 7 && cleaned.length <= 20 && /^\d+$/.test(cleaned);
    }

    /**
     * Analyze a conversation for a given phone number
     */
    async analyzeConversation(phone: string): Promise<ConversationAnalysisResult> {
        const startTime = Date.now();

        try {
            // Validate phone number first
            if (!this.isValidPhone(phone)) {
                console.warn(`⚠️  Skipping analysis for invalid phone format`);
                return this.createSkippedResult('INVALID_PHONE', Date.now() - startTime);
            }

            // Get conversation history
            const conversationHistory = await this.getConversationHistory(phone);

            if (!conversationHistory || conversationHistory.length === 0) {
                console.warn(`⚠️  No conversation history found for phone: ${phone}`);
                return this.createSkippedResult('NO_HISTORY', Date.now() - startTime);
            }

            // Build conversation text for analysis
            const conversationText = this.buildConversationText(conversationHistory);

            // Call AI to analyze
            const analysisPrompt = this.buildAnalysisPrompt(conversationText);
            
            const aiResponse = await aiGateway.generateResponse(analysisPrompt);

            // Parse AI response
            const analysis = this.parseAIResponse(aiResponse.response);

            // Calculate analysis duration
            const duration = Date.now() - startTime;

            return {
                ...analysis,
                ai_model: aiResponse.metadata.ai_used || 'unknown',
                tokens_used: aiResponse.metadata.tokens_est || 0,
                analysis_duration_ms: duration
            };

        } catch (error) {
            console.error('Error analyzing conversation:', error);
            throw error;
        }
    }

    /**
     * Create a skipped result when analysis cannot be performed
     */
    private createSkippedResult(reason: 'NO_HISTORY' | 'INVALID_PHONE', durationMs: number): ConversationAnalysisResult {
        return {
            summary: `Analysis skipped: ${reason}`,
            intent: 'unknown',
            objections: [],
            purchase_probability: 0,
            extracted_preferences: {},
            sentiment: 'neutral',
            engagement_score: 0,
            analysis_duration_ms: durationMs,
            skipped: true,
            skip_reason: reason
        };
    }

    /**
     * Get conversation history from database
     * Uses the 'messages' table as the source of truth
     */
    private async getConversationHistory(phone: string): Promise<any[]> {
        try {
            // Get from conversation memory first
            const context = await conversationMemory.getContext(phone, 50);
            if (context && context.recentTurns && context.recentTurns.length > 0) {
                return context.recentTurns;
            }

            // Fall back to database query from 'messages' table
            const messages = await db('messages')
                .where({ phone })
                .orderBy('created_at', 'asc')
                .limit(100); // Last 100 messages

            return messages.map((msg: any) => ({
                role: msg.type === 'incoming' ? 'user' : 'assistant',
                content: msg.message || msg.body || '',
                timestamp: msg.created_at || msg.timestamp
            }));

        } catch (error) {
            console.error('Error getting conversation history:', error);
            // Return empty array if we can't get history
            return [];
        }
    }

    /**
     * Build readable conversation text from history
     */
    private buildConversationText(history: any[]): string {
        return history
            .map(turn => {
                const role = turn.role === 'user' ? 'Cliente' : 'Asistente';
                return `${role}: ${turn.content}`;
            })
            .join('\n');
    }

    /**
     * Build the AI prompt for conversation analysis
     */
    private buildAnalysisPrompt(conversationText: string): string {
        return `Analiza la siguiente conversación de WhatsApp con un cliente de TechAura (empresa que vende memorias USB personalizadas con música, videos y películas).

CONVERSACIÓN:
${conversationText}

Por favor, proporciona un análisis detallado en formato JSON con la siguiente estructura:

{
  "summary": "Resumen breve de la conversación (2-3 oraciones)",
  "intent": "purchase|inquiry|complaint|browsing|support",
  "objections": ["lista de objeciones mencionadas: price_concern, feature_question, trust_issue, timing_concern, technical_question, etc"],
  "purchase_probability": 75,
  "extracted_preferences": {
    "music_genres": ["reggaeton", "salsa"],
    "artists": ["Bad Bunny"],
    "movies": [],
    "capacity": "32GB"
  },
  "sentiment": "positive|neutral|negative",
  "engagement_score": 85
}

INSTRUCCIONES:
- **summary**: Resume la conversación en 2-3 oraciones.
- **intent**: Clasifica la intención principal (purchase=quiere comprar, inquiry=pregunta, complaint=queja, browsing=explorando, support=soporte).
- **objections**: Lista las objeciones mencionadas por el cliente (ej: price_concern, feature_question, trust_issue, timing_concern).
- **purchase_probability**: Probabilidad de compra del 0-100% basada en el interés mostrado.
- **extracted_preferences**: Extrae preferencias mencionadas (géneros musicales, artistas, películas, capacidad de USB).
- **sentiment**: Sentimiento general del cliente (positive, neutral, negative).
- **engagement_score**: Nivel de compromiso del cliente del 0-100% (qué tan activo y receptivo está).

Responde ÚNICAMENTE con el JSON, sin texto adicional.`;
    }

    /**
     * Parse AI response and extract structured data
     */
    private parseAIResponse(aiResponseText: string): Omit<ConversationAnalysisResult, 'ai_model' | 'tokens_used' | 'analysis_duration_ms'> {
        try {
            // Try to extract JSON from the response
            const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Validate and normalize the response
            return {
                summary: parsed.summary || 'No summary available',
                intent: this.normalizeIntent(parsed.intent),
                objections: Array.isArray(parsed.objections) ? parsed.objections : [],
                purchase_probability: this.normalizeProbability(parsed.purchase_probability),
                extracted_preferences: parsed.extracted_preferences || {},
                sentiment: this.normalizeSentiment(parsed.sentiment),
                engagement_score: this.normalizeScore(parsed.engagement_score)
            };

        } catch (error) {
            console.error('Error parsing AI response:', error);
            
            // Return default analysis if parsing fails
            return {
                summary: 'Error parsing AI analysis',
                intent: 'unknown',
                objections: [],
                purchase_probability: 0,
                extracted_preferences: {},
                sentiment: 'neutral',
                engagement_score: 0
            };
        }
    }

    /**
     * Normalize intent to valid values
     */
    private normalizeIntent(intent: string): string {
        const validIntents = ['purchase', 'inquiry', 'complaint', 'browsing', 'support', 'unknown'];
        const normalized = intent?.toLowerCase() || 'unknown';
        return validIntents.includes(normalized) ? normalized : 'unknown';
    }

    /**
     * Normalize probability to 0-100 range
     */
    private normalizeProbability(value: any): number {
        const num = parseFloat(value);
        if (isNaN(num)) return 0;
        return Math.max(0, Math.min(100, num));
    }

    /**
     * Normalize sentiment to valid values
     */
    private normalizeSentiment(sentiment: string): 'positive' | 'neutral' | 'negative' {
        const normalized = sentiment?.toLowerCase() || 'neutral';
        if (normalized === 'positive' || normalized === 'negative') {
            return normalized;
        }
        return 'neutral';
    }

    /**
     * Normalize score to 0-100 range
     */
    private normalizeScore(value: any): number {
        const num = parseFloat(value);
        if (isNaN(num)) return 0;
        return Math.max(0, Math.min(100, num));
    }

    /**
     * Get conversation statistics for a phone number
     * Uses the 'messages' table as the source of truth
     */
    async getConversationStats(phone: string): Promise<{
        message_count: number;
        conversation_start: Date | null;
        conversation_end: Date | null;
    }> {
        try {
            const result = await db('messages')
                .where({ phone })
                .count('* as message_count')
                .min('created_at as conversation_start')
                .max('created_at as conversation_end')
                .first();

            return {
                message_count: parseInt(String(result?.message_count || '0')),
                conversation_start: result?.conversation_start || null,
                conversation_end: result?.conversation_end || null
            };

        } catch (error) {
            console.error('Error getting conversation stats:', error);
            return {
                message_count: 0,
                conversation_start: null,
                conversation_end: null
            };
        }
    }
}

// Export singleton instance
export const conversationAnalysisService = new ConversationAnalysisService();
