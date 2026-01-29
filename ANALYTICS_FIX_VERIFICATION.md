# Analytics and Logging Fix - Verification Guide

## Changes Implemented

### 1. Event Tracking Added ✅
**Problem**: Chatbot events were not being recorded to the database
**Solution**: Added tracking calls throughout the message processing flow

#### Files Modified:
- `src/app.ts` - Added MESSAGE_RECEIVED and MESSAGE_SENT tracking
- `src/flows/userTrackingSystem.ts` - Added INTENT_DETECTED and STATE_CHANGED tracking

#### What was added:
- `chatbotEventService.trackMessageReceived()` - Tracks incoming messages
- `chatbotEventService.trackMessageSent()` - Tracks bot responses
- `chatbotEventService.trackIntentDetected()` - Tracks detected user intents
- `chatbotEventService.trackStateChanged()` - Tracks conversation stage changes

### 2. Conversation Turns Sync ✅
**Problem**: Session interactions not synced to conversation_turns table
**Solution**: Added automatic sync when interactions are recorded

- Each user message is now persisted to `conversation_turns` table
- Includes metadata: intent, sentiment, engagement, flow, stage

### 3. Reduced Follow-up Logs ✅
**Problem**: 140+ individual log lines every 15 minutes
**Solution**: Made logs conditional and added batch summary

#### Before:
```
[FOLLOWUP] ✅ 573213268259 en 120min | Cola: 1/500
[FOLLOWUP] ✅ 573229584287 en 30min | Cola: 2/500
... (140+ more lines)
```

#### After:
```
📅 140 seguimientos programados (30min: 45, 45min: 20, 60min: 30, 90min: 25, 120min: 20)
✅ Ciclo completado: 140 encolados, 50 omitidos
```

**Individual logs only appear when:**
- `LOG_LEVEL=debug` environment variable is set, OR
- `DEBUG_FOLLOWUP=true` environment variable is set

### 4. Reduced Analytics Logs ✅
**Problem**: Repetitive "No new events" logs every 3 minutes
**Solution**: Only log when there ARE events to process

#### Before (every 3 minutes):
```
[analytics] No new order events to process
[analytics] No new intent events to process
[analytics] No new followup events to process
[analytics] No new stage funnel events to process
[analytics] No new blocked followup events to process
```

#### After (only when processing):
```
[analytics] Processing 15 new order events
[analytics] Processing 8 new intent events
[analytics] Processing 22 new followup events
```

## Verification Steps

### 1. Check Chatbot Events are Being Recorded

After the bot processes messages, check the database:

```bash
curl http://localhost:3009/api/admin/events?limit=10
```

Expected: Should see events with types:
- `MESSAGE_RECEIVED`
- `MESSAGE_SENT`
- `INTENT_DETECTED`
- `STATE_CHANGED`

### 2. Check Analytics Return Data

```bash
# Check intent analytics
curl http://localhost:3009/api/admin/analytics/intents

# Check daily order stats
curl http://localhost:3009/api/admin/analytics/orders/daily

# Check message statistics
curl http://localhost:3009/api/admin/analytics/messages/stats
```

Expected: Should see actual numbers instead of all zeros

### 3. Check Conversation Turns Table

Query the database:
```sql
SELECT COUNT(*) FROM conversation_turns;
SELECT * FROM conversation_turns ORDER BY timestamp DESC LIMIT 10;
```

Expected: Should see records with user messages and metadata

### 4. Verify Reduced Logging

Monitor the console output during a follow-up cycle (every 15 minutes):

**Without debug mode** (default):
- Should see ~10 lines per cycle
- Batch summary instead of individual logs
- No "No new events" messages

**With debug mode**:
```bash
LOG_LEVEL=debug npm start
# OR
DEBUG_FOLLOWUP=true npm start
```
- Will see individual follow-up logs for troubleshooting

### 5. Test Message Flow End-to-End

1. Send a message to the bot
2. Check logs for:
   ```
   🎯 Mensaje recibido de...
   ```
3. Verify no errors about event tracking
4. Check database for new records in `chatbot_events`

## Environment Variables

### Enable Debug Logging
Add to `.env` file:
```
LOG_LEVEL=debug          # Enables all debug logs
DEBUG_FOLLOWUP=true      # Enables only follow-up debug logs
```

## Expected Impact

### Log Reduction
- **Before**: ~150+ lines per 15-minute cycle
- **After**: ~10 lines per cycle
- **Reduction**: ~90%

### Data Availability
- **Before**: All analytics showing 0 values
- **After**: Real data in chatbot_events and conversation_turns
- Analytics endpoints return meaningful statistics

### Performance
- No performance impact (event tracking is async and doesn't block)
- Slightly more database writes (expected and necessary)
- Better data for analytics and debugging

## Troubleshooting

### Events not appearing in database?
1. Check database connection is working
2. Verify `chatbot_events` table exists
3. Check logs for event tracking errors
4. Ensure messages are being processed (not skipped)

### Still seeing too many logs?
1. Verify `LOG_LEVEL` is not set to `debug` in production
2. Check `DEBUG_FOLLOWUP` is not enabled
3. Restart the application after changing env vars

### Analytics still showing zeros?
1. Wait 3-5 minutes for first analytics refresh cycle
2. Check if events exist: `SELECT COUNT(*) FROM chatbot_events`
3. Check analytics watermarks are progressing
4. Look for errors in AnalyticsRefresher logs

## Code Changes Summary

### Files Changed:
1. **src/app.ts** (79 additions, 1 deletion)
   - Import chatbotEventService
   - Add MESSAGE_RECEIVED tracking
   - Add MESSAGE_SENT tracking (4 locations)
   - Add delay breakdown tracking
   - Add batch summary logging
   - Conditional debug logging for follow-ups

2. **src/flows/userTrackingSystem.ts** (59 additions, 1 deletion)
   - Import chatbotEventService and conversationTurnsRepository
   - Add INTENT_DETECTED tracking
   - Add STATE_CHANGED tracking
   - Add conversation_turns sync
   - Conditional debug logging for follow-ups

3. **src/services/AnalyticsRefresher.ts** (47 additions, 10 deletions)
   - Remove all "No new events" debug logs
   - Add positive event processing logs
   - Silent when no events (reduces noise)

**Total Changes**: 173 insertions, 12 deletions
