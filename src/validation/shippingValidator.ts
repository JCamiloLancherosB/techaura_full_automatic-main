/**
 * ShippingValidator Service
 * Validates shipping data and calculates shipping costs for Colombian addresses
 */

import { validate } from './validator';
import { shippingDataSchema, colombianPhoneSchema, colombianAddressSchema, cedulaSchema } from './schemas';
import type { ValidatedShippingData } from './schemas';

export interface ShippingValidationResult {
    valid: boolean;
    errors?: string[];
    data?: ValidatedShippingData;
}

export interface ShippingCostResult {
    city: string;
    department: string;
    baseCost: number;
    additionalCost: number;
    totalCost: number;
    estimatedDays: number;
}

// Shipping costs by city (in COP)
const SHIPPING_COSTS: { [key: string]: { cost: number; days: number; department: string } } = {
    'bogotá': { cost: 8000, days: 2, department: 'Cundinamarca' },
    'medellín': { cost: 12000, days: 3, department: 'Antioquia' },
    'cali': { cost: 14000, days: 3, department: 'Valle del Cauca' },
    'barranquilla': { cost: 15000, days: 4, department: 'Atlántico' },
    'cartagena': { cost: 16000, days: 4, department: 'Bolívar' },
    'bucaramanga': { cost: 13000, days: 3, department: 'Santander' },
    'cúcuta': { cost: 15000, days: 4, department: 'Norte de Santander' },
    'pereira': { cost: 13000, days: 3, department: 'Risaralda' },
    'manizales': { cost: 13000, days: 3, department: 'Caldas' },
    'ibagué': { cost: 12000, days: 3, department: 'Tolima' },
    'santa marta': { cost: 16000, days: 4, department: 'Magdalena' },
    'villavicencio': { cost: 11000, days: 2, department: 'Meta' },
    'pasto': { cost: 18000, days: 5, department: 'Nariño' },
    'montería': { cost: 16000, days: 4, department: 'Córdoba' },
    'valledupar': { cost: 15000, days: 4, department: 'Cesar' },
    'neiva': { cost: 13000, days: 3, department: 'Huila' },
    'armenia': { cost: 13000, days: 3, department: 'Quindío' },
    'popayán': { cost: 14000, days: 4, department: 'Cauca' },
    'sincelejo': { cost: 15000, days: 4, department: 'Sucre' },
    'tunja': { cost: 10000, days: 2, department: 'Boyacá' },
};

export class ShippingValidator {
    /**
     * Validate complete shipping data
     */
    validateShippingData(data: any): ShippingValidationResult {
        const result = validate(shippingDataSchema, data);

        if (!result.success) {
            return {
                valid: false,
                errors: result.errors?.map(e => e.message) || ['Datos de envío inválidos'],
            };
        }

        return {
            valid: true,
            data: result.data,
        };
    }

    /**
     * Validate individual fields
     */
    validatePhone(phone: string): { valid: boolean; error?: string; normalized?: string } {
        try {
            const result = colombianPhoneSchema.parse(phone);
            return { valid: true, normalized: result };
        } catch (error: any) {
            return { valid: false, error: error.errors?.[0]?.message || 'Teléfono inválido' };
        }
    }

    validateCedula(cedula: string): { valid: boolean; error?: string; normalized?: string } {
        try {
            const result = cedulaSchema.parse(cedula);
            return { valid: true, normalized: result };
        } catch (error: any) {
            return { valid: false, error: error.errors?.[0]?.message || 'Cédula inválida' };
        }
    }

    validateAddress(address: string): { valid: boolean; error?: string } {
        try {
            colombianAddressSchema.parse(address);
            return { valid: true };
        } catch (error: any) {
            return { valid: false, error: error.errors?.[0]?.message || 'Dirección inválida' };
        }
    }

    /**
     * Calculate shipping cost based on city
     */
    calculateShippingCost(city: string, orderValue?: number): ShippingCostResult {
        const normalizedCity = this.normalizeCity(city);
        const shippingInfo = SHIPPING_COSTS[normalizedCity];

        if (!shippingInfo) {
            // Default for unknown cities
            return {
                city,
                department: 'Desconocido',
                baseCost: 20000, // Higher cost for remote areas
                additionalCost: 0,
                totalCost: 20000,
                estimatedDays: 5,
            };
        }

        let additionalCost = 0;

        // Free shipping for orders over 150,000 COP in main cities
        const mainCities = ['bogotá', 'medellín', 'cali'];
        if (orderValue && orderValue >= 150000 && mainCities.includes(normalizedCity)) {
            return {
                city,
                department: shippingInfo.department,
                baseCost: 0,
                additionalCost: 0,
                totalCost: 0,
                estimatedDays: shippingInfo.days,
            };
        }

        return {
            city,
            department: shippingInfo.department,
            baseCost: shippingInfo.cost,
            additionalCost,
            totalCost: shippingInfo.cost + additionalCost,
            estimatedDays: shippingInfo.days,
        };
    }

    /**
     * Estimate delivery date
     */
    estimateDeliveryDate(city: string): Date {
        const normalizedCity = this.normalizeCity(city);
        const shippingInfo = SHIPPING_COSTS[normalizedCity];
        const days = shippingInfo?.days || 5;

        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + days);

        return deliveryDate;
    }

    /**
     * Format shipping summary
     */
    formatShippingCost(cost: ShippingCostResult): string {
        const formatter = new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
        });

        const lines: string[] = [];
        lines.push(`📦 *Costo de Envío a ${cost.city}*`);
        lines.push(`📍 Departamento: ${cost.department}`);

        if (cost.baseCost === 0) {
            lines.push('🎉 *¡ENVÍO GRATIS!*');
        } else {
            if (cost.baseCost > 0) {
                lines.push(`💰 Costo base: ${formatter.format(cost.baseCost)}`);
            }
            if (cost.additionalCost > 0) {
                lines.push(`➕ Costo adicional: ${formatter.format(cost.additionalCost)}`);
            }
            lines.push(`✅ *Total: ${formatter.format(cost.totalCost)}*`);
        }

        lines.push(`⏱️ Tiempo estimado: ${cost.estimatedDays} ${cost.estimatedDays === 1 ? 'día' : 'días'} hábiles`);

        return lines.join('\n');
    }

    /**
     * Get all supported cities
     */
    getSupportedCities(): string[] {
        return Object.keys(SHIPPING_COSTS).map(city => this.capitalizeCity(city));
    }

    /**
     * Check if city has free shipping option
     */
    hasFreeShippingOption(city: string): boolean {
        const normalizedCity = this.normalizeCity(city);
        const mainCities = ['bogotá', 'medellín', 'cali'];
        return mainCities.includes(normalizedCity);
    }

    /**
     * Get minimum order value for free shipping
     */
    getFreeShippingThreshold(city: string): number | null {
        if (this.hasFreeShippingOption(city)) {
            return 150000;
        }
        return null;
    }

    /**
     * Normalize city name for lookup
     */
    private normalizeCity(city: string): string {
        return city
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .trim();
    }

    /**
     * Capitalize city name properly
     */
    private capitalizeCity(city: string): string {
        return city
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

// Singleton instance
export const shippingValidator = new ShippingValidator();
