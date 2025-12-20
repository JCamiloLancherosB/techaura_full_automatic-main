# Integration Guide: Intelligent Conversation Analysis

This guide shows how to integrate the conversation analyzer into existing flows to ensure coherent, sales-focused responses.

## Benefits

1. ✅ **Coherent Responses**: Bot analyzes context before responding
2. ✅ **Sales-Focused**: Responses guide user towards purchase  
3. ✅ **Anti-Confusion**: Detects and prevents confusing the user
4. ✅ **Anti-Ban**: Intelligent delays prevent WhatsApp blocks
5. ✅ **Human Handoff**: Automatically detects when human help is needed
6. ✅ **Objection Handling**: Addresses user concerns immediately
7. ✅ **Flow Completion**: Ensures all flows end with proper next step

## Step 1: Import Required Modules

```typescript
import { analyzeBeforeResponse, sendIntelligentResponse, shouldInterruptFlow } from '../middlewares/intelligentResponseMiddleware';
import { applyMediumDelay } from '../utils/antiBanDelays';
```

## Step 2: Add Analysis at Message Capture Points

```typescript
.addAction({ capture: true }, async (ctx, { flowDynamic, gotoFlow }) => {
  const phoneNumber = ctx.from;
  const userMessage = ctx.body?.trim() || '';
  
  try {
    // Check if flow should be interrupted
    const interruptCheck = await shouldInterruptFlow(phoneNumber, userMessage, 'musicUsb');
    if (interruptCheck.shouldInterrupt) {
      await sendIntelligentResponse(flowDynamic, 'Cambiando...', 2000);
      // return gotoFlow(newFlow);
    }
    
    // Analyze conversation context
    const analysis = await analyzeBeforeResponse(phoneNumber, userMessage, 'musicUsb');
    
    // Handle human intervention if needed
    if (analysis.requiresHumanIntervention) {
      await sendIntelligentResponse(
        flowDynamic,
        'Un asesor te contactará en breve.',
        analysis.recommendedDelay
      );
      return;
    }
    
    // Use intelligent response if coherence is low
    if (!analysis.shouldProceed && analysis.suggestedResponse) {
      await sendIntelligentResponse(
        flowDynamic,
        analysis.suggestedResponse,
        analysis.recommendedDelay
      );
      return;
    }
    
    // Continue with your flow logic...
    
  } catch (error) {
    console.error('Integration error:', error);
  }
});
```

## Step 3: Add Anti-Ban Delays

Replace:
```typescript
await flowDynamic(['Message 1']);
await flowDynamic(['Message 2']);
```

With:
```typescript
await sendIntelligentResponse(flowDynamic, 'Message 1', undefined, 'medium');
await sendIntelligentResponse(flowDynamic, 'Message 2', undefined, 'short');
```

## Step 4: Ensure Flow Completion

Always end flows with data collection:

```typescript
// ❌ BAD
await flowDynamic(['Capacidad seleccionada!']);
// Flow ends - user confused

// ✅ GOOD
await flowDynamic(['Capacidad seleccionada!']);
await applyMediumDelay();
await sendIntelligentResponse(flowDynamic, dataRequestMessage, 2500);
```

## Checklist for Each Flow

- [ ] Import conversation analyzer middleware
- [ ] Add analysis at each capture point
- [ ] Replace hardcoded delays with intelligent delays
- [ ] Add human intervention detection
- [ ] Ensure flow ends with data collection or clear next step
- [ ] Add logging for key interactions
- [ ] Test complete user journey

## Files to Modify

1. `src/flows/musicUsb.ts`
2. `src/flows/videosUsb.ts`
3. `src/flows/moviesUsb.ts`
4. `src/flows/capacityMusic.ts`
5. `src/flows/capacityVideo.ts`
