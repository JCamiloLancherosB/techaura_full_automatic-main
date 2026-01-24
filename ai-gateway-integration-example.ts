/**
 * AI Gateway Integration Example
 * 
 * Demonstrates how to integrate the AI Gateway into existing flows
 * with proper conversation tracking.
 */

import { aiGateway } from './src/services/aiGateway';
import { conversationMemory } from './src/services/conversationMemory';
import type { UserSession } from './types/global';

/**
 * Example: Use AI Gateway for generating responses in chatbot flow
 */
export async function generateChatbotResponse(
    userMessage: string,
    userSession: UserSession
): Promise<string> {
    try {
        // 1. Log user message
        await conversationMemory.addTurn(
            userSession.phone,
            'user',
            userMessage
        );

        // 2. Generate AI response using the gateway
        const result = await aiGateway.generateResponse(userMessage);

        // 3. Log assistant response with AI metadata
        await conversationMemory.addTurn(
            userSession.phone,
            'assistant',
            result.response,
            {
                // Store AI Gateway metadata for tracking
                ai_used: result.metadata.ai_used,
                model: result.metadata.model,
                latency_ms: result.metadata.latency_ms,
                tokens_est: result.metadata.tokens_est,
                policy_decision: result.metadata.policy_decision
            }
        );

        // 4. Return response to send to user
        return result.response;

    } catch (error) {
        console.error('Error generating chatbot response:', error);
        
        // Return a safe fallback
        return '😊 Disculpa, tuve un problema técnico. ¿Puedes repetir tu mensaje?';
    }
}

/**
 * Example: Custom configuration for specific flows
 */
export async function generateWithCustomTimeout(
    userMessage: string,
    userSession: UserSession,
    timeoutMs: number = 8000  // Shorter timeout for faster responses
): Promise<string> {
    const { AIGateway } = await import('./src/services/aiGateway');
    
    // Create a custom gateway instance with specific settings
    const customGateway = new AIGateway({
        timeoutMs,
        maxRetries: 2,
        enablePolicy: true
    });

    const result = await customGateway.generateResponse(userMessage);

    // Log with metadata
    await conversationMemory.addTurn(
        userSession.phone,
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

    return result.response;
}

/**
 * Example: Disable policy for admin or internal flows
 */
export async function generateWithoutPolicy(
    userMessage: string
): Promise<string> {
    const { AIGateway } = await import('./src/services/aiGateway');
    
    // Create gateway with policy disabled
    const noPolicyGateway = new AIGateway({
        enablePolicy: false
    });

    const result = await noPolicyGateway.generateResponse(userMessage);
    return result.response;
}

/**
 * Example: Check gateway health before using
 */
export async function safeGenerateResponse(
    userMessage: string,
    userSession: UserSession
): Promise<string> {
    // Check if gateway is available
    if (!aiGateway.isAvailable()) {
        console.warn('AI Gateway not available, using fallback');
        return '😊 Estamos teniendo problemas técnicos temporales. Por favor intenta de nuevo en unos momentos.';
    }

    const result = await aiGateway.generateResponse(userMessage);

    await conversationMemory.addTurn(
        userSession.phone,
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

    return result.response;
}

/**
 * Example: Get gateway statistics for monitoring
 */
export function getGatewayHealth() {
    const stats = aiGateway.getStats();
    
    return {
        isAvailable: aiGateway.isAvailable(),
        providers: stats.availableProviders,
        config: stats.config,
        timestamp: new Date()
    };
}

// Export for use in other modules
export { aiGateway };
