import { aiService } from './aiService';
import { UserSession } from '../../types/global';

export class AIEnhancements {
    // Análisis de sentimiento en tiempo real
    static async analyzeSentiment(message: string): Promise<'positive' | 'negative' | 'neutral'> {
        const prompt = `Analiza el sentimiento de este mensaje y responde solo con: positive, negative, o neutral
        
        Mensaje: "${message}"`;
        
        try {
            const response = await aiService.generateResponse(prompt, {} as UserSession);
            const sentiment = response.toLowerCase().trim(); // Accedemos directamente a la respuesta como string
            
            if (sentiment.includes('positive')) return 'positive';
            if (sentiment.includes('negative')) return 'negative';
            return 'neutral';
        } catch {
            return 'neutral';
        }
    }

    // Detección de intención mejorada
    static async detectIntent(message: string): Promise<string> {
        const prompt = `Detecta la intención principal de este mensaje sobre ventas de USBs:
        
        Opciones: pricing, buying, customization, objection, greeting, goodbye, support
        
        Mensaje: "${message}"
        
        Responde solo con la intención:`;
        
        try {
            const response = await aiService.generateResponse(prompt, {} as UserSession);
            return response.toLowerCase().trim(); // Accedemos directamente a la respuesta como string
        } catch {
            return 'unknown';
        }
    }

    // Generación de ofertas personalizadas
    static async generatePersonalizedOffer(session: UserSession): Promise<string> {
        const prompt = `Genera una oferta personalizada para este cliente:
        
        Perfil: ${JSON.stringify({
            stage: session.stage,
            buyingIntent: session.buyingIntent,
            interests: session.interests,
            isVIP: session.isVIP
        })}
        
        Productos: USBs de música/video/películas (8GB-128GB, $59,900-$169,900)
        
        Genera una oferta atractiva en 1-2 líneas:`;
        
        try {
            const response = await aiService.generateResponse(prompt, session);
            return response; // Accedemos directamente a la respuesta como string
        } catch {
            return "🎁 ¡Oferta especial! 20% de descuento en tu primera USB personalizada.";
        }
    }
}
