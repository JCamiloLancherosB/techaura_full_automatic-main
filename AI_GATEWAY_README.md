# AI Gateway Service - PR-G1 Implementation

## Overview

The AI Gateway is a unified service for handling AI requests with built-in reliability, policy enforcement, and complete tracking capabilities. It provides a single interface for multiple AI providers (Gemini, OpenAI) with automatic fallback and retry logic.

## Features

### 🔒 Content Policy Enforcement
- Prevents AI from inventing prices or stock information
- Automatically asks for clarification when needed
- Post-screens responses to ensure policy compliance

### ⚡ Reliability Features
- **Configurable timeouts** (default: 10s, range: 8-12s)
- **Max 2 retries per provider** with exponential backoff
- **Deterministic fallback** to templated responses if all providers fail
- **Multiple provider support** (Gemini primary, OpenAI secondary)

### 📊 Complete Tracking
Every AI request is tracked with:
- `ai_used` - Which provider was used (Gemini, OpenAI, fallback)
- `model` - Specific model name (e.g., gemini-1.5-flash, gpt-3.5-turbo)
- `latency_ms` - Request duration in milliseconds
- `tokens_est` - Estimated tokens used (if available)
- `policy_decision` - Policy enforcement result (approved, needs_clarification, fallback_used)

All metadata is automatically persisted to the `conversation_turns` table for analytics and monitoring.

## Installation

### 1. Run Database Migration

```bash
npm run migrate
```

This adds the required columns to the `conversation_turns` table:
- `ai_used` (VARCHAR)
- `model` (VARCHAR)
- `latency_ms` (INT)
- `tokens_est` (INT)
- `policy_decision` (VARCHAR)

### 2. Configure Environment Variables

```bash
# Required: At least one provider
GEMINI_API_KEY=your_gemini_key_here

# Optional: For fallback support
OPENAI_API_KEY=your_openai_key_here
```

## Usage

### Basic Usage

```typescript
import { aiGateway } from './src/services/aiGateway';
import { conversationMemory } from './src/services/conversationMemory';

// Generate response
const result = await aiGateway.generateResponse('¿Qué productos ofrecen?');

// Log to conversation with metadata
await conversationMemory.addTurn(
    userPhone,
    'assistant',
    result.response,
    {
        ai_used: result.metadata.ai_used,
        model: result.metadata.model,
        latency_ms: result.metadata.latency_ms,
        tokens_est: result.metadata.tokens_est,
        policy_decision: result.metadata.policy_decision
    }
);
```

### Custom Configuration

```typescript
import { AIGateway } from './src/services/aiGateway';

// Create gateway with custom settings
const customGateway = new AIGateway({
    timeoutMs: 8000,        // 8 second timeout
    maxRetries: 2,          // Max 2 retries
    enablePolicy: true      // Enable content policy
});

const result = await customGateway.generateResponse(prompt);
```

### Disable Policy (for internal/admin use)

```typescript
const noPolicyGateway = new AIGateway({
    enablePolicy: false
});

const result = await noPolicyGateway.generateResponse(prompt);
```

## Content Policy

The AI Gateway enforces a content policy to prevent misinformation:

### ❌ Policy Violations

1. **Inventing Prices**: The AI will not make up prices that aren't in the known catalog
2. **Inventing Stock**: The AI will not invent stock numbers or availability

### ✅ Policy-Compliant Responses

1. **Known Prices**: Can provide catalog prices ($59,900, $79,900, $69,900)
2. **Clarification Requests**: Will ask for specifics before providing information
3. **General Information**: Can discuss features, benefits, and general product info

### Example Policy Enforcement

**User**: "¿Tienen 100 USBs en stock?"

**Without Policy**: "Sí, tenemos 100 USBs disponibles" ❌ (inventing stock)

**With Policy**: "😊 Para darte información precisa sobre disponibilidad, ¿me puedes decir qué producto específico te interesa? Así puedo consultar el inventario actual." ✅

## Fallback System

When all AI providers fail, the gateway provides deterministic responses based on prompt patterns:

- **Greetings** → Welcome message
- **Pricing inquiries** → Known catalog prices
- **Product inquiries** → Product overview
- **Stock inquiries** → Availability inquiry
- **Customization** → Customization options
- **Default** → Help menu

## Monitoring & Health Checks

### Check Gateway Status

```typescript
import { aiGateway } from './src/services/aiGateway';

// Check if available
const isAvailable = aiGateway.isAvailable();

// Get detailed stats
const stats = aiGateway.getStats();
console.log(stats);
// {
//   availableProviders: [
//     { name: 'Gemini', model: 'gemini-1.5-flash' },
//     { name: 'OpenAI', model: 'gpt-3.5-turbo' }
//   ],
//   config: {
//     timeoutMs: 10000,
//     maxRetries: 2,
//     enablePolicy: true
//   }
// }
```

### Query Tracking Data

```sql
-- Get AI usage statistics
SELECT 
    ai_used,
    model,
    COUNT(*) as requests,
    AVG(latency_ms) as avg_latency,
    AVG(tokens_est) as avg_tokens,
    policy_decision
FROM conversation_turns
WHERE ai_used IS NOT NULL
GROUP BY ai_used, model, policy_decision
ORDER BY requests DESC;

-- Find slow requests
SELECT 
    phone,
    ai_used,
    model,
    latency_ms,
    content,
    timestamp
FROM conversation_turns
WHERE latency_ms > 5000  -- More than 5 seconds
ORDER BY latency_ms DESC
LIMIT 20;

-- Policy enforcement statistics
SELECT 
    policy_decision,
    COUNT(*) as count,
    AVG(latency_ms) as avg_latency
FROM conversation_turns
WHERE policy_decision IS NOT NULL
GROUP BY policy_decision;
```

## Testing

Run the test suite:

```bash
npm run dev -- test-ai-gateway.ts
```

Or with tsx:

```bash
npx tsx test-ai-gateway.ts
```

The test suite validates:
1. Gateway availability
2. Basic AI request/response
3. Policy enforcement
4. Deterministic fallback
5. Conversation persistence with metadata
6. Multiple requests and performance

## Architecture

```
┌─────────────────────────────────────────────┐
│           AI Gateway Service                │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐      ┌──────────────┐   │
│  │    Gemini    │      │   OpenAI     │   │
│  │  (Primary)   │      │ (Secondary)  │   │
│  └──────────────┘      └──────────────┘   │
│         │                      │            │
│         └──────────┬───────────┘            │
│                    ▼                        │
│         ┌──────────────────┐               │
│         │  Timeout (10s)   │               │
│         │  Retry (max 2)   │               │
│         └──────────────────┘               │
│                    │                        │
│                    ▼                        │
│         ┌──────────────────┐               │
│         │ Content Policy   │               │
│         │  Enforcement     │               │
│         └──────────────────┘               │
│                    │                        │
│       ┌────────────┼────────────┐          │
│       ▼            ▼            ▼          │
│   Success     Policy       Fallback        │
│   Response   Violation    Response         │
│                                             │
└─────────────────────────────────────────────┘
                    │
                    ▼
        ┌──────────────────────┐
        │  Conversation Memory │
        │  + AI Metadata       │
        └──────────────────────┘
                    │
                    ▼
        ┌──────────────────────┐
        │ conversation_turns   │
        │      (Database)      │
        └──────────────────────┘
```

## Migration Details

**File**: `migrations/20260124173700_add_ai_gateway_columns.js`

Adds the following columns to `conversation_turns`:

```javascript
// New columns
ai_used         VARCHAR(50)    // Provider name
model           VARCHAR(100)   // Model identifier  
latency_ms      INT           // Request duration
tokens_est      INT           // Estimated tokens
policy_decision VARCHAR(100)  // Policy result
```

## Integration Examples

See `ai-gateway-integration-example.ts` for complete integration patterns including:
- Basic chatbot response generation
- Custom timeout configuration
- Policy-disabled flows (admin use)
- Health checking
- Safe response generation with fallback

## Performance Considerations

- **Default timeout**: 10s (configurable 8-12s)
- **Retry overhead**: 500ms × retry_number exponential backoff
- **Max total time**: ~15s (10s timeout + 2 retries with backoff)
- **Fallback**: < 1ms (deterministic, no network calls)
- **Cache**: None (handled by conversation memory layer)

## Future Enhancements

- [ ] Response caching at gateway level
- [ ] More sophisticated policy rules (configurable)
- [ ] Cost tracking per provider
- [ ] A/B testing between providers
- [ ] Custom model selection per flow
- [ ] Streaming responses support
- [ ] Multi-turn context optimization

## Security Considerations

✅ **Implemented**:
- Content policy prevents misinformation
- Input validation and sanitization
- API key security (environment variables)
- Error messages don't leak sensitive info

⚠️ **Review Required**:
- Rate limiting (implement at application level)
- User input sanitization (implement before gateway)
- API key rotation policy

## Support

For issues or questions:
1. Check test output: `npx tsx test-ai-gateway.ts`
2. Review gateway stats: `aiGateway.getStats()`
3. Check database logs: Query `conversation_turns` table
4. Review implementation: `src/services/aiGateway.ts`

## License

Part of TechAura Intelligent Bot - ISC License
