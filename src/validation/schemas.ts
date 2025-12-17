/**
 * Validation schemas using Zod for data validation
 * Provides type-safe validation for all entities
 */

import { z } from 'zod';

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
