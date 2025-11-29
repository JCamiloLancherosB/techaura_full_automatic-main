require('dotenv').config();

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.MYSQL_DB_HOST || 'localhost',
      user: process.env.MYSQL_DB_USER || 'techaura_bot',
      password: process.env.MYSQL_DB_PASSWORD || '100533Interactuar03xO3***',
      database: process.env.MYSQL_DB_NAME || 'techaura_bot',
      port: process.env.MYSQL_DB_PORT || 3306
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    }
  },
  production: {
    client: 'mysql2',
    connection: {
      host: process.env.MYSQL_DB_HOST || 'localhost',
      user: process.env.MYSQL_DB_USER || 'techaura_bot',
      password: process.env.MYSQL_DB_PASSWORD || '100533Interactuar03xO3***',
      database: process.env.MYSQL_DB_NAME || 'techaura_bot',
      port: process.env.MYSQL_DB_PORT || 3306
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    }
  }
};
