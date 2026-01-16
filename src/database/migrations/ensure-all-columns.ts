/**
 * Migration to ensure all required columns exist in database tables
 * Addresses missing column errors for orders, user_sessions, and processing_jobs
 */

import type mysql from 'mysql2/promise';

export async function ensureAllColumns(pool: mysql.Pool): Promise<void> {
  console.log('🔧 Verificando columnas de base de datos...');
  
  try {
    // ============================================
    // ORDERS TABLE - Missing Columns
    // ============================================
    console.log('📦 Verificando columnas de tabla orders...');
    
    // Note: customization and preferences are already in CREATE TABLE as JSON
    // but we add them here for existing tables that don't have them
    const orderColumns = [
      { name: 'customization', definition: 'JSON' },
      { name: 'genres', definition: 'TEXT' },
      { name: 'artists', definition: 'TEXT' },
      { name: 'preferences', definition: 'JSON' },
      { name: 'content_type', definition: "VARCHAR(50) DEFAULT 'music'" },
      { name: 'capacity', definition: 'VARCHAR(20)' },
      { name: 'price', definition: 'DECIMAL(10,2)' },
      { name: 'order_number', definition: 'VARCHAR(50)' }
    ];
    
    for (const col of orderColumns) {
      try {
        await pool.execute(`
          ALTER TABLE orders ADD COLUMN ${col.name} ${col.definition}
        `);
        console.log(`✅ Columna orders.${col.name} agregada`);
      } catch (e: any) {
        // ER_DUP_FIELDNAME = columna ya existe, ignorar
        if (e.code !== 'ER_DUP_FIELDNAME') {
          console.warn(`⚠️ Error agregando orders.${col.name}:`, e.message);
        }
      }
    }
    
    // ============================================
    // USER_SESSIONS TABLE - Missing Columns
    // ============================================
    console.log('📦 Verificando columnas de tabla user_sessions...');
    
    // Note: follow_up_attempts is handled by add-followup-columns migration
    // last_activity is already in CREATE TABLE
    // last_interaction is already in CREATE TABLE
    const sessionColumns = [
      { name: 'follow_up_attempts', definition: 'INT DEFAULT 0' },
      { name: 'last_activity', definition: 'DATETIME' },
      { name: 'last_interaction', definition: 'DATETIME' }
    ];
    
    for (const col of sessionColumns) {
      try {
        await pool.execute(`
          ALTER TABLE user_sessions ADD COLUMN ${col.name} ${col.definition}
        `);
        console.log(`✅ Columna user_sessions.${col.name} agregada`);
      } catch (e: any) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          console.warn(`⚠️ Error agregando user_sessions.${col.name}:`, e.message);
        }
      }
    }
    
    // ============================================
    // PROCESSING_JOBS TABLE - Missing Columns
    // ============================================
    console.log('📦 Verificando columnas de tabla processing_jobs...');
    
    // Note: progress, logs, and quality_report are already in CREATE TABLE
    const jobColumns = [
      { name: 'progress', definition: 'INT DEFAULT 0' },
      { name: 'logs', definition: 'JSON' },
      { name: 'quality_report', definition: 'JSON' }
    ];
    
    for (const col of jobColumns) {
      try {
        await pool.execute(`
          ALTER TABLE processing_jobs ADD COLUMN ${col.name} ${col.definition}
        `);
        console.log(`✅ Columna processing_jobs.${col.name} agregada`);
      } catch (e: any) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          console.warn(`⚠️ Error agregando processing_jobs.${col.name}:`, e.message);
        }
      }
    }
    
    console.log('✅ Verificación de columnas completada');
  } catch (error) {
    console.error('❌ Error en migración de columnas:', error);
    throw error;
  }
}
