import { businessDB } from '../mysql-database';
import type { ShippingGuideData } from './ShippingGuideParser';

export interface MatchResult {
    matched: boolean;
    confidence: number; // 0-100
    customerId?: string;
    orderNumber?: string;
    phoneNumber?: string;
    matchedBy: 'phone' | 'name' | 'address' | 'order' | 'none';
}

export class CustomerMatcher {
    
    /**
     * Find customer in database matching shipping guide data
     */
    async findCustomer(guideData: ShippingGuideData): Promise<MatchResult> {
        // Try matching by phone first (highest confidence)
        if (guideData.customerPhone) {
            const byPhone = await this.matchByPhone(guideData.customerPhone);
            if (byPhone.matched) return byPhone;
        }
        
        // Try matching by name + city
        if (guideData.customerName) {
            const byName = await this.matchByNameAndCity(
                guideData.customerName, 
                guideData.city
            );
            if (byName.matched && byName.confidence >= 80) return byName;
        }
        
        // Try matching by address
        if (guideData.shippingAddress) {
            const byAddress = await this.matchByAddress(guideData.shippingAddress);
            if (byAddress.matched && byAddress.confidence >= 70) return byAddress;
        }
        
        return { matched: false, confidence: 0, matchedBy: 'none' };
    }
    
    private async matchByPhone(phone: string): Promise<MatchResult> {
        const sanitized = phone.replace(/\D/g, '').slice(-10);
        
        // Search in orders
        const orders = await businessDB.execute(`
            SELECT o.*, u.phone 
            FROM orders o
            LEFT JOIN user_sessions u ON o.phone_number = u.phone
            WHERE o.phone_number LIKE ? OR o.shipping_phone LIKE ?
            ORDER BY o.created_at DESC
            LIMIT 1
        `, [`%${sanitized}%`, `%${sanitized}%`]) as any;
        
        if (orders[0]?.length > 0) {
            const order = orders[0][0];
            return {
                matched: true,
                confidence: 100,
                customerId: order.id,
                orderNumber: order.order_number,
                phoneNumber: order.phone_number,
                matchedBy: 'phone'
            };
        }
        
        return { matched: false, confidence: 0, matchedBy: 'none' };
    }
    
    private async matchByNameAndCity(name: string, city?: string): Promise<MatchResult> {
        const nameParts = name.toLowerCase().split(/\s+/);
        
        let sql = `
            SELECT * FROM orders 
            WHERE LOWER(customer_name) LIKE ?
        `;
        const params: string[] = [`%${nameParts[0]}%`];
        
        if (city) {
            sql += ` AND LOWER(shipping_address) LIKE ?`;
            params.push(`%${city.toLowerCase()}%`);
        }
        
        sql += ` ORDER BY created_at DESC LIMIT 5`;
        
        const [orders] = await businessDB.execute(sql, params) as any;
        
        if (orders.length > 0) {
            // Calculate similarity score
            const best = orders.reduce((best: any, order: any) => {
                const similarity = this.calculateNameSimilarity(name, order.customer_name);
                return similarity > (best?.similarity || 0) ? { ...order, similarity } : best;
            }, null);
            
            if (best && best.similarity >= 0.8) {
                return {
                    matched: true,
                    confidence: Math.round(best.similarity * 100),
                    customerId: best.id,
                    orderNumber: best.order_number,
                    phoneNumber: best.phone_number,
                    matchedBy: 'name'
                };
            }
        }
        
        return { matched: false, confidence: 0, matchedBy: 'none' };
    }
    
    private async matchByAddress(address: string): Promise<MatchResult> {
        const addressLower = address.toLowerCase();
        const addressWords = addressLower.split(/\s+/).filter(w => w.length > 3);
        
        if (addressWords.length === 0) {
            return { matched: false, confidence: 0, matchedBy: 'none' };
        }
        
        // Search for orders with similar addresses
        let sql = `
            SELECT * FROM orders 
            WHERE shipping_address IS NOT NULL
        `;
        
        // Add conditions for each significant word in the address
        const conditions = addressWords.slice(0, 3).map(() => 'LOWER(shipping_address) LIKE ?');
        if (conditions.length > 0) {
            sql += ` AND (${conditions.join(' OR ')})`;
        }
        
        sql += ` ORDER BY created_at DESC LIMIT 5`;
        
        const params = addressWords.slice(0, 3).map(word => `%${word}%`);
        
        const [orders] = await businessDB.execute(sql, params) as any;
        
        if (orders.length > 0) {
            // Calculate address similarity score
            const best = orders.reduce((best: any, order: any) => {
                if (!order.shipping_address) return best;
                const similarity = this.calculateAddressSimilarity(address, order.shipping_address);
                return similarity > (best?.similarity || 0) ? { ...order, similarity } : best;
            }, null);
            
            if (best && best.similarity >= 0.7) {
                return {
                    matched: true,
                    confidence: Math.round(best.similarity * 100),
                    customerId: best.id,
                    orderNumber: best.order_number,
                    phoneNumber: best.phone_number,
                    matchedBy: 'address'
                };
            }
        }
        
        return { matched: false, confidence: 0, matchedBy: 'none' };
    }
    
    private calculateNameSimilarity(name1: string, name2: string): number {
        const s1 = name1.toLowerCase().trim();
        const s2 = name2.toLowerCase().trim();
        
        if (s1 === s2) return 1;
        
        const words1 = s1.split(/\s+/).filter(w => w.length >= 3); // Min 3 chars to avoid false positives
        const words2 = s2.split(/\s+/).filter(w => w.length >= 3);
        
        let matches = 0;
        for (const w1 of words1) {
            for (const w2 of words2) {
                // Require at least 70% character overlap to match
                if (w2.includes(w1) || w1.includes(w2)) {
                    const minLen = Math.min(w1.length, w2.length);
                    const maxLen = Math.max(w1.length, w2.length);
                    if (minLen / maxLen >= 0.7) {
                        matches++;
                        break; // Count each word once
                    }
                }
            }
        }
        
        return matches / Math.max(words1.length, words2.length);
    }
    
    private calculateAddressSimilarity(addr1: string, addr2: string): number {
        const s1 = addr1.toLowerCase().trim();
        const s2 = addr2.toLowerCase().trim();
        
        if (s1 === s2) return 1;
        
        const words1 = s1.split(/\s+/).filter(w => w.length > 2);
        const words2 = s2.split(/\s+/).filter(w => w.length > 2);
        
        let matches = 0;
        for (const w1 of words1) {
            if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
                matches++;
            }
        }
        
        return matches / Math.max(words1.length, words2.length);
    }
}
