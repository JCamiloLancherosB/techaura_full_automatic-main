/**
 * Order Service - Manages order operations for admin panel
 */

import { businessDB } from '../../mysql-database';
import type { AdminOrder, OrderFilter, OrderStatus, PaginatedResponse } from '../types/AdminTypes';
import type { CustomerOrder } from '../../../types/global';

export class OrderService {
    /**
     * Get all orders with optional filters and pagination
     */
    async getOrders(
        filters?: OrderFilter,
        page: number = 1,
        limit: number = 50
    ): Promise<PaginatedResponse<AdminOrder>> {
        try {
            // Build query based on filters
            const offset = (page - 1) * limit;
            
            // Get orders from database (using existing businessDB)
            // Note: Adjust based on actual database schema
            const orders = await this.fetchOrdersFromDB(filters, limit, offset);
            const total = await this.countOrders(filters);
            
            return {
                data: orders,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            console.error('Error fetching orders:', error);
            throw error;
        }
    }

    /**
     * Get single order by ID
     */
    async getOrderById(orderId: string): Promise<AdminOrder | null> {
        try {
            const order = await this.fetchOrderFromDB(orderId);
            return order;
        } catch (error) {
            console.error('Error fetching order:', error);
            throw error;
        }
    }

    /**
     * Update order status
     */
    async updateOrderStatus(orderId: string, status: OrderStatus): Promise<boolean> {
        try {
            // Update in database
            await this.updateOrderInDB(orderId, { status });
            
            // Log the status change
            await this.addOrderNote(orderId, `Status changed to: ${status}`);
            
            return true;
        } catch (error) {
            console.error('Error updating order status:', error);
            throw error;
        }
    }

    /**
     * Update order details
     */
    async updateOrder(orderId: string, updates: Partial<AdminOrder>): Promise<boolean> {
        try {
            await this.updateOrderInDB(orderId, updates);
            return true;
        } catch (error) {
            console.error('Error updating order:', error);
            throw error;
        }
    }

    /**
     * Add note to order
     */
    async addOrderNote(orderId: string, note: string): Promise<boolean> {
        try {
            const order = await this.getOrderById(orderId);
            if (!order) return false;
            
            const notes = order.adminNotes || [];
            notes.push(`[${new Date().toISOString()}] ${note}`);
            
            await this.updateOrderInDB(orderId, { adminNotes: notes });
            return true;
        } catch (error) {
            console.error('Error adding note:', error);
            throw error;
        }
    }

    /**
     * Confirm order
     */
    async confirmOrder(orderId: string): Promise<boolean> {
        try {
            await this.updateOrderInDB(orderId, {
                status: 'confirmed',
                confirmedAt: new Date()
            });
            await this.addOrderNote(orderId, 'Order confirmed by admin');
            return true;
        } catch (error) {
            console.error('Error confirming order:', error);
            throw error;
        }
    }

    /**
     * Cancel order
     */
    async cancelOrder(orderId: string, reason?: string): Promise<boolean> {
        try {
            await this.updateOrderInDB(orderId, {
                status: 'cancelled'
            });
            const note = reason ? `Order cancelled: ${reason}` : 'Order cancelled by admin';
            await this.addOrderNote(orderId, note);
            return true;
        } catch (error) {
            console.error('Error cancelling order:', error);
            throw error;
        }
    }

    /**
     * Get pending orders
     */
    async getPendingOrders(): Promise<AdminOrder[]> {
        try {
            const result = await this.getOrders({ status: 'pending' }, 1, 100);
            return result.data;
        } catch (error) {
            console.error('Error fetching pending orders:', error);
            throw error;
        }
    }

    // ========================================
    // Private helper methods for DB operations
    // ========================================

    private async fetchOrdersFromDB(
        filters?: OrderFilter,
        limit: number = 50,
        offset: number = 0
    ): Promise<AdminOrder[]> {
        try {
            // Query database using businessDB methods
            // TODO: Implement real database query when schema is finalized
            // For now, return mock data for demo purposes
            const mockOrders: AdminOrder[] = this.generateMockOrders();
            
            // Apply filters to mock data
            let filtered = mockOrders;
            
            if (filters?.status) {
                filtered = filtered.filter(o => o.status === filters.status);
            }
            if (filters?.contentType) {
                filtered = filtered.filter(o => o.contentType === filters.contentType);
            }
            if (filters?.searchTerm) {
                const term = filters.searchTerm.toLowerCase();
                filtered = filtered.filter(o => 
                    o.customerName.toLowerCase().includes(term) ||
                    o.customerPhone.includes(term) ||
                    o.orderNumber.toLowerCase().includes(term)
                );
            }
            
            // Apply pagination
            return filtered.slice(offset, offset + limit);
        } catch (error) {
            console.error('Error in fetchOrdersFromDB:', error);
            return [];
        }
    }

    private async fetchOrderFromDB(orderId: string): Promise<AdminOrder | null> {
        try {
            // Query single order from database
            // TODO: Implement real database query when schema is finalized
            // For now, return mock order
            const mockOrders = this.generateMockOrders();
            return mockOrders.find(o => o.id === orderId) || null;
        } catch (error) {
            console.error('Error in fetchOrderFromDB:', error);
            return null;
        }
    }

    private async updateOrderInDB(orderId: string, updates: Partial<AdminOrder>): Promise<void> {
        try {
            // Update order in database using businessDB
            // TODO: Implement real database update when schema is finalized
            console.log(`Mock update order ${orderId}:`, updates);
            // await businessDB.updateOrder(orderId, updates);
        } catch (error) {
            console.error('Error in updateOrderInDB:', error);
            throw error;
        }
    }

    private async countOrders(filters?: OrderFilter): Promise<number> {
        try {
            // Count orders matching filters
            // TODO: Implement real database count when schema is finalized
            // For now, return mock count
            const mockOrders = this.generateMockOrders();
            
            let filtered = mockOrders;
            if (filters?.status) {
                filtered = filtered.filter(o => o.status === filters.status);
            }
            if (filters?.contentType) {
                filtered = filtered.filter(o => o.contentType === filters.contentType);
            }
            
            return filtered.length;
        } catch (error) {
            console.error('Error in countOrders:', error);
            return 0;
        }
    }
    
    private generateMockOrders(): AdminOrder[] {
        // Generate realistic mock orders for demo purposes
        const now = Date.now();
        
        return [
            {
                id: 'demo-1',
                orderNumber: 'ORD-2024-001',
                customerName: 'Juan Pérez',
                customerPhone: '+57 300 123 4567',
                status: 'pending',
                contentType: 'music',
                capacity: '32GB',
                customization: {
                    genres: ['Reggaeton', 'Salsa'],
                    artists: ['Feid', 'Karol G']
                },
                createdAt: new Date(now - 3600000), // 1 hour ago
                updatedAt: new Date(now - 3600000),
                notes: 'Cliente quiere música variada',
                adminNotes: [],
                price: 25000,
                processingProgress: 0
            },
            {
                id: 'demo-2',
                orderNumber: 'ORD-2024-002',
                customerName: 'María García',
                customerPhone: '+57 301 234 5678',
                status: 'processing',
                contentType: 'mixed',
                capacity: '64GB',
                customization: {
                    genres: ['Rock', 'Pop'],
                    movies: ['Avatar 2', 'Top Gun Maverick']
                },
                createdAt: new Date(now - 86400000), // 1 day ago
                updatedAt: new Date(now - 3600000),
                confirmedAt: new Date(now - 82800000),
                notes: 'Mezcla de música y películas',
                adminNotes: ['Pedido confirmado', 'Procesamiento iniciado'],
                price: 35000,
                processingProgress: 45
            },
            {
                id: 'demo-3',
                orderNumber: 'ORD-2024-003',
                customerName: 'Carlos Rodríguez',
                customerPhone: '+57 302 345 6789',
                status: 'completed',
                contentType: 'music',
                capacity: '32GB',
                customization: {
                    genres: ['Vallenato'],
                    artists: ['Diomedes Díaz', 'Jorge Celedón']
                },
                createdAt: new Date(now - 172800000), // 2 days ago
                updatedAt: new Date(now - 86400000),
                confirmedAt: new Date(now - 169200000),
                completedAt: new Date(now - 86400000),
                notes: 'Solo vallenato clásico',
                adminNotes: ['Pedido confirmado', 'USB preparada', 'Entregado'],
                price: 25000,
                processingProgress: 100
            },
            {
                id: 'demo-4',
                orderNumber: 'ORD-2024-004',
                customerName: 'Ana Martínez',
                customerPhone: '+57 303 456 7890',
                status: 'confirmed',
                contentType: 'videos',
                capacity: '128GB',
                customization: {
                    videos: ['Conciertos', 'Videoclips']
                },
                createdAt: new Date(now - 7200000), // 2 hours ago
                updatedAt: new Date(now - 3600000),
                confirmedAt: new Date(now - 3600000),
                notes: 'Videos de conciertos en vivo',
                adminNotes: ['Pedido confirmado'],
                price: 50000,
                processingProgress: 0
            },
            {
                id: 'demo-5',
                orderNumber: 'ORD-2024-005',
                customerName: 'Luis Gómez',
                customerPhone: '+57 304 567 8901',
                status: 'processing',
                contentType: 'movies',
                capacity: '64GB',
                customization: {
                    movies: ['Spider-Man: No Way Home', 'The Batman', 'Black Panther']
                },
                createdAt: new Date(now - 129600000), // 1.5 days ago
                updatedAt: new Date(now - 7200000),
                confirmedAt: new Date(now - 126000000),
                notes: 'Películas de superhéroes',
                adminNotes: ['Pedido confirmado', 'Copiando películas'],
                price: 35000,
                processingProgress: 67
            }
        ];
    }

    private mapDBOrderToAdmin(dbOrder: any): AdminOrder {
        // Map database order format to AdminOrder format
        return {
            id: dbOrder.id || dbOrder.orderId,
            orderNumber: dbOrder.orderNumber || dbOrder.order_number || dbOrder.id,
            customerPhone: dbOrder.customerPhone || dbOrder.phone,
            customerName: dbOrder.customerName || dbOrder.name || 'Unknown',
            status: this.normalizeStatus(dbOrder.status),
            contentType: dbOrder.contentType || dbOrder.content_type || 'mixed',
            capacity: dbOrder.capacity || '32GB',
            customization: this.parseCustomization(dbOrder.customization || dbOrder.preferences),
            createdAt: new Date(dbOrder.createdAt || dbOrder.created_at || Date.now()),
            updatedAt: new Date(dbOrder.updatedAt || dbOrder.updated_at || Date.now()),
            confirmedAt: dbOrder.confirmedAt ? new Date(dbOrder.confirmedAt) : undefined,
            completedAt: dbOrder.completedAt ? new Date(dbOrder.completedAt) : undefined,
            notes: dbOrder.notes,
            adminNotes: this.parseAdminNotes(dbOrder.adminNotes || dbOrder.admin_notes),
            price: dbOrder.price || dbOrder.total || 0,
            paymentMethod: dbOrder.paymentMethod || dbOrder.payment_method,
            processingProgress: dbOrder.processingProgress || 0,
            estimatedCompletion: dbOrder.estimatedCompletion ? new Date(dbOrder.estimatedCompletion) : undefined
        };
    }

    private normalizeStatus(status: any): OrderStatus {
        const statusMap: { [key: string]: OrderStatus } = {
            'pending': 'pending',
            'pendiente': 'pending',
            'confirmed': 'confirmed',
            'confirmado': 'confirmed',
            'processing': 'processing',
            'en_proceso': 'processing',
            'completed': 'completed',
            'completado': 'completed',
            'cancelled': 'cancelled',
            'cancelado': 'cancelled'
        };
        
        return statusMap[String(status).toLowerCase()] || 'pending';
    }

    private parseCustomization(customization: any): any {
        if (typeof customization === 'string') {
            try {
                return JSON.parse(customization);
            } catch {
                return {};
            }
        }
        return customization || {};
    }

    private parseAdminNotes(notes: any): string[] {
        if (Array.isArray(notes)) return notes;
        if (typeof notes === 'string') {
            try {
                return JSON.parse(notes);
            } catch {
                return notes ? [notes] : [];
            }
        }
        return [];
    }
}

// Singleton instance
export const orderService = new OrderService();
