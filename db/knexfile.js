require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

module.exports = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'the100',
    charset: 'utf8mb4',
    multipleStatements: true,
    dateStrings: true
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './migrations',
    extension: 'js'
  },
  seeds: {
    directory: './seeds'
  }
};