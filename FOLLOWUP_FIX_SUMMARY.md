# Follow-up Saturation Fix - Implementation Summary

## Problem Statement

The bot's follow-up system was saturated with `followUpQueue at 502/500 (100%)`, causing repeated blocks with messages like `max_followups_reached (4/4, 5/4)` for many users. This saturation made the bot appear mute as no messages could be sent.

## Root Causes Identified

1. **No per-user counter limits**: Users could receive unlimited follow-ups without reply
2. **No cooldown mechanism**: No recovery period after multiple attempts
3. **Poor queue hygiene**: Blocked users remained in queue indefinitely
4. **No backpressure**: System continued accepting items even when queue was full
5. **Phone number inconsistencies**: Varied formats caused duplicate entries

## Solution Implemented

### 1. Per-User Follow-up Counters

**Database Schema Changes** (`src/database/migrations/add-followup-columns.ts`):
- Added `follow_up_attempts` INT column (tracks attempts without user reply)
- Added `last_follow_up_attempt_reset_at` DATETIME column (tracks when attempts were reset)
- Added `cooldown_until` DATETIME column (tracks 2-day cooldown end time)
- Added indexes for query performance

**Logic Implementation** (`src/services/incomingMessageHandler.ts`):
```typescript
// Max 3 follow-up attempts without user reply
export function hasReachedMaxAttempts(session: UserSession): boolean {
  return (session.followUpAttempts || 0) >= 3;
}

// After 3 attempts: 2-day cooldown + mark as not_interested
export async function incrementFollowUpAttempts(session: UserSession) {
  const newAttempts = (session.followUpAttempts || 0) + 1;
  
  if (newAttempts >= 3) {
    const cooldownEnd = new Date(Date.now() + 48 * 60 * 60 * 1000);
    // Set 2-day cooldown and mark as not_interested/do_not_disturb
  }
}

// Reset attempts when user responds
export async function resetFollowUpAttempts(session: UserSession) {
  // Clear attempts counter on any user message
}
```

### 2. Cooldown Management

**Check Active Cooldown** (`src/services/incomingMessageHandler.ts`):
```typescript
export function isInCooldown(session: UserSession): { inCooldown: boolean; remainingHours?: number } {
  if (!session.cooldownUntil) return { inCooldown: false };
  
  const now = new Date();
  const cooldownEnd = new Date(session.cooldownUntil);
  
  if (now < cooldownEnd) {
    const remainingHours = (cooldownEnd.getTime() - now.getTime()) / (60 * 60 * 1000);
    return { inCooldown: true, remainingHours };
  }
  
  return { inCooldown: false };
}
```

**Clear Expired Cooldowns**:
```typescript
export async function clearCooldownIfExpired(session: UserSession) {
  const cooldownCheck = isInCooldown(session);
  
  if (!cooldownCheck.inCooldown && session.cooldownUntil) {
    // Clear cooldown, reset attempts, reactivate user
  }
}
```

### 3. Queue Hygiene & Backpressure

**Enhanced Queue Cleanup** (`src/app.ts`):
```typescript
setInterval(() => {
  // Remove users from queue if:
  // - No session exists
  // - Converted or blacklisted
  // - Max attempts reached (3)
  // - In active cooldown
  // - Marked as not_interested/do_not_disturb
  // - Cannot receive follow-ups (OPT_OUT, CLOSED)
  
  // Log removal reason for each user
}, 15 * 60 * 1000);
```

**Backpressure Logic** (`src/app.ts`):
```typescript
class FollowUpQueueManager {
  private readonly BACKPRESSURE_THRESHOLD = 200;
  private readonly MIN_BACKPRESSURE_MULTIPLIER = 0.2;
  private readonly MAX_BACKPRESSURE_MULTIPLIER = 0.4;
  
  add(phone: string, urgency: 'high' | 'medium' | 'low', delayMs: number) {
    // If queue > 200, only accept high priority
    if (this.queue.size > this.BACKPRESSURE_THRESHOLD && urgency !== 'high') {
      console.log('⏸️ Backpressure: skipping non-priority');
      return false;
    }
    
    // If queue > 200, add 20-40% extra delay to slow dispatch
    if (this.queue.size > this.BACKPRESSURE_THRESHOLD) {
      const extraDelayMultiplier = this.MIN_BACKPRESSURE_MULTIPLIER + 
        Math.random() * (this.MAX_BACKPRESSURE_MULTIPLIER - this.MIN_BACKPRESSURE_MULTIPLIER);
      adjustedDelayMs = delayMs * (1 + extraDelayMultiplier);
    }
  }
}
```

### 4. User Re-engagement

**Clear Queue on User Response** (`src/services/incomingMessageHandler.ts`):
```typescript
export async function processIncomingMessage(phone: string, message: string, session: UserSession) {
  // Clear expired cooldowns automatically
  await clearCooldownIfExpired(session);
  
  // Clear follow-up queue entries when user responds
  if (global.followUpQueueManager) {
    global.followUpQueueManager.remove(phone);
  }
  
  // Reset attempts when user responds
  updates.followUpAttempts = 0;
  updates.lastFollowUpAttemptResetAt = new Date();
}
```

### 5. Enhanced Validation

**Cooldown Checks in Follow-up Logic** (`src/flows/userTrackingSystem.ts`):
```typescript
export function canSendFollowUpToUser(session: UserSession): { ok: boolean; reason?: string } {
  // 1. Check contact status (canReceiveFollowUps includes cooldown check)
  const contactCheck = canReceiveFollowUps(session);
  if (!contactCheck.can) {
    return { ok: false, reason: contactCheck.reason };
  }
  
  // 2. Check if in active cooldown period
  const cooldownCheck = isInCooldown(session);
  if (cooldownCheck.inCooldown) {
    return { ok: false, reason: `cooldown_active_${cooldownCheck.remainingHours}h` };
  }
  
  // 3. Check if max attempts reached
  if (hasReachedMaxAttempts(session)) {
    return { ok: false, reason: 'max_attempts_reached_3' };
  }
  
  // ... other checks (daily limit, active chat, stage, etc.)
}
```

### 6. Phone Sanitization

**Already Implemented** (`src/mysql-database.ts`):
```typescript
function sanitizePhoneForDB(phone: string): string {
  // Remove JID suffixes (@s.whatsapp.net, @c.us, etc.)
  const cleaned = phone
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, ''); // Remove all non-digit characters
  
  // Cap at 20 characters (DB column limit)
  if (cleaned.length > 20) {
    return cleaned.substring(0, 20);
  }
  
  return cleaned;
}
```

This function is already used for all DB inserts/updates of phone numbers.

## Testing

Created comprehensive test suite (`test-followup-logic.ts`) that validates:
- ✅ Users with 0, 2, 3 attempts (blocked at 3)
- ✅ Active cooldown detection (48h, 12h remaining)
- ✅ Expired cooldown detection
- ✅ All tests pass using real implementation

## Code Quality

- **Code Review**: 3 issues identified and fixed
  - Fixed null handling for cooldownUntil clearing
  - Extracted magic numbers as named constants
  - Updated test to import real functions
- **Security Scan**: 0 security alerts (CodeQL)

## Impact & Benefits

### Before:
- Queue at 502/500 (100% saturation)
- Users receiving 4-5+ follow-ups without reply
- Bot appeared mute due to queue blocking
- No cooldown or recovery mechanism

### After:
- Max 3 follow-up attempts per user
- 2-day cooldown after 3 attempts
- Queue auto-cleans blocked users every 15 min
- Backpressure prevents queue overflow (threshold: 200)
- Users can re-engage after cooldown expires
- Clear logging of all skip/drop reasons

## Configuration

Key thresholds (can be adjusted):
- `MAX_ATTEMPTS`: 3 follow-ups without reply
- `COOLDOWN_PERIOD`: 48 hours (2 days)
- `BACKPRESSURE_THRESHOLD`: 200 items in queue
- `BACKPRESSURE_DELAY`: 20-40% extra delay when over threshold
- `MAX_QUEUE_SIZE`: 5000 items

## Files Modified

1. `src/database/migrations/add-followup-columns.ts` - Added DB columns
2. `src/services/incomingMessageHandler.ts` - Counter and cooldown logic
3. `src/flows/userTrackingSystem.ts` - Validation checks
4. `src/app.ts` - Queue hygiene and backpressure
5. `src/mysql-database.ts` - DB field mapping and updates
6. `types/global.d.ts` - TypeScript interfaces

## Migration Required

Run database migration to add new columns:
```sql
ALTER TABLE user_sessions ADD COLUMN follow_up_attempts INT DEFAULT 0;
ALTER TABLE user_sessions ADD COLUMN last_follow_up_attempt_reset_at DATETIME NULL;
ALTER TABLE user_sessions ADD COLUMN cooldown_until DATETIME NULL;
CREATE INDEX idx_cooldown_until ON user_sessions(cooldown_until);
CREATE INDEX idx_follow_up_attempts ON user_sessions(follow_up_attempts);
```

The migration is in `src/database/migrations/add-followup-columns.ts` and runs automatically via `businessDB.initialize()`.

## Monitoring

Key metrics to monitor:
- Queue size and utilization percentage
- Follow-up attempts per user
- Cooldown activations per day
- Backpressure activations
- Queue cleanup removal reasons

All logged with emoji prefixes for easy grep:
- `🧹` Queue cleanup operations
- `📊` Statistics and metrics
- `🚫` Follow-up blocks with reason
- `⏸️` Backpressure events
- `🔄` Counter resets

## Conclusion

This implementation successfully addresses the follow-up saturation issue by:
1. Limiting follow-ups to 3 attempts per user
2. Enforcing 2-day cooldowns after max attempts
3. Automatically cleaning the queue of blocked users
4. Applying backpressure to prevent overflow
5. Allowing user re-engagement after cooldown
6. Maintaining all existing anti-ban safeguards

The bot should now be able to send messages without queue saturation, while preventing spam through per-user limits and cooldowns.
