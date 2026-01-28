/**
 * Readability Budget Helper
 * 
 * Enforces message length and bullet constraints to improve WhatsApp reading/completion rates.
 * When content exceeds the budget, sends a short summary + CTA and stores details for the next turn.
 * 
 * Configuration:
 * - MAX_CHARS_PER_MESSAGE: 450 (configurable)
 * - MAX_BULLET_LINES: 6 (configurable)
 * - MORE_KEYWORD: 'MORE' - triggers retrieval of pending details
 */

export interface ReadabilityConfig {
    maxChars: number;
    maxBulletLines: number;
    moreKeyword: string;
    moreCTA: string;
}

export interface BudgetResult {
    /** The truncated/summarized message to send */
    message: string;
    /** Whether content was truncated (requires storing pendingDetails) */
    wasTruncated: boolean;
    /** The pending details to store in session if truncated */
    pendingDetails: string | null;
}

export interface PendingDetails {
    /** The full content that was truncated */
    content: string;
    /** Context about what kind of content this is */
    context: 'pricing' | 'combo' | 'capacity' | 'general';
    /** Timestamp when the content was stored */
    storedAt: string;
}

// Default configuration
const DEFAULT_CONFIG: ReadabilityConfig = {
    maxChars: 450,
    maxBulletLines: 6,
    moreKeyword: 'MORE',
    moreCTA: "Responde 'MORE' para ver más detalles."
};

/**
 * Check if user input is requesting more details
 */
export function isMoreRequest(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    return (
        normalized === 'more' ||
        normalized === 'mas' ||
        normalized === 'más' ||
        normalized === 'ver mas' ||
        normalized === 'ver más' ||
        normalized === 'detalles' ||
        normalized === 'mas detalles' ||
        normalized === 'más detalles'
    );
}

/**
 * Shared bullet pattern regex for detecting bullet lines
 * Bullet patterns: •, -, *, ✓, ✅, 🔹, 🎵, 🎬, etc.
 */
const BULLET_PATTERN = /^[\s]*[•\-\*✓✅🔹🎵🎬🎁📦💰⚡🔥⭐💎👑📊🎯🎶📼]/;

/**
 * Count bullet lines in a message
 */
function countBulletLines(content: string): number {
    const lines = content.split('\n');
    return lines.filter(line => BULLET_PATTERN.test(line)).length;
}

/**
 * Extract a summary from long content
 * Takes the first few lines or sentences as a teaser
 */
function extractSummary(content: string, maxChars: number, maxBulletLines: number): string {
    const lines = content.split('\n');
    const summaryLines: string[] = [];
    let currentChars = 0;
    let bulletCount = 0;
    
    // Reserve space for CTA
    const ctaSpace = 60;
    const targetMaxChars = maxChars - ctaSpace;
    
    for (const line of lines) {
        const lineLen = line.length + 1; // +1 for newline
        
        // Check if this is a bullet line
        if (BULLET_PATTERN.test(line)) {
            bulletCount++;
            if (bulletCount > maxBulletLines) {
                break; // Stop at max bullets
            }
        }
        
        // Check character limit
        if (currentChars + lineLen > targetMaxChars) {
            // Try to include partial line if it's short
            if (lineLen < 80 && summaryLines.length > 0) {
                break;
            }
            // If this is the first line and it's too long, truncate it
            if (summaryLines.length === 0) {
                const truncated = line.substring(0, targetMaxChars - 3) + '...';
                summaryLines.push(truncated);
            }
            break;
        }
        
        summaryLines.push(line);
        currentChars += lineLen;
    }
    
    return summaryLines.join('\n').trim();
}

/**
 * Apply readability budget to a message
 * If content exceeds budget, returns a summary with CTA and pending details
 * 
 * @param content - The full message content
 * @param config - Optional configuration override
 * @returns BudgetResult with message to send and pending details if truncated
 */
export function applyReadabilityBudget(
    content: string,
    config: Partial<ReadabilityConfig> = {}
): BudgetResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    // Handle empty or invalid content
    if (!content || typeof content !== 'string') {
        return {
            message: '',
            wasTruncated: false,
            pendingDetails: null
        };
    }
    
    // Handle whitespace-only content
    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
        return {
            message: '',
            wasTruncated: false,
            pendingDetails: null
        };
    }
    
    // Check if content exceeds budget
    const charCount = trimmedContent.length;
    const bulletCount = countBulletLines(trimmedContent);
    const exceedsCharLimit = charCount > cfg.maxChars;
    const exceedsBulletLimit = bulletCount > cfg.maxBulletLines;
    
    if (!exceedsCharLimit && !exceedsBulletLimit) {
        // Content is within budget, send as-is
        return {
            message: trimmedContent,
            wasTruncated: false,
            pendingDetails: null
        };
    }
    
    // Content exceeds budget - create summary with CTA
    const summary = extractSummary(trimmedContent, cfg.maxChars, cfg.maxBulletLines);
    const messageWithCTA = `${summary}\n\n${cfg.moreCTA}`;
    
    return {
        message: messageWithCTA,
        wasTruncated: true,
        pendingDetails: trimmedContent
    };
}

/**
 * Create pending details object to store in session
 */
export function createPendingDetails(
    content: string,
    context: PendingDetails['context']
): PendingDetails {
    return {
        content,
        context,
        storedAt: new Date().toISOString()
    };
}

/**
 * Format pending details for sending (when user requests MORE)
 * Optionally chunks into multiple messages if very long
 */
export function formatPendingDetails(
    pendingDetails: PendingDetails,
    maxChars: number = DEFAULT_CONFIG.maxChars
): string[] {
    const content = pendingDetails.content;
    
    // If content fits in one message, return as single item
    if (content.length <= maxChars) {
        return [content];
    }
    
    // Split into chunks by paragraph or bullet section
    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let currentLength = 0;
    
    for (const line of lines) {
        const lineLen = line.length + 1;
        
        if (currentLength + lineLen > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n').trim());
            currentChunk = [];
            currentLength = 0;
        }
        
        currentChunk.push(line);
        currentLength += lineLen;
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n').trim());
    }
    
    return chunks;
}

/**
 * Check if session has pending details
 */
export function hasPendingDetails(conversationData: any): boolean {
    return !!(conversationData?.pendingDetails?.content);
}

/**
 * Get pending details from session
 */
export function getPendingDetails(conversationData: any): PendingDetails | null {
    if (!conversationData?.pendingDetails?.content) {
        return null;
    }
    return conversationData.pendingDetails as PendingDetails;
}

/**
 * Clear pending details from session data
 * Returns a new object without pendingDetails
 */
export function clearPendingDetails(conversationData: any): any {
    if (!conversationData) {
        return {};
    }
    const { pendingDetails, ...rest } = conversationData;
    return rest;
}

// Export default config for reference
export const READABILITY_CONFIG = DEFAULT_CONFIG;
