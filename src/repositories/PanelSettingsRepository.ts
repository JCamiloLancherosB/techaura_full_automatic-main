/**
 * PanelSettingsRepository
 * Manages control panel settings persistence with in-memory cache
 */

import { pool } from '../mysql-database';

export interface PanelSetting {
    id?: number;
    setting_key: string;
    setting_value: any;
    category?: string;
    updated_at?: Date;
    updated_by?: string;
}

export class PanelSettingsRepository {
    private cache: Map<string, { value: any; timestamp: number }> = new Map();
    private cacheTTL: number = 5 * 60 * 1000; // 5 minutes TTL

    /**
     * Get setting by key
     */
    async get(key: string): Promise<any | null> {
        // Check cache first
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.value;
        }

        try {
            const [rows]: any = await pool.query(
                'SELECT setting_value FROM panel_settings WHERE setting_key = ?',
                [key]
            );

            if (rows.length === 0) {
                return null;
            }

            const value = typeof rows[0].setting_value === 'string' 
                ? JSON.parse(rows[0].setting_value)
                : rows[0].setting_value;

            // Update cache
            this.cache.set(key, { value, timestamp: Date.now() });

            return value;
        } catch (error) {
            console.error('Error getting setting:', error);
            return null;
        }
    }

    /**
     * Set setting value
     */
    async set(key: string, value: any, category?: string, updatedBy?: string): Promise<boolean> {
        try {
            const valueJson = JSON.stringify(value);

            await pool.query(
                `INSERT INTO panel_settings (setting_key, setting_value, category, updated_by) 
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                 setting_value = VALUES(setting_value),
                 category = VALUES(category),
                 updated_by = VALUES(updated_by),
                 updated_at = CURRENT_TIMESTAMP`,
                [key, valueJson, category, updatedBy]
            );

            // Update cache
            this.cache.set(key, { value, timestamp: Date.now() });

            return true;
        } catch (error) {
            console.error('Error setting value:', error);
            return false;
        }
    }

    /**
     * Get all settings by category
     */
    async getByCategory(category: string): Promise<PanelSetting[]> {
        try {
            const [rows]: any = await pool.query(
                'SELECT * FROM panel_settings WHERE category = ? ORDER BY setting_key',
                [category]
            );

            return rows.map((row: any) => ({
                id: row.id,
                setting_key: row.setting_key,
                setting_value: typeof row.setting_value === 'string' 
                    ? JSON.parse(row.setting_value)
                    : row.setting_value,
                category: row.category,
                updated_at: row.updated_at,
                updated_by: row.updated_by,
            }));
        } catch (error) {
            console.error('Error getting settings by category:', error);
            return [];
        }
    }

    /**
     * Get all settings
     */
    async getAll(): Promise<PanelSetting[]> {
        try {
            const [rows]: any = await pool.query(
                'SELECT * FROM panel_settings ORDER BY category, setting_key'
            );

            return rows.map((row: any) => ({
                id: row.id,
                setting_key: row.setting_key,
                setting_value: typeof row.setting_value === 'string' 
                    ? JSON.parse(row.setting_value)
                    : row.setting_value,
                category: row.category,
                updated_at: row.updated_at,
                updated_by: row.updated_by,
            }));
        } catch (error) {
            console.error('Error getting all settings:', error);
            return [];
        }
    }

    /**
     * Delete setting
     */
    async delete(key: string): Promise<boolean> {
        try {
            await pool.query('DELETE FROM panel_settings WHERE setting_key = ?', [key]);
            this.cache.delete(key);
            return true;
        } catch (error) {
            console.error('Error deleting setting:', error);
            return false;
        }
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
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

    /**
     * Bulk set settings
     */
    async bulkSet(settings: Array<{ key: string; value: any; category?: string }>, updatedBy?: string): Promise<boolean> {
        try {
            for (const setting of settings) {
                await this.set(setting.key, setting.value, setting.category, updatedBy);
            }
            return true;
        } catch (error) {
            console.error('Error bulk setting values:', error);
            return false;
        }
    }

    /**
     * Export all settings as JSON
     */
    async exportSettings(): Promise<{ [key: string]: any }> {
        const settings = await this.getAll();
        const exported: { [key: string]: any } = {};

        for (const setting of settings) {
            exported[setting.setting_key] = setting.setting_value;
        }

        return exported;
    }

    /**
     * Import settings from JSON
     */
    async importSettings(data: { [key: string]: any }, category?: string, updatedBy?: string): Promise<boolean> {
        try {
            for (const [key, value] of Object.entries(data)) {
                await this.set(key, value, category, updatedBy);
            }
            return true;
        } catch (error) {
            console.error('Error importing settings:', error);
            return false;
        }
    }
}

// Singleton instance
export const panelSettingsRepository = new PanelSettingsRepository();

// Clean up expired cache every 10 minutes
setInterval(() => {
    panelSettingsRepository.clearExpiredCache();
}, 10 * 60 * 1000);
