/**
 * Price Ladder Utility
 * Generates compact, stage-aware persuasion messages with price paths
 * 
 * Requirements:
 * - Messages must be < 450 characters
 * - No artist names in price ladder
 * - Provides 3-4 capacities with price + content range
 */

import { PRICING, formatPrice, getCapacityInfo } from '../constants/pricing';

type ProductType = 'music' | 'videos' | 'movies';

/**
 * Short prompt to show after genres are captured
 * Leads user to see prices/sizes
 */
export const GENRE_CAPTURED_PROMPT = 
    'Puedo personalizarlo por géneros. ¿Ver tamaños + precios? Responde OK o 1/2/3/4.';

/**
 * Generates a compact price ladder message for a product type
 * Max ~400 chars to stay under 450 limit
 * 
 * @param productType - 'music', 'videos', or 'movies'
 * @returns Compact price ladder string
 */
export function buildCompactPriceLadder(productType: ProductType): string {
    const pricing = PRICING[productType];
    if (!pricing) return '';
    
    const capacities = Object.keys(pricing);
    const lines: string[] = ['📦 *Tamaños y precios:*'];
    
    capacities.forEach((cap, idx) => {
        const info = getCapacityInfo(productType, cap);
        const price = formatPrice(pricing[cap].price);
        const popular = idx === 1 ? ' ⭐' : ''; // Mark second option as popular
        
        if (info) {
            // Format: 1️⃣ 32GB ~5K canciones $84.900 ⭐
            const count = info.count >= 1000 ? `${Math.round(info.count / 1000)}K` : info.count.toString();
            lines.push(`${idx + 1}️⃣ ${cap} ~${count} ${info.type} ${price}${popular}`);
        }
    });
    
    lines.push('', '🚚 Envío GRATIS · 🛡️ Garantía 7 días');
    lines.push('Responde 1-4 para elegir 👇');
    
    return lines.join('\n');
}

/**
 * Build a very short price ladder for inline use (< 300 chars)
 */
export function buildInlinePriceLadder(productType: ProductType): string {
    const pricing = PRICING[productType];
    if (!pricing) return '';
    
    const capacities = Object.keys(pricing);
    const parts: string[] = [];
    
    capacities.forEach((cap, idx) => {
        const info = getCapacityInfo(productType, cap);
        const price = formatPrice(pricing[cap].price);
        
        if (info) {
            const count = info.count >= 1000 ? `${Math.round(info.count / 1000)}K` : info.count.toString();
            const star = idx === 1 ? '⭐' : '';
            parts.push(`${idx + 1}️⃣${cap}(${count})${price}${star}`);
        }
    });
    
    return parts.join(' · ');
}

/**
 * Message shown after user provides genres (or says "de todo")
 * Short and price-forward
 */
export function buildPostGenrePrompt(productType: ProductType, genres?: string[]): string {
    const genreText = genres && genres.length > 0 
        ? `✅ *${genres.slice(0, 3).join(', ')}* anotado.`
        : '✅ *Mix variado* anotado.';
    
    return `${genreText}\n\n${GENRE_CAPTURED_PROMPT}`;
}

/**
 * Quick price summary for direct pricing intent
 * Shown when user asks "cuánto cuesta" or "precio"
 */
export function buildQuickPriceResponse(productType: ProductType): string {
    return buildCompactPriceLadder(productType);
}

/**
 * Validates message length is under 450 characters
 */
export function validateMessageLength(message: string, maxLength = 450): boolean {
    return message.length <= maxLength;
}

/**
 * Truncate message to fit within max length while preserving structure
 */
export function truncateToLength(message: string, maxLength = 450): string {
    if (message.length <= maxLength) return message;
    
    // Find last complete line that fits
    const lines = message.split('\n');
    let result = '';
    
    for (const line of lines) {
        const test = result ? `${result}\n${line}` : line;
        if (test.length > maxLength - 10) break; // Leave room for ellipsis
        result = test;
    }
    
    return result + '\n...';
}
