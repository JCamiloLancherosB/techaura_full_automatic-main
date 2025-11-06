// src/utils/contextLogger.ts
import { CONTEXT_CONFIG } from '../config/contextConfig';

export class ContextLogger {
    private static instance: ContextLogger;
    
    static getInstance(): ContextLogger {
        if (!ContextLogger.instance) {
            ContextLogger.instance = new ContextLogger();
        }
        return ContextLogger.instance;
    }
    
    logContextAnalysis(phoneNumber: string, analysis: any): void {
        if (!CONTEXT_CONFIG.LOGGING.ENABLED || !CONTEXT_CONFIG.LOGGING.LOG_CONTEXT_ANALYSIS) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        console.log(`🔍 [CONTEXT LOG] ${timestamp} - ${phoneNumber}:`, {
            shouldRespond: analysis.shouldRespond,
            currentContext: analysis.currentContext,
            suggestedAction: analysis.suggestedAction,
            reason: analysis.reason,
            confidence: analysis.confidence
        });
    }
    
    logFlowTransition(phoneNumber: string, fromFlow: string, toFlow: string, reason: string): void {
        if (!CONTEXT_CONFIG.LOGGING.ENABLED) return;
        
        const timestamp = new Date().toISOString();
        console.log(`🔄 [FLOW TRANSITION] ${timestamp} - ${phoneNumber}: ${fromFlow} → ${toFlow} (${reason})`);
    }
    
    logCriticalContextChange(phoneNumber: string, action: 'MARKED' | 'CLEARED', context: string): void {
        if (!CONTEXT_CONFIG.LOGGING.ENABLED) return;
        
        const timestamp = new Date().toISOString();
        const emoji = action === 'MARKED' ? '🔒' : '🔓';
        console.log(`${emoji} [CRITICAL CONTEXT] ${timestamp} - ${phoneNumber}: ${action} - ${context}`);
    }
    
    logError(phoneNumber: string, error: any, context: string): void {
        const timestamp = new Date().toISOString();
        console.error(`❌ [CONTEXT ERROR] ${timestamp} - ${phoneNumber} in ${context}:`, error);
    }
}

export const contextLogger = ContextLogger.getInstance();
