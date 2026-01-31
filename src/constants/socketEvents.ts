/**
 * Socket.io Event Type Constants
 * Centralized definitions for all Socket.io event types to ensure consistency
 */

/**
 * Order-related Socket.io events
 */
export const ORDER_EVENTS = {
    /** Emitted when a new order is created (for internal processing/notifications) */
    ORDER_CREATED: 'orderCreated',
    /** Emitted when an order is updated (for admin panel real-time updates) */
    ORDER_UPDATE: 'orderUpdate',
    /** Emitted when processing starts */
    PROCESSING_STARTED: 'processingStarted',
    /** Emitted when an order is completed */
    ORDER_COMPLETED: 'orderCompleted',
    /** Emitted when an order encounters an error */
    ORDER_ERROR: 'orderError',
    /** Emitted for processing updates */
    PROCESSING_UPDATE: 'processingUpdate'
} as const;

/**
 * Event type classifications for orderUpdate events
 * Used in the eventType field of order update payloads
 */
export const ORDER_EVENT_TYPES = {
    /** A new order was created */
    ORDER_CREATED: 'order_created',
    /** Order status was changed */
    STATUS_CHANGED: 'status_changed',
    /** Order was confirmed by admin */
    ORDER_CONFIRMED: 'order_confirmed',
    /** Order was cancelled */
    ORDER_CANCELLED: 'order_cancelled'
} as const;

/**
 * Type definitions for event names and types
 */
export type OrderEventName = typeof ORDER_EVENTS[keyof typeof ORDER_EVENTS];
export type OrderEventType = typeof ORDER_EVENT_TYPES[keyof typeof ORDER_EVENT_TYPES];
