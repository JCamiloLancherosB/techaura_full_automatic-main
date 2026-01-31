import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import sharp from 'sharp';
import fs from 'fs';

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
    
    /**
     * Parse a shipping guide from file path or buffer
     */
    async parseGuide(input: string | Buffer, mimeType: string): Promise<ShippingGuideData | null> {
        let text: string;
        
        if (mimeType === 'application/pdf') {
            text = await this.extractTextFromPDF(input);
        } else if (mimeType.startsWith('image/')) {
            text = await this.extractTextFromImage(input);
        } else {
            throw new Error(`Unsupported file type: ${mimeType}`);
        }
        
        return this.parseGuideText(text);
    }
    
    /**
     * Extract text from PDF using pdf.js
     */
    private async extractTextFromPDF(input: string | Buffer): Promise<string> {
        const data = typeof input === 'string' 
            ? new Uint8Array(fs.readFileSync(input))
            : new Uint8Array(input);
            
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n';
        }
        
        return fullText;
    }
    
    /**
     * Extract text from image using Tesseract OCR
     */
    private async extractTextFromImage(input: string | Buffer): Promise<string> {
        // Pre-process image for better OCR
        const processedImage = await sharp(input)
            .greyscale()
            .normalize()
            .sharpen()
            .toBuffer();
            
        const result = await Tesseract.recognize(processedImage, 'spa', {
            logger: m => console.log(`OCR: ${m.status} - ${Math.round(m.progress * 100)}%`)
        });
        
        return result.data.text;
    }
    
    /**
     * Parse extracted text to identify shipping data
     */
    private parseGuideText(text: string): ShippingGuideData | null {
        const data: Partial<ShippingGuideData> = { rawText: text };
        
        // Common Colombian carriers patterns
        const carrierPatterns = {
            'servientrega': /servientrega/i,
            'coordinadora': /coordinadora/i,
            'interrapidisimo': /inter\s*rapidisimo/i,
            'envia': /envia\s*colvanes/i,
            'tcc': /tcc/i,
            'deprisa': /deprisa/i
        };
        
        // Detect carrier
        for (const [carrier, pattern] of Object.entries(carrierPatterns)) {
            if (pattern.test(text)) {
                data.carrier = carrier;
                break;
            }
        }
        
        // Extract tracking number (various formats)
        const trackingPatterns = [
            /(?:gu[íi]a|tracking|n[úu]mero)[\s:]*([A-Z0-9]{8,20})/i,
            /(?:^|\s)(\d{10,15})(?:\s|$)/m,
            /[A-Z]{2,3}\d{9,12}/
        ];
        
        for (const pattern of trackingPatterns) {
            const match = text.match(pattern);
            if (match) {
                data.trackingNumber = match[1] || match[0];
                break;
            }
        }
        
        // Extract customer name
        const namePatterns = [
            /(?:destinatario|nombre|cliente)[\s:]*([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+){1,3})/,
            /(?:para|a nombre de)[\s:]*([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+){1,3})/
        ];
        
        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match) {
                data.customerName = match[1].trim();
                break;
            }
        }
        
        // Extract phone number (Colombian format)
        const phonePattern = /(?:tel[eé]fono|celular|móvil|cel)[\s.:]*(\+?57\s?)?(\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10})/i;
        const phoneMatch = text.match(phonePattern);
        if (phoneMatch) {
            data.customerPhone = (phoneMatch[1] || '57') + phoneMatch[2].replace(/[\s.-]/g, '');
        }
        
        // Extract address
        const addressPatterns = [
            /(?:direcci[óo]n|dir)[\s:]*(.+?)(?:\n|ciudad|tel|cel|$)/i,
            /(?:calle|carrera|cra|cll|av|avenida|transversal|diagonal)\s*\d+.+?(?:\n|$)/i
        ];
        
        for (const pattern of addressPatterns) {
            const match = text.match(pattern);
            if (match) {
                data.shippingAddress = match[1]?.trim() || match[0].trim();
                break;
            }
        }
        
        // Extract city
        const colombianCities = [
            'bogota', 'medellin', 'cali', 'barranquilla', 'cartagena', 
            'bucaramanga', 'pereira', 'santa marta', 'cucuta', 'ibague',
            'villavicencio', 'manizales', 'pasto', 'monteria', 'neiva'
        ];
        
        const textLower = text.toLowerCase();
        for (const city of colombianCities) {
            if (textLower.includes(city)) {
                data.city = city.charAt(0).toUpperCase() + city.slice(1);
                break;
            }
        }
        
        // Validate minimum required data
        if (data.trackingNumber && (data.customerName || data.customerPhone)) {
            return data as ShippingGuideData;
        }
        
        return null;
    }
}
