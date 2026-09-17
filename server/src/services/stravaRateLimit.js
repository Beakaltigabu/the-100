// In-memory tracking of Strava API rate limits.
// Strava returns X-RateLimit-Limit / X-RateLimit-Usage headers on every API
// response (short = requests per 15 min, long = requests per day).
class RateLimitedError extends Error {
  constructor(message = 'Strava rate limit reached') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

const state = {
  shortLimit: 100,
  longLimit: 1000,
  shortUsage: 0,
  longUsage: 0,
  // window reset timestamps (ms)
  shortResetAt: Date.now() + 15 * 60 * 1000,
  longResetAt: Date.now() + 24 * 60 * 60 * 1000
};

const THRESHOLD = 0.85;

function now() {
  return Date.now();
}

function resetIfExpired() {
  if (now() >= state.shortResetAt) {
    state.shortUsage = 0;
    state.shortResetAt = now() + 15 * 60 * 1000;
  }
  if (now() >= state.longResetAt) {
    state.longUsage = 0;
    state.longResetAt = now() + 24 * 60 * 60 * 1000;
  }
}

// Parse Strava rate-limit headers: "100,1000" (limits) and "12,345" (usage).
function record(res) {
  resetIfExpired();
  const limit = res.headers && res.headers.get('X-RateLimit-Limit');
  const usage = res.headers && res.headers.get('X-RateLimit-Usage');
  if (limit) {
    const [short, long] = limit.split(',').map(Number);
    if (!Number.isNaN(short)) state.shortLimit = short;
    if (!Number.isNaN(long)) state.longLimit = long;
  }
  if (usage) {
    const [short, long] = usage.split(',').map(Number);
    if (!Number.isNaN(short)) state.shortUsage = short;
    if (!Number.isNaN(long)) state.longUsage = long;
  } else {
    state.shortUsage += 1;
    state.longUsage += 1;
  }
}

// True if a call is allowed (under threshold of both windows).
function canCall() {
  resetIfExpired();
  return state.shortUsage < state.shortLimit * THRESHOLD && state.longUsage < state.longLimit * THRESHOLD;
}

function guardCall() {
  if (!canCall()) {
    throw new RateLimitedError();
  }
}

function usage() {
  resetIfExpired();
  return {
    shortUsage: state.shortUsage,
    shortLimit: state.shortLimit,
    longUsage: state.longUsage,
    longLimit: state.longLimit
  };
}

module.exports = { RateLimitedError, record, canCall, guardCall, usage };