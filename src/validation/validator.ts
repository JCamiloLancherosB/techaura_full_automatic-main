/**
 * Server-side validation and normalization module
 * Provides reusable validation and normalization functions for data integrity
 */

export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    data?: any;
}

/**
 * Normalization functions
 */
export const normalize = {
    /**
     * Trim and collapse multiple spaces into single space
     */
    text(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).trim().replace(/\s+/g, ' ');
    },

    /**
     * Normalize phone number (remove spaces, dashes, parentheses, plus sign)
     */
    phone(value: string | null | undefined): string {
        if (!value) return '';
        const cleaned = String(value).replace(/[\s\-\(\)\+]/g, '');
        // Colombia: if 10 digits and doesn't start with 57, add 57
        if (cleaned.length === 10 && !cleaned.startsWith('57')) {
            return '57' + cleaned;
        }
        return cleaned;
    },

    /**
     * Normalize email to lowercase and trim
     */
    email(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).trim().toLowerCase();
    },

    /**
     * Safe number parsing with default value
     */
    number(value: any, defaultValue: number = 0): number {
        const parsed = Number(value);
        return isNaN(parsed) ? defaultValue : parsed;
    },

    /**
     * Safe integer parsing with default value
     */
    integer(value: any, defaultValue: number = 0): number {
        const parsed = parseInt(String(value), 10);
        return isNaN(parsed) ? defaultValue : parsed;
    },

    /**
     * Normalize capacity string (e.g., "32gb" -> "32GB")
     */
    capacity(value: string | null | undefined): string {
        if (!value) return '';
        return String(value).trim().toUpperCase();
    }
};

/**
 * Validation functions
 */
export const validate = {
    /**
     * Check if value is required and not empty
     */
    required(value: any, fieldName: string): ValidationError | null {
        if (value === null || value === undefined || String(value).trim() === '') {
            return {
                field: fieldName,
                message: `${fieldName} is required`,
                code: 'REQUIRED'
            };
        }
        return null;
    },

    /**
     * Validate email format
     */
    email(value: string, fieldName: string = 'email'): ValidationError | null {
        if (!value) return null; // Allow empty if not required
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            return {
                field: fieldName,
                message: 'Invalid email format',
                code: 'INVALID_EMAIL'
            };
        }
        return null;
    },

    /**
     * Validate phone format (Colombian phone numbers)
     */
    phone(value: string, fieldName: string = 'phone'): ValidationError | null {
        if (!value) return null;
        const normalized = normalize.phone(value);
        // Colombian phone: 10 digits (without 57) or 12 digits (with 57)
        if (normalized.length !== 10 && normalized.length !== 12) {
            return {
                field: fieldName,
                message: 'Invalid phone number format',
                code: 'INVALID_PHONE'
            };
        }
        return null;
    },

    /**
     * Validate string length
     */
    length(value: string, min: number, max: number, fieldName: string): ValidationError | null {
        if (!value) return null;
        const len = value.length;
        if (len < min || len > max) {
            return {
                field: fieldName,
                message: `${fieldName} must be between ${min} and ${max} characters`,
                code: 'INVALID_LENGTH'
            };
        }
        return null;
    },

    /**
     * Validate number range
     */
    range(value: number, min: number, max: number, fieldName: string): ValidationError | null {
        if (value < min || value > max) {
            return {
                field: fieldName,
                message: `${fieldName} must be between ${min} and ${max}`,
                code: 'OUT_OF_RANGE'
            };
        }
        return null;
    },

    /**
     * Validate value is in whitelist
     */
    whitelist(value: any, allowedValues: any[], fieldName: string): ValidationError | null {
        if (!allowedValues.includes(value)) {
            return {
                field: fieldName,
                message: `${fieldName} must be one of: ${allowedValues.join(', ')}`,
                code: 'INVALID_VALUE'
            };
        }
        return null;
    }
};

/**
 * USB Order Validator
 */
export class UsbOrderValidator {
    private static VALID_CAPACITIES = ['8GB', '16GB', '32GB', '64GB', '128GB', '256GB', '512GB'];
    
    /**
     * Validate and normalize USB order data
     */
    static validateOrder(rawData: any): ValidationResult {
        const errors: ValidationError[] = [];
        const data: any = {};

        // Validate and normalize capacity
        const capacityNormalized = normalize.capacity(rawData.usbCapacity);
        const capacityError = validate.required(capacityNormalized, 'usbCapacity') ||
                             validate.whitelist(capacityNormalized, this.VALID_CAPACITIES, 'usbCapacity');
        if (capacityError) {
            errors.push(capacityError);
        } else {
            data.usbCapacity = capacityNormalized;
        }

        // Validate and normalize price
        const price = normalize.number(rawData.usbPrice);
        const priceError = validate.required(price, 'usbPrice') ||
                          validate.range(price, 1000, 10000000, 'usbPrice');
        if (priceError) {
            errors.push(priceError);
        } else {
            data.usbPrice = price;
        }

        // Validate and normalize name
        const name = normalize.text(rawData.name);
        const nameError = validate.required(name, 'name') ||
                         validate.length(name, 2, 255, 'name');
        if (nameError) {
            errors.push(nameError);
        } else {
            data.name = name;
        }

        // Validate and normalize phone
        const phone = normalize.phone(rawData.phone);
        const phoneError = validate.required(phone, 'phone') ||
                          validate.phone(phone, 'phone');
        if (phoneError) {
            errors.push(phoneError);
        } else {
            data.phone = phone;
        }

        // Validate email (optional)
        if (rawData.email) {
            const email = normalize.email(rawData.email);
            const emailError = validate.email(email, 'email');
            if (emailError) {
                errors.push(emailError);
            } else {
                data.email = email;
            }
        }

        // Validate and normalize address fields
        const addressFields = ['department', 'city', 'address', 'neighborhood', 'house'];
        for (const field of addressFields) {
            const value = normalize.text(rawData[field]);
            const error = validate.required(value, field) ||
                         validate.length(value, 1, 500, field);
            if (error) {
                errors.push(error);
            } else {
                data[field] = value;
            }
        }

        // Parse and validate selected content
        if (rawData.selectedContent) {
            try {
                const parsedContent = typeof rawData.selectedContent === 'string' 
                    ? JSON.parse(rawData.selectedContent) 
                    : rawData.selectedContent;
                data.selectedContent = parsedContent;
            } catch (e) {
                errors.push({
                    field: 'selectedContent',
                    message: 'Invalid JSON format for selectedContent',
                    code: 'INVALID_JSON'
                });
            }
        } else {
            data.selectedContent = {};
        }

        return {
            valid: errors.length === 0,
            errors,
            data: errors.length === 0 ? data : undefined
        };
    }
}

/**
 * Processing Job Validator
 */
export class ProcessingJobValidator {
    /**
     * Validate processing job data
     */
    static validateJob(rawData: any): ValidationResult {
        const errors: ValidationError[] = [];
        const data: any = {};

        // Validate order_id
        const orderIdError = validate.required(rawData.order_id, 'order_id');
        if (orderIdError) {
            errors.push(orderIdError);
        } else {
            data.order_id = normalize.text(rawData.order_id);
        }

        // Validate usb_capacity
        const capacityNormalized = normalize.capacity(rawData.usb_capacity);
        const capacityError = validate.required(capacityNormalized, 'usb_capacity');
        if (capacityError) {
            errors.push(capacityError);
        } else {
            data.usb_capacity = capacityNormalized;
        }

        // Validate content_plan_id (optional)
        if (rawData.content_plan_id) {
            data.content_plan_id = normalize.text(rawData.content_plan_id);
        }

        // Validate volume_label (optional)
        if (rawData.volume_label) {
            data.volume_label = normalize.text(rawData.volume_label);
        }

        return {
            valid: errors.length === 0,
            errors,
            data: errors.length === 0 ? data : undefined
        };
    }
}
