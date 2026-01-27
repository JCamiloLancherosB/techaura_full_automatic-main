/**
 * WhatsApp Provider State Manager
 * Tracks connection state: CONNECTED | RECONNECTING | DISCONNECTED
 * 
 * Features:
 * - Centralized provider state management
 * - Prevents duplicate listener registration
 * - Emits state change events
 * - Exposes state for health checks and gating decisions
 */

export enum ProviderState {
    CONNECTED = 'CONNECTED',
    RECONNECTING = 'RECONNECTING',
    DISCONNECTED = 'DISCONNECTED'
}

export interface ProviderStateInfo {
    state: ProviderState;
    lastStateChange: Date;
    lastConnectedAt: Date | null;
    reconnectAttempts: number;
    disconnectReason?: string;
}

type StateChangeCallback = (newState: ProviderState, oldState: ProviderState) => void;

/**
 * WhatsApp Provider State Manager
 * Singleton that tracks and manages WhatsApp connection state
 */
export class WhatsAppProviderState {
    private static instance: WhatsAppProviderState;

    private currentState: ProviderState = ProviderState.DISCONNECTED;
    private lastStateChange: Date = new Date();
    private lastConnectedAt: Date | null = null;
    private reconnectAttempts: number = 0;
    private disconnectReason?: string;

    // Callbacks for state changes
    private stateChangeCallbacks: Map<string, StateChangeCallback> = new Map();

    // Track registered listeners to prevent duplicates
    private registeredListeners: Set<string> = new Set();

    private constructor() {
        console.log('✅ WhatsAppProviderState initialized (DISCONNECTED)');
    }

    static getInstance(): WhatsAppProviderState {
        if (!WhatsAppProviderState.instance) {
            WhatsAppProviderState.instance = new WhatsAppProviderState();
        }
        return WhatsAppProviderState.instance;
    }

    /**
     * Get current provider state
     */
    getState(): ProviderState {
        return this.currentState;
    }

    /**
     * Get full state information
     */
    getStateInfo(): ProviderStateInfo {
        return {
            state: this.currentState,
            lastStateChange: this.lastStateChange,
            lastConnectedAt: this.lastConnectedAt,
            reconnectAttempts: this.reconnectAttempts,
            disconnectReason: this.disconnectReason
        };
    }

    /**
     * Check if provider is connected and ready to send/receive
     */
    isConnected(): boolean {
        return this.currentState === ProviderState.CONNECTED;
    }

    /**
     * Check if provider is reconnecting
     */
    isReconnecting(): boolean {
        return this.currentState === ProviderState.RECONNECTING;
    }

    /**
     * Check if provider is disconnected
     */
    isDisconnected(): boolean {
        return this.currentState === ProviderState.DISCONNECTED;
    }

    /**
     * Transition to CONNECTED state
     * Called when WhatsApp connection is established
     */
    setConnected(): void {
        const oldState = this.currentState;
        if (oldState === ProviderState.CONNECTED) {
            return; // Already connected
        }

        this.currentState = ProviderState.CONNECTED;
        this.lastStateChange = new Date();
        this.lastConnectedAt = new Date();
        this.reconnectAttempts = 0;
        this.disconnectReason = undefined;

        console.log(`📱 WhatsAppProviderState: ${oldState} → CONNECTED`);
        this.notifyStateChange(ProviderState.CONNECTED, oldState);
    }

    /**
     * Transition to RECONNECTING state
     * Called when connection is lost but reconnection is in progress
     */
    setReconnecting(reason?: string): void {
        const oldState = this.currentState;
        if (oldState === ProviderState.RECONNECTING) {
            // Already reconnecting - just increment attempts
            this.reconnectAttempts++;
            console.log(`🔄 WhatsAppProviderState: Reconnect attempt ${this.reconnectAttempts}`);
            return;
        }

        this.currentState = ProviderState.RECONNECTING;
        this.lastStateChange = new Date();
        this.reconnectAttempts = 1;
        this.disconnectReason = reason;

        console.log(`🔄 WhatsAppProviderState: ${oldState} → RECONNECTING (${reason || 'unknown'})`);
        this.notifyStateChange(ProviderState.RECONNECTING, oldState);
    }

    /**
     * Transition to DISCONNECTED state
     * Called when connection is lost and no reconnection is happening
     */
    setDisconnected(reason?: string): void {
        const oldState = this.currentState;
        if (oldState === ProviderState.DISCONNECTED) {
            return; // Already disconnected
        }

        this.currentState = ProviderState.DISCONNECTED;
        this.lastStateChange = new Date();
        this.disconnectReason = reason;

        console.log(`❌ WhatsAppProviderState: ${oldState} → DISCONNECTED (${reason || 'unknown'})`);
        this.notifyStateChange(ProviderState.DISCONNECTED, oldState);
    }

    /**
     * Register a callback for state changes
     * @param id - Unique identifier for the callback (prevents duplicates)
     * @param callback - Function to call when state changes
     * @returns true if registered, false if already registered with this id
     */
    onStateChange(id: string, callback: StateChangeCallback): boolean {
        if (this.stateChangeCallbacks.has(id)) {
            console.log(`⚠️ WhatsAppProviderState: Callback '${id}' already registered, skipping duplicate`);
            return false;
        }

        this.stateChangeCallbacks.set(id, callback);
        console.log(`📝 WhatsAppProviderState: Registered state change callback '${id}'`);
        return true;
    }

    /**
     * Remove a state change callback
     */
    removeStateChangeCallback(id: string): boolean {
        return this.stateChangeCallbacks.delete(id);
    }

    /**
     * Check if a listener has been registered (to prevent duplicates)
     * @param listenerId - Unique identifier for the listener
     */
    isListenerRegistered(listenerId: string): boolean {
        return this.registeredListeners.has(listenerId);
    }

    /**
     * Mark a listener as registered
     * @param listenerId - Unique identifier for the listener
     * @returns true if newly registered, false if already registered
     */
    registerListener(listenerId: string): boolean {
        if (this.registeredListeners.has(listenerId)) {
            console.log(`⚠️ WhatsAppProviderState: Listener '${listenerId}' already registered, skipping duplicate`);
            return false;
        }

        this.registeredListeners.add(listenerId);
        console.log(`📝 WhatsAppProviderState: Registered listener '${listenerId}'`);
        return true;
    }

    /**
     * Unregister a listener
     */
    unregisterListener(listenerId: string): boolean {
        return this.registeredListeners.delete(listenerId);
    }

    /**
     * Clear all registered listeners (for testing or complete reset)
     */
    clearAllListeners(): void {
        this.registeredListeners.clear();
        console.log('🧹 WhatsAppProviderState: Cleared all registered listeners');
    }

    /**
     * Get statistics about the provider state
     */
    getStats(): {
        state: ProviderState;
        lastStateChange: string;
        lastConnectedAt: string | null;
        reconnectAttempts: number;
        disconnectReason?: string;
        registeredListeners: number;
        stateChangeCallbacks: number;
        uptimeMs: number | null;
    } {
        const uptimeMs = this.lastConnectedAt && this.currentState === ProviderState.CONNECTED
            ? Date.now() - this.lastConnectedAt.getTime()
            : null;

        return {
            state: this.currentState,
            lastStateChange: this.lastStateChange.toISOString(),
            lastConnectedAt: this.lastConnectedAt?.toISOString() || null,
            reconnectAttempts: this.reconnectAttempts,
            disconnectReason: this.disconnectReason,
            registeredListeners: this.registeredListeners.size,
            stateChangeCallbacks: this.stateChangeCallbacks.size,
            uptimeMs
        };
    }

    /**
     * Notify all callbacks of a state change
     */
    private notifyStateChange(newState: ProviderState, oldState: ProviderState): void {
        for (const [id, callback] of this.stateChangeCallbacks) {
            try {
                callback(newState, oldState);
            } catch (error) {
                console.error(`❌ WhatsAppProviderState: Error in callback '${id}':`, error);
            }
        }
    }

    /**
     * Reset state (for testing)
     */
    reset(): void {
        this.currentState = ProviderState.DISCONNECTED;
        this.lastStateChange = new Date();
        this.lastConnectedAt = null;
        this.reconnectAttempts = 0;
        this.disconnectReason = undefined;
        this.stateChangeCallbacks.clear();
        this.registeredListeners.clear();
        console.log('🔄 WhatsAppProviderState: Reset to initial state');
    }
}

// Export singleton instance
export const whatsAppProviderState = WhatsAppProviderState.getInstance();

console.log('✅ WhatsAppProviderState module loaded');
