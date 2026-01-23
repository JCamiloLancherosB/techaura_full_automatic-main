/**
 * Message Policy Engine
 * Enforces tone/length/CTA rules per stage and category without rewriting templates.
 * Validates messages before sending to ensure appropriate content for user status.
 */

import type { UserSession } from '../../types/global';
import type { PersuasionContext } from './persuasionEngine';

export interface PolicyRule {
    name: string;
    description: string;
    validate: (message: string, context: MessagePolicyContext) => PolicyViolation | null;
}

export interface PolicyViolation {
    rule: string;
    severity: 'error' | 'warning';
    message: string;
    suggestedFix?: string;
}

export interface MessagePolicyContext {
    userSession: UserSession;
    persuasionContext: PersuasionContext;
    messageType?: 'catalog' | 'persuasive' | 'order' | 'general';
    stage: string;
    status: string;
}

export interface PolicyValidationResult {
    isValid: boolean;
    violations: PolicyViolation[];
    transformedMessage?: string;
}

export class MessagePolicyEngine {
    private static instance: MessagePolicyEngine;

    // Policy constants
    private readonly CATALOG_MAX_LENGTH = 300; // Catalog messages can be longer for price tables
    private readonly STANDARD_MAX_LENGTH = 200; // Standard message hard cap
    private readonly PRICE_TABLE_EXEMPTION_KEYWORDS = ['$', 'precio', 'costo', 'GB', '32GB', '64GB', '128GB'];
    
    // Stages where urgency is prohibited
    private readonly CONFIRMED_STAGES = ['order_confirmed', 'payment_confirmed', 'shipping', 'completed', 'processing'];
    
    // Urgency patterns to detect
    private readonly URGENCY_PATTERNS = [
        /última[s]?\s+(llamada|oportunidad|chance)/i,
        /urgente/i,
        /ahora\s+mismo/i,
        /quedan\s+poc[ao]s/i,
        /termina\s+(hoy|en|pronto)/i,
        /solo\s+(hoy|24)/i,
        /antes\s+de\s+que/i
    ];

    // Price repetition detection
    private readonly PRICE_PATTERN = /\$\s*[\d,]+/g;

    // CTA patterns by stage
    private readonly STAGE_CTA_RULES: Record<string, { required: string[]; prohibited?: string[] }> = {
        awareness: {
            required: ['interesa', 'busca', 'qué', 'cuál', 'tipo'],
            prohibited: ['confirma', 'pedido', 'dirección', 'envío']
        },
        interest: {
            required: ['género', 'artista', 'preferencia', 'gusta', 'qué'],
            prohibited: ['confirma', 'pedido', 'dirección']
        },
        customization: {
            required: ['capacidad', 'GB', 'opciones', 'prefieres'],
            prohibited: ['dirección', 'envío']
        },
        pricing: {
            required: ['precio', 'costo', 'confirma', 'aparta', 'cuotas'],
        },
        closing: {
            required: ['confirma', 'dirección', 'nombre', 'pedido', 'envío'],
        },
        order_confirmed: {
            required: ['seguimiento', 'envío', 'pedido', 'orden'],
            prohibited: ['última', 'urgente', 'termina', 'quedan']
        }
    };

    static getInstance(): MessagePolicyEngine {
        if (!MessagePolicyEngine.instance) {
            MessagePolicyEngine.instance = new MessagePolicyEngine();
        }
        return MessagePolicyEngine.instance;
    }

    /**
     * Main validation method - checks all policy rules
     */
    validateMessage(message: string, context: MessagePolicyContext): PolicyValidationResult {
        const violations: PolicyViolation[] = [];

        // Apply all policy rules
        const rules = this.getPolicyRules();
        for (const rule of rules) {
            const violation = rule.validate(message, context);
            if (violation) {
                violations.push(violation);
            }
        }

        // If violations exist, try to transform message
        let transformedMessage = message;
        if (violations.length > 0) {
            transformedMessage = this.transformMessage(message, violations, context);
        }

        return {
            isValid: violations.filter(v => v.severity === 'error').length === 0,
            violations,
            transformedMessage: transformedMessage !== message ? transformedMessage : undefined
        };
    }

    /**
     * Get all policy rules
     */
    private getPolicyRules(): PolicyRule[] {
        return [
            this.createNoUrgencyWhenConfirmedRule(),
            this.createMessageLengthRule(),
            this.createNoPriceRepetitionRule(),
            this.createCTAAppropriatenessRule(),
            this.createProhibitedPatternsRule()
        ];
    }

    /**
     * Rule: No urgency language when status >= CONFIRMED
     */
    private createNoUrgencyWhenConfirmedRule(): PolicyRule {
        return {
            name: 'no_urgency_when_confirmed',
            description: 'Prohibit urgency language when order is confirmed or beyond',
            validate: (message, context) => {
                if (this.CONFIRMED_STAGES.includes(context.status) || 
                    this.CONFIRMED_STAGES.includes(context.stage)) {
                    
                    for (const pattern of this.URGENCY_PATTERNS) {
                        if (pattern.test(message)) {
                            return {
                                rule: 'no_urgency_when_confirmed',
                                severity: 'error',
                                message: 'Urgency language detected in confirmed/completed order',
                                suggestedFix: 'Remove urgency phrases as order is already confirmed'
                            };
                        }
                    }
                }
                return null;
            }
        };
    }

    /**
     * Rule: Message length constraints with catalog exemption
     */
    private createMessageLengthRule(): PolicyRule {
        return {
            name: 'message_length',
            description: 'Enforce length constraints based on message type',
            validate: (message, context) => {
                const isCatalog = context.messageType === 'catalog';
                const isPriceTable = this.isPriceTable(message);
                
                // Catalog messages with price tables get exemption
                if (isCatalog && isPriceTable) {
                    if (message.length > this.CATALOG_MAX_LENGTH) {
                        return {
                            rule: 'message_length',
                            severity: 'warning',
                            message: `Catalog message exceeds ${this.CATALOG_MAX_LENGTH} characters`,
                            suggestedFix: 'Consider breaking into multiple messages'
                        };
                    }
                } else {
                    // Standard length enforcement
                    if (message.length > this.STANDARD_MAX_LENGTH) {
                        return {
                            rule: 'message_length',
                            severity: 'error',
                            message: `Message exceeds ${this.STANDARD_MAX_LENGTH} characters`,
                            suggestedFix: 'Trim message while preserving CTA'
                        };
                    }
                }
                return null;
            }
        };
    }

    /**
     * Rule: No repeating price more than 3 times
     */
    private createNoPriceRepetitionRule(): PolicyRule {
        return {
            name: 'no_price_repetition',
            description: 'Prevent mentioning price more than 3 times',
            validate: (message, context) => {
                const prices = message.match(this.PRICE_PATTERN);
                if (prices && prices.length > 3) {
                    return {
                        rule: 'no_price_repetition',
                        severity: 'warning',
                        message: `Price mentioned ${prices.length} times (max 3)`,
                        suggestedFix: 'Consolidate price mentions or use ranges'
                    };
                }
                return null;
            }
        };
    }

    /**
     * Rule: CTA must be appropriate for stage
     */
    private createCTAAppropriatenessRule(): PolicyRule {
        return {
            name: 'cta_appropriateness',
            description: 'Ensure CTA matches journey stage',
            validate: (message, context) => {
                const stage = context.stage;
                const ctaRules = this.STAGE_CTA_RULES[stage];
                
                if (!ctaRules) {
                    return null; // No rules for this stage
                }

                const messageLower = message.toLowerCase();

                // Check prohibited CTAs
                if (ctaRules.prohibited) {
                    for (const prohibited of ctaRules.prohibited) {
                        if (messageLower.includes(prohibited)) {
                            return {
                                rule: 'cta_appropriateness',
                                severity: 'error',
                                message: `CTA "${prohibited}" is not appropriate for ${stage} stage`,
                                suggestedFix: `Use stage-appropriate CTAs: ${ctaRules.required.join(', ')}`
                            };
                        }
                    }
                }

                // Check if message has any required CTAs
                const hasRequiredCTA = ctaRules.required.some(req => messageLower.includes(req));
                if (!hasRequiredCTA && message.includes('?')) {
                    return {
                        rule: 'cta_appropriateness',
                        severity: 'warning',
                        message: `CTA may not be appropriate for ${stage} stage`,
                        suggestedFix: `Consider using: ${ctaRules.required.slice(0, 3).join(', ')}`
                    };
                }

                return null;
            }
        };
    }

    /**
     * Rule: Check for prohibited patterns in specific contexts
     */
    private createProhibitedPatternsRule(): PolicyRule {
        return {
            name: 'prohibited_patterns',
            description: 'Check for context-specific prohibited patterns',
            validate: (message, context) => {
                const messageLower = message.toLowerCase();

                // Don't use "bienvenido" if user has multiple interactions
                if (context.persuasionContext.interactionCount > 3 && 
                    messageLower.includes('bienvenido')) {
                    return {
                        rule: 'prohibited_patterns',
                        severity: 'warning',
                        message: 'Using "bienvenido" for returning user',
                        suggestedFix: 'Use continuation phrases instead of welcome'
                    };
                }

                // Don't ask about product type if already selected
                if (context.persuasionContext.hasSelectedProduct &&
                    messageLower.includes('música, películas o videos') &&
                    !messageLower.includes('algo más')) {
                    return {
                        rule: 'prohibited_patterns',
                        severity: 'warning',
                        message: 'Asking about product type when already selected',
                        suggestedFix: 'Focus on selected product or ask about additional items'
                    };
                }

                return null;
            }
        };
    }

    /**
     * Check if message is a price table (exempted from length constraints)
     */
    private isPriceTable(message: string): boolean {
        // A message is considered a price table if it has:
        // 1. Multiple price mentions
        // 2. Multiple capacity mentions
        // 3. List-like structure (multiple lines with similar patterns)
        
        const priceMatches = message.match(this.PRICE_PATTERN);
        const capacityMatches = message.match(/\d+(GB|gb)/g);
        const lines = message.split('\n').filter(line => line.trim().length > 0);
        
        // Must have at least 2 prices and 2 capacities
        const hasPrices = priceMatches && priceMatches.length >= 2;
        const hasCapacities = capacityMatches && capacityMatches.length >= 2;
        const hasListStructure = lines.length >= 3;
        
        return !!(hasPrices && hasCapacities && hasListStructure);
    }

    /**
     * Transform message to fix policy violations
     */
    private transformMessage(
        message: string, 
        violations: PolicyViolation[], 
        context: MessagePolicyContext
    ): string {
        let transformed = message;

        for (const violation of violations) {
            if (violation.severity === 'error') {
                switch (violation.rule) {
                    case 'no_urgency_when_confirmed':
                        transformed = this.removeUrgencyLanguage(transformed);
                        break;
                    case 'message_length':
                        transformed = this.trimToLength(transformed, this.STANDARD_MAX_LENGTH);
                        break;
                    case 'cta_appropriateness':
                        transformed = this.fixCTA(transformed, context);
                        break;
                }
            }
        }

        return transformed;
    }

    /**
     * Remove urgency language from message
     */
    private removeUrgencyLanguage(message: string): string {
        let cleaned = message;
        
        for (const pattern of this.URGENCY_PATTERNS) {
            // Remove lines containing urgency patterns
            const lines = cleaned.split('\n');
            cleaned = lines
                .filter(line => !pattern.test(line))
                .join('\n');
        }
        
        // Clean up multiple blank lines
        return cleaned.replace(/\n\n+/g, '\n\n').trim();
    }

    /**
     * Trim message to specified length while preserving CTA
     */
    private trimToLength(message: string, maxLength: number): string {
        if (message.length <= maxLength) {
            return message;
        }

        const lines = message.split('\n').filter(line => line.trim());
        
        // Extract CTA (last line with ? or command words)
        let cta = '';
        const ctaPatterns = [/[¿?]/, /\b(confirma|dime|cuéntame|elige|prefieres|quieres)\b/i];
        
        for (let i = lines.length - 1; i >= 0; i--) {
            if (ctaPatterns.some(pattern => pattern.test(lines[i]))) {
                cta = lines[i];
                lines.splice(i, 1);
                break;
            }
        }

        // Build trimmed message
        let trimmed = lines.join('\n');
        const withCTA = cta ? `${trimmed}\n\n${cta}` : trimmed;
        
        if (withCTA.length <= maxLength) {
            return withCTA;
        }

        // Still too long - take essential parts
        const availableSpace = maxLength - cta.length - 3; // 3 for '\n\n'
        const truncated = trimmed.substring(0, Math.max(availableSpace, 0)).trim();
        
        return cta ? `${truncated}\n\n${cta}` : truncated.substring(0, maxLength);
    }

    /**
     * Fix CTA to be appropriate for stage
     */
    private fixCTA(message: string, context: MessagePolicyContext): string {
        const stage = context.stage;
        const ctaRules = this.STAGE_CTA_RULES[stage];
        
        if (!ctaRules || !ctaRules.prohibited) {
            return message;
        }

        const lines = message.split('\n');
        const messageLower = message.toLowerCase();

        // Remove lines with prohibited CTAs
        const filtered = lines.filter(line => {
            const lineLower = line.toLowerCase();
            return !ctaRules.prohibited!.some(prohibited => lineLower.includes(prohibited));
        });

        return filtered.join('\n').trim();
    }

    /**
     * Get appropriate CTA suggestions for stage
     */
    getCTASuggestionsForStage(stage: string): string[] {
        const ctaRules = this.STAGE_CTA_RULES[stage];
        if (!ctaRules) {
            return ['¿En qué más puedo ayudarte?'];
        }

        // Return sample CTAs based on stage
        const samples: Record<string, string[]> = {
            awareness: ['¿Te interesa música, películas o videos?', '¿Qué tipo de contenido buscas?'],
            interest: ['¿Qué géneros o artistas prefieres?', '¿Cuéntame tus gustos musicales?'],
            customization: ['¿Prefieres 32GB o 64GB?', '¿Qué capacidad te conviene más?'],
            pricing: ['¿Te gustaría que te aparte una?', '¿La confirmamos?'],
            closing: ['Confirma tu dirección de envío', '¿A qué nombre va el pedido?'],
            order_confirmed: ['Te envío el seguimiento', '¿Necesitas algo más sobre tu pedido?']
        };

        return samples[stage] || ['¿En qué más puedo ayudarte?'];
    }

    /**
     * Quick check if message violates critical policies
     */
    hasErrorViolations(message: string, context: MessagePolicyContext): boolean {
        const result = this.validateMessage(message, context);
        return result.violations.some(v => v.severity === 'error');
    }

    /**
     * Get summary of violations for logging
     */
    getViolationSummary(violations: PolicyViolation[]): string {
        const errors = violations.filter(v => v.severity === 'error');
        const warnings = violations.filter(v => v.severity === 'warning');
        
        const parts: string[] = [];
        if (errors.length > 0) {
            parts.push(`${errors.length} error(s): ${errors.map(e => e.rule).join(', ')}`);
        }
        if (warnings.length > 0) {
            parts.push(`${warnings.length} warning(s): ${warnings.map(w => w.rule).join(', ')}`);
        }
        
        return parts.join('; ');
    }
}

// Export singleton instance
export const messagePolicyEngine = MessagePolicyEngine.getInstance();
