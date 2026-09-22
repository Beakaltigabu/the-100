// In-memory login guard: blocks an ip:email pair after repeated failures.
// Single-instance only — adequate for one API process behind a proxy.

const FAIL_LIMIT = 5;
const BLOCK_MS = 15 * 60 * 1000;
// Hard cap on tracked ip:email pairs — without eviction the map grows forever.
const MAX_ENTRIES = 10000;

const store = new Map(); // key -> { count, blockedUntil }

// Drop expired blocks, then oldest-first (Map iterates in insertion order).
function sweep() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.blockedUntil && v.blockedUntil <= now) store.delete(k);
  }
  while (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
}

function normalizeIp(ip) {
  let value = String(ip || '').trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1') value = '127.0.0.1';
  return value;
}

function key(ip, email) {
  return `${normalizeIp(ip)}:${(email || '').toLowerCase()}`;
}

function remainingBlock(ip, email) {
  const entry = store.get(key(ip, email));
  if (!entry) return 0;
  if (!entry.blockedUntil) return 0; // still accumulating failures, not blocked
  const ms = entry.blockedUntil - Date.now();
  if (ms <= 0) {
    store.delete(key(ip, email));
    return 0;
  }
  return ms;
}

function recordFailure(ip, email) {
  if (store.size >= MAX_ENTRIES) sweep();
  const k = key(ip, email);
  const entry = store.get(k) || { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= FAIL_LIMIT) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
    entry.count = 0;
  }
  store.set(k, entry);
}

function clear(ip, email) {
  store.delete(key(ip, email));
}

module.exports = { FAIL_LIMIT, BLOCK_MS, recordFailure, remainingBlock, clear };