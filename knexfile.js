// knexfile.js
require('dotenv').config(); // Carga variables de entorno

module.exports = {
  production: { // ✅ Entorno de producción
    client: 'mysql2',
    connection: {
      host: process.env.MYSQL_DB_HOST || 'localhost',
      user: process.env.MYSQL_DB_USER,
      password: process.env.MYSQL_DB_PASSWORD,
      database: process.env.MYSQL_DB_NAME || 'techaura_bot',
      port: process.env.MYSQL_DB_PORT || 3306
    },
    migrations: {
      directory: './migrations', // Ruta de tus migraciones
      tableName: 'knex_migrations'
    }
  }
};
