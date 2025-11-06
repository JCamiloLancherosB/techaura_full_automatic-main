export interface OrderData {
    id?: string;
    customerId: string;
    contentType: 'music' | 'videos' | 'movies' | 'mixed';
    capacity: string;
    preferences: string[];
    price: number;
    deliveryDate?: Date;
    status?: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
    paymentStatus?: 'pending' | 'partial' | 'completed' | 'refunded';
    createdAt?: Date;
    updatedAt?: Date;
    completedAt?: Date; // ✅ AGREGADO
    notes?: string; // ✅ AGREGADO
}

export class Order {
    public id: string;
    public customerId: string;
    public contentType: 'music' | 'videos' | 'movies' | 'mixed';
    public capacity: string;
    public preferences: string[];
    public price: number;
    public deliveryDate?: Date;
    public status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
    public paymentStatus: 'pending' | 'partial' | 'completed' | 'refunded';
    public createdAt: Date;
    public updatedAt: Date;
    public completedAt?: Date; // ✅ AGREGADO
    public notes?: string; // ✅ AGREGADO

    constructor(data: OrderData) {
        this.id = data.id || this.generateOrderId();
        this.customerId = data.customerId;
        this.contentType = data.contentType;
        this.capacity = data.capacity;
        this.preferences = data.preferences;
        this.price = data.price;
        this.deliveryDate = data.deliveryDate;
        this.status = data.status || 'pending';
        this.paymentStatus = data.paymentStatus || 'pending';
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.completedAt = data.completedAt; // ✅ AGREGADO
        this.notes = data.notes; // ✅ AGREGADO
    }

    /**
     * Generar ID único para la orden
     */
    private generateOrderId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `ORD-${timestamp}-${random}`.toUpperCase();
    }

    /**
     * Actualizar estado de la orden
     */
    updateStatus(status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled'): void {
        this.status = status;
        this.updatedAt = new Date();
        
        // ✅ Si se completa, registrar fecha
        if (status === 'completed' && !this.completedAt) {
            this.completedAt = new Date();
        }
    }

    /**
     * Actualizar estado de pago
     */
    updatePaymentStatus(paymentStatus: 'pending' | 'partial' | 'completed' | 'refunded'): void {
        this.paymentStatus = paymentStatus;
        this.updatedAt = new Date();
    }

    /**
     * Confirmar orden
     */
    confirm(): void {
        this.status = 'confirmed';
        this.updatedAt = new Date();
    }

    /**
     * Cancelar orden
     */
    cancel(): void {
        this.status = 'cancelled';
        this.updatedAt = new Date();
    }

    /**
     * Completar orden
     */
    complete(): void {
        this.status = 'completed';
        this.completedAt = new Date();
        this.updatedAt = new Date();
    }

    /**
     * Agregar nota
     */
    addNote(note: string): void {
        if (this.notes) {
            this.notes += `\n${new Date().toISOString()}: ${note}`;
        } else {
            this.notes = `${new Date().toISOString()}: ${note}`;
        }
        this.updatedAt = new Date();
    }

    /**
     * Verificar si la orden está pagada
     */
    isPaid(): boolean {
        return this.paymentStatus === 'completed';
    }

    /**
     * Verificar si la orden está completada
     */
    isCompleted(): boolean {
        return this.status === 'completed';
    }

    /**
     * Verificar si la orden está cancelada
     */
    isCancelled(): boolean {
        return this.status === 'cancelled';
    }

    /**
     * Obtener días desde creación
     */
    getDaysSinceCreation(): number {
        const now = new Date();
        const diff = now.getTime() - this.createdAt.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    /**
     * Obtener tiempo de procesamiento (si está completada)
     */
    getProcessingTime(): number | null {
        if (!this.completedAt) return null;
        
        const diff = this.completedAt.getTime() - this.createdAt.getTime();
        return Math.floor(diff / 1000); // En segundos
    }

    /**
     * Verificar si está vencida (más de 7 días sin confirmar)
     */
    isExpired(): boolean {
        return this.status === 'pending' && this.getDaysSinceCreation() > 7;
    }

    /**
     * Convertir a objeto plano
     */
    toJSON(): OrderData {
        return {
            id: this.id,
            customerId: this.customerId,
            contentType: this.contentType,
            capacity: this.capacity,
            preferences: this.preferences,
            price: this.price,
            deliveryDate: this.deliveryDate,
            status: this.status,
            paymentStatus: this.paymentStatus,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            completedAt: this.completedAt,
            notes: this.notes
        };
    }

    /**
     * Crear desde objeto plano
     */
    static fromJSON(data: OrderData): Order {
        return new Order({
            ...data,
            createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
            updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
            completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
            deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : undefined
        });
    }

    /**
     * Validar datos de orden
     */
    static validate(data: Partial<OrderData>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!data.customerId) {
            errors.push('customerId es requerido');
        }

        if (!data.contentType) {
            errors.push('contentType es requerido');
        } else if (!['music', 'videos', 'movies', 'mixed'].includes(data.contentType)) {
            errors.push('contentType debe ser: music, videos, movies o mixed');
        }

        if (!data.capacity) {
            errors.push('capacity es requerido');
        }

        if (!data.preferences || data.preferences.length === 0) {
            errors.push('preferences es requerido');
        }

        if (data.price === undefined || data.price === null) {
            errors.push('price es requerido');
        } else if (data.price < 0) {
            errors.push('price debe ser mayor o igual a 0');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Calcular precio según capacidad y tipo
     */
    static calculatePrice(capacity: string, contentType: string): number {
        const basePrice = 10000;
        
        // Multiplicador por capacidad
        const gb = parseInt(capacity.replace(/[^0-9]/g, ''));
        let capacityMultiplier = 1;
        
        if (gb <= 8) capacityMultiplier = 1;
        else if (gb <= 16) capacityMultiplier = 1.5;
        else if (gb <= 32) capacityMultiplier = 2;
        else if (gb <= 64) capacityMultiplier = 3;
        else capacityMultiplier = 4;

        // Multiplicador por tipo de contenido
        const contentMultipliers: Record<string, number> = {
            music: 1,
            videos: 1.2,
            movies: 1.5,
            mixed: 1.3
        };

        const contentMultiplier = contentMultipliers[contentType] || 1;

        return Math.round(basePrice * capacityMultiplier * contentMultiplier);
    }
}
