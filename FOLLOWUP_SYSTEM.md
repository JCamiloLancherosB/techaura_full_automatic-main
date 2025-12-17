# Follow-Up System Documentation

## Overview

The WhatsApp Follow-Up System ensures that automated follow-up messages are sent responsibly, respecting user preferences and implementing daily limits to prevent spam.

## Follow-Up Policy

### Rate Limits
- **Maximum 1 follow-up message per user per 24 hours**
- The 24-hour window resets automatically after 24 hours from the last reset
- Users with significant progress may receive slightly more flexible timing, but still limited to 1 per day

### Contact Status

Users can have one of three contact statuses:

1. **ACTIVE** (default)
   - User can receive follow-up messages (subject to rate limits)
   - Normal engagement flow

2. **OPT_OUT**
   - User has requested to stop receiving messages
   - No follow-up messages will be sent
   - User can re-engage by sending any interested message

3. **CLOSED**
   - User has indicated they already completed their decision/purchase
   - No follow-up messages will be sent
   - Status can be reset if user shows new interest

## Supported Keywords

### Opt-Out Keywords (Status → OPT_OUT)

**Spanish:**
- no, no me interesa, no gracias, no quiero
- parar, detener, cancelar, eliminar, borrar
- ya no, no más, suficiente, basta
- deja de, no molestar, no contactar
- no enviar, no estoy interesado/a
- bloquear, dar de baja, desuscribir

**English:**
- stop, unsubscribe, opt out, opt-out
- not interested, no thanks
- remove, delete, cancel, quit
- leave me alone

### Completion Keywords (Status → CLOSED)

**Spanish:**
- ya elegí, ya decidí, ya escogí
- ya compré, ya lo hice, ya está
- ya lo tengo, ya lo conseguí
- ya pedí, ya ordené, ya realicé
- ya todo listo, todo listo

**English:**
- already chose, already decided
- already bought, already purchased
- already got it, already done
- all set, done already

### Confirmation Keywords (No immediate follow-ups)

**Spanish:**
- recibido, ok, okay, vale
- entendido, comprendo, sí recibí
- perfecto, excelente, gracias
- lo tengo, lo vi, lo leí

**English:**
- received, got it, understood
- roger, acknowledged, thanks

### Positive/Interest Keywords (Re-engagement)

**Spanish:**
- me interesa, quiero, deseo, necesito
- busco, quisiera, me gustaría
- cuánto cuesta, precio, costo
- más información, dime más
- continuar, seguir, adelante

**English:**
- interested, want, need, would like
- tell me more, how much, price
- continue, proceed

## Re-engagement Policy

### From OPT_OUT Status
If a user who previously opted out sends a message showing interest (matching positive/interest keywords), their status is automatically changed back to ACTIVE, allowing them to receive follow-ups again.

### From CLOSED Status
Similar to OPT_OUT, if a user marked as CLOSED shows renewed interest, their status can be changed back to ACTIVE.

### Manual Reset
Administrators can manually reset a user's status using the database:

```sql
UPDATE user_sessions 
SET contact_status = 'ACTIVE',
    follow_up_count_24h = 0,
    last_follow_up_reset_at = NOW()
WHERE phone = '573001234567';
```

## Database Schema

### New Columns in `user_sessions` Table

| Column | Type | Description |
|--------|------|-------------|
| `contact_status` | ENUM('ACTIVE','OPT_OUT','CLOSED') | Current contact status |
| `last_user_reply_at` | DATETIME | Timestamp of last user message |
| `last_user_reply_category` | ENUM('NEGATIVE','COMPLETED','CONFIRMATION','POSITIVE','NEUTRAL') | Category of last reply |
| `follow_up_count_24h` | INT | Number of follow-ups sent in last 24h |
| `last_follow_up_reset_at` | DATETIME | When the 24h counter was last reset |

## Technical Implementation

### Response Classification
The system uses keyword matching with normalization (accent removal, case-insensitive) to classify user responses into categories:

1. **NEGATIVE** - Opt-out intent
2. **COMPLETED** - Already decided/purchased
3. **CONFIRMATION** - Simple acknowledgment
4. **POSITIVE** - Shows interest
5. **NEUTRAL** - Default category

### Follow-Up Validation Flow

Before sending a follow-up, the system checks:

1. ✅ Contact status is ACTIVE (not OPT_OUT or CLOSED)
2. ✅ Daily limit not reached (< 1 in last 24h)
3. ✅ Not in WhatsApp active chat
4. ✅ User not already converted
5. ✅ Not in blocked stage (order_confirmed, processing, etc.)
6. ✅ At least 24h since last follow-up
7. ✅ Sufficient silence since last user reply (2+ hours)
8. ✅ Sufficient silence since last interaction (30-120 min depending on progress)

### Counter Management

The `follow_up_count_24h` counter:
- Increments each time a follow-up is successfully sent
- Automatically resets to 0 after 24 hours
- Checked before each follow-up attempt

## API Integration

### Process Incoming Message

```typescript
import { processIncomingMessage } from './services/incomingMessageHandler';

const result = await processIncomingMessage(phone, message, session);

if (result.statusChanged) {
  console.log(`Status changed to: ${result.newStatus}`);
}
```

### Check Follow-Up Eligibility

```typescript
import { canReceiveFollowUps, hasReachedDailyLimit } from './services/incomingMessageHandler';

const { can, reason } = canReceiveFollowUps(session);
if (!can) {
  console.log(`Cannot send follow-up: ${reason}`);
}

if (hasReachedDailyLimit(session)) {
  console.log('Daily limit reached');
}
```

### Classify Response

```typescript
import { classifyResponse } from './services/responseClassifier';

const classification = classifyResponse(message);
console.log(`Category: ${classification.category}`);
console.log(`Confidence: ${classification.confidence}`);
console.log(`Matched keywords: ${classification.matchedKeywords.join(', ')}`);
```

## Monitoring

### Check User Status

```sql
SELECT 
  phone,
  contact_status,
  last_user_reply_at,
  last_user_reply_category,
  follow_up_count_24h,
  last_follow_up_reset_at,
  last_follow_up
FROM user_sessions
WHERE phone = '573001234567';
```

### Find Opted-Out Users

```sql
SELECT phone, name, contact_status, last_user_reply_at
FROM user_sessions
WHERE contact_status = 'OPT_OUT'
ORDER BY last_user_reply_at DESC;
```

### Users Who Reached Daily Limit

```sql
SELECT phone, name, follow_up_count_24h, last_follow_up_reset_at
FROM user_sessions
WHERE follow_up_count_24h >= 1
  AND TIMESTAMPDIFF(HOUR, last_follow_up_reset_at, NOW()) < 24
ORDER BY last_follow_up_reset_at DESC;
```

## Testing

### Test Response Classification

```typescript
import { classifyResponse } from './services/responseClassifier';

// Should classify as NEGATIVE
console.log(classifyResponse('no me interesa, gracias'));

// Should classify as COMPLETED
console.log(classifyResponse('ya lo compré ayer'));

// Should classify as CONFIRMATION
console.log(classifyResponse('ok, recibido'));

// Should classify as POSITIVE
console.log(classifyResponse('cuánto cuesta el USB de 32GB?'));
```

### Test Follow-Up Limits

1. Send a follow-up to a user
2. Verify `follow_up_count_24h` incremented
3. Try to send another follow-up within 24h
4. Verify it's blocked with reason "daily_limit_reached"
5. Wait 24+ hours or manually reset the counter
6. Verify follow-up can be sent again

## Troubleshooting

### User Not Receiving Follow-Ups

Check the following:
1. Verify `contact_status` is ACTIVE
2. Check if daily limit reached
3. Verify user is not in blacklist tags
4. Check if user stage is in blocked stages
5. Verify sufficient time has passed since last follow-up

### User Wants to Opt Back In

If a user who opted out wants to receive messages again:
1. They can send any message showing interest (will auto-reactivate)
2. Or manually update in database:
   ```sql
   UPDATE user_sessions SET contact_status = 'ACTIVE' WHERE phone = '573001234567';
   ```

### Reset All Follow-Up Counters

To reset all counters (use with caution):
```sql
UPDATE user_sessions 
SET follow_up_count_24h = 0,
    last_follow_up_reset_at = NOW();
```

## Best Practices

1. **Always respect opt-outs** - Never override OPT_OUT status without user re-engagement
2. **Monitor classification accuracy** - Review logs to ensure keywords are matching correctly
3. **Add new keywords carefully** - Test keywords before adding to avoid false positives
4. **Keep limits conservative** - Better to under-communicate than spam
5. **Log all status changes** - Keep audit trail of status changes for compliance
6. **Regular monitoring** - Check for users stuck in OPT_OUT who might want to re-engage

## Compliance

This system helps ensure compliance with:
- Anti-spam regulations
- WhatsApp Business Policy
- User consent and privacy requirements
- GDPR "right to be forgotten" (via opt-out)

## Future Enhancements

Potential improvements:
- AI-powered response classification for better accuracy
- Multi-language support beyond Spanish/English
- Graduated follow-up cadence (1 day, 3 days, 7 days)
- A/B testing different follow-up messages
- User preference center (frequency, topics, etc.)
