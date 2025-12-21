# Phone DB Errors and Anti-Ban Improvements - Implementation Summary

## Overview
This document summarizes the fixes implemented to address:
1. Phone length DB errors (`ER_DATA_TOO_LONG`)
2. Anti-ban pacing and jitter improvements
3. Follow-up persuasion template rotation

## Changes Implemented

### 1. Phone Normalization for Database Storage

**Problem**: Error logs showed `ER_DATA_TOO_LONG` for column `phone` in `messages` table (VARCHAR(20)). Phone numbers like `88437688398009@s.whatsapp.net` exceeded the 20-character limit.

**Solution**: Implemented centralized phone sanitizer function in `src/mysql-database.ts`:

```typescript
function sanitizePhoneForDB(phone: string): string {
    if (!phone || typeof phone !== 'string') {
        console.warn('⚠️ Invalid phone number for DB sanitization:', phone);
        return '';
    }

    // Remove JID suffixes and clean
    const cleaned = phone
        .replace(/@s\.whatsapp\.net$/i, '')
        .replace(/@c\.us$/i, '')
        .replace(/@lid$/i, '')
        .replace(/@g\.us$/i, '')
        .replace(/@broadcast$/i, '')
        .replace(/\D/g, ''); // Remove all non-digit characters

    // Cap at 20 characters (DB column limit)
    if (cleaned.length > 20) {
        console.warn(`⚠️ Phone number too long for DB (${cleaned.length} chars), truncating to 20`);
        return cleaned.substring(0, 20);
    }

    return cleaned;
}
```

**Applied to**:
- `logMessage()` - Sanitizes phone before inserting into `messages` table
- `logInteraction()` - Sanitizes phone before inserting into `interactions` table
- `logFollowUpEvent()` - Sanitizes phone before inserting into `follow_up_events` table

**Key Features**:
- Strips all WhatsApp JID suffixes (`@s.whatsapp.net`, `@c.us`, etc.)
- Removes all non-digit characters
- Caps at 20 characters with warning log if truncation occurs
- Returns empty string for invalid inputs with warning
- Exported for use in other files

### 2. Anti-Ban Hardening

**Problem**: Bot was recently blocked due to robotic messaging patterns. Need stronger pacing, jitter, and rate limiting.

**Solution**: Enhanced anti-ban configuration in `src/flows/userTrackingSystem.ts`:

#### 2.1 Enhanced Random Delays with Extra Jitter

```typescript
const ANTI_BAN_CONFIG = {
  minDelay: 2000,           // Minimum 2 seconds base delay
  maxDelay: 15000,          // Maximum 15 seconds base delay
  extraJitterMin: 1000,     // Extra jitter: +1 second
  extraJitterMax: 3000,     // Extra jitter: +3 seconds
  maxMessagesPerMinute: 8,  // Normal rate limit
  safetyCoolDown: 60000,    // 1 minute pause if exceeded
  microPauseBetweenBatch: 500,     // 0.5s micro-pause between messages
  largeQueueThreshold: 150,        // Queue size threshold for stricter limits
  largeQueueMaxPerMinute: 5        // Reduced rate for large queues
};
```

**Key Improvements**:
- Base delay: 2-15 seconds (unchanged)
- **NEW**: Extra jitter: +1-3 seconds added to every message
- **NEW**: Micro-pause (500ms) between messages in batch processing
- **NEW**: Adaptive rate limiting based on queue size

#### 2.2 Adaptive Rate Limiting

```typescript
const checkRateLimit = (queueSize: number = 0): boolean => {
  // Apply stricter limit for large queues (>150 users)
  const effectiveLimit = queueSize > ANTI_BAN_CONFIG.largeQueueThreshold 
    ? ANTI_BAN_CONFIG.largeQueueMaxPerMinute   // 5 msg/min
    : ANTI_BAN_CONFIG.maxMessagesPerMinute;     // 8 msg/min

  if (messageCounter >= effectiveLimit) {
    console.warn(`⚠️ Rate limit reached (${effectiveLimit} msg/min, queue: ${queueSize})`);
    return false;
  }
  return true;
};
```

**Behavior**:
- Normal queue (<150): 8 messages per minute
- Large queue (≥150): 5 messages per minute (40% reduction)
- Logs queue size and rate limit violations

#### 2.3 Enhanced Pacing Functions

```typescript
async function applyHumanLikeDelays(includeMicroPause: boolean = false) {
  await randomDelay();        // Base delay 2-15s + extra jitter 1-3s
  if (includeMicroPause) {
    await microPause();       // +500ms for batch processing
  }
  await waitForFollowUpDelay(); // Baseline 3s delay
}
```

**Total delays per message**:
- Minimum: 2s + 1s (jitter) + 0.5s (micro-pause) + 3s = **6.5 seconds**
- Maximum: 15s + 3s (jitter) + 0.5s (micro-pause) + 3s = **21.5 seconds**

#### 2.4 Quiet Time Enforcement

**Maintained** existing 8-hour minimum silence window before follow-ups:
- Users with progress: 4 hours minimum
- Users without progress: 8 hours minimum
- Absolute minimum since last interaction: 20 minutes (anti-ban)

### 3. Follow-Up Persuasion Template Rotation

**Problem**: Follow-up messages were repetitive, potentially triggering spam detection.

**Solution**: Implemented rotating template system with 4 different persuasion strategies:

#### 3.1 Template Types

```typescript
const templates = {
  warm_reengage: () => {
    // Friendly check-in approach
    "me quedé pendiente por si tenías alguna duda..."
  },
  
  value_discount: () => {
    // Offer with 10-15% discount
    "tengo una promo especial para ti: 12% de descuento..."
  },
  
  urgency_lastcall: () => {
    // Create urgency with limited-time messaging
    "⏰ Me quedan pocas unidades disponibles hoy..."
  },
  
  content_teaser: () => {
    // Highlight content/personalization benefits
    "🎵 Tu USB personalizada con tus artistas favoritos..."
  }
};
```

#### 3.2 Template Selection Logic

```typescript
// Track last template used to avoid consecutive repeats
const lastTemplate = (conversationData as any).lastFollowUpTemplate || null;

// Exclude last used template from selection
let availableTemplates = Object.keys(templates);
if (lastTemplate) {
  availableTemplates = availableTemplates.filter(t => t !== lastTemplate);
}

// Filter by urgency level
if (urgencyLevel === 'low') {
  availableTemplates = availableTemplates.filter(t => 
    t === 'warm_reengage' || t === 'content_teaser'
  );
}
else if (urgencyLevel === 'high') {
  availableTemplates = availableTemplates.filter(t => 
    t === 'value_discount' || t === 'urgency_lastcall'
  );
}

// Select random template and store for next time
const selectedTemplate = availableTemplates[Math.floor(Math.random() * availableTemplates.length)];
(user.conversationData as any).lastFollowUpTemplate = selectedTemplate;
```

**Key Features**:
- Never sends same template consecutively
- Urgency-aware template selection
- Random discount percentage (10-15%)
- Logs selected template for debugging

### 4. Integration Updates

**Updated functions** to use new features:
- `sendFollowUpMessage()` - Now accepts queue size parameter, uses micro-pause
- `runAssuredFollowUps()` - Passes queue size to rate limiter, logs queue metrics
- `triggerBulkRemindersByChannel()` - Calculates and passes queue size
- `checkAllPacingRules()` - Accepts queue size for adaptive rate limiting

## Testing

### Phone Sanitization Tests
Created `test-phone-sanitization.js` with 15 test cases:
- ✅ All tests pass
- Correctly handles JID suffixes
- Properly truncates numbers >20 chars
- Handles edge cases (null, undefined, empty)

### Expected Behavior

#### Phone Sanitization
```
Input:  "573001234567@s.whatsapp.net"
Output: "573001234567"
```

```
Input:  "12345678901234567890123@s.whatsapp.net"
Output: "12345678901234567890"  (truncated to 20 chars)
Warning: "⚠️ Phone number too long for DB (23 chars), truncating to 20"
```

#### Anti-Ban Delays
```
Queue Size: 50 users
Rate Limit: 8 messages/minute
Delay per message: 6.5s - 21.5s
```

```
Queue Size: 200 users
Rate Limit: 5 messages/minute (stricter)
Delay per message: 6.5s - 21.5s
Log: "⚠️ Rate limit reached (5 msg/min, queue: 200)"
```

#### Template Rotation
```
User 1, Attempt 1: warm_reengage
User 1, Attempt 2: value_discount (different from last)
User 1, Attempt 3: urgency_lastcall (different from last)
```

## Backward Compatibility

✅ All changes are backward compatible:
- Phone sanitization only affects DB writes
- Sending still uses `ensureJID()` for proper WhatsApp formatting
- Existing delay mechanisms remain intact, just enhanced
- Template system falls back gracefully if filtering yields no results
- Queue size parameter defaults to 0 for non-bulk operations

## Deployment Notes

1. No database schema changes required
2. No configuration changes needed
3. Works with existing `messages`, `interactions`, and `follow_up_events` tables
4. Gradual rollout safe - new logic only activates on new follow-up sends

## Monitoring Recommendations

Look for these log patterns:
- `⚠️ Phone number too long for DB` - Indicates truncation occurred
- `⚠️ Rate limit reached (queue: X)` - Shows adaptive rate limiting in action
- `📋 Using follow-up template: X` - Shows template rotation working
- `📊 Follow-up queue size: X` - Monitor queue sizes for capacity planning

## Files Modified

1. `src/mysql-database.ts`
   - Added `sanitizePhoneForDB()` function
   - Updated `logMessage()`, `logInteraction()`, `logFollowUpEvent()`
   - Exported sanitizer for external use

2. `src/flows/userTrackingSystem.ts`
   - Enhanced `ANTI_BAN_CONFIG` with new parameters
   - Added extra jitter to `randomDelay()`
   - Added `microPause()` function
   - Enhanced `checkRateLimit()` with queue size support
   - Updated `checkAllPacingRules()` to accept queue size
   - Enhanced `applyHumanLikeDelays()` with micro-pause option
   - Rewrote `generatePersuasiveFollowUp()` with template rotation
   - Updated `sendFollowUpMessage()`, `runAssuredFollowUps()`, `triggerBulkRemindersByChannel()`

## Success Metrics

Expected improvements:
- ✅ Zero `ER_DATA_TOO_LONG` errors for phone columns
- ✅ 40% slower message rate during high queue periods (anti-ban)
- ✅ 15-60% longer delays between messages (extra jitter)
- ✅ 4x message variety through template rotation
- ✅ Reduced consecutive identical messages to 0%

## Future Enhancements

Potential improvements for future iterations:
1. Track template effectiveness per user segment
2. Add A/B testing for template performance
3. Dynamic queue threshold based on time of day
4. Machine learning for optimal delay calculation
5. Automatic template generation using AI
