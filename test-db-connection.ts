import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

async function testConnection() {
    console.log('🔧 Probando conexión a MySQL...\n');
    
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'techAura',
        password: process.env.DB_PASSWORD || '100533Interactuar03xO3***',
        database: process.env.DB_NAME || 'techaura_bot'
    };
    
    console.log('📋 Configuración:');
    console.log(`   Host: ${config.host}`);
    console.log(`   Puerto: ${config.port}`);
    console.log(`   Usuario: ${config.user}`);
    console.log(`   Base de datos: ${config.database}`);
    console.log(`   Contraseña: ${config.password ? '✅ Configurada' : '❌ NO configurada'}\n`);
    
    if (!config.password) {
        console.error('❌ ERROR: DB_PASSWORD no está configurada en .env');
        process.exit(1);
    }
    
    try {
        const connection = await mysql.createConnection(config);
        console.log('✅ Conexión exitosa a MySQL');
        
        const [rows] = await connection.execute('SELECT DATABASE() as db');
        console.log(`✅ Base de datos actual: ${(rows as any)[0].db}`);
        
        await connection.end();
        console.log('✅ Conexión cerrada correctamente');
        
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error);
        process.exit(1);
    }
}

testConnection();
