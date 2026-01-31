import axios from 'axios';
import { businessDB } from '../mysql-database';

interface TrackingEvent {
    date: Date;
    status: string;
    location: string;
    description: string;
}

interface TrackingInfo {
    trackingNumber: string;
    carrier: string;
    status: 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
    currentLocation?: string;
    estimatedDelivery?: Date;
    events: TrackingEvent[];
    lastUpdate: Date;
}

export class ShipmentTrackingService {
    
    // TODO: Replace with actual carrier API endpoints
    // Currently these are placeholder URLs pointing to carrier tracking web pages
    // Actual implementation should use proper API endpoints and authentication
    private carrierAPIs: Record<string, {
        trackUrl: string;
        parseResponse: (data: any) => TrackingInfo | null;
    }> = {
        'servientrega': {
            trackUrl: 'https://www.servientrega.com/wps/portal/rastreo/', // Placeholder - replace with API endpoint
            parseResponse: this.parseServientrega.bind(this)
        },
        'coordinadora': {
            trackUrl: 'https://www.coordinadora.com/portafolio-de-servicios/rastrear-guias/', // Placeholder - replace with API endpoint
            parseResponse: this.parseCoordinadora.bind(this)
        },
        'interrapidisimo': {
            trackUrl: 'https://www.interrapidisimo.com/rastreo/', // Placeholder - replace with API endpoint
            parseResponse: this.parseInterrapidisimo.bind(this)
        }
    };
    
    /**
     * Track a shipment by tracking number
     */
    async trackShipment(trackingNumber: string, carrier?: string): Promise<TrackingInfo | null> {
        // Try to get from cache first
        const cached = await this.getCachedTracking(trackingNumber);
        if (cached && this.isCacheValid(cached)) {
            return cached;
        }
        
        // Detect carrier if not provided
        if (!carrier) {
            carrier = this.detectCarrier(trackingNumber);
        }
        
        if (!carrier || !this.carrierAPIs[carrier]) {
            console.warn(`Unknown carrier for tracking: ${trackingNumber}`);
            return null;
        }
        
        try {
            const info = await this.fetchTrackingFromCarrier(trackingNumber, carrier);
            if (info) {
                await this.cacheTracking(info);
                await this.checkForStatusChange(trackingNumber, info);
            }
            return info;
        } catch (error) {
            console.error(`Error tracking ${trackingNumber}:`, error);
            return cached || null;
        }
    }
    
    /**
     * Update all active shipments
     */
    async updateAllActiveShipments(): Promise<void> {
        const activeShipments = await this.getActiveShipments();
        
        for (const shipment of activeShipments) {
            try {
                const info = await this.trackShipment(
                    shipment.tracking_number,
                    shipment.carrier
                );
                
                if (info && info.status === 'delivered') {
                    await this.markAsDelivered(shipment.order_number);
                }
                
                // Rate limiting
                await this.delay(1000);
            } catch (error) {
                console.error(`Error updating shipment ${shipment.tracking_number}:`, error);
            }
        }
    }
    
    /**
     * Get tracking updates for customer
     */
    async getTrackingForCustomer(phone: string): Promise<TrackingInfo[]> {
        const orders = await businessDB.pool.execute(`
            SELECT tracking_number, carrier, order_number
            FROM orders
            WHERE phone_number LIKE ? 
            AND tracking_number IS NOT NULL
            AND shipping_status != 'delivered'
            ORDER BY created_at DESC
            LIMIT 5
        `, [`%${phone.slice(-10)}%`]) as any;
        
        const results: TrackingInfo[] = [];
        
        for (const order of orders[0]) {
            const info = await this.trackShipment(order.tracking_number, order.carrier);
            if (info) {
                results.push(info);
            }
        }
        
        return results;
    }
    
    /**
     * Check for status changes and notify customer
     */
    private async checkForStatusChange(
        trackingNumber: string, 
        newInfo: TrackingInfo
    ): Promise<void> {
        const previousStatus = await this.getPreviousStatus(trackingNumber);
        
        if (previousStatus && previousStatus !== newInfo.status) {
            // Status changed - notify customer
            const order = await this.getOrderByTracking(trackingNumber);
            if (order) {
                await this.notifyCustomer(order.phone_number, newInfo);
            }
        }
        
        // Save current status
        await this.saveTrackingStatus(trackingNumber, newInfo.status);
    }
    
    /**
     * Send tracking update notification to customer
     */
    private async notifyCustomer(phone: string, info: TrackingInfo): Promise<void> {
        const whatsapp = (global as any).adapterProvider;
        if (!whatsapp) return;
        
        const statusMessages: Record<string, string> = {
            'in_transit': '🚚 Tu pedido está en camino',
            'out_for_delivery': '📦 Tu pedido salió para entrega hoy',
            'delivered': '✅ ¡Tu pedido fue entregado!',
            'exception': '⚠️ Hay una novedad con tu envío'
        };
        
        const message = `${statusMessages[info.status] || '📦 Actualización de envío'}

*Guía:* ${info.trackingNumber}
*Estado:* ${info.status}
${info.currentLocation ? `*Ubicación:* ${info.currentLocation}` : ''}
${info.estimatedDelivery ? `*Entrega estimada:* ${info.estimatedDelivery.toLocaleDateString('es-CO')}` : ''}

Escribe "rastrear" para ver el historial completo.`;
        
        try {
            await whatsapp.sendMessage(phone, message);
        } catch (error) {
            console.error('Error sending tracking notification:', error);
        }
    }
    
    private detectCarrier(trackingNumber: string): string | null {
        // Carrier detection based on tracking number format
        if (/^\d{11,12}$/.test(trackingNumber)) return 'servientrega';
        if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(trackingNumber)) return 'coordinadora';
        if (/^\d{10}$/.test(trackingNumber)) return 'interrapidisimo';
        return null;
    }
    
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Carrier-specific parsers (simplified - actual implementation would scrape or use APIs)
    // TODO: Implement actual carrier API integration
    // These methods should be replaced with real API calls to carrier systems
    private parseServientrega(data: any): TrackingInfo | null {
        // TODO: Implementation depends on Servientrega's response format
        // This should parse actual API response from Servientrega
        return null;
    }
    
    private parseCoordinadora(data: any): TrackingInfo | null {
        // TODO: Implementation depends on Coordinadora's response format
        // This should parse actual API response from Coordinadora
        return null;
    }
    
    private parseInterrapidisimo(data: any): TrackingInfo | null {
        // TODO: Implementation depends on InterRapidisimo's response format
        // This should parse actual API response from InterRapidisimo
        return null;
    }
    
    // Database helper methods
    private async getCachedTracking(trackingNumber: string): Promise<TrackingInfo | null> {
        try {
            const [rows] = await businessDB.pool.execute(`
                SELECT * FROM shipment_tracking 
                WHERE tracking_number = ?
            `, [trackingNumber]) as any;
            
            if (rows.length === 0) return null;
            
            const shipment = rows[0];
            const [events] = await businessDB.pool.execute(`
                SELECT * FROM tracking_events 
                WHERE tracking_number = ?
                ORDER BY event_date DESC
            `, [trackingNumber]) as any;
            
            return {
                trackingNumber: shipment.tracking_number,
                carrier: shipment.carrier,
                status: shipment.status,
                currentLocation: shipment.current_location,
                estimatedDelivery: shipment.estimated_delivery ? new Date(shipment.estimated_delivery) : undefined,
                events: events.map((e: any) => ({
                    date: new Date(e.event_date),
                    status: e.status,
                    location: e.location,
                    description: e.description
                })),
                lastUpdate: new Date(shipment.last_checked_at)
            };
        } catch (error) {
            console.error('Error getting cached tracking:', error);
            return null;
        }
    }
    
    private isCacheValid(info: TrackingInfo): boolean {
        // Cache is valid for 1 hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return info.lastUpdate > oneHourAgo;
    }
    
    private async cacheTracking(info: TrackingInfo): Promise<void> {
        try {
            await businessDB.pool.execute(`
                INSERT INTO shipment_tracking (
                    tracking_number, carrier, status, current_location, 
                    estimated_delivery, last_checked_at
                )
                VALUES (?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    current_location = VALUES(current_location),
                    estimated_delivery = VALUES(estimated_delivery),
                    last_checked_at = NOW()
            `, [
                info.trackingNumber,
                info.carrier,
                info.status,
                info.currentLocation || null,
                info.estimatedDelivery || null
            ]);
            
            // Save events
            for (const event of info.events) {
                await businessDB.pool.execute(`
                    INSERT IGNORE INTO tracking_events (
                        tracking_number, event_date, status, location, description
                    )
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    info.trackingNumber,
                    event.date,
                    event.status,
                    event.location,
                    event.description
                ]);
            }
        } catch (error) {
            console.error('Error caching tracking:', error);
        }
    }
    
    private async fetchTrackingFromCarrier(
        trackingNumber: string,
        carrier: string
    ): Promise<TrackingInfo | null> {
        // TODO: Implement actual carrier API integration
        // This is a placeholder that returns mock data for testing purposes.
        // In production, this should call the actual carrier APIs using the
        // trackUrl and parseResponse methods defined in carrierAPIs.
        // For now, return mock data to allow testing of the flow and database structure.
        
        console.warn(`⚠️ Using mock data for tracking ${trackingNumber} - implement actual carrier API`);
        
        return {
            trackingNumber,
            carrier,
            status: 'in_transit',
            currentLocation: 'Bogotá, Colombia',
            estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            events: [
                {
                    date: new Date(),
                    status: 'in_transit',
                    location: 'Bogotá, Colombia',
                    description: 'Paquete en tránsito'
                }
            ],
            lastUpdate: new Date()
        };
    }
    
    private async getActiveShipments(): Promise<any[]> {
        try {
            const [rows] = await businessDB.pool.execute(`
                SELECT tracking_number, carrier, order_number
                FROM shipment_tracking
                WHERE status IN ('pending', 'in_transit', 'out_for_delivery')
            `) as any;
            
            return rows;
        } catch (error) {
            console.error('Error getting active shipments:', error);
            return [];
        }
    }
    
    private async markAsDelivered(orderNumber: string | null): Promise<void> {
        if (!orderNumber) return;
        
        try {
            await businessDB.pool.execute(`
                UPDATE orders
                SET shipping_status = 'delivered'
                WHERE order_number = ?
            `, [orderNumber]);
        } catch (error) {
            console.error('Error marking order as delivered:', error);
        }
    }
    
    private async getPreviousStatus(trackingNumber: string): Promise<string | null> {
        try {
            const [rows] = await businessDB.pool.execute(`
                SELECT status FROM shipment_tracking
                WHERE tracking_number = ?
            `, [trackingNumber]) as any;
            
            return rows.length > 0 ? rows[0].status : null;
        } catch (error) {
            console.error('Error getting previous status:', error);
            return null;
        }
    }
    
    private async saveTrackingStatus(trackingNumber: string, status: string): Promise<void> {
        try {
            await businessDB.pool.execute(`
                UPDATE shipment_tracking
                SET status = ?
                WHERE tracking_number = ?
            `, [status, trackingNumber]);
        } catch (error) {
            console.error('Error saving tracking status:', error);
        }
    }
    
    private async getOrderByTracking(trackingNumber: string): Promise<any | null> {
        try {
            const [rows] = await businessDB.pool.execute(`
                SELECT order_number, phone_number
                FROM orders
                WHERE tracking_number = ?
            `, [trackingNumber]) as any;
            
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error getting order by tracking:', error);
            return null;
        }
    }
}
