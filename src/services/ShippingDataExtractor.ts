/**
 * ShippingDataExtractor Service
 * Extracts shipping information from user messages
 * Supports Colombian address and ID formats
 */

import { normalizeText, capitalizeWords } from '../utils/textUtils';
import { redactPII } from '../utils/piiRedactor';

export interface ShippingData {
    name?: string;
    lastName?: string;
    cedula?: string;
    phone?: string;
    address?: string;
    city?: string;
    department?: string;
}

export interface ExtractionResult {
    data: ShippingData;
    confidence: {
        name: number;
        lastName: number;
        cedula: number;
        phone: number;
        address: number;
        city: number;
        department: number;
    };
    missingFields: string[];
    isComplete: boolean;
}

// Colombian patterns
const SHIPPING_PATTERNS = {
    // Colombian phone: +57 or 57 followed by 3XXXXXXXXX
    phone: /(?:\+?57)?[\s\-]?3\d{9}\b/g,
    
    // Colombian ID (cédula): 6-12 digits
    cedula: /\b(?:C\.?C\.?|cedula|cédula)?[\s\-]?(\d{6,12})\b/gi,
    
    // Colombian address patterns
    address: /\b(calle|carrera|cra|cll|avenida|av|diagonal|diag|transversal|trans|circular|circ|manzana|torre|apartamento|apto|casa|interior|int)[\s\.\#\-]*\d+[\w\s\-\.\#\/]*(?:norte|sur|este|oeste|oriente|occidente)?\b/gi,
    
    // Colombian cities (major ones)
    city: /(bogot[aá]|medell[ií]n|cali|barranquilla|cartagena|bucaramanga|c[uú]cuta|pereira|manizales|ibagu[eé]|santa marta|villavicencio|pasto|monter[ií]a|valledupar|neiva|armenia|popay[aá]n|sincelejo|tunja|florencia|riohacha|yopal|quib[dó]|leticia|inírida|puerto carreño|san andrés)/gi,
    
    // Colombian departments
    department: /(amazonas|antioquia|arauca|atl[aá]ntico|bol[ií]var|boyac[aá]|caldas|caquet[aá]|casanare|cauca|cesar|choc[oó]|c[oó]rdoba|cundinamarca|guain[ií]a|guaviare|huila|la guajira|magdalena|meta|nariño|norte de santander|putumayo|quind[ií]o|risaralda|san andr[eé]s|santander|sucre|tolima|valle del cauca|vaup[eé]s|vichada)/gi,
    
    // Name patterns (typically at start or after keywords)
    name: /^([A-ZÑÁÉÍÓÚ][a-zñáéíóú]+(?:\s+[A-ZÑÁÉÍÓÚ][a-zñáéíóú]+)*)/,
};

// Common Colombian department-city mapping
const CITY_TO_DEPARTMENT: { [key: string]: string } = {
    'bogotá': 'Cundinamarca',
    'medellín': 'Antioquia',
    'cali': 'Valle del Cauca',
    'barranquilla': 'Atlántico',
    'cartagena': 'Bolívar',
    'bucaramanga': 'Santander',
    'cúcuta': 'Norte de Santander',
    'pereira': 'Risaralda',
    'manizales': 'Caldas',
    'ibagué': 'Tolima',
    'santa marta': 'Magdalena',
    'villavicencio': 'Meta',
    'pasto': 'Nariño',
    'montería': 'Córdoba',
    'valledupar': 'Cesar',
    'neiva': 'Huila',
    'armenia': 'Quindío',
    'popayán': 'Cauca',
    'sincelejo': 'Sucre',
    'tunja': 'Boyacá',
};

export class ShippingDataExtractor {
    /**
     * Extract shipping data from a single message
     */
    extractFromMessage(message: string): ExtractionResult {
        const data: ShippingData = {};
        const confidence = {
            name: 0,
            lastName: 0,
            cedula: 0,
            phone: 0,
            address: 0,
            city: 0,
            department: 0,
        };

        // Clean and normalize message
        const normalizedMessage = message.trim();

        // Extract phone number
        const phoneMatches = normalizedMessage.match(SHIPPING_PATTERNS.phone);
        if (phoneMatches && phoneMatches.length > 0) {
            data.phone = phoneMatches[0].replace(/[\s\-]/g, '');
            confidence.phone = 0.9;
        }

        // Extract cédula
        const cedulaMatches = normalizedMessage.match(SHIPPING_PATTERNS.cedula);
        if (cedulaMatches && cedulaMatches.length > 0) {
            const match = cedulaMatches[0];
            const numberMatch = match.match(/\d{6,12}/);
            if (numberMatch) {
                data.cedula = numberMatch[0];
                confidence.cedula = 0.85;
            }
        }

        // Extract address
        const addressMatches = normalizedMessage.match(SHIPPING_PATTERNS.address);
        if (addressMatches && addressMatches.length > 0) {
            data.address = addressMatches[0].trim();
            confidence.address = 0.8;
        }

        // Extract city
        const cityMatches = normalizedMessage.match(SHIPPING_PATTERNS.city);
        if (cityMatches && cityMatches.length > 0) {
            const cityName = cityMatches[0].toLowerCase();
            data.city = this.capitalizeCity(cityName);
            confidence.city = 0.9;
            
            // Auto-fill department if we know the city
            const normalizedCity = this.normalizeCity(cityName);
            if (CITY_TO_DEPARTMENT[normalizedCity]) {
                data.department = CITY_TO_DEPARTMENT[normalizedCity];
                confidence.department = 0.85;
            }
        }

        // Extract department explicitly if mentioned
        const departmentMatches = normalizedMessage.match(SHIPPING_PATTERNS.department);
        if (departmentMatches && departmentMatches.length > 0) {
            data.department = this.capitalizeDepartment(departmentMatches[0]);
            confidence.department = 0.9;
        }

        // Extract name (first word that looks like a name, before other data)
        // Split by common separators
        const parts = normalizedMessage.split(/[,;\n]/).map(p => p.trim());
        if (parts.length > 0) {
            const firstPart = parts[0];
            const nameMatch = firstPart.match(SHIPPING_PATTERNS.name);
            if (nameMatch) {
                const fullName = nameMatch[1].trim();
                const nameParts = fullName.split(/\s+/);
                
                if (nameParts.length >= 1) {
                    data.name = nameParts[0];
                    confidence.name = 0.7;
                }
                
                if (nameParts.length >= 2) {
                    data.lastName = nameParts.slice(1).join(' ');
                    confidence.lastName = 0.7;
                }
            }
        }

        // Determine missing fields
        const missingFields = this.getMissingFields(data);
        const isComplete = missingFields.length === 0;

        return {
            data,
            confidence,
            missingFields,
            isComplete,
        };
    }

    /**
     * Extract shipping data from multiple consecutive messages
     */
    extractFromMessages(messages: string[]): ExtractionResult {
        const combinedData: ShippingData = {};
        const combinedConfidence = {
            name: 0,
            lastName: 0,
            cedula: 0,
            phone: 0,
            address: 0,
            city: 0,
            department: 0,
        };

        // Process each message and merge results
        for (const message of messages) {
            const result = this.extractFromMessage(message);
            
            // Merge data, preferring higher confidence values
            for (const key of Object.keys(result.data) as Array<keyof ShippingData>) {
                const currentConfidence = combinedConfidence[key];
                const newConfidence = result.confidence[key];
                
                if (newConfidence > currentConfidence) {
                    combinedData[key] = result.data[key];
                    combinedConfidence[key] = newConfidence;
                }
            }
        }

        const missingFields = this.getMissingFields(combinedData);
        const isComplete = missingFields.length === 0;

        return {
            data: combinedData,
            confidence: combinedConfidence,
            missingFields,
            isComplete,
        };
    }

    /**
     * Validate extracted data
     */
    validateData(data: ShippingData): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (data.phone) {
            const phoneRegex = /^(?:\+?57)?3\d{9}$/;
            if (!phoneRegex.test(data.phone.replace(/[\s\-]/g, ''))) {
                errors.push('Número de teléfono inválido');
            }
        }

        if (data.cedula) {
            const cedulaNum = parseInt(data.cedula);
            if (isNaN(cedulaNum) || data.cedula.length < 6 || data.cedula.length > 12) {
                errors.push('Número de cédula inválido');
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Get missing required fields
     */
    private getMissingFields(data: ShippingData): string[] {
        const required: Array<keyof ShippingData> = [
            'name',
            'lastName',
            'cedula',
            'phone',
            'address',
            'city',
        ];

        return required.filter(field => !data[field]);
    }

    /**
     * Capitalize city name properly
     */
    private capitalizeCity(city: string): string {
        return capitalizeWords(city);
    }

    /**
     * Capitalize department name properly
     */
    private capitalizeDepartment(dept: string): string {
        return capitalizeWords(dept);
    }

    /**
     * Normalize city name for lookup
     */
    private normalizeCity(city: string): string {
        return normalizeText(city);
    }

    /**
     * Get formatted summary of extracted data (with PII redaction for logs)
     */
    getFormattedSummary(data: ShippingData, redactPIIForLog: boolean = false): string {
        const lines: string[] = [];

        if (data.name || data.lastName) {
            lines.push(`👤 Nombre: ${[data.name, data.lastName].filter(Boolean).join(' ')}`);
        }
        if (data.cedula) {
            lines.push(`🆔 Cédula: ${data.cedula}`);
        }
        if (data.phone) {
            const phoneDisplay = redactPIIForLog ? `***${data.phone.slice(-4)}` : data.phone;
            lines.push(`📱 Teléfono: ${phoneDisplay}`);
        }
        if (data.address) {
            const addressDisplay = redactPIIForLog ? '[ADDRESS-REDACTED]' : data.address;
            lines.push(`📍 Dirección: ${addressDisplay}`);
        }
        if (data.city) {
            lines.push(`🏙️ Ciudad: ${data.city}`);
        }
        if (data.department) {
            lines.push(`🗺️ Departamento: ${data.department}`);
        }

        return lines.join('\n');
    }
    
    /**
     * Get formatted summary for logging (automatically redacted)
     */
    getFormattedSummaryForLog(data: ShippingData): string {
        return this.getFormattedSummary(data, true);
    }
}

// Singleton instance
export const shippingDataExtractor = new ShippingDataExtractor();
