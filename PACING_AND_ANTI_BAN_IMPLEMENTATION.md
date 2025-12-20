# Human-like Pacing and Anti-Ban Hardening Implementation

## Summary

This document describes the implementation of human-like pacing and anti-ban hardening features for the WhatsApp chatbot follow-up system. The changes ensure that the bot operates more naturally, respects user boundaries, and minimizes the risk of being flagged or banned by WhatsApp.

## Key Features Implemented

### 1. Work/Rest Scheduler (45 min work / 15 min rest)

**Location:** `src/flows/userTrackingSystem.ts`

A scheduler that alternates between 45-minute work periods and 15-minute rest periods to simulate human-like activity patterns.

**Functions:**
- `isInWorkPeriod()`: Checks if currently in work period (returns false during rest)
- `getTimeRemainingInCurrentPeriod()`: Returns minutes remaining in current period

**Implementation Details:**
- Scheduler state is tracked globally with `WORK_REST_SCHEDULER` object
- Automatically switches between work and rest periods
- All follow-up systems check this before sending messages
- Logs clear messages when entering/exiting rest periods

**Impact:**
- All follow-up sends (`sendFollowUpMessage`, `runAssuredFollowUps`, `sendIrresistibleOffer`, `processUnreadWhatsAppChats`) now skip during rest windows
- Reduces continuous messaging patterns that could trigger WhatsApp's anti-spam detection

### 2. Unified Send Window (08:00-22:00)

**Location:** `src/flows/userTrackingSystem.ts`, `src/app.ts`

Consolidated all hour checks into a single function to ensure consistent enforcement across the entire codebase.

**Functions:**
- `isWithinAllowedSendWindow(date)`: Returns true if hour is between 08:00-22:00
- Replaces all individual hour checks (`isHourAllowed`, `isWithinSendingWindow`)

**Changes:**
- **Before:** Multiple functions with different hour ranges (6-22, 8-22)
- **After:** Single unified function enforcing 08:00-22:00 consistently

**Impact:**
- Prevents messaging users during late night/early morning hours
- Consistent behavior across all follow-up systems
- Clear logging when messages are skipped due to time restrictions

### 3. Strengthened Per-User Recency Gating

**Location:** `src/flows/userTrackingSystem.ts` - `canSendFollowUpToUser()`

Increased minimum time requirements to avoid rapid re-contacts and respect user privacy.

**Changes:**

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Min silence since last interaction (with progress) | 30 min | 60 min | +100% |
| Min silence since last interaction (without progress) | 90 min | 120 min | +33% |
| Min silence since last user reply (with progress) | 30 min | 60 min | +100% |
| Min silence since last user reply (without progress) | 60 min | 120 min | +100% |
| Min hours since last follow-up (with progress) | 3 hours | 4 hours | +33% |
| Min hours since last follow-up (without progress) | 6 hours | 8 hours | +33% |

**Impact:**
- More conservative follow-up timing reduces perceived spam
- Users have more breathing room between bot messages
- Respects user activity patterns better

### 4. Rate Limiting and Human-like Jitter

**Location:** `src/flows/userTrackingSystem.ts`

Applied consistently before every message send across all follow-up systems.

**Components:**
1. **checkRateLimit()**: Enforces 8 messages/minute maximum
2. **randomDelay()**: Adds human-like jitter (2-15 seconds random delay)
3. **waitForFollowUpDelay()**: Adds baseline 3-second delay between messages

**Application Order (in sendFollowUpMessage):**
```typescript
1. isInWorkPeriod() - Check work/rest scheduler
2. isWithinAllowedSendWindow() - Check send window (08:00-22:00)
3. checkRateLimit() - Check rate limit (8/min)
4. randomDelay() - Add human jitter (2-15 sec)
5. waitForFollowUpDelay() - Add baseline delay (3 sec)
6. isWhatsAppChatActive() - Check if chat is active
7. canSendFollowUpToUser() - Check all recency rules
8. Send message
```

**Impact:**
- Messages appear more natural with variable timing
- Prevents burst sending patterns
- Respects WhatsApp's rate limits

### 5. Batch Cool-down in Follow-up Loops

**Location:** `src/flows/userTrackingSystem.ts` - `runAssuredFollowUps()`, `processUnreadWhatsAppChats()`

Added pauses after every N messages to prevent continuous sending patterns.

**Configuration:**
- **Batch size:** 5 messages
- **Cool-down duration:** 30 seconds (runAssuredFollowUps), 45 seconds (unread sweep)

**Implementation:**
```typescript
if (sent > 0 && sent % BATCH_SIZE === 0) {
  console.log(`⏸️ Batch cool-down: pausing ${BATCH_COOLDOWN_MS/1000}s after ${sent} messages...`);
  await new Promise(resolve => setTimeout(resolve, BATCH_COOLDOWN_MS));
}
```

**Impact:**
- Breaks up large follow-up batches into smaller chunks
- More human-like sending pattern (send a few, pause, send a few more)
- Reduces risk of triggering anti-spam detection

### 6. Comprehensive Logging

Added detailed logging for all skip conditions across all follow-up systems.

**Log Examples:**
```
😴 Skip: Rest period active. Reanudaremos en 12 minutos
⏰ Skip: Outside allowed send window (08:00-22:00). Current time: 23:15:30
⚠️ Skip: Rate limit reached (8 messages/minute)
🚫 Skip (chat active): +573001234567
🚫 Follow-up blocked for +573001234567: insufficient_silence: 45min < 60min
⏸️ Batch cool-down: pausing 30s after 5 messages...
```

**Impact:**
- Clear visibility into why messages are being skipped
- Easier debugging and monitoring
- Better understanding of system behavior

## Files Modified

1. **src/flows/userTrackingSystem.ts**
   - Added work/rest scheduler logic
   - Created `isWithinAllowedSendWindow()` function
   - Strengthened `canSendFollowUpToUser()` timing requirements
   - Updated `sendFollowUpMessage()` with all pacing checks
   - Updated `runAssuredFollowUps()` with scheduler, rate limiting, batch cool-down
   - Updated `sendIrresistibleOffer()` with unified pacing
   - Updated `processUnreadWhatsAppChats()` with scheduler, rate limiting, batch cool-down
   - Exported new pacing functions

2. **src/app.ts**
   - Imported new pacing functions from userTrackingSystem
   - Replaced `isWithinSendingWindow` with unified function
   - Updated follow-up cycle to check work/rest scheduler
   - Unified all hour checks to use consistent 08:00-22:00 window

## Testing

All pacing logic has been validated:
- ✅ Work/Rest scheduler correctly alternates between periods
- ✅ Unified send window correctly blocks outside 08:00-22:00
- ✅ Rate limiting correctly enforces 8 messages/minute
- ✅ Recency gating correctly enforces hardened timings
- ✅ All skip conditions properly logged

## Backward Compatibility

All changes maintain backward compatibility:
- Existing function signatures unchanged
- `isHourAllowed()` maintained as wrapper for unified function
- All existing logging and monitoring continues to work
- No changes to database schema or API endpoints
- Existing anti-ban constraints (JID formatting, etc.) preserved

## Configuration

Current configuration values can be adjusted if needed:

```typescript
// Work/Rest Scheduler
WORK_REST_SCHEDULER.workDurationMs = 45 * 60 * 1000;  // 45 minutes
WORK_REST_SCHEDULER.restDurationMs = 15 * 60 * 1000;  // 15 minutes

// Send Window
isWithinAllowedSendWindow: 8-22 hours

// Rate Limiting
ANTI_BAN_CONFIG.maxMessagesPerMinute = 8;
ANTI_BAN_CONFIG.minDelay = 2000;  // 2 seconds
ANTI_BAN_CONFIG.maxDelay = 15000;  // 15 seconds

// Batch Cool-down
BATCH_SIZE = 5 messages
BATCH_COOLDOWN_MS = 30000 (runAssuredFollowUps) / 45000 (unread sweep)

// Recency Gating (with/without progress)
Min silence since last interaction: 60/120 minutes
Min silence since last user reply: 60/120 minutes
Min hours since last follow-up: 4/8 hours
```

## Benefits

1. **Reduced Ban Risk**: More human-like patterns reduce WhatsApp's anti-spam triggers
2. **Better User Experience**: Users get breathing room between messages
3. **Consistent Behavior**: Unified checks ensure predictable system behavior
4. **Easy Monitoring**: Comprehensive logging makes it easy to see what's happening
5. **Maintainable**: Centralized pacing logic is easier to update and test

## Future Enhancements

Possible future improvements:
- Make scheduler parameters configurable via environment variables
- Add metrics tracking for skip reasons (dashboard visualization)
- Implement adaptive pacing based on user engagement patterns
- Add A/B testing for different timing strategies
- Create automated tests for pacing logic

## Conclusion

This implementation significantly strengthens the chatbot's anti-ban protection while improving the user experience. The changes follow a conservative, defensive approach that prioritizes system longevity over aggressive messaging.
