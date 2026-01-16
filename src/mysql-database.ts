// src/mysql-database.ts

import { MysqlAdapter } from '@builderbot/database-mysql';
import type { CustomerOrder, UserSession } from '../types/global';
import { OrderStatus, PaymentMethod, ProductType } from '../types/enums';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { runAssuredFollowUps, registerExternalSilentUsers } from './flows/userTrackingSystem';
import { addFollowUpColumns } from './database/migrations/add-followup-columns';
import { getDBConfig, logDBConfig, validateDBConfig, createMySQLConfig, getDBErrorTroubleshooting } from './utils/dbConfig';
import { logConnectionSuccess, logConnectionFailure, logInitializationStart, logInitializationSuccess, logInitializationFailure } from './utils/dbLogger';
import { retryAsync, shouldRetry, createDBRetryOptions } from './utils/dbRetry';

// ✅ CARGAR VARIABLES DE ENTORNO AL INICIO
dotenv.config();

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function normalizePhoneNumber(phone: string): string {
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    // Colombia: 10 dígitos nacionales → anteponer 57
    if (cleaned.length === 10 && !cleaned.startsWith('57')) {
        return '57' + cleaned;
    }
    // Si llega con 57 pero sin '+', lo dejamos tal cual (la BD guarda sin '+')
    return cleaned;
}

/**
 * Sanitizes phone number for database storage:
 * - Strips non-digits
 * - Removes JID suffixes (@s.whatsapp.net, @c.us, etc.)
 * - Caps at 20 characters to prevent ER_DATA_TOO_LONG errors
 * - Logs warning if phone exceeds 20 chars after cleaning
 */
function sanitizePhoneForDB(phone: string): string {
    if (!phone || typeof phone !== 'string') {
        console.warn('⚠️ Invalid phone number for DB sanitization:', phone);
        return '';
    }

    // Remove JID suffixes and clean
    const cleaned = phone
        .replace(/@s\.whatsapp\.net$/i, '')
        .replace(/@c\.us$/i, '')
        .replace(/@lid$/i, '')
        .replace(/@g\.us$/i, '')
        .replace(/@broadcast$/i, '')
        .replace(/\D/g, ''); // Remove all non-digit characters

    // Cap at 20 characters (DB column limit)
    if (cleaned.length > 20) {
        console.warn(`⚠️ Phone number too long for DB (${cleaned.length} chars), truncating to 20: ${cleaned} -> ${cleaned.substring(0, 20)}`);
        return cleaned.substring(0, 20);
    }

    return cleaned;
}

function mapToUserSession(user: any): UserSession {
    return {
        phone: user.phone,
        phoneNumber: user.phone,
        name: user.name,
        buyingIntent: user.buyingIntent || user.buying_intent || 0,
        stage: user.stage,
        interests: Array.isArray(user.interests) ?
            user.interests :
            (typeof user.interests === 'string' ?
                JSON.parse(user.interests || '[]') : []),
        interactions: Array.isArray(user.interactions) ?
            user.interactions :
            (typeof user.interactions === 'string' ?
                JSON.parse(user.interactions || '[]') : []),
        conversationData: typeof user.conversationData === 'string' ?
            JSON.parse(user.conversationData || '{}') :
            (user.conversationData || {}),
        lastInteraction: user.lastInteraction instanceof Date ?
            user.lastInteraction : new Date(user.lastInteraction || Date.now()),
        lastFollowUp: user.lastFollowUp instanceof Date ?
            user.lastFollowUp : new Date(user.lastFollowUp || Date.now()),
        followUpSpamCount: user.followUpSpamCount || user.follow_up_spam_count || 0,
        totalOrders: user.totalOrders || user.total_orders || 0,
        location: user.location || '',
        email: user.email || '',
        pushToken: user.pushToken || user.push_token || '',
        createdAt: user.created_at ? new Date(user.created_at) : (user.createdAt ? new Date(user.createdAt) : new Date()),
        updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date(),
        lastActivity: user.lastActivity ? new Date(user.lastActivity) : new Date(),
        messageCount: user.messageCount || 0,
        isActive: user.isActive !== undefined ? user.isActive : true,
        isNewUser: user.isNewUser !== undefined ? user.isNewUser : false,
        isReturningUser: user.isReturningUser !== undefined ? user.isReturningUser : false,
        isFirstMessage: user.isFirstMessage !== undefined ? user.isFirstMessage : false,
        demographics: user.demographics ?
            (typeof user.demographics === 'string' ?
                JSON.parse(user.demographics) : user.demographics) :
            { age: null, location: user.location || '' },
        preferences: user.preferences ?
            (typeof user.preferences === 'string' ?
                JSON.parse(user.preferences) : user.preferences) :
            { musicGenres: [], priceRange: { min: 0, max: 100000 } },
        // New follow-up control fields
        contactStatus: user.contact_status || 'ACTIVE',
        lastUserReplyAt: user.last_user_reply_at ? new Date(user.last_user_reply_at) : undefined,
        lastUserReplyCategory: user.last_user_reply_category || undefined,
        followUpCount24h: user.follow_up_count_24h || 0,
        lastFollowUpResetAt: user.last_follow_up_reset_at ? new Date(user.last_follow_up_reset_at) : undefined,
        followUpAttempts: user.follow_up_attempts || 0,
        lastFollowUpAttemptResetAt: user.last_follow_up_attempt_reset_at ? new Date(user.last_follow_up_attempt_reset_at) : undefined,
        cooldownUntil: user.cooldown_until ? new Date(user.cooldown_until) : undefined
    };
}

// ============================================
// INTERFACES
// ============================================

export interface OrderStatistics {
    total_orders: number;
    completed_orders: number;
    pending_orders: number;
    processing_orders: number;
    error_orders?: number;
    failed_orders?: number;
    total_revenue: number;
    average_price: number;
}

interface MessageLog {
    phone: string;
    message: string;
    type: 'incoming' | 'outgoing';
    automated?: boolean;
    timestamp: Date;
}

interface InteractionLog {
    phone: string;
    type: string;
    content: string;
    timestamp: Date;
}

interface FollowUpEvent {
    phone: string;
    type: 'high' | 'medium' | 'low';
    messages: string[];
    success: boolean;
    timestamp: Date;
    reason?: string;
    buyingIntent?: number;
}

// ============================================
// CONFIGURACIÓN DE CONEXIÓN
// ============================================

// ✅ OBTENER Y VALIDAR CONFIGURACIÓN
let DB_CONFIG: ReturnType<typeof getDBConfig>;

try {
    DB_CONFIG = getDBConfig({ requirePassword: true });
    validateDBConfig(DB_CONFIG);
    logDBConfig(DB_CONFIG);
} catch (error: any) {
    console.error('\n' + error.message);
    console.error('\n💡 AYUDA:');
    console.error('   1. Copia .env.example a .env: cp .env.example .env');
    console.error('   2. Edita .env y configura las variables de MySQL');
    console.error('   3. Asegúrate de que MySQL está corriendo y la base de datos existe');
    console.error('   4. Verifica que el usuario MySQL tiene los permisos necesarios\n');
    process.exit(1);
}

// ✅ ADAPTER OFICIAL DE BUILDERBOT
export const adapterDB = new MysqlAdapter(DB_CONFIG);

// ✅ POOL DE CONEXIONES PERSONALIZADO CON TIMEOUT
const poolConfig = createMySQLConfig(DB_CONFIG, {
    connectionLimit: 10,
    connectTimeout: 10000,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

export const pool = mysql.createPool(poolConfig);

// Candidatos desde MySQL a “no registrados” y silenciosos
export async function syncUnregisteredSilentUsersAndFollowUp(limit = 500) {
    try {
        // 1) Traer usuarios de BD que no estén en memoria o llevan días sin hablar
        const execRes: any = await businessDB.execute(
            `SELECT phone 
       FROM user_sessions 
       WHERE (last_interaction < DATE_SUB(NOW(), INTERVAL 3 DAY))
          OR (last_interaction IS NULL)
       ORDER BY last_interaction ASC
       LIMIT ?`,
            [limit]
        );
        const rows = Array.isArray(execRes[0]) ? execRes[0] : [];

        const dbPhones: string[] = Array.isArray(rows) ? rows.map((r: any) => r.phone).filter(Boolean) : [];
        const notInCache = dbPhones.filter(p => !userSessions.has(p));

        // 2) Registra en cache como “no registrados” (memoria) para cubrirlos en los segmentos longSilent
        if (notInCache.length) {
            await registerExternalSilentUsers(notInCache);
            console.log(`🔗 Sincronizados ${notInCache.length} usuarios no-cache desde MySQL`);
        }

        // 3) Ejecución de follow-ups asegurados (respeta ventanas horarias)
        return await runAssuredFollowUps(150);
    } catch (e) {
        console.error('❌ Error en syncUnregisteredSilentUsersAndFollowUp:', e);
        return { sent: 0, error: 'sync_failed' };
    }
}

// Cron diario a las 10:05 AM para sincronizar “no registrados” y enviar asegurados
setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    if (hour === 10 && minute >= 5 && minute < 10) {
        await syncUnregisteredSilentUsersAndFollowUp().catch(e => console.warn('⚠️ syncUnregisteredSilentUsers error:', e));
    }
}, 5 * 60 * 1000);

// ✅ FUNCIÓN AUXILIAR PARA QUERIES
export async function query(sql: string, params?: any[]) {
    const [rows] = await pool.query(sql, params);
    return rows;
}

// ============================================
// CLASE PRINCIPAL: MySQLBusinessManager
// ============================================

export class MySQLBusinessManager {
    private pool: mysql.Pool;
    private tablesCreated = {
        conversationTurns: false,
        flowTransitions: false
    };

    constructor() {
        this.pool = mysql.createPool({
            ...DB_CONFIG,
            connectionLimit: 20,
            connectTimeout: 60000,
            charset: 'utf8mb4',
            waitForConnections: true,
            queueLimit: 0
        });

        console.log('✅ MySQLBusinessManager inicializado correctamente');
    }

    // ============================================
    // MÉTODOS DE CONEXIÓN Y VERIFICACIÓN
    // ============================================
    public async ensureUserCustomizationStateTable(): Promise<void> {
        try {
            await this.pool.execute(`
            CREATE TABLE IF NOT EXISTS user_customization_states (
                phone_number VARCHAR(32) NOT NULL,
                selected_genres TEXT NULL,
                mentioned_artists TEXT NULL,
                customization_stage VARCHAR(50) NOT NULL DEFAULT 'initial',
                last_personalization_time DATETIME NULL,
                personalization_count INT NOT NULL DEFAULT 0,
                entry_time DATETIME NULL,
                conversion_stage VARCHAR(50) NULL,
                interaction_count INT NOT NULL DEFAULT 0,
                touchpoints TEXT NULL,
                usb_name VARCHAR(255) NULL,
                mood_preferences TEXT NULL,
                preferred_eras TEXT NULL,
                video_quality VARCHAR(20) NULL,
                showed_preview TINYINT(1) NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (phone_number),
                INDEX idx_stage (customization_stage),
                INDEX idx_updated (updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        } catch (e) {
            console.error('❌ Error asegurando user_customization_states:', e);
        }
    }


    public async testConnection(): Promise<boolean> {
        const retryOptions = createDBRetryOptions({
            maxAttempts: 3,
            initialDelayMs: 2000,
            onRetry: (attempt, error) => {
                logConnectionFailure(error, DB_CONFIG, attempt, 3);
            }
        });

        try {
            const result = await retryAsync(async () => {
                const connection = await this.pool.getConnection();
                await connection.ping();
                connection.release();
                return true;
            }, retryOptions);

            logConnectionSuccess(DB_CONFIG);
            return result;
        } catch (error: any) {
            logConnectionFailure(error, DB_CONFIG, 3, 3);
            console.error(getDBErrorTroubleshooting(error, DB_CONFIG));
            return false;
        }
    }

    public async checkConnection(): Promise<boolean> {
        try {
            await this.pool.execute('SELECT 1');
            return true;
        } catch (error) {
            console.error('❌ Error verificando conexión:', error);
            return false;
        }
    }

    public async initialize(): Promise<void> {
        logInitializationStart();

        const retryOptions = createDBRetryOptions({
            maxAttempts: 3,
            initialDelayMs: 2000,
            onRetry: (attempt, error) => {
                logConnectionFailure(error, DB_CONFIG, attempt, 3);
                console.log('🔄 Verificando que MySQL está corriendo y la base de datos existe...');
            }
        });

        try {
            // Test connection with retry
            await retryAsync(async () => {
                const connection = await this.pool.getConnection();
                await connection.ping();
                connection.release();
            }, retryOptions);

            // Create tables
            await this.createTables();
            await this.ensureProcessingJobsV2();
            await this.ensureUserSessionsSchema();
            await this.ensureConversationTurnsTable();
            await this.ensureFlowTransitionsTable();
            
            // Run follow-up columns migration
            await addFollowUpColumns(this.pool);
            
            logInitializationSuccess();
        } catch (error: any) {
            logInitializationFailure(error);
            console.error(getDBErrorTroubleshooting(error, DB_CONFIG));
            throw error;
        }
    }

    // ✅ ALIAS PARA COMPATIBILIDAD
    public async initializeDatabase(): Promise<void> {
        return this.initialize();
    }

    // ============================================
    // CREACIÓN DE TABLAS
    // ============================================

    private async createTables(): Promise<void> {
        const tables = [
            // Tabla de sesiones de usuario
            `CREATE TABLE IF NOT EXISTS user_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                buying_intent INT DEFAULT 0,
                stage VARCHAR(255) DEFAULT 'initial',
                interests JSON,
                interactions JSON,
                conversation_data JSON,
                last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_follow_up DATETIME NULL,
                follow_up_spam_count INT DEFAULT 0,
                total_orders INT DEFAULT 0,
                location VARCHAR(255) NULL,
                email VARCHAR(255) NULL,
                push_token VARCHAR(500) NULL,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                message_count INT DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                is_new_user BOOLEAN DEFAULT TRUE,
                is_returning_user BOOLEAN DEFAULT FALSE,
                is_first_message BOOLEAN DEFAULT TRUE,
                demographics JSON,
                preferences JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_phone (phone),
                INDEX idx_last_interaction (last_interaction),
                INDEX idx_buying_intent (buying_intent),
                INDEX idx_stage (stage)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de órdenes
            `CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_number VARCHAR(255) UNIQUE NOT NULL,
                phone_number VARCHAR(255) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                product_type VARCHAR(50) NOT NULL,
                capacity VARCHAR(255) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                customization JSON NOT NULL,
                preferences JSON NOT NULL,
                processing_status ENUM('pending', 'processing', 'completed', 'error', 'failed') DEFAULT 'pending',
                usb_label VARCHAR(255),
                total_amount DECIMAL(10, 2) DEFAULT 0,
                discount_amount DECIMAL(10, 2) DEFAULT 0,
                shipping_address TEXT,
                shipping_phone VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_phone (phone_number),
                INDEX idx_status (processing_status),
                INDEX idx_created (created_at),
                INDEX idx_order_number (order_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de mensajes
            `CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                message TEXT,
                type ENUM('incoming', 'outgoing') NOT NULL,
                automated BOOLEAN DEFAULT FALSE,
                body TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_phone (phone),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de interacciones
            `CREATE TABLE IF NOT EXISTS interactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                type VARCHAR(50) NOT NULL,
                content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_phone (phone),
                INDEX idx_type (type),
                INDEX idx_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de eventos de seguimiento
            `CREATE TABLE IF NOT EXISTS follow_up_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                type ENUM('high', 'medium', 'low') NOT NULL,
                messages JSON NOT NULL,
                success BOOLEAN DEFAULT TRUE,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_phone (phone),
                INDEX idx_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de analytics
            `CREATE TABLE IF NOT EXISTS analytics_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(50) NOT NULL,
                event_type VARCHAR(100) NOT NULL,
                event_data JSON NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_phone (phone),
                INDEX idx_event_type (event_type),
                INDEX idx_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de processing jobs (v1 base)
            `CREATE TABLE IF NOT EXISTS processing_jobs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id VARCHAR(255) UNIQUE NOT NULL,
                order_id VARCHAR(255) NOT NULL,
                customer_phone VARCHAR(255) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                capacity VARCHAR(50) NOT NULL,
                content_type ENUM('music', 'videos', 'movies', 'mixed') NOT NULL,
                preferences JSON,
                content_list JSON,
                customizations JSON,
                status ENUM('queued', 'processing', 'completed', 'error', 'failed') DEFAULT 'queued',
                progress INT DEFAULT 0,
                priority INT DEFAULT 5,
                logs JSON,
                error TEXT NULL,
                estimated_time INT,
                started_at DATETIME NULL,
                completed_at DATETIME NULL,
                quality_report JSON NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_job_id (job_id),
                INDEX idx_status (status),
                INDEX idx_customer_phone (customer_phone)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de notificaciones
            `CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id VARCHAR(255) NOT NULL,
                type VARCHAR(100) NOT NULL,
                channel VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                sent_at DATETIME NOT NULL,
                status VARCHAR(50) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_job_id (job_id),
                INDEX idx_type (type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de estadísticas diarias
            `CREATE TABLE IF NOT EXISTS daily_stats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                date DATE UNIQUE NOT NULL,
                stats_data JSON NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_date (date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de logs de seguimiento
            `CREATE TABLE IF NOT EXISTS follow_up_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                messages JSON NOT NULL,
                success BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_phone (phone),
                INDEX idx_created_at (created_at),
                INDEX idx_type (type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de logs de errores
            `CREATE TABLE IF NOT EXISTS error_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(100) NOT NULL,
                error_message TEXT NOT NULL,
                stack_trace TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_type (type),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de carritos abandonados
            `CREATE TABLE IF NOT EXISTS abandoned_carts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cart_id VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(20) NOT NULL,
                cart_data JSON NOT NULL,
                recovery_status ENUM('pending', 'in_progress', 'recovered', 'failed') DEFAULT 'pending',
                recovery_stage INT DEFAULT 0,
                last_recovery_sent DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_phone (phone),
                INDEX idx_status (recovery_status),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de mensajes de recuperación
            `CREATE TABLE IF NOT EXISTS recovery_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cart_id VARCHAR(255) NOT NULL,
                message_type ENUM('initial', 'followup', 'final') NOT NULL,
                message_content TEXT NOT NULL,
                incentive_type ENUM('none', 'discount', 'combo') DEFAULT 'none',
                incentive_value INT NULL,
                free_shipping BOOLEAN DEFAULT FALSE,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                response_received BOOLEAN DEFAULT FALSE,
                INDEX idx_cart_id (cart_id),
                INDEX idx_sent_at (sent_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de confirmaciones de pedidos
            `CREATE TABLE IF NOT EXISTS order_confirmations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id VARCHAR(100) NOT NULL,
                customer_phone VARCHAR(20) NOT NULL,
                customer_name VARCHAR(100),
                customer_cedula VARCHAR(20),
                shipping_address TEXT,
                shipping_city VARCHAR(100),
                shipping_department VARCHAR(100),
                payment_method VARCHAR(50),
                total_amount DECIMAL(12,2),
                status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
                confirmed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_phone (customer_phone),
                INDEX idx_status (status),
                INDEX idx_order (order_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

            // Tabla de configuración del panel de control
            `CREATE TABLE IF NOT EXISTS panel_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(100) UNIQUE NOT NULL,
                setting_value JSON,
                category VARCHAR(50),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                updated_by VARCHAR(100),
                INDEX idx_key (setting_key),
                INDEX idx_category (category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ];

        try {
            for (const table of tables) {
                await this.pool.execute(table);
            }
            console.log('✅ Tablas creadas/verificadas en MySQL');
        } catch (error) {
            console.error('❌ Error creando tablas:', error);
            throw error;
        }
    }

    // ============================================
    // MIGRACIÓN LIGERA A V2 PARA processing_jobs
    // ============================================

    private async ensureProcessingJobsV2(): Promise<void> {
        try {
            // Algunos MySQL no soportan ADD COLUMN IF NOT EXISTS: usar INFORMATION_SCHEMA
            const [cols]: any = await this.pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'processing_jobs'`,
                [DB_CONFIG.database]
            );
            const have = (name: string) => cols.some((c: any) => c.COLUMN_NAME === name);
            const alters: string[] = [];
            if (!have('usb_capacity')) alters.push('ADD COLUMN usb_capacity VARCHAR(50) NULL');
            if (!have('content_plan_id')) alters.push('ADD COLUMN content_plan_id VARCHAR(255) NULL');
            if (!have('volume_label')) alters.push('ADD COLUMN volume_label VARCHAR(255) NULL');
            if (!have('assigned_device_id')) alters.push('ADD COLUMN assigned_device_id VARCHAR(255) NULL');
            if (!have('fail_reason')) alters.push('ADD COLUMN fail_reason TEXT NULL');
            if (!have('started_at')) alters.push('ADD COLUMN started_at DATETIME NULL');
            if (!have('finished_at')) alters.push('ADD COLUMN finished_at DATETIME NULL');
            if (alters.length) {
                await this.pool.execute(`ALTER TABLE processing_jobs ${alters.join(', ')}`);
                console.log('✅ processing_jobs actualizado a v2 (compatibilidad)');
            } else {
                console.log('ℹ️ processing_jobs ya compatible con v2');
            }
        } catch (e) {
            console.error('❌ Error ajustando tabla processing_jobs para v2:', e);
        }
    }

    private async ensureUserSessionsSchema(): Promise<void> {
        try {
            const [cols]: any = await this.pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_sessions'`,
                [DB_CONFIG.database]
            );
            const have = (name: string) => cols.some((c: any) => c.COLUMN_NAME === name);

            if (!have('updated_at')) {
                await this.pool.execute(`ALTER TABLE user_sessions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
                console.log('✅ user_sessions actualizado: columna updated_at agregada');
            }

            if (!have('follow_up_attempts')) {
                await this.pool.execute(`ALTER TABLE user_sessions ADD COLUMN follow_up_attempts INT DEFAULT 0`);
                console.log('✅ user_sessions actualizado: columna follow_up_attempts agregada');
            }
        } catch (e) {
            console.error('❌ Error asegurando esquema de user_sessions:', e);
        }
    }

    // ============================================
    // MÉTODOS DE SESIONES DE USUARIO
    // ============================================

    public async saveUserSession(session: Partial<UserSession>): Promise<boolean> {
        const sql = `
            INSERT INTO user_sessions (
                phone, name, buying_intent, stage, interests, interactions,
                conversation_data, location, email, push_token, last_interaction,
                last_activity, message_count, is_active, is_new_user, 
                is_returning_user, is_first_message, demographics, preferences
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = COALESCE(VALUES(name), name),
                buying_intent = VALUES(buying_intent),
                stage = VALUES(stage),
                interests = VALUES(interests),
                interactions = VALUES(interactions),
                conversation_data = VALUES(conversation_data),
                location = COALESCE(VALUES(location), location),
                email = COALESCE(VALUES(email), email),
                push_token = COALESCE(VALUES(push_token), push_token),
                last_interaction = NOW(),
                last_activity = NOW(),
                message_count = VALUES(message_count),
                is_active = VALUES(is_active),
                is_returning_user = TRUE,
                demographics = VALUES(demographics),
                preferences = VALUES(preferences),
                updated_at = NOW()
        `;
        try {
            await this.pool.execute(sql, [
                session.phone,
                session.name || null,
                session.buyingIntent || 0,
                session.stage || 'initial',
                JSON.stringify(session.interests || []),
                JSON.stringify(session.interactions || []),
                JSON.stringify(session.conversationData || {}),
                session.location || null,
                session.email || null,
                session.pushToken || null,
                session.messageCount || 0,
                session.isActive !== undefined ? session.isActive : true,
                session.isNewUser !== undefined ? session.isNewUser : false,
                session.isReturningUser !== undefined ? session.isReturningUser : false,
                session.isFirstMessage !== undefined ? session.isFirstMessage : false,
                JSON.stringify(session.demographics || {}),
                JSON.stringify(session.preferences || {})
            ]);
            return true;
        } catch (error) {
            console.error('❌ Error guardando sesión de usuario:', error);
            return false;
        }
    }

    // public async getUserSession(phone: string): Promise<UserSession | null> {
    //     const sql = `SELECT * FROM user_sessions WHERE phone = ? ORDER BY created_at DESC LIMIT 1`;
    //     try {
    //         const [results] = await this.pool.execute(sql, [phone]);
    //         return Array.isArray(results) && results.length > 0 ? mapToUserSession(results[0]) : null;
    //     } catch (error) {
    //         console.error('❌ Error obteniendo sesión del usuario:', error);
    //         return null;
    //     }
    // }
    public async getUserSession(phone: string): Promise<UserSession | null> {
        try {
            // Ordenar por updated_at que existe por defecto en nuestro esquema
            const sql = `SELECT * FROM user_sessions WHERE phone = ? ORDER BY updated_at DESC LIMIT 1`;
            const [results] = await this.pool.execute(sql, [phone]);
            return Array.isArray(results) && results.length > 0 ? mapToUserSession(results[0]) : null;
        } catch (error) {
            console.error('❌ Error obteniendo sesión del usuario:', error);
            return null;
        }
    }

    public async updateUserSession(phone: string, updates: Partial<UserSession>): Promise<boolean> {
        try {
            const fields: string[] = [];
            const values: any[] = [];

            if (updates.name !== undefined) {
                fields.push('name = ?');
                values.push(updates.name);
            }
            if (updates.stage !== undefined) {
                fields.push('stage = ?');
                values.push(updates.stage);
            }
            if (updates.interests !== undefined) {
                fields.push('interests = ?');
                values.push(JSON.stringify(updates.interests));
            }
            if (updates.conversationData !== undefined) {
                fields.push('conversation_data = ?');
                values.push(JSON.stringify(updates.conversationData));
            }
            if (updates.lastFollowUp !== undefined) {
                fields.push('last_follow_up = ?');
                values.push(updates.lastFollowUp);
            }
            if (updates.followUpSpamCount !== undefined) {
                fields.push('follow_up_spam_count = ?');
                values.push(updates.followUpSpamCount);
            }
            if (updates.buyingIntent !== undefined) {
                fields.push('buying_intent = ?');
                values.push(updates.buyingIntent);
            }
            // New follow-up control fields
            if (updates.contactStatus !== undefined) {
                fields.push('contact_status = ?');
                values.push(updates.contactStatus);
            }
            if (updates.lastUserReplyAt !== undefined) {
                fields.push('last_user_reply_at = ?');
                values.push(updates.lastUserReplyAt);
            }
            if (updates.lastUserReplyCategory !== undefined) {
                fields.push('last_user_reply_category = ?');
                values.push(updates.lastUserReplyCategory);
            }
            if (updates.followUpCount24h !== undefined) {
                fields.push('follow_up_count_24h = ?');
                values.push(updates.followUpCount24h);
            }
            if (updates.lastFollowUpResetAt !== undefined) {
                fields.push('last_follow_up_reset_at = ?');
                values.push(updates.lastFollowUpResetAt);
            }
            if (updates.followUpAttempts !== undefined) {
                fields.push('follow_up_attempts = ?');
                values.push(updates.followUpAttempts);
            }
            if (updates.lastFollowUpAttemptResetAt !== undefined) {
                fields.push('last_follow_up_attempt_reset_at = ?');
                values.push(updates.lastFollowUpAttemptResetAt);
            }
            if (updates.cooldownUntil !== undefined) {
                fields.push('cooldown_until = ?');
                values.push(updates.cooldownUntil);
            }

            if (fields.length === 0) return true;

            fields.push('last_interaction = NOW()');
            values.push(phone);

            const query = `UPDATE user_sessions SET ${fields.join(', ')} WHERE phone = ?`;
            await this.pool.execute(query, values);

            return true;
        } catch (error) {
            console.error('❌ Error actualizando sesión:', error);
            return false;
        }
    }

    public async getActiveUsers(hoursBack: number = 48): Promise<UserSession[]> {
        try {
            const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));

            const [rows] = await this.pool.execute(
                'SELECT * FROM user_sessions WHERE last_interaction >= ? ORDER BY last_interaction DESC',
                [cutoffTime]
            ) as any;

            return rows.map((row: any) => mapToUserSession(row));
        } catch (error) {
            console.error('❌ Error obteniendo usuarios activos:', error);
            return [];
        }
    }

    // ============================================
    // MÉTODOS DE MENSAJES E INTERACCIONES
    // ============================================

    public async logMessage(messageData: MessageLog): Promise<boolean> {
        try {
            // Sanitize phone number for DB storage
            const sanitizedPhone = sanitizePhoneForDB(messageData.phone);
            
            if (!sanitizedPhone) {
                console.warn(`⚠️ Skipping logMessage for invalid phone: ${messageData.phone}`);
                return false;
            }

            // Detectar columnas disponibles
            const [cols]: any = await this.pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages'`,
                [DB_CONFIG.database]
            );
            const names = (cols || []).map((c: any) => c.COLUMN_NAME);
            const hasMessage = names.includes('message');
            const hasBody = names.includes('body');

            if (hasMessage) {
                const q = `INSERT INTO messages (phone, message, type, automated, timestamp) VALUES (?, ?, ?, ?, ?)`;
                await this.pool.execute(q, [
                    sanitizedPhone,
                    messageData.message,
                    messageData.type,
                    messageData.automated || false,
                    messageData.timestamp
                ]);
            } else if (hasBody) {
                const q = `INSERT INTO messages (phone, body, type, automated, timestamp) VALUES (?, ?, ?, ?, ?)`;
                await this.pool.execute(q, [
                    sanitizedPhone,
                    messageData.message,
                    messageData.type,
                    messageData.automated || false,
                    messageData.timestamp
                ]);
            } else {
                // Último recurso: solo phone y timestamp
                const q = `INSERT INTO messages (phone, type, automated, timestamp) VALUES (?, ?, ?, ?)`;
                await this.pool.execute(q, [
                    sanitizedPhone,
                    messageData.type,
                    messageData.automated || false,
                    messageData.timestamp
                ]);
            }
            return true;
        } catch (error) {
            console.error('❌ Error registrando mensaje:', error);
            return false;
        }
    }


    public async logInteraction(interactionData: InteractionLog): Promise<boolean> {
        try {
            // Sanitize phone number for DB storage
            const sanitizedPhone = sanitizePhoneForDB(interactionData.phone);
            
            if (!sanitizedPhone) {
                console.warn(`⚠️ Skipping logInteraction for invalid phone: ${interactionData.phone}`);
                return false;
            }

            const query = `
                INSERT INTO interactions (phone, type, content, timestamp)
                VALUES (?, ?, ?, ?)
            `;

            await this.pool.execute(query, [
                sanitizedPhone,
                interactionData.type,
                interactionData.content,
                interactionData.timestamp
            ]);

            return true;
        } catch (error) {
            console.error('❌ Error registrando interacción:', error);
            return false;
        }
    }

    public async logFollowUpEvent(eventData: FollowUpEvent): Promise<boolean> {
        try {
            // Sanitize phone number for DB storage
            const sanitizedPhone = sanitizePhoneForDB(eventData.phone);
            
            if (!sanitizedPhone) {
                console.warn(`⚠️ Skipping logFollowUpEvent for invalid phone: ${eventData.phone}`);
                return false;
            }

            const query = `
                INSERT INTO follow_up_events (phone, type, messages, success, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `;

            await this.pool.execute(query, [
                sanitizedPhone,
                eventData.type,
                JSON.stringify(eventData.messages),
                eventData.success,
                eventData.timestamp
            ]);

            return true;
        } catch (error) {
            console.error('❌ Error registrando evento de seguimiento:', error);
            return false;
        }
    }

    // ============================================
    // MÉTODOS DE ANALYTICS
    // ============================================

    public async getUserAnalytics(phoneNumber: string): Promise<any> {
        try {
            const [rows]: any = await this.pool.execute(
                `SELECT buying_intent as buyingIntent, stage, interests, interactions, total_orders as totalOrders
                 FROM user_sessions WHERE phone = ? ORDER BY updated_at DESC LIMIT 1`,
                [phoneNumber]
            );
            if (!rows?.length) {
                return { totalInteractions: 0, buyingIntent: 0, preferredCategories: [], lastStage: 'initial', totalOrders: 0 };
            }
            const r = rows[0];
            const interests = typeof r.interests === 'string' ? JSON.parse(r.interests || '[]') : (r.interests || []);
            const interactions = typeof r.interactions === 'string' ? JSON.parse(r.interactions || '[]') : (r.interactions || []);
            return {
                totalInteractions: Array.isArray(interactions) ? interactions.length : 0,
                buyingIntent: Number(r.buyingIntent) || 0,
                preferredCategories: interests,
                lastStage: r.stage || 'initial',
                totalOrders: Number(r.totalOrders) || 0
            };
        } catch (e) {
            console.error(`❌ getUserAnalytics error (${phoneNumber}):`, e);
            return { totalInteractions: 0, buyingIntent: 0, preferredCategories: [], lastStage: 'initial', totalOrders: 0 };
        }
    }

    public async saveAnalyticsEvent(phone: string, eventType: string, eventData: any): Promise<boolean> {
        const sql = `
            INSERT INTO analytics_events (phone, event_type, event_data, timestamp)
            VALUES (?, ?, ?, NOW())
        `;
        try {
            await this.pool.execute(sql, [phone, eventType, JSON.stringify(eventData)]);
            return true;
        } catch (error) {
            console.error('❌ Error guardando evento de analytics:', error);
            return false;
        }
    }

    public async getGeneralAnalytics(): Promise<any> {
        try {
            const [totalUsers] = await this.pool.execute('SELECT COUNT(*) as count FROM user_sessions') as any;
            const [totalMessages] = await this.pool.execute('SELECT COUNT(*) as count FROM messages') as any;
            const [totalOrders] = await this.pool.execute('SELECT COUNT(*) as count FROM orders') as any;
            const [activeToday] = await this.pool.execute(
                'SELECT COUNT(*) as count FROM user_sessions WHERE last_interaction >= ?',
                [new Date(Date.now() - 24 * 60 * 60 * 1000)]
            ) as any;

            return {
                totalUsers: totalUsers[0].count,
                totalMessages: totalMessages[0].count,
                totalOrders: totalOrders[0].count,
                activeToday: activeToday[0].count,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ Error obteniendo analytics generales:', error);
            return {};
        }
    }

    public async getSalesAnalytics(): Promise<any> {
        try {
            const [totalSales] = await this.pool.execute(
                'SELECT COUNT(*) as count, SUM(price) as total FROM orders'
            ) as any;

            const [todaySales] = await this.pool.execute(
                'SELECT COUNT(*) as count, SUM(price) as total FROM orders WHERE created_at >= ?',
                [new Date(new Date().setHours(0, 0, 0, 0))]
            ) as any;

            return {
                totalSales: totalSales[0].count || 0,
                totalRevenue: totalSales[0].total || 0,
                todaySales: todaySales[0].count || 0,
                todayRevenue: todaySales[0].total || 0,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ Error obteniendo analytics de ventas:', error);
            return {};
        }
    }

    public async getDashboardData(): Promise<any> {
        try {
            const generalAnalytics = await this.getGeneralAnalytics();
            const salesAnalytics = await this.getSalesAnalytics();

            return {
                general: generalAnalytics,
                sales: salesAnalytics,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ Error obteniendo datos del dashboard:', error);
            return {};
        }
    }

    // ============================================
    // MÉTODOS DE ÓRDENES
    // ============================================

    public async createOrder(orderData: {
        id: string;
        customerPhone: string;
        items: Array<{
            capacity: string;
            contentType: string;
            price: number;
            quantity: number;
            description: string;
        }>;
        totalAmount: number;
        discountAmount: number;
        shippingAddress: string;
        shippingPhone: string;
        status: string;
        preferences?: Record<string, any>;
        createdAt: Date;
    }): Promise<boolean> {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            const orderQuery = `
                INSERT INTO orders (
                    order_number, phone_number, customer_name, product_type, 
                    capacity, price, customization, preferences, processing_status,
                    total_amount, discount_amount, shipping_address, shipping_phone
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const firstItem = orderData.items[0];
            const customerName = orderData.shippingAddress.split('|')[0]?.trim() || 'Cliente';

            await connection.execute(orderQuery, [
                orderData.id,
                orderData.customerPhone,
                customerName,
                firstItem.contentType,
                firstItem.capacity,
                firstItem.price,
                JSON.stringify({ items: orderData.items }),
                JSON.stringify(orderData.preferences || {}),
                orderData.status,
                orderData.totalAmount,
                orderData.discountAmount,
                orderData.shippingAddress,
                orderData.shippingPhone
            ]);

            await this.updateUserOrderCount(orderData.customerPhone);

            await connection.commit();

            await this.saveAnalyticsEvent(
                orderData.customerPhone,
                'order_created',
                {
                    orderId: orderData.id,
                    totalAmount: orderData.totalAmount,
                    itemsCount: orderData.items.length,
                    status: orderData.status
                }
            );

            console.log(`✅ Orden ${orderData.id} creada exitosamente`);
            return true;

        } catch (error) {
            await connection.rollback();
            console.error('❌ Error creando orden:', error);

            await this.logError({
                type: 'order_creation_error',
                error: error instanceof Error ? error.message : 'Error desconocido',
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date(),
                phone: orderData.customerPhone
            });

            return false;
        } finally {
            connection.release();
        }
    }

    private async updateUserOrderCount(phone: string): Promise<void> {
        try {
            const query = `
                UPDATE user_sessions 
                SET total_orders = (
                    SELECT COUNT(*) FROM orders 
                    WHERE phone_number = ? AND processing_status IN ('processing','completed')
                )
                WHERE phone = ?
            `;

            await this.pool.execute(query, [phone, phone]);
        } catch (error) {
            console.error('❌ Error actualizando contador de pedidos:', error);
        }
    }

    public async saveOrder(order: CustomerOrder): Promise<boolean> {
        if (!order.orderNumber || !order.phoneNumber) {
            console.error('❌ Datos de orden incompletos');
            return false;
        }

        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            const sql = `
                INSERT INTO orders (
                    order_number, phone_number, customer_name, product_type, 
                    capacity, price, customization, preferences, processing_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await connection.execute(sql, [
                order.orderNumber,
                order.phoneNumber,
                order.customerName,
                order.productType,
                order.capacity,
                order.price,
                JSON.stringify(order.customization),
                JSON.stringify(order.preferences),
                order.processingStatus || 'pending'
            ]);

            await this.updateUserOrderCount(order.phoneNumber);

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error guardando pedido:', error);
            return false;
        } finally {
            connection.release();
        }
    }

    public async getUserOrders(phoneNumber: string, limit: number = 10): Promise<CustomerOrder[]> {
        try {
            const limitInt = parseInt(limit.toString(), 10) || 10;

            const sql = `
                SELECT * FROM orders 
                WHERE phone_number = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `;

            const [rows] = await this.pool.execute(sql, [phoneNumber, limitInt]) as any;
            return rows.map((row: any) => this.rowToOrder(row));

        } catch (error) {
            console.error(`❌ Error obteniendo órdenes del usuario ${phoneNumber}:`, error);
            return [];
        }
    }

    public rowToOrder(row: any): CustomerOrder {
        return {
            id: row.id,
            customerPhone: row.phone_number || '',
            phoneNumber: row.phone_number,
            items: [],
            total: parseFloat(row.price) || 0,
            totalAmount: parseFloat(row.price) || 0,
            discountAmount: 0,
            shippingPhone: row.phone_number || '',
            status: OrderStatus.PENDING,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            customerId: row.id,
            orderDate: new Date(row.created_at),
            paymentMethod: PaymentMethod.CASH,
            shippingAddress: '',
            orderNumber: row.order_number,
            customerName: row.customer_name,
            productType: row.product_type as ProductType,
            capacity: row.capacity,
            price: parseFloat(row.price) || 0,
            customization: row.customization ? JSON.parse(row.customization) : {},
            preferences: row.preferences ? JSON.parse(row.preferences) : undefined,
            processingStatus: row.processing_status,
            usbLabel: row.usb_label
        };
    }

    public async getOrderStatistics(): Promise<OrderStatistics> {
        const sql = `
            SELECT
                COUNT(*) AS total_orders,
                SUM(CASE WHEN processing_status='completed' THEN 1 ELSE 0 END) AS completed_orders,
                SUM(CASE WHEN processing_status='pending' THEN 1 ELSE 0 END) AS pending_orders,
                SUM(CASE WHEN processing_status='processing' THEN 1 ELSE 0 END) AS processing_orders,
                SUM(CASE WHEN processing_status='error' THEN 1 ELSE 0 END) AS error_orders,
                SUM(CASE WHEN processing_status='failed' THEN 1 ELSE 0 END) AS failed_orders,
                COALESCE(SUM(price), 0) AS total_revenue,
                COALESCE(AVG(price), 0) AS average_price
            FROM orders
        `;
        try {
            const [rows] = await this.pool.execute(sql) as any;
            const emptyStats = {
                total_orders: 0,
                completed_orders: 0,
                pending_orders: 0,
                processing_orders: 0,
                error_orders: 0,
                failed_orders: 0,
                total_revenue: 0,
                average_price: 0
            };
            const stats = Array.isArray(rows) && rows.length > 0 ? { ...emptyStats, ...rows[0] } : emptyStats;
            return {
                total_orders: Number(stats.total_orders) || 0,
                completed_orders: Number(stats.completed_orders) || 0,
                pending_orders: Number(stats.pending_orders) || 0,
                processing_orders: Number(stats.processing_orders) || 0,
                error_orders: Number(stats.error_orders) || 0,
                failed_orders: Number(stats.failed_orders) || 0,
                total_revenue: Number(stats.total_revenue) || 0,
                average_price: Number(stats.average_price) || 0
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return {
                total_orders: 0,
                completed_orders: 0,
                pending_orders: 0,
                processing_orders: 0,
                error_orders: 0,
                failed_orders: 0,
                total_revenue: 0,
                average_price: 0
            };
        }
    }

    public async getPendingOrders(): Promise<any[]> {
        try {
            const query = `
                SELECT 
                    id,
                    order_number,
                    phone_number as customer_phone,
                    customer_name,
                    product_type,
                    capacity,
                    price,
                    processing_status as status,
                    created_at,
                    updated_at,
                    price as total_amount
                FROM orders 
                WHERE processing_status = 'pending' 
                ORDER BY created_at DESC
            `;

            const [rows] = await this.pool.execute(query);
            return rows as any[];
        } catch (error) {
            console.error('❌ Error al obtener órdenes pendientes:', error);
            return [];
        }
    }

    public async updateOrderStatus(orderNumber: string, status: string): Promise<boolean> {
        try {
            const sql = `
                UPDATE orders 
                SET processing_status = ?, updated_at = NOW() 
                WHERE order_number = ?
            `;

            const [result] = await this.pool.execute(sql, [status, orderNumber]) as any;

            if (result.affectedRows > 0) {
                console.log(`✅ Estado de orden ${orderNumber} actualizado a: ${status}`);

                await this.saveAnalyticsEvent(
                    'system',
                    'order_status_updated',
                    { orderNumber, status, timestamp: new Date() }
                );

                return true;
            }

            console.warn(`⚠️ No se encontró la orden ${orderNumber} para actualizar`);
            return false;

        } catch (error) {
            console.error(`❌ Error actualizando estado de orden ${orderNumber}:`, error);
            return false;
        }
    }

    // ============================================
    // MÉTODOS DE PROCESSING JOBS (v1 + v2 compat)
    // ============================================

    public async insertProcessingJob(job: any): Promise<boolean> {
        try {
            const query = `
                INSERT INTO processing_jobs (
                    job_id, order_id, customer_phone, customer_name,
                    capacity, content_type, preferences, content_list,
                    customizations, status, progress, priority,
                    estimated_time, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await this.pool.execute(query, [
                job.id,
                job.orderId,
                job.customerPhone,
                job.customerName,
                job.capacity,
                job.contentType,
                JSON.stringify(job.preferences),
                JSON.stringify(job.contentList),
                JSON.stringify(job.customizations),
                job.status,
                job.progress,
                job.priority,
                job.estimatedTime,
                job.createdAt
            ]);

            console.log(`✅ Job ${job.id} insertado en BD`);
            return true;

        } catch (error) {
            console.error('❌ Error insertando processing job:', error);
            return false;
        }
    }

    public async updateProcessingJob(job: any): Promise<boolean> {
        try {
            const query = `
                UPDATE processing_jobs 
                SET status = ?, progress = ?, logs = ?, error = ?,
                    started_at = ?, completed_at = ?, quality_report = ?,
                    updated_at = NOW()
                WHERE job_id = ?
            `;

            await this.pool.execute(query, [
                job.status,
                job.progress,
                JSON.stringify(job.logs),
                job.error || null,
                job.startedAt || null,
                job.completedAt || null,
                job.qualityReport ? JSON.stringify(job.qualityReport) : null,
                job.id
            ]);

            return true;

        } catch (error) {
            console.error('❌ Error actualizando processing job:', error);
            return false;
        }
    }

    // -------- v2 compatibles con app.ts --------

    private mapJobStatusToV1(status: string): 'queued' | 'processing' | 'completed' | 'error' | 'failed' {
        switch (status) {
            case 'pending': return 'queued';
            case 'processing':
            case 'writing':
            case 'verifying': return 'processing';
            case 'done': return 'completed';
            case 'failed': return 'failed';
            case 'retry': return 'queued';
            case 'canceled': return 'failed';
            default: return 'queued';
        }
    }

    private mapJobStatusToV2(status: string): 'pending' | 'processing' | 'writing' | 'verifying' | 'done' | 'failed' | 'retry' | 'canceled' {
        switch (status) {
            case 'queued': return 'pending';
            case 'processing': return 'processing';
            case 'completed': return 'done';
            case 'failed': return 'failed';
            case 'error': return 'failed';
            default: return 'pending';
        }
    }

    public async insertProcessingJobV2(job: {
        order_id: string;
        usb_capacity: string;
        content_plan_id: string;
        preferences?: any;
        volume_label?: string;
        assigned_device_id?: string | null;
        status?: 'pending' | 'processing' | 'writing' | 'verifying' | 'done' | 'failed' | 'retry' | 'canceled';
        progress?: number;
        fail_reason?: string | null;
        started_at?: Date | null;
        finished_at?: Date | null;
        created_at?: Date;
    }): Promise<number> {
        const sql = `
          INSERT INTO processing_jobs
          (job_id, order_id, customer_phone, customer_name, capacity, content_type, preferences, content_list, customizations,
           status, progress, priority, logs, error, estimated_time, started_at, completed_at, quality_report,
           created_at, usb_capacity, content_plan_id, volume_label, assigned_device_id, fail_reason, finished_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `;
        const args = [
            'job-' + Date.now(),
            job.order_id,
            '', // customer_phone
            '', // customer_name
            job.usb_capacity || '',
            'mixed',
            job.preferences ? JSON.stringify(job.preferences) : null,
            null,
            null,
            this.mapJobStatusToV1(job.status || 'pending'),
            job.progress ?? 0,
            5,
            null,
            null,
            null,
            job.started_at || null,
            job.finished_at || null, // completed_at (v1)
            null,
            job.created_at || new Date(),
            job.usb_capacity || null,
            job.content_plan_id || null,
            job.volume_label || null,
            job.assigned_device_id || null,
            job.fail_reason || null,
            job.finished_at || null
        ];
        const [res]: any = await this.pool.execute(sql, args);
        return res.insertId as number;
    }

    public async updateProcessingJobV2(patch: {
        id: number;
        status?: string;
        progress?: number;
        fail_reason?: string | null;
        assigned_device_id?: string | null;
        started_at?: Date | null;
        finished_at?: Date | null;
        volume_label?: string | null;
    }): Promise<boolean> {
        const fields: string[] = [];
        const params: any[] = [];
        if (patch.status != null) { fields.push('status = ?'); params.push(this.mapJobStatusToV1(patch.status)); }
        if (patch.progress != null) { fields.push('progress = ?'); params.push(patch.progress); }
        if (patch.fail_reason !== undefined) { fields.push('fail_reason = ?'); params.push(patch.fail_reason); }
        if (patch.assigned_device_id !== undefined) { fields.push('assigned_device_id = ?'); params.push(patch.assigned_device_id); }
        if (patch.started_at !== undefined) { fields.push('started_at = ?'); params.push(patch.started_at); }
        if (patch.finished_at !== undefined) { fields.push('completed_at = ?'); params.push(patch.finished_at); fields.push('finished_at = ?'); params.push(patch.finished_at); }
        if (patch.volume_label !== undefined) { fields.push('volume_label = ?'); params.push(patch.volume_label); }
        if (!fields.length) return true;
        params.push(patch.id);
        const sql = `UPDATE processing_jobs SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
        const [res]: any = await this.pool.execute(sql, params);
        return res.affectedRows > 0;
    }

    public async listProcessingJobs(params: { statuses?: string[]; limit?: number } = {}): Promise<any[]> {
        const where: string[] = [];
        const args: any[] = [];
        if (params.statuses?.length) {
            where.push(`status IN (${params.statuses.map(() => '?').join(',')})`);
            args.push(...params.statuses.map(s => this.mapJobStatusToV1(s)));
        }
        const sql = `
          SELECT 
            id, job_id, order_id, customer_phone, customer_name,
            capacity, content_type, preferences, content_list, customizations,
            status, progress, priority, logs, error, estimated_time,
            started_at, completed_at, quality_report, created_at, updated_at,
            usb_capacity, content_plan_id, volume_label, assigned_device_id, fail_reason, finished_at
          FROM processing_jobs
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY created_at DESC
          LIMIT ${Math.min(params.limit || 200, 1000)}
        `;
        const [rows]: any = await this.pool.execute(sql, args);
        return rows.map((r: any) => ({
            id: r.id,
            order_id: r.order_id,
            usb_capacity: r.usb_capacity || r.capacity,
            content_plan_id: r.content_plan_id,
            preferences: r.preferences ? JSON.parse(r.preferences) : null,
            volume_label: r.volume_label,
            assigned_device_id: r.assigned_device_id,
            status: this.mapJobStatusToV2(r.status),
            progress: r.progress,
            fail_reason: r.fail_reason || r.error || null,
            started_at: r.started_at,
            finished_at: r.finished_at || r.completed_at,
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
    }

    public async getProcessingJobById(id: number): Promise<any | null> {
        const [rows]: any = await this.pool.execute(`SELECT * FROM processing_jobs WHERE id = ? LIMIT 1`, [id]);
        if (!rows?.length) return null;
        const r = rows[0];
        return {
            id: r.id,
            order_id: r.order_id,
            usb_capacity: r.usb_capacity || r.capacity,
            content_plan_id: r.content_plan_id,
            preferences: r.preferences ? JSON.parse(r.preferences) : null,
            volume_label: r.volume_label,
            assigned_device_id: r.assigned_device_id,
            status: this.mapJobStatusToV2(r.status),
            progress: r.progress,
            fail_reason: r.fail_reason || r.error || null,
            started_at: r.started_at,
            finished_at: r.finished_at || r.completed_at,
            created_at: r.created_at,
            updated_at: r.updated_at
        };
    }

    public async insertNotification(notification: any): Promise<boolean> {
        try {
            const query = `
                INSERT INTO notifications (
                    job_id, type, channel, message, sent_at, status
                ) VALUES (?, ?, ?, ?, ?, ?)
            `;

            await this.pool.execute(query, [
                notification.jobId,
                notification.type,
                notification.channel,
                notification.message,
                notification.sentAt,
                notification.status
            ]);

            return true;

        } catch (error) {
            console.error('❌ Error insertando notificación:', error);
            return false;
        }
    }

    // ============================================
    // MÉTODOS DE UTILIDAD Y MANTENIMIENTO
    // ============================================

    public async execute(query: string, params: any[] = []): Promise<any> {
        try {
            const result = await this.pool.execute(query, params);
            return result;
        } catch (error) {
            console.error('❌ Error ejecutando query:', error);
            throw error;
        }
    }

    public async getPerformanceStats(): Promise<any> {
        try {
            const [stats] = await this.pool.execute(`
                SELECT 
                    COUNT(*) as total_sessions,
                    COUNT(CASE WHEN last_activity > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as active_24h,
                    COUNT(CASE WHEN last_activity > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as active_7d,
                    AVG(message_count) as avg_messages_per_user,
                    MAX(last_activity) as last_user_activity
                FROM user_sessions
            `);

            return (stats as any[])[0] || {};
        } catch (error) {
            console.error('❌ Error obteniendo stats de rendimiento:', error);
            return {};
        }
    }

    public async getTotalSessions(): Promise<number> {
        try {
            const [result] = await this.pool.execute('SELECT COUNT(*) as total FROM user_sessions');
            return (result as any[])[0]?.total || 0;
        } catch (error) {
            console.error('❌ Error obteniendo total de sesiones:', error);
            return 0;
        }
    }

    public async getTotalMessages(): Promise<number> {
        try {
            const [result] = await this.pool.execute('SELECT SUM(message_count) as total FROM user_sessions');
            return (result as any[])[0]?.total || 0;
        } catch (error) {
            console.error('❌ Error obteniendo total de mensajes:', error);
            return 0;
        }
    }

    public async resetSpamCounters(hoursAgo: number = 24): Promise<void> {
        try {
            await this.pool.execute(`
                UPDATE user_sessions 
                SET follow_up_spam_count = 0 
                WHERE last_follow_up < DATE_SUB(NOW(), INTERVAL ? HOUR)
            `, [hoursAgo]);

            console.log(`✅ Contadores de spam reseteados (${hoursAgo}h)`);
        } catch (error) {
            console.error('❌ Error reseteando contadores de spam:', error);
        }
    }

    public async cleanInactiveSessions(hoursAgo: number = 168): Promise<void> {
        try {
            const [result] = await this.pool.execute(`
                DELETE FROM user_sessions 
                WHERE last_interaction < DATE_SUB(NOW(), INTERVAL ? HOUR)
                AND total_orders = 0
                AND message_count < 3
            `, [hoursAgo]);

            console.log(`✅ Sesiones inactivas limpiadas: ${(result as any).affectedRows || 0}`);
        } catch (error) {
            console.error('❌ Error limpiando sesiones inactivas:', error);
        }
    }

    public async generateDailyStats(): Promise<void> {
        try {
            const today = new Date().toISOString().split('T')[0];

            const [stats] = await this.pool.execute(`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN DATE(created_at) = ? THEN 1 END) as new_users_today,
                    COUNT(CASE WHEN last_activity > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as active_users_24h,
                    AVG(buying_intent) as avg_buying_intent,
                    COUNT(CASE WHEN total_orders > 0 THEN 1 END) as users_with_orders
                FROM user_sessions
            `, [today]);

            const dailyStats = (stats as any[])[0];

            await this.pool.execute(`
                INSERT INTO daily_stats (date, stats_data, created_at) 
                VALUES (?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    stats_data = VALUES(stats_data),
                    updated_at = NOW()
            `, [today, JSON.stringify(dailyStats)]);

            console.log('✅ Estadísticas diarias generadas:', dailyStats);
        } catch (error) {
            console.error('❌ Error generando estadísticas diarias:', error);
        }
    }

    public async logError(error: {
        type: string;
        error: string;
        stack?: string;
        timestamp: Date;
        [key: string]: any;
    }): Promise<void> {
        try {
            await this.pool.execute(`
                INSERT INTO error_logs (type, error_message, stack_trace, created_at)
                VALUES (?, ?, ?, ?)
            `, [
                error.type,
                error.error,
                error.stack || null,
                error.timestamp
            ]);
        } catch (dbError) {
            console.error('❌ Error registrando error en base de datos:', dbError);
        }
    }

    public async close(): Promise<void> {
        try {
            await this.pool.end();
            console.log('✅ Conexiones MySQL cerradas correctamente');
        } catch (error) {
            console.error('❌ Error cerrando conexiones MySQL:', error);
            throw error;
        }
    }

    // ============================================
    // MÉTODOS ADICIONALES REQUERIDOS
    // ============================================

    public async getRouterStats(): Promise<any> {
        try {
            const query = `
                SELECT 
                    COUNT(*) as totalDecisions,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulRoutes,
                    AVG(confidence) as avgConfidence,
                    action,
                    COUNT(*) as actionCount
                FROM router_decisions 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY action
                ORDER BY actionCount DESC
            `;
            const [results] = await this.pool.execute(query);
            return {
                totalDecisions: 0,
                successfulRoutes: 0,
                avgConfidence: 0,
                actionBreakdown: results || [],
                ...results
            };
        } catch (error) {
            console.error('❌ Error obteniendo stats del router:', error);
            return {
                totalDecisions: 0,
                successfulRoutes: 0,
                avgConfidence: 0,
                actionBreakdown: []
            };
        }
    }

    public async getConversionStats(): Promise<any> {
        try {
            const query = `
                SELECT 
                    COUNT(DISTINCT phone) as totalUsers,
                    SUM(CASE WHEN stage = 'completed' THEN 1 ELSE 0 END) as conversions,
                    AVG(buying_intent) as avgBuyingIntent,
                    AVG(session_duration) as avgSessionDuration
                FROM user_sessions 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `;

            const [results] = await this.pool.execute(query);
            const data = Array.isArray(results) && results.length > 0 ? results[0] as any : {};

            return {
                conversionRate: (data.totalUsers || 0) > 0 ?
                    ((data.conversions || 0) / (data.totalUsers || 0) * 100).toFixed(2) : '0',
                totalUsers: data.totalUsers || 0,
                conversions: data.conversions || 0,
                avgBuyingIntent: data.avgBuyingIntent || 0,
                avgSessionDuration: data.avgSessionDuration || 0
            };
        } catch (error) {
            console.error('❌ Error obteniendo stats de conversión:', error);
            return {
                conversionRate: '0',
                totalUsers: 0,
                conversions: 0,
                avgBuyingIntent: 0,
                avgSessionDuration: 0
            };
        }
    }

    public async getUserJourneyStats(): Promise<any> {
        try {
            const query = `
                SELECT 
                    stage,
                    COUNT(*) as count,
                    AVG(buying_intent) as avgIntent
                FROM user_sessions 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY stage
                ORDER BY count DESC
            `;

            const [results] = await this.pool.execute(query);
            return {
                stageDistribution: results || [],
                totalJourneys: Array.isArray(results) ? results.reduce((sum: number, row: any) => sum + row.count, 0) : 0
            };
        } catch (error) {
            console.error('❌ Error obteniendo stats de journey:', error);
            return {
                stageDistribution: [],
                totalJourneys: 0
            };
        }
    }

    public async getConversationAnalysis(): Promise<any> {
        try {
            const query = `
                SELECT 
                    COUNT(*) as totalMessages,
                    COUNT(DISTINCT phone) as uniqueUsers,
                    AVG(CHAR_LENGTH(COALESCE(message, body, ''))) as avgMessageLength,
                    type,
                    COUNT(*) as typeCount
                FROM messages 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                GROUP BY type
            `;

            const [results] = await this.pool.execute(query);
            return {
                last24Hours: {
                    totalMessages: 0,
                    uniqueUsers: 0,
                    avgMessageLength: 0,
                    messageTypes: results || []
                }
            };
        } catch (error) {
            console.error('❌ Error obteniendo análisis de conversaciones:', error);
            return {
                last24Hours: {
                    totalMessages: 0,
                    uniqueUsers: 0,
                    avgMessageLength: 0,
                    messageTypes: []
                }
            };
        }
    }

    public async getStockInfo(): Promise<Record<string, number>> {
        try {
            const stockData: Record<string, number> = {
                '8GB': 50,
                '32GB': 100,
                '64GB': 75,
                '128GB': 60,
                '256GB': 40,
                '512GB': 25
            };

            return stockData;
        } catch (error) {
            console.error('❌ Error obteniendo información de stock:', error);
            return {
                '8GB': 0,
                '32GB': 0,
                '64GB': 0,
                '128GB': 0,
                '256GB': 0,
                '512GB': 0
            };
        }
    }

    // Métodos adicionales requeridos por sales-maximizer.ts
    public async getRecentOrdersByType(productType: string, limit: number = 10): Promise<any[]> {
        try {
            const [rows] = await this.pool.execute(`
                SELECT o.*, us.name as user_name
                FROM orders o
                LEFT JOIN user_sessions us ON o.phone_number = us.phone
                WHERE o.product_type = ? 
                AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                ORDER BY o.created_at DESC
                LIMIT ?
            `, [productType, limit]);

            return rows as any[];
        } catch (error) {
            console.error('Error getting recent orders by type:', error);
            return [];
        }
    }

    public async getOrdersByLocation(location: string, limit: number = 10): Promise<any[]> {
        try {
            const [rows] = await this.pool.execute(`
                SELECT o.*, us.name as user_name, us.location
                FROM orders o
                LEFT JOIN user_sessions us ON o.phone_number = us.phone
                WHERE us.location LIKE ?
                AND o.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
                ORDER BY o.created_at DESC
                LIMIT ?
            `, [`%${location}%`, limit]);

            return rows as any[];
        } catch (error) {
            console.error('Error getting orders by location:', error);
            return [];
        }
    }

    public async getSalesStatsByProduct(days: number = 30): Promise<any[]> {
        try {
            const [rows] = await this.pool.execute(`
                SELECT 
                    product_type,
                    COUNT(*) as total_orders,
                    SUM(price) as total_revenue,
                    AVG(price) as avg_order_value,
                    COUNT(DISTINCT phone_number) as unique_customers
                FROM orders 
                WHERE processing_status = 'completed' 
                AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY product_type
                ORDER BY total_revenue DESC
            `, [days]);

            return rows as any[];
        } catch (error) {
            console.error('Error getting sales stats by product:', error);
            return [];
        }
    }

    public async getSalesTrendsByLocation(days: number = 30): Promise<any[]> {
        try {
            const [rows] = await this.pool.execute(`
                SELECT 
                    COALESCE(us.location, 'Unknown') as location,
                    COUNT(*) as total_orders,
                    SUM(o.price) as total_revenue,
                    AVG(o.price) as avg_order_value
                FROM orders o
                LEFT JOIN user_sessions us ON o.phone_number = us.phone
                WHERE o.processing_status = 'completed' 
                AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY us.location
                HAVING total_orders >= 2
                ORDER BY total_revenue DESC
                LIMIT 20
            `, [days]);

            return rows as any[];
        } catch (error) {
            console.error('Error getting sales trends by location:', error);
            return [];
        }
    }

    public async getTopSellingProducts(limit: number = 10, days: number = 30): Promise<any[]> {
        try {
            const [rows] = await this.pool.execute(`
                SELECT 
                    product_type,
                    capacity,
                    COUNT(*) as sales_count,
                    SUM(price) as total_revenue,
                    AVG(price) as avg_price
                FROM orders 
                WHERE processing_status = 'completed' 
                AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY product_type, capacity
                ORDER BY sales_count DESC, total_revenue DESC
                LIMIT ?
            `, [days, limit]);

            return rows as any[];
        } catch (error) {
            console.error('Error getting top selling products:', error);
            return [];
        }
    }

    public async getHighValueCustomers(limit: number = 20): Promise<any[]> {
        try {
            const [rows] = await this.pool.execute(`
                SELECT 
                    us.phone,
                    us.name,
                    us.location,
                    COUNT(o.id) as total_orders,
                    SUM(o.price) as total_spent,
                    AVG(o.price) as avg_order_value,
                    MAX(o.created_at) as last_order_date,
                    DATEDIFF(NOW(), MAX(o.created_at)) as days_since_last_order
                FROM user_sessions us
                INNER JOIN orders o ON us.phone = o.phone_number
                WHERE o.processing_status = 'completed'
                GROUP BY us.phone, us.name, us.location
                HAVING total_orders >= 2 OR total_spent >= 50000
                ORDER BY total_spent DESC, total_orders DESC
                LIMIT ?
            `, [limit]);

            return rows as any[];
        } catch (error) {
            console.error('Error getting high value customers:', error);
            return [];
        }
    }

    public async getAbandonedCartAnalysis(days: number = 7): Promise<any[]> {
        try {
            const [rows] = await this.pool.execute(`
                SELECT 
                    s.phone,
                    s.name,
                    s.stage,
                    s.buying_intent,
                    s.last_interaction,
                    TIMESTAMPDIFF(HOUR, s.last_interaction, NOW()) as hours_since_interaction
                FROM user_sessions s
                WHERE s.stage IN ('product_selection', 'capacity_selection', 'price_confirmation', 'order_details')
                AND s.buying_intent >= 2
                AND s.last_interaction >= DATE_SUB(NOW(), INTERVAL ? DAY)
                AND s.last_interaction <= DATE_SUB(NOW(), INTERVAL 2 HOUR)
                AND NOT EXISTS (
                    SELECT 1 FROM orders o
                    WHERE o.phone_number = s.phone 
                    AND o.created_at > s.last_interaction
                )
                ORDER BY s.buying_intent DESC
            `, [days]);

            return rows as any[];
        } catch (error) {
            console.error('Error getting abandoned cart analysis:', error);
            return [];
        }
    }

    public async getConversionMetrics(days: number = 30): Promise<any> {
        try {
            const [conversionStats] = await this.pool.execute(`
                SELECT 
                    COUNT(DISTINCT s.phone) as total_sessions,
                    COUNT(DISTINCT CASE WHEN s.buying_intent >= 3 THEN s.phone END) as high_intent_sessions,
                    COUNT(DISTINCT o.phone_number) as converted_users,
                    COUNT(o.id) as total_orders,
                    SUM(o.price) as total_revenue,
                    AVG(o.price) as avg_order_value
                FROM user_sessions s
                LEFT JOIN orders o ON s.phone = o.phone_number 
                    AND o.created_at >= s.created_at 
                    AND o.created_at <= DATE_ADD(s.last_interaction, INTERVAL 24 HOUR)
                WHERE s.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            `, [days]);

            const [stageConversion] = await this.pool.execute(`
                SELECT 
                    stage,
                    COUNT(*) as sessions_count,
                    COUNT(DISTINCT phone) as unique_users,
                    AVG(buying_intent) as avg_intent
                FROM user_sessions 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY stage
                ORDER BY sessions_count DESC
            `, [days]);

            return {
                general: (conversionStats as any[])[0] || {},
                byStage: stageConversion as any[]
            };
        } catch (error) {
            console.error('Error getting conversion metrics:', error);
            return { general: {}, byStage: [] };
        }
    }

    public async getOrder(orderNumber: string): Promise<CustomerOrder | null> {
        try {
            const sql = `SELECT * FROM orders WHERE order_number = ? LIMIT 1`;
            const [rows] = await this.pool.execute(sql, [orderNumber]) as any;

            if (rows.length === 0) {
                console.warn(`⚠️ No se encontró la orden: ${orderNumber}`);
                return null;
            }

            return this.rowToOrder(rows[0]);

        } catch (error) {
            console.error(`❌ Error obteniendo orden ${orderNumber}:`, error);
            return null;
        }
    }

    public async getOrdersByStatus(status: string, limit: number = 50): Promise<CustomerOrder[]> {
        try {
            const sql = `
                SELECT * FROM orders 
                WHERE processing_status = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `;

            const [rows] = await this.pool.execute(sql, [status, limit]) as any;
            return rows.map((row: any) => this.rowToOrder(row));

        } catch (error) {
            console.error(`❌ Error obteniendo órdenes con estado ${status}:`, error);
            return [];
        }
    }

    public async getProcessingStatistics(): Promise<{
        byStatus: Array<{ status: string; count: number }>;
        byDay: Array<{ date: string; count: number }>;
        averageProcessingTime: number;
    }> {
        try {
            const [statusStats] = await this.pool.execute(`
                SELECT processing_status as status, COUNT(*) as count
                FROM orders
                GROUP BY processing_status
                ORDER BY count DESC
            `) as any;

            const [dayStats] = await this.pool.execute(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as count
                FROM orders
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `) as any;

            const [timeStats] = await this.pool.execute(`
                SELECT 
                    AVG(TIMESTAMPDIFF(HOUR, created_at, updated_at)) as avg_hours
                FROM orders
                WHERE processing_status = 'completed'
                AND updated_at > created_at
            `) as any;

            return {
                byStatus: statusStats || [],
                byDay: dayStats || [],
                averageProcessingTime: timeStats[0]?.avg_hours || 0
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de procesamiento:', error);
            return {
                byStatus: [],
                byDay: [],
                averageProcessingTime: 0
            };
        }
    }

    public async saveMessage(phone: string, body: string): Promise<boolean> {
        const sql = `INSERT INTO messages (phone, body) VALUES (?, ?)`;
        try {
            await this.pool.execute(sql, [phone, body]);
            return true;
        } catch (error) {
            console.error('❌ Error guardando mensaje:', error);
            return false;
        }
    }

    public async getPrevByNumber(phone: string): Promise<{ id: number; phone: string; body: string; created_at: Date } | null> {
        const sql = `SELECT * FROM messages WHERE phone = ? ORDER BY created_at DESC LIMIT 1`;
        try {
            const [rows] = await this.pool.execute(sql, [phone]) as any;
            if (rows.length > 0) {
                return {
                    id: rows[0].id,
                    phone: rows[0].phone,
                    body: rows[0].body,
                    created_at: new Date(rows[0].created_at)
                };
            }
            return null;
        } catch (error) {
            console.error('❌ Error obteniendo mensaje previo:', error);
            return null;
        }
    }

    public async getUserPreferences(phone: string): Promise<any | null> {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM user_preferences WHERE phone = ?',
                [phone]
            ) as any;

            if (rows.length === 0) return null;

            const row = rows[0];
            return {
                phone: row.phone,
                genres: JSON.parse(row.genres || '[]'),
                capacity: row.capacity,
                budget: row.budget,
                lastUpdated: row.last_updated
            };
        } catch (error) {
            console.error('❌ Error obteniendo preferencias del usuario:', error);
            return null;
        }
    }

    // ============================================
    // NEW METHODS FOR FLOW LOGGING AND TRACKING
    // ============================================

    /**
     * Ensure conversation_turns table exists
     */
    private async ensureConversationTurnsTable(): Promise<void> {
        if (this.tablesCreated.conversationTurns) {
            return; // Already created
        }
        
        try {
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS conversation_turns (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone VARCHAR(255) NOT NULL,
                    role ENUM('user', 'assistant', 'system') NOT NULL,
                    content TEXT NOT NULL,
                    metadata JSON,
                    timestamp DATETIME NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_phone (phone),
                    INDEX idx_timestamp (timestamp),
                    INDEX idx_phone_timestamp (phone, timestamp)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            this.tablesCreated.conversationTurns = true;
            console.log('✅ conversation_turns table ensured');
        } catch (error) {
            console.error('❌ Error creating conversation_turns table:', error);
        }
    }

    /**
     * Ensure flow_transitions table exists
     */
    private async ensureFlowTransitionsTable(): Promise<void> {
        if (this.tablesCreated.flowTransitions) {
            return; // Already created
        }
        
        try {
            await this.pool.execute(`
                CREATE TABLE IF NOT EXISTS flow_transitions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    phone VARCHAR(255) NOT NULL,
                    from_flow VARCHAR(100),
                    to_flow VARCHAR(100) NOT NULL,
                    from_stage VARCHAR(100),
                    to_stage VARCHAR(100) NOT NULL,
                    \`trigger\` VARCHAR(255),
                    metadata JSON,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_phone (phone),
                    INDEX idx_timestamp (timestamp),
                    INDEX idx_to_flow (to_flow),
                    INDEX idx_phone_timestamp (phone, timestamp)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            this.tablesCreated.flowTransitions = true;
            console.log('✅ flow_transitions table ensured');
        } catch (error) {
            console.error('❌ Error creating flow_transitions table:', error);
        }
    }

    /**
     * Log a conversation turn
     */
    public async logConversationTurn(data: {
        phone: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        metadata?: any;
        timestamp: Date;
    }): Promise<boolean> {
        try {
            // Ensure table exists first
            await this.ensureConversationTurnsTable();

            await this.pool.execute(
                `INSERT INTO conversation_turns (phone, role, content, metadata, timestamp)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    data.phone,
                    data.role,
                    data.content,
                    data.metadata ? JSON.stringify(data.metadata) : null,
                    data.timestamp
                ]
            );
            return true;
        } catch (error) {
            console.error('❌ Error logging conversation turn:', error);
            return false;
        }
    }

    /**
     * Log a flow transition
     */
    public async logFlowTransition(data: {
        phone: string;
        fromFlow: string;
        toFlow: string;
        fromStage: string;
        toStage: string;
        trigger: string;
        metadata?: any;
    }): Promise<boolean> {
        try {
            // Ensure table exists first
            await this.ensureFlowTransitionsTable();

            await this.pool.execute(
                `INSERT INTO flow_transitions (phone, from_flow, to_flow, from_stage, to_stage, \`trigger\`, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.phone,
                    data.fromFlow,
                    data.toFlow,
                    data.fromStage,
                    data.toStage,
                    data.trigger,
                    data.metadata ? JSON.stringify(data.metadata) : null
                ]
            );
            
            console.log(`📊 Flow transition logged: ${data.phone} ${data.fromFlow}/${data.fromStage} -> ${data.toFlow}/${data.toStage}`);
            return true;
        } catch (error) {
            console.error('❌ Error logging flow transition:', error);
            return false;
        }
    }

    /**
     * Parse metadata field - MySQL returns JSON as object, not string
     */
    private parseMetadata(metadata: any): any {
        if (!metadata) return null;
        if (typeof metadata === 'string') {
            try {
                return JSON.parse(metadata);
            } catch {
                return null;
            }
        }
        return metadata;
    }

    /**
     * Get recent conversation turns for a user
     */
    public async getConversationTurns(phone: string, limit: number = 10): Promise<any[]> {
        try {
            await this.ensureConversationTurnsTable();
            
            // Ensure limit is a safe integer between 1 and 100
            const safeLimit = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 20));
            
            const [rows] = await this.pool.execute(
                `SELECT * FROM conversation_turns 
                 WHERE phone = ? 
                 ORDER BY timestamp DESC 
                 LIMIT ${safeLimit}`,
                [phone]
            ) as any;

            return Array.isArray(rows) ? rows.map((row: any) => ({
                ...row,
                metadata: this.parseMetadata(row.metadata),
                timestamp: new Date(row.timestamp)
            })).reverse() : [];
        } catch (error) {
            console.error('❌ Error getting conversation turns:', error);
            return [];
        }
    }

    /**
     * Get flow transition history for a user
     */
    public async getFlowTransitions(phone: string, limit: number = 50): Promise<any[]> {
        try {
            await this.ensureFlowTransitionsTable();
            
            const [rows] = await this.pool.execute(
                `SELECT * FROM flow_transitions 
                 WHERE phone = ? 
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [phone, limit]
            ) as any;

            return Array.isArray(rows) ? rows.map((row: any) => ({
                ...row,
                metadata: this.parseMetadata(row.metadata),
                timestamp: new Date(row.timestamp)
            })) : [];
        } catch (error) {
            console.error('❌ Error getting flow transitions:', error);
            return [];
        }
    }
}

// ============================================
// CLASE: CartRecoveryManager
// ============================================

export class CartRecoveryManager {
    private db: MySQLBusinessManager;

    constructor(db: MySQLBusinessManager) {
        this.db = db;
    }

    public async executeCartRecoverySequence(phone: string, cartData: any): Promise<void> {
        const [recentMessages] = await this.db.execute(
            `SELECT COUNT(*) as message_count FROM recovery_messages
             WHERE cart_id IN (SELECT cart_id FROM abandoned_carts WHERE phone = ?)
             AND sent_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
            [phone]
        ) as any;

        if (recentMessages[0]?.message_count > 3) {
            console.log(`Usuario ${phone} ha recibido muchos mensajes recientemente. No enviar más.`);
            return;
        }

        const existingRecovery = await this.getActiveRecovery(phone);
        if (existingRecovery) {
            console.log(`Recuperación ya en progreso para ${phone}. No iniciar nueva secuencia.`);
            return;
        }

        const cartId = `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await this.db.execute(
            `INSERT INTO abandoned_carts (cart_id, phone, cart_data) VALUES (?, ?, ?)`,
            [cartId, phone, JSON.stringify(cartData)]
        );

        this.startRecoverySequence(cartId, phone, cartData);
    }

    public async getActiveRecovery(phone: string): Promise<{ cart_id: string; phone: string; cart_data: string } | null> {
        const [activeRecoveries] = await this.db.execute(
            `SELECT * FROM abandoned_carts 
             WHERE phone = ? AND recovery_status IN ('pending', 'in_progress') 
             LIMIT 1`,
            [phone]
        ) as any;

        if (Array.isArray(activeRecoveries) && activeRecoveries.length === 0) {
            return null;
        }
        return activeRecoveries[0];
    }

    public async getSession(
        phone: string,
        options: {
            includeOrders?: boolean;
            includeAnalytics?: boolean;
            includeMessages?: boolean;
        } = {}
    ): Promise<(UserSession & {
        orders?: CustomerOrder[];
        analytics?: any[];
        messages?: any[];
    }) | null> {
        if (!phone) {
            throw new Error('El número de teléfono es requerido');
        }

        try {
            const sessionQuery = `SELECT * FROM user_sessions WHERE phone = ? LIMIT 1`;
            const [sessionRows] = await this.db.execute(sessionQuery, [phone]) as any;

            if (!Array.isArray(sessionRows) || sessionRows.length === 0) {
                return null;
            }

            const sessionData = sessionRows[0];
            const session: UserSession = mapToUserSession(sessionData);

            const result: any = { ...session };

            if (options.includeOrders) {
                const ordersQuery = `SELECT * FROM orders WHERE phone_number = ? ORDER BY created_at DESC LIMIT 50`;
                const [orderRows] = await this.db.execute(ordersQuery, [phone]) as any;
                result.orders = Array.isArray(orderRows) ?
                    orderRows.map((row: any) => this.db.rowToOrder(row)) : [];
            }

            if (options.includeAnalytics) {
                const analyticsQuery = `SELECT * FROM analytics_events WHERE phone = ? ORDER BY timestamp DESC LIMIT 20`;
                const [analyticsRows] = await this.db.execute(analyticsQuery, [phone]) as any;
                result.analytics = Array.isArray(analyticsRows) ?
                    analyticsRows.map((row: any) => ({
                        ...row,
                        event_data: row.event_data ? JSON.parse(row.event_data) : null,
                        timestamp: new Date(row.timestamp)
                    })) : [];
            }

            if (options.includeMessages) {
                const messagesQuery = `SELECT * FROM messages WHERE phone = ? ORDER BY created_at DESC LIMIT 20`;
                const [messageRows] = await this.db.execute(messagesQuery, [phone]) as any;
                result.messages = Array.isArray(messageRows) ?
                    messageRows.map((row: any) => ({
                        ...row,
                        created_at: new Date(row.created_at)
                    })) : [];
            }

            return result;

        } catch (error: any) {
            console.error('❌ Error en getSession:', error);
            throw new Error(`Error al obtener sesión: ${error.message}`);
        }
    }

    public async getBasicSession(phone: string): Promise<UserSession | null> {
        return this.getSession(phone, {
            includeOrders: false,
            includeAnalytics: false,
            includeMessages: false
        });
    }

    private async startRecoverySequence(cartId: string, phone: string, cartData: any): Promise<void> {
        const userSession = await this.db.getUserSession(phone);
        const userName = userSession?.name ? `${userSession.name}, ` : '';

        const productType = cartData.items?.[0]?.name?.includes('música') ? 'música' :
            cartData.items?.[0]?.name?.includes('video') ? 'video' : 'contenido';
        const capacity = cartData.items?.[0]?.name?.match(/\d+GB/)?.[0] || '';

        const recoverySequence = [
            {
                delay: 30 * 60 * 1000,
                message: `${userName}😊 Vi que estabas armando un USB de ${productType} ${capacity}. ¿Necesitas ayuda para terminarlo?`,
                incentive: null,
                type: 'initial'
            },
            {
                delay: 2 * 60 * 60 * 1000,
                message: `💡 Tu USB personalizado sigue esperándote. Te ofrezco 10% de descuento si lo confirmas hoy.`,
                incentive: { type: 'discount', value: 10 },
                type: 'followup'
            },
            {
                delay: 24 * 60 * 60 * 1000,
                message: `🎁 ¡Última oportunidad! Tu USB + 15% descuento + envío gratis. ¿Qué dices?`,
                incentive: { type: 'combo', discount: 15, freeShipping: true },
                type: 'followup'
            },
            {
                delay: 72 * 60 * 60 * 1000,
                message: `👋 Entiendo que quizás no era el momento. Si cambias de opinión, aquí estaré. ¡Que tengas un gran día!`,
                incentive: null,
                type: 'final'
            }
        ];

        for (const [index, step] of recoverySequence.entries()) {
            setTimeout(async () => {
                try {
                    const currentStatus = await this.getCartRecoveryStatus(cartId);
                    if (currentStatus !== 'pending' && currentStatus !== 'in_progress') {
                        return;
                    }

                    const hasResponded = await this.checkUserResponse(cartId);
                    if (hasResponded) {
                        await this.db.execute(
                            `UPDATE abandoned_carts 
                             SET recovery_status = 'recovered' 
                             WHERE cart_id = ?`,
                            [cartId]
                        );
                        return;
                    }

                    await this.sendRecoveryMessage(
                        cartId,
                        phone,
                        step.message,
                        step.incentive,
                        step.type
                    );

                    await this.db.execute(
                        `UPDATE abandoned_carts 
                         SET recovery_stage = ?, 
                             recovery_status = 'in_progress',
                             last_recovery_sent = NOW() 
                         WHERE cart_id = ?`,
                        [index + 1, cartId]
                    );

                    await this.db.saveAnalyticsEvent(
                        phone,
                        'cart_recovery_message_sent',
                        { stage: index + 1, cartId }
                    );

                } catch (error: any) {
                    console.error(`Error en el paso de recuperación: ${error}`);
                    await this.db.saveAnalyticsEvent(
                        phone,
                        'cart_recovery_error',
                        { error: error.message, cartId }
                    );
                }
            }, step.delay);
        }
    }

    private async getCartRecoveryStatus(cartId: string): Promise<string> {
        const [rows] = await this.db.execute(
            `SELECT recovery_status FROM abandoned_carts WHERE cart_id = ? LIMIT 1`,
            [cartId]
        ) as any;
        return rows[0]?.recovery_status || 'failed';
    }

    private async checkUserResponse(cartId: string): Promise<boolean> {
        const [rows] = await this.db.execute(
            `SELECT COUNT(*) as response_count FROM recovery_messages 
             WHERE cart_id = ? AND response_received = TRUE`,
            [cartId]
        ) as any;
        return rows[0]?.response_count > 0;
    }

    private async sendRecoveryMessage(
        cartId: string,
        phone: string,
        message: string,
        incentive: any,
        type: string
    ): Promise<void> {
        await this.db.execute(
            `INSERT INTO recovery_messages (
                cart_id, message_type, message_content, 
                incentive_type, incentive_value, free_shipping
             ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                cartId,
                type,
                message,
                incentive?.type || 'none',
                incentive?.value || null,
                incentive?.freeShipping || false
            ]
        );

        console.log(`Mensaje de recuperación enviado a ${phone}: ${message}`);
    }

    public async handleUserResponse(phone: string, message: string): Promise<void> {
        const [activeRecoveries] = await this.db.execute(
            `SELECT * FROM abandoned_carts 
             WHERE phone = ? AND recovery_status IN ('pending', 'in_progress')
             ORDER BY created_at DESC LIMIT 1`,
            [phone]
        ) as any;

        if (Array.isArray(activeRecoveries) && activeRecoveries.length === 0) return;

        const recovery = activeRecoveries[0];

        await this.db.execute(
            `UPDATE recovery_messages 
             SET response_received = TRUE 
             WHERE cart_id = ? AND response_received = FALSE`,
            [recovery.cart_id]
        );

        const isPositive = this.analyzeResponse(message);

        if (isPositive) {
            await this.db.execute(
                `UPDATE abandoned_carts 
                 SET recovery_status = 'recovered' 
                 WHERE cart_id = ?`,
                [recovery.cart_id]
            );

            await this.db.saveAnalyticsEvent(
                phone,
                'cart_recovered',
                { cartId: recovery.cart_id }
            );
        } else {
            await this.db.execute(
                `UPDATE abandoned_carts 
                 SET recovery_status = 'failed' 
                 WHERE cart_id = ?`,
                [recovery.cart_id]
            );

            await this.db.saveAnalyticsEvent(
                phone,
                'cart_recovery_rejected',
                { cartId: recovery.cart_id }
            );
        }
    }

    public async getRecoveryStats(): Promise<{
        total: number;
        recovered: number;
        recovery_rate: number;
        avg_messages_to_recovery: number;
    }> {
        const [stats] = await this.db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN recovery_status = 'recovered' THEN 1 ELSE 0 END) as recovered,
                AVG(CASE WHEN recovery_status = 'recovered' THEN recovery_stage ELSE NULL END) as avg_messages
            FROM abandoned_carts
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
        `) as any;

        return {
            total: stats[0].total || 0,
            recovered: stats[0].recovered || 0,
            recovery_rate: stats[0].total ? (stats[0].recovered / stats[0].total) * 100 : 0,
            avg_messages_to_recovery: stats[0].avg_messages || 0
        };
    }

    private analyzeResponse(message: string): boolean {
        const msg = message.toLowerCase();
        const positiveWords = ['si', 'sí', 'quiero', 'adelante', 'confirmo', 'acepto', 'ok'];
        const negativeWords = ['no', 'cancelar', 'después', 'luego', 'no gracias'];

        return positiveWords.some(word => msg.includes(word)) &&
            !negativeWords.some(word => msg.includes(word));
    }
}

// ============================================
// FUNCIONES AUXILIARES EXPORTADAS
// ============================================

export async function findUserByPhone(phone: string): Promise<UserSession | null> {
    try {
        const normalizedPhone = normalizePhoneNumber(phone);
        console.log('🔄 Buscando con teléfono normalizado:', normalizedPhone);

        const query = 'SELECT * FROM user_sessions WHERE phone = ? OR phone = ?';
        const [rows] = await pool.execute(query, [phone, normalizedPhone]);

        console.log('🔍 Buscando usuario con teléfono:', phone);
        console.log('📝 Query SQL:', query);
        console.log('📊 Resultados encontrados:', rows);

        if (Array.isArray(rows) && rows.length > 0) {
            const user = rows[0] as any;
            console.log('✅ Usuario encontrado:', user.phone);
            return mapToUserSession(user);
        }

        console.log('❌ No se encontró usuario con teléfono:', phone);
        return null;
    } catch (error) {
        console.error('💥 Error en findUserByPhone:', error);
        throw error;
    }
}

export async function findUserByPhoneFlexible(phone: string): Promise<UserSession | null> {
    const phoneVariants = [
        phone,
        normalizePhoneNumber(phone),
        phone.startsWith('+') ? phone.substring(1) : '+' + phone,
        phone.replace(/^57/, ''),
        '57' + phone.replace(/^57/, '')
    ];

    console.log('🔍 Variantes de teléfono a buscar:', phoneVariants);

    const placeholders = phoneVariants.map(() => '?').join(',');
    const query = `SELECT * FROM user_sessions WHERE phone IN (${placeholders}) LIMIT 1`;

    try {
        const [rows] = await pool.execute(query, phoneVariants);

        if (Array.isArray(rows) && rows.length > 0) {
            console.log('✅ Usuario encontrado con variante de teléfono');
            return mapToUserSession(rows[0] as any);
        }

        return null;
    } catch (error) {
        console.error('💥 Error en búsqueda flexible:', error);
        throw error;
    }
}

class UserNotFoundError extends Error {
    constructor(phone: string) {
        super(`Usuario no encontrado con teléfono: ${phone}`);
        this.name = 'UserNotFoundError';
    }
}

export async function getUserByPhone(phone: string): Promise<UserSession> {
    try {
        if (!phone || phone.trim() === '') {
            throw new Error('Número de teléfono requerido');
        }
        const user = await findUserByPhoneFlexible(phone);
        if (!user) {
            console.log('❌ Usuario no encontrado, creando nuevo registro...');
            return await createNewUser(phone);
        }
        console.log('✅ Usuario encontrado exitosamente');
        return user;
    } catch (error) {
        if (error instanceof UserNotFoundError) {
            console.error('🚫 Error específico de usuario:', error.message);
        } else {
            console.error('💥 Error inesperado:', error);
        }
        throw error;
    }
}

async function createNewUser(phone: string): Promise<UserSession> {
    const normalizedPhone = normalizePhoneNumber(phone);

    const newUser: UserSession = {
        phone: normalizedPhone,
        phoneNumber: normalizedPhone,
        name: '',
        stage: 'new',
        buyingIntent: 0,
        interests: [],
        interactions: [],
        conversationData: {},
        lastInteraction: new Date(),
        lastFollowUp: new Date(),
        followUpSpamCount: 0,
        totalOrders: 0,
        location: '',
        email: '',
        pushToken: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        isActive: true,
        isNewUser: true,
        isReturningUser: false,
        isFirstMessage: true,
        demographics: {
            age: null,
            location: ''
        },
        preferences: {
            musicGenres: [],
            priceRange: { min: 25000, max: 75000 }
        }
    };

    try {
        const query = `
            INSERT INTO user_sessions (phone, name, stage, buying_intent, interests, 
                             conversation_data, last_interaction, last_follow_up, 
                             follow_up_spam_count, total_orders, location, email, 
                             push_token, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            newUser.phone, newUser.name, newUser.stage, newUser.buyingIntent,
            JSON.stringify(newUser.interests), JSON.stringify(newUser.conversationData),
            newUser.lastInteraction, newUser.lastFollowUp, newUser.followUpSpamCount,
            newUser.totalOrders, newUser.location, newUser.email, newUser.pushToken,
            newUser.createdAt, newUser.updatedAt
        ];

        await pool.execute(query, values);
        console.log('✅ Nuevo usuario creado:', normalizedPhone);

        return newUser;

    } catch (error) {
        console.error('💥 Error creando usuario:', error);
        throw error;
    }
}

export async function diagnoseUserIssue(phone: string): Promise<void> {
    console.log('🔍 === DIAGNÓSTICO DE USUARIO ===');
    console.log('📞 Teléfono original:', phone);

    try {
        await pool.execute('SELECT 1');
        console.log('✅ Conexión a BD: OK');
    } catch (error) {
        console.error('❌ Conexión a BD: FALLO', error);
        return;
    }

    try {
        const [result] = await pool.execute('SELECT COUNT(*) as count FROM user_sessions');
        console.log('✅ Tabla user_sessions existe, registros:', (result as any)[0].count);
    } catch (error) {
        console.error('❌ Tabla user_sessions: PROBLEMA', error);
        return;
    }

    try {
        const [exact] = await pool.execute('SELECT * FROM user_sessions WHERE phone = ?', [phone]);
        console.log('🎯 Búsqueda exacta:', (exact as any[]).length > 0 ? 'ENCONTRADO' : 'NO ENCONTRADO');
    } catch (error) {
        console.error('❌ Búsqueda exacta: ERROR', error);
    }

    try {
        const [similar] = await pool.execute('SELECT phone FROM user_sessions WHERE phone LIKE ?', [`%${phone.slice(-4)}%`]);
        console.log('🔍 Números similares encontrados:', (similar as any[]).length);
        (similar as any[]).forEach((row: any, index: number) => {
            if (index < 5) console.log(`   ${index + 1}. ${row.phone}`);
        });
    } catch (error) {
        console.error('❌ Búsqueda similar: ERROR', error);
    }
}

export async function handleUserRequest(phone: string) {
    try {
        if (process.env.NODE_ENV === 'development') {
            await diagnoseUserIssue(phone);
        }

        const user = await getUserByPhone(phone);

        if (!user) {
            throw new UserNotFoundError(phone);
        }

        return user;

    } catch (error) {
        console.error('💥 Error manejando solicitud de usuario:', error);

        if (error instanceof UserNotFoundError) {
            return { error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' };
        }

        return { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' };
    }
}

// ============================================
// INSTANCIAS GLOBALES
// ============================================

export const businessDB = new MySQLBusinessManager();
export const cartRecoveryManager = new CartRecoveryManager(businessDB);

// ============================================
// EXPORTACIONES DE FUNCIONES AUXILIARES
// ============================================

export { sanitizePhoneForDB };

// ============================================
// EXPORTACIONES DE TIPOS
// ============================================

export type {
    CustomerOrder,
    UserSession,
    MessageLog,
    InteractionLog,
    FollowUpEvent
};
