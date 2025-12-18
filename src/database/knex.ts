/**
 * Knex Database Connection
 * Provides Knex instance for repository pattern
 */

import knex from 'knex';
import dotenv from 'dotenv';
import { getDBConfig, validateDBConfig } from '../utils/dbConfig';

dotenv.config();

// Get validated configuration
let dbConfig: ReturnType<typeof getDBConfig>;

try {
    dbConfig = getDBConfig({ requirePassword: false });
    validateDBConfig(dbConfig);
} catch (error: any) {
    console.error('\n❌ Error en configuración de Knex:', error.message);
    console.error('   Verifica tu archivo .env\n');
    throw error;
}

// Create Knex instance
export const db = knex({
    client: 'mysql2',
    connection: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database
    },
    pool: {
        min: 2,
        max: 10
    },
    migrations: {
        directory: './migrations',
        tableName: 'knex_migrations'
    }
});

// Test connection
export async function testDatabaseConnection(): Promise<boolean> {
    try {
        await db.raw('SELECT 1');
        console.log('✅ Knex database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Knex database connection failed:', error);
        return false;
    }
}
