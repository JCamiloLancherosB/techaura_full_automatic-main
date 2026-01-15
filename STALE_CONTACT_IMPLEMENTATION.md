# Stale Contact Blocking Implementation Summary

## Overview
This implementation prevents the chatbot from sending follow-up messages to users who contacted us last year (or have been inactive for >365 days), while keeping the follow-up system persuasive, human-sounding, and focused on new/active users.

## Changes Made

### 1. Configuration Constant
**File:** `src/flows/userTrackingSystem.ts`
- Added `STALE_CONTACT_DAYS = 365` constant
- Used consistently across all stale contact checks
- Single source of truth for the threshold

### 2. Centralized Stale Check Function
**File:** `src/flows/userTrackingSystem.ts`
**Function:** `isStaleContact(session: UserSession)`

Checks three scenarios in priority order:
1. **Last Interaction Date** - Most reliable indicator of user activity
2. **Last Follow-up Date** - Fallback if no recent interaction
3. **Creation Date** - For users with no interaction/follow-up data

Returns:
```typescript
{
  isStale: boolean;
  reason?: string;
  daysInactive?: number;
}
```

Example reasons:
- `stale_contact_>365d (last interaction: 400d ago)`
- `stale_contact_>365d (last follow-up: 450d ago)`
- `stale_contact_>365d (created: 500d ago, no interactions)`

### 3. Integration Points

#### A. Primary Validation Gate
**File:** `src/flows/userTrackingSystem.ts`
**Function:** `canSendFollowUpToUser()`
- Added as check #0 (runs FIRST before all other checks)
- Blocks follow-ups at the most fundamental level
- Logs clear skip reason

#### B. Queue Processing
**File:** `src/app.ts`
**Class:** `FollowUpQueueManager`
**Method:** `process()`
- Checks stale status before sending message
- Removes stale users from queue immediately
- Logs: `"🚫 Stale contact, removing from queue: {phone} - {reason}"`

#### C. Queue Selection Loop
**File:** `src/app.ts`
**Function:** `executeFollowUpCycle()`
- Skips stale users before enqueueing them
- Prevents wasting queue resources on stale contacts
- Logs: `"⏭️ Skipping stale contact: {phone} - {reason}"`

#### D. Periodic Cleanup
**File:** `src/app.ts`
**Interval:** Every 15 minutes
- Proactively removes stale users from queue
- Keeps queue clean and efficient
- Logs: `"🧹 Removed {phone} from queue: {reason}"`

### 4. Messaging Improvements
**File:** `src/services/persuasionTemplates.ts`
- Added new friendly template `reeng_warm_1_d`
- Reviewed all existing templates - confirmed they are:
  - ✅ Warm and human-sounding
  - ✅ Non-robotic and conversational
  - ✅ Persuasive without being aggressive
  - ✅ Respectful with clear CTAs

Example new template:
```
¡Hola! 🎶

Tengo aquí tu consulta sobre USBs personalizadas. 
¿Te puedo ayudar a encontrar la mejor opción para ti?

💡 Solo dime qué tipo de contenido buscas (música, películas, videos) 
y te muestro las capacidades disponibles.

Sin presión, cuando quieras conversamos. 😊
```

### 5. Logging
All stale checks log consistently in Spanish (matching existing codebase style):
- Clear emoji indicators (🚫, ⏭️, 🧹)
- Specific reason codes
- Days inactive count
- Consistent format

### 6. Safety & Compatibility
✅ **All existing anti-spam/anti-ban rules remain intact:**
- Rate limiting (8 msg/min, hourly/daily limits)
- Work/rest scheduler (45min work / 15min rest)
- Send window (08:00-22:00)
- Opt-out checks
- Blacklist checks
- Cooldown period (2 days after 3 attempts)
- Active chat detection (WhatsApp)
- Significant progress validation
- Buying intent thresholds

✅ **Stale check is additive, not replacing:**
- Runs first (check #0)
- Other checks still apply to non-stale users
- No bypass mechanism

## Testing

### Test Script: `test-stale-contact.js`
Validates the logic with 5 test scenarios:
1. Active user (30 days) → ✅ ALLOWED
2. Stale user (400 days) → ❌ BLOCKED
3. Borderline user (364 days) → ✅ ALLOWED
4. Old follow-up (400 days) → ❌ BLOCKED
5. Old creation, no data (400 days) → ❌ BLOCKED

**Results:** 3 blocked, 2 allowed (as expected)

## Expected Behavior

### What Will Be Blocked:
- Users whose last interaction was >365 days ago
- Users whose last follow-up was >365 days ago (if no interaction data)
- Users created >365 days ago with no interaction or follow-up data
- Any user matching "previous calendar year" criteria

### What Will Still Work:
- Active users (<365 days) receive follow-ups normally
- All existing anti-spam/anti-ban rules apply
- Queue management continues to work
- Persuasive messaging remains human and warm
- Rate limiting and pacing controls still active

### Logs to Expect:
```
🚫 Follow-up blocked for 573001234567: stale_contact_>365d (last interaction: 400d ago)
⏭️ Skipping stale contact: 573002345678 - stale_contact_>365d (last follow-up: 450d ago)
🧹 Removed 4567 from queue: stale_contact_>365d (created: 500d ago, no interactions)
```

## Code Quality
- ✅ TypeScript strict typing maintained
- ✅ Existing patterns followed
- ✅ No breaking changes to public exports
- ✅ Inline comments added for behavior changes
- ✅ Single constant for configuration (DRY principle)
- ✅ Defensive programming (date parsing, null checks)

## Files Modified
1. `src/flows/userTrackingSystem.ts` - Core stale check logic
2. `src/app.ts` - Integration in queue manager and selection loop
3. `src/services/persuasionTemplates.ts` - Added friendly template

## Monitoring Recommendations

### Metrics to Track:
1. Number of users blocked due to staleness (daily/weekly)
2. Average days inactive for blocked users
3. Follow-up success rate (should improve with focused targeting)
4. Queue utilization (should be more efficient)

### Log Queries:
```bash
# Count stale blocks today
grep "stale_contact_>365d" logs/*.log | wc -l

# See reasons for stale blocks
grep "stale_contact_>365d" logs/*.log | cut -d: -f2- | sort | uniq -c

# Check average days inactive
grep "days inactive:" logs/*.log | grep -oP '\d+ days' | sort -n
```

## Deployment Notes
- No database schema changes required
- No external service dependencies
- Can be deployed immediately
- Backward compatible
- Safe to rollback if needed

## Success Criteria Met
✅ Follow-ups NOT sent to users whose last interaction is older than 365 days  
✅ Enforced at enqueue, send, and cleanup stages  
✅ Logs show skips for stale contacts with clear reasons  
✅ Messaging remains friendly/persuasive (non-robotic)  
✅ All anti-spam/anti-ban rules remain intact  
✅ Single constant for configuration  
✅ Applied consistently across all integration points  

## Future Enhancements (Out of Scope)
- Make threshold configurable via admin panel
- Add analytics dashboard for stale user trends
- Implement re-activation campaigns for stale users
- A/B test different threshold values
- Add different thresholds by user segment
