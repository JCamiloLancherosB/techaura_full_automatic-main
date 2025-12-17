/**
 * Centralized validation service
 * Provides validation utilities and error formatting
 */

import { ZodError, ZodSchema } from 'zod';

export interface ValidationResult<T> {
    success: boolean;
    data?: T;
    errors?: ValidationError[];
}

export interface ValidationError {
    field: string;
    message: string;
}

/**
 * Validate data against a Zod schema
 */
export function validate<T>(
    schema: ZodSchema<T>,
    data: unknown
): ValidationResult<T> {
    try {
        const validated = schema.parse(data);
        return {
            success: true,
            data: validated
        };
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                success: false,
                errors: formatZodErrors(error)
            };
        }
        return {
            success: false,
            errors: [{ field: 'unknown', message: 'Error de validación desconocido' }]
        };
    }
}

/**
 * Validate data and throw on error
 */
export function validateOrThrow<T>(
    schema: ZodSchema<T>,
    data: unknown
): T {
    return schema.parse(data);
}

/**
 * Format Zod errors into a user-friendly format
 */
export function formatZodErrors(error: ZodError): ValidationError[] {
    return error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
    }));
}

/**
 * Normalize string data (trim, lowercase for specific fields)
 */
export function normalizeString(str: string): string {
    return str.trim();
}

/**
 * Normalize phone number (remove spaces, dashes)
 */
export function normalizePhone(phone: string): string {
    return phone.replace(/[\s\-\(\)]/g, '').trim();
}

/**
 * Normalize email (trim, lowercase)
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

/**
 * Sanitize input to prevent XSS
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Validate and normalize customer data
 */
export function normalizeCustomerData(data: any): any {
    return {
        ...data,
        name: data.name ? normalizeString(data.name) : undefined,
        phone: data.phone ? normalizePhone(data.phone) : undefined,
        email: data.email ? normalizeEmail(data.email) : undefined,
        address: data.address ? normalizeString(data.address) : undefined,
        city: data.city ? normalizeString(data.city) : undefined,
        country: data.country ? normalizeString(data.country) : undefined,
        notes: data.notes ? normalizeString(data.notes) : undefined
    };
}

/**
 * Validate and normalize order data
 */
export function normalizeOrderData(data: any): any {
    return {
        ...data,
        notes: data.notes ? normalizeString(data.notes) : undefined,
        customization: data.customization ? normalizeCustomizationData(data.customization) : undefined
    };
}

/**
 * Normalize customization data
 */
export function normalizeCustomizationData(data: any): any {
    return {
        ...data,
        genres: data.genres?.map((g: string) => normalizeString(g)) || [],
        artists: data.artists?.map((a: string) => normalizeString(a)) || [],
        videos: data.videos?.map((v: string) => normalizeString(v)) || [],
        videoArtists: data.videoArtists?.map((a: string) => normalizeString(a)) || [],
        movies: data.movies?.map((m: string) => normalizeString(m)) || [],
        series: data.series?.map((s: string) => normalizeString(s)) || [],
        documentaries: data.documentaries?.map((d: string) => normalizeString(d)) || [],
        requestedTitles: data.requestedTitles?.map((t: string) => normalizeString(t)) || [],
        usbName: data.usbName ? normalizeString(data.usbName) : undefined,
        mood: data.mood ? normalizeString(data.mood) : undefined,
        preferredEras: data.preferredEras?.map((e: string) => normalizeString(e)) || []
    };
}

/**
 * Create error response
 */
export function createErrorResponse(errors: ValidationError[]): {
    success: false;
    errors: ValidationError[];
    message: string;
} {
    return {
        success: false,
        errors,
        message: `Errores de validación: ${errors.map(e => e.message).join(', ')}`
    };
}

/**
 * Create success response
 */
export function createSuccessResponse<T>(data: T): {
    success: true;
    data: T;
} {
    return {
        success: true,
        data
    };
}
