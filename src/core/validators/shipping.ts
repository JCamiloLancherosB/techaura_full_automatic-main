/**
 * Shipping Validators
 * 
 * Validates shipping information extracted by SlotExtractor
 * Ensures data quality before storing in orders
 */

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface ShippingData {
    name?: string;
    phone?: string;
    city?: string;
    neighborhood?: string;
    address?: string;
    reference?: string;
    paymentMethod?: string;
    deliveryTime?: string;
}

export class ShippingValidators {
    /**
     * Validate phone number
     * Colombian format: +57 3XX XXX XXXX
     */
    validatePhone(phone?: string): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!phone) {
            errors.push('Teléfono es requerido');
            return { valid: false, errors, warnings };
        }
        
        // Remove formatting
        const cleaned = phone.replace(/\D/g, '');
        
        // Check length (Colombian mobile: exactly 12 digits with country code 57 + 10 digits)
        if (cleaned.length < 10) {
            errors.push('Teléfono muy corto (mínimo 10 dígitos)');
        } else if (cleaned.length === 12 && !cleaned.startsWith('57')) {
            errors.push('Código de país inválido (debe ser 57 para Colombia)');
        } else if (cleaned.length > 12) {
            errors.push('Teléfono muy largo (máximo 12 dígitos con código de país)');
        }
        
        // Check Colombian mobile format
        const colombianMobile = /^(?:57)?3\d{9}$/;
        if (!colombianMobile.test(cleaned)) {
            warnings.push('El teléfono debería ser un celular colombiano (comenzar con 3)');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate address
     * Must contain street type (Calle, Carrera, etc.) and be descriptive
     */
    validateAddress(address?: string): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!address) {
            errors.push('Dirección es requerida');
            return { valid: false, errors, warnings };
        }
        
        // Minimum length check
        if (address.length < 5) {
            errors.push('Dirección muy corta (mínimo 5 caracteres)');
        }
        
        // Check for street type
        const streetTypes = /(?:calle|carrera|cra|kr|cl|diagonal|transversal|tv|diag)/i;
        if (!streetTypes.test(address)) {
            errors.push('Dirección debe incluir tipo de vía (Calle, Carrera, etc.)');
        }
        
        // Check for numbers (essential for Colombian addresses)
        if (!/\d/.test(address)) {
            errors.push('Dirección debe incluir números');
        }
        
        // Check for complete format (Cra X # Y-Z)
        const completeFormat = /(?:calle|carrera|cra|kr|cl|diagonal|transversal)\s*\d+\s*#?\s*\d+\s*-?\s*\d+/i;
        if (!completeFormat.test(address)) {
            warnings.push('Dirección podría estar incompleta. Formato sugerido: Cra 10 # 20-30');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate name
     */
    validateName(name?: string): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!name) {
            errors.push('Nombre es requerido');
            return { valid: false, errors, warnings };
        }
        
        if (name.length < 2) {
            errors.push('Nombre muy corto (mínimo 2 caracteres)');
        }
        
        if (name.length > 100) {
            errors.push('Nombre muy largo (máximo 100 caracteres)');
        }
        
        // Check for valid characters (letters, spaces, accents)
        if (!/^[a-záéíóúñü\s]+$/i.test(name)) {
            warnings.push('Nombre contiene caracteres inusuales');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate city
     */
    validateCity(city?: string): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!city) {
            errors.push('Ciudad es requerida');
            return { valid: false, errors, warnings };
        }
        
        if (city.length < 2) {
            errors.push('Ciudad muy corta');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate complete shipping data
     */
    validateShippingData(data: ShippingData): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate each field
        const nameValidation = this.validateName(data.name);
        errors.push(...nameValidation.errors);
        warnings.push(...nameValidation.warnings);
        
        const phoneValidation = this.validatePhone(data.phone);
        errors.push(...phoneValidation.errors);
        warnings.push(...phoneValidation.warnings);
        
        const cityValidation = this.validateCity(data.city);
        errors.push(...cityValidation.errors);
        warnings.push(...cityValidation.warnings);
        
        const addressValidation = this.validateAddress(data.address);
        errors.push(...addressValidation.errors);
        warnings.push(...addressValidation.warnings);
        
        // Optional fields - only warn if present but invalid
        if (data.neighborhood && data.neighborhood.length < 2) {
            warnings.push('Barrio muy corto');
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Normalize shipping data for storage
     */
    normalizeShippingData(data: ShippingData): ShippingData {
        const normalized: ShippingData = {};
        
        if (data.name) {
            normalized.name = this.capitalizeName(data.name);
        }
        
        if (data.phone) {
            normalized.phone = this.normalizePhone(data.phone);
        }
        
        if (data.city) {
            normalized.city = this.capitalizeCity(data.city);
        }
        
        if (data.neighborhood) {
            normalized.neighborhood = this.capitalizeName(data.neighborhood);
        }
        
        if (data.address) {
            normalized.address = this.capitalizeAddress(data.address);
        }
        
        if (data.reference) {
            normalized.reference = data.reference.trim();
        }
        
        if (data.paymentMethod) {
            normalized.paymentMethod = data.paymentMethod.toLowerCase();
        }
        
        if (data.deliveryTime) {
            normalized.deliveryTime = data.deliveryTime.trim();
        }
        
        return normalized;
    }

    /**
     * Normalize phone to standard format
     */
    private normalizePhone(phone: string): string {
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        
        // Remove country code if present
        if (cleaned.startsWith('57') && cleaned.length === 12) {
            cleaned = cleaned.substring(2);
        }
        
        // Format as +57 XXX XXX XXXX
        if (cleaned.length === 10) {
            return `+57 ${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
        }
        
        return `+57${cleaned}`;
    }

    /**
     * Capitalize name properly
     */
    private capitalizeName(name: string): string {
        return name
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Capitalize city name
     */
    private capitalizeCity(city: string): string {
        // Special cases for Colombian cities
        const specialCases: Record<string, string> = {
            'bogota': 'Bogotá',
            'medellin': 'Medellín',
            'cucuta': 'Cúcuta',
            'ibague': 'Ibagué',
            'popayan': 'Popayán',
            'monteria': 'Montería',
            'quibdo': 'Quibdó',
            'tulua': 'Tuluá',
            'facatativa': 'Facatativá',
            'zipaquira': 'Zipaquirá',
            'chia': 'Chía',
            'itagui': 'Itagüí'
        };
        
        const normalized = city.toLowerCase();
        return specialCases[normalized] || this.capitalizeName(city);
    }

    /**
     * Capitalize address properly
     */
    private capitalizeAddress(address: string): string {
        // Preserve street abbreviations in uppercase
        return address
            .replace(/\b(cra|kr|cl|tv|diag)\b/gi, (match) => match.toUpperCase())
            .replace(/\b(calle|carrera|diagonal|transversal)\b/gi, (match) => 
                match.charAt(0).toUpperCase() + match.slice(1).toLowerCase()
            );
    }
}

// Singleton instance
export const shippingValidators = new ShippingValidators();
