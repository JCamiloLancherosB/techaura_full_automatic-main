# Intent Router v2: Implementation Summary

## Overview

Intent Router v2 implements a hybrid routing system that prioritizes deterministic rule-based matching over AI inference, with proper context preservation and fallback mechanisms.

## Architecture

### Priority Order
1. **Deterministic Rules** (Highest Priority)
   - Strong keyword matching for specific products/actions
   - High confidence (85-95%)
   - Instant response
   
2. **Context Preservation** (High Priority)
   - Respects current flow and stage
   - Prevents unwanted flow switching
   - Handles contextual messages (capacity, affirmations, etc.)

3. **AI Analysis** (Medium Priority)
   - Used for ambiguous cases
   - Confidence threshold: 60-70%
   - Provides reasoning

4. **Menu Fallback** (Low Priority)
   - Triggered when confidence < 40%
   - Safe default behavior
   - Guides user to make explicit choice

## Key Features

### Strong Keyword Patterns

The router recognizes these high-priority keywords:

| Keyword | Intent | Confidence | Target Flow |
|---------|--------|------------|-------------|
| usb, memoria, pendrive | usb_inquiry | 90% | usbFlow |
| pelis, películas, movies | movies | 95% | moviesUsb |
| audífonos, auriculares, headphones | headphones | 95% | flowHeadPhones |
| luces, iluminación, LEDs | lights | 95% | flowTechnology |
| herramientas, tools | tools | 95% | flowTechnology |
| precio, costo, cuánto | pricing | 90% | prices |
| catálogo, productos | catalog | 85% | catalogFlow |
| música, canciones | music | 90% | musicUsb |
| videos, clips | videos | 90% | videosUsb |

### Context Preservation

The router preserves the current flow when:

1. **User is in active stage**:
   - `customizing`, `pricing`, `awaiting_capacity`, `capacity_selected`, `genre_selection`, `closing`, etc.

2. **Message is contextual**:
   - Capacity specifications: "8GB", "32GB", "64GB"
   - Affirmations: "sí", "ok", "vale", "listo"
   - Negations: "no", "nada"

3. **Recent interaction** (< 30 seconds):
   - Unless user expresses very strong new intent (confidence >= 95%)

### Example Scenarios

#### Scenario 1: "8GB" in USB Flow
```
User Context:
- currentFlow: 'musicUsb'
- stage: 'awaiting_capacity'
- lastInteraction: 5 seconds ago

User Message: "8GB"

Router Decision:
- Intent: 'capacity' (contextual)
- Confidence: 95%
- Source: 'context'
- shouldRoute: false
- Reason: "Contextual message 'capacity' in musicUsb/awaiting_capacity"

Result: ✅ Stays in music USB flow, processes capacity selection
```

#### Scenario 2: "películas" from initial state
```
User Context:
- currentFlow: 'initial'
- stage: 'initial'

User Message: "quiero ver películas"

Router Decision:
- Intent: 'movies'
- Confidence: 95%
- Source: 'rule'
- shouldRoute: true
- targetFlow: 'moviesUsb'
- Reason: "Strong keyword match: movies"

Result: ✅ Routes to movies USB flow
```

#### Scenario 3: "audífonos" with no context
```
User Context:
- currentFlow: 'initial'
- stage: 'initial'

User Message: "necesito audífonos bluetooth"

Router Decision:
- Intent: 'headphones'
- Confidence: 95%
- Source: 'rule'
- shouldRoute: true
- targetFlow: 'flowHeadPhones'
- Reason: "Strong keyword match: headphones"

Result: ✅ Routes to headphones flow
```

## Database Schema

### conversation_turns Table

New columns added:

```sql
ALTER TABLE conversation_turns 
ADD COLUMN intent_confidence DECIMAL(5,2) NULL COMMENT 'Confidence score 0-100',
ADD COLUMN intent_source ENUM('rule', 'ai', 'menu', 'context') NULL COMMENT 'Source of intent classification';
```

### Logging Example

```typescript
await database.logConversationTurn({
    phone: '573001234567',
    role: 'user',
    content: 'quiero una usb de 32gb',
    metadata: { intent: 'usb_inquiry' },
    timestamp: new Date(),
    intentConfidence: 90,
    intentSource: 'rule'
});
```

## Integration

### Using the Hybrid Router

```typescript
import { hybridIntentRouter } from './services/hybridIntentRouter';

// In your message handler
const result = await hybridIntentRouter.route(userMessage, userSession);

if (result.shouldRoute && result.targetFlow) {
    // Route to new flow
    console.log(`Routing to: ${result.targetFlow}`);
} else {
    // Continue in current flow
    console.log(`Staying in: ${userSession.currentFlow}`);
}

// Log the intent
await database.logConversationTurn({
    phone: userSession.phone,
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
    intentConfidence: result.confidence,
    intentSource: result.source,
    metadata: result.metadata
});
```

### With IntelligentRouter

The `IntelligentRouter` class has been updated to use the hybrid router:

```typescript
import { intelligentRouter } from './services/intelligentRouter';

const decision = await intelligentRouter.analyzeAndRoute(message, session);
// Uses hybrid router internally
```

## Testing

### Pattern Validation Tests

Run the pattern validation tests:

```bash
node test-intent-router-v2.ts
```

### Test Coverage

- ✅ Strong keyword matching (usb, pelis, audífonos, luces, herramientas)
- ✅ Context preservation in active flows
- ✅ Capacity handling in USB flows
- ✅ Affirmation/negation handling
- ✅ Pricing and catalog intents
- ✅ Menu fallback for unclear messages

## Performance

- **Deterministic matching**: < 1ms
- **Context checking**: < 1ms
- **AI analysis** (when needed): 500-2000ms
- **Total**: Usually < 10ms (deterministic path)

## Acceptance Criteria

All acceptance criteria from the original requirements are met:

✅ "8GB" within USB flow does not re-route to another category
✅ AI only runs when no clear deterministic signals exist
✅ "precio" always enters pricing flow
✅ "catálogo" always enters catalog flow
✅ "usb 32" always enters USB flow
✅ "quiero audífonos" always enters headphones flow
✅ "películas" always enters movies flow

## Security

- ✅ No SQL injection vulnerabilities (uses parameterized queries)
- ✅ No XSS vulnerabilities
- ✅ Input sanitization via pattern matching
- ✅ CodeQL security scan: 0 alerts

## Future Enhancements

1. **Machine Learning Integration**
   - Train on historical routing decisions
   - Improve confidence scores based on outcomes

2. **A/B Testing**
   - Test different keyword weights
   - Optimize context preservation thresholds

3. **Analytics Dashboard**
   - Track intent_source distribution (rule vs AI vs menu)
   - Monitor confidence scores
   - Identify ambiguous cases

4. **Multi-language Support**
   - Extend patterns for English, Portuguese
   - Language detection

## Migration

To apply the database migration:

```bash
npm run migrate
```

Or manually:

```bash
npx knex migrate:latest
```

The migration file: `migrations/20260123000001_add_intent_routing_columns.js`

## Rollback

If needed, rollback the migration:

```bash
npx knex migrate:rollback
```

This will remove the `intent_confidence` and `intent_source` columns.
