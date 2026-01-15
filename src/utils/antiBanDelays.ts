/**
 * Anti-Ban Delay Utilities for WhatsApp Flows
 * Provides human-like delays to prevent WhatsApp from flagging the bot as spam
 */

/**
 * Generate a random delay between min and max milliseconds
 * Default: 2-5 seconds (WhatsApp best practice)
 */
export function getRandomDelay(min: number = 2000, max: number = 5000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Apply a random anti-ban delay (2-5 seconds by default)
 * This simulates human typing/reading time
 */
export async function applyAntiBanDelay(min: number = 2000, max: number = 5000): Promise<void> {
  const delay = getRandomDelay(min, max);
  console.log(`⏳ [ANTI-BAN] Applying delay: ${delay}ms`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Apply a humanized delay for flow messages (800-2000ms)
 * This is faster than the default anti-ban delay but still prevents spam detection
 * Use for regular conversation flow messages
 */
export async function humanDelay(min: number = 800, max: number = 2000): Promise<void> {
  const delay = getRandomDelay(min, max);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Apply a short delay for quick responses (1-2 seconds)
 * Use when bot needs to respond quickly but still appear human
 */
export async function applyShortDelay(): Promise<void> {
  return applyAntiBanDelay(1000, 2000);
}

/**
 * Apply a medium delay for normal responses (2-5 seconds)
 * Default delay for most bot interactions
 */
export async function applyMediumDelay(): Promise<void> {
  return applyAntiBanDelay(2000, 5000);
}

/**
 * Apply a long delay for complex responses (5-8 seconds)
 * Use when bot needs to appear to be "thinking" or processing
 */
export async function applyLongDelay(): Promise<void> {
  return applyAntiBanDelay(5000, 8000);
}

/**
 * Apply delay before sending media (images, documents, etc.)
 * Media uploads typically take longer, so simulate that (3-6 seconds)
 */
export async function applyMediaDelay(): Promise<void> {
  return applyAntiBanDelay(3000, 6000);
}

/**
 * Apply typing indicator simulation
 * Short delay to show bot is "typing" before responding
 */
export async function applyTypingDelay(): Promise<void> {
  return applyAntiBanDelay(1500, 3000);
}

/**
 * Wrap flowDynamic with automatic anti-ban delay
 * Usage: await sendWithDelay(flowDynamic, messages)
 */
export async function sendWithDelay(
  flowDynamic: Function,
  messages: any[],
  delayType: 'short' | 'medium' | 'long' | 'typing' | 'media' = 'medium'
): Promise<void> {
  // Apply delay before sending
  switch (delayType) {
    case 'short':
      await applyShortDelay();
      break;
    case 'long':
      await applyLongDelay();
      break;
    case 'typing':
      await applyTypingDelay();
      break;
    case 'media':
      await applyMediaDelay();
      break;
    case 'medium':
    default:
      await applyMediumDelay();
      break;
  }
  
  // Send the message
  await flowDynamic(messages);
}

/**
 * Apply delay between multiple messages in sequence
 * Automatically spaces out messages to appear more natural
 */
export async function sendSequenceWithDelays(
  flowDynamic: Function,
  messageSequence: any[][],
  delayBetweenMessages: number = 2000
): Promise<void> {
  for (let i = 0; i < messageSequence.length; i++) {
    if (i > 0) {
      // Apply delay between messages (not before first message)
      await applyAntiBanDelay(delayBetweenMessages, delayBetweenMessages + 1000);
    }
    await flowDynamic(messageSequence[i]);
  }
}

console.log('✅ Anti-Ban Delay utilities loaded');
