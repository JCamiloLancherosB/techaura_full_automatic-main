/**
 * File Upload Service
 * Handles file uploads, validation, and processing
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { validate } from '../../validation/validator';
import { fileUploadSchema, batchOrderSchema } from '../../validation/schemas';

export interface FileUploadResult {
    success: boolean;
    fileId?: string;
    filename?: string;
    records?: any[];
    errors?: string[];
    totalRecords?: number;
    validRecords?: number;
    invalidRecords?: number;
}

export interface ProcessingProgress {
    total: number;
    processed: number;
    successful: number;
    failed: number;
    errors: Array<{ row: number; error: string }>;
}

/**
 * Configure multer for file uploads
 */
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req: any, file: any, cb: any) => {
    const allowedMimes = [
        'text/csv',
        'application/json',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no soportado. Use CSV, JSON o Excel'), false);
    }
};

export const uploadMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

export class FileUploadService {
    /**
     * Validate uploaded file
     */
    async validateFile(file: Express.Multer.File): Promise<{ valid: boolean; errors?: string[] }> {
        const validationResult = validate(fileUploadSchema, {
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size
        });

        if (!validationResult.success) {
            return {
                valid: false,
                errors: validationResult.errors?.map(e => e.message)
            };
        }

        return { valid: true };
    }

    /**
     * Parse CSV file
     */
    async parseCSV(filePath: string): Promise<any[]> {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        
        return new Promise((resolve, reject) => {
            Papa.parse(fileContent, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => {
                    // Normalize headers (lowercase, remove spaces)
                    return header.toLowerCase().trim().replace(/\s+/g, '_');
                },
                complete: (results) => {
                    resolve(results.data);
                },
                error: (error) => {
                    reject(new Error(`Error parsing CSV: ${error.message}`));
                }
            });
        });
    }

    /**
     * Parse Excel file
     */
    async parseExcel(filePath: string): Promise<any[]> {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const data = XLSX.utils.sheet_to_json(worksheet, {
            defval: '',
            raw: false
        });

        // Normalize keys (lowercase, remove spaces)
        return data.map((row: any) => {
            const normalized: any = {};
            Object.keys(row).forEach(key => {
                const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
                normalized[normalizedKey] = row[key];
            });
            return normalized;
        });
    }

    /**
     * Parse JSON file
     */
    async parseJSON(filePath: string): Promise<any[]> {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        
        if (!Array.isArray(data)) {
            throw new Error('El archivo JSON debe contener un array de registros');
        }
        
        return data;
    }

    /**
     * Parse file based on mimetype
     */
    async parseFile(file: Express.Multer.File): Promise<any[]> {
        const filePath = file.path;

        switch (file.mimetype) {
            case 'text/csv':
                return this.parseCSV(filePath);
            
            case 'application/vnd.ms-excel':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                return this.parseExcel(filePath);
            
            case 'application/json':
                return this.parseJSON(filePath);
            
            default:
                throw new Error('Tipo de archivo no soportado');
        }
    }

    /**
     * Validate parsed records
     */
    validateRecords(records: any[]): {
        valid: any[];
        invalid: Array<{ row: number; record: any; errors: string[] }>;
    } {
        const valid: any[] = [];
        const invalid: Array<{ row: number; record: any; errors: string[] }> = [];

        records.forEach((record, index) => {
            // Basic validation - can be extended with schema validation
            const errors: string[] = [];

            if (!record.customer_name || record.customer_name.trim() === '') {
                errors.push('Nombre de cliente es requerido');
            }

            if (!record.customer_phone || record.customer_phone.trim() === '') {
                errors.push('Teléfono de cliente es requerido');
            }

            if (!record.content_type || record.content_type.trim() === '') {
                errors.push('Tipo de contenido es requerido');
            }

            if (!record.capacity || record.capacity.trim() === '') {
                errors.push('Capacidad es requerida');
            }

            if (!record.price || isNaN(parseFloat(record.price))) {
                errors.push('Precio inválido');
            }

            if (errors.length > 0) {
                invalid.push({ row: index + 2, record, errors }); // +2 for header row
            } else {
                valid.push(record);
            }
        });

        return { valid, invalid };
    }

    /**
     * Process uploaded file
     */
    async processFile(file: Express.Multer.File): Promise<FileUploadResult> {
        try {
            // Validate file
            const fileValidation = await this.validateFile(file);
            if (!fileValidation.valid) {
                return {
                    success: false,
                    errors: fileValidation.errors
                };
            }

            // Parse file
            const records = await this.parseFile(file);

            // Validate records
            const { valid, invalid } = this.validateRecords(records);

            const errors = invalid.map(item => 
                `Fila ${item.row}: ${item.errors.join(', ')}`
            );

            return {
                success: true,
                fileId: path.basename(file.filename, path.extname(file.filename)),
                filename: file.originalname,
                records: valid,
                errors: errors.length > 0 ? errors : undefined,
                totalRecords: records.length,
                validRecords: valid.length,
                invalidRecords: invalid.length
            };
        } catch (error: any) {
            return {
                success: false,
                errors: [error.message || 'Error procesando archivo']
            };
        }
    }

    /**
     * Clean up uploaded file
     */
    async cleanupFile(filePath: string): Promise<void> {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error('Error deleting file:', error);
        }
    }
}

export const fileUploadService = new FileUploadService();
