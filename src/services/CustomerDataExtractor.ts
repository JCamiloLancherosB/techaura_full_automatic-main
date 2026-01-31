import { aiService } from './aiService';

interface ExtractedCustomerData {
    type: 'name' | 'address' | 'phone' | 'capacity' | 'content_preference' | 'payment_method' | 'unknown';
    value: string;
    confidence: number;
    rawMessage: string;
}

export class CustomerDataExtractor {
    
    /**
     * Analyze message and extract customer data
     */
    async extractData(message: string): Promise<ExtractedCustomerData | null> {
        // Quick pattern matching first (faster)
        const quickMatch = this.quickPatternMatch(message);
        if (quickMatch && quickMatch.confidence >= 90) {
            return quickMatch;
        }
        
        // Use AI for complex cases
        return this.aiExtract(message);
    }
    
    /**
     * Quick regex-based pattern matching
     */
    private quickPatternMatch(message: string): ExtractedCustomerData | null {
        const msg = message.trim();
        
        // Phone number pattern (Colombian)
        const phonePattern = /^(\+?57\s?)?[3][0-9]{2}[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}$/;
        if (phonePattern.test(msg.replace(/\s/g, ''))) {
            return {
                type: 'phone',
                value: msg.replace(/[\s.-]/g, ''),
                confidence: 95,
                rawMessage: message
            };
        }
        
        // Address patterns (Colombian)
        const addressPatterns = [
            /^(calle|carrera|cra|cll|av|avenida|transversal|diagonal|manzana|mz)\s*#?\s*\d+/i,
            /^(calle|carrera|cra|cll)\s*\d+\s*(#|no\.?|numero)?\s*\d+\s*-?\s*\d*/i,
            /^\d+\s*(calle|carrera|cra|cll)\s*\d+/i
        ];
        
        for (const pattern of addressPatterns) {
            if (pattern.test(msg)) {
                return {
                    type: 'address',
                    value: msg,
                    confidence: 90,
                    rawMessage: message
                };
            }
        }
        
        // Name pattern (2-4 words, capitalized, no numbers)
        const namePattern = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/;
        if (namePattern.test(msg) && msg.length >= 5 && msg.length <= 50) {
            return {
                type: 'name',
                value: msg,
                confidence: 85,
                rawMessage: message
            };
        }
        
        // Capacity selection
        const capacityPattern = /^(8|16|32|64|128|256)\s*(gb|gigas?)?$/i;
        const capacityMatch = msg.match(capacityPattern);
        if (capacityMatch) {
            return {
                type: 'capacity',
                value: capacityMatch[1] + 'GB',
                confidence: 95,
                rawMessage: message
            };
        }
        
        // Content preferences (genres, artists, etc.)
        const genreKeywords = [
            'rock', 'pop', 'reggaeton', 'salsa', 'vallenato', 'bachata',
            'cumbia', 'merengue', 'baladas', 'romanticas', 'electronica',
            'hip hop', 'rap', 'clasica', 'jazz', 'metal', 'punk'
        ];
        
        const msgLower = msg.toLowerCase();
        const matchedGenres = genreKeywords.filter(g => msgLower.includes(g));
        if (matchedGenres.length > 0) {
            return {
                type: 'content_preference',
                value: JSON.stringify({ genres: matchedGenres }),
                confidence: 85,
                rawMessage: message
            };
        }
        
        return null;
    }
    
    /**
     * Use AI to extract data from complex messages
     */
    private async aiExtract(message: string): Promise<ExtractedCustomerData | null> {
        const prompt = `Analiza el siguiente mensaje de un cliente y extrae la información relevante.
        
Mensaje: "${message}"

Identifica si el mensaje contiene:
1. NOMBRE: Nombre completo de una persona (2-4 palabras, nombres propios)
2. DIRECCION: Dirección de envío en Colombia (calle, carrera, etc.)
3. TELEFONO: Número de celular colombiano (10 dígitos empezando por 3)
4. CAPACIDAD: Capacidad de USB solicitada (8GB, 16GB, 32GB, 64GB, 128GB, 256GB)
5. PREFERENCIA: Preferencias de contenido (géneros musicales, artistas, películas)
6. PAGO: Método de pago (efectivo, nequi, daviplata, transferencia)

Responde en formato JSON:
{
    "type": "nombre|direccion|telefono|capacidad|preferencia|pago|desconocido",
    "value": "valor extraído",
    "confidence": 0-100
}

Si no puedes identificar claramente qué tipo de dato es, responde con type "desconocido".`;

        try {
            const response = await aiService.generateResponse(prompt, {
                maxTokens: 200,
                temperature: 0.1
            });
            
            const parsed = JSON.parse(response);
            
            const typeMap: Record<string, ExtractedCustomerData['type']> = {
                'nombre': 'name',
                'direccion': 'address',
                'telefono': 'phone',
                'capacidad': 'capacity',
                'preferencia': 'content_preference',
                'pago': 'payment_method',
                'desconocido': 'unknown'
            };
            
            return {
                type: typeMap[parsed.type] || 'unknown',
                value: parsed.value,
                confidence: parsed.confidence,
                rawMessage: message
            };
        } catch (error) {
            console.error('AI extraction error:', error);
            return null;
        }
    }
}

export const customerDataExtractor = new CustomerDataExtractor();
