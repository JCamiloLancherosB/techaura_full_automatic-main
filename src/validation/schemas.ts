/**
 * Validation schemas using Zod for data validation
 * Provides type-safe validation for all entities
 */

import { z } from 'zod';
import { normalizeText } from '../utils/textUtils';

// Phone number validation (Colombian format)
const phoneRegex = /^(\+?57)?3\d{9}$/;
export const phoneSchema = z.string()
    .trim()
    .regex(phoneRegex, 'Número de teléfono inválido. Formato: 3001234567 o +573001234567');

// Email validation
export const emailSchema = z.string()
    .trim()
    .email('Email inválido')
    .toLowerCase();

// Name validation
export const nameSchema = z.string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres');

// Customer validation schema
export const customerSchema = z.object({
    name: nameSchema,
    phone: phoneSchema,
    email: emailSchema.optional(),
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(100).optional(),
    country: z.string().trim().max(100).default('Colombia'),
    preferences: z.array(z.string()).default([]),
    notes: z.string().max(500).optional()
});

export type ValidatedCustomer = z.infer<typeof customerSchema>;

// USB Capacity validation
export const usbCapacitySchema = z.enum(['64GB', '128GB', '256GB', '512GB'], {
    errorMap: () => ({ message: 'Capacidad inválida. Opciones: 64GB, 128GB, 256GB, 512GB' })
});

// Content type validation
export const contentTypeSchema = z.enum(['music', 'videos', 'movies', 'mixed', 'series', 'documentaries', 'custom'], {
    errorMap: () => ({ message: 'Tipo de contenido inválido' })
});

// Order status validation
export const orderStatusSchema = z.enum(['pending', 'confirmed', 'processing', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Estado de orden inválido' })
});

// Payment status validation
export const paymentStatusSchema = z.enum(['pending', 'partial', 'completed', 'refunded'], {
    errorMap: () => ({ message: 'Estado de pago inválido' })
});

// Customization data validation
export const customizationSchema = z.object({
    genres: z.array(z.string().trim()).default([]),
    artists: z.array(z.string().trim()).default([]),
    videos: z.array(z.string().trim()).default([]),
    videoArtists: z.array(z.string().trim()).default([]),
    movies: z.array(z.string().trim()).default([]),
    series: z.array(z.string().trim()).default([]),
    documentaries: z.array(z.string().trim()).default([]),
    requestedTitles: z.array(z.string().trim()).default([]),
    usbName: z.string().trim().max(50).optional(),
    mood: z.string().trim().max(50).optional(),
    preferredEras: z.array(z.string().trim()).default([]),
    videoQuality: z.enum(['HD', 'FHD', '4K']).optional()
}).strict();

export type ValidatedCustomization = z.infer<typeof customizationSchema>;

// Order validation schema
export const orderSchema = z.object({
    customerId: z.string().uuid('ID de cliente inválido'),
    contentType: contentTypeSchema,
    capacity: usbCapacitySchema,
    preferences: z.array(z.string().trim()).default([]),
    price: z.number()
        .positive('El precio debe ser mayor a 0')
        .max(10000000, 'El precio excede el máximo permitido'),
    deliveryDate: z.date().optional(),
    status: orderStatusSchema.default('pending'),
    paymentStatus: paymentStatusSchema.default('pending'),
    notes: z.string().max(500).optional(),
    customization: customizationSchema.optional()
});

export type ValidatedOrder = z.infer<typeof orderSchema>;

// File upload validation
export const fileUploadSchema = z.object({
    filename: z.string().min(1, 'Nombre de archivo requerido'),
    mimetype: z.enum(['text/csv', 'application/json', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], {
        errorMap: () => ({ message: 'Tipo de archivo no soportado. Use CSV, JSON o Excel' })
    }),
    size: z.number()
        .max(10 * 1024 * 1024, 'El archivo no debe exceder 10MB')
});

// Batch order import validation
export const batchOrderSchema = z.array(
    z.object({
        customerName: nameSchema,
        customerPhone: phoneSchema,
        customerEmail: emailSchema.optional(),
        contentType: contentTypeSchema,
        capacity: usbCapacitySchema,
        price: z.number().positive(),
        genres: z.string().transform(str => str.split(',').map(s => s.trim())).optional(),
        artists: z.string().transform(str => str.split(',').map(s => s.trim())).optional(),
        notes: z.string().max(500).optional()
    })
).min(1, 'Debe incluir al menos un pedido');

// Processing job validation
export const processingJobSchema = z.object({
    orderId: z.string(),
    status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
    progress: z.number().min(0).max(100),
    totalFiles: z.number().min(0),
    processedFiles: z.number().min(0),
    errors: z.array(z.string()).default([])
});

export type ValidatedProcessingJob = z.infer<typeof processingJobSchema>;

// Session data validation
export const sessionSchema = z.object({
    phone: phoneSchema,
    phoneNumber: phoneSchema.optional(),
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    stage: z.string().default('initial'),
    contentType: contentTypeSchema.optional(),
    capacity: usbCapacitySchema.optional(),
    selectedGenres: z.array(z.string()).default([]),
    mentionedArtists: z.array(z.string()).default([])
});

export type ValidatedSession = z.infer<typeof sessionSchema>;

// Colombian-specific validation schemas

// Colombian cédula validation
export const cedulaSchema = z.string()
    .trim()
    .regex(/^\d{6,12}$/, 'Número de cédula inválido. Debe contener entre 6 y 12 dígitos')
    .transform(val => val.replace(/\D/g, '')); // Remove non-digits

// Colombian phone validation (stricter)
export const colombianPhoneSchema = z.string()
    .trim()
    .regex(/^(\+?57)?3\d{9}$/, 'Número de teléfono colombiano inválido. Formato: 3001234567 o +573001234567')
    .transform(val => {
        const cleaned = val.replace(/[\s\-\(\)]/g, '');
        // Ensure it starts with 57 if it doesn't already
        if (cleaned.startsWith('3') && cleaned.length === 10) {
            return '57' + cleaned;
        }
        if (cleaned.startsWith('+57')) {
            return cleaned.substring(1);
        }
        return cleaned;
    });

// Colombian address validation
export const colombianAddressSchema = z.string()
    .trim()
    .min(10, 'La dirección debe tener al menos 10 caracteres')
    .max(200, 'La dirección no puede exceder 200 caracteres')
    .regex(
        /\b(calle|carrera|cra|cll|avenida|av|diagonal|diag|transversal|trans|circular|circ)/i,
        'Dirección debe incluir tipo de vía (Calle, Carrera, Avenida, etc.)'
    );

// Colombian city validation
const COLOMBIAN_CITIES = [
    'bogotá', 'medellín', 'cali', 'barranquilla', 'cartagena', 'bucaramanga',
    'cúcuta', 'pereira', 'manizales', 'ibagué', 'santa marta', 'villavicencio',
    'pasto', 'montería', 'valledupar', 'neiva', 'armenia', 'popayán',
    'sincelejo', 'tunja', 'florencia', 'riohacha', 'yopal', 'quibdó',
    'leticia', 'inírida', 'puerto carreño', 'san andrés'
];

export const colombianCitySchema = z.string()
    .trim()
    .min(3, 'Nombre de ciudad inválido')
    .max(100, 'Nombre de ciudad muy largo')
    .refine(
        (city) => {
            const normalized = normalizeText(city);
            return COLOMBIAN_CITIES.some(validCity => {
                const normalizedValid = normalizeText(validCity);
                return normalized.includes(normalizedValid) || normalizedValid.includes(normalized);
            });
        },
        { message: 'Ciudad colombiana no reconocida' }
    );

// Complete shipping data validation
export const shippingDataSchema = z.object({
    name: nameSchema,
    lastName: nameSchema.optional(),
    cedula: cedulaSchema,
    phone: colombianPhoneSchema,
    address: colombianAddressSchema,
    city: z.string().trim().min(3, 'Ciudad requerida'),
    department: z.string().trim().optional(),
    additionalInfo: z.string().max(200).optional()
});

export type ValidatedShippingData = z.infer<typeof shippingDataSchema>;

// Order confirmation schema
export const orderConfirmationSchema = z.object({
    orderId: z.string().min(1, 'Order ID requerido'),
    customerPhone: colombianPhoneSchema,
    customerName: nameSchema,
    customerCedula: cedulaSchema,
    shippingAddress: colombianAddressSchema,
    shippingCity: z.string().trim(),
    shippingDepartment: z.string().trim().optional(),
    paymentMethod: z.enum(['efectivo', 'transferencia', 'nequi', 'daviplata', 'tarjeta'], {
        errorMap: () => ({ message: 'Método de pago inválido' })
    }),
    totalAmount: z.number().positive('El monto total debe ser mayor a 0'),
    status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
        .default('pending')
});

export type ValidatedOrderConfirmation = z.infer<typeof orderConfirmationSchema>;
