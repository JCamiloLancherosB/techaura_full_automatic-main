import * as fs from 'fs';
import * as path from 'path';

// Dynamic imports to avoid startup errors
let pdfParse: any = null;
let Tesseract: any = null;

async function loadPdfParse() {
    if (!pdfParse) {
        pdfParse = (await import('pdf-parse')).default;
    }
    return pdfParse;
}

async function loadTesseract() {
    if (!Tesseract) {
        // Use tesseract.js with legacy mode for Node.js
        const tesseractModule = await import('tesseract.js');
        Tesseract = tesseractModule.default || tesseractModule;
    }
    return Tesseract;
}

export interface ShippingGuideData {
    trackingNumber: string;
    customerName: string;
    customerPhone?: string;
    shippingAddress: string;
    city: string;
    department?: string;
    carrier: string; // Servientrega, Coordinadora, InterRapidisimo, etc.
    estimatedDelivery?: Date;
    rawText: string;
}

export class ShippingGuideParser {
    private initialized = false;
    
    /**
     * Parse a shipping guide from file path or buffer
     */
    async parseGuide(input: string | Buffer, mimeType: string): Promise<ShippingGuideData | null> {
        let text: string;
        
        try {
            if (mimeType === 'application/pdf') {
                text = await this.extractTextFromPDF(input);
            } else if (mimeType.startsWith('image/')) {
                text = await this.extractTextFromImage(input);
            } else {
                console.warn(`Unsupported file type: ${mimeType}`);
                return null;
            }
            
            return this.parseGuideText(text);
        } catch (error) {
            console.error('Error parsing shipping guide:', error);
            return null;
        }
    }
    
    /**
     * Extract text from PDF using pdf-parse (Node.js compatible)
     */
    private async extractTextFromPDF(input: string | Buffer): Promise<string> {
        try {
            const pdf = await loadPdfParse();
            
            let buffer: Buffer;
            if (typeof input === 'string') {
                buffer = fs.readFileSync(input);
            } else {
                buffer = Buffer.from(input);
            }
            
            const data = await pdf(buffer);
            return data.text || '';
        } catch (error) {
            console.error('Error extracting text from PDF:', error);
            // Return empty string instead of throwing to allow graceful degradation
            return '';
        }
    }
    
    /**
     * Extract text from image using Tesseract OCR
     * Uses lazy loading to avoid startup errors
     */
    private async extractTextFromImage(input: string | Buffer): Promise<string> {
        try {
            const tesseract = await loadTesseract();
            
            // For images, we can use tesseract directly
            const result = await tesseract.recognize(input, 'spa', {
                logger: (m: any) => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            return result.data.text || '';
        } catch (error) {
            console.error('Error extracting text from image:', error);
            return '';
        }
    }
    
    /**
     * Parse extracted text to identify shipping data
     */
    private parseGuideText(text: string): ShippingGuideData | null {
        if (!text || text.trim().length < 10) {
            console.warn('Insufficient text extracted from guide');
            return null;
        }
        
        const data: Partial<ShippingGuideData> = { rawText: text };
        
        // Common Colombian carriers patterns
        const carrierPatterns: Record<string, RegExp> = {
            'servientrega': /servientrega/i,
            'coordinadora': /coordinadora/i,
            'interrapidisimo': /inter\s*r[aá]pidisimo/i,
            'envia': /env[ií]a|colvanes/i,
            'tcc': /\btcc\b/i,
            'deprisa': /deprisa/i,
            '472': /\b472\b/i
        };
        
        // Detect carrier
        for (const [carrier, pattern] of Object.entries(carrierPatterns)) {
            if (pattern.test(text)) {
                data.carrier = carrier;
                break;
            }
        }
        
        if (!data.carrier) {
            data.carrier = 'unknown';
        }
        
        // Extract tracking number (various formats)
        const trackingPatterns = [
            /(?:gu[íi]a|tracking|n[úu]mero|guia)\s*[:#]?\s*([A-Z0-9]{8,20})/i,
            /(?:^|\s)(\d{10,15})(?:\s|$)/m,
            /[A-Z]{2,3}\d{9,12}/
        ];
        
        for (const pattern of trackingPatterns) {
            const match = text.match(pattern);
            if (match) {
                data.trackingNumber = (match[1] || match[0]).trim();
                break;
            }
        }
        
        // Extract customer name
        const namePatterns = [
            /(?:destinatario|nombre|cliente|para)\s*[:#]?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i,
            /(?:se[ñn]or(?:a)?|sr(?:a)?\.?)\s*[:#]?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/i
        ];
        
        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match) {
                data.customerName = match[1].trim();
                break;
            }
        }
        
        // Extract phone number (Colombian format)
        const phonePattern = /(?:tel[eé]fono|celular|m[oó]vil|cel|tel)?\s*[:#.]?\s*(\+?57\s?)?([3][0-9]{2}[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/i;
        const phoneMatch = text.match(phonePattern);
        if (phoneMatch) {
            const phone = (phoneMatch[2] || '').replace(/[\s.-]/g, '');
            if (phone.length === 10) {
                data.customerPhone = '57' + phone;
            }
        }
        
        // Extract address
        const addressPatterns = [
            /(?:direcci[oó]n|dir)\s*[:#]?\s*(.+?)(?:\n|ciudad|tel|cel|$)/i,
            /((?:calle|carrera|cra|cll|av|avenida|transversal|diagonal|manzana|mz)\s*#?\s*\d+[^,\n]*)/i
        ];
        
        for (const pattern of addressPatterns) {
            const match = text.match(pattern);
            if (match) {
                data.shippingAddress = (match[1] || match[0]).trim().substring(0, 200);
                break;
            }
        }
        
        // Extract city
        const colombianCities = [
            'bogota', 'bogotá', 'medellin', 'medellín', 'cali', 'barranquilla', 
            'cartagena', 'bucaramanga', 'pereira', 'santa marta', 'cucuta', 'cúcuta',
            'ibague', 'ibagué', 'villavicencio', 'manizales', 'pasto', 'monteria',
            'montería', 'neiva', 'armenia', 'popayan', 'popayán', 'sincelejo',
            'valledupar', 'tunja', 'florencia', 'riohacha', 'quibdo', 'quibdó'
        ];
        
        const textLower = text.toLowerCase();
        for (const city of colombianCities) {
            if (textLower.includes(city)) {
                data.city = city.charAt(0).toUpperCase() + city.slice(1).replace(/[áéíóú]/g, 
                    m => ({ 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' }[m] || m));
                break;
            }
        }
        
        // Validate minimum required data
        if (data.trackingNumber || data.customerName || data.customerPhone) {
            return {
                trackingNumber: data.trackingNumber || 'UNKNOWN',
                customerName: data.customerName || 'Unknown Customer',
                customerPhone: data.customerPhone,
                shippingAddress: data.shippingAddress || '',
                city: data.city || '',
                department: data.department,
                carrier: data.carrier || 'unknown',
                estimatedDelivery: data.estimatedDelivery,
                rawText: text.substring(0, 1000) // Limit raw text storage
            };
        }
        
        console.warn('Could not extract minimum required data from guide');
        return null;
    }
}

// Export singleton instance
export const shippingGuideParser = new ShippingGuideParser();
