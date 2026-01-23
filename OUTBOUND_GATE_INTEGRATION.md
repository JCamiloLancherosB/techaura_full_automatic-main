# OutboundGate Integration Guide

## Overview

The **OutboundGate** is a unified gatekeeper service that enforces ALL message sending rules across the entire application. It ensures consistent application of anti-spam protections, rate limiting, and business rules.

## Why OutboundGate?

Before OutboundGate, message sending logic was scattered across multiple files:
- `antiBanDelays.ts` - Jitter/delay functions
- `flowGuard.ts` - Cooldown and order status checks
- `MessagePolicyEngine.ts` - Content validation
- `incomingMessageHandler.ts` - Contact status gating
- Individual flows - Time window checks

This fragmentation led to:
- ❌ Inconsistent rule application
- ❌ Duplicate code
- ❌ Risk of bypassing protections
- ❌ Difficult maintenance

With OutboundGate:
- ✅ Single source of truth for ALL sending rules
- ✅ Consistent protection across all modules
- ✅ Easy to maintain and audit
- ✅ Comprehensive statistics and monitoring

## Gate Protections

OutboundGate enforces 7 layers of protection:

### 1. No-Reach Gating
Blocks messages to users who cannot or should not receive them:
- Contact status = OPT_OUT
- Blacklist tag
- Contact status = CLOSED (with decision_made tag)

### 2. Order Status Guard
Prevents promotional messages when user has confirmed order:
- Blocks follow-ups and persuasive messages
- Allows order notifications
- Checks via `flowGuard.hasConfirmedOrActiveOrder()`

### 3. Cooldown Guard
Respects user cooldown periods:
- Checks `cooldownUntil` timestamp in session
- Blocks all messages until cooldown expires
- Automatically clears expired cooldowns

### 4. Recency Gating
Prevents spam based on timing:
- **Follow-ups**: Minimum 24 hours between automated follow-ups
- **User activity**: Minimum 1 hour gap for normal priority messages to recently active users
- **High priority**: Bypasses recency checks

### 5. Time Window
Enforces business hours (9 AM - 9 PM):
- Configurable start/end hours
- Can be bypassed for urgent notifications
- Based on server time

### 6. Rate Limiting
Multi-level rate limits:
- **Per-chat hourly**: Max 10 messages per hour per chat
- **Per-chat daily**: Max 30 messages per day per chat
- **Global hourly**: Max 100 messages per hour total
- **Global daily**: Max 500 messages per day total
- **Minimum interval**: 1 minute between messages to same chat

### 7. Content Validation
Validates message content via MessagePolicyEngine:
- No urgency language when order confirmed
- Message length limits (200 chars standard, 300 for catalogs)
- No excessive price repetition
- CTA appropriateness for stage
- Prohibited patterns

## Usage

### In Follow-Up Services

```typescript
import { outboundGate } from '../services/OutboundGate';

async function sendFollowUp(phone: string, message: string) {
  const result = await outboundGate.sendMessage(
    phone,
    message,
    {
      phone,
      messageType: 'followup',
      priority: 'normal'
    }
    // No flowDynamic - uses global.botInstance
  );
  
  if (result.sent) {
    console.log('✅ Message sent');
  } else {
    console.log(`❌ Blocked: ${result.reason}`);
  }
}
```

### In Notification Services

```typescript
import { outboundGate } from '../services/OutboundGate';

async function sendNotification(phone: string, message: string) {
  const result = await outboundGate.sendMessage(
    phone,
    message,
    {
      phone,
      messageType: 'notification',
      priority: 'high',
      bypassTimeWindow: true // Notifications can be sent anytime
    }
  );
  
  return result.sent;
}
```

### In BuilderBot Flows

Use the helper functions from `outboundGateHelpers.ts`:

```typescript
import { createGatedFlowDynamic, sendGatedMessage, sendGatedCatalog, sendGatedOrderMessage } from '../utils/outboundGateHelpers';

// Option 1: Wrap flowDynamic (recommended for multiple messages)
addFlow(
  addKeyword(['música', 'music'])
    .addAction(async (ctx, { flowDynamic }) => {
      const send = createGatedFlowDynamic(ctx, flowDynamic, 'catalog', 'awareness');
      
      await send(['¡Hola! ¿Qué género musical prefieres?']);
      await send(['Tenemos rock, pop, electrónica y más.']);
    })
);

// Option 2: Send individual messages
addFlow(
  addKeyword(['precio', 'cost'])
    .addAction(async (ctx, { flowDynamic }) => {
      const sent = await sendGatedCatalog(
        ctx, 
        flowDynamic, 
        '📋 Precios:\n32GB - $25,000\n64GB - $35,000',
        'pricing'
      );
      
      if (!sent) {
        console.warn('Pricing message was blocked by gate');
      }
    })
);

// Option 3: Order messages (high priority)
addFlow(
  addKeyword(['confirmar'])
    .addAction(async (ctx, { flowDynamic }) => {
      await sendGatedOrderMessage(
        ctx,
        flowDynamic,
        '✅ Tu pedido ha sido confirmado. Te enviaremos actualizaciones.',
        'order_confirmed'
      );
    })
);
```

## Context Configuration

The `OutboundContext` interface allows fine-grained control:

```typescript
interface OutboundContext {
  phone: string;
  messageType?: 'catalog' | 'persuasive' | 'order' | 'general' | 'followup' | 'notification';
  stage?: string;
  status?: string;
  flowName?: string;
  priority?: 'low' | 'normal' | 'high';
  bypassTimeWindow?: boolean;  // For urgent notifications
  bypassRateLimit?: boolean;   // For critical messages (use sparingly)
}
```

### Message Types

- **catalog**: Product catalogs, pricing tables (longer length allowed)
- **persuasive**: Sales/marketing messages
- **order**: Order confirmations, updates (high priority)
- **general**: Regular conversation messages
- **followup**: Automated follow-up messages (strict timing rules)
- **notification**: System notifications (can bypass time window)

### Priority Levels

- **low**: Normal timing, all gates enforced
- **normal**: Standard priority (default)
- **high**: Bypasses recency gating for recent activity

### Bypass Flags

Use sparingly - only for truly critical messages:

- **bypassTimeWindow**: Send outside business hours (e.g., urgent order updates)
- **bypassRateLimit**: Bypass rate limits (e.g., password reset)

## Monitoring & Statistics

Get gate statistics:

```typescript
const stats = outboundGate.getStats();
console.log({
  totalSent: stats.totalSent,
  totalBlocked: stats.totalBlocked,
  blockedByRateLimit: stats.blockedByRateLimit,
  blockedByTimeWindow: stats.blockedByTimeWindow,
  blockedByCooldown: stats.blockedByCooldown,
  blockedByRecency: stats.blockedByRecency,
  blockedByNoReach: stats.blockedByNoReach,
  blockedByOrderStatus: stats.blockedByOrderStatus,
  blockedByContent: stats.blockedByContent,
  perChatBuckets: stats.perChatBuckets,
  globalHourlyCount: stats.globalHourlyCount,
  globalDailyCount: stats.globalDailyCount
});
```

## Migration Checklist

To migrate existing code to use OutboundGate:

### ✅ Services (Completed)
- [x] `followUpService.ts` - Now uses `outboundGate.sendMessage()`
- [x] `NotificationService.ts` - Now uses `outboundGate.sendMessage()`

### 🔄 Flows (In Progress)
Update all flow files to use helper functions:
- [ ] `musicUsb.ts`
- [ ] `videosUsb.ts`
- [ ] `gamesUsb.ts`
- [ ] `moviesUsb.ts`
- [ ] `catalogFlow.ts`
- [ ] `promosFlow.ts`
- [ ] Other flow files

Example migration:
```typescript
// BEFORE
.addAction(async (ctx, { flowDynamic }) => {
  await humanDelay();
  await flowDynamic(['Mensaje']);
})

// AFTER
import { sendGatedMessage } from '../utils/outboundGateHelpers';

.addAction(async (ctx, { flowDynamic }) => {
  await sendGatedMessage(ctx, flowDynamic, 'Mensaje', 'general', 'awareness');
})
```

### 📋 Direct Bot Usage
Find and replace any direct usage of:
- `global.botInstance.sendMessage()` → Use `outboundGate.sendMessage()`
- `whatsappAPI.sendMessage()` → Use `outboundGate.sendMessage()`
- `client.sendMessage()` → Use `outboundGate.sendMessage()`

## Testing

Run the OutboundGate test suite:

```bash
npm test src/tests/OutboundGate.test.ts
```

Tests cover:
- Each gate independently
- Gate combinations
- Statistics tracking
- Bypass mechanisms
- Error handling

## Best Practices

1. **Always use OutboundGate** - Never bypass it unless absolutely necessary
2. **Choose correct message type** - Use appropriate messageType for better gating
3. **Use bypass flags sparingly** - Only for truly critical messages
4. **Monitor statistics** - Regularly check gate stats to detect issues
5. **Test thoroughly** - Ensure your messages aren't being blocked unexpectedly
6. **Log blocked messages** - Always log when messages are blocked for debugging

## Troubleshooting

### Message not being sent?

Check the SendResult:
```typescript
const result = await outboundGate.sendMessage(...);
console.log({
  sent: result.sent,
  reason: result.reason,
  blockedBy: result.blockedBy
});
```

Common reasons:
- User opted out (`no-reach`)
- User has active order (`order-status`)
- User in cooldown period (`cooldown`)
- Too soon since last message (`recency`)
- Outside business hours (`time-window`)
- Rate limit exceeded (`rate-limit`)
- Content policy violation (`content-policy`)

### High block rate?

1. Check statistics to identify which gate is blocking most
2. Review gate configurations (may need adjustment)
3. Verify message content passes policy validation
4. Check if bypass flags should be used for specific cases

### Need to adjust limits?

Edit `OutboundGate.ts` configuration constants:
- `PER_CHAT_LIMIT_PER_HOUR`
- `PER_CHAT_LIMIT_PER_DAY`
- `GLOBAL_LIMIT_PER_HOUR`
- `GLOBAL_LIMIT_PER_DAY`
- `ALLOWED_START_HOUR`
- `ALLOWED_END_HOUR`
- `MIN_INTERACTION_GAP_MS`
- `MIN_FOLLOWUP_GAP_MS`

## Summary

OutboundGate provides a **single, consistent, auditable** way to send messages with comprehensive anti-spam protection. All message sending in the application should go through this gate to ensure consistent rule application and prevent accidental spam.

For questions or issues, check the logs for detailed gate decision information.
