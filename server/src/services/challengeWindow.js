const db = require('../db');
const { todayISO } = require('../lib/dates');

// The active challenge changes rarely, so memoize it in-process for a short TTL.
// Disabled under test so fixtures can change the window freely.
const TTL_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

async function getActiveChallenge() {
  const cacheable = process.env.NODE_ENV !== 'test';
  if (cacheable && cached && Date.now() - cachedAt < TTL_MS) {
    return cached;
  }
  const row = await db('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
  if (cacheable) {
    cached = row;
    cachedAt = Date.now();
  }
  return row;
}

function clearActiveChallengeCache() {
  cached = null;
  cachedAt = 0;
}

// Has the challenge window opened yet? (today >= start_date)
function hasChallengeStarted(challenge) {
  if (!challenge) return true;
  return todayISO() >= challenge.start_date;
}

// Is a given activity date inside the challenge window? (start <= date <= end)
function isInWindow(date, challenge) {
  if (!challenge) return true;
  return date >= challenge.start_date && date <= challenge.end_date;
}

module.exports = { getActiveChallenge, hasChallengeStarted, isInWindow, clearActiveChallengeCache };