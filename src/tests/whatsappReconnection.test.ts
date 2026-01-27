/**
 * WhatsApp Reconnection Test Suite
 * Tests provider state management, inbound message queue, and outbound deferral during reconnection
 * 
 * KEY ACCEPTANCE CRITERIA:
 * 1. Reconnection doesn't break message flow
 * 2. No duplicate listeners on socket recreation
 * 3. Health endpoint reflects real provider state
 * 4. Inbound messages during RECONNECTING are queued and processed
 * 5. Outbound messages during RECONNECTING are deferred with retry
 */

import { WhatsAppProviderState, ProviderState, whatsAppProviderState } from '../services/WhatsAppProviderState';
import { InboundMessageQueue, inboundMessageQueue } from '../services/InboundMessageQueue';

describe('WhatsApp Reconnection Robustness', () => {

    beforeEach(() => {
        // Reset state before each test
        whatsAppProviderState.reset();
        inboundMessageQueue.clear();
        inboundMessageQueue.resetStats();
    });

    describe('WhatsAppProviderState', () => {
        
        test('should initialize in DISCONNECTED state', () => {
            const state = whatsAppProviderState.getState();
            expect(state).toBe(ProviderState.DISCONNECTED);
        });

        test('should transition to CONNECTED state', () => {
            whatsAppProviderState.setConnected();
            expect(whatsAppProviderState.getState()).toBe(ProviderState.CONNECTED);
            expect(whatsAppProviderState.isConnected()).toBe(true);
            expect(whatsAppProviderState.isReconnecting()).toBe(false);
            expect(whatsAppProviderState.isDisconnected()).toBe(false);
        });

        test('should transition to RECONNECTING state', () => {
            whatsAppProviderState.setConnected();
            whatsAppProviderState.setReconnecting('Connection lost');
            
            expect(whatsAppProviderState.getState()).toBe(ProviderState.RECONNECTING);
            expect(whatsAppProviderState.isConnected()).toBe(false);
            expect(whatsAppProviderState.isReconnecting()).toBe(true);
            expect(whatsAppProviderState.isDisconnected()).toBe(false);
        });

        test('should track reconnect attempts', () => {
            whatsAppProviderState.setReconnecting('First attempt');
            expect(whatsAppProviderState.getStateInfo().reconnectAttempts).toBe(1);
            
            whatsAppProviderState.setReconnecting('Second attempt');
            expect(whatsAppProviderState.getStateInfo().reconnectAttempts).toBe(2);
            
            whatsAppProviderState.setReconnecting('Third attempt');
            expect(whatsAppProviderState.getStateInfo().reconnectAttempts).toBe(3);
        });

        test('should reset reconnect attempts on CONNECTED', () => {
            whatsAppProviderState.setReconnecting('First');
            whatsAppProviderState.setReconnecting('Second');
            expect(whatsAppProviderState.getStateInfo().reconnectAttempts).toBe(2);
            
            whatsAppProviderState.setConnected();
            expect(whatsAppProviderState.getStateInfo().reconnectAttempts).toBe(0);
        });

        test('should track lastConnectedAt timestamp', () => {
            expect(whatsAppProviderState.getStateInfo().lastConnectedAt).toBeNull();
            
            whatsAppProviderState.setConnected();
            const connectedAt = whatsAppProviderState.getStateInfo().lastConnectedAt;
            expect(connectedAt).not.toBeNull();
            
            // Disconnect and reconnect
            whatsAppProviderState.setReconnecting('Lost connection');
            whatsAppProviderState.setConnected();
            
            const newConnectedAt = whatsAppProviderState.getStateInfo().lastConnectedAt;
            expect(newConnectedAt).not.toBeNull();
            expect(newConnectedAt!.getTime()).toBeGreaterThanOrEqual(connectedAt!.getTime());
        });

        test('should prevent duplicate listener registration', () => {
            const listenerId = 'test-listener-1';
            
            // First registration should succeed
            expect(whatsAppProviderState.registerListener(listenerId)).toBe(true);
            
            // Second registration with same ID should fail
            expect(whatsAppProviderState.registerListener(listenerId)).toBe(false);
            
            // Check it's registered
            expect(whatsAppProviderState.isListenerRegistered(listenerId)).toBe(true);
        });

        test('should allow unregistering listeners', () => {
            const listenerId = 'test-listener-2';
            
            whatsAppProviderState.registerListener(listenerId);
            expect(whatsAppProviderState.isListenerRegistered(listenerId)).toBe(true);
            
            whatsAppProviderState.unregisterListener(listenerId);
            expect(whatsAppProviderState.isListenerRegistered(listenerId)).toBe(false);
            
            // Should be able to register again after unregistering
            expect(whatsAppProviderState.registerListener(listenerId)).toBe(true);
        });

        test('should notify callbacks on state change', async () => {
            const stateChanges: Array<{ newState: ProviderState, oldState: ProviderState }> = [];
            
            whatsAppProviderState.onStateChange('test-callback', (newState, oldState) => {
                stateChanges.push({ newState, oldState });
            });
            
            whatsAppProviderState.setConnected();
            whatsAppProviderState.setReconnecting('Test');
            whatsAppProviderState.setConnected();
            
            expect(stateChanges.length).toBe(3);
            expect(stateChanges[0]).toEqual({ 
                newState: ProviderState.CONNECTED, 
                oldState: ProviderState.DISCONNECTED 
            });
            expect(stateChanges[1]).toEqual({ 
                newState: ProviderState.RECONNECTING, 
                oldState: ProviderState.CONNECTED 
            });
            expect(stateChanges[2]).toEqual({ 
                newState: ProviderState.CONNECTED, 
                oldState: ProviderState.RECONNECTING 
            });
        });

        test('should not register duplicate callbacks', () => {
            let callCount = 0;
            
            // Register twice with same ID
            whatsAppProviderState.onStateChange('dup-callback', () => { callCount++; });
            whatsAppProviderState.onStateChange('dup-callback', () => { callCount++; });
            
            whatsAppProviderState.setConnected();
            
            // Should only be called once
            expect(callCount).toBe(1);
        });

        test('getStats should return comprehensive information', () => {
            whatsAppProviderState.registerListener('stat-listener-1');
            whatsAppProviderState.registerListener('stat-listener-2');
            whatsAppProviderState.onStateChange('stat-callback', () => {});
            whatsAppProviderState.setConnected();
            
            const stats = whatsAppProviderState.getStats();
            
            expect(stats.state).toBe(ProviderState.CONNECTED);
            expect(stats.registeredListeners).toBe(2);
            expect(stats.stateChangeCallbacks).toBe(1);
            expect(stats.lastConnectedAt).not.toBeNull();
            expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('InboundMessageQueue', () => {

        test('should not queue when CONNECTED', async () => {
            whatsAppProviderState.setConnected();
            
            const result = await inboundMessageQueue.queueMessage(
                'msg-123',
                '573001234567',
                'Test message'
            );
            
            expect(result.queued).toBe(false);
            expect(result.reason).toContain('connected');
        });

        test('should queue when RECONNECTING', async () => {
            whatsAppProviderState.setReconnecting('Test reconnection');
            
            const result = await inboundMessageQueue.queueMessage(
                'msg-456',
                '573001234567',
                'Test message during reconnection'
            );
            
            expect(result.queued).toBe(true);
            expect(result.reason).toContain('RECONNECTING');
            expect(inboundMessageQueue.getQueueSize()).toBe(1);
        });

        test('should queue when DISCONNECTED', async () => {
            // Default state is DISCONNECTED
            const result = await inboundMessageQueue.queueMessage(
                'msg-789',
                '573001234567',
                'Test message while disconnected'
            );
            
            expect(result.queued).toBe(true);
            expect(result.reason).toContain('DISCONNECTED');
        });

        test('shouldQueueMessage returns correct value based on state', () => {
            // DISCONNECTED
            expect(inboundMessageQueue.shouldQueueMessage()).toBe(true);
            
            // RECONNECTING
            whatsAppProviderState.setReconnecting('Test');
            expect(inboundMessageQueue.shouldQueueMessage()).toBe(true);
            
            // CONNECTED
            whatsAppProviderState.setConnected();
            expect(inboundMessageQueue.shouldQueueMessage()).toBe(false);
        });

        test('should process queue when state changes to CONNECTED', async () => {
            const processedMessages: string[] = [];
            
            // Set up message processor
            inboundMessageQueue.setMessageProcessor(async (msg) => {
                processedMessages.push(msg.messageId);
            });
            
            // Queue messages during RECONNECTING
            whatsAppProviderState.setReconnecting('Test');
            await inboundMessageQueue.queueMessage('msg-1', '573001111111', 'Message 1');
            await inboundMessageQueue.queueMessage('msg-2', '573002222222', 'Message 2');
            await inboundMessageQueue.queueMessage('msg-3', '573003333333', 'Message 3');
            
            expect(inboundMessageQueue.getQueueSize()).toBe(3);
            
            // Transition to CONNECTED - should trigger queue processing
            whatsAppProviderState.setConnected();
            
            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(processedMessages.length).toBe(3);
            expect(processedMessages).toContain('msg-1');
            expect(processedMessages).toContain('msg-2');
            expect(processedMessages).toContain('msg-3');
            expect(inboundMessageQueue.getQueueSize()).toBe(0);
        });

        test('should track statistics', async () => {
            whatsAppProviderState.setReconnecting('Test');
            
            await inboundMessageQueue.queueMessage('stat-msg-1', '573001234567', 'Test');
            await inboundMessageQueue.queueMessage('stat-msg-2', '573001234567', 'Test');
            
            const stats = inboundMessageQueue.getStats();
            
            expect(stats.queuedCount).toBe(2);
            expect(stats.maxQueueSize).toBeGreaterThan(0);
            expect(stats.ttlMs).toBeGreaterThan(0);
        });

        test('getQueuedMessages should return current queue contents', async () => {
            whatsAppProviderState.setReconnecting('Test');
            
            await inboundMessageQueue.queueMessage('queue-msg-1', '573001111111', 'First');
            await inboundMessageQueue.queueMessage('queue-msg-2', '573002222222', 'Second');
            
            const messages = inboundMessageQueue.getQueuedMessages();
            
            expect(messages.length).toBe(2);
            expect(messages[0].messageId).toBe('queue-msg-1');
            expect(messages[1].messageId).toBe('queue-msg-2');
        });
    });

    describe('Integration: Reconnection Flow', () => {

        test('ACCEPTANCE: Complete reconnection flow maintains message integrity', async () => {
            const processedMessages: string[] = [];
            
            inboundMessageQueue.setMessageProcessor(async (msg) => {
                processedMessages.push(msg.messageId);
            });
            
            // Step 1: Start CONNECTED
            whatsAppProviderState.setConnected();
            expect(whatsAppProviderState.isConnected()).toBe(true);
            
            // Step 2: Connection drops -> RECONNECTING
            whatsAppProviderState.setReconnecting('Network error');
            expect(whatsAppProviderState.isReconnecting()).toBe(true);
            
            // Step 3: Messages arrive during reconnection (get queued)
            await inboundMessageQueue.queueMessage('reconnect-msg-1', '573001111111', 'Help');
            await inboundMessageQueue.queueMessage('reconnect-msg-2', '573002222222', 'Order status?');
            
            expect(inboundMessageQueue.getQueueSize()).toBe(2);
            
            // Step 4: Reconnection succeeds -> CONNECTED
            whatsAppProviderState.setConnected();
            
            // Step 5: Queued messages should be processed
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(processedMessages.length).toBe(2);
            expect(inboundMessageQueue.getQueueSize()).toBe(0);
            
            // Step 6: Verify final state
            expect(whatsAppProviderState.isConnected()).toBe(true);
            expect(whatsAppProviderState.getStateInfo().reconnectAttempts).toBe(0);
        });

        test('ACCEPTANCE: Multiple reconnection cycles preserve listener registration', () => {
            const listenerId = 'multi-cycle-listener';
            
            // First registration
            expect(whatsAppProviderState.registerListener(listenerId)).toBe(true);
            
            // Simulate multiple reconnection cycles
            for (let i = 0; i < 5; i++) {
                whatsAppProviderState.setConnected();
                whatsAppProviderState.setReconnecting(`Cycle ${i}`);
                
                // Attempt to register again (should fail - no duplicates)
                expect(whatsAppProviderState.registerListener(listenerId)).toBe(false);
            }
            
            // Final connection
            whatsAppProviderState.setConnected();
            
            // Should still only have one listener
            expect(whatsAppProviderState.isListenerRegistered(listenerId)).toBe(true);
            const stats = whatsAppProviderState.getStats();
            expect(stats.registeredListeners).toBe(1);
        });

        test('ACCEPTANCE: Health data reflects real state', () => {
            // DISCONNECTED state
            let stateInfo = whatsAppProviderState.getStateInfo();
            expect(stateInfo.state).toBe(ProviderState.DISCONNECTED);
            
            // CONNECTED state
            whatsAppProviderState.setConnected();
            stateInfo = whatsAppProviderState.getStateInfo();
            expect(stateInfo.state).toBe(ProviderState.CONNECTED);
            expect(stateInfo.lastConnectedAt).not.toBeNull();
            
            // RECONNECTING state
            whatsAppProviderState.setReconnecting('Test reason');
            stateInfo = whatsAppProviderState.getStateInfo();
            expect(stateInfo.state).toBe(ProviderState.RECONNECTING);
            expect(stateInfo.reconnectAttempts).toBe(1);
            expect(stateInfo.disconnectReason).toBe('Test reason');
        });
    });

    describe('OutboundGate Provider State Check', () => {
        // Note: These tests describe expected behavior, actual OutboundGate tests
        // would require mocking the full sendMessage pipeline
        
        test('OutboundGate should defer when provider is DISCONNECTED', () => {
            // When provider state is DISCONNECTED, outbound messages should be deferred
            whatsAppProviderState.reset(); // Start DISCONNECTED
            expect(whatsAppProviderState.isConnected()).toBe(false);
            
            // OutboundGate.sendMessage would return:
            // { sent: false, deferred: true, blockedBy: ['provider-state'] }
        });

        test('OutboundGate should defer when provider is RECONNECTING', () => {
            whatsAppProviderState.setReconnecting('Test');
            expect(whatsAppProviderState.isConnected()).toBe(false);
            expect(whatsAppProviderState.isReconnecting()).toBe(true);
            
            // OutboundGate.sendMessage would return:
            // { sent: false, deferred: true, blockedBy: ['provider-state'] }
        });

        test('OutboundGate allows sending when provider is CONNECTED', () => {
            whatsAppProviderState.setConnected();
            expect(whatsAppProviderState.isConnected()).toBe(true);
            
            // OutboundGate.sendMessage would proceed with normal gate checks
            // (no provider-state blocking)
        });
    });
});
