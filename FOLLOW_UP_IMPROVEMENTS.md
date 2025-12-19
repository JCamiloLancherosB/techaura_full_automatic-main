# Follow-up System Reliability Improvements

## Overview

This document describes the reliability and recovery improvements made to the chat follow-up system to ensure clients complete their purchasing process.

## Changes Implemented

### 1. Defensive Session Normalization

**Function**: `normalizeSessionForFollowUp(session: UserSession)`

**Purpose**: Prevents null/undefined/invalid data from blocking follow-up sends.

**What it does**:
- Normalizes `tags` to always be an array
- Sets default `stage` to 'initial' if missing/invalid
- Ensures `conversationData` is an object
- Normalizes `followUpHistory` to an array
- Converts `followUpCount24h` to a number (default 0)
- Safely parses dates for:
  - `lastInteraction` (defaults to now)
  - `lastFollowUp` (can be undefined)
  - `lastUserReplyAt` (can be undefined)
  - `lastFollowUpResetAt` (can be undefined)

**Benefits**:
- Eliminates "Cannot read property 'X' of undefined" errors
- Ensures time calculations always work with valid Date objects
- Prevents sessions from getting stuck due to data corruption

### 2. Improved Follow-up Block Logging

**Function**: `canSendFollowUpToUser(session: UserSession)`

**Enhancements**:
- Every blocked follow-up now logs with a non-empty reason string
- Includes phone number in log for easy tracking
- Provides detailed context (e.g., hours since last follow-up, minutes since last interaction)

**Example logs**:
```
🚫 Follow-up blocked for 573001234567: whatsapp_chat_active
🚫 Follow-up blocked for 573009876543: too_soon: 12.5h < 24h
🚫 Follow-up blocked for 573005551234: insufficient_silence: 45min < 60min
```

**Benefits**:
- Easy debugging of why follow-ups aren't being sent
- Clear visibility into system behavior
- Helps identify patterns in blocked follow-ups

### 3. Watchdog for Stuck WhatsApp Chats

**Function**: `releaseStuckWhatsAppChats()`

**Schedule**: Runs every hour

**Purpose**: Auto-releases WhatsApp chat active flag for sessions stuck >6 hours without interaction.

**What it does**:
- Scans all sessions with `isWhatsAppChatActive()` flag
- Checks if last interaction was >6 hours ago
- Automatically:
  - Removes `whatsapp_chat` and related tags
  - Sets `whatsappChatActive` flag to false
  - Records metadata about the auto-release
  - Updates stage to 'inactive' for users with significant progress
  - Persists changes to database

**Benefits**:
- Prevents chats from being permanently blocked by abandoned human takeovers
- Keeps stage consistent to allow follow-ups to resume
- Provides audit trail of auto-releases

**Logs**:
```
🔍 Watchdog: Checking for stuck WhatsApp chats...
⚠️ Watchdog: Releasing stuck WhatsApp chat for 573001234567 (stuck for 7.2h)
✅ Watchdog: Released 3 stuck WhatsApp chat(s)
```

### 4. Weekly Sweep for "no leido" Labels

**Function**: `processUnreadWhatsAppChats()`

**Schedule**: Every Sunday at 10:00 AM (Colombia time)

**Purpose**: Re-engages users with unread WhatsApp labels to resume sales process.

**What it does**:
- Finds all sessions tagged with "no leido", "no_leido", "noleido", or "unread"
- For each session:
  - Normalizes and validates session data
  - Checks if follow-up is allowed (respects anti-spam rules)
  - Builds contextual message based on:
    - Collected user data (capacity, genres, etc.)
    - Last user message/interaction
    - Conversation progress percentage
  - Sends persuasive re-engagement message
  - Updates session state and removes "no leido" tag
  - Persists changes to database

**Message Strategies**:
- **Near completion (>80%)**: Push to finalize order
- **Has capacity + decent progress (>50%)**: Focus on personalization
- **Recent price inquiry**: Show pricing table
- **Generic**: Persuasive offer with bonuses

**Benefits**:
- Recovers potentially lost sales
- Provides contextual, non-spammy re-engagement
- Integrates with existing follow-up rules
- Prevents duplicate messages

**Logs**:
```
📨 Weekly sweep: Processing unread WhatsApp chats with "no leido" label...
📊 Found 15 unread chat(s) to process
⏭️ Skipping unread chat 573001234567: daily_limit_reached
✅ Sent unread chat re-engagement to 573009876543
✅ Weekly sweep complete: Processed 12/15 unread chat(s)
```

## Schedule Overview

| Task | Frequency | Description |
|------|-----------|-------------|
| Watchdog | Hourly | Releases stuck WhatsApp chats (>6h inactive) |
| Weekly Sweep | Sunday 10 AM | Processes "no leido" unread chats |
| Initial Sweep | Startup + 30s | One-time check on app startup |

## Integration with Existing Systems

### Anti-Spam Protection
- Weekly sweep respects all existing follow-up rules:
  - Maximum 1 follow-up per 24 hours
  - Respects OPT_OUT and CLOSED statuses
  - Honors blacklist tags
  - Checks daily limits
  - Ensures minimum silence periods

### Database Updates
- All state changes are persisted to database
- Safe JSON stringification prevents data corruption
- Error handling ensures system continues on DB failures

### Bot Instance
- Uses existing `botInstance` for message sending
- Respects rate limiting with `waitForFollowUpDelay()`
- Logs all sent messages to database

## Testing

Run the validation script:

```bash
npx tsx test-follow-up-improvements.ts
```

This tests:
1. Session normalization with null/undefined values
2. Stuck chat detection logic
3. Unread chat tag detection
4. Follow-up blocking conditions

## Monitoring

Watch for these log patterns to monitor the new features:

**Session Normalization**:
```
🚫 Follow-up blocked for <phone>: <reason>
```

**Watchdog**:
```
🔍 Watchdog: Checking for stuck WhatsApp chats...
⚠️ Watchdog: Releasing stuck WhatsApp chat for <phone> (stuck for Xh)
✅ Watchdog: Released X stuck WhatsApp chat(s)
```

**Weekly Sweep**:
```
⏰ Cron: Starting weekly sweep for unread WhatsApp chats...
📨 Weekly sweep: Processing unread WhatsApp chats with "no leido" label...
📊 Found X unread chat(s) to process
✅ Sent unread chat re-engagement to <phone>
✅ Weekly sweep complete: Processed X/Y unread chat(s)
```

## Startup Messages

On successful initialization, you'll see:
```
✅ Sistema de seguimiento con retraso de 3s entre mensajes inicializado
⏱️ Retraso configurado: 3000ms entre usuarios diferentes
🚀 Todas las mejoras aplicadas correctamente
👁️ Watchdog activado: liberará chats de WhatsApp bloqueados >6h
📅 Barrido semanal configurado para chats "no leido"
✅ Cron job scheduled: Weekly unread WhatsApp sweep (Sundays at 10:00 AM)
```

## Future Enhancements

Potential improvements for future iterations:
- Configurable watchdog timeout (currently hardcoded to 6h)
- Adjustable weekly sweep schedule via environment variables
- A/B testing different re-engagement message strategies
- Dashboard for monitoring sweep effectiveness
- Analytics on recovery rates
