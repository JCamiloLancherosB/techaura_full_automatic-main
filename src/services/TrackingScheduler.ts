import { ShipmentTrackingService } from './ShipmentTrackingService';

const trackingService = new ShipmentTrackingService();

let schedulerInterval: NodeJS.Timeout | null = null;
let initialTimeout: NodeJS.Timeout | null = null;

export function startTrackingScheduler(): void {
    // Update all active shipments every 2 hours
    schedulerInterval = setInterval(async () => {
        console.log('🔄 Starting scheduled tracking update...');
        try {
            await trackingService.updateAllActiveShipments();
            console.log('✅ Tracking update completed');
        } catch (error) {
            console.error('❌ Tracking update failed:', error);
        }
    }, 2 * 60 * 60 * 1000); // Every 2 hours
    
    // Run immediately on startup (after 30 seconds)
    initialTimeout = setTimeout(() => {
        trackingService.updateAllActiveShipments().catch(console.error);
    }, 30000);
}

export function stopTrackingScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('🛑 Tracking scheduler stopped');
    }
    if (initialTimeout) {
        clearTimeout(initialTimeout);
        initialTimeout = null;
    }
}
