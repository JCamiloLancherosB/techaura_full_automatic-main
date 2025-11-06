export interface CustomerData {
    id?: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    city?: string;
    country?: string;
    preferences?: string[];
    notes?: string;
    createdAt?: Date;
    updatedAt?: Date;
    lastInteraction?: Date;
    lastOrderDate?: Date; // ✅ AGREGADO
    totalOrders?: number;
    totalSpent?: number;
    vipStatus?: boolean; // ✅ AGREGADO
}

export class Customer {
    public id: string;
    public name: string;
    public phone: string;
    public email?: string;
    public address?: string;
    public city?: string;
    public country?: string;
    public preferences: string[];
    public notes?: string;
    public createdAt: Date;
    public updatedAt: Date;
    public lastInteraction: Date;
    public lastOrderDate?: Date; // ✅ AGREGADO
    public totalOrders: number;
    public totalSpent: number;
    public vipStatus: boolean; // ✅ AGREGADO

    constructor(data: CustomerData) {
        this.id = data.id || this.generateCustomerId();
        this.name = data.name;
        this.phone = data.phone;
        this.email = data.email;
        this.address = data.address;
        this.city = data.city;
        this.country = data.country || 'Colombia';
        this.preferences = data.preferences || [];
        this.notes = data.notes;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.lastInteraction = data.lastInteraction || new Date();
        this.lastOrderDate = data.lastOrderDate; // ✅ AGREGADO
        this.totalOrders = data.totalOrders || 0;
        this.totalSpent = data.totalSpent || 0;
        this.vipStatus = data.vipStatus || false; // ✅ AGREGADO
    }

    /**
     * Generar ID único para el cliente
     */
    private generateCustomerId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `CUST-${timestamp}-${random}`.toUpperCase();
    }

    /**
     * Actualizar última interacción
     */
    updateLastInteraction(): void {
        this.lastInteraction = new Date();
        this.updatedAt = new Date();
    }

    /**
     * Agregar preferencia
     */
    addPreference(preference: string): void {
        if (!this.preferences.includes(preference)) {
            this.preferences.push(preference);
            this.updatedAt = new Date();
        }
    }

    /**
     * Incrementar contador de órdenes
     */
    incrementOrders(amount: number): void {
        this.totalOrders++;
        this.totalSpent += amount;
        this.lastOrderDate = new Date(); // ✅ ACTUALIZAR FECHA
        this.updatedAt = new Date();
        
        // ✅ Actualizar estado VIP automáticamente
        this.updateVIPStatus();
    }

    /**
     * Actualizar estado VIP
     */
    updateVIPStatus(): void {
        this.vipStatus = this.isVIP();
        this.updatedAt = new Date();
    }

    /**
     * Verificar si es cliente VIP (más de 5 órdenes o más de $500,000)
     */
    isVIP(): boolean {
        return this.totalOrders >= 5 || this.totalSpent >= 500000;
    }

    /**
     * Obtener nivel de cliente
     */
    getCustomerLevel(): 'new' | 'regular' | 'vip' | 'premium' {
        if (this.totalOrders === 0) return 'new';
        if (this.totalOrders < 3) return 'regular';
        if (this.totalOrders < 10) return 'vip';
        return 'premium';
    }

    /**
     * Obtener días desde última orden
     */
    getDaysSinceLastOrder(): number | null {
        if (!this.lastOrderDate) return null;
        
        const now = new Date();
        const diff = now.getTime() - this.lastOrderDate.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    /**
     * Verificar si es cliente inactivo (más de 90 días sin ordenar)
     */
    isInactive(): boolean {
        const days = this.getDaysSinceLastOrder();
        return days !== null && days > 90;
    }

    /**
     * Convertir a objeto plano
     */
    toJSON(): CustomerData {
        return {
            id: this.id,
            name: this.name,
            phone: this.phone,
            email: this.email,
            address: this.address,
            city: this.city,
            country: this.country,
            preferences: this.preferences,
            notes: this.notes,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastInteraction: this.lastInteraction,
            lastOrderDate: this.lastOrderDate,
            totalOrders: this.totalOrders,
            totalSpent: this.totalSpent,
            vipStatus: this.vipStatus
        };
    }

    /**
     * Crear desde objeto plano
     */
    static fromJSON(data: CustomerData): Customer {
        return new Customer({
            ...data,
            createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
            updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
            lastInteraction: data.lastInteraction ? new Date(data.lastInteraction) : undefined,
            lastOrderDate: data.lastOrderDate ? new Date(data.lastOrderDate) : undefined
        });
    }

    /**
     * Validar datos de cliente
     */
    static validate(data: Partial<CustomerData>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!data.name || data.name.trim().length === 0) {
            errors.push('name es requerido');
        }

        if (!data.phone || data.phone.trim().length === 0) {
            errors.push('phone es requerido');
        } else if (!/^\+?[0-9]{10,15}$/.test(data.phone.replace(/\s/g, ''))) {
            errors.push('phone debe tener formato válido');
        }

        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.push('email debe tener formato válido');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
