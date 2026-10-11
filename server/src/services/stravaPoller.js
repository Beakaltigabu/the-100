const db = require('../db');
const { syncStrava } = require('./stravaSync');
const stravaRateLimit = require('./stravaRateLimit');
const { logEvent } = require('./logger');

// Smart incremental poller for Strava. Webhooks stay the primary real-time
// path; this is a low-frequency poll that targets ONLY members who were seen
// online recently, so a new activity shows up "right away" for active users
// while staying far inside Strava's per-application rate budget. Members who
// haven't opened the app are left to the 4-hour safety-net sweep.

const ONLINE_WINDOW_MS = 10 * 60 * 1000; // seen within last 10 min = online
const MIN_POLL_INTERVAL_MS = 3 * 60 * 1000; // never poll the same user more than once per 3 min
const MAX_USER_POLLS_PER_CYCLE = 30; // hard cap per cycle — guards a hot minute

// lastSeenAt / lastPolledAt map userId -> epoch ms (in-memory, single-instance).
const lastSeenAt = new Map();
const lastPolledAt = new Map();

// Records that a member was recently active in the app (dashboard load, manual
// sync, status check). Keeps them eligible for the short-interval poll.
function markActive(userId, now = Date.now()) {
  lastSeenAt.set(userId, now);
}

function activeCount(now = Date.now()) {
  let n = 0;
  for (const ts of lastSeenAt.values()) {
    if (now - ts <= ONLINE_WINDOW_MS) n += 1;
  }
  return n;
}

// Polls members seen online recently, newest-first, honoring a per-user
// cooldown and Stopping at the first rate-limit signal so the whole budget is
// never burned in one cycle. Returns { polled, imported, rateLimited }.
async function pollActiveUsers() {
  const now = Date.now();
  const due = [];
  for (const [userId, seenAt] of lastSeenAt) {
    if (now - seenAt > ONLINE_WINDOW_MS) {
      lastSeenAt.delete(userId);
      continue;
    }
    const lastPoll = lastPolledAt.get(userId) || 0;
    if (now - lastPoll < MIN_POLL_INTERVAL_MS) continue;
    due.push(userId);
  }

  // Most recently seen first — active members get priority.
  due.sort((a, b) => (lastSeenAt.get(b) || 0) - (lastSeenAt.get(a) || 0));

  let polled = 0;
  let imported = 0;
  for (const userId of due.slice(0, MAX_USER_POLLS_PER_CYCLE)) {
    // Respect the shared Strava budget before fanning out more calls.
    if (!stravaRateLimit.canCall()) {
      return { polled, imported, rateLimited: true };
    }
    lastPolledAt.set(userId, now);
    try {
      const res = await syncStrava(userId);
      polled += 1;
      imported += res.imported || 0;
      if (res.rateLimited) return { polled, imported, rateLimited: true };
    } catch (err) {
      // One bad connection must not abort the run; a permanent failure ends the
      // user's polls (they'll be caught by the 4h sweep / webhook path).
      console.error(`[stravaPoller] sync error for user ${userId}:`, err.message);
      logEvent({ source: 'strava', type: 'poll_error', message: `user ${userId}: ${err.message}` }).catch(() => {});
      lastSeenAt.delete(userId);
    }
  }
  return { polled, imported, rateLimited: false };
}

module.exports = { markActive, activeCount, pollActiveUsers, ONLINE_WINDOW_MS, MIN_POLL_INTERVAL_MS };