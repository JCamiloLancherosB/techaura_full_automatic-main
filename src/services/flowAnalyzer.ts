import fs from 'fs';
import path from 'path';

interface FlowPattern {
    trigger: string[];
    intent: string;
    response: string;
    nextActions?: string[];
    persuasionLevel: 'low' | 'medium' | 'high';
}

class FlowAnalyzer {
    private flowPatterns: FlowPattern[] = [];
    private conversationHistory: Map<string, any[]> = new Map();

    constructor() {
        this.analyzeExistingFlows();
    }

    private analyzeExistingFlows() {
        try {
            // Analizar flows existentes
            const flowsPath = path.join(__dirname, '../flows'); 
            const flowFiles = fs.readdirSync(flowsPath).filter(f => f.endsWith('.ts'));

            for (const file of flowFiles) {
                const filePath = path.join(flowsPath, file);
                const content = fs.readFileSync(filePath, 'utf8');
                this.extractPatternsFromFlow(content, file);
            }

            console.log(`📊 Analizados ${this.flowPatterns.length} patrones de flujos existentes`);
        } catch (error) {
            console.error('❌ Error analizando flujos:', error);
        }
    }

    private extractPatternsFromFlow(content: string, fileName: string) {
        // Extraer keywords y respuestas de los flujos
        const keywordMatches = content.match(/addKeyword\(\[(.*?)\]/g);
        const responseMatches = content.match(/flowDynamic\(\[(.*?)\]/gs);

        if (keywordMatches && responseMatches) {
            keywordMatches.forEach((keywordMatch, index) => {
                const keywords = keywordMatch.match(/'([^']+)'/g)?.map(k => k.replace(/'/g, '')) || [];
                const response = responseMatches[index]?.match(/"([^"]+)"/g)?.[0]?.replace(/"/g, '') || '';

                if (keywords.length > 0 && response) {
                    this.flowPatterns.push({
                        trigger: keywords,
                        intent: this.inferIntent(keywords, fileName),
                        response: response,
                        persuasionLevel: this.analyzePersuasionLevel(response),
                        nextActions: this.extractNextActions(content, index)
                    });
                }
            });
        }
    }

    private inferIntent(keywords: string[], fileName: string): string {
        if (fileName.includes('music') || keywords.some(k => ['musica', 'música', 'canciones'].includes(k.toLowerCase()))) {
            return 'music_interest';
        }
        if (fileName.includes('price') || keywords.some(k => ['precio', 'precios', 'costo'].includes(k.toLowerCase()))) {
            return 'price_inquiry';
        }
        if (fileName.includes('greeting') || keywords.some(k => ['hola', 'buenos', 'hey'].includes(k.toLowerCase()))) {
            return 'greeting';
        }
        return 'general';
    }

    private analyzePersuasionLevel(response: string): 'low' | 'medium' | 'high' {
        const persuasiveWords = ['oferta', 'especial', 'descuento', 'limitado', 'exclusivo', 'gratis', 'regalo'];
        const emotiveWords = ['increíble', 'fantástico', 'perfecto', 'ideal', 'único'];
        
        const persuasiveCount = persuasiveWords.filter(word => 
            response.toLowerCase().includes(word)
        ).length;
        
        const emotiveCount = emotiveWords.filter(word => 
            response.toLowerCase().includes(word)
        ).length;

        if (persuasiveCount >= 2 || emotiveCount >= 2) return 'high';
        if (persuasiveCount >= 1 || emotiveCount >= 1) return 'medium';
        return 'low';
    }

    private extractNextActions(content: string, index: number): string[] {
        // Extraer acciones sugeridas del contexto
        const actions: string[] = [];
        
        if (content.includes('gotoFlow')) actions.push('redirect_flow');
        if (content.includes('endFlow')) actions.push('end_conversation');
        if (content.toLowerCase().includes('precio')) actions.push('show_prices');
        if (content.toLowerCase().includes('catálogo')) actions.push('show_catalog');
        
        return actions;
    }

    public findBestResponse(userMessage: string, userHistory: any[]): {
        response: string;
        confidence: number;
        suggestedActions: string[];
        persuasionLevel: 'low' | 'medium' | 'high';
    } {
        const messageLower = userMessage.toLowerCase();
        let bestMatch: FlowPattern | null = null;
        let maxScore = 0;

        // Buscar el mejor patrón coincidente
        for (const pattern of this.flowPatterns) {
            let score = 0;
            
            // Puntuación por keywords coincidentes
            for (const keyword of pattern.trigger) {
                if (messageLower.includes(keyword.toLowerCase())) {
                    score += 1;
                }
            }

            // Bonus por contexto de conversación
            if (userHistory.length > 0) {
                const lastInteraction = userHistory[userHistory.length - 1];
                if (this.isContextuallyRelevant(pattern.intent, lastInteraction)) {
                    score += 0.5;
                }
            }

            if (score > maxScore) {
                maxScore = score;
                bestMatch = pattern;
            }
        }

        if (bestMatch && maxScore > 0) {
            return {
                response: this.enhanceResponse(bestMatch.response, userMessage, userHistory),
                confidence: Math.min(maxScore / bestMatch.trigger.length, 1),
                suggestedActions: bestMatch.nextActions || [],
                persuasionLevel: bestMatch.persuasionLevel
            };
        }

        return {
            response: this.generateFallbackResponse(userMessage, userHistory),
            confidence: 0.3,
            suggestedActions: ['ask_clarification'],
            persuasionLevel: 'medium'
        };
    }

    private isContextuallyRelevant(intent: string, lastInteraction: any): boolean {
        if (!lastInteraction) return false;
        
        const contextMap: { [key: string]: string[] } = {
            'price_inquiry': ['music_interest', 'product_interest'],
            'music_interest': ['greeting', 'general_inquiry'],
            'customization': ['music_interest', 'price_inquiry']
        };

        return contextMap[intent]?.includes(lastInteraction.intent) || false;
    }

    private enhanceResponse(baseResponse: string, userMessage: string, userHistory: any[]): string {
        // Personalizar respuesta basada en historial
        let enhanced = baseResponse;

        // Si es una consulta de precio, ser más específico
        if (userMessage.toLowerCase().includes('precio')) {
            enhanced = `🎵 ¡Perfecto! Nuestras USBs musicales están desde $54,900. ${enhanced}`;
        }

        // Si mencionó géneros específicos, personalizar
        const genres = this.extractMentionedGenres(userMessage);
        if (genres.length > 0) {
            enhanced += ` 🎶 Veo que te interesan: ${genres.join(', ')}. ¡Excelente elección!`;
        }

        // Agregar urgencia si es apropiado
        if (userHistory.length > 2) {
            enhanced += ` 🔥 *Oferta especial por tiempo limitado*`;
        }

        return enhanced;
    }

    private extractMentionedGenres(message: string): string[] {
        const genres = ['reggaeton', 'salsa', 'bachata', 'vallenato', 'rock', 'pop', 'merengue', 'champeta'];
        return genres.filter(genre => 
            message.toLowerCase().includes(genre.toLowerCase())
        );
    }

    private generateFallbackResponse(userMessage: string, userHistory: any[]): string {
        // Generar respuesta inteligente basada en contexto
        if (userMessage.toLowerCase().includes('precio')) {
            return `💰 ¡Excelente pregunta! Nuestras USBs personalizadas están desde $54,900. ¿Te interesa música, películas o videos?`;
        }

        if (userHistory.length > 0) {
            return `🎵 Entiendo tu interés. Permíteme ofrecerte algo perfecto para ti. ¿Qué género musical prefieres?`;
        }

        return `🎶 ¡Hola! Soy tu asistente especializado en USBs personalizadas. ¿Te interesa música, películas o videos?`;
    }

    public learnFromInteraction(userMessage: string, botResponse: string, wasSuccessful: boolean) {
        // Aprender de las interacciones para mejorar futuras respuestas
        // Esto se puede expandir con ML más adelante
        console.log(`📚 Aprendiendo de interacción: ${wasSuccessful ? '✅' : '❌'}`);
    }
}

export default new FlowAnalyzer();
