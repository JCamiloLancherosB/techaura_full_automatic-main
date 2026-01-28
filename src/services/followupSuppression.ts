/**
 * FollowUp Suppression Service
 * 
 * Provides a unified, database-backed way to determine if follow-ups should be
 * suppressed for a user. This is the single source of truth for follow-up blocking
 * based on shipping confirmation, order status, and conversation stage.
 * 
 * Suppression reasons:
 * - SHIPPING_CONFIRMED: User has confirmed shipping data (name, address)
 * - ORDER_COMPLETED: Order is in confirmed/processing/completed state
 * - STAGE_DONE: Conversation reached DONE/PAYMENT stage
 */

import { orderRepository } from '../repositories/OrderRepository';
import { customerRepository } from '../repositories/CustomerRepository';
import { getUserSession } from '../flows/userTrackingSystem';
import { hashPhone } from '../utils/phoneHasher';
import { structuredLogger } from '../utils/structuredLogger';
import { chatbotEventService } from './ChatbotEventService';
import { ConversationStage } from '../types/ConversationStage';
import { followUpQueue } from '../flows/userTrackingSystem';
import { stageBasedFollowUpService } from './StageBasedFollowUpService';

/**
 * Suppression reason codes
 */
export enum SuppressionReason {
    /** Order status is confirmed, processing, completed, or shipped */
    ORDER_COMPLETED = 'ORDER_COMPLETED',
    /** Shipping data (name and address) has been confirmed */
    SHIPPING_CONFIRMED = 'SHIPPING_CONFIRMED',
    /** Conversation stage is DONE or PAYMENT (terminal stage) */
    STAGE_DONE = 'STAGE_DONE',
    /** User opted out of follow-ups */
    OPT_OUT = 'OPT_OUT',
    /** Not suppressed - can receive follow-ups */
    NOT_SUPPRESSED = 'NOT_SUPPRESSED'
}

/**
 * Evidence supporting the suppression decision
 */
export interface SuppressionEvidence {
    /** Order ID if suppression is order-related */
    orderId?: string;
    /** Order status that caused suppression */
    orderStatus?: string;
    /** Whether shipping name was found */
    hasShippingName?: boolean;
    /** Whether shipping address was found */
    hasShippingAddress?: boolean;
    /** Current conversation stage */
    conversationStage?: string;
    /** Source of the suppression data */
    source?: 'order' | 'customer' | 'session' | 'stage';
    /** Timestamp when the suppression-causing event occurred */
    confirmedAt?: Date;
}

/**
 * Result of suppression check
 */
export interface SuppressionResult {
    /** Whether follow-ups should be suppressed */
    suppressed: boolean;
    /** Reason for suppression (or NOT_SUPPRESSED) */
    reason: SuppressionReason;
    /** Evidence supporting the decision */
    evidence: SuppressionEvidence;
    /** Phone hash for logging */
    phoneHash: string;
}

// Note: Status and stage comparisons are done case-insensitively via helper functions
// isConfirmedStatus() and isTerminalStage() defined below

/**
 * Check if follow-ups should be suppressed for a given phone number
 * This is the main entry point for suppression checks
 * 
 * Priority order:
 * 1. Order status (highest priority - DB truth)
 * 2. Shipping fields in order/customer records
 * 3. Conversation stage
 * 
 * @param phoneOrHash - Phone number or phone hash (if only hash is available, skip DB checks)
 * @param context - Optional context for decision making
 * @returns SuppressionResult with suppression status, reason, and evidence
 */
export async function isFollowUpSuppressed(
    phoneOrHash: string,
    context?: { forceDbCheck?: boolean; skipSessionCheck?: boolean }
): Promise<SuppressionResult> {
    // Detect if input is a phone hash (16 chars hex) vs actual phone number
    const isHashOnly = phoneOrHash.length === 16 && /^[a-f0-9]+$/i.test(phoneOrHash);
    const phoneHash = isHashOnly ? phoneOrHash : hashPhone(phoneOrHash);
    const phone = isHashOnly ? '' : phoneOrHash; // If only hash provided, we can't query DB by phone
    
    try {
        structuredLogger.debug('followup', 'Checking suppression status', { phoneHash, hasPhone: !!phone });
        
        // Skip DB checks if we only have a hash (can't query by phone number)
        if (phone) {
            // Priority 1: Check order status in database (most reliable source of truth)
            const orderSuppression = await checkOrderSuppression(phone, phoneHash);
            if (orderSuppression.suppressed) {
                structuredLogger.info('followup', 'Suppressed by order status', {
                    phoneHash,
                    reason: orderSuppression.reason,
                    orderId: orderSuppression.evidence.orderId
                });
                return orderSuppression;
            }
            
            // Priority 2: Check shipping fields in database
            const shippingSuppression = await checkShippingFieldsSuppression(phone, phoneHash);
            if (shippingSuppression.suppressed) {
                structuredLogger.info('followup', 'Suppressed by shipping data', {
                    phoneHash,
                    reason: shippingSuppression.reason,
                    hasName: shippingSuppression.evidence.hasShippingName,
                    hasAddress: shippingSuppression.evidence.hasShippingAddress
                });
                return shippingSuppression;
            }
        }
        
        // Priority 3: Check conversation stage (if not skipped)
        if (!context?.skipSessionCheck && phone) {
            const stageSuppression = await checkStageSuppression(phone, phoneHash);
            if (stageSuppression.suppressed) {
                structuredLogger.info('followup', 'Suppressed by stage', {
                    phoneHash,
                    reason: stageSuppression.reason,
                    stage: stageSuppression.evidence.conversationStage
                });
                return stageSuppression;
            }
        }
        
        // Not suppressed
        return {
            suppressed: false,
            reason: SuppressionReason.NOT_SUPPRESSED,
            evidence: {},
            phoneHash
        };
        
    } catch (error) {
        structuredLogger.error('followup', 'Error checking suppression', {
            phoneHash,
            error: error instanceof Error ? error.message : String(error)
        });
        
        // Fail-safe: Don't suppress on error (allow follow-up)
        return {
            suppressed: false,
            reason: SuppressionReason.NOT_SUPPRESSED,
            evidence: { source: 'session' },
            phoneHash
        };
    }
}

/**
 * Helper function for case-insensitive status comparison
 */
function isConfirmedStatus(status: string | undefined | null): boolean {
    if (!status) return false;
    const normalizedStatus = status.toLowerCase();
    return ['confirmed', 'processing', 'ready', 'shipped', 'delivered', 'completed', 'paid'].includes(normalizedStatus);
}

/**
 * Helper function for case-insensitive stage comparison
 */
function isTerminalStage(stage: string | undefined | null): boolean {
    if (!stage) return false;
    const normalizedStage = stage.toLowerCase();
    return ['done', 'payment', 'order_confirmed', 'converted'].includes(normalizedStage);
}

/**
 * Check if suppression should apply based on order status
 */
async function checkOrderSuppression(phone: string, phoneHash: string): Promise<SuppressionResult> {
    try {
        // Get orders by phone number
        const orders = await orderRepository.findByPhoneNumber(phone);
        
        for (const order of orders) {
            // Check processing_status field (primary status field in schema)
            const status = order.processing_status || order.status;
            
            if (isConfirmedStatus(status)) {
                return {
                    suppressed: true,
                    reason: SuppressionReason.ORDER_COMPLETED,
                    evidence: {
                        orderId: order.id || order.order_number,
                        orderStatus: status,
                        source: 'order',
                        confirmedAt: order.updated_at || order.created_at
                    },
                    phoneHash
                };
            }
        }
        
        // Also check order_confirmations table
        const confirmations = await orderRepository.getCustomerOrderConfirmations(phone);
        
        for (const conf of confirmations) {
            const status = conf.status;
            if (isConfirmedStatus(status)) {
                return {
                    suppressed: true,
                    reason: SuppressionReason.ORDER_COMPLETED,
                    evidence: {
                        orderId: conf.order_id,
                        orderStatus: status,
                        source: 'order',
                        confirmedAt: conf.confirmed_at || conf.created_at
                    },
                    phoneHash
                };
            }
        }
        
    } catch (error) {
        structuredLogger.warn('followup', 'Error checking order suppression', {
            phoneHash,
            error: error instanceof Error ? error.message : String(error)
        });
    }
    
    return {
        suppressed: false,
        reason: SuppressionReason.NOT_SUPPRESSED,
        evidence: {},
        phoneHash
    };
}

/**
 * Check if suppression should apply based on shipping fields
 */
async function checkShippingFieldsSuppression(phone: string, phoneHash: string): Promise<SuppressionResult> {
    try {
        // Check orders for shipping data
        const orders = await orderRepository.findByPhoneNumber(phone, true); // true = decrypt for checking
        
        for (const order of orders) {
            // Check if shipping_json contains name and address
            if (order.shipping_json) {
                try {
                    const shipping = typeof order.shipping_json === 'string' 
                        ? JSON.parse(order.shipping_json) 
                        : order.shipping_json;
                    
                    const hasName = !!(shipping.name && shipping.name.trim());
                    const hasAddress = !!(shipping.address && shipping.address.trim());
                    
                    if (hasName && hasAddress) {
                        return {
                            suppressed: true,
                            reason: SuppressionReason.SHIPPING_CONFIRMED,
                            evidence: {
                                orderId: order.id || order.order_number,
                                hasShippingName: true,
                                hasShippingAddress: true,
                                source: 'order',
                                confirmedAt: order.updated_at
                            },
                            phoneHash
                        };
                    }
                } catch (parseError) {
                    // Ignore parsing errors
                }
            }
            
            // Also check customer_name field in order (direct field)
            if (order.customer_name && order.customer_name.trim()) {
                // Check for any address-related fields directly (not string search)
                const orderAny = order as any;
                let hasAddress = !!(orderAny.shipping_address || orderAny.address);
                
                // If no direct address field, try parsing shipping_json
                if (!hasAddress && order.shipping_json) {
                    try {
                        const shipping = typeof order.shipping_json === 'string' 
                            ? JSON.parse(order.shipping_json) 
                            : order.shipping_json;
                        hasAddress = !!(shipping.address && shipping.address.trim());
                    } catch {
                        // Ignore parse errors
                    }
                }
                
                if (hasAddress) {
                    return {
                        suppressed: true,
                        reason: SuppressionReason.SHIPPING_CONFIRMED,
                        evidence: {
                            orderId: order.id || order.order_number,
                            hasShippingName: true,
                            hasShippingAddress: hasAddress,
                            source: 'order',
                            confirmedAt: order.updated_at
                        },
                        phoneHash
                    };
                }
            }
        }
        
        // Check customer record
        const customer = await customerRepository.findByPhone(phone);
        if (customer) {
            const hasName = !!(customer.name && customer.name.trim());
            const hasAddress = !!(customer.address && customer.address.trim());
            
            if (hasName && hasAddress) {
                return {
                    suppressed: true,
                    reason: SuppressionReason.SHIPPING_CONFIRMED,
                    evidence: {
                        hasShippingName: true,
                        hasShippingAddress: true,
                        source: 'customer',
                        confirmedAt: customer.updated_at
                    },
                    phoneHash
                };
            }
        }
        
    } catch (error) {
        structuredLogger.warn('followup', 'Error checking shipping fields suppression', {
            phoneHash,
            error: error instanceof Error ? error.message : String(error)
        });
    }
    
    return {
        suppressed: false,
        reason: SuppressionReason.NOT_SUPPRESSED,
        evidence: {},
        phoneHash
    };
}

/**
 * Check if suppression should apply based on conversation stage
 */
async function checkStageSuppression(phone: string, phoneHash: string): Promise<SuppressionResult> {
    try {
        const session = await getUserSession(phone);
        
        if (!session) {
            return {
                suppressed: false,
                reason: SuppressionReason.NOT_SUPPRESSED,
                evidence: {},
                phoneHash
            };
        }
        
        // Check contact status for opt-out
        if (session.contactStatus === 'OPT_OUT') {
            return {
                suppressed: true,
                reason: SuppressionReason.OPT_OUT,
                evidence: {
                    source: 'session'
                },
                phoneHash
            };
        }
        
        // Check stage using case-insensitive helper
        const stage = session.stage;
        if (isTerminalStage(stage)) {
            return {
                suppressed: true,
                reason: SuppressionReason.STAGE_DONE,
                evidence: {
                    conversationStage: stage,
                    source: 'session'
                },
                phoneHash
            };
        }
        
        // Check order data in session for confirmed status
        const orderData = session.orderData;
        if (orderData) {
            const status = orderData.status;
            if (isConfirmedStatus(status)) {
                return {
                    suppressed: true,
                    reason: SuppressionReason.ORDER_COMPLETED,
                    evidence: {
                        orderId: orderData.orderNumber || orderData.id,
                        orderStatus: status,
                        source: 'session'
                    },
                    phoneHash
                };
            }
        }
        
        // Check conversation data for confirmed stage
        const convData = session.conversationData as any;
        if (convData) {
            // Check for shipping data in conversation
            const customerData = convData.customerData;
            if (customerData) {
                const hasName = !!(
                    customerData.nombre || 
                    customerData.customerName || 
                    customerData.name
                );
                const hasAddress = !!(
                    customerData.direccion || 
                    customerData.address
                );
                
                // Also check for payment method as additional confirmation
                const hasPayment = !!(customerData.metodoPago || customerData.paymentMethod);
                
                // Only suppress if both name AND address are confirmed
                if (hasName && hasAddress) {
                    return {
                        suppressed: true,
                        reason: SuppressionReason.SHIPPING_CONFIRMED,
                        evidence: {
                            hasShippingName: true,
                            hasShippingAddress: true,
                            source: 'session'
                        },
                        phoneHash
                    };
                }
            }
        }
        
    } catch (error) {
        structuredLogger.warn('followup', 'Error checking stage suppression', {
            phoneHash,
            error: error instanceof Error ? error.message : String(error)
        });
    }
    
    return {
        suppressed: false,
        reason: SuppressionReason.NOT_SUPPRESSED,
        evidence: {},
        phoneHash
    };
}

/**
 * Cancel all pending follow-ups for a phone number
 * Clears both legacy followUpQueue and StageBasedFollowUpService
 * 
 * @param phone - Phone number
 * @param reason - Reason for cancellation (for logging/events)
 * @returns Number of follow-ups cancelled
 */
export async function cancelAllPendingFollowUps(
    phone: string, 
    reason: SuppressionReason = SuppressionReason.SHIPPING_CONFIRMED
): Promise<number> {
    const phoneHash = hashPhone(phone);
    let cancelledCount = 0;
    
    try {
        structuredLogger.info('followup', 'Cancelling all pending follow-ups', {
            phoneHash,
            reason
        });
        
        // 1. Cancel in legacy followUpQueue (in-memory Map)
        const normalizedPhone = phone.replace(/\D/g, '');
        
        if (followUpQueue.has(normalizedPhone)) {
            const timeoutId = followUpQueue.get(normalizedPhone);
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            followUpQueue.delete(normalizedPhone);
            cancelledCount++;
            structuredLogger.debug('followup', 'Cancelled legacy queue follow-up', { phoneHash });
        }
        
        // Also try with original phone format
        if (followUpQueue.has(phone)) {
            const timeoutId = followUpQueue.get(phone);
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            followUpQueue.delete(phone);
            cancelledCount++;
        }
        
        // 2. Cancel in StageBasedFollowUpService
        const stageCancelled = await stageBasedFollowUpService.cancelPendingFollowUps(phone);
        cancelledCount += stageCancelled;
        
        if (stageCancelled > 0) {
            structuredLogger.debug('followup', 'Cancelled stage-based follow-ups', { 
                phoneHash, 
                count: stageCancelled 
            });
        }
        
        // 3. Cancel in global FollowUpQueueManager (if available)
        if ((global as any).followUpQueueManager) {
            const queueManager = (global as any).followUpQueueManager;
            if (typeof queueManager.remove === 'function') {
                queueManager.remove(phone);
                queueManager.remove(normalizedPhone);
                cancelledCount++; // Count as one cancellation
                structuredLogger.debug('followup', 'Removed from global queue manager', { phoneHash });
            }
        }
        
        // 4. Track cancellation event
        if (cancelledCount > 0) {
            const conversationId = `conv_${phoneHash}_${Date.now()}`;
            await chatbotEventService.trackFollowupCancelled(
                conversationId,
                phone,
                `Suppressed: ${reason}`,
                {
                    cancelledCount,
                    suppressionReason: reason
                }
            );
        }
        
        structuredLogger.info('followup', 'Follow-up cancellation complete', {
            phoneHash,
            cancelledCount,
            reason
        });
        
    } catch (error) {
        structuredLogger.error('followup', 'Error cancelling follow-ups', {
            phoneHash,
            error: error instanceof Error ? error.message : String(error)
        });
    }
    
    return cancelledCount;
}

/**
 * Mark conversation as complete and cancel all follow-ups
 * Call this when shipping data is confirmed
 * 
 * @param phone - Phone number
 * @param context - Optional context about the confirmation
 */
export async function onShippingConfirmed(
    phone: string,
    context?: { orderId?: string; source?: string }
): Promise<void> {
    const phoneHash = hashPhone(phone);
    
    structuredLogger.info('followup', 'Shipping confirmed - suppressing follow-ups', {
        phoneHash,
        orderId: context?.orderId,
        source: context?.source
    });
    
    // Cancel all pending follow-ups
    await cancelAllPendingFollowUps(phone, SuppressionReason.SHIPPING_CONFIRMED);
    
    // Mark conversation as complete in StageBasedFollowUpService
    await stageBasedFollowUpService.markComplete(phone);
    
    // Track the suppression event
    const conversationId = `conv_${phoneHash}_${Date.now()}`;
    await chatbotEventService.trackEvent(
        conversationId,
        phone,
        'FOLLOWUP_SUPPRESSED',
        {
            reason: SuppressionReason.SHIPPING_CONFIRMED,
            orderId: context?.orderId,
            source: context?.source || 'shipping_confirmation'
        },
        context?.orderId
    );
}

/**
 * Get suppression status for admin endpoint
 * Returns redacted information suitable for debugging
 * 
 * @param phone - Phone number
 * @returns Suppression status with redacted evidence
 */
export async function getSuppressionStatus(phone: string): Promise<{
    phoneHash: string;
    suppressed: boolean;
    reason: string;
    evidence: {
        orderIdRedacted?: string;
        orderStatus?: string;
        hasShippingName?: boolean;
        hasShippingAddress?: boolean;
        conversationStage?: string;
        source?: string;
        confirmedAt?: string;
    };
    checkedAt: string;
}> {
    const result = await isFollowUpSuppressed(phone);
    
    return {
        phoneHash: result.phoneHash,
        suppressed: result.suppressed,
        reason: result.reason,
        evidence: {
            // Redact order ID to last 4 chars for privacy
            orderIdRedacted: result.evidence.orderId 
                ? `***${result.evidence.orderId.slice(-4)}` 
                : undefined,
            orderStatus: result.evidence.orderStatus,
            hasShippingName: result.evidence.hasShippingName,
            hasShippingAddress: result.evidence.hasShippingAddress,
            conversationStage: result.evidence.conversationStage,
            source: result.evidence.source,
            confirmedAt: result.evidence.confirmedAt?.toISOString()
        },
        checkedAt: new Date().toISOString()
    };
}

structuredLogger.info('followup', 'FollowUp Suppression Service loaded');
