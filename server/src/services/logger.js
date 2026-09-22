const db = require('../db');

// Buffered async logger. Request/error/event rows are batched and written on a
// short interval or when the buffer fills, so logging never slows the request
// path. Failures are swallowed (the request path must not depend on logs).
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_THRESHOLD = 100;

let buffer = { requests: [], errors: [], events: [] };
let timer = null;

function maybeFlush() {
  const total = buffer.requests.length + buffer.errors.length + buffer.events.length;
  if (total >= FLUSH_THRESHOLD) flush();
  if (!timer) timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

// Inserts one table's rows. If the batch fails because a referenced user was
// deleted in the same tick (e.g. DELETE /api/profile — request_logs.user_id has
// ON DELETE SET NULL), retry once with the user reference dropped so the log is
// still kept and the other tables aren't lost to a shared Promise.all failure.
async function insertRows(table, rows) {
  if (!rows.length) return;
  try {
    await db(table).insert(rows);
  } catch (err) {
    console.error(`Logger flush error (${table}):`, err.message);
    if (table === 'request_logs' || table === 'error_logs') {
      try {
        await db(table).insert(rows.map((r) => ({ ...r, user_id: null })));
      } catch (err2) {
        console.error(`Logger flush retry error (${table}):`, err2.message);
      }
    }
  }
}

async function flush() {
  const b = buffer;
  buffer = { requests: [], errors: [], events: [] };
  await Promise.all([
    insertRows('request_logs', b.requests),
    insertRows('error_logs', b.errors),
    insertRows('event_logs', b.events)
  ]);
}

function logRequest(entry) {
  buffer.requests.push({
    method: String(entry.method || '').slice(0, 10),
    path: String(entry.path || '').slice(0, 255),
    status: entry.status || 0,
    duration_ms: entry.duration_ms || 0,
    ip: String(entry.ip || '').slice(0, 64),
    user_agent: String(entry.user_agent || '').slice(0, 255),
    user_id: entry.user_id || null,
    source: entry.source || 'web'
  });
  maybeFlush();
}

function logError(entry) {
  buffer.errors.push({
    level: entry.level || 'error',
    source: String(entry.source || 'app').slice(0, 30),
    message: String(entry.message || '').slice(0, 5000),
    stack: entry.stack ? String(entry.stack).slice(0, 8000) : null,
    path: entry.path ? String(entry.path).slice(0, 255) : null,
    user_id: entry.user_id || null,
    meta: entry.meta || null
  });
  maybeFlush();
}

function logEvent(entry) {
  buffer.events.push({
    source: String(entry.source || 'system').slice(0, 30),
    type: String(entry.type || '').slice(0, 60),
    message: entry.message ? String(entry.message).slice(0, 500) : null,
    meta: entry.meta || null
  });
  maybeFlush();
}

// Unbuffered insert for crash capture — best-effort before the process exits.
async function logErrorNow(entry) {
  try {
    await db('error_logs').insert({
      level: entry.level || 'error',
      source: String(entry.source || 'process').slice(0, 30),
      message: String(entry.message || '').slice(0, 5000),
      stack: entry.stack ? String(entry.stack).slice(0, 8000) : null,
      path: entry.path ? String(entry.path).slice(0, 255) : null,
      user_id: entry.user_id || null,
      meta: entry.meta || null
    });
  } catch (err) {
    console.error('Logger immediate error:', err.message);
  }
}

function queued() {
  return buffer.requests.length + buffer.errors.length + buffer.events.length;
}

module.exports = { logRequest, logError, logEvent, logErrorNow, flush, queued };