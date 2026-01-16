/**
 * Socket.io Utility
 * Centralized helper for emitting Socket.io events safely
 */

/**
 * Emit a Socket.io event safely without throwing errors
 * @param eventName - Name of the event to emit
 * @param data - Data to send with the event
 */
export function emitSocketEvent(eventName: string, data: any): void {
    try {
        const io = (global as any).socketIO;
        if (io) {
            io.emit(eventName, data);
        }
    } catch (error) {
        console.error(`⚠️ Error emitiendo evento ${eventName}:`, error);
        // Don't fail the operation if Socket.io fails
    }
}

/**
 * Check if Socket.io is available and connected
 */
export function isSocketIOAvailable(): boolean {
    try {
        const io = (global as any).socketIO;
        return !!io;
    } catch {
        return false;
    }
}
