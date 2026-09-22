const config = require('./config');
const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    dateStrings: true
  },
  // Explicit timeouts: a stalled MySQL must fail requests in seconds, not
  // hang them for tarn's 60s default. Pool size is env-tunable for the host.
  pool: {
    min: 2,
    max: Number(process.env.DB_POOL_MAX || 10),
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  }
});

module.exports = knex;