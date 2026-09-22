const db = require('../db');

// The default THE 100 challenge. Reused by the runtime self-heal, the schema
// seed, and the standalone seed file so the dates never drift.
const DEFAULT_CHALLENGE = {
  name: 'THE 100',
  description: '100 days. Your goal. Your commitment.',
  start_date: '2026-09-23',
  end_date: '2026-12-31',
  is_active: 1
};

async function getActiveChallengeRow() {
  return db('challenges').where({ is_active: true }).orderBy('id', 'desc').first();
}

// Returns the active challenge, creating the default one if the table is empty
// (fresh schema import, truncated table, etc.). Idempotent and race-tolerant:
// the INSERT is guarded by WHERE NOT EXISTS and the result is re-read, so
// concurrent onboarding requests can never create duplicate active challenges.
async function ensureActiveChallenge() {
  let challenge = await getActiveChallengeRow();
  if (challenge) return challenge;

  await db.raw(
    'INSERT INTO challenges (name, description, start_date, end_date, is_active) ' +
      'SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM challenges WHERE is_active = 1)',
    [DEFAULT_CHALLENGE.name, DEFAULT_CHALLENGE.description, DEFAULT_CHALLENGE.start_date, DEFAULT_CHALLENGE.end_date, DEFAULT_CHALLENGE.is_active]
  );

  challenge = await getActiveChallengeRow();
  return challenge;
}

module.exports = { ensureActiveChallenge, DEFAULT_CHALLENGE };