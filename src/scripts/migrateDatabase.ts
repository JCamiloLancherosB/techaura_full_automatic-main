import { businessDB } from '../mysql-database';

export async function migrateDatabaseSchema(): Promise<void> {
    console.log('🔄 Iniciando migración de base de datos...');
    
    try {
        // Usar la instancia global businessDB en lugar de getInstance()
        const db = businessDB;
        
        // Verificar conexión
        await db.checkConnection();
        console.log('✅ Conexión a base de datos verificada');
        
        // Obtener columnas existentes
        const existingColumns = await getExistingColumns(db);
        console.log('📋 Columnas existentes:', existingColumns);
        
        // Definir columnas necesarias
        const requiredColumns = [
            { name: 'interactions', type: 'JSON', default: "'[]'" },
            { name: 'last_activity', type: 'DATETIME', default: 'CURRENT_TIMESTAMP' },
            { name: 'message_count', type: 'INT', default: '0' },
            { name: 'is_active', type: 'BOOLEAN', default: 'TRUE' },
            { name: 'is_new_user', type: 'BOOLEAN', default: 'TRUE' },
            { name: 'is_returning_user', type: 'BOOLEAN', default: 'FALSE' },
            { name: 'is_first_message', type: 'BOOLEAN', default: 'TRUE' },
            { name: 'demographics', type: 'JSON', default: "'{}'" },
            { name: 'preferences', type: 'JSON', default: "'{}'" }
        ];
        
        // Agregar columnas faltantes
        console.log('🔧 Agregando columnas faltantes...');
        const missingColumns: string[] = [];
        
        for (const column of requiredColumns) {
            if (!existingColumns.includes(column.name)) {
                try {
                    const query = `ALTER TABLE user_sessions ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}`;
                    await db.execute(query);
                    console.log(`✅ Columna agregada: ${column.name}`);
                } catch (error: any) {
                    // Si la columna ya existe, continuar
                    if (error.code === 'ER_DUP_FIELDNAME') {
                        console.log(`ℹ️ Columna ${column.name} ya existe`);
                    } else {
                        console.error(`⚠️ Error agregando columna ${column.name}:`, error.message);
                        missingColumns.push(column.name);
                    }
                }
            } else {
                console.log(`✅ Columna ${column.name} ya existe`);
            }
        }
        
        // Actualizar registros existentes solo si las columnas existen
        await updateExistingRecords(db, missingColumns);
        
        console.log('✅ Migración de base de datos completada exitosamente');
        
    } catch (error) {
        console.error('❌ Error en migración de base de datos:', error);
        throw error;
    }
}

async function getExistingColumns(db: any): Promise<string[]> {
    try {
        const [result] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'user_sessions'
        `);
        
        return Array.isArray(result) ? result.map((row: any) => row.COLUMN_NAME) : [];
    } catch (error) {
        console.error('❌ Error obteniendo columnas existentes:', error);
        return [];
    }
}

async function updateExistingRecords(db: any, missingColumns: string[]): Promise<void> {
    try {
        console.log('🔄 Actualizando registros existentes...');
        
        // Obtener columnas que realmente existen después de la migración
        const currentColumns = await getExistingColumns(db);
        
        // Construir query de actualización solo con columnas existentes
        const updates: string[] = [];
        const conditions: string[] = [];
        
        if (currentColumns.includes('interactions')) {
            updates.push("interactions = COALESCE(interactions, '[]')");
            conditions.push("interactions IS NULL");
        }
        
        if (currentColumns.includes('last_activity')) {
            updates.push("last_activity = COALESCE(last_activity, last_interaction)");
            conditions.push("last_activity IS NULL");
        }
        
        if (currentColumns.includes('message_count')) {
            updates.push("message_count = COALESCE(message_count, 0)");
            conditions.push("message_count IS NULL");
        }
        
        if (currentColumns.includes('is_active')) {
            updates.push("is_active = COALESCE(is_active, TRUE)");
        }
        
        if (currentColumns.includes('is_new_user')) {
            updates.push("is_new_user = COALESCE(is_new_user, FALSE)");
        }
        
        if (currentColumns.includes('is_returning_user')) {
            updates.push("is_returning_user = COALESCE(is_returning_user, TRUE)");
        }
        
        if (currentColumns.includes('is_first_message')) {
            updates.push("is_first_message = COALESCE(is_first_message, FALSE)");
        }
        
        if (currentColumns.includes('demographics')) {
            updates.push("demographics = COALESCE(demographics, '{}')");
            conditions.push("demographics IS NULL");
        }
        
        if (currentColumns.includes('preferences')) {
            updates.push("preferences = COALESCE(preferences, '{}')");
            conditions.push("preferences IS NULL");
        }
        
        // Ejecutar actualización solo si hay updates y conditions
        if (updates.length > 0 && conditions.length > 0) {
            const updateQuery = `
                UPDATE user_sessions 
                SET ${updates.join(', ')}
                WHERE ${conditions.join(' OR ')}
            `;
            
            await db.execute(updateQuery);
            console.log('✅ Registros existentes actualizados');
        } else {
            console.log('ℹ️ No hay registros que actualizar');
        }
        
        if (missingColumns.length > 0) {
            console.log('⚠️ Columnas faltantes:', missingColumns);
        }
        
    } catch (error: any) {
        console.error('⚠️ Error actualizando registros existentes:', error.message);
        // No lanzar error aquí para no detener la aplicación
    }
}

// Función para ejecutar migración manual
export async function runManualMigration(): Promise<{ success: boolean; message: string }> {
    try {
        await migrateDatabaseSchema();
        return {
            success: true,
            message: 'Migración ejecutada exitosamente'
        };
    } catch (error: any) {
        return {
            success: false,
            message: `Error en migración: ${error.message}`
        };
    }
}
