require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['MYSQL_DB_HOST', 'MYSQL_DB_USER', 'MYSQL_DB_PASSWORD', 'MYSQL_DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:', missingVars.join(', '));
  console.error('   Please configure these variables in your .env file');
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.MYSQL_DB_HOST,
      user: process.env.MYSQL_DB_USER,
      password: process.env.MYSQL_DB_PASSWORD,
      database: process.env.MYSQL_DB_NAME,
      port: parseInt(process.env.MYSQL_DB_PORT || '3306', 10)
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    }
  },
  production: {
    client: 'mysql2',
    connection: {
      host: process.env.MYSQL_DB_HOST,
      user: process.env.MYSQL_DB_USER,
      password: process.env.MYSQL_DB_PASSWORD,
      database: process.env.MYSQL_DB_NAME,
      port: parseInt(process.env.MYSQL_DB_PORT || '3306', 10)
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};
