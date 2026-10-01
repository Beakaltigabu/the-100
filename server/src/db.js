const config = require('./config');
const fs = require('fs');

// TLS for managed cloud MySQL (Aiven/DO/Vultr require encrypted connections).
// DB_SSL=true enables it; DB_SSL_REJECT_UNAUTHORIZED=true verifies the server
// cert; DB_SSL_CA (optional path to a .pem) supplies the CA when the host uses
// a private CA (e.g. Aiven).
function sslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;
  const opts = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' };
  if (process.env.DB_SSL_CA) {
    try {
      opts.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
    } catch (err) {
      console.error('[db] could not read DB_SSL_CA:', err.message);
    }
  }
  return opts;
}

const ssl = sslConfig();

const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    dateStrings: true,
    ...(ssl ? { ssl } : {})
  },
  // Explicit timeouts: a stalled MySQL must fail requests in seconds, not
  // hang them for tarn's 60s default. Pool is sized for shared cPanel hosting
  // (min 0 = no idle connections held; max tuned via DB_POOL_MAX, default 5) so
  // the app stays a light tenant on the shared MySQL server. Timeouts are short
  // so that when the (shared) server is saturated, requests fail fast into the
  // circuit breaker's 503 path instead of holding pool slots for 10s.
  pool: {
    min: 0,
    max: Number(process.env.DB_POOL_MAX || 5),
    acquireTimeoutMillis: 3000,
    createTimeoutMillis: 3000,
    createRetryIntervalMillis: 250,
    idleTimeoutMillis: 30000
  }
});

module.exports = knex;