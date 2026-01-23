/**
 * Flow Integration Helper for OutboundGate
 * Provides wrapper functions to integrate OutboundGate with BuilderBot flows
 */

import { outboundGate, OutboundContext } from '../services/OutboundGate';

/**
 * Wrap flowDynamic to send messages through OutboundGate
 * Use this in flow actions to ensure all messages go through the gate
 * 
 * @param ctx - BuilderBot context (contains phone number)
 * @param flowDynamic - Original flowDynamic from BuilderBot
 * @param messageType - Type of message being sent
 * @param stage - Current flow stage
 * @returns Wrapped flowDynamic that sends through OutboundGate
 * 
 * @example
 * .addAction(async (ctx, { flowDynamic }) => {
 *   const send = createGatedFlowDynamic(ctx, flowDynamic, 'catalog', 'pricing');
 *   await send(['¿Te interesa esta oferta?']);
 * })
 */
export function createGatedFlowDynamic(
  ctx: any,
  flowDynamic: Function,
  messageType: OutboundContext['messageType'] = 'general',
  stage?: string
): (messages: any[]) => Promise<void> {
  const phone = ctx.from || ctx.phoneNumber || ctx.phone;
  
  return async (messages: any[]) => {
    // Combine all messages into one (BuilderBot sends them as array)
    const messageText = messages
      .map(msg => typeof msg === 'string' ? msg : msg.body || '')
      .filter(Boolean)
      .join('\n\n');
    
    if (!messageText) {
      console.warn('⚠️ GatedFlowDynamic: Empty message, skipping');
      return;
    }
    
    // Send through OutboundGate
    const result = await outboundGate.sendMessage(
      phone,
      messageText,
      {
        phone,
        messageType,
        stage,
        priority: 'normal'
      },
      flowDynamic // Pass original flowDynamic as sender
    );
    
    if (!result.sent) {
      console.warn(`⚠️ GatedFlowDynamic: Message blocked for ${phone}: ${result.reason}`);
      // Don't throw error - just log and continue flow
      // The user will simply not receive this specific message
    }
  };
}

/**
 * Send a single message through OutboundGate within a flow
 * Convenience function for sending one-off messages
 * 
 * @example
 * await sendGatedMessage(ctx, flowDynamic, '¿En qué puedo ayudarte?', 'general', 'awareness');
 */
export async function sendGatedMessage(
  ctx: any,
  flowDynamic: Function,
  message: string,
  messageType: OutboundContext['messageType'] = 'general',
  stage?: string
): Promise<boolean> {
  const phone = ctx.from || ctx.phoneNumber || ctx.phone;
  
  const result = await outboundGate.sendMessage(
    phone,
    message,
    {
      phone,
      messageType,
      stage,
      priority: 'normal'
    },
    flowDynamic
  );
  
  return result.sent;
}

/**
 * Send a catalog/pricing table through OutboundGate
 * Special handling for longer catalog messages
 * 
 * @example
 * await sendGatedCatalog(ctx, flowDynamic, pricingTableMessage, 'pricing');
 */
export async function sendGatedCatalog(
  ctx: any,
  flowDynamic: Function,
  catalogMessage: string,
  stage?: string
): Promise<boolean> {
  const phone = ctx.from || ctx.phoneNumber || ctx.phone;
  
  const result = await outboundGate.sendMessage(
    phone,
    catalogMessage,
    {
      phone,
      messageType: 'catalog',
      stage,
      priority: 'normal'
    },
    flowDynamic
  );
  
  return result.sent;
}

/**
 * Send an order-related message through OutboundGate
 * Order messages have higher priority and can bypass some restrictions
 * 
 * @example
 * await sendGatedOrderMessage(ctx, flowDynamic, 'Tu pedido está confirmado', 'order_confirmed');
 */
export async function sendGatedOrderMessage(
  ctx: any,
  flowDynamic: Function,
  message: string,
  stage?: string
): Promise<boolean> {
  const phone = ctx.from || ctx.phoneNumber || ctx.phone;
  
  const result = await outboundGate.sendMessage(
    phone,
    message,
    {
      phone,
      messageType: 'order',
      stage,
      priority: 'high',
      bypassTimeWindow: true // Order messages can be sent anytime
    },
    flowDynamic
  );
  
  return result.sent;
}

console.log('✅ OutboundGate Flow Integration Helpers loaded');
