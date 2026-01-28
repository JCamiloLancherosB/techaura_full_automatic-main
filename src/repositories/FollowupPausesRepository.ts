/**
 * FollowupPausesRepository
 * Manages follow-up pause status persistence for manual pause/unpause functionality
 */

import { pool } from '../mysql-database';
import { hashPhone } from '../utils/phoneHasher';
import { structuredLogger } from '../utils/structuredLogger';

export interface FollowupPause {
    id?: number;
    phone: string;
    phone_hash: string;
    is_paused: boolean;
    paused_by?: string;
    pause_reason?: string;
    paused_at?: Date;
    unpaused_at?: Date;
    unpaused_by?: string;
    created_at?: Date;
    updated_at?: Date;
}

export interface PauseResult {
    success: boolean;
    phone: string;
    phoneHash: string;
    isPaused: boolean;
    pausedBy?: string;
    pauseReason?: string;
    pausedAt?: Date;
}

export interface UnpauseResult {
    success: boolean;
    phone: string;
    phoneHash: string;
    isPaused: boolean;
    unpausedBy?: string;
    unpausedAt?: Date;
}

export class FollowupPausesRepository {
    private cache: Map<string, { isPaused: boolean; timestamp: number }> = new Map();
    private cacheTTL: number = 60 * 1000; // 1 minute TTL for cache

    /**
     * Normalize phone number for consistent storage
     */
    private normalizePhone(phone: string): string {
        return phone.replace(/\D/g, '');
    }

    /**
     * Check if follow-ups are paused for a phone number
     * @param phone - Phone number to check
     * @returns true if paused, false otherwise
     */
    async isPaused(phone: string): Promise<boolean> {
        const normalizedPhone = this.normalizePhone(phone);
        const phoneHash = hashPhone(normalizedPhone);

        // Check cache first
        const cached = this.cache.get(normalizedPhone);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.isPaused;
        }

        try {
            const [rows]: any = await pool.query(
                'SELECT is_paused FROM followup_pauses WHERE phone = ? LIMIT 1',
                [normalizedPhone]
            );

            const isPaused = rows.length > 0 && rows[0].is_paused === 1;

            // Update cache
            this.cache.set(normalizedPhone, { isPaused, timestamp: Date.now() });

            return isPaused;
        } catch (error) {
            // If table doesn't exist yet, return false (not paused)
            if ((error as any)?.code === 'ER_NO_SUCH_TABLE') {
                structuredLogger.warn('system', 'followup_pauses table does not exist yet', { phoneHash });
                return false;
            }
            structuredLogger.error('system', 'Error checking pause status', {
                phoneHash,
                error: error instanceof Error ? error.message : String(error)
            });
            // Fail-open: if we can't check, assume not paused
            return false;
        }
    }

    /**
     * Get pause details for a phone number
     * @param phone - Phone number
     * @returns Pause record or null
     */
    async getPauseDetails(phone: string): Promise<FollowupPause | null> {
        const normalizedPhone = this.normalizePhone(phone);

        try {
            const [rows]: any = await pool.query(
                'SELECT * FROM followup_pauses WHERE phone = ? LIMIT 1',
                [normalizedPhone]
            );

            if (rows.length === 0) {
                return null;
            }

            return {
                id: rows[0].id,
                phone: rows[0].phone,
                phone_hash: rows[0].phone_hash,
                is_paused: rows[0].is_paused === 1,
                paused_by: rows[0].paused_by,
                pause_reason: rows[0].pause_reason,
                paused_at: rows[0].paused_at,
                unpaused_at: rows[0].unpaused_at,
                unpaused_by: rows[0].unpaused_by,
                created_at: rows[0].created_at,
                updated_at: rows[0].updated_at
            };
        } catch (error) {
            if ((error as any)?.code === 'ER_NO_SUCH_TABLE') {
                return null;
            }
            structuredLogger.error('system', 'Error getting pause details', {
                phoneHash: hashPhone(normalizedPhone),
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Pause follow-ups for a phone number
     * @param phone - Phone number to pause
     * @param pausedBy - Who paused (admin user ID)
     * @param reason - Optional reason for pausing
     * @returns Pause result
     */
    async pause(phone: string, pausedBy?: string, reason?: string): Promise<PauseResult> {
        const normalizedPhone = this.normalizePhone(phone);
        const phoneHash = hashPhone(normalizedPhone);

        try {
            await pool.query(
                `INSERT INTO followup_pauses (phone, phone_hash, is_paused, paused_by, pause_reason, paused_at, created_at, updated_at)
                 VALUES (?, ?, TRUE, ?, ?, NOW(), NOW(), NOW())
                 ON DUPLICATE KEY UPDATE 
                 is_paused = TRUE,
                 paused_by = VALUES(paused_by),
                 pause_reason = VALUES(pause_reason),
                 paused_at = NOW(),
                 unpaused_at = NULL,
                 unpaused_by = NULL,
                 updated_at = NOW()`,
                [normalizedPhone, phoneHash, pausedBy, reason]
            );

            // Update cache
            this.cache.set(normalizedPhone, { isPaused: true, timestamp: Date.now() });

            structuredLogger.info('system', 'Follow-ups paused', {
                phoneHash,
                pausedBy,
                reason
            });

            return {
                success: true,
                phone: normalizedPhone,
                phoneHash,
                isPaused: true,
                pausedBy,
                pauseReason: reason,
                pausedAt: new Date()
            };
        } catch (error) {
            structuredLogger.error('system', 'Error pausing follow-ups', {
                phoneHash,
                error: error instanceof Error ? error.message : String(error)
            });
            return {
                success: false,
                phone: normalizedPhone,
                phoneHash,
                isPaused: false
            };
        }
    }

    /**
     * Unpause follow-ups for a phone number
     * @param phone - Phone number to unpause
     * @param unpausedBy - Who unpaused (admin user ID)
     * @returns Unpause result
     */
    async unpause(phone: string, unpausedBy?: string): Promise<UnpauseResult> {
        const normalizedPhone = this.normalizePhone(phone);
        const phoneHash = hashPhone(normalizedPhone);

        try {
            const [result]: any = await pool.query(
                `UPDATE followup_pauses 
                 SET is_paused = FALSE,
                     unpaused_at = NOW(),
                     unpaused_by = ?,
                     updated_at = NOW()
                 WHERE phone = ?`,
                [unpausedBy, normalizedPhone]
            );

            // Update cache
            this.cache.set(normalizedPhone, { isPaused: false, timestamp: Date.now() });

            const wasUpdated = result.affectedRows > 0;

            structuredLogger.info('system', 'Follow-ups unpaused', {
                phoneHash,
                unpausedBy,
                wasUpdated
            });

            return {
                success: true,
                phone: normalizedPhone,
                phoneHash,
                isPaused: false,
                unpausedBy,
                unpausedAt: new Date()
            };
        } catch (error) {
            structuredLogger.error('system', 'Error unpausing follow-ups', {
                phoneHash,
                error: error instanceof Error ? error.message : String(error)
            });
            return {
                success: false,
                phone: normalizedPhone,
                phoneHash,
                isPaused: true // Assume still paused on error
            };
        }
    }

    /**
     * Get all currently paused phone numbers
     * @param limit - Maximum number of records to return
     * @param offset - Offset for pagination
     * @returns Array of paused records
     */
    async getAllPaused(limit: number = 100, offset: number = 0): Promise<FollowupPause[]> {
        try {
            const [rows]: any = await pool.query(
                `SELECT * FROM followup_pauses 
                 WHERE is_paused = TRUE 
                 ORDER BY paused_at DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            return rows.map((row: any) => ({
                id: row.id,
                phone: row.phone,
                phone_hash: row.phone_hash,
                is_paused: row.is_paused === 1,
                paused_by: row.paused_by,
                pause_reason: row.pause_reason,
                paused_at: row.paused_at,
                unpaused_at: row.unpaused_at,
                unpaused_by: row.unpaused_by,
                created_at: row.created_at,
                updated_at: row.updated_at
            }));
        } catch (error) {
            if ((error as any)?.code === 'ER_NO_SUCH_TABLE') {
                return [];
            }
            structuredLogger.error('system', 'Error getting all paused', {
                error: error instanceof Error ? error.message : String(error)
            });
            return [];
        }
    }

    /**
     * Count total paused phone numbers
     * @returns Count of paused records
     */
    async countPaused(): Promise<number> {
        try {
            const [rows]: any = await pool.query(
                'SELECT COUNT(*) as count FROM followup_pauses WHERE is_paused = TRUE'
            );
            return rows[0]?.count || 0;
        } catch (error) {
            if ((error as any)?.code === 'ER_NO_SUCH_TABLE') {
                return 0;
            }
            structuredLogger.error('system', 'Error counting paused', {
                error: error instanceof Error ? error.message : String(error)
            });
            return 0;
        }
    }

    /**
     * Clear cache for a specific phone number
     */
    clearCache(phone?: string): void {
        if (phone) {
            const normalizedPhone = this.normalizePhone(phone);
            this.cache.delete(normalizedPhone);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Clear expired cache entries
     */
    clearExpiredCache(): void {
        const now = Date.now();
        for (const [key, cached] of this.cache.entries()) {
            if (now - cached.timestamp >= this.cacheTTL) {
                this.cache.delete(key);
            }
        }
    }
}

// Singleton instance
export const followupPausesRepository = new FollowupPausesRepository();

// Clean up expired cache every 5 minutes
setInterval(() => {
    followupPausesRepository.clearExpiredCache();
}, 5 * 60 * 1000);
