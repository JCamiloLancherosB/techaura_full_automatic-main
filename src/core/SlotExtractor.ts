/**
 * SlotExtractor - Intelligent extraction of structured data from free text
 * 
 * Extracts customer shipping information (name, phone, address, city, neighborhood, etc.)
 * from unstructured messages using regex patterns and validation rules.
 * 
 * Features:
 * - Multi-slot extraction from a single message
 * - Confidence scoring per slot
 * - Validation integration
 * - Context-aware extraction
 */

export interface ExtractedSlot {
    value: string;
    confidence: number; // 0-1 scale
    source: 'explicit' | 'inferred' | 'partial';
}

export interface ExtractedSlots {
    name?: ExtractedSlot;
    phone?: ExtractedSlot;
    city?: ExtractedSlot;
    neighborhood?: ExtractedSlot;
    address?: ExtractedSlot;
    reference?: ExtractedSlot;
    paymentMethod?: ExtractedSlot;
    deliveryTime?: ExtractedSlot;
}

export interface ExtractionResult {
    slots: ExtractedSlots;
    completeness: number; // 0-1 scale, percentage of required slots filled
    confidence: number; // 0-1 scale, average confidence across all extracted slots
    missingRequired: string[]; // List of missing required slot names
}

export class SlotExtractor {
    private readonly REQUIRED_SLOTS = ['name', 'phone', 'city', 'address'];
    
    // Colombian cities
    private readonly COLOMBIAN_CITIES = [
        'bogotá', 'bogota', 'medellín', 'medellin', 'cali', 'barranquilla',
        'cartagena', 'cúcuta', 'cucuta', 'bucaramanga', 'pereira', 'ibagué',
        'ibague', 'santa marta', 'manizales', 'villavicencio', 'pasto',
        'neiva', 'popayán', 'popayan', 'valledupar', 'montería', 'monteria',
        'sincelejo', 'tunja', 'armenia', 'riohacha', 'quibdó', 'quibdo',
        'florencia', 'yopal', 'mocoa', 'leticia', 'soacha', 'bello',
        'envigado', 'itagüí', 'itagui', 'soledad', 'palmira', 'buenaventura',
        'tuluá', 'tulua', 'facatativá', 'facatativa', 'zipaquirá', 'zipaquira',
        'chía', 'chia', 'madrid', 'funza', 'mosquera', 'girardot'
    ];

    // Colombian neighborhoods/localities common patterns
    private readonly NEIGHBORHOOD_KEYWORDS = ['barrio', 'localidad', 'sector', 'conjunto'];

    // Payment methods
    private readonly PAYMENT_METHODS = [
        'efectivo', 'transferencia', 'nequi', 'daviplata', 'bancolombia',
        'pse', 'tarjeta', 'contraentrega'
    ];

    // Address patterns
    private readonly ADDRESS_PATTERNS = {
        // Carrera 10 # 20-30, Calle 45 # 12-34, Diagonal 15 # 8-42
        full: /(?:calle|carrera|cra|kr|cl|diagonal|transversal|tv|diag\.?)\s*\d+\s*#?\s*\d+\s*-?\s*\d+/gi,
        // Variations like "Cra 10", "Calle 45"
        partial: /(?:calle|carrera|cra|kr|cl|diagonal|transversal|tv|diag\.?)\s*\d+/gi,
    };

    // Phone patterns (Colombian format)
    private readonly PHONE_PATTERNS = {
        // +57 3XX XXX XXXX, 3XX XXX XXXX, 57 3XX XXX XXXX
        full: /(?:\+?57\s?)?3\d{2}\s?\d{3}\s?\d{4}/g,
        // 3XXXXXXXXX
        compact: /3\d{9}/g,
    };

    /**
     * Extract structured slots from a message
     */
    extractFromMessage(message: string): ExtractionResult {
        const normalizedMessage = this.normalizeText(message);
        
        const slots: ExtractedSlots = {};
        
        // Extract each slot type
        slots.name = this.extractName(normalizedMessage);
        slots.phone = this.extractPhone(normalizedMessage);
        slots.city = this.extractCity(normalizedMessage);
        slots.neighborhood = this.extractNeighborhood(normalizedMessage);
        slots.address = this.extractAddress(normalizedMessage);
        slots.reference = this.extractReference(normalizedMessage);
        slots.paymentMethod = this.extractPaymentMethod(normalizedMessage);
        slots.deliveryTime = this.extractDeliveryTime(normalizedMessage);
        
        // Calculate metrics
        const filledSlots = Object.values(slots).filter(slot => slot !== undefined);
        const requiredFilled = this.REQUIRED_SLOTS.filter(
            slotName => slots[slotName as keyof ExtractedSlots] !== undefined
        );
        
        const completeness = requiredFilled.length / this.REQUIRED_SLOTS.length;
        const confidence = filledSlots.length > 0
            ? filledSlots.reduce((sum, slot) => sum + slot!.confidence, 0) / filledSlots.length
            : 0;
        
        const missingRequired = this.REQUIRED_SLOTS.filter(
            slotName => slots[slotName as keyof ExtractedSlots] === undefined
        );
        
        return {
            slots,
            completeness,
            confidence,
            missingRequired
        };
    }

    /**
     * Normalize text for consistent processing
     */
    private normalizeText(text: string): string {
        return text
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' '); // Normalize whitespace
    }

    /**
     * Extract customer name from message
     */
    private extractName(message: string): ExtractedSlot | undefined {
        // Patterns: "Soy Juan", "Me llamo María", "Mi nombre es Pedro"
        const patterns = [
            /(?:soy|me llamo|mi nombre es|llamame)\s+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+)*)/i,
            /^([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,3})\s*[,\.]?\s*(?:vivo|dirección|mi)/i,
        ];
        
        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const name = this.capitalizeWords(match[1].trim());
                // Validate: at least 2 characters, max 4 words
                const words = name.split(' ');
                if (name.length >= 2 && words.length <= 4 && words.length >= 1) {
                    return {
                        value: name,
                        confidence: 0.9,
                        source: 'explicit'
                    };
                }
            }
        }
        
        return undefined;
    }

    /**
     * Extract phone number from message
     */
    private extractPhone(message: string): ExtractedSlot | undefined {
        // Try full format first (with country code or formatted)
        let match = message.match(this.PHONE_PATTERNS.full);
        if (match) {
            const phone = this.normalizePhone(match[0]);
            if (this.isValidPhone(phone)) {
                return {
                    value: phone,
                    confidence: 0.95,
                    source: 'explicit'
                };
            }
        }
        
        // Try compact format
        match = message.match(this.PHONE_PATTERNS.compact);
        if (match) {
            const phone = this.normalizePhone(match[0]);
            if (this.isValidPhone(phone)) {
                return {
                    value: phone,
                    confidence: 0.9,
                    source: 'explicit'
                };
            }
        }
        
        return undefined;
    }

    /**
     * Extract city from message
     */
    private extractCity(message: string): ExtractedSlot | undefined {
        // Patterns: "vivo en Soacha", "de Bogotá", "ciudad: Medellín"
        const patterns = [
            /(?:vivo en|de|ciudad:|ubicado en)\s+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+)?)/i,
            /\b(bogotá|bogota|medellín|medellin|cali|barranquilla|soacha)\b/i
        ];
        
        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const city = this.capitalizeWords(match[1].trim());
                if (this.isKnownCity(city)) {
                    return {
                        value: city,
                        confidence: 0.95,
                        source: 'explicit'
                    };
                }
            }
        }
        
        // Fallback: check if any known city appears in the message
        for (const city of this.COLOMBIAN_CITIES) {
            const regex = new RegExp(`\\b${city}\\b`, 'i');
            if (regex.test(message)) {
                return {
                    value: this.capitalizeWords(city),
                    confidence: 0.8,
                    source: 'inferred'
                };
            }
        }
        
        return undefined;
    }

    /**
     * Extract neighborhood from message
     */
    private extractNeighborhood(message: string): ExtractedSlot | undefined {
        // Patterns: "barrio X", "sector Y", "localidad Z"
        for (const keyword of this.NEIGHBORHOOD_KEYWORDS) {
            const pattern = new RegExp(`${keyword}\\s+([a-záéíóúñü0-9\\s]+?)(?:[,\\.\\s]|$)`, 'i');
            const match = message.match(pattern);
            if (match && match[1]) {
                const neighborhood = this.capitalizeWords(match[1].trim());
                // Validate: not too long, reasonable length
                if (neighborhood.length >= 2 && neighborhood.length <= 50) {
                    return {
                        value: neighborhood,
                        confidence: 0.85,
                        source: 'explicit'
                    };
                }
            }
        }
        
        return undefined;
    }

    /**
     * Extract address from message
     */
    private extractAddress(message: string): ExtractedSlot | undefined {
        // Try full address pattern first
        let match = message.match(this.ADDRESS_PATTERNS.full);
        if (match) {
            let address = match[0].trim();
            
            // Try to capture additional info after the main address (e.g., "casa 4", "apto 201")
            const afterMatch = message.substring(message.indexOf(match[0]) + match[0].length);
            const additionalPattern = /^\s*(?:casa|apto|apartamento|interior|int\.?|torre|torre\.?)\s+[a-záéíóúñü0-9]+/i;
            const additionalMatch = afterMatch.match(additionalPattern);
            if (additionalMatch) {
                address += ' ' + additionalMatch[0].trim();
            }
            
            if (this.isValidAddress(address)) {
                return {
                    value: this.capitalizeWords(address),
                    confidence: 0.95,
                    source: 'explicit'
                };
            }
        }
        
        // Try partial pattern
        match = message.match(this.ADDRESS_PATTERNS.partial);
        if (match) {
            const address = match[0].trim();
            return {
                value: this.capitalizeWords(address),
                confidence: 0.6,
                source: 'partial'
            };
        }
        
        return undefined;
    }

    /**
     * Extract reference/landmark from message
     */
    private extractReference(message: string): ExtractedSlot | undefined {
        // Patterns: "cerca de X", "frente a Y", "al lado de Z"
        const patterns = [
            /(?:cerca de|frente a|al lado de|junto a|referencia:?)\s+([^,\.]+)/i,
        ];
        
        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const reference = match[1].trim();
                if (reference.length >= 3 && reference.length <= 100) {
                    return {
                        value: this.capitalizeWords(reference),
                        confidence: 0.8,
                        source: 'explicit'
                    };
                }
            }
        }
        
        return undefined;
    }

    /**
     * Extract payment method from message
     */
    private extractPaymentMethod(message: string): ExtractedSlot | undefined {
        for (const method of this.PAYMENT_METHODS) {
            const regex = new RegExp(`\\b${method}\\b`, 'i');
            if (regex.test(message)) {
                return {
                    value: this.capitalizeWords(method),
                    confidence: 0.9,
                    source: 'explicit'
                };
            }
        }
        
        return undefined;
    }

    /**
     * Extract delivery time preference from message
     */
    private extractDeliveryTime(message: string): ExtractedSlot | undefined {
        // Patterns: "mañana", "tarde", "8am", "2pm-4pm", "entre 2 y 4"
        const patterns = [
            /(?:horario|hora|tiempo):?\s*([^,\.]+)/i,
            /\b(mañana|tarde|noche)\b/i,
            /\b(\d{1,2}(?:am|pm|:?\d{2})?)\b/i,
        ];
        
        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                return {
                    value: match[1].trim(),
                    confidence: 0.75,
                    source: 'explicit'
                };
            }
        }
        
        return undefined;
    }

    /**
     * Normalize phone to Colombian format (+57XXXXXXXXXX)
     */
    private normalizePhone(phone: string): string {
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        
        // Remove country code if present
        if (cleaned.startsWith('57') && cleaned.length === 12) {
            cleaned = cleaned.substring(2);
        }
        
        // Add country code
        return `+57${cleaned}`;
    }

    /**
     * Validate phone number format
     */
    private isValidPhone(phone: string): boolean {
        // Colombian mobile: +573XXXXXXXXX (10 digits after 57, starting with 3)
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length === 12 && cleaned.startsWith('573');
    }

    /**
     * Check if city is in known list
     */
    private isKnownCity(city: string): boolean {
        return this.COLOMBIAN_CITIES.includes(city.toLowerCase());
    }

    /**
     * Validate address has minimum required format
     */
    private isValidAddress(address: string): boolean {
        // Must contain street type and numbers
        const hasStreetType = /(?:calle|carrera|cra|kr|cl|diagonal|transversal)/i.test(address);
        const hasNumbers = /\d+/.test(address);
        return hasStreetType && hasNumbers && address.length >= 5;
    }

    /**
     * Capitalize first letter of each word
     */
    private capitalizeWords(text: string): string {
        return text
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Merge extracted slots with existing data (for multi-turn conversations)
     */
    mergeWithExisting(
        newSlots: ExtractedSlots,
        existingData: Partial<Record<keyof ExtractedSlots, string>>
    ): ExtractedSlots {
        const merged: ExtractedSlots = { ...newSlots };
        
        // Fill in missing slots from existing data
        for (const key of Object.keys(existingData) as Array<keyof ExtractedSlots>) {
            if (!merged[key] && existingData[key]) {
                merged[key] = {
                    value: existingData[key]!,
                    confidence: 1.0,
                    source: 'explicit'
                };
            }
        }
        
        return merged;
    }

    /**
     * Check if extraction result is complete (all required slots filled)
     */
    isComplete(result: ExtractionResult): boolean {
        return result.completeness === 1.0;
    }

    /**
     * Get human-readable list of missing required fields
     */
    getMissingFieldsMessage(result: ExtractionResult): string {
        if (result.missingRequired.length === 0) {
            return '';
        }
        
        const fieldNames: Record<string, string> = {
            name: 'nombre',
            phone: 'teléfono',
            city: 'ciudad',
            address: 'dirección'
        };
        
        const missing = result.missingRequired.map(field => fieldNames[field] || field);
        
        if (missing.length === 1) {
            return `Por favor, indica tu ${missing[0]}.`;
        }
        
        const last = missing.pop();
        return `Por favor, indica tu ${missing.join(', ')} y ${last}.`;
    }
}

// Singleton instance
export const slotExtractor = new SlotExtractor();
