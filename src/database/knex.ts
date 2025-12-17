/**
 * Knex Database Connection
 * Provides Knex instance for repository pattern
 */

import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const DB_CONFIG = {
    host: process.env.MYSQL_DB_HOST || 'localhost',
    port: Number(process.env.MYSQL_DB_PORT || 3306),
    user: process.env.MYSQL_DB_USER || 'root',
    password: process.env.MYSQL_DB_PASSWORD || '',
    database: process.env.MYSQL_DB_NAME || 'techaura_bot'
};

// Create Knex instance
export const db = knex({
    client: 'mysql2',
    connection: DB_CONFIG,
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
