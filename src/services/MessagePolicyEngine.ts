/**
 * Message Policy Engine
 * Enforces tone/length/CTA rules per stage and category without rewriting templates.
 * Validates messages before sending to ensure appropriate content for user status.
 * 
 * Enhanced Features:
 * - Context memory system for last 20 interactions
 * - Contradiction detection against previous information
 * - Automatic message transformation for incoherent messages
 * - Violation logging for analysis
 * 
 * Configuration Note:
 * The policy constants (CATALOG_MAX_LENGTH, STANDARD_MAX_LENGTH) and CTA rules
 * are currently hard-coded for simplicity. For production environments with frequent
 * rule changes, consider externalizing these to:
 * - Environment variables (process.env.MESSAGE_MAX_LENGTH)
 * - Configuration files (config/message-policy.json)
 * - Database tables for runtime configuration
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
    /** Additional metadata for logging */
    metadata?: Record<string, unknown>;
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

/**
 * Represents a single interaction in the context memory
 */
export interface ContextInteraction {
    timestamp: Date;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: {
        priceShown?: number;
        capacityMentioned?: string;
        productType?: string;
        stage?: string;
        flow?: string;
    };
}

/**
 * Violation log entry for analysis
 */
export interface ViolationLogEntry {
    timestamp: Date;
    phone: string;
    violationType: string;
    severity: 'error' | 'warning';
    originalMessage: string;
    transformedMessage?: string;
    context: {
        stage: string;
        status: string;
        interactionCount: number;
    };
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

    // ==========================================
    // === CONTEXT MEMORY SYSTEM ===
    // ==========================================
    
    /** Maximum interactions to keep in memory per user */
    private readonly MAX_CONTEXT_INTERACTIONS = 20;
    
    /** Context memory: phone -> list of recent interactions */
    private contextMemory = new Map<string, ContextInteraction[]>();
    
    /** Violation log for analysis */
    private violationLog: ViolationLogEntry[] = [];
    
    /** Maximum violation log entries to keep */
    private readonly MAX_VIOLATION_LOG_SIZE = 500;

    // Patterns for extracting key information
    private readonly PRICE_EXTRACTION_PATTERN = /\$\s*([\d,]+)/g;
    private readonly CAPACITY_EXTRACTION_PATTERN = /(\d+)\s*(GB|TB)/gi;
    private readonly PRODUCT_TYPE_PATTERNS = {
        music: /música|musica|cancion|canciones|playlist|mp3/i,
        movies: /película|peliculas|pelicula|film|cine/i,
        videos: /video|videos|clips/i,
        series: /serie|series/i,
        mixed: /mixto|combinado|mezcla/i
    };

    static getInstance(): MessagePolicyEngine {
        if (!MessagePolicyEngine.instance) {
            MessagePolicyEngine.instance = new MessagePolicyEngine();
        }
        return MessagePolicyEngine.instance;
    }

    // ==========================================
    // === CONTEXT MEMORY METHODS ===
    // ==========================================

    /**
     * Add an interaction to the context memory for a user
     */
    addToContextMemory(
        phone: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        metadata?: ContextInteraction['metadata']
    ): void {
        let interactions = this.contextMemory.get(phone);
        if (!interactions) {
            interactions = [];
            this.contextMemory.set(phone, interactions);
        }

        // Extract metadata from content if not provided
        const extractedMetadata = metadata || this.extractMetadataFromContent(content);

        interactions.push({
            timestamp: new Date(),
            role,
            content,
            metadata: extractedMetadata
        });

        // Keep only last MAX_CONTEXT_INTERACTIONS
        if (interactions.length > this.MAX_CONTEXT_INTERACTIONS) {
            this.contextMemory.set(phone, interactions.slice(-this.MAX_CONTEXT_INTERACTIONS));
        }
    }

    /**
     * Get recent context interactions for a user
     */
    getContextMemory(phone: string, limit?: number): ContextInteraction[] {
        const interactions = this.contextMemory.get(phone) || [];
        if (limit && limit > 0) {
            return interactions.slice(-limit);
        }
        return interactions;
    }

    /**
     * Clear context memory for a user
     */
    clearContextMemory(phone: string): void {
        this.contextMemory.delete(phone);
    }

    /**
     * Extract metadata from message content
     */
    private extractMetadataFromContent(content: string): ContextInteraction['metadata'] {
        const metadata: ContextInteraction['metadata'] = {};

        // Extract prices
        const priceMatch = content.match(this.PRICE_EXTRACTION_PATTERN);
        if (priceMatch && priceMatch.length > 0) {
            const priceStr = priceMatch[0].replace(/[$,\s]/g, '');
            const parsedPrice = parseInt(priceStr, 10);
            // Use Number.isNaN to properly check for NaN (handles 0 correctly)
            if (!Number.isNaN(parsedPrice)) {
                metadata.priceShown = parsedPrice;
            }
        }

        // Extract capacity
        const capacityMatch = content.match(this.CAPACITY_EXTRACTION_PATTERN);
        if (capacityMatch && capacityMatch.length > 0) {
            metadata.capacityMentioned = capacityMatch[0].toUpperCase();
        }

        // Extract product type
        for (const [type, pattern] of Object.entries(this.PRODUCT_TYPE_PATTERNS)) {
            if (pattern.test(content)) {
                metadata.productType = type;
                break;
            }
        }

        return Object.keys(metadata).length > 0 ? metadata : undefined;
    }

    // ==========================================
    // === VIOLATION LOGGING ===
    // ==========================================

    /**
     * Log a policy violation for later analysis
     */
    logViolation(
        phone: string,
        violation: PolicyViolation,
        originalMessage: string,
        transformedMessage: string | undefined,
        context: MessagePolicyContext
    ): void {
        const entry: ViolationLogEntry = {
            timestamp: new Date(),
            phone,
            violationType: violation.rule,
            severity: violation.severity,
            originalMessage: originalMessage.substring(0, 200), // Truncate for storage
            transformedMessage: transformedMessage?.substring(0, 200),
            context: {
                stage: context.stage,
                status: context.status,
                interactionCount: context.persuasionContext.interactionCount
            }
        };

        this.violationLog.push(entry);

        // Keep log size bounded
        if (this.violationLog.length > this.MAX_VIOLATION_LOG_SIZE) {
            this.violationLog = this.violationLog.slice(-this.MAX_VIOLATION_LOG_SIZE);
        }

        console.log(`📋 [PolicyEngine] Violation logged: ${violation.rule} (${violation.severity}) for ${phone}`);
    }

    /**
     * Get violation log entries, optionally filtered
     */
    getViolationLog(filters?: {
        phone?: string;
        violationType?: string;
        severity?: 'error' | 'warning';
        since?: Date;
    }): ViolationLogEntry[] {
        let entries = [...this.violationLog];

        if (filters) {
            if (filters.phone) {
                entries = entries.filter(e => e.phone === filters.phone);
            }
            if (filters.violationType) {
                entries = entries.filter(e => e.violationType === filters.violationType);
            }
            if (filters.severity) {
                entries = entries.filter(e => e.severity === filters.severity);
            }
            if (filters.since) {
                entries = entries.filter(e => e.timestamp >= filters.since);
            }
        }

        return entries;
    }

    /**
     * Get violation statistics for analysis
     */
    getViolationStats(): {
        total: number;
        byType: Record<string, number>;
        bySeverity: Record<string, number>;
        recent24h: number;
    } {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const byType: Record<string, number> = {};
        const bySeverity: Record<string, number> = { error: 0, warning: 0 };
        let recent24h = 0;

        for (const entry of this.violationLog) {
            byType[entry.violationType] = (byType[entry.violationType] || 0) + 1;
            bySeverity[entry.severity]++;
            if (entry.timestamp >= oneDayAgo) {
                recent24h++;
            }
        }

        return {
            total: this.violationLog.length,
            byType,
            bySeverity,
            recent24h
        };
    }

    // ==========================================
    // === VALIDATION METHODS ===
    // ==========================================

    /**
     * Main validation method - checks all policy rules
     */
    validateMessage(message: string, context: MessagePolicyContext): PolicyValidationResult {
        const violations: PolicyViolation[] = [];
        const phone = context.userSession.phone;

        // Apply all policy rules
        const rules = this.getPolicyRules();
        for (const rule of rules) {
            const violation = rule.validate(message, context);
            if (violation) {
                violations.push(violation);
            }
        }

        // Check for contradictions against context memory
        const contradictionViolation = this.checkForContradictions(message, context);
        if (contradictionViolation) {
            violations.push(contradictionViolation);
        }

        // If violations exist, try to transform message
        let transformedMessage = message;
        if (violations.length > 0) {
            transformedMessage = this.transformMessage(message, violations, context);

            // Log violations for analysis
            for (const violation of violations) {
                this.logViolation(phone, violation, message, transformedMessage, context);
            }
        }

        return {
            isValid: violations.filter(v => v.severity === 'error').length === 0,
            violations,
            transformedMessage: transformedMessage !== message ? transformedMessage : undefined
        };
    }

    /**
     * Validate message with context memory integration
     * This is the enhanced pre-send validation hook
     */
    validateMessageWithContext(
        message: string,
        context: MessagePolicyContext
    ): PolicyValidationResult {
        // Run standard validation with contradiction checking
        // Note: Context memory is NOT updated here to avoid double-addition
        // The caller (FlowIntegrationHelper) is responsible for adding to context memory
        return this.validateMessage(message, context);
    }

    /**
     * Check for contradictions against previous context
     */
    private checkForContradictions(
        message: string,
        context: MessagePolicyContext
    ): PolicyViolation | null {
        const phone = context.userSession.phone;
        const recentInteractions = this.getContextMemory(phone, 10);

        if (recentInteractions.length === 0) {
            return null;
        }

        // Extract current message info
        const currentInfo = this.extractMetadataFromContent(message);

        // Check for price contradictions
        const priceContradiction = this.checkPriceContradiction(currentInfo, recentInteractions);
        if (priceContradiction) {
            return priceContradiction;
        }

        // Check for capacity contradictions
        const capacityContradiction = this.checkCapacityContradiction(currentInfo, recentInteractions);
        if (capacityContradiction) {
            return capacityContradiction;
        }

        // Check for product type contradictions
        const productContradiction = this.checkProductTypeContradiction(message, currentInfo, recentInteractions, context);
        if (productContradiction) {
            return productContradiction;
        }

        // Check for duplicate price showing (already shown recently)
        const duplicatePriceViolation = this.checkDuplicatePriceShown(message, recentInteractions);
        if (duplicatePriceViolation) {
            return duplicatePriceViolation;
        }

        return null;
    }

    /**
     * Check for price contradictions
     */
    private checkPriceContradiction(
        currentInfo: ContextInteraction['metadata'],
        recentInteractions: ContextInteraction[]
    ): PolicyViolation | null {
        if (!currentInfo?.priceShown) {
            return null;
        }

        // Find last price mentioned with matching capacity
        for (let i = recentInteractions.length - 1; i >= 0; i--) {
            const interaction = recentInteractions[i];
            if (interaction.metadata?.priceShown && interaction.metadata?.capacityMentioned) {
                // Only check for contradiction if both messages mention the same capacity
                // OR if neither mentions capacity (generic price comparison)
                const sameCapacity = !currentInfo.capacityMentioned || 
                    currentInfo.capacityMentioned === interaction.metadata.capacityMentioned;
                
                if (sameCapacity && currentInfo.priceShown !== interaction.metadata.priceShown) {
                    const prevPrice = interaction.metadata.priceShown;
                    const currPrice = currentInfo.priceShown;
                    
                    // Allow small variations (within 10%) as rounding
                    const variation = Math.abs(currPrice - prevPrice) / prevPrice;
                    if (variation > 0.1) {
                        return {
                            rule: 'price_contradiction',
                            severity: 'error',
                            message: `Price contradiction detected: previously showed $${prevPrice}, now showing $${currPrice}`,
                            suggestedFix: 'Use consistent pricing throughout the conversation',
                            metadata: {
                                previousPrice: prevPrice,
                                currentPrice: currPrice,
                                capacity: currentInfo.capacityMentioned || interaction.metadata.capacityMentioned
                            }
                        };
                    }
                }
                break;
            }
        }

        return null;
    }

    /**
     * Check for capacity contradictions
     */
    private checkCapacityContradiction(
        currentInfo: ContextInteraction['metadata'],
        recentInteractions: ContextInteraction[]
    ): PolicyViolation | null {
        if (!currentInfo?.capacityMentioned) {
            return null;
        }

        // Check if we're confirming a different capacity than what was selected
        for (let i = recentInteractions.length - 1; i >= 0; i--) {
            const interaction = recentInteractions[i];
            
            // If user selected a capacity and we're now mentioning a different one without context
            if (interaction.role === 'user' && 
                interaction.metadata?.capacityMentioned &&
                interaction.metadata.capacityMentioned !== currentInfo.capacityMentioned) {
                
                // Check if this is a valid upsell/cross-sell context
                const isValidSuggestion = this.isValidCapacitySuggestion(interaction.content);
                
                if (!isValidSuggestion) {
                    return {
                        rule: 'capacity_contradiction',
                        severity: 'warning',
                        message: `User selected ${interaction.metadata.capacityMentioned} but message mentions ${currentInfo.capacityMentioned}`,
                        suggestedFix: 'Focus on the capacity the user selected or frame suggestions clearly'
                    };
                }
            }
        }

        return null;
    }

    /**
     * Check if mentioning a different capacity is a valid suggestion
     */
    private isValidCapacitySuggestion(userMessage: string): boolean {
        const suggestionPatterns = [
            /también|además|otro|más|oferta|promoción|recomiendo|sugerencia/i
        ];
        return suggestionPatterns.some(p => p.test(userMessage));
    }

    /**
     * Check for product type contradictions
     */
    private checkProductTypeContradiction(
        message: string,
        currentInfo: ContextInteraction['metadata'],
        recentInteractions: ContextInteraction[],
        context: MessagePolicyContext
    ): PolicyViolation | null {
        // If user has selected a product, don't ask about product types again
        if (context.persuasionContext.hasSelectedProduct && currentInfo?.productType) {
            const userSelectedProduct = context.persuasionContext.productInterests[0]?.toLowerCase();
            
            if (userSelectedProduct && currentInfo.productType !== userSelectedProduct) {
                // Check if this is offering additional products (valid cross-sell)
                // Check the message content, not the flow name
                const isValidCrossSell = /algo más|además|también|agregar|combo/i.test(message);
                
                if (!isValidCrossSell) {
                    return {
                        rule: 'product_type_contradiction',
                        severity: 'warning',
                        message: `User interested in ${userSelectedProduct} but message focuses on ${currentInfo.productType}`,
                        suggestedFix: 'Focus on the product type the user expressed interest in'
                    };
                }
            }
        }

        return null;
    }

    /**
     * Check if price was already shown recently (avoid duplicate price display)
     */
    private checkDuplicatePriceShown(
        message: string,
        recentInteractions: ContextInteraction[]
    ): PolicyViolation | null {
        // Check if message contains price table or price listing
        const hasPriceTable = this.isPriceTable(message);
        
        if (!hasPriceTable) {
            return null;
        }

        // Check if we showed a price table in last 5 assistant messages
        let priceTableShownRecently = 0;
        const assistantMessages = recentInteractions
            .filter(i => i.role === 'assistant')
            .slice(-5);

        for (const interaction of assistantMessages) {
            if (this.isPriceTable(interaction.content)) {
                priceTableShownRecently++;
            }
        }

        if (priceTableShownRecently >= 2) {
            return {
                rule: 'duplicate_price_table',
                severity: 'warning',
                message: 'Price table already shown multiple times recently',
                suggestedFix: 'Avoid repeating full price tables; reference previously shown prices instead'
            };
        }

        return null;
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
    private readonly pricePatternRegex = /\$\s*[\d,]+/g;
    private readonly capacityPatternRegex = /\d+(GB|gb)/g;

    private isPriceTable(message: string): boolean {
        // A message is considered a price table if it has:
        // 1. Multiple price mentions
        // 2. Multiple capacity mentions
        // 3. List-like structure (multiple lines with similar patterns)
        
        const priceMatches = message.match(this.pricePatternRegex);
        const capacityMatches = message.match(this.capacityPatternRegex);
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
                    case 'price_contradiction':
                        // For price contradictions, remove conflicting prices and use context
                        transformed = this.fixPriceContradiction(transformed, context);
                        break;
                }
            }
        }

        return transformed;
    }

    /**
     * Fix price contradictions by removing conflicting price information
     */
    private fixPriceContradiction(message: string, context: MessagePolicyContext): string {
        // Get the consistent price from context memory
        const phone = context.userSession.phone;
        const recentInteractions = this.getContextMemory(phone, 10);
        
        // Find the last confirmed price
        let consistentPrice: number | undefined;
        for (let i = recentInteractions.length - 1; i >= 0; i--) {
            if (recentInteractions[i].metadata?.priceShown) {
                consistentPrice = recentInteractions[i].metadata.priceShown;
                break;
            }
        }

        if (!consistentPrice) {
            // No consistent price found, just remove all prices
            return message.replace(this.PRICE_EXTRACTION_PATTERN, '[precio según capacidad]');
        }

        // Replace prices with the consistent one or generic reference
        const lines = message.split('\n');
        const processedLines = lines.map(line => {
            // If line contains a price that's different from consistent, modify it
            const priceMatch = line.match(/\$\s*([\d,]+)/);
            if (priceMatch) {
                const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                if (price !== consistentPrice) {
                    // Keep the line but reference consistent pricing
                    return line.replace(/\$\s*[\d,]+/, `$${consistentPrice.toLocaleString()}`);
                }
            }
            return line;
        });

        return processedLines.join('\n');
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
        const trimmed = lines.join('\n');
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
