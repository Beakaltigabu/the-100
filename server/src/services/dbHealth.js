// Circuit breaker for a saturated shared MySQL server. When the server reports
// "Too many connections" (ER_CON_COUNT_ERROR / errno 1040), the app backs off
// non-essential DB work for a short cooldown instead of hammering an already
// saturated host (which makes it worse and throws a retry storm).
const COOLDOWN_MS = Number(process.env.DB_BACKOFF_MS || 30000);
let saturatedUntil = 0;

function isSaturatedError(err) {
  if (!err) return false;
  return (
    err.code === 'ER_CON_COUNT_ERROR' ||
    Number(err.errno) === 1040 ||
    err.name === 'KnexTimeoutError' ||
    /Timeout acquiring a connection/i.test(String(err.message || ''))
  );
}

function noteDbError(err) {
  if (isSaturatedError(err)) {
    saturatedUntil = Date.now() + COOLDOWN_MS;
  }
}

function dbHealthy() {
  return Date.now() >= saturatedUntil;
}

module.exports = { isSaturatedError, noteDbError, dbHealthy, COOLDOWN_MS };